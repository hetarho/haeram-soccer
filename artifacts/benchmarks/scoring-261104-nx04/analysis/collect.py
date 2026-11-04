"""nx04: copy evidence from .tmp/nx04 into artifacts/benchmarks/scoring-261104-nx04."""
import glob, os, shutil
root = '/home/deep/haeram/haeram-soccor-nv04'
dst = f'{root}/artifacts/benchmarks/scoring-261104-nx04'
os.makedirs(f'{dst}/analysis', exist_ok=True)
for f in ('nx04-source.patch', 'shots-open.py', 'table-conc.py', 'make.py', 'make2.py', 'make3.py', 'collect.py'):
    shutil.copy(f'{root}/.tmp/nx04/{f}', f'{dst}/analysis/{f}')
n = 0
for pat in ('conc-*.json', 'stress-*.json', 'shot-origins-*.json'):
    for p in glob.glob(f'{root}/.tmp/nx04/runs/{pat}'):
        shutil.copy(p, f'{dst}/{os.path.basename(p)}')
        n += 1
size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(dst) for f in fs)
print(n, 'result files;', round(size / 1e6, 2), 'MB')
