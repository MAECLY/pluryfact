/** Códigos de tipo de comprobante usados en la clave de acceso (ficha técnica SRI). */
export const TIPO_CLAVE = {
  '01': 'factura',
  '03': 'liquidacion',
  '04': 'nota-credito',
  '05': 'nota-debito',
  '06': 'guia-remision',
  '07': 'retencion',
} as const;

export type TipoComprobante = (typeof TIPO_CLAVE)[keyof typeof TIPO_CLAVE];

/** Valor del combo `cmbTipoComprobante` en las pantallas de consulta. */
export const TIPO_COMBO: Record<TipoComprobante, string> = {
  factura: '1',
  liquidacion: '2',
  'nota-credito': '3',
  'nota-debito': '4',
  'guia-remision': '5',
  retencion: '6',
};

export const ETIQUETA_TIPO: Record<TipoComprobante, string> = {
  factura: 'Factura',
  liquidacion: 'Liquidación de compra',
  'nota-credito': 'Nota de crédito',
  'nota-debito': 'Nota de débito',
  'guia-remision': 'Guía de remisión',
  retencion: 'Comprobante de retención',
};

export type Bandeja = 'emitidos' | 'recibidos';

/** Fecha de calendario sin hora ni zona: el SRI trabaja en fechas locales de Ecuador. */
export interface Fecha {
  anio: number;
  mes: number; // 1-12
  dia: number; // 1-31
}
