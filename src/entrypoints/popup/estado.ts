import type { Periodo } from '@/lib/periodo';
import type { Fecha } from '@/lib/types';

export type TipoPeriodo = Periodo['tipo'];

/** "2026-11-09" (input type=date) → Fecha */
export function deIso(s: string | undefined): Fecha {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) throw new RangeError('Fecha inválida');
  return { anio: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

export function construirPeriodo(
  tipo: TipoPeriodo,
  v: { dia?: string | undefined; desde?: string | undefined; hasta?: string | undefined; anio?: string | undefined; mes?: string | undefined },
): Periodo {
  switch (tipo) {
    case 'dia':
      return { tipo, fecha: deIso(v.dia) };
    case 'rango':
      return { tipo, desde: deIso(v.desde), hasta: deIso(v.hasta) };
    case 'mes':
      return { tipo, anio: Number(v.anio), mes: Number(v.mes) };
    case 'anio':
      return { tipo, anio: Number(v.anio) };
  }
}

/** Fecha de hoy en Ecuador continental (UTC−5, sin horario de verano). */
export function hoyEcuador(ahora: Date = new Date()): Fecha {
  const ec = new Date(ahora.getTime() - 5 * 3600 * 1000);
  return { anio: ec.getUTCFullYear(), mes: ec.getUTCMonth() + 1, dia: ec.getUTCDate() };
}
