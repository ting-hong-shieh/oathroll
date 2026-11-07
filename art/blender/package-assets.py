"""Package reviewed PNGs with local ImageMagick; writes only inside this folder."""
from pathlib import Path
import json
import struct
import subprocess

ROOT=Path(__file__).resolve().parent
R=ROOT/'renders'
F=ROOT/'final'
F.mkdir(exist_ok=True)
ASSETS={
    'hero_desk.png':('blender_hero_desk.webp',(1920,1080)),
    'cover_1120x560.png':('blender_cover.webp',(1120,560)),
    'seal_intact.png':('seal_intact.webp',(1024,1024)),
    'seal_cracked.png':('seal_cracked.webp',(1024,1024)),
    'd20_rest.png':('d20_rest.webp',(1024,1024)),
}

def size(p):
    with p.open('rb') as f:
        assert f.read(8)==b'\x89PNG\r\n\x1a\n',p
        f.read(8)
        return struct.unpack('>II',f.read(8))

for src,(dest,expected) in ASSETS.items():
    assert size(R/src)==expected,(src,size(R/src))
    subprocess.run(['convert',str(R/src),'-quality','85','-define','webp:alpha-quality=100',str(F/dest)],check=True)

frames=[R/'d20_spin'/f'{i:04d}.png' for i in range(1,49)]
for frame in frames:assert size(frame)==(512,512),frame
# A generic ImageMagick -coalesce preview accumulated old alpha across WebP
# no-blend frames. Encode independent full-canvas frames so every frame can be
# decoded and its alpha checked directly, without additional compositing.
def chunks(data):
    assert data[:4]==b'RIFF' and data[8:12]==b'WEBP'
    offset=12
    while offset+8<=len(data):
        length=int.from_bytes(data[offset+4:offset+8],'little')
        yield data[offset:offset+4],data[offset+8:offset+8+length]
        offset+=8+length+(length%2)

def chunk(kind,payload):
    return kind+struct.pack('<I',len(payload))+payload+(b'\0' if len(payload)%2 else b'')

def u24(value):return value.to_bytes(3,'little')

# VP8X: animation and alpha; transparent ANIM background; loop count zero.
body=chunk(b'VP8X',bytes([0x12,0,0,0])+u24(511)+u24(511))
body+=chunk(b'ANIM',bytes(6))
for i,frame in enumerate(frames):
    encoded=subprocess.run(['convert',str(frame),'-quality','85','-define','webp:alpha-quality=100','webp:-'],check=True,capture_output=True).stdout
    image_chunks=b''.join(chunk(k,v) for k,v in chunks(encoded) if k in [b'ALPH',b'VP8 ',b'VP8L'])
    assert image_chunks,frame
    # x/y=0, width/height=512, 42/41/42 ms, no blending with previous canvas.
    header=u24(0)+u24(0)+u24(511)+u24(511)+u24([42,41,42][i%3])+bytes([2])
    body+=chunk(b'ANMF',header+image_chunks)
(R/'d20_spin.webp').write_bytes(b'RIFF'+struct.pack('<I',len(body)+4)+b'WEBP'+body)
(F/'d20_spin.webp').write_bytes((R/'d20_spin.webp').read_bytes())
data=(R/'d20_spin.webp').read_bytes()
assert data[:4]==b'RIFF' and data[8:12]==b'WEBP'
offset=12;durations=[];loop=None;canvas=None;flags=None
while offset+8<=len(data):
    kind=data[offset:offset+4];length=int.from_bytes(data[offset+4:offset+8],'little')
    payload=data[offset+8:offset+8+length]
    if kind==b'ANMF':durations.append(int.from_bytes(payload[12:15],'little'))
    if kind==b'ANIM':loop=int.from_bytes(payload[4:6],'little')
    if kind==b'VP8X':
        flags=payload[0]
        canvas=(int.from_bytes(payload[4:7],'little')+1,int.from_bytes(payload[7:10],'little')+1)
    offset+=8+length+(length%2)
assert len(durations)==48,(len(durations),durations)
assert sum(durations)==2000,durations
assert loop==0,loop
assert canvas==(512,512),canvas
assert flags & 2 and flags & 16,('animation and alpha flags',flags)
manifest={p.name:{'bytes':p.stat().st_size} for p in F.glob('*.webp')}
for _,(dest,dimensions) in ASSETS.items():
    manifest[dest].update(width=dimensions[0],height=dimensions[1])
manifest['d20_spin.webp'].update(frames=48,duration_ms=sum(durations),loop='infinite',width=512,height=512)
(F/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
