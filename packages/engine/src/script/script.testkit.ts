/**
 * Details for the script writer's tests (T826): the match prototype's ten settled matches
 * (`fixtures/s01.json`–`s10.json`, copied from scripts/match-proto/fixtures/settled) read as
 * `MatchDetail`s, and a small hand-made one. A prototype file numbers players `side * 11 + slot` and
 * names a formation and style; every exported match fielded its starters alone, so a player's line
 * is his slot, his side plays the tactic of its style and each slot the role its formation gives it
 * (player.ts `FORMATIONS`). Cells keep their numbers (scripts/export-settled.ts `protoCell`).
 */
import { readFileSync } from 'node:fs';
import type { Tactic } from '../../../contracts/src/types';
import { FORMATIONS } from '../player';
import { EV, FO, INCIDENT_KINDS, R, type DetailSide, type MatchDetail } from './detail';

interface ProtoFile {
  id: string;
  sides: { style: string }[];
  score: [number, number];
  added: [number, number];
  events: number[][];
  shots: number[][];
  fouls: number[][];
  cards: number[][];
}

const DIR = new URL('./fixtures/', import.meta.url);
export const FIXTURE_IDS = ['s01', 's02', 's03', 's04', 's05', 's06', 's07', 's08', 's09', 's10'];

const sideOf = (tactic: Tactic, id: string, side: number): DetailSide => ({
  tactic,
  lines: FORMATIONS[tactic].slots.map((s, slot) => ({
    id: `${id}:${side}:${slot}`,
    slot,
    role: s.role,
    position: s.position,
  })),
});

/**
 * A prototype settled match as a detail: every line on the pitch for all 90 minutes. A yellow card
 * no foul was booked for (dissent; s03, s05, s08, s09 and s10 hold seven) is left out unless
 * `allCards`: the writer plays a card only as its foul until T827 gives it a scene of its own, and
 * the prototype played none of them either.
 */
export function fromProto(file: ProtoFile, allCards = false): MatchDetail {
  const line = (p: number) => (p < 0 ? -1 : p % 11);
  const booked = (c: number[]) =>
    file.fouls.some((f) => f[4] === c[0] && 1 - f[0]! === c[1] && f[2] === c[2]);
  const events = file.events.map((e) => [
    e[0]!,
    e[1]!,
    e[2]!,
    e[3]!,
    e[4]!,
    e[5]!,
    line(e[6]!),
    e[7]!,
    e[8]!,
    line(e[9]!),
    0,
  ]);
  const cards = file.cards.filter((c) => allCards || booked(c)).sort((a, b) => a[0]! - b[0]!);
  const incidents = cards.map((c) => [
    c[0]!,
    c[1]!,
    INCIDENT_KINDS.indexOf('yellow'),
    line(c[2]!),
    -1,
    -1,
    -1,
  ]);
  const taken = new Set<number>();
  const fouls = file.fouls.map((f) => {
    let card = -1;
    if (f[4]! >= 0) {
      card = cards.findIndex(
        (c, i) => !taken.has(i) && c[0] === f[4] && c[1] === 1 - f[0]! && c[2] === f[2],
      );
      taken.add(card);
    }
    return [f[0]!, f[1]!, line(f[2]!), line(f[3]!), f[4]!, 0, 0, -1, card];
  });
  const shots = file.shots.map((s) => [
    s[0]!,
    s[1]!,
    s[2]!,
    s[3]!,
    s[4]!,
    s[5]!,
    s[6]!,
    s[7]!,
    line(s[8]!),
    line(s[9]!),
    s[10]!,
    line(s[11]!),
    -1,
  ]);
  const tactic = (k: number) => file.sides[k]!.style as Tactic;
  return {
    version: 1,
    id: file.id,
    length: 90,
    added: [...file.added],
    score: [...file.score],
    sides: [sideOf(tactic(0), file.id, 0), sideOf(tactic(1), file.id, 1)],
    stints: [0, 1].flatMap((side) =>
      Array.from({ length: 11 }, (_, slot) => [side, slot, slot, 0, 90]),
    ),
    events,
    shots,
    fouls,
    incidents,
    shootout: [],
  };
}

const read = (id: string): ProtoFile =>
  JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8')) as ProtoFile;

/** One of the ten prototype matches as a detail; `allCards` keeps the cards without a foul. */
export const loadDetail = (id: string, allCards = false): MatchDetail =>
  fromProto(read(id), allCards);

// [side, group, kind, setPiece, from, to, actor, result, lineBreaking, other] in prototype players;
// kinds: 0 short, 1 long, 2 through, 3 cross, 4 cutBack, 5 carry, 6 takeOn; results: 0 complete,
// 1 offside, 2 intercepted, 3 outTouch, 4 outByline, 5 cornerWon, 6 looseKept, 7 looseRecovered,
// 8 tackled (the prototype's fit.testkit.ts).
const HOME: number[][] = [
  [0, 0, 0, 0, 7, 12, 1, 0, 0, -1],
  [0, 0, 0, 0, 12, 17, 5, 0, 0, -1],
  [0, 0, 1, 0, 17, 32, 6, 0, 0, -1],
  [0, 0, 5, 0, 32, 33, 10, 0, 0, -1],
  [0, 1, 0, 0, 22, 27, 4, 2, 0, 13],
  [0, 2, 0, 0, 27, 29, 7, 3, 0, -1],
  [0, 3, 3, 0, 33, 38, 9, 4, 0, -1],
  [0, 4, 3, 0, 34, 38, 9, 5, 0, -1],
  [0, 5, 2, 0, 22, 32, 8, 1, 0, 10],
  [0, 6, 6, 0, 27, 32, 9, 8, 0, 14],
  [0, 7, 0, 0, 17, 22, 3, 6, 0, -1],
  [0, 8, 3, 1, 35, 37, 9, 0, 0, -1],
  [0, 9, 0, 0, 12, 13, 2, 0, 0, -1],
  [0, 9, 0, 0, 13, 18, 6, 0, 0, -1],
  [0, 10, 0, 0, 22, 23, 5, 0, 0, -1],
  [0, 11, 4, 0, 38, 32, 7, 0, 0, -1],
];
const AWAY: number[][] = [
  [1, 0, 0, 0, 7, 12, 12, 0, 0, -1],
  [1, 0, 0, 0, 12, 17, 15, 0, 0, -1],
  [1, 0, 1, 0, 17, 27, 16, 2, 0, 4],
  [1, 1, 0, 0, 22, 27, 17, 0, 0, -1],
  [1, 1, 3, 0, 29, 33, 19, 3, 0, -1],
  [1, 2, 5, 0, 22, 27, 20, 8, 0, 6],
  [1, 3, 0, 0, 27, 32, 18, 0, 0, -1],
  [1, 4, 0, 0, 12, 17, 13, 7, 0, 7],
  [1, 5, 0, 0, 13, 18, 14, 0, 0, -1],
  [1, 5, 0, 0, 18, 23, 16, 0, 0, -1],
  [1, 6, 0, 0, 23, 28, 17, 0, 0, -1],
  [1, 7, 6, 0, 28, 33, 19, 0, 0, -1],
  [1, 7, 0, 0, 33, 37, 19, 0, 0, -1],
  [1, 8, 2, 0, 22, 32, 18, 1, 0, 20],
];

/** A hand-made match of thirty attempts, five shots (two goals, a direct free kick) and three fouls (the prototype's `smallSettled`). */
export function smallDetail(): MatchDetail {
  const base = read('s01');
  const events = [...HOME, ...AWAY];
  const pass = (side: number, actor: number) =>
    events.findIndex((e) => e[0] === side && e[6] === actor && e[2]! <= 4 && e[7] === 0);
  return fromProto({
    id: 'x01',
    sides: base.sides,
    score: [1, 1],
    added: [1, 3],
    events,
    // [side, minute, cell, kind, header, xg, outcome, corner, shooter, passer, source, keeper]
    shots: [
      [0, 20, 33, 0, 0, 30, 0, 0, 10, 6, pass(0, 6), 11],
      [1, 30, 32, 0, 1, 10, 1, 0, 21, 18, pass(1, 18), 0],
      [0, 60, 32, 0, 0, 5, 3, 0, 9, -1, -1, 11],
      [1, 70, 37, 0, 0, 40, 0, 0, 20, -1, -1, 0],
      [0, 80, 27, 2, 0, 4, 2, 1, 7, -1, -1, 11],
    ],
    // [fouledSide, cell, fouler, fouled, cardMinute]
    fouls: [
      [0, 22, 14, 5, 40],
      [1, 17, 3, 15, -1],
      [0, 27, 16, 7, -1],
    ],
    cards: [[40, 1, 14]],
  });
}

/** `detail` with only the rows given (prototype players), no cards. */
export function withRows(
  detail: MatchDetail,
  events: number[][],
  shots: number[][] = [],
  fouls: number[][] = [],
): MatchDetail {
  const d = fromProto({
    id: detail.id,
    sides: detail.sides.map((s) => ({ style: s.tactic })),
    score: [0, 0],
    added: [0, 0],
    events,
    shots,
    fouls,
    cards: [],
  });
  return d;
}

/** Event results by name, for readable tests. */
export { EV, FO, R };
