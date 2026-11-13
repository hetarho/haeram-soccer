"""Passes to nobody and holding the ball under pressure (running play, one export).

  python3 -I press.py LABEL=export.json.gz [...]

pass to nobody   an open-play pass that is lost (not ok) where, when it is kicked, its end point has
                 no teammate within 6 m and its intended receiver is 10 m+ from it
held under press a spell on the ball where an opponent is within 2 m for 2 s or more of it
                 (consecutive motion samples), the carrier still not releasing; counted once a spell,
                 with the longest such stretch
"""
import gzip, json, sys, math, bisect

def at(motion, mt, t):
    i = bisect.bisect_left(mt, t)
    i = max(0, min(len(motion) - 1, i))
    return motion[i]

def run(label, path):
    pb = json.load(gzip.open(path))['playback']
    passes = lost = nobody = 0
    held = 0
    longest = []
    for f in pb['frames']:
        t0 = f['startSeconds']
        motion = f['motion']
        mt = [m['elapsedSeconds'] for m in motion]
        dead = [(t0 + s['dead'], t0 + s['kick']) for s in f.get('stoppages') or []]
        for e in f['events']:
            if e.get('kind') != 'pass' or 't' not in e:
                continue
            t = t0 + e['t']
            if any(a <= t <= b for a, b in dead):
                continue
            passes += 1
            if e.get('ok'):
                continue
            lost += 1
            m = at(motion, mt, t)
            side = e['side']
            mates = [p for p in m['players'][side] if p['id'] != e.get('actor')]
            tx, ty = e['to']
            near = min((math.hypot(p['position'][0] - tx, p['position'][1] - ty) for p in mates), default=99)
            rec = next((p for p in mates if p['id'] == e.get('receiver')), None)
            rd = math.hypot(rec['position'][0] - tx, rec['position'][1] - ty) if rec else 99
            if near > 6 and rd > 10:
                nobody += 1
        hs = f['holders']
        for k, (start, who) in enumerate(hs):
            if not who:
                continue
            end = hs[k + 1][0] if k + 1 < len(hs) else 60
            a, b = t0 + start, t0 + end
            if any(x <= a <= y for x, y in dead):
                continue
            run_s = best = 0.0
            prev_t = None
            prev_run = False
            for m in motion[bisect.bisect_left(mt, a):bisect.bisect_right(mt, b)]:
                side = next((s for s in (0, 1) if any(p['id'] == who for p in m['players'][s])), None)
                if side is None:
                    continue
                me = next(p for p in m['players'][side] if p['id'] == who)
                d = min(math.hypot(p['position'][0] - me['position'][0], p['position'][1] - me['position'][1])
                        for p in m['players'][1 - side] if p['state'] != 'keeper')
                t = m['elapsedSeconds']
                if d < 2:
                    run_s += (t - prev_t) if prev_t is not None and prev_run else 0
                    best = max(best, run_s)
                    prev_run = True
                else:
                    run_s = 0.0
                    prev_run = False
                prev_t = t
            if best >= 2:
                held += 1
                longest.append(best)
    longest.sort()
    print(f"{label:4} open-play passes {passes}, lost {lost}, lost to nobody {nobody} | spells held 2 s+ with an opponent within 2 m: {held} (5 s+: {sum(x >= 5 for x in longest)}, longest {max(longest, default=0):.0f} s)")

for arg in sys.argv[1:]:
    label, p = arg.split('=', 1)
    prev_run = False
    run(label, p)
