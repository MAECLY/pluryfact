import { TIPOS_MENSAJE, type PuertoNativo, type TipoMensaje } from './pluryprint';
import type { Registro } from './registro';

/**
 * Puente entre las páginas de Pluryfact (o el content script del SRI) y
 * PluryPrint. Vive en el background, que es el ÚNICO contexto que llama a
 * `runtime.connectNative`: Chrome no lo ofrece en content scripts y así el
 * permiso opcional se revisa en un solo sitio.
 *
 * Por cada `runtime.Port` llamado `pluryprint` abre un puerto nativo y
 * reenvía mensajes en las dos direcciones, después de validar quién llama y
 * la forma de cada petición. Cuando un lado se cierra, cierra el otro (el
 * host borra entonces cualquier trabajo sin `commitJob`).
 */

export const NOMBRE_PUERTO = 'pluryprint';
/** Página del SRI donde corre el content script que puede pedir imprimir. */
export const PREFIJO_SRI = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/';
/** Motivo de cierre cuando falta el permiso opcional (lib/pluryprint lo traduce a «sin_permiso»). */
export const MOTIVO_SIN_PERMISO = 'nativeMessaging permission not granted';
/** base64 de un trozo de 16 MiB (máximo del host) más margen para el resto de la petición. */
export const MAX_DATA_BASE64 = Math.ceil((16 * 1024 * 1024) / 3) * 4;

export interface RemitenteRuntime {
  id?: string;
  url?: string;
  tab?: { id?: number };
}

/** Lo mínimo de un `runtime.Port` del lado de la extensión. */
export interface PuertoRuntime {
  name: string;
  sender?: RemitenteRuntime;
  postMessage(m: unknown): void;
  onMessage: { addListener(fn: (m: unknown) => void): void };
  onDisconnect: { addListener(fn: () => void): void };
  disconnect(): void;
}

/** Mensaje de control del puente: nunca llega a PluryPrint. */
export interface ControlPuente {
  puente: 'cerrado';
  motivo: string;
}
const esControl = (m: unknown): m is ControlPuente => !!m && typeof m === 'object' && (m as ControlPuente).puente === 'cerrado';

/**
 * Solo atiende a la propia extensión: sus páginas (`chrome-extension://<id>/…`)
 * o su content script en la pantalla de comprobantes del SRI.
 */
export function remitenteValido(s: RemitenteRuntime | undefined, idExtension: string, urlBase: string): boolean {
  if (!s || s.id !== idExtension || typeof s.url !== 'string') return false;
  if (s.url.startsWith(urlBase)) return true;
  return s.tab?.id !== undefined && s.url.startsWith(PREFIJO_SRI);
}

/** Forma de una petición del protocolo v1; el host valida todo lo demás. */
export function peticionValida(m: unknown): m is { v: 1; id: string; type: TipoMensaje } & Record<string, unknown> {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const p = m as Record<string, unknown>;
  if (p.v !== 1 || typeof p.id !== 'string' || !p.id || p.id.length > 64) return false;
  if (!TIPOS_MENSAJE.includes(p.type as TipoMensaje)) return false;
  if ('ok' in p || 'error' in p) return false;
  if (p.type === 'putFile' && (typeof p.data !== 'string' || p.data.length > MAX_DATA_BASE64)) return false;
  return true;
}

export interface DependenciasPuente {
  idExtension: string;
  /** `runtime.getURL('/')`. */
  urlBase: string;
  tienePermiso(): Promise<boolean>;
  /** Abre `connectNative(NOMBRE_HOST)` adaptado: `onDisconnect` recibe `runtime.lastError.message`. */
  conectarNativo(): PuertoNativo;
  registro?: Pick<Registro, 'info' | 'aviso' | 'error'>;
}

/** Atiende un `runtime.Port` entrante. Devuelve false si lo rechazó. */
export function atenderPuerto(p: PuertoRuntime, d: DependenciasPuente): boolean {
  if (p.name !== NOMBRE_PUERTO) return false;
  const log = d.registro;
  if (!remitenteValido(p.sender, d.idExtension, d.urlBase)) {
    log?.aviso(`Puente PluryPrint: remitente rechazado (${p.sender?.url?.split('?')[0] ?? 'sin url'})`);
    p.disconnect();
    return false;
  }
  const origen = p.sender?.url?.startsWith(d.urlBase) ? 'página' : 'pestaña del SRI';
  let nativo: PuertoNativo | null = null;
  let cerrado = false;
  let peticiones = 0;

  const cerrar = (motivo: string) => {
    if (cerrado) return;
    cerrado = true;
    log?.info(`Puente PluryPrint cerrado (${origen}, ${peticiones} peticiones): ${motivo}`);
    try {
      p.postMessage({ puente: 'cerrado', motivo } satisfies ControlPuente);
    } catch {
      /* la página ya se fue */
    }
    try {
      p.disconnect();
    } catch {
      /* ya cerrado */
    }
    try {
      nativo?.disconnect();
    } catch {
      /* ya cerrado */
    }
  };

  const listo: Promise<PuertoNativo | null> = (async () => {
    if (!(await d.tienePermiso().catch(() => false))) {
      cerrar(MOTIVO_SIN_PERMISO);
      return null;
    }
    if (cerrado) return null;
    try {
      nativo = d.conectarNativo();
    } catch (e) {
      cerrar(e instanceof Error ? e.message : String(e));
      return null;
    }
    nativo.onMessage.addListener((m) => {
      if (!cerrado) p.postMessage(m);
    });
    nativo.onDisconnect.addListener((motivo) => cerrar(motivo || 'Native host has exited.'));
    log?.info(`Puente PluryPrint abierto (${origen})`);
    return nativo;
  })();

  p.onMessage.addListener((m) => {
    if (!peticionValida(m)) {
      log?.aviso('Puente PluryPrint: petición con forma inválida descartada');
      const q = m as { id?: unknown; type?: unknown } | null;
      if (q && typeof q.id === 'string' && typeof q.type === 'string')
        p.postMessage({ v: 1, id: q.id, type: q.type, ok: false, error: { code: 'bad_request', message: 'Rejected by the Pluryfact bridge.' } });
      return;
    }
    peticiones++;
    void listo.then((n) => {
      if (n && !cerrado) n.postMessage(m);
    });
  });
  p.onDisconnect.addListener(() => {
    if (cerrado) return;
    cerrado = true;
    log?.info(`Puente PluryPrint: la ${origen} cerró la conexión (${peticiones} peticiones)`);
    void listo.then((n) => n?.disconnect());
  });
  return true;
}

/**
 * Del lado de la página o del content script: convierte un `runtime.Port`
 * hacia el puente en un `PuertoNativo` para `ClientePluryprint`. El motivo
 * del cierre llega como mensaje de control justo antes de desconectar.
 */
export function puertoHaciaPuente(p: PuertoRuntime): PuertoNativo {
  let motivo: string | undefined;
  return {
    postMessage: (m) => p.postMessage(m),
    onMessage: {
      addListener: (fn) =>
        p.onMessage.addListener((m) => {
          if (esControl(m)) motivo = m.motivo;
          else fn(m);
        }),
    },
    // Se difiere un turno para que el mensaje de control con el motivo llegue antes.
    onDisconnect: { addListener: (fn) => p.onDisconnect.addListener(() => void setTimeout(() => fn(motivo), 0)) },
    disconnect: () => p.disconnect(),
  };
}
