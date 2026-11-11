/** Recorded deliveries held available for the restarts the detail awards. */
import { cellAt, cellCentre, restartSpot } from './cells';
import { EV, EVENT_RESULTS, FO, SH, SHOT_OUTCOMES } from './codes';
import type { MatchDetail } from './detail';
import type { BeatKind, TeamId, Vec } from './types';
import { FLOATING } from './touches';
const R = (name: (typeof EVENT_RESULTS)[number]) => EVENT_RESULTS.indexOf(name);
const other = (side: TeamId): TeamId => (side === 0 ? 1 : 0);
export function planRestarts(settled: MatchDetail, fixed: { events: number[]; fouls: number[] }) {
  const demand = [Array<number>(40).fill(0), Array<number>(40).fill(0)];
  const cornerDemand = [0, 0];
  const need = (team: TeamId, kind: BeatKind, at: Vec) => {
    if (kind === 'corner') cornerDemand[team]!++;
    else demand[team]![cellAt(team, restartSpot(kind, team, at))]!++;
  };
  need(0, 'kickOff', [0, 0]);
  need(1, 'kickOff', [0, 0]);
  for (const e of settled.events) {
    const team = e[EV.side] as TeamId,
      at = cellCentre(team, e[EV.to]!);
    if (e[EV.result] === R('outTouch')) need(other(team), 'throwIn', at);
    if (e[EV.result] === R('outByline')) need(other(team), 'goalKick', at);
    if (e[EV.result] === R('cornerWon')) need(team, 'corner', at);
    if (e[EV.result] === R('offside')) need(other(team), 'freeKick', at);
  }
  for (const s of settled.shots) {
    const team = s[SH.side] as TeamId,
      at = cellCentre(team, s[SH.cell]!);
    if (SHOT_OUTCOMES[s[SH.outcome]!] === 'goal') need(other(team), 'kickOff', at);
    else if (s[SH.corner]) need(team, 'corner', at);
    else if (SHOT_OUTCOMES[s[SH.outcome]!] === 'miss') need(other(team), 'goalKick', at);
  }
  for (const f of settled.fouls)
    need(
      f[FO.fouledSide] as TeamId,
      'freeKick',
      cellCentre(f[FO.fouledSide] as TeamId, f[FO.cell]!),
    );
  // A corner's side is not recorded by the shot/out row. Its recorded delivery can choose it.
  for (const team of [0, 1] as const) {
    demand[team]![35]! += cornerDemand[team]!;
    demand[team]![39]! += cornerDemand[team]!;
  }
  const reserve = new Set<number>();
  const reservedCount = [Array<number>(40).fill(0), Array<number>(40).fill(0)];
  const openPasses = settled.sides.map((s) => s.lines.map(() => 0));
  for (const e of settled.events) if (e[EV.kind]! < 5) openPasses[e[EV.side]!]![e[EV.actor]!]!++;

  settled.events.forEach((e, id) => {
    const team = e[EV.side]!,
      cell = e[EV.from]!;
    if (
      e[EV.kind]! < 5 &&
      fixed.events[id] === FLOATING &&
      reservedCount[team]![cell]! < demand[team]![cell]! &&
      openPasses[team]![e[EV.actor]!]! > 1
    ) {
      reserve.add(id);
      reservedCount[team]![cell]!++;
      openPasses[team]![e[EV.actor]!]!--;
    }
  });
  return { demand, reserve };
}
