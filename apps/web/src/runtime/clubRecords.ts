import type { MatchRecord } from '../../../../packages/contracts/src/types';

/** One own match as a record reads it, from our side. */
export interface RecordMatch {
  id: string;
  year: number;
  round: number;
  kind: MatchRecord['kind'];
  home: boolean;
  opponent: string;
  own: number;
  other: number;
}
/** The longest run of matches that kept a condition, with its first and last match. */
export interface Run {
  length: number;
  from?: RecordMatch;
  to?: RecordMatch;
  /** The run is still going after the latest match. */
  live: boolean;
}
/** Our club's match records over every own match in every competition (→WEB-54). */
export interface ClubRecords {
  played: number;
  biggestWin?: RecordMatch;
  biggestLoss?: RecordMatch;
  /** The most goals we scored in one match. */
  mostScored?: RecordMatch;
  winning: Run;
  unbeaten: Run;
  losing: Run;
  winless: Run;
  cleanSheets: Run;
}
type Played = Pick<MatchRecord, 'id' | 'year' | 'round' | 'kind' | 'home' | 'away' | 'score'>;

/** A wider margin, then more goals for the winner; the earlier match keeps a tie. */
const wider = (a: RecordMatch, b: RecordMatch) =>
  Math.abs(a.own - a.other) - Math.abs(b.own - b.other) ||
  Math.max(a.own, a.other) - Math.max(b.own, b.other);

/** Follows one condition through the matches; the earlier run keeps a tie. */
function tracker(holds: (m: RecordMatch) => boolean) {
  const best: Run = { length: 0, live: false };
  let length = 0,
    from: RecordMatch | undefined;
  return {
    best,
    add(m: RecordMatch) {
      if (!holds(m)) {
        length = 0;
        best.live = false;
        return;
      }
      if (!length) from = m;
      length++;
      // A run that only ties the best leaves the earlier one standing (and no longer live).
      if (length > best.length) Object.assign(best, { length, from, to: m, live: true });
    },
  };
}

/**
 * Our records from own matches in playing order. Results are the 90 minutes, so a level match
 * settled by a shoot-out counts as a draw, as in the head-to-head; runs carry across seasons.
 */
export function clubRecords(matches: readonly Played[], own: string): ClubRecords {
  const runs = {
    winning: tracker((m) => m.own > m.other),
    unbeaten: tracker((m) => m.own >= m.other),
    losing: tracker((m) => m.own < m.other),
    winless: tracker((m) => m.own <= m.other),
    cleanSheets: tracker((m) => m.other === 0),
  };
  const records: ClubRecords = {
    played: 0,
    winning: runs.winning.best,
    unbeaten: runs.unbeaten.best,
    losing: runs.losing.best,
    winless: runs.winless.best,
    cleanSheets: runs.cleanSheets.best,
  };
  for (const m of matches) {
    if (m.home !== own && m.away !== own) continue;
    const home = m.home === own;
    const match: RecordMatch = {
      id: m.id,
      year: m.year,
      round: m.round,
      kind: m.kind,
      home,
      opponent: home ? m.away : m.home,
      own: home ? m.score.home : m.score.away,
      other: home ? m.score.away : m.score.home,
    };
    records.played++;
    if (match.own > match.other && (!records.biggestWin || wider(match, records.biggestWin) > 0))
      records.biggestWin = match;
    if (match.own < match.other && (!records.biggestLoss || wider(match, records.biggestLoss) > 0))
      records.biggestLoss = match;
    if (match.own > (records.mostScored?.own ?? 0)) records.mostScored = match;
    for (const run of Object.values(runs)) run.add(match);
  }
  return records;
}
