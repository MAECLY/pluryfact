import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Permisos mínimos: `storage` para preferencias e historial de lotes,
// `downloads` para guardar los ZIP. El portal se usa desde el content
// script (mismo origen, sesión del usuario). El único host extra es el
// servicio web público de autorización del SRI, que entrega el XML por
// clave de acceso sin sesión ni captcha.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Legajo',
    description:
      'Descarga en lote tus comprobantes electrónicos de SRI en Línea: XML, RIDE y reporte.',
    permissions: ['storage', 'downloads'],
    host_permissions: ['https://cel.sri.gob.ec/*'],
    action: { default_title: 'Legajo' },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
