import { Cancelado, ejecutar, type Dependencias, type Progreso, type Trabajo } from '@/lib/cola';
import { bandejaDePagina, CANAL, type MensajeCanal, type Orden, type Respuesta } from '@/lib/conductor';
import { parseTabla } from '@/lib/extract';
import { cuerpoDescarga, esAdjunto } from '@/lib/jsf';
import { CLAVE_PROGRESO, type EstadoPagina, type EstadoTrabajo, type Peticion } from '@/lib/mensajeria';
import { etiquetaPeriodo } from '@/lib/periodo-etiqueta';
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
    let ocupado = false;
    let cancelar = false;
    let verificacion = false;
    let siguienteId = 1;
    const pendientes = new Map<number, (r: Respuesta) => void>();

    window.addEventListener('message', (ev: MessageEvent<MensajeCanal>) => {
      const m = ev.data;
      if (ev.source !== window || m?.canal !== CANAL) return;
      if (m.tipo === 'respuesta' && m.id && m.respuesta) {
        pendientes.get(m.id)?.(m.respuesta);
        pendientes.delete(m.id);
      } else if (m.tipo === 'evento' && m.evento === 'verificacion') {
        verificacion = true;
      }
    });

    const ordenar = (orden: Orden) =>
      new Promise<Respuesta>((resolver) => {
        const id = siguienteId++;
        pendientes.set(id, resolver);
        window.postMessage({ canal: CANAL, tipo: 'orden', id, orden } satisfies MensajeCanal, location.origin);
      });

    const formulario = () => byId(document, 'frmPrincipal') as HTMLFormElement | null;
    const ruc = () => (byId(document, 'frmPrincipal:txtParametro') as HTMLInputElement | null)?.value.trim() ?? '';

    async function postArchivo(idEnlace: string): Promise<Uint8Array> {
      const form = formulario();
      if (!form) throw new Error('No se encontró el formulario del portal');
      const r = await fetch(form.action, { method: 'POST', body: cuerpoDescarga(form, idEnlace), credentials: 'same-origin' });
      if (!r.ok || !esAdjunto(r.headers)) throw new Error('El portal no devolvió el archivo');
      return new Uint8Array(await r.arrayBuffer());
    }

    async function guardar(estado: EstadoTrabajo) {
      await browser.storage.local.set({ [CLAVE_PROGRESO]: estado });
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
      };
      try {
        const r = await ejecutar(t, d);
        base.consultasFallidas = r.consultasFallidas;
        if (r.archivos.length) {
          const nombre = nombreZip(rucActual, t.bandeja, etiquetaPeriodo(t.periodo));
          descargar(armarZip(r.archivos), nombre);
          base.zip = nombre;
        }
        const fase = r.progreso.fase === 'cancelado' ? 'cancelado' : r.detenidaPor ? 'error' : 'listo';
        const mensaje = r.detenidaPor
          ? `${r.detenidaPor}${r.archivos.length ? ` Se guardó lo ya descargado (${r.archivos.length} archivos).` : ''}`
          : r.archivos.length
          ? `ZIP con ${r.archivos.length} archivos`
          : fase === 'cancelado'
            ? 'Descarga cancelada'
            : 'No hay comprobantes para ese periodo y filtro';
        await guardar({ ...r.progreso, ...base, fase, mensaje, verificacion: false, actualizado: Date.now() });
      } catch (e) {
        if (!(e instanceof Cancelado)) {
          await guardar({
            ...(ultimo ?? { consultasHechas: 0, consultasTotal: 0, encontrados: 0, descargados: 0, fallidos: 0, errores: [] }),
            ...base,
            fase: 'error',
            mensaje: e instanceof Error ? e.message : String(e),
            verificacion: false,
            actualizado: Date.now(),
          });
        }
      } finally {
        ocupado = false;
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
