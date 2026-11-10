import { describe, expect, it } from 'vitest';
import { aRango, consultasEmitidos, consultasRecibidos, dentroDeRango, formatoSri } from '../src/lib/periodo';

const hoy = { anio: 2026, mes: 11, dia: 9 };

describe('aRango', () => {
  it('convierte mes y año a rangos cerrados', () => {
    expect(aRango({ tipo: 'mes', anio: 2024, mes: 2 }, hoy).hasta).toEqual({ anio: 2024, mes: 2, dia: 29 });
    expect(aRango({ tipo: 'anio', anio: 2025 }, hoy)).toEqual({
      desde: { anio: 2025, mes: 1, dia: 1 },
      hasta: { anio: 2025, mes: 12, dia: 31 },
    });
  });

  it('recorta el mes en curso a hoy', () => {
    expect(aRango({ tipo: 'mes', anio: 2026, mes: 11 }, hoy).hasta).toEqual(hoy);
  });

  it('rechaza rangos invertidos, futuros e imposibles', () => {
    const a = { anio: 2026, mes: 3, dia: 10 };
    const b = { anio: 2026, mes: 3, dia: 1 };
    expect(() => aRango({ tipo: 'rango', desde: a, hasta: b }, hoy)).toThrow(/posterior/);
    expect(() => aRango({ tipo: 'mes', anio: 2026, mes: 12 }, hoy)).toThrow(/futuro/);
    expect(() => aRango({ tipo: 'dia', fecha: { anio: 2026, mes: 2, dia: 30 } }, hoy)).toThrow(/inválida/);
  });
});

describe('consultasEmitidos', () => {
  it('genera un día por consulta, cruzando meses', () => {
    const dias = consultasEmitidos(
      { tipo: 'rango', desde: { anio: 2025, mes: 12, dia: 30 }, hasta: { anio: 2026, mes: 1, dia: 2 } },
      hoy,
    );
    expect(dias.map(formatoSri)).toEqual(['30/12/2025', '31/12/2025', '01/01/2026', '02/01/2026']);
  });

  it('termina ayer: el portal rechaza el día de hoy', () => {
    const dias = consultasEmitidos({ tipo: 'mes', anio: 2026, mes: 11 }, hoy);
    expect(dias.at(-1)).toEqual({ anio: 2026, mes: 11, dia: 8 });
    expect(dias).toHaveLength(8);
    expect(() => consultasEmitidos({ tipo: 'dia', fecha: hoy }, hoy)).toThrow(/hasta ayer/);
  });

  it('un año bisiesto completo son 366 consultas', () => {
    expect(consultasEmitidos({ tipo: 'anio', anio: 2024 }, hoy)).toHaveLength(366);
  });
});

describe('consultasRecibidos', () => {
  it('un año son 12 consultas de mes completo', () => {
    const c = consultasRecibidos({ tipo: 'anio', anio: 2025 }, hoy);
    expect(c).toHaveLength(12);
    expect(c.every((x) => x.dia === 0)).toBe(true);
  });

  it('un rango parcial consulta solo los meses que toca', () => {
    expect(
      consultasRecibidos(
        { tipo: 'rango', desde: { anio: 2025, mes: 11, dia: 20 }, hasta: { anio: 2026, mes: 1, dia: 5 } },
        hoy,
      ),
    ).toEqual([
      { anio: 2025, mes: 11, dia: 0 },
      { anio: 2025, mes: 12, dia: 0 },
      { anio: 2026, mes: 1, dia: 0 },
    ]);
  });

  it('un solo día usa el filtro de día', () => {
    expect(consultasRecibidos({ tipo: 'dia', fecha: { anio: 2026, mes: 11, dia: 8 } }, hoy)).toEqual([
      { anio: 2026, mes: 11, dia: 8 },
    ]);
  });

  it('rechaza años anteriores a 2022', () => {
    expect(() => consultasRecibidos({ tipo: 'anio', anio: 2021 }, hoy)).toThrow(/2022/);
  });
});

it('dentroDeRango incluye los extremos', () => {
  const r = { desde: { anio: 2026, mes: 1, dia: 1 }, hasta: { anio: 2026, mes: 1, dia: 31 } };
  expect(dentroDeRango({ anio: 2026, mes: 1, dia: 31 }, r)).toBe(true);
  expect(dentroDeRango({ anio: 2026, mes: 2, dia: 1 }, r)).toBe(false);
});
