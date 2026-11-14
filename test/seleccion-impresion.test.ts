import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  esXmlComprobante,
  etiquetaDeZip,
  leerZip,
  rutaSegura,
  seleccionarParaImprimir,
  textoPlanImpresion,
  textoSeleccion,
  type OpcionesSeleccion,
} from '../src/lib/seleccion-impresion';
import { armarZip } from '../src/lib/zip';
import { archivosDe, comprobante, descargaFicticia, pdfDe, zipFicticio } from './helpers/zip-ficticio';

const base: OpcionesSeleccion = { contenido: 'ride', xmlSiFaltaRide: true, incluirReporte: false, orden: 'fecha' };
const nombres = (o: Partial<OpcionesSeleccion>) => seleccionarParaImprimir(descargaFicticia().archivos, { ...base, ...o }).archivos.map((a) => `${a.kind}:${a.clave?.slice(30, 39) ?? a.nombre}`);

describe('qué se imprime', () => {
  it('RIDE por comprobante y XML de respaldo si falta el RIDE (por defecto)', () => {
    const s = seleccionarParaImprimir(descargaFicticia().archivos, base);
    expect(s).toMatchObject({ ride: 3, xml: 1, reportes: 0, comprobantes: 4, sinArchivo: 0, ignorados: 0 });
    expect(s.archivos.every((a) => !a.nombre.includes('/'))).toBe(true);
  });

  it('sin respaldo, el comprobante sin RIDE queda fuera y se cuenta', () => {
    expect(seleccionarParaImprimir(descargaFicticia().archivos, { ...base, xmlSiFaltaRide: false })).toMatchObject({ ride: 3, xml: 0, sinArchivo: 1 });
  });

  it('solo XML: el XML de cada comprobante', () => {
    expect(seleccionarParaImprimir(descargaFicticia().archivos, { ...base, contenido: 'xml' })).toMatchObject({ ride: 0, xml: 4 });
  });

  it('solo XML sin XML: usa el RIDE en vez de saltarse el comprobante', () => {
    const c = comprobante({ anio: 2026, mes: 1, dia: 1 }, 9);
    expect(seleccionarParaImprimir(archivosDe(c, { pdf: true }), { ...base, contenido: 'xml' })).toMatchObject({ ride: 1, xml: 0, sinArchivo: 0 });
  });

  it('ambos: RIDE y luego XML de cada comprobante, juntos', () => {
    expect(nombres({ contenido: 'ambos', orden: 'portal' })).toEqual([
      'pdf:000000003',
      'xml:000000003',
      'pdf:000000001',
      'xml:000000001',
      'xml:000000002',
      'pdf:000000004',
      'xml:000000004',
    ]);
  });

  it('el reporte TXT va al final solo si se pide', () => {
    const s = seleccionarParaImprimir(descargaFicticia().archivos, { ...base, incluirReporte: true });
    expect(s.reportes).toBe(1);
    expect(s.archivos.at(-1)).toMatchObject({ kind: 'txt', nombre: 'factura_2026-10.txt' });
  });
});

describe('orden estable', () => {
  it('portal: el orden de descarga', () => expect(nombres({ orden: 'portal' })).toEqual(['pdf:000000003', 'pdf:000000001', 'xml:000000002', 'pdf:000000004']));
  it('fecha: por emisión, luego emisor y tipo', () => expect(nombres({ orden: 'fecha' })).toEqual(['pdf:000000004', 'pdf:000000001', 'xml:000000002', 'pdf:000000003']));
  it('emisor: por RUC del emisor y luego fecha', () => expect(nombres({ orden: 'emisor' })).toEqual(['pdf:000000004', 'pdf:000000001', 'xml:000000002', 'pdf:000000003']));
  it('tipo: facturas antes que retenciones', () => expect(nombres({ orden: 'tipo' })).toEqual(['pdf:000000001', 'xml:000000002', 'pdf:000000003', 'pdf:000000004']));
  it('a igualdad de todo, conserva el orden original', () => {
    const a = comprobante({ anio: 2026, mes: 3, dia: 3 }, 7);
    const s = seleccionarParaImprimir([...archivosDe(a, { pdf: true }), ...archivosDe(a, { pdf: true })], base);
    expect(s.ride).toBe(1);
  });
});

describe('rutas hostiles y contenido inválido', () => {
  const c = comprobante({ anio: 2026, mes: 10, dia: 1 }, 5);
  const [pdf] = archivosDe(c, { pdf: true });
  const nombre = pdf!.ruta.split('/').pop()!;

  it.each([
    `../${nombre}`,
    `pluryfact/../../${nombre}`,
    `/etc/${nombre}`,
    `C:/x/${nombre}`,
    `pluryfact\\x\\${nombre}`,
    `pluryfact//${nombre}`,
    `pluryfact/./${nombre}`,
    `pluryfact/\u0007/${nombre}`,
  ])('ignora %s', (ruta) => {
    expect(rutaSegura(ruta)).toBe(false);
    expect(seleccionarParaImprimir([{ ruta, datos: pdf!.datos }], base)).toMatchObject({ archivos: [], ignorados: 1 });
  });

  it('ignora nombres ajenos, claves inválidas, RUC que no cuadra con la clave y PDF sin %PDF-', () => {
    const malos = [
      { ruta: 'pluryfact/x/virus.pdf', datos: pdfDe(c) },
      { ruta: `pluryfact/x/${nombre.replace(/\d(?=\.pdf$)/, (d) => String((Number(d) + 1) % 10))}`, datos: pdfDe(c) },
      { ruta: `pluryfact/x/${nombre.replace('0999999999001', '0999999999002')}`, datos: pdfDe(c) },
      { ruta: `pluryfact/x/${nombre}`, datos: new TextEncoder().encode('<html>no soy un pdf</html>') },
      { ruta: `pluryfact/x/${nombre.replace('.pdf', '.xml')}`, datos: 'no es xml' },
      { ruta: 'pluryfact/x/reportes/vacio.txt', datos: new Uint8Array() },
    ];
    expect(seleccionarParaImprimir(malos, base)).toMatchObject({ archivos: [], ignorados: 6 });
  });

  it('un PDF dañado no impide imprimir el XML de respaldo', () => {
    const [xml] = archivosDe(c, { xml: true });
    const s = seleccionarParaImprimir([xml!, { ruta: pdf!.ruta, datos: new Uint8Array([1, 2, 3]) }], base);
    expect(s).toMatchObject({ ride: 0, xml: 1, ignorados: 1 });
  });

  it('reconoce los XML de comprobante', () => {
    expect(esXmlComprobante(new TextEncoder().encode('\uFEFF  <?xml version="1.0"?><autorizacion>'))).toBe(true);
    expect(esXmlComprobante(new TextEncoder().encode('<factura id="comprobante">'))).toBe(true);
    expect(esXmlComprobante(new TextEncoder().encode('<html><body>factura</body></html>'))).toBe(false);
  });
});

describe('ZIP elegido por el usuario', () => {
  it('lee un ZIP de Pluryfact y conserva el orden de las entradas', () => {
    const { entradas, ignorados } = leerZip(zipFicticio());
    expect(ignorados).toBe(0);
    expect(entradas).toHaveLength(8);
    expect(seleccionarParaImprimir(entradas, { ...base, incluirReporte: true })).toMatchObject({ ride: 3, xml: 1, reportes: 1 });
  });

  it('no descomprime rutas hostiles ni extensiones ajenas', () => {
    const zip = zipSync({ '../fuera.pdf': strToU8('%PDF-1.4'), 'a/b.exe': strToU8('MZ'), 'pluryfact/': new Uint8Array(), 'ok/reportes/r.txt': strToU8('x') });
    const { entradas, ignorados } = leerZip(zip);
    expect(entradas.map((e) => e.ruta)).toEqual(['ok/reportes/r.txt']);
    expect(ignorados).toBe(2);
  });

  it('un ZIP armado por Pluryfact vuelve igual (ida y vuelta)', () => {
    const { archivos } = descargaFicticia();
    const { entradas } = leerZip(armarZip(archivos));
    expect(entradas.map((e) => e.ruta)).toEqual(archivos.map((a) => a.ruta));
  });

  it('etiqueta sin el RUC', () => {
    expect(etiquetaDeZip('pluryfact_0999999999001_recibidos_2026-10.zip')).toBe('Recibidos · 2026-10');
    expect(etiquetaDeZip('pluryfact_0999999999001_emitidos_2026-01-01_2026-03-31_reanudado (1).zip')).toBe('Emitidos · 2026-01-01 a 2026-03-31 (reanudada)');
    expect(etiquetaDeZip('/x/otro.zip')).toBe('Pluryfact · otro');
  });
});

describe('textos', () => {
  it('resumen antes de confirmar', () => {
    const s = seleccionarParaImprimir(descargaFicticia().archivos, { ...base, incluirReporte: true, xmlSiFaltaRide: false });
    expect(textoSeleccion(s)).toEqual({ principal: 'Se imprimirán 3 RIDE + el reporte.', avisos: ['1 comprobante no tiene el archivo pedido y no se imprimirá.'] });
    expect(textoSeleccion(seleccionarParaImprimir([], base)).principal).toBe('No hay nada que imprimir con estos ajustes.');
    expect(textoSeleccion(seleccionarParaImprimir(descargaFicticia().archivos, base)).principal).toBe('Se imprimirán 3 RIDE + 1 XML.');
  });

  it('plan en Nueva descarga', () => {
    expect(textoPlanImpresion({ ...base, accion: 'configure' })).toBe(
      'Al terminar se enviará a Pluryprint el RIDE de cada comprobante (o su XML si no tiene RIDE). Pluryprint se abrirá para que revises y confirmes.',
    );
    expect(textoPlanImpresion({ ...base, contenido: 'xml', incluirReporte: true, accion: 'queue' })).toContain('el XML de cada comprobante, como representación impresa, más el reporte. Quedarán en la cola');
  });
});
