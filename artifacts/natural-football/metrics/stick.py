"""Opponent pairs that stay within 3 m of each other in running play (dead balls excluded).

  python3 -I stick.py LABEL=export.json.gz [LABEL=export.json.gz ...]
"""
import gzip, json, sys, math, collections

def run(label, path):
    pb = json.load(gzip.open(path))['playback']
    samples = []
    for f in pb['frames']:
        dead = [(f['startSeconds'] + s['dead'], f['startSeconds'] + s['kick']) for s in f.get('stoppages') or []]
        for m in f['motion']:
            t = m['elapsedSeconds']
            if not any(a <= t <= b for a, b in dead):
                samples.append(m)
    close2 = close3 = tot = 0
    runs, stuck = {}, []
    combos = collections.Counter()
    for m in samples:
        t = m['elapsedSeconds']
        h, a = ([(p['id'], p['position'][0], p['position'][1], p['state']) for p in side if p['state'] != 'keeper'] for side in m['players'])
        cur = {}
        for (i, x1, y1, s1) in h:
            for (j, x2, y2, s2) in a:
                if math.hypot(x1 - x2, y1 - y2) < 3:
                    cur[(i, j)] = (s1, s2)
        for side, other in ((h, a), (a, h)):
            for (_, x1, y1, _) in side:
                dm = min(math.hypot(x1 - x2, y1 - y2) for (_, x2, y2, _) in other)
                tot += 1
                close2 += dm < 2
                close3 += dm < 3
        for k in list(runs):
            if k not in cur:
                st, last, sts = runs.pop(k)
                if last - st >= 5:
                    stuck.append(last - st)
                    if last - st >= 10:
                        combos.update(sts.most_common(1)[0][0:1])
        for k, sts in cur.items():
            if k in runs:
                runs[k][1] = t
                runs[k][2][tuple(sorted(sts))] += 1
            else:
                runs[k] = [t, t, collections.Counter({tuple(sorted(sts)): 1})]
    n = len(stuck)
    print(f"{label:4} running samples={len(samples)}  nearest opponent <2m {100*close2/tot:4.1f}%  <3m {100*close3/tot:4.1f}%  | pairs within 3m: 5s+ {n}, 10s+ {sum(s >= 10 for s in stuck)}, 20s+ {sum(s >= 20 for s in stuck)}, longest {max(stuck, default=0):.0f}s, total {sum(stuck)/60:.1f} min")
    print('     10s+ pairs by states:', ', '.join(f"{'/'.join(k)} {v}" for k, v in combos.most_common(5)))

for arg in sys.argv[1:]:
    label, p = arg.split('=', 1)
    run(label, p)
