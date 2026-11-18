#!/bin/zsh
R=/private/tmp/claude-501/-Users-ihaelam-project-haeram-soccer/c45bcc06-66c2-4d18-afd2-e8636426f0dc/scratchpad/remove-gen
for t in s1 s2 s3; do node $R/tools/queue.mjs $R/out/seeds/$t.json 12 > $R/out/seeds/$t-queue.log 2>&1; echo "$(date +%T) batch $t done"; done
