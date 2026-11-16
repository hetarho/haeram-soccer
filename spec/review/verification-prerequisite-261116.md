# REVIEW verification-prerequisite-261116
> st:converted@261116 | scope:scripts/verify.mjs playwright.config.ts .github/workflows/verify.yml README.md | at:a0615ff7 | base:ARCH@44

## summary
- The requested save repair and push require the actual ARCH-30 final batch. A bounded read-only scout found that the currently landed script still launches local browsers, contrary to the already adopted CI-only policy. The existing unstarted T917 supplies that policy; its T884 dependency is edit serialization rather than a functional prerequisite.

## findings
- F1 [o] P1 scripts/verify.mjs:19,81-87,190: bug: `verify:batch` still includes `test:e2e` and records browser scope, although ARCH-30 requires every browser journey to run in CI only. Implement the existing T917 Chromium-only planner/configuration against the current landed runner, preserving every nonbrowser check, phase order, lifecycle, timeout and receipt. ← the mandatory final command cannot currently satisfy its declared contract; no custom command decomposition or aborted browser stage is a substitute →T917

## notes
- Adopted by the orchestrator under the owner's local self-improvement, warning-reconciliation, continuation and push authorization, solely to make the required final gate comply with existing ARCH-23/30/35. No gameplay, support-policy or validation-range decision is changed.
- Read-only proposal: `/tmp/ws16-verification-prerequisite-audit.md`, scout `/root/match_freshness_scout`. Verified actual source and both task contracts before adoption. No active T884/T917 attempt or implementation branch exists in this clone; the historical T884 commit/review objects are unavailable locally. This does not relinquish its original author's held work.
- Remove only T917's scheduling dependency and update its implementation basis. T884 retains its task, status, touches, acceptance, historical P2 descendant-cancellation finding and author. Its eventual rebase must preserve this no-browser planner and obtain its own fresh review.
- Allowed source paths are exactly T917's four existing paths. No browser journey, test assertion, timeout, benchmark, unrelated fixture or world rule may be changed. Task-tier checks and bounded planner inspection belong to the worker; the actual complete nonbrowser batch belongs to the fixed shared candidate; browser evidence belongs to post-push CI.
- One bounded worker and independent review; no long measurement or browser run during implementation. Preserve all previous failed/cancelled verification evidence and the other coordinator's heavy-lock ownership. This prerequisite does not authorize integrating held football work or bypassing the final gate.
