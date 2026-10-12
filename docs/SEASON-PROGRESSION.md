# Season progression

The saved world owns the calendar. A season starts on August 1 (`calendar.day = 0`) and domestic round N runs on day N × 7, so the final round 46 is on day 322. Midweek ties — domestic cup rounds and continental fixtures — run on day N × 7 − 3 of the round they belong to. The season closes on day 323, the day after its final round (`SEASON_END_DAY + 1`): it records the cup, playoff and continental conclusions, applies promotion (the amateur level swaps places with the last professional division) and player development, and creates the new schedule. Nothing happens after the final round, so the empty summer is skipped and the next season starts on August 1. Date labels include leap years.

## One day order

Every progression mode lives the season one day at a time through the same step (`stepDay`), so the same inputs record the same facts whatever advances time (→LEAGUE-11, →ARCH-5):

- the close day (day 323): the season closes.
- a league match day (round × 7): the round's league matches, then the round's settlement (training, wages, supporters, ranking snapshots, the manager market every fourth round), then that day's club business — academy intake, market, delegated business, staff, retirement announcements, healed injuries — so a player healed or signed that day plays from his next match.
- any other day: the continental and domestic cup ties due that day, then its club business.

Off days charge no further wages, fatigue recovery or campaigns; those settle with the round. Every lived day increments `revision` once. Draws are named by what they settle and their game date (a fixture, a player, a bid, a request, a campaign), never by `revision` or another count of commands, so reading the inbox or any other bookkeeping changes no later outcome.

The controls only choose how many days to live before returning:

- `advance-days` (1–31 days through the worker protocol, 1–366 for `advanceDays()`): day steps. A multi-day step also ends on the day club news arrives or the player's club plays, and the season close ends every step.
- `next-match` / `advanceToNextMatch()`: day steps until the player's club records a match, crossing the season close when necessary.
- `advance` / `advanceRound()`: the days up to and including the next round's league match day, so that round's midweek ties play on their own day first.
- `season` / `simulateSeason()`: rounds until round 46, then the close on day 323.

The automatic clock (x1/x2/x5/x10, →WEB-5) steps days on the worker; the watch tab requests `next-match` after the current playback reaches full time. A pending critical alert prevents automatic commands, and any newly raised critical alert stops the command on that day. The worker still returns a complete checkpoint for a partially completed or cancelled command. Requests remain serialized, revision checked, and idempotent.

`advanceRound`, `advanceDays`, `advanceToNextMatch`, and `advanceEurope` accept a trailing `observe = true` argument. Passing `false` skips motion frames while retaining the same match outcomes, player contributions, finances, snapshots, and season archives. `simulateSeason()` and the worker's `season` command use this fast path; individual UI progression keeps observation enabled.

## Cups stage by stage

Domestic cups and continental competitions are played stage by stage through the season, each tie a fixture on its own midweek day.

- Domestic cup (→LEAGUE-5): each country draws its first round when the season is prepared. A completed round draws the next by an open draw, the own club's draw arriving in the inbox. Single-leg ties play in rounds 5, 11, 16, 23, 28, 35 and 42 (the last N for the cup's size), so the final is in late May; a level tie goes to extra time and penalties.
- Continental competitions (→EURO-10): phases and knockout stages run three days before their league weekend; two-legged ties keep their era's gap between legs.

`next-match` therefore stops at each of the player's ties. At the close anything still unplayed — a season in progress from a save without domestic cups, or continental ties from an older calendar — is played out so every competition has a winner.

Helpers exported by the engine:

- `currentDay(world)`, `seasonLength(world)`.
- `seasonDate(world)` and `fixtureDate(world, fixture)`: Korean date labels.
- `fixtureDay(fixture)`, `nextOwnFixture(world)`, `daysUntilNextMatch(world)`.
- `advanceDays(world, days, settlement?)`, `advanceToNextMatch(world, settlement?)`.

`rankHistory` stores an initial snapshot and a snapshot after every domestic round, including rounds when the player has no match. Each snapshot is `{ year, round, day, tier, group, rows }`. Rows are sorted by rank and hold `[clubIndex, points, goalsFor, goalsAgainst]`; rank is the row index plus one. All clubs in the player's league are captured, including the lower league when applicable. Club indexes refer to `world.clubs`, whose order stays stable. Snapshot tier/group and membership remain frozen when clubs later change divisions. The latest ten seasons are retained, and row data is compacted with lossless unsigned LEB128 encoding alongside the existing archive streams.

Both fields are optional for version 1 saves. Older worlds derive their current day from `round × 7`, and start ranking history at the current round the first time they advance. Importing an older checkpoint does not invent previous rankings or change its match facts.
