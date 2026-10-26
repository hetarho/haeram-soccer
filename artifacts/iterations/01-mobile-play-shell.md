# Cycle 1: mobile-play-shell

Review: Mobile chrome pushes play below the fold; the current dirty UI does not typecheck because progression and scorer imports are incomplete.

Design: Restore the existing progression integration and establish compact mobile navigation without losing saves or existing views.

Contract: WEB@2. Task: T011.

Verification: BROWSER_TEST_PORT=4177 npm run verify (96 unit, 5 contract, 45 browser checks across Chromium/Firefox/WebKit); npx haeram-spec-creator lint.

Outcome: Compact mobile shell, shared progression and all existing playable views operate with safe modal focus and saved continuity.
