import type { Progreso, Trabajo } from './cola';
import type { Bandeja } from './types';

/** Mensajes de runtime entre popup, content script y background. */
export type Peticion =
  | { tipo: 'estado' }
  | { tipo: 'iniciar'; trabajo: Trabajo }
  | { tipo: 'cancelar' }
  | { tipo: 'xml'; clave: string }
  /** Página → pestaña del SRI: manda a PluryPrint el último resultado que sigue en memoria. */
  | { tipo: 'imprimir'; inicio: number; confirmado: boolean };

export interface EstadoPagina {
  bandeja: Bandeja | null;
  ruc: string;
  ocupado: boolean;
  /** `inicio` del último trabajo cuyos archivos siguen en memoria de la pestaña (para imprimirlos), o null. */
  enMemoria?: number | null;
  /** true mientras esa pestaña envía archivos a PluryPrint. */
  imprimiendo?: boolean;
}

/** Envío a PluryPrint de un trabajo, visible en Descargas. */
export interface EstadoImpresion {
  estado: 'enviando' | 'entregado' | 'error';
  /** Archivos del trabajo de impresión. */
  archivos: number;
  /** Archivos ya entregados al host. */
  enviados: number;
  mensaje: string;
  t: number;
}

export interface EstadoTrabajo extends Progreso {
  ruc: string;
  bandeja: Bandeja;
  verificacion: boolean;
  consultasFallidas: string[];
  zip: string | null;
  actualizado: number;
  /** El trabajo tal como se pidió (para «Reanudar»). */
  trabajo?: Trabajo;
  /** Índices del plan completo que quedaron sin terminar. */
  pendientes?: number[];
  /** Último envío a PluryPrint de este trabajo, si lo hubo. */
  impresion?: EstadoImpresion;
}

export const CLAVE_PROGRESO = 'pluryfact:progreso';
/**
 * Pedido de cancelación: el `inicio` del trabajo a cancelar. Va por storage y
 * no por mensaje a una pestaña, para que llegue a la pestaña que realmente
 * está descargando aunque haya varias del SRI abiertas.
 */
export const CLAVE_CANCELAR = 'pluryfact:cancelar';
