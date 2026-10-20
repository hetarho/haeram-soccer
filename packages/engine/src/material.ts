/**
 * Post-match material of an own match (→MATCH-25) and its season heat maps (→MATCH-5, HIST-16).
 * The grid engine writes the flat integer rows (`grid/record.ts`); these helpers decode them for the
 * UI. Layouts are docs/MATCH-ENGINE-DESIGN.md §9.4.
 */
import type { MatchMaterial, MatchRecord, SeasonArchive, World } from '../../contracts/src/types';

/** Ints per shot, per network node, per network pair, cells per heat map and report ints per side. */
export const MATERIAL_LAYOUT = { shot: 7, node: 3, pair: 3, cells: 40, report: 30 } as const;

/** Where each tactical-report value sits within a side's 30 ints (design §9.4). */
export const REPORT_SLOTS = {
  finalThirdEntries: 0,
  boxEntries: 5,
  regains: 10,
  losses: 13,
  setPieceShots: 16,
  setPieceGoals: 17,
  aerialsWon: 18,
  aerials: 19,
  takeOnsWon: 20,
  takeOns: 21,
  tacklesWon: 22,
  tackles: 23,
  counterAttacks: 24,
  counterShots: 25,
  highRegains: 26,
  crosses: 27,
  cutBacks: 28,
  throughBalls: 29,
} as const;

/** Shot outcomes in their encoded order. */
export const SHOT_OUTCOMES = ['goal', 'save', 'block', 'miss'] as const;
export type ShotResult = (typeof SHOT_OUTCOMES)[number];

/** One shot; `x`, `y` in metres in the shooter's attack frame (he attacks toward x = 105). */
export interface MaterialShot {
  side: 0 | 1;
  /** Index among the shooting side's lines in `players`. */
  line: number;
  /** The shooter's id when his line is on the record (a saved record keeps only the own lines). */
  player?: string;
  x: number;
  y: number;
  xg: number;
  outcome: ShotResult;
  header: boolean;
}

export interface HeatMap {
  /** Touches per cell (`band * 5 + lane`) in that side's attack frame. */
  cells: number[];
  touches: number;
}

export interface NetworkNode {
  line: number;
  player?: string;
  /** Average position over his touches, metres in the own attack frame. */
  x: number;
  y: number;
  touches: number;
}

export interface NetworkPair {
  from: number;
  to: number;
  fromPlayer?: string;
  toPlayer?: string;
  /** Completed passes from `from` to `to` (only pairs with at least two are kept). */
  completed: number;
}

export interface PassNetwork {
  nodes: NetworkNode[];
  pairs: NetworkPair[];
}

export interface WonOf {
  won: number;
  total: number;
}

export interface TacticalReport {
  /** Final-third entries (a completed pass or carry crossing x = 70) by the lane they ended in. */
  finalThirdEntries: number[];
  /** Box entries by the lane they ended in. */
  boxEntries: number[];
  /** Balls won and lost by third of the point (x < 35, < 70, else) in that side's attack frame. */
  regains: [number, number, number];
  losses: [number, number, number];
  /** Shots within 10 s of a corner or free kick being taken, and their goals. */
  setPieceShots: number;
  setPieceGoals: number;
  aerials: WonOf;
  takeOns: WonOf;
  tackles: WonOf;
  /** Possessions whose first action was in the counter-attack phase, and their shots. */
  counterAttacks: number;
  counterShots: number;
  /** Balls won at x ≥ 70. */
  highRegains: number;
  crosses: number;
  cutBacks: number;
  throughBalls: number;
}

/** Each side's lines in `players`: [first index, count]. */
function linesOf(record: MatchRecord, side: 0 | 1): [number, number] {
  const counts = record.lineCounts;
  if (!counts) return side === 0 ? [0, record.players.length] : [record.players.length, 0];
  return side === 0 ? [0, counts[0]] : [counts[0], counts[1]];
}

const playerAt = (record: MatchRecord, side: 0 | 1, line: number) => {
  const [first, count] = linesOf(record, side);
  return line < count ? record.players[first + line]?.id : undefined;
};

/**
 * The own side of a saved own match: the only side whose lines it keeps. A record straight from the
 * engine keeps both sides' lines, so its own side comes from the own club instead.
 */
export function ownSideOf(record: MatchRecord, ownClub?: string): 0 | 1 | undefined {
  if (ownClub !== undefined)
    return record.home === ownClub ? 0 : record.away === ownClub ? 1 : undefined;
  const counts = record.lineCounts;
  if (!counts) return undefined;
  if (counts[0] > 0 && counts[1] === 0) return 0;
  if (counts[1] > 0 && counts[0] === 0) return 1;
  return undefined;
}

/** Own lines the material describes. */
const ownLines = (m: MatchMaterial) => m.heat.length / MATERIAL_LAYOUT.cells - 2;

export function shotMap(record: MatchRecord): MaterialShot[] {
  const rows = record.material?.shots ?? [];
  const shots: MaterialShot[] = [];
  for (let i = 0; i + MATERIAL_LAYOUT.shot <= rows.length; i += MATERIAL_LAYOUT.shot) {
    const side = rows[i] as 0 | 1;
    const line = rows[i + 1]!;
    const player = playerAt(record, side, line);
    shots.push({
      side,
      line,
      ...(player ? { player } : {}),
      x: rows[i + 2]! / 10,
      y: rows[i + 3]! / 10,
      xg: rows[i + 4]! / 100,
      outcome: SHOT_OUTCOMES[rows[i + 5]!]!,
      header: rows[i + 6] === 1,
    });
  }
  return shots;
}

/**
 * A heat map: an own player's (by id), the own side's total or the opponent's. `own` is the own side,
 * needed to find a player on a record that still keeps both sides' lines.
 */
export function heatMap(
  record: MatchRecord,
  who: string,
  own: 0 | 1 | undefined = ownSideOf(record),
): HeatMap | undefined {
  const m = record.material;
  if (!m) return undefined;
  const C = MATERIAL_LAYOUT.cells;
  const lines = ownLines(m);
  let block: number;
  if (who === 'own') block = lines;
  else if (who === 'opponent') block = lines + 1;
  else {
    if (own === undefined) return undefined;
    const [first, count] = linesOf(record, own);
    const at = record.players.slice(first, first + count).findIndex((p) => p.id === who);
    if (at < 0 || at >= lines) return undefined;
    block = at;
  }
  const cells = m.heat.slice(block * C, block * C + C);
  return { cells, touches: cells.reduce((a, b) => a + b, 0) };
}

export function passNetwork(
  record: MatchRecord,
  own: 0 | 1 | undefined = ownSideOf(record),
): PassNetwork | undefined {
  const m = record.material;
  if (!m) return undefined;
  const lines = ownLines(m);
  const id = (line: number) => (own === undefined ? undefined : playerAt(record, own, line));
  const nodes: NetworkNode[] = [];
  for (let line = 0; line < lines; line++) {
    const at = line * MATERIAL_LAYOUT.node;
    const player = id(line);
    nodes.push({
      line,
      ...(player ? { player } : {}),
      x: m.network[at]! / 10,
      y: m.network[at + 1]! / 10,
      touches: m.network[at + 2]!,
    });
  }
  const pairs: NetworkPair[] = [];
  for (
    let i = lines * MATERIAL_LAYOUT.node;
    i + MATERIAL_LAYOUT.pair <= m.network.length;
    i += MATERIAL_LAYOUT.pair
  ) {
    const from = m.network[i]!;
    const to = m.network[i + 1]!;
    const fromPlayer = id(from);
    const toPlayer = id(to);
    pairs.push({
      from,
      to,
      ...(fromPlayer ? { fromPlayer } : {}),
      ...(toPlayer ? { toPlayer } : {}),
      completed: m.network[i + 2]!,
    });
  }
  return { nodes, pairs };
}

/** One side's tactical report (side 0 home, 1 away). */
export function tacticalReport(record: MatchRecord, side: 0 | 1): TacticalReport | undefined {
  const rows = record.material?.report;
  if (!rows || rows.length < 2 * MATERIAL_LAYOUT.report) return undefined;
  const R = REPORT_SLOTS;
  const at = side * MATERIAL_LAYOUT.report;
  const v = (slot: number) => rows[at + slot]!;
  const span = (slot: number, n: number) => rows.slice(at + slot, at + slot + n);
  return {
    finalThirdEntries: span(R.finalThirdEntries, 5),
    boxEntries: span(R.boxEntries, 5),
    regains: span(R.regains, 3) as [number, number, number],
    losses: span(R.losses, 3) as [number, number, number],
    setPieceShots: v(R.setPieceShots),
    setPieceGoals: v(R.setPieceGoals),
    aerials: { won: v(R.aerialsWon), total: v(R.aerials) },
    takeOns: { won: v(R.takeOnsWon), total: v(R.takeOns) },
    tackles: { won: v(R.tacklesWon), total: v(R.tackles) },
    counterAttacks: v(R.counterAttacks),
    counterShots: v(R.counterShots),
    highRegains: v(R.highRegains),
    crosses: v(R.crosses),
    cutBacks: v(R.cutBacks),
    throughBalls: v(R.throughBalls),
  };
}

/** An own player's season heat map from the archive (→MATCH-5). */
export function seasonHeat(archive: SeasonArchive, playerId: string): HeatMap | undefined {
  const cells = archive.heat?.[playerId];
  return cells ? { cells: [...cells], touches: cells.reduce((a, b) => a + b, 0) } : undefined;
}

/**
 * The season close (→MATCH-5, HIST-16): the season's own matches become one heat map per own player
 * with touches on `archive`, then their material is deleted. This is material's defined lifetime,
 * not pruning of retained facts (HIST-8).
 */
export function reduceSeasonMaterial(w: World, archive: SeasonArchive): void {
  const C = MATERIAL_LAYOUT.cells;
  const heat: Record<string, number[]> = {};
  for (const m of w.ownMatches) {
    if (m.year !== archive.year || !m.material) continue;
    const own = ownSideOf(m, w.playerClub);
    if (own !== undefined) {
      const [first, count] = linesOf(m, own);
      const lines = Math.min(count, ownLines(m.material));
      for (let line = 0; line < lines; line++) {
        const id = m.players[first + line]!.id;
        const sum = (heat[id] ??= new Array<number>(C).fill(0));
        for (let c = 0; c < C; c++) sum[c]! += m.material.heat[line * C + c]!;
      }
    }
    delete m.material;
  }
  for (const id of Object.keys(heat)) if (!heat[id]!.some((n) => n > 0)) delete heat[id];
  if (Object.keys(heat).length) archive.heat = heat;
}
