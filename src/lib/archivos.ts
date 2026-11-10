import type { FilaComprobante } from './extract';
import type { Bandeja } from './types';

/** Carpeta: legajo/<ruc del contribuyente>/<bandeja>/<aaaa>/<mm>/ */
export function carpeta(rucContribuyente: string, bandeja: Bandeja, f: FilaComprobante): string {
  const mm = String(f.fechaEmision.mes).padStart(2, '0');
  return `legajo/${rucContribuyente}/${bandeja}/${f.fechaEmision.anio}/${mm}`;
}

/** Nombre: <tipo>_<serie>_<ruc emisor>_<clave>.<ext>, solo ASCII seguro. */
export function nombreArchivo(f: FilaComprobante, ext: 'xml' | 'pdf'): string {
  const serie = f.serie || `${f.clave.establecimiento}-${f.clave.puntoEmision}-${f.clave.secuencial}`;
  return `${f.clave.tipo}_${serie}_${f.clave.ruc}_${f.clave.clave}.${ext}`.replace(/[^\w.-]/g, '_');
}
