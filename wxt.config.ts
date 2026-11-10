import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Permisos mínimos: `storage` para preferencias e historial de lotes,
// `downloads` para guardar los ZIP. El acceso al SRI llega por el
// match pattern del content script, sin host_permissions extra.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'Legajo',
    description:
      'Descarga en lote tus comprobantes electrónicos de SRI en Línea: XML, RIDE y reporte.',
    permissions: ['storage', 'downloads'],
    action: { default_title: 'Legajo' },
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
