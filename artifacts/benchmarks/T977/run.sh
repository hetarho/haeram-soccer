#!/usr/bin/env bash
# Run from the repository root with the inputs in inputs.sha256 restored.
set -euo pipefail

recipe=artifacts/benchmarks/T977
output=${1:-.tmp/mr18cx/T977}
mkdir -p "$output"
sha256sum --check --quiet "$recipe/recipe.sha256"
sha256sum --check "$recipe/inputs.sha256"
pnpm exec tsx "$recipe/verify-source.ts" "$recipe/source.json"
measurement_inputs=$(sha256sum "$recipe/recipe.sha256")
source "$recipe/run-measured.sh"
pnpm exec tsx "$recipe/wage-shape.ts" "$recipe"/candidates/*.json > "$output/wage-shape.json.part"
mv "$output/wage-shape.json.part" "$output/wage-shape.json"

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
for path in "$recipe"/candidates/*.json; do
  candidate=${path##*/}
  candidate=${candidate%.json}
  mkdir -p "$output/$candidate"
  for era in 1951 1995; do
    seasons=5
    if [[ $era == 1995 ]]; then
      # Four extra seasons supply the first published mean-fee reference after this opening.
      seasons=9
    fi
    for seed in 0 1 2; do
      files=(.tmp/mr18cx/T977-inputs/2521f0c897293eca-market-"$seed"-*-"$era".json.gz)
      if [[ ${#files[@]} != 1 || ! -f ${files[0]} ]]; then
        exit 1
      fi
      stem="$output/$candidate/$era-$seed"
      run_measured "$stem" pnpm exec tsx scripts/market-seasons.ts --start "file:${files[0]}" \
        --burn-in 0 --seasons "$seasons" --seeds "$seed" --jobs 1 --config "$path" \
        --out &
      pids+=("$!")
    done
  done
  if (( ${#pids[@]} >= 12 )); then
    wait_all "${pids[@]}"
    pids=()
  fi
done
wait_all ${pids[@]+"${pids[@]}"}
python3 "$recipe/summarize.py" "$output" > "$output/results.json.part"
mv "$output/results.json.part" "$output/results.json"
