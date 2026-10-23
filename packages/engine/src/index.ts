import type { Founding, World } from '../../contracts/src/types';
import { clubIdentitySchema } from '../../contracts/src/identitySchema';
import { clubOf, createBase } from './world';
import { prepareSeason, advanceRound, closeSeason } from './season';
import { basicStaff } from './staff';
import { MORALE_START } from './morale';
import { NEW_CLUB_INTERVENTION } from './intervention';
import { foundWithPreset } from './presets';
import { openShortlistWindow } from './signings';
import { defaultSettings } from './responsibilities';
import { installMissingIdentities } from './club-identity';
import { activateMatchModel, MATCH_MODEL_RELEASE, type MatchModelRelease } from './match-model';
export {
  activateMatchModel,
  activatesMatchModel,
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from './match-model';
export * from './responsibilities';
export * from './club-identity';
export * from './settings';
export * from './world';
export * from './season';
export * from './match';
export { simulateAggregate } from './aggregate/engine';
export * from './npc-stats';
export * from './primitives';
export * from './calendar';
export * from './scoring';
export * from './finance';
export * from './strategy';
export * from './training';
export * from './policy';
export * from './goals';
export * from './recruitment';
export * from './investment';
export * from './staff';
export * from './coaching';
export * from './fans';
export * from './facilities';
export * from './academy';
export * from './inbox';
export * from './transfers';
export * from './projection';
export * from './morale';
export * from './care';
export * from './styles';
export * from './build';
export * from './synergy';
export * from './news';
export * from './knockout';
export * from './cups';
export * from './ratings';
export * from './dynamics';
export * from './careers';
export * from './discipline';
export * from './contracts';
export * from './hiring';
export * from './direction';
export * from './presets';
export * from './bases';
export * from './signings';
export * from './intervention';
export * from './orders';
export * from './coach-training';
/**
 * A new career on the founding day. With `release` on it records the full match model from its
 * founding (→SAVE-23); the default is the internal switch, which only tests and measurements pass.
 */
export function createWorld(input: Founding, release: MatchModelRelease = MATCH_MODEL_RELEASE) {
  // The previewed founding identity is used as it is, so it must be complete and lead with the
  // founding colour (→KIT-14); nothing is built from an invalid one.
  if (
    input.identity !== undefined &&
    (!clubIdentitySchema.safeParse(input.identity).success ||
      input.identity.colours[0] !== input.color)
  )
    throw new Error('구단 디자인을 확인해 주세요.');
  const w = createBase(input);
  prepareSeason(w);
  // Every club starts with a complete identity; the previewed founding draft is the own club's
  // exactly as confirmed (→KIT-11, KIT-14).
  installMissingIdentities(w);
  if (input.identity) clubOf(w).identity = structuredClone(input.identity);
  // New clubs start with unpaid basic coaches at the "important decisions" intervention level:
  // the staff run training, the academy and contract talks, the owner the rest (→STAFF-13).
  w.staff = basicStaff(w);
  w.academy = { players: [] };
  w.intervention = NEW_CLUB_INTERVENTION;
  w.settings = defaultSettings();
  w.bids = [];
  w.inbox = [];
  w.morale = MORALE_START;
  // The direction chosen at founding (→WEB-15); absent is 기본 방향.
  foundWithPreset(w, input.preset);
  // A club is founded on the summer window's opening day (→CLUB-33).
  openShortlistWindow(w);
  // With the release on, founding coverage: the first season is tracked whole.
  activateMatchModel(w, release);
  return w;
}
export function simulateSeason(w: World) {
  while (w.round < 46 && !w.bankrupt) advanceRound(w, undefined, false);
  // A bankrupt club's career is over (→ECON-24); its last season never closes.
  if (w.bankrupt) return w;
  closeSeason(w);
  w.revision++;
  return w;
}

export * from './operations';
export * from './ops-commercial';
export * from './ops-squad';
export * from './ops-staff';
export * from './settlement';
export * from './managerMarket';

export * from './economy';
export * from './europe';
