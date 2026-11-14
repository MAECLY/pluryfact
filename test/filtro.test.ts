import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { carpeta, nombreArchivo } from '../src/lib/archivos';
import { parseTabla } from '../src/lib/extract';
import { filtrar, normalizar, unicos } from '../src/lib/filtro';

const doc = document.implementation.createHTMLDocument('sri');
doc.body.innerHTML = readFileSync(resolve(process.cwd(), 'test/fixtures/recibidos-tabla.html'), 'utf8');
const filas = parseTabla(doc, 'recibidos').filas;

describe('filtro por emisor', () => {
  it('RUC exacto o prefijo', () => {
    expect(filtrar(filas, { emisor: '0990000002001' })).toHaveLength(2);
    expect(filtrar(filas, { emisor: '0990000001' })).toHaveLength(1);
  });

  it('razón social sin tildes, mayúsculas ni puntos', () => {
    expect(filtrar(filas, { emisor: 'supermercados andinos sa' })).toHaveLength(2);
    expect(filtrar(filas, { emisor: 'Supermercados Andinos' })).toHaveLength(2);
    expect(filtrar(filas, { emisor: 'distribuidora del litoral' })).toHaveLength(1);
    expect(normalizar('Liquidación  Ñandú S.A.')).toBe('liquidacion nandu s a');
  });

  it('combina rango y tipo', () => {
    const rango = { desde: { anio: 2026, mes: 11, dia: 9 }, hasta: { anio: 2026, mes: 11, dia: 30 } };
    expect(filtrar(filas, { rango })).toHaveLength(0);
    expect(filtrar(filas, { tipos: ['retencion'] })).toHaveLength(0);
    expect(filtrar(filas, { tipos: ['factura'] })).toHaveLength(3);
  });
});

it('unicos quita claves repetidas', () => {
  expect(unicos([...filas, ...filas])).toHaveLength(3);
});

it('arma carpeta y nombre de archivo', () => {
  const f = filas[1]!;
  expect(carpeta('1799999999001', 'recibidos', f)).toBe('pluryfact/1799999999001/recibidos/2026/11');
  expect(nombreArchivo(f, 'xml')).toBe(
    'factura_133-007-000223738_0990000002001_0811202601099000000200121330070002237380000000017.xml',
  );
});
