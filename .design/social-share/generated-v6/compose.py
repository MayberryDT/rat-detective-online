"""One restrained title and three spaced comic callouts over corrected scene art."""

from math import cos, pi, sin
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('/home/tyler/Projects/rat-detective')
OUT = ROOT / '.design/social-share/generated-v6'
ART = ROOT / '.design/social-share/generated-v5/corrected-scene-art.png'
FONT = ROOT / 'public/fonts/bangers/Bangers-Regular.ttf'
W, H = 1200, 630

card = Image.open(ART).convert('RGBA')

# Keep the title legible without covering the blue rat or flattening the scene.
veil = Image.new('RGBA', (W, H), (0, 0, 0, 0))
px = veil.load()
for y in range(215):
    fy = max(0, 1 - y / 215) ** .45
    for x in range(635):
        fx = max(0, 1 - x / 635) ** 1.3
        px[x, y] = (8, 6, 22, round(130 * fx * fy))
card = Image.alpha_composite(card, veil)

logo = Image.open(ROOT / 'public/logo-title.webp').convert('RGBA')
logo = logo.resize((92, 92), Image.Resampling.LANCZOS)
card.alpha_composite(logo, (40, 34))
draw = ImageDraw.Draw(card)
title_font = ImageFont.truetype(str(FONT), 78)
draw.text((150, 42), 'RAT DETECTIVE', font=title_font,
          fill='#fff0d0', stroke_width=3, stroke_fill='#180d25')


def comic_text(words, x, y, size, angle, color, max_width):
    font = ImageFont.truetype(str(FONT), size)
    box = ImageDraw.Draw(card).textbbox((0, 0), words, font=font, stroke_width=3)
    pad = 25
    layer = Image.new('RGBA', (box[2] - box[0] + 2 * pad + 12,
                               box[3] - box[1] + 2 * pad + 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    p = (pad - box[0], pad - box[1])
    d.text((p[0] + 6, p[1] + 7), words, font=font, fill='#090717',
           stroke_width=6, stroke_fill='#090717')
    d.text((p[0] + 4, p[1] + 4), words, font=font, fill='#e84f4a',
           stroke_width=4, stroke_fill='#180d25')
    d.text(p, words, font=font, fill=color,
           stroke_width=3, stroke_fill='#180d25')
    layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    if layer.width > max_width:
        layer = layer.resize((max_width, round(layer.height * max_width / layer.width)),
                             Image.Resampling.LANCZOS)
    card.alpha_composite(layer, (x, y))


# One burst, placed entirely in the upper-right sky; no impact or character overlap.
burst = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(burst)
cx, cy, rx, ry = 981, 74, 190, 56
points = []
for i in range(20):
    angle = 2 * pi * i / 20 - .09
    radius = 1 if i % 2 == 0 else .81
    points.append((cx + rx * radius * cos(angle), cy + ry * radius * sin(angle)))
d.polygon(points, fill='#ff5147', outline='#180d25', width=6)
card.alpha_composite(burst)
comic_text('CHEESE GUNFIGHTS!', 814, 20, 43, 5, '#fff0d0', 335)

# The remaining phrases sit in separate open pavement zones, not a subtitle stack.
comic_text('CASE CHASES!', 42, 482, 48, -9, '#ffd24c', 314)
comic_text('CITYWIDE CHAOS!', 843, 491, 43, 7, '#fff0d0', 320)

OUT.mkdir(parents=True, exist_ok=True)
card.convert('RGB').save(OUT / 'share-card-spaced.png', optimize=True)
