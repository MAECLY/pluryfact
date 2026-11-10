import type { Periodo } from './periodo';
import type { Fecha } from './types';

const iso = (f: Fecha) => `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;

/** Etiqueta corta para nombres de archivo: 2026-11, 2025, 2026-11-06, 2026-01-01_2026-03-31. */
export function etiquetaPeriodo(p: Periodo): string {
  switch (p.tipo) {
    case 'dia':
      return iso(p.fecha);
    case 'rango':
      return `${iso(p.desde)}_${iso(p.hasta)}`;
    case 'mes':
      return `${p.anio}-${String(p.mes).padStart(2, '0')}`;
    case 'anio':
      return String(p.anio);
  }
}
