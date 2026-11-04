"""nx04: markdown rows from scoring-concentration.ts files.  python3 table-conc.py label=FILE..."""
import json, sys
print('| candidate | goals / match | shots a team | hat-tricks / match | clubs 20+ | club top-scorer share [95%] | his shot share | his / the rest\'s conversion | ST slot: shots an app., shot share, goal share | FW line goal share | CM: shots an app., goal share |')
print('|---|---:|---:|---:|---:|---|---:|---|---|---:|---|')
for arg in sys.argv[1:]:
    label, path = arg.split('=', 1)
    d = json.load(open(path))
    pos = {p['pos']: p for p in d['positions']}
    t = d['topGoalShare']
    ci = t['ci']
    fw = sum(pos[k]['goalShare'] for k in ('ST', 'LW', 'RW') if k in pos)
    st, cm = pos['ST'], pos.get('CM')
    print(f"| {label} | {d['goalsPerMatch']:.3f} | {d['shotsPerTeam']:.2f} | {d['hatTricksPerMatch']:.3f} | {d['clubsWith20Goals']} | "
          f"{100*t['mean']:.1f}% [{100*ci[0]:.1f}, {100*ci[1]:.1f}] | {100*d['topShotShare']['mean']:.1f}% | "
          f"{100*d['topConversion']['mean']:.1f} / {100*d['restConversion']['mean']:.1f}% | "
          f"{st['shotsPerApp']:.2f}, {100*st['shotShare']:.1f}%, {100*st['goalShare']:.1f}% | {100*fw:.1f}% | "
          f"{cm['shotsPerApp']:.2f}, {100*cm['goalShare']:.1f}% |" if cm else '| - |')
