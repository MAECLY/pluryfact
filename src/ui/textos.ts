import type { Paso, Trabajo } from '@/lib/cola';
import { formatoSri } from '@/lib/periodo';
import type { TipoComprobante } from '@/lib/types';

/** Vocabulario compartido por el popup y la página. */
export const PLURAL: Record<TipoComprobante, string> = {
  factura: 'Facturas',
  liquidacion: 'Liquidaciones de compra',
  'nota-credito': 'Notas de crédito',
  'nota-debito': 'Notas de débito',
  'guia-remision': 'Guías de remisión',
  retencion: 'Retenciones',
};
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const miles = (n: number) => n.toLocaleString('es-EC');
export const capital = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

export function tituloTrabajo(t: Trabajo | undefined): string {
  if (!t) return 'Descarga';
  const recibidos = t.bandeja === 'recibidos';
  const que = t.tipos.length === 1 ? `${PLURAL[t.tipos[0]!]} ${recibidos ? 'recibidas' : 'emitidas'}` : `Comprobantes ${recibidos ? 'recibidos' : 'emitidos'}`;
  const p = t.periodo;
  const cuando =
    p.tipo === 'mes'
      ? `de ${MESES[p.mes - 1]} ${p.anio}`
      : p.tipo === 'anio'
        ? `de ${p.anio}`
        : p.tipo === 'dia'
          ? `del ${formatoSri(p.fecha)}`
          : `del ${formatoSri(p.desde)} al ${formatoSri(p.hasta)}`;
  return `${que} ${cuando}${t.soloIndices?.length ? ' (reanudada)' : ''}`;
}

/** Etiqueta corta de una ficha: "mar" para meses, "14" para días. */
export function rotulo(paso: Paso): string {
  const mes = MESES.findIndex((m) => paso.etiqueta.startsWith(m));
  if (mes >= 0) return MES_CORTO[mes]!;
  return /^(\d{2})\//.exec(paso.etiqueta)?.[1]?.replace(/^0/, '') ?? /^(\d+) de/.exec(paso.etiqueta)?.[1] ?? '';
}

export function descripcionPaso(x: Paso): string {
  const estado =
    x.estado === 'ok'
      ? `${miles(x.comprobantes)} comprobantes${x.fallidos ? `, ${x.fallidos} archivos sin bajar` : ''}`
      : x.estado === 'sin-datos'
        ? 'sin comprobantes'
        : x.estado === 'fallida'
          ? 'no se pudo consultar'
          : x.estado === 'pendiente'
            ? 'pendiente'
            : 'en curso';
  return `${capital(x.etiqueta)}: ${estado}`;
}

export function duracion(ms: number): string {
  if (ms < 60_000) return 'menos de un minuto';
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} ${min === 1 ? 'minuto' : 'minutos'}` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

export const hora = (t: number) => new Date(t).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
