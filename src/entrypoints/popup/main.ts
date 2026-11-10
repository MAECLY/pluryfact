import './style.css';
import type { Trabajo } from '@/lib/cola';
import { CLAVE_PROGRESO, type EstadoPagina, type EstadoTrabajo, type Peticion } from '@/lib/mensajeria';
import { consultasEmitidos, consultasRecibidos, type Periodo } from '@/lib/periodo';
import { ETIQUETA_TIPO, type Bandeja, type Fecha, type TipoComprobante } from '@/lib/types';
import { construirPeriodo, hoyEcuador, type TipoPeriodo } from './estado';

const TIPOS_RECIBIDOS: TipoComprobante[] = ['factura', 'liquidacion', 'nota-credito', 'nota-debito', 'retencion'];
const TIPOS_EMITIDOS: TipoComprobante[] = [...TIPOS_RECIBIDOS.slice(0, 4), 'guia-remision', 'retencion'];

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const hoy = hoyEcuador();

let bandeja: Bandeja = 'recibidos';
let tipoPeriodo: TipoPeriodo = 'mes';
const tiposMarcados = new Set<TipoComprobante>(['factura']);

const iso = (f: Fecha) => `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;

function campo(id: string, etiqueta: string, html: string) {
  return `<label class="flex flex-col gap-1"><span class="etiqueta">${etiqueta}</span>${html.replace('<x', `<x id="${id}"`)}</label>`;
}

function pintarCamposPeriodo() {
  const anioOpts = Array.from({ length: hoy.anio - 2021 }, (_, i) => hoy.anio - i)
    .map((a) => `<option>${a}</option>`)
    .join('');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mesOpts = meses.map((m, i) => `<option value="${i + 1}"${i + 1 === hoy.mes ? ' selected' : ''}>${m}</option>`).join('');
  const fecha = (id: string, etq: string) =>
    campo(id, etq, `<x class="campo" type="date" max="${iso(hoy)}" value="${iso(hoy)}">`).replace(/<x/g, '<input');
  const sel = (id: string, etq: string, opts: string) =>
    campo(id, etq, `<x class="campo">${opts}</select>`).replace('<x', '<select');
  const cont = $('#campos-periodo');
  cont.innerHTML =
    tipoPeriodo === 'dia'
      ? fecha('p-dia', 'Fecha')
      : tipoPeriodo === 'rango'
        ? fecha('p-desde', 'Desde') + fecha('p-hasta', 'Hasta')
        : tipoPeriodo === 'mes'
          ? sel('p-anio', 'Año', anioOpts) + sel('p-mes', 'Mes', mesOpts)
          : sel('p-anio', 'Año', anioOpts);
  cont.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', pintarPlan));
}

function pintarTipos() {
  const lista = bandeja === 'recibidos' ? TIPOS_RECIBIDOS : TIPOS_EMITIDOS;
  for (const t of [...tiposMarcados]) if (!lista.includes(t)) tiposMarcados.delete(t);
  $('#tipos').innerHTML = lista
    .map(
      (t) =>
        `<label class="flex items-center gap-1.5"><input type="checkbox" class="accent-accent" data-tipo="${t}"${tiposMarcados.has(t) ? ' checked' : ''}>${ETIQUETA_TIPO[t]}</label>`,
    )
    .join('');
  $('#tipos').querySelectorAll<HTMLInputElement>('input').forEach((el) =>
    el.addEventListener('change', () => {
      const t = el.dataset.tipo as TipoComprobante;
      if (el.checked) tiposMarcados.add(t);
      else tiposMarcados.delete(t);
      pintarPlan();
    }),
  );
}

function leerPeriodo(): Periodo {
  const v = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  return construirPeriodo(tipoPeriodo, {
    dia: v('p-dia')?.value,
    desde: v('p-desde')?.value,
    hasta: v('p-hasta')?.value,
    anio: v('p-anio')?.value,
    mes: v('p-mes')?.value,
  });
}

function pintarPlan() {
  const plan = $('#plan');
  try {
    const p = leerPeriodo();
    const n = tiposMarcados.size;
    if (!n) throw new RangeError('Elige al menos un tipo de comprobante');
    const porTipo = bandeja === 'recibidos' ? consultasRecibidos(p, hoy).length : consultasEmitidos(p, hoy).length;
    const total = porTipo * n;
    plan.className = plan.className.replace(/text-\w+/g, 'text-muted');
    const consultas = `${total} ${total === 1 ? 'consulta' : 'consultas'} al SRI`;
    plan.textContent =
      bandeja === 'recibidos'
        ? `${consultas} · ${total === 1 ? '1 verificación' : `${total} verificaciones`} reCAPTCHA invisible`
        : `${consultas} (una por día y tipo) · sin captcha`;
  } catch (e) {
    plan.className = plan.className.replace(/text-\w+/g, 'text-err');
    plan.textContent = e instanceof Error ? e.message : String(e);
  }
  if (typeof actualizarBoton === 'function') actualizarBoton();
}

function pulsar(grupo: string, valor: string) {
  document.querySelectorAll<HTMLButtonElement>(`[data-${grupo}]`).forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset[grupo] === valor)),
  );
}

document.querySelectorAll<HTMLButtonElement>('[data-bandeja]').forEach((b) =>
  b.addEventListener('click', () => {
    bandeja = b.dataset.bandeja as Bandeja;
    pulsar('bandeja', bandeja);
    $('#sec-emisor').hidden = bandeja === 'emitidos';
    pintarTipos();
    pintarPlan();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-periodo]').forEach((b) =>
  b.addEventListener('click', () => {
    tipoPeriodo = b.dataset.periodo as TipoPeriodo;
    pulsar('periodo', tipoPeriodo);
    pintarCamposPeriodo();
    pintarPlan();
  }),
);

// ---- Conexión con la pestaña del portal y progreso ----

const PATRON_SRI = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*';
const NOMBRE_PANTALLA: Record<Bandeja, string> = { recibidos: 'Comprobantes recibidos', emitidos: 'Comprobantes emitidos' };
let pestana: number | null = null;
let pagina: EstadoPagina | null = null;
let enCurso = false;

function estado(texto: string, tono: 'muted' | 'warn' | 'err' | 'ok' = 'muted') {
  const el = $('#estado');
  el.textContent = texto;
  el.className = `text-[12px] text-${tono}`;
}

function actualizarBoton() {
  const b = $<HTMLButtonElement>('#descargar');
  b.textContent = enCurso ? 'Cancelar' : 'Descargar ZIP';
  b.className = `btn ${enCurso ? 'btn-s' : 'btn-p'} flex-1`;
  const planOk = !$('#plan').className.includes('text-err');
  b.disabled = !enCurso && (!pagina?.bandeja || !planOk);
}

async function conectar() {
  const tabs = await browser.tabs.query({ url: PATRON_SRI });
  const t = tabs.find((x) => x.active) ?? tabs[0];
  pestana = t?.id ?? null;
  pagina = null;
  if (pestana !== null) {
    try {
      pagina = (await browser.tabs.sendMessage(pestana, { tipo: 'estado' } satisfies Peticion)) as EstadoPagina;
    } catch {
      pagina = null;
    }
  }
  if (!pagina?.bandeja) {
    estado('Abre SRI en Línea → Facturación electrónica → Comprobantes recibidos o emitidos.', 'warn');
  } else {
    bandeja = pagina.bandeja;
    pulsar('bandeja', bandeja);
    document.querySelectorAll<HTMLButtonElement>('[data-bandeja]').forEach((b) => {
      b.disabled = b.dataset.bandeja !== bandeja;
      b.title = b.disabled ? 'Cambia de pantalla en el portal' : '';
    });
    $('#sec-emisor').hidden = bandeja === 'emitidos';
    pintarTipos();
    pintarPlan();
    estado(`Conectado · ${pagina.ruc} · ${NOMBRE_PANTALLA[bandeja]}`, 'ok');
  }
  enCurso = !!pagina?.ocupado;
  actualizarBoton();
}

function pintarProgreso(p: EstadoTrabajo | undefined) {
  const caja = $('#progreso');
  if (!p) {
    caja.hidden = true;
    return;
  }
  caja.hidden = false;
  enCurso = ['consultando', 'descargando', 'empaquetando'].includes(p.fase) && (pagina?.ocupado ?? true);
  const pct = p.consultasTotal ? Math.round((p.consultasHechas / p.consultasTotal) * 100) : 0;
  $('#prog-consultas').textContent = `Consulta ${p.consultasHechas} de ${p.consultasTotal}`;
  $('#prog-pct').textContent = `${pct} %`;
  $('#prog-barra').style.width = `${p.fase === 'listo' ? 100 : pct}%`;
  $('#prog-cifras').textContent = `${p.encontrados} comprobantes · ${p.descargados} archivos${p.fallidos ? ` · ${p.fallidos} fallidos` : ''}`;
  const msg = $('#prog-mensaje');
  msg.textContent = p.verificacion ? 'El SRI pide verificar el captcha en la pestaña del portal.' : p.mensaje;
  msg.className = `text-[12px] text-${p.fase === 'error' ? 'err' : p.fase === 'listo' ? 'ok' : p.verificacion ? 'warn' : 'muted'}`;
  $('#prog-fallidas').innerHTML = '';
  for (const f of p.consultasFallidas ?? []) {
    const li = document.createElement('li');
    li.textContent = f;
    $('#prog-fallidas').append(li);
  }
  actualizarBoton();
}

function leerTrabajo(): Trabajo {
  return {
    bandeja,
    periodo: leerPeriodo(),
    tipos: [...tiposMarcados],
    emisor: bandeja === 'recibidos' ? $<HTMLInputElement>('#emisor').value.trim() : '',
    formatos: {
      xml: $<HTMLInputElement>('#f-xml').checked,
      pdf: $<HTMLInputElement>('#f-pdf').checked,
      txt: $<HTMLInputElement>('#f-txt').checked,
    },
  };
}

$('#descargar').addEventListener('click', async () => {
  if (pestana === null) return;
  if (enCurso) {
    await browser.tabs.sendMessage(pestana, { tipo: 'cancelar' } satisfies Peticion);
    estado('Cancelando…', 'warn');
    return;
  }
  const t = leerTrabajo();
  if (!t.formatos.xml && !t.formatos.pdf && !t.formatos.txt) {
    estado('Elige al menos un formato.', 'err');
    return;
  }
  const r = (await browser.tabs.sendMessage(pestana, { tipo: 'iniciar', trabajo: t } satisfies Peticion)) as { ok: boolean; error?: string };
  if (!r?.ok) {
    estado(r?.error ?? 'No se pudo iniciar la descarga', 'err');
    return;
  }
  enCurso = true;
  if (pagina) pagina.ocupado = true;
  actualizarBoton();
});

browser.storage.onChanged.addListener((cambios, area) => {
  if (area === 'local' && cambios[CLAVE_PROGRESO]) pintarProgreso(cambios[CLAVE_PROGRESO].newValue as EstadoTrabajo | undefined);
});

pintarCamposPeriodo();
pintarTipos();
pintarPlan();
void conectar().then(async () => {
  const guardado = await browser.storage.local.get(CLAVE_PROGRESO);
  pintarProgreso(guardado[CLAVE_PROGRESO] as EstadoTrabajo | undefined);
});
