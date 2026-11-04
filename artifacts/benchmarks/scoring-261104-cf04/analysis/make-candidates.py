"""T689 cf04: derive candidate patches from nv04's retained JSON (artifacts/.../candidates)."""
import copy
import json
import sys

src, out = sys.argv[1], sys.argv[2]
early = json.load(open(f"{src}/earlySupport.json"))
occupy = json.load(open(f"{src}/occupy.json"))


def with_rotate(p):
    p = copy.deepcopy(p)
    p.setdefault("box", {})["rotate"] = True
    return p


def outside(p):
    # Same in-box shot weight as earlySupport's 0.1 x (xG/0.12)^0.35, but the released
    # shotScale 0.28 outside the box: ref = 0.12 x (0.28/0.1)^(1/0.35) = 2.27.
    p = copy.deepcopy(p)
    r4 = p["decide"]["candidate"]["revision4"]
    r4["shotScale"] = 0.28
    r4["shotQuality"] = {"ref": 2.27, "power": 0.35}
    return p


cands = {
    "rotEarly": with_rotate(early),
    "rotOccupy": with_rotate(occupy),
    "rotOutside": outside(with_rotate(occupy)),
    "occupyOutside": outside(occupy),
}
for name, p in cands.items():
    with open(f"{out}/{name}.json", "w") as f:
        json.dump(p, f, separators=(",", ":"))
        f.write("\n")
    print(name, json.dumps(p, separators=(",", ":")))
