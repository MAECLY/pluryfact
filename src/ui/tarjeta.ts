import type { EstadoTrabajo } from '@/lib/mensajeria';
import { pintarFichero } from './fichero';
import { capital, duracion, hora, miles, tituloTrabajo } from './textos';

export const enMarcha = (e: EstadoTrabajo) => ['consultando', 'descargando', 'empaquetando'].includes(e.fase);

/** Frase principal: qué está pasando o cómo terminó. */
export function fraseEstado(e: EstadoTrabajo): string {
  if (e.verificacion) return 'El SRI muestra una verificación en la pestaña del portal. Resuélvela y Pluryfact seguirá solo.';
  if (enMarcha(e)) return e.mensaje;
  if (e.fase === 'cancelado') return e.zip ? 'Cancelada. Lo que se alcanzó a bajar está en tu carpeta de descargas.' : 'Cancelada.';
  if (e.fase === 'error') return e.zip ? 'Lo que se alcanzó a bajar está en tu carpeta de descargas.' : 'La descarga se detuvo.';
  return e.zip ? 'Listo. El ZIP está en tu carpeta de descargas.' : e.mensaje;
}

/** Problema con su acción, o null. La primera frase es qué pasó; el resto, qué hacer. */
export function problema(e: EstadoTrabajo): string | null {
  if (enMarcha(e) || e.fase === 'listo' || e.fase === 'cancelado') return null;
  return e.mensaje.replace(/ Se guardó lo ya descargado.*$/, '') || null;
}

/** Línea secundaria: cifras y tiempo. Se recalcula cada segundo. */
export function lineaCifras(e: EstadoTrabajo, ahora: number): string {
  const partes: string[] = [];
  if (e.descargados) partes.push(`${miles(e.descargados)} ${e.descargados === 1 ? 'archivo listo' : 'archivos listos'}.`);
  else if (e.encontrados) partes.push(`${miles(e.encontrados)} comprobantes encontrados.`);
  if (enMarcha(e)) {
    const silencio = ahora - e.actualizado;
    if (e.esperaHasta && e.esperaHasta > ahora) partes.push(`Siguiente consulta en ${Math.ceil((e.esperaHasta - ahora) / 1000)} s.`);
    else if (silencio > 30_000) partes.push(`Esperando respuesta del SRI desde hace ${Math.round(silencio / 1000)} s.`);
    else if (e.consultasHechas > 0 && e.consultasTotal > e.consultasHechas) {
      const resto = ((ahora - e.inicio) / e.consultasHechas) * (e.consultasTotal - e.consultasHechas);
      partes.push(resto < 60_000 ? 'Falta menos de un minuto.' : `Faltan unos ${duracion(resto)}.`);
    }
  } else if (e.fallidos) partes.push(`${miles(e.fallidos)} ${e.fallidos === 1 ? 'archivo no se pudo bajar' : 'archivos no se pudieron bajar'}.`);
  return partes.join(' ');
}

/** Estado del envío a Pluryprint de este trabajo, o null si no aplica. */
export function lineaImpresion(e: EstadoTrabajo): { texto: string; estado: 'enviando' | 'entregado' | 'error' | 'pendiente' } | null {
  const i = e.impresion;
  if (i?.estado === 'enviando')
    return { estado: 'enviando', texto: i.enviados ? `Enviando a Pluryprint: ${miles(i.enviados)} de ${miles(i.archivos)} archivos.` : `Enviando a Pluryprint. ${i.mensaje}` };
  if (i?.estado === 'entregado') return { estado: 'entregado', texto: i.mensaje };
  if (i?.estado === 'error') return { estado: 'error', texto: `No se pudo enviar a Pluryprint. ${i.mensaje}` };
  if (e.trabajo?.imprimir && enMarcha(e)) return { estado: 'pendiente', texto: 'Al terminar se enviará a Pluryprint.' };
  return null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, clase: string, texto?: string) {
  const x = document.createElement(tag);
  x.className = clase;
  if (texto !== undefined) x.textContent = texto;
  return x;
}

/**
 * Pinta un trabajo. `completa` añade la tabla mes a mes (esperados contra
 * obtenidos) para la página; el popup usa la versión compacta.
 */
export function pintarTarjeta(cont: HTMLElement, e: EstadoTrabajo, completa: boolean, nivelTitulo: 'h1' | 'h2' | 'h3' = 'h1') {
  // El progreso llega varias veces por segundo: al redibujar se conserva lo
  // que el usuario abrió y dónde estaba leyendo.
  const antes = cont.querySelector<HTMLDetailsElement>('details.detalle');
  const estabaAbierto = !!antes?.open;
  const scrollActividad = cont.querySelector<HTMLElement>('.actividad')?.scrollTop ?? 0;
  cont.textContent = '';
  cont.append(el(nivelTitulo, 'titulo', tituloTrabajo(e.trabajo)));
  const ol = el('ol', 'fichero');
  ol.setAttribute('aria-label', 'Avance por periodo');
  pintarFichero(ol, e.pasos ?? []);
  cont.append(ol);
  cont.append(el('p', 'estado-frase', fraseEstado(e)));
  const cifras = el('p', 'cifras', lineaCifras(e, Date.now()));
  cifras.dataset.cifras = 'true';
  cont.append(cifras);

  const imp = lineaImpresion(e);
  if (imp) {
    const linea = el('p', 'linea-impresion', imp.texto);
    linea.dataset.estado = imp.estado;
    cont.append(linea);
  }

  const p = problema(e);
  if (p) {
    const caja = el('p', 'problema');
    const [que, ...resto] = p.split(/(?<=\.)\s+/);
    caja.append(el('strong', '', que ?? ''), resto.length ? ` ${resto.join(' ')}` : '');
    cont.append(caja);
  }

  const detalle = el('details', 'detalle');
  detalle.append(el('summary', '', 'Ver detalle'));
  if (completa && e.pasos?.length) {
    const tabla = el('table', 'tabla-pasos');
    const cab = tabla.createTHead().insertRow();
    for (const t of ['Periodo', 'Comprobantes', 'Archivos sin bajar', 'Estado']) cab.append(el('th', '', t));
    const cuerpo = tabla.createTBody();
    for (const x of e.pasos) {
      const f = cuerpo.insertRow();
      f.dataset.estado = x.estado;
      f.insertCell().textContent = capital(x.etiqueta);
      f.insertCell().textContent = x.estado === 'ok' || x.estado === 'descargando' ? miles(x.comprobantes) : '—';
      f.insertCell().textContent = x.fallidos ? miles(x.fallidos) : '—';
      f.insertCell().textContent =
        x.estado === 'ok' ? (x.fallidos ? 'Incompleto' : 'Completo') : x.estado === 'sin-datos' ? 'Sin comprobantes' : x.estado === 'fallida' ? 'No se pudo consultar' : x.estado === 'pendiente' ? 'Pendiente' : 'En curso';
    }
    detalle.append(tabla);
  }
  const act = el('ol', 'actividad');
  for (const a of [...(e.actividad ?? [])].reverse().slice(0, completa ? 40 : 20)) {
    const li = el('li', `actividad-${a.nivel}`);
    li.append(el('time', '', hora(a.t)), a.texto);
    act.append(li);
  }
  detalle.append(act);
  const fallidas = [...(e.consultasFallidas ?? []), ...(e.errores ?? [])];
  if (fallidas.length) {
    const ul = el('ul', 'fallidas');
    for (const f of fallidas) ul.append(el('li', '', f));
    detalle.append(ul);
  }
  detalle.open = estabaAbierto;
  cont.append(detalle);
  if (estabaAbierto) act.scrollTop = scrollActividad;
}

/** Refresca solo la línea de cifras (cuenta regresiva, silencio, tiempo restante). */
export function refrescarCifras(cont: HTMLElement, e: EstadoTrabajo) {
  const c = cont.querySelector<HTMLElement>('[data-cifras]');
  if (c) c.textContent = lineaCifras(e, Date.now());
}

/** Resumen copiable de un trabajo, para soporte o para guardar. */
export function resumenTexto(e: EstadoTrabajo): string {
  const lineas = [
    tituloTrabajo(e.trabajo),
    `Estado: ${fraseEstado(e)}`,
    `Archivos: ${e.descargados}${e.fallidos ? `, sin bajar: ${e.fallidos}` : ''}`,
    e.zip ? `ZIP: ${e.zip}` : '',
    e.impresion ? `Pluryprint: ${lineaImpresion(e)?.texto ?? ''}` : '',
    ...(e.pasos ?? []).map((x) => `  ${capital(x.etiqueta)}: ${x.estado}${x.comprobantes ? `, ${x.comprobantes} comprobantes` : ''}${x.fallidos ? `, ${x.fallidos} sin bajar` : ''}`),
  ];
  return lineas.filter(Boolean).join('\n');
}
