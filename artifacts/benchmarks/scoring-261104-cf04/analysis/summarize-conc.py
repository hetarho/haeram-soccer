"""T689 cf04: one line per concentration file (scripts/scoring-concentration.ts output).

python3 .tmp/cf04/summarize-conc.py FILE...
"""
import json
import sys

print("name  goals/m shots/team hat/m clubs topShare[ci] topShot topConv restConv ST(shotsPerApp,shotShare,goalShare) LW RW AM CM")
for path in sys.argv[1:]:
    d = json.load(open(path))
    pos = {p["pos"]: p for p in d["positions"]}
    f = lambda k: f"{pos[k]['shotsPerApp']:.2f}/{pos[k]['goalShare']:.3f}/{pos[k]['conversion']:.3f}" if k in pos else "-"
    t = d["topGoalShare"]
    name = path.rsplit("/", 1)[-1].replace("conc-", "").replace(".json", "")
    print(
        f"{name:26s} {d['goalsPerMatch']:.3f} {d['shotsPerTeam']:.2f} {d['hatTricksPerMatch']:.4f} {d['clubsWith20Goals']:3d} "
        f"{t['mean']:.4f} {t['ci']} {d['topShotShare']['mean']:.3f} {d['topConversion']['mean']:.3f} {d['restConversion']['mean']:.3f} "
        f"ST {pos['ST']['shotsPerApp']:.2f},{pos['ST']['shotShare']:.3f},{pos['ST']['goalShare']:.3f} LW {f('LW')} RW {f('RW')} AM {f('AM')} CM {f('CM')}"
    )
