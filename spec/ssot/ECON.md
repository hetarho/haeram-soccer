# ECON Historical club economy
> r7 | Define the implemented browser-demo behavior for historical club economy.

## decisions
- ECON-1 [o] Money uses exact integer minor units in decimal-string DTOs. Debits are validated first; positive costs cannot create money.
- ECON-2 [o] Annual prices use country/year observed CPI where available. Before country coverage use an explicitly marked linked UK historical proxy; after coverage extrapolate 2 percent annually and label projection.
- ECON-3 [o] Catalog stores real data/provenance and observation status. Consumers show observed/estimated/projected; never call a proxy an actual national observation.
- ECON-4 [o] Existing fixed wages and sponsor payments stay nominal until renewal or currency conversion. Cash is not inflated automatically.
- ECON-5 [o] Currencies follow versioned period labels and verified conversion factors; euro book-money conversion is 1999 with ECB fixed national rates. Early missing monetary coverage is identified as normalized/estimated.
- ECON-6 [o] Ledger currency conversion adjusts balances and outstanding obligations exactly once, keeps original historical transaction units, and applies explicit rounding.
- ECON-7 [o] Marketing options: local outreach, ticket campaign, merchandise, player promotion. Show cost/expected range and later realized income/net result; diminishing returns and demand constrain outcomes.
- ECON-8 [o] Sponsors offer guaranteed, performance-linked, exclusive, or inflation-linked terms; one main sponsor slot, declared annual payment/bonus/term, no repeated contract grant.
- ECON-9 [o] Match attendance and receipts use supporters, reputation, price and performance; no duplicate season-ticket or sponsor revenue.
- ECON-10 [o] Cash, income, expense, recurring wages, annual profit, budget runway and CPI-adjusted comparison are separate statistics.
- ECON-11 [o] If operations produce negative cash, play continues with an explicit budget warning; optional local-support recovery is a bounded game action, not a real-money payment.

- ECON-12 [o] Business decisions present immediate spend, post-decision cash, recurring fixed-cost changes and fixed-cost runway excluding future revenue before commitment. Facility decisions also compare capacity, current demand and maintenance; costly facility upgrades require an in-app review of these real effects.

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
  - level 3 recruitment consumes the market RNG identically; offer IDs stay `market:<year>:<i>` across levels.
  - changing a level records a `policy` event and takes effect from the next settlement; reselecting the current level records nothing.
- ECON-17 [o] Ticket price is chosen from five presets over the existing ticket rule: 0.02/0.035/0.05/0.08/0.12 (1901 base price, 0.05 founding default). A non-preset price from an older save stays in force and is shown as custom.

- ECON-18 [o] Operations show a read-only cash projection to season end and to 365 days ahead as low–high ranges, carrying forward current contracts, wages, staff, policy, sponsor terms and gate demand, with labelled lines. Uncertain campaign results and new decisions are excluded; policy previews show the projection their level would produce.

- ECON-19 [o] League match income is sized for a 46-game season: gate receipts and result bonuses of league and lower-section matches are multiplied by 46 / own league games this season. ← season income must not depend on how many clubs share a division, and the 14-game lower section must not bankrupt a club that still pays a full year of wages
  - ENG 24-club divisions ×1, 20-club ×1.21, 18-club ×1.35, lower section ×3.29.
  - cup and European gates are not scaled; hosting costs are paid per actual match.
  - the gate projection, ticket previews and cash projection use the same factor.
- ECON-20 [o] When cash after a round's costs is non-negative but covers fewer than 13 rounds of fixed costs, a cash warning inbox item (→WEB-42) appears once per season with its weeks left and remedies.
- ECON-21 [o] Sponsors with business delegated (→STAFF-13): whenever the main sponsor slot is empty the commercial staff sign the stable offer at once and report it. Without delegation a season that starts without a sponsor posts a sponsor reminder (→WEB-42).

- ECON-22 [o] The club vision is one card for the season: balanced by default, changed at most once per season and recorded as an event. ← a direction is a commitment, not a weekly dial
  | vision | effects |
  |---|---|
  | 균형 운영 | none |
  | 유스 명가 | intake +1, intake potential +4, growth of players ≤ 21 ×1.15; market candidates −2 |
  | 셀링 클럽 | other clubs' offers ×1.6, every sale fee ×1.25, candidate potential +4; morale baseline −2 |
  | 상업 확장 | new sponsor offers ×1.2, campaign income ×1.25, marketing fan growth ×1.2; home gate demand −3% |
  | 지역 밀착 | home gate demand +8%, supporters a win brings ×1.5, home strength +1; new sponsor offers ×0.9 |
  | 승격 올인 | owner capital 5 times a season, candidate ability +5, morale baseline +2; player wages ×1.08 |
  - signed sponsor contracts keep their amounts; a vision changes new offers only.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r7 261010 ECON-16✎ three settings→four with academy investment, support shown as squad investment; ECON-22+ club visions
- r6 261009 ECON-19+ per-match income fixed→league income sized for a 46-game season; ECON-20+ cash warning before insolvency; ECON-21+ delegated stable sponsor and sponsor reminder
- r5 261008 ECON-18+ current-cash-only budgeting→season-end and one-year cash projection
- r4 261008 ECON-16+ ECON-17+ fixed-only operations and free-form ticket input→five-level support/recruitment/marketing policy and five ticket presets
- r3 261008 ECON-15+ active campaign hypothetical repeat debit→actual paid-cost/current-cash feedback
- r2 261008 ECON-12+ ECON-13+ ECON-14+ stacked businesscards with opaque recurring costs→compact investment planner and engine-backed budget effects
- r1 261007 initial
