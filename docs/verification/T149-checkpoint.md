# T149 checkpoint verification

Verified source commit: `34beea92e32a015c3b215364527afe9e4ff923e8`.

[GitHub Actions: all six jobs passed](https://github.com/hetarho/haeram-soccer/actions/runs/38884983352): checks, Chromium, Firefox, both WebKit shards, and storage/browser performance benchmarks.

## Scope

T142–T149 are complete and committed individually. This checkpoint stops before T150. Manual progression controls and grouped event interactions remain in T150; subsequent coaching, mediation and release tasks retain their planned status. Rules 3.0.0 activation and career deletion have not run.

## Validation

- Type checking, lint, formatting, catalog validation and production build passed. Spec structural lint passed; existing future-task freshness and document-quality warnings remain for the planning session.
- All 825 unit tests and 11 contract tests passed after the final dependency changes. Portable golden facts were preserved without regenerating expected game outcomes.
- The complete local browser matrix exposed 11 failures; all 11 passed after correction. All 39 progression/settings cases then passed across Chromium, Firefox and WebKit, including a newly added restored match-eve regression. The final source passed the entire configured browser matrix in CI, with the existing Chromium-only contract-talk exclusions retained.
- [Storage benchmark](../benchmarks/T010-storage.json): both 100-season workloads, the active round-23 checkpoint, lossless restoration and resumed replay passed existing capacity limits.
- [Production-browser benchmark](../benchmarks/T010-first-play.json): initial entry 252,811 gzip bytes against the unchanged 256,000-byte limit; desktop/mobile animation 61/61 FPS; century restore 3,546 ms against 5,000 ms. No page errors or mobile horizontal overflow.
- Both benchmark artifacts identify the same source fingerprint: `73e476f7f4bf7eb0b8346791506ac944a5d57eca213ed072f8b727b9894ff0c4`. They were recorded from the working tree whose source content is preserved in the verified commit; their original measurement metadata is retained.

## Integration corrections

- Existing journeys express authority through the shared explicit-apply settings dialog. Domain decisions are resolved through business actions or delegation; ordinary reports and match observations are not acknowledged away as decisions.
- Restoring a career on a match eve displays actual match actions and can play through without a remembered controller stop. The event count no longer counts the same match observation twice.
- The director's four independent responsibility labels wrap within narrow staff cards.
- Pure settings queries and pending-work previews no longer import the worker's validation/write graph. Money helpers moved unchanged into a shared primitive module; authoritative settings validation remains on the worker/engine command path. Financial formulas, negotiation criteria and balance constants were not tuned.
