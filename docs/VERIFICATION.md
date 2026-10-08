# Local web verification

## Latest integration review — 2026-10-08

The save-lineage, goalkeeper-retirement, historical regional-group and European-coefficient fixes were integrated on top of `f530702`. The reviewed code was committed as `0e3d4f2` before these evidence updates; its source fingerprint is unchanged by the documentation/benchmark-record update.

- `npm run verify` passed typecheck, lint, formatting, catalog validation, production build, **199 unit tests, 5 contract tests and 165 Chromium/Firefox/WebKit cases**. The historical Italy A/B/C filters and country reset pass at 390px in each browser.
- `npm run benchmark` passed complete century workloads, active round 23, lossless/resumed replay and the era probe. Maximum checkpoint: **1,453,872 bytes**; conservative two-checkpoint estimate: **2,908,256 bytes**, within the unchanged budgets.
- `npm run benchmark:browser` **did not pass** the desktop input target on this Linux host: pointer-to-second-frame p95 **120ms**, above the strict `<100ms` budget. A diagnostic repeat with per-control timings also failed at **289ms**, including a late club-journal navigation spike. No application edits were made between these runs; desktop response profiling remains a follow-up.
- Other reference gates passed: mobile input p95 **41ms**, desktop/mobile founding **436/430ms**, actual pitch paints **61/60 FPS**, entry/all-JS-CSS gzip **133,801/220,951 bytes**, century restore **2,457ms**, matching served-build hashes, no page errors and no mobile horizontal overflow.

Environment: Node 24.12.0, Linux x64, Intel Xeon Silver 4214, Playwright 1.63.0, Chromium 153.0.8010.12. The current [storage](benchmarks/T010-storage.json) and [browser-performance](benchmarks/T010-first-play.json) artifacts preserve these measurements, including the failed desktop gate. Source SHA-256: `1a4095bb648ac1e6a47ff7e184a823a1f365e0b0f541e9e1e2d877b68784acf1`; build SHA-256: `9c170427cb4d9b25c980836a70ec7255e2b16d6fd66e33835dbbe7ae0c9366b2`.

This host uses browser libraries and fonts extracted under `/tmp/haeram-browser-libs`. The first browser run was interrupted after Firefox could not read those fonts and rendered missing-glyph boxes, causing layout failures and timeouts. The complete passing rerun used `LD_LIBRARY_PATH`, `FONTCONFIG_FILE`, `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` and `MOZ_DISABLE_CONTENT_SANDBOX=1` so Firefox could access the temporary fonts. These are local test-process settings; CI installs dependencies in their standard locations. The new commit's remote CI result has not yet been measured.

## Earlier improvement verification

The 12 gameplay improvement cycles and existing local release-verification task are complete. Verification ran before committing. Source/build fingerprints identify the checked content; Git metadata preserves the state at measurement time. The local evidence is supplemented by successful Linux CI for T027; no public deployment is claimed. See [the improvement report](IMPROVEMENT-REPORT.md) and [remaining external work](REMAINING.md).

Verified on 2026-10-08 KST using Node **24.12.0**, macOS arm64, Apple M1 Max, Playwright 1.63.0 and Chromium 153.0.8010.12 for the performance trace.

| Executed gate | Result |
|---|---|
| `BROWSER_TEST_PORT=4187 npm run verify` | type/lint/format/catalog/build passed; 193 unit, 5 contract and 162 built-preview Chromium/Firefox/WebKit tests passed |
| `npm run benchmark` | both century profiles, active round23, lossless/resumed replay, eight-country archive/capacity and 124-season era checks passed |
| `BENCHMARK_ORIGIN=http://127.0.0.1:4180 npm run benchmark:browser` | served-build hashes, page 4xCPU/Fast4G, input/FPS/initialization and compressed asset budgets passed |
| Additional reduced-motion/keyboard probe | all three browser families start paused, accept keyboard observation/result actions and preserve the save |
| Spec lint and installed skill synchronization | passed |

[Full verification output](improvement/verification.txt), [storage measurements](benchmarks/T010-storage.json), [performance measurements](benchmarks/T010-first-play.json) and [accessibility probe](improvement/reduced-motion.json) retain actual results. Screenshots are linked in the improvement report.

Storage maximum: 1,453,872 conservative UTF-16 bytes, below 1.5MiB with 7.6% headroom. Mobile input p95: 30ms; actual pitch paints: 60FPS. Initial JS/CSS: 133,809 gzip bytes; conservative all-JS/CSS inventory: 220,899 bytes, both below250KiB. Mobile founding:209ms. The separate 100-season restore measured1,356ms without CPU/network throttling.

Source SHA-256: `b3db7c49af2ce3ccadaf73f436682561bdca8dca98b0f8d146b46222ef38b684`. Build SHA-256: `dbc12b031885da51feea327be13625afff9ac10bf21ecfb64688256beeaf70c8`. Both measurement scripts have identical source coverage and reject changed inputs; the performance script checks the measured origin against local build bytes.

Reference fixtures are synthetic. Browser layout checks are not physical-device testing, human fun/retention validation, native Flutter release, remote GitHub CI or a live Netlify smoke test. Page-target transfer totals may omit dedicated-worker requests; the conservative asset inventory includes them. No unlimited storage or App Store ranking claim is made.

T027 corrects the six Linux CI founding-overflow failures from run37699063758. The real WenQuanYi font probe reproduces the old794px height and verifies all browser/viewport pairs at740/844px after correction. A permanent wrapped-text regression retains strict viewport/control/import/footer checks. Local162-browser verification and refreshed matching source/build benchmark artifacts passed; pushed Linux CI passed on eb1c759 (run37701628149).

[Linux CI run37701628149](https://github.com/hetarho/haeram-soccer/actions/runs/37701628149) completed successfully for commit `eb1c759aa513d5fa6ec31807bab5fd44f923fc11`: full verify, century storage, throttled browser performance and artifact upload all passed. [Run metadata](improvement/t027-ci-result.json) preserves the exact tested commit and step results.
