import type { Fixture } from '../../contracts/src/types';
import { DOMESTIC_CUP_ROUNDS } from './cups';
import { EUROPE_CALENDAR, europeanEras } from './europe';
import { roundLabel } from './knockout';

/** Where a cup match stood: its competition, the stage as media name it and the leg of a tie. */
export interface CupStage {
  /** `cup` for a domestic cup, otherwise the continental competition key. */
  competition: string;
  /** 1라운드 … 결승, 예선 n라운드, 플레이오프, 리그 페이즈, 조별 리그 or 2차 조별 리그. */
  label: string;
  /** 1차전 or 2차전 of a two-legged tie; single matches and finals have none. */
  leg?: 1 | 2;
  /** A league-phase or group match, which belongs to no tie. */
  phase?: true;
}

const DOMESTIC = /^\d+:cup:[A-Z]+:k(\d+):\d+$/;
const CONTINENTAL = /^\d+:([a-z]+):k(\d+):\d+(:2)?$/;
const PHASE = /^\d+:([a-z]+):(phase|second):\d+$/;

/**
 * The stage of a cup fixture or match record from its ID and calendar slot, so a closed season's
 * matches keep their stage once its brackets are gone (→HIST-13). The calendars place every round
 * by the rounds left to the final: a domestic cup's on DOMESTIC_CUP_ROUNDS, a continental knockout
 * on EUROPE_CALENDAR's ladder for that season's format. Undefined for league and play-off games.
 */
export function knockoutStage(
  f: Pick<Fixture, 'id' | 'round'>,
  year = Number(f.id.slice(0, f.id.indexOf(':'))),
): CupStage | undefined {
  const domestic = DOMESTIC.exec(f.id);
  if (domestic) {
    const slot = (DOMESTIC_CUP_ROUNDS as readonly number[]).indexOf(f.round);
    if (slot < 0) return undefined;
    const index = Number(domestic[1]);
    // The first round brings the field to a power of two, and no country's field is one (cups.ts),
    // so it is 1라운드; after it the clubs halve each round to the final in the last slot.
    const clubs = 2 ** (DOMESTIC_CUP_ROUNDS.length - slot);
    return { competition: 'cup', label: index === 0 ? '1라운드' : roundLabel(clubs, index) };
  }
  const phase = PHASE.exec(f.id);
  if (phase) {
    const era = europeanEras(year).find((entry) => entry.key === phase[1]);
    if (!era) return undefined;
    const label =
      phase[2] === 'second'
        ? '2차 조별 리그'
        : era.format === 'league'
          ? '리그 페이즈'
          : '조별 리그';
    return { competition: era.key, label, phase: true };
  }
  const knockout = CONTINENTAL.exec(f.id);
  if (!knockout) return undefined;
  const [, key, index, second] = knockout;
  // The Super Cup is one match between the winners.
  if (key === 'super') return { competition: key, label: '결승' };
  const era = europeanEras(year).find((entry) => entry.key === key);
  if (!era) return undefined;
  const slot = second ? f.round - 1 : f.round,
    leg = second ? 2 : 1;
  // The 1991–93 Champions League played two knockout rounds before its groups.
  if (era.qualifier && (EUROPE_CALENDAR.qualifier as readonly number[]).includes(slot))
    return { competition: key, label: `예선 ${Number(index) + 1}라운드`, leg };
  const ladder: readonly number[] =
    era.format === 'knockout' ? EUROPE_CALENDAR.knockout : EUROPE_CALENDAR.afterPhase;
  const back = ladder.indexOf(slot);
  if (back < 0) return undefined;
  // A fifth round back from the final opens the knockout of 24 phase qualifiers, eight of them on
  // a bye: the play-off (every era with a phase sends 24 when it needs five rounds).
  const label =
    era.format !== 'knockout' && back === 4
      ? '플레이오프'
      : roundLabel(2 ** (back + 1), Number(index));
  return label === '결승' ? { competition: key, label } : { competition: key, label, leg };
}
