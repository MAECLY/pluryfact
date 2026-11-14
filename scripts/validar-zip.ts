/**
 * Valida un ZIP descargado con Pluryfact (`bun run validar-zip [ruta]`).
 * Sin ruta, toma el pluryfact_*.zip (o legajo_*.zip, de antes del cambio de nombre) más reciente de ~/Downloads.
 * Comprueba XML autorizados con su clave, PDF válidos, un RIDE por XML y
 * rutas por año/mes. No imprime datos personales: solo conteos y secuenciales.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';

function masReciente(): string | null {
  const dir = join(homedir(), 'Downloads');
  const zips = readdirSync(dir)
    .filter((f) => /^(pluryfact|legajo)_.*\.zip$/.test(f))
    .map((f) => ({ f: join(dir, f), t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return zips[0]?.f ?? null;
}

const ruta = process.argv[2] ?? masReciente();
if (!ruta) {
  console.error('No hay ningún pluryfact_*.zip en ~/Downloads.');
  process.exit(1);
}
const fallos: string[] = [];
const comprobar = (ok: boolean, msg: string, detalle = '') => {
  // Listas largas: los 10 primeros y cuántos más.
  const partes = detalle.split(', ').filter(Boolean);
  const corto = partes.length > 10 ? `${partes.slice(0, 10).join(', ')} y ${partes.length - 10} más` : detalle;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${msg}${corto ? ` — ${corto}` : ''}`);
  if (!ok) fallos.push(msg);
};

const nombreZip = ruta.split('/').pop()!;
console.log(`ZIP: ${nombreZip.replace(/\d{13}/, '<RUC>')} (${Math.round(statSync(ruta).size / 1024)} KB)`);
const bandeja = /_(emitidos|recibidos)_/.exec(nombreZip)?.[1] ?? '';
const zip = unzipSync(new Uint8Array(readFileSync(ruta)));
const nombres = Object.keys(zip);
const xmls = nombres.filter((n) => n.endsWith('.xml'));
const pdfs = nombres.filter((n) => n.endsWith('.pdf'));
const txts = nombres.filter((n) => n.endsWith('.txt'));
console.log(`Contenido: ${xmls.length} XML, ${pdfs.length} PDF, ${txts.length} TXT`);

const sec = (n: string) => /_(\d{49})\.\w+$/.exec(n)?.[1]?.slice(30, 39) ?? n;
comprobar(nombres.length > 0, 'el ZIP tiene archivos');
comprobar(
  nombres.every((n) => new RegExp(`^(pluryfact|legajo)/\\d{13}/${bandeja}/(\\d{4}/\\d{2}|reportes)/`).test(n)),
  'rutas pluryfact/<RUC>/<bandeja>/<año>/<mes>/',
);
const xmlMalos = xmls.filter((n) => {
  const x = strFromU8(zip[n]!);
  const clave = /_(\d{49})\.xml$/.exec(n)?.[1];
  return !(x.includes('<estado>AUTORIZADO</estado>') && clave && x.includes(clave));
});
comprobar(xmlMalos.length === 0, `${xmls.length} XML autorizados y con su clave`, xmlMalos.map(sec).join(', '));
const pdfMalos = pdfs.filter((n) => strFromU8(zip[n]!.slice(0, 4)) !== '%PDF');
comprobar(pdfMalos.length === 0, `${pdfs.length} RIDE son PDF válidos`, pdfMalos.map(sec).join(', '));
if (xmls.length && pdfs.length) {
  const conPdf = new Set(pdfs.map(sec));
  const sinPdf = xmls.map(sec).filter((s) => !conPdf.has(s));
  comprobar(sinPdf.length === 0, 'cada XML tiene su RIDE', sinPdf.join(', '));
}
// Cruce con el reporte: cada clave del TXT dentro del periodo debería tener su XML.
for (const t of txts) {
  const lineas = new TextDecoder('iso-8859-1').decode(zip[t]!).split(/\r?\n/).filter(Boolean);
  const cab = lineas.shift()?.split('\t') ?? [];
  const i = cab.indexOf('CLAVE_ACCESO');
  const claves = lineas.map((l) => l.split('\t')[i]?.trim()).filter((c): c is string => !!c && /^\d{49}$/.test(c));
  const enZip = new Set(xmls.map((n) => /_(\d{49})\.xml$/.exec(n)?.[1]));
  const faltan = claves.filter((c) => !enZip.has(c));
  comprobar(faltan.length === 0, `${t.split('/').pop()}: ${claves.length - faltan.length} de ${claves.length} claves con XML`, faltan.map((c) => c.slice(30, 39)).join(', '));
}
console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
