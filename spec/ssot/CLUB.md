# CLUB Squad and growth
> r5 | Define the implemented browser-demo behavior for squad and growth.

## decisions
- CLUB-1 [o] A club starts with 18 players, a suitable manager, small facilities, 800 supporters, and a complete starting XI.
- CLUB-2 [o] Player attributes include attack, passing, defense, keeper, stamina, potential, birth year, wage, contract term, and reputation; overall derives from role.
- CLUB-3 [o] Players age using the game calendar, develop through age/potential/manager ability, decline after 30, retire at 36, and are replaced by generated youth.
- CLUB-4 [o] Recruitment offers immediate contributors, prospects, free agents, and short-term loans; selling produces money and removes the player from selection.
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

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r5 261008 CLUB-14+ CLUB-15+ long unfiltered market attribute cards→role-focused candidates with tactical and budget previews
- r4 261008 CLUB-11+ CLUB-12+ CLUB-13+ annual-only opaque growth→visible per-round training choices and individual potential-based development
- r3 261008 CLUB-6✎ CLUB-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r2 261008 CLUB-9+ generic tactic bonuses→roster/opponent/fatigue-dependent four-way tradeoffs
- r1 261007 initial
