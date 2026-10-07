# ECON Historical club economy
> r1 | Define the implemented browser-demo behavior for historical club economy.

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

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r1 261007 initial
