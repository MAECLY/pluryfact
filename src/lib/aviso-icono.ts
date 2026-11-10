import type { EstadoTrabajo } from './mensajeria';

export interface Insignia {
  texto: string;
  color: string;
  titulo: string;
}

const enMarcha = (e: EstadoTrabajo) => ['consultando', 'descargando', 'empaquetando'].includes(e.fase);

/** Insignia y título del icono de la extensión según el trabajo. */
export function insignia(e: EstadoTrabajo | undefined): Insignia {
  if (!e) return { texto: '', color: '#1D3A6E', titulo: 'Legajo' };
  if (enMarcha(e)) {
    const total = e.consultasTotal || 0;
    const hechas = Math.min(e.consultasHechas + 1, total);
    return {
      texto: total && total <= 99 ? `${hechas}/${total}` : '…',
      color: '#1D3A6E',
      titulo: `Legajo: descargando (${hechas} de ${total}). Puedes cerrar esta ventana; no cierres la pestaña del SRI.`,
    };
  }
  if (e.fase === 'error' || e.pendientes?.length) return { texto: '!', color: '#A8701A', titulo: 'Legajo: la descarga necesita tu atención.' };
  if (e.fase === 'listo') return { texto: '✓', color: '#2D7A4F', titulo: 'Legajo: descarga lista.' };
  return { texto: '', color: '#1D3A6E', titulo: 'Legajo' };
}

export interface Notificacion {
  id: string;
  titulo: string;
  mensaje: string;
  /** No se cierra sola: requiere que el usuario actúe. */
  insistente: boolean;
}

/**
 * Notificación del sistema solo en momentos que piden atención: al terminar,
 * al caducar la sesión y ante un error. Nunca por cada mes.
 */
export function notificacion(antes: EstadoTrabajo | undefined, ahora: EstadoTrabajo | undefined): Notificacion | null {
  if (!ahora || (antes && antes.fase === ahora.fase && antes.inicio === ahora.inicio)) return null;
  if (!['listo', 'error'].includes(ahora.fase)) return null;
  const id = `legajo-${ahora.inicio}-${ahora.fase}`;
  if (ahora.fase === 'listo')
    return {
      id,
      titulo: 'Descarga lista',
      mensaje: ahora.zip
        ? `${ahora.descargados.toLocaleString('es-EC')} archivos en tu carpeta de descargas.${ahora.fallidos ? ` ${ahora.fallidos} no se pudieron bajar.` : ''}`
        : ahora.mensaje,
      insistente: false,
    };
  const sesion = /sesión del SRI caducó/i.test(ahora.mensaje);
  return {
    id,
    titulo: sesion ? 'Tu sesión del SRI caducó' : 'La descarga se detuvo',
    mensaje: sesion ? 'Inicia sesión otra vez y pulsa Reanudar en Legajo.' : ahora.mensaje.slice(0, 180),
    insistente: true,
  };
}
