/**
 * Prueba de punta a punta de Legajo contra SRI en Línea REAL (`bun run e2e`).
 *
 * 1. Compila la extensión y abre Chromium (con ventana) con Legajo cargado y
 *    un perfil propio en .e2e-profile/.
 * 2. Abre el login del SRI y ESPERA a que la persona inicie sesión a mano y
 *    entre desde el menú a «Comprobantes electrónicos emitidos» o «recibidos».
 *    El script nunca escribe credenciales.
 * 3. Abre el popup de Legajo en otra pestaña, configura el periodo y pulsa
 *    «Descargar ZIP».
 * 4. Recibe el ZIP, lo guarda en .e2e-out/ y verifica: XML autorizados con la
 *    clave del nombre, PDF válidos, rutas por año/mes.
 *
 * Variables:
 *   E2E_PERIODO_EMITIDOS / E2E_PERIODO_RECIBIDOS (o E2E_PERIODO para ambas)
 *                dia:2026-11-06 | mes:2026-10 | anio:2025 | rango:2026-10-01:2026-10-15
 *                (por defecto: emitidos dia:2026-11-06, recibidos mes:2026-10)
 *
 * Rondas: al terminar una, el script espera el archivo .e2e-out/ronda (lo crea
 * quien dirige la prueba con `touch`) y corre otra ronda sobre la pantalla que
 * esté abierta, con la misma sesión. Opcional: .e2e-out/ronda puede contener
 * un periodo (p. ej. `mes:2026-09`).
 * Cierra la ventana para terminar.
 *   E2E_TIPOS    factura,retencion…   (por defecto factura)
 *   E2E_EMISOR   RUC o razón social (solo recibidos)
 *   E2E_FORMATOS xml,pdf,txt          (por defecto xml,pdf)
 *
 * No imprime datos personales: solo conteos y secuenciales.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { chromium, type Page } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, '.output', 'chrome-mv3');
const perfil = join(root, '.e2e-profile');
const salida = join(root, '.e2e-out');
const LOGIN = 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio/NAT';
const PORTAL = 'srienlinea.sri.gob.ec/comprobantes-electronicos-internet/';

const fallos: string[] = [];
const comprobar = (ok: boolean, msg: string, detalle = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${detalle ? ` — ${detalle}` : ''}`);
  if (!ok) fallos.push(msg);
};
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (spawnSync('bunx', ['wxt', 'build'], { cwd: root, stdio: 'inherit' }).status !== 0) process.exit(1);
mkdirSync(salida, { recursive: true });

const ctx = await chromium.launchPersistentContext(perfil, {
  channel: 'chromium',
  headless: false,
  acceptDownloads: true,
  viewport: { width: 1280, height: 860 },
  // Puerto de depuración: permite diagnosticar en vivo con DevTools/CDP.
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, '--remote-debugging-port=9333'],
});
const worker = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 20_000 }));
const extId = new URL(worker.url()).host;
console.log(`Legajo cargado (${extId}).`);

const inicio = ctx.pages()[0] ?? (await ctx.newPage());
if (!inicio.url().includes(PORTAL)) await inicio.goto(LOGIN);
console.log('\n>>> Inicia sesión en la ventana de Chromium y entra desde el menú a');
console.log('>>> Facturación electrónica → Comprobantes electrónicos emitidos (o recibidos).\n');

// Espera hasta 15 min a que alguna pestaña tenga la pantalla de consulta lista.
let cerrado = false;
ctx.on('close', () => (cerrado = true));

const bandejaDe = (p: Page) =>
  p
    .evaluate(() =>
      document.getElementById('frmPrincipal:ano')
        ? 'recibidos'
        : document.getElementById('frmPrincipal:calendarFechaDesde_input')
          ? 'emitidos'
          : null,
    )
    .catch(() => null);

const DISPARO = join(salida, 'ronda');

/** Pestaña con la pantalla de consulta lista (hasta 15 min). */
async function esperarPantalla(): Promise<Page | null> {
  for (let i = 0; i < 900 && !cerrado; i++) {
    for (const p of ctx.pages()) {
      if (!p.url().includes(PORTAL)) continue;
      if (await bandejaDe(p)) return p;
    }
    await dormir(1000);
  }
  return null;
}

/** Espera el archivo de disparo; devuelve el periodo que traiga (o ''). null si se cerró la ventana. */
async function esperarDisparo(): Promise<string | null> {
  rmSync(DISPARO, { force: true });
  while (!cerrado) {
    if (existsSync(DISPARO)) {
      const periodo = readFileSync(DISPARO, 'utf8').trim();
      rmSync(DISPARO, { force: true });
      return periodo;
    }
    await dormir(1000);
  }
  return null;
}

const encontrada = await esperarPantalla();
if (!encontrada) {
  console.error('No se abrió la pantalla de comprobantes en 15 minutos.');
  await ctx.close();
  process.exit(1);
}
let periodoForzado = '';
async function ronda(sri: Page): Promise<string> {
  const bandeja = (await bandejaDe(sri))!;
  console.log(`Pantalla detectada: ${bandeja}.`);

  // ─── Popup ─────────────────────────────────────────────────────────────────
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 380, height: 760 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForFunction(() => /Conectado|Abre SRI/.test(document.querySelector('#estado')?.textContent ?? ''), null, { timeout: 15_000 });
  const estado = (await popup.textContent('#estado')) ?? '';
  comprobar(estado.startsWith('Conectado'), 'el popup encuentra la pestaña del portal', estado.replace(/\d{10,13}/, '<RUC>'));
  comprobar(estado.includes(bandeja === 'recibidos' ? 'recibidos' : 'emitidos'), 'el popup toma la bandeja de la pantalla abierta');

  const [tipoPeriodo, ...valores] = (periodoForzado || process.env[`E2E_PERIODO_${bandeja.toUpperCase()}`] || process.env.E2E_PERIODO || (bandeja === 'emitidos' ? 'dia:2026-11-06' : 'mes:2026-10')).split(':');
  await popup.click(`[data-periodo="${tipoPeriodo}"]`);
  if (tipoPeriodo === 'dia') await popup.fill('#p-dia', valores[0]!);
  if (tipoPeriodo === 'rango') {
    await popup.fill('#p-desde', valores[0]!);
    await popup.fill('#p-hasta', valores[1]!);
  }
  if (tipoPeriodo === 'mes') {
    const [a, m] = valores[0]!.split('-');
    await popup.selectOption('#p-anio', a!);
    await popup.selectOption('#p-mes', String(Number(m)));
  }
  if (tipoPeriodo === 'anio') await popup.selectOption('#p-anio', valores[0]!);
  for (const el of await popup.$$('#campos-periodo input, #campos-periodo select')) await el.dispatchEvent('change');

  const tipos = (process.env.E2E_TIPOS ?? 'factura').split(',');
  await popup.$$eval('#tipos input', (els, ts) => els.forEach((e) => ((e as HTMLInputElement).checked = ts.includes((e as HTMLInputElement).dataset.tipo!)) || e.dispatchEvent(new Event('change'))), tipos);
  for (const t of tipos) await popup.check(`#tipos input[data-tipo="${t}"]`);
  const formatos = (process.env.E2E_FORMATOS ?? 'xml,pdf').split(',');
  for (const f of ['xml', 'pdf', 'txt']) await popup.setChecked(`#f-${f}`, formatos.includes(f));
  if (process.env.E2E_EMISOR && bandeja === 'recibidos') await popup.fill('#emisor', process.env.E2E_EMISOR);

  console.log(`Plan: ${await popup.textContent('#plan')}`);
  const descarga = sri.waitForEvent('download', { timeout: 30 * 60_000 });
  const t0 = Date.now();
  await popup.click('#descargar');

  // Progreso en consola mientras corre.
  let ultimo = '';
  const reloj = setInterval(async () => {
    const txt = [await popup.textContent('#prog-consultas'), await popup.textContent('#prog-cifras'), await popup.textContent('#prog-mensaje')].join(' · ');
    if (txt !== ultimo) console.log(`  ${txt}`);
    ultimo = txt;
  }, 2000);

  // Solo cuentan estados escritos DESPUÉS del clic: el perfil guarda el progreso de corridas anteriores.
  // Sondeo desde Node (waitForFunction no espera promesas devueltas por la función).
  const leerEstado = () =>
    popup.evaluate(async () => {
      const g = globalThis as unknown as { chrome: { storage: { local: { get(k: string): Promise<Record<string, unknown>> } } } };
      return (await g.chrome.storage.local.get('legajo:progreso'))['legajo:progreso'] as
        | { fase: string; actualizado: number; zip: string | null; mensaje: string }
        | undefined;
    });
  const terminal = (async () => {
    for (let i = 0; i < 1800; i++) {
      const e = await leerEstado().catch(() => undefined);
      if (e && e.actualizado >= t0 && ['listo', 'cancelado', 'error'].includes(e.fase) && !e.zip) return { d: null };
      await dormir(1000);
    }
    return { d: null };
  })();
  const terminado = await Promise.race([descarga.then((d) => ({ d })), terminal]);
  clearInterval(reloj);
  const segundos = Math.round((Date.now() - t0) / 1000);

  if (!terminado.d) {
    comprobar(false, 'la descarga produjo un ZIP', (await popup.textContent('#prog-mensaje')) ?? '');
  } else {
    const ruta = join(salida, terminado.d.suggestedFilename());
    await terminado.d.saveAs(ruta);
    comprobar(/^legajo_\d{13}_(emitidos|recibidos)_/.test(terminado.d.suggestedFilename()), 'nombre del ZIP', terminado.d.suggestedFilename().replace(/\d{13}/, '<RUC>'));
    const zip = unzipSync(new Uint8Array(readFileSync(ruta)));
    const nombres = Object.keys(zip);
    const xmls = nombres.filter((n) => n.endsWith('.xml'));
    const pdfs = nombres.filter((n) => n.endsWith('.pdf'));
    console.log(`ZIP: ${xmls.length} XML, ${pdfs.length} PDF, ${nombres.length - xmls.length - pdfs.length} otros, en ${segundos} s`);
    comprobar(nombres.length > 0, 'el ZIP tiene archivos');
    comprobar(nombres.every((n) => new RegExp(`^legajo/\\d{13}/${bandeja}/(\\d{4}/\\d{2}|reportes)/`).test(n)), 'rutas legajo/<RUC>/<bandeja>/<año>/<mes>/');
    const xmlMalos = xmls.filter((n) => {
      const x = strFromU8(zip[n]!);
      const clave = /_(\d{49})\.xml$/.exec(n)?.[1];
      return !(x.includes('<estado>AUTORIZADO</estado>') && clave && x.includes(clave));
    });
    const sec = (n: string) => /_(\d{49})\.\w+$/.exec(n)?.[1]?.slice(30, 39) ?? n;
    comprobar(xmlMalos.length === 0, `${xmls.length} XML autorizados y con su clave`, xmlMalos.map(sec).join(', '));
    const pdfMalos = pdfs.filter((n) => strFromU8(zip[n]!.slice(0, 4)) !== '%PDF');
    comprobar(pdfMalos.length === 0, `${pdfs.length} RIDE son PDF válidos`, pdfMalos.map(sec).join(', '));
    const claves = (ext: string) => new Set(nombres.filter((n) => n.endsWith(ext)).map(sec));
    if (formatos.includes('xml') && formatos.includes('pdf')) {
      const sinPdf = [...claves('.xml')].filter((c) => !claves('.pdf').has(c));
      comprobar(sinPdf.length === 0, 'cada XML tiene su RIDE', sinPdf.join(', '));
    }
  }

  const fallidas = await popup.$$eval('#prog-fallidas li', (ls) => ls.map((l) => l.textContent));
  comprobar(fallidas.length === 0, 'sin consultas fallidas', fallidas.join('; '));

  await popup.close();
  return bandeja;
}

let actual: Page | null = encontrada;
while (actual) {
  const hecha = await ronda(actual);
  console.log(`\n>>> Ronda de ${hecha} terminada. Esperando .e2e-out/ronda para otra ronda; cierra la ventana para terminar.\n`);
  const disparo = await esperarDisparo();
  if (disparo === null) break;
  periodoForzado = disparo;
  actual = await esperarPantalla();
}
console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
await ctx.close().catch(() => {});
process.exit(fallos.length ? 1 : 0);
