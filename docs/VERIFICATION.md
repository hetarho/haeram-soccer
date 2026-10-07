# Local web verification

The 12 gameplay improvement cycles and existing local release-verification task are complete. Verification ran before committing. Source/build fingerprints identify the checked content; Git metadata preserves the state at measurement time. This is local evidence, not a remote CI run or public deployment. See [the improvement report](IMPROVEMENT-REPORT.md) and [remaining external work](REMAINING.md).

Verified on 2026-10-08 KST using Node **24.12.0**, macOS arm64, Apple M1 Max, Playwright 1.63.0 and Chromium 153.0.8010.12 for the performance trace.

| Executed gate | Result |
|---|---|
| `BROWSER_TEST_PORT=4187 npm run verify` | type/lint/format/catalog/build passed; 193 unit, 5 contract and 156 built-preview Chromium/Firefox/WebKit tests passed |
| `npm run benchmark` | both century profiles, active round23, lossless/resumed replay, eight-country archive/capacity and 124-season era checks passed |
| `BENCHMARK_ORIGIN=http://127.0.0.1:4180 npm run benchmark:browser` | served-build hashes, page 4xCPU/Fast4G, input/FPS/initialization and compressed asset budgets passed |
| Additional reduced-motion/keyboard probe | all three browser families start paused, accept keyboard observation/result actions and preserve the save |
| Spec lint and installed skill synchronization | passed |

[Full verification output](improvement/verification.txt), [storage measurements](benchmarks/T010-storage.json), [performance measurements](benchmarks/T010-first-play.json) and [accessibility probe](improvement/reduced-motion.json) retain actual results. Screenshots are linked in the improvement report.

Storage maximum: 1,453,872 conservative UTF-16 bytes, below 1.5MiB with 7.6% headroom. Mobile input p95: 29ms; actual pitch paints: 60FPS. Initial JS/CSS: 133,746 gzip bytes; conservative all-JS/CSS inventory: 220,835 bytes, both below250KiB. Mobile founding:181ms. The separate 100-season restore measured1,358ms without CPU/network throttling.

Source SHA-256: `9027f015c20e10b302e17cacb1ab235d9e943ec0e02c404aeab38ad362b8e839`. Build SHA-256: `3789dd3721467712a854b48273290e504e08c596fd5a31c4cfc115b65a430cf7`. Both measurement scripts have identical source coverage and reject changed inputs; the performance script checks the measured origin against local build bytes.

Reference fixtures are synthetic. Browser layout checks are not physical-device testing, human fun/retention validation, native Flutter release, remote GitHub CI or a live Netlify smoke test. Page-target transfer totals may omit dedicated-worker requests; the conservative asset inventory includes them. No unlimited storage or App Store ranking claim is made.
