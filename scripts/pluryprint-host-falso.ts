/**
 * Host de Native Messaging FALSO que habla el protocolo v1 de PluryPrint
 * (ver docs/INTEGRACION-PLURYPRINT.md). Sirve para:
 *
 * - los tests de Vitest, en memoria (`crearHostFalso`), y
 * - el E2E (`scripts/e2e-pluryprint.ts`), como proceso que Chrome lanza:
 *     bun scripts/pluryprint-host-falso.ts <origen>   (Chrome añade el origen)
 *   con PLURYPRINT_FALSO_SALIDA=<carpeta> para guardar lo recibido:
 *     <carpeta>/<jobId>/NNNN-<nombre>  y  <carpeta>/<jobId>/trabajo.json
 *
 * Valida como el host real: tamaños, base64, orden de trozos, `%PDF-`,
 * sha256 y que el trabajo esté completo antes de `commitJob`. No imprime nada
 * ni abre ninguna app.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const LIMITES_FALSOS = { maxFileBytes: 52428800, maxFiles: 5000, maxChunkBytes: 16777216, maxJobBytes: 1073741824 };

interface ArchivoFalso {
  name: string;
  kind: 'pdf' | 'xml' | 'txt';
  size: number;
  sha256: string;
  chunks: number;
  partes: Buffer[];
  recibidos: number;
  completo: boolean;
}

export interface TrabajoFalso {
  jobId: string;
  label: string;
  action: string;
  profileId: string | null;
  printerId: string | null;
  overrides: unknown;
  expectedFiles: number;
  archivos: Map<number, ArchivoFalso>;
}

export interface TrabajoEntregado {
  jobId: string;
  label: string;
  action: string;
  profileId: string | null;
  printerId: string | null;
  overrides: unknown;
  archivos: Array<{ index: number; name: string; kind: string; size: number; sha256: string; datos: Buffer }>;
}

export interface OpcionesHostFalso {
  protocolo?: number;
  capacidades?: string[];
  limites?: Partial<typeof LIMITES_FALSOS>;
  alEntregar?(t: TrabajoEntregado): void;
}

type Msg = Record<string, unknown>;

export function crearHostFalso(o: OpcionesHostFalso = {}) {
  const limites = { ...LIMITES_FALSOS, ...o.limites };
  const trabajos = new Map<string, TrabajoFalso>();
  let n = 0;
  const entregados: TrabajoEntregado[] = [];

  const ok = (m: Msg, extra: Msg) => ({ v: 1, id: m.id, type: m.type, ok: true, ...extra });
  const error = (m: Msg, code: string, message: string) => ({ v: 1, id: m.id, type: m.type, ok: false, error: { code, message } });
  const entero = (x: unknown, min = 0): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min;

  function atender(m: Msg): Msg {
    if (m.v !== 1) return error(m, 'unsupported_version', 'Only protocol 1 is supported.');
    switch (m.type) {
      case 'hello':
        if (!Array.isArray(m.protocols) || !m.protocols.includes(1)) return error(m, 'unsupported_version', 'Protocol 1 not offered.');
        return ok(m, {
          host: 'pluryprint',
          hostVersion: '0.0.6-falso',
          protocol: o.protocolo ?? 1,
          capabilities: o.capacidades ?? ['listPrinters', 'listProfiles', 'beginJob', 'putFile', 'commitJob', 'abortJob'],
          limits: limites,
        });
      case 'listPrinters':
        return ok(m, { printers: [{ id: 'falsa', name: 'Impresora falsa', isDefault: true, capabilities: { duplex: true, color: false, papers: ['a4'] } }] });
      case 'listProfiles':
        return ok(m, { profiles: [{ id: 'builtin-quick', name: 'Quick print', isDefault: true }] });
      case 'beginJob': {
        if (m.source !== 'pluryfact' || typeof m.label !== 'string' || m.label.length > 120) return error(m, 'bad_request', 'Bad source or label.');
        if (!['configure', 'queue', 'print-default'].includes(m.action as string)) return error(m, 'bad_request', 'Bad action.');
        if (!entero(m.expectedFiles, 1)) return error(m, 'bad_request', 'Bad expectedFiles.');
        if (m.expectedFiles > limites.maxFiles) return error(m, 'too_many_files', 'Too many files.');
        const jobId = `job-${++n}`;
        trabajos.set(jobId, {
          jobId,
          label: m.label,
          action: m.action as string,
          profileId: (m.profileId as string | null) ?? null,
          printerId: (m.printerId as string | null) ?? null,
          overrides: m.overrides ?? null,
          expectedFiles: m.expectedFiles,
          archivos: new Map(),
        });
        return ok(m, { jobId });
      }
      case 'putFile': {
        const t = trabajos.get(m.jobId as string);
        if (!t) return error(m, 'unknown_job', 'Unknown job.');
        if (!entero(m.index) || m.index >= t.expectedFiles || !entero(m.chunk) || !entero(m.chunks, 1) || !entero(m.size)) return error(m, 'bad_request', 'Bad indices.');
        if (!['pdf', 'xml', 'txt'].includes(m.kind as string) || typeof m.name !== 'string' || typeof m.sha256 !== 'string' || typeof m.data !== 'string')
          return error(m, 'bad_request', 'Bad fields.');
        if (m.size > limites.maxFileBytes) return error(m, 'too_large', 'File too large.');
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(m.data)) return error(m, 'bad_request', 'Bad base64.');
        const datos = Buffer.from(m.data, 'base64');
        if (datos.length > limites.maxChunkBytes) return error(m, 'too_large', 'Chunk too large.');
        const a = t.archivos.get(m.index) ?? {
          name: m.name,
          kind: m.kind as ArchivoFalso['kind'],
          size: m.size,
          sha256: m.sha256,
          chunks: m.chunks,
          partes: [],
          recibidos: 0,
          completo: false,
        };
        if (a.completo || m.chunk !== a.partes.length || m.chunks !== a.chunks || m.size !== a.size) return error(m, 'bad_request', 'Out of order chunk.');
        a.partes.push(datos);
        a.recibidos += datos.length;
        if (a.recibidos > a.size) return error(m, 'bad_request', 'More bytes than declared.');
        t.archivos.set(m.index, a);
        const ultimo = m.chunk === m.chunks - 1;
        if (ultimo) {
          if (a.recibidos !== a.size) return error(m, 'bad_request', 'Size mismatch.');
          const todo = Buffer.concat(a.partes);
          if (createHash('sha256').update(todo).digest('hex') !== a.sha256) return error(m, 'checksum_mismatch', 'Checksum mismatch.');
          if (a.kind === 'pdf' && todo.subarray(0, 5).toString('latin1') !== '%PDF-') return error(m, 'bad_pdf', 'Not a PDF.');
          a.completo = true;
        }
        return ok(m, { received: a.recibidos, complete: a.completo });
      }
      case 'commitJob': {
        const t = trabajos.get(m.jobId as string);
        if (!t) return error(m, 'unknown_job', 'Unknown job.');
        const completos = [...t.archivos.values()].filter((a) => a.completo).length;
        if (completos !== t.expectedFiles) return error(m, 'job_incomplete', `${completos} of ${t.expectedFiles} files complete.`);
        trabajos.delete(t.jobId);
        const entregado: TrabajoEntregado = {
          jobId: t.jobId,
          label: t.label,
          action: t.action,
          profileId: t.profileId,
          printerId: t.printerId,
          overrides: t.overrides,
          archivos: [...t.archivos.entries()]
            .sort(([a], [b]) => a - b)
            .map(([index, a]) => ({ index, name: a.name, kind: a.kind, size: a.size, sha256: a.sha256, datos: Buffer.concat(a.partes) })),
        };
        entregados.push(entregado);
        o.alEntregar?.(entregado);
        return ok(m, { state: 'handed-off', files: t.expectedFiles });
      }
      case 'abortJob':
        if (!trabajos.delete(m.jobId as string)) return error(m, 'unknown_job', 'Unknown job.');
        return ok(m, { state: 'aborted' });
      default:
        return error(m, 'unknown_type', `Unknown message type "${String(m.type)}".`);
    }
  }

  return {
    atender,
    entregados,
    /** Trabajos abiertos (sin commit ni abort). */
    abiertos: () => trabajos.size,
    /** El puerto se cerró: se descarta todo lo no confirmado. */
    cerrar: () => trabajos.clear(),
  };
}

// ------------------------------------------------------------------ proceso (Chrome lo lanza)

function principal() {
  const salida = process.env.PLURYPRINT_FALSO_SALIDA;
  const origen = process.argv[2] ?? '';
  const anotar = (linea: string) => salida && appendFileSync(join(salida, 'host.log'), `${new Date().toISOString()} ${linea}\n`);
  if (salida) mkdirSync(salida, { recursive: true });
  anotar(`inicio origen=${origen}`);
  const host = crearHostFalso({
    alEntregar: (t) => {
      if (!salida) return;
      const dir = join(salida, t.jobId);
      mkdirSync(dir, { recursive: true });
      for (const a of t.archivos) writeFileSync(join(dir, `${String(a.index + 1).padStart(4, '0')}-${a.name}`), a.datos);
      const { archivos, ...resto } = t;
      writeFileSync(join(dir, 'trabajo.json'), JSON.stringify({ ...resto, origen, archivos: archivos.map(({ datos: _d, ...x }) => x) }, null, 2));
    },
  });

  let pendiente = Buffer.alloc(0);
  const escribir = (m: unknown) => {
    const cuerpo = Buffer.from(JSON.stringify(m), 'utf8');
    const largo = Buffer.alloc(4);
    largo.writeUInt32LE(cuerpo.length); // orden nativo: little-endian en x86 y ARM
    process.stdout.write(Buffer.concat([largo, cuerpo]));
  };
  process.stdin.on('data', (trozo: Buffer) => {
    pendiente = Buffer.concat([pendiente, trozo]);
    while (pendiente.length >= 4) {
      const largo = pendiente.readUInt32LE(0);
      if (pendiente.length < 4 + largo) break;
      const cuerpo = pendiente.subarray(4, 4 + largo).toString('utf8');
      pendiente = pendiente.subarray(4 + largo);
      let m: Msg;
      try {
        m = JSON.parse(cuerpo) as Msg;
      } catch {
        anotar('json inválido');
        continue;
      }
      const r = host.atender(m);
      anotar(`${String(m.type)} → ${r.ok ? 'ok' : JSON.stringify(r.error)}`);
      escribir(r);
    }
  });
  process.stdin.on('end', () => {
    anotar('fin de stdin: se descartan trabajos sin commit');
    host.cerrar();
    process.exit(0);
  });
}

if (import.meta.main) principal();
