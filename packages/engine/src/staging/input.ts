import { invalidDetail } from '../script/failure';
import type { MatchScript, StagingSide } from '../../../contracts/src/match-script';
import { FORMATIONS } from '../formations';
import { STAGING_CONFIG } from './config';
import type { Beat, Fixture, PlayerSpec, Script, TeamId, TeamSpec } from './types';

export function stageFixture(sides: readonly [StagingSide, StagingSide]): Fixture {
  const paces = sides.flatMap((s) => s.players.filter((p) => p.slot !== 0).map((p) => p.pace));
  const slow = Math.min(...paces);
  const fast = Math.max(...paces);
  const scale = STAGING_CONFIG.motion.tendency.pace;
  let index = 0;
  const teams = sides.map((side, team): TeamSpec => ({
    id: team as TeamId,
    code: team === 0 ? 'H' : 'A',
    style: side.tactic,
    players: side.players.map((p): PlayerSpec => ({
      ...p,
      index: index++,
      team: team as TeamId,
      number: p.line + 1,
      position: FORMATIONS[side.tactic].slots[p.slot].position,
      attrs: { pace: p.pace, anticipation: p.anticipation },
      paceScale:
        p.slot === 0 || fast === slow
          ? 1
          : scale.min + ((p.pace - slow) / (fast - slow)) * (scale.max - scale.min),
    })),
  })) as [TeamSpec, TeamSpec];
  return { teams, players: teams.flatMap((t) => t.players), sides };
}

/** Keep record identities on each beat; dense indexes never escape the staging implementation. */
export function stageScript(script: MatchScript, fixture: Fixture): Script {
  const indexes = fixture.teams.map((t) => new Map(t.players.map((p) => [p.line, p.index])));
  const player = (side: TeamId, line: number): number => {
    const index = indexes[side].get(line);
    if (index === undefined) throw invalidDetail('staging:input');
    return index;
  };
  const beats = script.beats.map((b): Beat => ({
    ...b,
    team: b.side,
    actor: player(b.side, b.actor),
    ...(b.receiver === undefined ? {} : { receiver: player(b.side, b.receiver) }),
    ...(b.opponent === undefined ? {} : { opponent: player(b.side === 0 ? 1 : 0, b.opponent) }),
    original: b,
  }));
  return {
    seed: script.seed,
    bound: true,
    fixture,
    beats,
    times: beats.map((b) => b.clock ?? 0),
    nominalSeconds: 0,
  };
}
