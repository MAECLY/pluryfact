import { describe, expect, it, vi } from 'vitest';
import { ClientePluryprint, type PuertoNativo } from '../src/lib/pluryprint';
import { atenderPuerto, MAX_DATA_BASE64, MOTIVO_SIN_PERMISO, peticionValida, puertoHaciaPuente, remitenteValido, type PuertoRuntime } from '../src/lib/puente-pluryprint';
import { crearHostFalso } from '../scripts/pluryprint-host-falso';

const ID = 'ibgodfpcihlddbbfaoooehfgbmahipbj';
const BASE = `chrome-extension://${ID}/`;
const SRI = 'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf';

/** Par de puertos runtime conectados (página ↔ background), como los de Chrome. */
function parRuntime(sender: NonNullable<PuertoRuntime['sender']>, name = 'pluryprint') {
  const lados = { pagina: { msg: [] as Array<(m: unknown) => void>, fin: [] as Array<() => void> }, fondo: { msg: [] as Array<(m: unknown) => void>, fin: [] as Array<() => void> } };
  let abierto = true;
  const cerrar = (quien: 'pagina' | 'fondo') => {
    if (!abierto) return;
    abierto = false;
    // Chrome avisa solo al OTRO extremo, después de los mensajes ya enviados.
    queueMicrotask(() => lados[quien === 'pagina' ? 'fondo' : 'pagina'].fin.forEach((f) => f()));
  };
  const crear = (yo: 'pagina' | 'fondo'): PuertoRuntime => ({
    name,
    ...(yo === 'fondo' ? { sender } : {}),
    postMessage: (m) => {
      if (!abierto) throw new Error('Attempting to use a disconnected port object');
      const copia = JSON.parse(JSON.stringify(m)) as unknown;
      queueMicrotask(() => lados[yo === 'pagina' ? 'fondo' : 'pagina'].msg.forEach((f) => f(copia)));
    },
    onMessage: { addListener: (f) => void lados[yo].msg.push(f) },
    onDisconnect: { addListener: (f) => void lados[yo].fin.push(f) },
    disconnect: () => cerrar(yo),
  });
  return { pagina: crear('pagina'), fondo: crear('fondo'), abierto: () => abierto };
}

/** Puerto nativo conectado al host falso, con registro de lo que pasa. */
function nativoFalso() {
  const host = crearHostFalso();
  const alMsg: Array<(m: unknown) => void> = [];
  const alFin: Array<(motivo?: string) => void> = [];
  const recibidos: Array<Record<string, unknown>> = [];
  let desconectado = false;
  const puerto: PuertoNativo = {
    postMessage: (m) => {
      recibidos.push(m as Record<string, unknown>);
      const r = host.atender(m as Record<string, unknown>);
      queueMicrotask(() => alMsg.forEach((f) => f(r)));
    },
    onMessage: { addListener: (f) => void alMsg.push(f) },
    onDisconnect: { addListener: (f) => void alFin.push(f) },
    disconnect: () => {
      desconectado = true;
      host.cerrar();
    },
  };
  return { puerto, host, recibidos, caer: (motivo: string) => alFin.forEach((f) => f(motivo)), desconectado: () => desconectado };
}

const deps = (n: ReturnType<typeof nativoFalso>, permiso = true) => ({
  idExtension: ID,
  urlBase: BASE,
  tienePermiso: vi.fn(async () => permiso),
  conectarNativo: vi.fn(() => n.puerto),
  registro: { info: vi.fn(), aviso: vi.fn(), error: vi.fn() },
});

describe('remitente y forma', () => {
  it('solo la propia extensión: sus páginas o su content script en la pantalla de comprobantes', () => {
    expect(remitenteValido({ id: ID, url: `${BASE}pluryfact.html#descargas` }, ID, BASE)).toBe(true);
    expect(remitenteValido({ id: ID, url: SRI, tab: { id: 3 } }, ID, BASE)).toBe(true);
    expect(remitenteValido({ id: ID, url: SRI }, ID, BASE)).toBe(false);
    expect(remitenteValido({ id: 'otra', url: `chrome-extension://otra/x.html` }, ID, BASE)).toBe(false);
    expect(remitenteValido({ id: ID, url: 'https://evil.example/', tab: { id: 1 } }, ID, BASE)).toBe(false);
    expect(remitenteValido({ id: ID, url: 'https://srienlinea.sri.gob.ec/sri-en-linea/inicio', tab: { id: 1 } }, ID, BASE)).toBe(false);
    expect(remitenteValido(undefined, ID, BASE)).toBe(false);
  });

  it('peticiones: sobre v1, tipo conocido, id corto, sin campos de respuesta, data acotada', () => {
    expect(peticionValida({ v: 1, id: '1', type: 'hello' })).toBe(true);
    expect(peticionValida({ v: 2, id: '1', type: 'hello' })).toBe(false);
    expect(peticionValida({ v: 1, id: '', type: 'hello' })).toBe(false);
    expect(peticionValida({ v: 1, id: 'x'.repeat(65), type: 'hello' })).toBe(false);
    expect(peticionValida({ v: 1, id: '1', type: 'printNow' })).toBe(false);
    expect(peticionValida({ v: 1, id: '1', type: 'hello', ok: true })).toBe(false);
    expect(peticionValida({ v: 1, id: '1', type: 'putFile', data: 'x'.repeat(MAX_DATA_BASE64 + 1) })).toBe(false);
    expect(peticionValida({ v: 1, id: '1', type: 'putFile' })).toBe(false);
    expect(peticionValida(null)).toBe(false);
    expect(peticionValida([1])).toBe(false);
  });
});

describe('atenderPuerto', () => {
  it('ignora puertos con otro nombre y rechaza remitentes ajenos', () => {
    const n = nativoFalso();
    expect(atenderPuerto(parRuntime({ id: ID, url: `${BASE}x.html` }, 'otro').fondo, deps(n))).toBe(false);
    const ajeno = parRuntime({ id: ID, url: 'https://evil.example/', tab: { id: 1 } });
    const d = deps(n);
    expect(atenderPuerto(ajeno.fondo, d)).toBe(false);
    expect(ajeno.abierto()).toBe(false);
    expect(d.conectarNativo).not.toHaveBeenCalled();
  });

  it('de punta a punta: el cliente de la página imprime a través del puente', async () => {
    const n = nativoFalso();
    const par = parRuntime({ id: ID, url: `${BASE}pluryfact.html` });
    atenderPuerto(par.fondo, deps(n));
    const c = new ClientePluryprint(puertoHaciaPuente(par.pagina), { clientVersion: '0.2.0' });
    const r = await c.enviar({ label: 'x', action: 'configure' }, [{ nombre: 'a.pdf', kind: 'pdf', datos: new TextEncoder().encode('%PDF-1.4 ok') }]);
    expect(r.archivos).toBe(1);
    expect(n.recibidos.map((m) => m.type)).toEqual(['hello', 'beginJob', 'putFile', 'commitJob']);
    c.cerrar();
    await vi.waitFor(() => expect(n.desconectado()).toBe(true));
  });

  it('sin el permiso opcional cierra con un motivo que el cliente traduce a «sin_permiso»', async () => {
    const n = nativoFalso();
    const par = parRuntime({ id: ID, url: `${BASE}pluryfact.html` });
    const d = deps(n, false);
    atenderPuerto(par.fondo, d);
    const e = await new ClientePluryprint(puertoHaciaPuente(par.pagina), { clientVersion: '0.2.0' }).saludar().catch((x: unknown) => x);
    expect(e).toMatchObject({ codigo: 'sin_permiso' });
    expect(MOTIVO_SIN_PERMISO).toMatch(/nativeMessaging/);
    expect(d.conectarNativo).not.toHaveBeenCalled();
  });

  it('host no instalado: el motivo de Chrome llega a la página', async () => {
    const n = nativoFalso();
    n.puerto.postMessage = () => {};
    const par = parRuntime({ id: ID, url: `${BASE}pluryfact.html` });
    atenderPuerto(par.fondo, deps(n));
    const promesa = new ClientePluryprint(puertoHaciaPuente(par.pagina), { clientVersion: '0.2.0' }).saludar().catch((x: unknown) => x);
    await new Promise((r) => setTimeout(r, 0));
    n.caer('Specified native messaging host not found.');
    expect(await promesa).toMatchObject({ codigo: 'no_instalado' });
  });

  it('connectNative que lanza (API ausente) también cierra con motivo', async () => {
    const n = nativoFalso();
    const par = parRuntime({ id: ID, url: `${BASE}pluryfact.html` });
    const d = { ...deps(n), conectarNativo: () => { throw new Error('Specified native messaging host not found.'); } };
    atenderPuerto(par.fondo, d);
    expect(await new ClientePluryprint(puertoHaciaPuente(par.pagina), { clientVersion: '0.2.0' }).saludar().catch((x: unknown) => x)).toMatchObject({ codigo: 'no_instalado' });
  });

  it('una petición inválida se contesta bad_request sin llegar al host', async () => {
    const n = nativoFalso();
    const par = parRuntime({ id: ID, url: `${BASE}pluryfact.html` });
    const d = deps(n);
    atenderPuerto(par.fondo, d);
    const respuestas: unknown[] = [];
    par.pagina.onMessage.addListener((m) => respuestas.push(m));
    par.pagina.postMessage({ v: 1, id: '9', type: 'rm -rf' });
    await vi.waitFor(() => expect(respuestas).toHaveLength(1));
    expect(respuestas[0]).toMatchObject({ id: '9', ok: false, error: { code: 'bad_request' } });
    expect(n.recibidos).toHaveLength(0);
    expect(d.registro.aviso).toHaveBeenCalled();
  });

  it('si la página se va a mitad, el puerto nativo se cierra y el host descarta el trabajo', async () => {
    const n = nativoFalso();
    const par = parRuntime({ id: ID, url: SRI, tab: { id: 7 } });
    atenderPuerto(par.fondo, deps(n));
    const c = new ClientePluryprint(puertoHaciaPuente(par.pagina), { clientVersion: '0.2.0' });
    await c.saludar();
    await c.pedir('beginJob', { source: 'pluryfact', label: 'x', action: 'configure', expectedFiles: 2 });
    expect(n.host.abiertos()).toBe(1);
    par.pagina.disconnect();
    await vi.waitFor(() => expect(n.desconectado()).toBe(true));
    expect(n.host.abiertos()).toBe(0);
  });

  it('el registro no guarda contenido de archivos', async () => {
    const n = nativoFalso();
    const par = parRuntime({ id: ID, url: `${BASE}pluryfact.html` });
    const d = deps(n);
    atenderPuerto(par.fondo, d);
    const c = new ClientePluryprint(puertoHaciaPuente(par.pagina), { clientVersion: '0.2.0' });
    await c.enviar({ label: 'x', action: 'configure' }, [{ nombre: 'secreto.pdf', kind: 'pdf', datos: new TextEncoder().encode('%PDF-1.4 SECRETO') }]);
    c.cerrar();
    await vi.waitFor(() => expect(d.registro.info).toHaveBeenCalledTimes(2));
    const todo = JSON.stringify([d.registro.info.mock.calls, d.registro.aviso.mock.calls]);
    expect(todo).not.toContain('secreto');
    expect(todo).not.toContain('SECRETO');
  });
});
