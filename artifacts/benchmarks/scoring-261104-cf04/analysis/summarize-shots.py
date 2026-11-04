"""T689 cf04: merge shots-<name>-*.json part files and print shares by slot, origin and place.

python3 .tmp/cf04/summarize-shots.py <prefix> [out.json]
"""
import glob
import json
import sys

prefix = sys.argv[1]
cells = {}
matches = 0
for path in sorted(glob.glob(f"{prefix}-*.json")):
    if path.endswith("-merged.json"):
        continue
    d = json.load(open(path))
    matches += d["matches"]
    for r in d["rows"]:
        a = cells.setdefault(r["key"], {"shots": 0, "goals": 0, "xg": 0.0})
        a["shots"] += r["shots"]
        a["goals"] += r["goals"]
        a["xg"] += r["xg"]

total = sum(v["shots"] for k, v in cells.items() if k.startswith("pos|"))
goals = sum(v["goals"] for k, v in cells.items() if k.startswith("pos|"))
print(f"matches {matches}  shots/team {total / (2 * matches):.2f}  goals/match {goals / matches:.3f}")


def table(kind, keyfn=lambda k: k):
    rows = [(k.split("|", 1)[1], v) for k, v in cells.items() if k.startswith(kind + "|")]
    rows.sort(key=lambda kv: -kv[1]["shots"])
    print(f"\n{kind}: key  shots/team  shotShare  goalShare  conv  xG/shot")
    for k, v in rows:
        if v["shots"] < 0.002 * total:
            continue
        print(
            f"  {k:34s} {v['shots'] / (2 * matches):6.2f} {v['shots'] / total:7.3f} "
            f"{v['goals'] / max(1, goals):7.3f} {v['goals'] / v['shots']:6.3f} {v['xg'] / v['shots']:6.3f}"
        )


for kind in ["pos", "origin", "place", "posPlace", "posOrigin", "originPlace", "posOriginPlace"]:
    table(kind)
if len(sys.argv) > 2:
    json.dump({"matches": matches, "cells": cells}, open(sys.argv[2], "w"), indent=0)
