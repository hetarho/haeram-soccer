"""Receivers standing offside when the ball is played to them (running play and restarts, one export).

  python3 -I offside.py LABEL=export.json.gz [...]

For every pass, cross or restart whose ball is next held by a player of the kicker's side, the
receiver's position at the kick against the second-last opponent (keeper included) and the ball.
Offside = in the opponent half, more than 1 m beyond both. Throw-ins, goal kicks and corners are
exempt in football and are skipped.
"""
import gzip, json, sys, bisect

EXEMPT = ('throw', 'goal kick', '스로인', '골킥', '코너')

def run(label, path):
    pb = json.load(gzip.open(path))['playback']
    total = off = far = 0
    cases = []
    for f in pb['frames']:
        t0 = f['startSeconds']
        motion = f['motion']
        mt = [m['elapsedSeconds'] for m in motion]
        hs = f['holders']
        for e in f['events']:
            if e.get('kind') not in ('pass', 'cross', 'restart') or 't' not in e:
                continue
            if any(w in (e.get('text') or '') for w in EXEMPT):
                continue
            # kick time: the last holder change to '' at or before the event's own time
            kick = max((h[0] for h in hs if h[1] == '' and h[0] <= e['t'] + 0.05), default=e['t'])
            nxt = next((h for h in hs if h[0] > kick and h[1]), None)
            if not nxt or not nxt[1].startswith(e['actor'].rsplit(':p:', 1)[0].rsplit(':', 1)[0] if False else ''):
                pass
            if not nxt:
                continue
            side = e['side']
            m = motion[max(0, min(len(motion) - 1, bisect.bisect_left(mt, t0 + kick)))]
            rec = next((p for p in m['players'][side] if p['id'] == nxt[1]), None)
            if rec is None or nxt[1] == e['actor']:
                continue
            keeper = next((p for p in m['players'][side] if p['state'] == 'keeper'), None)
            dirx = 1 if keeper is None or keeper['position'][0] < 52.5 else -1
            opp = sorted((p['position'][0] * dirx for p in m['players'][1 - side]), reverse=True)
            line = opp[1] if len(opp) > 1 else -999
            x = rec['position'][0] * dirx
            bx = m['ball'][0] * dirx
            half = 52.5 * dirx if dirx > 0 else -52.5
            total += 1
            if x > half and x > line + 1 and x > bx + 1:
                off += 1
                gap = x - line
                if gap > 5:
                    far += 1
                cases.append((f['label'], round(e['t'], 1), e['kind'], round(gap, 1)))
    cases.sort(key=lambda c: -c[3])
    print(f"{label:4} balls played to a teammate: {total}, receiver offside at the kick: {off} ({far} by more than 5 m); worst: {cases[:6]}")

for arg in sys.argv[1:]:
    label, p = arg.split('=', 1)
    run(label, p)
