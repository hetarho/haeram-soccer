#!/usr/bin/env bash
# Rebuilds the 2x2 page from panels.tsv (label<TAB>caption<TAB>export file per line, up to four).
#   bash rebuild.sh            # writes out/variants/index.html + out/variants/data/
# The page bundles the game's clock and sampling code from the checkout given by REPO
# (default: this repository's top level), so 1x follows WATCH_MINUTE_MS there.
set -euo pipefail
V=$(cd "$(dirname "$0")" && pwd)
REPO=${REPO:-$(git -C "$V" rev-parse --show-toplevel)}
args=()
while IFS=$'\t' read -r label caption file; do args+=(--panel "$label" "$caption" "$file"); done < "$V/panels.tsv"
cd "$V" && node combine.mjs --repo "$REPO" --name variants "${args[@]}" 2>&1 | tail -6
python3 -I "$V/fix-head.py" "$V/out/variants/index.html"
