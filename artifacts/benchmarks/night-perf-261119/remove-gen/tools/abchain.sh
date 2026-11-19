#!/bin/zsh
# abchain.sh <workload> <variant>...: paired A/B of each variant against base, one after another.
R=/private/tmp/claude-501/-Users-ihaelam-project-haeram-soccer/c45bcc06-66c2-4d18-afd2-e8636426f0dc/scratchpad/remove-gen
wl=$1; shift
export TMPDIR=$R/abtmp
for v in "$@"; do
  node $R/base/scripts/perf/ab.mjs --base $R/base --cand $R/$v --workload $wl --procs 3 --json $R/out/ab/$wl-$v.json > $R/out/ab/$wl-$v.log 2>&1
  echo "$(date +%T) $wl $v exit $?"
done
