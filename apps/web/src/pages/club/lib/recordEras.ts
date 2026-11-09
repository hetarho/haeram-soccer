import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
/**
 * The records room's two eras (→HIST-21, OWNER-17): the bought club's seasons before the owner and
 * the owner's own seasons, as the rows 시즌별 기록 lists. Pure reads of published facts.
 */
import type { CupRun } from '../../../../../../packages/contracts/src/types';
import type {
  OwnerSeasonRecord,
  OwnerState,
  PreOwnerSeason,
} from '../../../../../../packages/contracts/src/owner';
import { divisionName } from '../../../presentation/competitionLabels';

/** A season's cup runs on one line — '컵 우승 · 유러피언컵 4강' — or '—' without one. */
export function runsText(runs: readonly CupRun[] | undefined) {
  return runs?.length
    ? runs
        .map(
          (run) =>
            `${run.key === 'cup' ? sourceMessage('navigation.short.europe') : run.name} ${run.champion ? sourceMessage('copy.CupHistory.31e52393f3') : run.reached}`,
        )
        .join(' · ')
    : '—';
}

/** A season's league finish before the owner — '2부 3위' — or '—' when the archive kept no row. */
export function finishText(code: string, season: PreOwnerSeason) {
  const finish = season.finish;
  return finish
    ? sourceMessage('copy.CareerRecordBook.2df6533b51', {
        p0: divisionName(code, finish.tier, finish.group),
        p1: finish.place,
      })
    : '—';
}

/** The honours of the seasons before the owner, as the panel's note reads them. */
export function honoursText(honours: { league: number; cup: number; europe: number }) {
  return sourceMessage('copy.recordEras.9d6329038f', {
    p0: honours.league,
    p1: honours.cup,
    p2: honours.europe,
  });
}

/** Newest first, as every season list of the records room. */
export const newestFirst = <T extends { year: number }>(seasons: readonly T[]) =>
  [...seasons].sort((a, b) => b.year - a.year);

/** The owner's closed seasons, newest first (→OWNER-17); none in a founded career. */
export function ownerSeasonRows(owner: Pick<OwnerState, 'seasonRecords'> | undefined) {
  return newestFirst<OwnerSeasonRecord>(owner?.seasonRecords ?? []);
}

/** The season's business result with its sign: '+' for a gain, '−' for a loss, nothing at zero. */
export const businessSign = (record: Pick<OwnerSeasonRecord, 'business'>) => {
  const value = BigInt(record.business);
  return value > 0n ? '+' : '';
};

/** A row of 시즌별 기록 (→WEB-54): an owned season, the takeover rule or a season before the owner. */
export type SeasonListRow<Owned, Before> =
  | { kind: 'owned'; season: Owned }
  | { kind: 'takeover'; year: number }
  | { kind: 'before'; season: Before };

/**
 * 시즌별 기록's closed seasons as one newest-first history (→WEB-54, HIST-21): the owner's seasons,
 * the rule naming the takeover season, then the bought club's seasons before the owner. `limit`
 * counts seasons, never the rule, which shows above the first season before the owner on the page;
 * `remaining` is what 더 보기 adds.
 */
export function seasonListRows<Owned extends { year: number }, Before extends { year: number }>(
  owned: readonly Owned[],
  before: readonly Before[],
  takeoverYear: number | undefined,
  limit: number,
) {
  const seasons: SeasonListRow<Owned, Before>[] = [
      ...newestFirst(owned).map((season) => ({ kind: 'owned' as const, season })),
      ...newestFirst(before).map((season) => ({ kind: 'before' as const, season })),
    ],
    shown = seasons.slice(0, Math.max(0, limit)),
    first = shown.findIndex((row) => row.kind === 'before');
  const rows =
    first < 0 || takeoverYear === undefined
      ? shown
      : [
          ...shown.slice(0, first),
          { kind: 'takeover' as const, year: takeoverYear },
          ...shown.slice(first),
        ];
  return { rows, remaining: seasons.length - shown.length };
}
