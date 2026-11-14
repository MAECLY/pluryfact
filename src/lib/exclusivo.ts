/**
 * Envuelve una tarea asíncrona para que corra de a una: si se pide mientras
 * otra sigue en curso, se rechaza al instante. El candado se toma ANTES del
 * primer `await` (el cuerpo de una función async corre síncrono hasta ahí),
 * así dos pedidos casi simultáneos —p. ej. el envío automático al terminar y
 * el botón «Imprimir con Pluryprint»— no pueden pasar los dos.
 */
export interface Exclusivo<A extends unknown[]> {
  /** `true` mientras una ejecución sigue en curso. */
  readonly ocupado: boolean;
  /** Corre la tarea; devuelve `false` sin hacer nada si ya había una en curso. */
  ejecutar(...args: A): Promise<boolean>;
}

export function exclusivo<A extends unknown[]>(tarea: (...args: A) => Promise<unknown>): Exclusivo<A> {
  let ocupado = false;
  return {
    get ocupado() {
      return ocupado;
    },
    async ejecutar(...args: A) {
      if (ocupado) return false;
      ocupado = true;
      try {
        await tarea(...args);
        return true;
      } finally {
        ocupado = false;
      }
    },
  };
}
