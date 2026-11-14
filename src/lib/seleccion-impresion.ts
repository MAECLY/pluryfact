import { unzipSync } from 'fflate';
import type { ContenidoImpresion, OrdenImpresion } from './ajustes';
import { parseClave, type ClaveAcceso } from './clave';
import type { ArchivoParaImprimir } from './pluryprint';
import { TIPO_CLAVE } from './types';

/**
 * Qué archivos de una descarga se mandan a PluryPrint y en qué orden.
 * Sirve igual para el resultado en memoria de la pestaña del SRI y para un
 * `pluryfact_*.zip` que el usuario elige en Descargas.
 *
 * Solo reconoce lo que produce Pluryfact (lib/archivos y lib/cola):
 *   pluryfact/<ruc>/<bandeja>/<aaaa>/<mm>/<tipo>_<serie>_<ruc emisor>_<clave>.(xml|pdf)
 *   pluryfact/<ruc>/<bandeja>/reportes/<tipo>_<etiqueta>.txt
 * Todo lo demás (rutas con `..`, absolutas, con barras invertidas o
 * caracteres de control, nombres ajenos, PDF sin cabecera `%PDF-`) se ignora
 * y se cuenta para decírselo al usuario.
 */

export interface EntradaArchivo {
  ruta: string;
  datos: Uint8Array | string;
}

export interface OpcionesSeleccion {
  contenido: ContenidoImpresion;
  xmlSiFaltaRide: boolean;
  incluirReporte: boolean;
  orden: OrdenImpresion;
}

export interface Seleccion {
  archivos: Array<ArchivoParaImprimir & { clave?: string }>;
  ride: number;
  xml: number;
  reportes: number;
  /** Comprobantes distintos encontrados. */
  comprobantes: number;
  /** Comprobantes que no tienen ni el formato pedido ni un respaldo. */
  sinArchivo: number;
  /** Entradas ignoradas por ruta, nombre o contenido. */
  ignorados: number;
}

/** Mismo límite por archivo que anuncia PluryPrint (`limits.maxFileBytes`). */
export const MAX_ARCHIVO = 50 * 1024 * 1024;
/** Tope del ZIP descomprimido que Pluryfact acepta leer en memoria. */
export const MAX_ZIP_DESCOMPRIMIDO = 1024 * 1024 * 1024;
export const MAX_ENTRADAS_ZIP = 20_000;

const NOMBRE_COMPROBANTE = /^(factura|liquidacion|nota-credito|nota-debito|guia-remision|retencion)_[\w.-]{1,40}_(\d{13})_(\d{49})\.(xml|pdf)$/;
const NOMBRE_REPORTE = /^[\w.-]{1,120}\.txt$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Ruta relativa, con `/`, sin `..`, `.`, segmentos vacíos ni caracteres de control. */
export function rutaSegura(ruta: string): boolean {
  if (!ruta || ruta.length > 1024 || ruta.startsWith('/') || ruta.includes('\\') || CONTROL.test(ruta)) return false;
  const partes = ruta.split('/');
  if (/^[a-z]:$/i.test(partes[0] ?? '')) return false;
  return partes.every((p) => p !== '' && p !== '.' && p !== '..');
}

const bytes = (d: Uint8Array | string) => (typeof d === 'string' ? new TextEncoder().encode(d) : d);
export const esPdf = (d: Uint8Array) => d.length > 5 && d[0] === 0x25 && d[1] === 0x50 && d[2] === 0x44 && d[3] === 0x46 && d[4] === 0x2d;
/** Un XML de comprobante: empieza con `<` (tras BOM y espacios) y nombra un comprobante o su autorización. */
export function esXmlComprobante(d: Uint8Array): boolean {
  const inicio = new TextDecoder('utf-8', { fatal: false }).decode(d.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  return inicio.startsWith('<') && /<(autorizacion|RespuestaAutorizacionComprobante|factura|notaCredito|notaDebito|comprobanteRetencion|guiaRemision|liquidacionCompra)[\s>]/.test(inicio);
}

interface Comprobante {
  clave: ClaveAcceso;
  orden: number;
  pdf?: { nombre: string; datos: Uint8Array };
  xml?: { nombre: string; datos: Uint8Array };
}

const ORDEN_TIPO = Object.keys(TIPO_CLAVE);
const codigoTipo = (c: ClaveAcceso) => c.clave.slice(8, 10);
const fechaNum = (c: ClaveAcceso) => c.fechaEmision.anio * 10_000 + c.fechaEmision.mes * 100 + c.fechaEmision.dia;
const serie = (c: ClaveAcceso) => `${c.establecimiento}${c.puntoEmision}${c.secuencial}`;
const comparar = (a: (string | number)[], b: (string | number)[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return 0;
};

function claveDeOrden(c: Comprobante, orden: OrdenImpresion): (string | number)[] {
  const k = c.clave;
  switch (orden) {
    case 'portal':
      return [c.orden];
    case 'fecha':
      return [fechaNum(k), k.ruc, ORDEN_TIPO.indexOf(codigoTipo(k)), serie(k), c.orden];
    case 'emisor':
      return [k.ruc, fechaNum(k), ORDEN_TIPO.indexOf(codigoTipo(k)), serie(k), c.orden];
    case 'tipo':
      return [ORDEN_TIPO.indexOf(codigoTipo(k)), fechaNum(k), k.ruc, serie(k), c.orden];
  }
}

export function seleccionarParaImprimir(entradas: EntradaArchivo[], o: OpcionesSeleccion): Seleccion {
  const porClave = new Map<string, Comprobante>();
  const reportes: Array<{ ruta: string; nombre: string; datos: Uint8Array }> = [];
  let ignorados = 0;

  for (const e of entradas) {
    if (!rutaSegura(e.ruta)) {
      ignorados++;
      continue;
    }
    const partes = e.ruta.split('/');
    const nombre = partes[partes.length - 1]!;
    const datos = bytes(e.datos);
    if (!datos.length || datos.length > MAX_ARCHIVO) {
      ignorados++;
      continue;
    }
    if (partes[partes.length - 2] === 'reportes' && NOMBRE_REPORTE.test(nombre)) {
      reportes.push({ ruta: e.ruta, nombre, datos });
      continue;
    }
    const m = NOMBRE_COMPROBANTE.exec(nombre);
    const clave = m ? parseClave(m[3]!) : null;
    if (!m || !clave || clave.ruc !== m[2]) {
      ignorados++;
      continue;
    }
    const ext = m[4] as 'xml' | 'pdf';
    if (ext === 'pdf' ? !esPdf(datos) : !esXmlComprobante(datos)) {
      ignorados++;
      continue;
    }
    const c = porClave.get(clave.clave) ?? { clave, orden: porClave.size };
    if (!c[ext]) c[ext] = { nombre, datos };
    porClave.set(clave.clave, c);
  }

  const lista = [...porClave.values()].sort((a, b) => comparar(claveDeOrden(a, o.orden), claveDeOrden(b, o.orden)));
  const archivos: Seleccion['archivos'] = [];
  let ride = 0;
  let xml = 0;
  let sinArchivo = 0;
  const poner = (c: Comprobante, kind: 'pdf' | 'xml') => {
    const a = c[kind]!;
    archivos.push({ nombre: a.nombre, kind, datos: a.datos, clave: c.clave.clave });
    if (kind === 'pdf') ride++;
    else xml++;
  };
  for (const c of lista) {
    const antes = archivos.length;
    if (o.contenido === 'ride') {
      if (c.pdf) poner(c, 'pdf');
      else if (o.xmlSiFaltaRide && c.xml) poner(c, 'xml');
    } else if (o.contenido === 'xml') {
      // Sin XML, el RIDE es la misma información ya impresa: mejor que saltarse el comprobante.
      if (c.xml) poner(c, 'xml');
      else if (c.pdf) poner(c, 'pdf');
    } else {
      if (c.pdf) poner(c, 'pdf');
      if (c.xml) poner(c, 'xml');
    }
    if (archivos.length === antes) sinArchivo++;
  }
  if (o.incluirReporte) {
    reportes.sort((a, b) => (a.ruta < b.ruta ? -1 : a.ruta > b.ruta ? 1 : 0));
    for (const r of reportes) archivos.push({ nombre: r.nombre, kind: 'txt', datos: r.datos });
  }
  return { archivos, ride, xml, reportes: o.incluirReporte ? reportes.length : 0, comprobantes: lista.length, sinArchivo, ignorados };
}

/**
 * Lee un ZIP elegido por el usuario. Descomprime solo lo que podría ser de
 * Pluryfact y con topes de tamaño (defensa contra ZIP bomba y rutas hostiles).
 */
export function leerZip(zip: Uint8Array): { entradas: EntradaArchivo[]; ignorados: number } {
  let ignorados = 0;
  let total = 0;
  let vistos = 0;
  const dentro = unzipSync(zip, {
    filter: (f) => {
      vistos++;
      if (f.name.endsWith('/')) return false; // carpeta
      const ok =
        vistos <= MAX_ENTRADAS_ZIP &&
        rutaSegura(f.name) &&
        /\.(pdf|xml|txt)$/i.test(f.name) &&
        f.originalSize <= MAX_ARCHIVO &&
        total + f.originalSize <= MAX_ZIP_DESCOMPRIMIDO;
      if (ok) total += f.originalSize;
      else ignorados++;
      return ok;
    },
  });
  return { entradas: Object.entries(dentro).map(([ruta, datos]) => ({ ruta, datos })), ignorados };
}

/** "Recibidos · 2026-10" a partir de `pluryfact_<ruc>_<bandeja>_<etiqueta>.zip` (sin el RUC). */
export function etiquetaDeZip(nombre: string): string {
  const base = nombre.split(/[\\/]/).pop() ?? nombre;
  const m = /^pluryfact_\d{10,13}_(emitidos|recibidos)_(.+?)(_reanudado)?(?: ?\(\d+\))?\.zip$/i.exec(base);
  if (m) return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} · ${m[2]!.replace(/_/g, ' a ')}${m[3] ? ' (reanudada)' : ''}`;
  return `Pluryfact · ${base.replace(/\.zip$/i, '')}`.slice(0, 120);
}

const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-EC')} ${n === 1 ? uno : varios}`;

/** "Se imprimirán 120 RIDE + 3 XML + el reporte." y los avisos de lo que no entra. */
export function textoSeleccion(s: Seleccion): { principal: string; avisos: string[] } {
  const partes = [s.ride ? plural(s.ride, 'RIDE', 'RIDE') : '', s.xml ? plural(s.xml, 'XML', 'XML') : '', s.reportes ? (s.reportes === 1 ? 'el reporte' : `${s.reportes} reportes`) : ''].filter(Boolean);
  const principal = partes.length ? `Se imprimirán ${partes.join(' + ')}.` : 'No hay nada que imprimir con estos ajustes.';
  const avisos: string[] = [];
  if (s.sinArchivo) avisos.push(`${plural(s.sinArchivo, 'comprobante no tiene', 'comprobantes no tienen')} el archivo pedido y no se imprimirá${s.sinArchivo === 1 ? '' : 'n'}.`);
  if (s.ignorados) avisos.push(`Se ignoraron ${plural(s.ignorados, 'archivo que no es', 'archivos que no son')} de Pluryfact.`);
  return { principal, avisos };
}

/** Plan para "Nueva descarga", antes de saber cuántos comprobantes hay. */
export function textoPlanImpresion(o: OpcionesSeleccion & { accion: string }): string {
  const que = o.contenido === 'ride' ? `el RIDE de cada comprobante${o.xmlSiFaltaRide ? ' (o su XML si no tiene RIDE)' : ''}` : o.contenido === 'xml' ? 'el XML de cada comprobante, como representación impresa' : 'el RIDE y el XML de cada comprobante';
  const despues = o.accion === 'configure' ? 'PluryPrint se abrirá para que revises y confirmes.' : o.accion === 'queue' ? 'Quedarán en la cola de PluryPrint.' : 'Se imprimirán directo en la impresora del perfil.';
  return `Al terminar se enviará a PluryPrint ${que}${o.incluirReporte ? ', más el reporte' : ''}. ${despues}`;
}
