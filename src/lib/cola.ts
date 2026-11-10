import { carpeta, nombreArchivo } from './archivos';
import type { ResultadoTabla } from './extract';
import { coincideTexto } from './filtro';
import {
  aRango,
  consultasEmitidos,
  consultasRecibidos,
  dentroDeRango,
  diaAnterior,
  formatoSri,
  type Periodo,
} from './periodo';
import { decodificarReporte, parseReporte, type FilaReporte } from './reporte';
import { TIPO_COMBO, type Bandeja, type Fecha, type TipoComprobante } from './types';

export interface Trabajo {
  bandeja: Bandeja;
  periodo: Periodo;
  tipos: TipoComprobante[];
  /** RUC o razón social del emisor; vacío = todos. */
  emisor: string;
  formatos: { xml: boolean; pdf: boolean; txt: boolean };
}

/** Lo que el conductor sabe pedir al portal. */
export type ConsultaPortal =
  | { bandeja: 'recibidos'; tipoCombo: string; anio: number; mes: number; dia: number }
  | { bandeja: 'emitidos'; tipoCombo: string; fecha: string };

export type EstadoConsulta = 'ok' | 'sin-datos' | 'rechazada' | 'captcha' | 'timeout' | 'error';

export interface ResultadoConsulta {
  estado: EstadoConsulta;
  mensaje: string;
}

export type Fase = 'consultando' | 'descargando' | 'empaquetando' | 'listo' | 'cancelado' | 'error';

export interface Progreso {
  fase: Fase;
  consultasHechas: number;
  consultasTotal: number;
  encontrados: number;
  descargados: number;
  fallidos: number;
  mensaje: string;
  /** Últimos errores (máx. 5), para diagnosticar sin abrir la consola. */
  errores: string[];
  /** Momento de inicio del trabajo (ms). */
  inicio: number;
  /** Una entrada por consulta del plan, para mostrar el avance mes a mes o día a día. */
  pasos: Paso[];
  /** Lo último que hizo la cola, más reciente al final (máx. 40). */
  actividad: Actividad[];
  /** Fin de la pausa en curso (ms) o null: permite mostrar una cuenta regresiva. */
  esperaHasta: number | null;
}

export type EstadoPaso = 'pendiente' | 'consultando' | 'descargando' | 'sin-datos' | 'ok' | 'fallida';

export interface Paso {
  etiqueta: string;
  estado: EstadoPaso;
  comprobantes: number;
}

export interface Actividad {
  t: number;
  texto: string;
  nivel: 'info' | 'aviso' | 'error';
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "noviembre 2026", "8 de noviembre 2026", "06/11/2026" → texto legible para la actividad. */
export function nombreConsulta(c: ConsultaPortal): string {
  if (c.bandeja === 'emitidos') return c.fecha;
  return c.dia ? `${c.dia} de ${MESES[c.mes - 1]} ${c.anio}` : `${MESES[c.mes - 1]} ${c.anio}`;
}

export interface Archivo {
  ruta: string;
  datos: Uint8Array | string;
}

export interface Dependencias {
  hoy: Fecha;
  rucContribuyente: string;
  consultar(c: ConsultaPortal): Promise<ResultadoConsulta>;
  /** Bytes del reporte TXT del listado actual. */
  reporte(): Promise<Uint8Array>;
  primeraPagina(): Promise<void>;
  /** false cuando ya no hay más páginas. */
  siguientePagina(): Promise<boolean>;
  leerTabla(): ResultadoTabla;
  pdf(idEnlace: string): Promise<Uint8Array>;
  /**
   * XML desde el enlace de la tabla del portal (solo recibidos tiene ese enlace).
   * Respaldo cuando el servicio web no entrega el XML de una clave.
   */
  xmlPortal?(idEnlace: string): Promise<string>;
  /** XML autorizado (formato del portal) o null si el SRI no lo tiene autorizado. */
  xml(clave: string): Promise<string | null>;
  esperar(ms: number): Promise<void>;
  /** 0..1, para el ritmo de las consultas. */
  azar(): number;
  progreso(p: Progreso): void;
  /** true si el usuario canceló. */
  cancelado(): boolean;
  /** Reloj (ms); por defecto Date.now. */
  ahora?: () => number;
  /** Registro de diagnóstico (opcional). */
  registro?: { info(m: string): void; aviso(m: string): void; error(m: string): void };
}

export class Cancelado extends Error {
  constructor() {
    super('Descarga cancelada');
  }
}

/** Pausa entre consultas: recibidos usa reCAPTCHA, así que va más despacio. */
export const RITMO = {
  recibidos: { base: 4000, extra: 5000 },
  /** Tras un "Captcha incorrecta": una sola espera larga antes de reintentar. */
  captcha: { base: 60_000, extra: 30_000 },
  emitidos: { base: 600, extra: 900 },
  descarga: { base: 250, extra: 450 },
} as const;

const XML_EN_PARALELO = 4;
/**
 * El servicio web rechaza claves con fecha de emisión antigua ("80 … fecha de
 * emision esta fuera del rango permitido", visto en vivo con enero 2025). Tras
 * este número de rechazos seguidos en un mes, el resto va directo al portal.
 */
export const RECHAZOS_PARA_PORTAL = 5;
/** Ninguna descarga puede colgar la cola: pasado el límite cuenta como fallida. */
export const LIMITE_XML_MS = 45_000;
export const LIMITE_PDF_MS = 60_000;

export function conLimite<T>(promesa: Promise<T>, ms: number, mensaje: string): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(mensaje)), ms);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj));
}
const MAX_PAGINAS = 200;

const tipoDeCombo = (combo: string) =>
  (Object.entries(TIPO_COMBO).find(([, v]) => v === combo)?.[0] ?? combo).replace('-', ' ');

export function planificar(t: Trabajo, hoy: Fecha): ConsultaPortal[] {
  const out: ConsultaPortal[] = [];
  for (const tipo of t.tipos) {
    const tipoCombo = TIPO_COMBO[tipo];
    if (t.bandeja === 'recibidos') {
      for (const c of consultasRecibidos(t.periodo, hoy)) out.push({ bandeja: 'recibidos', tipoCombo, ...c });
    } else {
      for (const f of consultasEmitidos(t.periodo, hoy)) out.push({ bandeja: 'emitidos', tipoCombo, fecha: formatoSri(f) });
    }
  }
  return out;
}

const etiquetaConsulta = (c: ConsultaPortal) =>
  c.bandeja === 'emitidos'
    ? c.fecha.split('/').reverse().join('-')
    : `${c.anio}-${String(c.mes).padStart(2, '0')}${c.dia ? `-${String(c.dia).padStart(2, '0')}` : ''}`;

async function enParalelo<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const trabajador = async () => {
    while (i < items.length) await fn(items[i++]!);
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, trabajador));
}

export interface Resumen {
  archivos: Archivo[];
  progreso: Progreso;
  /** Consultas que fallaron tras reintentar, para mostrarlas al usuario. */
  consultasFallidas: string[];
  /** Motivo por el que la cola se detuvo antes de terminar el plan. */
  detenidaPor: string | null;
}

export const MENSAJE_CAPTCHA =
  'El SRI rechazó la verificación reCAPTCHA. Legajo se detuvo para no insistir: usa tu Chrome habitual, espera unos minutos y vuelve a intentar.';

export async function ejecutar(t: Trabajo, d: Dependencias): Promise<Resumen> {
  const plan = planificar(t, d.hoy);
  const ahora = d.ahora ?? Date.now;
  // Emitidos solo existe hasta ayer; recibidos hasta hoy.
  const rango = aRango(t.periodo, t.bandeja === 'emitidos' ? diaAnterior(d.hoy) : d.hoy);
  const variosTipos = t.tipos.length > 1;
  const p: Progreso = {
    fase: 'consultando',
    consultasHechas: 0,
    consultasTotal: plan.length,
    encontrados: 0,
    descargados: 0,
    fallidos: 0,
    mensaje: '',
    errores: [],
    inicio: ahora(),
    pasos: plan.map((c) => ({
      etiqueta: variosTipos ? `${nombreConsulta(c)} · ${tipoDeCombo(c.tipoCombo)}` : nombreConsulta(c),
      estado: 'pendiente',
      comprobantes: 0,
    })),
    actividad: [],
    esperaHasta: null,
  };
  const archivos: Archivo[] = [];
  const consultasFallidas: string[] = [];
  const vistos = new Set<string>();
  let detenidaPor: string | null = null;
  const avisar = (cambios: Partial<Progreso>) => {
    Object.assign(p, cambios);
    d.progreso({ ...p, pasos: p.pasos.map((x) => ({ ...x })), actividad: [...p.actividad] });
  };
  /** Anota una línea de actividad visible para el usuario (y en el registro). */
  const contar = (texto: string, nivel: Actividad['nivel'] = 'info', cambios: Partial<Progreso> = {}) => {
    p.actividad = [...p.actividad, { t: ahora(), texto, nivel }].slice(-40);
    avisar({ mensaje: texto, ...cambios });
  };
  const marcar = (i: number, cambios: Partial<Paso>) => Object.assign(p.pasos[i]!, cambios);
  const log = d.registro;
  const anotarError = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    p.errores = [...p.errores, m].slice(-5);
    log?.error(m);
  };
  log?.info(`Trabajo ${t.bandeja} ${JSON.stringify(t.periodo)} tipos=${t.tipos.join(',')} formatos=${Object.entries(t.formatos).filter(([, v]) => v).map(([k]) => k).join(',')} emisor=${t.emisor ? 'sí' : 'no'} · ${plan.length} consultas`);
  const revisar = () => {
    if (d.cancelado()) throw new Cancelado();
  };
  const pausa = async (r: { base: number; extra: number }, motivo?: string) => {
    const ms = r.base + Math.round(d.azar() * r.extra);
    if (motivo) contar(`${motivo}: pausa de ${Math.round(ms / 1000)} s`, 'info', { esperaHasta: ahora() + ms });
    await d.esperar(ms);
    if (motivo) avisar({ esperaHasta: null });
  };

  try {
    for (const [i, consulta] of plan.entries()) {
      revisar();
      const etiqueta = etiquetaConsulta(consulta);
      const nombre = p.pasos[i]!.etiqueta;
      if (i > 0)
        await pausa(
          RITMO[t.bandeja],
          t.bandeja === 'recibidos' ? 'Ritmo seguro para la verificación del SRI' : 'Ritmo entre consultas',
        );
      revisar();
      marcar(i, { estado: 'consultando' });
      contar(
        t.bandeja === 'recibidos' ? `Consultando ${nombre} (verificación reCAPTCHA invisible)…` : `Consultando ${nombre}…`,
        'info',
        { fase: 'consultando' },
      );

      const t0 = Date.now();
      let r = await d.consultar(consulta);
      log?.info(`Consulta ${etiqueta}: ${r.estado} en ${Date.now() - t0} ms ${r.mensaje}`);
      if (r.estado === 'timeout' || r.estado === 'error') {
        contar(`${nombre}: ${r.mensaje || 'sin respuesta'}. Reintento en 5 s`, 'aviso');
        await d.esperar(5000);
        revisar();
        r = await d.consultar(consulta);
        log?.aviso(`Reintento ${etiqueta}: ${r.estado} ${r.mensaje}`);
      } else if (r.estado === 'captcha') {
        await pausa(RITMO.captcha, `El SRI rechazó la verificación de ${nombre}; se reintenta una vez`);
        revisar();
        r = await d.consultar(consulta);
        log?.aviso(`Reintento por captcha ${etiqueta}: ${r.estado} ${r.mensaje}`);
      }
      if (r.estado === 'captcha') {
        consultasFallidas.push(`${etiqueta}: ${r.mensaje || 'Captcha incorrecta'}`);
        detenidaPor = MENSAJE_CAPTCHA;
        marcar(i, { estado: 'fallida' });
        contar(`${nombre}: el SRI volvió a rechazar la verificación. Se detiene la descarga.`, 'error');
        break;
      }
      if (r.estado === 'sin-datos') {
        marcar(i, { estado: 'sin-datos' });
        contar(`${nombre}: el SRI no tiene comprobantes`, 'info', { consultasHechas: p.consultasHechas + 1 });
        continue;
      }
      if (r.estado !== 'ok') {
        consultasFallidas.push(`${etiqueta}: ${r.mensaje || r.estado}`);
        marcar(i, { estado: 'fallida' });
        contar(`${nombre}: falló (${r.mensaje || r.estado})`, 'error', { consultasHechas: p.consultasHechas + 1 });
        continue;
      }
      contar(`${nombre}: el SRI respondió; leyendo el reporte…`);

      const bytes = await d.reporte();
      const reporte = parseReporte(decodificarReporte(bytes));
      const filas = reporte.filas.filter(
        (f) =>
          dentroDeRango(f.fechaEmision, rango) &&
          coincideTexto(f.rucEmisor, f.razonSocialEmisor, t.emisor) &&
          !vistos.has(f.clave.clave),
      );
      filas.forEach((f) => vistos.add(f.clave.clave));
      log?.info(`Reporte ${etiqueta}: ${reporte.filas.length} filas, ${reporte.descartadas} descartadas, ${filas.length} tras filtros (${bytes.length} bytes)`);
      marcar(i, { estado: filas.length ? 'descargando' : 'sin-datos', comprobantes: filas.length });
      contar(
        filas.length
          ? `${nombre}: ${filas.length} comprobantes${filas.length !== reporte.filas.length ? ` (de ${reporte.filas.length} en el reporte, tras filtros)` : ''}`
          : `${nombre}: ${reporte.filas.length} en el reporte, ninguno coincide con el filtro`,
        'info',
        { fase: 'descargando', encontrados: p.encontrados + filas.length },
      );

      if (t.formatos.txt && reporte.filas.length) {
        const tipo = filas[0]?.clave.tipo ?? reporte.filas[0]!.clave.tipo;
        archivos.push({ ruta: `legajo/${d.rucContribuyente}/${t.bandeja}/reportes/${tipo}_${etiqueta}.txt`, datos: bytes });
      }

      const sinXml = new Map<string, FilaReporte>();
      if (t.formatos.xml && filas.length) {
        contar(`Pidiendo ${filas.length} XML al servicio web del SRI…`);
        let hechos = 0;
        let fallidosAqui = 0;
        const conRespaldo = t.bandeja === 'recibidos' && !!d.xmlPortal;
        let rechazosSeguidos = 0;
        let soloPortal = false;
        await enParalelo(filas, XML_EN_PARALELO, async (f) => {
          revisar();
          if (soloPortal) {
            sinXml.set(f.clave.clave, f);
            hechos++;
            avisar({ mensaje: `XML ${hechos} de ${filas.length} · ${etiqueta}` });
            return;
          }
          let xml: string | null = null;
          const tx = Date.now();
          try {
            xml = await conLimite(d.xml(f.clave.clave), LIMITE_XML_MS, 'El servicio web no respondió a tiempo');
            if (!xml) log?.aviso(`Servicio web sin XML para ${f.serie || f.clave.secuencial}`);
          } catch (e) {
            log?.aviso(`Servicio web falló para ${f.serie || f.clave.secuencial}: ${e instanceof Error ? e.message : String(e)}`);
          }
          hechos++;
          rechazosSeguidos = xml ? 0 : rechazosSeguidos + 1;
          if (conRespaldo && !soloPortal && rechazosSeguidos >= RECHAZOS_PARA_PORTAL) {
            soloPortal = true;
            contar(`El servicio web no da XML de ${nombre} (fecha fuera de su rango); se bajarán desde el portal`, 'aviso');
          }
          if (xml) log?.info(`XML ${f.clave.secuencial} ok en ${Date.now() - tx} ms`);
          const mensaje = `XML ${hechos} de ${filas.length} · ${etiqueta}`;
          if (xml) {
            archivos.push({ ruta: `${carpeta(d.rucContribuyente, t.bandeja, f)}/${nombreArchivo(f, 'xml')}`, datos: xml });
            avisar({ descargados: p.descargados + 1, mensaje });
          } else if (conRespaldo) {
            sinXml.set(f.clave.clave, f);
            avisar({ mensaje });
          } else {
            fallidosAqui++;
            anotarError(`Sin XML del SRI: ${f.serie || f.clave.secuencial}`);
            avisar({ fallidos: p.fallidos + 1, mensaje });
          }
        });
        contar(
          `XML de ${nombre}: ${hechos - fallidosAqui - sinXml.size} por servicio web${sinXml.size ? `, ${sinXml.size} se bajarán desde el portal` : ''}${fallidosAqui ? `, ${fallidosAqui} fallidos` : ''}`,
          fallidosAqui ? 'aviso' : 'info',
        );
      }

      const pedirPdf = t.formatos.pdf && filas.length > 0;
      if (pedirPdf || sinXml.size) {
        contar(
          [pedirPdf ? `${filas.length} RIDE` : '', sinXml.size ? `${sinXml.size} XML` : ''].filter(Boolean).join(' y ') +
            ` de ${nombre} desde el portal…`,
        );
        await recorrerPaginas(t.bandeja, pedirPdf ? filas : [], sinXml, d, archivos, avisar, revisar, pausa, p, anotarError, contar);
      }
      marcar(i, { estado: 'ok' });
      avisar({ consultasHechas: p.consultasHechas + 1 });
    }
    log?.info(`Fin: ${p.encontrados} comprobantes, ${p.descargados} descargados, ${p.fallidos} fallidos, ${archivos.length} archivos${detenidaPor ? ` · detenida: ${detenidaPor}` : ''}`);
    contar(detenidaPor ?? `Armando el ZIP con ${archivos.length} archivos…`, detenidaPor ? 'error' : 'info', { fase: 'empaquetando' });
    return { archivos, progreso: { ...p }, consultasFallidas, detenidaPor };
  } catch (e) {
    if (e instanceof Cancelado) {
      contar('Descarga cancelada', 'aviso', { fase: 'cancelado', esperaHasta: null });
      return { archivos, progreso: { ...p }, consultasFallidas, detenidaPor };
    }
    contar(e instanceof Error ? e.message : String(e), 'error', { fase: 'error', esperaHasta: null });
    throw e;
  }
}

/**
 * Recorre las páginas del portal (sin captcha) y baja, de las filas pedidas,
 * el RIDE y, como respaldo, el XML que el servicio web no entregó.
 */
async function recorrerPaginas(
  bandeja: Bandeja,
  filasPdf: FilaReporte[],
  sinXml: Map<string, FilaReporte>,
  d: Dependencias,
  archivos: Archivo[],
  avisar: (c: Partial<Progreso>) => void,
  revisar: () => void,
  pausa: (r: { base: number; extra: number }) => Promise<void>,
  p: Progreso,
  anotar: (e: unknown) => void,
  contar: (texto: string, nivel?: Actividad['nivel']) => void,
) {
  const pdfPendientes = new Map(filasPdf.map((f) => [f.clave.clave, f]));
  const quedan = () => pdfPendientes.size + sinXml.size;
  const bajar = async (fila: FilaReporte, tipo: 'pdf' | 'xml', obtener: () => Promise<Uint8Array | string>) => {
    revisar();
    try {
      const datos = await conLimite(obtener(), LIMITE_PDF_MS, `El portal no entregó el ${tipo === 'pdf' ? 'RIDE' : 'XML'} a tiempo`);
      archivos.push({ ruta: `${carpeta(d.rucContribuyente, bandeja, fila)}/${nombreArchivo(fila, tipo)}`, datos });
      avisar({ descargados: p.descargados + 1 });
    } catch (e) {
      anotar(e);
      avisar({ fallidos: p.fallidos + 1 });
    }
    await pausa(RITMO.descarga);
  };

  await d.primeraPagina();
  for (let pagina = 0; pagina < MAX_PAGINAS && quedan(); pagina++) {
    const tabla = d.leerTabla();
    d.registro?.info(`Página ${tabla.paginaActual}/${tabla.totalPaginas}: ${tabla.filas.length} filas, ${pdfPendientes.size} RIDE y ${sinXml.size} XML pendientes`);
    contar(`Portal: página ${tabla.paginaActual} de ${tabla.totalPaginas} (${quedan()} archivos pendientes)`);
    for (const fila of tabla.filas) {
      const clave = fila.clave.clave;
      const pdf = pdfPendientes.get(clave);
      if (pdf && fila.enlaces.pdf) {
        const id = fila.enlaces.pdf;
        await bajar(pdf, 'pdf', () => d.pdf(id));
        pdfPendientes.delete(clave);
      }
      const xml = sinXml.get(clave);
      if (xml && fila.enlaces.xml && d.xmlPortal) {
        const id = fila.enlaces.xml;
        await bajar(xml, 'xml', () => d.xmlPortal!(id));
        sinXml.delete(clave);
      }
    }
    if (!quedan() || !(await d.siguientePagina())) break;
  }
  if (quedan()) {
    d.registro?.aviso(`Sin encontrar en la tabla: ${pdfPendientes.size} RIDE, ${sinXml.size} XML`);
    contar(`${quedan()} archivos no aparecieron en la tabla del portal`, 'aviso');
    avisar({ fallidos: p.fallidos + quedan() });
  }
}
