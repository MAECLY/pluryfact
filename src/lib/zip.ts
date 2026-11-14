import { strToU8, zipSync, type Zippable } from 'fflate';
import type { Archivo } from './cola';

/** ZIP sin compresión para los PDF (ya vienen comprimidos) y nivel 6 para XML/TXT. */
export function armarZip(archivos: Archivo[]): Uint8Array {
  const contenido: Zippable = {};
  for (const a of archivos) {
    const datos = typeof a.datos === 'string' ? strToU8(a.datos) : a.datos;
    contenido[a.ruta] = [datos, { level: a.ruta.endsWith('.pdf') ? 0 : 6 }];
  }
  return zipSync(contenido);
}

export function nombreZip(ruc: string, bandeja: string, etiqueta: string): string {
  return `pluryfact_${ruc}_${bandeja}_${etiqueta}.zip`.replace(/[^\w.-]/g, '_');
}
