import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Los textos de store-assets/LISTING.md se pegan tal cual en el panel de
// Chrome Web Store, que corta o rechaza lo que pase de sus límites.
const listing = readFileSync(resolve(__dirname, '../store-assets/LISTING.md'), 'utf8');

function bloque(titulo: string): string {
  const desde = listing.indexOf(`### ${titulo}\n`);
  expect(desde, `falta la sección «${titulo}»`).toBeGreaterThanOrEqual(0);
  const m = /```text\n([\s\S]*?)\n```/.exec(listing.slice(desde));
  expect(m, `la sección «${titulo}» no tiene bloque text`).not.toBeNull();
  return m![1]!;
}

describe('store-assets/LISTING.md cabe en los campos de la tienda', () => {
  it('resumen ≤ 132 caracteres', () => expect([...bloque('Resumen del paquete')].length).toBeLessThanOrEqual(132));
  it('descripción ≤ 16 000 caracteres', () => expect([...bloque('Descripción')].length).toBeLessThanOrEqual(16000));
  it('instrucciones adicionales ≤ 500 caracteres', () =>
    expect([...bloque('Instrucciones adicionales')].length).toBeLessThanOrEqual(500));
  it('el resumen coincide con la descripción del manifest (package.json)', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
    expect(bloque('Resumen del paquete')).toBe(pkg.description);
  });
});
