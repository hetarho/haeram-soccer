"""Verify and list the exact eight snapshots named by the completed builders."""
import hashlib
import json
from pathlib import Path
import sys

root = Path(sys.argv[1])
for seed in range(4):
    build = json.loads((root / f"build-{seed}.json").read_text())
    assert build["seed"] == f"market-{seed}"
    assert [row["year"] for row in build["snapshots"]] == [1951, 1995]
    for row in build["snapshots"]:
        path = Path(row["path"])
        assert path.parent == root / "snapshots"
        expected = path.with_suffix("").with_suffix(".sha256").read_text().strip()
        assert hashlib.sha256(path.read_bytes()).hexdigest() == expected, path
        print(f"{expected}  {path}")
