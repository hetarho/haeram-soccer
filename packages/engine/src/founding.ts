import type { Founding, World } from '../../contracts/src/types';
import { clubIdentitySchema, normaliseIdentity } from '../../contracts/src/identitySchema';
import { clubOf } from './player-state';
import { createBase } from './world';
import { prepareSeason, advanceRound, closeSeason } from './season';
import { basicStaff } from './staff';
import { MORALE_START } from './morale';
import { NEW_CLUB_INTERVENTION } from './intervention';
import { foundWithPreset } from './presets';
import { openShortlistWindow } from './signings';
import { defaultSettings } from './responsibilities';
import { installMissingIdentities } from './club-identity';
import { activateMatchModel, MATCH_MODEL_RELEASE, type MatchModelRelease } from './match-model';
import { ensureManagerHistory } from './manager-history-capture';

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
  // Every club starts with a complete identity; the previewed founding draft, kit parts and
  // goalkeeper kit included, is the own club's as confirmed, in its normalised form (→KIT-11, KIT-14).
  installMissingIdentities(w);
  if (input.identity) clubOf(w).identity = normaliseIdentity(input.identity);
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
  // Own-manager attribution starts at the founding, whatever the switch (→SAVE-24).
  ensureManagerHistory(w);
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
