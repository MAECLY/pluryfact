import type { Ajustes, AjustesPluryprint } from '@/lib/ajustes';
import { abrirPuertoPluryprint, pedirPermisoNativo, quitarPermisoNativo, tienePermisoNativo, versionPluryfact } from '@/lib/conexion-pluryprint';
import { consultarPluryprint, enviarAPluryprint, necesitaConfirmacion, textoEntregado } from '@/lib/envio-pluryprint';
import type { EntradaHistorial } from '@/lib/historial';
import { ErrorPluryprint, URL_PLURYPRINT, type CodigoError, type Impresora, type Perfil } from '@/lib/pluryprint';
import { etiquetaDeZip, leerZip, MAX_ZIP_DESCOMPRIMIDO, seleccionarParaImprimir, textoSeleccion, type Seleccion } from '@/lib/seleccion-impresion';
import { pedirImpresion, type Conexion } from '@/ui/sri';
import { lineaImpresion } from '@/ui/tarjeta';
import { miles, tituloTrabajo } from '@/ui/textos';

/**
 * PluryPrint en la página completa: el estado en la barra lateral, la sección
 * de Avanzado y el panel «Imprimir con PluryPrint» de Descargas (para un ZIP
 * elegido por el usuario o para el último resultado que sigue en memoria de
 * la pestaña del SRI).
 */

export type EstadoPluryprint =
  | { tipo: 'no-conectado' }
  | { tipo: 'comprobando' }
  | { tipo: 'conectado'; version: string; impresoras: Impresora[]; perfiles: Perfil[] }
  | { tipo: 'problema'; codigo: CodigoError; mensaje: string };

export interface Contexto {
  ajustes(): Ajustes;
  guardar(cambio: Partial<AjustesPluryprint>): Promise<void>;
  conexion(): Conexion;
  /** El estado o los ajustes cambiaron: hay que repintar lo que depende de ellos. */
  alCambiar(): void;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const TEXTO_ACCION: Record<AjustesPluryprint['accion'], string> = {
  configure: 'PluryPrint se abrirá para que revises y confirmes antes de imprimir.',
  queue: 'Quedarán en la cola de PluryPrint, sin imprimirse todavía.',
  'print-default': 'Se imprimirán directo con el perfil elegido.',
};

export function montarPluryprint(ctx: Contexto) {
  let estado: EstadoPluryprint = { tipo: 'no-conectado' };
  const pp = () => ctx.ajustes().pluryprint;

  // ------------------------------------------------------------ estado

  function ponerEstado(e: EstadoPluryprint) {
    estado = e;
    pintar();
    ctx.alCambiar();
  }

  const aProblema = (e: unknown): EstadoPluryprint => {
    const err = e instanceof ErrorPluryprint ? e : new ErrorPluryprint('internal', String(e));
    return { tipo: 'problema', codigo: err.codigo, mensaje: err.message };
  };

  /** Saludo silencioso: alimenta la barra lateral y las listas de Avanzado. */
  async function comprobar() {
    if (!pp().activado) return ponerEstado({ tipo: 'no-conectado' });
    if (!(await tienePermisoNativo())) return ponerEstado(aProblema(new ErrorPluryprint('sin_permiso')));
    ponerEstado({ tipo: 'comprobando' });
    try {
      const r = await consultarPluryprint(abrirPuertoPluryprint, versionPluryfact());
      ponerEstado({ tipo: 'conectado', version: r.hola.hostVersion, impresoras: r.impresoras, perfiles: r.perfiles });
    } catch (e) {
      ponerEstado(aProblema(e));
    }
  }

  // El permiso se pide en el mismo clic: Chrome exige un gesto del usuario.
  $('#pp-conectar').addEventListener('click', async () => {
    const concedido = await pedirPermisoNativo();
    if (!concedido)
      return ponerEstado({ tipo: 'problema', codigo: 'sin_permiso', mensaje: 'Chrome no concedió el permiso. Sin él, Pluryfact no puede hablar con PluryPrint.' });
    ponerEstado({ tipo: 'comprobando' });
    try {
      const r = await consultarPluryprint(abrirPuertoPluryprint, versionPluryfact());
      await ctx.guardar({ activado: true });
      ponerEstado({ tipo: 'conectado', version: r.hola.hostVersion, impresoras: r.impresoras, perfiles: r.perfiles });
    } catch (e) {
      ponerEstado(aProblema(e));
    }
  });
  $('#pp-comprobar').addEventListener('click', () => void comprobar());
  $('#pp-desconectar').addEventListener('click', async () => {
    await ctx.guardar({ activado: false });
    await quitarPermisoNativo();
    ponerEstado({ tipo: 'no-conectado' });
  });

  // ------------------------------------------------------------ Avanzado

  document.querySelectorAll<HTMLInputElement>('input[name="pp-contenido"]').forEach((r) =>
    r.addEventListener('change', () => ctx.guardar({ contenido: r.value as AjustesPluryprint['contenido'] })),
  );
  document.querySelectorAll<HTMLInputElement>('input[name="pp-accion"]').forEach((r) =>
    r.addEventListener('change', () => ctx.guardar({ accion: r.value as AjustesPluryprint['accion'] })),
  );
  $('#pp-xml-respaldo').addEventListener('change', (ev) => ctx.guardar({ xmlSiFaltaRide: (ev.target as HTMLInputElement).checked }));
  $('#pp-reporte').addEventListener('change', (ev) => ctx.guardar({ incluirReporte: (ev.target as HTMLInputElement).checked }));
  $('#pp-orden').addEventListener('change', (ev) => ctx.guardar({ orden: (ev.target as HTMLSelectElement).value as AjustesPluryprint['orden'] }));
  $('#pp-perfil').addEventListener('change', (ev) => ctx.guardar({ perfilId: (ev.target as HTMLSelectElement).value || null }));
  $('#pp-impresora').addEventListener('change', (ev) => ctx.guardar({ impresoraId: (ev.target as HTMLSelectElement).value || null }));
  $('#pp-copias').addEventListener('change', (ev) => {
    const v = (ev.target as HTMLInputElement).value;
    void ctx.guardar({ copias: v ? Number(v) : null });
  });
  $('#pp-duplex').addEventListener('change', (ev) => ctx.guardar({ duplex: ((ev.target as HTMLSelectElement).value || null) as AjustesPluryprint['duplex'] }));
  $('#pp-color').addEventListener('change', (ev) => ctx.guardar({ color: ((ev.target as HTMLSelectElement).value || null) as AjustesPluryprint['color'] }));

  /** Opciones de un select de perfil o impresora: el vacío, las conocidas y la guardada aunque PluryPrint no responda. */
  function llenar(sel: HTMLSelectElement, vacio: string, items: Array<{ id: string; name: string; isDefault: boolean }>, actual: string | null) {
    sel.textContent = '';
    sel.add(new Option(vacio, ''));
    for (const i of items) sel.add(new Option(`${i.name}${i.isDefault ? ' (predeterminado)' : ''}`, i.id));
    if (actual && !items.some((i) => i.id === actual)) sel.add(new Option(`${actual} (guardado)`, actual));
    sel.value = actual ?? '';
  }

  function pintar() {
    const a = pp();
    // «Borrar todos los datos» o Desconectar desde otra pestaña: sin activar no se muestra «conectado».
    if (!a.activado && estado.tipo === 'conectado') estado = { tipo: 'no-conectado' };
    // Barra lateral
    const lat = $('#pp-lateral');
    lat.dataset.estado = estado.tipo === 'problema' ? 'problema' : estado.tipo;
    lat.textContent =
      estado.tipo === 'conectado'
        ? 'PluryPrint: conectado'
        : estado.tipo === 'comprobando'
          ? 'PluryPrint: comprobando…'
          : estado.tipo === 'problema'
            ? estado.codigo === 'no_instalado'
              ? 'PluryPrint: no instalado'
              : 'PluryPrint: sin respuesta'
            : 'PluryPrint: no conectado';
    lat.title = estado.tipo === 'conectado' ? `PluryPrint ${estado.version}` : estado.tipo === 'problema' ? estado.mensaje : '';

    // Avanzado: estado y botones
    const est = $('#pp-estado');
    est.dataset.estado = estado.tipo;
    est.textContent = '';
    if (estado.tipo === 'no-conectado')
      est.textContent = 'No conectado. Al conectar, Chrome te pedirá permiso para «comunicarse con aplicaciones nativas que cooperan»; Pluryfact solo lo usa con PluryPrint.';
    else if (estado.tipo === 'comprobando') est.textContent = 'Buscando PluryPrint en este equipo…';
    else if (estado.tipo === 'conectado') est.textContent = `Conectado con PluryPrint ${estado.version}.`;
    else {
      est.append(estado.mensaje);
      if (estado.codigo === 'no_instalado' || estado.codigo === 'version_incompatible' || estado.codigo === 'unknown_type') {
        const enlace = Object.assign(document.createElement('a'), { href: URL_PLURYPRINT, target: '_blank', rel: 'noopener', textContent: 'Descargar PluryPrint' });
        est.append(' ', enlace, '.');
      }
    }
    $('#pp-conectar').hidden = a.activado;
    $('#pp-comprobar').hidden = !a.activado || estado.tipo === 'comprobando';
    $('#pp-desconectar').hidden = !a.activado;
    $('#pp-opciones').hidden = !a.activado;

    // Avanzado: opciones
    document.querySelectorAll<HTMLInputElement>('input[name="pp-contenido"]').forEach((r) => (r.checked = r.value === a.contenido));
    document.querySelectorAll<HTMLInputElement>('input[name="pp-accion"]').forEach((r) => (r.checked = r.value === a.accion));
    const respaldo = $<HTMLInputElement>('#pp-xml-respaldo');
    respaldo.checked = a.xmlSiFaltaRide;
    respaldo.disabled = a.contenido !== 'ride';
    $<HTMLInputElement>('#pp-reporte').checked = a.incluirReporte;
    $<HTMLSelectElement>('#pp-orden').value = a.orden;
    const conectado = estado.tipo === 'conectado' ? estado : null;
    llenar($<HTMLSelectElement>('#pp-perfil'), 'El predeterminado de PluryPrint', conectado?.perfiles ?? [], a.perfilId);
    llenar($<HTMLSelectElement>('#pp-impresora'), 'La del perfil', conectado?.impresoras ?? [], a.impresoraId);
    const copias = $<HTMLInputElement>('#pp-copias');
    if (document.activeElement !== copias) copias.value = a.copias === null ? '' : String(a.copias);
    $<HTMLSelectElement>('#pp-duplex').value = a.duplex ?? '';
    $<HTMLSelectElement>('#pp-color').value = a.color ?? '';

    // Descargas
    $('#pp-zip').hidden = !a.activado;
  }

  // ------------------------------------------------------------ panel de Descargas

  type Origen = { tipo: 'zip'; nombre: string; seleccion: Seleccion } | { tipo: 'memoria'; entrada: EntradaHistorial; archivos: number };
  let origen: Origen | null = null;
  let envio: AbortController | null = null;
  let armado = false;
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const panel = $('#pp-panel');
  const enviar = $<HTMLButtonElement>('#pp-panel-enviar');
  const cerrarBtn = $<HTMLButtonElement>('#pp-panel-cerrar');
  const progreso = $<HTMLProgressElement>('#pp-panel-progreso');

  function abrirPanel(o: Origen, origenTexto: string, resumen: { principal: string; avisos: string[] }) {
    origen = o;
    armado = false;
    panel.hidden = false;
    $('#pp-panel-origen').textContent = origenTexto;
    $('#pp-panel-resumen').textContent = resumen.principal;
    const avisos = $('#pp-panel-avisos');
    avisos.textContent = '';
    for (const t of resumen.avisos) avisos.append(Object.assign(document.createElement('li'), { textContent: t }));
    const n = o.tipo === 'zip' ? o.seleccion.archivos.length : o.archivos;
    $('#pp-panel-accion').textContent = `${TEXTO_ACCION[pp().accion]} Puedes cambiarlo en Avanzado.`;
    progreso.hidden = true;
    progreso.value = 0;
    ponerEstadoPanel('', '');
    enviar.hidden = false;
    enviar.disabled = !n;
    enviar.textContent = 'Enviar a PluryPrint';
    cerrarBtn.textContent = 'Cancelar';
    panel.scrollIntoView({ block: 'nearest' });
    enviar.focus();
  }

  function ponerEstadoPanel(texto: string, tipo: '' | 'enviando' | 'entregado' | 'error') {
    const e = $('#pp-panel-estado');
    e.textContent = texto;
    e.dataset.estado = tipo;
  }

  function cerrarPanel() {
    envio?.abort();
    envio = null;
    origen = null;
    panel.hidden = true;
  }

  function terminar(texto: string, tipo: 'entregado' | 'error') {
    envio = null;
    ponerEstadoPanel(texto, tipo);
    progreso.hidden = tipo !== 'entregado';
    if (tipo === 'entregado') progreso.value = progreso.max;
    enviar.hidden = tipo === 'entregado';
    enviar.disabled = false;
    enviar.textContent = 'Volver a intentar';
    cerrarBtn.textContent = 'Cerrar';
  }

  cerrarBtn.addEventListener('click', cerrarPanel);

  enviar.addEventListener('click', async () => {
    if (!origen || envio) return;
    const n = origen.tipo === 'zip' ? origen.seleccion.archivos.length : origen.archivos;
    // Imprimir directo muchos documentos: confirmación en el propio botón, como «Borrar todo».
    const confirmar = necesitaConfirmacion(pp(), n);
    if (confirmar && !armado) {
      armado = true;
      enviar.textContent = `¿Imprimir ${miles(n)} documentos ya? Pulsa otra vez`;
      clearTimeout(reloj);
      reloj = setTimeout(() => {
        armado = false;
        enviar.textContent = 'Enviar a PluryPrint';
      }, 5000);
      return;
    }
    clearTimeout(reloj);
    armado = false;
    enviar.disabled = true;
    cerrarBtn.textContent = 'Detener';

    if (origen.tipo === 'memoria') {
      const r = await pedirImpresion(ctx.conexion(), Number(origen.entrada.id), confirmar);
      if (!r.ok) return terminar(r.error, 'error');
      ponerEstadoPanel('Enviando a PluryPrint desde la pestaña del SRI…', 'enviando');
      cerrarBtn.textContent = 'Cerrar';
      return; // el avance llega por el historial (alCambiarHistorial)
    }

    const o = origen;
    envio = new AbortController();
    progreso.hidden = false;
    progreso.max = 1;
    progreso.value = 0;
    ponerEstadoPanel('Conectando con PluryPrint…', 'enviando');
    try {
      const r = await enviarAPluryprint({
        abrirPuerto: abrirPuertoPluryprint,
        clientVersion: versionPluryfact(),
        ajustes: pp(),
        seleccion: o.seleccion,
        etiqueta: etiquetaDeZip(o.nombre),
        confirmado: confirmar,
        senal: envio.signal,
        alAvanzar: (a) => {
          progreso.value = a.bytesTotal ? a.bytes / a.bytesTotal : 1;
          ponerEstadoPanel(`Enviando ${miles(a.archivo)} de ${miles(a.archivos)} archivos…`, 'enviando');
        },
      });
      terminar(textoEntregado(r.archivos, r.accion), 'entregado');
    } catch (e) {
      if (e instanceof ErrorPluryprint && e.codigo === 'cancelado') return terminar('Envío detenido. PluryPrint descartó lo recibido.', 'error');
      if (e instanceof ErrorPluryprint && (e.codigo === 'no_instalado' || e.codigo === 'sin_permiso')) ponerEstado(aProblema(e));
      terminar(e instanceof Error ? e.message : String(e), 'error');
    }
  });

  // ZIP elegido por el usuario: se lee y descomprime aquí, sin tocar disco.
  const entrada = $<HTMLInputElement>('#pp-zip-archivo');
  $('#pp-zip').addEventListener('click', () => entrada.click());
  entrada.addEventListener('change', async () => {
    const f = entrada.files?.[0];
    entrada.value = '';
    if (!f) return;
    const vacio = { archivos: [], ride: 0, xml: 0, reportes: 0, comprobantes: 0, sinArchivo: 0, ignorados: 0 };
    if (f.size > MAX_ZIP_DESCOMPRIMIDO) return abrirPanel({ tipo: 'zip', nombre: f.name, seleccion: vacio }, f.name, { principal: 'El ZIP es demasiado grande para leerlo aquí (más de 1 GB).', avisos: [] });
    let leido: ReturnType<typeof leerZip>;
    try {
      leido = leerZip(new Uint8Array(await f.arrayBuffer()));
    } catch {
      return abrirPanel({ tipo: 'zip', nombre: f.name, seleccion: vacio }, f.name, { principal: 'No es un ZIP válido.', avisos: [] });
    }
    const seleccion = seleccionarParaImprimir(leido.entradas, pp());
    seleccion.ignorados += leido.ignorados;
    abrirPanel({ tipo: 'zip', nombre: f.name, seleccion }, f.name, textoSeleccion(seleccion));
  });

  /** Fila de Descargas cuyo resultado sigue en memoria de la pestaña del SRI. */
  async function abrirPanelMemoria(e: EntradaHistorial) {
    const r = await pedirImpresion(ctx.conexion(), Number(e.id), false, true);
    if (!r.ok || !r.resumen) {
      panel.hidden = false;
      origen = null;
      $('#pp-panel-origen').textContent = tituloTrabajo(e.trabajo);
      $('#pp-panel-resumen').textContent = r.ok ? 'No hay nada que imprimir.' : r.error;
      $('#pp-panel-avisos').textContent = '';
      $('#pp-panel-accion').textContent = '';
      enviar.hidden = true;
      cerrarBtn.textContent = 'Cerrar';
      return;
    }
    abrirPanel({ tipo: 'memoria', entrada: e, archivos: r.resumen.archivos }, tituloTrabajo(e.trabajo), r.resumen);
  }

  /** El historial cambió: si el panel sigue un envío desde la pestaña, refleja su avance. */
  function alCambiarHistorial(historial: EntradaHistorial[]) {
    if (origen?.tipo !== 'memoria') return;
    const id = origen.entrada.id;
    const e = historial.find((h) => h.id === id);
    const i = e?.impresion;
    if (!e || !i || i.t < Date.now() - 10 * 60_000) return;
    const linea = lineaImpresion(e);
    if (i.estado === 'enviando') {
      progreso.hidden = false;
      progreso.max = Math.max(i.archivos, 1);
      progreso.value = i.enviados;
      ponerEstadoPanel(linea?.texto ?? '', 'enviando');
    } else terminar(i.mensaje, i.estado === 'entregado' ? 'entregado' : 'error');
  }

  return {
    comprobar,
    pintar,
    estado: () => estado,
    abrirSelectorZip: () => entrada.click(),
    abrirPanelMemoria,
    alCambiarHistorial,
  };
}

export type Pluryprint = ReturnType<typeof montarPluryprint>;
