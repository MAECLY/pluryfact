import type { PuertoNativo } from './pluryprint';
import { NOMBRE_PUERTO, puertoHaciaPuente, type PuertoRuntime } from './puente-pluryprint';

/**
 * Lo que las páginas y el content script usan para hablar con Pluryprint:
 * el permiso opcional y el puerto hacia el puente del background.
 */
export const PERMISO_NATIVO: { permissions: ['nativeMessaging'] } = { permissions: ['nativeMessaging'] };

export async function tienePermisoNativo(): Promise<boolean> {
  try {
    return await browser.permissions.contains(PERMISO_NATIVO);
  } catch {
    return false;
  }
}

/** Debe llamarse dentro de un gesto del usuario (clic en «Conectar con Pluryprint»). */
export async function pedirPermisoNativo(): Promise<boolean> {
  try {
    return await browser.permissions.request(PERMISO_NATIVO);
  } catch {
    return false;
  }
}

export async function quitarPermisoNativo(): Promise<boolean> {
  try {
    return await browser.permissions.remove(PERMISO_NATIVO);
  } catch {
    return false;
  }
}

/** Puerto hacia Pluryprint a través del background (lib/puente-pluryprint). */
export const abrirPuertoPluryprint = (): PuertoNativo => puertoHaciaPuente(browser.runtime.connect({ name: NOMBRE_PUERTO }) as unknown as PuertoRuntime);

export const versionPluryfact = () => browser.runtime.getManifest().version;
