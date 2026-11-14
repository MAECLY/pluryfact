import type { ClaveAcceso } from './clave';
import type { Bandeja, Fecha } from './types';

/** Lo mínimo para ubicar un archivo: sirve para filas de la tabla y del reporte. */
export interface Ubicable {
  clave: ClaveAcceso;
  serie: string;
  fechaEmision: Fecha;
}

/** Carpeta: pluryfact/<ruc del contribuyente>/<bandeja>/<aaaa>/<mm>/ */
export function carpeta(rucContribuyente: string, bandeja: Bandeja, f: Ubicable): string {
  const mm = String(f.fechaEmision.mes).padStart(2, '0');
  return `pluryfact/${rucContribuyente}/${bandeja}/${f.fechaEmision.anio}/${mm}`;
}

/** Nombre: <tipo>_<serie>_<ruc emisor>_<clave>.<ext>, solo ASCII seguro. */
export function nombreArchivo(f: Ubicable, ext: 'xml' | 'pdf'): string {
  const serie = f.serie || `${f.clave.establecimiento}-${f.clave.puntoEmision}-${f.clave.secuencial}`;
  return `${f.clave.tipo}_${serie}_${f.clave.ruc}_${f.clave.clave}.${ext}`.replace(/[^\w.-]/g, '_');
}
