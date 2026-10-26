# IDEATION save-storage-and-fast-pace
> st:open@261026 | Move the game in play's checkpoint to IndexedDB, then make x10 automatic play feel smooth, covering a match day's computation with a "경기 진행 중…" animation.

## vision
- Problem (owner, 261026, on the deployed build at x10): the calendar runs 1, 2, 3 … 6 quickly, then halts for about a second, then runs on. The halt is every own league match day. Separately, the game in play's checkpoint is capped at 3 MiB only because it lives in localStorage (about 5 MiB per origin), and writing it blocks the main thread.
- Target: the owner letting seasons run on automatic play at the fastest pace.
- Core value: fast play that never looks frozen, and a save whose size limit comes from the game's needs rather than the storage API.

## explored
- [o] Base the work on the measured diagnosis below ← the owner asked why the halt happens before choosing a fix
  - Measured 261026 on the current source (esbuild bundle like production, Node, 1950 ENG founding, 120 days): ordinary day 12 ms, day with other clubs' fixtures only 317 ms, own league match day 935 ms; throughput 7.8 days a second against x10's 10.
  - x10 is one day per 100 ms (`PACE_MS` in `apps/web/src/runtime/progression.ts`); a tick while the previous day is still in flight is skipped, so a 0.9 s day shows as a halt; the next step then catches up at most 5 owed days (`MAX_STEP_DAYS`), ending early on an own match or news day.
  - On an own match day about half the time is the own match on the detailed engine (about 0.375 s without frames, about 0.6 s with frames; per match about 1,000 decisions, 1,800 intention updates, 79,000 target reads, 640,000 movement steps) and about 40% the day's other fixtures on the aggregate path (about 2.2 ms each, every league's round on one day). Building the view and publishing it take 10–20 ms. On match days 0.6–1 MB of view delta reaches the main thread, mostly `world.clubs` (~400 KB) and `world.discipline` (~360 KB).
- [o] Keep today's engine dispatch: every own match on the detailed engine, watched or not; every other fixture on the aggregate path ← owner 261026, after weighing the alternatives below
- [x] Per-world engine choice at founding (rich world: every fixture on the detailed engine; fast world: every fixture aggregate except the watched own match, with post-match material shown once and not kept) ← the rich world needs about 2 h of computation and about 6 MB of material per season; the fast world breaks MATCH-7 (a watched and an unwatched match give different results, and export/re-import could reroll one)
- [x] Run unwatched own matches on the aggregate path ← loses their material and makes watching change results (MATCH-7)
- [o] Order of work: (1) the IndexedDB move, (2) the x10 work ← owner 261026; both wait until the current football tasks are done (T433, T434, T410 at 261026), since they would collide with work in progress
- [o] (1) The game in play's checkpoint moves to IndexedDB; localStorage keeps only small settings and the manifest ← owner 261026
  - Why localStorage was used: ARCH-11 chose it "for the web demo" at the first ARCH (261007) with no recorded comparison; IndexedDB then took the parked slots (ARCH r6, 261012) and the previous copy (SAVE r48 / ARCH r11, 261019) when space ran out, while ARCH-14 kept "never move the active checkpoint".
  - Checked 261026: IndexedDB writes are asynchronous and can be cut short when a tab closes, but today's checkpoint is already built asynchronously in the codec worker; the IndexedDB code exists (`apps/web/src/adapters/previousStore.ts`, `games.ts`); eviction and Safari's 7-day rule treat localStorage and IndexedDB alike; localStorage's own costs (the 5 MiB origin allowance behind the 3 MiB cap, synchronous main-thread writes) are the ones the game hits.
- [o] (1) keeps the 3 MiB per-checkpoint cap and the 8 / 32 MiB import limits; the 3.5 MiB total covers only localStorage ← a century checkpoint measures about 2.5 MB, and the cap keeps every checkpoint exportable under the import cap and loadable on the fallback; raise it when a profile needs it (autopilot 261026)
- [o] (1) keeps the IndexedDB-unavailable fallback on localStorage slot:a/b as it is ← the code and its failure protection exist; without it a browser lacking IndexedDB could not save at all (autopilot 261026)
- [?] Later, split the checkpoint into the current season (rewritten by every save) and a per-season archive written once at the season close (both in IndexedDB) ← past seasons are about 70% of a century checkpoint (about 20 KB a season, ~1.8 MB of ~2.5 MB) and never change, so autosaves would stop recompressing them; more work than (1) alone
- [x] Keep the current season in localStorage and only the archive in IndexedDB (the owner's first idea) ← keeps the main-thread write and adds a second store to keep consistent, for no gain over keeping both in IndexedDB
- [o] (2) At x10 a match day shows a "경기 진행 중…" animation (a loading indicator) while it is computed, instead of a frozen calendar ← owner 261026: a halt the owner expects and can see a reason for does not bother him
- [?] Which x10 performance steps still come with the indicator. Recommendation: (a) compute the day's other fixtures in parallel helper workers (each fixture has its own seeded streams, so results stay identical), and (c) cut the detailed engine's repeated work (a target read ~80 times an action, the speculative intention update `readsOf` ~15% of the match, allocations), both result-identical, to shorten the indicator and lift throughput toward x10; (b) the run-ahead buffer is probably unnecessary once the halt is shown as a match day
- [?] Whether x10 still promises 10 days a second: with the indicator a week at x10 takes about 0.6 s of ordinary days plus the match day's computation (~0.9 s today), so x10 runs at about 7.8 days a second unless (a)/(c) land

## shape
- flow: (1) IndexedDB move → (2) x10: match-day indicator, then the chosen result-identical performance steps
- v1: the game in play's checkpoint in IndexedDB with migration of existing saves; the "경기 진행 중…" indicator on match days at fast paces / not: the season-archive split, the run-ahead buffer, any change to engine results or dispatch

## domains
- SAVE: SAVE-3 (where the active and previous checkpoints live), SAVE-4 (the 3 MiB per-checkpoint cap and the 3.5 MiB total, which came from localStorage), SAVE-14 (parked slots, the IndexedDB-unavailable fallback), migration of an existing localStorage checkpoint →SAVE-3
- ARCH: ARCH-11 (localStorage as the save store), ARCH-14 (the budget rule that never moves the active checkpoint), the constraint "the web demo's primary save store is localStorage"; ARCH-31 if throughput budgets change →ARCH-11
- WEB: WEB-18 / automatic play (the match-day indicator at fast paces, what the calendar shows while it runs), WEB-64 if background play is affected

## open
- Which paces show the indicator: only x10, or any pace where a match day takes longer than one day's interval?
- After the indicator, does the clock catch up the owed days (today up to 5 days at once), or resume at the normal pace from the match day?
- What the indicator shows: only an animation and caption, or also the own match's score or other results as they settle?
