"""nx04 stage 2: validation concentration, stress case, shot origins and the MATCH-28 calibration
report for the named candidates.  python3 make2.py <tag> name...  (name 'released' = no patch)"""
import json, sys
root = '/home/deep/haeram/haeram-soccor-nv04'
tag, names = sys.argv[1], sys.argv[2:]
jobs = []
def job(name, kind, args):
    patch = None if name == 'released' else f'.tmp/nx04/candidates/{name}.json'
    jobs.append({'name': f'{kind}-{name}', 'patch': patch, 'args': args,
                 'log': f'{root}/.tmp/nx04/runs/{kind}-{name}.log'})
for n in names:
    job(n, 'concval', ['scripts/scoring-concentration.ts', '--matches', '1200', '--seeds',
                       't689-val-1,t689-val-2,t689-val-3,t689-val-4', '--out', f'.tmp/nx04/runs/conc-{n}-validation.json'])
    for k in (1, 2, 3):
        job(n, f'stress{k}', ['scripts/scoring-striker-stress.ts', '--seeds', f'cf04-stress-val-{k}', '--games', '38',
                              '--out', f'.tmp/nx04/runs/stress-{n}-val-{k}.json'])
    job(n, 'shots', ['scripts/scoring-shot-origins.ts', '--start', '600', '--matches', '240',
                     '--out', f'.tmp/nx04/runs/shot-origins-{n}-600-840.json'])
json.dump({'done': f'{root}/.tmp/nx04/runs/{tag}.done', 'jobs': jobs}, open(f'{root}/.tmp/nx04/{tag}.json', 'w'), indent=1)
print(len(jobs), 'jobs')
