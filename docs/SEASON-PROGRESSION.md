# Season progression

The saved world owns the calendar. A season starts on August 1 (`calendar.day = 0`), domestic round N runs on day N × 7, and European phase fixtures run three days before their corresponding domestic round. After round 46, the final table stays available through the off-season. August 1 of the following year closes the season, records the existing cup/playoff/European tournament conclusions, applies promotion and player development, and creates the new schedule. Leap years are included.

The UI statistics tabs use three automatic speeds with the same engine commands and daily event order:

- `advance-days`, `days: 1`: one saved day per UI tick.
- `advance-days`, `days: 3`: three saved days per UI tick.
- `next-match`: settle all intervening days until the player's club records a match. Other leagues can play during gaps in the player's schedule. The command also crosses the off-season when necessary.

The watch tab uses a different clock: it keeps the current playback until full time, then immediately requests `next-match`. Switching statistics tabs keeps the calendar running; switching back to observation holds it until the current match finishes. Views remain mounted and select only changed state branches.

`advance-days` accepts 1–31 days through the worker protocol. `advanceDays()` accepts 1–366 for engine callers. Off days do not charge another week's wages, fatigue recovery, or campaigns; those retain their existing round settlement. A pending critical alert prevents these automatic commands, and any newly raised critical alert stops the command on that day. The worker still returns a complete checkpoint for a partially completed or cancelled command. Requests remain serialized, revision checked, and idempotent.

Existing `advance` and `season` commands retain their round-based behavior and historical results. `advanceRound()` moves the calendar to that round's domestic match day. An explicit `season` command can close a finished season immediately. Calendar progression keeps the final table visible until the next August 1.

`advanceRound`, `advanceDays`, `advanceToNextMatch`, and `advanceEurope` accept a trailing `observe = true` argument. Passing `false` skips motion frames while retaining the same match outcomes, player contributions, finances, snapshots, and season archives. `simulateSeason()` and the worker's `season` command use this fast path; individual UI progression keeps observation enabled.

Helpers exported by the engine:

- `currentDay(world)`, `seasonLength(world)`.
- `seasonDate(world)` and `fixtureDate(world, fixture)`: Korean date labels.
- `fixtureDay(fixture)`, `nextOwnFixture(world)`, `daysUntilNextMatch(world)`.
- `advanceDays(world, days, settlement?)`, `advanceToNextMatch(world, settlement?)`.

`rankHistory` stores an initial snapshot and a snapshot after every domestic round, including rounds when the player has no match. Each snapshot is `{ year, round, day, tier, group, rows }`. Rows are sorted by rank and hold `[clubIndex, points, goalsFor, goalsAgainst]`; rank is the row index plus one. All clubs in the player's league are captured, including the lower league when applicable. Club indexes refer to `world.clubs`, whose order stays stable. Snapshot tier/group and membership remain frozen when clubs later change divisions. The latest ten seasons are retained, and row data is compacted with lossless unsigned LEB128 encoding alongside the existing archive streams.

Both fields are optional for version 1 saves. Older worlds derive their current day from `round × 7`, and start ranking history at the current round the first time they advance. Importing an older checkpoint does not invent previous rankings or change its match facts.

The current season-ending knockout mechanics resolve a bracket in one batch. `next-match` stops at that batch if it contains newly recorded player matches; those results remain in the archive. Expanding cups and late European knockout rounds into individual calendar fixtures is a separate engine change.
