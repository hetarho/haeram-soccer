# WEB Browser game delivery
> r33 | Validate football-enthusiast depth and repeat play in a responsive browser prototype before a paid mobile app.

## decisions
- WEB-1 [o] First release is a static, account-free Korean web game; Supabase and Flutter are deferred.
- WEB-2 [o] Play a fictional club founded in 1901 in the lowest supported professional division; choose country, name, colors, seed, and capital difficulty.
- WEB-3 [o] Capital presets are 2, 1, and 0.5 times the founding annual operating budget; all other initial conditions remain identical for a shared seed.
- WEB-4 [o] Dashboard, match observation, league/Europe, squad/market, manager, business, and history are playable views, with progress and actionable errors.
- WEB-5 [o] Advance one round, finish the current season, or follow automatic 1/3/5-day pacing; the public interface has no multi-season jump. Manager resignation and saving failure interrupt unattended progress.
- WEB-6 [o] Free local play has no real-money purchases, identity collection, analytics upload, sign-in, or automatic cloud submission.
- WEB-7 [o] New world creation with an existing save requires an explicit in-app replacement choice and offers export first.
- WEB-8 [o] A runtime error preserves a recoverable save and offers retry/export; do not replace failed loading with a new world.

- WEB-9 [o] Casual growth play follows docs/IMPROVEMENT-GUIDE.md: one-action matches, roster/tactic/fatigue tradeoffs, evidence-backed growth, and no guaranteed win claims.

- WEB-10 [o] Play uses a game HUD (menu, club crest, division/date, inbox, cash pinned top right) and, on mobile, a seven-tab safe-area bar with home raised in the centre: league, Europe and records on the left; squad, transfers and operations on the right. The match view has no tab (→WEB-40). The HUD menu lists only what the tab bar does not show (staff, season review) plus guide, intervention and save tools. The document never scrolls: HUD, clock and tab bar stay fixed and one content region scrolls between them; the match theatre fits that region at 360x740 and 390x844 CSS pixels and home may scroll vertically. Content never overflows the viewport or clips inside a panel; controls sharing a row share height and edges.
  - read-only ownership shows as a compact HUD badge that explains itself on tap, never a content banner.
  - the page background is a soft floodlit gradient without bands; sticky bars are translucent so no flat rectangle shows over it.
  - phones pack rows: no view repeats its tab's name as a title, and panels keep tight padding.

- WEB-11 [o] The core home shows season statistics (rank, squad strength, record; tapping them opens season detail with bulk actions), the facility/supporter scene (at least 180 CSS px tall so the club's stage stays readable) with the season statistics laid over its lower edge, a team-state card (→WEB-44), the next milestone and a next-match card with preparation and one watch action. Cash lives in the HUD; club news lives in the inbox.

- WEB-12 [o] Home presents the next achievable club milestone and its real progress, with an explicit collection of completed and upcoming milestones. Milestones cover debut, preparation, first win, earned player growth, facility investment, supporter reach, completed seasons and promotion.

- WEB-13 [x] Any open game dialog suspends automatic progression until all dialogs are closed. Each dialog owns a separate suspension source; closing one or changing another control cannot release another open dialog. Closing a dialog leaves progression stopped until the owner resumes.

- WEB-14 [o] The business view groups facilities, sponsors, marketing and tickets into compact selectable panels with current cash/fixed-cost context. The complete actual ledger remains an explicit detail sheet; budget alerts and bounded local-support recovery stay actionable.

- WEB-15 [o] Founding is a compact mobile screen with club name, country and capital choice, a recommended generous start, and one create action. The basic screen, including recovery/import tools and footer, fits 360x740 and390x844 without document scrolling across supported browser/platform font metrics. Text remains readable and primary touch targets stay at least44CSSpx; no overflow masking is allowed. Colors and reproducible seed are explicit advanced settings and may use necessary scrolling. Existing save hydration shows loading instead of a new-club form; invalid existing saves retain recovery/export paths.

- WEB-16 [o] First-session help explains optional match preparation, one-action observation, earned player growth and cost-bearing club investment. It derives completion from actual milestones, does not require a tutorial gate, and can be reopened from the menu.

- WEB-17 [o] The match theatre passes 360x740 and390x844 viewport bounds without masking essential overflow; home has no horizontal overflow and scrolls vertically when needed. Supporter count and small text remain readable; all primary buttons and selection controls, including match preparation, recruitment and league exploration, have touch targets of at least44 CSS pixels across Chromium, Firefox and Safari. Expanded records/settings may scroll; short screens or accessibility magnification can use necessary vertical scrolling.
- WEB-18 [o] One clock runs on every view as a single packed row: date and status on the left, play/pause plus 1-, 3- and 5-day paces (one step per second) on the right, the season's progress along its lower edge. The intervention gear (→WEB-45) joins the row on desktop home; phones reach it from the HUD menu. The match theatre carries its buttons in the scoreboard row. ← a fixed pace keeps cash and dates moving visibly; no step jumps to an arbitrary next event; changing views is not a reason to stop
  - stops only for event kinds enabled in the stop settings (→WEB-42), on the eve of an own match when match stops are enabled (resuming there plays the match through as a result), and when the season closes (→WEB-47).
  - a multi-day step ends on the day any club news arrives or our match is played, so the date lands on that day, and never runs past a match eve when match stops are on; only enabled kinds stop the clock.
  - otherwise only the owner's stop, watching, critical alerts, save/worker errors, read-only ownership and world replacement stop it; views and dialogs never pause it and a hidden tab pauses and resumes it.
  - watching a match stops it; leaving the match view resumes it when it was running before the watch or the watch came from a match-eve card.

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

- WEB-29 [o] History offers explicit local CSV downloads for the loaded selected-season/competition match sample, current-season or own-career player facts, and all completed own season summaries. Each dataset labels its time and competition scope, uses versioned stable identifiers and exact recorded values, and exposes its row count. CSV uses UTF-8 with a BOM, quote/newline escaping and formula-like text neutralization. Empty or still-loading datasets cannot be exported; exports perform no uploads and are distinct from recoverable game saves.

- WEB-30 [o] League standings initially show the leading 8 ranks plus the own-club row when outside that preview. Display the shown/full team counts and any rank gap, and offer one explicit expansion to all ranked clubs. Sorting and source facts remain complete; short previews reduce first-view layout cost on mobile and throttled devices.

- WEB-31 [o] Background automatic progression does not alternate the enabled state or appearance of manual match and preparation buttons. Foreground work, real save/worker errors, read-only ownership and critical club alerts remain explicit blockers. Manual observation stops automatic progress, waits for the current serialized operation to settle, and queues exactly one match (→WEB-18 for resuming); preparation initializes from the settled current roster without pausing the clock. Controls disable only while a player command is queued, never for automatic ticks.
- WEB-32 [o] Match presentation defaults to 1x with approximately 4 real seconds per simulated minute. Offer exactly 1x, 2x, 4x, 8x and 16x; the pace changes presentation only, preserves pause/seek behavior, and never changes settled outcomes or the game calendar.

- WEB-33 [o] All single-choice dropdowns use one app-styled trigger and option list matching the club journal palette. Preserve selected values, labels, disabled choices and current filter/command semantics.
  - Triggers and options have touch targets of at least44 CSS pixels; lists fit the viewport, scroll long samples, and remain usable inside dialogs.
  - Expose named combobox/listbox/option semantics, the selected state and visible keyboard focus. Support arrows, Home/End, text lookup, Enter/Space selection, Escape dismissal and return focus to the trigger; outside interactions dismiss the list.
  - Opening or browsing choices submits no game command and changes no world facts. Only committing a choice invokes the existing selection handler.

- WEB-34 [x] A persistent quick-action launcher lets users open tactics/lineup preparation, training, player management and club investment while retaining the current match or league view and its selections.
  - On mobile, place a floating launcher at the lower right above the safe-area menu; on desktop, expose a labeled launcher near the lower right. Neither covers essential match, navigation or primary controls.
  - Opening the menu or an intervention sheet suspends automatic progression through independent suspension ownership; closing does not restart it. Read-only ownership, foreground work, errors and critical alerts remain command blockers.
  - Preparation, training and investment sheets act through the existing engine commands. During recorded match observation, disclose that lineup/tactic/training changes affect subsequent fixtures and never rewrite the displayed settled match.
- WEB-35 [o] Motion animates major interface transitions: screen and tab changes, dialogs, dropdowns, quick actions, disclosures and committed feedback. Use short opacity/transform motion without delaying controls, altering simulation clocks or replaying entrance motion on every automatic tick.
  - Honor prefers-reduced-motion, keep focus/accessible state authoritative during transitions, cancel detached animations and preserve existing entry-size, input-latency and rendering budgets.

- WEB-36 [o] Every committed player decision shows an outcome card built from recorded facts only: changed date, cash (with delta), supporters, rank, squad size, facilities, applied tactic, training, manager trust or manager, reputation, ticket price, and up to two new engine records.
  - automatic clock ticks never produce a card; `next-match` never does, because live playback reveals the result.
  - decisions made inside sheets are summarized together after every dialog closes, against the world each decision published.
  - reading inbox items never produces a card.
- WEB-37 [o] Actions state their consequence before commit. Watch actions show the days advanced before kickoff; bulk progression names what it settles; manager hiring and player sale confirm spend, departures, tactic and squad-size changes.
- WEB-38 [o] Visual language is a dark night-stadium game theme from shared colour tokens: HUD, pressable 3D buttons, card frames and gold/green accents across every view.
- WEB-39 [o] Operations open with a policy board (→ECON-16 →ECON-17) of support, training, recruitment, marketing and ticket dials with 3–5 named steps. Tapping a step previews its cost change, multipliers, offer profile or gate range; only an explicit apply sends the command.
- WEB-40 [o] Squad, transfer market and manager office are one segment group. The match view opens only from a watch action (home next-match card or match-eve card), has no league tabs and opens preparation as a sheet; opening its address without a live playback returns home. League views own overview, standings, round results, rank trend, scorers and scorer trend as tabs on every viewport, never a dropdown. Sheets never link to another destination.
  - overview is the own-league dashboard (race position, gaps, form, next rival) with the fixture notebook (→WEB-26).
  - standings shows the league selector and the table only.
  - round results mark the own fixture with an accent and an "우리 팀" badge.
- WEB-41 [o] Standings columns read rank, club, points, played, won, drawn, lost, goals for, goals against, goal difference, then movement and recent form. Mobile hides movement and recent form so points stay visible at 360 CSS pixels.

- WEB-42 [o] Club events (match eve, window opening/closing, bid answers, offers for our players, youth intake, staff reports, cash and sponsor warnings) are inbox items. Enabled kinds stop the clock and show an event card with the decision it needs (watch or play through, accept or reject, open the market with its ceremony →WEB-48, the academy or operations); every item stays readable in the HUD inbox. Which kinds stop is a per-browser setting. Home shows the event card; other views fold it into a small pill that opens the card, so a pending event never covers the view.
- WEB-43 [o] The squad group has roster, academy, transfer market and staff segments. The market shows the window, bids in progress with counters and incoming offers; the staff view shows each department, its trait and effect, replacements with cost, and delegation switches.

- WEB-44 [o] Home separates statistics from state. The team-state card shows starters' fatigue, squad morale, cash runway and squad size with good/ok/warning/critical tones; the most urgent warning explains its effect, offers two one-tap remedies and a "more" entry.
  - tapping any state opens its remedy sheet with 3–6 choices, each stating cost, effect and cooldown before commit; unavailable choices say why (cooldown, cash, already applied).
  - fatigue: recovery training, rest selection, rest day, intensive care, preparation sheet. morale: squad support up, team dinner, special bonus, owner's visit, rest day. cash: less marketing, less squad support, higher ticket price, friendly match, owner capital, the market. squad: market, academy, promote the best prospect.
  - choices act through engine commands (→CLUB-20 for care actions); navigation choices open their view.
- WEB-45 [o] One intervention level sets which events stop the clock and what the staff decides. Per-event stops remain as detail settings; mixed settings show as custom.
  | level | stops | delegated (→STAFF-13) |
  |---|---|---|
  | 1 every decision | all | nothing |
  | 2 important decisions (new-club default) | match eve, window opening, bids, youth intake, cash/sponsor | training, academy |
  | 3 transfers only | window opening, bids, cash/sponsor | training, academy |
  | 4 leave it to the staff | cash/sponsor only | training, academy, offers, sponsors |
- WEB-47 [o] Whenever a season closes (clock, watching or bulk action) the clock stops and the app opens the season review at /season: a compact page of recorded facts that reads like a football analytics season summary.
  - hero band: crest, club, division move, final rank of the division size and last season's rank.
  - KPIs: points and points per match, W-D-L and win rate, goals and goal difference, xG minus xGA with both totals, expected points against actual, supporters and their change.
  - cumulative league points against cumulative expected points by matchday.
  - attack: goals and xG (per match), goals minus xG, shots per match, on-target share, conversion. defence: goals against and xGA (per match), xGA minus goals against, clean sheets, save share, PPDA. control: average possession, pass accuracy, passes and tackles+interceptions per match, home and away records.
  - records (longest unbeaten and winning runs, biggest win and defeat) and leaders (goals, assists, tackles+interceptions, minutes, saves; top three each).
  - season income, expense, net and season-end cash with any rank prize, in that season's currency; the new season's division, cash, annual cost, sponsor and window as chips; the primary action opens the window ceremony while the window is open, otherwise the market.
  - league matches only. Expected points use each match's two xG totals as independent Poisson means (3 per win, 1 per draw); PPDA is approximated over the whole pitch as opponent passes per own tackle or interception. Matches without recorded xG (older rules) are left out of xG figures and the page says how many counted.
- WEB-48 [o] A transfer window opening is a full-screen moment: floodlights and confetti, the window name, deadline and days left, cash to spend, available candidates and squad size, then "enter the market" or "later". Both mark the opening event read; reduced motion shows the scene still. It opens from the season review and from the window-opening event card.
- WEB-46 [o] Motion: screens slide in from the side of the chosen tab; panels, cards and list items rise in with short staggers when inserted or shown; dialogs and event/outcome cards animate both in and out on every close path; selected tabs and changed state values pop; HUD cash counts toward its new value and flashes its direction. Automatic ticks never replay entrances, and reduced motion lands every state immediately.

- WEB-49 [o] Every club has a crest: shield shape, field pattern, primary and secondary colour and an emblem, derived from the world seed and club ID.
  | part | values |
  |---|---|
  | shape | 6 |
  | pattern | 10 |
  | colours | 24-colour palette, 360 ordered pairs whose contrast ratio is at least 1.8 |
  | emblem | 20 |
  - 432,000 combinations; clubs are assigned in stable ID order with probing so no two clubs share colour pair and pattern while the world holds fewer than 3,600 clubs. ← low-contrast pairs hide the pattern and make crests look alike
  - the player club keeps its founding colour as primary.
  - crests and colours appear wherever clubs are named: HUD, home fixture, event cards, standings, round results, fixture notebook, match scoreboard and pitch kits (the away kit switches to its secondary colour when the primaries clash).
- WEB-50 [o] The match theatre stacks one row with the back-home control, the scoreboard with crests (short names on phones) and the clock buttons; minute/latest action with speed chips (1x–16x); the pitch, which takes the height the other rows leave on a phone (tap or the corner button pauses); the latest event; live charts; and two actions.
  - charts switch between rolling 10-minute possession share, cumulative xG with goal marks and cumulative shots; they reveal data only up to the presented minute.
  - actions: preparation and the primary action, which reads "결과 보기" while the match plays and "다음 경기 관전" after it ends.
  - details (moments, report, scrubber, player inspector, stats) open from the chart header.
  - while a live playback is unfinished, home's watch action reads "경기로 돌아가기" and returns to it instead of starting another match.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r33 261009 WEB-10✎ full HUD menu→non-tab destinations only, banded background→floodlit gradient, phone rows packed; WEB-11✎ separate statistics row→overlaid on the scene; WEB-18✎ two-row home clock and buttons-only pill→one packed row on every view, steps end on any news or match day; WEB-47✎ result/finance cards→compact analytics review (xG, expected points, finishing, keeping, PPDA, records, leaders); WEB-50✎ header row→back, scoreboard and clock in one row, pitch fills the phone height
- r32 261009 WEB-10✎ match tab→Europe tab, home/match fit→match fits and home scrolls, read-only banner→HUD badge; WEB-11✎ shrinking scene→180px minimum; WEB-17✎ home+match bounds→match bounds; WEB-18✎ home-only clock paused elsewhere→clock on every view with buttons-only control, watch resumes; WEB-31✎ resume reference; WEB-32✎ 1–8x→1–16x; WEB-40✎ match tab and table+overview tab→watch-only match view, overview and standings tabs, own round result badge; WEB-41✎ played-first columns→points-first with goals for/against; WEB-42✎ home-only event cards→card on home, pill elsewhere; WEB-44✎ two remedies→remedy sheets of 3–6 choices; WEB-49+ club crests; WEB-50+ match theatre controls and live charts
- r31 261009 WEB-5✎ day/next-match pacing→1/3/5-day pacing; WEB-18✎ next-event pace→1/3/5-day paces stopping only for enabled events and at season close; WEB-36✎ inbox reading produces no card; WEB-42✎ cash and sponsor warnings, market opens with its ceremony; WEB-45✎ level 4 no stops→cash/sponsor stops and delegated sponsors, levels 1–3 stop for cash/sponsor; WEB-47+ season review page; WEB-48+ transfer window ceremony
- r30 261009 WEB-10✎ five tabs→seven with home centred and transfers separate; WEB-11✎ fatigue tile and news card→record tile, team-state card, news in inbox; WEB-18✎ clock everywhere→home-only clock with mini clock elsewhere, capped three-day steps; WEB-44+ team state and remedies; WEB-45+ intervention levels; WEB-46+ motion system
- r29 261008 WEB-18✎ next-match pace→next-event pace with event and match-eve stops; WEB-42+ event cards and inbox; WEB-43+ academy, market negotiations and staff views
- r28 261008 WEB-13- dialog suspension removed; WEB-18✎ hidden tab requires restart→pause and resume; WEB-31✎ preparation pauses→clock keeps running, controls gate on queued player commands; WEB-10✎ page scroll→fixed shell with one content scroller; WEB-40✎ mobile statistics dropdown→five league tabs
- r27 261008 WEB-10✎ compact chrome and 4+more menu→game HUD with pinned cash and five tabs; WEB-11✎ cash tile→rank tile and news card; WEB-18✎ settings sheet→game-speed buttons; WEB-34- quick-action launcher removed; WEB-36+ outcome cards; WEB-37+ consequence previews; WEB-38+ game theme; WEB-39+ policy board; WEB-40+ grouped routing; WEB-41+ mobile standings columns
- r26 261008 WEB-5✎ chosen multi-season jumps→current-season and ordinary pacing; WEB-34+ contextual quick intervention; WEB-35+ interface motion
- r25 261008 WEB-33+ platform option menus→shared styled accessible dropdowns
- r24 261008 WEB-31+ automatic-tick button flashes→stable foreground admission; WEB-32+ 45-second replay and three rates→4 seconds/minute at 1x and four rates
- r23 261008 WEB-30✎ preview 12→8 leading ranks to retain first-view responsiveness under the reference throttle
- r22 261008 WEB-30+ full initial standings layout→12-rank preview with own-club context and explicit full expansion
- r21 261008 WEB-29+ save-envelope export only→scoped local match/player/season CSV analysis downloads
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
