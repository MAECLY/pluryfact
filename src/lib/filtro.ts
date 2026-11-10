import type { FilaComprobante } from './extract';
import { dentroDeRango } from './periodo';
import type { Fecha, TipoComprobante } from './types';

export interface Filtro {
  rango?: { desde: Fecha; hasta: Fecha };
  /** RUC (13 dígitos, coincidencia exacta) o parte de la razón social. */
  emisor?: string;
  tipos?: TipoComprobante[];
}

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** RUC (prefijo de 10–13 dígitos) o parte de la razón social. */
export function coincideTexto(ruc: string, razonSocial: string | undefined, consulta: string): boolean {
  const q = consulta.trim();
  if (!q) return true;
  if (/^\d{10,13}$/.test(q)) return ruc.startsWith(q);
  const nombre = razonSocial;
  if (!nombre) return false;
  const n = normalizar(nombre);
  const b = normalizar(q);
  // "andinos sa" debe encontrar "ANDINOS S. A.": se compara también sin espacios.
  return n.includes(b) || n.replace(/ /g, '').includes(b.replace(/ /g, ''));
}

export function coincideEmisor(f: FilaComprobante, consulta: string): boolean {
  // En emitidos no hay columna de emisor: el emisor siempre es el contribuyente.
  return coincideTexto(f.emisor?.ruc ?? f.clave.ruc, f.emisor?.razonSocial, consulta);
}

export function filtrar(filas: FilaComprobante[], filtro: Filtro): FilaComprobante[] {
  return filas.filter(
    (f) =>
      (!filtro.rango || dentroDeRango(f.fechaEmision, filtro.rango)) &&
      (!filtro.emisor || coincideEmisor(f, filtro.emisor)) &&
      (!filtro.tipos?.length || filtro.tipos.includes(f.clave.tipo)),
  );
}

/** Quita duplicados por clave de acceso (una fila puede venir en dos consultas). */
export function unicos(filas: FilaComprobante[]): FilaComprobante[] {
  const vistos = new Set<string>();
  return filas.filter((f) => !vistos.has(f.clave.clave) && vistos.add(f.clave.clave));
}
