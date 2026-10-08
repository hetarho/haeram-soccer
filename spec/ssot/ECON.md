# ECON Historical club economy
> r5 | Define the implemented browser-demo behavior for historical club economy.

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

- ECON-16 [o] Club operating policy has three ordered five-level settings; absent saves resolve to the defaults, which reproduce pre-policy settlement exactly. ← ongoing choices stay easy while still changing the simulation
  | key | default | effect by level 1→5 |
  |---|---|---|
  | support | 3 | player wage ×0.85/0.92/1/1.1/1.2 · round development ×0.8/0.9/1/1.12/1.25 · round fatigue recovery −2/−1/0/+1/+2 |
  | recruitment | 3 | market offers age 17–21/18–25/18–30/23–31/26–33 · ability 35–65/38–75/40–85/50–88/60–92 · potential +12/+6/0/0/0 · transfer fee ×0.85/0.95/1/1.15/1.3 |
  | marketing | 1 | per-round spend 0/1/2.5/4.5/7 units (1901 prices, billed with operating costs) · fans +0/0.4/0.8/1.3/2% per settled round with the campaign saturation · gate demand +0/2/4/6/8% |
  - level 3 recruitment consumes the market RNG identically; offer IDs stay `market:<year>:<i>` across levels.
  - changing a level records a `policy` event and takes effect from the next settlement; reselecting the current level records nothing.
- ECON-17 [o] Ticket price is chosen from five presets over the existing ticket rule: 0.02/0.035/0.05/0.08/0.12 (1901 base price, 0.05 founding default). A non-preset price from an older save stays in force and is shown as custom.

- ECON-18 [o] Operations show a read-only cash projection to season end and to 365 days ahead as low–high ranges, carrying forward current contracts, wages, staff, policy, sponsor terms and gate demand, with labelled lines. Uncertain campaign results and new decisions are excluded; policy previews show the projection their level would produce.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r5 261008 ECON-18+ current-cash-only budgeting→season-end and one-year cash projection
- r4 261008 ECON-16+ ECON-17+ fixed-only operations and free-form ticket input→five-level support/recruitment/marketing policy and five ticket presets
- r3 261008 ECON-15+ active campaign hypothetical repeat debit→actual paid-cost/current-cash feedback
- r2 261008 ECON-12+ ECON-13+ ECON-14+ stacked businesscards with opaque recurring costs→compact investment planner and engine-backed budget effects
- r1 261007 initial
