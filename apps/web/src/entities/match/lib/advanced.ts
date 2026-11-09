import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { decimal, number, percent } from '../../../presentation/format';
import type { MatchRecord, World } from '../../../../../../packages/contracts/src/types';
import { PD, PLAYER_DETAIL_SIZE, TD } from '../../../../../../packages/contracts/src/detail';

/** Display read models for the advanced counters (→MATCH-13); nothing here changes the world. */
export const share = (part: number, whole: number) => (whole > 0 ? percent(part, whole) : '—');

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
  values: [number | undefined, number | undefined],
  text: (side: 0 | 1) => string,
  lowerIsBetter = false,
): ComparisonRow {
  const [h, a] = values;
  const comparable = h !== undefined && a !== undefined;
  const total = comparable ? h + a : 0;
  return {
    term,
    label,
    home: text(0),
    away: text(1),
    lead: !comparable || h === a ? undefined : h > a !== lowerIsBetter ? 0 : 1,
    homeShare: comparable && total > 0 ? (lowerIsBetter ? a / total : h / total) : 0.5,
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
  if (record.xg) rows.push(row('xg', 'xG', record.xg, (side) => decimal(record.xg![side], 2)));
  rows.push(
    row('possession', sourceMessage('copy.stories.6169842c01'), metric(11), (side) =>
      share(record.metrics[side][11], minutes),
    ),
  );
  const detail = record.detail;
  rows.push(
    row(
      'on-target',
      sourceMessage('copy.LeagueFullStats.0927c60a4f'),
      metric(4),
      (side) => `${number(record.metrics[side][4])} (${number(record.metrics[side][5])})`,
    ),
  );
  if (detail) {
    rows.push(
      row(
        'big-chance',
        sourceMessage('copy.advanced.7b2b4dbb2a'),
        [detail[0][TD.bigChances], detail[1][TD.bigChances]],
        (side) =>
          `${number(detail[side][TD.bigChances])} (${number(detail[side][TD.bigChancesScored])})`,
      ),
      row(
        'box-shot',
        sourceMessage('copy.advanced.6b88079ae9'),
        [detail[0][TD.boxShots], detail[1][TD.boxShots]],
        (side) => number(detail[side][TD.boxShots]),
      ),
      row(
        'key-pass',
        sourceMessage('copy.MatchReport.532ac6f371'),
        [detail[0][TD.keyPasses], detail[1][TD.keyPasses]],
        (side) => number(detail[side][TD.keyPasses]),
      ),
    );
  }
  rows.push(
    row(
      'pass-accuracy',
      sourceMessage('copy.summary.5101559c4e'),
      [
        record.metrics[0][2] ? record.metrics[0][3] / record.metrics[0][2] : undefined,
        record.metrics[1][2] ? record.metrics[1][3] / record.metrics[1][2] : undefined,
      ],
      (side) =>
        `${share(record.metrics[side][3], record.metrics[side][2])} · ${number(record.metrics[side][3])}/${number(record.metrics[side][2])}`,
    ),
  );
  if (detail) {
    const ft = (side: 0 | 1) => detail[side][TD.finalThirdPasses];
    rows.push(
      row(
        'final-third',
        sourceMessage('copy.PlayerAdvancedStats.c4f75aa388'),
        [
          ft(0) ? detail[0][TD.finalThirdCompleted] / ft(0) : undefined,
          ft(1) ? detail[1][TD.finalThirdCompleted] / ft(1) : undefined,
        ],
        (side) =>
          `${share(detail[side][TD.finalThirdCompleted], ft(side))} · ${number(detail[side][TD.finalThirdCompleted])}/${number(ft(side))}`,
      ),
      row('field-tilt', sourceMessage('copy.SeasonReview.c7c1a585f2'), [ft(0), ft(1)], (side) =>
        share(ft(side), ft(0) + ft(1)),
      ),
      row(
        'progressive',
        sourceMessage('copy.PlayerAdvancedStats.af1b560101'),
        [detail[0][TD.progressivePasses], detail[1][TD.progressivePasses]],
        (side) => number(detail[side][TD.progressivePasses]),
      ),
      row(
        'take-on',
        sourceMessage('copy.advanced.a85fbde940'),
        [record.metrics[0][8], record.metrics[1][8]],
        (side) => `${number(record.metrics[side][8])}/${number(detail[side][TD.takeOns])}`,
      ),
      row(
        'high-turnover',
        sourceMessage('copy.PlayerAdvancedStats.11212f27d2'),
        [detail[0][TD.highTurnovers], detail[1][TD.highTurnovers]],
        (side) => number(detail[side][TD.highTurnovers]),
      ),
    );
    const press: [number | undefined, number | undefined] = [ppda(record, 0), ppda(record, 1)];
    rows.push(
      row(
        'ppda',
        'PPDA',
        press,
        (side) => {
          const value = ppda(record, side);
          return value === undefined ? '—' : decimal(value, 1);
        },
        true,
      ),
    );
  }
  rows.push(
    row(
      'tackles-interceptions',
      sourceMessage('copy.advanced.1a691bf32f'),
      [home[6] + home[7], away[6] + away[7]],
      (side) => number(record.metrics[side][6] + record.metrics[side][7]),
    ),
    row('saves', sourceMessage('copy.RecordsRoom.2a022bd612'), metric(9), (side) =>
      number(record.metrics[side][9]),
    ),
  );
  if (detail && record.lineCounts) rows.push(...spatialRows(detail));
  return rows;
}

/**
 * The grid engine's counters (the rules-4.0.0 line, game version 0.7.0, →MATCH-13): only its
 * records carry `lineCounts`, so older matches show none of these rows instead of zeros.
 */
function spatialRows(detail: [number[], number[]]): ComparisonRow[] {
  const pair = (index: number): [number, number] => [detail[0][index], detail[1][index]];
  const count = (term: string, label: string, index: number, lowerIsBetter = false) =>
    row(term, label, pair(index), (side) => number(detail[side][index]), lowerIsBetter);
  const completed = (term: string, label: string, attempts: number, done: number) =>
    row(
      term,
      label,
      pair(attempts),
      (side) => `${number(detail[side][attempts])} (${number(detail[side][done])})`,
    );
  const cards = (side: 0 | 1) => detail[side][TD.yellowCards] + 2 * detail[side][TD.redCards];
  return [
    count('box-entry', sourceMessage('copy.MatchReport.649752aebf'), TD.boxEntries),
    count('front-of-box-entry', sourceMessage('copy.advanced.d77d2a88ec'), TD.frontOfBoxEntries),
    count(
      'line-breaking',
      sourceMessage('copy.PlayerAdvancedStats.0ad2f4840a'),
      TD.lineBreakingPasses,
    ),
    row('xt', sourceMessage('copy.PlayerAdvancedStats.af1292ae9d'), pair(TD.xtAdded), (side) =>
      decimal(detail[side][TD.xtAdded] / 1000, 2),
    ),
    completed('cross', sourceMessage('copy.advanced.1f4ed025cc'), TD.crosses, TD.crossesCompleted),
    count('cut-back', sourceMessage('copy.PlayerAdvancedStats.cf8188e2fc'), TD.cutBacks),
    completed(
      'through-ball',
      sourceMessage('copy.advanced.da26b8c742'),
      TD.throughBalls,
      TD.throughBallsCompleted,
    ),
    count(
      'progressive-carry',
      sourceMessage('copy.PlayerAdvancedStats.0801bcf3fb'),
      TD.progressiveCarries,
    ),
    count('fouls', sourceMessage('copy.summary.a9d93d66a9'), TD.fouls, true),
    row(
      'cards',
      sourceMessage('copy.MatchReport.54c8d68f37'),
      [cards(0), cards(1)],
      (side) => `${number(detail[side][TD.yellowCards])}·${number(detail[side][TD.redCards])}`,
      true,
    ),
    count('set-piece', sourceMessage('copy.summary.64f1e3a4bc'), TD.corners),
    count('offside', sourceMessage('copy.summary.7858515c16'), TD.offsides, true),
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
   * Matches and minutes of the grid engine (the rules-4.0.0 line, records with `lineCounts`): only
   * they count box entries, line-breaking passes, xT, cut-backs and progressive carries (→MATCH-13).
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
  return minutes > 0 ? decimal((value * 90) / minutes, digits) : '—';
}

/** Hundredths as a two-decimal figure, as match reports print xG. */
export const hundredths = (value: number) => decimal(value / 100, 2);

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
