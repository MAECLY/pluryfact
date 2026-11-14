#!/usr/bin/env python3
"""Compone las imágenes de la ficha de Chrome Web Store desde las capturas.

Toma los PNG de capture.ts (store-assets/raw/) y genera, en store-assets/images/:
  - screenshot-1..5.png   1280x800  (capturas de la tienda, máximo 5)
  - promo-small.png        440x280  (mosaico promocional pequeño)
  - promo-marquee.png     1400x560  (mosaico de marquesina)

Todas salen en RGB de 24 bits sin alfa, como pide la tienda. Las tipografías
son las de la marca (Bricolage Grotesque e IBM Plex Sans), leídas de
node_modules/@fontsource.

Requisitos: `pip install pillow` y haber corrido capture.ts.
Uso: python3 store-assets/scripts/compose.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'store-assets' / 'raw'
OUT = ROOT / 'store-assets' / 'images'
ICON = ROOT / 'public' / 'icon' / '128.png'
FONTS = ROOT / 'node_modules' / '@fontsource'

# Tema Pluryfact, modo oscuro (src/ui/tokens.css).
BG_TOP = (22, 29, 51)       # --pf-surface oscuro
BG_BOTTOM = (14, 19, 36)    # --pf-bg oscuro
ACCENT = (36, 70, 168)      # --pf-accent claro
ACCENT_SOFT = (142, 168, 240)  # --pf-accent oscuro
PLIEGO = (240, 106, 77)     # --pf-pliego
TEXT = (231, 235, 247)      # --pf-ink oscuro
MUTED = (154, 163, 189)     # --pf-muted oscuro

NAME = 'Pluryfact'


def font(size: int, display: bool = False, bold: bool = False) -> ImageFont.FreeTypeFont:
    if display:
        path = FONTS / 'bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff'
    else:
        weight = 600 if bold else 400
        path = FONTS / f'ibm-plex-sans/files/ibm-plex-sans-latin-{weight}-normal.woff'
    return ImageFont.truetype(str(path), size)


def gradient(size: tuple[int, int]) -> Image.Image:
    """Degradado diagonal de la marca con un resplandor azul tinta."""
    small = Image.new('RGB', (64, 64))
    px = small.load()
    for y in range(64):
        for x in range(64):
            t = (x + y) / 126
            px[x, y] = tuple(round(BG_TOP[c] + (BG_BOTTOM[c] - BG_TOP[c]) * t) for c in range(3))
    bg = small.resize(size, Image.BICUBIC).convert('RGBA')
    glow = Image.new('L', size, 0)
    w, h = size
    ImageDraw.Draw(glow).ellipse([w * 0.42, -h * 0.45, w * 1.25, h * 0.85], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(min(size) / 4))
    bg.paste(Image.new('RGB', size, ACCENT), (0, 0), glow)
    return bg


def fit(img: Image.Image, max_w: int, max_h: int) -> Image.Image:
    scale = min(max_w / img.size[0], max_h / img.size[1])
    return img.resize((round(img.size[0] * scale), round(img.size[1] * scale)), Image.LANCZOS)


def paste_card(bg: Image.Image, capture: Image.Image, xy: tuple[int, int], radius: int = 18) -> None:
    """Pega la captura con esquinas redondeadas y una sombra suave."""
    mask = Image.new('L', capture.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, capture.size[0] - 1, capture.size[1] - 1], radius, fill=255)
    shadow = Image.new('RGBA', bg.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 170), (xy[0], xy[1] + 18), mask)
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(28)))
    card = capture.convert('RGBA')
    card.putalpha(mask)
    bg.alpha_composite(card, xy)


def brand(bg: Image.Image, xy: tuple[int, int], icon_size: int, text_size: int) -> None:
    d = ImageDraw.Draw(bg)
    icon = Image.open(ICON).convert('RGBA').resize((icon_size, icon_size), Image.LANCZOS)
    bg.alpha_composite(icon, xy)
    f = font(text_size, display=True)
    box = d.textbbox((0, 0), NAME, font=f)
    y = xy[1] + (icon_size - (box[3] - box[1])) // 2 - box[1]
    d.text((xy[0] + icon_size + round(icon_size * 0.32), y), NAME, font=f, fill=TEXT)


def ficha(d: ImageDraw.ImageDraw, x: int, y: int, w: int = 56, h: int = 10) -> None:
    """La ficha de pliego: el motivo del fichero de meses."""
    d.rounded_rectangle([x, y, x + w, y + h], 3, fill=PLIEGO)


def save_rgb(img: Image.Image, name: str, size: tuple[int, int]) -> None:
    final = img.convert('RGB')
    assert final.size == size, f'{name}: {final.size} != {size}'
    path = OUT / name
    final.save(path, 'PNG', optimize=True)
    print(f'  {path.relative_to(ROOT)}  {final.size[0]}x{final.size[1]} {final.mode}')


def raw(name: str, crop: tuple[int, int, int, int] | None = None) -> Image.Image:
    img = Image.open(RAW / name)
    return img.crop(crop) if crop else img


def screenshot(capture: Image.Image, title: str, subtitle: str, out_name: str, max_w: int = 700, max_h: int = 660) -> None:
    size = (1280, 800)
    bg = gradient(size)
    capture = fit(capture, max_w, max_h)
    x_card = 1280 - capture.size[0] - 64
    paste_card(bg, capture, (x_card, (800 - capture.size[1]) // 2))

    d = ImageDraw.Draw(bg)
    x = 80
    title_font = font(50, display=True)
    sub_font = font(23)
    title_box = d.multiline_textbbox((x, 0), title, font=title_font, spacing=8)
    sub_box = d.multiline_textbbox((x, 0), subtitle, font=sub_font, spacing=9)
    block = (title_box[3] - title_box[1]) + 32 + (sub_box[3] - sub_box[1])
    y = (800 - block) // 2 - 24
    ficha(d, x, y - 36)
    d.multiline_text((x, y), title, font=title_font, fill=TEXT, spacing=8)
    d.multiline_text((x, y + (title_box[3] - title_box[1]) + 32), subtitle, font=sub_font, fill=MUTED, spacing=9)
    assert max(title_box[2], sub_box[2]) < x_card - 32, f'{out_name}: el texto pisa la captura'

    brand(bg, (x, 704), 38, 26)
    save_rgb(bg, out_name, size)


def promo_small() -> None:
    size = (440, 280)
    bg = gradient(size)
    d = ImageDraw.Draw(bg)
    icon = Image.open(ICON).convert('RGBA').resize((80, 80), Image.LANCZOS)
    bg.alpha_composite(icon, ((440 - 80) // 2, 34))
    for text, f, y, color in [
        (NAME, font(38, display=True), 132, TEXT),
        ('Todos tus comprobantes', font(19), 188, MUTED),
        ('del SRI, de una vez.', font(19), 214, MUTED),
    ]:
        w = d.textlength(text, font=f)
        d.text(((440 - w) // 2, y), text, font=f, fill=color)
    save_rgb(bg, 'promo-small.png', size)


def promo_marquee() -> None:
    size = (1400, 560)
    bg = gradient(size)
    capture = fit(raw('popup-progreso.png'), 520, 460)
    paste_card(bg, capture, (1400 - capture.size[0] - 120, (560 - capture.size[1]) // 2))

    d = ImageDraw.Draw(bg)
    x = 100
    brand(bg, (x, 112), 80, 56)
    ficha(d, x, 240, 64, 10)
    d.text((x, 272), 'Todos tus comprobantes del SRI, de una vez.', font=font(34, display=True), fill=TEXT)
    d.text((x, 330), 'XML, RIDE y reporte en un ZIP ordenado por año y mes.', font=font(24), fill=MUTED)
    d.text((x, 370), 'Gratis · No pide tu clave · Sin servidores · Código abierto', font=font(20, bold=True), fill=ACCENT_SOFT)
    save_rgb(bg, 'promo-marquee.png', size)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    screenshot(
        raw('popup-progreso.png'),
        'Un año entero,\nmes a mes',
        'Recibidos se consulta un mes por vez:\nun año son 12 consultas, no 365.\nCierra el popup y la descarga sigue.',
        'screenshot-1.png',
        max_w=520,
    )
    screenshot(
        raw('pagina-nueva-dark.png', (520, 60, 2240, 1100)),
        'Elige qué\nbajar',
        'Tipos, periodo, emisor y formatos:\nXML, RIDE en PDF y reporte TXT,\nen un ZIP ordenado por año y mes.',
        'screenshot-2.png',
        max_w=720,
    )
    screenshot(
        raw('pagina-descargas.png', (530, 40, 2240, 1340)),
        'Reanuda solo\nlo que faltó',
        'Si la sesión del SRI caduca,\nPluryfact guarda lo que ya bajó\ny sigue donde se quedó.',
        'screenshot-3.png',
        max_w=680,
    )
    screenshot(
        raw('pagina-acerca.png', (530, 615, 1940, 1600)),
        'Tu clave no\nsale de Chrome',
        'No pide tu clave del SRI: usa la\nsesión de tu propia pestaña.\nSin servidores ni analítica.',
        'screenshot-4.png',
        max_w=680,
    )
    screenshot(
        raw('pagina-temas.png', (530, 50, 1840, 650)),
        'Ocho temas,\nclaro u oscuro',
        'Color y tipografía a tu gusto,\ntambién en el popup.',
        'screenshot-5.png',
        max_w=690,
    )
    promo_small()
    promo_marquee()


if __name__ == '__main__':
    main()
