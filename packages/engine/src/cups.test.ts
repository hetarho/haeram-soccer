import { describe, expect, it } from 'vitest';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { KIT_ROLES } from '../../contracts/src/identity';
import type { MatchPlayback } from '../../contracts/src/types';
import { currentDay, fixtureDay, nextOwnFixture } from './calendar';
import { identityOf } from './club-identity';
import { selectMatchKits } from './kit-selection';
import { appearanceForFixture } from './match-appearance';
import { operate } from './operations';
import { advanceDays } from './season';

describe('domestic cup settlement appearance (→KIT-12)', () => {
  it('records our cup tie through the shared capture with its named kit choice', () => {
    // Four rounds in, our first cup tie (day 32) is the next own fixture.
    const w = simulatedWorld(
      {
        country: 'ENG',
        name: 'Design Town',
        color: '#223344',
        seed: 'identity-command',
        level: 'normal',
      },
      { rounds: 4 },
    );
    const tie = nextOwnFixture(w)!;
    expect(tie.kind).toBe('cup');
    const side = tie.home === w.playerClub ? 0 : 1;
    const auto = selectMatchKits(identityOf(w, tie.home), identityOf(w, tie.away));
    const role = KIT_ROLES.find((r) => r !== auto.roles[side])!;
    operate(w, { type: 'match-kit', fixtureId: tie.id, role });
    const expected = appearanceForFixture(w, tie);
    let live: MatchPlayback | undefined;
    const capture = (_: unknown, p: MatchPlayback) => {
      if (p.record.id === tie.id) live = p;
    };
    advanceDays(w, fixtureDay(tie) - currentDay(w), capture, false);
    expect(live!.record.kind).toBe('cup');
    expect(live!.record.appearance).toEqual(expected);
    expect(w.ownMatches.find((m) => m.id === tie.id)!.appearance).toEqual(expected);
    expect(expected.sides[side].role).toBe(role);
    expect('kitChoice' in w).toBe(false);
  });
});
