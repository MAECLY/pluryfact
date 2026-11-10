/** Mensajes del portal en `formMessages:messages`, verificados en vivo. */
export type TipoMensaje = 'sin-datos' | 'fecha-actual' | 'otro';

export function clasificarMensaje(texto: string): TipoMensaje | null {
  const t = texto.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!t) return null;
  if (t.includes('no existen datos')) return 'sin-datos';
  if (t.includes('menor a la fecha actual')) return 'fecha-actual';
  return 'otro';
}
