from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root = Path('/home/tyler/Projects/rat-detective')
out = root / '.design/social-share/generated-v4'
original = Image.open(out / 'alley-ear-fix-original.png').convert('RGB')
w, h = original.size
ratio = 1200 / 630
if w / h > ratio:
    width = round(h * ratio)
    left = (w - width) // 2
    original = original.crop((left, 0, left + width, h))
else:
    height = round(w / ratio)
    top = (h - height) // 2
    original = original.crop((0, top, w, top + height))
art = original.resize((1200, 630), Image.Resampling.LANCZOS).convert('RGBA')
art.convert('RGB').save(out / 'alley-ear-fix-art.png', optimize=True)

veil = Image.new('RGBA', art.size, (0, 0, 0, 0))
pixels = veil.load()
for y in range(245):
    vertical = max(0, 1 - y / 245)
    for x in range(660):
        horizontal = max(0, 1 - x / 660)
        pixels[x, y] = (8, 6, 22, round(150 * horizontal ** 1.25 * vertical ** 0.4))
card = Image.alpha_composite(art, veil)
logo = Image.open(root / 'public/logo-title.webp').convert('RGBA').resize((92, 92), Image.Resampling.LANCZOS)
card.alpha_composite(logo, (40, 36))
draw = ImageDraw.Draw(card)
font = str(root / 'public/fonts/bangers/Bangers-Regular.ttf')
name = ImageFont.truetype(font, 78)
joke = ImageFont.truetype(font, 31)
draw.text((150, 42), 'RAT DETECTIVE', font=name, fill='#fff0d0', stroke_width=3, stroke_fill='#180d25')
draw.text((48, 143), 'I FOLLOWED THE CHEESE.', font=joke, fill='#ffdc95', stroke_width=2, stroke_fill='#180d25')
draw.text((48, 179), 'IT SHOT BACK.', font=joke, fill='#ffdc95', stroke_width=2, stroke_fill='#180d25')
card.convert('RGB').save(out / 'alley-ear-fix-card.png', optimize=True)
