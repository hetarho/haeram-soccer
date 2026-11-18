"""Pair five actual seasons from each shared opening to read the refill-only proposal."""
import hashlib
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
spec = spec_from_file_location("combined_world", Path(__file__).with_name("summarize.py"))
assert spec and spec.loader
summary = module_from_spec(spec)
spec.loader.exec_module(summary)


root = Path(sys.argv[1])
baseline = json.loads((root / "lived-1951.json").read_text())["runs"][:2]
paths = [root / f"diagnostic-1951-{seed}.json" for seed in range(2)]
diagnostic = [json.loads(path.read_text()) for path in paths]
candidate = [row["runs"][0] for row in diagnostic]
assert [r["seed"] for r in baseline] == [r["seed"] for r in candidate] == ["market-0", "market-1"]
for run in [*baseline, *candidate]:
    assert [s["year"] for s in run["seasons"]] == list(range(1951, 1956))
    assert run["luck"] == 0


def read(runs):
    seasons = [(run["seed"], season) for run in runs for season in run["seasons"]]
    return {
        "levels": summary.levels(seasons),
        "moves": summary.moves(seasons),
        "books": summary.era_summary([season for _, season in seasons]),
    }


print(json.dumps({
    "baseline": read(baseline),
    "refillSix": read(candidate),
    "candidateReceipts": [
        {"sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "meta": run["meta"]}
        for path, run in zip(paths, diagnostic)
    ],
}, indent=2))
