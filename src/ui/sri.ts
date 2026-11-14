import type { Trabajo } from '@/lib/cola';
import { CLAVE_CANCELAR, CLAVE_PROGRESO, type EstadoPagina, type EstadoTrabajo, type Peticion } from '@/lib/mensajeria';

/** Conexión con la pestaña del portal del SRI, compartida por popup y página. */
const PATRON_SRI = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*';

export interface Conexion {
  pestana: number | null;
  pagina: EstadoPagina | null;
  /** Qué falta para poder descargar, en lenguaje claro; null si todo está bien. */
  problema: string | null;
}

const pedirEstado = async (id: number) => {
  try {
    return (await browser.tabs.sendMessage(id, { tipo: 'estado' } satisfies Peticion)) as EstadoPagina;
  } catch {
    return null;
  }
};

/** Activa Pluryfact en una pestaña del SRI abierta antes de instalar o recargar la extensión. */
async function inyectar(id: number) {
  await browser.scripting.executeScript({ target: { tabId: id }, files: ['/content-scripts/conductor.js'], world: 'MAIN' });
  await browser.scripting.executeScript({ target: { tabId: id }, files: ['/content-scripts/sri.js'] });
}

export async function conectar(): Promise<Conexion> {
  const [activa] = await browser.tabs.query({ active: true, currentWindow: true });
  const delSri = await browser.tabs.query({ url: PATRON_SRI });
  const t = delSri.find((x) => x.id === activa?.id) ?? delSri.find((x) => x.active) ?? delSri[0];
  const pestana = t?.id ?? null;
  let pagina = pestana === null ? null : await pedirEstado(pestana);
  if (pestana !== null && !pagina) {
    try {
      await inyectar(pestana);
      await new Promise((r) => setTimeout(r, 300));
      pagina = await pedirEstado(pestana);
    } catch {
      /* se informa abajo */
    }
  }
  const problema =
    pestana === null
      ? 'Abre SRI en Línea, inicia sesión y entra a Comprobantes electrónicos recibidos o emitidos.'
      : !pagina
        ? 'La pestaña del SRI no responde. Vuelve a entrar desde el menú del portal.'
        : !pagina.bandeja
          ? 'En el portal, entra a Comprobantes electrónicos recibidos o emitidos.'
          : null;
  return { pestana, pagina, problema };
}

export async function iniciar(c: Conexion, t: Trabajo): Promise<string | null> {
  if (c.pestana === null) return c.problema;
  try {
    const r = (await browser.tabs.sendMessage(c.pestana, { tipo: 'iniciar', trabajo: t } satisfies Peticion)) as { ok: boolean; error?: string };
    return r?.ok ? null : (r?.error ?? 'No se pudo empezar la descarga.');
  } catch {
    return 'La pestaña del SRI no responde. Vuelve a entrar desde el menú del portal.';
  }
}

/** Pide cancelar el trabajo en curso, esté en la pestaña que esté. */
export async function cancelar(_c?: Conexion) {
  const actual = (await browser.storage.local.get(CLAVE_PROGRESO))[CLAVE_PROGRESO] as EstadoTrabajo | undefined;
  await browser.storage.local.set({ [CLAVE_CANCELAR]: actual?.inicio ?? Date.now() });
  // Compatibilidad con versiones que solo escuchan mensajes: avisa a todas las pestañas del SRI.
  for (const t of await browser.tabs.query({ url: PATRON_SRI }))
    if (t.id !== undefined) await browser.tabs.sendMessage(t.id, { tipo: 'cancelar' } satisfies Peticion).catch(() => {});
}

/** Lleva al usuario a la pestaña del SRI (para iniciar sesión o volver a la pantalla). */
export async function irAlSri(c: Conexion) {
  if (c.pestana === null) {
    await browser.tabs.create({ url: 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT' });
    return;
  }
  const t = await browser.tabs.update(c.pestana, { active: true });
  if (t?.windowId !== undefined) await browser.windows.update(t.windowId, { focused: true });
}
