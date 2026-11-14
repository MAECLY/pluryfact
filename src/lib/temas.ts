/**
 * Temas de color y tipografía. Salen de la exploración de nombres de noviembre
 * de 2026: cada candidato traía su paleta, y en vez de tirarlas quedan como
 * temas. Pluryfact es el de la marca y el predeterminado.
 *
 * Los colores viven en src/ui/tokens.css bajo :root[data-brand="<id>"]; aquí
 * solo está lo que necesita el selector de Avanzado para dibujar la muestra.
 */
export interface Tema {
  id: string;
  nombre: string;
  /** Tipografía del nombre y las cifras grandes. */
  fuente: string;
  /** Acento, pliego (relleno del fichero) y tinta, en claro, para la muestra. */
  muestra: [string, string, string];
}

export const TEMAS = [
  { id: 'pluryfact', nombre: 'Pluryfact', fuente: 'Bricolage Grotesque', muestra: ['#2446a8', '#f06a4d', '#151c33'] },
  { id: 'tabularium', nombre: 'Tabularium', fuente: 'Marcellus', muestra: ['#2f6e62', '#b07a3f', '#2a2620'] },
  { id: 'ledgera', nombre: 'Ledgera', fuente: 'Newsreader', muestra: ['#1d5c3a', '#8fbf9a', '#1a2a1f'] },
  { id: 'factrix', nombre: 'Factrix', fuente: 'Sora', muestra: ['#0c5c63', '#5fd3b3', '#0f2a2c'] },
  { id: 'xmlote', nombre: 'XMLote', fuente: 'JetBrains Mono', muestra: ['#2f7d3a', '#e3b341', '#16211a'] },
  { id: 'comproflow', nombre: 'Comproflow', fuente: 'Outfit', muestra: ['#0a7ea4', '#ffb547', '#0d2530'] },
  { id: 'comprobox', nombre: 'Comprobox', fuente: 'Rubik', muestra: ['#b4471a', '#3e7c8c', '#2b1d14'] },
  { id: 'fiscabox', nombre: 'Fiscabox', fuente: 'Manrope', muestra: ['#16325c', '#c9a227', '#121d30'] },
] as const satisfies readonly Tema[];

export type IdTema = (typeof TEMAS)[number]['id'];
export const TEMA_POR_DEFECTO: IdTema = 'pluryfact';

export const esTema = (v: unknown): v is IdTema => TEMAS.some((t) => t.id === v);

/** Aplica el tema al documento (popup o página). */
export function aplicarTema(doc: Document, id: IdTema) {
  doc.documentElement.dataset.brand = id;
}
