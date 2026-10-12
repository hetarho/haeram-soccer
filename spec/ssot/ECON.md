# ECON Historical club economy
> r13 | Define the implemented browser-demo behavior for historical club economy.

## decisions
- ECON-1 [o] Money uses exact integer minor units in decimal-string DTOs. Debits are validated first; positive costs cannot create money.
- ECON-2 [o] Annual prices use country/year observed CPI where available. Before country coverage use an explicitly marked linked UK historical proxy; after coverage extrapolate 2 percent annually and label projection.
- ECON-3 [o] Catalog stores real data/provenance and observation status. Consumers show observed/estimated/projected; never call a proxy an actual national observation.
- ECON-4 [o] Existing fixed wages and sponsor payments stay nominal until renewal or currency conversion. Cash is not inflated automatically.
- ECON-5 [o] Currencies follow versioned period labels and verified conversion factors; euro book-money conversion is 1999 with ECB fixed national rates. Early missing monetary coverage is identified as normalized/estimated.
- ECON-6 [o] A currency change converts every live amount exactly once, keeps original historical transaction units, and applies explicit rounding.
  - live amounts: cash and the season's running totals; every running contract — players, manager, coaches, sponsor, campaigns; pending bids and offers; prices on offer — market candidates and free-agent managers and coaches.
  - completed ledger entries keep the currency they were made in.
- ECON-7 [o] Marketing options: local outreach, ticket campaign, merchandise, player promotion. Show cost/expected range and later realized income/net result; diminishing returns and demand constrain outcomes.
- ECON-8 [o] Sponsors offer guaranteed, performance-linked, exclusive, or inflation-linked terms; one main sponsor slot, declared annual payment/bonus/term, no repeated contract grant.
- ECON-9 [o] Match attendance and receipts use supporters, reputation, price and performance; no duplicate season-ticket or sponsor revenue.
- ECON-10 [o] Cash, income, expense, recurring wages, annual profit, budget runway and CPI-adjusted comparison are separate statistics.
  - the season ledger names every kind of income and expense, owner requests (→CLUB-20) and win bonuses included; a catch-all line holds only entries no current rule produces.
- ECON-11 [o] If operations produce negative cash, play continues with an explicit budget warning and the bankruptcy countdown (→ECON-24); optional local-support recovery is a bounded game action, not a real-money payment.

- ECON-12 [o] Business decisions present immediate spend, post-decision cash, recurring fixed-cost changes and fixed-cost runway excluding future revenue before commitment. Facility decisions also compare capacity, current demand and maintenance; costly facility upgrades require an in-app review of these real effects.
  - facilities have 20 levels; level L costs 250 × 1.38^(L−1) price units (250 → about 4,500 at 10 → 113,000 at 20) and upkeep is 180 + 40L + 5L² a year, so the top takes a career ← thirty cheap steps were too easy to climb
  - each level holds 5,000 more spectators (102,500 at 20); development reads facilities/27, the top bonus thirty levels used to give
  - a save built beyond 20 loads at 20

- ECON-13 [o] Marketing ranges separate total recovery from net profit and identify the four-round delay and uncertainty. Ticket drafts compare gate demand, income and hosting costs through the same gateProjection used by settlement; changing a draft has no game effect until applied.

- ECON-14 [o] Sponsor descriptions follow actual league payments: base installments use the total scheduled owned league fixtures and credit only post-contract games, without retroactive grants, performance bonus rewards league/lower wins and draws at home or away, exclusive contracts block new merchandise campaigns, and indexed amounts display their current effective value.

- ECON-15 [o] An active marketing campaign shows its paid cost, actual current cash and remaining settlement rounds. A hypothetical second debit is never labelled as its current or post-start cash; new-campaign forecasts remain separate from already committed spend.

- ECON-16 [o] Club operating policy has four ordered five-level settings; absent saves and absent keys resolve to the defaults, which reproduce pre-policy settlement exactly. ← ongoing choices stay easy while still changing the simulation
  | key | default | effect by level 1→5 |
  |---|---|---|
  | support | 3 | player wage ×0.85/0.92/1/1.1/1.2 · round development ×0.8/0.9/1/1.12/1.25 · round fatigue recovery −2/−1/0/+1/+2 |
  | recruitment | 3 | market offers age 17–21/18–25/18–30/23–31/26–33 · ability 35–65/38–75/40–85/50–88/60–92 · potential +12/+6/0/0/0 · transfer fee ×0.85/0.95/1/1.15/1.3 |
  | marketing | 1 | per-round spend 0/1/2.5/4.5/7 units (1901 prices, billed with operating costs) · fans +0/0.4/0.8/1.3/2% per settled round with the campaign saturation · gate demand +0/2/4/6/8% |
  | academy | 1 | per-round spend 0/1/2.5/4.5/7 units · intake +0/0/1/1/2 prospects · intake potential +0/3/5/8/11 · academy growth ×1/1.1/1.2/1.3/1.45 |
  - the support setting is shown as squad investment (선수단 투자): wages and the training and medical environment.
  - each combination of settings draws its own market list under its own IDs; a pending bid keeps its player and terms (→CLUB-14).
  - changing a level records a `policy` event and takes effect from the next settlement; reselecting the current level records nothing.
- ECON-17 [o] Ticket price is chosen from five presets over the existing ticket rule: 0.02/0.035/0.05/0.08/0.12 (1901 base price, 0.05 founding default). A non-preset price from an older save stays in force and is shown as custom.

- ECON-18 [o] Operations show a read-only cash projection to season end and to 365 days ahead as low–high ranges, carrying forward current contracts, wages, staff, policy, sponsor terms and gate demand, with labelled lines. Uncertain campaign results and new decisions are excluded; policy previews show the projection their level would produce.

- ECON-19 [o] League match income is sized for a 46-game season: gate receipts and result bonuses of league and lower-section matches are multiplied by 46 / own league games this season. ← season income must not depend on how many clubs share a division, and the 14-game lower section must not bankrupt a club that still pays a full year of wages
  - ENG 24-club divisions ×1, 20-club ×1.21, 18-club ×1.35, the 16-club amateur league ×1.53.
  - cup and European gates are not scaled; hosting costs are paid per actual match.
  - the gate projection, ticket previews and cash projection use the same factor.
- ECON-20 [o] When cash after a round's costs is non-negative but covers fewer than 13 rounds of fixed costs, a cash warning inbox item (→WEB-42) appears once per season with its weeks left and remedies. It is a status, never a stop: the HUD cash and a red band show it (→WEB-56).
- ECON-21 [o] Sponsors with business delegated (→STAFF-13): whenever the main sponsor slot is empty the commercial staff sign the stable offer at once and report it. Without delegation a season that starts without a sponsor posts a sponsor reminder (→WEB-42).

- ECON-22 [o] The club build — shown to the owner as the operating strategy (운영 전략, →WEB-60) — is six slots — 유스 정책, 스카우팅, 매각 기조, 수익 모델, 홈·팬, 라커룸 문화 — each holding one card: the standard card or one of four others, so 5^6 = 15,625 strategies before policy, staff or manager. ← combining levers is the fun: owners build their own club instead of picking one of a few presets Every card has at least one gain and one cost; additions add and multipliers multiply across slots. The owner drafts freely, sees combined effects, synergies (→CLUB-21) and odds before committing, and commits at most once per season (recorded as a build event titled 운영 전략 with the strategy's name: the preset's, the saved strategy's (→WEB-61), else 기본 전략 or 맞춤 전략).
  - at any time the owner may instead reserve a strategy for the next season (rules 1.13.0): it waits as the reservation, replacing any earlier one, and applies as the new season starts — that season's one change, recorded like a commit with its name; reserving the strategy already in force cancels the reservation. ← a change already used this season should not block planning the next
  - presets fill the slots in one tap; each has one identity and lights or aims at a synergy:
    | preset | cards (others standard) | aim |
    |---|---|---|
    | 동네의 자부심 | 성골 유스, 지역 인재 우선, 핵심 지키기, 회원제 운영, 지역 밀착, 가족 같은 클럽 | lights 우리 동네 아이들 |
    | 트레이딩 머신 | 1군 직행 경로, 데이터 스카우팅, 셀링 클럽, 철저한 경쟁 | lights 트레이딩 머신; 머니볼 with a spotter or negotiator scout and recruitment ≤ 2 |
    | 상업 제국 | 광역 네트워크, 상업 확장, 글로벌 브랜드, 스타 대우 | 상업 제국 with marketing 4+ and facilities 6+ |
    | 승격 올인 | 즉시 전력, 핵심 지키기, 구단주 투자, 홈 요새, 베테랑 리더십 | owner money and home strength now, youth growth given up |
    | 알뜰 생존 | 유소년 클럽 제휴, 지역 인재 우선, 강경 협상, 긴축 재정, 가족 관중, 베테랑 리더십 | player wages ×0.91 with morale held level, for small starts |
  | slot | card | effects |
  |---|---|---|
  | 유스 정책 | 성골 유스 | intake +1, intake potential +3; market candidates −1 |
  | 유스 정책 | 1군 직행 경로 | growth of players ≤ 21 ×1.2; morale baseline −1 |
  | 유스 정책 | 유소년 클럽 제휴 | intake +2; intake potential −2 |
  | 유스 정책 | 해외 유스 스카우트 | intake potential +5; intake −1 |
  | 스카우팅 | 데이터 스카우팅 | candidate potential +3, candidates +1; candidate ability −2 |
  | 스카우팅 | 즉시 전력 | candidate ability +4; player wages ×1.05 |
  | 스카우팅 | 광역 네트워크 | candidates +3; candidate potential −1 |
  | 스카우팅 | 지역 인재 우선 | home gate demand +2%, player wages ×0.97; candidates −1 |
  | 매각 기조 | 셀링 클럽 | other clubs' offers ×1.6, sale fees ×1.25; morale baseline −2 |
  | 매각 기조 | 쇼케이스 | offers ×1.3, sale fees ×1.1; morale baseline −1 |
  | 매각 기조 | 핵심 지키기 | morale baseline +2; offers ×0.5 |
  | 매각 기조 | 강경 협상 | sale fees ×1.15; offers ×0.8 |
  | 수익 모델 | 상업 확장 | new sponsor offers ×1.2, campaign income ×1.25, marketing fan growth ×1.2; home gate demand −3% |
  | 수익 모델 | 구단주 투자 | owner capital +2 a season (5); player wages ×1.05 |
  | 수익 모델 | 긴축 재정 | player wages ×0.94; morale baseline −2, candidate ability −2 |
  | 수익 모델 | 회원제 운영 | home gate demand +5%, supporters a win brings ×1.2; new sponsor offers ×0.9, owner capital −1 (2) |
  | 홈·팬 | 지역 밀착 | home gate demand +6%, supporters a win brings ×1.4; campaign income ×0.9 |
  | 홈·팬 | 홈 요새 | home strength +1.5, supporters a win brings ×1.1; marketing fan growth ×0.85 |
  | 홈·팬 | 글로벌 브랜드 | marketing fan growth ×1.3, new sponsor offers ×1.1; home gate demand −4%, home strength −0.5 |
  | 홈·팬 | 가족 관중 | home gate demand +4%, marketing fan growth ×1.1; home strength −0.5 |
  | 라커룸 문화 | 가족 같은 클럽 | morale baseline +3; player wages ×1.03 |
  | 라커룸 문화 | 철저한 경쟁 | growth of players ≤ 21 ×1.1; morale baseline −1 |
  | 라커룸 문화 | 스타 대우 | candidate ability +2, morale baseline +1; player wages ×1.1 |
  | 라커룸 문화 | 베테랑 리더십 | morale baseline +2; growth of players ≤ 21 ×0.9 |
  - signed sponsor contracts keep their amounts; a build changes new offers only.
  - a club vision stored by rules 1.6–1.7 loads as the cards its vision stood for at 1.8 (균형 운영 all standard, 유스 명가, 셀링 클럽, 상업 확장, 지역 밀착, 승격 올인 as then defined); it reads as a current preset only when the cards match one.

- ECON-23 [o] Supporters follow reputation, not the stadium: each league round they move 3% toward the following the reputation commands (800 × 1.085^reputation: about 2,000 at 12, 47,000 at 50, 1.2 million at 90), a win adds 0.4% × the build's win-fans effect, a defeat costs 0.1%, marketing and campaigns add theirs; there is no ceiling, never below 200. ← a fixed cap and compounding wins both broke the long game
  - the stadium limits only who can come in (gate receipts, →ECON-9); every supporter also pays a global fan income each league round of 0.001 × fans^0.85 price units (online, shirts, broadcast), one ledger line a season that grows each round, projected per round at today's following (→ECON-18)
- ECON-24 [o] Bankruptcy ends a career: each league round settled with negative cash counts one, getting back to zero or above resets the count; at 8 in a row, or at once when the debt passes half a season's fixed costs, the club goes bankrupt. ← debt used to freeze play behind an alert instead of ending it
  - the first round in debt posts a "파산 위기" inbox item (a status, not a stop); the HUD cash and a red band count the rounds left (→WEB-56)
  - a bankrupt club advances nothing and refuses every command but reading the inbox; the app shows the game-over page (→WEB-56)
- ECON-25 [o] Strategy areas pair each strategy card with the ongoing dials that spend on the same area (→ECON-22, →ECON-16, →ECON-17); the composer (→WEB-61) shows the cards by area and the 운영 다이얼 section (→WEB-60) the dials by the same areas, so cards and dials read as one plan:
  | area | strategy card (once a season) | dials (any time) |
  |---|---|---|
  | 선수단 | 라커룸 문화 | 선수단 투자, 훈련 방향 |
  | 영입 | 스카우팅 | 영입 기조 |
  | 매각 | 매각 기조 | — |
  | 유소년 | 유스 정책 | 유소년 투자 |
  | 수익 | 수익 모델 | 마케팅 |
  | 홈·팬 | 홈·팬 | 티켓 가격 |
  - the card says how the club goes about an area, the dial how much it puts in; presets and saved strategies only fill the six cards and leave the dials as set; the market slot is named 매각 기조 so it never reads like the 영입 기조 dial ← the build arrived after the policy board and duplicated its areas in a second, unstructured list
## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r13 261012 ECON-6✎ balances and outstanding obligations→every live amount (cash, running contracts incl. coaches, pending bids and offers, prices on offer incl. free-agent managers and coaches); ECON-10✎ +the season ledger names every kind of entry, owner requests and win bonuses included; ECON-16✎ level 3 consuming the market RNG identically with offer IDs `market:<year>:<i>` at every level→a list and IDs per combination of settings
- r12 261012 ECON-22✎ none→reservation for the next season at any time, applied as the season starts
- r11 261012 ECON-22✎ shown as 운영 전략, presets 균형 운영/유스 명가/셀링 클럽/상업 확장/지역 밀착/승격 올인→동네의 자부심/트레이딩 머신/상업 제국/승격 올인/알뜰 생존 each aiming at a synergy, build event names the strategy, 1.6–1.7 visions load as their 1.8 cards; ECON-25✎ build board pairing→composer cards and 운영 다이얼 section by the same areas
- r10 261012 ECON-11✎ +bankruptcy countdown; ECON-12✎ 30 levels at 200×L^1.5→20 levels at 250×1.38^(L−1), upkeep 180+40L→180+40L+5L²; ECON-20✎ cash warning stop→status; ECON-22✎ 이적 기조→매각 기조; ECON-23+ supporters follow reputation without a ceiling, global fan income; ECON-24+ bankruptcy after 8 rounds in debt; ECON-25+ build areas pair cards with dials
- r9 261011 ECON-19✎ lower section ×3.29→amateur league ×1.53
- r8 261010 ECON-22✎ one of six vision cards→a six-slot build of 25 cards (15,625 builds) with presets, combined previews and one commit a season
- r7 261010 ECON-16✎ three settings→four with academy investment, support shown as squad investment; ECON-22+ club visions
- r6 261009 ECON-19+ per-match income fixed→league income sized for a 46-game season; ECON-20+ cash warning before insolvency; ECON-21+ delegated stable sponsor and sponsor reminder
- r5 261008 ECON-18+ current-cash-only budgeting→season-end and one-year cash projection
- r4 261008 ECON-16+ ECON-17+ fixed-only operations and free-form ticket input→five-level support/recruitment/marketing policy and five ticket presets
- r3 261008 ECON-15+ active campaign hypothetical repeat debit→actual paid-cost/current-cash feedback
- r2 261008 ECON-12+ ECON-13+ ECON-14+ stacked businesscards with opaque recurring costs→compact investment planner and engine-backed budget effects
- r1 261007 initial
