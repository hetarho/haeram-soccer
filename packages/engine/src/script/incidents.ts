/** Incident identities stay in the record's line indexes, independent of display labels. */
import { CARD_REASONS, FO, IN, INCIDENT_KINDS } from './codes';
import type { MatchDetail } from './detail';
import type { Beat, BeatIncident } from './types';

export const scriptPeriod = (minute: number): 1 | 2 | 3 | 4 =>
  minute < 45 ? 1 : minute < 90 ? 2 : minute < 105 ? 3 : 4;

export const beatIncident = (row: readonly number[]): BeatIncident => ({
  kind: INCIDENT_KINDS[row[IN.kind]!]!,
  side: row[IN.side] as 0 | 1,
  line: row[IN.line]!,
  ...(row[IN.otherLine]! >= 0 && { other: row[IN.otherLine]! }),
  ...(row[IN.reason]! >= 0 && { reason: CARD_REASONS[row[IN.reason]!]! }),
});

export const sameIncident = (a: BeatIncident, b: BeatIncident) =>
  a.kind === b.kind &&
  a.side === b.side &&
  a.line === b.line &&
  a.other === b.other &&
  a.reason === b.reason;

export const incidentIndex = (detail: MatchDetail, minute: number, incident: BeatIncident) =>
  detail.incidents.findIndex(
    (row) => row[IN.minute] === minute && sameIncident(beatIncident(row), incident),
  );

/** A card belongs to at most one booked foul, including repeated bookings of the same man. */
export function foulCards(detail: MatchDetail): Map<number, number> {
  const used = new Set<number>();
  const cards = new Map<number, number>();
  detail.fouls.forEach((f, id) => {
    if (f[FO.cardMinute]! < 0) return;
    const index = detail.incidents.findIndex(
      (x, i) =>
        !used.has(i) &&
        x[IN.kind]! <= 2 &&
        x[IN.reason] !== CARD_REASONS.indexOf('dissent') &&
        x[IN.minute] === f[FO.cardMinute] &&
        x[IN.side] === 1 - f[FO.fouledSide]! &&
        x[IN.line] === f[FO.fouler],
    );
    if (index >= 0) {
      used.add(index);
      cards.set(id, index);
    }
  });
  return cards;
}

export function incidentRows(beats: readonly Beat[]): number[][] {
  return beats.flatMap((b) =>
    (b.incidents ?? []).map((x) => [
      Math.floor(b.clock / 60) + 1,
      x.side,
      INCIDENT_KINDS.indexOf(x.kind),
      x.line,
      x.other ?? -1,
      x.reason === undefined ? -1 : CARD_REASONS.indexOf(x.reason),
    ]),
  );
}
