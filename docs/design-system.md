# Sistema de diseño de Pluryfact

**Pluryfact** = *plury* (muchos, en lote) + *fact* (comprobante). El símbolo son varios pliegos apilados con una flecha de descarga: muchos comprobantes que bajan de una vez. Pertenece a la familia de **Pluryprint**: comparten el prefijo y la estructura, pero Pluryprint es naranja y Pluryfact es tinta azul con pliego coral. Tono serio y ordenado, pensado para contadores y contribuyentes que descargan cientos de comprobantes.

Tokens en `src/ui/tokens.css` (prefijo `--pf-`). El registro de temas está en `src/lib/temas.ts`.

## Temas

La exploración de nombres (noviembre de 2026) dejó una paleta y una tipografía por candidato. En vez de tirarlas, se quedaron como temas que el usuario elige en **Avanzado → Tema**. Se guarda en `pluryfact:ajustes.tema`, se aplica con `<html data-brand="id">` y cambia al momento en el popup y en la página.

| Tema | Acento (claro / oscuro) | Pliego | Display |
|---|---|---|---|
| **Pluryfact** (predeterminado) | `#2446A8` / `#8EA8F0` | coral `#F06A4D` | Bricolage Grotesque 700 |
| Tabularium | `#2F6E62` / `#6FB8A8` | bronce `#B07A3F` | Marcellus 400 |
| Ledgera | `#1D5C3A` / `#6FC597` | verde `#8FBF9A` | Newsreader 600 |
| Factrix | `#0C5C63` / `#5FD3B3` | menta `#5FD3B3` | Sora 700 |
| XMLote | `#2F7D3A` / `#7BD389` | ámbar `#E3B341` | JetBrains Mono 700 |
| Comproflow | `#0A7EA4` / `#4FC3E8` | ámbar `#FFB547` | Outfit 700 |
| Comprobox | `#B4471A` / `#F08A4B` | pizarra `#3E7C8C` | Rubik 700 |
| Fiscabox | `#16325C` / `#8FB0E8` | oro `#C9A227` | Manrope 800 |

Cada tema define en claro y en oscuro: `bg`, `surface`, `ink`, `muted`, `line`, `accent`, `accent-ink`, `pliego`, más la tipografía display. Los colores semánticos (`ok`, `warn`, `err`), la letra de texto, la monoespaciada y la forma son comunes a todos. `test/temas.test.ts` vigila que ningún tema quede sin alguno de sus tres bloques ni sin un color.

El oscuro sigue al sistema; `data-theme="light|dark"` en `<html>` lo fuerza.

## Color (Pluryfact)

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--pf-accent` | `#2446A8` | `#8EA8F0` | Botón principal, chip activo, foco, insignia del ícono |
| `--pf-pliego` | `#F06A4D` | `#FF8A70` | Pliego trasero del ícono, casillas completas del fichero |
| `--pf-ok` | `#2D7A4F` | `#5DBB86` | Estado "Listo" |
| `--pf-warn` | `#A8701A` | `#E2AE52` | Captcha pendiente, reintentos |
| `--pf-err` | `#B3261E` | `#FF6B6B` | Errores y casillas con problemas |
| `--pf-ink` / `--pf-muted` | `#151C33` / `#59617A` | `#E7EBF7` / `#9AA3BD` | Texto / secundario |
| `--pf-line` | `#D3D9EE` | `#27304D` | Bordes |
| `--pf-bg` / `--pf-surface` | `#F3F5FB` / `#FFF` | `#0E1324` / `#161D33` | Fondo / tarjetas |

## Tipografía (empaquetada en la extensión con @fontsource)

- **Display** — la del tema (Bricolage Grotesque en Pluryfact). Solo el nombre y las cifras grandes ("318 comprobantes").
- **Texto** — IBM Plex Sans 400/600.
- **Datos** — IBM Plex Mono 400/500 con `tabular-nums`: claves de acceso, RUC, series y montos.

## Forma

- Radio 3px en controles y 9px en contenedores. Sin sombras salvo el popup.
- Estados como píldoras con punto: Listo (ok), En cola (muted), Verificar captcha (warn), Error (err).
- Popup de 380px de ancho.
- Ícono: `design/icon/app.svg` (48/128 px) y `favicon.svg` (16/32 px); `bun run icons` los rasteriza.

## Voz

Español de Ecuador, directo: "Descargar", "Reanudar 5 meses", "Verifica el captcha para continuar". Nunca "SRI" como parte de la marca; el SRI se nombra solo como la fuente ("SRI en Línea").

## Marca MAECLY

Crédito "by MAECLY" siempre con el kit real de `MAECLY/maecly-landing` (`public/brand/`), nunca con un placeholder.
