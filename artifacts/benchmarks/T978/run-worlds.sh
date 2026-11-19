#!/usr/bin/env bash
# Run from the repository root at the reviewed T978 source and configuration.
set -euo pipefail

recipe=artifacts/benchmarks/T978
output=.tmp/mr18cx/T978
mkdir -p "$output"
sha256sum --check --quiet "$recipe/recipe.sha256"
pnpm exec tsx artifacts/benchmarks/T977/verify-source.ts "$recipe/source.json"
measurement_inputs=$(sha256sum "$recipe/recipe.sha256")
source artifacts/benchmarks/T977/run-measured.sh
export MARKET_SEASONS_START_DIR="$output/snapshots"
export HAERAM_CALIBRATION_REQUIRE_OBSERVERS=1

wait_all() {
  local failed=0
  for pid in "$@"; do
    if ! wait "$pid"; then
      failed=1
    fi
  done
  return "$failed"
}

pids=()
for seed in 0 1 2 3; do
  stem="$output/build-$seed"
  run_measured "$stem" pnpm exec tsx "$recipe/build-lived.ts" "market-$seed" &
  pids+=("$!")
done
run_measured "$output/fresh-1930" pnpm exec tsx scripts/market-seasons.ts --start fresh:1930 \
  --burn-in 2 --seasons 37 --seeds 0..2 --jobs 3 --out &
fresh_pid=$!
if ! wait_all "${pids[@]}"; then
  wait "$fresh_pid" || true
  exit 1
fi
if ! python3 "$recipe/check-lived-inputs.py" "$output" > "$output/lived-inputs.sha256.part"; then
  wait "$fresh_pid" || true
  exit 1
fi
mv "$output/lived-inputs.sha256.part" "$output/lived-inputs.sha256"
wait "$fresh_pid"
