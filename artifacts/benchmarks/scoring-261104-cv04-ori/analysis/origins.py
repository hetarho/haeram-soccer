"""T689 cv04-ori: the striker slot's goals by origin and place, from `scripts/scoring-shot-origins.ts`
files (chunks of one variant merged). python3 origins.py name=FILE[,FILE...] ...

Prints, for every origin (and place), its share of all goals, its conversion and the ST slot's share
of its shots and goals, then how much of the ST slot's goals each origin carries. Penalties and
direct restarts are kept (they are goals) but their place rows are not shot places (see the script)."""
import json, sys
from collections import defaultdict

for arg in sys.argv[1:]:
    name, paths = arg.split('=', 1)
    m = 0
    acc = defaultdict(lambda: [0, 0, 0.0])
    for path in paths.split(','):
        d = json.load(open(path))
        m += d['matches']
        for r in d['rows']:
            a = acc[r['key']]
            a[0] += r['shots']; a[1] += r['goals']; a[2] += r['xg']
    rows = []
    for k, (s, g, x) in acc.items():
        if not k.startswith('posOriginPlace|'):
            continue
        _, pos, origin, place = k.split('|')
        rows.append((pos, origin, place, s, g, x))
    S = sum(r[3] for r in rows); G = sum(r[4] for r in rows)
    STg = sum(r[4] for r in rows if r[0] == 'ST'); STs = sum(r[3] for r in rows if r[0] == 'ST')
    print(f'{name}: {m} matches, shots/team {S/(2*m):.2f}, goals/match {G/m:.2f}; ST slot {STs/S:.3f} of shots, {STg/G:.3f} of goals')
    def group(keyf, label):
        by = defaultdict(lambda: [0, 0, 0.0, 0, 0])
        for pos, origin, place, s, g, x in rows:
            b = by[keyf(pos, origin, place)]
            b[0] += s; b[1] += g; b[2] += x
            if pos == 'ST':
                b[3] += s; b[4] += g
        print(f'  by {label}: key | shots/team | goal share | conv | xG/shot | ST shot share | ST goal share | of ST goals')
        for k, (s, g, x, ss, sg) in sorted(by.items(), key=lambda kv: -kv[1][1]):
            if g < max(2, 0.01 * G) and s < 0.02 * S:
                continue
            print(f'    {k:28s} {s/(2*m):5.2f} {g/G:6.3f} {g/max(1,s):6.3f} {x/max(1,s):6.3f} {ss/max(1,s):6.3f} {sg/max(1,g):6.3f} {sg/max(1,STg):6.3f}')
    group(lambda p, o, pl: o, 'origin')
    group(lambda p, o, pl: pl, 'place')
    # Open play: penalties and direct restarts out (their place rows are not shot places).
    allrows = rows
    rows = [r for r in allrows if r[1] != 'penalty' and not r[1].startswith('restart-')]
    S, G = sum(r[3] for r in rows), sum(r[4] for r in rows)
    STg = sum(r[4] for r in rows if r[0] == 'ST')
    print(f'  open play: shots/team {S/(2*m):.2f}, goals/match {G/m:.2f}, ST {STg/G:.3f} of its goals')
    group(lambda p, o, pl: pl, 'open-play place')
    rows = allrows
    S, G = sum(r[3] for r in rows), sum(r[4] for r in rows)
    STg = sum(r[4] for r in rows if r[0] == 'ST')
    group(lambda p, o, pl: f'{o}@{pl}', 'origin@place')
    pos = defaultdict(lambda: [0, 0])
    for p, o, pl, s, g, x in rows:
        pos[p][0] += s; pos[p][1] += g
    print('  by slot position: ' + ', '.join(f'{p} {v[0]/S:.3f}/{v[1]/G:.3f}' for p, v in sorted(pos.items(), key=lambda kv: -kv[1][1])))
