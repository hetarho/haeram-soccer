import type { ClubIdentity, KitRole, MatchAppearance } from '../../contracts/src/identity';
import type { Fixture, MatchRecord, World } from '../../contracts/src/types';
import { identityOf } from './club-identity';
import { selectMatchKits, type KitSelection } from './kit-selection';

/**
 * KIT-12, SAVE-22: what both sides actually wore in an own match, frozen once at its settlement
 * (docs/CLUB-IDENTITY-CONTRACT.md §5). It reads only the clubs' current designs and the owner's
 * choice named for this fixture — never the score, incidents or a sporting draw — and copies them,
 * so later identity edits cannot reach a recorded appearance.
 */

/** One side as it took the field: its crest, the selected shirt and its keeper's colour. */
function side(club: string, identity: ClubIdentity, kits: KitSelection, index: 0 | 1) {
  return {
    club,
    crest: identity.crest,
    role: kits.roles[index],
    shirt: kits.shirts[index],
    goalkeeper: kits.goalkeepers[index],
  };
}

/**
 * The appearance of `fixture`, home then away: each club's applied identity (or the default it
 * would adopt), the owner's role when the stored choice names this fixture and automatic
 * selection otherwise, with automatic goalkeeper colours (KIT-6/7/8). A deep copy.
 */
export function appearanceForFixture(w: World, fixture: Fixture): MatchAppearance {
  const home = identityOf(w, fixture.home),
    away = identityOf(w, fixture.away);
  const ownSide = fixture.home === w.playerClub ? 0 : fixture.away === w.playerClub ? 1 : undefined;
  const role: KitRole | undefined =
    w.kitChoice?.fixtureId === fixture.id ? w.kitChoice.role : undefined;
  const kits = selectMatchKits(
    home,
    away,
    role && ownSide !== undefined ? { side: ownSide, role } : undefined,
  );
  return structuredClone({
    version: 1,
    sides: [side(fixture.home, home, kits, 0), side(fixture.away, away, kits, 1)],
    warnings: kits.warnings,
  });
}

/**
 * Freezes an own record's appearance on its first settlement and consumes the owner's choice only
 * when it names this record; a choice for another fixture waits for its own match.
 */
export function captureAppearance(w: World, record: MatchRecord) {
  record.appearance ??= appearanceForFixture(w, record);
  if (w.kitChoice?.fixtureId === record.id) delete w.kitChoice;
}
