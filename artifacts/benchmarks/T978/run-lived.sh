#!/usr/bin/env bash
# Run the two short sweeps once the eight built snapshots have been reviewed.
set -euo pipefail

recipe=artifacts/benchmarks/T978
output=.tmp/mr18cx/T978
sha256sum --check --quiet "$recipe/recipe.sha256"
sha256sum --check "$recipe/continued-recipe.sha256"
sha256sum --check "$recipe/lived-inputs.sha256"
pnpm exec tsx artifacts/benchmarks/T977/verify-source.ts "$recipe/source.json"
measurement_inputs=$(sha256sum "$recipe/continued-recipe.sha256")
source artifacts/benchmarks/T977/run-measured.sh
export MARKET_SEASONS_START_DIR="$output/snapshots"
export HAERAM_CALIBRATION_REQUIRE_OBSERVERS=1

pids=()
for era in 1951 1995; do
  run_measured "$output/lived-$era" pnpm exec tsx scripts/market-seasons.ts --start "lived:$era" \
    --burn-in 0 --seasons 5 --seeds 0..3 --jobs 4 --out &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=1
  fi
done
exit "$failed"
