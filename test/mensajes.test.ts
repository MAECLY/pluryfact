import { expect, it } from 'vitest';
import { clasificarMensaje } from '../src/lib/mensajes';

it('clasifica los mensajes reales del portal', () => {
  expect(clasificarMensaje('No existen datos para los parámetros  ingresados')).toBe('sin-datos');
  expect(clasificarMensaje('  La fecha ingresada debe ser menor a la fecha actual ')).toBe('fecha-actual');
  expect(clasificarMensaje('Captcha incorrecta')).toBe('captcha');
  expect(clasificarMensaje('Sesión caducada')).toBe('otro');
  expect(clasificarMensaje('   ')).toBeNull();
});
