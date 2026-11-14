/**
 * Registro de diagnóstico en chrome.storage.local (en disco: perfil de Chrome →
 * Local Extension Settings/<id>/, LevelDB). Cada contexto escribe su propia
 * clave para no pisarse: pluryfact:registro:<origen>. Se lee con `bun run registro`.
 *
 * Nunca guarda RUC ni claves de acceso completas: se enmascaran al anotar.
 */
export type Origen = 'content' | 'background' | 'conductor' | 'popup';
export type Nivel = 'info' | 'aviso' | 'error';

export interface Entrada {
  t: number;
  o: Origen;
  n: Nivel;
  m: string;
}

export const PREFIJO_REGISTRO = 'pluryfact:registro:';
export const MAX_ENTRADAS = 2000;

/** 49 dígitos → …secuencial; 10–13 dígitos (RUC/cédula) → <id>. */
export const enmascarar = (s: string) =>
  s.replace(/\b\d{49}\b/g, (c) => `…${c.slice(30, 39)}`).replace(/\b\d{10,13}\b/g, '<id>');

export interface Almacen {
  get(k: string): Promise<Record<string, unknown>>;
  set(v: Record<string, unknown>): Promise<void>;
}

export function crearRegistro(origen: Origen, almacen: Almacen, ahora: () => number = Date.now) {
  const clave = PREFIJO_REGISTRO + origen;
  let pendientes: Entrada[] = [];
  let guardando: Promise<void> = Promise.resolve();
  let reloj: ReturnType<typeof setTimeout> | undefined;

  const volcar = () => {
    const lote = pendientes;
    pendientes = [];
    guardando = guardando.then(async () => {
      if (!lote.length) return;
      const previo = ((await almacen.get(clave))[clave] as Entrada[] | undefined) ?? [];
      await almacen.set({ [clave]: [...previo, ...lote].slice(-MAX_ENTRADAS) });
    }).catch(() => {});
    return guardando;
  };

  const anotar = (n: Nivel, m: string) => {
    pendientes.push({ t: ahora(), o: origen, n, m: enmascarar(m) });
    clearTimeout(reloj);
    reloj = setTimeout(volcar, 400);
  };

  return {
    info: (m: string) => anotar('info', m),
    aviso: (m: string) => anotar('aviso', m),
    error: (m: string) => anotar('error', m),
    /** Escribe ya lo pendiente (al terminar un trabajo). */
    volcar,
  };
}

export type Registro = ReturnType<typeof crearRegistro>;

/** Registro que no hace nada (tests). */
export const registroNulo: Registro = { info: () => {}, aviso: () => {}, error: () => {}, volcar: async () => {} };
