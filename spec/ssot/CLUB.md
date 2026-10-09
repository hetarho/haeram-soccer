# CLUB Squad and growth
> r9 | Define the implemented browser-demo behavior for squad and growth.

## decisions
- CLUB-1 [o] A club starts with 18 players, a suitable manager, small facilities, 800 supporters, and a complete starting XI.
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

- CLUB-12 [o] Player development uses each player own potential gap, age, manager youth ability and facilities; young role-relevant skills grow only up to their current/potential ceiling. Record bounded cumulative actual positive development on the player, preserve retirement/history, and show current ability, potential and earned growth.

- CLUB-13 [o] The training view exposes the three focus choices and their recovery/development tradeoffs, current focus, and promising young players. Focus selection is a single saved game command; optional player and market details are explicit.

- CLUB-14 [o] The market supports role and roster-fit filters with stable seeded candidates. Each candidate shows current ability, potential, effect on the proposed XI/tactic fit, upfront transfer or loan fee, recurring annual wage and contract term before acceptance.

- CLUB-15 [o] Recruitment previews distinguish automatic starter selection from optional manual-lineup replacement, never promise a win or guaranteed selection, and show post-fee cash and wage-inclusive fixed-cost runway excluding future revenue. Disable unaffordable/full/already-signed offers; free transfers still disclose wages.

- CLUB-16 [o] The youth academy keeps prospects outside the first team. Each season on 15 March 3–5 prospects aged 15–16 join (more with a strong youth director or facilities); they grow every settled round toward potential and can be promoted while the first team has room, or released.
- CLUB-17 [o] Fee-bearing purchases, loans and sales happen only in transfer windows: summer from the day the season closes (→LEAGUE-9) to 1 September and winter 1 January–1 February. ← the market opens as the season's review ends, not during its final rounds Free agents sign at any time. The market shows the window state and deadline.
- CLUB-18 [o] Bids are answered 2–4 days later with accept, reject or a counter; acceptance chance rises with the offered fee against the asking value and the chief scout. The fee is paid on completion; unanswered bids lapse at the deadline. During windows other clubs bid for our players (answered by the owner, or by the staff when delegated) and lapse after 5 days; squad minimums still apply. Delegated staff accept only offers ≥130% of value for a non-starter, or for a starter aged 30+ with a bench player of the same role within 3 ability.

- CLUB-19 [o] Squad morale (0–100, new clubs 60) moves +6/+1/−6 after own wins/draws/defeats (±2 more for a two-goal margin), drifts 15% per settled round toward a baseline of 55 + 4 per squad-support level above standard + (manager trust − 50)/10 within 30–80, and falls 2 more per round while starters average fatigue ≥ 40. Match strength adds (morale − 60)/10; older saves without morale stay exactly unchanged.

- CLUB-20 [o] Care actions are instant owner decisions with a cost, an effect and a cooldown counted in settled rounds since the last use; they never touch past matches.
  | action | cost (1901 units) | effect | cooldown |
  |---|---|---|---|
  | rest day | free | every active player fatigue −6, morale +2 | 4 |
  | intensive care | 30 | every active player fatigue −10 | 2 |
  | team dinner | 15 | morale +5 | 3 |
  | special bonus | 45 | morale +10 | 8 |
  | owner's visit | free | morale +3, manager trust −1 | 4 |
  | friendly match | income 12 + supporters/600 (max 60) | every active player fatigue +8 | 4 |
  - insufficient cash fails cleanly; older saves without morale start from 60 when a care action changes it.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r9 261009 CLUB-20+ care actions with costs and cooldowns
- r8 261009 CLUB-17✎ summer window 14 June–1 September→season close–1 September
- r7 261009 CLUB-19+ no morale→results- and support-driven squad morale affecting match strength
- r6 261008 CLUB-4✎ instant fee transfers→free agents instant, fee transfers by bids; CLUB-16+ youth academy; CLUB-17+ transfer windows; CLUB-18+ negotiation and incoming bids
- r5 261008 CLUB-14+ CLUB-15+ long unfiltered market attribute cards→role-focused candidates with tactical and budget previews
- r4 261008 CLUB-11+ CLUB-12+ CLUB-13+ annual-only opaque growth→visible per-round training choices and individual potential-based development
- r3 261008 CLUB-6✎ CLUB-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r2 261008 CLUB-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
