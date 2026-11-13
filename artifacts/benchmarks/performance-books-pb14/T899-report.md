# T899 funded-market rating-cache trial

The settlement-local cache qualified and is retained. No rating, fee, wage, funding, eligibility, decision or tie formula changed. It only reuses pure main/slot ratings inside one atomic settlement, discards moved-player entries before refreshed needs, and creates no persistent/world cache. Direct quotes and later settlements compute fresh ratings. The 45-minute limit ran from 2026-11-13T19:16Z to20:01Z; all planned evidence completed before the limit. The original pb14 deadline and one cumulative failed final gate remain unchanged.

## Paired evidence

- Baseline: d28b04fd47bdaf918541b08756704beb8317f379, including finite NPC funding. The candidate was uncommitted runtime on263cfb5a109a8737c0ff2bfc9cd02411fa950d60; that HEAD alone is not the candidate source. Reproduce with the exact preserved runtime patch on the baseline. t899-source.json records both file/diff SHA256 values and raw artifact hashes.
- Command: node scripts/perf/ab.mjs --base d28b04fd47bdaf918541b08756704beb8317f379 --workload history --procs 8 --reps 2 --warm 1 --json .tmp/t899-history-final.json.
- M1 Max10 cores, macOS arm64, Node26.8.1, seed perf-261027. Eight separate processes, one warm-up and two measured season repetitions each; sixteen paired timings, alternating sides. This covers the initial1930–1932 world including its warm-up season, not later-era, browser or every seed. Other approved sessions were active on the same machine; recorded one-minute loads range2.457–5.839.
- Baseline/candidate bundle hashes f9963b06c6dfb05d /90ccccfe6e474e7c. All eight baseline and candidate final-world hashes agree:029e70f627d44c85.
- CPU ratio0.6859,95% interval0.6677–0.7023 (31.41% less CPU). Wall ratio0.6853,95% interval0.6619–0.7019. Raw samples and machine/load facts are verbatim in t899-history-final.json.
- Task check:57 isolated units in three files, typecheck, lint, format and all12 locales passed. The regression mutates actual rating inputs between settlements and independent quotes and observes the resulting transfer. No integration, contract, browser or build ran locally. Raw task and heavy-lock timing receipts are retained; the six-minute numeric experiment was explicitly approved by this explore task and was not mislabeled as an isolated unit test.

No measured pair failed or remained incomplete. No extra seed, later-era, browser, long-career or memory benchmark was planned or run, and none is claimed as passing. The earlier T878 pre-funding result is a different baseline; its percentage is not added to this result. Final publication units and normal remote CI remain the coordinator's responsibility.
