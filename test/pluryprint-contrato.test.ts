import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClientePluryprint, CODIGOS_PROTOCOLO, ErrorPluryprint, mensajeError, TIPOS_MENSAJE, validarHola, type ArchivoParaImprimir, type KindArchivo } from '../src/lib/pluryprint';
import { peticionValida } from '../src/lib/puente-pluryprint';
import { puertoFalso } from './helpers/puerto-falso';

/**
 * Contrato con Pluryprint. Los fixtures son la fuente de verdad compartida:
 * canónicos en pluryprint/src-tauri/tests/fixtures/bridge-protocol y copiados
 * aquí byte a byte. Nombres:
 *   <tipo>[.<variante>].request.json / .response.json  intercambios correctos
 *   error.<código>.response.json [+ .request.json]     un error por código
 */
const dir = resolve(process.cwd(), 'test/fixtures/pluryprint-protocol');
const hermano = resolve(process.cwd(), '../pluryprint/src-tauri/tests/fixtures/bridge-protocol');
type Msg = Record<string, unknown>;
const leer = (n: string) => JSON.parse(readFileSync(join(dir, n), 'utf8')) as Msg;
const jsons = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const sinId = (m: Msg) => ({ ...m, id: '·' });
const datosDe = (req: Msg) => Uint8Array.from(Buffer.from(req.data as string, 'base64'));
const archivoDe = (req: Msg): ArchivoParaImprimir => ({ nombre: req.name as string, kind: req.kind as KindArchivo, datos: datosDe(req) });

/**
 * Puerto que contesta con fixtures: `respuestas(m)` elige el archivo para cada
 * petición; la respuesta lleva el id de la petición, como haría el host.
 */
const conFixtures = (respuestas: (m: Msg) => string) => puertoFalso((m) => ({ ...leer(respuestas(m)), id: m.id }));
const porTipo = (m: Msg) => `${String(m.type)}.response.json`;

describe('fixtures del protocolo v1', () => {
  it('hay petición y respuesta para cada tipo, y una respuesta de error por código', () => {
    for (const t of TIPOS_MENSAJE) {
      expect(jsons).toContain(`${t}.request.json`);
      expect(jsons).toContain(`${t}.response.json`);
    }
    const errores = jsons.filter((f) => f.startsWith('error.') && f.endsWith('.response.json')).map((f) => f.split('.')[1]);
    expect(errores.sort()).toEqual([...CODIGOS_PROTOCOLO].sort());
  });

  it('todas las respuestas tienen el sobre { v: 1, id, type, ok } y su tipo coincide con el nombre', () => {
    for (const f of jsons) {
      const m = leer(f);
      expect(typeof m.id, f).toBe('string');
      if (!f.startsWith('error.')) {
        expect(m.v, f).toBe(1);
        expect(m.type, f).toBe(f.split('.')[0]);
      }
      if (f.endsWith('.response.json')) {
        expect(m.v, f).toBe(1);
        expect(typeof m.ok, f).toBe('boolean');
        expect(m.ok, f).toBe(!f.startsWith('error.'));
      }
    }
  });

  it('el puente de Pluryfact deja pasar las peticiones válidas y frena las que ni son v1 ni de un tipo conocido', () => {
    for (const f of jsons.filter((x) => x.endsWith('.request.json'))) {
      const m = leer(f);
      const deberiaPasar = m.v === 1 && TIPOS_MENSAJE.includes(m.type as never);
      expect(peticionValida(m), f).toBe(deberiaPasar);
      if (!f.startsWith('error.')) expect(deberiaPasar, f).toBe(true);
    }
  });

  it('el saludo del cliente es el del fixture', async () => {
    const p = conFixtures(porTipo);
    await new ClientePluryprint(p.puerto, { clientVersion: '0.2.0' }).saludar();
    expect(p.enviados[0]).toEqual(leer('hello.request.json'));
    expect(validarHola(leer('hello.response.json')).limits).toEqual({ maxFileBytes: 52428800, maxFiles: 5000, maxChunkBytes: 16777216, maxJobBytes: 1073741824 });
  });

  it('listas de impresoras y perfiles del fixture', async () => {
    const c = new ClientePluryprint(conFixtures(porTipo).puerto, { clientVersion: '0.2.0' });
    const imp = leer('listPrinters.response.json').printers as Msg[];
    const per = leer('listProfiles.response.json').profiles as Msg[];
    expect((await c.impresoras()).map((i) => i.id)).toEqual(imp.map((i) => i.id));
    expect((await c.perfiles()).map((p) => [p.id, p.isDefault])).toEqual(per.map((p) => [p.id, p.isDefault === true]));
  });

  it('trabajo 1: beginJob, un PDF, un XML y un TXT, commitJob — el cliente produce exactamente los fixtures', async () => {
    const begin = leer('beginJob.request.json');
    const puts = ['putFile.request.json', 'putFile.xml.request.json', 'putFile.txt.request.json'].map(leer);
    const p = conFixtures((m) =>
      m.type === 'putFile' ? `putFile${m.kind === 'pdf' ? '' : `.${String(m.kind)}`}.response.json` : porTipo(m),
    );
    const c = new ClientePluryprint(p.puerto, { clientVersion: '0.2.0' });
    const r = await c.enviar(
      { label: begin.label as string, action: 'configure', profileId: begin.profileId as string, printerId: null, overrides: begin.overrides as never },
      puts.map(archivoDe),
    );
    expect(r).toEqual({ jobId: leer('beginJob.response.json').jobId, archivos: leer('commitJob.response.json').files });
    const [, b, ...resto] = p.enviados;
    expect(sinId(b!)).toEqual(sinId(begin));
    expect(resto.slice(0, 3).map(sinId)).toEqual(puts.map(sinId));
    expect(sinId(resto[3]!)).toEqual(sinId(leer('commitJob.request.json')));
  });

  it('trabajo 2: beginJob a la cola, un PDF en dos trozos y abortJob al cancelar', async () => {
    const begin = leer('beginJob.queue.request.json');
    const trozo0 = leer('putFile.chunk-0.request.json');
    const p = conFixtures((m) => (m.type === 'beginJob' ? 'beginJob.queue.response.json' : m.type === 'putFile' ? 'putFile.chunk-0.response.json' : porTipo(m)));
    const ctl = new AbortController();
    const completo = Uint8Array.from(Buffer.from(leer('putFile.request.json').data as string, 'base64'));
    expect(completo.length).toBe(trozo0.size);
    // El fixture parte un PDF de 142 bytes en 2 trozos de 71.
    const c = new ClientePluryprint(p.puerto, { clientVersion: '0.2.0', trozoMax: 71 });
    const e = await c
      .enviar(
        { label: begin.label as string, action: 'queue', profileId: null, printerId: begin.printerId as string },
        [{ nombre: trozo0.name as string, kind: 'pdf', datos: completo }],
        () => ctl.abort(),
        ctl.signal,
      )
      .catch((x: unknown) => x);
    expect(e).toMatchObject({ codigo: 'cancelado' });
    const [, b, put, abort] = p.enviados;
    expect(sinId(b!)).toEqual(sinId(begin));
    expect(sinId(put!)).toEqual(sinId(trozo0));
    expect(sinId(abort!)).toEqual(sinId(leer('abortJob.request.json')));
  });

  it.each([...CODIGOS_PROTOCOLO])('error %s → ErrorPluryprint con mensaje en español', async (codigo) => {
    const fixture = leer(`error.${codigo}.response.json`);
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
