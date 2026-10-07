# Remaining work — handoff at the requested stop

The playable web implementation for T001–T009 is committed. T010 contains release-hardening work and is **unfinished**. Work stopped at the user's request to save the remaining tasks and push the current project. Resume from `spec/tasks/T010.release-verification.md`; do not mark its acceptance criteria complete until the checks below pass.

## Current implementation

- Fictional 1901 founding in eight countries; deterministic domestic/European football and club history.
- Match observation/statistics, managers/tactical negotiations, transfers/loans, marketing/sponsors/facilities and historical money.
- Worker execution, two-slot localStorage saves, recovery/import/export and single-writer tabs.
- Netlify configuration, static preview, deployment/data/save-format/future Flutter/Supabase documentation.
- Portable golden scenarios, strengthened schema checks and recovery/browser tests.

## 1. Finish release verification

- [ ] Run `npm run verify` against this committed head. It builds the app and runs **33 production-preview browser cases** across Chromium, Firefox and WebKit.
- [ ] Recheck the two cases that failed in the last full run: new-world replacement surviving reload, and WebKit read-only tab updates. Saved-revision reset and storage-event/coalesced notifications were added afterward; the complete suite has not been rerun.
- [ ] Recheck actual worker termination/recovery in all browsers. The test terminates the real worker and injects an error notification; the client also has an inactivity watchdog.
- [ ] Verify keyboard access to the newly adjusted file inputs and 390px touch layouts. Inspect the latest desktop/mobile screenshots.
- [ ] Run `npx -y haeram-spec-creator@latest lint` and `check`; fix remaining structural warnings and confirm the installed skill sync.

Latest available evidence: current typecheck/lint passed. **33 unit tests and 5 contract tests passed before the final client notification/saved-marker edits.** The last complete production-browser run passed **31/33**; those two failures are not being represented as passing.

## 2. Rerun the actual performance/storage gates

- [ ] Run `npm run benchmark` and replace `docs/benchmarks/T010-storage.json` with measurements for the final source. It measures founding, an active mid-career checkpoint, two 100-season workloads and a separate 1901–2025 era probe.
- [ ] Recheck lossless encode/decode, resumed-season determinism, eight-country group capacities and 1.5 MiB/checkpoint + 3.5 MiB total limits. Do not prune history to make a result pass.
- [ ] Start the latest static preview on port 4180 (`PORT=4180 npm run preview`) and run `npm run benchmark:browser`.
- [ ] The rewritten browser benchmark needs its first successful run: **4× page CPU slowdown, cold Fast 4G (9/1.5 Mbps, 60ms), desktop and 390×844 DPR2 mobile**. Check founding <=5s, control feedback p95 <100ms and pitch >=30 FPS.
- [ ] Existing first-play measurements are **earlier unthrottled measurements**, not proof of the required throttled reference. The storage artifact also predates the final assist/era/validation adjustments.

Earlier measured storage maximum: 1,431,128 bytes/checkpoint (conservative UTF-16), with complete records retained. This is evidence for the measured earlier source, not a universal/unlimited guarantee or a final-head release pass.

## 3. CI and Netlify

- [ ] Add the completed benchmark gates to GitHub Actions. Current CI runs `npm run verify`; benchmark automation still needs completion.
- [ ] Fix any discrepancy between Netlify's `_headers`/`_redirects` behavior and the local static preview. Confirm actual HTTPS deep links, module workers, entry revalidation, immutable assets and 404s on a Netlify deploy preview.
- [ ] Connect `https://github.com/hetarho/haeram-soccer.git` to the intended Netlify project, choose the production hostname and protect `main` with the verification check. No Netlify project or public deploy was created during this session.
- [ ] Smoke-test on that HTTPS origin and rehearse compatible rollback without clearing local saves. Origin changes require explicit export/import.

## 4. Close T010 correctly

- [ ] Keep failing/unrun checks visible; update `docs/VERIFICATION.md` and benchmark provenance.
- [ ] Complete T010 acceptance checks, record the actual verified source commit, archive the task and update `spec/STATE.md` only after every gate passes.
- [ ] Commit and push the verified completion separately from this work-in-progress snapshot.

## Local verification environment

Node 24.12.0. This machine used private extracted browser libraries, without installing system packages globally. If those temporary paths still exist:

```sh
LD_LIBRARY_PATH=/tmp/haeram-browser-libs/usr/lib/x86_64-linux-gnu \
FONTCONFIG_FILE=/tmp/haeram-browser-libs/fontconfig.conf \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npm run verify
```

The flag bypasses the global-library preflight; it does not skip real browser tests. CI uses `npx playwright install --with-deps`. Ports 4173 (browser test server) and 4180 (performance preview) must be available. Temporary screenshots/corpora are under `.tmp/` and are not pushed.

Flutter and Supabase ranking remain later planned work; their SDKs/apps/backend resources are intentionally absent. See `docs/FUTURE.md`.
