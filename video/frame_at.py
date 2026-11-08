import json,sys
d=json.load(open(sys.argv[1]+'/timeline.json')); fr=d['frames']
off=int(sys.argv[2]) if len(sys.argv)>2 else 2500
def at(t):
    b=None
    for f in fr:
        if f['ts']<=t: b=f
    return b and b['name']
t0=fr[0]['ts']
for e in d['timeline']:
    print(f"{(e['t']-t0)/1000:7.1f}s {e['label']:15s} {at(e['t']+off)} {json.dumps({k:v for k,v in e.items() if k not in ('t','label')})[:90]}")
