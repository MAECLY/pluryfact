import './style.css';
import { CLAVE_PROGRESO, type EstadoTrabajo } from '@/lib/mensajeria';
import { CLAVE_AJUSTES, normalizarAjustes } from '@/lib/ajustes';
import { migrarClavesAntiguas } from '@/lib/migracion';
import { aplicarTema } from '@/lib/temas';
import { montarFormulario } from '@/ui/formulario';
import { cancelar, conectar, iniciar, type Conexion } from '@/ui/sri';
import { enMarcha, pintarTarjeta, refrescarCifras } from '@/ui/tarjeta';

// El popup es el acceso rápido: lanzar una descarga y ver la que está en curso.
// La gestión completa (historial, ajustes, Acerca de) vive en pluryfact.html.

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let conexion: Conexion = { pestana: null, pagina: null, problema: null };
let actual: EstadoTrabajo | undefined;
let enCurso = false;
type Pestana = 'form' | 'descargas';
let pestanaActiva: Pestana = 'form';

const formulario = montarFormulario($('#formulario'), () => pintarPlan());

function aviso(texto: string | null) {
  $('#estado').hidden = !texto;
  $('#estado').textContent = texto ?? '';
}

function pintarPlan() {
  const p = formulario.plan();
  $('#plan').textContent = p.texto;
  $('#plan').dataset.error = String(!p.valido);
  actualizarAcciones();
}

function mostrarPestana(cual: Pestana) {
  pestanaActiva = cual;
  for (const [id, panel] of [['form', 'panel-form'], ['descargas', 'panel-descargas']] as const) {
    $(`#tab-${id}`).setAttribute('aria-selected', String(id === cual));
    $(`#${panel}`).hidden = id !== cual;
  }
  actualizarAcciones();
}

function pendientesDe(e: EstadoTrabajo | undefined): number[] {
  if (!e || enCurso || !e.trabajo || !e.pendientes?.length) return [];
  return ['error', 'cancelado', 'listo'].includes(e.fase) ? e.pendientes : [];
}

function unidad(e: EstadoTrabajo, n: number) {
  if ((e.trabajo?.tipos.length ?? 1) > 1) return n === 1 ? 'consulta' : 'consultas';
  const porDia = e.trabajo?.bandeja === 'emitidos' || e.trabajo?.periodo.tipo === 'dia';
  return porDia ? (n === 1 ? 'día' : 'días') : n === 1 ? 'mes' : 'meses';
}

function actualizarAcciones() {
  const tabForm = $<HTMLButtonElement>('#tab-form');
  tabForm.disabled = enCurso;
  tabForm.title = enCurso ? 'Disponible cuando termine la descarga en curso' : '';
  if (enCurso && pestanaActiva === 'form') return mostrarPestana('descargas');
  $('#cerrar').hidden = !enCurso;

  const principal = $<HTMLButtonElement>('#descargar');
  const pendientes = pendientesDe(actual);
  $('#secundario').hidden = true;
  principal.disabled = false;
  principal.className = 'boton boton-principal';
  if (enCurso) {
    principal.textContent = 'Cancelar';
    principal.className = 'boton boton-secundario';
  } else if (pestanaActiva === 'descargas') {
    if (pendientes.length && actual) {
      principal.textContent = `Reanudar ${pendientes.length} ${unidad(actual, pendientes.length)}`;
      principal.disabled = conexion.pagina?.bandeja !== actual.trabajo?.bandeja;
      $('#secundario').hidden = false;
    } else principal.textContent = 'Nueva descarga';
  } else {
    principal.textContent = 'Descargar';
    principal.disabled = !conexion.pagina?.bandeja || !formulario.plan().valido;
  }
}

function pintarProgreso(e: EstadoTrabajo | undefined) {
  actual = e;
  $('#sin-descargas').hidden = !!e;
  $('#tarjeta').hidden = !e;
  $('#tab-indicador').hidden = !e;
  if (!e) return actualizarAcciones();
  enCurso = enMarcha(e) && (conexion.pagina?.ocupado ?? true);
  $('#tab-indicador').dataset.estado = enCurso ? 'activo' : e.fase === 'listo' && !e.fallidos ? 'listo' : 'error';
  pintarTarjeta($('#tarjeta'), e, false);
  actualizarAcciones();
}

async function lanzar(t: Parameters<typeof iniciar>[1]) {
  const error = await iniciar(conexion, t);
  if (error) return aviso(error);
  aviso(null);
  enCurso = true;
  if (conexion.pagina) conexion.pagina.ocupado = true;
  mostrarPestana('descargas');
}

$('#tab-form').addEventListener('click', () => !enCurso && mostrarPestana('form'));
$('#tab-descargas').addEventListener('click', () => mostrarPestana('descargas'));
$('#secundario').addEventListener('click', () => mostrarPestana('form'));
$('#abrir').addEventListener('click', async () => {
  await browser.tabs.create({ url: browser.runtime.getURL(`/pluryfact.html#${pestanaActiva === 'form' ? 'nueva' : 'descargas'}`) });
  window.close();
});
$('#descargar').addEventListener('click', async () => {
  if (enCurso) {
    await cancelar(conexion);
    const frase = $('#tarjeta').querySelector('.estado-frase');
    if (frase) frase.textContent = 'Cancelando…';
    return;
  }
  if (pestanaActiva === 'descargas') {
    const pendientes = pendientesDe(actual);
    if (pendientes.length && actual?.trabajo) return lanzar({ ...actual.trabajo, soloIndices: pendientes });
    return mostrarPestana('form');
  }
  await lanzar(formulario.leerTrabajo());
});

setInterval(() => actual && refrescarCifras($('#tarjeta'), actual), 1000);
browser.storage.onChanged.addListener((cambios, area) => {
  if (area === 'local' && cambios[CLAVE_AJUSTES]) aplicarTema(document, normalizarAjustes(cambios[CLAVE_AJUSTES].newValue).tema);
  if (area === 'local' && cambios[CLAVE_PROGRESO]) pintarProgreso(cambios[CLAVE_PROGRESO].newValue as EstadoTrabajo | undefined);
});

pintarPlan();
void migrarClavesAntiguas(browser.storage.local)
  .then(() => browser.storage.local.get(CLAVE_AJUSTES))
  .then((v) => aplicarTema(document, normalizarAjustes(v[CLAVE_AJUSTES]).tema))
  .then(conectar)
  .then(async (c) => {
  conexion = c;
  aviso(c.problema);
  if (c.pagina?.bandeja) {
    const pantalla = $('#pantalla');
    pantalla.textContent = c.pagina.bandeja === 'recibidos' ? 'Recibidos' : 'Emitidos';
    pantalla.dataset.conectado = 'true';
    pantalla.title = `Conectado a la pestaña del SRI (${c.pagina.ruc})`;
    formulario.ponerBandeja(c.pagina.bandeja);
  }
  enCurso = !!c.pagina?.ocupado;
  const guardado = (await browser.storage.local.get(CLAVE_PROGRESO))[CLAVE_PROGRESO] as EstadoTrabajo | undefined;
  pintarProgreso(guardado);
  if (guardado && (enCurso || pendientesDe(guardado).length)) mostrarPestana('descargas');
});
