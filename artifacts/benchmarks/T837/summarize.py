"""Reproduce table medians and process-cluster bootstrap intervals from the raw paired runs.
The A/B call itself is retained verbatim from ab.mjs; this does not replace its estimator.
"""
import json
import random
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def interval(groups):
    values = [x for group in groups for x in group]
    rng = random.Random("T837-absolute-median-v1")
    boots = []
    for _ in range(10000):
        sample = [x for _ in groups for x in groups[rng.randrange(len(groups))]]
        boots.append(statistics.median(sample))
    boots.sort()
    return {"median": statistics.median(values), "ci95": [boots[249], boots[9749]], "samples": len(values)}

summary = {}
for path in sorted(ROOT.glob("*.json")):
    if not path.stem.startswith(("baseline-", "final-", "identity-")):
        continue
    data = json.loads(path.read_text())
    if "runs" not in data:
        continue
    labels = sorted({pair["label"] for run in data["runs"] for pair in run["pairs"]})
    entries = {}
    for label in labels:
        entries[label] = {
            side: {clock: interval([[pair[side][clock] for pair in run["pairs"] if pair["label"] == label]
                                   for run in data["runs"] if any(pair["label"] == label for pair in run["pairs"])])
                   for clock in ["cpu", "wall"]}
            for side in ["a", "b"]
        }
        entries[label]["pairedVerdict"] = data.get(label)
    summary[path.stem] = {"sameHash": data["sameHash"], "hashes": data["hashes"],
                          "procs": data["procs"], "reps": data["reps"],
                          "warm": data.get("warm"), "load1": data["load1"], "entries": entries}
(ROOT / "summary.json").write_text(json.dumps({"method": "10000 percentile process-cluster bootstrap resamples of the absolute median; all raw pairs, without MIN_MS censoring", "measurements": summary}, indent=2) + "\n")
for name, measurement in summary.items():
    if name.startswith("final-") and "corpus" not in name:
        print(name, json.dumps(measurement["entries"]))
