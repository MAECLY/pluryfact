import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { xmlPorClave } from '../src/lib/ws-reintentos';

const fx = (n: string) => readFileSync(resolve(process.cwd(), 'test/fixtures', n), 'utf8');
const ok = (body: string) => ({ status: 200, text: async () => body }) as Response;
const sinEspera = async () => {};

it('reintenta tras un error de red y devuelve el XML', async () => {
  const f = vi.fn().mockRejectedValueOnce(new Error('ETIMEDOUT')).mockResolvedValueOnce(ok(fx('ws-autorizado.xml')));
  const xml = await xmlPorClave('x', f as unknown as typeof fetch, sinEspera);
  expect(f).toHaveBeenCalledTimes(2);
  expect(xml).toContain('<estado>AUTORIZADO</estado>');
  expect(f.mock.calls[0]![1].headers.SOAPAction).toBe('""');
});

it('null si el SRI no tiene la clave', async () => {
  const f = vi.fn().mockResolvedValue(ok(fx('ws-no-encontrado.xml')));
  expect(await xmlPorClave('x', f as unknown as typeof fetch, sinEspera)).toBeNull();
});

it('lanza tras tres intentos con la página de redirección', async () => {
  const f = vi.fn().mockResolvedValue(ok('<html>redirect</html>'));
  await expect(xmlPorClave('x', f as unknown as typeof fetch, sinEspera)).rejects.toThrow(/inesperada/);
  expect(f).toHaveBeenCalledTimes(3);
});
