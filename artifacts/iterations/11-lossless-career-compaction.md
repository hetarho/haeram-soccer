# Cycle 11: lossless-career-compaction

Review: The active-management career at year2001 round23 exceeds the conservative checkpoint budget by20,616 bytes despite a lossless codec. Ending-season checkpoints alone conceal this failure, so retention requires more compact lossless storage rather than removing career facts.

Design: Preserve every club, season, event, match and player fact while reducing encoded checkpoint size and accepting existing compact checkpoints.

Contract: SAVE@3. Task: T024.

Verification: Node24.12.0 npm run verify:193 unit tests,5 contract tests,type/lint/format/catalog/build and156 Chromium/Firefox/WebKit production-preview cases; current-source npm run benchmark and npm run benchmark:browser passed; spec lint clean; both100-season profiles,active round23,8-country archive/capacity checks,lossless/resumed replay and124-season era probe passed.

Outcome: Lossless actor columns,bit planes and exact interception deltas preserve complete canonical careers and read legacy compact formats. The baseline century checkpoint is1,282,382 UTF-16-accounted bytes; the active century round23 checkpoint is1,453,872 bytes,7.565% below the unchanged limit. Invalid dimensions,layouts,streams and original unsafe statistics reject before activation.
