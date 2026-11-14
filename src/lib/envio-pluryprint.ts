import type { AjustesPluryprint } from './ajustes';
import {
  ClientePluryprint,
  ErrorPluryprint,
  type AccionPluryprint,
  type AvanceEnvio,
  type Hola,
  type Impresora,
  type Overrides,
  type PedidoTrabajo,
  type Perfil,
  type PuertoNativo,
  type ResultadoEnvio,
} from './pluryprint';
import type { Seleccion } from './seleccion-impresion';

/**
 * Orquesta un envío a Pluryprint con los ajustes del usuario. Lo usan la
 * página (ZIP elegido en Descargas) y el content script del SRI (resultado en
 * memoria al terminar una descarga).
 */

/** Más de esto, imprimir directo pide confirmación explícita. */
export const UMBRAL_CONFIRMAR = 50;

/**
 * `print-default` con muchos documentos y sin confirmación pasa a `configure`:
 * Pluryprint se abre y nada se imprime sin que el usuario lo vea.
 */
export function accionEfectiva(accion: AccionPluryprint, documentos: number, confirmado: boolean): AccionPluryprint {
  return accion === 'print-default' && documentos > UMBRAL_CONFIRMAR && !confirmado ? 'configure' : accion;
}

export const necesitaConfirmacion = (a: AjustesPluryprint, documentos: number) => a.accion === 'print-default' && documentos > UMBRAL_CONFIRMAR;

export function pedidoDesdeAjustes(a: AjustesPluryprint, label: string, action: AccionPluryprint): PedidoTrabajo {
  const overrides: Overrides = {};
  if (a.copias !== null) overrides.copies = a.copias;
  if (a.duplex !== null) overrides.duplex = a.duplex;
  if (a.color !== null) overrides.color = a.color;
  return { label, action, profileId: a.perfilId, printerId: a.impresoraId, ...(Object.keys(overrides).length ? { overrides } : {}) };
}

export interface OpcionesEnvio {
  abrirPuerto(): PuertoNativo;
  clientVersion: string;
  ajustes: AjustesPluryprint;
  seleccion: Seleccion;
  etiqueta: string;
  confirmado: boolean;
  alAvanzar?(a: AvanceEnvio): void;
  senal?: AbortSignal;
}

export async function enviarAPluryprint(o: OpcionesEnvio): Promise<ResultadoEnvio & { accion: AccionPluryprint }> {
  if (!o.seleccion.archivos.length) throw new ErrorPluryprint('bad_request', 'selección vacía');
  const accion = accionEfectiva(o.ajustes.accion, o.seleccion.archivos.length, o.confirmado);
  const cliente = new ClientePluryprint(o.abrirPuerto(), { clientVersion: o.clientVersion });
  try {
    await cliente.saludar();
    const r = await cliente.enviar(
      pedidoDesdeAjustes(o.ajustes, o.etiqueta, accion),
      o.seleccion.archivos.map(({ nombre, kind, datos }) => ({ nombre, kind, datos })),
      o.alAvanzar,
      o.senal,
    );
    return { ...r, accion };
  } finally {
    cliente.cerrar();
  }
}

export interface EstadoConexion {
  hola: Hola;
  impresoras: Impresora[];
  perfiles: Perfil[];
}

/** Saludo + impresoras + perfiles en una sola conexión (Avanzado y el indicador lateral). */
export async function consultarPluryprint(abrirPuerto: () => PuertoNativo, clientVersion: string, conListas = true): Promise<EstadoConexion> {
  const cliente = new ClientePluryprint(abrirPuerto(), { clientVersion });
  try {
    const hola = await cliente.saludar();
    if (!conListas) return { hola, impresoras: [], perfiles: [] };
    const [impresoras, perfiles] = await Promise.all([cliente.impresoras().catch(() => []), cliente.perfiles().catch(() => [])]);
    return { hola, impresoras, perfiles };
  } finally {
    cliente.cerrar();
  }
}

/** Texto final tras entregar el trabajo, según la acción. */
export function textoEntregado(n: number, accion: AccionPluryprint): string {
  const docs = `${n.toLocaleString('es-EC')} ${n === 1 ? 'archivo' : 'archivos'}`;
  if (accion === 'configure') return `Pluryprint recibió ${docs}. Revísalos y confirma la impresión en Pluryprint.`;
  if (accion === 'queue') return `Pluryprint recibió ${docs} y los dejó en su cola.`;
  return `Pluryprint recibió ${docs} y empezó a imprimirlos.`;
}
