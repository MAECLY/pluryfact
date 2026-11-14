import { describe, expect, it, vi } from 'vitest';
import { exclusivo } from '../src/lib/exclusivo';

describe('exclusivo', () => {
  it('rechaza un segundo pedido que llega mientras el primero espera su primer await', async () => {
    let soltar: () => void = () => {};
    const tarea = vi.fn(async () => {
      // Como `imprimir`: lo primero es leer ajustes (un await).
      await new Promise<void>((r) => (soltar = r));
    });
    const e = exclusivo(tarea);
    const primero = e.ejecutar();
    // El candado ya está tomado sin haber cedido el turno.
    expect(e.ocupado).toBe(true);
    const segundo = e.ejecutar();
    expect(await segundo).toBe(false);
    soltar();
    expect(await primero).toBe(true);
    expect(tarea).toHaveBeenCalledTimes(1);
    expect(e.ocupado).toBe(false);
  });

  it('suelta el candado aunque la tarea termine antes de tiempo o falle', async () => {
    const e = exclusivo(async (fallar: boolean) => {
      if (fallar) throw new Error('falló');
    });
    expect(await e.ejecutar(false)).toBe(true);
    expect(e.ocupado).toBe(false);
    await expect(e.ejecutar(true)).rejects.toThrow('falló');
    expect(e.ocupado).toBe(false);
    expect(await e.ejecutar(false)).toBe(true);
  });

  it('pasa los argumentos a la tarea', async () => {
    const tarea = vi.fn(async (_a: boolean, _b: number) => {});
    await exclusivo(tarea).ejecutar(true, 3);
    expect(tarea).toHaveBeenCalledWith(true, 3);
  });
});
