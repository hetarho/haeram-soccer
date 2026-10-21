import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { PD, PLAYER_DETAIL_SIZE, TD } from '../../../../packages/contracts/src/detail';

/** Display read models for the advanced counters (→MATCH-13); nothing here changes the world. */
export const share = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
const fixed = (value: number, digits = 2) => value.toFixed(digits);

export interface ComparisonRow {
  /** Glossary entry explaining the metric. */
  term: string;
  label: string;
  home: string;
  away: string;
  /** Which side did better, for the bar; undefined when equal or not comparable. */
  lead?: 0 | 1;
  /** Share of the home side for the bar (0–1). */
  homeShare: number;
}

function row(
  term: string,
  label: string,
  values: [number, number],
  text: (side: 0 | 1) => string,
  lowerIsBetter = false,
): ComparisonRow {
  const [h, a] = values;
  const total = h + a;
  return {
    term,
    label,
    home: text(0),
    away: text(1),
    lead: h === a ? undefined : h > a !== lowerIsBetter ? 0 : 1,
    homeShare: total > 0 ? (lowerIsBetter ? a / total : h / total) : 0.5,
  };
}

/** PPDA of `side`: the other side's build-up passes per own press action. */
export function ppda(record: MatchRecord, side: 0 | 1) {
  const detail = record.detail;
  if (!detail) return undefined;
  const actions = detail[side][TD.pressActions];
  return actions > 0 ? detail[side === 0 ? 1 : 0][TD.buildUpPasses] / actions : undefined;
}

/** Team comparison of one recorded match, in the order football broadcasts show them. */
export function matchComparison(record: MatchRecord): ComparisonRow[] {
  const [home, away] = record.metrics;
  const metric = (index: number): [number, number] => [home[index], away[index]];
  const minutes = home[11] + away[11];
  const rows: ComparisonRow[] = [];
  if (record.xg) rows.push(row('xg', 'xG', record.xg, (side) => fixed(record.xg![side])));
  rows.push(
    row('possession', '점유율', metric(11), (side) => share(record.metrics[side][11], minutes)),
  );
  const detail = record.detail;
  rows.push(
    row(
      'on-target',
      '슈팅 (유효)',
      metric(4),
      (side) => `${record.metrics[side][4]} (${record.metrics[side][5]})`,
    ),
  );
  if (detail) {
    rows.push(
      row(
        'big-chance',
        '빅찬스 (득점)',
        [detail[0][TD.bigChances], detail[1][TD.bigChances]],
        (side) => `${detail[side][TD.bigChances]} (${detail[side][TD.bigChancesScored]})`,
      ),
      row('box-shot', '박스 안 슈팅', [detail[0][TD.boxShots], detail[1][TD.boxShots]], (side) =>
        String(detail[side][TD.boxShots]),
      ),
      row('key-pass', '키패스', [detail[0][TD.keyPasses], detail[1][TD.keyPasses]], (side) =>
        String(detail[side][TD.keyPasses]),
      ),
    );
  }
  rows.push(
    row(
      'pass-accuracy',
      '패스 성공률',
      [
        record.metrics[0][2] ? record.metrics[0][3] / record.metrics[0][2] : 0,
        record.metrics[1][2] ? record.metrics[1][3] / record.metrics[1][2] : 0,
      ],
      (side) =>
        `${share(record.metrics[side][3], record.metrics[side][2])} · ${record.metrics[side][3]}/${record.metrics[side][2]}`,
    ),
  );
  if (detail) {
    const ft = (side: 0 | 1) => detail[side][TD.finalThirdPasses];
    rows.push(
      row(
        'final-third',
        '파이널 서드 패스',
        [
          ft(0) ? detail[0][TD.finalThirdCompleted] / ft(0) : 0,
          ft(1) ? detail[1][TD.finalThirdCompleted] / ft(1) : 0,
        ],
        (side) =>
          `${share(detail[side][TD.finalThirdCompleted], ft(side))} · ${detail[side][TD.finalThirdCompleted]}/${ft(side)}`,
      ),
      row('field-tilt', '필드 틸트', [ft(0), ft(1)], (side) => share(ft(side), ft(0) + ft(1))),
      row(
        'progressive',
        '전진 패스',
        [detail[0][TD.progressivePasses], detail[1][TD.progressivePasses]],
        (side) => String(detail[side][TD.progressivePasses]),
      ),
      row(
        'take-on',
        '드리블 돌파',
        [record.metrics[0][8], record.metrics[1][8]],
        (side) => `${record.metrics[side][8]}/${detail[side][TD.takeOns]}`,
      ),
      row(
        'high-turnover',
        '하이 턴오버',
        [detail[0][TD.highTurnovers], detail[1][TD.highTurnovers]],
        (side) => String(detail[side][TD.highTurnovers]),
      ),
    );
    const press = [ppda(record, 0) ?? 0, ppda(record, 1) ?? 0] as [number, number];
    rows.push(
      row(
        'ppda',
        'PPDA',
        press,
        (side) => {
          const value = ppda(record, side);
          return value === undefined ? '—' : fixed(value, 1);
        },
        true,
      ),
    );
  }
  rows.push(
    row('tackles-interceptions', '태클·인터셉트', [home[6] + home[7], away[6] + away[7]], (side) =>
      String(record.metrics[side][6] + record.metrics[side][7]),
    ),
    row('saves', '선방', metric(9), (side) => String(record.metrics[side][9])),
  );
  if (detail && record.lineCounts) rows.push(...spatialRows(detail));
  return rows;
}

/**
 * The grid engine's counters (rules 4.0.0, →MATCH-13): only its records carry `lineCounts`, so
 * older matches show none of these rows instead of zeros.
 */
function spatialRows(detail: [number[], number[]]): ComparisonRow[] {
  const pair = (index: number): [number, number] => [detail[0][index], detail[1][index]];
  const count = (term: string, label: string, index: number, lowerIsBetter = false) =>
    row(term, label, pair(index), (side) => String(detail[side][index]), lowerIsBetter);
  const completed = (term: string, label: string, attempts: number, done: number) =>
    row(term, label, pair(attempts), (side) => `${detail[side][attempts]} (${detail[side][done]})`);
  const cards = (side: 0 | 1) => detail[side][TD.yellowCards] + 2 * detail[side][TD.redCards];
  return [
    count('box-entry', '박스 진입', TD.boxEntries),
    count('front-of-box-entry', '박스 앞 진입', TD.frontOfBoxEntries),
    count('line-breaking', '라인 브레이킹 패스', TD.lineBreakingPasses),
    row('xt', '위협도 기여(xT)', pair(TD.xtAdded), (side) =>
      fixed(detail[side][TD.xtAdded] / 1000),
    ),
    completed('cross', '크로스 (성공)', TD.crosses, TD.crossesCompleted),
    count('cut-back', '컷백', TD.cutBacks),
    completed('through-ball', '침투 패스 (성공)', TD.throughBalls, TD.throughBallsCompleted),
    count('progressive-carry', '전진 운반', TD.progressiveCarries),
    count('fouls', '파울', TD.fouls, true),
    row(
      'cards',
      '경고·퇴장',
      [cards(0), cards(1)],
      (side) => `${detail[side][TD.yellowCards]}·${detail[side][TD.redCards]}`,
      true,
    ),
    count('set-piece', '코너킥', TD.corners),
    count('offside', '오프사이드', TD.offsides, true),
  ];
}

/** Player lines of one side: `lineCounts` splits them; records without it hold eleven per side. */
export function sideLines(record: MatchRecord, side: 0 | 1): MatchRecord['players'] {
  const split = record.lineCounts?.[0] ?? 11;
  const lines = side === 0 ? record.players.slice(0, split) : record.players.slice(split);
  // A record saved with the own eleven only (before `lineCounts`) keeps them whatever the side.
  return lines.length || record.lineCounts ? lines : record.players;
}

export interface PlayerAdvanced {
  /** Matches and minutes that carry advanced counters. */
  matches: number;
  minutes: number;
  totals: number[];
  /**
   * Matches and minutes of the grid engine (rules 4.0.0, records with `lineCounts`): only they count
   * box entries, line-breaking passes, xT, cut-backs and progressive carries (→MATCH-13).
   */
  spatialMatches: number;
  spatialMinutes: number;
}

/** Sums one player's advanced counters over the season or his whole own-club career. */
export function playerAdvanced(w: World, id: string, scope: 'season' | 'career'): PlayerAdvanced {
  const totals = Array<number>(PLAYER_DETAIL_SIZE).fill(0);
  let matches = 0,
    minutes = 0,
    spatialMatches = 0,
    spatialMinutes = 0;
  for (const m of w.ownMatches) {
    if (scope === 'season' && m.year !== w.year) continue;
    const line = m.players.find((p) => p.id === id);
    if (!line?.detail) continue;
    matches++;
    minutes += line.metrics[10];
    if (m.lineCounts) {
      spatialMatches++;
      spatialMinutes += line.metrics[10];
    }
    line.detail.forEach((value, index) => (totals[index] += value));
  }
  return { matches, minutes, totals, spatialMatches, spatialMinutes };
}

/** Per-90 rate text with the minute denominator respected; no minutes means no rate. */
export function per90(value: number, minutes: number, digits = 2) {
  return minutes > 0 ? ((value * 90) / minutes).toFixed(digits) : '—';
}

/** Hundredths as a two-decimal figure, as match reports print xG. */
export const hundredths = (value: number) => (value / 100).toFixed(2);

/**
 * Which counters a recorded match carries (→MATCH-13, MATCH-26): a full-model result carries all of
 * them on either engine, as a grid result does; older rules lack the spatial ones or every
 * advanced counter. A note follows only from the rules a match was played under.
 */
export function recordCounters(record: MatchRecord): 'all' | 'advanced' | 'basic' {
  if (record.model !== undefined || record.lineCounts) return 'all';
  return record.detail ? 'advanced' : 'basic';
}

export { PD, TD };
