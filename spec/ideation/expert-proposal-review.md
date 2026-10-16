# IDEATION expert-proposal-review
> st:open@261016 | Assess the external r79 / rules 2.0.0 proposal against the playable club-owner archive game before choosing changes.

## vision
- Review material: the owner's supplied Korean proposal, titled “SSOT(r79 / Rules 2.0.0) based scenario, balance and UX improvement design”; its author read documents without playing the app. Its `[cite: n]` markers have no attached source map, so verify claims against repository evidence.
- Product anchor: the owner shapes a club through staff, watches football and revisits a continuing history across player generations (ARCH-1, CLUB-7, HIST-1/2). Assess each addition by the decisions and memories it creates, the interruptions it adds and how clearly its consequences can be understood.
- Review baseline: checkout 5e09bd7; WEB r80, CLUB r35, STAFF r20, ECON r37, LEAGUE r7 and HIST r9. A revision belongs to its domain; “r79” identifies WEB, not the whole specification.
- Evidence scope: current rules and selected implementation paths; an isolated synthetic Chromium career on the available local preview at 390×844. No existing user career opened. This review does not establish usability for other players or a newly measured economic balance.

## explored
- [o] Discussion scope: park balance changes for now, including difficulty, operating-cost and wage coefficients and their target bands. Settle the remaining delegation, narrative and UX candidates through conversation with the owner; no non-balance feature is adopted by this scope choice.
- [?] Overall assessment: useful problem discovery and promising owner stories; the coefficient tables, precise predicted outcomes and implementation phases remain hypotheses. Remaining feature adoption stays open.
- [?] Focused policy sheets: compare the existing focused-page journey with a sheet for a frequent narrow change, retaining one applied policy and the same review/apply meaning.
  - Already present: exact department entry, named return, retained task filters/comparisons/scroll and unapplied drafts (WEB-60/71/74; `apps/web/src/ui/taskMemory.ts`, `DirectionLines.tsx`, `StrategyBoard.tsx`; `tests/e2e/owner-workflows.spec.ts`).
  - Observed on the local preview: market → GK filter → recruitment policy → named return restores `/people?view=market` and the selected GK filter. Settled phone captures are `.tmp/proposal-review-home.png` and `.tmp/proposal-review-policy.png`.
  - Remaining hypothesis: less visual displacement helps people change a policy while thinking about a candidate. A phone sheet can obscure that candidate and still require scrolling; “zero context-switch cost” is unsupported.
  - Unresolved: an existing multi-department draft, apply breadth, dismiss versus discard, back navigation and live changes while editing. Unapplied academy criteria cannot claim a completed promotion or changed world state (WEB-75).
  - The proposed remedy-sheet inline “apply immediately” changes the current product workflow (WEB-42/44/71); it is not established merely by reusing an editor.
- [o] Delegation model: choose direct owner decision or staff delegation separately for each responsibility in one central settings screen, enabling combinations such as delegated sponsors/coaches with owner-appointed managers. Defaults and any shortcuts remain open. This changes the ideation direction; current WEB-45 and STAFF-13 remain in force until a later SSOT update.
- [o] Delegation granularity: seven responsibilities — manager appointments/renewals; staff appointments/renewals including director, scout and coaching departments; player renewals/improved contracts; player recruitment; player sale responses; academy promotion/release; sponsor contracts. Appointment and renewal share their responsibility; staff departments share one choice and academy promotion/release share one choice for this scope.
- [o] Business-decision clock stops follow responsibility: a direct owner decision stops for an answer; a delegated decision is processed by the responsible staff and reported without a decision-related stop. No independent stop toggle for each business decision. Match-eve and window-opening notifications are not settled by this choice; critical/error handling and timing when responsibility changes remain to specify.
- [x] A mandatory four-level ladder, whether reordered or supplemented only by core-approval pins, as the delegation model ← the owner chose individual responsibility selection to express the desired combination directly. Optional bulk presets remain undecided.
- [?] Delegation details: “automate sponsors/coaches but appoint my manager” is impossible under the current ladder, although manual actions remain available while delegated (WEB-45, STAFF-13).
  - The proposal usefully separates routine work from appointments with greater owner interest. Its claim that staff handle the core player's renewal at level 2 matches the current default.
  - Existing rationale to preserve where relevant: the current single-control policy deliberately replaced scattered switches; make effective responsibilities understandable in the chosen central screen (WEB chg r55, STAFF chg r14).
  - The proposed level 3 also moves ordinary sale responses into delegation while retaining owner bids and 150%+ untouchable offers. Decide those responsibilities explicitly rather than only renaming a level.
  - If pins remain candidates: define which XI determines a protected starter, appointments versus renewals versus replacement, pending approvals, switching levels and away progression. A level-4 pin adds stops to the current cash-only idle mode; its summary must state the effective responsibility.
  - Existing delegated untouchable offers can be decided by staff and manager (CLUB-24); 150% is not a universal owner-approval threshold.
- [?] Retired player → coach → manager: strongest proposed content fit for a game about the club's accumulated history and generations.
  - Preserve the person's actual identity, age and playing record through later roles; distinguish a training invitation, qualification, a vacancy and an appointment. A legend's playing quality need not guarantee coaching quality.
  - The supplied 150 appearances or five seasons, leader/professionalism eligibility, 20-unit course, age 33–38 and potential +10 are untested choices. Retirement can occur through 41 (CLUB-3), so setting a retiree's age to 33–38 would contradict his history.
  - A smaller candidate first scope is a qualifying retiree becoming a named coaching candidate with a visible playing-career link; later management is a separate expansion. Neither scope has been adopted.
  - Existing retained player careers and manager tenures are useful material (WEB-54/59, HIST-1), but a cross-role career and its continuity require explicit new product rules. “No complex new schema” is not evidenced.
- [?] Director–manager mediation: good owner decision when finance and football needs conflict; it must describe the actual reason an acquisition did not happen.
  - Current CLUB-33 deducts 3 trust when none of the opening requests was met by a qualifying arrival; it does not deduct 3 for every missed first-choice pick or every unfilled line. A qualifying alternative or loan can meet the window.
  - `packages/engine/src/signings.ts` judges the window and reports unmet requests; that alone does not establish a budget-blocked director versus manager conflict. Failed bids, unavailable candidates and an owner's own refusal need distinct accounts.
  - A promise for the next window needs its target, deadline, fulfilment and cancellation rules, including manager replacement and lack of eligible candidates; 0 now / −8 later is untested. Dismissing a card cannot erase its commitment.
  - A free agent can sign after the deadline (CLUB-4/17), but cannot retrospectively satisfy the completed window's current rule. Decide whether it provides a new reconciliation effect. “Owner emergency money” also needs a stated source and cost.
  - Decide which intervention levels require an answer; a mandatory mediation card on every missed request would add interruptions to long careers and change idle play.
- [?] Coach resignation affecting manager trust: a plausible consequence when a relationship or prior warning makes it legible; currently the proposed pride ≥70, two schools and −4 trust have no supporting relationship rule or measured balance.
  - Forced training already risks resignation at 15–60% and states that risk (STAFF-19). An additional manager penalty needs an understandable reason and advance consequence preview; otherwise it can make intervention harder to learn.
  - News must derive from recorded facts (HIST-11). Avoid asserting an interview or personal allegiance that the game has never established.
- [?] Long-term difficulty, parked outside this discussion: the measured lack of separation is real, but the desired meaning of difficulty comes before selecting a permanent penalty.
  - LEAGUE-13's 60/62.5/57.5/70% are careers with at least one top-flight title during 1950–2009, among 40 careers per level. They are not annual championship probabilities; title share after the first is about 21%. The extreme target is reaching the top flight, measured at 37/40, and is a different denominator.
  - Initial cash and XI no longer separate outcomes over long runs; it does not follow that all resulting careers become identical after 10–15 seasons. Growth, facilities, reputation and results remain path dependent.
  - WEB-3 says every rule, coefficient and chance is identical across levels and a shared seed makes the same world; LEAGUE-13 says tuning is shared. Difficulty-specific operating costs, wage demands and rival stature change that policy even when match probabilities are unchanged.
  - Owner choices remain open: retain “starting conditions” and revise the promised outcome bands, introduce a clearly disclosed lasting challenge, or examine common competitive dynamics for every level. The supplied 0.90–1.20 costs, 0.95–1.12 wage demands and +0–3 rival stature are experimental candidates, not calibrated solutions.
- [?] Wage/revenue mismatch, parked outside this discussion: ECON-29 records 40.0% below the 45–70% band on the 160-career measurement. Its newer 16-career facility-cost comparison records 41.8%; keep those samples separate.
  - Scope matters: the reference club is fully delegated at the default direction, youth-heavy and a net seller, with an explicit automatic facility-building policy. A single aggregate does not establish that every player's late game lacks financial decisions.
  - Other measured guardrails matter: operating result +9.7% after construction / +24.6% before it, net +17.0% including sales, and three bankrupt ESP amateur careers. The smaller new-cost sample has operating result +6.0% and one bankruptcy. A blanket cost increase can worsen those vulnerable careers.
  - The proposed reputation and stadium premiums can raise a renewal floor beyond 재계약 기조 표준's 110% market-wage cap, causing rejection, unhappiness and departures instead of the expected higher payroll (`packages/engine/src/contracts.ts:staffTalkVerdict`, CLUB-26/27/30). CLUB-30 already records an earlier larger agent premium producing a lower aggregate wage share.
  - Stadium capacity also opens naming-right income and changes upkeep and growth (ECON-8/9/32). Charging more solely for reaching 30,000 seats may make an earned upgrade feel like a penalty; separate the purpose of a prestige premium from filling an aggregate target.
  - “Precisely 50–58%” after +5–15% demands has no supplied experiment; the roadmap also narrows the existing 45–70% target to 45–65% without a reason. No result is guaranteed by those coefficients.
  - Candidate evaluation: segment wages, turnover, solvency, roster strength and title timing by country, division and career stage; compare a single proposed cause at a time on the same seeds, then check combinations and varied owner directions. Measure consequences of declined renewals as well as paid wages.
- [?] Mobile navigation and event entry: optional polish after observing actual navigation difficulty.
  - The current rendered labels are already 리그 / 컵 / 기록 / 홈 / 선수단 / 훈련 / 구단 (`apps/web/src/ui/App.tsx:TABS`); most shortening is done. Replacing 선수단 with 선수 can hide the staff destination.
  - 360/7 is not usable button width: side padding, gaps and minimum touch targets also consume the row (`App.module.css`). Dividers/group spacing require measurement at 360px and should not imply an unexplained taxonomy.
  - Combining an event trigger with the clock could reduce separate floating elements, but the existing clock row already contains date/status, play/pause, four pace choices and intervention (WEB-18). Preserve visibility of the stopped reason and stable control meanings; a status that unexpectedly turns into an action needs a clear label.
  - WEB r79 already combined notifications and news; r80 hides the floating launcher while a policy draft is rendered. Judge the proposal against those changes, not a presumed older screen.
- [?] Roadmap correction: `pnpm run benchmark` runs the storage/performance/retention harness, not the 160-career economic matrix. The calibration harness is `scripts/calibrate-economy.ts`; its reference matrix can be requested with `pnpm exec tsx scripts/calibrate-economy.ts --countries ENG,ESP,FRA,GER --levels easy,normal,hard,extreme --seeds 10 --seasons 60 --builds default --modes greedy`. This command was inspected, not executed in this review.
  - Passing contract tests cannot establish enjoyable delegation, and one 100-season career with a former-player manager cannot establish correct identity retention or appropriately rare progression. Verification must match each chosen policy and actual journey.

## shape
- Discussion scope: delegation, narrative and UX; balance is parked. Discuss delegation first, then narrative and policy access; the remaining order is adjustable by the owner.
- Delegation flow: open the central responsibility settings → choose direct or delegated for each responsibility → inspect who decides. Application timing, defaults and any bulk preset shortcuts remain open.
- Responsibility settings: seven direct/delegated choices in one central screen, with appointment/renewal and academy promotion/release grouped as adopted above.
- Business flow: owner-held decision → stop for the owner's answer; delegated decision → staff resolution and report. Match-eve/window-opening behaviour and unresolved-decision timing remain open.
- Candidate new-game defaults for discussion: owner handles manager appointments, player contracts, recruitment and sales; staff handle their appointments, the academy and sponsors. The player can change each responsibility; this default has not been selected.
- Candidate observation preferences for discussion: match-eve and window-opening stops separately selectable, with notices retained either way; proposed defaults are match-eve stop on and window-opening stop off. Neither the preferences nor their defaults have been adopted.
- Candidate story flow: know a player through his club career → retirement invitation → inspect his coaching candidacy and history → independently choose whether to employ him → revisit his combined career.
- Review boundary: assess and retain proposal material. No SSOT policy changes, coefficient changes, implementation tasks or code changes are authorized by selecting an idea for discussion.

## domains
- WEB: focused policy access, effective delegation responsibilities, event visibility and phone navigation; relate any future choice to WEB-45/60/71/74/75.
- LEAGUE: parked; difficulty's intended duration, reference-career outcomes and persistent challenge candidates.
- ECON: parked; wage share, operating result, insolvency and facility-growth tradeoffs measured on comparable samples.
- CLUB: renewal consequences, unmet requests and potential future promises; veteran eligibility for a second career.
- STAFF: owner versus director authority, relevant reactions and retired-player coaching/management candidacy.
- HIST: verifiable person continuity across playing and staff careers and fact-backed story presentation.
- SAVE: retained commitments and cross-role identities if adopted; compatibility and long-career retention must be assessed for the chosen scope.

## open
- Which responsibilities start direct/delegated in a new game?
- Should match eve and window opening stop the clock, and should those observation notifications have their own preferences?
- How do changes apply to pending decisions and existing careers, and what shortcuts belong in the clock/settings entry?
- Which narrative should be developed first: a former player's second career or mediation with an accountable future promise?
- Does the current focused-policy round trip interrupt a real recurring task enough to justify another presentation, and what improvement would demonstrate it?
- Parked for a later balance discussion: should difficulty describe the founding disadvantage or a challenge that still differs in season 60?
