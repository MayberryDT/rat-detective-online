"""Hot-case social-share card: larger type, flaming case callout, broken-city chaos."""

from math import cos, pi, sin
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('/home/tyler/Projects/rat-detective')
OUT = ROOT / '.design/social-share/generated-v7'
ART = OUT / 'hot-case-scene-original.png'
FONT = ROOT / 'public/fonts/bangers/Bangers-Regular.ttf'
W, H = 1200, 630

original = Image.open(ART).convert('RGB')
ow, oh = original.size
crop_width = round(oh * W / H)
original = original.crop(((ow-crop_width)//2, 0, (ow+crop_width)//2, oh))
card = original.resize((W, H), Image.Resampling.LANCZOS).convert('RGBA')
card.convert('RGB').save(OUT / 'hot-case-scene-art.png', optimize=True)

# Keep the title legible without covering the blue rat or flattening the scene.
veil = Image.new('RGBA', (W, H), (0, 0, 0, 0))
px = veil.load()
for y in range(235):
    fy = max(0, 1 - y / 235) ** .45
    for x in range(700):
        fx = max(0, 1 - x / 700) ** 1.3
        px[x, y] = (8, 6, 22, round(135 * fx * fy))
card = Image.alpha_composite(card, veil)

logo = Image.open(ROOT / 'public/logo-title.webp').convert('RGBA')
logo = logo.resize((108, 108), Image.Resampling.LANCZOS)
card.alpha_composite(logo, (67, 43))
draw = ImageDraw.Draw(card)
title_font = ImageFont.truetype(str(FONT), 92)
draw.text((193, 45), 'RAT DETECTIVE', font=title_font,
          fill='#fff0d0', stroke_width=4, stroke_fill='#180d25')


def comic_text(words, x, y, size, angle, color, max_width, accent='#e84f4a'):
    font = ImageFont.truetype(str(FONT), size)
    box = ImageDraw.Draw(card).textbbox((0, 0), words, font=font, stroke_width=3)
    pad = 25
    layer = Image.new('RGBA', (box[2] - box[0] + 2 * pad + 12,
                               box[3] - box[1] + 2 * pad + 12), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    p = (pad - box[0], pad - box[1])
    d.text((p[0] + 6, p[1] + 7), words, font=font, fill='#090717',
           stroke_width=6, stroke_fill='#090717')
    d.text((p[0] + 4, p[1] + 4), words, font=font, fill=accent,
           stroke_width=4, stroke_fill='#180d25')
    d.text(p, words, font=font, fill=color,
           stroke_width=3, stroke_fill='#180d25')
    layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    if layer.width > max_width:
        layer = layer.resize((max_width, round(layer.height * max_width / layer.width)),
                             Image.Resampling.LANCZOS)
    card.alpha_composite(layer, (x, y))


# A single comic burst stays in the upper-right sky.
burst = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(burst)
cx, cy, rx, ry = 930, 79, 218, 60
points = []
for i in range(20):
    angle = 2 * pi * i / 20 - .09
    radius = 1 if i % 2 == 0 else .81
    points.append((cx + rx * radius * cos(angle), cy + ry * radius * sin(angle)))
d.polygon(points, fill='#ff5147', outline='#180d25', width=6)
card.alpha_composite(burst)
comic_text('CHEESE GUNFIGHTS!', 722, 21, 52, 5, '#fff0d0', 423)

# A charred plate and real flame tongues make HOT CASES more than red lettering.
hot = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(hot)
def quadratic(a, b, c):
    return [((1-t)**2*a[0] + 2*(1-t)*t*b[0] + t*t*c[0],
             (1-t)**2*a[1] + 2*(1-t)*t*b[1] + t*t*c[1])
            for t in [i/12 for i in range(13)]]

for cx, height, lean in [(117, 58, -9), (154, 82, 9), (192, 66, -4),
                         (235, 97, 8), (277, 70, -9), (320, 88, 6),
                         (361, 62, -5), (402, 78, 10), (430, 56, -3)]:
    base = 548
    tip = (cx+lean, base-height)
    outer = quadratic((cx-22, base), (cx-31, base-45), tip)
    outer += quadratic(tip, (cx+29, base-49), (cx+24, base))
    d.polygon(outer, fill='#ef3b27')
    inner_tip = (cx+lean*.5, base-height*.62)
    inner = quadratic((cx-10, base), (cx-14, base-28), inner_tip)
    inner += quadratic(inner_tip, (cx+13, base-26), (cx+12, base))
    d.polygon(inner, fill='#ffab32')
d.polygon([(100, 509), (419, 497), (446, 559), (106, 580), (94, 545)],
          fill='#190d25', outline='#ff4c2c', width=5)
card.alpha_composite(hot)
comic_text('HOT CASES!', 113, 465, 65, -8, '#ff5541', 330, accent='#ffd245')

# The city caption fractures the pavement, with flying shards and orange cracks.
chaos = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(chaos)
d.polygon([(744, 501), (828, 483), (899, 492), (971, 468), (1095, 489),
           (1143, 540), (1100, 575), (961, 569), (881, 585), (750, 563)],
          fill='#171024', outline='#f16a37', width=5)
for path in [[(798, 557), (820, 583), (845, 579), (873, 616)],
             [(984, 565), (1006, 595), (1026, 584), (1058, 615)],
             [(1108, 548), (1134, 575), (1151, 569)]]:
    d.line(path, fill='#ff8b3a', width=5, joint='curve')
    for x, y in path[1::2]:
        d.polygon([(x-5, y-4), (x+4, y-8), (x+8, y+5)], fill='#ffd355')
for shard in [[(748, 485), (755, 457), (771, 481)],
              [(1120, 474), (1146, 453), (1138, 489)],
              [(1080, 591), (1086, 610), (1099, 595)]]:
    d.polygon(shard, fill='#ff9a3a', outline='#180d25', width=3)
card.alpha_composite(chaos)
comic_text('CITYWIDE CHAOS!', 757, 472, 52, 7, '#fff0d0', 386)

OUT.mkdir(parents=True, exist_ok=True)
card.convert('RGB').save(OUT / 'share-card-hot-case.png', optimize=True)
