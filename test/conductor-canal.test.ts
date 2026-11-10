import { expect, it } from 'vitest';
import { CANAL, instalarConductor, type MensajeCanal } from '../src/lib/conductor';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

it('se presenta y solo atiende órdenes dirigidas a su identidad', async () => {
  document.body.innerHTML = '';
  const recibidos: MensajeCanal[] = [];
  const oyente = (ev: MessageEvent<MensajeCanal>) => ev.data?.canal === CANAL && recibidos.push(ev.data);
  window.addEventListener('message', oyente);
  instalarConductor(window, 'v1:a');
  await esperar(20);
  expect(recibidos.some((m) => m.tipo === 'hola' && m.conductor === 'v1:a')).toBe(true);

  // happy-dom no rellena ev.source en postMessage: se despacha como lo hace el navegador.
  const enviar = (data: MensajeCanal) => window.dispatchEvent(new MessageEvent('message', { data, source: window }));
  enviar({ canal: CANAL, tipo: 'orden', id: 1, para: 'v1:otro', orden: { accion: 'siguiente-pagina', bandeja: 'recibidos' } });
  enviar({ canal: CANAL, tipo: 'orden', id: 2, para: 'v1:a', orden: { accion: 'siguiente-pagina', bandeja: 'recibidos' } });
  await esperar(50);
  const respuestas = recibidos.filter((m) => m.tipo === 'respuesta');
  expect(respuestas.map((r) => r.id)).toEqual([2]);
  expect(respuestas[0]!.conductor).toBe('v1:a');
  window.removeEventListener('message', oyente);
});
