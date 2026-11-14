import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { normalizarAjustes } from '@/lib/ajustes';
import { TEMAS } from '@/lib/temas';

const css = readFileSync(resolve(__dirname, '../src/ui/tokens.css'), 'utf8');

it('cada tema salvo el predeterminado tiene claro, oscuro por sistema y oscuro forzado', () => {
  for (const t of TEMAS.slice(1)) {
    expect(css).toContain(`:root[data-brand='${t.id}'] {`);
    expect(css).toContain(`:root[data-brand='${t.id}']:not([data-theme='light']) {`);
    expect(css).toContain(`:root[data-brand='${t.id}'][data-theme='dark'] {`);
  }
});

it('cada bloque de tema define todos los colores', () => {
  const tokens = ['bg', 'surface', 'ink', 'muted', 'line', 'accent', 'accent-ink', 'pliego'];
  const bloques = css.match(/\[data-brand='[a-z]+'\][^{]*\{[^}]*\}/g) ?? [];
  expect(bloques.length).toBe((TEMAS.length - 1) * 3);
  for (const b of bloques) for (const t of tokens) expect(b).toContain(`--pf-${t}:`);
});

it('el tema guardado se normaliza a uno conocido', () => {
  expect(normalizarAjustes({}).tema).toBe('pluryfact');
  expect(normalizarAjustes({ tema: 'comprobox' }).tema).toBe('comprobox');
  expect(normalizarAjustes({ tema: 'legajo' }).tema).toBe('pluryfact');
});
