import { describe, expect, it } from 'vitest';
import { migrarClavesAntiguas } from '@/lib/migracion';

function memoria(inicial: Record<string, unknown>) {
  const datos = { ...inicial };
  return {
    datos,
    get: async () => ({ ...datos }),
    set: async (d: Record<string, unknown>) => void Object.assign(datos, d),
    remove: async (ks: string[]) => ks.forEach((k) => delete datos[k]),
  };
}

describe('migrarClavesAntiguas', () => {
  it('copia legajo:* a pluryfact:* y borra las viejas', async () => {
    const a = memoria({ 'legajo:progreso': { fase: 'listo' }, 'legajo:historial': [1], otra: 1 });
    expect(await migrarClavesAntiguas(a)).toBe(2);
    expect(a.datos).toEqual({ 'pluryfact:progreso': { fase: 'listo' }, 'pluryfact:historial': [1], otra: 1 });
  });

  it('no pisa una clave nueva que ya existe', async () => {
    const a = memoria({ 'legajo:ajustes': { ritmo: 'amable' }, 'pluryfact:ajustes': { ritmo: 'normal' } });
    await migrarClavesAntiguas(a);
    expect(a.datos).toEqual({ 'pluryfact:ajustes': { ritmo: 'normal' } });
  });

  it('sin claves viejas no hace nada', async () => {
    const a = memoria({ 'pluryfact:progreso': 1 });
    expect(await migrarClavesAntiguas(a)).toBe(0);
    expect(a.datos).toEqual({ 'pluryfact:progreso': 1 });
  });
});
