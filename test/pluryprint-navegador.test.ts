import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { crearHostFalso } from '../scripts/pluryprint-host-falso';
import { abrirPuertoPluryprint, pedirPermisoNativo, PERMISO_NATIVO, quitarPermisoNativo, tienePermisoNativo } from '../src/lib/conexion-pluryprint';
import { consultarPluryprint } from '../src/lib/envio-pluryprint';
import { NOMBRE_HOST } from '../src/lib/pluryprint';
import { NOMBRE_PUERTO } from '../src/lib/puente-pluryprint';

/**
 * Pruebas con el `browser` falso de WXT: permiso opcional y el cableado del
 * background (onConnect → connectNative). fakeBrowser no implementa
 * permissions, connect ni connectNative: se simulan aquí como lo hace Chrome.
 */

type Listener = (...a: unknown[]) => void;
function evento() {
  const ls: Listener[] = [];
  return { addListener: (f: Listener) => void ls.push(f), removeListener: () => {}, hasListener: () => true, disparar: (...a: unknown[]) => ls.forEach((f) => f(...a)) };
}

/** Par de puertos runtime como los de Chrome (mensajes en orden, cierre al otro extremo). */
function par(name: string, sender: unknown) {
  const a = { msg: evento(), fin: evento() };
  const b = { msg: evento(), fin: evento() };
  let vivo = true;
  const mk = (yo: typeof a, otro: typeof a, extra: object) => ({
    name,
    ...extra,
    postMessage: (m: unknown) => {
      if (!vivo) throw new Error('Attempting to use a disconnected port object');
      const c = JSON.parse(JSON.stringify(m)) as unknown;
      queueMicrotask(() => otro.msg.disparar(c));
    },
    onMessage: yo.msg,
    onDisconnect: yo.fin,
    disconnect: () => {
      if (!vivo) return;
      vivo = false;
      queueMicrotask(() => otro.fin.disparar());
    },
  });
  return { pagina: mk(a, b, {}), fondo: mk(b, a, { sender }) };
}

describe('permiso opcional nativeMessaging', () => {
  beforeEach(() => fakeBrowser.reset());

  it('pide, consulta y quita exactamente nativeMessaging', async () => {
    const concedidos = new Set<string>();
    fakeBrowser.permissions.request = vi.fn(async (p: { permissions?: string[] }) => (p.permissions?.forEach((x) => concedidos.add(x)), true)) as never;
    fakeBrowser.permissions.contains = vi.fn(async (p: { permissions?: string[] }) => !!p.permissions?.every((x) => concedidos.has(x))) as never;
    fakeBrowser.permissions.remove = vi.fn(async (p: { permissions?: string[] }) => (p.permissions?.forEach((x) => concedidos.delete(x)), true)) as never;

    expect(await tienePermisoNativo()).toBe(false);
    expect(await pedirPermisoNativo()).toBe(true);
    expect(fakeBrowser.permissions.request).toHaveBeenCalledWith(PERMISO_NATIVO);
    expect(PERMISO_NATIVO).toEqual({ permissions: ['nativeMessaging'] });
    expect(await tienePermisoNativo()).toBe(true);
    expect(await quitarPermisoNativo()).toBe(true);
    expect(await tienePermisoNativo()).toBe(false);
  });

  it('si Chrome rechaza la petición (sin gesto del usuario) devuelve false', async () => {
    fakeBrowser.permissions.request = vi.fn(async () => {
      throw new Error('This function must be called during a user gesture');
    }) as never;
    fakeBrowser.permissions.contains = vi.fn(async () => {
      throw new Error('boom');
    }) as never;
    expect(await pedirPermisoNativo()).toBe(false);
    expect(await tienePermisoNativo()).toBe(false);
  });
});

describe('background', () => {
  let onConnect: ReturnType<typeof evento>;
  let concedido: boolean;
  let host: ReturnType<typeof crearHostFalso>;
  let nativos: Array<{ name: string; fin: ReturnType<typeof evento>; desconectado: boolean }>;

  beforeEach(async () => {
    fakeBrowser.reset();
    onConnect = evento();
    concedido = true;
    host = crearHostFalso();
    nativos = [];
    const rt = fakeBrowser.runtime as unknown as Record<string, unknown>;
    rt.onConnect = onConnect;
    rt.connectNative = vi.fn((name: string) => {
      const msg = evento();
      const fin = evento();
      const n = { name, fin, desconectado: false };
      nativos.push(n);
      return {
        name,
        postMessage: (m: Record<string, unknown>) => {
          const r = host.atender(m);
          queueMicrotask(() => msg.disparar(r));
        },
        onMessage: msg,
        onDisconnect: fin,
        disconnect: () => {
          n.desconectado = true;
          host.cerrar();
        },
      };
    });
    fakeBrowser.permissions.contains = vi.fn(async () => concedido) as never;
    // La página y el content script se conectan al background con runtime.connect.
    rt.connect = vi.fn(({ name }: { name: string }) => {
      const p = par(name, { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/pluryfact.html') });
      queueMicrotask(() => onConnect.disparar(p.fondo));
      return p.pagina;
    });
    const fondo = (await import('../src/entrypoints/background')).default;
    fondo.main();
  });

  it('la página consulta Pluryprint a través del background, que es quien abre connectNative', async () => {
    const r = await consultarPluryprint(abrirPuertoPluryprint, '0.2.0');
    expect(fakeBrowser.runtime.connect).toHaveBeenCalledWith({ name: NOMBRE_PUERTO });
    expect(fakeBrowser.runtime.connectNative).toHaveBeenCalledWith(NOMBRE_HOST);
    expect(r.hola.hostVersion).toBe('0.0.6-falso');
    expect(r.perfiles.map((p) => p.id)).toEqual(['builtin-quick']);
    await vi.waitFor(() => expect(nativos[0]!.desconectado).toBe(true));
  });

  it('sin el permiso concedido el background no abre connectNative', async () => {
    concedido = false;
    await expect(consultarPluryprint(abrirPuertoPluryprint, '0.2.0')).rejects.toMatchObject({ codigo: 'sin_permiso' });
    expect(fakeBrowser.runtime.connectNative).not.toHaveBeenCalled();
  });

  it('el motivo de runtime.lastError llega a la página (host no instalado)', async () => {
    (fakeBrowser.runtime.connectNative as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce((name: string) => {
      const fin = evento();
      nativos.push({ name, fin, desconectado: false });
      queueMicrotask(() => {
        (fakeBrowser.runtime as unknown as { lastError?: { message: string } }).lastError = { message: 'Specified native messaging host not found.' };
        fin.disparar();
        delete (fakeBrowser.runtime as unknown as { lastError?: unknown }).lastError;
      });
      return { name, postMessage: () => {}, onMessage: evento(), onDisconnect: fin, disconnect: () => {} };
    });
    await expect(consultarPluryprint(abrirPuertoPluryprint, '0.2.0')).rejects.toMatchObject({ codigo: 'no_instalado' });
  });

  it('un puerto de otra extensión o con otro nombre no llega a connectNative', async () => {
    const ajeno = par(NOMBRE_PUERTO, { id: 'otra-extension', url: 'chrome-extension://otra-extension/x.html' });
    onConnect.disparar(ajeno.fondo);
    const otro = par('otro', { id: fakeBrowser.runtime.id, url: fakeBrowser.runtime.getURL('/pluryfact.html') });
    onConnect.disparar(otro.fondo);
    await new Promise((r) => setTimeout(r, 10));
    expect(fakeBrowser.runtime.connectNative).not.toHaveBeenCalled();
  });
});
