import type { ScriptSide, StagingSide } from '../../../contracts/src/match-script';
import type { MatchPlayback, MatchRecord, Player } from '../../../contracts/src/types';
import { playerTendencies, type TendencyManager } from '../match/tendencies';
import type { MatchDetail } from './detail';
import { countScript, compareRecord } from './count';
import { invalidDetail } from './failure';
import { scriptMaterial } from './material';
import { validateScript } from './validate';
import { writeScript } from './write';

/** Record-line order includes substitutes; the first stint supplies their actual entry slot. */
export function stagingSides(
  detail: MatchDetail,
  squads: readonly [readonly Player[], readonly Player[]],
  managers: readonly TendencyManager[],
): [StagingSide, StagingSide] {
  return detail.sides.map((side, team): StagingSide => ({
    tactic: side.tactic,
    players: side.lines.map((line, index) => {
      const player = squads[team]!.find((p) => p.id === line.id)!;
      const tendencies = playerTendencies(player, managers[team]!, line.role);
      return {
        line: index,
        slot: line.slot,
        role: line.role,
        pace: player.attrs.pace,
        anticipation: tendencies.anticipation * 100,
        discipline: tendencies.discipline * 100,
        pressing: tendencies.pressing * 100,
        freedom: tendencies.freedom * 100,
      };
    }),
  })) as [StagingSide, StagingSide];
}

/**
 * Both watch and skip write the same material. Only a validated script crosses to presentation;
 * any detail/writer/recount failure keeps the original settled record without material. The
 * writer argument is the test seam for forcing a bad count, without changing the football draw.
 */
export function ownMatchPlayback(
  record: MatchRecord,
  squads: [Player[], Player[]],
  detailFor: () => MatchDetail,
  {
    managers,
    seed,
    own,
    observe,
    writer = writeScript,
  }: {
    managers: readonly TendencyManager[];
    seed: string;
    own: ScriptSide;
    observe: boolean;
    writer?: typeof writeScript;
  },
): MatchPlayback {
  const playback: MatchPlayback = { record, squads, frames: [] };
  try {
    const detail = detailFor();
    const written = writer(detail, seed);
    if ('problems' in written) return { ...playback, problems: written.problems };
    const { script } = written;
    const problems = [
      ...validateScript(detail, script),
      ...compareRecord(detail, countScript(script, detail), record),
    ];
    if (problems.length) return { ...playback, problems };
    const material = scriptMaterial(detail, script, own);
    return {
      ...playback,
      record: { ...record, material },
      ...(observe && { script, staging: stagingSides(detail, squads, managers) }),
    };
  } catch (error) {
    return {
      ...playback,
      problems: [error instanceof Error ? error.message : invalidDetail(String(error)).message],
    };
  }
}
