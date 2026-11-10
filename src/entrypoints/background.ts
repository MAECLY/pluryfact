import type { Peticion } from '@/lib/mensajeria';
import { crearRegistro } from '@/lib/registro';
import { xmlPorClave } from '@/lib/ws-reintentos';

// El background solo hace de puente al servicio web del SRI: el content
// script no puede llamarlo directamente por CORS; el service worker sí, con
// el host_permission de cel.sri.gob.ec.
export default defineBackground(() => {
  const log = crearRegistro('background', browser.storage.local);
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
});
