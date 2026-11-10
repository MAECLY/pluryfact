import type { Fecha } from './types';

export type Periodo =
  | { tipo: 'dia'; fecha: Fecha }
  | { tipo: 'rango'; desde: Fecha; hasta: Fecha }
  | { tipo: 'mes'; anio: number; mes: number }
  | { tipo: 'anio'; anio: number };

/** Una consulta de recibidos: año, mes y día (0 = todo el mes). */
export interface ConsultaMes {
  anio: number;
  mes: number;
  dia: number;
}

/** El combo de año de recibidos arranca en 2022. */
export const ANIO_MIN_RECIBIDOS = 2022;

const aDate = (f: Fecha) => new Date(Date.UTC(f.anio, f.mes - 1, f.dia));
const deDate = (d: Date): Fecha => ({ anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() });

export const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
export const compararFechas = (a: Fecha, b: Fecha) => aDate(a).getTime() - aDate(b).getTime();
export const formatoSri = (f: Fecha) =>
  `${String(f.dia).padStart(2, '0')}/${String(f.mes).padStart(2, '0')}/${f.anio}`;

export function esFechaValida(f: Fecha): boolean {
  return (
    Number.isInteger(f.anio) && f.mes >= 1 && f.mes <= 12 && f.dia >= 1 && f.dia <= diasDelMes(f.anio, f.mes)
  );
}

/** Convierte cualquier periodo en un rango cerrado [desde, hasta], recortado a `hoy`. */
export function aRango(p: Periodo, hoy: Fecha): { desde: Fecha; hasta: Fecha } {
  let desde: Fecha;
  let hasta: Fecha;
  switch (p.tipo) {
    case 'dia':
      desde = hasta = p.fecha;
      break;
    case 'rango':
      ({ desde, hasta } = p);
      break;
    case 'mes':
      desde = { anio: p.anio, mes: p.mes, dia: 1 };
      hasta = { anio: p.anio, mes: p.mes, dia: diasDelMes(p.anio, p.mes) };
      break;
    case 'anio':
      desde = { anio: p.anio, mes: 1, dia: 1 };
      hasta = { anio: p.anio, mes: 12, dia: 31 };
      break;
  }
  if (!esFechaValida(desde) || !esFechaValida(hasta)) throw new RangeError('Fecha inválida');
  if (compararFechas(desde, hasta) > 0) throw new RangeError('La fecha inicial es posterior a la final');
  if (compararFechas(desde, hoy) > 0) throw new RangeError('El periodo está en el futuro');
  if (compararFechas(hasta, hoy) > 0) hasta = hoy;
  return { desde, hasta };
}

export function dentroDeRango(f: Fecha, r: { desde: Fecha; hasta: Fecha }): boolean {
  return compararFechas(f, r.desde) >= 0 && compararFechas(f, r.hasta) <= 0;
}

/** Emitidos: la pantalla solo filtra por un día, así que hay una consulta por día. */
export function consultasEmitidos(p: Periodo, hoy: Fecha): Fecha[] {
  const { desde, hasta } = aRango(p, hoy);
  const dias: Fecha[] = [];
  for (let d = aDate(desde); d <= aDate(hasta); d.setUTCDate(d.getUTCDate() + 1)) dias.push(deDate(d));
  return dias;
}

/**
 * Recibidos: una consulta por mes con día 0 (todo el mes), y las filas se
 * filtran luego por fecha de emisión. Cada consulta cuesta un reCAPTCHA, así
 * que se minimiza su número. Un periodo de un solo día usa el filtro de día.
 */
export function consultasRecibidos(p: Periodo, hoy: Fecha): ConsultaMes[] {
  const r = aRango(p, hoy);
  if (r.desde.anio < ANIO_MIN_RECIBIDOS) throw new RangeError(`Recibidos solo existe desde ${ANIO_MIN_RECIBIDOS}`);
  if (compararFechas(r.desde, r.hasta) === 0) return [{ ...r.desde }];
  const out: ConsultaMes[] = [];
  let { anio, mes } = r.desde;
  while (anio < r.hasta.anio || (anio === r.hasta.anio && mes <= r.hasta.mes)) {
    out.push({ anio, mes, dia: 0 });
    mes++;
    if (mes > 12) {
      mes = 1;
      anio++;
    }
  }
  return out;
}
