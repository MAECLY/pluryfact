/**
 * Lee el registro de diagnóstico de Legajo desde los perfiles de Chrome
 * (`bun run registro [--ultimos N] [--errores]`).
 *
 * chrome.storage.local vive en <perfil>/Local Extension Settings/<id>/ como
 * LevelDB. Chrome mantiene la base abierta, así que se copia a una carpeta
 * temporal y se lee la copia. El ID de una extensión descomprimida depende de
 * la ruta de la carpeta cargada; se buscan todas las que tengan claves legajo:*.
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClassicLevel } from 'classic-level';
import { enmascarar, PREFIJO_REGISTRO, type Entrada } from '../src/lib/registro';

const args = process.argv.slice(2);
const ultimos = Number(args[args.indexOf('--ultimos') + 1]) || 200;
const soloErrores = args.includes('--errores');

const RAICES = [
  join(homedir(), 'Library/Application Support/Google/Chrome'),
  join(homedir(), 'Library/Application Support/Chromium'),
  join(homedir(), '.config/google-chrome'),
  join(homedir(), 'Documents/GitHub/legajo/.e2e-profile'),
];

const bases: string[] = [];
for (const raiz of RAICES) {
  if (!existsSync(raiz)) continue;
  const perfiles = raiz.endsWith('.e2e-profile') ? ['Default'] : readdirSync(raiz).filter((p) => p === 'Default' || p.startsWith('Profile'));
  for (const perfil of perfiles) {
    const dir = join(raiz, perfil, 'Local Extension Settings');
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir)) bases.push(join(dir, id));
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'legajo-registro-'));
let encontradas = 0;
try {
  for (const [i, base] of bases.entries()) {
    const copia = join(tmp, String(i));
    cpSync(base, copia, { recursive: true });
    rmSync(join(copia, 'LOCK'), { force: true });
    const db = new ClassicLevel<string, string>(copia, { keyEncoding: 'utf8', valueEncoding: 'utf8' });
    const entradas: Entrada[] = [];
    let progreso: unknown = null;
    try {
      for await (const [k, v] of db.iterator({ gte: 'legajo:', lt: 'legajo;' })) {
        if (k.startsWith(PREFIJO_REGISTRO)) entradas.push(...(JSON.parse(v) as Entrada[]));
        if (k === 'legajo:progreso') progreso = JSON.parse(v);
      }
    } catch {
      /* no es una base de Legajo legible */
    } finally {
      await db.close();
    }
    if (!entradas.length && !progreso) continue;
    encontradas++;
    console.log(`\n=== ${base.replace(homedir(), '~').replace(/Local Extension Settings\/(\w{6})\w+/, 'Local Extension Settings/$1…')}`);
    if (progreso) console.log(`Último trabajo: ${enmascarar(JSON.stringify(progreso))}`);
    const lista = entradas
      .filter((e) => !soloErrores || e.n !== 'info')
      .sort((a, b) => a.t - b.t)
      .slice(-ultimos);
    for (const e of lista) {
      const hora = new Date(e.t).toLocaleTimeString('es-EC', { hour12: false });
      console.log(`${hora} ${e.n.padEnd(5)} ${e.o.padEnd(10)} ${e.m}`);
    }
    console.log(`(${lista.length} de ${entradas.length} entradas)`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
if (!encontradas) console.log('No se encontró ningún registro de Legajo en los perfiles de Chrome.');
