import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
/**
 * View models of an own match's post-match material (→WEB-84, MATCH-25): the read helpers of
 * `material.ts` turned into shapes on the 1.9:1 pitch and sentences of the tactical report. Every
 * drawing has the side it describes attacking right, its left touchline on top.
 */
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import {
  heatMap,
  ownSideOf,
  passNetwork,
  shotMap,
  tacticalReport,
  type HeatMap,
  type ShotResult,
  type TacticalReport,
} from '../../../../../../packages/engine/src/material';
import {
  BAND_EDGES,
  LANE_EDGES,
  LANE_KEYS,
  PITCH,
  cellName,
  cellOf,
} from '../../../../../../packages/engine/src/grid/pitch';

/** The drawing: 190 × 100 like the theatre's 1.9:1 canvas, with its 6.5% margin around the lines. */
export const VIEW = { width: 190, height: 100, pad: 190 * 0.065 } as const;
const FIELD_W = VIEW.width - VIEW.pad * 2;
const FIELD_H = VIEW.height - VIEW.pad * 2;
/** Metres along the pitch to the drawing. */
export const px = (x: number) => VIEW.pad + (FIELD_W * x) / PITCH.length;
/** Metres across the pitch, from the attacking side's left touchline, to the drawing. */
export const py = (y: number) => VIEW.pad + (FIELD_H * y) / PITCH.width;

/** The cell under a point of the drawing, or none off the pitch. */
export function cellAt(vx: number, vy: number) {
  const x = ((vx - VIEW.pad) / FIELD_W) * PITCH.length;
  const y = ((vy - VIEW.pad) / FIELD_H) * PITCH.width;
  if (x < 0 || x > PITCH.length || y < 0 || y > PITCH.width) return undefined;
  return cellOf([x, y]);
}

/** The lanes as Korean football media name them, keyed like the grid. */
export const LANE_LABELS: Record<(typeof LANE_KEYS)[number], string> = {
  leftWide: sourceMessage('copy.glossaryEntries.7087773f6a'),
  leftHalf: sourceMessage('copy.glossaryEntries.e6042799eb'),
  central: sourceMessage('copy.glossaryEntries.25c630c275'),
  rightHalf: sourceMessage('copy.glossaryEntries.ab7d5aa356'),
  rightWide: sourceMessage('copy.glossaryEntries.4646f1d7c9'),
};
const laneLabel = (lane: number) => LANE_LABELS[LANE_KEYS[lane]!];
const THIRDS = [
  sourceMessage('copy.materialView.e7fd4ac2da'),
  sourceMessage('copy.materialView.11d52c4180'),
  sourceMessage('copy.materialView.8afef20069'),
] as const;
const OUTCOMES: Record<ShotResult, string> = {
  goal: sourceMessage('copy.summary.68a6cf8ed8'),
  save: sourceMessage('copy.RecordsRoom.2a022bd612'),
  block: sourceMessage('copy.materialView.4cda5cda28'),
  miss: sourceMessage('copy.materialView.be09794bf9'),
};

/** 로 or 으로 after a Korean word: 으로 after a final consonant other than ㄹ. */
export function towards(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const final = code >= 0 && code < 11172 ? code % 28 : 0;
  return `${word}${final === 0 || final === 8 ? sourceMessage('copy.materialView.c522383bf3') : sourceMessage('copy.materialView.f3db88d1c1')}`;
}

/** The own side of the match, from the own club. */
export const ownSide = (record: MatchRecord, w: Pick<World, 'playerClub'>) =>
  ownSideOf(record, w.playerClub) ?? ownSideOf(record) ?? 0;

const nameOf = (w: Pick<World, 'players'>, id: string | undefined) =>
  (id && w.players.find((p) => p.id === id)?.name) || undefined;

export interface ShotDot {
  cx: number;
  cy: number;
  r: number;
  own: boolean;
  goal: boolean;
  header: boolean;
  /** What a tap shows: shooter, place, xG, outcome and foot or head. */
  label: string;
}

const DOT = { min: 1.2, max: 6.5 } as const;
/** A dot's radius: its area grows with xG, so a 0.40 chance covers four times a 0.10 one. */
export const dotRadius = (xg: number) =>
  DOT.min + (DOT.max - DOT.min) * Math.sqrt(Math.min(1, Math.max(0, xg)));

/** Both sides' shots, each attacking right; goals first in the list are drawn last, on top. */
export function shotDots(record: MatchRecord, w: Pick<World, 'players' | 'playerClub'>) {
  const own = ownSide(record, w);
  return shotMap(record)
    .map((shot): ShotDot => {
      const mine = shot.side === own;
      const who =
        (mine && nameOf(w, shot.player)) ||
        (mine
          ? sourceMessage('copy.EventCenter.45d9ddc729')
          : sourceMessage('copy.materialView.56afb7f831'));
      return {
        cx: px(shot.x),
        cy: py(shot.y),
        r: dotRadius(shot.xg),
        own: mine,
        goal: shot.outcome === 'goal',
        header: shot.header,
        label: `${who} · ${cellName(cellOf([shot.x, shot.y]))} · xG ${shot.xg.toFixed(2)} · ${
          OUTCOMES[shot.outcome]
        }${shot.header ? sourceMessage('copy.materialView.96252d8ea3') : ''}`,
      };
    })
    .sort((a, b) => Number(a.goal) - Number(b.goal) || b.r - a.r);
}

/** Shots, goals and xG of one side. */
export function shotTotals(record: MatchRecord, side: 0 | 1) {
  const shots = shotMap(record).filter((s) => s.side === side);
  return {
    shots: shots.length,
    goals: shots.filter((s) => s.outcome === 'goal').length,
    xg: shots.reduce((sum, s) => sum + s.xg, 0),
  };
}

/** One of the 40 cells as a rectangle of the drawing. */
export function cellRect(cell: number) {
  const lane = cell % 5,
    band = Math.floor(cell / 5);
  const x = px(BAND_EDGES[band]!),
    y = py(LANE_EDGES[lane]!);
  return { x, y, width: px(BAND_EDGES[band + 1]!) - x, height: py(LANE_EDGES[lane + 1]!) - y };
}

export interface HeatCell {
  cell: number;
  x: number;
  y: number;
  width: number;
  height: number;
  touches: number;
  /** Share of the map's touches, 0–1. */
  share: number;
  /** Shade, 0–1: the share against the busiest cell's. */
  shade: number;
  label: string;
}

/** The 40 cells of a heat map shaded by their share of its touches. */
export function heatCells(map: HeatMap | undefined): HeatCell[] {
  const cells = map?.cells ?? new Array<number>(40).fill(0);
  const total = map?.touches ?? 0;
  const most = Math.max(0, ...cells);
  return cells.map((touches, cell) => {
    const share = total ? touches / total : 0;
    return {
      cell,
      ...cellRect(cell),
      touches,
      share,
      shade: most ? touches / most : 0,
      label: sourceMessage('copy.materialView.2724192be5', {
        p0: cellName(cell),
        p1: touches,
        p2: Math.round(share * 100),
      }),
    };
  });
}

/** The heat maps to choose from: both sides, then each own player with touches. */
export function heatChoices(record: MatchRecord, w: Pick<World, 'players' | 'playerClub'>) {
  const own = ownSide(record, w);
  const choices: { id: string; label: string }[] = [
    { id: 'own', label: sourceMessage('copy.BallonDorView.8434ac1486') },
    { id: 'opponent', label: sourceMessage('copy.MatchBriefing.1a46398092') },
  ];
  for (const node of passNetwork(record, own)?.nodes ?? [])
    if (node.player && node.touches > 0)
      choices.push({ id: node.player, label: nameOf(w, node.player) ?? node.player });
  return choices;
}

export function heatOf(record: MatchRecord, w: Pick<World, 'players' | 'playerClub'>, who: string) {
  return heatMap(record, who, ownSide(record, w));
}

/** Sizes in pitch-width fractions and CSS px at the reference drawing width, scaled by SVG. */
export const NETWORK_VIEW = {
  radius: { min: 0.018, max: 0.045 },
  line: { min: 1, max: 9 },
  minPasses: 3,
  referenceWidth: 760,
} as const;

/**
 * The own side's recorded average positions. A circle counts all of his outgoing completed
 * passes, including pairs too quiet to draw. His number is his retained line + 1, as in playback.
 */
export function networkView(record: MatchRecord, w: Pick<World, 'players' | 'playerClub'>) {
  const network = passNetwork(record, ownSide(record, w));
  if (!network) return undefined;
  const present = network.nodes.filter((n) => n.touches > 0);
  const at = new Map(present.map((n) => [n.line, n]));
  const outgoing = new Map<number, number>();
  // Stable endpoints retain each direction even if the first stored row runs backwards.
  const joined = new Map<
    string,
    { from: number; to: number; forward: number; backward: number; passes: number }
  >();
  for (const pair of network.pairs) {
    if (!at.has(pair.from) || !at.has(pair.to) || pair.from === pair.to || pair.completed <= 0)
      continue;
    outgoing.set(pair.from, (outgoing.get(pair.from) ?? 0) + pair.completed);
    const from = Math.min(pair.from, pair.to),
      to = Math.max(pair.from, pair.to);
    const key = `${from}-${to}`;
    const link = joined.get(key) ?? { from, to, forward: 0, backward: 0, passes: 0 };
    link[pair.from === from ? 'forward' : 'backward'] += pair.completed;
    link.passes += pair.completed;
    joined.set(key, link);
  }
  const mostPasses = Math.max(1, ...outgoing.values());
  const nodes = present.map((n) => {
    const passes = outgoing.get(n.line) ?? 0;
    return {
      line: n.line,
      number: n.line + 1,
      name: nameOf(w, n.player),
      cx: px(n.x),
      cy: py(n.y),
      r:
        FIELD_W *
        (NETWORK_VIEW.radius.min +
          (NETWORK_VIEW.radius.max - NETWORK_VIEW.radius.min) * Math.sqrt(passes / mostPasses)),
      passes,
      touches: n.touches,
    };
  });
  const circles = new Map(nodes.map((n) => [n.line, n]));
  const pairs = [...joined.values()].filter((l) => l.passes >= NETWORK_VIEW.minPasses);
  const mostJoined = Math.max(1, ...pairs.map((l) => l.passes));
  const links = pairs
    // Thin first; stable ties also make the busiest-five summary reproducible.
    .sort((a, b) => a.passes - b.passes || a.from - b.from || a.to - b.to)
    .map((l) => {
      const from = circles.get(l.from)!,
        to = circles.get(l.to)!;
      const dx = to.cx - from.cx,
        dy = to.cy - from.cy;
      const distance = Math.hypot(dx, dy);
      // Stop at the circles so the arrow tips stay visible above the links and below the nodes.
      const scale = Math.min(1, distance / (from.r + to.r));
      const start = distance ? (from.r * scale) / distance : 0;
      const end = distance ? (to.r * scale) / distance : 0;
      return {
        ...l,
        key: `${l.from}-${l.to}`,
        x1: from.cx + dx * start,
        y1: from.cy + dy * start,
        x2: to.cx - dx * end,
        y2: to.cy - dy * end,
        width:
          ((NETWORK_VIEW.line.min +
            ((NETWORK_VIEW.line.max - NETWORK_VIEW.line.min) * l.passes) / mostJoined) *
            VIEW.width) /
          NETWORK_VIEW.referenceWidth,
        arrowStart: l.backward > 0,
        arrowEnd: l.forward > 0,
      };
    });
  return { nodes, links, busiest: links.toReversed().slice(0, 5) };
}

export interface ReportView {
  sentences: string[];
  /** Final-third and box entries by lane, left to right. */
  lanes: { label: string; entries: number; box: number }[];
  regains: { label: string; count: number }[];
  losses: { label: string; count: number }[];
}

const most = (values: readonly number[]) =>
  values.reduce((best, v, i) => (v > values[best]! ? i : best), 0);

/** The tactical report of one side as sentences and the counts drawn beside them. */
export function reportView(report: TacticalReport): ReportView {
  const sentences: string[] = [];
  const entries = report.finalThirdEntries;
  const totalEntries = entries.reduce((a, b) => a + b, 0);
  if (totalEntries) {
    const lane = most(entries);
    sentences.push(
      sourceMessage('copy.materialView.f4f68247d7', {
        p0: towards(laneLabel(lane)),
        p1: entries[lane],
      }),
    );
    sentences.push(sourceMessage('copy.materialView.e67b3e201d', { p0: totalEntries }));
  } else sentences.push(sourceMessage('copy.materialView.606b44fd42'));
  const box = report.boxEntries.reduce((a, b) => a + b, 0);
  if (box) {
    const lane = most(report.boxEntries);
    sentences.push(
      sourceMessage('copy.materialView.5610a5272e', {
        p0: box,
        p1: towards(laneLabel(lane)),
        p2: report.boxEntries[lane],
      }),
    );
  }
  const regains = report.regains.reduce((a, b) => a + b, 0);
  if (regains) {
    const third = most(report.regains);
    sentences.push(
      sourceMessage('copy.materialView.ec305617d2', {
        p0: THIRDS[third],
        p1: report.regains[third],
      }),
    );
  }
  const losses = report.losses.reduce((a, b) => a + b, 0);
  if (losses) {
    const third = most(report.losses);
    sentences.push(
      sourceMessage('copy.materialView.6b91fed884', {
        p0: THIRDS[third],
        p1: report.losses[third],
      }),
    );
  }
  sentences.push(
    report.setPieceShots
      ? sourceMessage('copy.materialView.497c3fb511', {
          p0: report.setPieceShots,
          p1: report.setPieceGoals,
        })
      : sourceMessage('copy.materialView.0d3f6cf08f'),
  );
  if (report.counterAttacks)
    sentences.push(
      sourceMessage('copy.materialView.74ceb5bce1', {
        p0: report.counterAttacks,
        p1: report.counterShots,
      }),
    );
  const duel = (label: string, x: { won: number; total: number }) =>
    x.total ? `${label} ${x.won}/${x.total}` : undefined;
  const duels = [
    duel(sourceMessage('copy.materialView.fbdef67817'), report.aerials),
    duel(sourceMessage('copy.materialView.1658226456'), report.takeOns),
    duel(sourceMessage('copy.Pitch.3f6ba38a9e'), report.tackles),
  ].filter(Boolean);
  if (duels.length)
    sentences.push(sourceMessage('copy.materialView.1dbabaa79a', { p0: duels.join(' · ') }));
  return {
    sentences,
    lanes: entries.map((n, lane) => ({
      label: laneLabel(lane),
      entries: n,
      box: report.boxEntries[lane] ?? 0,
    })),
    regains: report.regains.map((count, i) => ({ label: THIRDS[i]!, count })),
    losses: report.losses.map((count, i) => ({ label: THIRDS[i]!, count })),
  };
}

export function sideReport(record: MatchRecord, side: 0 | 1) {
  const report = tacticalReport(record, side);
  return report && reportView(report);
}

/**
 * The own player of the match with the most touches, for a match whose maps are gone: his season
 * heat map holds them (→MATCH-5). Without season maps, the one with the most passes.
 */
export function topToucher(
  record: MatchRecord,
  w: Pick<World, 'players' | 'playerClub' | 'history'>,
) {
  const own = ownSide(record, w);
  const counts = record.lineCounts;
  const first = counts && own === 1 ? counts[0] : 0;
  const lines = counts ? record.players.slice(first, first + counts[own]) : record.players;
  const heat = w.history.find((h) => h.year === record.year)?.heat;
  const touches = (id: string) => heat?.[id]?.reduce((a, b) => a + b, 0) ?? 0;
  let best: { id: string; score: [number, number] } | undefined;
  for (const line of lines) {
    const score: [number, number] = [touches(line.id), line.metrics[2] ?? 0];
    if (
      !best ||
      score[0] > best.score[0] ||
      (score[0] === best.score[0] && score[1] > best.score[1])
    )
      best = { id: line.id, score };
  }
  return best && { id: best.id, name: nameOf(w, best.id) ?? best.id };
}
