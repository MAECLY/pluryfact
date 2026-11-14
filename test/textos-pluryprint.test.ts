import { describe, expect, it } from 'vitest';
import { CODIGOS_PROTOCOLO, type CodigoError } from '../src/lib/pluryprint';
import { problemaPluryprintCorto } from '../src/ui/textos';

describe('problemaPluryprintCorto (barra lateral)', () => {
  it.each<[CodigoError, string]>([
    ['no_instalado', 'Pluryprint: no instalado'],
    ['sin_permiso', 'Pluryprint: sin permiso'],
    ['tiempo_agotado', 'Pluryprint: sin respuesta'],
    ['desconectado', 'Pluryprint: sin respuesta'],
    ['version_incompatible', 'Pluryprint: actualízalo'],
    ['unsupported_version', 'Pluryprint: actualízalo'],
    ['origin_not_allowed', 'Pluryprint: con problemas'],
    ['launch_failed', 'Pluryprint: con problemas'],
  ])('%s → %s', (codigo, texto) => {
    expect(problemaPluryprintCorto(codigo)).toBe(texto);
  });

  it('solo dice «sin respuesta» cuando Pluryprint de verdad no respondió', () => {
    const todos: CodigoError[] = [...CODIGOS_PROTOCOLO, 'no_instalado', 'sin_permiso', 'desconectado', 'tiempo_agotado', 'respuesta_invalida', 'version_incompatible', 'cancelado'];
    const sinRespuesta = todos.filter((c) => problemaPluryprintCorto(c) === 'Pluryprint: sin respuesta');
    expect(sinRespuesta.sort()).toEqual(['desconectado', 'tiempo_agotado']);
  });
});
