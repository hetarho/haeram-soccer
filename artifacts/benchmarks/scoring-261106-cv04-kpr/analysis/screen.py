"""T689 cv04-kpr: one line a candidate — open-play conversion by place from `scripts/scoring-shot-origins.ts`
(`originPlaceBetween` rows, as ../../scoring-261104-cv04-blk/analysis/between.py reads them), the band check's
goals, shots, goal-area share, possessions ending in a shot, rows inside and unopposed chances (the runner's
band log), and the chased-shot diagnostic's keeper-out classes and keeper claims.
python3 -I screen.py NAME[@DIR] ...   (DIR: the evidence directory the files sit in, default this window's)"""
import json, os, re, sys
from collections import defaultdict

ART = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/artifacts/benchmarks/'
LOGS = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/.tmp/cv04/logs/'


def origins(path):
    d = json.load(open(path))
    m = d['matches']
    acc = defaultdict(lambda: [0, 0, 0.0])
    for r in d['rows']:
        k = r['key'].split('|')
        if k[0] != 'originPlaceBetween':
            continue
        origin, place, split = k[1], k[2], k[3]
        if origin == 'penalty' or origin.startswith('restart-') or origin == 'setPiece-2nd':
            continue
        for key in ((place, 'all'), (place, split)):
            a = acc[key]
            a[0] += r['shots']
            a[1] += r['goals']
            a[2] += r['xg']
    out = {}
    for key, (n, g, x) in acc.items():
        out[key] = (n / m / 2, g / n if n else 0)
    return out


def bands(path):
    t = open(path).read()
    val = lambda pat: (re.search(pat, t) or [None, None])[1]
    return {
        'goals': val(r'goals \(match\)\s+\S+\s+([\d.]+)'),
        'shots': val(r'\nshots \(team\)\s+\S+\s+([\d.]+)'),
        'ga': val(r'shots from goal area %\s+\S+\s+([\d.]+)'),
        'poss': val(r'possessions ending in a shot %\s+\S+\s+([\d.]+)'),
        'rows': val(r'passed (\d+/\d+)'),
        'unopp': val(r'unopposed chances ([\d.]+) a team'),
        'uscored': val(r'scored ([\d.]+)%'),
    }


def chased(path):
    d = json.load(open(path))
    m = d['matches']
    out = {}
    for r in d['rows']:
        k = r['key']
        if k.startswith('all|') and k != 'all|any':
            out[k[4:]] = (r['n'] / m / 2, r['xg'] / r['n'])
        if k.startswith('keeper|'):
            out[k] = (r['passes'] / m / 2, r['keeperWon'] / m / 2, r['intoBox'] / m / 2)
    return out


for arg in sys.argv[1:]:
    name, _, where = arg.partition('@')
    base = ART + (where or 'scoring-261106-cv04-kpr') + '/'
    o = origins(base + f'origins/origins-{name}-0-300.json') if os.path.exists(base + f'origins/origins-{name}-0-300.json') else {}
    b = bands(LOGS + f'bands-{name}-400.log') if os.path.exists(LOGS + f'bands-{name}-400.log') else {}
    c = chased(base + f'chased/chased-{name}-0-300.json') if os.path.exists(base + f'chased/chased-{name}-0-300.json') else {}
    f = lambda k: '%.2f/%.1f%%' % (o[k][0], 100 * o[k][1]) if k in o else '-'
    g = lambda k: '%.2f@%.3f' % c[k] if k in c else '-'
    print(
        f"{name:10} box {f(('box','all'))} alone {f(('box','alone'))} GA {f(('goalArea','all'))} | "
        f"goals {b.get('goals')} shots {b.get('shots')} GA% {b.get('ga')} poss {b.get('poss')} rows {b.get('rows')} "
        f"unopp {b.get('unopp')} ({b.get('uscored')}%) | ch/out {g('chased|keeperOut')} fr/out {g('free|keeperOut')} "
        f"ch/set {g('chased|keeperSet')} fr/set {g('free|keeperSet')}"
        + (' | through %.2f won %.3f into box %.2f' % c['keeper|through'] if 'keeper|through' in c else '')
        + (' other won %.3f' % c['keeper|other'][1] if 'keeper|other' in c else '')
    )
