/** Preferencias del usuario (pestaña Avanzado). Se recuerdan entre descargas. */
export interface Ajustes {
  /** "amable" alarga las pausas entre consultas y descargas. */
  ritmo: 'normal' | 'amable';
  notificaciones: boolean;
  /** Trabajos terminados que se conservan en Descargas. */
  diasHistorial: number;
}

export const AJUSTES_POR_DEFECTO: Ajustes = { ritmo: 'normal', notificaciones: true, diasHistorial: 90 };
export const CLAVE_AJUSTES = 'pluryfact:ajustes';

export function normalizarAjustes(v: unknown): Ajustes {
  const a = (v && typeof v === 'object' ? v : {}) as Partial<Ajustes>;
  return {
    ritmo: a.ritmo === 'amable' ? 'amable' : 'normal',
    notificaciones: a.notificaciones !== false,
    diasHistorial: Number.isFinite(a.diasHistorial) && a.diasHistorial! >= 1 && a.diasHistorial! <= 3650 ? Math.round(a.diasHistorial!) : 90,
  };
}

/** Multiplicador de pausas según el ritmo elegido. */
export const factorRitmo = (a: Ajustes) => (a.ritmo === 'amable' ? 2 : 1);
