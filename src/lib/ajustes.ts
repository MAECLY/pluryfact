import { esTema, TEMA_POR_DEFECTO, type IdTema } from './temas';

/** Qué se manda a Pluryprint de cada comprobante. */
export type ContenidoImpresion = 'ride' | 'xml' | 'ambos';
/** Orden de impresión; siempre estable. `portal` = el orden en que se descargaron. */
export type OrdenImpresion = 'portal' | 'fecha' | 'emisor' | 'tipo';
export type AccionImpresion = 'configure' | 'queue' | 'print-default';

/** Integración con Pluryprint (Integraciones → Pluryprint). */
export interface AjustesPluryprint {
  /** true cuando el usuario conectó Pluryprint con éxito al menos una vez. */
  activado: boolean;
  /** configure = abrir Pluryprint para revisar y confirmar (por defecto: no se gasta papel sin confirmar). */
  accion: AccionImpresion;
  contenido: ContenidoImpresion;
  /** Si un comprobante no tiene RIDE, mandar su XML para que Pluryprint lo represente. */
  xmlSiFaltaRide: boolean;
  incluirReporte: boolean;
  orden: OrdenImpresion;
  /** null = la del perfil o la predeterminada de Pluryprint. */
  impresoraId: string | null;
  perfilId: string | null;
  /** Ajustes que pisan los del perfil; null = los del perfil. */
  copias: number | null;
  duplex: 'off' | 'long-edge' | 'short-edge' | null;
  color: 'color' | 'mono' | null;
}

/** Preferencias del usuario (pestaña Avanzado). Se recuerdan entre descargas. */
export interface Ajustes {
  /** "amable" alarga las pausas entre consultas y descargas. */
  ritmo: 'normal' | 'amable';
  notificaciones: boolean;
  /** Trabajos terminados que se conservan en Descargas. */
  diasHistorial: number;
  /** Paleta y tipografía de la interfaz (ver lib/temas). */
  tema: IdTema;
  pluryprint: AjustesPluryprint;
}

export const PLURYPRINT_POR_DEFECTO: AjustesPluryprint = {
  activado: false,
  accion: 'configure',
  contenido: 'ride',
  xmlSiFaltaRide: true,
  incluirReporte: false,
  orden: 'fecha',
  impresoraId: null,
  perfilId: null,
  copias: null,
  duplex: null,
  color: null,
};

export const AJUSTES_POR_DEFECTO: Ajustes = {
  ritmo: 'normal',
  notificaciones: true,
  diasHistorial: 90,
  tema: TEMA_POR_DEFECTO,
  pluryprint: PLURYPRINT_POR_DEFECTO,
};
export const CLAVE_AJUSTES = 'pluryfact:ajustes';

const uno = <T extends string>(v: unknown, validos: readonly T[], porDefecto: T): T => (validos.includes(v as T) ? (v as T) : porDefecto);
const opcional = <T extends string>(v: unknown, validos: readonly T[]): T | null => (validos.includes(v as T) ? (v as T) : null);
const idOpcional = (v: unknown) => (typeof v === 'string' && v.trim() && v.length <= 200 ? v.trim() : null);

/**
 * Normaliza la sección Pluryprint. Acepta también formas viejas:
 * - un booleano suelto (`pluryprint: true`) → activado;
 * - el borrador inicial sin `contenido` → RIDE, como hacía entonces.
 */
export function normalizarPluryprint(v: unknown): AjustesPluryprint {
  if (typeof v === 'boolean') return { ...PLURYPRINT_POR_DEFECTO, activado: v };
  const a = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = PLURYPRINT_POR_DEFECTO;
  const copias = Number(a.copias);
  return {
    activado: a.activado === true,
    accion: uno(a.accion, ['configure', 'queue', 'print-default'] as const, d.accion),
    contenido: uno(a.contenido, ['ride', 'xml', 'ambos'] as const, d.contenido),
    xmlSiFaltaRide: a.xmlSiFaltaRide !== false,
    incluirReporte: a.incluirReporte === true,
    orden: uno(a.orden, ['portal', 'fecha', 'emisor', 'tipo'] as const, d.orden),
    impresoraId: idOpcional(a.impresoraId),
    perfilId: idOpcional(a.perfilId),
    copias: typeof a.copias === 'number' || typeof a.copias === 'string' ? (Number.isInteger(copias) && copias >= 1 && copias <= 999 ? copias : null) : null,
    duplex: opcional(a.duplex, ['off', 'long-edge', 'short-edge'] as const),
    color: opcional(a.color, ['color', 'mono'] as const),
  };
}

export function normalizarAjustes(v: unknown): Ajustes {
  const a = (v && typeof v === 'object' ? v : {}) as Partial<Ajustes>;
  return {
    ritmo: a.ritmo === 'amable' ? 'amable' : 'normal',
    notificaciones: a.notificaciones !== false,
    diasHistorial: Number.isFinite(a.diasHistorial) && a.diasHistorial! >= 1 && a.diasHistorial! <= 3650 ? Math.round(a.diasHistorial!) : 90,
    tema: esTema(a.tema) ? a.tema : TEMA_POR_DEFECTO,
    pluryprint: normalizarPluryprint(a.pluryprint),
  };
}

/** Multiplicador de pausas según el ritmo elegido. */
export const factorRitmo = (a: Ajustes) => (a.ritmo === 'amable' ? 2 : 1);
