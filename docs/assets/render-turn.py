"""Render the compiled TikZ PDF at 200 dpi and make local review previews.

uv run -q --no-project --with pymupdf --with pillow python docs/assets/render-turn.py /tmp/oathroll-figures/turn.pdf
"""
import sys
from pathlib import Path
import pymupdf
from PIL import Image

out = Path(__file__).resolve().parent
pdf = pymupdf.open(sys.argv[1])
pdf[0].get_pixmap(dpi=200, alpha=False).save(out / 'turn.png')
image = Image.open(out / 'turn.png')
preview = image.resize((900, round(image.height * 900 / image.width)), Image.Resampling.LANCZOS)
preview.save('/tmp/oathroll-turn-900.png')
preview.convert('L').save('/tmp/oathroll-turn-gray-900.png')
print(f'turn.png: {image.width} × {image.height}, 200 dpi; review at 900 px and in grayscale')
