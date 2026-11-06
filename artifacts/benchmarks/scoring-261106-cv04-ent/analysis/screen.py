"""T689 cv04-ent: one line a candidate — the box-entry diagnostic (`scripts/scoring-box-entries.ts`: box entries,
entering possessions and entries an entering possession a team a match, shot / goal following an entry, entries by
kind), the band check's goals, shots, shot places, possessions ending in a shot, offsides, set-piece goal share and
rows inside (the runner's band log), and the shot-origin diagnostic's open-play conversion in the box beyond the goal
area (as cv04-kpr's `analysis/screen.py` reads it).
python3 -I screen.py NAME[@DIR] ...   (DIR: the evidence directory the files sit in, default this window's;
NAME may be BANDNAME=FILENAME when the band log and the diagnostics carry different names)"""
import json, os, re, sys
from collections import defaultdict

ART = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/artifacts/benchmarks/'
LOGS = '/Users/ihaelam/project/haeram-soccer/.tmp/cv04/.tmp/cv04/logs/'


def origins(path):
    d = json.load(open(path))
    m = d['matches']
    acc = defaultdict(lambda: [0, 0])
    for r in d['rows']:
        k = r['key'].split('|')
        if k[0] != 'originPlaceBetween':
            continue
        origin, place = k[1], k[2]
        if origin == 'penalty' or origin.startswith('restart-') or origin == 'setPiece-2nd':
            continue
        acc[place][0] += r['shots']
        acc[place][1] += r['goals']
    return {p: (n / m / 2, g / n if n else 0) for p, (n, g) in acc.items()}


def entries(paths):
    rows, m, poss = defaultdict(lambda: [0, 0, 0]), 0, 0
    for p in paths:
        d = json.load(open(p))
        m += d['matches']
        poss += d['possessionsWithEntry']
        for r in d['rows']:
            a = rows[r['key']]
            a[0] += r['n']
            a[1] += r['shot']
            a[2] += r['goal']
    tm = 2 * m
    allr = rows['all']
    how = {k[4:]: v[0] / tm for k, v in rows.items() if k.startswith('how|')}
    return {
        'n': allr[0] / tm,
        'poss': poss / tm,
        'per': allr[0] / poss if poss else 0,
        'shot': allr[1] / allr[0] if allr[0] else 0,
        'goal': allr[2] / allr[0] if allr[0] else 0,
        'how': how,
        'm': m,
    }


def bands(path):
    t = open(path).read()
    val = lambda pat: (re.search(pat, t) or [None, None])[1]
    return {
        'goals': val(r'goals \(match\)\s+\S+\s+([\d.]+)'),
        'shots': val(r'\nshots \(team\)\s+\S+\s+([\d.]+)'),
        'ga': val(r'shots from goal area %\s+\S+\s+([\d.]+)'),
        'box': val(r'shots from rest of box %\s+\S+\s+([\d.]+)'),
        'out': val(r'shots from outside %\s+\S+\s+([\d.]+)'),
        'poss': val(r'possessions ending in a shot %\s+\S+\s+([\d.]+)'),
        'npos': val(r'possessions \(team\)\s+\S+\s+([\d.]+)'),
        'off': val(r'offsides \(team\)\s+\S+\s+([\d.]+)'),
        'sp': val(r'set-piece goals \(no pens\) %\s+\S+\s+([\d.]+)'),
        'rows': val(r'passed (\d+/\d+)'),
    }


for arg in sys.argv[1:]:
    spec, _, where = arg.partition('@')
    band, _, name = spec.partition('=')
    name = name or band
    base = ART + (where or 'scoring-261106-cv04-ent') + '/'
    op = base + f'origins/origins-{name}-0-300.json'
    o = origins(op) if os.path.exists(op) else {}
    ed = ART + 'scoring-261106-cv04-ent/entries/'
    ef = [ed + f for f in sorted(os.listdir(ed)) if f.startswith(f'entries-{band}-') and f.endswith('.json')] if os.path.isdir(ed) else []
    e = entries(ef) if ef else None
    bl = LOGS + f'bands-{band}-400.log'
    b = bands(bl) if os.path.exists(bl) else {}
    box = '%.2f/%.1f%%' % (o['box'][0], 100 * o['box'][1]) if 'box' in o else '-'
    ga = '%.2f/%.1f%%' % (o['goalArea'][0], 100 * o['goalArea'][1]) if 'goalArea' in o else '-'
    ent = (
        f"ent {e['n']:.2f} poss {e['poss']:.2f} per {e['per']:.2f} shot {100*e['shot']:.1f}% goal {100*e['goal']:.1f}% "
        f"carry {e['how'].get('carry', 0):.2f} short {e['how'].get('pass-short', 0):.2f} "
        f"behind {e['how'].get('pass-through', 0):.2f} ({e['m']})"
        if e else 'ent -'
    )
    print(
        f"{spec:10} {ent} | goals {b.get('goals')} shots {b.get('shots')} out/box/GA% {b.get('out')}/{b.get('box')}/{b.get('ga')} "
        f"poss {b.get('npos')} shot% {b.get('poss')} off {b.get('off')} sp% {b.get('sp')} rows {b.get('rows')} | "
        f"open-play box {box} GA {ga}"
    )
