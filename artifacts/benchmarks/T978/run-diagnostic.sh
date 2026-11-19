#!/usr/bin/env bash
# Compare one youth refill parameter on two paired early-era starts.
set -euo pipefail

recipe=artifacts/benchmarks/T978
output=.tmp/mr18cx/T978
sha256sum --check --quiet "$recipe/recipe.sha256"
sha256sum --check "$recipe/continued-recipe.sha256"
sha256sum --check "$recipe/lived-inputs.sha256"
pnpm exec tsx artifacts/benchmarks/T977/verify-source.ts "$recipe/source.json"
measurement_inputs=$(sha256sum "$recipe/continued-recipe.sha256")
source artifacts/benchmarks/T977/run-measured.sh
export HAERAM_CALIBRATION_REQUIRE_OBSERVERS=1

pids=()
for seed in 0 1; do
  snapshot=$(awk -v id="-market-$seed-" '$2 ~ id && $2 ~ /-1951\.json\.gz$/ {print $2}' "$recipe/lived-inputs.sha256")
  [[ -f $snapshot ]]
  run_measured "$output/diagnostic-1951-$seed" pnpm exec tsx scripts/market-seasons.ts \
    --start "file:$snapshot" --seeds "$seed" --burn-in 0 --seasons 5 --jobs 1 \
    --config "$recipe/refill-six.json" --out &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=1
  fi
done
exit "$failed"
