import { beforeEach, describe, expect, it } from 'vitest';
import { PLURYPRINT_POR_DEFECTO } from '../src/lib/ajustes';
import { montarFormulario, type Formulario } from '../src/ui/formulario';

// happy-dom no trae el constructor global Option que usa el formulario.
if (typeof (globalThis as { Option?: unknown }).Option !== 'function')
  (globalThis as { Option?: unknown }).Option = function (texto: string, valor: string, _porDefecto?: boolean, elegida?: boolean) {
    const o = document.createElement('option');
    o.textContent = texto;
    o.value = valor;
    o.selected = !!elegida;
    return o;
  };

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;
let f: Formulario;

beforeEach(() => {
  document.body.innerHTML = '<div id="raiz"></div>';
  f = montarFormulario(document.getElementById('raiz')!, () => {});
});

describe('«Enviar a Pluryprint al terminar» en Nueva descarga', () => {
  it('solo aparece con Pluryprint conectado', () => {
    const casilla = document.querySelector<HTMLElement>('[data-ref="pluryprint"]')!;
    expect(casilla.hidden).toBe(true);
    f.ponerPluryprint({ ...PLURYPRINT_POR_DEFECTO, activado: false });
    expect(casilla.hidden).toBe(true);
    f.ponerPluryprint({ ...PLURYPRINT_POR_DEFECTO, activado: true });
    expect(casilla.hidden).toBe(false);
    expect(f.imprimir()).toBe(false);
  });

  it('con RIDE: fuerza «RIDE en PDF» y al desmarcar devuelve lo que había', () => {
    f.ponerPluryprint({ ...PLURYPRINT_POR_DEFECTO, activado: true });
    $('f-pdf').checked = false;
    $('f-pluryprint').checked = true;
    $('f-pluryprint').dispatchEvent(new Event('change'));
    expect($('f-pdf')).toMatchObject({ checked: true, disabled: true });
    expect($('f-xml').disabled).toBe(false);
    expect(f.leerTrabajo()).toMatchObject({ imprimir: true, formatos: { pdf: true } });
    $('f-pluryprint').checked = false;
    $('f-pluryprint').dispatchEvent(new Event('change'));
    expect($('f-pdf')).toMatchObject({ checked: false, disabled: false });
    expect(f.leerTrabajo()).not.toHaveProperty('imprimir');
  });

  it('solo XML no fuerza el RIDE (descarga más rápida) pero sí el XML; el reporte si se pide', () => {
    f.ponerPluryprint({ ...PLURYPRINT_POR_DEFECTO, activado: true, contenido: 'xml', incluirReporte: true });
    $('f-pdf').checked = false;
    $('f-pluryprint').checked = true;
    $('f-pluryprint').dispatchEvent(new Event('change'));
    expect($('f-pdf')).toMatchObject({ checked: false, disabled: false });
    expect($('f-xml')).toMatchObject({ checked: true, disabled: true });
    expect($('f-txt')).toMatchObject({ checked: true, disabled: true });
  });

  it('desconectar Pluryprint desmarca la casilla y libera los formatos', () => {
    f.ponerPluryprint({ ...PLURYPRINT_POR_DEFECTO, activado: true, contenido: 'ambos' });
    $('f-pluryprint').checked = true;
    $('f-pluryprint').dispatchEvent(new Event('change'));
    f.ponerPluryprint(null);
    expect(f.imprimir()).toBe(false);
    expect($('f-pdf').disabled || $('f-xml').disabled).toBe(false);
  });

  it('«Repetir con los mismos filtros» recupera la casilla', () => {
    f.ponerPluryprint({ ...PLURYPRINT_POR_DEFECTO, activado: true });
    f.cargar({ bandeja: 'recibidos', periodo: { tipo: 'mes', anio: 2026, mes: 10 }, tipos: ['factura'], emisor: '', formatos: { xml: true, pdf: false, txt: false }, imprimir: true });
    expect(f.imprimir()).toBe(true);
    expect($('f-pdf')).toMatchObject({ checked: true, disabled: true });
  });
});
