import type { ClubIdentity } from '../../contracts/src/identity';
import { clubIdentitySchema } from '../../contracts/src/identitySchema';
import type { World } from '../../contracts/src/types';
import { clubOf } from './world';

/**
 * The owner's identity commands (docs/CLUB-IDENTITY-CONTRACT.md §5). Presentation only (KIT-13):
 * no event, news, cash, game day or sporting draw. `operate` counts the one revision.
 */

/**
 * KIT-9: applies a complete design to the own club — the command names no club — as a copy, and
 * moves the club's representative colour to its new primary. The whole design is checked first,
 * so a malformed one changes nothing; the replaced identity object is left as it was for any
 * snapshot still holding it.
 */
export function applyClubIdentity(w: World, identity: ClubIdentity) {
  if (!clubIdentitySchema.safeParse(identity).success)
    throw new Error('구단 디자인을 확인해 주세요.');
  // An opponent without a stored design wears the legacy crest derived around the own colour, so
  // changing that colour would reassign it (KIT-11); writer activation installs every design first.
  if (w.clubs.some((club) => !club.identity))
    throw new Error('구단 디자인 정보를 갱신한 뒤 다시 적용해 주세요.');
  const club = clubOf(w);
  club.identity = structuredClone(identity);
  club.color = identity.colours[0];
}
