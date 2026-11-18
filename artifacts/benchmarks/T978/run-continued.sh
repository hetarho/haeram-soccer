#!/usr/bin/env bash
# Consume the exact newly built snapshots named in the independently reviewed receipt.
set -euo pipefail

recipe=artifacts/benchmarks/T978
output=${1:-.tmp/mr18cx/T978}
inputs="$recipe/continued-inputs.sha256"
sha256sum --check --quiet "$recipe/recipe.sha256"
sha256sum --check "$recipe/continued-recipe.sha256"
sha256sum --check "$inputs"
pnpm exec tsx artifacts/benchmarks/T977/verify-source.ts "$recipe/source.json"
measurement_inputs=$(sha256sum "$recipe/continued-recipe.sha256")
source artifacts/benchmarks/T977/run-measured.sh
pids=()
while read -r digest snapshot; do
  file=${snapshot##*/}
  stem="$output/history-${file%.json.gz}"
  run_measured "$stem" pnpm exec tsx "$recipe/continue-history.ts" "$snapshot" &
  pids+=("$!")
done < "$inputs"
failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=1
  fi
done
exit "$failed"
