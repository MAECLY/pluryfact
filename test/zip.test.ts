import { unzipSync, strFromU8 } from 'fflate';
import { expect, it } from 'vitest';
import { armarZip, nombreZip } from '../src/lib/zip';

it('empaqueta XML y PDF con sus rutas', () => {
  const zip = armarZip([
    { ruta: 'legajo/1/recibidos/2026/11/a.xml', datos: '<a>ñ</a>' },
    { ruta: 'legajo/1/recibidos/2026/11/a.pdf', datos: new Uint8Array([37, 80, 68, 70]) },
  ]);
  const dentro = unzipSync(zip);
  expect(Object.keys(dentro).sort()).toEqual(['legajo/1/recibidos/2026/11/a.pdf', 'legajo/1/recibidos/2026/11/a.xml']);
  expect(strFromU8(dentro['legajo/1/recibidos/2026/11/a.xml']!)).toBe('<a>ñ</a>');
});

it('nombre de ZIP seguro', () => {
  expect(nombreZip('1799999999001', 'recibidos', 'mes 2026-11')).toBe('legajo_1799999999001_recibidos_mes_2026-11.zip');
});
