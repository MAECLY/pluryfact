import './style.css';
import { AJUSTES_POR_DEFECTO, CLAVE_AJUSTES, normalizarAjustes, type Ajustes } from '@/lib/ajustes';
import type { Trabajo } from '@/lib/cola';
import { agregar, agrupar, CLAVE_HISTORIAL, textoBuscable, tieneProblemas, type EntradaHistorial, type FiltroEstado } from '@/lib/historial';
import { CLAVE_PROGRESO, type EstadoTrabajo } from '@/lib/mensajeria';
import { migrarClavesAntiguas } from '@/lib/migracion';
import { aplicarTema, TEMAS, type IdTema } from '@/lib/temas';
import { PREFIJO_REGISTRO, type Entrada } from '@/lib/registro';
import { pintarFichero } from '@/ui/fichero';
import { montarFormulario, textoEstimacion } from '@/ui/formulario';
import { cancelar, conectar, iniciar, irAlSri, type Conexion } from '@/ui/sri';
import { textoPlanImpresion } from '@/lib/seleccion-impresion';
import { enMarcha, fraseEstado, lineaImpresion, pintarTarjeta, refrescarCifras, resumenTexto } from '@/ui/tarjeta';
import { montarPluryprint } from './pluryprint';
import { hora, miles, tituloTrabajo } from '@/ui/textos';

// Página completa de Pluryfact: Nueva descarga, Descargas (como chrome://downloads),
// Avanzado y Acerca de. Todo el estado vive en storage.local y se sincroniza
// con el popup por storage.onChanged.

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
type Seccion = 'nueva' | 'descargas' | 'avanzado' | 'acerca';
const SECCIONES: Seccion[] = ['nueva', 'descargas', 'avanzado', 'acerca'];

let conexion: Conexion = { pestana: null, pagina: null, problema: null };
let actual: EstadoTrabajo | undefined;
let historial: EntradaHistorial[] = [];
let filtro: FiltroEstado = 'todas';
let busqueda = '';

// ---------------------------------------------------------------- navegación

function mostrar(s: Seccion) {
  for (const x of SECCIONES) {
    $(`#sec-${x}`).hidden = x !== s;
    document.querySelector(`[data-seccion="${x}"]`)?.toggleAttribute('aria-current', x === s);
  }
  document.title = `Pluryfact · ${s === 'nueva' ? 'Nueva descarga' : s === 'descargas' ? 'Descargas' : s === 'avanzado' ? 'Avanzado' : 'Acerca de'}`.replace(' · ', ': ');
}
const desdeHash = (): Seccion => (SECCIONES.includes(location.hash.slice(1) as Seccion) ? (location.hash.slice(1) as Seccion) : 'nueva');
window.addEventListener('hashchange', () => mostrar(desdeHash()));

// --------------------------------------------------------------- conexión

function pintarConexion() {
  const t = $('#conexion-texto');
  const ir = $<HTMLButtonElement>('#ir-sri');
  if (conexion.pagina?.bandeja) {
    t.textContent = `Conectado a Comprobantes ${conexion.pagina.bandeja} en SRI en Línea.`;
    t.dataset.ok = 'true';
    ir.hidden = true;
  } else {
    t.textContent = conexion.problema ?? 'Buscando la pestaña del SRI…';
    t.dataset.ok = 'false';
    ir.hidden = false;
  }
}
$('#ir-sri').addEventListener('click', () => irAlSri(conexion));

async function reconectar() {
  conexion = await conectar();
  pintarConexion();
  if (conexion.pagina?.bandeja) formulario.ponerBandeja(conexion.pagina.bandeja);
  pintarResumen();
  pintarReanudar();
  pintarHistorial();
}
// La página puede quedar abierta mucho tiempo: se reconecta al volver a ella.
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reconectar());

// ----------------------------------------------------------- nueva descarga

const formulario = montarFormulario($('#formulario'), () => pintarResumen());

function pintarResumen() {
  const plan = formulario.plan();
  $('#plan').textContent = plan.texto;
  $('#plan').dataset.error = String(!plan.valido);
  $('#estimacion').textContent = plan.valido ? textoEstimacion(plan.estimacion) : '';
  const enCurso = !!actual && enMarcha(actual);
  $('#comprobacion').textContent = enCurso
    ? 'Ya hay una descarga en curso. Puedes seguirla en Descargas.'
    : conexion.pagina?.bandeja
      ? `Lista para consultar Comprobantes ${conexion.pagina.bandeja} con tu sesión del SRI.`
      : (conexion.problema ?? '');
  $('#comprobacion').dataset.ok = String(!!conexion.pagina?.bandeja && !enCurso);
  const planImpresion = $('#plan-impresion');
  planImpresion.hidden = !formulario.imprimir();
  planImpresion.textContent = formulario.imprimir() ? textoPlanImpresion(ajustes.pluryprint) : '';
  $<HTMLButtonElement>('#descargar').disabled = !plan.valido || !conexion.pagina?.bandeja || enCurso;
}

async function lanzar(t: Trabajo) {
  const error = await iniciar(conexion, t);
  if (error) {
    $('#comprobacion').textContent = error;
    $('#comprobacion').dataset.ok = 'false';
    return false;
  }
  location.hash = 'descargas';
  return true;
}
$('#descargar').addEventListener('click', () => lanzar(formulario.leerTrabajo()));

// ---------------------------------------------------------- reanudar

/** Periodos que faltan de la última descarga, si quedó incompleta y no hay otra en curso. */
function pendientesDe(e: EstadoTrabajo | undefined): number[] {
  if (!e || enMarcha(e) || !e.trabajo || !e.pendientes?.length) return [];
  return ['error', 'cancelado', 'listo'].includes(e.fase) ? e.pendientes : [];
}

function unidad(e: EstadoTrabajo, n: number) {
  if ((e.trabajo?.tipos.length ?? 1) > 1) return n === 1 ? 'consulta' : 'consultas';
  const porDia = e.trabajo?.bandeja === 'emitidos' || e.trabajo?.periodo.tipo === 'dia';
  return porDia ? (n === 1 ? 'día' : 'días') : n === 1 ? 'mes' : 'meses';
}

/** Aviso en Nueva descarga y Descargas cuando la última descarga quedó incompleta. */
function pintarReanudar() {
  const e = actual;
  const pendientes = pendientesDe(e);
  document.querySelectorAll<HTMLElement>('[data-reanudar]').forEach((caja) => {
    caja.hidden = !pendientes.length || !e;
    if (!pendientes.length || !e) return;
    const n = pendientes.length;
    caja.querySelector('.reanudar-titulo')!.textContent = `${tituloTrabajo(e.trabajo)} quedó incompleta.`;
    const listo = conexion.pagina?.bandeja === e.trabajo?.bandeja;
    caja.querySelector('.reanudar-detalle')!.textContent = listo
      ? `Faltan ${n} ${unidad(e, n)}. Reanudar baja solo eso y arma otro ZIP.`
      : `Faltan ${n} ${unidad(e, n)}. Para reanudar, inicia sesión en el SRI y entra a Comprobantes ${e.trabajo?.bandeja}.`;
    const b = caja.querySelector<HTMLButtonElement>('button')!;
    b.textContent = `Reanudar ${n} ${unidad(e, n)}`;
    b.disabled = !listo;
    b.onclick = () => e.trabajo && lanzar({ ...e.trabajo, soloIndices: pendientes });
  });
}

/**
 * La última descarga entra al historial aunque la haya hecho una versión
 * anterior de Pluryfact (que no guardaba historial).
 */
async function archivarUltima() {
  const e = actual;
  if (!e || enMarcha(e) || !e.inicio || historial.some((h) => h.id === String(e.inicio))) return;
  await guardarHistorial(agregar(historial, { ...e, id: String(e.inicio), terminado: e.actualizado || Date.now() }, ajustes.diasHistorial, Date.now()));
}

// --------------------------------------------------------------- descargas

function pintarActiva() {
  const activa = !!actual && enMarcha(actual);
  $('#activa').hidden = !activa;
  $('#nav-indicador').hidden = !actual;
  if (actual) $('#nav-indicador').dataset.estado = activa ? 'activo' : tieneProblemas(actual) ? 'error' : 'listo';
  if (activa && actual) pintarTarjeta($('#tarjeta-activa'), actual, true);
  pintarResumen();
  pintarReanudar();
}
$('#cancelar').addEventListener('click', async () => {
  await cancelar(conexion);
  const f = $('#tarjeta-activa').querySelector('.estado-frase');
  if (f) f.textContent = 'Cancelando…';
});

function boton(texto: string, clase: string, accion: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clase;
  b.textContent = texto;
  b.addEventListener('click', accion);
  return b;
}

async function guardarHistorial(nuevo: EntradaHistorial[]) {
  await browser.storage.local.set({ [CLAVE_HISTORIAL]: nuevo });
}

function filaHistorial(e: EntradaHistorial): HTMLElement {
  const li = document.createElement('li');
  li.className = 'fila';
  li.dataset.id = e.id;
  li.dataset.problemas = String(tieneProblemas(e));

  const cab = document.createElement('div');
  cab.className = 'fila-cabecera';
  const titulo = document.createElement('h3');
  titulo.className = 'fila-titulo';
  titulo.textContent = tituloTrabajo(e.trabajo);
  const meta = document.createElement('p');
  meta.className = 'fila-meta';
  meta.textContent = `Terminó a las ${hora(e.terminado)}. ${miles(e.descargados)} archivos${e.fallidos ? `, ${miles(e.fallidos)} sin bajar` : ''}.`;
  cab.append(titulo, meta);

  const ol = document.createElement('ol');
  ol.className = 'fichero mini';
  pintarFichero(ol, e.pasos ?? []);

  const impresion = lineaImpresion(e);
  const lineaPp = impresion && document.createElement('p');
  if (lineaPp && impresion) {
    lineaPp.className = 'linea-impresion';
    lineaPp.dataset.estado = impresion.estado;
    lineaPp.textContent = impresion.texto;
  }

  const estado = document.createElement('p');
  estado.className = 'fila-estado';
  estado.dataset.problemas = String(tieneProblemas(e));
  estado.textContent = e.fase === 'listo' && !e.fallidos ? fraseEstado(e) : (e.mensaje.replace(/ Se guardó lo ya descargado.*$/, '') || fraseEstado(e));

  const acciones = document.createElement('div');
  acciones.className = 'fila-acciones';
  const pendientes = e.pendientes ?? [];
  const mismaPantalla = conexion.pagina?.bandeja === e.trabajo?.bandeja;
  const ocupado = !!actual && enMarcha(actual);
  const esLaUltima = !!actual && String(actual.inicio) === e.id;
  if (pendientes.length && e.trabajo && !ocupado && !esLaUltima) {
    const r = boton(`Reanudar lo que faltó (${pendientes.length})`, 'boton boton-principal boton-chico', () => e.trabajo && lanzar({ ...e.trabajo, soloIndices: pendientes }));
    r.disabled = !mismaPantalla;
    if (!mismaPantalla) r.title = `Entra a Comprobantes ${e.trabajo.bandeja} en el portal para reanudar`;
    acciones.append(r);
  }
  // PluryPrint: directo desde la memoria de la pestaña del SRI, o eligiendo el ZIP.
  if (ajustes.pluryprint.activado && e.zip) {
    if (conexion.pagina?.enMemoria === Number(e.id)) {
      const b = boton('Imprimir con PluryPrint', 'boton boton-secundario boton-chico', () => void pluryprint.abrirPanelMemoria(e));
      b.disabled = !!conexion.pagina.imprimiendo;
      acciones.append(b);
    } else {
      const b = boton('Imprimir su ZIP…', 'enlace', () => pluryprint.abrirSelectorZip());
      b.title = `Elige ${e.zip} en tu carpeta de descargas`;
      acciones.append(b);
    }
  }
  if (e.trabajo)
    acciones.append(
      boton('Repetir con los mismos filtros', 'enlace', () => {
        const { soloIndices: _sin, ...base } = e.trabajo!;
        void _sin;
        formulario.cargar(base);
        location.hash = 'nueva';
      }),
    );
  acciones.append(
    boton('Copiar resumen', 'enlace', async (ev?: unknown) => {
      await navigator.clipboard.writeText(resumenTexto(e)).catch(() => {});
      void ev;
    }),
    boton('Quitar de la lista', 'enlace', async () => {
      await guardarHistorial(historial.filter((h) => h.id !== e.id));
    }),
  );
  const nota = document.createElement('p');
  nota.className = 'ayuda';
  nota.textContent = 'Quitar de la lista no borra el ZIP de tu computadora.';

  const det = document.createElement('details');
  det.className = 'fila-detalle';
  const sum = document.createElement('summary');
  sum.textContent = 'Detalle mes a mes';
  const tarjeta = document.createElement('div');
  tarjeta.className = 'progreso';
  det.append(sum, tarjeta);
  det.addEventListener('toggle', () => det.open && !tarjeta.childElementCount && pintarTarjeta(tarjeta, e, true, 'h3'));

  li.append(cab, ol, estado, ...(lineaPp ? [lineaPp] : []), acciones, det);
  if (e.fallidos || pendientes.length) li.append(nota);
  return li;
}

function pintarHistorial() {
  const cont = $('#historial');
  // Conserva las filas que el usuario tenía abiertas.
  const abiertas = new Set([...cont.querySelectorAll<HTMLElement>('li.fila')].filter((li) => li.querySelector('details')?.open).map((li) => li.dataset.id));
  cont.textContent = '';
  const cuentas = {
    todas: historial.length,
    problemas: historial.filter(tieneProblemas).length,
    completas: historial.filter((h) => !tieneProblemas(h)).length,
  };
  document.querySelectorAll<HTMLButtonElement>('[data-filtro]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.filtro === filtro));
    b.querySelector('span')!.textContent = String(cuentas[b.dataset.filtro as FiltroEstado]);
  });
  $('#barra-historial').hidden = !historial.length;
  $('#sin-historial').hidden = !!historial.length || (!!actual && enMarcha(actual));

  const q = busqueda.trim().toLowerCase();
  const visibles = historial.filter(
    (h) =>
      (filtro === 'todas' || (filtro === 'problemas') === tieneProblemas(h)) && (!q || textoBuscable(h).includes(q) || tituloTrabajo(h.trabajo).toLowerCase().includes(q)),
  );
  for (const g of agrupar(visibles, Date.now())) {
    const h = document.createElement('h2');
    h.className = 'grupo-fecha';
    h.textContent = g.grupo;
    const ol = document.createElement('ol');
    ol.className = 'filas';
    for (const e of g.items) {
      const fila = filaHistorial(e);
      if (abiertas.has(e.id)) fila.querySelector('details')!.open = true;
      ol.append(fila);
    }
    cont.append(h, ol);
  }
  if (historial.length && !visibles.length) {
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = 'Ninguna descarga coincide con la búsqueda.';
    cont.append(p);
  }
}
$('#buscar').addEventListener('input', (ev) => {
  busqueda = (ev.target as HTMLInputElement).value;
  pintarHistorial();
});
document.querySelectorAll<HTMLButtonElement>('[data-filtro]').forEach((b) =>
  b.addEventListener('click', () => {
    filtro = b.dataset.filtro as FiltroEstado;
    pintarHistorial();
  }),
);

// ---------------------------------------------------------------- avanzado

let ajustes: Ajustes = AJUSTES_POR_DEFECTO;
const pluryprint = montarPluryprint({
  ajustes: () => ajustes,
  guardar: (cambio) => guardarAjustes({ pluryprint: { ...ajustes.pluryprint, ...cambio } }),
  conexion: () => conexion,
  alCambiar: () => pintarHistorial(),
});
function montarTemas() {
  const caja = $('#aj-temas');
  for (const t of TEMAS) {
    const l = document.createElement('label');
    l.className = 'tema';
    l.dataset.brand = t.id;
    const r = Object.assign(document.createElement('input'), { type: 'radio', name: 'tema', value: t.id, id: `aj-tema-${t.id}` });
    r.addEventListener('change', () => guardarAjustes({ tema: t.id as IdTema }));
    const nombre = Object.assign(document.createElement('span'), { className: 'tema-nombre', textContent: t.nombre });
    nombre.style.fontFamily = `'${t.fuente}'`;
    const muestra = document.createElement('span');
    muestra.className = 'tema-muestra';
    muestra.setAttribute('aria-hidden', 'true');
    for (const c of t.muestra) muestra.append(Object.assign(document.createElement('i'), { style: `background:${c}` }));
    l.append(r, nombre, muestra);
    caja.append(l);
  }
}
montarTemas();

function pintarAjustes() {
  aplicarTema(document, ajustes.tema);
  document.querySelectorAll<HTMLInputElement>('input[name="tema"]').forEach((r) => (r.checked = r.value === ajustes.tema));
  document.querySelectorAll<HTMLInputElement>('input[name="ritmo"]').forEach((r) => (r.checked = r.value === ajustes.ritmo));
  $<HTMLInputElement>('#aj-notificaciones').checked = ajustes.notificaciones;
  const dias = $<HTMLSelectElement>('#aj-dias');
  if (![...dias.options].some((o) => o.value === String(ajustes.diasHistorial))) dias.add(new Option(`Guardar ${ajustes.diasHistorial} días`, String(ajustes.diasHistorial)));
  dias.value = String(ajustes.diasHistorial);
  pluryprint.pintar();
  formulario.ponerPluryprint(ajustes.pluryprint);
}
async function guardarAjustes(cambio: Partial<Ajustes>) {
  ajustes = normalizarAjustes({ ...ajustes, ...cambio });
  await browser.storage.local.set({ [CLAVE_AJUSTES]: ajustes });
}
document.querySelectorAll<HTMLInputElement>('input[name="ritmo"]').forEach((r) =>
  r.addEventListener('change', () => guardarAjustes({ ritmo: r.value as Ajustes['ritmo'] })),
);
$('#aj-notificaciones').addEventListener('change', (ev) => guardarAjustes({ notificaciones: (ev.target as HTMLInputElement).checked }));
$('#aj-dias').addEventListener('change', (ev) => guardarAjustes({ diasHistorial: Number((ev.target as HTMLSelectElement).value) }));

async function textoRegistro(): Promise<string> {
  const todo = await browser.storage.local.get(null);
  const entradas = Object.entries(todo)
    .filter(([k]) => k.startsWith(PREFIJO_REGISTRO))
    .flatMap(([, v]) => v as Entrada[])
    .sort((a, b) => a.t - b.t);
  const cab = `Pluryfact ${browser.runtime.getManifest().version} · ${navigator.userAgent}\n${entradas.length} entradas\n\n`;
  return cab + entradas.map((e) => `${new Date(e.t).toISOString()} ${e.n.padEnd(5)} ${e.o.padEnd(10)} ${e.m}`).join('\n');
}
$('#copiar-registro').addEventListener('click', async () => {
  const texto = await textoRegistro();
  try {
    await navigator.clipboard.writeText(texto);
    $('#registro-estado').textContent = 'Registro copiado.';
  } catch {
    $('#registro-estado').textContent = 'No se pudo copiar. Usa «Descargar registro».';
  }
});
$('#bajar-registro').addEventListener('click', async () => {
  const url = URL.createObjectURL(new Blob([await textoRegistro()], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `pluryfact-registro-${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});

/** Botón que pide confirmación en el propio botón (sin diálogos). */
function conConfirmacion(sel: string, pregunta: string, accion: () => Promise<string>) {
  const b = $<HTMLButtonElement>(sel);
  const original = b.textContent ?? '';
  let armado = false;
  b.addEventListener('click', async () => {
    if (!armado) {
      armado = true;
      b.textContent = pregunta;
      setTimeout(() => {
        armado = false;
        b.textContent = original;
      }, 5000);
      return;
    }
    armado = false;
    b.textContent = original;
    $('#borrar-estado').textContent = await accion();
  });
}
conConfirmacion('#borrar-historial', '¿Seguro? Pulsa otra vez', async () => {
  await browser.storage.local.remove(CLAVE_HISTORIAL);
  return 'Historial borrado.';
});
conConfirmacion('#borrar-todo', '¿Borrar todo? Pulsa otra vez', async () => {
  if (actual && enMarcha(actual)) return 'Hay una descarga en curso. Cancélala antes de borrar todo.';
  await browser.storage.local.clear();
  ajustes = AJUSTES_POR_DEFECTO;
  pintarAjustes();
  return 'Se borraron el historial, los ajustes y el registro de diagnóstico.';
});

// ---------------------------------------------------------------- arranque

browser.storage.onChanged.addListener((cambios, area) => {
  if (area !== 'local') return;
  if (cambios[CLAVE_PROGRESO]) {
    const faseAntes = actual?.fase;
    actual = cambios[CLAVE_PROGRESO].newValue as EstadoTrabajo | undefined;
    pintarActiva();
    if (actual?.fase !== faseAntes) {
      pintarHistorial();
      // Al terminar, la pestaña del SRI guarda el resultado en memoria: se vuelve a preguntar para ofrecer «Imprimir con PluryPrint».
      if (actual && !enMarcha(actual)) void reconectar();
    }
  }
  if (cambios[CLAVE_HISTORIAL]) {
    historial = (cambios[CLAVE_HISTORIAL].newValue as EntradaHistorial[] | undefined) ?? [];
    pintarHistorial();
    pluryprint.alCambiarHistorial(historial);
  }
  if (cambios[CLAVE_AJUSTES]) {
    ajustes = normalizarAjustes(cambios[CLAVE_AJUSTES].newValue);
    pintarAjustes();
  }
});
setInterval(() => actual && enMarcha(actual) && refrescarCifras($('#tarjeta-activa'), actual), 1000);

$('#version').textContent = `Versión ${browser.runtime.getManifest().version}`;
mostrar(desdeHash());
void (async () => {
  await migrarClavesAntiguas(browser.storage.local);
  const v = await browser.storage.local.get([CLAVE_PROGRESO, CLAVE_HISTORIAL, CLAVE_AJUSTES]);
  actual = v[CLAVE_PROGRESO] as EstadoTrabajo | undefined;
  historial = (v[CLAVE_HISTORIAL] as EntradaHistorial[] | undefined) ?? [];
  ajustes = normalizarAjustes(v[CLAVE_AJUSTES]);
  pintarAjustes();
  pintarActiva();
  pintarHistorial();
  await archivarUltima();
  await reconectar();
  await pluryprint.comprobar();
  // Desde el popup: pluryfact.html?imprimir=<inicio>#descargas abre el panel de esa descarga.
  const pedido = new URLSearchParams(location.search).get('imprimir');
  const fila = pedido && historial.find((h) => h.id === pedido);
  if (fila) await pluryprint.abrirPanelMemoria(fila);
})();
