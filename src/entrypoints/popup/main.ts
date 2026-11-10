import './style.css';
import type { Paso, Trabajo } from '@/lib/cola';
import { CLAVE_PROGRESO, type EstadoPagina, type EstadoTrabajo, type Peticion } from '@/lib/mensajeria';
import { consultasEmitidos, consultasRecibidos, formatoSri, type Periodo } from '@/lib/periodo';
import type { Bandeja, Fecha, TipoComprobante } from '@/lib/types';
import { construirPeriodo, hoyEcuador, type TipoPeriodo } from './estado';

// ---------------------------------------------------------------------------
// Vocabulario
// ---------------------------------------------------------------------------

/** Nombre en plural, como lo diría un contador. Todos son femeninos salvo "comprobantes". */
const PLURAL: Record<TipoComprobante, string> = {
  factura: 'Facturas',
  liquidacion: 'Liquidaciones de compra',
  'nota-credito': 'Notas de crédito',
  'nota-debito': 'Notas de débito',
  'guia-remision': 'Guías de remisión',
  retencion: 'Retenciones',
};
const TIPOS_RECIBIDOS: TipoComprobante[] = ['factura', 'retencion', 'nota-credito', 'nota-debito', 'liquidacion'];
const TIPOS_EMITIDOS: TipoComprobante[] = ['factura', 'retencion', 'nota-credito', 'nota-debito', 'liquidacion', 'guia-remision'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const hoy = hoyEcuador();
const iso = (f: Fecha) => `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;
const miles = (n: number) => n.toLocaleString('es-EC');

let bandeja: Bandeja = 'recibidos';
let tipoPeriodo: TipoPeriodo = 'mes';
const tiposMarcados = new Set<TipoComprobante>(['factura']);

// ---------------------------------------------------------------------------
// Formulario
// ---------------------------------------------------------------------------

function pintarCamposPeriodo() {
  const anios = Array.from({ length: hoy.anio - 2021 }, (_, i) => hoy.anio - i).map((a) => `<option>${a}</option>`).join('');
  const meses = MESES.map((m, i) => `<option value="${i + 1}"${i + 1 === hoy.mes ? ' selected' : ''}>${m[0]!.toUpperCase()}${m.slice(1)}</option>`).join('');
  const fecha = (id: string, texto: string) =>
    `<label>${texto}<input id="${id}" class="campo" type="date" max="${iso(hoy)}" value="${iso(hoy)}"></label>`;
  const lista = (id: string, texto: string, opciones: string) => `<label>${texto}<select id="${id}" class="campo">${opciones}</select></label>`;
  $('#campos-periodo').innerHTML =
    tipoPeriodo === 'dia'
      ? fecha('p-dia', 'Fecha')
      : tipoPeriodo === 'rango'
        ? fecha('p-desde', 'Desde') + fecha('p-hasta', 'Hasta')
        : tipoPeriodo === 'mes'
          ? lista('p-mes', 'Mes', meses) + lista('p-anio', 'Año', anios)
          : lista('p-anio', 'Año', anios);
  $('#campos-periodo')
    .querySelectorAll('input,select')
    .forEach((el) => el.addEventListener('change', pintarPlan));
}

function pintarTipos() {
  const lista = bandeja === 'recibidos' ? TIPOS_RECIBIDOS : TIPOS_EMITIDOS;
  for (const t of [...tiposMarcados]) if (!lista.includes(t)) tiposMarcados.delete(t);
  $('#tipos').innerHTML = lista
    .map((t) => `<label class="opcion"><input type="checkbox" data-tipo="${t}"${tiposMarcados.has(t) ? ' checked' : ''}>${PLURAL[t]}</label>`)
    .join('');
  $('#tipos')
    .querySelectorAll<HTMLInputElement>('input')
    .forEach((el) =>
      el.addEventListener('change', () => {
        const t = el.dataset.tipo as TipoComprobante;
        if (el.checked) tiposMarcados.add(t);
        else tiposMarcados.delete(t);
        pintarPlan();
      }),
    );
}

function leerPeriodo(): Periodo {
  const v = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return construirPeriodo(tipoPeriodo, { dia: v('p-dia')?.value, desde: v('p-desde')?.value, hasta: v('p-hasta')?.value, anio: v('p-anio')?.value, mes: v('p-mes')?.value });
}

let planValido = false;

function pintarPlan() {
  const plan = $('#plan');
  try {
    const p = leerPeriodo();
    if (!tiposMarcados.size) throw new RangeError('Elige al menos un tipo de comprobante.');
    const porTipo = bandeja === 'recibidos' ? consultasRecibidos(p, hoy).length : consultasEmitidos(p, hoy).length;
    const total = porTipo * tiposMarcados.size;
    const unidad = bandeja === 'recibidos' ? (p.tipo === 'dia' ? 'del día' : 'por mes') : 'por día';
    plan.textContent =
      total === 1
        ? 'Hará una consulta al SRI.'
        : `Hará ${miles(total)} consultas al SRI, una ${unidad}${tiposMarcados.size > 1 ? ' y tipo' : ''}.`;
    plan.dataset.error = 'false';
    planValido = true;
  } catch (e) {
    plan.textContent = e instanceof Error ? e.message : String(e);
    plan.dataset.error = 'true';
    planValido = false;
  }
  actualizarAcciones();
}

document.querySelectorAll<HTMLButtonElement>('[data-periodo]').forEach((b) =>
  b.addEventListener('click', () => {
    tipoPeriodo = b.dataset.periodo as TipoPeriodo;
    document.querySelectorAll<HTMLButtonElement>('[data-periodo]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    pintarCamposPeriodo();
    pintarPlan();
  }),
);

function leerTrabajo(): Trabajo {
  return {
    bandeja,
    periodo: leerPeriodo(),
    tipos: [...tiposMarcados],
    emisor: bandeja === 'recibidos' ? $<HTMLInputElement>('#emisor').value.trim() : '',
    formatos: { xml: $<HTMLInputElement>('#f-xml').checked, pdf: $<HTMLInputElement>('#f-pdf').checked, txt: $<HTMLInputElement>('#f-txt').checked },
  };
}

// ---------------------------------------------------------------------------
// Conexión con la pestaña del portal
// ---------------------------------------------------------------------------

const PATRON_SRI = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*';
let pestana: number | null = null;
let pagina: EstadoPagina | null = null;
let enCurso = false;
let actual: EstadoTrabajo | undefined;

function aviso(texto: string | null) {
  const el = $('#estado');
  el.hidden = !texto;
  el.textContent = texto ?? '';
}

const pedirEstado = async (id: number) => {
  try {
    return (await browser.tabs.sendMessage(id, { tipo: 'estado' } satisfies Peticion)) as EstadoPagina;
  } catch {
    return null;
  }
};

/** Activa Legajo en una pestaña del SRI abierta antes de instalar o recargar la extensión. */
async function inyectar(id: number) {
  await browser.scripting.executeScript({ target: { tabId: id }, files: ['/content-scripts/conductor.js'], world: 'MAIN' });
  await browser.scripting.executeScript({ target: { tabId: id }, files: ['/content-scripts/sri.js'] });
}

async function conectar() {
  const [activa] = await browser.tabs.query({ active: true, currentWindow: true });
  const delSri = await browser.tabs.query({ url: PATRON_SRI });
  const t = delSri.find((x) => x.id === activa?.id) ?? delSri.find((x) => x.active) ?? delSri[0];
  pestana = t?.id ?? null;
  pagina = pestana === null ? null : await pedirEstado(pestana);
  if (pestana !== null && !pagina) {
    try {
      await inyectar(pestana);
      await new Promise((r) => setTimeout(r, 300));
      pagina = await pedirEstado(pestana);
    } catch {
      /* se informa abajo */
    }
  }
  const pantalla = $('#pantalla');
  if (pestana === null) aviso('Abre SRI en Línea y entra a Comprobantes electrónicos recibidos o emitidos.');
  else if (!pagina) aviso('La pestaña del SRI no responde. Vuelve a entrar desde el menú del portal.');
  else if (!pagina.bandeja) aviso('En el portal, entra a Comprobantes electrónicos recibidos o emitidos.');
  else {
    aviso(null);
    bandeja = pagina.bandeja;
    pantalla.textContent = bandeja === 'recibidos' ? 'Recibidos' : 'Emitidos';
    pantalla.dataset.conectado = 'true';
    pantalla.title = `Conectado a la pestaña del SRI (${pagina.ruc})`;
    $('#sec-emisor').hidden = bandeja === 'emitidos';
    pintarTipos();
    pintarPlan();
  }
  enCurso = !!pagina?.ocupado;
  actualizarAcciones();
}

// ---------------------------------------------------------------------------
// Pestañas y botones
// ---------------------------------------------------------------------------

type Pestana = 'form' | 'descargas';
let pestanaActiva: Pestana = 'form';

function mostrarPestana(cual: Pestana) {
  pestanaActiva = cual;
  for (const [id, panel] of [['form', 'panel-form'], ['descargas', 'panel-descargas']] as const) {
    $(`#tab-${id}`).setAttribute('aria-selected', String(id === cual));
    $(`#${panel}`).hidden = id !== cual;
  }
  actualizarAcciones();
}

/** Qué falta por hacer del último trabajo (para «Reanudar»). */
function pendientesDe(p: EstadoTrabajo | undefined): number[] {
  if (!p || enCurso || !p.trabajo || !p.pendientes?.length) return [];
  return ['error', 'cancelado', 'listo'].includes(p.fase) ? p.pendientes : [];
}

function unidadPendientes(p: EstadoTrabajo, n: number) {
  const porDia = p.trabajo?.bandeja === 'emitidos' || p.trabajo?.periodo.tipo === 'dia';
  if ((p.trabajo?.tipos.length ?? 1) > 1) return n === 1 ? 'consulta' : 'consultas';
  return porDia ? (n === 1 ? 'día' : 'días') : n === 1 ? 'mes' : 'meses';
}

function actualizarAcciones() {
  const tabForm = $<HTMLButtonElement>('#tab-form');
  tabForm.disabled = enCurso;
  tabForm.title = enCurso ? 'Disponible cuando termine la descarga en curso' : '';
  if (enCurso && pestanaActiva === 'form') return mostrarPestana('descargas');

  const principal = $<HTMLButtonElement>('#descargar');
  const secundario = $<HTMLButtonElement>('#secundario');
  const pendientes = pendientesDe(actual);
  secundario.hidden = true;
  principal.disabled = false;
  principal.className = 'boton boton-principal';

  if (enCurso) {
    principal.textContent = 'Cancelar';
    principal.className = 'boton boton-secundario';
  } else if (pestanaActiva === 'descargas') {
    if (pendientes.length && actual) {
      principal.textContent = `Reanudar ${pendientes.length} ${unidadPendientes(actual, pendientes.length)}`;
      principal.disabled = !pagina?.bandeja || pagina.bandeja !== actual.trabajo?.bandeja;
      secundario.hidden = false;
    } else principal.textContent = 'Nueva descarga';
  } else {
    principal.textContent = 'Descargar';
    principal.disabled = !pagina?.bandeja || !planValido;
  }
}

async function iniciar(t: Trabajo) {
  if (pestana === null) return;
  const r = (await browser.tabs.sendMessage(pestana, { tipo: 'iniciar', trabajo: t } satisfies Peticion)) as { ok: boolean; error?: string };
  if (!r?.ok) return aviso(r?.error ?? 'No se pudo empezar la descarga.');
  aviso(null);
  enCurso = true;
  if (pagina) pagina.ocupado = true;
  mostrarPestana('descargas');
}

$('#tab-form').addEventListener('click', () => !enCurso && mostrarPestana('form'));
$('#tab-descargas').addEventListener('click', () => mostrarPestana('descargas'));
$('#secundario').addEventListener('click', () => mostrarPestana('form'));

$('#descargar').addEventListener('click', async () => {
  if (enCurso) {
    if (pestana !== null) await browser.tabs.sendMessage(pestana, { tipo: 'cancelar' } satisfies Peticion);
    $('#prog-mensaje').textContent = 'Cancelando…';
    return;
  }
  if (pestanaActiva === 'descargas') {
    const pendientes = pendientesDe(actual);
    if (pendientes.length && actual?.trabajo) return iniciar({ ...actual.trabajo, soloIndices: pendientes });
    return mostrarPestana('form');
  }
  const t = leerTrabajo();
  if (!t.formatos.xml && !t.formatos.pdf && !t.formatos.txt) return aviso('Elige al menos un tipo de archivo.');
  await iniciar(t);
});

// ---------------------------------------------------------------------------
// Progreso
// ---------------------------------------------------------------------------

function tituloTrabajo(t: Trabajo | undefined): string {
  if (!t) return 'Descarga';
  const recibidos = t.bandeja === 'recibidos';
  const que =
    t.tipos.length === 1 ? `${PLURAL[t.tipos[0]!]} ${recibidos ? 'recibidas' : 'emitidas'}` : `Comprobantes ${recibidos ? 'recibidos' : 'emitidos'}`;
  const p = t.periodo;
  const cuando =
    p.tipo === 'mes'
      ? `de ${MESES[p.mes - 1]} ${p.anio}`
      : p.tipo === 'anio'
        ? `de ${p.anio}`
        : p.tipo === 'dia'
          ? `del ${formatoSri(p.fecha)}`
          : `del ${formatoSri(p.desde)} al ${formatoSri(p.hasta)}`;
  return `${que} ${cuando}`;
}

/** Etiqueta corta de una ficha: "mar" para meses, "14" para días. */
function rotulo(paso: Paso): string {
  const mes = MESES.findIndex((m) => paso.etiqueta.startsWith(m));
  if (mes >= 0) return MES_CORTO[mes]!;
  return /^(\d{2})\//.exec(paso.etiqueta)?.[1]?.replace(/^0/, '') ?? /^(\d+) de/.exec(paso.etiqueta)?.[1] ?? '';
}

function descripcionPaso(x: Paso): string {
  const estado =
    x.estado === 'ok'
      ? `${miles(x.comprobantes)} comprobantes${x.fallidos ? `, ${x.fallidos} archivos con problemas` : ''}`
      : x.estado === 'sin-datos'
        ? 'sin comprobantes'
        : x.estado === 'fallida'
          ? 'no se pudo consultar'
          : x.estado === 'pendiente'
            ? 'pendiente'
            : 'en curso';
  return `${x.etiqueta}: ${estado}`;
}

function pintarFichero(pasos: Paso[]) {
  const ol = $('#prog-pasos');
  ol.innerHTML = '';
  const denso = pasos.length > 16;
  ol.dataset.denso = String(denso);
  ol.style.setProperty('--columnas', String(denso ? Math.min(16, Math.ceil(pasos.length / Math.ceil(pasos.length / 16))) : Math.max(pasos.length, 6)));
  for (const x of pasos) {
    const li = document.createElement('li');
    li.className = 'ficha';
    li.dataset.estado = x.estado;
    if (x.estado === 'ok' && x.fallidos) li.dataset.problema = 'true';
    li.textContent = denso ? '' : rotulo(x);
    li.title = descripcionPaso(x);
    li.setAttribute('aria-label', descripcionPaso(x));
    ol.append(li);
  }
}

const enMarcha = (p: EstadoTrabajo) => ['consultando', 'descargando', 'empaquetando'].includes(p.fase);

const duracion = (ms: number) => {
  const min = Math.round(ms / 60_000);
  if (ms < 60_000) return 'menos de un minuto';
  return min < 60 ? `${min} ${min === 1 ? 'minuto' : 'minutos'}` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

/** Línea secundaria: cifras y tiempo. Se repinta cada segundo. */
function pintarCifras() {
  const p = actual;
  if (!p) return;
  const ahora = Date.now();
  const partes: string[] = [];
  if (p.descargados) partes.push(`${miles(p.descargados)} ${p.descargados === 1 ? 'archivo listo' : 'archivos listos'}.`);
  else if (p.encontrados) partes.push(`${miles(p.encontrados)} comprobantes encontrados.`);
  if (enMarcha(p)) {
    const silencio = ahora - p.actualizado;
    if (p.esperaHasta && p.esperaHasta > ahora) partes.push(`Siguiente consulta en ${Math.ceil((p.esperaHasta - ahora) / 1000)} s.`);
    else if (silencio > 45_000) partes.push(`Sin noticias del portal desde hace ${Math.round(silencio / 1000)} s.`);
    else if (p.consultasHechas > 0 && p.consultasTotal > p.consultasHechas) {
      const resto = ((ahora - p.inicio) / p.consultasHechas) * (p.consultasTotal - p.consultasHechas);
      partes.push(`Faltan unos ${duracion(resto)}.`);
    }
  }
  $('#prog-cifras').textContent = partes.join(' ') + ($('#prog-cifras').dataset.fallidos ?? '');
}

function hora(t: number) {
  return new Date(t).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function pintarProgreso(p: EstadoTrabajo | undefined) {
  actual = p;
  const caja = $('#progreso');
  const indicador = $('#tab-indicador');
  $('#sin-descargas').hidden = !!p;
  caja.hidden = !p;
  indicador.hidden = !p;
  if (!p) return actualizarAcciones();

  enCurso = enMarcha(p) && (pagina?.ocupado ?? true);
  indicador.dataset.estado = enCurso ? 'activo' : p.fase === 'listo' ? 'listo' : 'error';

  $('#prog-titulo').textContent = tituloTrabajo(p.trabajo);
  pintarFichero(p.pasos ?? []);

  // Una sola frase de estado; los problemas van aparte, con lo que hay que hacer.
  const detenida = p.fase === 'error' || p.fase === 'cancelado';
  const frase = $('#prog-mensaje');
  const problema = $('#prog-problema');
  problema.hidden = true;
  problema.textContent = '';
  /** Primera frase en negrita (qué pasó), el resto normal (qué hacer). */
  const explicar = (texto: string) => {
    const [que, ...resto] = texto.split(/(?<=\.)\s+/);
    const fuerte = document.createElement('strong');
    fuerte.textContent = que ?? '';
    problema.append(fuerte, resto.length ? ` ${resto.join(' ')}` : '');
    problema.hidden = false;
  };
  if (p.verificacion) frase.textContent = 'El SRI muestra una verificación en la pestaña del portal. Resuélvela y Legajo seguirá solo.';
  else if (detenida && p.fase === 'error') {
    frase.textContent = p.zip ? 'Lo que se alcanzó a bajar está en tu carpeta de descargas.' : 'La descarga se detuvo.';
    explicar(p.mensaje.replace(/ Se guardó lo ya descargado.*$/, ''));
  } else if (p.fase === 'listo') frase.textContent = p.zip ? `Listo. El ZIP está en tu carpeta de descargas.` : p.mensaje;
  else frase.textContent = p.mensaje;

  const cifrasFallidos = !enCurso && p.fallidos ? ` ${miles(p.fallidos)} ${p.fallidos === 1 ? 'archivo no se pudo bajar' : 'archivos no se pudieron bajar'}.` : '';
  $('#prog-cifras').dataset.fallidos = cifrasFallidos;

  const act = $('#prog-actividad');
  act.innerHTML = '';
  for (const a of [...(p.actividad ?? [])].reverse().slice(0, 30)) {
    const li = document.createElement('li');
    const t = document.createElement('time');
    t.textContent = hora(a.t);
    li.append(t, a.texto);
    act.append(li);
  }
  const fallidas = $('#prog-fallidas');
  fallidas.innerHTML = '';
  for (const f of [...(p.consultasFallidas ?? []), ...(p.errores ?? [])]) {
    const li = document.createElement('li');
    li.textContent = f;
    fallidas.append(li);
  }
  pintarCifras();
  actualizarAcciones();
}

setInterval(pintarCifras, 1000);

browser.storage.onChanged.addListener((cambios, area) => {
  if (area === 'local' && cambios[CLAVE_PROGRESO]) pintarProgreso(cambios[CLAVE_PROGRESO].newValue as EstadoTrabajo | undefined);
});

pintarCamposPeriodo();
pintarTipos();
pintarPlan();
void conectar().then(async () => {
  const guardado = (await browser.storage.local.get(CLAVE_PROGRESO))[CLAVE_PROGRESO] as EstadoTrabajo | undefined;
  pintarProgreso(guardado);
  // Si hay algo en marcha o pendiente de reanudar, abre directo en Descargas.
  if (guardado && (enCurso || pendientesDe(guardado).length)) mostrarPestana('descargas');
});
