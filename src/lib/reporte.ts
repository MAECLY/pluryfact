import { parseClave, type ClaveAcceso } from './clave';
import { parseFecha, parseMonto } from './extract';
import type { Fecha } from './types';

/**
 * Reporte TXT del listado ("Descargar reporte", enlace frmPrincipal:lnkTxtlistado).
 * Verificado en vivo el 2026-11-09: ISO-8859-1, separado por tabuladores,
 * saltos LF, una fila por comprobante de TODO el listado (no solo la página
 * visible). Recibidos trae 12 columnas; emitidos trae 8 (COMPROBANTE,
 * SERIE_COMPROBANTE, CLAVE_ACCESO, FECHA_AUTORIZACION, FECHA_EMISION con hora,
 * VALOR_SIN_IMPUESTOS, IVA, IMPORTE_TOTAL) y sin RUC de emisor: se toma de la clave.
 */
export interface FilaReporte {
  rucEmisor: string;
  razonSocialEmisor: string;
  tipoTexto: string;
  serie: string;
  clave: ClaveAcceso;
  fechaAutorizacion: string;
  fechaEmision: Fecha;
  identificacionReceptor: string;
  subtotal: number;
  iva: number;
  total: number;
  documentoModificado: string;
}

export interface Reporte {
  filas: FilaReporte[];
  descartadas: number;
  columnas: string[];
}

export const decodificarReporte = (bytes: ArrayBuffer | Uint8Array) => new TextDecoder('iso-8859-1').decode(bytes);

export function parseReporte(texto: string): Reporte {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const columnas = (lineas.shift() ?? '').split('\t').map((c) => c.trim()).filter(Boolean);
  const idx = (...nombres: string[]) => columnas.findIndex((c) => nombres.includes(c));
  const c = {
    ruc: idx('RUC_EMISOR'),
    razon: idx('RAZON_SOCIAL_EMISOR'),
    tipo: idx('TIPO_COMPROBANTE', 'COMPROBANTE'),
    serie: idx('SERIE_COMPROBANTE'),
    clave: idx('CLAVE_ACCESO'),
    aut: idx('FECHA_AUTORIZACION'),
    emi: idx('FECHA_EMISION'),
    rec: idx('IDENTIFICACION_RECEPTOR'),
    sub: idx('VALOR_SIN_IMPUESTOS'),
    iva: idx('IVA'),
    total: idx('IMPORTE_TOTAL'),
    mod: idx('NUMERO_DOCUMENTO_MODIFICADO'),
  };
  if (c.clave < 0) return { filas: [], descartadas: lineas.length, columnas };

  const filas: FilaReporte[] = [];
  let descartadas = 0;
  for (const linea of lineas) {
    const v = linea.split('\t').map((x) => x.trim());
    const at = (i: number) => (i >= 0 ? (v[i] ?? '') : '');
    const clave = parseClave(at(c.clave));
    const fechaEmision = parseFecha(at(c.emi)) ?? clave?.fechaEmision ?? null;
    if (!clave || !fechaEmision) {
      descartadas++;
      continue;
    }
    filas.push({
      rucEmisor: at(c.ruc) || clave.ruc,
      razonSocialEmisor: at(c.razon),
      tipoTexto: at(c.tipo),
      serie: at(c.serie),
      clave,
      fechaAutorizacion: at(c.aut),
      fechaEmision,
      identificacionReceptor: at(c.rec),
      subtotal: parseMonto(at(c.sub)),
      iva: parseMonto(at(c.iva)),
      total: parseMonto(at(c.total)),
      documentoModificado: at(c.mod),
    });
  }
  return { filas, descartadas, columnas };
}
