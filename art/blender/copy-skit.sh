#!/usr/bin/env bash
# Run from an environment with write access to D: after rendering is complete.
set -euo pipefail
skit_source="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/renders/skit"
skit_destination="${1:-/mnt/d/Data/oathroll-video/skit}"
python3 - "$skit_source" <<'PY'
import pathlib, struct, sys
root=pathlib.Path(sys.argv[1])
for f in range(1,319):
    p=root/f'{f:04d}.png'
    with p.open('rb') as h:header=h.read(24)
    assert header[:8]==b'\x89PNG\r\n\x1a\n',p
    assert struct.unpack('>II',header[16:24])==(1920,1080),p
print('Validated all 318 full-HD PNGs')
PY
mkdir -p -- "$skit_destination"
rsync -a -- "$skit_source/" "$skit_destination/"
printf 'Frames copied to %s\n' "$skit_destination"
