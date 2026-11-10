/**
 * Conductor: corre en el mundo MAIN de la página del portal. Rellena los
 * filtros y pulsa los MISMOS controles que el usuario (Consultar, paginador),
 * así el ViewState, PrimeFaces y el reCAPTCHA invisible son los del SRI.
 * Se comunica con el content script aislado por window.postMessage.
 *
 * Verificado en vivo: PrimeFaces usa jQuery.ajax y `ajaxComplete` se dispara
 * al terminar cada consulta; pulsar un control del paginador deshabilitado no
 * lanza ninguna petición.
 */
import type { ConsultaPortal, ResultadoConsulta } from './cola';
import { clasificarMensaje } from './mensajes';
import { byId, TABLA } from './selectors';
import type { Bandeja } from './types';

export const CANAL = 'legajo-conductor';

export type Orden =
  | { accion: 'consultar'; consulta: ConsultaPortal }
  | { accion: 'primera-pagina'; bandeja: Bandeja }
  | { accion: 'siguiente-pagina'; bandeja: Bandeja };

export type Respuesta = ResultadoConsulta | { hay: boolean };

export interface MensajeCanal {
  canal: typeof CANAL;
  tipo: 'orden' | 'respuesta' | 'evento';
  id?: number | undefined;
  orden?: Orden;
  respuesta?: Respuesta;
  evento?: 'verificacion';
}

const TIEMPO = { consulta: 45_000, verificacion: 300_000, pagina: 20_000 };

type AlCompletar = (ev: unknown, xhr: unknown, opciones?: { data?: unknown }) => void;
type JQ = (t: unknown) => { on(e: string, h: AlCompletar): void; off(e: string, h: AlCompletar): void };

/**
 * En recibidos, Consultar lanza DOS peticiones: un PrimeFaces.ab inmediato
 * del botón (sin actualizar nada) y, tras el reCAPTCHA, la consulta real
 * (rcBuscar) que actualiza panelListaComprobantes. Solo la segunda cuenta.
 */
export const actualizaListado = (opciones?: { data?: unknown }) => {
  const d = typeof opciones?.data === 'string' ? opciones.data : '';
  let texto = d;
  try {
    texto = decodeURIComponent(d.replace(/\+/g, ' '));
  } catch {
    /* data no codificada */
  }
  return texto.includes('panelListaComprobantes');
};

/** El desafío visible de reCAPTCHA es un iframe "bframe" con tamaño real. */
export function desafioVisible(doc: Document): boolean {
  return Array.from(doc.querySelectorAll<HTMLIFrameElement>('iframe[src*="bframe"]')).some((f) => {
    const caja = f.closest<HTMLElement>('div[style]');
    const visible = !caja || doc.defaultView?.getComputedStyle(caja).visibility !== 'hidden';
    return visible && f.offsetHeight > 100;
  });
}

/** Pulsa y espera el siguiente ajaxComplete de jQuery (o el tiempo límite). */
function pulsarYEsperar(
  win: Window,
  boton: HTMLElement,
  limite: number,
  alVerificar: () => void,
  esLaRespuesta: (opciones?: { data?: unknown }) => boolean = () => true,
  idsQueCambian: string[] = [],
): Promise<'ok' | 'timeout'> {
  const $ = (win as unknown as { jQuery?: JQ }).jQuery;
  return new Promise((resolver) => {
    let terminado = false;
    let avisado = false;
    let limiteActual = limite;
    const inicio = Date.now();
    let espera: ReturnType<typeof setTimeout> | undefined;
    const fin = (v: 'ok' | 'timeout') => {
      if (terminado) return;
      terminado = true;
      clearInterval(reloj);
      clearTimeout(espera);
      observador?.disconnect();
      $?.(win.document).off('ajaxComplete', alCompletar);
      resolver(v);
    };
    // Pequeña espera para que PrimeFaces pinte la respuesta antes de leerla.
    const alCompletar: AlCompletar = (_ev, _xhr, opciones) => {
      if (esLaRespuesta(opciones)) setTimeout(() => fin('ok'), 200);
    };
    $?.(win.document).on('ajaxComplete', alCompletar);
    // Respaldo: PrimeFaces reemplaza el panel del listado o los mensajes al
    // terminar. Se espera a que el DOM quede quieto 400 ms.
    const tocaIds = (n: Node | null): boolean => {
      for (let el = n instanceof Element ? n : n?.parentElement; el; el = el.parentElement)
        if (idsQueCambian.includes(el.id)) return true;
      return false;
    };
    const observador = idsQueCambian.length
      ? new MutationObserver((cambios: MutationRecord[]) => {
          const relevante = cambios.some(
            (c) => tocaIds(c.target) || Array.from(c.addedNodes).some((n) => n instanceof Element && (idsQueCambian.includes(n.id) || !!n.querySelector?.(idsQueCambian.map((i) => `[id="${i}"]`).join(',')))),
          );
          if (!relevante) return;
          clearTimeout(espera);
          espera = setTimeout(() => fin('ok'), 400);
        })
      : null;
    observador?.observe(win.document.body, { childList: true, subtree: true, characterData: true });
    const reloj = setInterval(() => {
      if (desafioVisible(win.document)) {
        limiteActual = Math.max(limiteActual, TIEMPO.verificacion);
        if (!avisado) {
          avisado = true;
          alVerificar();
        }
      }
      if (Date.now() - inicio > limiteActual) fin('timeout');
    }, 500);
    boton.click();
  });
}

function poner(doc: Document, id: string, valor: string): boolean {
  const el = byId(doc, id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) return false;
  if (el instanceof HTMLSelectElement && !Array.from(el.options).some((o) => o.value === valor)) return false;
  el.value = valor;
  return true;
}

const filasVisibles = (doc: Document, b: Bandeja) =>
  byId(doc, `${TABLA[b]}_data`)?.querySelectorAll('tr[data-ri]').length ?? 0;

const textoMensajes = (doc: Document) => (byId(doc, 'formMessages:messages')?.textContent ?? '').trim();

export function bandejaDePagina(doc: Document): Bandeja | null {
  if (byId(doc, 'frmPrincipal:ano')) return 'recibidos';
  if (byId(doc, 'frmPrincipal:calendarFechaDesde_input')) return 'emitidos';
  return null;
}

export async function consultar(win: Window, c: ConsultaPortal, alVerificar: () => void): Promise<ResultadoConsulta> {
  const doc = win.document;
  const enPagina = bandejaDePagina(doc);
  if (enPagina !== c.bandeja) {
    const nombre = c.bandeja === 'recibidos' ? 'Comprobantes electrónicos recibidos' : 'Comprobantes electrónicos emitidos';
    return { estado: 'error', mensaje: `Abre «${nombre}» en el portal` };
  }
  let boton: HTMLElement | null;
  if (c.bandeja === 'recibidos') {
    const ok =
      poner(doc, 'frmPrincipal:ano', String(c.anio)) &&
      poner(doc, 'frmPrincipal:mes', String(c.mes)) &&
      poner(doc, 'frmPrincipal:dia', String(c.dia)) &&
      poner(doc, 'frmPrincipal:cmbTipoComprobante', c.tipoCombo);
    if (!ok) return { estado: 'rechazada', mensaje: 'El portal no ofrece ese año, mes o tipo' };
    boton = byId(doc, 'frmPrincipal:btnBuscar');
  } else {
    const ok =
      poner(doc, 'frmPrincipal:calendarFechaDesde_input', c.fecha) &&
      poner(doc, 'frmPrincipal:cmbTipoComprobante', c.tipoCombo) &&
      poner(doc, 'frmPrincipal:cmbEstadoAutorizacion', 'AUT');
    poner(doc, 'frmPrincipal:cmbEstablecimiento', '');
    poner(doc, 'frmPrincipal:txtPuntoEmision', '');
    if (!ok) return { estado: 'rechazada', mensaje: 'El portal no ofrece ese tipo de comprobante' };
    boton = byId(doc, 'frmPrincipal:btnConsultar');
  }
  if (!boton) return { estado: 'error', mensaje: 'No se encontró el botón Consultar' };
  if ((boton as HTMLButtonElement).disabled) return { estado: 'timeout', mensaje: 'El portal sigue procesando la consulta anterior' };

  const r = await pulsarYEsperar(win, boton, TIEMPO.consulta, alVerificar, actualizaListado, [
    'frmPrincipal:panelListaComprobantes',
    'formMessages:messages',
  ]);
  const mensaje = textoMensajes(doc);
  const tipo = clasificarMensaje(mensaje);
  if (tipo === 'sin-datos') return { estado: 'sin-datos', mensaje };
  if (tipo === 'fecha-actual') return { estado: 'rechazada', mensaje };
  if (r === 'timeout') return { estado: 'timeout', mensaje: 'El portal no respondió a tiempo' };
  if (filasVisibles(doc, c.bandeja) > 0) return { estado: 'ok', mensaje: '' };
  return tipo === 'otro' ? { estado: 'rechazada', mensaje } : { estado: 'sin-datos', mensaje };
}

function controlPaginador(doc: Document, b: Bandeja, clase: string): HTMLElement | null {
  const c = byId(doc, `${TABLA[b]}_paginator_bottom`)?.querySelector<HTMLElement>(`.${clase}`) ?? null;
  return c && !c.classList.contains('ui-state-disabled') ? c : null;
}

export async function primeraPagina(win: Window, b: Bandeja): Promise<{ hay: boolean }> {
  const c = controlPaginador(win.document, b, 'ui-paginator-first');
  if (c) await pulsarYEsperar(win, c, TIEMPO.pagina, () => {});
  return { hay: filasVisibles(win.document, b) > 0 };
}

export async function siguientePagina(win: Window, b: Bandeja): Promise<{ hay: boolean }> {
  const c = controlPaginador(win.document, b, 'ui-paginator-next');
  if (!c) return { hay: false };
  return { hay: (await pulsarYEsperar(win, c, TIEMPO.pagina, () => {})) === 'ok' };
}

export function atender(win: Window, orden: Orden, alVerificar: () => void): Promise<Respuesta> {
  switch (orden.accion) {
    case 'consultar':
      return consultar(win, orden.consulta, alVerificar);
    case 'primera-pagina':
      return primeraPagina(win, orden.bandeja);
    case 'siguiente-pagina':
      return siguientePagina(win, orden.bandeja);
  }
}

/** Instala el oyente en la página. Solo acepta mensajes de la propia ventana. */
export function instalarConductor(win: Window): void {
  win.addEventListener('message', async (ev: MessageEvent<MensajeCanal>) => {
    const m = ev.data;
    if (ev.source !== win || m?.canal !== CANAL || m.tipo !== 'orden' || !m.orden) return;
    const avisar = () => win.postMessage({ canal: CANAL, tipo: 'evento', evento: 'verificacion' } satisfies MensajeCanal, win.location.origin);
    let respuesta: Respuesta;
    try {
      respuesta = await atender(win, m.orden, avisar);
    } catch (e) {
      respuesta = { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) };
    }
    win.postMessage({ canal: CANAL, tipo: 'respuesta', id: m.id, respuesta } satisfies MensajeCanal, win.location.origin);
  });
}
