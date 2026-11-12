import { readFileSync } from 'node:fs';
import { FORMATIONS } from '../../packages/engine/src/player';
import type { RoleId, Position } from '../../packages/contracts/src/player';
import type { MatchDetail } from '../../packages/engine/src/script/detail';
import type { StagingSide } from '../../packages/contracts/src/match-script';
import { EVENT_RESULTS, EV } from '../../packages/engine/src/script/codes';
import { cellBand, cellLane } from '../../packages/engine/src/grid/pitch';
/** Prototype resources are data only; no runtime import of the prototype or world builder. */
interface PrototypeDetail {
  id: string;
  added: number[];
  score: [number, number];
  events: number[][];
  shots: number[][];
  fouls: number[][];
  cards: number[][];
  source: { seed: string };
  sides: { style: 'possession' | 'counter'; players: { position: Position; role: string }[] }[];
}
const roles: Record<string, RoleId> = {
  keeper: 'shotStopper',
  centreBack: 'coverDefender',
  fullBack: 'defensiveFullBack',
  wideMidfielder: 'wideMidfielder',
};
/** Exported cells use the same band/lane edges. Resolve their coordinates through that layout. */
const cell = (n: number) => cellBand(n) * 5 + cellLane(n);
export function fromPrototype(p: PrototypeDetail): MatchDetail {
  const sides = p.sides.map((s, side) => ({
    tactic: s.style,
    lines: s.players.map((l, slot) => ({
      id: `${side}:${slot}`,
      slot,
      role: roles[l.role] ?? (l.role as RoleId),
      position: l.position,
    })),
  })) as MatchDetail['sides'];
  return {
    version: 1,
    id: p.id,
    length: 90,
    added: [...p.added],
    score: [...p.score],
    sides,
    stints: sides.flatMap((s, side) => s.lines.map((_, line) => [side, line, line, 0, 90])),
    events: p.events.map((r) => {
      const e = [...r, 0],
        side = e[EV.side]!;
      e[EV.actor]! -= side * 11;
      if (e[EV.other]! >= 0)
        e[EV.other]! -= EVENT_RESULTS[e[EV.result]!] === 'offside' ? side * 11 : (1 - side) * 11;
      e[EV.from] = cell(e[EV.from]!);
      e[EV.to] = cell(e[EV.to]!);
      return e;
    }),
    shots: p.shots.map((r) => {
      const s = [...r],
        side = s[0]!;
      s[2] = cell(s[2]!);
      s[8]! -= side * 11;
      if (s[9]! >= 0) s[9]! -= side * 11;
      s[11]! -= (1 - side) * 11;
      return s;
    }),
    fouls: p.fouls.map((r) => [
      r[0]!,
      cell(r[1]!),
      r[2]! - (1 - r[0]!) * 11,
      r[3]! - r[0]! * 11,
      r[4]!,
      0,
      0,
    ]),
    // The compact prototype omitted reasons: an unmatched yellow is the non-foul card case.
    incidents: p.cards.map((r) => [
      r[0]!,
      r[1]!,
      0,
      r[2]! - r[1]! * 11,
      -1,
      p.fouls.some((f) => f[4] === r[0] && f[2] === r[2]) ? 0 : 2,
    ]),
    shootout: [],
    penalties: [],
  };
}
/** The exported fixture file `packages/engine/src/script/fixtures/<id>.json` (T826), as stored. */
const readFixture = (id: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../packages/engine/src/script/fixtures/${id}.json`, import.meta.url),
      'utf8',
    ),
  );
export const loadDetail = (id: string) => fromPrototype(readFixture(id));
export const fixtureSeed = (id: string): string => readFixture(id).source.seed;
/** The staging squads of an exported fixture (T828): each line's slot and role from its detail,
 * pace and anticipation from the file's attributes, the other tendencies neutral. */
export function fixtureSides(
  id: string,
  detail: MatchDetail = loadDetail(id),
): [StagingSide, StagingSide] {
  const raw = readFixture(id) as { sides: { players: { attrs: number[] }[] }[] };
  return detail.sides.map((side, t): StagingSide => ({
    tactic: side.tactic,
    players: side.lines.map((line, i) => ({
      line: i,
      slot: line.slot,
      role: line.role,
      pace: raw.sides[t]!.players[i]!.attrs[4]!,
      anticipation: raw.sides[t]!.players[i]!.attrs[5]!,
      discipline: 50,
      pressing: 50,
      freedom: 50,
    })),
  })) as [StagingSide, StagingSide];
}
/** Hand-built rows over two complete synthetic line lists. */
export function smallDetail(
  events: number[][] = [],
  shots: number[][] = [],
  fouls: number[][] = [],
): MatchDetail {
  const sides = [0, 1].map((side) => ({
    tactic: 'possession' as const,
    lines: FORMATIONS.possession.slots.map((l, slot) => ({ ...l, id: `${side}:${slot}`, slot })),
  })) as MatchDetail['sides'];
  return {
    version: 1,
    id: 'synthetic',
    length: 90,
    added: [0, 0],
    sides,
    stints: sides.flatMap((s, side) => s.lines.map((_, line) => [side, line, line, 0, 90])),
    shootout: [],
    penalties: [],
    events: events.map((e) => (e.length === 10 ? [...e, 0] : e)),
    shots,
    fouls: fouls.map((f) => (f.length === 5 ? [...f, 0, 0] : f)),
    incidents: [],
    score: [
      shots.filter((s) => s[0] === 0 && s[6] === 0).length,
      shots.filter((s) => s[0] === 1 && s[6] === 0).length,
    ],
  };
}

/** Small hand-built attempts with every outcome, fixed shots and a booked foul. */
export function sampleDetail(): MatchDetail {
  const events = [
    [0, 0, 0, 0, 7, 12, 1, 0, 0, -1],
    [0, 1, 0, 0, 12, 17, 5, 0, 0, -1],
    [0, 2, 1, 0, 17, 32, 6, 0, 0, -1],
    [0, 3, 5, 0, 32, 33, 10, 0, 0, -1],
    [0, 4, 0, 0, 22, 27, 4, 2, 0, 2],
    [0, 5, 0, 0, 27, 29, 7, 3, 0, -1],
    [0, 6, 3, 0, 33, 38, 9, 4, 0, -1],
    [0, 7, 3, 0, 34, 38, 9, 5, 0, -1],
    [0, 8, 2, 0, 22, 32, 8, 1, 0, 10],
    [0, 9, 6, 0, 27, 32, 9, 8, 0, 3],
    [0, 10, 0, 0, 17, 22, 3, 6, 0, -1],
    [0, 11, 3, 1, 35, 37, 9, 0, 0, -1],
    [0, 12, 0, 0, 12, 13, 2, 0, 0, -1],
    [0, 13, 5, 0, 12, 17, 6, 0, 0, -1],
    [0, 14, 0, 0, 22, 23, 5, 0, 0, -1],
    [0, 15, 4, 0, 38, 32, 7, 0, 0, -1],
    [1, 0, 0, 0, 7, 12, 1, 0, 0, -1],
    [1, 1, 0, 0, 12, 17, 4, 0, 0, -1],
    [1, 2, 1, 0, 17, 27, 5, 2, 0, 4],
    [1, 3, 0, 0, 27, 32, 7, 0, 0, -1],
    [1, 4, 3, 0, 29, 33, 8, 3, 0, -1],
    [1, 5, 5, 0, 22, 27, 9, 8, 0, 6],
    [1, 6, 0, 0, 12, 17, 2, 7, 0, 7],
    [1, 7, 0, 0, 13, 18, 3, 0, 0, -1],
    [1, 8, 0, 0, 18, 23, 5, 0, 0, -1],
    [1, 9, 0, 0, 23, 28, 6, 0, 0, -1],
    [1, 10, 6, 0, 28, 33, 8, 0, 0, -1],
    [1, 11, 0, 0, 33, 37, 8, 0, 0, -1],
    [1, 12, 2, 0, 22, 32, 7, 1, 0, 9],
    [1, 13, 0, 0, 22, 27, 6, 6, 0, -1],
    [0, 16, 3, 1, 35, 32, 7, 0, 0, -1],
    [1, 14, 5, 0, 32, 37, 9, 0, 0, -1],
  ];
  const d = smallDetail(
    events,
    [
      [0, 20, 32, 0, 0, 30, 0, 0, 10, 6, 2, 0],
      [1, 30, 32, 0, 1, 10, 1, 0, 10, 7, 19, 0],
      [0, 60, 37, 1, 0, 5, 3, 0, 5, 9, 11, 0],
      [1, 70, 37, 0, 0, 40, 0, 0, 9, -1, 31, 0],
      [0, 80, 27, 2, 0, 4, 2, 1, 7, -1, -1, 0],
    ],
    [
      [0, 22, 3, 5, 40],
      [1, 17, 3, 4, -1],
      [0, 27, 5, 7, -1],
    ],
  );
  d.incidents = [[40, 1, 0, 3, -1, 0]];
  return d;
}
