import { autorizada, cabecerasSoap, parseRespuestaAutorizacion, sobreSoap, WS_AUTORIZACION, xmlAutorizado } from './sri-ws';

/**
 * XML autorizado de una clave, con reintentos ante fallos de red (en vivo hubo
 * un timeout transitorio). Devuelve null si el SRI responde que no hay
 * autorización; lanza si no se pudo hablar con el servicio.
 */
export async function xmlPorClave(
  clave: string,
  hacerFetch: typeof fetch = fetch,
  esperar = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  alIntento: (n: number, resultado: string, ms: number) => void = () => {},
): Promise<string | null> {
  let ultimo: unknown;
  for (const [n, espera] of [0, 1000, 3000].entries()) {
    if (espera) await esperar(espera);
    const t0 = Date.now();
    try {
      const r = await hacerFetch(WS_AUTORIZACION, {
        method: 'POST',
        headers: cabecerasSoap,
        body: sobreSoap(clave),
        signal: AbortSignal.timeout(30_000),
      });
      const resp = parseRespuestaAutorizacion(await r.text());
      if (!resp) throw new Error(`Respuesta inesperada del servicio (${r.status})`);
      const a = autorizada(resp);
      alIntento(n + 1, a ? 'AUTORIZADO' : `sin autorización (${resp.autorizaciones.length})`, Date.now() - t0);
      return a ? xmlAutorizado(a) : null;
    } catch (e) {
      ultimo = e;
      alIntento(n + 1, `error: ${e instanceof Error ? `${e.name} ${e.message}` : String(e)}`, Date.now() - t0);
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
}
