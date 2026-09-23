from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
src=Path('/home/tyler/.codex/generated_images/01a0cbf1-d3b1-7480-a832-c863c3e6b59a')
files=[src/'exec-0b5e0b3b-1cd1-4228-8669-827611e4c7fb.png',src/'exec-34a4604b-b542-43fd-99e0-9f84c5eeccad.png',src/'exec-d92c104d-31ae-4019-bf0e-f93b2cd0382a.png']
names=['street-chase','rooftop-launch','alley-crossfire']
phrases=['THE CASE IS HOT. THE CITY IS WORSE.','EVERY CASE HAS ITS UPS AND DOWNS.','TRUST NO BRIEFCASE.']
font='/home/tyler/Projects/rat-detective/public/fonts/bangers/Bangers-Regular.ttf'
logo=Image.open('public/logo-title.webp').convert('RGBA').resize((102,102),Image.Resampling.LANCZOS)
for path,name,phrase in zip(files,names,phrases):
    im=Image.open(path).convert('RGB').resize((1200,630),Image.Resampling.LANCZOS).convert('RGBA')
    shade=Image.new('RGBA',im.size,(0,0,0,0)); px=shade.load()
    for y in range(630):
      for x in range(700):
        a=int(210*max(0,1-x/700)**1.3)
        px[x,y]=(8,5,20,a)
    im=Image.alpha_composite(im,shade)
    im.alpha_composite(logo,(42,37))
    d=ImageDraw.Draw(im)
    title=ImageFont.truetype(font,83)
    d.text((158,48),'RAT DETECTIVE',font=title,fill='#fff2d2',stroke_width=3,stroke_fill='#1d0d27')
    cap=ImageFont.truetype(font,35)
    words=phrase.split(); lines=[]; current=''
    for word in words:
      trial=(current+' '+word).strip()
      if d.textlength(trial,font=cap)>565 and current:
        lines.append(current);current=word
      else: current=trial
    if current: lines.append(current)
    y=485 if len(lines)==1 else 450
    for line in lines:
      d.text((48,y),line,font=cap,fill='#ffe19b',stroke_width=2,stroke_fill='#1d0d27')
      y+=39
    d.rounded_rectangle((48,578,234,609),radius=6,fill='#171020',outline='#d8a448',width=2)
    small=ImageFont.truetype(font,23)
    d.text((65,581),'PLAY FREE ONLINE',font=small,fill='#f8e6ba')
    out=Path('.design/social-share')/f'{name}.png';im.convert('RGB').save(out,optimize=True)
    print(out)
