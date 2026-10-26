# Cycle 10: mobile-match-theatre

Review: Pitch controls and actualresult feedback still sit below longchrome/statistics; hiddenpace controls and missingdocumentvisibility handling limit mobile control.

Design: Deliver a readable one-screen match loop and finish the mobile fun/control guideline gates.

Contract: MATCH@3, WEB@8. Task: T022.

Verification: Node24.12.0 npm run verify:193 unit tests,5 contract tests,typecheck/lint/format/catalog/build and156 production-preview browser tests acrossChromium/Firefox/WebKit; both360x740 and390x844 bounds/keyboard/44px controls; spec lint clean.

Outcome: Core mobile observation retains score,pitch,event,real result and next actions without page scrolling. Optional statistics/inspection, all paces, visible-tab clock behavior and explicit restart after document hiding remain available.
