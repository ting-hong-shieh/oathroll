"""Serial partner001 render queue, bounded GPU lease and budget. Run after previews."""
import argparse, datetime, json, pathlib, subprocess, time
root=pathlib.Path(__file__).resolve().parent
p=argparse.ArgumentParser();p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=318);p.add_argument('--batch',type=int,default=8);p.add_argument('--on-partner',action='store_true');a=p.parse_args()
assert 1<=a.start<=a.end<=318
log=root/'renders'/'skit-batches.jsonl'
# Conservative reserve for all measurement/revision attempts, including idle EGL startup.
used=300.0
if log.exists():used+=sum(json.loads(s)['seconds'] for s in log.read_text().splitlines())
cutoff=datetime.datetime(2026,11,7,22,30,tzinfo=datetime.timezone.utc) # 06:30 Taipei
for start in range(a.start,a.end+1,a.batch):
    end=min(a.end,start+a.batch-1)
    now=datetime.datetime.now(datetime.timezone.utc)
    # Reserve enough time for the next short batch before the lease closes.
    estimate=max(90,(end-start+1)*12+30)
    if used+estimate>3570:raise SystemExit('STOP: 60 GPU-minute budget would be exceeded')
    if (cutoff-now).total_seconds()<estimate:raise SystemExit('STOP: partner001 lease deadline')
    # A busy lock stops the queue. Never queue behind another GPU worker.
    r=subprocess.run(['flock','-n',str(pathlib.Path.home()/'gpu.lock'),'true'] if a.on_partner else ['ssh','-o','BatchMode=yes','partner001','flock -n ~/gpu.lock true'])
    if r.returncode:raise SystemExit('STOP: partner001 or GPU lock unavailable')
    command=f'cd ~/solana-build/oathroll-blender && flock ~/gpu.lock systemd-run --user --scope -p MemoryMax=8G -p MemorySwapMax=0 taskset -c 14-15 nice -n 19 ~/solana-build/blender.sh -b -P skit.py -- frames --engine cycles --start {start} --end {end}'
    print('BATCH',start,end,'budget seconds',round(used),flush=True)
    t=time.monotonic()
    with (root/'renders'/f'skit-batch-{start:04d}.log').open('w') as handle:
        r=subprocess.run(['bash','-c',command] if a.on_partner else ['ssh','-o','BatchMode=yes','partner001',command],stdout=handle,stderr=subprocess.STDOUT)
    elapsed=time.monotonic()-t;used+=elapsed
    with log.open('a') as handle:handle.write(json.dumps({'start':start,'end':end,'seconds':elapsed,'exit':r.returncode})+'\n')
    print('DONE',start,end,round(elapsed,2),'used',round(used),flush=True)
    if r.returncode:raise SystemExit('STOP: batch failed; inspect GPU state before resuming')
