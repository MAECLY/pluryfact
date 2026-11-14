/**
 * Capturas en crudo de Pluryfact para la Chrome Web Store.
 *
 * Abre el Chromium de Playwright con la extensión compilada, siembra
 * chrome.storage.local con un trabajo y un historial de ejemplo (RUC y claves
 * ficticios) y fotografía el popup y la página completa a 2x en
 * store-assets/raw/. No abre SRI en Línea: sin una pestaña del portal, la
 * extensión muestra «Abre SRI en Línea…»; para las capturas se pinta el estado
 * conectado (el mismo texto que pone main.ts cuando hay pestaña) y se oculta
 * ese aviso.
 *
 * Requisitos:
 *   bun run build                  # deja .output/chrome-mv3
 *   bunx playwright install chromium
 *
 * Uso: bun store-assets/scripts/capture.ts
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type BrowserContext, type Page } from 'playwright';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXT_DIR = join(ROOT, '.output', 'chrome-mv3');
const RAW_DIR = join(ROOT, 'store-assets', 'raw');
const SCALE = 2;

// Datos de ejemplo. El RUC no corresponde a ningún contribuyente.
const RUC = '0999999999001';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIA = 86_400_000;

type EstadoPaso = 'pendiente' | 'consultando' | 'descargando' | 'sin-datos' | 'ok' | 'fallida';

function trabajo(estados: EstadoPaso[], extra: Record<string, unknown>) {
  const ahora = Date.now();
  const ok = estados.filter((s) => s === 'ok').length;
  return {
    fase: 'descargando',
    consultasHechas: ok,
    consultasTotal: estados.length,
    encontrados: ok * 21,
    descargados: ok * 42,
    fallidos: 0,
    mensaje: '',
    errores: [],
    inicio: ahora - 9 * 60_000,
    pasos: estados.map((estado, indice) => ({
      indice,
      etiqueta: MESES[indice],
      estado,
      comprobantes: estado === 'ok' ? 18 + ((indice * 7) % 9) : 0,
      fallidos: 0,
    })),
    actividad: [],
    esperaHasta: null,
    consultasFallidas: [],
    ruc: RUC,
    bandeja: 'recibidos',
    verificacion: false,
    zip: null,
    actualizado: ahora,
    trabajo: {
      bandeja: 'recibidos',
      periodo: { tipo: 'anio', anio: 2025 },
      tipos: ['factura'],
      emisor: '',
      formatos: { xml: true, pdf: true, txt: false },
    },
    ...extra,
  };
}

const enCurso = () =>
  trabajo(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'descargando', 'pendiente', 'pendiente', 'pendiente', 'pendiente'], {
    mensaje: 'Descargando agosto: 64 de 120 comprobantes.',
  });

function historial() {
  const ahora = Date.now();
  const listo = (id: string, hace: number, periodo: unknown, bandeja: string, n: number) => ({
    ...trabajo(Array(12).fill('ok'), {}),
    id,
    terminado: ahora - hace,
    fase: 'listo',
    bandeja,
    encontrados: n,
    descargados: n * 2,
    consultasHechas: 12,
    zip: `pluryfact_${RUC}_${bandeja}_2024.zip`,
    trabajo: { bandeja, periodo, tipos: ['factura'], emisor: '', formatos: { xml: true, pdf: true, txt: false } },
  });
  const cortado = {
    ...trabajo(['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'fallida', 'pendiente', 'pendiente', 'pendiente', 'pendiente'], {}),
    id: 'h-cortado',
    terminado: ahora - 2 * 3_600_000,
    fase: 'error',
    mensaje: 'La sesión del SRI caducó. Inicia sesión y pulsa Reanudar.',
    pendientes: [7, 8, 9, 10, 11],
    zip: `pluryfact_${RUC}_recibidos_2025_ene-jul.zip`,
  };
  return [
    cortado,
    listo('h-emitidos', DIA + 3_600_000, { tipo: 'mes', anio: 2025, mes: 10 }, 'emitidos', 64),
    listo('h-2024', 4 * DIA, { tipo: 'anio', anio: 2024 }, 'recibidos', 1180),
  ];
}

async function lanzar(): Promise<{ ctx: BrowserContext; id: string; perfil: string }> {
  const perfil = mkdtempSync(join(tmpdir(), 'pluryfact-store-'));
  const ctx = await chromium.launchPersistentContext(perfil, {
    headless: false,
    deviceScaleFactor: SCALE,
    args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker'));
  return { ctx, id: new URL(sw.url()).host, perfil };
}

async function sembrar(page: Page, datos: Record<string, unknown>) {
  await page.evaluate(async (d) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(d);
  }, datos);
}

/** El estado que la extensión pinta cuando encuentra la pestaña del SRI. */
async function conectado(page: Page) {
  await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('#conexion-texto');
    if (t) {
      t.textContent = 'Conectado a Comprobantes recibidos en SRI en Línea.';
      t.dataset.ok = 'true';
    }
    document.querySelector<HTMLElement>('#ir-sri')?.setAttribute('hidden', '');
    const c = document.querySelector<HTMLElement>('#comprobacion');
    if (c && !c.textContent?.startsWith('Ya hay')) {
      c.textContent = 'Lista para consultar Comprobantes recibidos con tu sesión del SRI.';
      c.dataset.ok = 'true';
      const b = document.querySelector<HTMLButtonElement>('#descargar');
      if (b) b.disabled = false;
    }
    const p = document.querySelector<HTMLElement>('#pantalla');
    if (p) {
      p.textContent = 'Recibidos';
      p.dataset.conectado = 'true';
    }
    document.querySelector<HTMLElement>('#estado')?.setAttribute('hidden', '');
    for (const b of document.querySelectorAll<HTMLButtonElement>('button')) if (b.textContent?.startsWith('Reanudar')) b.disabled = false;
  });
}

async function abrir(ctx: BrowserContext, url: string, ancho: number, alto: number, esquema: 'light' | 'dark') {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: ancho, height: alto });
  await page.emulateMedia({ colorScheme: esquema, reducedMotion: 'reduce' });
  await page.goto(url);
  await page.waitForTimeout(700);
  return page;
}

async function guardar(page: Page, nombre: string, selector?: string) {
  const path = join(RAW_DIR, nombre);
  if (selector) await page.locator(selector).screenshot({ path });
  else await page.screenshot({ path });
  console.log(`  store-assets/raw/${nombre}`);
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  const { ctx, id, perfil } = await lanzar();
  const base = `chrome-extension://${id}`;
  try {
    const semilla = await abrir(ctx, `${base}/pluryfact.html`, 800, 600, 'light');
    await sembrar(semilla, {});
    await semilla.close();

    // 1. Popup: formulario, conectado.
    let p = await abrir(ctx, `${base}/popup.html`, 360, 600, 'light');
    await conectado(p);
    await guardar(p, 'popup-form.png', 'body');
    await p.close();

    // 2. Popup: un año en curso.
    p = await abrir(ctx, `${base}/pluryfact.html`, 800, 600, 'light');
    await sembrar(p, { 'pluryfact:progreso': enCurso() });
    await p.close();
    p = await abrir(ctx, `${base}/popup.html`, 360, 600, 'light');
    await conectado(p);
    await guardar(p, 'popup-progreso.png', 'body');
    await p.close();

    // 3. Página completa: Nueva descarga, claro y oscuro.
    p = await abrir(ctx, `${base}/pluryfact.html`, 800, 600, 'light');
    await sembrar(p, { 'pluryfact:historial': historial() });
    await p.close();
    for (const esquema of ['light', 'dark'] as const) {
      p = await abrir(ctx, `${base}/pluryfact.html#nueva`, 1280, 800, esquema);
      await conectado(p);
      await guardar(p, `pagina-nueva-${esquema}.png`);
      await p.close();
    }

    // 4. Descargas: historial con una descarga cortada que se puede reanudar.
    p = await abrir(ctx, `${base}/pluryfact.html#descargas`, 1280, 800, 'light');
    await conectado(p);
    await guardar(p, 'pagina-descargas.png');
    await p.close();

    // 5. Avanzado: los ocho temas.
    p = await abrir(ctx, `${base}/pluryfact.html#avanzado`, 1280, 800, 'light');
    await conectado(p);
    await guardar(p, 'pagina-temas.png');
    await p.close();

    // 6. Acerca de: cómo cuida tus datos y permisos.
    p = await abrir(ctx, `${base}/pluryfact.html#acerca`, 1280, 900, 'light');
    await conectado(p);
    await guardar(p, 'pagina-acerca.png');
    await p.close();
  } finally {
    await ctx.close();
    rmSync(perfil, { recursive: true, force: true });
  }
}

await main();
