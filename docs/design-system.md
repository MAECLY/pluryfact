# Sistema de diseño de Legajo

Un legajo es la carpeta atada con cinta donde la oficina guarda los papeles de un caso. La interfaz toma ese mundo: **tinta** azul para la acción, **manila** para lo archivado y **cinta** roja solo para errores y para el ícono. Tono serio y ordenado, pensado para contadores y contribuyentes que descargan cientos de comprobantes.

Tokens en `src/ui/tokens.css` (prefijo `--lg-`). La exploración de nombres y sistemas está en el artifact de naming (2026-11-09).

## Color

| Token | Nombre | Claro | Oscuro | Uso |
|---|---|---|---|---|
| `--lg-accent` | Tinta | `#1D3A6E` | `#7FA6E8` | Botón principal, chip activo, foco |
| `--lg-manila` | Manila | `#D9A441` | `#E8B95A` | Carpeta del ícono, final de la barra de progreso |
| `--lg-err` | Cinta | `#C8102E` | `#FF5A6E` | Errores, cinta del ícono |
| `--lg-ok` | Archivado | `#2D7A4F` | `#5DBB86` | Estado "Listo" |
| `--lg-warn` | Verificar | `#A8701A` | `#E2AE52` | Captcha pendiente, reintentos |
| `--lg-ink` | — | `#14213D` | `#E8ECF4` | Texto |
| `--lg-muted` | — | `#5A6275` | `#9CA5B8` | Texto secundario, etiquetas |
| `--lg-line` | — | `#D8DBE2` | `#26304A` | Bordes |
| `--lg-bg` / `--lg-surface` | Archivo | `#F2F3F5` / `#FFF` | `#0D1322` / `#151D30` | Fondo / tarjetas |

El tema sigue al sistema; `data-theme="light|dark"` en `<html>` lo fuerza.

## Tipografía (IBM Plex, empaquetada en la extensión)

- **Display** — IBM Plex Serif 700, tracking −0.015em. Solo el nombre y las cifras grandes ("318 comprobantes").
- **Texto** — IBM Plex Sans 400/600.
- **Datos** — IBM Plex Mono 400/500 con `tabular-nums`: claves de acceso, RUC, series, montos y etiquetas en mayúsculas (tracking 0.08em).

## Forma

- Radio 3px en controles y 9px en el contenedor del popup. Sin sombras salvo el popup.
- Estados como píldoras con punto: Listo (ok), En cola (muted), Verificar captcha (warn), Error (err).
- Popup de 380px de ancho.

## Voz

Español de Ecuador, directo: "Descargar ZIP", "Pausar", "Verifica el captcha para continuar". Nunca "SRI" como parte de la marca; el SRI se nombra solo como la fuente ("SRI en Línea").

## Marca MAECLY

Crédito "by MAECLY" siempre con el kit real de `MAECLY/maecly-landing` (`public/brand/`), nunca con un placeholder.
