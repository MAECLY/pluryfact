import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leerViewState, parseEmisor, parseTabla, parseTipoSerie } from '../src/lib/extract';

const cargar = (nombre: string) => {
  const doc = document.implementation.createHTMLDocument('sri');
  doc.body.innerHTML = readFileSync(resolve(process.cwd(), 'test/fixtures', nombre), 'utf8');
  return doc;
};

describe('tabla de emitidos', () => {
  const r = parseTabla(cargar('emitidos-tabla.html'), 'emitidos');

  it('lee las dos filas sin descartar ninguna', () => {
    expect(r.filas).toHaveLength(2);
    expect(r.descartadas).toBe(0);
    expect(r).toMatchObject({ paginaActual: 1, totalPaginas: 1 });
  });

  it('extrae montos, fechas, serie y enlaces', () => {
    expect(r.filas[1]).toMatchObject({
      indice: 1,
      tipoTexto: 'Factura',
      serie: '001-001-000001801',
      autorizadoEn: '04/11/2026 14:34:20',
      fechaEmision: { dia: 4, mes: 11, anio: 2026 },
      subtotal: 7246.94,
      iva: 1087.04,
      total: 8333.98,
      emisor: null,
      enlaces: { xml: null, pdf: 'frmPrincipal:tablaCompEmitidos:1:lnkPdf' },
    });
    expect(r.filas[1]!.clave.secuencial).toBe('000001801');
  });
});

describe('tabla de recibidos', () => {
  const r = parseTabla(cargar('recibidos-tabla.html'), 'recibidos');

  it('lee emisor, XML y RIDE por fila', () => {
    expect(r.filas).toHaveLength(3);
    expect(r.filas[0]).toMatchObject({
      emisor: { ruc: '0990000001001', razonSocial: 'DISTRIBUIDORA DEL LITORAL S.A.' },
      total: 61.53,
      enlaces: {
        xml: 'frmPrincipal:tablaCompRecibidos:0:lnkXml',
        pdf: 'frmPrincipal:tablaCompRecibidos:0:lnkPdf',
      },
    });
    expect(r.filas[2]!.emisor?.razonSocial).toBe('SUPERMERCADOS ANDINOS S. A.');
  });

  it('la clave coincide con el RUC del emisor', () => {
    for (const f of r.filas) expect(f.clave.ruc).toBe(f.emisor?.ruc);
  });
});

describe('piezas sueltas', () => {
  it('separa tipo y serie aunque haya varios espacios', () => {
    expect(parseTipoSerie('Notas de Crédito   002-010-000000077')).toEqual({
      tipo: 'Notas de Crédito',
      serie: '002-010-000000077',
    });
  });

  it('devuelve null si la celda de emisor no trae RUC', () => {
    const td = document.createElement('td');
    td.innerHTML = '<div>SIN RUC</div>';
    expect(parseEmisor(td)).toBeNull();
  });

  it('descarta filas con clave inválida', () => {
    const doc = cargar('recibidos-tabla.html');
    const a = doc.querySelector('[id="frmPrincipal:tablaCompRecibidos:0:j_idt58"]')!;
    a.textContent = '123';
    const r = parseTabla(doc, 'recibidos');
    expect(r.filas).toHaveLength(2);
    expect(r.descartadas).toBe(1);
  });

  it('lee el ViewState', () => {
    expect(leerViewState(cargar('emitidos-tabla.html'))).toBe('-1111111111111111111:-2222222222222222222');
  });
});
