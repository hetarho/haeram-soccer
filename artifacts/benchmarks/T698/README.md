# T698 — CLUB-48's champions part on the real leagues' spread and history's noise

Measured 261104, 12:19–12:52Z on hq-dev1-pve2-vm2 (12 cores, load under 2 before the run), on 7e491313 with this
task's source changes: `RESULTS_LUCK` and `resultsKey` in `packages/engine/src/results-only.ts` (a measurement-only
override, salt empty in production) and `scripts/era-wage-spread.ts`'s `--placebo` / `--champions-placebo`, the real
band (`CHAMPION_BAND`, `REAL_CHAMPIONS`) and the 261011 band kept as a labelled second reading (`BAND_261011`).

**Verdict: under CLUB-48 r57, T697's candidate passes the champions part in every country** — per country, pooled
over the four seeds, its points outside the real leagues' spread stay within released + history's noise (allowance
6). Production stays released: `STAR_SPREAD_CONFIG` s = 1 with no own anchor, `MEANS_LEVEL.inForce` and
`BOOK_COMPETITIONS.inForce` false; nothing is switched here. The careers' check and the activation on T697's table
are the next gusta-create-task slice. T696's candidate passes as well, as context only (CLUB-48 admits a table only with
competition money in the books).

| part | worlds read | result |
|---|---|---|
| tree check | owner-balance-0 re-lived with the override at its default (`--years 2009 --countries POR --until 2009`) | equal: all 584 champions 1930/31–2009/10 equal T696's `released-0.extra.json` |
| reference | LEAGUE-10 r17's real spread, 4–9 different champions, the most titles of one club 7–17 | official lists **not read** (no web access in this unit); a second season-by-season recall agrees with every country's tally and every band end (`reference.md`), so the task went on |
| noise | 19 placebo sets × owner-balance-0…3 = 76 released worlds, 1930/31's results drawn with the set's salt, lived to 2009/10 | **allowance 6** (placebo-14 ENG, placebo-16 and placebo-17 ITA end 6 points further out than released); 18 of 19 sets end further out than released in at least one country; champions diverged from released in 37.0–40.9% of the 960 country-seasons 1980–2009 (mean 38.5%) — `noise.md`, written 12:48Z before any candidate was read |
| T697 candidate (the verdict) | `gate-{0..3}.extra.json` against released, 1980–2009 | **passes in every country**: BEL 5 → 0, ENG 0 → 0, ESP 15 → 4, FRA 5 → 4, GER 5 → 6 (bar 11), ITA 1 → 0, NED 0 → 0, POR 0 → 0; diverged 35.7% |
| T696 candidate (context) | `candidate-{0..3}.extra.json` | passes in every country: BEL 5 → 1, ENG 0 → 0, ESP 15 → 3, FRA 5 → 3, GER 5 → 7 (bar 11), ITA 1 → 1, NED 0 → 0, POR 0 → 2 (bar 6); diverged 37.3% |
| old reading (diagnosis) | the same extras on the 261011 band (5–9, 8–15), no further out than released | reproduces T697's and T696's published readings exactly: T697 GER 8 → 11, POR 1 → 2 worse; T696 GER 8 → 12, POR 1 → 2 worse |
| cost | the 76 placebo worlds, eight jobs at a time | 1.74 s a lived season (1.50–1.85), against T697's released worlds at 1.49 s with four jobs on this host; the tree check (the same code, one job) 1.31 s |

## Reading

**The reference.** On the real spread the released worlds themselves sit 0–15 points outside per country (ESP 15,
BEL 5, FRA 5, GER 5, ITA 1, ENG/NED/POR 0); T697's candidate is closer to the real leagues than released in four
countries (BEL, ESP, FRA, ITA), level in three (ENG, NED and POR at 0), and one point further out in GER only
(seed 0: 3 different champions and 17 titles where released has 4 and 15). The real Bundesliga (7 different, Bayern 16) and Primeira
Liga (4 different, Porto 17) sit inside the real band, so the candidate's POR (2 points outside on the old band) is
inside the real one. The reference alone does not decide the verdict (GER 6 against 5); the noise does, as the
planning slice foresaw.

**The noise.** A placebo changes nothing but the luck of 1930/31: 54% of that season's champions differ from
released, and by the 1950s and through 1980–2009 about 38–39% of the champions do — fifty years of history carry
that one season's luck into a different past. Pooled over the four seeds, a placebo set ends up to 6 points further
out than released in a country (ENG, ITA), and only one set of 19 (placebo-5) is nowhere further out than released.
So the old rule, "no further out than released" on one history per seed, fails a candidate that changes nothing in
18 of 19 readings; the allowance fails it in at most one in 20.

**The divergence share** (context, not a rule): T697's candidate diverges from released in 35.7% of country-seasons
and T696's in 37.3%, a little less than the placebos (37.0–40.9%). The candidates therefore move history about as
much as one season's luck does; the placebo is not the stricter case here (its histories diverge slightly more than
the candidate's), and is recorded as such; the placebo's definition was fixed by CLUB-48 r57 before this reading and
is not re-chosen after it. T697's only country further out than released, GER, is +1, well inside GER's own placebo
spread (−5 … +5 over the 19 sets, 8 sets at +1 or more).

**What this does not settle.** The champions part passes; CLUB-48's gate still has the careers' check, which T697
did not run (it runs only after fit, books and champions pass), and the activation (the three switches together,
the influence map, digests and prepared worlds). Both are the next slice on T697's table (`T697/candidate.json`:
0.28 through 1970, 0.61 at 1990, 1 from 2008; England's own s = 0 through 1960/61).

## Files

- `reference.md` — LEAGUE-10 r17's real spread, the lists not read, and the season-by-season recall checked against
  it.
- `noise.md` — the 19 placebo sets per country: points outside the real spread pooled over the seeds, the excess over
  released, the allowance and each set's divergence share. Written before any candidate was read.
- `champions-t697.md` — T697's gate extras: the noise table again, the per-seed diagnosis (real and 261011 band
  points, released → candidate), the pooled verdict with released + allowance and the old reading beside it.
- `champions-t696.md` — the same for T696's candidate extras (context).
- `placebos.tar.gz` — the 76 placebo extras (`placebo-<set>-<seed>.extra.json`: champions of every season, the salt,
  seconds), the tree check's `check-0.extra.json` and the driver's log.

Commands (archives extracted into the session's temp area, never into the tree):

    pnpm exec vitest run --project unit packages/engine/src/results-only.test.ts
    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-0 --years 2009 --countries POR --until 2009 \
      --out check-0.json                                            the tree check, against T696's released-0
    pnpm exec tsx scripts/era-wage-spread.ts --seeds owner-balance-<k> --years 2009 --countries POR --until 2009 \
      --placebo placebo-<n> --out placebo-<n>-<k>.json              n = 1…19, k = 0…3, eight at a time (a node driver)
    pnpm exec tsx scripts/era-wage-spread.ts --champions-released T696/released-{0..3}.extra.json \
      --champions-placebo placebo-{1..19}-{0..3}.extra.json         → noise.md
    pnpm exec tsx scripts/era-wage-spread.ts --champions-released ... --champions-placebo ... \
      --champions-candidate T697/gate-{0..3}.extra.json             → champions-t697.md (T696/candidate-*: -t696)

## The placebo draw

`resultsOnlyMatch` draws a fixture's result from one stream, `` `${w.seed}:results:${f.id}` ``; every fixture
before the takeover takes it (→MATCH-22), league, cup and continental alike. With `RESULTS_LUCK.salt` set, the
fixtures of season `RESULTS_LUCK.season` (1930, the world's first; `w.year === season` until its close) draw from
`` `${w.seed}:results:${salt}:${f.id}` `` instead. Form, injuries, discipline, summers, statures, squads and cup
draws keep their keys, so a placebo shares every later draw with released, as a candidate does. With the salt empty
(production, the default) the key is the released one exactly: unit tests pin the first fixtures' scores and goal
lines as before the override, and the re-lived seed-0 world equals T696's released world.
