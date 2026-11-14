/**
 * Prueba de punta a punta de «Imprimir un ZIP…» con Pluryprint
 * (`bun run e2e:pluryprint`). No toca el SRI ni datos reales.
 *
 * 1. Compila el build de pruebas (PLURYFACT_E2E=1: `nativeMessaging` es
 *    obligatorio, así no aparece el diálogo de permisos) en .output-e2e/.
 * 2. Abre Chromium con un perfil temporal y la extensión desempaquetada.
 * 3. Registra el host `com.maecly.pluryprint` en <perfil>/NativeMessagingHosts/
 *    (Chromium lee ahí los manifiestos de usuario cuando se usa --user-data-dir),
 *    con el ID de esta extensión en allowed_origins. El host es:
 *      - PLURYPRINT_BRIDGE_BIN=/ruta/a/pluryprint-bridge  → el puente real de
 *        Pluryprint, copiado a la carpeta temporal y con su modo de prueba:
 *        PLURYPRINT_BRIDGE_DATA_DIR apunta a una carpeta temporal (inbox/,
 *        handoff/ y un manifiesto con este origen, así no hace falta
 *        `bridge install` ni se tocan los manifiestos reales) y
 *        PLURYPRINT_BRIDGE_NO_LAUNCH=1 evita abrir la app (pon
 *        PLURYPRINT_BRIDGE_NO_LAUNCH=0 para que la abra).
 *      - sin esa variable → scripts/pluryprint-host-falso.ts (bun), que implementa
 *        el protocolo y guarda lo recibido.
 * 4. En pluryfact.html: Avanzado → «Conectar con Pluryprint», elige RIDE con XML
 *    de respaldo y reporte, Descargas → «Imprimir un ZIP…» con un ZIP ficticio
 *    (RUC 0999999999001), revisa el resumen y envía.
 * 5. Verifica que el host recibió exactamente los archivos esperados, en orden,
 *    con su sha256; y que sin host registrado la página dice «no instalado».
 * 6. Con el puente real, además:
 *      - un segundo trabajo con «El XML» en Avanzado: «Se imprimirán 4 XML + el
 *        reporte.» (una es una retención);
 *      - compara cada archivo del inbox byte a byte con su entrada del ZIP y
 *        revisa el handoff (source, acción, etiqueta, rutas en orden);
 *      - si encuentra el repo de Pluryprint (PLURYPRINT_SRC_TAURI, o el
 *        src-tauri del que salió PLURYPRINT_BRIDGE_BIN), corre su test
 *        `bridge_handoff_e2e` sobre lo que dejó el puente, dentro de los 60 s
 *        de frescura: la app acepta el handoff por su misma puerta de «menú
 *        contextual», Print Job da los archivos por imprimibles y el motor
 *        convierte el XML en su representación tipo RIDE y el TXT en PDF (con
 *        el proceso de render real, sin abrir ventana ni imprimir en papel).
 *        PLURYPRINT_VALIDAR_HANDOFF=0 lo salta.
 *
 * Registro real (PLURYPRINT_REGISTRO=cli, macOS o Linux): en vez de escribir el
 * manifiesto a mano, copia pluryprint-cli y pluryprint-bridge a la carpeta
 * temporal y corre `pluryprint-cli bridge install --browser chrome
 * --extra-origin chrome-extension://<id>/` con HOME=<carpeta temporal>/home.
 * Chromium usa como perfil la carpeta de Chrome de ese HOME (lee los
 * manifiestos de <perfil>/NativeMessagingHosts/, justo donde los escribe el
 * CLI) y recibe ese HOME, así que el puente valida el origen contra el
 * manifiesto que instaló el CLI y deja inbox/ y handoff/ en la carpeta de datos
 * de Pluryprint de ese HOME. No se tocan los manifiestos ni los datos del
 * usuario (la prueba lo comprueba).
 *
 * Variables: PLURYPRINT_BRIDGE_BIN, PLURYPRINT_BRIDGE_NO_LAUNCH,
 * PLURYPRINT_REGISTRO=cli, PLURYPRINT_CLI_BIN (por defecto, pluryprint-cli junto
 * al puente), PLURYPRINT_SRC_TAURI, PLURYPRINT_VALIDAR_HANDOFF=0, E2E_VENTANA=1
 * (con ventana), E2E_CAPTURAS=<carpeta> (guarda capturas de Avanzado y Descargas),
 * E2E_CONSERVAR=1 (no borra la carpeta temporal aunque todo pase: con el puente
 * real deja inbox/, handoff/ y los PDF que generó Pluryprint en impreso/, ver
 * docs/INTEGRACION-PLURYPRINT.md §9.1).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { chromium } from 'playwright';
import { PLURYPRINT_POR_DEFECTO } from '../src/lib/ajustes';
import { NOMBRE_HOST } from '../src/lib/pluryprint';
import { seleccionarParaImprimir, textoSeleccion } from '../src/lib/seleccion-impresion';
import { descargaFicticia } from '../test/helpers/zip-ficticio';
import { armarZip } from '../src/lib/zip';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, '.output-e2e', 'chrome-mv3');
const puenteReal = process.env.PLURYPRINT_BRIDGE_BIN;
const capturas = process.env.E2E_CAPTURAS;
const conservar = process.env.E2E_CONSERVAR === '1';
const registroCli = process.env.PLURYPRINT_REGISTRO === 'cli';

const fallos: string[] = [];
const comprobar = (ok: boolean, msg: string, detalle = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${detalle ? ` — ${detalle}` : ''}`);
  if (!ok) fallos.push(msg);
};

if (puenteReal && !existsSync(puenteReal)) {
  console.error(`PLURYPRINT_BRIDGE_BIN no existe: ${puenteReal}`);
  process.exit(2);
}
const cliReal = registroCli ? (process.env.PLURYPRINT_CLI_BIN ?? join(dirname(puenteReal ?? ''), 'pluryprint-cli')) : '';
if (registroCli) {
  if (!puenteReal) {
    console.error('PLURYPRINT_REGISTRO=cli necesita PLURYPRINT_BRIDGE_BIN (el puente real).');
    process.exit(2);
  }
  if (process.platform === 'win32') {
    // En Windows el registro es el HKCU real (no hay HOME que aislar): se prueba a mano.
    console.error('PLURYPRINT_REGISTRO=cli solo funciona en macOS y Linux.');
    process.exit(2);
  }
  if (!existsSync(cliReal)) {
    console.error(`No encuentro pluryprint-cli en ${cliReal} (compílalo o pon PLURYPRINT_CLI_BIN).`);
    process.exit(2);
  }
}

// El test de Rust de Pluryprint que valida el handoff como lo haría la app.
// Se compila ahora porque el handoff solo vale 60 s después de escrito.
const srcTauri = (() => {
  if (!puenteReal || process.env.PLURYPRINT_VALIDAR_HANDOFF === '0') return undefined;
  const dir = process.env.PLURYPRINT_SRC_TAURI ?? join(dirname(puenteReal), '..', '..');
  return existsSync(join(dir, 'tests', 'bridge_handoff_e2e.rs')) ? dir : undefined;
})();
let testHandoff = '';
if (srcTauri) {
  console.log(`Compilando el test bridge_handoff_e2e de Pluryprint (${srcTauri})…`);
  const r = spawnSync('cargo', ['test', '--test', 'bridge_handoff_e2e', '--no-run', '--message-format=json'], {
    cwd: srcTauri,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 256 * 1024 * 1024,
  });
  for (const linea of (r.stdout ?? '').split('\n')) {
    try {
      const m = JSON.parse(linea) as { reason?: string; executable?: string | null; target?: { name?: string } };
      if (m.reason === 'compiler-artifact' && m.target?.name === 'bridge_handoff_e2e' && m.executable) testHandoff = m.executable;
    } catch {
      // Líneas que no son JSON: nada.
    }
  }
  if (r.status !== 0 || !testHandoff) {
    console.error('No se pudo compilar el test bridge_handoff_e2e de Pluryprint.');
    process.exit(1);
  }
} else if (puenteReal) {
  console.log('INFO sin el repo de Pluryprint (PLURYPRINT_SRC_TAURI): no se valida el handoff con la app.');
}

console.log('Compilando el build de pruebas (PLURYFACT_E2E=1)…');
if (spawnSync('bunx', ['wxt', 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, PLURYFACT_E2E: '1' } }).status !== 0) process.exit(1);
const manifiestoExt = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8')) as { permissions: string[] };
comprobar(manifiestoExt.permissions.includes('nativeMessaging'), 'el build E2E declara nativeMessaging como obligatorio');

const tmp = mkdtempSync(join(tmpdir(), 'pluryfact-e2e-pp-'));
const recibido = join(tmp, 'recibido');
// Con el registro real, todo vive bajo un HOME temporal: el perfil de Chromium
// es la carpeta de Chrome de ese HOME y los datos del puente, los de Pluryprint.
const home = join(tmp, 'home');
const mac = process.platform === 'darwin';
const perfil = registroCli
  ? mac
    ? join(home, 'Library', 'Application Support', 'Google', 'Chrome')
    : join(home, '.config', 'google-chrome')
  : join(tmp, 'perfil');
const datosPuente = registroCli
  ? mac
    ? join(home, 'Library', 'Application Support', 'com.Maecly.Pluryprint')
    : join(home, '.local', 'share', 'pluryprint')
  : join(tmp, 'datos-pluryprint');
mkdirSync(perfil, { recursive: true });
const envHome = (): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  for (const k of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_STATE_HOME', 'PLURYPRINT_BRIDGE_DATA_DIR']) delete env[k];
  return env;
};

// Lo que el usuario tiene de verdad, para comprobar al final que no se tocó.
const manifiestoUsuario = mac
  ? join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', `${NOMBRE_HOST}.json`)
  : join(homedir(), '.config', 'google-chrome', 'NativeMessagingHosts', `${NOMBRE_HOST}.json`);
const inboxUsuario = mac
  ? join(homedir(), 'Library', 'Application Support', 'com.Maecly.Pluryprint', 'inbox')
  : join(homedir(), '.local', 'share', 'pluryprint', 'inbox');
const huella = () => ({
  manifiesto: existsSync(manifiestoUsuario) ? readFileSync(manifiestoUsuario, 'utf8') : null,
  inbox: existsSync(inboxUsuario) ? readdirSync(inboxUsuario).sort().join(',') : null,
});
const huellaAntes = huella();

// Host: el puente real o el falso envuelto en un script (Chrome necesita un ejecutable).
// El falso se empaqueta en la carpeta temporal: en macOS, Chrome lanza el host
// como proceso «responsable» propio y, si este lee algo dentro de ~/Documents
// (donde suele estar el repo), se queda colgado esperando el permiso de
// privacidad (TCC) sin que aparezca ningún diálogo.
// Lo mismo vale para el puente real compilado dentro del repo: se copia fuera.
let binario = '';
let cliCopia = '';
if (puenteReal && registroCli) {
  // Como en una instalación: el CLI y el puente juntos, fuera de ~/Documents.
  const app = join(tmp, 'app');
  mkdirSync(app, { recursive: true });
  binario = join(app, 'pluryprint-bridge');
  cliCopia = join(app, 'pluryprint-cli');
  copyFileSync(puenteReal, binario);
  copyFileSync(cliReal, cliCopia);
  chmodSync(binario, 0o755);
  chmodSync(cliCopia, 0o755);
} else if (puenteReal) {
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
  // Chromium pasa su entorno al host: así el puente ve el HOME temporal.
  ...(registroCli ? { env: { ...envHome(), PLURYPRINT_BRIDGE_NO_LAUNCH: process.env.PLURYPRINT_BRIDGE_NO_LAUNCH ?? '1' } } : {}),
});
let codigo = 0;
try {
  const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 20_000 }));
  const id = new URL(worker.url()).host;
  console.log(
    `Pluryfact cargado (${id}). Host: ${puenteReal ? `puente real ${puenteReal}${registroCli ? ', registrado con pluryprint-cli bridge install' : ''}` : 'falso (bun)'}`,
  );

  const dirHosts = join(perfil, 'NativeMessagingHosts');
  const manifiestoHost = join(dirHosts, `${NOMBRE_HOST}.json`);
  const manifiesto = JSON.stringify({ name: NOMBRE_HOST, description: 'Pluryprint (prueba E2E)', path: binario, type: 'stdio', allowed_origins: [`chrome-extension://${id}/`] }, null, 2);
  const registrar = () => {
    if (registroCli) {
      const origen = `chrome-extension://${id}/`;
      const args = ['bridge', 'install', '--browser', 'chrome', '--extra-origin', origen, '--json'];
      console.log(`$ HOME=${home} pluryprint-cli ${args.join(' ')}`);
      const r = spawnSync(cliCopia, args, { env: envHome(), encoding: 'utf8' });
      console.log(r.stdout.trim());
      if (r.stderr.trim()) console.log(r.stderr.trim());
      comprobar(r.status === 0, 'pluryprint-cli bridge install (HOME temporal)', `código ${r.status}`);
      const m = existsSync(manifiestoHost)
        ? (JSON.parse(readFileSync(manifiestoHost, 'utf8')) as { name: string; path: string; allowed_origins: string[] })
        : null;
      comprobar(
        m?.name === NOMBRE_HOST && m.path === binario && m.allowed_origins.includes(origen) && m.allowed_origins.includes('chrome-extension://ibgodfpcihlddbbfaoooehfgbmahipbj/'),
        'el CLI escribió el manifiesto donde Chrome lo lee, con el puente y los dos orígenes',
        manifiestoHost,
      );
      const st = spawnSync(cliCopia, ['bridge', 'status', '--json'], { env: envHome(), encoding: 'utf8' });
      const chrome = (JSON.parse(st.stdout || '[]') as Array<{ browser: string; registered: boolean; points_here: boolean; binary_exists: boolean }>).find(
        (b) => b.browser === 'chrome',
      );
      comprobar(
        st.status === 0 && !!chrome?.registered && chrome.points_here && chrome.binary_exists,
        'pluryprint-cli bridge status: chrome registrado, apunta a este puente y el binario existe',
      );
      return;
    }
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
  comprobar((await page.textContent('#pp-estado'))?.includes('Pluryprint no está instalado') ?? false, 'sin host: «Pluryprint no está instalado»', (await page.textContent('#pp-estado')) ?? '');
  comprobar((await page.textContent('#pp-lateral')) === 'Pluryprint: no instalado', 'sin host: barra lateral «no instalado»');

  // --- Con host registrado.
  registrar();
  await page.click('#pp-conectar');
  await page.waitForSelector('#pp-estado[data-estado="conectado"]', { timeout: 30_000 });
  comprobar(true, 'Conectar con Pluryprint', (await page.textContent('#pp-estado')) ?? '');
  comprobar((await page.textContent('#pp-lateral')) === 'Pluryprint: conectado', 'barra lateral «conectado»');
  comprobar((await page.locator('#pp-perfil option').count()) > 1, 'Avanzado lista los perfiles de Pluryprint');

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
  /** Descargas → «Imprimir un ZIP…» con el ZIP ficticio; devuelve el resumen que se mostró. */
  const imprimirZip = async (alMostrarResumen?: () => Promise<void>) => {
    await page.goto(`chrome-extension://${id}/pluryfact.html#descargas`);
    await page.waitForSelector('#pp-zip:not([hidden])');
    await page.setInputFiles('#pp-zip-archivo', { name: 'pluryfact_0999999999001_recibidos_2026-10.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) });
    await page.waitForSelector('#pp-panel:not([hidden])');
    const resumen = (await page.textContent('#pp-panel-resumen')) ?? '';
    await alMostrarResumen?.();
    await page.click('#pp-panel-enviar');
    await page.waitForSelector('#pp-panel-estado[data-estado="entregado"], #pp-panel-estado[data-estado="error"]', { timeout: 60_000 });
    const final = (await page.textContent('#pp-panel-estado')) ?? '';
    comprobar((await page.getAttribute('#pp-panel-estado', 'data-estado')) === 'entregado', 'Pluryprint recibió el trabajo', final);
    return resumen;
  };
  const sha = (d: Uint8Array) => createHash('sha256').update(d).digest('hex');
  const delZip = new Map(Object.entries(unzipSync(zip)).map(([ruta, datos]) => [basename(ruta), datos]));
  const jobsVistos = new Set<string>();
  /** Lo que dejó el puente real para el trabajo nuevo: inbox, handoff y, si está el repo, la app. */
  const verificarPuente = (esperado: Array<{ nombre: string; datos: Uint8Array }>, que: string) => {
    const inbox = join(datosPuente, 'inbox');
    const nuevos = (existsSync(inbox) ? readdirSync(inbox) : []).filter((j) => !jobsVistos.has(j));
    comprobar(nuevos.length === 1, `${que}: el puente real dejó un trabajo nuevo en su inbox`, nuevos.join(','));
    const job = nuevos[0] ?? 'nada';
    jobsVistos.add(job);
    const dir = join(inbox, job);
    const enDisco = existsSync(dir) ? readdirSync(dir).sort() : [];
    console.log(`INFO inbox: ${enDisco.join(', ')}`);
    comprobar(
      enDisco.length === esperado.length && enDisco.every((f, i) => sha(readFileSync(join(dir, f))) === sha(esperado[i]!.datos)),
      `${que}: bytes idénticos (sha256) y en orden en el inbox`,
    );
    // Contra el ZIP mismo (no contra lo que se usó para armarlo): cada archivo
    // del inbox es, byte a byte, su entrada del ZIP que se eligió en la página.
    const igualAlZip = enDisco.map((f) => {
      const original = delZip.get(f.replace(/^\d{4}-/, ''));
      return !!original && Buffer.compare(Buffer.from(original), readFileSync(join(dir, f))) === 0;
    });
    comprobar(enDisco.length > 0 && igualAlZip.every(Boolean), `${que}: cada archivo del inbox es byte a byte su entrada del ZIP`, igualAlZip.map((b) => (b ? '=' : '≠')).join(''));
    const handoff = join(datosPuente, 'handoff', `pluryfact-${job}.json`);
    comprobar(existsSync(handoff), `${que}: el puente escribió el handoff del trabajo`, basename(handoff));
    if (existsSync(handoff)) {
      const h = JSON.parse(readFileSync(handoff, 'utf8')) as { schema_version: number; source: string; action: string; label?: string; paths: string[] };
      comprobar(
        h.schema_version === 1 && h.source === 'pluryfact' && h.action === 'configure' && h.label === 'Recibidos · 2026-10',
        `${que}: handoff con schema 1, source pluryfact, acción configure, etiqueta sin RUC`,
        `${h.source} / ${h.action} / ${h.label}`,
      );
      comprobar(JSON.stringify(h.paths.map((p) => basename(p))) === JSON.stringify(enDisco), `${que}: el handoff lista el inbox en orden de impresión`);
    }
    if (!testHandoff) return;
    // Inmediato: la app no acepta un handoff de más de 60 s.
    const salida = join(tmp, 'impreso', job);
    console.log(`$ ${basename(testHandoff)} --ignored --nocapture (PLURYPRINT_E2E_DATA_DIR=${datosPuente} PLURYPRINT_E2E_JOB=${job})`);
    const r = spawnSync(testHandoff, ['--ignored', '--nocapture', '--exact', 'fr_125_the_app_accepts_and_converts_a_real_pluryfact_handoff'], {
      env: {
        ...(registroCli ? { ...envHome(), PLURYPRINT_E2E_SAME_HOME: '1' } : process.env),
        PLURYPRINT_E2E_DATA_DIR: datosPuente,
        PLURYPRINT_E2E_JOB: job,
        PLURYPRINT_E2E_EXPECT_FILES: String(esperado.length),
        PLURYPRINT_E2E_OUT: salida,
      },
      encoding: 'utf8',
      timeout: 300_000,
    });
    for (const linea of `${r.stdout}\n${r.stderr}`.split('\n')) if (linea.trim() && !linea.startsWith('running ')) console.log(`  │ ${linea}`);
    comprobar(r.status === 0, `${que}: Pluryprint acepta el handoff como la app y convierte cada archivo (XML → RIDE, TXT → PDF)`, `código ${r.status}`);
    if (existsSync(salida)) console.log(`INFO PDF generados por Pluryprint: ${readdirSync(salida).join(', ')}`);
  };

  const resumen = await imprimirZip(() => capturar('descargas-panel'));
  comprobar(resumen === 'Se imprimirán 3 RIDE + 1 XML + el reporte.', 'resumen antes de confirmar', resumen);
  await capturar('descargas-entregado');
  // --- Lo que recibió el host.
  const esperado = seleccionarParaImprimir(archivos, { ...PLURYPRINT_POR_DEFECTO, incluirReporte: true }).archivos;
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
    verificarPuente(esperado, 'RIDE con XML de respaldo y reporte');

    // --- Segundo trabajo: solo XML (Avanzado → «El XML»). Pluryprint arma la
    // representación impresa de cada comprobante, retención incluida.
    await page.goto(`chrome-extension://${id}/pluryfact.html#avanzado`);
    await page.check('input[name="pp-contenido"][value="xml"]');
    await page.reload();
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('input[name="pp-contenido"][value="xml"]')?.checked);
    const soloXml = seleccionarParaImprimir(archivos, { ...PLURYPRINT_POR_DEFECTO, contenido: 'xml', incluirReporte: true });
    const resumenXml = await imprimirZip();
    comprobar(
      resumenXml === textoSeleccion(soloXml).principal && resumenXml === 'Se imprimirán 4 XML + el reporte.',
      'solo XML: resumen antes de confirmar',
      resumenXml,
    );
    verificarPuente(soloXml.archivos, 'solo XML y reporte');
  }
  await page.goto(`chrome-extension://${id}/pluryfact.html#nueva`);
  await capturar('nueva-descarga');
  await page.goto(`chrome-extension://${id}/pluryfact.html#acerca`);
  await capturar('acerca');
} catch (e) {
  console.error(e);
  fallos.push(String(e));
} finally {
  await ctx.close();
  const huellaDespues = huella();
  comprobar(
    huellaDespues.manifiesto === huellaAntes.manifiesto && huellaDespues.inbox === huellaAntes.inbox,
    'el manifiesto de Chrome y el inbox de Pluryprint del usuario siguen igual',
  );
  if (!fallos.length && !conservar) rmSync(tmp, { recursive: true, force: true });
  else console.log(`Perfil y archivos de la prueba conservados en ${tmp}${puenteReal ? ` (datos del puente: ${datosPuente})` : ''}`);
  codigo = fallos.length ? 1 : 0;
}
console.log(fallos.length ? `\n${fallos.length} comprobaciones fallaron.` : '\nTodo bien.');
process.exit(codigo);
