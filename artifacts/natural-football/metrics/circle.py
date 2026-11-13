"""Carriers who circle or come back after beating their man (running play, one export).

  python3 -I circle.py LABEL=export.json.gz [...]

For every spell on the ball of 2 s or more (frame `holders`, path from `ballTrack`):
  turn      total absolute heading change of the ball's path (degrees)
  circling  turn >= 270 with an opponent within 3 m at half or more of the spell's samples
  beat-back the nearest opponent goes from ahead of the carrier (in his attacking direction) to
            behind him, and afterwards in the same spell the carrier goes back 3 m+ toward his own goal
"""
import gzip, json, sys, math, bisect

def run(label, path):
    pb = json.load(gzip.open(path))['playback']
    spells = circling = beatback = 0
    turns = []
    for f in pb['frames']:
        t0 = f['startSeconds']
        bt, track = f['ballTimes'], f['ballTrack']
        motion = f['motion']
        mt = [m['elapsedSeconds'] for m in motion]
        dead = [(t0 + s['dead'], t0 + s['kick']) for s in f.get('stoppages') or []]
        hs = f['holders']
        for k, (start, who) in enumerate(hs):
            if not who:
                continue
            end = hs[k + 1][0] if k + 1 < len(hs) else 60
            a, b = t0 + start, t0 + end
            if b - a < 2 or any(x <= a <= y for x, y in dead):
                continue
            i, j = bisect.bisect_left(bt, a), bisect.bisect_right(bt, b)
            raw = [(p[0], p[1]) for p in track[i:j]]
            pts = raw[:1]
            for q in raw[1:]:  # keep points 1 m apart so dribble-touch jitter is not counted as turning
                if math.hypot(q[0] - pts[-1][0], q[1] - pts[-1][1]) >= 1:
                    pts.append(q)
            if len(pts) < 3:
                continue
            # side and attacking direction from the keepers at the spell's start
            m0 = motion[max(0, min(len(motion) - 1, bisect.bisect_left(mt, a)))]
            side = next((s for s in (0, 1) if any(p['id'] == who for p in m0['players'][s])), None)
            if side is None:
                continue
            keeper = next((p for p in m0['players'][side] if p['state'] == 'keeper'), None)
            dirx = 1 if keeper is None or keeper['position'][0] < 52.5 else -1
            spells += 1
            turn, heading = 0.0, None
            for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
                h = math.atan2(y2 - y1, x2 - x1)
                if heading is not None:
                    d = (h - heading + math.pi) % (2 * math.pi) - math.pi
                    turn += abs(d)
                heading = h
            turn = math.degrees(turn)
            turns.append(turn)
            # opponents at the motion samples inside the spell
            close = n = 0
            ahead_then_behind = False
            beaten_at = None
            back_after = 0.0
            for m in motion[bisect.bisect_left(mt, a):bisect.bisect_right(mt, b)]:
                me = next((p for p in m['players'][side] if p['id'] == who), None)
                if me is None:
                    continue
                opp = [p for p in m['players'][1 - side] if p['state'] != 'keeper']
                near = min(opp, key=lambda p: math.hypot(p['position'][0] - me['position'][0], p['position'][1] - me['position'][1]))
                dist = math.hypot(near['position'][0] - me['position'][0], near['position'][1] - me['position'][1])
                n += 1
                close += dist < 3
                rel = (near['position'][0] - me['position'][0]) * dirx
                if beaten_at is None and rel > 0.5 and dist < 4:
                    beaten_at = 'ahead'
                elif beaten_at == 'ahead' and rel < -0.5:
                    beaten_at = me['position'][0] * dirx
                elif isinstance(beaten_at, float):
                    back_after = max(back_after, beaten_at - me['position'][0] * dirx)
            if turn >= 270 and n and close * 2 >= n:
                circling += 1
            if back_after >= 3:
                beatback += 1
    turns.sort()
    p90 = turns[int(0.9 * len(turns))] if turns else 0
    print(f"{label:4} spells on the ball 2 s+: {spells}  circling under pressure: {circling}  beat-then-come-back: {beatback}  turn p90 {p90:.0f} deg")

for arg in sys.argv[1:]:
    label, p = arg.split('=', 1)
    run(label, p)
