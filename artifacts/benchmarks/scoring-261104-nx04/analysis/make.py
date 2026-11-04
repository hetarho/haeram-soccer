import json, copy, sys
root = '/home/deep/haeram/haeram-soccor-nv04'
early = json.load(open(f'{root}/artifacts/benchmarks/scoring-261104/candidates/earlySupport.json'))
ez = copy.deepcopy(early)
del ez['box']['zones']  # released delivery zones (cf04: earlySupport's zones killed cross finishes)
def hold(base, out):
    c = copy.deepcopy(base)
    c.setdefault('shape', {}).setdefault('candidate', {})['hold'] = {'out': out}
    return c
cands = {
    'holdRel11': hold({}, 11),
    'holdRel14': hold({}, 14),
    'holdRel18': hold({}, 18),
    'earlyZones': ez,
    'holdEZ11': hold(ez, 11),
    'holdEZ14': hold(ez, 14),
}
jobs = []
for name, c in cands.items():
    for d in ('.tmp/nx04/candidates', 'artifacts/benchmarks/scoring-261104-nx04/candidates'):
        json.dump(c, open(f'{root}/{d}/{name}.json', 'w'), separators=(',', ':'))
    jobs.append({'name': name, 'patch': f'.tmp/nx04/candidates/{name}.json',
                 'args': ['scripts/scoring-concentration.ts', '--matches', '1200', '--out', f'.tmp/nx04/runs/conc-{name}-calibration.json'],
                 'log': f'{root}/.tmp/nx04/runs/conc-{name}-calibration.log'})
json.dump({'done': f'{root}/.tmp/nx04/runs/screen1.done', 'jobs': jobs}, open(f'{root}/.tmp/nx04/screen1.json', 'w'), indent=1)
print('ok', list(cands))
