/**
 * View models of an own match's post-match material (→WEB-84, MATCH-25): the read helpers of
 * `material.ts` turned into shapes on the 1.9:1 pitch and sentences of the tactical report. Every
 * drawing has the side it describes attacking right, its left touchline on top.
 */
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import {
  heatMap,
  ownSideOf,
  passNetwork,
  shotMap,
  tacticalReport,
  type HeatMap,
  type ShotResult,
  type TacticalReport,
} from '../../../../packages/engine/src/material';
import {
  BAND_EDGES,
  LANE_EDGES,
  LANE_KEYS,
  PITCH,
  cellName,
  cellOf,
} from '../../../../packages/engine/src/grid/pitch';

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
  leftWide: '왼쪽 측면',
  leftHalf: '왼쪽 하프스페이스',
  central: '중앙',
  rightHalf: '오른쪽 하프스페이스',
  rightWide: '오른쪽 측면',
};
const laneLabel = (lane: number) => LANE_LABELS[LANE_KEYS[lane]!];
const THIRDS = ['수비 지역', '중원', '공격 지역'] as const;
const OUTCOMES: Record<ShotResult, string> = {
  goal: '골',
  save: '선방',
  block: '블록',
  miss: '빗나감',
};

/** 로 or 으로 after a Korean word: 으로 after a final consonant other than ㄹ. */
export function towards(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const final = code >= 0 && code < 11172 ? code % 28 : 0;
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`;
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
      const who = (mine && nameOf(w, shot.player)) || (mine ? '우리 선수' : '상대 선수');
      return {
        cx: px(shot.x),
        cy: py(shot.y),
        r: dotRadius(shot.xg),
        own: mine,
        goal: shot.outcome === 'goal',
        header: shot.header,
        label: `${who} · ${cellName(cellOf([shot.x, shot.y]))} · xG ${shot.xg.toFixed(2)} · ${
          OUTCOMES[shot.outcome]
        }${shot.header ? ' · 헤더' : ''}`,
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
      label: `${cellName(cell)} · 터치 ${touches}번 (${Math.round(share * 100)}%)`,
    };
  });
}

/** The heat maps to choose from: both sides, then each own player with touches. */
export function heatChoices(record: MatchRecord, w: Pick<World, 'players' | 'playerClub'>) {
  const own = ownSide(record, w);
  const choices: { id: string; label: string }[] = [
    { id: 'own', label: '우리 팀' },
    { id: 'opponent', label: '상대 팀' },
  ];
  for (const node of passNetwork(record, own)?.nodes ?? [])
    if (node.player && node.touches > 0)
      choices.push({ id: node.player, label: nameOf(w, node.player) ?? node.player });
  return choices;
}

export function heatOf(record: MatchRecord, w: Pick<World, 'players' | 'playerClub'>, who: string) {
  return heatMap(record, who, ownSide(record, w));
}

/** A short label for a node: the last word of his name, at most five letters. */
const shortName = (name: string) => (name.split(' ').at(-1) ?? name).slice(0, 5);

/** Own players at their average positions and the pairs between them, line width by passes. */
export function networkView(record: MatchRecord, w: Pick<World, 'players' | 'playerClub'>) {
  const network = passNetwork(record, ownSide(record, w));
  if (!network) return undefined;
  const nodes = network.nodes.filter((n) => n.touches > 0);
  const at = new Map(nodes.map((n) => [n.line, n]));
  const mostTouches = Math.max(1, ...nodes.map((n) => n.touches));
  const mostPasses = Math.max(1, ...network.pairs.map((p) => p.completed));
  // A pair counts both ways: A→B and B→A share one line.
  const joined = new Map<string, { from: number; to: number; passes: number }>();
  for (const pair of network.pairs) {
    if (!at.has(pair.from) || !at.has(pair.to)) continue;
    const key = pair.from < pair.to ? `${pair.from}-${pair.to}` : `${pair.to}-${pair.from}`;
    const line = joined.get(key) ?? { from: pair.from, to: pair.to, passes: 0 };
    line.passes += pair.completed;
    joined.set(key, line);
  }
  const mostJoined = Math.max(1, ...[...joined.values()].map((l) => l.passes));
  const name = (line: number) => nameOf(w, at.get(line)?.player) ?? `${line + 1}번째 선수`;
  return {
    nodes: nodes.map((n) => {
      const full = name(n.line);
      return {
        line: n.line,
        cx: px(n.x),
        cy: py(n.y),
        r: 2.6 + 2.4 * Math.sqrt(n.touches / mostTouches),
        short: shortName(full),
        label: `${full} · 평균 위치 ${cellName(cellOf([n.x, n.y]))} · 터치 ${n.touches}번`,
      };
    }),
    links: [...joined.values()]
      .sort((a, b) => a.passes - b.passes)
      .map((l) => {
        const a = at.get(l.from)!,
          b = at.get(l.to)!;
        return {
          key: `${l.from}-${l.to}`,
          x1: px(a.x),
          y1: py(a.y),
          x2: px(b.x),
          y2: py(b.y),
          width: 0.4 + 2.6 * (l.passes / mostJoined),
          passes: l.passes,
          label: `${name(l.from)} ↔ ${name(l.to)} · 패스 ${l.passes}번`,
        };
      }),
    mostPasses,
  };
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
    sentences.push(`${towards(laneLabel(lane))} ${entries[lane]}번 진입했어요`);
    sentences.push(`파이널 서드 진입은 모두 ${totalEntries}번이에요`);
  } else sentences.push('파이널 서드에 들어간 장면이 없었어요');
  const box = report.boxEntries.reduce((a, b) => a + b, 0);
  if (box) {
    const lane = most(report.boxEntries);
    sentences.push(
      `박스에는 ${box}번 들어갔고, ${towards(laneLabel(lane))} 가장 많이(${report.boxEntries[lane]}번) 들어갔어요`,
    );
  }
  const regains = report.regains.reduce((a, b) => a + b, 0);
  if (regains) {
    const third = most(report.regains);
    sentences.push(`공은 ${THIRDS[third]}에서 가장 많이 되찾았어요 (${report.regains[third]}번)`);
  }
  const losses = report.losses.reduce((a, b) => a + b, 0);
  if (losses) {
    const third = most(report.losses);
    sentences.push(`공은 ${THIRDS[third]}에서 가장 많이 잃었어요 (${report.losses[third]}번)`);
  }
  sentences.push(
    report.setPieceShots
      ? `세트피스에서 슛 ${report.setPieceShots}번, 골 ${report.setPieceGoals}번이 나왔어요`
      : '세트피스에서 나온 슛은 없었어요',
  );
  if (report.counterAttacks)
    sentences.push(`역습 ${report.counterAttacks}번에서 슛 ${report.counterShots}번을 만들었어요`);
  const duel = (label: string, x: { won: number; total: number }) =>
    x.total ? `${label} ${x.won}/${x.total}` : undefined;
  const duels = [
    duel('공중볼', report.aerials),
    duel('드리블', report.takeOns),
    duel('태클', report.tackles),
  ].filter(Boolean);
  if (duels.length) sentences.push(`경합 승리는 ${duels.join(' · ')}이에요`);
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
