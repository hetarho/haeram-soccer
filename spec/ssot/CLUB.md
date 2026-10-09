# CLUB Squad and growth
> r11 | Define the implemented browser-demo behavior for squad and growth.

## decisions
- CLUB-1 [o] A club starts with 18 players, a suitable manager, small facilities, 800 supporters, and a complete starting XI whose rating equals its league's average club XI (±1). ← a fixed founding strength left clubs in shallow pyramids 7–12 points below their league
- CLUB-2 [o] Player attributes include attack, passing, defense, keeper, stamina, potential, birth year, wage, contract term, and reputation; overall derives from role.
- CLUB-3 [o] Players age using the game calendar, develop through age/potential/manager ability, decline after 30, retire at 36, and are replaced by generated youth.
- CLUB-4 [o] Recruitment offers immediate contributors, prospects, free agents, and short-term loans. Free agents sign instantly at any time; fee-bearing transfers are negotiated bids (→CLUB-18); selling produces money and removes the player from selection.
- CLUB-5 [o] Transfer price, recurring wage, and term are shown before acceptance. Keep at least 14 players and one goalkeeper; maximum squad size is 26.
- CLUB-6 [o] Automatic starting lineup uses available role fit and fatigue unless a saved manual XI is selected. Strongest/rest presets require at most selection plus confirmation; detailed role-safe substitutions are optional.
- CLUB-7 [o] Promotion, supporters, facilities, managers, player generations and finance measure growth; history survives transfers and retirement.
- CLUB-8 [o] Facility investment has a stated price and improves development/reach; actions fail cleanly if cash is insufficient.

- CLUB-9 [o] Match fatigue retains a higher cost for pressing than other tactics, modified within bounded ranges by stamina. Rest selection trades immediate strength for lower fatigue; saved manual lineups remain role-safe and unavailable players are automatically replaced.

- CLUB-10 [o] Match preparation separates tactic and lineup tabs, shows real current-versus-draft strength/fatigue, and keeps apply/close controls reachable while optional slot details scroll.

- CLUB-11 [o] Training focus is balanced, youth or recovery, defaulting to balanced for older saves. It applies once at settled domestic round boundaries; selecting a focus, viewing it, or advancing idle days does not grant growth. Youth trades reduced recovery for faster young-player development; recovery trades development opportunity for fresher players.
  - fatigue recovered per round: balanced 11, youth 7, recovery 16 (before staff and policy bonuses). ← a regular starter's 10–13 per match then levels off under balanced training; pressing or youth focus still accumulates

- CLUB-12 [o] Player development uses each player own potential gap, age, manager youth ability and facilities; young role-relevant skills grow only up to their current/potential ceiling. Record bounded cumulative actual positive development on the player, preserve retirement/history, and show current ability, potential and earned growth.

- CLUB-13 [o] The training view exposes the three focus choices and their recovery/development tradeoffs, current focus, and promising young players. Focus selection is a single saved game command; optional player and market details are explicit.

- CLUB-14 [o] The market supports role and roster-fit filters with stable seeded candidates. Each candidate shows current ability, potential, effect on the proposed XI/tactic fit, upfront transfer or loan fee, recurring annual wage and contract term before acceptance.

- CLUB-15 [o] Recruitment previews distinguish automatic starter selection from optional manual-lineup replacement, never promise a win or guaranteed selection, and show post-fee cash and wage-inclusive fixed-cost runway excluding future revenue. Disable unaffordable/full/already-signed offers; free transfers still disclose wages.

- CLUB-16 [o] The youth academy keeps prospects outside the first team. Each season on 15 March 3–5 prospects aged 15–16 join (more with a strong youth director or facilities); they grow every settled round toward potential and can be promoted while the first team has room, or released.
  - academy investment (→ECON-16), the club vision (→ECON-22) and the pipeline synergy (→CLUB-21) add prospects, potential and growth.
  - the academy dial and the build board show the exact chance that the next intake brings a prospect of potential 80+, from the same uniform draws the intake uses.
- CLUB-17 [o] Fee-bearing purchases, loans and sales happen only in transfer windows: summer from the day the season closes (→LEAGUE-9) to 1 September and winter 1 January–1 February. ← the market opens as the season's review ends, not during its final rounds Free agents sign at any time. The market shows the window state and deadline.
- CLUB-18 [o] Bids are answered 2–4 days later with accept, reject or a counter; acceptance chance rises with the offered fee against the asking value and the chief scout. The fee is paid on completion; unanswered bids lapse at the deadline. During windows other clubs bid for our players (answered by the owner, or by the staff when delegated) and lapse after 5 days; squad minimums still apply. Delegated staff accept only offers ≥130% of value for a non-starter, or for a starter aged 30+ with a bench player of the same role within 3 ability.

- CLUB-19 [o] Squad morale (0–100, new clubs 60) moves +6/+1/−6 after own wins/draws/defeats (±2 more for a two-goal margin; a motivator manager takes 2 off a defeat), drifts 15% per settled round toward a baseline of 58 + 4 per squad-investment level above standard + (manager trust − 50)/10 + the manager style, vision and synergy terms, within 30–80, and falls 2 more per round while starters average fatigue ≥ 40. Match strength adds (morale − 60)/10; older saves without morale stay exactly unchanged.

- CLUB-20 [o] The owner does not run the dressing room: morale and fitness actions are requests to the manager or the staff, made once per cooldown (settled rounds since the last use). Requests that depend on people can work, do little or backfire; every chance is stated before the request and drawn from the world's own stream for that round and revision. ← a chairman paying random bonuses or treating the squad himself is not how football clubs work
  | request | by | cost (1901 units) | outcomes | cooldown |
  |---|---|---|---|---|
  | squad meeting | manager | free | works: morale +7 · nothing much: +2 · backfires: −3 and trust −2; works 0.5 + 0.2 for a motivator + (trust − 50)/200 + 0.1 when morale < 45 (0.2–0.9) | 4 |
  | team-building day | staff | 15 | morale +5 (75%) or +2 | 3 |
  | win bonus for the next 5 matches | owner | 8 per win, owed even when cash is short | morale +3 now, +2 after each win | 8 |
  | owner's dressing-room visit | owner | free | morale +4 (35%) / +1 (30%) / −3 and trust −3 (35%): an owner addressing the squad tends to undermine the manager | 4 |
  | public vote of confidence | owner | free | trust +8, morale +2; not while trust ≥ 85 or for an interim | 10 |
  | short training camp | staff | 60 | morale +5, every active player fatigue −8 | 12 |
  | rest days | manager | free | every active player fatigue −6, morale +2 | 4 |
  | recovery support | staff | 30 | every active player fatigue −10 | 2 |
  | friendly match | operations | income 12 + supporters/600 (max 60) | every active player fatigue +8 | 4 |
  - insufficient cash fails cleanly; older saves without morale start from 60 when a request changes it; no request touches past matches.
- CLUB-21 [o] Build synergies light up when the manager, staff, club choices and squad point the same way; each lists its conditions with what is met, and its bonus applies only while all are met. ← builds should be readable as combinations, like cards that work together
  | synergy | conditions | bonus |
  |---|---|---|
  | 게겐프레스 엔진 | gegenpress manager or press tactic · fitness coach 65+ or recovery trait · starters' stamina 60+ | fatigue −2 per match · opponent build-up pass success −1 point |
  | 점유의 미학 | positional manager or possession tactic · assistant 65+ or specialist · starting midfield passing 62+ | pass +1, possession +1 point |
  | 철의 장막 | organizer or counter manager · defence coach 65+ or specialist · starting defenders' defence 62+ | opponent chances −1 point |
  | 유스 파이프라인 | academy investment 3+ · youth director developer or 70+ · developer manager or youth trait | academy growth ×1.15, intake potential +3 |
  | 머니볼 | trading vision · scout spotter or negotiator · recruitment level ≤ 2 | candidate potential +3, fees ×0.92 |
  | 상업 제국 | commercial vision · marketing 4+ · facilities 6+ | new sponsor offers ×1.1 |
  | 원 팀 | motivator manager · squad investment 4+ · morale 65+ | morale baseline +3 |

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r11 261010 CLUB-16✎ +academy investment, vision and synergy terms, golden-prospect odds; CLUB-19✎ +manager style/vision/synergy baseline terms and a motivator's defeat cushion; CLUB-20✎ care actions (rest day, intensive care, team dinner, special bonus, owner's visit, friendly)→owner requests to the manager and staff with stated chances (special bonus removed, win bonus per win); CLUB-21+ build synergies
- r10 261009 CLUB-1✎ fixed founding strength→league-average XI; CLUB-11✎ recovery 8/4/13→11/7/16; CLUB-19✎ morale baseline 55→58
- r9 261009 CLUB-20+ care actions with costs and cooldowns
- r8 261009 CLUB-17✎ summer window 14 June–1 September→season close–1 September
- r7 261009 CLUB-19+ no morale→results- and support-driven squad morale affecting match strength
- r6 261008 CLUB-4✎ instant fee transfers→free agents instant, fee transfers by bids; CLUB-16+ youth academy; CLUB-17+ transfer windows; CLUB-18+ negotiation and incoming bids
- r5 261008 CLUB-14+ CLUB-15+ long unfiltered market attribute cards→role-focused candidates with tactical and budget previews
- r4 261008 CLUB-11+ CLUB-12+ CLUB-13+ annual-only opaque growth→visible per-round training choices and individual potential-based development
- r3 261008 CLUB-6✎ CLUB-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r2 261008 CLUB-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
