import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bandejaDePagina, consultar, siguientePagina } from '../src/lib/conductor';

const fx = (n: string) => readFileSync(resolve(process.cwd(), 'test/fixtures', n), 'utf8');

/** Ventana falsa con un jQuery mínimo: al pulsar el botón, `alPulsar` simula la respuesta del portal. */
function ventana(html: string, alPulsar: (doc: Document) => void) {
  document.body.innerHTML = html + '<div id="formMessages:messages"></div>';
  const handlers = new Set<() => void>();
  const jq = () => ({ on: (_: string, h: () => void) => handlers.add(h), off: (_: string, h: () => void) => handlers.delete(h) });
  (window as unknown as { jQuery: unknown }).jQuery = jq;
  document.addEventListener(
    'click',
    () => {
      alPulsar(document);
      handlers.forEach((h) => h());
    },
    { capture: true },
  );
  return window;
}

const conBoton = (html: string, id: string) => html + `<button id="${id}" type="button">Consultar</button>`;

describe('conductor', () => {
  it('detecta la pantalla abierta', () => {
    document.body.innerHTML = fx('recibidos-tabla.html');
    expect(bandejaDePagina(document)).toBe('recibidos');
    document.body.innerHTML = fx('emitidos-tabla.html');
    expect(bandejaDePagina(document)).toBe('emitidos');
  });

  it('rechaza consultar recibidos desde emitidos', async () => {
    const w = ventana(fx('emitidos-tabla.html'), () => {});
    const r = await consultar(w, { bandeja: 'recibidos', tipoCombo: '1', anio: 2026, mes: 11, dia: 0 }, () => {});
    expect(r).toMatchObject({ estado: 'error', mensaje: expect.stringContaining('recibidos') });
  });

  it('emitidos: pone la fecha, pulsa Consultar y lee la tabla', async () => {
    let fechaAlPulsar = '';
    const w = ventana(conBoton(fx('emitidos-tabla.html'), 'frmPrincipal:btnConsultar'), (doc) => {
      fechaAlPulsar = (doc.getElementById('frmPrincipal:calendarFechaDesde_input') as HTMLInputElement).value;
    });
    const r = await consultar(w, { bandeja: 'emitidos', tipoCombo: '1', fecha: '06/11/2026' }, () => {});
    expect(fechaAlPulsar).toBe('06/11/2026');
    expect(r.estado).toBe('ok');
  });

  it('día sin datos según el mensaje del portal', async () => {
    const w = ventana(conBoton(fx('emitidos-tabla.html'), 'frmPrincipal:btnConsultar'), (doc) => {
      doc.getElementById('frmPrincipal:tablaCompEmitidos_data')!.innerHTML = '';
      doc.getElementById('formMessages:messages')!.textContent = 'No existen datos para los parámetros  ingresados';
    });
    const r = await consultar(w, { bandeja: 'emitidos', tipoCombo: '1', fecha: '02/11/2026' }, () => {});
    expect(r.estado).toBe('sin-datos');
  });

  it('rechaza un año que el combo no ofrece', async () => {
    const w = ventana(conBoton(fx('recibidos-tabla.html'), 'frmPrincipal:btnBuscar'), () => {});
    const r = await consultar(w, { bandeja: 'recibidos', tipoCombo: '1', anio: 2019, mes: 1, dia: 0 }, () => {});
    expect(r.estado).toBe('rechazada');
  });

  it('sin control "siguiente" habilitado no hay más páginas', async () => {
    const w = ventana(fx('recibidos-tabla.html'), () => {});
    expect(await siguientePagina(w, 'recibidos')).toEqual({ hay: false });
  });
});
