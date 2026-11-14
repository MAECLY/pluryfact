/**
 * La extensión se llamó Legajo hasta noviembre de 2026 y guardaba todo bajo
 * claves `legajo:*`. Al actualizar a Pluryfact se copian a `pluryfact:*` para
 * no perder el historial, los ajustes ni una descarga por reanudar.
 * Es idempotente: si ya no quedan claves viejas, no hace nada.
 */
export const PREFIJO = 'pluryfact:';
export const PREFIJO_ANTIGUO = 'legajo:';

interface Area {
  get(claves: null): Promise<Record<string, unknown>>;
  set(datos: Record<string, unknown>): Promise<void>;
  remove(claves: string[]): Promise<void>;
}

/** Devuelve cuántas claves viejas había. Nunca pisa una clave nueva que ya exista. */
export async function migrarClavesAntiguas(area: Area): Promise<number> {
  const todo = await area.get(null);
  const viejas = Object.keys(todo).filter((k) => k.startsWith(PREFIJO_ANTIGUO));
  if (!viejas.length) return 0;
  const nuevas: Record<string, unknown> = {};
  for (const k of viejas) {
    const nueva = PREFIJO + k.slice(PREFIJO_ANTIGUO.length);
    if (!(nueva in todo)) nuevas[nueva] = todo[k];
  }
  if (Object.keys(nuevas).length) await area.set(nuevas);
  await area.remove(viejas);
  return viejas.length;
}
