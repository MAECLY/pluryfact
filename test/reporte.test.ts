import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { decodificarReporte, parseReporte } from '../src/lib/reporte';

const bytes = readFileSync(resolve(process.cwd(), 'test/fixtures/reporte-recibidos.txt'));
const r = parseReporte(decodificarReporte(bytes));

it('lee las 12 columnas y descarta claves inválidas', () => {
  expect(r.columnas).toHaveLength(12);
  expect(r.filas).toHaveLength(2);
  expect(r.descartadas).toBe(1);
});

it('decodifica ISO-8859-1 (Ñ, tildes)', () => {
  expect(r.filas[1]!.razonSocialEmisor).toBe('PANADERÍA LA ÑUSTA S.A.');
});

it('convierte montos, fechas y tolera la columna final vacía', () => {
  expect(r.filas[0]).toMatchObject({
    rucEmisor: '0990000001001',
    serie: '214-053-000094432',
    fechaEmision: { dia: 8, mes: 11, anio: 2026 },
    subtotal: 53.5,
    iva: 8.03,
    total: 61.53,
    documentoModificado: '',
  });
  expect(r.filas[0]!.clave.tipo).toBe('factura');
});

it('sin columna CLAVE_ACCESO no inventa filas', () => {
  expect(parseReporte('A\tB\n1\t2\n').filas).toHaveLength(0);
});

it('lee el reporte de emitidos (8 columnas, sin RUC emisor, fecha con hora)', () => {
  const e = parseReporte(decodificarReporte(readFileSync(resolve(process.cwd(), 'test/fixtures/reporte-emitidos.txt'))));
  expect(e.columnas).toHaveLength(8);
  expect(e.filas).toHaveLength(2);
  expect(e.filas[1]).toMatchObject({
    rucEmisor: '1799999999001',
    tipoTexto: 'Factura',
    fechaEmision: { dia: 4, mes: 11, anio: 2026 },
    total: 8333.98,
  });
});
