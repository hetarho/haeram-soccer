"""T689 cf04: merge stress-<variant>-val-*.json per variant; per-arm means with seed-cluster 95% intervals.

python3 .tmp/cf04/summarize-stress.py <runs dir> <variant>... [--out FILE]
"""
import glob
import json
import math
import sys

args = sys.argv[1:]
out = None
if "--out" in args:
    i = args.index("--out")
    out = args[i + 1]
    args = args[:i] + args[i + 2 :]
runs, variants = args[0], args[1:]


def interval(xs):
    m = sum(xs) / len(xs)
    if len(xs) < 2:
        return [round(m, 4), None]
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (len(xs) - 1))
    h = 1.96 * sd / math.sqrt(len(xs))
    return [round(m, 4), [round(m - h, 4), round(m + h, 4)]]


report = {}
for v in variants:
    rows = []
    for p in sorted(glob.glob(f"{runs}/stress-{v}-val-*.json")):
        rows += json.load(open(p))["rows"]
    rep = {}
    for arm in ["normal", "stress"]:
        r = [x for x in rows if x["arm"] == arm]
        n = sum(x["games"] for x in r)
        goals = sum(x["goals"] for x in r)
        seeds = sorted({x["seed"] for x in r})
        per_seed = lambda f: [f([x for x in r if x["seed"] == s]) for s in seeds]
        a = {
            "teamSeasons": len(r),
            "matches": n,
            "seeds": seeds,
            "goalsPerMatch": round(sum(x["goals"] + x["conceded"] for x in r) / n, 3),
            "ownGoalsPerMatch": round(goals / n, 3),
            "ownShotsPerMatch": round(sum(x["shots"] for x in r) / n, 2),
            "topShare": interval(per_seed(lambda q: sum(x["topShare"] for x in q) / len(q))),
            "topGoalsPer38": interval(per_seed(lambda q: sum(38 * x["topGoals"] / x["games"] for x in q) / len(q))),
            "largestTopGoalsPer38": round(max(38 * x["topGoals"] / x["games"] for x in r), 1),
            "hatTricksPerOwnMatch": round(sum(x["hatTricks"] for x in r) / n, 4),
            "goalsByLine": {l: round(sum(x["goalsByLine"][l] for x in r) / max(1, goals), 4) for l in ["FW", "MF", "DF"]},
            "invalid": sum(x["invalid"] for x in r),
        }
        if arm == "stress":
            a["starGoalsPer38"] = interval(per_seed(lambda q: sum(38 * x["starGoals"] / x["games"] for x in q) / len(q)))
            a["starShotsPerMatch"] = round(sum(x["starShots"] for x in r) / n, 2)
        rep[arm] = a
    report[v] = rep
    for arm in ["normal", "stress"]:
        a = rep[arm]
        print(
            f"{v:14s} {arm:6s} n={a['matches']:4d} goals/m {a['goalsPerMatch']:.2f} own {a['ownGoalsPerMatch']:.2f} "
            f"shots {a['ownShotsPerMatch']:.1f} top {a['topShare'][0]:.3f} {a['topShare'][1]} top/38 {a['topGoalsPer38'][0]:.1f} "
            f"max {a['largestTopGoalsPer38']} hat {a['hatTricksPerOwnMatch']:.3f} FW {a['goalsByLine']['FW']:.2f} "
            + (f"star/38 {a['starGoalsPer38'][0]:.1f} {a['starGoalsPer38'][1]} starShots {a['starShotsPerMatch']}" if arm == "stress" else "")
            + f" invalid {a['invalid']}"
        )
if out:
    json.dump(report, open(out, "w"), indent=1)
