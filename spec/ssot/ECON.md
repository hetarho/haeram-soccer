# ECON Historical club economy
> r31 | Define the implemented browser-demo behavior for historical club economy.

## decisions
- ECON-1 [o] Money uses exact integer minor units in decimal-string DTOs. Debits are validated first; positive costs cannot create money.
- ECON-2 [o] Annual prices use country/year observed CPI where available. Before country coverage use an explicitly marked linked UK historical proxy; after coverage extrapolate 2 percent annually and label projection.
- ECON-3 [o] Catalog stores real data/provenance and observation status. Consumers show observed/estimated/projected; never call a proxy an actual national observation.
- ECON-4 [o] Existing fixed wages and sponsor payments stay nominal until renewal or currency conversion. Cash is not inflated automatically.
- ECON-5 [o] Currencies follow versioned period labels and verified conversion factors; euro book-money conversion is 1999 with ECB fixed national rates. Early missing monetary coverage is identified as normalized/estimated.
- ECON-6 [o] A currency change converts every live amount exactly once, keeps original historical transaction units, and applies explicit rounding.
  - live amounts: cash and the season's running totals; every running contract — players, manager, coaches, sponsor, campaigns; pending bids and offers; prices on offer — market candidates and free-agent managers and coaches.
  - completed ledger entries keep the currency they were made in.
- ECON-7 [o] There are no marketing campaigns to start: local outreach and ticket campaigns became 주변 투자 and the ticket price, merchandise and player promotion 해외 마케팅 (→ECON-16, →ECON-34). A campaign started before rules 1.19 settles as before, with its realized income and net result (→ECON-15). ← two ways to grow the following, not three
- ECON-8 [o] Commercial income comes from sponsor contracts, one per slot, each signed for 2–5 seasons at an annual amount fixed for its term plus the slot's bonus; offers are valued at signing from the division, reputation, last season's finish, the following (with diminishing returns) and the football index (→ECON-26), so commercial income grows only when a contract is renewed or replaced. ← a sponsor paying more every round as supporters grew had no ceiling
  | slot | opens (ENG; other countries in the catalog) | share of the club's commercial value | bonus |
  |---|---|---|---|
  | 지역 후원 (local partners) | always | 10% | - |
  | 용품 후원 (kit supplier, shirt sales included) | 1970 | 25% | promotion or title |
  | 메인 스폰서 (shirt front) | 1979 | 45% | league wins and draws (→ECON-14) |
  | 경기장 명명권 (stadium naming) | 1997, a stadium of 30,000+ (→ECON-32) | 15% | - |
  | 소매 스폰서 (sleeve) | 2017 | 10% | - |
  - each offer keeps one of the existing kinds: guaranteed, performance-linked (lower base, larger bonus), exclusive (holds the merchandise rights: 해외 마케팅 adds half its fans while it runs) or inflation-linked; one contract per slot, no repeated grant.
  - a relegation lowers every running contract's remaining seasons by 30%; a promotion raises nothing before renewal.
  - slots open by year and country from a source-attributed catalog, marked estimated where it is (→ECON-3).
  - the 지역 후원 slot's offers grow with 지역 기반, every other slot's with 글로벌 인지도 (→ECON-34).
- ECON-9 [o] Match attendance comes from the club's local supporters, its division, form, the opponent and the ticket price, within the stadium's capacity; receipts are attendance × price; no duplicate season-ticket or sponsor revenue. ← a global following of millions filling any stadium made the gate limitless
  - local supporters are bounded by the club's catchment: its city, its division and its stature (giants and big clubs larger, →LEAGUE-10); the global following (→ECON-23) feeds sponsor values, not the gate.
  - targets (ENG; other countries by their football index →ECON-26) for a club established in its division, its reputation at the division's usual level, calibrated with →ECON-29 and then recorded as measured: average league attendance 20–45k in the top flight by era, 8–20k in the second tier, 4–10k in the third, 0.3–2k in the amateur league; a club that rose faster than its following draws less, and the reference club's own crowds are recorded beside the targets.
  - measured 261013 (England-equivalent): established clubs 34,500 / 13,800 / 5,300 / 970; the reference club in at least its third straight season 25,000 / 7,100 / 3,200 / 890.
  - 주변 투자 adds its gate demand while paid, and 지역 기반 up to +10% (→ECON-16, →ECON-34).
- ECON-10 [o] Cash, income, expense, recurring wages, annual profit, budget runway and CPI-adjusted comparison are separate statistics.
  - the season ledger names every kind of income and expense, owner requests (→CLUB-20) and win bonuses included; a catch-all line holds only entries no current rule produces.
- ECON-11 [o] If operations produce negative cash, play continues with an explicit budget warning and the bankruptcy countdown (→ECON-24); optional local-support recovery is a bounded game action, not a real-money payment.

- ECON-12 [o] Business decisions present immediate spend, post-decision cash, recurring fixed-cost changes and fixed-cost runway excluding future revenue before commitment. Facility decisions also compare capacity, current demand and maintenance; costly facility work requires an in-app review of these real effects.
- ECON-32 [o] Facilities are three parts built separately: the stadium (경기장), the training ground (훈련장) and the academy facilities (유소년 시설). Costs are units on the football index (→ECON-26), paid when the work starts; the ladders together cost about what one 20-level facility once did, so the whole takes a career in every era. ← real grounds grow stand by stand and by moving to new stadiums, and a training complex is a decision of its own, not a by-product of seats
  - the stadium climbs eight steps, each an expansion (증축: a new or second-tier stand, 180 days, the ground holding 10% fewer while it is built) or a rebuild (재건축: a new stadium, 540 days, the old ground in full use until the new one opens):
    | step | becomes | capacity | work | cost |
    |---|---|---|---|---|
    | founding | 동네 구장 | 2,500 | - | - |
    | 1 | 관중석 증축 | 5,000 | 증축 | 250 |
    | 2 | 새 구장 | 10,000 | 재건축 | 400 |
    | 3 | 스탠드 증축 | 15,000 | 증축 | 600 |
    | 4 | 현대식 구장 | 30,000 | 재건축 | 4,000 |
    | 5 | 2층 스탠드 | 40,000 | 증축 | 8,000 |
    | 6 | 대형 경기장 | 60,000 | 재건축 | 70,000 |
    | 7 | 코너 증축 | 75,000 | 증축 | 245,000 |
    | 8 | 명문 구장 | 90,000 | 증축 | 965,000 |
  - the training ground and the academy facilities have levels 1–5, each 90 days of work:
    | level | training ground cost | development base | academy cost | intake | intake potential | academy growth |
    |---|---|---|---|---|---|---|
    | 0 | - | +0 | - | +0 | +0 | ×1.0 |
    | 1 | 500 | +0.06 | 400 | +0 | +1 | ×1.05 |
    | 2 | 5,000 | +0.2 | 4,000 | +1 | +2 | ×1.12 |
    | 3 | 40,000 | +0.37 | 32,000 | +1 | +3 | ×1.22 |
    | 4 | 300,000 | +0.53 | 240,000 | +1 | +4 | ×1.35 |
    | 5 | 1,150,000 | +0.75 | 980,000 | +1 | +4 | ×1.5 |
  - the development base adds to each round's growth base (→CLUB-12) and, ×27/4, to the summer development of players under 27; the academy's terms add to the intake and its growth (→CLUB-16).
  - upkeep a year: the stadium 180 + 40L + 5L² units with L = (capacity − 2,500) / 5,000, the training ground and the academy 0, 40, 120, 300, 600 and 1,000 units by level; a part's upkeep and effect change when its work ends. One work at a time per part.
  - a save with the single facility level F loads as the highest stadium step whose capacity is at most 2,500 + 5,000F, and a training ground and academy level of F/4 rounded, at most 5.

- ECON-13 [o] Marketing ranges separate total recovery from net profit and identify the four-round delay and uncertainty. Ticket drafts compare gate demand, income and hosting costs through the same gateProjection used by settlement; changing a draft has no game effect until applied.

- ECON-14 [o] Each sponsor contract (→ECON-8) pays and describes itself by actual league payments: base installments use the total scheduled owned league fixtures and credit only post-contract games, without retroactive grants, performance bonus rewards league/lower wins and draws at home or away, an exclusive contract halves 해외 마케팅's fan growth while it runs, and indexed amounts display their current effective value.

- ECON-15 [o] An active marketing campaign shows its paid cost, actual current cash and remaining settlement rounds. A hypothetical second debit is never labelled as its current or post-start cash; new-campaign forecasts remain separate from already committed spend.

- ECON-16 [o] Club operating policy has ordered settings, the dials of the 방향 board (→ECON-25); absent saves and absent keys resolve to the defaults, which reproduce pre-policy settlement exactly. ← ongoing choices stay easy while still changing the simulation
  | key | default | effect by level 1→5 |
  |---|---|---|
  | support | 3 | contract talks: goodwill −5/0/+5/+10/+15% (→CLUB-26) · round development ×0.8/0.9/1/1.12/1.25 · round fatigue recovery −2/−1/0/+1/+2 · operating expenses ×0.9/0.95/1/1.1/1.2 (→ECON-30) |
  | recruitment | 3 | market offers age 17–21/18–25/18–30/23–31/26–33 · ability 35–65/38–75/40–85/50–88/60–92 · potential +12/+6/0/0/0 · transfer fee ×0.85/0.95/1/1.15/1.3 |
  | academy | 1 | per-round spend 0/1/2.5/4.5/7 units · intake +0/0/1/1/2 prospects · intake potential +0/3/5/8/11 · academy growth ×1/1.1/1.2/1.3/1.45 |
  | localInvest (주변 투자) | 1 | per-round spend 0/1/2.5/4.5/7 units (1901 prices, billed with operating costs) · gate demand +0/2/4/6/8% · 지역 기반 aims at 0/20/40/65/100 (→ECON-34) |
  | grassroots (풀뿌리 유망주 투자) | 1 | per-round spend 0/1/2.5/4.5/7 units · intake potential +0/1/2/3/4 · 지역 기반 aims at +0/10/20/30/45 |
  | globalMarketing (해외 마케팅) | 1 | per-round spend 0/1/2.5/4.5/7 units · fans +0/0.4/0.8/1.3/2% per settled round · 글로벌 인지도 aims at 0/20/40/65/100 |
  | globalScouting (해외 스카우트망) | 1 | per-round spend 0/1/2.5/4.5/7 units · market candidates +0/1/2/3/4 · candidate potential +0/0/1/1/2 · 글로벌 인지도 aims at +0/10/20/30/45 |
  | tour (해외 투어) | 1 | none / a short tour / a long tour each summer: income 20 + 2 × reputation / 40 + 4 × reputation units when the season starts, 글로벌 인지도 +5 / +10 at once, every player's fatigue +10 / +20 |
  - the support setting is shown as squad investment (선수단 투자): the training and medical environment and how the club treats its players in talks, paid for through the operating expenses it scales. ← with no cost every club would run it at the top
  - each combination of settings draws its own market list under its own IDs; a pending bid keeps its player and terms (→CLUB-14).
  - changing a level records a `policy` event and takes effect from the next settlement; reselecting the current level records nothing.
- ECON-17 [o] Ticket price is chosen from five presets over the existing ticket rule: 0.02/0.035/0.05/0.08/0.12 (1901 base price, 0.05 founding default). A non-preset price from an older save stays in force and is shown as custom.

- ECON-18 [o] Operations show a read-only cash projection to season end and to 365 days ahead as low–high ranges, carrying forward current contracts, wages, staff, policy, sponsor terms and gate demand, with labelled lines. Uncertain campaign results and new decisions are excluded; policy previews show the projection their level would produce.

- ECON-19 [o] League match income is sized for a 46-game season: gate receipts of league and amateur-league matches are multiplied by 46 / own league games this season; per-match result bonuses are replaced by the league's merit payment (→ECON-28). ← season income must not depend on how many clubs share a division, and the 14-game lower section must not bankrupt a club that still pays a full year of wages
  - ENG 24-club divisions ×1, 20-club ×1.21, 18-club ×1.35, the 16-club amateur league ×1.53.
  - cup and European gates are not scaled; hosting costs are paid per actual match.
  - the gate projection, ticket previews and cash projection use the same factor.
- ECON-20 [o] When cash after a round's costs is non-negative but covers fewer than 13 rounds of fixed costs, a cash warning inbox item (→WEB-42) appears once per season with its weeks left and remedies. It is a status, never a stop: the HUD cash and a red band show it (→WEB-56).
- ECON-21 [o] Sponsors with business delegated (→STAFF-13): whenever an open sponsor slot (→ECON-8) is empty the commercial staff sign its best guaranteed offer at once and report it. Without delegation a slot left empty at a season's start, or a contract in its final season on 1 April, posts a sponsor reminder (→WEB-42).

- ECON-22 [o] The club build — shown to the owner as the club's direction (방향, →WEB-60) — is six slots — 유입 방식, 스카우팅, 매각 기조, 수익 모델, 지역 관계 방식, 라커룸 문화 — each holding one card: the standard card or one of four others, so 5^6 = 15,625 strategies before policy, staff or manager. ← combining levers is the fun: owners build their own club instead of picking one of a few presets Every card has at least one gain and one cost; additions add and multipliers multiply across slots. The owner drafts freely, sees combined effects, synergies (→CLUB-21) and odds, and applies a draft at once (recorded as a build event titled 방향 with the direction's name: the preset's, the saved direction's (→WEB-61), else 기본 방향 or 맞춤 방향; a name recorded as 기본 전략 or 맞춤 전략 reads 기본 방향 or 맞춤 방향); every rule that reads a card uses the new one from then on.
  - cards change at any time, like the dials: a draft, preset or saved strategy applies at once whatever changed before, with no lock and no reservation for a later season. ← owners change course when the club needs it; each card's costs are the price of switching
  - presets fill every row of the board in one tap (→ECON-25), the cards and the other rows alike; a row a preset does not name returns to its default; each has one identity and lights or aims at a synergy:
    | preset | cards (others standard) | other rows (others at their default) | aim |
    |---|---|---|---|
    | 동네의 자부심 | 성골 유스, 지역 인재 우선, 핵심 지키기, 회원제 운영, 지역 밀착, 가족 같은 클럽 | 주변 투자 지역 상권 투자, 풀뿌리 유망주 투자 지역 리그 후원, 티켓 가격 저렴, 재계약 기조 모두 붙잡기, 육성 목표 1군 공급, 재정 기조 신중 | lights 우리 동네 아이들 |
    | 유스 명가 | 엘리트 선발, 철저한 경쟁 | 유소년 투자 엘리트 아카데미, 육성 목표 1군 공급, 데뷔 시점 빠른 데뷔, 영입 기조 유망주 발굴, 재계약 기조 젊은 선수 우선, 선호 학파 육성형, 감독 기조 육성가, 코치 기조 최고 수준 | 유스 파이프라인 with a developer or 70+ youth director |
    | 트레이딩 머신 | 데이터 스카우팅, 셀링 클럽, 철저한 경쟁 | 영입 기조 젊은 선수 위주, 육성 목표 판매용 육성, 데뷔 시점 빠른 데뷔, 재계약 기조 젊은 선수 우선 | lights 트레이딩 머신; 머니볼 with a spotter or negotiator scout |
    | 상업 제국 | 광역 네트워크, 상업 확장, 스타 대우 | 해외 마케팅 해외 광고, 해외 투어 짧은 투어, 티켓 가격 비싸게, 재정 기조 적극 | 상업 제국 with 해외 마케팅 4+ and a stadium of 30,000+ |
    | 세계로 | 해외 유스 스카우트, 광역 네트워크, 쇼케이스 | 해외 스카우트망 지역 스카우트, 해외 마케팅 해외 홍보, 해외 투어 짧은 투어, 영입 기조 젊은 선수 위주 | 글로벌 스카우팅 with a spotter or 65+ chief scout |
    | 승격 올인 | 즉시 전력, 핵심 지키기, 구단주 투자, 홈 요새, 베테랑 리더십 | 선수단 투자 후한 지원, 영입 기조 즉시 전력, 재계약 기조 핵심만 붙잡기, 감독 기조 검증된 승부사, 육성 목표 최소 운영, 재정 기조 공격적 | owner money and home strength now, youth growth given up |
    | 알뜰 생존 | 유소년 클럽 제휴, 지역 인재 우선, 강경 협상, 긴축 재정, 가족 관중, 베테랑 리더십 | 선수단 투자 절약, 재계약 기조 짠물, 감독 기조 저비용, 코치 기조 저비용, 재정 기조 안정적 | player wages ×0.91 with morale held level, for small starts |
  - a new club starts with the direction chosen at founding (→WEB-15): 기본 방향 (every row at its default) or a preset.
  | slot | card | effects |
  |---|---|---|
  | 유입 방식 | 성골 유스 | intake +1, intake potential +3; market candidates −1 |
  | 유입 방식 | 유소년 클럽 제휴 | intake +2; intake potential −2 |
  | 유입 방식 | 해외 유스 스카우트 | intake potential +5; intake −1 |
  | 유입 방식 | 엘리트 선발 | intake potential +8; intake −2 |
  | 스카우팅 | 데이터 스카우팅 | candidate potential +3, candidates +1; candidate ability −2 |
  | 스카우팅 | 즉시 전력 | candidate ability +4; player wages ×1.05 |
  | 스카우팅 | 광역 네트워크 | candidates +3; candidate potential −1 |
  | 스카우팅 | 지역 인재 우선 | home gate demand +2%, player wages ×0.97; candidates −1 |
  | 매각 기조 | 셀링 클럽 | other clubs' offers ×1.6, sale fees ×1.25; morale baseline −2 |
  | 매각 기조 | 쇼케이스 | offers ×1.3, sale fees ×1.1; morale baseline −1 |
  | 매각 기조 | 핵심 지키기 | morale baseline +2; offers ×0.5 |
  | 매각 기조 | 강경 협상 | sale fees ×1.15; offers ×0.8 |
  | 수익 모델 | 상업 확장 | new sponsor offers ×1.2, 해외 마케팅 fan growth ×1.2; home gate demand −3% |
  | 수익 모델 | 구단주 투자 | owner capital +2 a season (5); player wages ×1.05 |
  | 수익 모델 | 긴축 재정 | player wages ×0.94; morale baseline −2, candidate ability −2 |
  | 수익 모델 | 회원제 운영 | home gate demand +5%, supporters a win brings ×1.2; new sponsor offers ×0.9, owner capital −1 (2) |
  | 지역 관계 방식 | 지역 밀착 | home gate demand +6%, supporters a win brings ×1.4; 해외 마케팅 fan growth ×0.9 |
  | 지역 관계 방식 | 홈 요새 | home strength +1.5, supporters a win brings ×1.1; 해외 마케팅 fan growth ×0.85 |
  | 지역 관계 방식 | 지역 상생 | 지역 기반 moves ×1.5 faster (→ECON-34); new sponsor offers ×0.95 |
  | 지역 관계 방식 | 가족 관중 | home gate demand +4%, 해외 마케팅 fan growth ×1.1; home strength −0.5 |
  | 라커룸 문화 | 가족 같은 클럽 | morale baseline +3; player wages ×1.03 |
  | 라커룸 문화 | 철저한 경쟁 | growth of players ≤ 21 ×1.1; morale baseline −1 |
  | 라커룸 문화 | 스타 대우 | candidate ability +2, morale baseline +1; player wages ×1.1 |
  | 라커룸 문화 | 베테랑 리더십 | morale baseline +2; growth of players ≤ 21 ×0.9 |
  - signed sponsor contracts keep their amounts; a build changes new offers only.
  - a build holding 글로벌 브랜드 (rules before 1.19) loads without it: the global area took its place (→ECON-25).
  - a build holding 1군 직행 경로 (rules before 1.18) loads without it and with 데뷔 시점 빠른 데뷔, which took its effects (→CLUB-32); a saved direction holding it loads the same way.
  - a club vision stored by rules 1.6–1.7 loads as the cards its vision stood for at 1.8 (균형 운영 all standard, 유스 명가, 셀링 클럽, 상업 확장, 지역 밀착, 승격 올인 as then defined); it reads as a current preset only when the cards match one.

- ECON-23 [o] Supporters follow reputation, not the stadium: each league round they move 3% toward the following the reputation commands (800 × 1.085^reputation: about 2,000 at 12, 47,000 at 50, 1.2 million at 90), a win adds 0.4% × the build's win-fans effect, a defeat costs 0.1%, 해외 마케팅 and a campaign started before rules 1.19 add theirs, and 글로벌 인지도 multiplies the following the reputation commands (→ECON-34); there is no ceiling, never below 200. ← a fixed cap and compounding wins both broke the long game
  - the following itself pays nothing: local supporters and the stadium decide the gate (→ECON-9), and the following raises sponsor offers with diminishing returns (→ECON-8).
- ECON-24 [o] Bankruptcy ends a career: each league round settled with negative cash counts one, getting back to zero or above resets the count; at 8 in a row, or at once when the debt passes half a season's fixed costs, the club goes bankrupt. ← debt used to freeze play behind an alert instead of ending it
  - the first round in debt posts a "파산 위기" inbox item (a status, not a stop); the HUD cash and a red band count the rounds left (→WEB-56)
  - a bankrupt club advances nothing and refuses every command but reading the inbox; the app shows the game-over page (→WEB-56)
- ECON-25 [o] Direction areas group the club's direction rows by the decisions they steer (→ECON-22, →ECON-16, →ECON-17, →ECON-33): every row is a choice of named options of one kind, drawn and drafted alike on the 방향 board (→WEB-60), and the composer (→WEB-61) shows the cards by the same areas, so the owner sees in one place what moves each decision:
  | area | card row | other rows | the delegated staff decide by them |
  |---|---|---|---|
  | 선수단·계약 | 라커룸 문화 | 선수단 투자, 재계약 기조 (→CLUB-26) | contract talks |
  | 영입 | 스카우팅 | 영입 기조 | signings (→CLUB-33) |
  | 매각 | 매각 기조 | - | answers to offers (→CLUB-18, →CLUB-24) |
  | 유소년 | 유입 방식 | 육성 목표, 데뷔 시점 (→CLUB-32), 유소년 투자 | academy promotion, release and listing; the youth director's focus (→CLUB-31) |
  | 스태프 | - | 선호 학파, 감독 기조 (→STAFF-18), 코치 기조 (→STAFF-15) | the manager post, the coaching departments |
  | 재정 | 수익 모델 | 재정 기조 (→ECON-33) | sponsors (→ECON-21); 재정 기조 bounds every delegated spend |
  | 지역 | 지역 관계 방식 | 주변 투자, 풀뿌리 유망주 투자, 티켓 가격 | - (builds 지역 기반 →ECON-34) |
  | 글로벌 | - | 해외 마케팅, 해외 스카우트망, 해외 투어 | - (builds 글로벌 인지도 →ECON-34) |
  - a card row says how the club goes about an area, a dial how much it puts in, a staff row how the staff choose; presets and saved directions fill every row (→ECON-22, →WEB-61), a row they do not name returning to its default, and a saved direction kept before they did fills only its cards; every row changes at any time, and its default (표준, or a dial's default step) keeps the club as it was before the row existed.
  - the market slot is named 매각 기조 so it never reads like the 영입 기조 dial; the training focus is no row of the board: it belongs to 훈련 (→WEB-70).
- ECON-26 [o] A football index per country and year scales what football pays and charges beyond prices: sponsor values, ticket presets, player and staff market wages and transfer values, the division amounts of clubs' operating expenses (→ECON-30) and facility building and upkeep (→ECON-12); league distributions and cup and continental prizes follow the broadcasting index instead (→ECON-31). It grows with prices and, from commercialisation, much faster. ← income and wages must grow together, as they did in real football
  - the index is a source-attributed catalog per country and year, marked estimated where it is (→ECON-3), projected after its coverage like prices (→ECON-2).
- ECON-27 [o] A club earns as real clubs do, simplified: competition money (league distribution →ECON-28, cup prizes →LEAGUE-5, continental prizes →EURO-7), matchday tickets (→ECON-9), sponsor contracts (→ECON-8) and player sales; owner capital and marketing campaigns stay bounded actions (→ECON-11, →ECON-7). No income grows with supporters alone. ← an income without a ceiling made every club rich by mid-career (measured 261012: £197m by 2004 from a 1950 founding with no owner action)
- ECON-28 [o] Each league pays a season distribution that carries its broadcasting money: an equal share for every club of the division, paid in league-round installments, and a merit payment by final position, paid at the close; amounts per country and division follow the broadcasting index (→ECON-31). ← broadcasting is football's largest income, and real leagues share it by division and finish
  - the champion's total is 1.6× the bottom club's in the top flight and 1.3× in the divisions below.
  - a club relegated keeps 50% of the share it lost for one season (parachute); a promotion pays the new division's share from its first round.
  - the season prize line (최종 순위 상금) becomes the merit payment.
- ECON-29 [o] The economy is calibrated against real football on 50-season runs of a reference club, and the measured results are recorded here. ← balance is judged on whole careers, not single seasons
  - revenue is competition money, matchday and commercial income; player trading is reported beside the bands, because the delegated staff sell but never buy, so the reference club is a one-way seller with a youth-heavy wage bill. ← net results including those sales measured 10–17% on every constant set that kept every career solvent
  - the reference club has every delegation on, no owner capital, and starts the cheapest next facility work of the three parts (→ECON-32) whenever cash after it still covers 13 rounds of fixed costs; its operating result counts that construction, since building is how it spends a surplus, and the result before construction is reported beside; the wage targets (→CLUB-25) are measured on it too, the attendance targets on clubs established in their division (→ECON-9), with the reference club's crowds in at least its third straight season in a division beside.
  | target | band | measured 261014 (rules 1.17.0 with the direction rows at their defaults and 트레이딩 머신 selling at 셀링 클럽's 110% bar, 40 careers: ENG ESP FRA GER × default and 트레이딩 머신 × 5 seeds, 1950–2009) |
  |---|---|---|
  | wage bill / revenue for a club keeping a squad at its division's level | 45–70% | 44.8%, below the band (44.3% under rules 1.16; 45.3% on one facility level): the stadium's steps lift mid-career gates while market wages do not follow revenue |
  | operating result / revenue before player trading, career average without owner spending | −5% to +10% | +3.5% (player sales 13.2% of revenue beside it; before construction +22.6%; net result with sales +16.7%) |
  | income mix, top flight, 2000s | distribution 40–55%, commercial 25–40%, matchday 15–25% | 43.6%, 32.9%, 23.5% |
  | income mix, any division, 1950s | matchday 60% or more | 88.5% |
  | every facility part to its top (4,045,150 units), in seasons of a top-flight club's average net result before construction | 25 or more | 93.9 |
  | reference careers that go bankrupt | none | none of 40 |
- ECON-30 [o] Beyond wages, hosting costs and facility upkeep (→ECON-32), every club pays operating expenses (운영 경비) — matchday operations, travel, administration, medical care, kit and its staff's yearly pay — each league round: the larger of an amount per country and division on the football index (→ECON-26) and a share of its turnover over its last completed season (income without player sales or owner capital), spread over this season's league rounds. Share and division amounts are sized so that ECON-29's reference club ends its career near break-even; the amateur level's amount is the lowest. ← other costs must grow with the club's own football money, from a newly promoted club to the dominant one it becomes (measured 261013: net result 47% of income with costs on prices; one amount per division bankrupted 5–7 of 8 reference careers)
  - it is a fixed cost: fixed costs and runway (→ECON-12), the cash projection (→ECON-18), the cash warning (→ECON-20) and the bankruptcy threshold (→ECON-24) count it, and the season ledger names it (→ECON-10).
  - the amount is set when a season starts; the division amount follows the division the club plays in this season, so a promotion or relegation changes it from the first round.
  - a club's first season and a season after a relegation pay the division amount. ← a relegated club runs at its new division's size; last season's turnover was a bigger club's
  - each round's payment is multiplied by the squad investment's factor in force that round (→ECON-16); the default level's ×1 leaves ECON-29's reference club as calibrated.
- ECON-31 [o] A broadcasting index per country and year scales league distributions (→ECON-28) and cup and continental prizes with their result bonuses (→LEAGUE-5, →EURO-7): flat with prices until television paid the league, growing with each country's rights deals and, through the broadcasting boom of the 1990s–2010s, far faster than the football index. ← the 1950s game lived on the gate and the 2000s game on television; one index for distributions and tickets could not give both income mixes (measured 261013: 1950s matchday 21–35% whenever the 2000s top-flight mix held)
  - the index is a source-attributed catalog per country and year, marked estimated where it is (→ECON-3), projected after its coverage like prices (→ECON-2).
- ECON-33 [o] 재정 기조, a row of the 재정 area (→ECON-25), is the one money rule of every delegated spend — contract talks (→CLUB-26), signings (→CLUB-33), academy promotions (→STAFF-13), coach and manager hires and renewals (→STAFF-15, →STAFF-18) — and sets the runway at which the staff sell harder (→CLUB-18, →CLUB-24); the owner's own decisions are never bounded by it. ← fixed checks spread over each staff rule could not say how boldly the owner wants the club run
  | option | runway kept after a spend | wage bill ceiling | promotions wait below | sell harder below | a signing's fee at most |
  |---|---|---|---|---|---|
  | 공격적 | 6 rounds | 75% | a quarter of a year's operating costs | 6 rounds (−20), 14 rounds (−10) | all the cash above the runway |
  | 적극 | 9 rounds | 70% | half a year's | 9, 20 | 75% of it |
  | 표준 (default) | 13 rounds (the cash warning) | 65% | a year's | 13, 30 | 50% |
  | 신중 | 20 rounds | 60% | one and a half years' | 20, 45 | 35% |
  | 안정적 | 30 rounds | 55% | two years' | 30, 65 | 25% |
  - runway kept: cash after the spend covers that many rounds of fixed costs with the new wage in place of the old (→ECON-20), and the season's cash projection with it (→ECON-18) still ends the season covering them.
  - wage bill ceiling: the yearly wage bill after a raise, staff included, against the club's revenue over the last 12 months (→CLUB-26).

- ECON-34 [o] Two bases, 지역 기반 and 글로벌 인지도 (0–100, new clubs 0), grow while the club invests in its town or abroad and fade when it stops; results build reputation, investment builds the bases, and no base raises reputation. ← a club's ties to its town and its name abroad take years to build and to lose
  - each settled league round a base moves toward the target its area's investment rows set (→ECON-16; the two rows' targets add up, at most 100): 2% of the gap while rising (3% with the 지역 상생 card for 지역 기반), 1% while falling; a 해외 투어 adds its 글로벌 인지도 at once.
  - 지역 기반 S: home gate demand +S/10 % (→ECON-9); the 지역 후원 slot's offers ×(1 + S/200) (→ECON-8); with the 성골 유스 card, intake potential +S/25 and one more prospect from 50 (→CLUB-16).
  - 글로벌 인지도 S: the following reputation commands ×(1 + S/100) (→ECON-23); every other sponsor slot's offers ×(1 + S/250); with the 해외 유스 스카우트 card, intake potential +S/33.
  - both are shown in their areas' headers on the 방향 board (→WEB-60).

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r31 261014 ECON-22✎ five presets of cards→seven presets (+유스 명가, +세계로) filling every row, a new club starting with the founding direction; ECON-25✎ presets and saved directions fill only the six cards→every row, older saved directions their cards
- r30 261014 ECON-33✎ +signings, +a signing's fee at most a share of the cash above the runway (공격적 100%…안정적 25%); ECON-25✎ 영입 staff decide -→signings
- r29 261014 ECON-14✎ ECON-8✎ exclusive contract: blocks merchandise campaigns→halves 해외 마케팅's fan growth
- r28 261014 ECON-34+ 지역 기반 and 글로벌 인지도 (0–100) built by the 지역 and 글로벌 rows; ECON-16✎ marketing dial→주변 투자, 풀뿌리 유망주 투자, 해외 마케팅, 해외 스카우트망, 해외 투어; ECON-7✎ four campaigns→none to start, older ones settle; ECON-22✎ 홈·팬 slot→지역 관계 방식, 글로벌 브랜드→지역 상생, 상업 제국 preset without it, marketing/campaign effects→해외 마케팅; ECON-25✎ +지역, 글로벌 areas, 마케팅 out of 재정; ECON-8✎ ECON-9✎ ECON-23✎ read the bases
- r27 261014 ECON-29✎ measured under rules 1.16→1.17 (direction rows, 셀링 클럽 bar 110%): wage bill 44.3%→44.8% (still below 45%), operating result +4.8%→+3.5%, sales 12.3%→13.2%, 2000s mix 43.7/32.8/23.5→43.6/32.9/23.5, 1950s 88.8→88.5%, ladder 95.2→93.9, none bankrupt
- r26 261014 ECON-22✎ slot 유스 정책→유입 방식, 1군 직행 경로→moved to 데뷔 시점 빠른 데뷔, +엘리트 선발 (intake potential +8, intake −2), 트레이딩 머신 preset without 1군 직행 경로; ECON-25✎ 유소년 area +육성 목표, 데뷔 시점
- r25 261014 ECON-25✎ six areas of a card and its dials→seven areas by the decisions they steer: 선수단·계약 +재계약 기조, 스태프 (선호 학파, 감독 기조, 코치 기조), 수익→재정 +재정 기조; ECON-33+ 재정 기조: runway kept, wage-bill ceiling, promotion floor and sell-harder steps by option (표준 = 13 rounds, 65%, a year, 13/30)
- r24 261014 ECON-22✎ shown as the operating strategy (운영 전략), events titled 운영 전략 with 기본 전략/맞춤 전략→the club's direction (방향), titled 방향 with 기본 방향/맞춤 방향, older names read so; ECON-25✎ strategy areas, the operating board's card rows and dials→direction areas whose cards and dials are rows of named options drawn and drafted alike on the 방향 board
- r23 261014 ECON-29✎ measured on 24 careers of one facility level→40 careers on the facility parts: wage bill 46.1%→44.3% (below the band), operating result +3.4%→+4.8%, none bankrupt
- r22 261013 ECON-12✎ 20 facility levels of 5,000 seats→ECON-32+ three parts: stadium in 8 expansion/rebuild steps (2,500→90,000), training ground and academy facilities 1–5; ECON-8✎ naming facilities 10+→stadium 30,000+; ECON-22✎ 상업 제국 facilities 6+→stadium 30,000+; ECON-29✎ reference club builds a level→the cheapest next work of the three parts
- r21 261013 ECON-22✎ a changed slot locked for 90 days→no lock, cards change at any time; ECON-25✎ card column locked 90 days→any time
- r20 261013 ECON-29✎ wage bill 43.0% outside its band, accepted→46.1% within it after agents' premiums 3%→1% a level (→CLUB-30), measured values recorded; ECON-9✎ measured crowds none→recorded
- r19 261013 ECON-9✎ targets for any club, measured on 3rd+ straight seasons→for a club established in its division, the reference club's crowds beside; ECON-12✎ facility cost 250×1.38^(L−1) price units→250×1.58^(L−1) units on the football index, upkeep on prices→on the football index; ECON-26✎ prizes on the football index→cup and continental prizes on the broadcasting index, facilities on prices→on the football index; ECON-29✎ wage bill / income 50–70%→wage bill / revenue 45–70%, net result / income→operating result / revenue before player trading with construction counted, measured values rules 1.16.0 (16 careers)→24 careers on the ported calibration, bands outside wage bill and net→wage bill only; ECON-30✎ a turnover share never below a division floor→the larger of the division amount and the turnover share, a season after a relegation pays the division amount; ECON-31✎ small before television (0.15× prices)→flat with prices until television paid the league, +cup and continental prizes and their result bonuses
- r18 261013 ECON-29✎ bands only→bands with the measured values of rules 1.16.0 and a bankrupt-careers row; bands outside accepted for now with the follow-up named
- r17 261013 ECON-16✎ support pay ceiling×0.9–1.4→none (talk rule →CLUB-26), +operating expenses ×0.9–1.2; ECON-22✎ one commit a season and a reservation→applied at once, a changed slot locked 90 days; ECON-25✎ once a season→locked 90 days, 선수단 dials −훈련 방향, two sections→one board; ECON-30✎ +× the squad investment factor
- r16 261013 ECON-26✎ league distributions on the football index→on the broadcasting index, operating expenses→their floor; ECON-28✎ distributions follow the football index→the broadcasting index; ECON-29✎ attendance targets on the reference club→on clubs in at least their third straight season in a division; ECON-30✎ an amount per division on the football index→a share of last season's turnover with a floor per division on the football index, +staff's yearly pay; ECON-31+ broadcasting index
- r15 261013 ECON-30+ clubs' operating expenses per division on the football index; ECON-26✎ +operating expenses among what the index scales; ECON-29✎ runs with every delegation on→a reference club: every delegation on, no owner capital, the stadium grown whenever cash still covers 13 rounds of fixed costs
- r14 261012 ECON-8✎ one main sponsor slot→five slots with 2–5 season contracts valued at signing, opening by era; ECON-9✎ attendance from all supporters→local supporters bounded by the catchment; ECON-14✎ +per contract; ECON-16✎ support player wage ×0.85–1.2→pay ceiling ×0.9–1.4 and goodwill −5 to +15% in contract talks; ECON-19✎ result bonuses→the league merit payment; ECON-21✎ the main slot→every open slot, +reminder for a contract's final season; ECON-23✎ global fan income 0.001 × fans^0.85 a round→none, the following raises sponsor offers; ECON-26+ football index; ECON-27+ four real income sources; ECON-28+ league distribution with broadcasting; ECON-29+ career calibration targets
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
