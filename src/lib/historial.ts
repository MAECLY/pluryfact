import type { EstadoTrabajo } from './mensajeria';

/** Trabajos terminados, más reciente primero. Vive en storage.local. */
export const CLAVE_HISTORIAL = 'legajo:historial';
export const MAX_HISTORIAL = 50;

export interface EntradaHistorial extends EstadoTrabajo {
  id: string;
  terminado: number;
}

/** Añade (o reemplaza por id) un trabajo terminado y recorta por cantidad y antigüedad. */
export function agregar(historial: EntradaHistorial[], e: EntradaHistorial, diasMax: number, ahora: number): EntradaHistorial[] {
  const limite = ahora - diasMax * 86_400_000;
  return [e, ...historial.filter((h) => h.id !== e.id)].filter((h) => h.terminado >= limite).slice(0, MAX_HISTORIAL);
}

export type Grupo = 'Hoy' | 'Ayer' | 'Esta semana' | 'Anteriores';

/** Agrupa por fecha como chrome://downloads. */
export function agrupar<T extends { terminado: number }>(lista: T[], ahora: number): Array<{ grupo: Grupo; items: T[] }> {
  const inicioHoy = new Date(ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const hoy = inicioHoy.getTime();
  const grupo = (t: number): Grupo => (t >= hoy ? 'Hoy' : t >= hoy - 86_400_000 ? 'Ayer' : t >= hoy - 6 * 86_400_000 ? 'Esta semana' : 'Anteriores');
  const orden: Grupo[] = ['Hoy', 'Ayer', 'Esta semana', 'Anteriores'];
  return orden
    .map((g) => ({ grupo: g, items: lista.filter((x) => grupo(x.terminado) === g) }))
    .filter((x) => x.items.length);
}

/** Texto plano para buscar: RUC, tipo, periodo y nombre del ZIP. */
export const textoBuscable = (e: EntradaHistorial) =>
  [e.ruc, e.zip ?? '', e.bandeja, JSON.stringify(e.trabajo?.periodo ?? ''), (e.trabajo?.tipos ?? []).join(' '), (e.pasos ?? []).map((p) => p.etiqueta).join(' ')]
    .join(' ')
    .toLowerCase();

export type FiltroEstado = 'todas' | 'problemas' | 'completas';
export const tieneProblemas = (e: EstadoTrabajo) => e.fase === 'error' || e.fase === 'cancelado' || e.fallidos > 0 || !!e.pendientes?.length;
