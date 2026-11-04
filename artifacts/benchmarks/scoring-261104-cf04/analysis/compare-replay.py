"""T689 cf04: check that the committed scripts on the restored source replay the retained results."""
import json

runs = "/home/deep/haeram/haeram-soccor-nv04/.tmp/cf04/runs"
a = json.load(open(f"{runs}/stress-released-val-1.json"))["rows"]
b = json.load(open(f"{runs}/replay-stress-released-val-1.json"))["rows"]
print("stress rows equal:", a == b, len(a), len(b))
x = {r["key"]: r for r in json.load(open(f"{runs}/shots2-released-0.json"))["rows"]}
y = {r["key"]: r for r in json.load(open(f"{runs}/replay-shots2-released-0.json"))["rows"]}
print("shot-origin rows equal:", x == y, len(x), len(y))
