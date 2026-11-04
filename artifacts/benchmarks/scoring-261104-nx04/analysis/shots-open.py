"""nx04: open-play rows of cf04 §3 from scoring-shot-origins.ts files (penalties and direct
restarts left out, their second phases kept).  python3 shots-open.py name=FILE..."""
import json, sys
for arg in sys.argv[1:]:
    name, path = arg.split('=', 1)
    d = json.load(open(path))
    m = d['matches']
    src = d['rows'] if 'rows' in d else [dict(key=k, **v) for k, v in d['cells'].items()]
    cells = [r for r in src if r['key'].startswith('posOriginPlace|')]
    rows = []
    for r in cells:
        _, pos, origin, place = r['key'].split('|')
        if origin == 'penalty' or origin.startswith('restart-'):
            continue
        rows.append((pos, origin, place, r['shots'], r['goals'], r['xg']))
    S = sum(r[3] for r in rows); G = sum(r[4] for r in rows)
    def agg(f):
        s = sum(r[3] for r in rows if f(r)); g = sum(r[4] for r in rows if f(r)); x = sum(r[5] for r in rows if f(r))
        return s, g, x
    out = [f'{name}: {m} matches, open-play shots/team {S/(2*m):.2f}, goals/team {G/(2*m):.3f}']
    for pl in ('goalArea', 'box', 'outside'):
        s, g, _ = agg(lambda r: r[2] == pl)
        st, _, _ = agg(lambda r: r[2] == pl and r[0] == 'ST')
        out.append(f'  {pl}: share {s/S:.3f} conv {g/max(1,s):.3f} goalShare {g/max(1,G):.3f} ST shotShare {st/max(1,s):.3f}')
    s, g, _ = agg(lambda r: r[0] == 'ST')
    sg, gg, _ = agg(lambda r: r[0] == 'ST' and r[2] == 'goalArea')
    out.append(f'  ST open-play goal share {g/max(1,G):.3f}; ST goal-area goals of all {gg/max(1,G):.3f}, of his own {gg/max(1,g):.3f}')
    s, g, x = agg(lambda r: r[1] == 'pass-cross')
    out.append(f'  cross finishes shots/team {s/(2*m):.2f} xG/shot {x/max(1,s):.3f} conv {g/max(1,s):.3f}')
    s, g, _ = agg(lambda r: r[1] == 'opp-pass:intercepted')
    st, _, _ = agg(lambda r: r[1] == 'opp-pass:intercepted' and r[0] == 'ST')
    out.append(f'  after interception shots/team {s/(2*m):.2f} conv {g/max(1,s):.3f} goalShare {g/max(1,G):.3f} ST {st/max(1,s):.3f}')
    print('\n'.join(out))
