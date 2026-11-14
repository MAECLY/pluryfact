import { CLAVE_AJUSTES, normalizarAjustes } from '@/lib/ajustes';
import { insignia, notificacion } from '@/lib/aviso-icono';
import { CLAVE_PROGRESO, type EstadoTrabajo, type Peticion } from '@/lib/mensajeria';
import { migrarClavesAntiguas } from '@/lib/migracion';
import { NOMBRE_HOST, type PuertoNativo } from '@/lib/pluryprint';
import { atenderPuerto, type PuertoRuntime } from '@/lib/puente-pluryprint';
import { crearRegistro } from '@/lib/registro';
import { xmlPorClave } from '@/lib/ws-reintentos';

// El background hace de puente al servicio web del SRI (el content script no
// puede llamarlo por CORS) y a Pluryprint (es el único contexto que abre
// Native Messaging), mantiene la insignia del icono y avisa con
// notificaciones del sistema cuando el trabajo termina o necesita atención.
export default defineBackground(() => {
  const log = crearRegistro('background', browser.storage.local);
  void migrarClavesAntiguas(browser.storage.local).then((n) => n && log.info(`Migradas ${n} claves de Legajo a Pluryfact`));
  log.info('Service worker iniciado');

  browser.runtime.onMessage.addListener((msg: Peticion, _sender, responder: (r: unknown) => void) => {
    if (msg?.tipo !== 'xml') return false;
    const clave = msg.clave;
    xmlPorClave(clave, fetch, undefined, (n, resultado, ms) =>
      (resultado.startsWith('error') ? log.aviso : log.info)(`WS ${clave} intento ${n}: ${resultado} en ${ms} ms`),
    )
      .then((xml) => responder({ ok: true, xml }))
      .catch((e: unknown) => {
        log.error(`WS ${clave} falló: ${e instanceof Error ? e.message : String(e)}`);
        responder({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });
    return true;
  });

  // Puente a Pluryprint: la página y el content script del SRI abren un
  // runtime.Port «pluryprint»; aquí se valida quién llama y se reenvía al host.
  browser.runtime.onConnect.addListener((puerto) => {
    atenderPuerto(puerto as unknown as PuertoRuntime, {
      idExtension: browser.runtime.id,
      urlBase: browser.runtime.getURL('/'),
      tienePermiso: () => browser.permissions.contains({ permissions: ['nativeMessaging'] }),
      conectarNativo: (): PuertoNativo => {
        const p = browser.runtime.connectNative(NOMBRE_HOST);
        return {
          postMessage: (m) => p.postMessage(m),
          onMessage: { addListener: (fn) => p.onMessage.addListener((m: unknown) => fn(m)) },
          // Chrome deja el motivo (p. ej. «Specified native messaging host not found.») en lastError.
          onDisconnect: { addListener: (fn) => p.onDisconnect.addListener(() => fn(browser.runtime.lastError?.message)) },
          disconnect: () => p.disconnect(),
        };
      },
      registro: log,
    });
  });

  const pintarIcono = async (e: EstadoTrabajo | undefined) => {
    const i = insignia(e);
    await browser.action.setBadgeText({ text: i.texto });
    await browser.action.setBadgeBackgroundColor({ color: i.color });
    await browser.action.setTitle({ title: i.titulo });
  };

  browser.storage.onChanged.addListener(async (cambios, area) => {
    if (area !== 'local' || !cambios[CLAVE_PROGRESO]) return;
    const antes = cambios[CLAVE_PROGRESO].oldValue as EstadoTrabajo | undefined;
    const ahora = cambios[CLAVE_PROGRESO].newValue as EstadoTrabajo | undefined;
    await pintarIcono(ahora);
    const n = notificacion(antes, ahora);
    if (!n) return;
    const ajustes = normalizarAjustes((await browser.storage.local.get(CLAVE_AJUSTES))[CLAVE_AJUSTES]);
    if (!ajustes.notificaciones) return;
    await browser.notifications.create(n.id, {
      type: 'basic',
      iconUrl: '/icon/128.png',
      title: n.titulo,
      message: n.mensaje,
      requireInteraction: n.insistente,
    });
  });

  // Clic en una notificación: abre Descargas en la página de Pluryfact.
  browser.notifications.onClicked.addListener(async (id) => {
    if (!id.startsWith('pluryfact-')) return;
    await browser.tabs.create({ url: browser.runtime.getURL('/pluryfact.html#descargas') });
    await browser.notifications.clear(id);
  });

  // Primera instalación: bienvenida en la página completa.
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') await browser.tabs.create({ url: browser.runtime.getURL('/pluryfact.html#acerca') });
  });

  void browser.storage.local.get(CLAVE_PROGRESO).then((v) => pintarIcono(v[CLAVE_PROGRESO] as EstadoTrabajo | undefined));
});
