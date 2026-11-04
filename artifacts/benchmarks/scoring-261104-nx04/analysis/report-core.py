"""nx04: MATCH-23 core rows of grid-bands.ts --report files side by side.
python3 report-core.py label=FILE..."""
import json, sys
files = [a.split('=', 1) for a in sys.argv[1:]]
data = []
for label, path in files:
    d = json.load(open(path))
    core = next(c for c in d['conditions'] if c['family'] == 'core')
    data.append((label, core, d))
ids = [t['id'] for t in data[0][1]['targets']]
print('| row (band) | ' + ' | '.join(l for l, _, _ in data) + ' |')
print('|---|' + '---|' * len(data))
for i in ids:
    cells = []
    band = None
    for _, core, _ in data:
        t = next((t for t in core['targets'] if t['id'] == i), None)
        if not t:
            cells.append('-')
            continue
        band = t['band']
        v = t['value']
        vs = f'{v:.3f}' if isinstance(v, (int, float)) else str(v)
        cells.append(f"{vs} {t['status']}")
    print(f'| {i} ({band}) | ' + ' | '.join(cells) + ' |')
for label, core, d in data:
    st = {}
    for t in core['targets']:
        st[t['status']] = st.get(t['status'], 0) + 1
    inv = core.get('invariants')
    conc = core.get('concentration')
    print(f"\n{label}: core matches {core['matches']}, goals {core['goals']}, statuses {st}, invariants {json.dumps(inv)[:200]}, concentration {json.dumps(conc)[:300]}")
