import { describe, expect, it } from 'vitest';
import { AJUSTES_POR_DEFECTO, normalizarAjustes, normalizarPluryprint, PLURYPRINT_POR_DEFECTO } from '../src/lib/ajustes';
import { accionEfectiva, necesitaConfirmacion, pedidoDesdeAjustes, textoEntregado, UMBRAL_CONFIRMAR } from '../src/lib/envio-pluryprint';

describe('ajustes de Pluryprint', () => {
  it('por defecto: desactivado, abrir Pluryprint para confirmar, RIDE con XML de respaldo, por fecha, sin overrides', () => {
    expect(PLURYPRINT_POR_DEFECTO).toEqual({
      activado: false,
      accion: 'configure',
      contenido: 'ride',
      xmlSiFaltaRide: true,
      incluirReporte: false,
      orden: 'fecha',
      impresoraId: null,
      perfilId: null,
      copias: null,
      duplex: null,
      color: null,
    });
    expect(AJUSTES_POR_DEFECTO.pluryprint).toEqual(PLURYPRINT_POR_DEFECTO);
  });

  it('migra los ajustes de la 0.1.0 (sin sección pluryprint) sin tocar lo demás', () => {
    const v010 = { ritmo: 'amable', notificaciones: false, diasHistorial: 30, tema: 'xmlote' };
    expect(normalizarAjustes(v010)).toEqual({ ...v010, pluryprint: PLURYPRINT_POR_DEFECTO });
  });

  it('migra formas viejas: un booleano suelto y el borrador sin «contenido»', () => {
    expect(normalizarPluryprint(true)).toEqual({ ...PLURYPRINT_POR_DEFECTO, activado: true });
    expect(normalizarPluryprint({ activado: true, accion: 'queue', perfilId: 'builtin-quick', incluirReporte: true })).toEqual({
      ...PLURYPRINT_POR_DEFECTO,
      activado: true,
      accion: 'queue',
      perfilId: 'builtin-quick',
      incluirReporte: true,
    });
  });

  it('valores inválidos vuelven al defecto o a null', () => {
    const n = normalizarPluryprint({
      activado: 'sí',
      accion: 'imprimir-ya',
      contenido: 'pdf',
      xmlSiFaltaRide: 0,
      orden: 'azar',
      impresoraId: '   ',
      perfilId: 42,
      copias: 1000,
      duplex: 'diagonal',
      color: 'sepia',
    });
    expect(n).toEqual({ ...PLURYPRINT_POR_DEFECTO, xmlSiFaltaRide: true });
    expect(normalizarPluryprint({ copias: 0 }).copias).toBeNull();
    expect(normalizarPluryprint({ copias: 2.5 }).copias).toBeNull();
    expect(normalizarPluryprint({ copias: '3' }).copias).toBe(3);
    expect(normalizarPluryprint({ copias: '' }).copias).toBeNull();
    expect(normalizarPluryprint({ xmlSiFaltaRide: false }).xmlSiFaltaRide).toBe(false);
  });

  it('conserva todo lo válido', () => {
    const v = { activado: true, accion: 'print-default', contenido: 'ambos', xmlSiFaltaRide: false, incluirReporte: true, orden: 'emisor', impresoraId: 'office', perfilId: 'p1', copias: 2, duplex: 'short-edge', color: 'mono' } as const;
    expect(normalizarPluryprint(v)).toEqual(v);
    expect(normalizarPluryprint(normalizarPluryprint(v))).toEqual(v);
  });
});

describe('pedido a Pluryprint', () => {
  it('overrides solo con lo que el usuario fijó', () => {
    expect(pedidoDesdeAjustes(PLURYPRINT_POR_DEFECTO, 'x', 'configure')).toEqual({ label: 'x', action: 'configure', profileId: null, printerId: null });
    expect(pedidoDesdeAjustes({ ...PLURYPRINT_POR_DEFECTO, copias: 2, color: 'mono', impresoraId: 'imp' }, 'x', 'queue')).toEqual({
      label: 'x',
      action: 'queue',
      profileId: null,
      printerId: 'imp',
      overrides: { copies: 2, color: 'mono' },
    });
  });

  it(`imprimir directo con más de ${UMBRAL_CONFIRMAR} documentos exige confirmación; si no, abre Pluryprint`, () => {
    expect(accionEfectiva('print-default', UMBRAL_CONFIRMAR, false)).toBe('print-default');
    expect(accionEfectiva('print-default', UMBRAL_CONFIRMAR + 1, false)).toBe('configure');
    expect(accionEfectiva('print-default', UMBRAL_CONFIRMAR + 1, true)).toBe('print-default');
    expect(accionEfectiva('queue', 5000, false)).toBe('queue');
    expect(necesitaConfirmacion({ ...PLURYPRINT_POR_DEFECTO, accion: 'print-default' }, 51)).toBe(true);
    expect(necesitaConfirmacion(PLURYPRINT_POR_DEFECTO, 5000)).toBe(false);
  });

  it('texto final según la acción', () => {
    expect(textoEntregado(1, 'configure')).toBe('Pluryprint recibió 1 archivo. Revísalos y confirma la impresión en Pluryprint.');
    expect(textoEntregado(1200, 'queue')).toBe('Pluryprint recibió 1.200 archivos y los dejó en su cola.');
  });
});
