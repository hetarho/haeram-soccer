# Remaining external release work

The local gameplay improvement cycles and their verification are recorded in [the improvement report](IMPROVEMENT-REPORT.md) and [verification notes](VERIFICATION.md). Current policies are in `spec/ssot/`; task status is in `spec/STATE.md`.

## Latest verification — 2026-10-17

Rules 3.0.0 application commit `6df81fa` passes [CI 38970812465](https://github.com/hetarho/haeram-soccer/actions/runs/38970812465): type/lint/format, 1018 unit/15 contract cases, catalog/build, all three browser projects and both century profiles. The largest measured checkpoint is 1,564,446 bytes within the unchanged 1.5 MiB budget. Desktop/mobile input p95 is 51/27ms; the earlier desktop performance failure is superseded by this passing fixed-source measurement. One WebKit case passed on its configured retry; four existing skips remain. See [verification](VERIFICATION.md) and [integration provenance](benchmarks/T179-rules3-integration.json).

## GitHub and Netlify

- The T027 correction passed the full [Linux GitHub Actions workflow](https://github.com/hetarho/haeram-soccer/actions/runs/37701628149) on commit `eb1c759`, including unit/contract/catalog/build/browser checks, century storage and throttled browser performance. Require these checks on future code changes too.
- Configure the intended Netlify project, stable production hostname and protected production branch. No project, public deployment, domain or branch protection was created by the improvement work.
- Smoke-test the actual HTTPS deployment: deep links, missing assets, module workers, caching, founding, management, reload, import/export and single-writer tabs.
- Rehearse compatible rollback on that origin. Unsupported newer saves must remain protected/exportable; changing origin requires explicit export/import.

Follow [deployment instructions](DEPLOYMENT.md). The production repository configured by ARCH is `https://github.com/hetarho/haeram-soccer.git`. Remote CI and public deployment must be verified separately from the local checks.

## Product validation and native release

- Playtest the early loop and several seasons with users. The automated build comparisons establish concrete tactical tradeoffs, not a guarantee of subjective fun, retention or store ranking.
- Tune difficulty and economics from observed player decisions without removing meaningful tradeoffs.
- Complete the later Flutter/Dart engine port, portable-fixture parity, native persistence, device testing, packaging, signing and store submission before claiming an App Store release.
- Supabase ranking remains optional future scope; no backend resources or automatic cloud saves were introduced.

See [the future platform plan](FUTURE.md). No App Store ranking or external user response has been measured by local code verification.
