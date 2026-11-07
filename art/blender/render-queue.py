"""Local serial queue. Every GPU batch uses the required remote lock and affinity."""
import argparse
import datetime
from pathlib import Path
import subprocess
import sys
import time

root=Path(__file__).resolve().parent
p=argparse.ArgumentParser()
p.add_argument('--start',type=int,default=1)
p.add_argument('--end',type=int,default=48)
p.add_argument('--stills',action='store_true')
a=p.parse_args()
assert 1<=a.start<=a.end<=48
jobs=[['spin','--start',str(i),'--end',str(min(i+3,a.end))] for i in range(a.start,a.end+1,4)]
if a.stills:jobs += [['seal'],['rest'],['cover']]
for args in jobs:
    command='cd ~/solana-build/oathroll-blender && flock ~/gpu.lock taskset -c 14-15 nice -n 19 ~/solana-build/blender.sh -b -P oathroll.py -- '+' '.join(args)
    print('BATCH_START',datetime.datetime.now(datetime.timezone.utc).isoformat(),' '.join(args),flush=True)
    start=time.monotonic()
    result=subprocess.run(['ssh','partner001',command],cwd=root)
    duration=time.monotonic()-start
    with (root/'renders'/'batch-times.log').open('a') as f:
        f.write(f'{" ".join(args)} | {duration:.2f}s | exit {result.returncode}\n')
    print('BATCH_END',' '.join(args),f'{duration:.2f}s',result.returncode,flush=True)
    if result.returncode:
        print('Queue stopped; inspect saved frames and check for surviving processes before resuming.',flush=True)
        sys.exit(result.returncode)
