# Development feedback cleanup — 2026-10-26

The cleanup addresses repeated setup, dependency scope and verification selection. It sets no one-hour task deadline and changes no football rule, record revision or save format. The [historical baseline](development-feedback-baseline-2026-10-26.md) remains unchanged. This document distinguishes static structure from normal verification timings; no dedicated century capacity run, calibration-report corpus, parity-report corpus or performance benchmark was added for this cleanup. Existing simulation/statistical regression cases still execute in the integration tier.

## Source and scope

- Before: `ebc514f49087bd6da24f6eeef8c60bc7e6a25eb3`, immediately after the other session stopped and T432 landed.
- Implementation: T459 `032a2b09`, T460 `cdcfff6d`, T461 `eab7e101`, T462 `8c6aedbf`. Classification/cache-retention correction: `a02624a3`; contract-aware guard correction: `87c07561`. Documentation closing commits are separate.
- The earlier audit snapshot `2e61d6e9` predates T432 and counted 79 modules in its largest cycle. The matched comparison here uses **80**, measured on `ebc514f4` with the same parser used on the after tree.
- Raw module lists and definitions: [structural evidence](development-feedback-structure-2026-10-26.json). Reproduce with `pnpm exec tsx scripts/dependency-report.ts [checkout-root]`; this reads source without executing the game.

## Static comparison

| Static runtime dependency measure | Before | After T461 |
| --- | ---: | ---: |
| Largest engine strongly connected component | 80 modules | 58 modules |
| Grid execution transitive closure | 124 files | 37 files |
| Save packing/unpacking transitive closure | 139 files | 31 files |
| Test files reaching grid/shape.ts | 222 / 280 | 217 / 285 |
| Web test files reaching grid/shape.ts | 60 | 56 |

These are relative runtime import/export edges, including literal dynamic imports and excluding type-only imports. They are not CPU samples, test execution times or a guarantee that Vitest selects the same files. T462 adds one identity test, bringing the final inventory to 286 files. Most campaign-level reach remains; this cleanup does not eliminate the remaining 58-module cycle or optimize the numerical match kernel.

## What changes during development

| Concern | Previous behavior | Current behavior |
| --- | --- | --- |
| Generic fixture helpers | Cache/release imports could load world builders and the engine entry point | Generic JSON cache and release declarations are leaves; builders import narrower entry points |
| Simulated-world invalidation | Broad application/package/fixture source fingerprint | Runtime dependency closure plus declared catalog/toolchain inputs; input values and builder identity are also keyed |
| Manager-history UI setup | Recreate a two-season career, cup winner search and 21 appointments for repeated browser/viewport cases | Versioned synthetic gzip fixtures, checksum and schema validation, fresh copies; current Host and presentation mapping still run |
| Unit command | Mixed isolated helpers, full matches, seasons, persistence and Host flows | Explicit projects: 140 unit files, 143 integration files, 3 contract files; a registry guard checks every file is assigned once |
| CI | Mixed unit shards | Separate unit job and three integration shards, with JSON reports retained; browser projects preserved |
| Grid execution | Primitive reads return through world/match/career/setup/playback orchestration | Scalar player/injury/match/era rules and trace clock/state declarations are leaves; boundary tests reject campaign and playback dependencies |
| Save fixture reconstruction | Invoke season preparation on a shallow copy | Rebuild the same ordered fixtures directly, then restore saved scores |
| Storage measurement phases | Full source provenance doubles as reuse identity | Actual computation closure and declared inputs determine reuse, also keyed by Node/platform/CPU and smoke mode; original phase provenance and timings remain recorded |
| Detailed parity reference cache | Broad hand-maintained exclusions; reference runner edits require manual cache-directory changes | Shared dependency identity, runner included, aggregate implementation excluded only for the detailed reference; condition/partition/round/count and grid patch settings remain keyed |
| Local verification durations | Incomplete historical stage records | `verify` and `verify:batch` retain command, exit status, wall time, source identity and machine under `.tmp/verification/`; Vitest and Playwright retain JSON reports |

Prepared fixture metadata identifies the original generation commit, dependency hash and dirty state. Regeneration is explicit: `pnpm exec tsx scripts/prepare-manager-fixtures.ts --write`. UI tests use a validated historical setup; live progression, activation, deterministic engine and storage integration coverage remain in the integration/batch tiers. A relevant contract/setup change requires reviewing the prepared fixtures. These files are not auto-regenerated by an unrelated UI edit.

The shared computation hash includes local runtime dependencies, complete catalog data and package/lock/workspace/TypeScript configuration. This is conservative at module granularity: an unrelated export within a relevant module, or a scripts-only edit to package.json, can still invalidate it. Existing broad source-provenance hashes are retained separately, within their recorded scopes and must not be confused with computation compatibility. Old broad-key cache directories are not migrated or claimed as compatible. The previous two-day unused-scope retention is preserved; recently used scopes and scopes with a live builder lock are retained.

## Verification evidence

The final normal run uses code `87c07561` on Linux x64, Node v24.22.1, Intel Xeon Silver 4214 @ 2.20 GHz, 12 reported logical CPUs and 33,577,496,576 bytes RAM. Draft report files mark the working tree dirty; production/test source matches the committed implementation. Existing caches were retained, and cache warmth/host load are uncontrolled. The fixture-identity migration requires rebuilding affected cached setups.

| Normal verification stage | Wall time | Result |
| --- | ---: | --- |
| `typecheck` | 33.003 s | passed |
| `lint` | 17.079 s | passed |
| `format:check` | 28.561 s | passed |
| `test:unit` | 85.253 s | passed |
| `test:integration` | 952.140 s | passed |
| `test:contract` | 68.859 s | passed |
| `validate:catalogs` | 1.080 s | passed |
| `validate:presentation` | 1.394 s | passed |
| `build` | 5.838 s | passed |
| `test:e2e` | 1.365 s | blocked before browser cases: port 4173 occupied |

The initial Chromium invocation failed before executing cases because port 4173 was already occupied. Continue only that stage on port 4289 with `BROWSER_TEST_PORT=4289 PREVIEW_BUILD=1 pnpm exec playwright test --project=chromium`; all non-browser stages above are reused on identical source. The continuation executed 274 cases in 25.3 min (1,520.092 s including the command), with 272 passing and two failures. Both failures came from the existing revision-dependent goal fixture: the archived test expected revision-1 goals `[2,13,32]` from a newly founded revision-2 career, whose goals were `[2,7,10,45,56]`; the mobile case also assumed three total goal holds and a fixed playback length. The same seed's complete record hash on before `ebc514f4` and after `87c07561` is `58b3591052b4274f6d797ab243a18d304acf8457a1a2697f142d8d90e56eb503`. This is a focused regression comparison, not a timing benchmark.

The archived replay now explicitly plays a settled revision-1 record. The current-model live presentation checks derive the final score, goal count and playback budget from its actual record/clock, preserving every cue, pause, seek, score and possession assertion. The four affected viewport/replay cases passed in 139.457 s including the command; 272 unchanged successful cases were reused. Resolved local coverage is **274 passing Chromium cases**. Initial failures remain recorded and are not presented as an uninterrupted passing run.

All raw stage timings, passing/pending counts, case durations and initial failure/continuation results are retained in [normal verification evidence](development-feedback-verification-2026-10-26.json). A supplemental typecheck and focused ESLint/Prettier checks passed after the test-only fixes. Hidden-file upload was enabled for the `.tmp` CI reports.

Vitest coverage: 140 unit files / 1,020 passing cases; 143 integration files / 1,147 passing cases and 4 existing pending cases; 3 contract files / 39 passing cases. No cases were removed to obtain these results.

The 10-season codec checkpoint case took **477.210 s** to build its career and verify the round trip; the integration stage took **952.140 s**. File durations overlap under worker concurrency and must not be summed as stage wall time. This is a concrete remaining cost of regenerating long careers after a relevant dependency change. It is separate from the reduced fast-unit selection and from dedicated storage/capacity benchmarks.

 Full local `verify` covers all three browsers; `verify:batch` covers Chromium, following ARCH-30. CI checks all browser projects after the configured main push; its result is recorded by the session report. No unexecuted browser or release-on test body is counted as passed.

Focused pre-batch checks: T459 cache/prepared-world checks (12 tests), T460 partition guards (2 tests), T461 isolated grid/boundary checks (124 tests, 74.85 s), T462 identity/partition/boundary checks (9 tests, 1.08 s). Initial collection assigned every file once, but the first normal unit run exposed three long scenarios left in the wrong project. A reviewed import audit moved ten full-match/progression/statistical files (including helper callbacks) into integration and added a regression guard. The initial failed unit stage took 247.1 s; its three failures were 30 s timeouts, not changed football assertions. A second invocation was stopped during typecheck (27.0 s) to correct the new guard, which initially rejected the valid contract tier. Both focused guard/cache files then passed (7 tests, 1.65 s). Corrected collection under both default and release-on configurations assigns all 286 current files exactly once: 140 unit, 143 integration, 3 contract after the classification correction. Collection does not execute test bodies.

## Comparison limits

The old historical batch rows and the new normal run differ in hardware, source, release state, cache warmth and test classification. They cannot establish a percentage runtime speedup. Old `test:unit` mixed unit and integration coverage; compare the new unit-plus-integration scope when assessing overall cost. No controlled cold/warm before/after pair was run, and no exact portion of a past four-hour task is attributed to these changes.

A future blog comparison can use the retained historical task intervals, matched static counts, unchanged deterministic digests, and normal verification stage records independently. A later representative cold/warm study is optional follow-up; it is not hidden inside routine task validation.

## Remote CI hand-off

[Run 40262705063](https://github.com/hetarho/haeram-soccer/actions/runs/40262705063) checks pushed commit `5ad12ec1`. CI is **not fully green**: checks, unit, all three integration shards, Chromium and WebKit 2/2 succeeded; Firefox failed, and WebKit 1/2 was still running when this hand-off was recorded. The Firefox failures are business:266 (a modal intercepts watch.ts:16), season-flow:135 (30 s timeout), and stable-controls-and-pacing:209 (30 s timeout). Evidence and exact job snapshots are retained in [CI evidence](development-feedback-ci-2026-10-26.json) and handed to the existing T458 owner. These journey bodies were not changed by the cleanup; no definitive causal attribution is made. No next start-vibe task was claimed.

| CI job | Wall time including setup | Result at observation |
| --- | ---: | --- |
| unit | 97.0 s | success |
| e2e (webkit 1/2) | pending s | in_progress |
| integration (3/3) | 719.0 s | success |
| integration (2/3) | 236.0 s | success |
| checks | 126.0 s | success |
| e2e (firefox 1/1) | 2116.0 s | failure |
| e2e (webkit 2/2) | 2007.0 s | success |
| integration (1/3) | 711.0 s | success |
| e2e (chromium 1/1) | 1445.0 s | success |

Job times overlap and are not summed. They are not interchangeable with local command timings.

The default CI watcher also revealed a tooling issue outside this game repository: `haeram-spec-creator/src/vibe-ci.mjs` public-HTML handling expects `data-job-status` attributes that are absent from the current GitHub job HTML. With no GitHub CLI/token available here it cannot reliably recognize completion. The owned local watcher was replaced by an exact-commit visible-status observer; public job summaries and failure annotations supplied the hand-off. No remote CI job was cancelled or rerun. This tool compatibility issue is recorded for follow-up, rather than claiming that waiting for its default one-hour timeout is useful validation.
