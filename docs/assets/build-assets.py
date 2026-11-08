"""Build the brand paths and covers; run from the repository root.

uv run -q --no-project --with pillow --with fonttools python docs/assets/build-assets.py
SVG geometry is hand-written. Letterforms come from the bundled OFL fonts.
"""
from pathlib import Path
from html import escape
import json

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
INK, VELLUM, WAX, GREEN, GOLD = '#14110f', '#ede3cf', '#b8322a', '#3e8e7e', '#c9a24a'
FACE = ROOT / 'app/public/fonts/fraunces.ttf'
font = TTFont(FACE)
font = instantiateVariableFont(font, {'wght': 600, 'opsz': 96}, inplace=False)
glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
units = font['head'].unitsPerEm
metrics = []


def lettering(text, x, baseline, size, colour=INK):
    """Emit outlines, with no system font or remote resource dependency."""
    pieces, cursor = [], 0
    for c in text:
        name = cmap[ord(c)]
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        if pen.getCommands():
            pieces.append(f'<path transform="translate({cursor} 0)" d="{pen.getCommands()}"/>')
        cursor += glyphs[name].width
    return f'<g fill="{colour}" transform="translate({x} {baseline}) scale({size/units} {-size/units})">' + ''.join(pieces) + '</g>'


def mark(colour=INK, seal=WAX, inner=VELLUM):
    return f'''<g stroke-linecap="round" stroke-linejoin="round">
  <path d="M42 7H13a4 4 0 0 0-4 4v41a4 4 0 0 0 4 4h13M42 7v17M18 19h15M18 28h10" fill="none" stroke="{colour}" stroke-width="3.5"/>
  <path d="M43 25c4-2 6 1 9 2s7 0 8 4 0 6 2 9-1 6-2 9 0 7-4 8-6 0-9 2-6-1-9-2-7 0-8-4 0-6-2-9 1-6 2-9 0-7 4-8 6 0 9-2Z" fill="{seal}"/>
  <circle cx="45" cy="42" r="9" fill="none" stroke="{inner}" stroke-width="2.5"/>
  </g>'''


def svg(name, width, height, body, title, desc):
    (OUT / name).write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">
<title id="title">{escape(title)}</title><desc id="desc">{escape(desc)}</desc>
{body}
</svg>\n''')


svg('brand/mark.svg', 64, 64, mark(), 'Oathroll mark', 'A wax seal over a ruling card.')
# The inner ring is a knockout, so the monochrome file also works on transparency.
mono = '''<g fill="currentColor"><path d="M13 5.25h30.75V24h-3.5V8.75H13a2.25 2.25 0 0 0-2.25 2.25v41A2.25 2.25 0 0 0 13 54.25h13v3.5H13A5.75 5.75 0 0 1 7.25 52V11A5.75 5.75 0 0 1 13 5.25Z"/><path d="M18 17.25h15v3.5H18Zm0 9h10v3.5H18Z"/><path fill-rule="evenodd" d="M43 25c4-2 6 1 9 2s7 0 8 4 0 6 2 9-1 6-2 9 0 7-4 8-6 0-9 2-6-1-9-2-7 0-8-4 0-6-2-9 1-6 2-9 0-7 4-8 6 0 9-2ZM45 31.75a10.25 10.25 0 1 0 0 20.5 10.25 10.25 0 0 0 0-20.5Zm0 2.5a7.75 7.75 0 1 1 0 15.5 7.75 7.75 0 0 1 0-15.5Z"/></g>'''
svg('brand/mark-mono.svg',64,64,mono,'Oathroll monochrome mark','A single-colour ruling card and wax seal, with a transparent ring.')
svg('brand/wordmark.svg',680,160,lettering('Oathroll',8,124,150),'Oathroll wordmark','Fraunces lettering converted to paths.')
for name, bg, fg in [('lockup', VELLUM, INK), ('lockup-dark', INK, VELLUM)]:
    body=f'<rect width="900" height="220" rx="18" fill="{bg}"/>'
    body+=f'<g transform="translate(38 40) scale(2.1)">{mark(fg,WAX,bg)}</g>'
    body+=lettering('Oathroll',210,160,148,fg)
    svg(f'brand/{name}.svg',900,220,body,'Oathroll '+name,'The ruling-card seal beside the Fraunces wordmark.')
banner=f'''<rect width="1200" height="280" rx="20" fill="{VELLUM}"/>
<path d="M32 30h1136M32 250h1136" stroke="{GOLD}" stroke-width="1.5"/>
<g transform="translate(68 55) scale(2.6)">{mark()}</g>'''
banner+=lettering('Oathroll',280,181,170)
banner+=lettering('MLH Solana Hackathon · 2026',286,225,27)
svg('readme-banner.svg',1200,280,banner,'Oathroll','Oathroll. MLH Solana Hackathon, 2026. A wax seal over a ruling card.')

# All reviewed refusal screenshots carry simulation labels. Use the requested
# fallback cover. Remove its small footer rather than retaining unreadable text.
cover=Image.open(ROOT/'art/final/covers/cover_1120x560.png').convert('RGB')
hero=cover.crop((0,0,1120,512)).resize((1600,731),Image.Resampling.LANCZOS)
hero.save(OUT/'hero.png',optimize=True)
hero.resize((900,411),Image.Resampling.LANCZOS).save('/tmp/oathroll-hero-900.png')

# Reuse the existing artwork, with a quiet centre for code-drawn type.
source=Image.open(ROOT/'art/generated/hero_B.png').convert('RGB')
source=source.resize((1280,720),Image.Resampling.LANCZOS).crop((0,40,1280,680)).convert('RGBA')
shade=Image.new('RGBA',(1280,640))
sd=ImageDraw.Draw(shade)
for y in range(640):
    alpha=235 if 185<=y<=450 else int(115+120*max(0,1-min(abs(y-185),abs(y-450))/160))
    sd.line((0,y,1280,y), fill=(20,17,15,alpha))
social=Image.alpha_composite(source,shade).convert('RGB')
draw=ImageDraw.Draw(social)


def centre(text, size, top, colour, label, weight):
    face=ImageFont.truetype(str(FACE),size)
    axes=face.get_variation_axes()
    values=[axis['default'] for axis in axes]
    for i,axis in enumerate(axes):
        if axis['name']==b'Weight':values[i]=weight
        if axis['name']==b'Optical Size':values[i]=96
    face.set_variation_by_axes(values)
    # Same OFL family as the game. Pillow draws every label; artwork has no text.
    box=draw.textbbox((0,0),text,font=face)
    x=(1280-(box[2]-box[0]))/2-box[0]
    draw.text((x,top-box[1]),text,font=face,fill=colour)
    height=box[3]-box[1]
    cap=face.getbbox('H')
    metrics.append({'asset':'social-preview.png','text':text,'role':label,'weight':weight,'size':size,'top':top,'bottom':top+height,'cap_height':cap[3]-cap[1],'ink_height_at_1280':height, 'at_640':height/2,'at_320':height/4})
    assert (box[3]-box[1])/4>=12, (text,box)
    assert top>=192 and top+box[3]-box[1]<=448, (text,top,box)


centre('Oathroll',110,200,VELLUM,'title',600)
centre('An AI game master you can talk into cheating,',52,316,VELLUM,'claim',400)
centre("and a Solana program that won't let it.",52,383,VELLUM,'claim',400)
title,first_claim=metrics[:2]
assert first_claim['top']-title['bottom']>=0.4*title['cap_height']
draw.line((48,175,1232,175),fill=GOLD,width=2)
draw.line((48,468,1232,468),fill=GOLD,width=2)
social.save(OUT/'social-preview.png',optimize=True)
for w in (640,320):social.resize((w,w//2),Image.Resampling.LANCZOS).save(f'/tmp/oathroll-social-{w}.png')
(OUT/'type-measurements.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps(metrics,indent=2))
