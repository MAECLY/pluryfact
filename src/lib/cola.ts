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
  /** XML autorizado (formato del portal) o null si el SRI no lo tiene autorizado. */
  xml(clave: string): Promise<string | null>;
  esperar(ms: number): Promise<void>;
  /** 0..1, para el ritmo de las consultas. */
  azar(): number;
  progreso(p: Progreso): void;
  /** true si el usuario canceló. */
  cancelado(): boolean;
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
  // Emitidos solo existe hasta ayer; recibidos hasta hoy.
  const rango = aRango(t.periodo, t.bandeja === 'emitidos' ? diaAnterior(d.hoy) : d.hoy);
  const p: Progreso = {
    fase: 'consultando',
    consultasHechas: 0,
    consultasTotal: plan.length,
    encontrados: 0,
    descargados: 0,
    fallidos: 0,
    mensaje: '',
    errores: [],
  };
  const archivos: Archivo[] = [];
  const consultasFallidas: string[] = [];
  const vistos = new Set<string>();
  let detenidaPor: string | null = null;
  const avisar = (cambios: Partial<Progreso>) => {
    Object.assign(p, cambios);
    d.progreso({ ...p });
  };
  const anotarError = (e: unknown) => {
    const m = e instanceof Error ? e.message : String(e);
    p.errores = [...p.errores, m].slice(-5);
  };
  const revisar = () => {
    if (d.cancelado()) throw new Cancelado();
  };
  const pausa = async (r: { base: number; extra: number }) => d.esperar(r.base + Math.round(d.azar() * r.extra));

  try {
    for (const [i, consulta] of plan.entries()) {
      revisar();
      if (i > 0) await pausa(RITMO[t.bandeja]);
      revisar();
      const etiqueta = etiquetaConsulta(consulta);
      avisar({ fase: 'consultando', mensaje: `Consultando ${etiqueta}` });

      let r = await d.consultar(consulta);
      if (r.estado === 'timeout' || r.estado === 'error') {
        await d.esperar(5000);
        revisar();
        r = await d.consultar(consulta);
      } else if (r.estado === 'captcha') {
        avisar({ mensaje: 'El SRI pidió repetir la verificación; reintento en un minuto' });
        await pausa(RITMO.captcha);
        revisar();
        r = await d.consultar(consulta);
      }
      if (r.estado === 'captcha') {
        consultasFallidas.push(`${etiqueta}: ${r.mensaje || 'Captcha incorrecta'}`);
        detenidaPor = MENSAJE_CAPTCHA;
        break;
      }
      if (r.estado === 'sin-datos') {
        avisar({ consultasHechas: p.consultasHechas + 1 });
        continue;
      }
      if (r.estado !== 'ok') {
        consultasFallidas.push(`${etiqueta}: ${r.mensaje || r.estado}`);
        avisar({ consultasHechas: p.consultasHechas + 1 });
        continue;
      }

      const bytes = await d.reporte();
      const reporte = parseReporte(decodificarReporte(bytes));
      const filas = reporte.filas.filter(
        (f) =>
          dentroDeRango(f.fechaEmision, rango) &&
          coincideTexto(f.rucEmisor, f.razonSocialEmisor, t.emisor) &&
          !vistos.has(f.clave.clave),
      );
      filas.forEach((f) => vistos.add(f.clave.clave));
      avisar({
        fase: 'descargando',
        encontrados: p.encontrados + filas.length,
        mensaje: filas.length ? `Descargando ${filas.length} comprobantes de ${etiqueta}` : `Sin coincidencias en ${etiqueta}`,
      });

      if (t.formatos.txt && reporte.filas.length) {
        const tipo = filas[0]?.clave.tipo ?? reporte.filas[0]!.clave.tipo;
        archivos.push({ ruta: `legajo/${d.rucContribuyente}/${t.bandeja}/reportes/${tipo}_${etiqueta}.txt`, datos: bytes });
      }

      if (t.formatos.xml) {
        let hechos = 0;
        await enParalelo(filas, XML_EN_PARALELO, async (f) => {
          revisar();
          let xml: string | null = null;
          try {
            xml = await conLimite(d.xml(f.clave.clave), LIMITE_XML_MS, 'El servicio web no respondió a tiempo');
            if (!xml) anotarError(`Sin autorización en el SRI: ${f.serie || f.clave.secuencial}`);
          } catch (e) {
            anotarError(e);
          }
          hechos++;
          const mensaje = `XML ${hechos} de ${filas.length} · ${etiqueta}`;
          if (xml) {
            archivos.push({ ruta: `${carpeta(d.rucContribuyente, t.bandeja, f)}/${nombreArchivo(f, 'xml')}`, datos: xml });
            avisar({ descargados: p.descargados + 1, mensaje });
          } else avisar({ fallidos: p.fallidos + 1, mensaje });
        });
      }

      if (t.formatos.pdf && filas.length) await descargarRides(t.bandeja, filas, d, archivos, avisar, revisar, pausa, p, anotarError);
      avisar({ consultasHechas: p.consultasHechas + 1 });
    }
    avisar({ fase: 'empaquetando', mensaje: detenidaPor ?? 'Armando el ZIP' });
    return { archivos, progreso: { ...p }, consultasFallidas, detenidaPor };
  } catch (e) {
    if (e instanceof Cancelado) {
      avisar({ fase: 'cancelado', mensaje: e.message });
      return { archivos, progreso: { ...p }, consultasFallidas, detenidaPor };
    }
    avisar({ fase: 'error', mensaje: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Recorre las páginas del portal (sin captcha) y baja el RIDE de las filas pedidas. */
async function descargarRides(
  bandeja: Bandeja,
  filas: FilaReporte[],
  d: Dependencias,
  archivos: Archivo[],
  avisar: (c: Partial<Progreso>) => void,
  revisar: () => void,
  pausa: (r: { base: number; extra: number }) => Promise<void>,
  p: Progreso,
  anotar: (e: unknown) => void,
) {
  const pendientes = new Map(filas.map((f) => [f.clave.clave, f]));
  await d.primeraPagina();
  for (let pagina = 0; pagina < MAX_PAGINAS && pendientes.size; pagina++) {
    for (const fila of d.leerTabla().filas) {
      const pedida = pendientes.get(fila.clave.clave);
      if (!pedida || !fila.enlaces.pdf) continue;
      revisar();
      try {
        const pdf = await conLimite(d.pdf(fila.enlaces.pdf), LIMITE_PDF_MS, 'El portal no entregó el RIDE a tiempo');
        archivos.push({ ruta: `${carpeta(d.rucContribuyente, bandeja, pedida)}/${nombreArchivo(pedida, 'pdf')}`, datos: pdf });
        avisar({ descargados: p.descargados + 1 });
      } catch (e) {
        anotar(e);
        avisar({ fallidos: p.fallidos + 1 });
      }
      pendientes.delete(fila.clave.clave);
      await pausa(RITMO.descarga);
    }
    if (!pendientes.size || !(await d.siguientePagina())) break;
  }
  if (pendientes.size) avisar({ fallidos: p.fallidos + pendientes.size });
}
