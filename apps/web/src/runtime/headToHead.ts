import type { MatchRecord } from '../../../../packages/contracts/src/types';

/** One meeting with a club, from our side. */
export interface Meeting {
  id: string;
  year: number;
  round: number;
  kind: MatchRecord['kind'];
  home: boolean;
  own: number;
  other: number;
  /** The tie this match closed went to a shoot-out, and whether we won it. */
  shootout?: 'won' | 'lost';
}
/** Our all-time record against one club across every competition (→WEB-58). */
export interface HeadToHead {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  /** Meetings per competition kind; the amateur league counts as league. */
  league: number;
  cup: number;
  europe: number;
  playoff: number;
  biggestWin?: Meeting;
  biggestLoss?: Meeting;
  /** Season of the first meeting. */
  first?: number;
  /** The last ten meetings, oldest first. */
  recent: Meeting[];
}
type Played = Pick<
  MatchRecord,
  'id' | 'year' | 'round' | 'kind' | 'home' | 'away' | 'score' | 'highlights'
>;

/** A wider margin, then more goals for the winner; the earlier meeting keeps a tie. */
const wider = (a: Meeting, b: Meeting) =>
  Math.abs(a.own - a.other) - Math.abs(b.own - b.other) ||
  Math.max(a.own, a.other) - Math.max(b.own, b.other);

/**
 * Our record against `club` from own matches in playing order. Results are the 90 minutes, so a
 * level match settled by a shoot-out counts as a draw; the meeting notes who won the shoot-out.
 */
export function headToHead(matches: readonly Played[], own: string, club: string): HeadToHead {
  const record: HeadToHead = {
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    league: 0,
    cup: 0,
    europe: 0,
    playoff: 0,
    recent: [],
  };
  const meetings: Meeting[] = [];
  for (const m of matches) {
    if (!((m.home === own && m.away === club) || (m.home === club && m.away === own))) continue;
    const home = m.home === own,
      gf = home ? m.score.home : m.score.away,
      ga = home ? m.score.away : m.score.home,
      shootout = m.highlights.find((h) => h.player === '승부차기');
    const meeting: Meeting = {
      id: m.id,
      year: m.year,
      round: m.round,
      kind: m.kind,
      home,
      own: gf,
      other: ga,
      ...(shootout ? { shootout: shootout.side === (home ? 0 : 1) ? 'won' : 'lost' } : {}),
    };
    meetings.push(meeting);
    record.played++;
    record.gf += gf;
    record.ga += ga;
    if (gf > ga) {
      record.won++;
      if (!record.biggestWin || wider(meeting, record.biggestWin) > 0) record.biggestWin = meeting;
    } else if (gf < ga) {
      record.lost++;
      if (!record.biggestLoss || wider(meeting, record.biggestLoss) > 0)
        record.biggestLoss = meeting;
    } else record.drawn++;
    record[m.kind === 'lower' ? 'league' : m.kind]++;
  }
  if (meetings.length) record.first = meetings[0].year;
  record.recent = meetings.slice(-10);
  return record;
}
