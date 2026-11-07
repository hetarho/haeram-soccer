# T700 — the lower tiers on the rules in force, where a delegated club's rise comes from, and the ability-fit wage screened

Measured 261107, 15:11–15:56Z on ihaelam-ui-MacBookPro (10 cores, ten jobs; load 2.7 at the start), on
46718e60 with `scripts/owner-balance.ts`'s `--growth`, `--sources` and `--compare` (this task's
change; no engine change, no override: production's CLUB-48 table, LEAGUE-10's means level and the
books' competition money as in force).

Files:

- `careers.md` — LEAGUE-13's table, the growth table, ECON-29's rows on 중견 사업가 and ECON-36's ±25%
  for the 38 reference careers (`owner-balance.ts --in`), T693's baseline beside as labelled context.
- `growth.md` — the sources of the rise below the top flight and the screen's verdict
  (`owner-balance.ts --in … --sources`), with the consistency checks.
- `careers.json` — the 38 careers kept (`--out`, merged): the 22 lower-tier careers with their
  `growth` records (the second run, below) and the 16 재벌 총수 and 산업 자본가 careers without.

Commands (one job each, at most ten at a time, from a node driver in the session's temp area):

    pnpm exec tsx scripts/owner-balance.ts --prepare --seeds 2 --first-seed 0 --world-dir DIR
    pnpm exec tsx scripts/owner-balance.ts --tiers midsize|local|selfmade --countries C --seeds 1 \
      --first-seed S --until 1969 --purse-apart --growth --world-dir DIR --out TIER-C-S.json   (24 jobs)
    pnpm exec tsx scripts/owner-balance.ts --tiers midsize --countries ENG --seeds 1 --first-seed 0 \
      --until 1969 --purse-apart --world-dir DIR --out control.json            (the control, no --growth)
    pnpm exec tsx scripts/owner-balance.ts --tiers chaebol|industrial --countries C --seeds 1 \
      --first-seed S --until 1969 --purse-apart --world-dir DIR --out TIER-C-S.json            (16 jobs)
    pnpm exec tsx scripts/owner-balance.ts --in DIR/careers,DIR/upper --until 1969 --purse-apart
    pnpm exec tsx scripts/owner-balance.ts --in DIR/careers --until 1969 --purse-apart --sources
    pnpm exec tsx scripts/owner-balance.ts --in A --compare B

(S = 0, 1 for `owner-balance-0`/`-1`; C = ENG ESP FRA GER; 자수성가 축구팬 finds no Spanish club, so
its two Spanish jobs keep no career.)

Two runs of the lower tiers: the first (15:11–15:38Z, with the 16 upper careers and the control)
read an XI player's origin from the transfer facts alone, and a free move keeps none (→HIST-20), so
the 단장's free signings fell in `other`; the second (15:41–15:56Z) reads each arrival as he joins
(a fee fact, else a completed staff bid at fee 0 for the 단장's free signing, else the graduate mark,
else a free agent arriving at the close). Both runs' season rows are identical (growth.md), so the
second run's growth records are the ones kept and reported.

## Cost

Seconds per career (20 seasons, 1950/51–1969/70) on this host at ten jobs, the first run: the 22
lower-tier careers with `--growth` and the control, median 446 s (357–486 s); the 16 upper careers
without it, started as the lower ones ended, median 346 s (309–380 s); all 39, median 381 s; the
whole run 26.7 minutes wall. T699's 869 s median at ten jobs was on hq-dev1-pve2-vm2 (12 cores), a
different host, so the ratio (about 0.5) is the hosts', not the measurement's. Each 1930–1950 world:
lived once per seed before the jobs.
