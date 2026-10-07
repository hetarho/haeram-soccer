# Cycle 10: compatible-rule-upgrade

Review: New tactics/training still share the original engine marker; currentgeneric fallback can mistake futurecompatibility failure for corruption, while frontendstorage imports the heavy defaultdecoder.

Design: Keep old careers safe under the new gameplay rules and reduce unnecessary initial browser codec imports.

Contract: SAVE@2. Task: T023.

Verification: Node24.12.0 npm run verify:193 unit tests,5 contract tests,typecheck/lint/format/catalog/build and156 production-preview browser tests acrossChromium/Firefox/WebKit; both360x740 and390x844 bounds/keyboard/44px controls; spec lint clean; legacy/future/quota/corruption/single-writer/worker-recovery flows passed.

Outcome: Writer-only1.0.0→1.1.0 metadata upgrades preserve old career facts and optional absence. Future selected careers stay protected/exportable; disk failure retains recoverable old data and actual upgraded memory. Browser storage uses the lean injected-validator repository.
