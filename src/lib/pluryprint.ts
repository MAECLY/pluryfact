/**
 * Cliente del protocolo v1 entre Pluryfact y PluryPrint (Chrome Native
 * Messaging). Ver docs/INTEGRACION-PLURYPRINT.md.
 *
 * El cliente no sabe de Chrome: habla con un `PuertoNativo` inyectado. En la
 * extensión ese puerto es un `runtime.Port` hacia el background, que es el
 * único contexto que llama a `connectNative` (ver lib/puente-pluryprint). En
 * los tests es un puerto falso.
 *
 * Reglas que el cliente respeta además de las del host:
 * - Nunca manda rutas: solo bytes, en trozos de 8 MiB como máximo (antes de
 *   base64), con el sha256 del archivo completo.
 * - Toda petición tiene tiempo límite; si el puerto se cierra, todas las
 *   pendientes fallan con un error en español que la interfaz muestra tal cual.
 */

export const NOMBRE_HOST = 'com.maecly.pluryprint';
export const PROTOCOLO = 1;
/** Bytes crudos por `putFile` (antes de base64). El host acepta hasta `limits.maxChunkBytes`. */
export const TROZO_MAX = 8 * 1024 * 1024;
export const URL_PLURYPRINT = 'https://pluryprint.maecly.com/';
export const CAPACIDADES_REQUERIDAS = ['listPrinters', 'listProfiles', 'beginJob', 'putFile', 'commitJob', 'abortJob'] as const;

// ------------------------------------------------------------------ tipos del protocolo

export type TipoMensaje = 'hello' | 'listPrinters' | 'listProfiles' | 'beginJob' | 'putFile' | 'commitJob' | 'abortJob';
export const TIPOS_MENSAJE: readonly TipoMensaje[] = ['hello', 'listPrinters', 'listProfiles', 'beginJob', 'putFile', 'commitJob', 'abortJob'];

export type AccionPluryprint = 'configure' | 'queue' | 'print-default';
export type KindArchivo = 'pdf' | 'xml' | 'txt';
export type Duplex = 'off' | 'long-edge' | 'short-edge';
export type ModoColor = 'color' | 'mono';

/** Códigos de error que define el protocolo (los manda el host). */
export const CODIGOS_PROTOCOLO = [
  'unsupported_version',
  'unknown_type',
  'bad_request',
  'origin_not_allowed',
  'too_large',
  'too_many_files',
  'bad_pdf',
  'checksum_mismatch',
  'unknown_job',
  'job_incomplete',
  'io_error',
  'launch_failed',
  'internal',
] as const;
export type CodigoProtocolo = (typeof CODIGOS_PROTOCOLO)[number];

/** Códigos locales: los produce el cliente, nunca viajan por el protocolo. */
export type CodigoLocal = 'no_instalado' | 'sin_permiso' | 'desconectado' | 'tiempo_agotado' | 'respuesta_invalida' | 'version_incompatible' | 'cancelado';
export type CodigoError = CodigoProtocolo | CodigoLocal;

export interface Limites {
  maxFileBytes: number;
  maxFiles: number;
  maxChunkBytes: number;
  maxJobBytes: number;
}

export interface Hola {
  host: string;
  hostVersion: string;
  protocol: number;
  capabilities: string[];
  limits: Limites;
}

export interface Impresora {
  id: string;
  name: string;
  isDefault: boolean;
  capabilities?: { duplex: boolean; color: boolean; papers: string[] };
}

export interface Perfil {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface Overrides {
  copies?: number;
  duplex?: Duplex;
  color?: ModoColor;
  paper?: string;
  orientation?: 'auto' | 'portrait' | 'landscape';
  collate?: boolean;
}

export interface PedidoTrabajo {
  label: string;
  action: AccionPluryprint;
  profileId?: string | null;
  printerId?: string | null;
  overrides?: Overrides;
}

export interface ArchivoParaImprimir {
  /** Solo el nombre (sin carpetas). El host lo vuelve a sanear. */
  nombre: string;
  kind: KindArchivo;
  datos: Uint8Array;
}

export interface AvanceEnvio {
  archivo: number;
  archivos: number;
  bytes: number;
  bytesTotal: number;
}

export interface ResultadoEnvio {
  jobId: string;
  archivos: number;
}

// ------------------------------------------------------------------ puerto

/** Lo mínimo de un `runtime.Port` que necesita el cliente. */
export interface PuertoNativo {
  postMessage(m: unknown): void;
  onMessage: { addListener(fn: (m: unknown) => void): void };
  /** `motivo` es el texto de `runtime.lastError` cuando Chrome cerró el puerto por un error. */
  onDisconnect: { addListener(fn: (motivo?: string) => void): void };
  disconnect(): void;
}

// ------------------------------------------------------------------ errores

const MENSAJES: Record<CodigoError, string> = {
  no_instalado: 'PluryPrint no está instalado en este equipo, o no está conectado con este navegador.',
  sin_permiso: 'Pluryfact no tiene permiso para comunicarse con PluryPrint. Pulsa «Conectar con PluryPrint» en Avanzado.',
  desconectado: 'PluryPrint cerró la conexión antes de terminar.',
  tiempo_agotado: 'PluryPrint no respondió a tiempo.',
  respuesta_invalida: 'PluryPrint respondió algo que Pluryfact no entiende. Actualiza PluryPrint.',
  version_incompatible: 'Actualiza PluryPrint: esta versión no sabe recibir comprobantes de Pluryfact.',
  cancelado: 'Envío cancelado.',
  unsupported_version: 'Actualiza PluryPrint y Pluryfact: no hablan la misma versión del protocolo.',
  unknown_type: 'Actualiza PluryPrint: no reconoce lo que Pluryfact le pidió.',
  bad_request: 'PluryPrint rechazó el pedido por un dato inválido.',
  origin_not_allowed: 'PluryPrint no reconoce esta copia de Pluryfact. Si la cargaste a mano, regístrala con «pluryprint-cli bridge install --extra-origin».',
  too_large: 'Un archivo o el trabajo completo supera el tamaño que acepta PluryPrint.',
  too_many_files: 'Son demasiados archivos para un solo trabajo de PluryPrint.',
  bad_pdf: 'Un RIDE no es un PDF válido.',
  checksum_mismatch: 'Un archivo llegó dañado a PluryPrint. Vuelve a intentarlo.',
  unknown_job: 'PluryPrint ya no tiene ese trabajo abierto. Vuelve a intentarlo.',
  job_incomplete: 'PluryPrint no recibió todos los archivos del trabajo.',
  io_error: 'PluryPrint no pudo guardar los archivos en tu equipo.',
  launch_failed: 'PluryPrint recibió los archivos pero no pudo abrirse. Ábrelo a mano.',
  internal: 'PluryPrint tuvo un error interno.',
};

export class ErrorPluryprint extends Error {
  constructor(
    readonly codigo: CodigoError,
    /** Texto original del host (en inglés) o de Chrome, para el registro. */
    readonly detalle = '',
  ) {
    super(MENSAJES[codigo]);
    this.name = 'ErrorPluryprint';
  }
}

export const mensajeError = (c: CodigoError) => MENSAJES[c];
export const esCodigoProtocolo = (c: unknown): c is CodigoProtocolo => typeof c === 'string' && (CODIGOS_PROTOCOLO as readonly string[]).includes(c);

/** Traduce el motivo con que Chrome cierra un puerto nativo. */
export function errorDeDesconexion(motivo: string | undefined): ErrorPluryprint {
  const m = motivo ?? '';
  if (/native messaging host not found/i.test(m)) return new ErrorPluryprint('no_instalado', m);
  if (/forbidden/i.test(m)) return new ErrorPluryprint('origin_not_allowed', m);
  if (/nativeMessaging|permission/i.test(m)) return new ErrorPluryprint('sin_permiso', m);
  return new ErrorPluryprint('desconectado', m);
}

// ------------------------------------------------------------------ utilidades

/** sha256 en hexadecimal con WebCrypto (disponible en el service worker, las páginas y los content scripts). */
export async function sha256Hex(datos: Uint8Array): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', datos as BufferSource));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Base64 sin `apply` sobre arreglos gigantes (evita desbordar la pila). */
export function aBase64(datos: Uint8Array): string {
  let s = '';
  for (let i = 0; i < datos.length; i += 0x8000) s += String.fromCharCode(...datos.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Rangos [inicio, fin) de cada trozo. Un archivo vacío es un trozo vacío. */
export function trozos(tamano: number, maximo: number): Array<[number, number]> {
  if (maximo < 1) throw new RangeError('El trozo debe ser de al menos 1 byte');
  if (tamano === 0) return [[0, 0]];
  const r: Array<[number, number]> = [];
  for (let i = 0; i < tamano; i += maximo) r.push([i, Math.min(i + maximo, tamano)]);
  return r;
}

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const entero = (x: unknown, min = 0): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min;

/** Valida la forma de la respuesta a `hello`. */
export function validarHola(r: Record<string, unknown>): Hola {
  const l = r.limits;
  if (
    r.host !== 'pluryprint' ||
    typeof r.hostVersion !== 'string' ||
    !entero(r.protocol, 1) ||
    !Array.isArray(r.capabilities) ||
    !esObjeto(l) ||
    !entero(l.maxFileBytes, 1) ||
    !entero(l.maxFiles, 1) ||
    !entero(l.maxChunkBytes, 1) ||
    !entero(l.maxJobBytes, 1)
  )
    throw new ErrorPluryprint('respuesta_invalida', 'hello');
  return {
    host: r.host,
    hostVersion: r.hostVersion,
    protocol: r.protocol,
    capabilities: r.capabilities.filter((c): c is string => typeof c === 'string'),
    limits: { maxFileBytes: l.maxFileBytes, maxFiles: l.maxFiles, maxChunkBytes: l.maxChunkBytes, maxJobBytes: l.maxJobBytes },
  };
}

// ------------------------------------------------------------------ cliente

export interface Tiempos {
  hello: number;
  lista: number;
  putFile: number;
  commitJob: number;
  otro: number;
}

export const TIEMPOS_POR_DEFECTO: Tiempos = {
  // En frío el host puede tardar en arrancar (antivirus, Gatekeeper).
  hello: 15_000,
  lista: 20_000,
  putFile: 60_000,
  // commitJob escribe el handoff y lanza la app.
  commitJob: 45_000,
  otro: 15_000,
};

export interface OpcionesCliente {
  clientVersion: string;
  tiempos?: Partial<Tiempos>;
  /** Para los tests: tamaño de trozo menor que el real. */
  trozoMax?: number;
}

interface Pendiente {
  tipo: TipoMensaje;
  resolver(r: Record<string, unknown>): void;
  rechazar(e: ErrorPluryprint): void;
  reloj: ReturnType<typeof setTimeout>;
}

/**
 * Una conexión con PluryPrint. Se crea por operación (consultar estado,
 * listar, enviar un trabajo) y se cierra al terminar: así el host no queda
 * vivo y un trabajo sin `commitJob` se borra solo al cerrarse el puerto.
 */
export class ClientePluryprint {
  private siguiente = 1;
  private pendientes = new Map<string, Pendiente>();
  private cerrado: ErrorPluryprint | null = null;
  private tiempos: Tiempos;
  private hola: Hola | null = null;

  constructor(
    private puerto: PuertoNativo,
    private opciones: OpcionesCliente,
  ) {
    this.tiempos = { ...TIEMPOS_POR_DEFECTO, ...opciones.tiempos };
    puerto.onMessage.addListener((m) => this.recibir(m));
    puerto.onDisconnect.addListener((motivo) => this.alCerrarse(errorDeDesconexion(motivo)));
  }

  /** Versión y límites del host, si ya se hizo el saludo. */
  get host(): Hola | null {
    return this.hola;
  }

  private alCerrarse(e: ErrorPluryprint) {
    if (this.cerrado) return;
    this.cerrado = e;
    for (const p of this.pendientes.values()) {
      clearTimeout(p.reloj);
      p.rechazar(e);
    }
    this.pendientes.clear();
  }

  private recibir(m: unknown) {
    if (!esObjeto(m) || typeof m.id !== 'string') return;
    const p = this.pendientes.get(m.id);
    if (!p) return; // respuesta tardía o ajena: se ignora
    this.pendientes.delete(m.id);
    clearTimeout(p.reloj);
    if (m.v !== PROTOCOLO || m.type !== p.tipo) return p.rechazar(new ErrorPluryprint('respuesta_invalida', `${String(m.type)} v${String(m.v)}`));
    if (m.ok === true) return p.resolver(m);
    const err = esObjeto(m.error) ? m.error : {};
    const codigo = esCodigoProtocolo(err.code) ? err.code : 'internal';
    p.rechazar(new ErrorPluryprint(codigo, typeof err.message === 'string' ? err.message : ''));
  }

  /** Envía una petición y espera su respuesta. */
  pedir(tipo: TipoMensaje, campos: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (this.cerrado) return Promise.reject(this.cerrado);
    const id = String(this.siguiente++);
    const limite =
      tipo === 'hello'
        ? this.tiempos.hello
        : tipo === 'listPrinters' || tipo === 'listProfiles'
          ? this.tiempos.lista
          : tipo === 'putFile'
            ? this.tiempos.putFile
            : tipo === 'commitJob'
              ? this.tiempos.commitJob
              : this.tiempos.otro;
    return new Promise((resolver, rechazar) => {
      const reloj = setTimeout(() => {
        this.pendientes.delete(id);
        rechazar(new ErrorPluryprint('tiempo_agotado', tipo));
      }, limite);
      this.pendientes.set(id, { tipo, resolver, rechazar, reloj });
      try {
        this.puerto.postMessage({ v: PROTOCOLO, id, type: tipo, ...campos });
      } catch (e) {
        this.pendientes.delete(id);
        clearTimeout(reloj);
        const err = errorDeDesconexion(e instanceof Error ? e.message : String(e));
        this.alCerrarse(err);
        rechazar(err);
      }
    });
  }

  /** Saludo: comprueba que el host es PluryPrint, que habla el protocolo 1 y que sabe recibir trabajos. */
  async saludar(): Promise<Hola> {
    const r = validarHola(await this.pedir('hello', { client: 'pluryfact', clientVersion: this.opciones.clientVersion, protocols: [PROTOCOLO] }));
    if (r.protocol !== PROTOCOLO) throw new ErrorPluryprint('version_incompatible', `protocol ${r.protocol}`);
    const faltan = CAPACIDADES_REQUERIDAS.filter((c) => !r.capabilities.includes(c));
    if (faltan.length) throw new ErrorPluryprint('version_incompatible', `faltan ${faltan.join(',')}`);
    this.hola = r;
    return r;
  }

  async impresoras(): Promise<Impresora[]> {
    const r = await this.pedir('listPrinters');
    if (!Array.isArray(r.printers)) throw new ErrorPluryprint('respuesta_invalida', 'listPrinters');
    return r.printers.filter((p): p is Impresora => esObjeto(p) && typeof p.id === 'string' && typeof p.name === 'string').map((p) => ({ ...p, isDefault: p.isDefault === true }));
  }

  async perfiles(): Promise<Perfil[]> {
    const r = await this.pedir('listProfiles');
    if (!Array.isArray(r.profiles)) throw new ErrorPluryprint('respuesta_invalida', 'listProfiles');
    return r.profiles
      .filter((p): p is Perfil => esObjeto(p) && typeof p.id === 'string' && typeof p.name === 'string')
      .map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault === true }));
  }

  /**
   * Envía un trabajo completo: beginJob, cada archivo por trozos y commitJob.
   * Si algo falla después de abrir el trabajo, intenta `abortJob` y relanza el
   * error. `senal` permite cancelar entre trozos.
   */
  async enviar(pedido: PedidoTrabajo, archivos: ArchivoParaImprimir[], alAvanzar?: (a: AvanceEnvio) => void, senal?: AbortSignal): Promise<ResultadoEnvio> {
    const hola = this.hola ?? (await this.saludar());
    const l = hola.limits;
    if (!archivos.length) throw new ErrorPluryprint('bad_request', 'sin archivos');
    if (archivos.length > l.maxFiles) throw new ErrorPluryprint('too_many_files', `${archivos.length} > ${l.maxFiles}`);
    const bytesTotal = archivos.reduce((s, a) => s + a.datos.length, 0);
    if (bytesTotal > l.maxJobBytes || archivos.some((a) => a.datos.length > l.maxFileBytes)) throw new ErrorPluryprint('too_large', `${bytesTotal} bytes`);
    const trozo = Math.min(this.opciones.trozoMax ?? TROZO_MAX, l.maxChunkBytes);
    const revisar = () => {
      if (senal?.aborted) throw new ErrorPluryprint('cancelado');
    };
    revisar();

    const inicio = await this.pedir('beginJob', {
      source: 'pluryfact',
      label: pedido.label.slice(0, 120),
      action: pedido.action,
      profileId: pedido.profileId ?? null,
      printerId: pedido.printerId ?? null,
      ...(pedido.overrides && Object.keys(pedido.overrides).length ? { overrides: pedido.overrides } : {}),
      expectedFiles: archivos.length,
    });
    if (typeof inicio.jobId !== 'string' || !inicio.jobId) throw new ErrorPluryprint('respuesta_invalida', 'beginJob');
    const jobId = inicio.jobId;

    try {
      let enviados = 0;
      for (const [index, a] of archivos.entries()) {
        const sha256 = await sha256Hex(a.datos);
        const partes = trozos(a.datos.length, trozo);
        for (const [chunk, [desde, hasta]] of partes.entries()) {
          revisar();
          const r = await this.pedir('putFile', {
            jobId,
            index,
            name: a.nombre,
            kind: a.kind,
            size: a.datos.length,
            sha256,
            chunk,
            chunks: partes.length,
            data: aBase64(a.datos.subarray(desde, hasta)),
          });
          const ultimo = chunk === partes.length - 1;
          if (r.received !== hasta || r.complete !== ultimo) throw new ErrorPluryprint('respuesta_invalida', `putFile ${index}/${chunk}: received=${String(r.received)} complete=${String(r.complete)}`);
          enviados += hasta - desde;
          alAvanzar?.({ archivo: index + 1, archivos: archivos.length, bytes: enviados, bytesTotal });
        }
      }
      revisar();
      const fin = await this.pedir('commitJob', { jobId });
      if (fin.state !== 'handed-off') throw new ErrorPluryprint('respuesta_invalida', `commitJob ${String(fin.state)}`);
      return { jobId, archivos: entero(fin.files) ? fin.files : archivos.length };
    } catch (e) {
      if (!this.cerrado) await this.pedir('abortJob', { jobId }).catch(() => {});
      throw e instanceof ErrorPluryprint ? e : new ErrorPluryprint('internal', e instanceof Error ? e.message : String(e));
    }
  }

  /** Cierra la conexión; las peticiones pendientes fallan con «desconectado». */
  cerrar() {
    if (!this.cerrado) {
      this.alCerrarse(new ErrorPluryprint('desconectado', 'cerrado por Pluryfact'));
      try {
        this.puerto.disconnect();
      } catch {
        /* ya estaba cerrado */
      }
    }
  }
}
