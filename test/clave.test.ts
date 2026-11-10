import { describe, expect, it } from 'vitest';
import { construirClave, digitoModulo11, esClaveValida, parseClave } from '../src/lib/clave';

// Claves de ejemplo con dígito verificador válido (RUC de emisor ficticios).
const REAL = [
  '0811202601099000000400122140530000944322468135716',
  '0811202601099000000300121330070002237382468135715',
  '0811202601099000000300121330070002237392468135710',
];

describe('dígito verificador módulo 11', () => {
  it('cuadra con claves de ejemplo válidas', () => {
    for (const c of REAL) expect(esClaveValida(c)).toBe(true);
  });

  it('detecta un dígito alterado', () => {
    const mala = REAL[0]!.slice(0, 20) + '9' + REAL[0]!.slice(21);
    expect(esClaveValida(mala)).toBe(false);
  });

  it('mapea 11 → 0 y 10 → 1', () => {
    for (let n = 0; n < 2000; n++) {
      const d = digitoModulo11(String(n).padStart(48, '7'));
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(9);
    }
  });
});

describe('parseClave', () => {
  it('descompone una factura recibida', () => {
    const c = parseClave(REAL[1]!);
    expect(c).toMatchObject({
      fechaEmision: { dia: 8, mes: 11, anio: 2026 },
      tipo: 'factura',
      ruc: '0990000003001',
      ambiente: 'produccion',
      establecimiento: '133',
      puntoEmision: '007',
      secuencial: '000223738',
    });
  });

  it('rechaza longitudes, letras y tipos desconocidos', () => {
    expect(parseClave('123')).toBeNull();
    expect(parseClave('x'.repeat(49))).toBeNull();
    const tipo99 = construirClave({
      fecha: { dia: 1, mes: 1, anio: 2026 },
      tipoCodigo: '99',
      ruc: '1799999999001',
      serie: '001001',
      secuencial: '000000001',
      codigoNumerico: '12345678',
    });
    expect(parseClave(tipo99)).toBeNull();
  });

  it('acepta espacios alrededor', () => {
    expect(parseClave(`  ${REAL[2]!}\n`)?.secuencial).toBe('000223739');
  });
});

describe('construirClave', () => {
  it('produce claves que parseClave entiende', () => {
    const clave = construirClave({
      fecha: { dia: 4, mes: 11, anio: 2026 },
      tipoCodigo: '07',
      ruc: '1799999999001',
      serie: '001002',
      secuencial: '000004511',
      codigoNumerico: '87654321',
    });
    expect(clave).toHaveLength(49);
    expect(parseClave(clave)?.tipo).toBe('retencion');
  });
});
