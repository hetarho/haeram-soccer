# fi09 remote handoff

The owner canceled this session's extra two-hour execution request and explicitly requested that all work be pushed so another session can continue. This publishes an unfinished work snapshot, with no release approval. The complete canonical verification is still failed/incomplete.

## Start here

The same snapshot is published on `origin/next` and `origin/handoff/fi09-261110/current`. From a clean receiving checkout:

```sh
git fetch origin
git switch --create resume-fi09 --track origin/handoff/fi09-261110/current
```

Read `AGENTS.md`, `.codex/skills/gusta-self-improve/SKILL.md`, `spec/reports/261109-fi09.md` and this document. All T747-T768 implementations are already integrated:19 product corrections and3 verification repairs. Do not implement those tasks again. T689 is an unrelated preserved calibration backlog item.

The application/code snapshot before this documentation and evidence export is `a4ee7b02b967eacdd0e78f9748019a3d3fce2779`. This handoff changes only documentation and archived evidence. The last implementation integration is `b02f431d50c6611aab01c3cfe67549cd58d4fb41`.

## Remaining work and evidence

- The required complete unit/integration/Chromium gate has not passed. Do not use the historical seven-task verification at `082bb0a1` as approval of the expanded work. The source group has22 integrated tasks but its verification is not current.
- The canonical attempt on `61ba18e4` passed typecheck/lint/format, then reported five unit failures before the already-failed run was stopped. It did not produce a completed whole-unit result. Existing result files with older timestamps are not results of that attempt.
- Separate diagnostics on the same application source passed12/12 integration tests in the whole newsJournal/projection/projection.plain files,46/46 contract tests, catalogs/presentation/i18n and build. All three selected Chromium journeys failed: live-state interleaved/eve-first and the mediation loan-promise journey. Preserve their timeouts, teardown errors and incomplete traces; host-only or storage/compatibility causation was not established.
- Serial whole-file diagnostics completed64 cases: staff.hiring17/17, club-staff11/12 and grid/shape33/35. The three failures explicitly exceeded their original30000ms limits. T768 subsequently corrected only the redundant staff-holder comparison setup and passed its entire12-case file plus type/lint/format/i18n/build on `27a5ddb2`. Its final submitted `bd96e3e` changes only the result document. The successful12-case run does not turn the earlier whole batch into a pass.
- The earlier broad task attempt on `ee2b958f` also retained a decide-test timeout; its actual static prefix and later six-whole-file85-test/build completion are recorded separately. Whole canonical coverage remains mandatory.

Continue by diagnosing the remaining shape/decide preparation cost and Chromium preparation/cleanup behavior, then run the complete required command under the original assertions and limits:

```sh
pnpm install --frozen-lockfile
pnpm run verify:batch
```

Use the repository's supported toolchain. Observed fi09 checks used Node26.8.1/pnpm10.34.6; the inherited av11 baseline used pinned Node24.22.1. Those uncontrolled runs are not a comparative benchmark. Keep i18n/lint enforcement, the original four declared integration pending cases only, and all348 Chromium cases. Do not add skips, baselines, production exceptions or larger test timeouts to obtain a green result.

F18 general nominal FX and F20 additional latest-contributing-club chronology remain parked policy/data questions. Do not invent exchange rates or missing historical chronology. The owner's compatibility waiver applies only to the optional career-card cache correction described in HIST/SAVE and the report.

## Unpack the retained records

The archives contain the full fi09 evidence directory, the inherited av11 verification records, and deduplicated external `/tmp/fi09-*` receipts. `manifest.json`, `external-receipts-index.json` and `SHA256SUMS` describe and hash them. Generated archives above48MiB are split into ordered `.part-NNN` files; the commands below handle either form.

```sh
shasum -a 256 -c artifacts/handoffs/261110-fi09/SHA256SUMS
cat artifacts/handoffs/261110-fi09/session-evidence.tar.gz* | tar -xz -C .
mkdir -p .tmp/fi09-av11-evidence .tmp/fi09-external
cat artifacts/handoffs/261110-fi09/av11-verification.tar.gz* | tar -xz -C .tmp/fi09-av11-evidence
cat artifacts/handoffs/261110-fi09/external-receipts.tar.gz* | tar -xz -C .tmp/fi09-external
```

Original absolute paths, PIDs, worktree ownership, expired deadlines and source-bound verifiers in these records are historical provenance. Do not import `.git` runtime locks/PIDs or replay cached pass verdicts into a new checkout. Keep archived compiler/cache files as evidence; install dependencies and verify the receiving checkout normally. Tracked `spec/work/fi09.json` records the integration/review history. If this is the same original checkout, inspect its existing runtime before creating or recovering a work group.

## Intermediate work is also preserved

`git-refs.json` maps every fi09 worker/checkpoint branch to a remote `handoff/fi09-261110/snapshots/...` branch. These include abandoned and intermediate variants; the continuation source is `next`/`current`, not an old worker branch.

`worktree-inventory.json` and `unintegrated/fi09-finance-views-563069b9.patch` preserve three uncommitted files found in a released early finance workspace. That patch is recovery material for an abandoned partial variant. Do not apply it over the integrated implementation. The original worktrees and files were not modified.

Dependency installs, build output, shared world caches and unrelated local diagnostics outside this session are regenerable or outside the export scope. Existing tracked source, reports, original-user commits and all fi09 implementation/checkpoint history are retained by Git and the session archives.
