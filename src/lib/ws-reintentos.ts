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
): Promise<string | null> {
  let ultimo: unknown;
  for (const espera of [0, 1000, 3000]) {
    if (espera) await esperar(espera);
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
      return a ? xmlAutorizado(a) : null;
    } catch (e) {
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error(String(ultimo));
}
