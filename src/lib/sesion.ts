/**
 * ¿La respuesta del portal indica que la sesión del SRI caducó?
 *
 * Visto en vivo (2026-11-10, a los ~20 min de una descarga): la primera
 * petición tras caducar devolvió la página "SRI en Línea" del portal
 * (…/sri-en-linea/contribuyente/perfil, 12,8 KB, con "expir"), y las
 * siguientes una página mínima de 392 B en comprobantesRecibidos.jsf. Antes
 * se había visto también el login de Keycloak (/auth/realms/…).
 */
export function pareceSesionCaducada(url: string, html: string, titulo: string): boolean {
  let ruta = '';
  try {
    ruta = new URL(url).pathname;
  } catch {
    ruta = url;
  }
  if (/\/auth\/realms\//.test(ruta)) return true;
  if (/\/sri-en-linea\//.test(ruta)) return true; // nos sacaron de comprobantes-electronicos-internet
  if (/login|iniciar sesi/i.test(titulo)) return true;
  if (/kc-form-login|openid-connect\/auth|viewexpired|sesi[oó]n (ha )?expir|expired/i.test(html)) return true;
  // Respuesta mínima sin formulario: la redirección de JSF cuando la vista o la sesión ya no existen.
  if (html.length < 2048 && !/frmPrincipal/.test(html)) return true;
  return false;
}
