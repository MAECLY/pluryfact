import { carpeta, nombreArchivo } from '../../src/lib/archivos';
import type { Archivo } from '../../src/lib/cola';
import { construirClave, parseClave, type ClaveAcceso } from '../../src/lib/clave';
import { armarZip } from '../../src/lib/zip';
import type { Bandeja, Fecha } from '../../src/lib/types';

/** Datos 100 % ficticios: RUC 0999999999001 y claves inventadas con dígito verificador correcto. */
export const RUC_FICTICIO = '0999999999001';

export interface Ficticio {
  clave: ClaveAcceso;
  tipoCodigo: string;
  fecha: Fecha;
  rucEmisor: string;
}

export function comprobante(fecha: Fecha, secuencial: number, tipoCodigo = '01', rucEmisor = RUC_FICTICIO): Ficticio {
  const clave = parseClave(
    construirClave({ fecha, tipoCodigo, ruc: rucEmisor, serie: '001001', secuencial: String(secuencial).padStart(9, '0'), codigoNumerico: '12345678' }),
  )!;
  return { clave, tipoCodigo, fecha, rucEmisor };
}

const ETIQUETA_XML: Record<string, string> = { '01': 'factura', '03': 'liquidacionCompra', '04': 'notaCredito', '05': 'notaDebito', '06': 'guiaRemision', '07': 'comprobanteRetencion' };

export const xmlDe = (c: Ficticio) =>
  `<?xml version="1.0" encoding="UTF-8"?><autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>${c.clave.clave}</numeroAutorizacion>` +
  `<fechaAutorizacion>2026-10-16T10:00:00-05:00</fechaAutorizacion><ambiente>PRODUCCIÓN</ambiente><comprobante><![CDATA[<?xml version="1.0" encoding="UTF-8"?>` +
  `<${ETIQUETA_XML[c.tipoCodigo]} id="comprobante" version="1.1.0"><infoTributaria><razonSocial>EMPRESA FICTICIA S.A.</razonSocial><ruc>${c.rucEmisor}</ruc>` +
  `<claveAcceso>${c.clave.clave}</claveAcceso></infoTributaria></${ETIQUETA_XML[c.tipoCodigo]}>]]></comprobante></autorizacion>`;

export const pdfDe = (c: Ficticio) => new TextEncoder().encode(`%PDF-1.4\n% RIDE ficticio ${c.clave.secuencial}\n%%EOF\n`);

export function archivosDe(c: Ficticio, formatos: { xml?: boolean; pdf?: boolean } = { xml: true, pdf: true }, bandeja: Bandeja = 'recibidos'): Archivo[] {
  const f = { clave: c.clave, serie: `001-001-${c.clave.secuencial}`, fechaEmision: c.fecha };
  const base = carpeta(RUC_FICTICIO, bandeja, f);
  const r: Archivo[] = [];
  if (formatos.xml) r.push({ ruta: `${base}/${nombreArchivo(f, 'xml')}`, datos: xmlDe(c) });
  if (formatos.pdf) r.push({ ruta: `${base}/${nombreArchivo(f, 'pdf')}`, datos: pdfDe(c) });
  return r;
}

export const reporteDe = (etiqueta: string, bandeja: Bandeja = 'recibidos'): Archivo => ({
  ruta: `pluryfact/${RUC_FICTICIO}/${bandeja}/reportes/factura_${etiqueta}.txt`,
  datos: new TextEncoder().encode('COMPROBANTE\tSERIE_COMPROBANTE\tRUC_EMISOR\n'),
});

/**
 * Descarga ficticia de recibidos de octubre 2026: 3 facturas (una sin RIDE),
 * 1 retención con RIDE y XML, el reporte y basura que debe ignorarse.
 */
export function descargaFicticia() {
  const f1 = comprobante({ anio: 2026, mes: 10, dia: 20 }, 3);
  const f2 = comprobante({ anio: 2026, mes: 10, dia: 5 }, 1);
  const f3 = comprobante({ anio: 2026, mes: 10, dia: 12 }, 2);
  const r1 = comprobante({ anio: 2026, mes: 10, dia: 5 }, 4, '07', '0999999998001');
  const archivos: Archivo[] = [
    ...archivosDe(f1),
    ...archivosDe(f2),
    ...archivosDe(f3, { xml: true, pdf: false }),
    ...archivosDe(r1),
    reporteDe('2026-10'),
  ];
  return { comprobantes: { f1, f2, f3, r1 }, archivos };
}

export const zipFicticio = () => armarZip(descargaFicticia().archivos);
