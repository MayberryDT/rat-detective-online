"""Reproducible comic-type explorations over the image-generated scene."""

from pathlib import Path
from math import cos, sin, pi
from PIL import Image, ImageDraw, ImageFont

ROOT = Path('/home/tyler/Projects/rat-detective')
OUT = ROOT / '.design/social-share/generated-v5'
FONT = ROOT / 'public/fonts/bangers/Bangers-Regular.ttf'
W, H = 1200, 630

original = Image.open(OUT / 'corrected-scene-original.png').convert('RGB')
ow, oh = original.size
target_ratio = W / H
if ow / oh > target_ratio:
    crop_w = round(oh * target_ratio)
    original = original.crop(((ow - crop_w) // 2, 0, (ow + crop_w) // 2, oh))
else:
    crop_h = round(ow / target_ratio)
    original = original.crop((0, (oh - crop_h) // 2, ow, (oh + crop_h) // 2))
base = original.resize((W, H), Image.Resampling.LANCZOS).convert('RGBA')
base.convert('RGB').save(OUT / 'corrected-scene-art.png', optimize=True)

cream = '#fff0cc'
yellow = '#ffd24c'
red = '#ff5147'
ink = '#120d26'


def shade(card, left=700, top=240, strength=153):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    px = layer.load()
    for y in range(top):
        fy = max(0.0, 1 - y / top) ** .5
        for x in range(left):
            fx = max(0.0, 1 - x / left) ** 1.4
            px[x, y] = (6, 5, 18, round(strength * fx * fy))
    return Image.alpha_composite(card, layer)


def lettering(card, words, x, y, size, angle=0, fill=cream,
              outline=ink, stroke=4, extrusion=None, font=FONT,
              max_width=None, shadow=True):
    face = ImageFont.truetype(str(font), size)
    box = ImageDraw.Draw(card).textbbox((0, 0), words, font=face, stroke_width=stroke)
    tw, th = box[2] - box[0], box[3] - box[1]
    pad = max(20, stroke * 5)
    layer = Image.new('RGBA', (tw + pad * 2 + 18, th + pad * 2 + 18), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    at = (pad - box[0], pad - box[1])
    if shadow:
        d.text((at[0] + 8, at[1] + 9), words, font=face, fill='#080817',
               stroke_width=stroke + 3, stroke_fill='#080817')
    if extrusion:
        d.text((at[0] + 6, at[1] + 5), words, font=face, fill=extrusion,
               stroke_width=stroke + 1, stroke_fill=outline)
    d.text(at, words, font=face, fill=fill, stroke_width=stroke, stroke_fill=outline)
    layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    if max_width and layer.width > max_width:
        layer = layer.resize((max_width, round(layer.height * max_width / layer.width)), Image.Resampling.LANCZOS)
    card.alpha_composite(layer, (x, y))


def burst(card, cx, cy, rx, ry, fill=yellow, points=10, turn=0):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    verts = []
    for i in range(points * 2):
        a = turn + 2 * pi * i / (points * 2)
        r = 1 if i % 2 == 0 else .75
        verts.append((cx + rx * r * cos(a), cy + ry * r * sin(a)))
    d.polygon(verts, fill=fill, outline=ink, width=8)
    card.alpha_composite(layer)


def scribble(card, coords, color=yellow, width=6):
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(layer).line(coords, fill=color, width=width, joint='curve')
    card.alpha_composite(layer)


def logo(card, x, y, size, angle):
    mark = Image.open(ROOT / 'public/logo-title.webp').convert('RGBA')
    mark = mark.resize((size, size), Image.Resampling.LANCZOS)
    mark = mark.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
    card.alpha_composite(mark, (x, y))


def save(card, name):
    card.convert('RGB').save(OUT / name, optimize=True)


# 1: Crooked pulp-cover title and two urgent callouts. No tidy subtitle.
card = shade(base.copy(), left=760, top=230, strength=168)
logo(card, 33, 35, 98, 12)
lettering(card, 'RAT', 126, 0, 125, angle=8, fill=cream, extrusion=red, max_width=320)
lettering(card, 'DETECTIVE', 143, 93, 96, angle=-5, fill=yellow, extrusion=red, max_width=550)
burst(card, 961, 101, 201, 77, fill=red, points=9, turn=.08)
lettering(card, 'CASE LOOSE!', 799, 62, 56, angle=6, fill=cream, max_width=343, stroke=3)
lettering(card, 'CHEESE', 42, 429, 58, angle=-12, fill=yellow, extrusion=red, max_width=325)
lettering(card, 'INCOMING!', 90, 492, 64, angle=6, fill=cream, extrusion=red, max_width=392)
scribble(card, [(454, 525), (481, 509), (463, 515), (483, 485)], red, 5)
save(card, '01-case-loose.png')


# 2: Type interrupts itself like a comic panel, with the case as the punch.
card = shade(base.copy(), left=750, top=235, strength=166)
lettering(card, 'RAT', 23, 7, 153, angle=-9, fill=yellow, extrusion=red, max_width=385)
logo(card, 337, 13, 90, -14)
lettering(card, 'DETECTIVE!', 125, 107, 86, angle=7, fill=cream, extrusion=red, max_width=575)
lettering(card, 'WHO HAS THE CASE?!', 659, 4, 55, angle=-8, fill=cream, extrusion=red, max_width=510)
scribble(card, [(690, 100), (785, 117), (915, 108)], yellow, 7)
lettering(card, 'MOVE! MOVE!', 47, 451, 62, angle=11, fill=yellow, extrusion=red, max_width=403)
lettering(card, 'MOVE!', 176, 505, 57, angle=-6, fill=cream, extrusion=red, max_width=226)
save(card, '02-who-has-the-case.png')


# 3: The least ad-like treatment: loose shout fragments and a cut-up title.
card = shade(base.copy(), left=790, top=245, strength=180)
tiles = Image.new('RGBA', (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tiles)
td.polygon([(34, 30), (145, 21), (152, 143), (26, 147)], fill='#f25747', outline=ink, width=7)
td.polygon([(153, 23), (265, 32), (257, 154), (145, 143)], fill='#ffd04c', outline=ink, width=7)
td.polygon([(268, 14), (377, 23), (389, 140), (259, 152)], fill='#f6e3ba', outline=ink, width=7)
card.alpha_composite(tiles)
lettering(card, 'R', 48, 29, 108, angle=6, fill=cream, max_width=106, shadow=False)
lettering(card, 'A', 156, 25, 107, angle=-7, fill=ink, outline=cream, max_width=106, shadow=False)
lettering(card, 'T', 272, 22, 107, angle=7, fill=red, max_width=111, shadow=False)
lettering(card, 'DETECTIVE', 108, 127, 96, angle=-7, fill=cream, extrusion=red, max_width=544)
logo(card, 522, 24, 80, 19)
lettering(card, 'CHEESE!', 938, 29, 65, angle=-13, fill=yellow, extrusion=red, max_width=239)
lettering(card, 'RUN!', 49, 463, 91, angle=10, fill=cream, extrusion=red, max_width=256)
lettering(card, 'CASE?!', 927, 454, 75, angle=-15, fill=yellow, extrusion=red, max_width=238)
save(card, '03-scattered-shouts.png')
