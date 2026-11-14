import type { AjustesPluryprint } from '@/lib/ajustes';
import type { Trabajo } from '@/lib/cola';
import { consultasEmitidos, consultasRecibidos, type Periodo } from '@/lib/periodo';
import type { Bandeja, Fecha, TipoComprobante } from '@/lib/types';
import { construirPeriodo, hoyEcuador, type TipoPeriodo } from '@/entrypoints/popup/estado';
import { capital, duracion, MESES, miles, PLURAL } from './textos';

const TIPOS: Record<Bandeja, TipoComprobante[]> = {
  recibidos: ['factura', 'retencion', 'nota-credito', 'nota-debito', 'liquidacion'],
  emitidos: ['factura', 'retencion', 'nota-credito', 'nota-debito', 'liquidacion', 'guia-remision'],
};

/** Supuestos de la estimación, medidos en vivo: ~150 comprobantes/mes y ~0,5 s por archivo desde el portal. */
const COMPROBANTES_POR_MES = 150;
const SEGUNDOS_POR_ARCHIVO = 0.5;

export interface Plan {
  valido: boolean;
  texto: string;
  consultas: number;
  /** Estimación aproximada; null si no aplica. */
  estimacion: { archivos: number; ms: number } | null;
}

export interface Formulario {
  leerTrabajo(): Trabajo;
  plan(): Plan;
  ponerBandeja(b: Bandeja): void;
  /** Rellena el formulario con un trabajo anterior ("Repetir con los mismos filtros"). */
  cargar(t: Trabajo): void;
  /**
   * Muestra la casilla «Enviar a PluryPrint al terminar» si PluryPrint está
   * conectado (null la oculta). Al marcarla fija los formatos que hacen falta
   * para imprimir lo elegido en Avanzado.
   */
  ponerPluryprint(a: AjustesPluryprint | null): void;
  /** true si la casilla de PluryPrint está visible y marcada. */
  imprimir(): boolean;
}

const HTML = `
  <fieldset class="grupo">
    <legend>Qué</legend>
    <div data-ref="tipos" class="opciones"></div>
  </fieldset>
  <fieldset class="grupo">
    <legend>Cuándo</legend>
    <div class="modos" role="group" aria-label="Tipo de periodo">
      <button type="button" data-periodo="mes" aria-pressed="true">Mes</button>
      <button type="button" data-periodo="anio" aria-pressed="false">Año</button>
      <button type="button" data-periodo="dia" aria-pressed="false">Día</button>
      <button type="button" data-periodo="rango" aria-pressed="false">Rango</button>
    </div>
    <div data-ref="periodo" class="campos"></div>
  </fieldset>
  <fieldset class="grupo" data-ref="sec-emisor">
    <legend><label for="emisor">De quién</label></legend>
    <input id="emisor" class="campo" type="text" placeholder="Todos los emisores, o un RUC o nombre" autocomplete="off" />
  </fieldset>
  <fieldset class="grupo">
    <legend>Archivos</legend>
    <div class="casillas">
      <label><input id="f-xml" type="checkbox" checked />XML</label>
      <label><input id="f-pdf" type="checkbox" checked />RIDE en PDF</label>
      <label><input id="f-txt" type="checkbox" />Reporte del SRI</label>
    </div>
    <label class="casilla-pluryprint" data-ref="pluryprint" hidden><input id="f-pluryprint" type="checkbox" />Enviar a PluryPrint al terminar</label>
  </fieldset>`;

export function montarFormulario(raiz: HTMLElement, alCambiar: () => void): Formulario {
  raiz.insertAdjacentHTML('afterbegin', HTML);
  const ref = <T extends HTMLElement>(n: string) => raiz.querySelector<T>(`[data-ref="${n}"]`)!;
  const id = <T extends HTMLElement>(n: string) => raiz.querySelector<T>(`#${n}`)!;
  const hoy = hoyEcuador();
  const iso = (f: Fecha) => `${f.anio}-${String(f.mes).padStart(2, '0')}-${String(f.dia).padStart(2, '0')}`;

  let bandeja: Bandeja = 'recibidos';
  let tipoPeriodo: TipoPeriodo = 'mes';
  let pluryprint: AjustesPluryprint | null = null;
  /** Lo que el usuario había marcado antes de que la casilla de PluryPrint fijara formatos. */
  const marcadoAntes: Record<'xml' | 'pdf' | 'txt', boolean | null> = { xml: null, pdf: null, txt: null };

  /** Formatos que exige imprimir lo elegido en Avanzado: RIDE si incluye RIDE, XML si es solo XML, TXT si pide el reporte. */
  function fijarFormatos() {
    const activa = !!pluryprint && id<HTMLInputElement>('f-pluryprint').checked;
    const exigidos = {
      pdf: activa && pluryprint!.contenido !== 'xml',
      xml: activa && pluryprint!.contenido !== 'ride',
      txt: activa && pluryprint!.incluirReporte,
    };
    for (const f of ['xml', 'pdf', 'txt'] as const) {
      const c = id<HTMLInputElement>(`f-${f}`);
      if (exigidos[f] && !c.disabled) {
        marcadoAntes[f] = c.checked;
        c.checked = true;
        c.disabled = true;
        c.title = 'Lo necesita la impresión con PluryPrint';
      } else if (!exigidos[f] && c.disabled) {
        c.disabled = false;
        c.title = '';
        if (marcadoAntes[f] !== null) c.checked = marcadoAntes[f]!;
        marcadoAntes[f] = null;
      }
    }
  }
  const tipos = new Set<TipoComprobante>(['factura']);

  function pintarPeriodo(valores?: Periodo) {
    const anios = Array.from({ length: hoy.anio - 2021 }, (_, i) => hoy.anio - i);
    const mesSel = valores?.tipo === 'mes' ? valores.mes : hoy.mes;
    const anioSel = valores && 'anio' in valores ? valores.anio : hoy.anio;
    const cont = ref('periodo');
    cont.textContent = '';
    const campo = (texto: string, el: HTMLElement) => {
      const l = document.createElement('label');
      l.append(texto, el);
      cont.append(l);
    };
    const lista = (idCampo: string, opciones: Array<[string, string]>, sel: string) => {
      const s = document.createElement('select');
      s.id = idCampo;
      s.className = 'campo';
      for (const [v, t] of opciones) s.add(new Option(t, v, false, v === sel));
      return s;
    };
    const fecha = (idCampo: string, f?: Fecha) => {
      const i = document.createElement('input');
      i.id = idCampo;
      i.className = 'campo';
      i.type = 'date';
      i.max = iso(hoy);
      i.value = iso(f ?? hoy);
      return i;
    };
    if (tipoPeriodo === 'mes') {
      campo('Mes', lista('p-mes', MESES.map((m, i) => [String(i + 1), capital(m)]), String(mesSel)));
      campo('Año', lista('p-anio', anios.map((a) => [String(a), String(a)]), String(anioSel)));
    } else if (tipoPeriodo === 'anio') campo('Año', lista('p-anio', anios.map((a) => [String(a), String(a)]), String(anioSel)));
    else if (tipoPeriodo === 'dia') campo('Fecha', fecha('p-dia', valores?.tipo === 'dia' ? valores.fecha : undefined));
    else {
      campo('Desde', fecha('p-desde', valores?.tipo === 'rango' ? valores.desde : undefined));
      campo('Hasta', fecha('p-hasta', valores?.tipo === 'rango' ? valores.hasta : undefined));
    }
    cont.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', alCambiar));
  }

  function pintarTipos() {
    const lista = TIPOS[bandeja];
    for (const t of [...tipos]) if (!lista.includes(t)) tipos.delete(t);
    const cont = ref('tipos');
    cont.textContent = '';
    for (const t of lista) {
      const l = document.createElement('label');
      l.className = 'opcion';
      const c = document.createElement('input');
      c.type = 'checkbox';
      c.dataset.tipo = t;
      c.checked = tipos.has(t);
      c.addEventListener('change', () => {
        if (c.checked) tipos.add(t);
        else tipos.delete(t);
        alCambiar();
      });
      l.append(c, PLURAL[t]);
      cont.append(l);
    }
  }

  function marcarModo() {
    raiz.querySelectorAll<HTMLButtonElement>('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === tipoPeriodo)));
  }
  raiz.querySelectorAll<HTMLButtonElement>('[data-periodo]').forEach((b) =>
    b.addEventListener('click', () => {
      tipoPeriodo = b.dataset.periodo as TipoPeriodo;
      marcarModo();
      pintarPeriodo();
      alCambiar();
    }),
  );
  raiz.querySelectorAll('#f-xml,#f-pdf,#f-txt,#emisor').forEach((el) => el.addEventListener('change', alCambiar));
  id('f-pluryprint').addEventListener('change', () => {
    fijarFormatos();
    alCambiar();
  });

  const leerPeriodo = (): Periodo => {
    const v = (n: string) => raiz.querySelector<HTMLInputElement | HTMLSelectElement>(`#${n}`)?.value;
    return construirPeriodo(tipoPeriodo, { dia: v('p-dia'), desde: v('p-desde'), hasta: v('p-hasta'), anio: v('p-anio'), mes: v('p-mes') });
  };

  const api: Formulario = {
    leerTrabajo: () => ({
      bandeja,
      periodo: leerPeriodo(),
      tipos: [...tipos],
      emisor: bandeja === 'recibidos' ? id<HTMLInputElement>('emisor').value.trim() : '',
      formatos: { xml: id<HTMLInputElement>('f-xml').checked, pdf: id<HTMLInputElement>('f-pdf').checked, txt: id<HTMLInputElement>('f-txt').checked },
      ...(api.imprimir() ? { imprimir: true } : {}),
    }),
    imprimir: () => !!pluryprint && id<HTMLInputElement>('f-pluryprint').checked,
    ponerPluryprint(a) {
      pluryprint = a?.activado ? a : null;
      ref('pluryprint').hidden = !pluryprint;
      if (!pluryprint) id<HTMLInputElement>('f-pluryprint').checked = false;
      fijarFormatos();
      alCambiar();
    },
    plan(): Plan {
      try {
        const p = leerPeriodo();
        if (!tipos.size) throw new RangeError('Elige al menos un tipo de comprobante.');
        const t = api.leerTrabajo();
        if (!t.formatos.xml && !t.formatos.pdf && !t.formatos.txt) throw new RangeError('Elige al menos un tipo de archivo.');
        const porTipo = bandeja === 'recibidos' ? consultasRecibidos(p, hoy).length : consultasEmitidos(p, hoy).length;
        const consultas = porTipo * tipos.size;
        const unidad = bandeja === 'recibidos' ? (p.tipo === 'dia' ? 'del día' : 'por mes') : 'por día';
        const texto = consultas === 1 ? 'Hará una consulta al SRI.' : `Hará ${miles(consultas)} consultas al SRI, una ${unidad}${tipos.size > 1 ? ' y tipo' : ''}.`;
        let estimacion: Plan['estimacion'] = null;
        if (bandeja === 'recibidos' && p.tipo !== 'dia') {
          const comprobantes = porTipo * COMPROBANTES_POR_MES * (t.tipos.includes('factura') ? 1 : 0.2) * tipos.size;
          const archivos = Math.round(comprobantes * ((t.formatos.xml ? 1 : 0) + (t.formatos.pdf ? 1 : 0)));
          estimacion = { archivos, ms: archivos * SEGUNDOS_POR_ARCHIVO * 1000 + consultas * 8000 };
        }
        return { valido: true, texto, consultas, estimacion };
      } catch (e) {
        return { valido: false, texto: e instanceof Error ? e.message : String(e), consultas: 0, estimacion: null };
      }
    },
    ponerBandeja(b) {
      bandeja = b;
      ref('sec-emisor').hidden = b === 'emitidos';
      pintarTipos();
      alCambiar();
    },
    cargar(t) {
      tipos.clear();
      t.tipos.forEach((x) => tipos.add(x));
      tipoPeriodo = t.periodo.tipo;
      marcarModo();
      pintarPeriodo(t.periodo);
      id<HTMLInputElement>('emisor').value = t.emisor;
      id<HTMLInputElement>('f-xml').checked = t.formatos.xml;
      id<HTMLInputElement>('f-pdf').checked = t.formatos.pdf;
      id<HTMLInputElement>('f-txt').checked = t.formatos.txt;
      for (const f of ['xml', 'pdf', 'txt'] as const) {
        id<HTMLInputElement>(`f-${f}`).disabled = false;
        marcadoAntes[f] = null;
      }
      id<HTMLInputElement>('f-pluryprint').checked = !!pluryprint && !!t.imprimir;
      fijarFormatos();
      pintarTipos();
      alCambiar();
    },
  };
  pintarPeriodo();
  pintarTipos();
  return api;
}

export const textoEstimacion = (e: Plan['estimacion']) =>
  e ? `Aproximadamente ${miles(Math.round(e.archivos / 50) * 50 || e.archivos)} archivos y ${duracion(e.ms)}, según cuántos comprobantes tengas.` : '';
