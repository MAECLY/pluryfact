import { parseClave, type ClaveAcceso } from './clave';
import { byId, COL, linkFila, TABLA, VIEW_STATE } from './selectors';
import type { Bandeja, Fecha } from './types';

export interface Emisor {
  ruc: string;
  razonSocial: string;
}

export interface FilaComprobante {
  bandeja: Bandeja;
  /** Índice `data-ri` de la fila: el SRI lo usa en los ids de los enlaces. */
  indice: number;
  tipoTexto: string;
  serie: string;
  clave: ClaveAcceso;
  autorizadoEn: string;
  fechaEmision: Fecha;
  subtotal: number;
  iva: number;
  total: number;
  emisor: Emisor | null;
  enlaces: { xml: string | null; pdf: string | null };
}

export interface ResultadoTabla {
  filas: FilaComprobante[];
  /** Filas que no se pudieron leer (clave inválida, celdas faltantes). */
  descartadas: number;
  paginaActual: number;
  totalPaginas: number;
}

const texto = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function parseFecha(s: string): Fecha | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s.trim());
  if (!m) return null;
  return { dia: Number(m[1]), mes: Number(m[2]), anio: Number(m[3]) };
}

export function parseMonto(s: string): number {
  const n = Number(s.trim());
  return Number.isFinite(n) ? n : 0;
}

/** "Factura  001-001-000001800" → { tipo: "Factura", serie: "001-001-000001800" } */
export function parseTipoSerie(s: string): { tipo: string; serie: string } {
  const m = /^(.*?)\s+(\d{3}-\d{3}-\d{9})$/.exec(s.replace(/\s+/g, ' ').trim());
  return m ? { tipo: m[1]!, serie: m[2]! } : { tipo: s.trim(), serie: '' };
}

/** La celda de emisor trae "RUC<br>RAZÓN SOCIAL". */
export function parseEmisor(celda: Element): Emisor | null {
  const partes = (celda.textContent ?? '')
    .split(/\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const ruc = partes.find((p) => /^\d{13}$/.test(p));
  if (!ruc) return null;
  return { ruc, razonSocial: partes.filter((p) => p !== ruc).join(' ') };
}

function paginador(root: ParentNode, bandeja: Bandeja) {
  const t = texto(byId(root, `${TABLA[bandeja]}_paginator_bottom`)?.querySelector('.ui-paginator-current'));
  const m = /\((\d+) of (\d+)\)/.exec(t);
  return m ? { paginaActual: Number(m[1]), totalPaginas: Number(m[2]) } : { paginaActual: 1, totalPaginas: 1 };
}

export function parseTabla(root: ParentNode, bandeja: Bandeja): ResultadoTabla {
  const cuerpo = byId(root, `${TABLA[bandeja]}_data`);
  const filas: FilaComprobante[] = [];
  let descartadas = 0;
  const col = COL[bandeja];

  for (const tr of Array.from(cuerpo?.querySelectorAll('tr[data-ri]') ?? [])) {
    const celdas = Array.from(tr.querySelectorAll(':scope > td'));
    const indice = Number(tr.getAttribute('data-ri'));
    const clave = parseClave(texto(celdas[col.clave]));
    const fechaEmision = parseFecha(texto(celdas[col.emision]));
    if (!clave || !fechaEmision || !Number.isInteger(indice)) {
      descartadas++;
      continue;
    }
    const { tipo, serie } = parseTipoSerie(texto(celdas[col.serie]));
    const idXml = linkFila(bandeja, indice, 'lnkXml');
    const idPdf = linkFila(bandeja, indice, 'lnkPdf');
    filas.push({
      bandeja,
      indice,
      tipoTexto: tipo,
      serie,
      clave,
      autorizadoEn: texto(celdas[col.autorizacion]),
      fechaEmision,
      subtotal: parseMonto(texto(celdas[col.subtotal])),
      iva: parseMonto(texto(celdas[col.iva])),
      total: parseMonto(texto(celdas[col.total])),
      emisor: 'emisor' in col ? parseEmisor(celdas[col.emisor]!) : null,
      enlaces: {
        xml: byId(tr, idXml) ? idXml : null,
        pdf: byId(tr, idPdf) ? idPdf : null,
      },
    });
  }
  return { filas, descartadas, ...paginador(root, bandeja) };
}

export function leerViewState(root: ParentNode): string | null {
  return root.querySelector<HTMLInputElement>(`input[name="${VIEW_STATE}"]`)?.value ?? null;
}
