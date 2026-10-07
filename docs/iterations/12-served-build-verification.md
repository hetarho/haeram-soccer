# Cycle 12: served-build-verification

Review: The benchmark fingerprints local build files but could measure a stale preview and label it with the new build. Entry/public inputs and newly added output assets are also absent from the final identity check.

Design: Make final mobile performance evidence refer to the actual latest application served in the browser.

Contract: WEB@10. Task: T026.

Verification: Node24.12.0 npm run verify:193 unit tests,5 contract tests,type/lint/format/catalog/build and156 Chromium/Firefox/WebKit production-preview cases; current-source npm run benchmark and npm run benchmark:browser passed; spec lint clean;4x pageCPU/Fast4G,DPR2 mobile; desktop input64ms,mobile29ms; founding215/181ms; separately unthrottled century restore1,358ms; served-build byte equality passed.

Outcome: Measurements bind current entry/public/source inputs to the actual served entry and every JavaScript/CSS asset; final source/build inventories remain unchanged. Both shared fingerprints match; altered entry/JS/CSS and added output files are rejected. Reference mobile pitch reaches60FPS and input p95 is29ms; entry133,746 gzip bytes and all assets220,835 bytes pass unchanged budgets.
