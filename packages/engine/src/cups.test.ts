import { describe, expect, it } from 'vitest';
import { simulatedWorld, withCandidateModel } from '../../../tests/fixtures/worlds';
import { KIT_ROLES } from '../../contracts/src/identity';
import type { MatchPlayback } from '../../contracts/src/types';
import { currentDay, fixtureDay, nextOwnFixture } from './calendar';
import { identityOf } from './club-identity';
import { finishCups } from './cups';
import { selectMatchKits } from './kit-selection';
import { appearanceForFixture } from './match-appearance';
import { npcCompetition } from './npc-stats';
import { operate } from './operations';
import { advanceDays } from './season';
import { founded } from './season.testkit';

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

describe('domestic cups on the candidate model (→MATCH-6, MATCH-22)', () => {
  it('plays every cup out, our ties in detail and the rest in aggregate, each counted once', () => {
    const w = withCandidateModel(founded(2024));
    finishCups(w);
    expect(w.cups!.every((c) => !!c.winner)).toBe(true);
    const fixtures = w.cups!.flatMap((c) => c.fixtures);
    expect(fixtures.every((f) => f.score)).toBe(true);
    // A single match level after extra time is decided on penalties, kept apart from the score.
    const pens = fixtures.filter((f) => f.shootout);
    expect(pens.length).toBeGreaterThan(0);
    for (const f of pens) {
      expect(f.score!.home).toBe(f.score!.away);
      expect(f.shootout!.home).not.toBe(f.shootout!.away);
    }
    // Our ties were played in detail and saved with our lines only.
    const ours = w.ownMatches.filter((m) => m.kind === 'cup');
    expect(ours.length).toBeGreaterThan(0);
    for (const m of ours) {
      expect(m.model).toBeDefined();
      expect(m.players.length).toBe(m.lineCounts![0] + m.lineCounts![1]);
      expect(Math.min(...m.lineCounts!)).toBe(0);
    }
    // Every tie reached its cup's aggregates once, with every club's named players.
    for (const cup of w.cups!) {
      const c = npcCompetition(w.npcSeason, cup.fixtures[0]!)!;
      for (const row of c.clubs) {
        expect(row.matches).toBe(
          cup.fixtures.filter((f) => f.home === row.club || f.away === row.club).length,
        );
        const named = c.players.filter((p) => p.clubs.some((part) => part.club === row.club));
        expect(named.length).toBeGreaterThanOrEqual(11);
      }
    }
  });
});
