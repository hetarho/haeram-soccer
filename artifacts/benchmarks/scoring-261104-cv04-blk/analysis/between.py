"""T689 cv04-blk: open-play conversion by place and by whether a defender stood between (MATCH-35 r52),
from `scripts/scoring-shot-origins.ts` files' `originPlaceBetween` rows. python3 between.py name=FILE[,FILE...] ...

Open play leaves out penalties, direct restarts and a set piece's second phase, as origins.py does."""
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
            if not r['key'].startswith('originPlaceBetween|'):
                continue
            _, origin, place, b = r['key'].split('|')
            if origin == 'penalty' or origin.startswith('restart-') or origin == 'setPiece-2nd':
                continue
            for k in ((place, b), (place, 'all')):
                a = acc[k]
                a[0] += r['shots']; a[1] += r['goals']; a[2] += r['xg']
    sit = defaultdict(lambda: [0, 0, 0.0])
    for path in paths.split(','):
        for r in json.load(open(path))['rows']:
            if not r['key'].startswith('originPlaceSituation|'):
                continue
            _, origin, place, b, keeper, chased = r['key'].split('|')
            if origin == 'penalty' or origin.startswith('restart-') or origin == 'setPiece-2nd':
                continue
            a = sit[(place, b, keeper, chased)]
            a[0] += r['shots']; a[1] += r['goals']; a[2] += r['xg']
    print(f'{name}: {m} matches, open play')
    print('  place      split    shots/team  goals/match  conv   xG/shot')
    for place in ('goalArea', 'box', 'outside'):
        for b in ('all', 'alone', 'between'):
            s, g, x = acc[(place, b)]
            if s == 0:
                continue
            print(f'  {place:<10} {b:<8} {s/(2*m):10.2f} {g/m:12.3f} {g/s:6.3f} {x/s:8.3f}')
    if sit:
        print('  by keeper (out = more than 3 m off his line) and chaser (an outfielder within 4.6 m):')
        for k in sorted(sit):
            s, g, x = sit[k]
            print(f'  {"/".join(k):<36} {s/(2*m):6.2f} {g/m:8.3f} {g/s:6.3f} {x/s:8.3f}')
