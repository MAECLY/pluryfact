import type { Peticion } from '@/lib/mensajeria';
import { xmlPorClave } from '@/lib/ws-reintentos';

// El background solo hace de puente al servicio web del SRI: el content
// script no puede llamarlo directamente por CORS; el service worker sí, con
// el host_permission de cel.sri.gob.ec.
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: Peticion, _sender, responder: (r: unknown) => void) => {
    if (msg?.tipo !== 'xml') return false;
    xmlPorClave(msg.clave)
      .then((xml) => responder({ ok: true, xml }))
      .catch((e: unknown) => responder({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  });
});
