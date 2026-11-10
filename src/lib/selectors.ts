// Único archivo con selectores e ids del portal del SRI. Si el SRI cambia su
// HTML, se corrige aquí y en los fixtures de test/fixtures/.
import type { Bandeja } from './types';

export const BASE = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet';

export const RUTA: Record<Bandeja, string> = {
  emitidos: '/pages/consultas/recuperarComprobantes.jsf',
  recibidos: '/pages/consultas/recibidos/comprobantesRecibidos.jsf',
};

export const FORM = 'frmPrincipal';
export const VIEW_STATE = 'javax.faces.ViewState';

export const TABLA: Record<Bandeja, string> = {
  emitidos: 'frmPrincipal:tablaCompEmitidos',
  recibidos: 'frmPrincipal:tablaCompRecibidos',
};

export const PANEL_LISTA = 'frmPrincipal:panelListaComprobantes';
export const LINK_REPORTE = 'frmPrincipal:lnkTxtlistado';

export const linkFila = (b: Bandeja, i: number, tipo: 'lnkXml' | 'lnkPdf') => `${TABLA[b]}:${i}:${tipo}`;

/** Columnas de cada tabla (índice 0 = Nro). */
export const COL = {
  emitidos: { serie: 1, clave: 2, autorizacion: 3, emision: 4, subtotal: 5, iva: 6, total: 7 },
  recibidos: { emisor: 1, serie: 2, clave: 3, autorizacion: 4, emision: 5, subtotal: 6, iva: 7, total: 8 },
} as const;

export const byId = (root: ParentNode, id: string) =>
  root.querySelector<HTMLElement>(`[id="${id.replace(/"/g, '\\"')}"]`);
