"""Save tool outputs, append provenance, and build web derivatives locally."""
import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


def normalize(name):
    path = Path('generated') / f'{name}.png'
    if name in ('vellum_tile', 'hero_AB_side_by_side', 'vellum_tiling_check'):
        return
    with Image.open(path) as source:
        image = source.convert('RGB')
        rw, rh = (4, 5) if name == 'keeper' else (16, 9)
        unit = min(image.width // rw, image.height // rh)
        width, height = rw * unit, rh * unit
        x, y = (image.width - width) // 2, (image.height - height) // 2
        image.crop((x, y, x + width, y + height)).save(path)


def export(name):
    normalize(name)
    with Image.open(Path('generated') / f'{name}.png') as source:
        image = source.convert('RGB')
        if name == 'keeper':
            target = (1200, 1500)
        elif name == 'vellum_tile':
            target = image.size
        elif name == 'hero_AB_side_by_side':
            target = (1920, 540)
        else:
            target = (1920, 1080)
        image.thumbnail(target, Image.Resampling.LANCZOS)
        image.save(Path('final') / f'{name}.webp', quality=82, method=6)


parser = argparse.ArgumentParser()
parser.add_argument('--save-json')
parser.add_argument('--all', action='store_true')
args = parser.parse_args()
if args.save_json:
    data = json.loads(Path(args.save_json).read_text())
    name = data['name']
    shutil.copyfile(data['source'], f'generated/{name}.png')
    timestamp = datetime.now(timezone.utc).isoformat()
    with open('CREDITS.md', 'a') as log:
        log.write(f'\n## generated/{name}.png\n- Date (UTC): {timestamp}\n'
                  '- Tool/model: built-in `image_gen.imagegen`; model undisclosed.\n'
                  f'- Reference: {data.get("reference", "none")}\n'
                  f'- Became: `generated/{name}.png` and `final/{name}.webp`.\n'
                  f'- Full prompt:\n\n```text\n{data["prompt"]}\n```\n')
    export(name)
if args.all:
    sheet = Image.new('RGB', (1920, 540))
    for index, name in enumerate(('hero_A', 'hero_B')):
        with Image.open(f'generated/{name}.png') as image:
            sheet.paste(image.convert('RGB').resize((960, 540), Image.Resampling.LANCZOS), (index * 960, 0))
    sheet.save('generated/hero_AB_side_by_side.png')
    for path in Path('generated').glob('*.png'):
        export(path.stem)
    print('Exported', len(list(Path('final').glob('*.webp'))), 'WebP files')
