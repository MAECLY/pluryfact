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

type Pestana = 'form' | 'descargas';
let pestanaActiva: Pestana = 'form';

function mostrarPestana(cual: Pestana) {
  pestanaActiva = cual;
  for (const [id, panel] of [['form', 'panel-form'], ['descargas', 'panel-descargas']] as const) {
    $(`#tab-${id}`).setAttribute('aria-selected', String(id === cual));
    $(`#${panel}`).hidden = id !== cual;
  }
  actualizarBoton();
}

function actualizarBoton() {
  // Mientras descarga, el formulario queda bloqueado y se ve la pestaña Descargas.
  const tabForm = $<HTMLButtonElement>('#tab-form');
  tabForm.disabled = enCurso;
  tabForm.title = enCurso ? 'Disponible al terminar la descarga en curso' : '';
  if (enCurso && pestanaActiva === 'form') mostrarPestana('descargas');

  const b = $<HTMLButtonElement>('#descargar');
  const planOk = !$('#plan').className.includes('text-err');
  if (enCurso) {
    b.textContent = 'Cancelar descarga';
    b.className = 'btn btn-s flex-1';
    b.disabled = false;
  } else if (pestanaActiva === 'descargas') {
    b.textContent = 'Nueva descarga';
    b.className = 'btn btn-p flex-1';
    b.disabled = false;
  } else {
    b.textContent = 'Descargar ZIP';
    b.className = 'btn btn-p flex-1';
    b.disabled = !pagina?.bandeja || !planOk;
  }
}

const pedirEstado = async (id: number) => {
  try {
    return (await browser.tabs.sendMessage(id, { tipo: 'estado' } satisfies Peticion)) as EstadoPagina;
  } catch {
    return null;
  }
};

/** Activa Legajo en una pestaña del SRI abierta antes de instalar o recargar la extensión. */
async function inyectar(id: number) {
  await browser.scripting.executeScript({ target: { tabId: id }, files: ['/content-scripts/conductor.js'], world: 'MAIN' });
  await browser.scripting.executeScript({ target: { tabId: id }, files: ['/content-scripts/sri.js'] });
}

async function conectar() {
  // Primero la pestaña activa de esta ventana, si es del SRI; si no, cualquier pestaña del SRI.
  const [activa] = await browser.tabs.query({ active: true, currentWindow: true });
  const delSri = await browser.tabs.query({ url: PATRON_SRI });
  const t = delSri.find((x) => x.id === activa?.id) ?? delSri.find((x) => x.active) ?? delSri[0];
  pestana = t?.id ?? null;
  pagina = null;
  if (pestana !== null) {
    pagina = await pedirEstado(pestana);
    if (!pagina) {
      estado('Activando Legajo en la pestaña del SRI…');
      try {
        await inyectar(pestana);
        await new Promise((r) => setTimeout(r, 300));
        pagina = await pedirEstado(pestana);
      } catch (e) {
        estado(`No se pudo activar Legajo en la pestaña del SRI: ${e instanceof Error ? e.message : String(e)}`, 'err');
      }
    }
  }
  if (pestana === null) {
    estado('No hay ninguna pestaña de SRI en Línea. Ábrela → Facturación electrónica → Comprobantes recibidos o emitidos.', 'warn');
  } else if (!pagina) {
    estado('La pestaña del SRI no responde. Vuelve a entrar desde el menú del portal a Comprobantes recibidos o emitidos.', 'warn');
  } else if (!pagina.bandeja) {
    estado('La pestaña del SRI no está en Comprobantes recibidos ni emitidos. Entra desde el menú del portal.', 'warn');
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

const FASE: Record<string, { texto: string; tono: string }> = {
  consultando: { texto: 'Consultando', tono: 'accent' },
  descargando: { texto: 'Descargando', tono: 'accent' },
  empaquetando: { texto: 'Armando ZIP', tono: 'accent' },
  listo: { texto: 'Listo', tono: 'ok' },
  cancelado: { texto: 'Cancelado', tono: 'warn' },
  error: { texto: 'Detenido', tono: 'err' },
};
const ICONO_PASO: Record<string, string> = {
  pendiente: '·',
  consultando: '⟳',
  descargando: '↓',
  'sin-datos': '–',
  ok: '✓',
  fallida: '✕',
};
const TONO_PASO: Record<string, string> = {
  pendiente: 'text-muted',
  consultando: 'text-accent',
  descargando: 'text-accent',
  'sin-datos': 'text-muted',
  ok: 'text-ok',
  fallida: 'text-err',
};

let actual: EstadoTrabajo | undefined;
const SIN_SENAL_MS = 60_000;

const duracion = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
};
const hora = (t: number) => new Date(t).toLocaleTimeString('es-EC', { hour12: false });

function li(texto: string, clase: string) {
  const el = document.createElement('li');
  el.textContent = texto;
  el.className = clase;
  return el;
}

/** Se repinta cada segundo: pulso de vida, cuenta regresiva y tiempo transcurrido. */
function pintarPulso() {
  const p = actual;
  if (!p) return;
  const ahora = Date.now();
  const activo = ['consultando', 'descargando', 'empaquetando'].includes(p.fase);
  const latido = $('#prog-latido');
  const texto = $('#prog-pulso-texto');
  const silencio = ahora - p.actualizado;
  if (!activo) {
    latido.dataset.vivo = 'false';
    latido.className = 'latido opacity-40';
    texto.textContent = `terminó a las ${hora(p.actualizado)}`;
  } else if (p.esperaHasta && p.esperaHasta > ahora) {
    latido.dataset.vivo = 'true';
    latido.className = 'latido';
    texto.textContent = `siguiente paso en ${Math.ceil((p.esperaHasta - ahora) / 1000)} s`;
  } else if (silencio > SIN_SENAL_MS) {
    latido.dataset.vivo = 'false';
    latido.className = 'latido bg-warn';
    texto.textContent = `sin señal hace ${duracion(silencio)}`;
  } else {
    latido.dataset.vivo = 'true';
    latido.className = 'latido';
    texto.textContent = `activo · señal hace ${duracion(silencio)}`;
  }
  const transcurrido = (activo ? ahora : p.actualizado) - (p.inicio || p.actualizado);
  let estimado = '';
  if (activo && p.consultasHechas > 0 && p.consultasTotal > p.consultasHechas) {
    const resto = (transcurrido / p.consultasHechas) * (p.consultasTotal - p.consultasHechas);
    estimado = ` · faltan ~${duracion(resto)}`;
  }
  $('#prog-tiempo').textContent = `Transcurrido ${duracion(transcurrido)}${estimado}`;
}

function pintarProgreso(p: EstadoTrabajo | undefined) {
  actual = p;
  const caja = $('#progreso');
  const indicador = $('#tab-indicador');
  $('#sin-descargas').hidden = !!p;
  if (!p) {
    caja.hidden = true;
    indicador.hidden = true;
    return;
  }
  caja.hidden = false;
  enCurso = ['consultando', 'descargando', 'empaquetando'].includes(p.fase) && (pagina?.ocupado ?? true);
  indicador.hidden = false;
  indicador.dataset.estado = enCurso ? 'activo' : p.fase === 'listo' ? 'listo' : 'error';

  const fase = FASE[p.fase] ?? { texto: p.fase, tono: 'muted' };
  const pill = $('#prog-fase');
  pill.textContent = fase.texto;
  pill.className = `pill bg-bg text-${fase.tono}`;

  // La consulta en curso cuenta como media para que la barra avance durante las descargas.
  const enCursoParcial = p.pasos?.some((x) => x.estado === 'descargando' || x.estado === 'consultando') ? 0.5 : 0;
  const pct = p.fase === 'listo' ? 100 : p.consultasTotal ? Math.min(99, Math.round(((p.consultasHechas + enCursoParcial) / p.consultasTotal) * 100)) : 0;
  $('#prog-barra').style.width = `${pct}%`;
  $('#prog-consultas').textContent = `Consulta ${Math.min(p.consultasHechas + (enCursoParcial ? 1 : 0), p.consultasTotal)} de ${p.consultasTotal} · ${pct} %`;
  $('#prog-cifras').textContent = `${p.encontrados} comprobantes · ${p.descargados} archivos${p.fallidos ? ` · ${p.fallidos} fallidos` : ''}`;

  const msg = $('#prog-mensaje');
  msg.textContent = p.verificacion ? 'El SRI muestra una verificación en la pestaña del portal.' : p.mensaje;
  msg.className = `text-[12.5px] font-semibold text-${p.fase === 'error' ? 'err' : p.fase === 'listo' ? 'ok' : p.verificacion ? 'warn' : 'ink'}`;

  const pasos = $('#prog-pasos');
  pasos.innerHTML = '';
  for (const x of p.pasos ?? []) {
    const fila = document.createElement('li');
    fila.className = 'paso';
    fila.dataset.estado = x.estado;
    const izq = document.createElement('span');
    izq.className = `flex items-center gap-1.5 ${TONO_PASO[x.estado] ?? ''}`;
    izq.textContent = `${ICONO_PASO[x.estado] ?? '·'} ${x.etiqueta}`;
    const der = document.createElement('span');
    der.className = 'font-mono text-muted tabular-nums';
    der.textContent =
      x.estado === 'sin-datos' ? 'sin comprobantes' : x.estado === 'pendiente' ? '' : x.estado === 'fallida' ? 'falló' : x.estado === 'consultando' ? 'consultando…' : `${x.comprobantes}`;
    fila.append(izq, der);
    pasos.append(fila);
  }
  pasos.querySelector('[data-estado="consultando"],[data-estado="descargando"]')?.scrollIntoView({ block: 'nearest' });

  const act = $('#prog-actividad');
  act.innerHTML = '';
  for (const a of [...(p.actividad ?? [])].reverse().slice(0, 25)) {
    act.append(li(`${hora(a.t)}  ${a.texto}`, a.nivel === 'error' ? 'text-err' : a.nivel === 'aviso' ? 'text-warn' : 'text-muted'));
  }

  $('#prog-fallidas').innerHTML = '';
  for (const f of [...(p.consultasFallidas ?? []), ...(p.errores ?? [])]) $('#prog-fallidas').append(li(f, ''));
  pintarPulso();
  actualizarBoton();
}

setInterval(pintarPulso, 1000);

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

$('#tab-form').addEventListener('click', () => !enCurso && mostrarPestana('form'));
$('#tab-descargas').addEventListener('click', () => mostrarPestana('descargas'));

$('#descargar').addEventListener('click', async () => {
  if (!enCurso && pestanaActiva === 'descargas') {
    mostrarPestana('form');
    return;
  }
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
  mostrarPestana('descargas');
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
