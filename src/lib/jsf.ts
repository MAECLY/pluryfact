import { VIEW_STATE } from './selectors';

/**
 * Serializa un formulario como lo envía el navegador: campos con `name`,
 * habilitados, radios/checkbox marcados y selects con su opción elegida.
 * `mojarra.jsfcljs(form, {id: id})` añade el par del enlace pulsado; aquí se
 * pasa en `extra`.
 */
export function cuerpoFormulario(form: HTMLFormElement, extra: Record<string, string> = {}): URLSearchParams {
  const body = new URLSearchParams();
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement))
      continue;
    if (!el.name || el.disabled) continue;
    if (el instanceof HTMLInputElement) {
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue;
      if (['submit', 'button', 'image', 'file', 'reset'].includes(el.type)) continue;
    }
    if (el instanceof HTMLSelectElement && el.multiple) {
      for (const o of Array.from(el.selectedOptions)) body.append(el.name, o.value);
      continue;
    }
    body.append(el.name, el.value);
  }
  for (const [k, v] of Object.entries(extra)) body.set(k, v);
  return body;
}

/** Cuerpo del POST que dispara un enlace `mojarra.jsfcljs` (XML, RIDE o reporte). */
export const cuerpoDescarga = (form: HTMLFormElement, idEnlace: string) =>
  cuerpoFormulario(form, { [idEnlace]: idEnlace });

export interface RespuestaParcial {
  /** id → HTML de cada `<update>`. */
  updates: Map<string, string>;
  viewState: string | null;
  /** Texto de `<error>` o de una redirección (sesión caducada). */
  error: string | null;
  redirect: string | null;
}

const contenidoNodo = (interior: string) => {
  // JSF parte un CDATA que contenga "]]>" en varios bloques: se unen todos.
  const bloques = [...interior.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)].map((m) => m[1]);
  return bloques.length ? bloques.join('') : interior.trim();
};

/**
 * Lee el XML `partial-response` de JSF/PrimeFaces. Se usa una lectura por
 * patrones en lugar de DOMParser para no depender del soporte de CDATA del
 * entorno (happy-dom en tests, el service worker no tiene DOMParser).
 */
export function parseRespuestaParcial(xml: string): RespuestaParcial | null {
  if (!/<partial-response[\s>]/.test(xml)) return null;
  const updates = new Map<string, string>();
  let viewState: string | null = null;
  for (const m of xml.matchAll(/<update\s+id="([^"]+)"\s*>([\s\S]*?)<\/update>/g)) {
    const id = m[1]!;
    const contenido = contenidoNodo(m[2]!);
    if (id.includes(VIEW_STATE)) viewState = contenido;
    else updates.set(id, contenido);
  }
  const err = /<error>([\s\S]*?)<\/error>/.exec(xml);
  const errMsg = err ? (/<error-message>([\s\S]*?)<\/error-message>/.exec(err[1]!)?.[1] ?? err[1]!) : null;
  const red = /<redirect\s+url="([^"]*)"/.exec(xml);
  return {
    updates,
    viewState,
    error: errMsg === null ? null : contenidoNodo(errMsg),
    redirect: red?.[1]?.replace(/&amp;/g, '&') ?? null,
  };
}

/** Una descarga correcta trae un adjunto; si vuelve HTML es que el SRI respondió con la página (error o sesión). */
export function esAdjunto(headers: Headers): boolean {
  const cd = headers.get('content-disposition') ?? '';
  const ct = headers.get('content-type') ?? '';
  return /attachment|filename=/i.test(cd) || /(xml|pdf|octet-stream|text\/plain)/i.test(ct);
}
