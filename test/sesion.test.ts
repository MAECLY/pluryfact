import { expect, it } from 'vitest';
import { pareceSesionCaducada } from '../src/lib/sesion';

const base = 'https://srienlinea.sri.gob.ec';

it('reconoce las respuestas vistas en vivo al caducar la sesión', () => {
  expect(pareceSesionCaducada(`${base}/sri-en-linea/contribuyente/perfil`, '<html>…expira…</html>'.padEnd(12822, ' '), 'SRI en Línea')).toBe(true);
  expect(pareceSesionCaducada(`${base}/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf`, '<html><head><script>location=…</script></head></html>'.padEnd(392, ' '), '')).toBe(true);
  expect(pareceSesionCaducada(`${base}/auth/realms/Internet/protocol/openid-connect/auth?x=1`, '', 'SRI en Línea - Login')).toBe(true);
});

it('no confunde la página normal del portal con una sesión caducada', () => {
  const pagina = `<html><body><form id="frmPrincipal">${'x'.repeat(200_000)}</form></body></html>`;
  expect(pareceSesionCaducada(`${base}/comprobantes-electronicos-internet/pages/consultas/recibidos/comprobantesRecibidos.jsf`, pagina, 'SRI - SISTEMA DE COMPROBANTES ELECTRONICOS')).toBe(false);
});
