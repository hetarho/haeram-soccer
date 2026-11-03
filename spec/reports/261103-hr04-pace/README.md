# T680 measurement artifacts

The result is a capacity measurement, not a shipped x20 option. See [the report](../261103-hr04.md).

`results.json` contains all eight primary runs; `analysis.json` pools the date intervals and checks equal-date saved facts. The eight `*.trace.json` files retain the actual date observations, RPC boundaries, long tasks and save/commit timestamps. `metadata.json`, `fixture-meta.json` and `provenance.json` pin source, builds, fixtures, original export and measurement scripts. No World payload or user export is included.

`profile-result.json` is a separate diagnostic run and is excluded from the primary comparisons. `profile-summary.json` includes sampled main-page call frames, grouped self time and source snippets. `main-thread.cpuprofile.gz` is the original Chrome profile, compressed without altering it; decompress it before importing into DevTools. This page profile does not measure engine, codec or fixture-helper CPU time.

## Reproduction

Create a replay checkout at coordinator commit `f383e0f42cdfc769069d45a8f338b0ca57733670`, preserving this report checkout. The two production builds used `40c5b2d5103b57d76a26f5ab4e3ef2df0b344334`; the difference between those commits is spec metadata only. The scripts below are preserved byte for byte from the measurement and expect to run from `.tmp` in the replay checkout.

The retained fixture requires the original, untracked `haeram-2034.haeram-save.json` at the checkout root (SHA-256 in `provenance.json`). Preparation reads it and writes separate fixtures; it never rewrites the export. Both fixtures delegate responsibilities, use automatic mode, disable match-eve/window observation stops, apply the normal rules upgrade and activate the current prospective match model. Historical matches are not replayed. Money, difficulty and gameplay decisions are not altered to bypass stops.

```sh
PACE_ARTIFACTS="$PWD/spec/reports/261103-hr04-pace"
PACE_EXPORT="$PWD/haeram-2034.haeram-save.json"
git worktree add --detach .tmp/hr04-replay f383e0f42cdfc769069d45a8f338b0ca57733670
cd .tmp/hr04-replay
pnpm install --frozen-lockfile
cp "$PACE_EXPORT" haeram-2034.haeram-save.json
mkdir -p .tmp/hr04-fixtures
cp "$PACE_ARTIFACTS/prepare.ts" .tmp/hr04-prepare.ts
cp "$PACE_ARTIFACTS/runner.mjs" .tmp/hr04-run.mjs
cp "$PACE_ARTIFACTS/analyze.mjs" .tmp/hr04-analyze.mjs
git worktree add --detach .tmp/hr04-base 40c5b2d5103b57d76a26f5ab4e3ef2df0b344334
git worktree add --detach .tmp/hr04-x20 40c5b2d5103b57d76a26f5ab4e3ef2df0b344334
ln -s ../../node_modules .tmp/hr04-base/node_modules
ln -s ../../node_modules .tmp/hr04-x20/node_modules
git -C .tmp/hr04-x20 apply "$PACE_ARTIFACTS/x20.patch"
pnpm -C .tmp/hr04-base run build
pnpm -C .tmp/hr04-x20 run build
pnpm exec tsx .tmp/hr04-prepare.ts
pnpm exec tsx .tmp/hr04-run.mjs --steps 365 --reps 2 --out .tmp/hr04-primary
node .tmp/hr04-analyze.mjs .tmp/hr04-primary
```

The actual primary command was wrapped by the coordinator's `vibe check --tier batch --diff-base 40c5b2d5 --task T680 --timeout-ms 1800000 --` to acquire the shared heavy lock. Run builds before timing, avoid concurrent workloads and retain the per-run load values. Baseline is 100 ms/day; `x20.patch` changes only that interval to 50 ms/day and retains the seven-day buffer. The experimental UI still selects its existing `x10` value.

The recorder observes DOM changes, Worker messages, long tasks and the small checkpoint manifest. On the 365th completed day it clicks the application's normal pause button, then waits for all held dates to show and the final checkpoint to commit. Exactly 365 requests, replies and visible dates were verified in every primary run. The stored IndexedDB checkpoint is decoded/validated and canonically hashed after removing only transport `receiptIds`; normal browser reload must show its final date. Timing excludes final save, independent decode and reload; automatic saves during play remain included. Each new run uses a fresh browser context. Round one runs baseline then experiment; round two reverses them within each fixture.

The additional diagnostic used `profile.mjs` copied to `.tmp/hr04-profile.mjs` with `--steps 120 --reps 1 --fixtures late --variants x20 --out .tmp/hr04-profile-results`. It starts Chrome's main-page CPU profiler at a 1 ms sampling interval immediately before play and stops after the held dates drain. `profile-read.mjs` groups self time by call frame to avoid double counting recursive inclusive time. It is intentionally not part of the primary eight-run table.
