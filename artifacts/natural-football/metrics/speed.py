"""Player speeds on the match clock (what the viewer and the game show at a given playback rate).

  python3 -I speed.py LABEL=export.json.gz [...]
Positions come from the motion samples (about one a second); speeds are sample-to-sample.
"""
import gzip, json, sys, math, collections

def run(label, path):
    pb = json.load(gzip.open(path))['playback']
    dist = collections.Counter()      # metres per outfield player
    secs = collections.Counter()      # seconds on the pitch per outfield player
    hsr = collections.Counter()       # metres at 5.5 m/s and above
    spr = collections.Counter()       # metres at 7 m/s and above
    speeds = []
    top = collections.Counter()
    gaps = []
    fast_by_minute = collections.Counter()
    for f in pb['frames']:
        prev = None
        dead = [(f['startSeconds'] + st['dead'], f['startSeconds'] + st['kick']) for st in f.get('stoppages') or []]
        for m in f['motion']:
            if any(a - 1.5 <= m['elapsedSeconds'] <= b + 1.5 for a, b in dead):
                prev = None
                continue
            cur = {p['id']: (p['position'], p['state']) for side in m['players'] for p in side}
            if prev is not None:
                dt = m['elapsedSeconds'] - prev[0]
                if 0.2 <= dt <= 3:
                    gaps.append(dt)
                    for pid, (pos, st) in cur.items():
                        if st == 'keeper' or pid not in prev[1]:
                            continue
                        q = prev[1][pid][0]
                        d = math.hypot(pos[0] - q[0], pos[1] - q[1])
                        v = d / dt
                        dist[pid] += d; secs[pid] += dt
                        speeds.append(v)
                        if v >= 5.5: hsr[pid] += d
                        if v >= 7: spr[pid] += d
                        top[pid] = max(top[pid], v)
                        if v > 10: fast_by_minute[f['label']] += 1
            prev = (m['elapsedSeconds'], cur)
    full = [p for p in secs if secs[p] >= 80 * 60]
    per90 = lambda c, p: c[p] * 5400 / secs[p]
    km = sorted(per90(dist, p) / 1000 for p in full)
    h = sorted(per90(hsr, p) for p in full)
    s = sorted(per90(spr, p) for p in full)
    speeds.sort()
    q = lambda xs, f: xs[int(f * (len(xs) - 1))]
    tops = sorted(top[p] for p in full)
    print(f"{label:4} sample gap median {q(sorted(gaps), .5):.2f}s | outfield players 80+ min: {len(full)}")
    print(f"     distance per 90: median {q(km, .5):.1f} km (range {km[0]:.1f}-{km[-1]:.1f})  | speed m/s p50 {q(speeds,.5):.2f} p75 {q(speeds,.75):.2f} p90 {q(speeds,.9):.2f} p99 {q(speeds,.99):.2f}")
    over10 = sum(1 for v in speeds if v > 10)
    print(f"     player-seconds above 10 m/s (faster than any real player): {over10} of {len(speeds)} ({100*over10/len(speeds):.2f}%), in {len(fast_by_minute)} minutes; worst minutes: {fast_by_minute.most_common(6)}")
    print(f"     high-speed (>=5.5 m/s) per 90: median {q(h,.5):.0f} m | sprint (>=7 m/s) per 90: median {q(s,.5):.0f} m | top speed median {q(tops,.5):.1f} m/s, max {tops[-1]:.1f}")

    run.fast = fast_by_minute

for arg in sys.argv[1:]:
    label, p = arg.split('=', 1)
    run(label, p)
