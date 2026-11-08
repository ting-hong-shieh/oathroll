"""Validate the delivered PNG sequence, make contact sheets and a CPU-only review MP4.
Use a Python environment with Pillow and imageio-ffmpeg; all output stays under renders/.
"""
import hashlib, json, pathlib, shutil, statistics, subprocess
from PIL import Image, ImageChops, ImageDraw, ImageStat
import imageio_ffmpeg
root=pathlib.Path(__file__).resolve().parent
frames=root/'renders'/'skit';out=root/'renders'/'skit-review';out.mkdir(exist_ok=True)
# The native scene holds pose 300. Reuse that exact PNG for the final 0.6 s
# so independent GPU denoiser rounding cannot shimmer during the cut hold.
for f in range(301,319):shutil.copyfile(frames/'0300.png',frames/f'{f:04d}.png')
hashes={};sizes={};diffs=[];last=None
for f in range(1,319):
    p=frames/f'{f:04d}.png'
    with Image.open(p) as im:
        im.load();assert im.size==(1920,1080),(p,im.size);assert im.mode=='RGB',(p,im.mode)
        sizes[f]=p.stat().st_size;hashes[f]=hashlib.sha256(im.tobytes()).hexdigest()
        small=im.resize((320,180))
        if last:
            stat=ImageStat.Stat(ImageChops.difference(last,small));diffs.append((f,round(stat.sum[0]/(320*180)+stat.sum[1]/(320*180)+stat.sum[2]/(320*180),3)))
        last=small
for start in range(1,319,48):
    sheet=Image.new('RGB',(1920,6*155),(20,17,15));draw=ImageDraw.Draw(sheet)
    for i,f in enumerate(range(start,min(start+48,319))):
        im=Image.open(frames/f'{f:04d}.png').resize((240,135))
        x=(i%8)*240;y=(i//8)*155;sheet.paste(im,(x,y));draw.text((x+5,y+138),str(f),fill=(237,227,207))
    sheet.save(out/f'contact-{start:04d}.jpg',quality=92)
beats=[1,30,45,67,82,101,116,149,176,199,212,220,225,239,259,274,292,318]
sheet=Image.new('RGB',(1920,6*380),(20,17,15));draw=ImageDraw.Draw(sheet)
for i,f in enumerate(beats):
    im=Image.open(frames/f'{f:04d}.png').resize((640,360));x=i%3*640;y=i//3*380
    sheet.paste(im,(x,y));draw.text((x+8,y+363),f'Frame {f}',fill=(237,227,207))
sheet.save(out/'storyboard.jpg',quality=94)
report={'hold_source_frame':300,'hold_copies':18,'frames':318,'fps':30,'resolution':[1920,1080],'total_bytes':sum(sizes.values()),'hold_301_318_pixel_identical':len({hashes[f] for f in range(301,319)})==1,'largest_adjacent_frame_changes':sorted(diffs,key=lambda x:x[1],reverse=True)[:15],'rgb_sha256':hashes}
(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='rgb_sha256'},indent=2),flush=True)
# Record final frame timings separately from all revision/test renders.
timings=root/'renders'/'skit-remote-times.jsonl'
if timings.exists():
    records=[json.loads(x) for x in timings.read_text().splitlines() if x.strip()]
    latest={r['frame']:r for r in records if not r.get('preview')}
    if len(latest)==318:
        report['final_render_seconds']=round(sum(r['seconds'] for r in latest.values()),3)
        report['final_seconds_per_frame']=round(statistics.mean(r['seconds'] for r in latest.values()),3)
        report['all_recorded_render_minutes']=round(sum(r['seconds'] for r in records if not r.get('preview'))/60,3)
        report['peak_gpu_total_mib']=max(r['peak_gpu_total_mib'] for r in records)
        report['peak_ram_mib']=max(r['ram_mib'] for r in records)
# systemd wall time accounts conservatively for all locked scopes, including failures.
journal=root/'renders'/'skit-gpu-journal.jsonl'
if journal.exists():
    import re
    messages=[json.loads(x).get('MESSAGE','') for x in journal.read_text().splitlines() if x.strip()]
    ours={re.search(r'(run-[^ ]+\.scope)',m).group(1) for m in messages if 'Started run-' in m and 'skit.py' in m}
    scopes={}
    for m in messages:
        unit=m.split(':',1)[0]
        match=re.search(r'over ([0-9.]+)s wall clock time',m)
        if unit in ours and match:scopes[unit]=float(match.group(1))
    report['gpu_scope_wall_minutes_all_attempts']=round(sum(scopes.values())/60,3)
    report['gpu_scope_count']=len(scopes)
    report['all_gpu_scopes_accounted_for']=len(scopes)==len(ours)
report['source_sha256']={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in ('skit.py','oathroll.py','skit.blend')}
summary={k:v for k,v in report.items() if k!='rgb_sha256'}
(root/'skit-report.json').write_text(json.dumps(summary,indent=2)+'\n')
(out/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
print('SKIT_REPORT',json.dumps(summary),flush=True)
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
subprocess.run([ffmpeg,'-hide_banner','-loglevel','warning','-y','-threads','1','-framerate','30','-i',str(frames/'%04d.png'),'-frames:v','318','-an','-c:v','libx264','-threads','1','-crf','18','-preset','medium','-pix_fmt','yuv420p','-movflags','+faststart',str(out/'skit-review.mp4')],check=True)
