import { expect, it } from 'vitest';
import { AJUSTES_POR_DEFECTO, normalizarAjustes, PLURYPRINT_POR_DEFECTO } from '../src/lib/ajustes';
import { agregar, agrupar, MAX_HISTORIAL, type EntradaHistorial } from '../src/lib/historial';

const e = (id: string, terminado: number) => ({ id, terminado }) as EntradaHistorial;
const ahora = new Date(2026, 10, 10, 15, 0).getTime();
const dia = 86_400_000;

it('agrega al inicio, reemplaza por id y recorta por antigüedad y cantidad', () => {
  let h: EntradaHistorial[] = [];
  h = agregar(h, e('a', ahora - 100 * dia), 90, ahora);
  expect(h).toHaveLength(0);
  h = agregar(h, e('b', ahora), 90, ahora);
  h = agregar(h, e('c', ahora), 90, ahora);
  h = agregar(h, { ...e('b', ahora), zip: 'nuevo' } as EntradaHistorial, 90, ahora);
  expect(h.map((x) => x.id)).toEqual(['b', 'c']);
  for (let i = 0; i < 60; i++) h = agregar(h, e(`x${i}`, ahora), 90, ahora);
  expect(h).toHaveLength(MAX_HISTORIAL);
});

it('agrupa como chrome://downloads', () => {
  const g = agrupar([e('1', ahora), e('2', ahora - dia), e('3', ahora - 3 * dia), e('4', ahora - 30 * dia)], ahora);
  expect(g.map((x) => x.grupo)).toEqual(['Hoy', 'Ayer', 'Esta semana', 'Anteriores']);
});

it('normaliza ajustes inválidos a los valores por defecto', () => {
  expect(normalizarAjustes(undefined)).toEqual(AJUSTES_POR_DEFECTO);
  expect(normalizarAjustes({ ritmo: 'amable', notificaciones: false, diasHistorial: 7 })).toEqual({ ritmo: 'amable', notificaciones: false, diasHistorial: 7, tema: 'pluryfact', pluryprint: PLURYPRINT_POR_DEFECTO });
  expect(normalizarAjustes({ diasHistorial: -5 }).diasHistorial).toBe(90);
});
