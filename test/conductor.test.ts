import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bandejaDePagina, botonLibre, consultar, siguientePagina } from '../src/lib/conductor';

const fx = (n: string) => readFileSync(resolve(process.cwd(), 'test/fixtures', n), 'utf8');

/** Ventana falsa con un jQuery mínimo: al pulsar el botón, `alPulsar` simula la respuesta del portal. */
type H = (ev: unknown, xhr: unknown, o?: { data?: string }) => void;
const LISTADO = { data: 'javax.faces.partial.render=frmPrincipal%3ApanelListaComprobantes+frmPrincipal%3AtablaCompRecibidos' };
const BOTON_SOLO = { data: 'javax.faces.source=frmPrincipal%3AbtnBuscar' };

let anterior: AbortController | null = null;

function ventana(html: string, alPulsar: (doc: Document) => void, respuestas: Array<{ data: string }> = [LISTADO]) {
  document.body.innerHTML = html + '<div id="formMessages:messages"></div>';
  const handlers = new Set<H>();
  const jq = () => ({ on: (_: string, h: H) => handlers.add(h), off: (_: string, h: H) => handlers.delete(h) });
  (window as unknown as { jQuery: unknown }).jQuery = jq;
  anterior?.abort();
  anterior = new AbortController();
  document.addEventListener(
    'click',
    () => {
      // Como el portal: primero respuestas que no actualizan el listado y luego la real.
      for (const [i, o] of respuestas.entries()) {
        if (i === respuestas.length - 1) alPulsar(document);
        [...handlers].forEach((h) => h({}, {}, o));
      }
    },
    { capture: true, signal: anterior.signal },
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

  it('recibidos: ignora la petición inmediata del botón y espera la del listado', async () => {
    let tablaAlLeer = 0;
    const w = ventana(
      conBoton(fx('recibidos-tabla.html').replace(/<tr data-ri[\s\S]*?<\/tr>/g, ''), 'frmPrincipal:btnBuscar'),
      (doc) => {
        // La consulta real llena la tabla.
        doc.getElementById('frmPrincipal:tablaCompRecibidos_data')!.innerHTML = '<tr data-ri="0"><td>1</td></tr>';
        tablaAlLeer = 1;
      },
      [BOTON_SOLO, LISTADO],
    );
    const r = await consultar(w, { bandeja: 'recibidos', tipoCombo: '1', anio: 2026, mes: 11, dia: 0 }, () => {});
    expect(tablaAlLeer).toBe(1);
    expect(r.estado).toBe('ok');
  });

  it('si el ajaxComplete no trae el listado, termina cuando cambia el panel', async () => {
    const w = ventana(
      conBoton(fx('recibidos-tabla.html').replace(/<tr data-ri[\s\S]*?<\/tr>/g, ''), 'frmPrincipal:btnBuscar'),
      (doc) => {
        setTimeout(() => {
          doc.getElementById('frmPrincipal:tablaCompRecibidos_data')!.innerHTML = '<tr data-ri="0"><td>1</td></tr>';
        }, 50);
      },
      [BOTON_SOLO],
    );
    const r = await consultar(w, { bandeja: 'recibidos', tipoCombo: '1', anio: 2026, mes: 11, dia: 0 }, () => {});
    expect(r.estado).toBe('ok');
  });

  it('recibidos: termina cuando el portal vuelve a habilitar Consultar', async () => {
    const w = ventana(
      conBoton(fx('recibidos-tabla.html').replace(/<tr data-ri[\s\S]*?<\/tr>/g, ''), 'frmPrincipal:btnBuscar'),
      (doc) => {
        const b = doc.getElementById('frmPrincipal:btnBuscar') as HTMLButtonElement;
        b.disabled = true; // deshabilitarBoton(this)
        // Respuesta inmediata del botón: repinta el panel vacío (no debe contar).
        doc.getElementById('frmPrincipal:tablaCompRecibidos_data')!.innerHTML = '';
        setTimeout(() => {
          doc.getElementById('frmPrincipal:tablaCompRecibidos_data')!.innerHTML = '<tr data-ri="0"><td>1</td></tr>';
          b.disabled = false; // reactivarBoton en el onsuccess de rcBuscar
        }, 600);
      },
      [BOTON_SOLO],
    );
    const t0 = Date.now();
    const r = await consultar(w, { bandeja: 'recibidos', tipoCombo: '1', anio: 2026, mes: 11, dia: 0 }, () => {});
    expect(r.estado).toBe('ok');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
  });

  it('sin filas ni mensaje del portal es un error con diagnóstico', async () => {
    const w = ventana(conBoton(fx('emitidos-tabla.html').replace(/<tr data-ri[\s\S]*?<\/tr>/g, ''), 'frmPrincipal:btnConsultar'), () => {});
    const r = await consultar(w, { bandeja: 'emitidos', tipoCombo: '1', fecha: '06/11/2026' }, () => {});
    expect(r.estado).toBe('error');
    expect(r.mensaje).toMatch(/Sin filas ni mensaje/);
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

  it('libera un Consultar que quedó bloqueado usando la función del portal', async () => {
    document.body.innerHTML = '<button id="frmPrincipal:btnBuscar" disabled class="ui-state-disabled">Consultar</button>';
    const btn = document.getElementById('frmPrincipal:btnBuscar') as HTMLButtonElement;
    let llamado = '';
    (window as unknown as { reactivarBoton: (id: string) => void }).reactivarBoton = (id) => {
      llamado = id;
      btn.disabled = false;
    };
    expect(await botonLibre(window, btn, 300)).toBe(true);
    expect(llamado).toBe('frmPrincipal:btnBuscar');
    delete (window as unknown as { reactivarBoton?: unknown }).reactivarBoton;
  });

  it('espera a que el botón se libere solo antes de forzarlo', async () => {
    document.body.innerHTML = '<button id="b" disabled>Consultar</button>';
    const btn = document.getElementById('b') as HTMLButtonElement;
    setTimeout(() => (btn.disabled = false), 100);
    expect(await botonLibre(window, btn, 2000)).toBe(true);
  });

  it('sin control "siguiente" habilitado no hay más páginas', async () => {
    const w = ventana(fx('recibidos-tabla.html'), () => {});
    expect(await siguientePagina(w, 'recibidos')).toEqual({ hay: false });
  });
});
