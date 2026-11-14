import type { Progreso, Trabajo } from './cola';
import type { Bandeja } from './types';

/** Mensajes de runtime entre popup, content script y background. */
export type Peticion =
  | { tipo: 'estado' }
  | { tipo: 'iniciar'; trabajo: Trabajo }
  | { tipo: 'cancelar' }
  | { tipo: 'xml'; clave: string };

export interface EstadoPagina {
  bandeja: Bandeja | null;
  ruc: string;
  ocupado: boolean;
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
}

export const CLAVE_PROGRESO = 'pluryfact:progreso';
/**
 * Pedido de cancelación: el `inicio` del trabajo a cancelar. Va por storage y
 * no por mensaje a una pestaña, para que llegue a la pestaña que realmente
 * está descargando aunque haya varias del SRI abiertas.
 */
export const CLAVE_CANCELAR = 'pluryfact:cancelar';
