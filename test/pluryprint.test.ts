import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aBase64,
  ClientePluryprint,
  ErrorPluryprint,
  errorDeDesconexion,
  sha256Hex,
  TROZO_MAX,
  trozos,
  type ArchivoParaImprimir,
} from '../src/lib/pluryprint';
import { puertoConHost, puertoFalso, SILENCIO } from './helpers/puerto-falso';

const pdf = (n: number, relleno = 7) => {
  const d = new Uint8Array(n).fill(relleno);
  d.set([0x25, 0x50, 0x44, 0x46, 0x2d].slice(0, n));
  return d;
};
const archivo = (n: number, kind: ArchivoParaImprimir['kind'] = 'pdf', nombre = `a${n}.${kind}`): ArchivoParaImprimir => ({
  nombre,
  kind,
  datos: kind === 'pdf' ? pdf(n) : new Uint8Array(n).fill(65),
});
const pedido = { label: 'Recibidos · octubre 2026', action: 'configure' as const };
const cliente = (p: { puerto: ReturnType<typeof puertoFalso>['puerto'] }, trozoMax?: number) =>
  new ClientePluryprint(p.puerto, { clientVersion: '0.2.0', ...(trozoMax ? { trozoMax } : {}) });

afterEach(() => vi.useRealTimers());

describe('saludo', () => {
  it('acepta un host PluryPrint con protocolo 1 y todas las capacidades', async () => {
    const p = puertoConHost();
    const h = await cliente(p).saludar();
    expect(h.host).toBe('pluryprint');
    expect(h.limits.maxChunkBytes).toBe(16777216);
    expect(p.enviados[0]).toEqual({ v: 1, id: '1', type: 'hello', client: 'pluryfact', clientVersion: '0.2.0', protocols: [1] });
  });

  it('versión incompatible: otro protocolo o sin capacidades → pide actualizar PluryPrint', async () => {
    await expect(cliente(puertoConHost({ protocolo: 2 })).saludar()).rejects.toMatchObject({ codigo: 'version_incompatible' });
    const e = await cliente(puertoConHost({ capacidades: ['listPrinters'] })).saludar().catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErrorPluryprint);
    expect((e as ErrorPluryprint).message).toMatch(/^Actualiza PluryPrint/);
  });

  it('unsupported_version del host se traduce al español', async () => {
    const p = puertoFalso((m) => ({ v: 1, id: m.id, type: m.type, ok: false, error: { code: 'unsupported_version', message: 'nope' } }));
    const e = (await cliente(p).saludar().catch((x: unknown) => x)) as ErrorPluryprint;
    expect(e.codigo).toBe('unsupported_version');
    expect(e.detalle).toBe('nope');
    expect(e.message).toContain('Actualiza PluryPrint');
  });

  it('host no instalado: Chrome cierra el puerto con «host not found»', async () => {
    const p = puertoFalso();
    const promesa = cliente(p).saludar();
    p.cerrar('Specified native messaging host not found.');
    await expect(promesa).rejects.toMatchObject({ codigo: 'no_instalado', message: expect.stringContaining('PluryPrint no está instalado') });
  });

  it('respuestas ajenas o de otro tipo no se confunden', async () => {
    const p = puertoFalso((m) => ({ v: 1, id: m.id, type: 'listPrinters', ok: true, printers: [] }));
    await expect(cliente(p).saludar()).rejects.toMatchObject({ codigo: 'respuesta_invalida' });
  });

  it('tiempo agotado si el host no contesta', async () => {
    vi.useFakeTimers();
    const p = puertoFalso();
    const c = new ClientePluryprint(p.puerto, { clientVersion: '0.2.0', tiempos: { hello: 1000 } });
    const promesa = c.saludar().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(999);
    expect(p.enviados).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(await promesa).toMatchObject({ codigo: 'tiempo_agotado' });
  });
});

describe('errorDeDesconexion', () => {
  it.each([
    ['Specified native messaging host not found.', 'no_instalado'],
    ['Access to the specified native messaging host is forbidden.', 'origin_not_allowed'],
    ['nativeMessaging permission not granted', 'sin_permiso'],
    ['Native host has exited.', 'desconectado'],
    [undefined, 'desconectado'],
  ])('%s → %s', (motivo, codigo) => expect(errorDeDesconexion(motivo).codigo).toBe(codigo));
});

describe('troceo', () => {
  it('rangos exactos en los límites', () => {
    expect(trozos(0, 8)).toEqual([[0, 0]]);
    expect(trozos(1, 8)).toEqual([[0, 1]]);
    expect(trozos(8, 8)).toEqual([[0, 8]]);
    expect(trozos(9, 8)).toEqual([[0, 8], [8, 9]]);
    expect(trozos(16, 8)).toEqual([[0, 8], [8, 16]]);
    expect(trozos(17, 8)).toEqual([[0, 8], [8, 16], [16, 17]]);
    expect(() => trozos(4, 0)).toThrow();
  });

  it('el trozo real es de 8 MiB y nunca supera el del host', () => {
    expect(TROZO_MAX).toBe(8 * 1024 * 1024);
    expect(trozos(TROZO_MAX + 1, TROZO_MAX)).toHaveLength(2);
  });

  it.each([1, 7, 8, 9, 16, 17])('archivo de %i bytes con trozos de 8: el host recibe exactamente los bytes', async (n) => {
    const p = puertoConHost();
    const a = archivo(n, 'txt');
    const r = await cliente(p, 8).enviar(pedido, [a]);
    expect(r.archivos).toBe(1);
    const puts = p.enviados.filter((m) => m.type === 'putFile');
    expect(puts).toHaveLength(Math.ceil(n / 8));
    expect(puts.map((m) => m.chunk)).toEqual(puts.map((_, i) => i));
    expect(puts.every((m) => m.chunks === puts.length && m.size === n)).toBe(true);
    expect(p.host.entregados[0]!.archivos[0]!.datos).toEqual(Buffer.from(a.datos));
  });

  it('respeta un maxChunkBytes del host menor que 8 MiB', async () => {
    const p = puertoConHost({ limites: { maxChunkBytes: 4 } });
    await cliente(p).enviar(pedido, [archivo(10, 'txt')]);
    expect(p.enviados.filter((m) => m.type === 'putFile')).toHaveLength(3);
  });
});

describe('sha256 y base64', () => {
  it('sha256 con vectores conocidos', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex(new Uint8Array())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('base64 igual a la de Node también en arreglos grandes', () => {
    const d = new Uint8Array(200_003).map((_, i) => (i * 31) % 256);
    expect(aBase64(d)).toBe(Buffer.from(d).toString('base64'));
    expect(aBase64(new Uint8Array())).toBe('');
  });

  it('cada putFile lleva el sha256 del archivo completo', async () => {
    const p = puertoConHost();
    const a = archivo(20);
    await cliente(p, 8).enviar(pedido, [a]);
    const esperado = createHash('sha256').update(a.datos).digest('hex');
    expect(p.enviados.filter((m) => m.type === 'putFile').every((m) => m.sha256 === esperado)).toBe(true);
  });
});

describe('enviar', () => {
  it('beginJob → putFile en orden de índice → commitJob, y avisa el avance', async () => {
    const p = puertoConHost();
    const avance: number[] = [];
    const r = await cliente(p, 8).enviar({ ...pedido, profileId: 'builtin-quick', overrides: { copies: 2 } }, [archivo(10), archivo(3, 'xml'), archivo(5, 'txt')], (a) => avance.push(a.bytes));
    expect(r).toEqual({ jobId: 'job-1', archivos: 3 });
    expect(p.tipos()).toEqual(['hello', 'beginJob', 'putFile', 'putFile', 'putFile', 'putFile', 'commitJob']);
    const begin = p.enviados[1]!;
    expect(begin).toMatchObject({ source: 'pluryfact', label: 'Recibidos · octubre 2026', action: 'configure', profileId: 'builtin-quick', printerId: null, overrides: { copies: 2 }, expectedFiles: 3 });
    expect(p.host.entregados[0]!.archivos.map((a) => [a.index, a.kind])).toEqual([[0, 'pdf'], [1, 'xml'], [2, 'txt']]);
    expect(avance).toEqual([8, 10, 13, 18]);
  });

  it('sin overrides no manda el campo', async () => {
    const p = puertoConHost();
    await cliente(p).enviar(pedido, [archivo(6)]);
    expect(p.enviados[1]).not.toHaveProperty('overrides');
  });

  it('límites locales: demasiados archivos o demasiado grandes, sin abrir trabajo', async () => {
    const p = puertoConHost({ limites: { maxFiles: 2, maxFileBytes: 100 } });
    await expect(cliente(p).enviar(pedido, [archivo(6), archivo(6), archivo(6)])).rejects.toMatchObject({ codigo: 'too_many_files' });
    await expect(cliente(p).enviar(pedido, [archivo(101)])).rejects.toMatchObject({ codigo: 'too_large' });
    expect(p.tipos()).not.toContain('beginJob');
  });

  it('un error del host a mitad aborta el trabajo y se traduce', async () => {
    const p = puertoConHost();
    const malo: ArchivoParaImprimir = { nombre: 'x.pdf', kind: 'pdf', datos: new Uint8Array([1, 2, 3]) };
    await expect(cliente(p).enviar(pedido, [archivo(6), malo])).rejects.toMatchObject({ codigo: 'bad_pdf', message: 'Un RIDE no es un PDF válido.' });
    expect(p.tipos().at(-1)).toBe('abortJob');
    expect(p.host.abiertos()).toBe(0);
  });

  it('si el puerto se cae a mitad, todo lo pendiente falla y no se intenta abortJob', async () => {
    let puestos = 0;
    const p = puertoConHost({}, (m) => (m.type === 'putFile' && ++puestos === 2 ? SILENCIO : undefined));
    const c = cliente(p, 4);
    const promesa = c.enviar(pedido, [archivo(12)]).catch((e: unknown) => e);
    await vi.waitFor(() => expect(puestos).toBe(2));
    p.cerrar('Native host has exited.');
    expect(await promesa).toMatchObject({ codigo: 'desconectado' });
    expect(p.tipos()).not.toContain('abortJob');
    await expect(c.saludar()).rejects.toMatchObject({ codigo: 'desconectado' });
  });

  it('cancelar con AbortSignal manda abortJob', async () => {
    const ctl = new AbortController();
    const p = puertoConHost();
    const e = await cliente(p, 4)
      .enviar(pedido, [archivo(12)], (a) => a.bytes >= 4 && ctl.abort(), ctl.signal)
      .catch((x: unknown) => x);
    expect(e).toMatchObject({ codigo: 'cancelado' });
    expect(p.tipos().filter((t) => t === 'putFile')).toHaveLength(1);
    expect(p.tipos().at(-1)).toBe('abortJob');
  });

  it('una respuesta de putFile incoherente se rechaza', async () => {
    const p = puertoConHost({}, (m) => (m.type === 'putFile' ? { v: 1, id: m.id, type: 'putFile', ok: true, received: 999, complete: true } : undefined));
    await expect(cliente(p).enviar(pedido, [archivo(6)])).rejects.toMatchObject({ codigo: 'respuesta_invalida' });
  });

  it('cerrar() desconecta el puerto una sola vez', () => {
    const p = puertoFalso();
    const c = cliente(p);
    c.cerrar();
    c.cerrar();
    expect(p.desconectadoPorCliente).toBe(true);
  });
});

describe('listas', () => {
  it('impresoras y perfiles, descartando entradas mal formadas', async () => {
    const p = puertoFalso((m) =>
      m.type === 'listPrinters'
        ? { v: 1, id: m.id, type: m.type, ok: true, printers: [{ id: 'a', name: 'A', isDefault: true }, { name: 'sin id' }, 'x'] }
        : { v: 1, id: m.id, type: m.type, ok: true, profiles: [{ id: 'p', name: 'P' }] },
    );
    const c = cliente(p);
    expect(await c.impresoras()).toEqual([{ id: 'a', name: 'A', isDefault: true }]);
    expect(await c.perfiles()).toEqual([{ id: 'p', name: 'P', isDefault: false }]);
  });
});
