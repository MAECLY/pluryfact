import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizarPluryprint } from '../src/lib/ajustes';
import { pedidoDesdeAjustes } from '../src/lib/envio-pluryprint';
import { ClientePluryprint, CODIGOS_PROTOCOLO, ErrorPluryprint, mensajeError, TIPOS_MENSAJE, validarHola } from '../src/lib/pluryprint';
import { peticionValida } from '../src/lib/puente-pluryprint';
import { puertoFalso } from './helpers/puerto-falso';

/**
 * Contrato con PluryPrint: los fixtures son la fuente de verdad compartida
 * (canónicos en pluryprint/src-tauri/tests/fixtures/bridge-protocol).
 */
const dir = resolve(process.cwd(), 'test/fixtures/pluryprint-protocol');
const hermano = resolve(process.cwd(), '../pluryprint/src-tauri/tests/fixtures/bridge-protocol');
type Msg = Record<string, unknown>;
const leer = (n: string) => JSON.parse(readFileSync(join(dir, n), 'utf8')) as Msg;
const jsons = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

/** Puerto que contesta con el fixture `<tipo>.response.json`, con el id de la petición. */
const conFixtures = (respuestas: Record<string, Msg> = {}) =>
  puertoFalso((m) => ({ ...(respuestas[m.type as string] ?? leer(`${String(m.type)}.response.json`)), id: m.id }));

describe('fixtures del protocolo v1', () => {
  it('hay petición y respuesta para cada tipo, y una respuesta de error por código', () => {
    for (const t of TIPOS_MENSAJE) {
      expect(jsons).toContain(`${t}.request.json`);
      expect(jsons).toContain(`${t}.response.json`);
    }
    expect(jsons.filter((f) => f.startsWith('error-')).map((f) => f.slice(6, -14)).sort()).toEqual([...CODIGOS_PROTOCOLO].sort());
  });

  it('todos tienen el sobre { v: 1, id, type } y su tipo coincide con el nombre', () => {
    for (const f of jsons) {
      const m = leer(f);
      expect(m.v, f).toBe(1);
      expect(typeof m.id, f).toBe('string');
      if (!f.startsWith('error-')) expect(m.type, f).toBe(f.split('.')[0]);
      if (f.endsWith('.response.json')) expect(typeof m.ok, f).toBe('boolean');
    }
  });

  it('cada petición pasa la validación del puente de Pluryfact', () => {
    for (const f of jsons.filter((x) => x.endsWith('.request.json'))) expect(peticionValida(leer(f)), f).toBe(true);
  });

  it('el saludo del cliente es el del fixture', async () => {
    const p = conFixtures();
    await new ClientePluryprint(p.puerto, { clientVersion: '0.2.0' }).saludar();
    expect({ ...p.enviados[0], id: '1' }).toEqual(leer('hello.request.json'));
    expect(validarHola(leer('hello.response.json')).limits).toEqual({ maxFileBytes: 52428800, maxFiles: 5000, maxChunkBytes: 16777216, maxJobBytes: 1073741824 });
  });

  it('listas de impresoras y perfiles del fixture', async () => {
    const c = new ClientePluryprint(conFixtures().puerto, { clientVersion: '0.2.0' });
    expect((await c.impresoras()).map((i) => i.id)).toEqual(['office-laser', 'photo-inkjet']);
    expect((await c.perfiles()).find((x) => x.isDefault)?.id).toBe('builtin-quick');
  });

  it('beginJob, putFile, commitJob: el cliente produce exactamente los fixtures', async () => {
    const req = leer('putFile.request.json');
    const datos = Uint8Array.from(Buffer.from(req.data as string, 'base64'));
    const p = conFixtures();
    const c = new ClientePluryprint(p.puerto, { clientVersion: '0.2.0' });
    const ajustes = normalizarPluryprint({ perfilId: 'builtin-quick', copias: 1, duplex: 'long-edge', color: 'mono' });
    const r = await c.enviar(pedidoDesdeAjustes(ajustes, 'Recibidos · octubre 2026', 'configure'), [{ nombre: req.name as string, kind: 'pdf', datos }]);
    expect(r.jobId).toBe(leer('beginJob.response.json').jobId);
    const sinId = (m: Msg) => ({ ...m, id: 'x' });
    const [, begin, put, commit] = p.enviados;
    expect(sinId(begin!)).toEqual(sinId(leer('beginJob.request.json')));
    expect(sinId(put!)).toEqual(sinId(req));
    expect(sinId(commit!)).toEqual(sinId(leer('commitJob.request.json')));
  });

  it('abortJob del fixture: el cliente lo manda al fallar tras beginJob', async () => {
    const p = conFixtures({ putFile: leer('error-checksum_mismatch.response.json') });
    const c = new ClientePluryprint(p.puerto, { clientVersion: '0.2.0' });
    const datos = new TextEncoder().encode('%PDF-1.4');
    await expect(c.enviar({ label: 'x', action: 'configure' }, [{ nombre: 'a.pdf', kind: 'pdf', datos }])).rejects.toMatchObject({ codigo: 'checksum_mismatch' });
    const abort = p.enviados.at(-1)!;
    expect({ ...abort, id: 'x' }).toEqual({ ...leer('abortJob.request.json'), id: 'x' });
  });

  it.each([...CODIGOS_PROTOCOLO])('error %s → ErrorPluryprint con mensaje en español', async (codigo) => {
    const fixture = leer(`error-${codigo}.response.json`);
    expect(fixture.ok).toBe(false);
    const p = puertoFalso((m) => ({ ...fixture, id: m.id, type: m.type }));
    const e = (await new ClientePluryprint(p.puerto, { clientVersion: '0.2.0' }).pedir(fixture.type as never).catch((x: unknown) => x)) as ErrorPluryprint;
    expect(e).toBeInstanceOf(ErrorPluryprint);
    expect(e.codigo).toBe(codigo);
    expect(e.message).toBe(mensajeError(codigo));
    expect(e.detalle).toBe((fixture.error as Msg).message);
  });
});

describe.skipIf(!existsSync(hermano))('igualdad con el repositorio hermano ../pluryprint', () => {
  it('los .json son idénticos byte a byte', () => {
    const suyos = readdirSync(hermano).filter((f) => f.endsWith('.json')).sort();
    expect(jsons).toEqual(suyos);
    for (const f of suyos) expect(readFileSync(join(dir, f)).equals(readFileSync(join(hermano, f))), f).toBe(true);
  });
});
