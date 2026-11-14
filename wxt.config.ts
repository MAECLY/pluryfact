import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Permisos mínimos: `storage` para el progreso de la descarga. El ZIP se
// guarda desde la propia pestaña del portal. El portal se usa desde el content
// script (mismo origen, sesión del usuario). El único host extra es el
// servicio web público de autorización del SRI, que entrega el XML por
// clave de acceso sin sesión ni captcha. El host del portal permite al popup
// encontrar la pestaña del SRI sin el permiso amplio `tabs`. `scripting`
// permite al popup activar Pluryfact en una pestaña del SRI que ya estaba
// abierta antes de instalar o recargar la extensión. `notifications` avisa
// al terminar o si la sesión del SRI caduca, con el popup ya cerrado.
//
// `nativeMessaging` es OPCIONAL: se pide con permissions.request() solo cuando
// el usuario pulsa «Conectar con Pluryprint» en Avanzado, para entregar los
// comprobantes que elige imprimir a Pluryprint, en su equipo. Así una
// actualización no desactiva la extensión a quien no usa Pluryprint.
// El build de pruebas de punta a punta (PLURYFACT_E2E=1, ver
// scripts/e2e-pluryprint.ts) lo vuelve obligatorio para probar sin el diálogo
// de Chrome, y sale a .output-e2e/ para no pisar el build de la tienda.
const E2E = process.env.PLURYFACT_E2E === '1';

export default defineConfig({
  srcDir: 'src',
  ...(E2E ? { outDir: '.output-e2e' } : {}),
  manifest: {
    name: 'Pluryfact',
    description:
      'Descarga en lote tus comprobantes electrónicos de SRI en Línea: XML, RIDE y reporte.',
    permissions: ['storage', 'scripting', 'notifications', ...(E2E ? ['nativeMessaging'] : [])],
    optional_permissions: E2E ? [] : ['nativeMessaging'],
    host_permissions: [
      'https://cel.sri.gob.ec/*',
      'https://srienlinea.sri.gob.ec/comprobantes-electronicos-internet/*',
    ],
    action: { default_title: 'Pluryfact' },
    // La página completa también es la página de opciones (chrome://extensions → Detalles → Opciones).
    options_ui: { page: 'pluryfact.html', open_in_tab: true },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
