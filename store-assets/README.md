# Recursos para Chrome Web Store

Imágenes de la ficha de la tienda y los scripts que las generan. El texto de la
ficha (resumen, descripción, categoría) está en [LISTING.md](LISTING.md), y las
respuestas de la pestaña de privacidad en [PRIVACY.md](PRIVACY.md).

## Qué archivo va en cada campo de la tienda

| Campo de la tienda | Tamaño pedido | Archivo |
|---|---|---|
| Paquete | ZIP de la extensión | `.output/pluryfact-<versión>-chrome.zip` (`bun run zip`) |
| Ícono de la tienda | PNG de 128×128, dibujo de 96×96 con 16 px de margen transparente | `images/icon-128.png` |
| Capturas de pantalla (1 a 5) | 1280×800, 24 bits, sin alfa | `images/screenshot-1..5.png` |
| Mosaico promocional pequeño | 440×280, 24 bits, sin alfa | `images/promo-small.png` |
| Mosaico de marquesina | 1400×560, 24 bits, sin alfa | `images/promo-marquee.png` |

Los mosaicos promocionales no son capturas: el campo de capturas los rechaza
porque no miden 1280×800.

## Contenido

- `images/screenshot-1..5.png`, capturas de la tienda, 1280×800, RGB de 24 bits:
  1. el popup bajando un año de facturas recibidas, mes a mes;
  2. la página completa, Nueva descarga (tema oscuro);
  3. Descargas: una descarga cortada por la sesión caducada, con «Reanudar lo que faltó»;
  4. Acerca de: cómo cuida tus datos y los permisos;
  5. Avanzado: los ocho temas.
- `images/icon-128.png`, ícono de la tienda: `design/icon/app.svg` recortado a
  su baldosa y dibujado a 96×96 sobre un lienzo transparente de 128×128. Lo
  genera `bun run icons`.
- `images/promo-small.png`, mosaico pequeño, 440×280.
- `images/promo-marquee.png`, marquesina, 1400×560.
- `raw/`, capturas a 2x de las que salen las imágenes: el popup (formulario y
  descarga en curso) y la página completa (Nueva descarga en claro y oscuro,
  Descargas, Avanzado y Acerca de).
- `scripts/capture.ts`, abre el Chromium de Playwright con la extensión
  compilada, siembra `chrome.storage.local` con un trabajo y un historial de
  ejemplo y fotografía cada estado. **No abre SRI en Línea.** Los datos son
  ficticios: el RUC `0999999999001` no es de ningún contribuyente. Sin una
  pestaña del portal la extensión mostraría «Abre SRI en Línea…»; la captura
  pinta el estado conectado con el mismo texto que pone la extensión cuando sí
  la encuentra, y oculta ese aviso.
- `scripts/compose.py`, composición con Pillow: redondea y sombrea las
  capturas sobre un degradado del tema Pluryfact oscuro, agrega el texto en
  Bricolage Grotesque e IBM Plex Sans (de `node_modules/@fontsource`) y aplana
  todo a los tamaños exactos de la tienda en RGB de 24 bits.

## Regenerar

```bash
bun run build                               # deja .output/chrome-mv3
bunx playwright install chromium
bun store-assets/scripts/capture.ts         # -> store-assets/raw/
python3 -m venv .venv && . .venv/bin/activate
pip install pillow
python3 store-assets/scripts/compose.py     # -> store-assets/images/
bun run zip                                 # -> .output/pluryfact-<versión>-chrome.zip
```

Las horas del historial de ejemplo («Terminó a las…») salen del reloj del
momento de la captura, así que cambian entre corridas.
