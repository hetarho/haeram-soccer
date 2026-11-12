/** Post-match facts from the script, independent of staging and observation (MATCH-25). */
import type { MatchMaterial } from '../../../contracts/src/types';
import { isCutBack, MaterialTally } from '../match/record';
import { EVENT_KINDS, EV, SH, SHOT_OUTCOMES } from './codes';
import { cellAt, toAttack } from './cells';
import type { MatchDetail } from './detail';
import type { Script, TeamId } from './types';
import { isPassLike } from './types';

/** Detail lines already use record order, so their indexes are the tally's roster indexes. */
export function scriptMaterial(detail: MatchDetail, script: Script, own: TeamId): MatchMaterial {
  const tally = new MaterialTally(own, detail.sides[own].lines.length);
  let possession: number | undefined;
  for (const b of script.beats) {
    // An incident stop and the separate shoot-out are not ordinary on-ball actions.
    if (b.kind === 'stoppage' || b.kind === 'shootoutKick') continue;
    tally.touch(b.side, b.actor, b.from, b.phase, b.possession !== possession);
    possession = b.possession;
    const from = toAttack(b.side, b.from),
      to = toAttack(b.side, b.to),
      pass = isPassLike(b.kind),
      completed = b.outcome === 'complete';

    if (pass && completed && b.receiver !== undefined)
      tally.received(b.side, b.actor, b.receiver, b.to, b.event !== undefined);

    // Linking carries and restart deliveries without a recorded pass add touches, not counters.
    if (b.event !== undefined) {
      const kind = EVENT_KINDS[detail.events[b.event]![EV.kind]!]!;
      if (pass) {
        if (kind === 'cross' || kind === 'through') tally.pass(b.side, kind, completed);
        if (completed && isCutBack(cellAt(b.side, b.from), cellAt(b.side, b.to)))
          tally.pass(b.side, 'cutBack');
      }
      if (completed && (pass || b.kind === 'carry' || b.kind === 'takeOn'))
        tally.entry(b.side, from, to);
      if (b.kind === 'takeOn') {
        tally.takeOn(b.side);
        if (completed) tally.dribble(b.side);
      }
      if (b.outcome === 'tackled' && b.creditedOpponent) tally.tackle((1 - b.side) as TeamId);
    }

    if (
      b.opponent !== undefined &&
      (b.outcome === 'tackled' || b.outcome === 'intercepted' || b.outcome === 'loose')
    ) {
      const winner = (1 - b.side) as TeamId;
      tally.regain(winner, toAttack(winner, b.to));
    }

    if (b.shot !== undefined) {
      const shot = detail.shots[b.shot]!;
      tally.shot(
        b.side,
        b.actor,
        SHOT_OUTCOMES[shot[SH.outcome]!]!,
        {
          x: from[0],
          y: from[1],
          xg: shot[SH.xg]! / 100,
          header: shot[SH.header] === 1,
          setPiece: shot[SH.kind] !== 0,
        },
        true,
      );
    }
  }
  return tally.finish(
    detail.sides.map((s) => s.lines.map((_, line) => line)),
    1,
  );
}
