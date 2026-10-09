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
  return rows;
}

export interface PlayerAdvanced {
  /** Matches and minutes that carry advanced counters. */
  matches: number;
  minutes: number;
  totals: number[];
}

/** Sums one player's advanced counters over the season or his whole own-club career. */
export function playerAdvanced(w: World, id: string, scope: 'season' | 'career'): PlayerAdvanced {
  const totals = Array<number>(PLAYER_DETAIL_SIZE).fill(0);
  let matches = 0,
    minutes = 0;
  for (const m of w.ownMatches) {
    if (scope === 'season' && m.year !== w.year) continue;
    const line = m.players.find((p) => p.id === id);
    if (!line?.detail) continue;
    matches++;
    minutes += line.metrics[10];
    line.detail.forEach((value, index) => (totals[index] += value));
  }
  return { matches, minutes, totals };
}

/** Per-90 rate text with the minute denominator respected; no minutes means no rate. */
export function per90(value: number, minutes: number, digits = 2) {
  return minutes > 0 ? ((value * 90) / minutes).toFixed(digits) : '—';
}

export { PD, TD };
