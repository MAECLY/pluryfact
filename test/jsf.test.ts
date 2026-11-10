import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cuerpoDescarga, esAdjunto, parseRespuestaParcial } from '../src/lib/jsf';

const doc = document.implementation.createHTMLDocument('sri');
doc.body.innerHTML = readFileSync(resolve(process.cwd(), 'test/fixtures/recibidos-tabla.html'), 'utf8');
const form = doc.getElementById('frmPrincipal') as HTMLFormElement;

describe('cuerpoDescarga', () => {
  const body = cuerpoDescarga(form, 'frmPrincipal:tablaCompRecibidos:1:lnkXml');

  it('incluye el id del enlace, el ViewState y los combos', () => {
    expect(body.get('frmPrincipal:tablaCompRecibidos:1:lnkXml')).toBe('frmPrincipal:tablaCompRecibidos:1:lnkXml');
    expect(body.get('javax.faces.ViewState')).toBe('3333333333333333333:4444444444444444444');
    expect(body.get('frmPrincipal')).toBe('frmPrincipal');
    expect(body.get('frmPrincipal:ano')).toBe('2026');
    expect(body.get('frmPrincipal:mes')).toBe('11');
  });

  it('omite campos deshabilitados y botones, como el navegador', () => {
    expect(body.has('frmPrincipal:txtParametro')).toBe(false);
    expect(body.has('frmPrincipal:btnBuscar')).toBe(false);
  });
});

describe('parseRespuestaParcial', () => {
  it('separa updates y ViewState', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><partial-response><changes>
      <update id="frmPrincipal:panelListaComprobantes"><![CDATA[<div id="x">tabla</div>]]></update>
      <update id="j_id1:javax.faces.ViewState:0"><![CDATA[555:666]]></update>
    </changes></partial-response>`;
    const r = parseRespuestaParcial(xml)!;
    expect(r.updates.get('frmPrincipal:panelListaComprobantes')).toBe('<div id="x">tabla</div>');
    expect(r.viewState).toBe('555:666');
    expect(r.error).toBeNull();
  });

  it('une CDATA partidos y lee errores', () => {
    const xml = '<partial-response><changes><update id="a"><![CDATA[uno]]]]><![CDATA[>dos]]></update></changes>' +
      '<error><error-name>X</error-name><error-message><![CDATA[Fallo]]></error-message></error></partial-response>';
    const r = parseRespuestaParcial(xml)!;
    expect(r.updates.get('a')).toBe('uno]]>dos');
    expect(r.error).toBe('Fallo');
  });

  it('detecta redirección por sesión caducada', () => {
    const r = parseRespuestaParcial('<partial-response><redirect url="/login.jsf"/></partial-response>')!;
    expect(r.redirect).toBe('/login.jsf');
  });

  it('devuelve null si no es un partial-response', () => {
    expect(parseRespuestaParcial('<html><body>hola</body></html>')).toBeNull();
  });
});

it('esAdjunto distingue archivo de página', () => {
  expect(esAdjunto(new Headers({ 'content-disposition': 'attachment; filename="a.xml"' }))).toBe(true);
  expect(esAdjunto(new Headers({ 'content-type': 'application/pdf' }))).toBe(true);
  expect(esAdjunto(new Headers({ 'content-type': 'text/html;charset=UTF-8' }))).toBe(false);
});
