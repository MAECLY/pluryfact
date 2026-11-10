import type { Paso } from '@/lib/cola';
import { descripcionPaso, rotulo } from './textos';

/**
 * El fichero: una pestaña de archivador por periodo. Se rellena de manila al
 * completarse; la cinta roja marca problemas. Con muchos periodos (un año de
 * emitidos son 365 días) se vuelve una trama densa sin rótulos.
 */
export function pintarFichero(ol: HTMLElement, pasos: Paso[], maxColumnas = 12) {
  ol.textContent = '';
  const denso = pasos.length > 16;
  ol.dataset.denso = String(denso);
  const columnas = denso ? Math.min(maxColumnas * 2, 31) : Math.max(Math.min(pasos.length, maxColumnas), 6);
  ol.style.setProperty('--columnas', String(columnas));
  for (const x of pasos) {
    const li = document.createElement('li');
    li.className = 'ficha';
    li.dataset.estado = x.estado;
    if (x.estado === 'ok' && x.fallidos) li.dataset.problema = 'true';
    li.textContent = denso ? '' : rotulo(x);
    li.title = descripcionPaso(x);
    li.setAttribute('aria-label', descripcionPaso(x));
    ol.append(li);
  }
}
