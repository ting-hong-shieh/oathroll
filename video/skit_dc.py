"""Write "DC 16" onto the skit's ruling card, strike the 16 and write a 14 while the Keeper scribbles.
The text follows the card's projected blank area per frame (quads exported from skit.blend), and is
multiplied onto the vellum like ink. Also trims the skit to the frames the edit uses.
Usage: python skit_dc.py <skitDir> <quads.json> <outDir> <firstFrame> <lastFrame>"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

src, quads_path, out, first, last = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
os.makedirs(out, exist_ok=True)
quads = json.load(open(quads_path))["quads"]
FONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app", "public", "fonts", "fraunces.ttf")
INK, RED = (58, 40, 28), (184, 50, 42)
STRIKE0, STRIKE1, WRITE0, WRITE1 = 152, 166, 170, 190  # scribble starts at 149
IMPACT, GONE = 220, 227  # the chain slams down: the 14 and the strike fly off, 16 stands
S = 4  # supersample the text layer

def clamp01(x): return max(0.0, min(1.0, x))

def text_layer(f, w, h):
    """RGBA text layer of size (w*S, h*S) for frame f."""
    W, H = w * S, h * S
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    font = ImageFont.truetype(FONT, int(H * 0.86))
    dc, sixteen, fourteen = "DC ", "16", "14"
    wdc, w16, w14 = (d.textlength(t, font=font) for t in (dc, sixteen, fourteen))
    gap = H * 0.28
    total = wdc + w16 + gap + w14
    x0 = (W - total) / 2; base = H * 0.5
    d.text((x0, base), dc, font=font, fill=INK + (235,), anchor="lm")
    d.text((x0 + wdc, base), sixteen, font=font, fill=INK + (235,), anchor="lm")
    g = 1 - clamp01((f - IMPACT) / (GONE - IMPACT))  # 1 before impact, 0 once knocked off
    s = clamp01((f - STRIKE0) / (STRIKE1 - STRIKE0))
    if s > 0 and g > 0:  # a slightly rising strike through the 16
        xa, xb = x0 + wdc - H * 0.06, x0 + wdc + w16 + H * 0.06
        d.line([(xa, base + H * 0.06), (xa + (xb - xa) * s, base + H * 0.06 - H * 0.12 * s)], fill=RED + (int(240 * g),), width=max(2, int(H * 0.09)))
    k = clamp01((f - WRITE0) / (WRITE1 - WRITE0))
    if k > 0 and g > 0:  # the 14 appears as if written left to right, then jumps off at impact
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(layer).text((x0 + wdc + w16 + gap + (1 - g) * H * 0.4, base - (1 - g) * H * 0.7), fourteen, font=font, fill=RED + (int(245 * g),), anchor="lm")
        cut = int(x0 + wdc + w16 + gap + w14 * k)
        a = np.array(layer); a[:, cut:, 3] = 0; im = Image.alpha_composite(im, Image.fromarray(a))
    return im

for n, f in enumerate(range(first, last + 1), start=1):
    base = Image.open(os.path.join(src, f"{f:04d}.png")).convert("RGB")
    q = np.array(quads[str(f)])
    x0, x1 = int(np.floor(q[:, 0].min())), int(np.ceil(q[:, 0].max()))
    y0, y1 = int(np.floor(q[:, 1].min())), int(np.ceil(q[:, 1].max()))
    w, h = x1 - x0, y1 - y0
    # map the text rectangle onto the (slightly trapezoid) quad: PIL wants the inverse mapping coefficients
    tl, tr, br, bl = q[3], q[2], q[1], q[0]  # quad order: bottom-left, bottom-right, top-right, top-left
    lay = text_layer(f, w, h)
    dst = [(p[0] - x0, p[1] - y0) for p in (tl, tr, br, bl)]
    srcp = [(0, 0), (w * S, 0), (w * S, h * S), (0, h * S)]
    A = []; B = []
    for (xd, yd), (xs, ys) in zip(dst, srcp):
        A += [[xd, yd, 1, 0, 0, 0, -xs * xd, -xs * yd], [0, 0, 0, xd, yd, 1, -ys * xd, -ys * yd]]; B += [xs, ys]
    coef = np.linalg.solve(np.array(A, float), np.array(B, float))
    warped = lay.transform((w, h), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC)
    a = np.asarray(warped).astype(np.float32) / 255
    region = np.asarray(base.crop((x0, y0, x1, y1))).astype(np.float32) / 255
    ink = a[..., :3]; alpha = a[..., 3:4] * 0.95
    mixed = region * (1 - alpha) + region * ink * alpha * 1.0 + 0 * alpha  # multiply like ink on vellum
    base.paste(Image.fromarray((np.clip(mixed, 0, 1) * 255).astype(np.uint8)), (x0, y0))
    base.save(os.path.join(out, f"{n:04d}.png"), compress_level=1)
print("wrote", last - first + 1, "frames to", out)
