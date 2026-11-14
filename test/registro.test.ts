import { expect, it } from 'vitest';
import { crearRegistro, enmascarar, MAX_ENTRADAS, type Entrada } from '../src/lib/registro';

it('enmascara claves y RUC', () => {
  expect(enmascarar('clave 0811202601099000000300121330070002237382468135715 ruc 1799999999001 ced 1799999999')).toBe(
    'clave …000223738 ruc <id> ced <id>',
  );
});

it('acumula por origen y recorta al máximo', async () => {
  const mem: Record<string, unknown> = {};
  const almacen = { get: async (k: string) => ({ [k]: mem[k] }), set: async (v: Record<string, unknown>) => void Object.assign(mem, v) };
  const r = crearRegistro('content', almacen, () => 1);
  for (let i = 0; i < MAX_ENTRADAS + 10; i++) r.info(`e${i}`);
  await r.volcar();
  r.error('fin');
  await r.volcar();
  const e = mem['pluryfact:registro:content'] as Entrada[];
  expect(e).toHaveLength(MAX_ENTRADAS);
  expect(e.at(-1)).toEqual({ t: 1, o: 'content', n: 'error', m: 'fin' });
});
