/** Minimal frozen identities: the frame adapter reads names only, never player gameplay state. */
import type { MatchScript, StagingSide } from '../../../contracts/src/match-script';
import type { MatchRecord, Player } from '../../../contracts/src/types';
import { smallDetail } from '../../../../tests/fixtures/match-script';
import { countScript } from '../script/count';
import { recordOf, type MatchDetail } from '../script/detail';

export function frameTestInputs(script: MatchScript, detail: MatchDetail = smallDetail()) {
  const sides = detail.sides.map((side): StagingSide => ({
    tactic: side.tactic,
    players: side.lines.map((p, line) => ({
      line,
      slot: p.slot,
      role: p.role,
      pace: 50,
      anticipation: 50,
      discipline: 50,
      pressing: 50,
      freedom: 50,
    })),
  })) as [StagingSide, StagingSide];
  const squads = detail.sides.map((side) =>
    side.lines.map((p) => ({ id: p.id, name: `Player ${p.id}` }) as Player),
  ) as [Player[], Player[]];
  const totals = countScript(script, detail);
  const record: MatchRecord = {
    id: detail.id,
    home: 'home',
    away: 'away',
    year: 2024,
    round: 1,
    kind: 'league',
    country: 'ENG',
    groupKey: 'ENG.0.0',
    ...totals,
    players: recordOf(detail).players,
    lineCounts: [detail.sides[0].lines.length, detail.sides[1].lines.length],
    tactics: [sides[0].tactic, sides[1].tactic],
    added: detail.added,
    highlights: [],
  };
  return { sides, squads, record };
}
