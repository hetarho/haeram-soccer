# WEB Browser game delivery
> r20 | Define the implemented browser-demo behavior for browser game delivery.

## decisions
- WEB-1 [o] First release is a static, account-free Korean web game; Supabase and Flutter are deferred.
- WEB-2 [o] Play a fictional club founded in 1901 in the lowest supported professional division; choose country, name, colors, seed, and capital difficulty.
- WEB-3 [o] Capital presets are 2, 1, and 0.5 times the founding annual operating budget; all other initial conditions remain identical for a shared seed.
- WEB-4 [o] Dashboard, match observation, league/Europe, squad/market, manager, business, and history are playable views, with progress and actionable errors.
- WEB-5 [o] Advance one round, finish the season, or advance a chosen number of seasons; manager resignation and saving failure interrupt unattended progress.
- WEB-6 [o] Free local play has no real-money purchases, identity collection, analytics upload, sign-in, or automatic cloud submission.
- WEB-7 [o] New world creation with an existing save requires an explicit in-app replacement choice and offers export first.
- WEB-8 [o] A runtime error preserves a recoverable save and offers retry/export; do not replace failed loading with a new world.

- WEB-9 [o] Casual growth play follows docs/IMPROVEMENT-GUIDE.md: one-action matches, roster/tactic/fatigue tradeoffs, evidence-backed growth, and no guaranteed win claims.

- WEB-10 [o] Mobile play uses compact club/date/save chrome and a safe-area bottom menu; long statistics, settings, and archives are opened explicitly. Core home and match controls target no page scroll at 360x740 and 390x844 CSS pixels.

- WEB-11 [o] The core home shows a facility/supporter-driven club scene, current rank, cash, squad readiness, next opponent, and one next-match action together. Full journal statistics and bulk season actions open explicitly; save tools remain accessible in the menu.

- WEB-12 [o] Home presents the next achievable club milestone and its real progress, with an explicit collection of completed and upcoming milestones. Milestones cover debut, preparation, first win, earned player growth, facility investment, supporter reach, completed seasons and promotion.

- WEB-13 [o] Any open game dialog suspends automatic progression until all dialogs are closed. Each dialog owns a separate suspension source; closing one or changing another control cannot release another open dialog. Closing a dialog leaves progression stopped until the owner resumes.

- WEB-14 [o] The business view groups facilities, sponsors, marketing and tickets into compact selectable panels with current cash/fixed-cost context. The complete actual ledger remains an explicit detail sheet; budget alerts and bounded local-support recovery stay actionable.

- WEB-15 [o] Founding is a compact mobile screen with club name, country and capital choice, a recommended generous start, and one create action. The basic screen, including recovery/import tools and footer, fits 360x740 and390x844 without document scrolling across supported browser/platform font metrics. Text remains readable and primary touch targets stay at least44CSSpx; no overflow masking is allowed. Colors and reproducible seed are explicit advanced settings and may use necessary scrolling. Existing save hydration shows loading instead of a new-club form; invalid existing saves retain recovery/export paths.

- WEB-16 [o] First-session help explains optional match preparation, one-action observation, earned player growth and cost-bearing club investment. It derives completion from actual milestones, does not require a tutorial gate, and can be reopened from the menu.

- WEB-17 [o] Core home and match pass 360x740 and390x844 viewport bounds without masking essential overflow. Supporter count and small text remain readable; all primary buttons and selection controls, including match preparation, recruitment and league exploration, have touch targets of at least44 CSS pixels across Chromium, Firefox and Safari. Expanded records/settings may scroll; short screens or accessibility magnification can use necessary vertical scrolling.
- WEB-18 [o] Mobile progression exposes daily, three-day and next-match paces through explicit settings. Hiding the browser document suspends automatic progression and returning requires an explicit restart; switching in-app statistics does not stop the shared clock.

- WEB-19 [o] Browser responsiveness and storage verification claims under →ARCH-14 and →ARCH-28 identify the actual checked source and build. Include application entry/public inputs; the measured preview must serve the same entry and assets as the recorded build. A changed source, changed asset inventory or mismatched served build invalidates the run.

- WEB-20 [o] Pre-match preparation offers an explicit opponent dossier with the next fixture, current opponent tactic from engine rules, own-league season form and head-to-head outcomes within the latest 30 own matches. Show competition and sample scope, leave unknown form empty, and never invent predictions. Football enthusiasts can inspect evidence without changing world facts; the home remains compact.

- WEB-21 [o] Preparation offers a four-tactic laboratory over the currently previewed valid lineup and the real next-opponent tactic. Compare engine fit, average match fatigue cost, and possession/pass/shot/defense modifiers relative to the applied tactic using percentage-point units. Selecting a preview never applies tactics or settles a fixture; existing manager negotiation remains the only application path.

- WEB-22 [o] Completed live matches and archived matches expose an explicit final analysis report with both teams' pass accuracy, shot accuracy and goal conversion, showing each numerator and denominator. Display own-player recorded contributions without synthetic ratings. Final analysis stays hidden until live playback reaches the end or the user explicitly selects the result; absent samples display an unavailable value.

- WEB-23 [o] After a live result has been revealed, or while viewing an archived match, explicit detail offers touchable kickoff, halftime, final-whistle and recorded-goal navigation. Seeking pauses presentation and preserves settled results and the game date. Goal buttons show recorded running scores in chronological order; historical playback never fabricates minute-level action statistics.

- WEB-24 [o] Own-roster analysis supports role, name and minimum-minute filters and sorting by ability, minutes, fatigue and goals per 90. Player details follow the selected current-season or own-club career scope, expose totals and 90-minute rates with real minute denominators, and mark samples below 180 minutes. Zero minutes yield no defined rate and never rank above observed rates; sold and retired players remain available in career scope.

- WEB-25 [o] The roster offers an explicit two-player comparison sheet using distinct retained own-player IDs. Both players share one season or career scope, exposing role, current or last-retained skills, fatigue, actual minutes, and normalized production. Inactive players are selectable only for career analysis and carry their retained-status label; comparison is read-only and gives no invented overall match rating.

- WEB-26 [o] League exploration includes an explicit own-club current-season fixture notebook with upcoming/completed/all, competition and home/away filters. Merge known fixture sources by stable ID, order by game-calendar dates, and paginate without dropping facts. Settled-score cards preserve home/away orientation, and completed records can be read from the full requested season archive. Explain that cup/playoff schedules become available when generated; never invent future fixtures.

- WEB-27 [o] History offers explicit selected-season home/away analysis over the full season archive after the competition filter. Show regulation-time wins/draws/losses, goals, per-match output and recorded pass/shot ratios with denominators and sample size, plus the latest ten filtered goal differences in calendar order. Scope changes show loading or an actionable read error until matching archive data arrives; never display the previous season's data under a new label or imply causality.

- WEB-28 [o] History offers a read-only career record book derived from all retained own season summaries and player career totals. Season records cover best division/rank, points per league match, goals per league match and season-end supporters, each with year, division and sample size. Player leaders include retained active/sold/retired identities and disclose all-competition own-club totals. Ties choose the earliest retained season or stable player ID; empty records remain unclaimed and viewing grants no rewards.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r20 261008 WEB-28+ separate history graphs→contextual season records and durable own-player leaders
- r19 261008 WEB-27+ season overview and match table→sample-aware home/away splits and filtered form chart
- r18 261008 WEB-26+ round tables only→filterable own-club fixture cards and archived result access
- r17 261008 WEB-25+ individual profiles only→two-player skill and scoped production comparison
- r16 261008 WEB-24+ name-only roster and fixed career details→scoped role/sample filters and 90-minute player rates
- r15 261008 WEB-23+ slider-only replay→touchable recorded goal and period navigation
- r14 261008 WEB-22+ aggregate counters only→completed-match rates and own-player contribution report
- r13 261008 WEB-21+ fit-only tactic cards→explicit engine modifier and fatigue comparison laboratory
- r12 261008 WEB-20+ opponent label only→scoped opponent form and recent head-to-head dossier
- r11 261008 WEB-15✎ compact mobile founding→complete basic screen bounds across supported browser/platform font metrics
- r10 261008 WEB-19+ local-build-only provenance→current source and served-build identity with changed-input rejection
- r9 261008 WEB-17✎ 44px core controls→44px primary buttons and native selection controls across preparation, recruitment and league exploration
- r8 261008 WEB-17+ WEB-18+ stacked pitch panels and hidden mobile paces→compact match theatre, explicit detail/settings and lifecycle pause
- r7 261008 WEB-15+ WEB-16+ long founding questionnaire and warm-load form flash→compact start, optional advanced setup and fact-aware play guide
- r6 261008 WEB-14+ stacked businesscards with opaque recurring costs→compact investment planner and engine-backed budget effects
- r5 261008 WEB-13+ per-feature dialog pause→shared source-counted dialog progression guard
- r4 261008 WEB-12+ generic next-score prompt→fact-backed growth roadmap and milestone collection
- r3 261008 WEB-11+ information-first journal→one-screen growing club home and explicit journal detail
- r2 261007 WEB-9+ WEB-10+ desktop-first play→compact mobile shell with explicit growth and strategy gates
- r1 261007 initial
