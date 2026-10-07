import { prepareSeason } from '../../../../packages/engine/src/season';
import type { World, MatchRecord, Fixture } from '../../../../packages/contracts/src/types';
// Lossless archive encoding. Statistics use unsigned LEB128, never a fixed-width truncation.
export function base64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 32768)
    s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
export function unbase64(s: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('잘못된 Base64');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function integers(values: number[], width: number) {
  const count = values.length / width;
  values = Array.from(
    { length: values.length },
    (_, i) => values[(i % count) * width + Math.floor(i / count)],
  );
  const out: number[] = [];
  for (let n of values) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('압축할 수 없는 통계');
    do {
      const b = n % 128;
      n = Math.floor(n / 128);
      out.push(b + (n ? 128 : 0));
    } while (n);
  }
  return base64(Uint8Array.from(out));
}
function reader(s: string, width: number) {
  const a = unbase64(s);
  let i = 0;
  const columns: number[] = [];
  while (i < a.length) {
    let n = 0,
      scale = 1,
      b: number;
    do {
      if (i >= a.length || scale > 2 ** 49) throw new Error('통계 스트림 손상');
      b = a[i++];
      n += (b % 128) * scale;
      scale *= 128;
    } while (b >= 128);
    if (!Number.isSafeInteger(n)) throw new Error('통계 범위 초과');
    columns.push(n);
  }
  if (columns.length % width) throw new Error('통계 열 손상');
  const count = columns.length / width;
  const values = Array.from(
    { length: columns.length },
    (_, j) => columns[(j % width) * count + Math.floor(j / width)],
  );
  let offset = 0;
  return {
    take(n: number) {
      if (offset + n > values.length) throw new Error('통계 누락');
      const result = values.slice(offset, offset + n);
      offset += n;
      return result;
    },
    done() {
      if (offset !== values.length) throw new Error('통계 잔여 데이터');
    },
  };
}
type Tuple = (number | number[] | number[][])[];
interface Packed {
  format: 'compact1';
  world: World;
  dict: string[];
  fixtures: Tuple[];
  matches: Tuple[];
  stats: string;
  statWidth?: number;
  standings: string;
  counts: number[];
  euroCounts?: number[][][];
}
export function pack(w: World): Packed {
  const dict: string[] = [],
    ids = new Map<string, number>();
  const id = (s: string) => {
    let n = ids.get(s);
    if (n === undefined) {
      n = dict.length;
      ids.set(s, n);
      dict.push(s);
    }
    return n;
  };
  const fixture = (f: Fixture): Tuple => [
    id(f.id),
    f.year,
    f.round,
    id(f.kind),
    id(f.home),
    id(f.away),
    id(f.country),
    id(f.groupKey),
    f.score ? [f.score.home, f.score.away] : [],
  ];
  const stats: number[] = [];
  const statWidth = w.ownMatches.every((m) => m.players.length === 11) ? 156 : 12;
  const matches = w.ownMatches.map((m) => {
    stats.push(...m.metrics[0], ...m.metrics[1], ...m.players.flatMap((p) => p.metrics));
    return [
      ...fixture(m),
      m.players.map((p) => id(p.id)),
      m.highlights.map((h) => [h.minute, h.side, id(h.player), id(h.action)]),
      [id(m.tactics[0]), id(m.tactics[1])],
    ];
  });
  const counts = w.history.map((h) => h.standings.length);
  return {
    format: 'compact1',
    world: {
      ...w,
      fixtures: [],
      ownMatches: [],
      history: w.history.map((h) => ({
        ...h,
        standings: [],
        europe: h.europe.map((e) => ({
          ...e,
          ...(e.standings ? { standings: [] } : {}),
          ...(e.secondStandings ? { secondStandings: [] } : {}),
        })),
      })),
    },
    dict,
    fixtures: w.fixtures.flatMap((f, i) => (f.score ? [[i, f.score.home, f.score.away]] : [])),
    matches,
    stats: integers(stats, statWidth),
    statWidth,
    standings: integers(
      w.history
        .flatMap((h) => [
          h.standings.flat(),
          ...h.europe.flatMap((e) => [
            (e.standings || []).flat(),
            (e.secondStandings || []).flat(),
          ]),
        ])
        .flat(),
      6,
    ),
    counts,
    euroCounts: w.history.map((h) =>
      h.europe.map((e) => [e.standings?.length || 0, e.secondStandings?.length || 0]),
    ),
  };
}
export function unpack(p: Packed): World {
  if (
    p.format !== 'compact1' ||
    !Array.isArray(p.dict) ||
    p.dict.length > 500000 ||
    !Array.isArray(p.matches) ||
    p.matches.length > 100000 ||
    !Array.isArray(p.fixtures) ||
    p.fixtures.length > 20000
  )
    throw new Error('알 수 없는 저장 형식');
  const str = (n: number) => {
    if (typeof p.dict[n] !== 'string') throw new Error('사전 참조 손상');
    return p.dict[n];
  };
  const f = (t: Tuple): Fixture => {
    const score = t[8] as number[];
    return {
      id: str(t[0] as number),
      year: t[1] as number,
      round: t[2] as number,
      kind: str(t[3] as number) as Fixture['kind'],
      home: str(t[4] as number),
      away: str(t[5] as number),
      country: str(t[6] as number),
      groupKey: str(t[7] as number),
      ...(score.length ? { score: { home: score[0], away: score[1] } } : {}),
    };
  };
  if (p.statWidth !== undefined && ![12, 156].includes(p.statWidth))
    throw new Error('통계 차원 손상');
  const stats = reader(p.stats, p.statWidth || 12),
    standings = reader(p.standings, 6);
  const matches = p.matches.map((t) => {
    const metrics = [stats.take(12), stats.take(12)] as MatchRecord['metrics'];
    return {
      ...f(t),
      metrics,
      players: (t[9] as number[]).map((n) => ({ id: str(n), metrics: stats.take(12) })),
      highlights: (t[10] as number[][]).map((h) => ({
        minute: h[0],
        side: h[1] as 0 | 1,
        player: str(h[2]),
        action: str(h[3]),
      })),
      tactics: (t[11] as number[]).map(str) as MatchRecord['tactics'],
    } as MatchRecord;
  });
  const history = p.world.history.map((h, i) => {
    const count = p.counts[i];
    if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error('시즌 통계 손상');
    return {
      ...h,
      standings: Array.from({ length: count }, () => standings.take(6)),
      europe: h.europe.map((e, j) => {
        const sizes = p.euroCounts?.[i]?.[j] || [0, 0];
        if (sizes.some((n) => !Number.isInteger(n) || n < 0 || n > 100))
          throw new Error('유럽 통계 손상');
        return {
          ...e,
          ...(e.standings
            ? { standings: Array.from({ length: sizes[0] }, () => standings.take(6)) }
            : {}),
          ...(e.secondStandings
            ? { secondStandings: Array.from({ length: sizes[1] }, () => standings.take(6)) }
            : {}),
        };
      }),
    };
  });
  stats.done();
  standings.done();
  const copy = { ...p.world };
  prepareSeason(copy, false);
  for (const row of p.fixtures) {
    const fixture = copy.fixtures[row[0] as number];
    if (!fixture || fixture.score) throw new Error('일정 참조 손상');
    fixture.score = { home: row[1] as number, away: row[2] as number };
  }
  return { ...p.world, fixtures: copy.fixtures, ownMatches: matches, history };
}
