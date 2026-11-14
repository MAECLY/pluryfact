/**
 * Prueba de punta a punta de «Imprimir un ZIP…» con PluryPrint
 * (`bun run e2e:pluryprint`). No toca el SRI ni datos reales.
 *
 * 1. Compila el build de pruebas (PLURYFACT_E2E=1: `nativeMessaging` es
 *    obligatorio, así no aparece el diálogo de permisos) en .output-e2e/.
 * 2. Abre Chromium con un perfil temporal y la extensión desempaquetada.
 * 3. Registra el host `com.maecly.pluryprint` en <perfil>/NativeMessagingHosts/
 *    (Chromium lee ahí los manifiestos de usuario cuando se usa --user-data-dir),
 *    con el ID de esta extensión en allowed_origins. El host es:
 *      - PLURYPRINT_BRIDGE_BIN=/ruta/a/pluryprint-bridge  → el puente real de
 *        PluryPrint, copiado a la carpeta temporal y con su modo de prueba:
 *        PLURYPRINT_BRIDGE_DATA_DIR apunta a una carpeta temporal (inbox/,
 *        handoff/ y un manifiesto con este origen, así no hace falta
 *        `bridge install` ni se tocan los manifiestos reales) y
 *        PLURYPRINT_BRIDGE_NO_LAUNCH=1 evita abrir la app (pon
 *        PLURYPRINT_BRIDGE_NO_LAUNCH=0 para que la abra).
 *      - sin esa variable → scripts/pluryprint-host-falso.ts (bun), que implementa
 *        el protocolo y guarda lo recibido.
 * 4. En pluryfact.html: Avanzado → «Conectar con PluryPrint», elige RIDE con XML
 *    de respaldo y reporte, Descargas → «Imprimir un ZIP…» con un ZIP ficticio
 *    (RUC 0999999999001), revisa el resumen y envía.
 * 5. Verifica que el host recibió exactamente los archivos esperados, en orden,
 *    con su sha256; y que sin host registrado la página dice «no instalado».
 *
 * Variables: PLURYPRINT_BRIDGE_BIN, PLURYPRINT_BRIDGE_NO_LAUNCH, E2E_VENTANA=1
 * (con ventana), E2E_CAPTURAS=<carpeta> (guarda capturas de Avanzado y Descargas).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PLURYPRINT_POR_DEFECTO } from '../src/lib/ajustes';
import { NOMBRE_HOST } from '../src/lib/pluryprint';
import { seleccionarParaImprimir } from '../src/lib/seleccion-impresion';
import { descargaFicticia } from '../test/helpers/zip-ficticio';
import { armarZip } from '../src/lib/zip';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, '.output-e2e', 'chrome-mv3');
const puenteReal = process.env.PLURYPRINT_BRIDGE_BIN;
const capturas = process.env.E2E_CAPTURAS;

const fallos: string[] = [];
const comprobar = (ok: boolean, msg: string, detalle = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${detalle ? ` — ${detalle}` : ''}`);
  if (!ok) fallos.push(msg);
};

if (puenteReal && !existsSync(puenteReal)) {
  console.error(`PLURYPRINT_BRIDGE_BIN no existe: ${puenteReal}`);
  process.exit(2);
}

console.log('Compilando el build de pruebas (PLURYFACT_E2E=1)…');
if (spawnSync('bunx', ['wxt', 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, PLURYFACT_E2E: '1' } }).status !== 0) process.exit(1);
const manifiestoExt = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8')) as { permissions: string[] };
comprobar(manifiestoExt.permissions.includes('nativeMessaging'), 'el build E2E declara nativeMessaging como obligatorio');

const tmp = mkdtempSync(join(tmpdir(), 'pluryfact-e2e-pp-'));
const perfil = join(tmp, 'perfil');
const recibido = join(tmp, 'recibido');
const datosPuente = join(tmp, 'datos-pluryprint');
mkdirSync(perfil, { recursive: true });

// Host: el puente real o el falso envuelto en un script (Chrome necesita un ejecutable).
// El falso se empaqueta en la carpeta temporal: en macOS, Chrome lanza el host
// como proceso «responsable» propio y, si este lee algo dentro de ~/Documents
// (donde suele estar el repo), se queda colgado esperando el permiso de
// privacidad (TCC) sin que aparezca ningún diálogo.
// Lo mismo vale para el puente real compilado dentro del repo: se copia fuera.
let binario = '';
if (puenteReal) {
  const copia = join(tmp, 'pluryprint-bridge');
  copyFileSync(puenteReal, copia);
  chmodSync(copia, 0o755);
  mkdirSync(datosPuente, { recursive: true });
  binario = join(tmp, 'puente.sh');
  writeFileSync(
    binario,
    `#!/bin/sh\nexport PLURYPRINT_BRIDGE_DATA_DIR='${datosPuente}'\nexport PLURYPRINT_BRIDGE_NO_LAUNCH='${process.env.PLURYPRINT_BRIDGE_NO_LAUNCH ?? '1'}'\nexec '${copia}' "$@"\n`,
  );
  chmodSync(binario, 0o755);
} else {
  const js = join(tmp, 'host-falso.js');
  if (spawnSync(process.execPath, ['build', join(root, 'scripts', 'pluryprint-host-falso.ts'), '--target=bun', `--outfile=${js}`], { stdio: 'inherit' }).status !== 0) process.exit(1);
  binario = join(tmp, 'host-falso.sh');
  writeFileSync(binario, `#!/bin/sh\nexport PLURYPRINT_FALSO_SALIDA='${recibido}'\nexec '${process.execPath}' '${js}' "$@"\n`);
  chmodSync(binario, 0o755);
}

const ctx = await chromium.launchPersistentContext(perfil, {
  channel: 'chromium',
  headless: process.env.E2E_VENTANA !== '1',
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let codigo = 0;
try {
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 20_000 }));
  const id = new URL(worker.url()).host;
  console.log(`Pluryfact cargado (${id}). Host: ${puenteReal ? `puente real ${puenteReal}` : 'falso (bun)'}`);

  const dirHosts = join(perfil, 'NativeMessagingHosts');
  const manifiestoHost = join(dirHosts, `${NOMBRE_HOST}.json`);
  const manifiesto = JSON.stringify({ name: NOMBRE_HOST, description: 'PluryPrint (prueba E2E)', path: binario, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] }, null, 2);
  const registrar = () => {
    mkdirSync(dirHosts, { recursive: true });
    writeFileSync(manifiestoHost, manifiesto);
    // El puente real también valida el origen contra un manifiesto en su carpeta de datos de prueba.
    if (puenteReal) writeFileSync(join(datosPuente, `${NOMBRE_HOST}.json`), manifiesto);
  };

  const page = await ctx.newPage();
  // Las páginas de bienvenida (onInstalled) no estorban, pero se cierran para no confundir.
  for (const p of ctx.pages()) if (p !== page) await p.close();

  // --- Sin host registrado: la página debe decir que no está instalado.
  await page.goto(`chrome-extension://${id}/pluryfact.html#avanzado`);
  await page.click('#pp-conectar');
  await page.waitForSelector('#pp-estado[data-estado="problema"]', { timeout: 20_000 });
  comprobar((await page.textContent('#pp-estado'))?.includes('PluryPrint no está instalado') ?? false, 'sin host: «PluryPrint no está instalado»', (await page.textContent('#pp-estado')) ?? '');
  comprobar((await page.textContent('#pp-lateral')) === 'PluryPrint: no instalado', 'sin host: barra lateral «no instalado»');

  // --- Con host registrado.
  registrar();
  await page.click('#pp-conectar');
  await page.waitForSelector('#pp-estado[data-estado="conectado"]', { timeout: 30_000 });
  comprobar(true, 'Conectar con PluryPrint', (await page.textContent('#pp-estado')) ?? '');
  comprobar((await page.textContent('#pp-lateral')) === 'PluryPrint: conectado', 'barra lateral «conectado»');
  comprobar((await page.locator('#pp-perfil option').count()) > 1, 'Avanzado lista los perfiles de PluryPrint');

  // Ajustes: RIDE (por defecto) con XML de respaldo (por defecto) + reporte.
  await page.check('#pp-reporte');
  await page.waitForFunction(() => document.querySelector<HTMLInputElement>('#pp-reporte')?.checked);
  const capturar = async (nombre: string, sel?: string) => {
    if (!capturas) return;
    mkdirSync(capturas, { recursive: true });
    if (sel) await page.locator(sel).screenshot({ path: join(capturas, `${nombre}.png`) });
    else await page.screenshot({ path: join(capturas, `${nombre}.png`), fullPage: true });
  };
  await page.setViewportSize({ width: 1180, height: 900 });
  await capturar('avanzado-pluryprint', '#aj-pluryprint');

  // --- Imprimir un ZIP…
  const { archivos } = descargaFicticia();
  const zip = armarZip(archivos);
  await page.goto(`chrome-extension://${id}/pluryfact.html#descargas`);
  await page.waitForSelector('#pp-zip:not([hidden])');
  await page.setInputFiles('#pp-zip-archivo', { name: 'pluryfact_0999999999001_recibidos_2026-10.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
  await page.waitForSelector('#pp-panel:not([hidden])');
  const resumen = (await page.textContent('#pp-panel-resumen')) ?? '';
  comprobar(resumen === 'Se imprimirán 3 RIDE + 1 XML + el reporte.', 'resumen antes de confirmar', resumen);
  await capturar('descargas-panel');
  await page.click('#pp-panel-enviar');
  await page.waitForSelector('#pp-panel-estado[data-estado="entregado"], #pp-panel-estado[data-estado="error"]', { timeout: 60_000 });
  const final = (await page.textContent('#pp-panel-estado')) ?? '';
  comprobar((await page.getAttribute('#pp-panel-estado', 'data-estado')) === 'entregado', 'PluryPrint recibió el trabajo', final);
  await capturar('descargas-entregado');
  await page.goto(`chrome-extension://${id}/pluryfact.html#nueva`);
  await capturar('nueva-descarga');
  await page.goto(`chrome-extension://${id}/pluryfact.html#acerca`);
  await capturar('acerca');

  // --- Lo que recibió el host.
  const esperado = seleccionarParaImprimir(archivos, { ...PLURYPRINT_POR_DEFECTO, incluirReporte: true }).archivos;
  const sha = (d: Uint8Array) => createHash('sha256').update(d).digest('hex');
  if (!puenteReal) {
    const trabajos = existsSync(recibido) ? readdirSync(recibido).filter((d) => d.startsWith('job-')) : [];
    comprobar(trabajos.length === 1, 'el host falso guardó un trabajo', trabajos.join(','));
    const dir = join(recibido, trabajos[0] ?? 'nada');
    const t = JSON.parse(readFileSync(join(dir, 'trabajo.json'), 'utf8')) as {
      label: string;
      action: string;
      origen: string;
      archivos: Array<{ index: number; name: string; kind: string; sha256: string }>;
    };
    comprobar(t.origen === `chrome-extension://${id}/`, 'Chrome pasó el origen de la extensión al host', t.origen);
    comprobar(t.label === 'Recibidos · 2026-10' && t.action === 'configure', 'etiqueta sin RUC y acción «configure»', `${t.label} / ${t.action}`);
    comprobar(
      JSON.stringify(t.archivos.map((a) => [a.name, a.kind])) === JSON.stringify(esperado.map((a) => [a.nombre, a.kind])),
      'archivos y orden: RIDE por fecha, XML de respaldo, reporte al final',
      t.archivos.map((a) => a.kind).join(','),
    );
    const enDisco = readdirSync(dir).filter((f) => f !== 'trabajo.json').sort();
    comprobar(
      enDisco.length === esperado.length && enDisco.every((f, i) => sha(readFileSync(join(dir, f))) === sha(esperado[i]!.datos)),
      'bytes idénticos (sha256) a los del ZIP',
    );
  } else {
    const inbox = join(datosPuente, 'inbox');
    const jobs = existsSync(inbox) ? readdirSync(inbox) : [];
    comprobar(jobs.length === 1, 'el puente real dejó un trabajo en su inbox', jobs.join(','));
    const dir = join(inbox, jobs[0] ?? 'nada');
    const enDisco = existsSync(dir) ? readdirSync(dir).sort() : [];
    console.log(`INFO inbox: ${enDisco.join(', ')}`);
    comprobar(
      enDisco.length === esperado.length && enDisco.every((f, i) => sha(readFileSync(join(dir, f))) === sha(esperado[i]!.datos)),
      'bytes idénticos (sha256) y en orden en el inbox del puente real',
    );
    const handoff = join(datosPuente, 'handoff');
    const handoffs = existsSync(handoff) ? readdirSync(handoff) : [];
    console.log(`INFO handoff: ${handoffs.length ? handoffs.join(', ') : 'ninguno'}`);
  }
} catch (e) {
  console.error(e);
  fallos.push(String(e));
} finally {
  await ctx.close();
  if (!fallos.length) rmSync(tmp, { recursive: true, force: true });
  else console.log(`Perfil y archivos de la prueba conservados en ${tmp}`);
  codigo = fallos.length ? 1 : 0;
}
console.log(fallos.length ? `\n${fallos.length} comprobaciones fallaron.` : '\nTodo bien.');
process.exit(codigo);
