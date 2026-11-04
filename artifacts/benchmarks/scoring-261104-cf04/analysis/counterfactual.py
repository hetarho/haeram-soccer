"""T689 cf04: split the striker slot's goal share into shot allocation and chance structure.

Keeps each slot's shots by place (goal area / rest of box / outside) as measured, and recomputes
its goal share under (a) the measured conversion per slot and place, (b) one conversion per place
for every slot (allocation only), (c) real-football place mix (MATCH-23: goal area 7.5%, box 53%,
outside 37%, rescaling each slot's shots within a place) with one conversion per place
(goal area 0.30, box 0.11, outside 0.03; penalties left out throughout).

python3 .tmp/cf04/counterfactual.py <merged.json>
"""
import json
import sys

d = json.load(open(sys.argv[1]))
cells = d["cells"]
slots = {}
for key, v in cells.items():
    parts = key.split("|")
    if parts[0] != "posOriginPlace" or parts[2] == "penalty" or parts[2].startswith("restart"):
        continue
    pos, place = parts[1], parts[3]
    a = slots.setdefault(pos, {}).setdefault(place, {"shots": 0, "goals": 0})
    a["shots"] += v["shots"]
    a["goals"] += v["goals"]

places = ["goalArea", "box", "outside"]
tot = {p: sum(slots[s].get(p, {"shots": 0})["shots"] for s in slots) for p in places}
gl = {p: sum(slots[s].get(p, {"goals": 0})["goals"] for s in slots) for p in places}
conv = {p: gl[p] / max(1, tot[p]) for p in places}
real_mix = {"goalArea": 0.075, "box": 0.53, "outside": 0.37}
real_conv = {"goalArea": 0.30, "box": 0.11, "outside": 0.03}
all_shots = sum(tot.values())
print("open play, penalties and direct restarts excluded")
print("place mix measured:", {p: round(tot[p] / all_shots, 3) for p in places}, "conv:", {p: round(conv[p], 3) for p in places})


def share(fn):
    g = {s: sum(fn(s, p) for p in places) for s in slots}
    t = sum(g.values())
    return {s: g[s] / t for s in g}


measured = share(lambda s, p: slots[s].get(p, {"goals": 0})["goals"])
alloc = share(lambda s, p: slots[s].get(p, {"shots": 0})["shots"] * conv[p])
real = share(
    lambda s, p: slots[s].get(p, {"shots": 0})["shots"] / max(1, tot[p]) * real_mix[p] * real_conv[p]
)
g_all = sum(gl.values())
st = slots.get("ST", {})
print(
    "open play: shots/team",
    round(all_shots / (2 * d["matches"]), 2),
    "goals/team",
    round(g_all / (2 * d["matches"]), 3),
    "goal-area share of goals",
    round(gl["goalArea"] / g_all, 3),
    "ST share of shots by place",
    {p: round(st.get(p, {"shots": 0})["shots"] / max(1, tot[p]), 3) for p in places},
    "ST goal-area goals / open-play goals",
    round(st.get("goalArea", {"goals": 0})["goals"] / g_all, 3),
    "ST goal-area goals / ST goals",
    round(st.get("goalArea", {"goals": 0})["goals"] / max(1, sum(v["goals"] for v in st.values())), 3),
)
for s in sorted(slots, key=lambda s: -measured[s])[:6]:
    print(f"{s:4s} measured {measured[s]:.3f}  same conversion per place {alloc[s]:.3f}  real place mix+conversion {real[s]:.3f}")
