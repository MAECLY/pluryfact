import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ejecutar, planificar, type Dependencias, type Progreso, type Trabajo } from '../src/lib/cola';
import { parseTabla } from '../src/lib/extract';

const fx = (n: string) => readFileSync(resolve(process.cwd(), 'test/fixtures', n));
const hoy = { anio: 2026, mes: 11, dia: 9 };

function deps(over: Partial<Dependencias> = {}) {
  const doc = document.implementation.createHTMLDocument('sri');
  doc.body.innerHTML = fx('recibidos-tabla.html').toString('utf8');
  const progresos: Progreso[] = [];
  const d: Dependencias = {
    hoy,
    rucContribuyente: '1799999999001',
    consultar: vi.fn(async () => ({ estado: 'ok' as const, mensaje: '' })),
    reporte: vi.fn(async () => new Uint8Array(fx('reporte-recibidos.txt'))),
    primeraPagina: vi.fn(async () => {}),
    siguientePagina: vi.fn(async () => false),
    leerTabla: () => parseTabla(doc, 'recibidos'),
    pdf: vi.fn(async () => new TextEncoder().encode('%PDF-1.4')),
    xml: vi.fn(async (c: string) => `<autorizacion>${c}</autorizacion>`),
    esperar: vi.fn(async () => {}),
    azar: () => 0.5,
    progreso: (p) => progresos.push(p),
    cancelado: () => false,
    ...over,
  };
  return { d, progresos };
}

const base: Trabajo = {
  bandeja: 'recibidos',
  periodo: { tipo: 'mes', anio: 2026, mes: 11 },
  tipos: ['factura'],
  emisor: '',
  formatos: { xml: true, pdf: true, txt: true },
};

describe('planificar', () => {
  it('recibidos: un mes por tipo con el código del combo', () => {
    expect(planificar({ ...base, tipos: ['factura', 'retencion'] }, hoy)).toEqual([
      { bandeja: 'recibidos', tipoCombo: '1', anio: 2026, mes: 11, dia: 0 },
      { bandeja: 'recibidos', tipoCombo: '6', anio: 2026, mes: 11, dia: 0 },
    ]);
  });

  it('emitidos: un día por consulta hasta ayer', () => {
    const p = planificar({ ...base, bandeja: 'emitidos' }, hoy);
    expect(p).toHaveLength(8);
    expect(p.at(-1)).toEqual({ bandeja: 'emitidos', tipoCombo: '1', fecha: '08/11/2026' });
  });
});

describe('ejecutar', () => {
  it('baja XML por clave, RIDE por tabla y el reporte, con rutas ordenadas', async () => {
    const { d, progresos } = deps();
    const r = await ejecutar(base, d);
    const rutas = r.archivos.map((a) => a.ruta).sort();
    expect(rutas).toEqual([
      'legajo/1799999999001/recibidos/2026/11/factura_133-007-000223738_0990000002001_0811202601099000000200121330070002237380000000017.pdf',
      'legajo/1799999999001/recibidos/2026/11/factura_133-007-000223738_0990000002001_0811202601099000000200121330070002237380000000017.xml',
      'legajo/1799999999001/recibidos/2026/11/factura_214-053-000094432_0990000001001_0811202601099000000100122140530000944321357246810.pdf',
      'legajo/1799999999001/recibidos/2026/11/factura_214-053-000094432_0990000001001_0811202601099000000100122140530000944321357246810.xml',
      'legajo/1799999999001/recibidos/reportes/factura_2026-11.txt',
    ]);
    expect(r.progreso).toMatchObject({ encontrados: 2, descargados: 4, fallidos: 0, consultasHechas: 1, fase: 'empaquetando' });
    const textos = progresos.at(-1)!.actividad.map((a) => a.texto);
    expect(textos).toContain('noviembre 2026: 2 comprobantes');
    expect(textos).toContain('XML de noviembre 2026: 2 listos');
    expect(textos.some((x) => x.startsWith('RIDE: página 1 de 1'))).toBe(true);
    expect(progresos.at(-1)!.pasos).toEqual([{ etiqueta: 'noviembre 2026', estado: 'ok', comprobantes: 2 }]);
    expect(d.consultar).toHaveBeenCalledTimes(1);
  });

  it('filtra por emisor antes de descargar', async () => {
    const { d } = deps();
    const r = await ejecutar({ ...base, emisor: 'litoral', formatos: { xml: true, pdf: false, txt: false } }, d);
    expect(r.archivos).toHaveLength(1);
    expect(d.xml).toHaveBeenCalledTimes(1);
  });

  it('un día sin datos no descarga ni falla', async () => {
    const { d } = deps({ consultar: vi.fn(async () => ({ estado: 'sin-datos' as const, mensaje: '' })) });
    const r = await ejecutar(base, d);
    expect(r.archivos).toHaveLength(0);
    expect(r.progreso.consultasHechas).toBe(1);
    expect(d.reporte).not.toHaveBeenCalled();
  });

  it('reintenta una vez tras un timeout', async () => {
    const consultar = vi
      .fn()
      .mockResolvedValueOnce({ estado: 'timeout', mensaje: '' })
      .mockResolvedValueOnce({ estado: 'ok', mensaje: '' });
    const { d } = deps({ consultar });
    const r = await ejecutar({ ...base, formatos: { xml: true, pdf: false, txt: false } }, d);
    expect(consultar).toHaveBeenCalledTimes(2);
    expect(r.archivos).toHaveLength(2);
    expect(r.consultasFallidas).toHaveLength(0);
  });

  it('registra la consulta fallida y sigue con las demás', async () => {
    const consultar = vi.fn(async () => ({ estado: 'rechazada' as const, mensaje: 'El SRI rechazó la consulta' }));
    const { d } = deps({ consultar });
    const r = await ejecutar({ ...base, tipos: ['factura', 'retencion'] }, d);
    expect(r.consultasFallidas).toEqual(['2026-11: El SRI rechazó la consulta', '2026-11: El SRI rechazó la consulta']);
  });

  it('captcha rechazado: espera larga, un reintento y se detiene sin seguir consultando', async () => {
    const consultar = vi.fn(async () => ({ estado: 'captcha' as const, mensaje: 'Captcha incorrecta' }));
    const { d } = deps({ consultar });
    const r = await ejecutar({ ...base, tipos: ['factura', 'retencion'] }, d);
    expect(consultar).toHaveBeenCalledTimes(2); // la primera consulta y su reintento; la de retenciones no se intenta
    expect(d.esperar).toHaveBeenCalledWith(75_000);
    expect(r.detenidaPor).toMatch(/rechazó la verificación/);
    expect(r.consultasFallidas).toEqual(['2026-11: Captcha incorrecta']);
  });

  it('captcha rechazado una vez y aceptado al reintentar: sigue normal', async () => {
    const consultar = vi
      .fn()
      .mockResolvedValueOnce({ estado: 'captcha', mensaje: 'Captcha incorrecta' })
      .mockResolvedValueOnce({ estado: 'ok', mensaje: '' });
    const { d } = deps({ consultar });
    const r = await ejecutar({ ...base, formatos: { xml: true, pdf: false, txt: false } }, d);
    expect(r.detenidaPor).toBeNull();
    expect(r.archivos).toHaveLength(2);
  });

  it('un XML que nunca responde no cuelga la cola', async () => {
    vi.useFakeTimers();
    const { d } = deps({ xml: vi.fn(() => new Promise<string | null>(() => {})) });
    const promesa = ejecutar({ ...base, formatos: { xml: true, pdf: false, txt: false } }, d);
    await vi.advanceTimersByTimeAsync(46_000);
    const r = await promesa;
    vi.useRealTimers();
    expect(r.progreso).toMatchObject({ descargados: 0, fallidos: 2 });
    expect(r.progreso.errores).toContain('El servicio web no respondió a tiempo');
  });

  it('cuenta como fallido un XML que el SRI no tiene autorizado', async () => {
    const { d } = deps({ xml: vi.fn(async () => null) });
    const r = await ejecutar({ ...base, formatos: { xml: true, pdf: false, txt: false } }, d);
    expect(r.progreso).toMatchObject({ descargados: 0, fallidos: 2 });
  });

  it('se detiene al cancelar y conserva lo descargado', async () => {
    let n = 0;
    const { d } = deps({ cancelado: () => ++n > 3 });
    const r = await ejecutar({ ...base, tipos: ['factura', 'retencion'] }, d);
    expect(r.progreso.fase).toBe('cancelado');
  });

  it('anuncia las pausas con cuenta regresiva y marca los meses sin datos', async () => {
    const { d, progresos } = deps({ consultar: vi.fn(async () => ({ estado: 'sin-datos' as const, mensaje: '' })), ahora: () => 1000 });
    await ejecutar({ ...base, periodo: { tipo: 'rango', desde: { anio: 2026, mes: 10, dia: 1 }, hasta: hoy } }, d);
    expect(progresos.some((p) => p.esperaHasta === 7500)).toBe(true);
    const fin = progresos.at(-1)!;
    expect(fin.pasos.map((x) => x.estado)).toEqual(['sin-datos', 'sin-datos']);
    expect(fin.actividad.map((a) => a.texto)).toContain('octubre 2026: el SRI no tiene comprobantes');
    expect(fin.esperaHasta).toBeNull();
  });

  it('espera entre consultas a ritmo de recibidos', async () => {
    const { d } = deps({ consultar: vi.fn(async () => ({ estado: 'sin-datos' as const, mensaje: '' })) });
    await ejecutar({ ...base, periodo: { tipo: 'rango', desde: { anio: 2026, mes: 9, dia: 1 }, hasta: hoy } }, d);
    // 3 meses → 2 pausas de 4000 + 0.5 × 5000.
    expect(d.esperar).toHaveBeenCalledTimes(2);
    expect(d.esperar).toHaveBeenCalledWith(6500);
  });
});
