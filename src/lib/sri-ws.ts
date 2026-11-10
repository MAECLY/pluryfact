/**
 * Cliente del servicio web público de autorización del SRI (offline).
 * Devuelve el XML autorizado de cualquier comprobante a partir de su clave de
 * acceso, sin sesión ni captcha. Verificado en vivo el 2026-11-09:
 * exige la cabecera SOAPAction (sin ella responde una página de redirección)
 * y entrega el comprobante escapado con entidades dentro de <comprobante>.
 */
export const WS_AUTORIZACION =
  'https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline';

export function sobreSoap(clave: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:ec="http://ec.gob.sri.ws.autorizacion"><soapenv:Header/><soapenv:Body>' +
    `<ec:autorizacionComprobante><claveAccesoComprobante>${clave}</claveAccesoComprobante>` +
    '</ec:autorizacionComprobante></soapenv:Body></soapenv:Envelope>'
  );
}

export const cabecerasSoap = { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '""' } as const;

export interface Autorizacion {
  estado: string;
  numeroAutorizacion: string;
  fechaAutorizacion: string;
  ambiente: string;
  /** XML del comprobante ya desescapado (<factura>…, <comprobanteRetencion>…). */
  comprobante: string;
}

export interface RespuestaAutorizacion {
  claveConsultada: string;
  autorizaciones: Autorizacion[];
}

export function desescapar(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

const etiqueta = (xml: string, nombre: string) =>
  new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`).exec(xml)?.[1] ?? '';

/** null si no es una respuesta SOAP de autorización (p. ej. la página de redirección). */
export function parseRespuestaAutorizacion(xml: string): RespuestaAutorizacion | null {
  if (!/RespuestaAutorizacionComprobante/.test(xml)) return null;
  const autorizaciones = [...xml.matchAll(/<autorizacion>([\s\S]*?)<\/autorizacion>/g)].map((m) => {
    const a = m[1]!;
    return {
      estado: etiqueta(a, 'estado').trim(),
      numeroAutorizacion: etiqueta(a, 'numeroAutorizacion').trim(),
      fechaAutorizacion: etiqueta(a, 'fechaAutorizacion').trim(),
      ambiente: desescapar(etiqueta(a, 'ambiente').trim()),
      comprobante: desescapar(etiqueta(a, 'comprobante')).trim(),
    };
  });
  return { claveConsultada: etiqueta(xml, 'claveAccesoConsultada').trim(), autorizaciones };
}

/** La primera autorización en estado AUTORIZADO, si existe. */
export const autorizada = (r: RespuestaAutorizacion) => r.autorizaciones.find((a) => a.estado === 'AUTORIZADO') ?? null;

/**
 * Arma el archivo en el mismo formato que descarga el portal
 * (<autorizacion> con el comprobante en CDATA), que es el que importan los
 * sistemas contables.
 */
export function xmlAutorizado(a: Autorizacion): string {
  const comp = a.comprobante.replace(/]]>/g, ']]]]><![CDATA[>');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<autorizacion>\n' +
    `<estado>${a.estado}</estado>\n<numeroAutorizacion>${a.numeroAutorizacion}</numeroAutorizacion>\n` +
    `<fechaAutorizacion>${a.fechaAutorizacion}</fechaAutorizacion>\n<ambiente>${a.ambiente}</ambiente>\n` +
    `<comprobante><![CDATA[${comp}]]></comprobante>\n</autorizacion>\n`
  );
}
