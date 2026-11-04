import json, copy
root = '/home/deep/haeram/haeram-soccor-nv04'
ez = json.load(open(f'{root}/.tmp/nx04/candidates/earlyZones.json'))
def with_(base, hold=None, arrive=None):
    c = copy.deepcopy(base)
    cand = c.setdefault('shape', {}).setdefault('candidate', {})
    if hold: cand['hold'] = {'out': hold}
    if arrive: cand['arrive'] = arrive
    return c
A = {'from': 70, 'out': 14, 'narrow': 0.3}
cands = {
    'arrRel': with_({}, arrive=A),
    'arrHoldRel': with_({}, hold=14, arrive=A),
    'arrHoldRelB': with_({}, hold=12, arrive={'from': 70, 'out': 12, 'narrow': 0.5}),
    'arrEZ': with_(ez, arrive=A),
    'arrHoldEZ': with_(ez, hold=14, arrive=A),
    'arrHoldEZ60': with_(ez, hold=14, arrive={'from': 60, 'out': 14, 'narrow': 0.3}),
}
jobs = []
for name, c in cands.items():
    for d in ('.tmp/nx04/candidates', 'artifacts/benchmarks/scoring-261104-nx04/candidates'):
        json.dump(c, open(f'{root}/{d}/{name}.json', 'w'), separators=(',', ':'))
    jobs.append({'name': name, 'patch': f'.tmp/nx04/candidates/{name}.json',
                 'args': ['scripts/scoring-concentration.ts', '--matches', '1200', '--out', f'.tmp/nx04/runs/conc-{name}-calibration.json'],
                 'log': f'{root}/.tmp/nx04/runs/conc-{name}-calibration.log'})
json.dump({'done': f'{root}/.tmp/nx04/runs/screen2.done', 'jobs': jobs}, open(f'{root}/.tmp/nx04/screen2.json', 'w'), indent=1)
print('ok', list(cands))
