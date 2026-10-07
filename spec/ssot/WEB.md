# WEB Browser game delivery
> r1 | Define the implemented browser-demo behavior for browser game delivery.

## decisions
- WEB-1 [o] First release is a static, account-free Korean web game; Supabase and Flutter are deferred.
- WEB-2 [o] Play a fictional club founded in 1901 in the lowest supported professional division; choose country, name, colors, seed, and capital difficulty.
- WEB-3 [o] Capital presets are 2, 1, and 0.5 times the founding annual operating budget; all other initial conditions remain identical for a shared seed.
- WEB-4 [o] Dashboard, match observation, league/Europe, squad/market, manager, business, and history are playable views, with progress and actionable errors.
- WEB-5 [o] Advance one round, finish the season, or advance a chosen number of seasons; manager resignation and saving failure interrupt unattended progress.
- WEB-6 [o] Free local play has no real-money purchases, identity collection, analytics upload, sign-in, or automatic cloud submission.
- WEB-7 [o] New world creation with an existing save requires an explicit in-app replacement choice and offers export first.
- WEB-8 [o] A runtime error preserves a recoverable save and offers retry/export; do not replace failed loading with a new world.

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r1 261007 initial
