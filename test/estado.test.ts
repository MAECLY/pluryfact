import { expect, it } from 'vitest';
import { construirPeriodo, deIso, hoyEcuador } from '../src/entrypoints/popup/estado';

it('hoyEcuador usa UTC−5', () => {
  expect(hoyEcuador(new Date('2026-11-10T03:00:00Z'))).toEqual({ anio: 2026, mes: 11, dia: 9 });
  expect(hoyEcuador(new Date('2026-11-10T06:00:00Z'))).toEqual({ anio: 2026, mes: 11, dia: 10 });
});

it('construirPeriodo lee los campos del popup', () => {
  expect(construirPeriodo('mes', { anio: '2026', mes: '3' })).toEqual({ tipo: 'mes', anio: 2026, mes: 3 });
  expect(construirPeriodo('rango', { desde: '2026-01-01', hasta: '2026-01-31' })).toMatchObject({ tipo: 'rango' });
  expect(() => deIso('31/01/2026')).toThrow(/inválida/);
});
