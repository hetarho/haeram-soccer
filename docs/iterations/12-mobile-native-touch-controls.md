# Cycle 12: mobile-native-touch-controls

Review: WebKit at360x740 renders tactic request selection at20px and recruitment sorting at24px despite CSS min-height. Native selection sizing breaks the touch guideline outside the newly fixed match controls.

Design: Make primary mobile selection controls comfortably reachable in all supported browser families without breaking compact home/match layouts.

Contract: WEB@9. Task: T025.

Verification: Node24.12.0 npm run verify:193 unit tests,5 contract tests,typecheck/lint/format/catalog/build and156 production-preview browser tests acrossChromium/Firefox/WebKit; both360x740 and390x844 bounds/keyboard/44px controls; spec lint clean; all12 native-touch browser cases passed.

Outcome: Primary mobile native selection controls use explicit touch dimensions across founding,progression,tactics/manual lineup,player inspection,recruitment and league exploration. Compact home/match retain all essential content and optional detail scrolling.
