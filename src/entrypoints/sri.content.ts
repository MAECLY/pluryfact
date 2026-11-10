import { Cancelado, ejecutar, type Dependencias, type Progreso, type Trabajo } from '@/lib/cola';
import { bandejaDePagina, CANAL, type MensajeCanal, type Orden, type Respuesta } from '@/lib/conductor';
import { parseTabla } from '@/lib/extract';
import { cuerpoDescarga, esAdjunto } from '@/lib/jsf';
import { CLAVE_PROGRESO, type EstadoPagina, type EstadoTrabajo, type Peticion } from '@/lib/mensajeria';
import { etiquetaPeriodo } from '@/lib/periodo-etiqueta';
import { crearRegistro } from '@/lib/registro';
import { byId, LINK_REPORTE } from '@/lib/selectors';
import { hoyEcuador } from '@/entrypoints/popup/estado';
import { armarZip, nombreZip } from '@/lib/zip';

// Mundo aislado: lee la página, descarga por POST con la sesión del usuario
// y ejecuta la cola. Las acciones sobre controles del portal van al conductor
// (mundo MAIN) por postMessage.
export default defineContentScript({
  matches: ['https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*'],
  runAt: 'document_idle',
  main() {
    // El popup puede reinyectar este script (pestaña abierta antes de recargar la extensión).
    const marca = document.documentElement;
    if (marca.dataset.legajo === browser.runtime.id) return;
    marca.dataset.legajo = browser.runtime.id;
    const log = crearRegistro('content', browser.storage.local);
    log.info(`Content script activo en ${location.pathname.split('/').pop()}`);
    const logConductor = crearRegistro('conductor', browser.storage.local);
    let ocupado = false;
    let cancelar = false;
    let verificacion = false;
    let siguienteId = 1;
    let conductor: string | null = null;
    const pendientes = new Map<number, (r: Respuesta) => void>();

    window.addEventListener('message', (ev: MessageEvent<MensajeCanal>) => {
      const m = ev.data;
      if (ev.source !== window || m?.canal !== CANAL) return;
      if (m.tipo === 'hola' && m.conductor) {
        if (conductor !== m.conductor) logConductor.info(`Conductor activo: ${m.conductor.split(':')[0]}`);
        conductor = m.conductor;
      } else if (m.tipo === 'respuesta' && m.id && m.respuesta) {
        if (m.conductor && conductor && m.conductor !== conductor) return; // respuesta de un conductor viejo
        pendientes.get(m.id)?.(m.respuesta);
        pendientes.delete(m.id);
      } else if (m.tipo === 'evento' && m.evento === 'verificacion') {
        verificacion = true;
        logConductor.aviso('reCAPTCHA mostró un desafío visible');
      } else if (m.tipo === 'log' && m.log) {
        logConductor.info(m.log);
      }
    });

    window.postMessage({ canal: CANAL, tipo: 'quien' } satisfies MensajeCanal, location.origin);

    async function esperarConductor(): Promise<string> {
      for (let i = 0; i < 20 && !conductor; i++) {
        window.postMessage({ canal: CANAL, tipo: 'quien' } satisfies MensajeCanal, location.origin);
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!conductor) throw new Error('El conductor de Legajo no está activo en la página. Vuelve a entrar desde el menú del portal.');
      return conductor;
    }

    const ordenar = async (orden: Orden) => {
      const para = await esperarConductor();
      return new Promise<Respuesta>((resolver) => {
        const id = siguienteId++;
        pendientes.set(id, resolver);
        window.postMessage({ canal: CANAL, tipo: 'orden', id, para, orden } satisfies MensajeCanal, location.origin);
      });
    };

    const formulario = () => byId(document, 'frmPrincipal') as HTMLFormElement | null;
    const ruc = () => (byId(document, 'frmPrincipal:txtParametro') as HTMLInputElement | null)?.value.trim() ?? '';

    async function postArchivo(idEnlace: string): Promise<Uint8Array> {
      const form = formulario();
      if (!form) throw new Error('No se encontró el formulario del portal');
      const r = await fetch(form.action, { method: 'POST', body: cuerpoDescarga(form, idEnlace), credentials: 'same-origin' });
      if (!r.ok || !esAdjunto(r.headers)) {
        log.aviso(`POST ${idEnlace.split(':').slice(-2).join(':')}: ${r.status} ${r.headers.get('content-type') ?? ''} sin adjunto`);
        throw new Error('El portal no devolvió el archivo');
      }
      return new Uint8Array(await r.arrayBuffer());
    }

    // Escrituras en orden: los avisos concurrentes no deben pisarse con estados viejos.
    let cola: Promise<void> = Promise.resolve();
    function guardar(estado: EstadoTrabajo) {
      cola = cola.then(() => browser.storage.local.set({ [CLAVE_PROGRESO]: estado })).catch(() => {});
      return cola;
    }

    function descargar(bytes: Uint8Array, nombre: string) {
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.style.display = 'none';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function correr(t: Trabajo) {
      ocupado = true;
      cancelar = false;
      verificacion = false;
      const rucActual = ruc();
      const base = { ruc: rucActual, bandeja: t.bandeja, consultasFallidas: [] as string[], zip: null as string | null };
      let ultimo: Progreso | null = null;
      // Borra el resultado de la descarga anterior antes de empezar.
      await guardar({
        fase: 'consultando',
        consultasHechas: 0,
        consultasTotal: 0,
        encontrados: 0,
        descargados: 0,
        fallidos: 0,
        mensaje: 'Preparando la descarga',
        errores: [],
        inicio: Date.now(),
        pasos: [],
        actividad: [{ t: Date.now(), texto: 'Preparando la descarga…', nivel: 'info' }],
        esperaHasta: null,
        ...base,
        verificacion: false,
        actualizado: Date.now(),
      });
      const d: Dependencias = {
        hoy: hoyEcuador(),
        rucContribuyente: rucActual,
        consultar: async (c) => (await ordenar({ accion: 'consultar', consulta: c })) as Awaited<ReturnType<Dependencias['consultar']>>,
        reporte: () => postArchivo(LINK_REPORTE),
        primeraPagina: async () => void (await ordenar({ accion: 'primera-pagina', bandeja: t.bandeja })),
        siguientePagina: async () => ((await ordenar({ accion: 'siguiente-pagina', bandeja: t.bandeja })) as { hay: boolean }).hay,
        leerTabla: () => parseTabla(document, t.bandeja),
        pdf: postArchivo,
        xml: async (clave) => {
          const r = (await browser.runtime.sendMessage({ tipo: 'xml', clave } satisfies Peticion)) as { ok: boolean; xml?: string | null; error?: string };
          if (!r?.ok) throw new Error(r?.error ?? 'Sin respuesta del servicio web');
          return r.xml ?? null;
        },
        esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
        azar: Math.random,
        progreso: (p) => {
          ultimo = p;
          void guardar({ ...p, ...base, verificacion, actualizado: Date.now() });
          verificacion = false;
        },
        cancelado: () => cancelar,
        registro: log,
      };
      try {
        const r = await ejecutar(t, d);
        base.consultasFallidas = r.consultasFallidas;
        if (r.archivos.length) {
          const nombre = nombreZip(rucActual, t.bandeja, etiquetaPeriodo(t.periodo));
          const zip = armarZip(r.archivos);
          descargar(zip, nombre);
          log.info(`ZIP ${nombre}: ${r.archivos.length} archivos, ${zip.length} bytes`);
          base.zip = nombre;
        }
        // Si todas las consultas fallaron, NO es "no hay comprobantes": es un error.
        const todasFallaron = r.progreso.consultasTotal > 0 && r.consultasFallidas.length >= r.progreso.consultasTotal;
        const algunasFallaron = r.consultasFallidas.length > 0;
        const fase = r.progreso.fase === 'cancelado' ? 'cancelado' : r.detenidaPor || todasFallaron ? 'error' : 'listo';
        const mensaje = todasFallaron
          ? `No se pudo consultar al SRI: fallaron las ${r.consultasFallidas.length} consultas. ${r.consultasFallidas[0]?.split(': ').slice(1).join(': ') ?? ''}`
          : r.detenidaPor
          ? `${r.detenidaPor}${r.archivos.length ? ` Se guardó lo ya descargado (${r.archivos.length} archivos).` : ''}`
          : r.archivos.length
          ? `ZIP con ${r.archivos.length} archivos`
          : fase === 'cancelado'
            ? 'Descarga cancelada'
            : algunasFallaron
              ? `Sin comprobantes descargados; ${r.consultasFallidas.length} consultas fallaron`
              : 'El SRI no tiene comprobantes para ese periodo y filtro';
        const actividad = [...r.progreso.actividad, { t: Date.now(), texto: mensaje, nivel: fase === 'listo' ? ('info' as const) : ('aviso' as const) }].slice(-40);
        await guardar({ ...r.progreso, ...base, fase, mensaje, actividad, esperaHasta: null, verificacion: false, actualizado: Date.now() });
      } catch (e) {
        log.error(`Trabajo interrumpido: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
        if (!(e instanceof Cancelado)) {
          await guardar({
            ...(ultimo ?? {
              consultasHechas: 0,
              consultasTotal: 0,
              encontrados: 0,
              descargados: 0,
              fallidos: 0,
              errores: [],
              inicio: Date.now(),
              pasos: [],
              actividad: [],
              esperaHasta: null,
            }),
            ...base,
            fase: 'error',
            mensaje: e instanceof Error ? e.message : String(e),
            verificacion: false,
            actualizado: Date.now(),
          });
        }
      } finally {
        ocupado = false;
        await Promise.all([log.volcar(), logConductor.volcar()]);
      }
    }

    browser.runtime.onMessage.addListener((msg: Peticion, _s, responder: (r: unknown) => void) => {
      if (msg?.tipo === 'estado') {
        responder({ bandeja: bandejaDePagina(document), ruc: ruc(), ocupado } satisfies EstadoPagina);
      } else if (msg?.tipo === 'iniciar') {
        if (ocupado) responder({ ok: false, error: 'Ya hay una descarga en curso' });
        else {
          void correr(msg.trabajo);
          responder({ ok: true });
        }
      } else if (msg?.tipo === 'cancelar') {
        cancelar = true;
        responder({ ok: true });
      } else return false;
      return false;
    });
  },
});
