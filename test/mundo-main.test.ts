import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// El conductor corre en el mundo MAIN de la página: ahí no existen las APIs de
// extensión. Usarlas rompe la instalación sin ningún error visible (pasó en vivo).
it('el código del mundo MAIN no usa APIs de extensión', () => {
  for (const archivo of ['src/entrypoints/conductor.content.ts', 'src/lib/conductor.ts']) {
    const codigo = readFileSync(resolve(process.cwd(), archivo), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codigo, archivo).not.toMatch(/\b(browser|chrome)\.(runtime|storage|tabs|scripting)\b/);
  }
});
