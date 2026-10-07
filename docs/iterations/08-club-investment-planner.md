# Cycle 8: club-investment-planner

Review: Facility choices show only upfrontprice, marketROI is ambiguous, and sponsor performance wording disagrees with actual league settlements.

Design: Make club investment a clear growth-versus-cash decision on mobile, without changing economic outcomes.

Contract: ECON@2, WEB@6. Task: T019.

Verification: 163 unit tests, 5 contract tests, typecheck/lint/format/catalog/build; 8 built Chromium business, actual ledger, intervention and management checks; spec lint.

Outcome: A compact four-panel investment planner exposes exact post-spend cash and recurring costs, reviews facility upgrades, corrects sponsor/marketing descriptions, previews ticket demand, and preserves full-ledger/bounded recovery access.
