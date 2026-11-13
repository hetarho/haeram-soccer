# Combine the best of four engines into this one, then make pressure play like football

## 1. Combine (owner: "A/B/C/D의 장점을 하나로 모아서 일단 하나로 합쳐봐 … 수치상으로 일단 가장 좋은거 위주로")

Four sessions built four versions of the engine from the same brief. By eye the owner saw no clear
winner, so combine them by the numbers into this worktree. This worktree (D, your last commit) is
the base because it measured best on most rows. The other three worktrees were deleted. Their
work is saved as patches against base 9769ffe9:

    /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/ab-natural/patches/
      a.committed.patch  b.committed.patch  d.committed.patch   finished, tested work
      a.wip.patch  b.wip.patch  c.wip.patch  d.wip.patch          unfinished speed work, stopped midway, untested
      ab-state/<v>-run-<n>.prompt.md / .log                       each run's brief, previous summary and transcript

Measured on the match the owner watches (same export, viewer scripts, running play):

| | main | A | B | D (base) |
|---|---|---|---|---|
| circling under pressure (`circle.py`) | 105 | 72 | 76 | **71** |
| beat his man, then came back | 8 | 8 | **6** | 7 |
| opponent pairs within 3 m for 20 s+ (`stick.py`) | 49 | 46 | 41 | **25** |
| player-seconds above 10 m/s (`speed.py`) | 2.5% | 3.3% | 1.8% | **0.85%** |
| sprint metres per 90 (real 200–350) | 1,831 | 2,189 | 1,741 | **1,228** |
| near-frozen / rushed minutes (`minutes.py`) | 16 / 12 | 15 / 10 | 9 / 11 | **5 / 8** |
| lost passes that went to nobody (`press.py`) | 38 | **36** | 43 | 38 |
| spells held 5 s+ with an opponent within 2 m (`press.py`) | 26 | 18 | 21 | **11** |

Strengths the others have and D lacks, from their own measurements (read their patches and run
summaries for the details):
- A: outside shots placed within 10 m of the goal side of their cell (mean shot distance 21.3 → 18.2 m,
  shots from 30 m+ 28% → 0.4%); its press-hold and `jockeyPoint` gave the fewest spells held under
  pressure 2 s+ (75 vs D 92).
- B: fewest beat-then-come-back (6); a reversal penalty and back-pass delay in the writer (forward
  carry followed by a back pass 7.7 → 5.7 a match); take-on endpoints always 2 m+ past the defender.
- C: never finished; its unfinished patch is there if anything in it is clearly worth taking.
- The `.wip` patches are unfinished speed work, for ideas only.

Take a strength only where it measures better combined with D than D alone; keep D's wins.

## 2. Pressure, then a pass (owner, after watching A's match)

His words: "A에서 1.03에 갑자기 아무도 없는곳으로 공을 패스해서 상대 수비수에게 전달함 / 1.21에도
동일 / 1.32에 수비수가 공을 패스안하고 지연함 공격수 압박이 들어왔는데도 / 전반적으로 압박하러 오면
유려한 탈압박을 하는 선수가 아니면 모두 공을 뺏겨 그래서 상대가 다가오면 패스를 해야해 그게 축구야"

- In A's match at 1′03″ and 1′21″ (the first minute, 3 s and 21 s in) a player suddenly passed into
  space where nobody was, straight to an opposing defender. Same at both times.
- At 1′32″ a defender held the ball instead of passing, though an attacker came to press him.
- In general: when an opponent comes to press, everyone except a player who is genuinely good at
  escaping pressure loses the ball. So when an opponent closes in, the player passes. That is
  football.

So: a pass that is lost should look like a pass to a teammate that an opponent cuts out or that
goes astray near its target, not a ball played to empty space. A player whom a presser reaches
releases the ball (or, by the record, loses it to the presser); only a press-resistant player
(judge from his attributes) holds, shields or escapes. Who wins the ball stays the record's fact.
The owner said the SSOT may change freely; name every decision you change in your summary.

## Measure (from this worktree; the export writes outside the repo, about 30 s)

    pnpm exec tsx /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/export.mts --out /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/out/followup/merged.json.gz
    for s in circle stick speed minutes press: python3 -I /tmp/claude-2378/-home-deep-haeram-haeram-soccor/522282c4-9fc5-44b4-92bb-131a692aa470/scratchpad/viewer/$s.py now=<that file>

Do not edit the viewer scripts. Read the staging's picture limits on a few
`scripts/model-verdict.ts stage` matches as well.

## Done

- The table above with a column for the combined engine, every row at least as good as D's or the
  trade explained; "lost to nobody" and "held 5 s+ under pressure" clearly down.
- Typecheck, lint and the affected engine unit and integration tests pass (staging, script,
  scripted-match, incidents, frames.match, perform.fixtures, pairings).
- A summary: what was taken from which version, what the owner will see under pressure, the
  decisions changed, the weaknesses.
- Timebox: about 2 hours. The speed and frozen-minute work comes in the next round, not this one.
