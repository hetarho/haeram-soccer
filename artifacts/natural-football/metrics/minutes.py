"""Per-minute activity: events (beats) and the mean outfield speed in running play.

  python3 -I minutes.py LABEL=export.json.gz [...]
"""
import gzip, json, sys, math

def per_minute(path):
    pb = json.load(gzip.open(path))['playback']
    out = []
    for f in pb['frames']:
        dead = [(f['startSeconds'] + s['dead'], f['startSeconds'] + s['kick']) for s in f.get('stoppages') or []]
        tot = n = 0
        prev = None
        for m in f['motion']:
            t = m['elapsedSeconds']
            if any(a - 1.5 <= t <= b + 1.5 for a, b in dead):
                prev = None
                continue
            cur = {p['id']: p['position'] for side in m['players'] for p in side if p['state'] != 'keeper'}
            if prev:
                dt = t - prev[0]
                if 0.2 <= dt <= 3:
                    for pid, q in cur.items():
                        if pid in prev[1]:
                            p = prev[1][pid]
                            tot += math.hypot(q[0] - p[0], q[1] - p[1]) / dt
                            n += 1
            prev = (t, cur)
        out.append((f['label'], len(f['events']), tot / n if n else None))
    return out

rows = {}
for arg in sys.argv[1:]:
    label, p = arg.split('=', 1)
    rows[label] = per_minute(p)
labels = list(rows)
for label in labels:
    r = rows[label]
    sp = [s for _, _, s in r if s is not None]
    slow = [m for m, _, s in r if s is not None and s < 0.7]
    fast = [m for m, _, s in r if s is not None and s > 3.0]
    ev = sorted(e for _, e, _ in r)
    print(f"{label:4} mean speed per minute: median {sorted(sp)[len(sp)//2]:.2f} m/s | near-frozen minutes (<0.7 m/s): {len(slow)} {slow[:12]} | rushed minutes (>3 m/s): {len(fast)} {fast[:12]} | events a minute min/median/max {ev[0]}/{ev[len(ev)//2]}/{ev[-1]}")
print()
print('minute  ' + '  '.join(f"{l:>12}" for l in labels) + '   (events, mean m/s)')
for i in range(len(rows[labels[0]])):
    m = rows[labels[0]][i][0]
    if m in ('46', '47', '48', '49', '50', '51', '52', '72', '73', '74', '75', '76', '77', '78'):
        cells = []
        for l in labels:
            r = rows[l][i] if i < len(rows[l]) else None
            cells.append(f"{r[1]:>4} {r[2] if r[2] is not None else 0:5.2f}" if r else ' ' * 10)
        print(f"{m:>6}  " + '  '.join(f"{c:>12}" for c in cells))
