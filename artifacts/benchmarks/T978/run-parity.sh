#!/usr/bin/env bash
# The registry's unsmoked validation corpus and an entire aggregate season from each reviewed world.
set -euo pipefail

recipe=artifacts/benchmarks/T978
output=${1:-.tmp/mr18cx/T978}
sha256sum --check --quiet "$recipe/recipe.sha256"
sha256sum --check "$recipe/continued-recipe.sha256"
sha256sum --check "$recipe/continued-inputs.sha256"
pnpm exec tsx artifacts/benchmarks/T977/verify-source.ts "$recipe/source.json"
measurement_inputs=$(sha256sum "$recipe/continued-recipe.sha256")
source artifacts/benchmarks/T977/run-measured.sh
run_measured "$output/aggregate-curve" pnpm exec tsx scripts/match-parity.ts --report \
  --partition validation --only core,gap --jobs 4 --out &
curve_pid=$!
pids=("$curve_pid")
while read -r digest snapshot; do
  file=${snapshot##*/}
  stem="$output/lived-parity-${file%.json.gz}"
  run_measured "$stem" pnpm exec tsx "$recipe/lived-parity.ts" "$snapshot" &
  pids+=("$!")
done < "$recipe/continued-inputs.sha256"
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=1
  fi
done
exit "$failed"
