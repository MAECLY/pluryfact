import type { PuertoNativo } from '../../src/lib/pluryprint';
import { crearHostFalso, type OpcionesHostFalso } from '../../scripts/pluryprint-host-falso';

type Msg = Record<string, unknown>;

/**
 * Puerto nativo falso. `responder` decide qué contesta el "host" a cada
 * mensaje (undefined = no contesta). Las respuestas llegan en una microtarea,
 * como en Chrome.
 */
export function puertoFalso(responder?: (m: Msg) => unknown) {
  const enviados: Msg[] = [];
  const alMensaje: Array<(m: unknown) => void> = [];
  const alCerrar: Array<(motivo?: string) => void> = [];
  let conectado = true;
  let desconectadoPorCliente = false;
  const puerto: PuertoNativo = {
    postMessage(m) {
      if (!conectado) throw new Error('Attempting to use a disconnected port object');
      const copia = JSON.parse(JSON.stringify(m)) as Msg;
      enviados.push(copia);
      const r = responder?.(copia);
      if (r !== undefined) queueMicrotask(() => conectado && alMensaje.forEach((f) => f(r)));
    },
    onMessage: { addListener: (f) => void alMensaje.push(f) },
    onDisconnect: { addListener: (f) => void alCerrar.push(f) },
    disconnect() {
      conectado = false;
      desconectadoPorCliente = true;
    },
  };
  return {
    puerto,
    enviados,
    tipos: () => enviados.map((m) => m.type),
    /** Simula que el host manda algo por su cuenta. */
    emitir: (m: unknown) => alMensaje.forEach((f) => f(m)),
    /** Simula que Chrome cierra el puerto (host caído, no instalado…). */
    cerrar(motivo?: string) {
      conectado = false;
      alCerrar.forEach((f) => f(motivo));
    },
    get desconectadoPorCliente() {
      return desconectadoPorCliente;
    },
  };
}

/** Devuélvelo desde `interceptar` para que el host no conteste. */
export const SILENCIO = Symbol('silencio');

/**
 * Puerto conectado a un host falso que implementa el protocolo completo.
 * `interceptar` puede cambiar la respuesta a un mensaje (undefined = la del host).
 */
export function puertoConHost(o: OpcionesHostFalso = {}, interceptar?: (m: Msg) => unknown) {
  const host = crearHostFalso(o);
  const p = puertoFalso((m) => {
    const r = interceptar?.(m);
    if (r === SILENCIO) return undefined;
    return r ?? host.atender(m);
  });
  return { ...p, host };
}
