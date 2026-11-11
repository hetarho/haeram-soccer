import { IN } from './codes';
import type { MatchDetail } from './detail';
import type { Beat, Script } from './types';
import { isRestartKind } from './types';
import { beatIncident, foulCards, incidentIndex, incidentRows, sameIncident } from './incidents';

export const isDead = (b: Beat) =>
  isRestartKind(b.kind) ||
  b.kind === 'stoppage' ||
  ['out', 'foul', 'offside', 'goal', 'wide'].includes(b.outcome) ||
  !!b.corner;

/** Incidents are counted from beats, and the evolving XI is checked independently of the writer. */
export function incidentProblems(detail: MatchDetail, script: Script): string[] {
  const problems: string[] = [];
  const rows = incidentRows(script.beats);
  const remaining = rows.map((r) => r.join('/'));
  for (const [i, row] of detail.incidents.entries()) {
    const at = remaining.indexOf(row.join('/'));
    if (at < 0) problems.push(`incident:${i}:missingOrMinute`);
    else remaining.splice(at, 1);
  }
  if (remaining.length) problems.push('incident:unexpected');
  const cards = foulCards(detail);
  for (const [foul, index] of cards) {
    const b = script.beats.find((b) => b.foul === foul);
    if (!b?.incidents?.some((x) => sameIncident(x, beatIncident(detail.incidents[index]!))))
      problems.push(`incident:${index}:foul`);
  }
  const active = [new Set<number>(), new Set<number>()];
  for (const s of detail.stints) if (s[3] === 0) active[s[0]!]!.add(s[1]!);
  const apply = (b: Beat) => {
    for (const x of b.incidents ?? []) {
      if (x.side !== 0 && x.side !== 1) {
        problems.push(`beat:${b.index}:incidentSide`);
        continue;
      }
      if (x.kind === 'sub') {
        active[x.side]!.delete(x.line);
        if (x.other !== undefined) active[x.side]!.add(x.other);
      } else if (['red', 'secondYellow', 'injury'].includes(x.kind)) active[x.side]!.delete(x.line);
    }
  };
  const standalone = new Map<string, number[]>();
  const stops = new Map<string, Set<number>>();
  const booked = new Set(cards.values());
  script.beats.forEach((b, i) => {
    if (b.side !== 0 && b.side !== 1) return;
    const before = b.kind === 'stoppage' || isRestartKind(b.kind);
    if (before) apply(b);
    if (b.kind !== 'stoppage') {
      if (
        !active[b.side]!.has(b.actor) ||
        (b.receiver !== undefined && !active[b.side]!.has(b.receiver)) ||
        (b.opponent !== undefined && !active[1 - b.side]!.has(b.opponent))
      )
        problems.push(`beat:${i}:lineup`);
    }
    if (!before) apply(b);
    if (b.incidents?.length && !isDead(b)) problems.push(`beat:${i}:liveIncident`);
    const minute = Math.min(Math.floor(b.clock / 60), detail.length - 1);
    for (const side of [0, 1] as const) {
      const allowed = new Set(
        detail.stints
          .filter((s) => s[0] === side && s[3]! <= minute && s[4]! > minute)
          .map((s) => s[1]),
      ).size;
      // A booked dismissal is allowed to finish its foul before leaving at this beat.
      const pending = detail.incidents.filter(
        (x) =>
          x[IN.side] === side &&
          x[IN.minute] === minute + 1 &&
          [1, 2, 4].includes(x[IN.kind]!) &&
          active[side].has(x[IN.line]!),
      ).length;
      if (active[side].size > allowed + pending || active[side].size > 11)
        problems.push(`beat:${i}:men`);
    }
    for (const x of b.incidents ?? []) {
      const index = incidentIndex(detail, Math.floor(b.clock / 60) + 1, x);
      if (booked.has(index)) continue;
      const key = `${Math.floor(b.clock / 60) + 1}/${x.side}`;
      const sequence = standalone.get(key) ?? [];
      sequence.push(index);
      standalone.set(key, sequence);
      const beats = stops.get(key) ?? new Set<number>();
      beats.add(i);
      stops.set(key, beats);
    }
  });
  for (const sequence of standalone.values())
    if (sequence.some((x, i) => i > 0 && x <= sequence[i - 1]!)) problems.push('incident:order');
  for (const beats of stops.values()) if (beats.size > 1) problems.push('incident:splitStop');

  const kicks = script.beats.filter((b) => b.kind === 'shootoutKick');
  if (kicks.length !== detail.shootout.length) problems.push('shootout:length');
  kicks.forEach((b, i) => {
    const row = detail.shootout[i];
    if (
      !row ||
      b.side !== row[0] ||
      b.actor !== row[1] ||
      (b.outcome === 'goal' ? 1 : 0) !== row[2] ||
      !['goal', 'saved', 'wide'].includes(b.outcome) ||
      b.period !== 5 ||
      b.clock < detail.length * 60 ||
      b.event !== undefined ||
      b.shot !== undefined ||
      b.foul !== undefined
    )
      problems.push(`shootout:${i}:orderOrOutcome`);
    if (script.beats.slice(b.index + 1).some((next) => next.kind !== 'shootoutKick'))
      problems.push(`shootout:${i}:whistle`);
  });
  return problems;
}
