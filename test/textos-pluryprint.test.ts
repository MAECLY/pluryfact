import { describe, expect, it } from 'vitest';
import { CODIGOS_PROTOCOLO, type CodigoError } from '../src/lib/pluryprint';
import { problemaPluryprintCorto } from '../src/ui/textos';

describe('problemaPluryprintCorto (barra lateral)', () => {
  it.each<[CodigoError, string]>([
    ['no_instalado', 'PluryPrint: no instalado'],
    ['sin_permiso', 'PluryPrint: sin permiso'],
    ['tiempo_agotado', 'PluryPrint: sin respuesta'],
    ['desconectado', 'PluryPrint: sin respuesta'],
    ['version_incompatible', 'PluryPrint: actualízalo'],
    ['unsupported_version', 'PluryPrint: actualízalo'],
    ['origin_not_allowed', 'PluryPrint: con problemas'],
    ['launch_failed', 'PluryPrint: con problemas'],
  ])('%s → %s', (codigo, texto) => {
    expect(problemaPluryprintCorto(codigo)).toBe(texto);
  });

  it('solo dice «sin respuesta» cuando PluryPrint de verdad no respondió', () => {
    const todos: CodigoError[] = [...CODIGOS_PROTOCOLO, 'no_instalado', 'sin_permiso', 'desconectado', 'tiempo_agotado', 'respuesta_invalida', 'version_incompatible', 'cancelado'];
    const sinRespuesta = todos.filter((c) => problemaPluryprintCorto(c) === 'PluryPrint: sin respuesta');
    expect(sinRespuesta.sort()).toEqual(['desconectado', 'tiempo_agotado']);
  });
});
