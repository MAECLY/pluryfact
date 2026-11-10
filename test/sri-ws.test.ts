import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { autorizada, parseRespuestaAutorizacion, resumenRespuesta, sobreSoap, xmlAutorizado } from '../src/lib/sri-ws';

const fx = (n: string) => readFileSync(resolve(process.cwd(), 'test/fixtures', n), 'utf8');

describe('servicio de autorización', () => {
  it('arma el sobre con la clave', () => {
    expect(sobreSoap('123')).toContain('<claveAccesoComprobante>123</claveAccesoComprobante>');
  });

  it('lee una autorización y desescapa el comprobante', () => {
    const r = parseRespuestaAutorizacion(fx('ws-autorizado.xml'))!;
    const a = autorizada(r)!;
    expect(a).toMatchObject({ estado: 'AUTORIZADO', ambiente: 'PRODUCCIÓN', fechaAutorizacion: '2026-11-08T15:10:22-05:00' });
    expect(a.comprobante.startsWith('<?xml version="1.0" encoding="UTF-8"?><factura')).toBe(true);
    // &amp;amp; en la respuesta es un & escapado dentro del XML del comprobante.
    expect(a.comprobante).toContain('S. A. &amp; CIA');
  });

  it('clave inexistente: sin autorizaciones', () => {
    const r = parseRespuestaAutorizacion(fx('ws-no-encontrado.xml'))!;
    expect(r.autorizaciones).toHaveLength(0);
    expect(autorizada(r)).toBeNull();
  });

  it('resume estados y motivos cuando no está autorizado', () => {
    const xml = fx('ws-autorizado.xml')
      .replace('<estado>AUTORIZADO</estado>', '<estado>EN PROCESO</estado>')
      .replace('<mensajes/>', '<mensajes><mensaje><identificador>70</identificador><mensaje>CLAVE DE ACCESO EN PROCESAMIENTO</mensaje></mensaje></mensajes>');
    const r = parseRespuestaAutorizacion(xml)!;
    expect(autorizada(r)).toBeNull();
    expect(resumenRespuesta(r)).toBe('EN PROCESO: 70 CLAVE DE ACCESO EN PROCESAMIENTO');
    expect(resumenRespuesta(parseRespuestaAutorizacion(fx('ws-no-encontrado.xml'))!)).toBe('el SRI no tiene la clave');
  });

  it('rechaza la página de redirección que sale sin SOAPAction', () => {
    expect(parseRespuestaAutorizacion('<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN"><html></html>')).toBeNull();
  });

  it('genera el archivo con el formato del portal', () => {
    const a = autorizada(parseRespuestaAutorizacion(fx('ws-autorizado.xml'))!)!;
    const xml = xmlAutorizado(a);
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8" standalone="yes"\?>\n<autorizacion>\n<estado>AUTORIZADO<\/estado>/);
    expect(xml).toContain('<comprobante><![CDATA[<?xml');
  });
});
