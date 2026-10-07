import { prepareSeason } from '../../../../packages/engine/src/season';
import { packBitColumns, readBitColumns } from './bitpacking';
import type {
  World,
  MatchRecord,
  Fixture,
  StandingSnapshot,
  GoalScorerSeason,
  Event,
} from '../../../../packages/contracts/src/types';
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
function deltaColumns(values: number[], width: number) {
  const previous: number[] = [];
  return values.map((value, index) => {
    const column = index % width;
    const delta = value - (previous[column] || 0);
    previous[column] = value;
    return delta >= 0 ? delta * 2 : -delta * 2 - 1;
  });
}
function readDeltaColumns(source: ReturnType<typeof reader>, width: number) {
  const previous: number[] = [];
  let offset = 0;
  return {
    take(count: number) {
      return source.take(count).map((encoded) => {
        const column = offset++ % width;
        const delta = encoded % 2 === 0 ? encoded / 2 : -(encoded + 1) / 2;
        const value = (previous[column] || 0) + delta;
        if (!Number.isSafeInteger(value) || value < 0) throw new Error('시즌 통계 차분 손상');
        previous[column] = value;
        return value;
      });
    },
    done: source.done,
  };
}
type Tuple = (number | number[] | number[][])[];
interface Packed {
  format: 'compact1';
  world: World;
  dict: string[];
  fixtures: Tuple[];
  matches: Tuple[];
  matchFields?: string;
  matchActors?: string;
  matchActorColumns?: {
    dimensions: string;
    players: string;
    playerWidth: 1 | 11;
    highlights: string;
    tactics: string;
  };
  matchCount?: number;
  stats: string;
  statWidth?: number;
  statBits?: ReturnType<typeof packBitColumns>;
  statResiduals?: true;
  statInterceptionDeltas?: true;
  standings: string;
  standingsDeltas?: true;
  counts: number[];
  euroCounts?: number[][][];
  ranks?: string;
  rankCounts?: number[];
  scorerRows?: string;
  scorerCounts?: number[];
  events?: Tuple[];
  eventStats?: string;
  eventDetails?: string;
  eventCount?: number;
  eventTemplates?: number[][];
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
  if (stats.some((value) => !Number.isSafeInteger(value) || value < 0))
    throw new Error('압축할 통계가 0 이상의 안전한 정수가 아닙니다.');
  const counts = w.history.map((h) => h.standings.length);
  const actorDimensions: number[] = [];
  const matchPlayers: number[] = [];
  const matchHighlights: number[] = [];
  const matchTactics: number[] = [];
  const matchFields = matches.flatMap((tuple) => {
    const players = tuple[9] as number[];
    const highlights = tuple[10] as number[][];
    actorDimensions.push(players.length, highlights.length);
    matchPlayers.push(...players);
    matchHighlights.push(...highlights.flat());
    matchTactics.push(...(tuple[11] as number[]));
    return [...(tuple.slice(0, 8) as number[]), ...(tuple[8] as number[])];
  });
  const residuals = stats.map((value, index) =>
    index % 12 === 3
      ? stats[index - 1] - value
      : index % 12 === 5
        ? stats[index - 1] - value
        : value,
  );
  const useResiduals = residuals.every((value) => Number.isSafeInteger(value) && value >= 0);
  const interceptionDeltas = (useResiduals ? residuals : stats).map((value, index) => {
    if (index % 12 !== 7) return value;
    const delta = value - stats[index - 1];
    return delta >= 0 ? delta * 2 : -delta * 2 - 1;
  });
  const useInterceptionDeltas = interceptionDeltas.every(
    (value) => Number.isSafeInteger(value) && value >= 0,
  );
  const compactEvents = w.events.every(
    (event) =>
      Number.isSafeInteger(event.year) &&
      event.year >= 0 &&
      Number.isSafeInteger(event.round) &&
      event.round >= 0,
  );
  const eventDetails: number[] = [];
  const eventTemplates: number[][] = [];
  const templateIndices = new Map<string, number>();
  const previousDetails: number[][] = [];
  const eventRows = w.events.map((event) => {
    if (!compactEvents)
      return [
        event.year,
        event.round,
        id(event.kind),
        id(event.title),
        id(event.detail),
        event.amount === undefined ? -1 : id(event.amount),
        event.currency === undefined ? -1 : id(event.currency),
      ];
    // Keep fixture IDs and monetary numbers shared with the existing dictionary.
    // Splitting retains every original character, including separators and whitespace.
    const parts = event.detail.split(/(\d{4}:[\w:-]+|[+-]?\d+(?:\.\d+)?)/g);
    const template = parts.filter((_, index) => index % 2 === 0).map(id);
    const templateKey = template.join(',');
    let templateIndex = templateIndices.get(templateKey);
    if (templateIndex === undefined) {
      templateIndex = eventTemplates.length;
      templateIndices.set(templateKey, templateIndex);
      eventTemplates.push(template);
      previousDetails.push([]);
    }
    eventDetails.push(templateIndex);
    const previous = previousDetails[templateIndex];
    parts
      .filter((_, index) => index % 2 === 1)
      .forEach((part, index) => {
        const value = id(part);
        const delta = value - (previous[index] || 0);
        eventDetails.push(delta >= 0 ? delta * 2 : -delta * 2 - 1);
        previous[index] = value;
      });
    return [
      event.year,
      event.round,
      id(event.kind),
      id(event.title),
      event.amount === undefined ? 0 : id(event.amount) + 1,
      event.currency === undefined ? 0 : id(event.currency) + 1,
    ];
  });
  return {
    format: 'compact1',
    world: {
      ...w,
      fixtures: [],
      ownMatches: [],
      events: [],
      ...(w.rankHistory ? { rankHistory: w.rankHistory.map((s) => ({ ...s, rows: [] })) } : {}),
      ...(w.scorerSeason
        ? {
            scorerSeason: {
              ...w.scorerSeason,
              history: w.scorerSeason.history.map((s) => ({ ...s, rows: [] })),
            },
          }
        : {}),
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
    matches: [],
    matchFields: integers(matchFields, 10),
    matchActors: '',
    matchActorColumns: {
      dimensions: integers(actorDimensions, 2),
      players: integers(matchPlayers, statWidth === 156 ? 11 : 1),
      playerWidth: statWidth === 156 ? 11 : 1,
      highlights: integers(matchHighlights, 4),
      tactics: integers(matchTactics, 2),
    },
    matchCount: matches.length,
    ...(compactEvents
      ? {
          eventStats: integers(eventRows.flat(), 6),
          eventDetails: integers(eventDetails, 1),
          eventCount: w.events.length,
          eventTemplates,
        }
      : { events: eventRows }),
    stats: '',
    statBits: packBitColumns(
      useInterceptionDeltas ? interceptionDeltas : useResiduals ? residuals : stats,
      statWidth,
      'planes',
    ),
    ...(useResiduals ? { statResiduals: true as const } : {}),
    ...(useInterceptionDeltas ? { statInterceptionDeltas: true as const } : {}),
    statWidth,
    standings: integers(
      deltaColumns(
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
      6,
    ),
    standingsDeltas: true,
    counts,
    euroCounts: w.history.map((h) =>
      h.europe.map((e) => [e.standings?.length || 0, e.secondStandings?.length || 0]),
    ),
    ...(w.rankHistory
      ? {
          ranks: integers(
            w.rankHistory.flatMap((s) => s.rows.flat()),
            4,
          ),
          rankCounts: w.rankHistory.map((s) => s.rows.length),
        }
      : {}),
    ...(w.scorerSeason
      ? {
          scorerRows: integers(
            w.scorerSeason.history.flatMap((s) => s.rows.flat()),
            3,
          ),
          scorerCounts: w.scorerSeason.history.map((s) => s.rows.length),
        }
      : {}),
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
    p.fixtures.length > 20000 ||
    (p.events !== undefined && (!Array.isArray(p.events) || p.events.length > 100000))
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
  let packedMatches = p.matches;
  if (p.matchActorColumns !== undefined && p.matchFields === undefined)
    throw new Error('경기 참여자 압축 데이터 손상');
  if (p.matchFields !== undefined) {
    if (
      typeof p.matchFields !== 'string' ||
      typeof p.matchActors !== 'string' ||
      !Number.isInteger(p.matchCount) ||
      p.matchCount! < 0 ||
      p.matchCount! > 100000
    )
      throw new Error('경기 기록 압축 데이터 손상');
    const fields = reader(p.matchFields, 10);
    const columns = p.matchActorColumns;
    if (
      columns !== undefined &&
      (!columns ||
        typeof columns.dimensions !== 'string' ||
        typeof columns.players !== 'string' ||
        ![1, 11].includes(columns.playerWidth) ||
        typeof columns.highlights !== 'string' ||
        typeof columns.tactics !== 'string')
    )
      throw new Error('경기 참여자 압축 데이터 손상');
    const actors = columns ? undefined : reader(p.matchActors, 1);
    const dimensions = columns && reader(columns.dimensions, 2);
    const playerStream = columns && reader(columns.players, columns.playerWidth);
    const highlightStream = columns && reader(columns.highlights, 4);
    const tacticStream = columns && reader(columns.tactics, 2);
    packedMatches = Array.from({ length: p.matchCount! }, () => {
      const row = fields.take(10);
      const sizes = dimensions?.take(2);
      const playerCount = sizes ? sizes[0] : actors!.take(1)[0];
      if (playerCount > 60) throw new Error('경기 선수 압축 차원 손상');
      if (columns?.playerWidth === 11 && playerCount !== 11)
        throw new Error('경기 선수 압축 차원 손상');
      const players = (playerStream || actors)!.take(playerCount);
      const highlightCount = sizes ? sizes[1] : actors!.take(1)[0];
      if (highlightCount > 100) throw new Error('경기 하이라이트 압축 차원 손상');
      const highlights = Array.from({ length: highlightCount }, () =>
        (highlightStream || actors)!.take(4),
      );
      return [
        ...row.slice(0, 8),
        row.slice(8, 10),
        players,
        highlights,
        (tacticStream || actors)!.take(2),
      ];
    });
    fields.done();
    for (const stream of [actors, dimensions, playerStream, highlightStream, tacticStream])
      stream?.done();
  }
  if (p.statWidth !== undefined && ![12, 156].includes(p.statWidth))
    throw new Error('통계 차원 손상');
  if (p.statResiduals !== undefined && p.statResiduals !== true)
    throw new Error('경기 통계 차분 형식 손상');
  if (p.statInterceptionDeltas !== undefined && p.statInterceptionDeltas !== true)
    throw new Error('인터셉트 통계 차분 형식 손상');
  const expectedValues = packedMatches.reduce((count, tuple) => {
    const players = tuple[9];
    if (!Array.isArray(players) || players.length > 60) throw new Error('경기 선수 통계 차원 손상');
    return count + 24 + players.length * 12;
  }, 0);
  if (p.statBits && p.statBits.count * (p.statWidth || 12) !== expectedValues)
    throw new Error('경기 통계 압축 차원 손상');
  const stats =
      p.statBits === undefined
        ? reader(p.stats, p.statWidth || 12)
        : readBitColumns(p.statBits, p.statWidth || 12),
    rawStandings = reader(p.standings, 6);
  if (p.standingsDeltas !== undefined && p.standingsDeltas !== true)
    throw new Error('시즌 통계 차분 형식 손상');
  const standings = p.standingsDeltas ? readDeltaColumns(rawStandings, 6) : rawStandings;
  const matches = packedMatches.map((t) => {
    const takeMetrics = () => {
      const row = stats.take(12);
      if (p.statResiduals) {
        row[3] = row[2] - row[3];
        row[5] = row[4] - row[5];
      }
      if (p.statInterceptionDeltas) {
        const delta = row[7] % 2 === 0 ? row[7] / 2 : -(row[7] + 1) / 2;
        row[7] = row[6] + delta;
        if (!Number.isSafeInteger(row[7]) || row[7] < 0)
          throw new Error('인터셉트 통계 차분 범위 손상');
      }
      return row;
    };
    const metrics = [takeMetrics(), takeMetrics()] as MatchRecord['metrics'];
    return {
      ...f(t),
      metrics,
      players: (t[9] as number[]).map((n) => ({ id: str(n), metrics: takeMetrics() })),
      highlights: (t[10] as number[][]).map((h) => ({
        minute: h[0],
        side: h[1] as 0 | 1,
        player: str(h[2]),
        action: str(h[3]),
      })),
      tactics: (t[11] as number[]).map(str) as MatchRecord['tactics'],
    } as MatchRecord;
  });
  let events: Event[] | undefined = p.events?.map((tuple) => {
    if (!Array.isArray(tuple) || tuple.length !== 7)
      throw new Error('정산 이벤트 압축 데이터 손상');
    return {
      year: tuple[0] as number,
      round: tuple[1] as number,
      kind: str(tuple[2] as number),
      title: str(tuple[3] as number),
      detail: str(tuple[4] as number),
      ...(tuple[5] === -1 ? {} : { amount: str(tuple[5] as number) }),
      ...(tuple[6] === -1 ? {} : { currency: str(tuple[6] as number) }),
    };
  });
  if (p.eventStats !== undefined) {
    if (
      typeof p.eventStats !== 'string' ||
      typeof p.eventDetails !== 'string' ||
      !Number.isInteger(p.eventCount) ||
      p.eventCount! < 0 ||
      p.eventCount! > 100000
    )
      throw new Error('정산 이벤트 압축 데이터 손상');
    const fields = reader(p.eventStats, 6);
    const details = reader(p.eventDetails, 1);
    let templates: string[][] | undefined;
    if (p.eventTemplates !== undefined) {
      if (!Array.isArray(p.eventTemplates) || p.eventTemplates.length > 100000)
        throw new Error('정산 이벤트 설명 서식 손상');
      templates = p.eventTemplates.map((template) => {
        if (!Array.isArray(template) || template.length < 1 || template.length > 1001)
          throw new Error('정산 이벤트 설명 서식 손상');
        return template.map(str);
      });
    }
    const previous: number[][] = [];
    events = Array.from({ length: p.eventCount! }, () => {
      const row = fields.take(6);
      let detail: string;
      const reference = details.take(1)[0];
      if (templates) {
        const template = templates[reference];
        if (!template) throw new Error('정산 이벤트 설명 서식 참조 손상');
        const values = (previous[reference] ||= []);
        const deltas = details.take(template.length - 1);
        detail = template[0];
        for (let index = 0; index < deltas.length; index++) {
          const delta = deltas[index] % 2 === 0 ? deltas[index] / 2 : -(deltas[index] + 1) / 2;
          values[index] = (values[index] || 0) + delta;
          detail += str(values[index]) + template[index + 1];
        }
      } else {
        if (reference < 1 || reference > 1001) throw new Error('정산 이벤트 설명 손상');
        detail = details.take(reference).map(str).join('');
      }
      return {
        year: row[0],
        round: row[1],
        kind: str(row[2]),
        title: str(row[3]),
        detail,
        ...(row[4] === 0 ? {} : { amount: str(row[4] - 1) }),
        ...(row[5] === 0 ? {} : { currency: str(row[5] - 1) }),
      };
    });
    fields.done();
    details.done();
  }
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
  let rankHistory: StandingSnapshot[] | undefined;
  if (p.world.rankHistory !== undefined) {
    if (
      typeof p.ranks !== 'string' ||
      !Array.isArray(p.rankCounts) ||
      p.rankCounts.length !== p.world.rankHistory.length ||
      p.rankCounts.length > 470
    )
      throw new Error('순위 추이 압축 데이터 손상');
    const ranks = reader(p.ranks, 4);
    rankHistory = p.world.rankHistory.map((s, i) => {
      const count = p.rankCounts![i];
      if (!Number.isInteger(count) || count < 0 || count > 100)
        throw new Error('순위 추이 통계 손상');
      return {
        ...s,
        rows: Array.from(
          { length: count },
          () => ranks.take(4) as StandingSnapshot['rows'][number],
        ),
      };
    });
    ranks.done();
  }
  const copy = { ...p.world };
  let scorerSeason: GoalScorerSeason | undefined;
  if (p.world.scorerSeason !== undefined) {
    if (
      typeof p.scorerRows !== 'string' ||
      !Array.isArray(p.scorerCounts) ||
      p.scorerCounts.length !== p.world.scorerSeason.history.length ||
      p.scorerCounts.length > 47
    )
      throw new Error('득점 순위 추이 압축 데이터 손상');
    const scorers = reader(p.scorerRows, 3);
    scorerSeason = {
      ...p.world.scorerSeason,
      history: p.world.scorerSeason.history.map((snapshot, index) => {
        const count = p.scorerCounts![index];
        if (!Number.isInteger(count) || count < 0 || count > 1000)
          throw new Error('득점 순위 추이 통계 손상');
        return {
          ...snapshot,
          rows: Array.from({ length: count }, () => scorers.take(3) as [number, number, number]),
        };
      }),
    };
    scorers.done();
  }
  prepareSeason(copy, false);
  for (const row of p.fixtures) {
    const fixture = copy.fixtures[row[0] as number];
    if (!fixture || fixture.score) throw new Error('일정 참조 손상');
    fixture.score = { home: row[1] as number, away: row[2] as number };
  }
  return {
    ...p.world,
    fixtures: copy.fixtures,
    ownMatches: matches,
    history,
    ...(rankHistory ? { rankHistory } : {}),
    ...(scorerSeason ? { scorerSeason } : {}),
    ...(events ? { events } : {}),
  };
}
