import { describe, expect, it } from 'vitest';
import { smallDetail } from '../../../../tests/fixtures/match-script';
import { REPORT_SLOTS as R } from '../material';
import { cellAt, toAttack } from './cells';
import { EVENT_KINDS } from './codes';
import { scriptMaterial } from './material';
import { materialBeat, materialScript } from './material.testkit';
import type { MatchDetail } from './detail';
import type { Beat, TeamId, Vec } from './types';

/** Neither record nor script holds aerial contests; a headed shot is not a duel won. */
export const unsupported = ['aerialsWon', 'aerials'] as const;
const sides = [0, 1] as const;
const report = (d: MatchDetail, beats: Beat[], side: TeamId) =>
  scriptMaterial(d, materialScript(beats), side).report.slice(side * 30, (side + 1) * 30);
/** Add one recorded action, expressed in its side's attacking direction. */
function recorded(d: MatchDetail, side: TeamId, values: Partial<Beat> = {}): Beat {
  const b = materialBeat({
    ...values,
    side,
    from: toAttack(side, values.from ?? [60, 34]),
    to: toAttack(side, values.to ?? [75, 34]),
    event: d.events.length,
  });
  d.events.push([
    side,
    d.events.length,
    EVENT_KINDS.indexOf(b.move as (typeof EVENT_KINDS)[number]),
    0,
    cellAt(side, b.from),
    cellAt(side, b.to),
    b.actor,
    0,
    0,
    b.opponent ?? -1,
    0,
  ]);
  return b;
}

describe('the script tactical report', () => {
  it('counts final-third and box entries in all five lanes from recorded completed passes and carries', () => {
    const d = smallDetail(),
      beats: Beat[] = [];
    for (const side of sides)
      for (const y of [7, 19, 34, 49, 61]) {
        beats.push(recorded(d, side, { from: [60, y], to: [95, y] }));
        beats.push(recorded(d, side, { kind: 'carry', move: 'carry', from: [60, y], to: [95, y] }));
        beats.push(
          recorded(d, side, { kind: 'takeOn', move: 'takeOn', from: [60, y], to: [95, y] }),
        );
        // A backwards completion, an unsuccessful pass and a linking carry add no entry.
        beats.push(recorded(d, side, { from: [95, y], to: [60, y] }));
        beats.push(recorded(d, side, { from: [60, y], to: [95, y], outcome: 'out' }));
        beats.push(
          materialBeat({
            side,
            kind: 'carry',
            move: 'link',
            from: toAttack(side, [60, y]),
            to: toAttack(side, [95, y]),
          }),
        );
      }
    for (const side of sides)
      expect(report(d, beats, side).slice(0, 10)).toEqual([3, 3, 3, 3, 3, 0, 3, 3, 3, 0]);
    expect(R.finalThirdEntries).toBe(0);
    expect(R.boxEntries).toBe(5);
  });

  it('counts scripted tackles, interceptions and loose-ball recoveries by the winning and losing thirds', () => {
    const d = smallDetail(),
      beats: Beat[] = [];
    for (const side of sides) {
      for (const [x, outcome] of [
        [20, 'tackled'],
        [50, 'intercepted'],
        [80, 'loose'],
      ] as const)
        beats.push(
          recorded(d, side, {
            from: [x, 34],
            to: [x, 34],
            outcome,
            opponent: 3,
            creditedOpponent: true,
          }),
        );
      // Restarts and shot endings do not invent an open-play regain.
      for (const outcome of ['foul', 'offside', 'out', 'saved', 'blocked'] as const)
        beats.push(materialBeat({ side, outcome, opponent: 3 }));
    }
    for (const side of sides) {
      const r = report(d, beats, side);
      expect(r.slice(R.regains, R.regains + 3)).toEqual([1, 1, 1]);
      expect(r.slice(R.losses, R.losses + 3)).toEqual([1, 1, 1]);
      expect(r[R.highRegains]).toBe(1);
    }
  });

  it('uses the end of a recovered heavy touch, without awarding it a recorded tackle', () => {
    const d = smallDetail();
    for (const side of sides) {
      const beats = [
        materialBeat({
          side,
          kind: 'carry',
          move: 'miscontrol',
          outcome: 'loose',
          opponent: 3,
          from: toAttack(side, [60, 34]),
          to: toAttack(side, [10, 34]),
        }),
      ];
      const won = report(d, beats, (1 - side) as TeamId),
        lost = report(d, beats, side);
      expect(won.slice(R.regains, R.regains + 3)).toEqual([0, 0, 1]);
      expect(lost.slice(R.losses, R.losses + 3)).toEqual([1, 0, 0]);
      expect(won[R.highRegains]).toBe(1);
      expect(won[R.tacklesWon]).toBe(0);
    }
  });

  it('counts set-piece shots and goals from recorded origins, including penalties, without inventing aerial duels', () => {
    const d = smallDetail(),
      beats: Beat[] = [];
    for (const side of sides)
      for (const [kind, outcome, header] of [
        [1, 0, 1],
        [2, 0, 0],
        [3, 1, 0],
        [0, 0, 1],
      ] as const) {
        const shot = d.shots.length;
        d.shots.push([side, 20, 32, kind, header, 25, outcome, 0, 9, -1, -1, 0]);
        beats.push(
          materialBeat({
            side,
            kind: kind === 3 ? 'penalty' : kind === 2 ? 'freeKick' : 'shot',
            shot,
            actor: 9,
            header: header === 1,
            outcome: outcome === 0 ? 'goal' : 'saved',
            from: toAttack(side, [95, 34]),
          }),
        );
      }
    for (const side of sides) {
      const r = report(d, beats, side);
      expect(r.slice(R.setPieceShots, R.setPieceGoals + 1)).toEqual([3, 2]);
      for (const slot of unsupported) expect(r[R[slot]], slot).toBe(0);
    }
  });

  it('counts take-on attempts and wins, and the corresponding tackles won and lost', () => {
    const d = smallDetail(),
      beats: Beat[] = [];
    for (const side of sides) {
      beats.push(recorded(d, side, { kind: 'takeOn', move: 'takeOn' }));
      beats.push(
        recorded(d, side, {
          kind: 'takeOn',
          move: 'takeOn',
          outcome: 'tackled',
          opponent: 3,
          creditedOpponent: true,
        }),
      );
      beats.push(recorded(d, side, { outcome: 'tackled', opponent: 4, creditedOpponent: true }));
      beats.push(recorded(d, side, { outcome: 'tackled', opponent: 4, creditedOpponent: false }));
      beats.push(materialBeat({ side, kind: 'carry', move: 'link' }));
    }
    for (const side of sides)
      expect(report(d, beats, side).slice(R.takeOnsWon, R.tackles + 1)).toEqual([1, 2, 2, 3]);
  });

  it("counts counter possessions and their shots from the script's phase and possession boundaries", () => {
    const d = smallDetail(),
      beats: Beat[] = [];
    for (const side of sides) {
      const shot = d.shots.length;
      d.shots.push([side, 20, 32, 0, 0, 10, 3, 0, 9, -1, -1, 0]);
      const base = { side, from: toAttack(side, [95, 34]), to: toAttack(side, [105, 34]) };
      beats.push(materialBeat({ ...base, phase: 'counter', possession: side * 10 }));
      beats.push(
        materialBeat({
          ...base,
          kind: 'shot',
          shot,
          phase: 'counter',
          outcome: 'wide',
          possession: side * 10,
        }),
      );
      beats.push(materialBeat({ ...base, kind: 'stoppage', possession: side * 10 }));
      // A same-side new possession counts, even when no opponent touch was needed between.
      beats.push(materialBeat({ ...base, phase: 'counter', possession: side * 10 + 1 }));
      beats.push(
        materialBeat({
          ...base,
          kind: 'shot',
          shot,
          phase: 'finalThird',
          outcome: 'wide',
          possession: side * 10 + 1,
        }),
      );
      beats.push(
        materialBeat({ ...base, kind: 'corner', phase: 'setPiece', possession: side * 10 + 2 }),
      );
      beats.push(
        materialBeat({
          ...base,
          kind: 'shot',
          shot,
          phase: 'finalThird',
          outcome: 'wide',
          possession: side * 10 + 2,
        }),
      );
    }
    for (const side of sides)
      expect(report(d, beats, side).slice(R.counterAttacks, R.counterShots + 1)).toEqual([2, 2]);
  });

  it('counts cross and through attempts, and completed spatial cut-backs including crosses', () => {
    const d = smallDetail(),
      beats: Beat[] = [];
    for (const side of sides) {
      const from: Vec = [102, 19],
        to: Vec = [95, 34];
      beats.push(recorded(d, side, { move: 'cross', from, to }));
      beats.push(recorded(d, side, { move: 'cross', from, to, outcome: 'out' }));
      beats.push(recorded(d, side, { move: 'short', from, to }));
      beats.push(recorded(d, side, { move: 'cutBack', from, to }));
      beats.push(recorded(d, side, { move: 'cutBack', from, to, outcome: 'intercepted' }));
      beats.push(recorded(d, side, { move: 'through' }));
      beats.push(recorded(d, side, { move: 'through', outcome: 'offside' }));
      beats.push(
        materialBeat({
          side,
          move: 'cross',
          kind: 'corner',
          from: toAttack(side, from),
          to: toAttack(side, to),
        }),
      );
    }
    for (const side of sides)
      expect(report(d, beats, side).slice(R.crosses, R.throughBalls + 1)).toEqual([2, 3, 2]);
  });

  it('accounts for all 30 existing slots, with only the two aerial-duel slots unsupported', () => {
    const vectors = [
      [R.finalThirdEntries, 5],
      [R.boxEntries, 5],
      [R.regains, 3],
      [R.losses, 3],
    ];
    const scalars = [
      R.setPieceShots,
      R.setPieceGoals,
      R.takeOnsWon,
      R.takeOns,
      R.tacklesWon,
      R.tackles,
      R.counterAttacks,
      R.counterShots,
      R.highRegains,
      R.crosses,
      R.cutBacks,
      R.throughBalls,
    ];
    expect(
      [
        ...vectors.flatMap(([start, length]) =>
          Array.from({ length: length! }, (_, i) => start! + i),
        ),
        ...scalars,
        ...unsupported.map((key) => R[key]),
      ].sort((a, b) => a - b),
    ).toEqual(Array.from({ length: 30 }, (_, i) => i));
  });
});
