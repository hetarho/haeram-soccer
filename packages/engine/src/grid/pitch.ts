/** The 40-cell grid pitch: geometry, cell names and attack-frame helpers (→MATCH-14, MATCH-16). */

export const PITCH = { length: 105, width: 68 } as const;
export const LANE_EDGES = [0, 13.84, 24.84, 43.16, 54.16, 68] as const;
export const BAND_EDGES = [0, 5.5, 16.5, 35, 52.5, 70, 88.5, 99.5, 105] as const;
export const LANE_KEYS = ['leftWide', 'leftHalf', 'central', 'rightHalf', 'rightWide'] as const;
export const BAND_KEYS = [
  'ownGoalArea',
  'ownBox',
  'defensiveThird',
  'ownMiddle',
  'oppMiddle',
  'frontOfBox',
  'box',
  'goalArea',
] as const;
export type Lane = 0 | 1 | 2 | 3 | 4;
export type Band = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** `[x, y]` in metres; x runs along the pitch from the acting side's own goal line, y from its left touchline. */
export type Point = readonly [number, number];

const LANE_NAMES = [
  '왼쪽 측면',
  '왼쪽 하프스페이스',
  '중앙',
  '오른쪽 하프스페이스',
  '오른쪽 측면',
] as const;
const BAND_NAMES = [
  '우리 골 에어리어',
  '우리 박스',
  '수비 지역',
  '우리 진영 중원',
  '상대 진영 중원',
  '박스 앞',
  '박스 안',
  '골 에어리어',
] as const;

const GOAL: Point = [PITCH.length, PITCH.width / 2];
const POST_HIGH: Point = [PITCH.length, 37.66];
const POST_LOW: Point = [PITCH.length, 30.34];

function edgeIndex(edges: readonly number[], value: number, last: number): number {
  let index = 0;
  for (let i = 1; i < edges.length - 1; i += 1) if (value >= edges[i]!) index = i;
  return Math.min(index, last);
}

export function laneOf(y: number): Lane {
  return edgeIndex(LANE_EDGES, y, 4) as Lane;
}

export function bandOf(x: number): Band {
  return edgeIndex(BAND_EDGES, x, 7) as Band;
}

/** The cell a point falls in: `band * 5 + lane`. */
export function cellOf(p: Point): number {
  return bandOf(p[0]) * 5 + laneOf(p[1]);
}

export function cellLane(cell: number): Lane {
  return (cell % 5) as Lane;
}

export function cellBand(cell: number): Band {
  return Math.floor(cell / 5) as Band;
}

/** The key the baseline JSON files cells by. */
export function cellKey(cell: number): string {
  return `${LANE_KEYS[cellLane(cell)]}.${BAND_KEYS[cellBand(cell)]}`;
}

/** The Korean name football media would use; `post` is decided by the caller for the goal-area centre. */
export function cellName(cell: number, post?: 'near' | 'far'): string {
  const lane = cellLane(cell);
  const band = cellBand(cell);
  const side = lane < 2 ? '왼쪽' : '오른쪽';
  if (band === 5 && lane === 2) return '아크 정면';
  if (band === 6 && lane === 2) return '페널티 스폿 부근';
  if (band === 7 && (lane === 1 || lane === 3)) return `${side} 컷백 구역`;
  if (band === 7 && lane === 2)
    return post === 'near' ? '니어 포스트' : post === 'far' ? '파 포스트' : '골 에어리어';
  if (band === 6 && (lane === 0 || lane === 4)) return `${side} 박스 옆 측면`;
  if (band === 7 && (lane === 0 || lane === 4)) return `${side} 코너 부근`;
  return `${LANE_NAMES[lane]} ${BAND_NAMES[band]}`;
}

/** Mirror a point into the attack frame of `side` (side 1 attacks the other way); self-inverse. */
export function attackFrame(side: 0 | 1, p: Point): Point {
  return side === 0 ? p : [PITCH.length - p[0], PITCH.width - p[1]];
}

/** `attackFrame` as a fresh mutable pair; the flip is its own inverse, so it also takes a side's frame back to the engine frame. */
export function toEngine(side: 0 | 1, p: Point): [number, number] {
  const q = attackFrame(side, p);
  return [q[0], q[1]];
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function inBox(p: Point): boolean {
  return p[0] >= BAND_EDGES[6]! && p[1] >= LANE_EDGES[1] && p[1] <= LANE_EDGES[4];
}

export function inGoalArea(p: Point): boolean {
  return p[0] >= BAND_EDGES[7]! && p[1] >= LANE_EDGES[2] && p[1] <= LANE_EDGES[3];
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function goalDistance(p: Point): number {
  return distance(p, GOAL);
}

/** The angle the goal mouth subtends at the point, in radians. */
export function goalAngle(p: Point): number {
  const high = Math.atan2(POST_HIGH[1] - p[1], POST_HIGH[0] - p[0]);
  const low = Math.atan2(POST_LOW[1] - p[1], POST_LOW[0] - p[0]);
  return Math.abs(high - low);
}

/** Playback units (0–100 on both axes); periods 2 and 4 are mirrored (100 − u). */
export function toUnits(p: Point, period: 1 | 2 | 3 | 4): [number, number] {
  const x = (p[0] * 100) / PITCH.length;
  const y = (p[1] * 100) / PITCH.width;
  return period === 2 || period === 4 ? [100 - x, 100 - y] : [x, y];
}
