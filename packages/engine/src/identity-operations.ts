import { KIT_ROLES, type ClubIdentity, type KitRole } from '../../contracts/src/identity';
import { clubIdentitySchema, normaliseIdentity } from '../../contracts/src/identitySchema';
import type { World } from '../../contracts/src/types';
import { nextOwnFixture } from './calendar';
import { clubOf } from './player-state';

/**
 * The owner's identity commands (spec/ssot/KIT.md). Presentation only (KIT-13):
 * no event, news, cash, game day or sporting draw. `operate` counts the one revision.
 */

/** The refusal when the named fixture is no longer our next one (WEB-88). */
export const KIT_FIXTURE_CHANGED = '다음 경기가 변경됐어요. 유니폼을 다시 골라 주세요.';

/**
 * KIT-9: applies a complete design to the own club — the command names no club — as a normalised
 * copy, and moves the club's representative colour to its new primary. The whole design, kit parts
 * and goalkeeper kit included, is checked first, so a malformed one changes nothing; the replaced
 * identity object is left as it was for any snapshot still holding it.
 */
export function applyClubIdentity(w: World, identity: ClubIdentity) {
  if (!clubIdentitySchema.safeParse(identity).success)
    throw new Error('구단 디자인을 확인해 주세요.');
  // An opponent without a stored design wears the legacy crest derived around the own colour, so
  // changing that colour would reassign it (KIT-11); writer activation installs every design first.
  if (w.clubs.some((club) => !club.identity))
    throw new Error('구단 디자인 정보를 갱신한 뒤 다시 적용해 주세요.');
  const club = clubOf(w);
  club.identity = normaliseIdentity(identity);
  club.color = identity.colours[0];
}

/**
 * KIT-6: our shirt role for the next own fixture in any competition, named by ID and checked
 * against the calendar now, never against a list the caller cached; `null` returns that fixture to
 * automatic selection and leaves a choice named for another fixture alone. Only the choice is
 * stored: saved designs stay as they are, and a clash stays the selector's warning (KIT-7).
 */
export function chooseMatchKit(w: World, fixtureId: string, role: KitRole | null) {
  if (role !== null && !KIT_ROLES.includes(role)) throw new Error('유니폼을 확인해 주세요.');
  const next = nextOwnFixture(w);
  if (!next || next.id !== fixtureId) throw new Error(KIT_FIXTURE_CHANGED);
  if (role) w.kitChoice = { fixtureId, role };
  else if (w.kitChoice?.fixtureId === fixtureId) delete w.kitChoice;
}
