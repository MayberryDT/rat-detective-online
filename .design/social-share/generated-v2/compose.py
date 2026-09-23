from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import shutil
ROOT=Path('/home/tyler/Projects/rat-detective')
SRC=Path('/home/tyler/.codex/generated_images/01a0cbf1-d3b1-7480-a832-c863c3e6b59a')
OUT=ROOT/'.design/social-share/generated-v2'
items=[
 ('01-crosswalk','exec-4766100f-ba8e-45e1-a20c-8018cfe6a998.png'),
 ('02-launcher','exec-45ec2ec9-bd63-4c40-8467-d50258d80312.png'),
 ('03-alley','exec-44f1b4ce-8a65-4c9c-891f-dff9525c3702.png'),
 ('04-sewer','exec-c6c0672f-c150-49a3-b66a-df958a2a35d3.png'),
 ('05-counterfeit','exec-090b05d2-a592-4394-b469-7c38206f4cd3.png'),
]
logo=Image.open(ROOT/'public/logo-title.webp').convert('RGBA').resize((92,92),Image.Resampling.LANCZOS)
font=str(ROOT/'public/fonts/bangers/Bangers-Regular.ttf')
for name,filename in items:
    original=Image.open(SRC/filename).convert('RGB')
    w,h=original.size;target=1200/630
    if w/h>target:
        nw=round(h*target);left=(w-nw)//2;original=original.crop((left,0,left+nw,h))
    else:
        nh=round(w/target);top=(h-nh)//2;original=original.crop((0,top,w,top+nh))
    image=original.resize((1200,630),Image.Resampling.LANCZOS).convert('RGBA')
    image.convert('RGB').save(OUT/f'{name}-art.png',optimize=True)
    veil=Image.new('RGBA',(1200,630),(0,0,0,0));v=veil.load()
    for y in range(265):
        yf=max(0,1-y/265)
        for x in range(690):
            xf=max(0,1-x/690)
            alpha=round(165*xf**1.25*yf**0.45)
            v[x,y]=(8,6,22,alpha)
    image=Image.alpha_composite(image,veil)
    image.alpha_composite(logo,(40,36))
    d=ImageDraw.Draw(image)
    title=ImageFont.truetype(font,78)
    d.text((150,42),'RAT DETECTIVE',font=title,fill='#fff0d0',stroke_width=3,stroke_fill='#180d25')
    tagline=ImageFont.truetype(font,32)
    d.text((48,143),'THE CASE IS HOT.',font=tagline,fill='#ffdc95',stroke_width=2,stroke_fill='#180d25')
    d.text((48,179),'THE CITY IS WORSE.',font=tagline,fill='#ffdc95',stroke_width=2,stroke_fill='#180d25')
    image.convert('RGB').save(OUT/f'{name}-card.png',optimize=True)
    print(name,w,h)
