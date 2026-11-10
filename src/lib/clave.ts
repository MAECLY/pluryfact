import { TIPO_CLAVE, type Fecha, type TipoComprobante } from './types';

/**
 * Clave de acceso de 49 dígitos:
 * fecha(8) tipo(2) ruc(13) ambiente(1) serie(6) secuencial(9)
 * códigoNumérico(8) tipoEmisión(1) dígitoVerificador(1).
 */
export interface ClaveAcceso {
  clave: string;
  fechaEmision: Fecha;
  tipo: TipoComprobante;
  ruc: string;
  ambiente: 'pruebas' | 'produccion';
  establecimiento: string;
  puntoEmision: string;
  secuencial: string;
  codigoNumerico: string;
  tipoEmision: string;
  digitoVerificador: number;
}

/** Dígito verificador módulo 11 con pesos 2..7 desde la derecha. */
export function digitoModulo11(digitos: string): number {
  let suma = 0;
  let peso = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += Number(digitos[i]) * peso;
    peso = peso === 7 ? 2 : peso + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  if (resto === 10) return 1;
  return resto;
}

export function esClaveValida(clave: string): boolean {
  if (!/^\d{49}$/.test(clave)) return false;
  return digitoModulo11(clave.slice(0, 48)) === Number(clave[48]);
}

/** Devuelve null si la clave no tiene 49 dígitos, el tipo es desconocido o el dígito no cuadra. */
export function parseClave(clave: string): ClaveAcceso | null {
  const limpia = clave.trim();
  if (!esClaveValida(limpia)) return null;
  const tipo = TIPO_CLAVE[limpia.slice(8, 10) as keyof typeof TIPO_CLAVE];
  if (!tipo) return null;
  const amb = limpia[23];
  if (amb !== '1' && amb !== '2') return null;
  return {
    clave: limpia,
    fechaEmision: {
      dia: Number(limpia.slice(0, 2)),
      mes: Number(limpia.slice(2, 4)),
      anio: Number(limpia.slice(4, 8)),
    },
    tipo,
    ruc: limpia.slice(10, 23),
    ambiente: amb === '2' ? 'produccion' : 'pruebas',
    establecimiento: limpia.slice(24, 27),
    puntoEmision: limpia.slice(27, 30),
    secuencial: limpia.slice(30, 39),
    codigoNumerico: limpia.slice(39, 47),
    tipoEmision: limpia.slice(47, 48),
    digitoVerificador: Number(limpia[48]),
  };
}

/** Arma una clave válida a partir de sus partes (útil para fixtures y pruebas). */
export function construirClave(p: {
  fecha: Fecha;
  tipoCodigo: string;
  ruc: string;
  ambiente?: '1' | '2';
  serie: string;
  secuencial: string;
  codigoNumerico: string;
  tipoEmision?: string;
}): string {
  const dd = String(p.fecha.dia).padStart(2, '0');
  const mm = String(p.fecha.mes).padStart(2, '0');
  const base =
    `${dd}${mm}${p.fecha.anio}${p.tipoCodigo}${p.ruc}${p.ambiente ?? '2'}` +
    `${p.serie}${p.secuencial}${p.codigoNumerico}${p.tipoEmision ?? '1'}`;
  if (!/^\d{48}$/.test(base)) throw new Error(`Partes inválidas para la clave: ${base}`);
  return base + digitoModulo11(base);
}
