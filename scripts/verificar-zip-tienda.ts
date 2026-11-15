/**
 * Revisa el ZIP que va a Chrome Web Store (`bun scripts/verificar-zip-tienda.ts [ruta]`).
 * Sin ruta, toma .output/pluryfact-<versión de package.json>-chrome.zip.
 * Falla si el manifest no es el de la tienda: versión distinta de package.json,
 * `key` (fijaría otro ID), `nativeMessaging` como permiso obligatorio (es
 * opcional: obligatorio desactivaría la extensión al actualizar), permisos o
 * hosts fuera de la lista conocida, o restos del build de pruebas (E2E).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const version: string = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const ruta = process.argv[2] ?? join(root, '.output', `pluryfact-${version}-chrome.zip`);

const archivos = unzipSync(new Uint8Array(readFileSync(ruta)));
const fallos: string[] = [];
const texto = archivos['manifest.json'];
if (!texto) {
  console.error(`${ruta}: no tiene manifest.json en la raíz`);
  process.exit(1);
}
const m = JSON.parse(strFromU8(texto));

const igual = (a: unknown, b: string[]) => JSON.stringify([...((a as string[]) ?? [])].sort()) === JSON.stringify([...b].sort());

if (m.manifest_version !== 3) fallos.push(`manifest_version ${m.manifest_version}, se espera 3`);
if (m.name !== 'Pluryfact') fallos.push(`name «${m.name}»`);
if (m.version !== version) fallos.push(`version ${m.version}, package.json dice ${version}`);
if ('key' in m) fallos.push('trae `key`: la tienda asigna el ID, no se sube una clave');
if (!igual(m.permissions, ['storage', 'scripting', 'notifications']))
  fallos.push(`permissions ${JSON.stringify(m.permissions)}`);
if (!igual(m.optional_permissions, ['nativeMessaging']))
  fallos.push(`optional_permissions ${JSON.stringify(m.optional_permissions)}`);
if (!igual(m.host_permissions, ['https://cel.sri.gob.ec/*', 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*']))
  fallos.push(`host_permissions ${JSON.stringify(m.host_permissions)}`);

for (const [nombre, datos] of Object.entries(archivos)) {
  if (nombre.endsWith('.map')) fallos.push(`incluye un source map: ${nombre}`);
  if (/\.(js|html|json)$/.test(nombre) && strFromU8(datos).includes('.output-e2e')) fallos.push(`restos del build E2E en ${nombre}`);
}

if (fallos.length) {
  console.error(`${ruta}: el ZIP no sirve para la tienda`);
  for (const f of fallos) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${ruta}: OK (Pluryfact ${m.version}, ${Object.keys(archivos).length} archivos, nativeMessaging opcional, sin key)`);
