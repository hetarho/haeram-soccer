import { describe, expect, it } from 'vitest';
import type { Fixture } from '../../../contracts/src/types';
import { MATCH_MODEL_REVISIONS } from '../../../contracts/src/match-model';
import { squad } from '../index';
import { clubManager } from '../managerMarket';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { bestRoleAt, FORMATIONS } from '../player';
import { buildGridSetup, eraRules, modelAtLeast } from './setup';
import { playerTendencies } from '../match/tendencies';
import { careerWorld } from '../career.testkit';

const w = careerWorld({ seed: 'grid-setup' });
const own = w.fixtures.find((f) => f.home === w.playerClub)!;
const npcClubs = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const neutral: Fixture = { ...own, id: 'neutral', home: npcClubs[0]!.id, away: npcClubs[1]!.id };

describe('grid setup', () => {
  it('builds a setup for an own match and an NPC fixture', () => {
    const a = buildGridSetup(w, own, { observe: false, recordPlayers: true });
    expect(a.own).toBe(own.home === w.playerClub ? 0 : 1);
    expect(a.rosters[0]).toHaveLength(11 + a.bench[0]);
    expect(a.rosters[1]).toHaveLength(11 + a.bench[1]);
    expect(a.bench[0]).toBe(eraRules(own.year).named);
    const bends = a.bends[a.own!];
    expect(Object.keys(bends).sort()).toEqual([
      'defense',
      'lineHigh',
      'lineLow',
      'pass',
      'possession',
      'shot',
    ]);
    expect(a.bends[1 - a.own!]).toEqual({
      pass: 0,
      possession: 0,
      shot: 0,
      defense: 0,
      lineHigh: 0,
      lineLow: 0,
    });
    const b = buildGridSetup(w, neutral, { observe: true, recordPlayers: false });
    expect(b.own).toBeUndefined();
    expect(b.rosters[0].slice(11).map((p) => p.id)).toEqual(
      squad(
        w,
        w.clubs.find((c) => c.id === neutral.home)!,
      )
        .slice(11, 11 + b.bench[0])
        .map((p) => p.id),
    );
    expect(b.drain).toEqual([1, 1]);
    expect(typeof b.r()).toBe('number');
  });

  it('revision 2 computes each player’s tendencies once from his manager and role', () => {
    const [first, second] = MATCH_MODEL_REVISIONS;
    const a = buildGridSetup(w, own, { observe: false, recordPlayers: true, model: second });
    expect(modelAtLeast(a, 2)).toBe(true);
    const ownSide = a.own!;
    const clubs = [own.home, own.away];
    for (const side of [0, 1] as const) {
      const manager =
        side === ownSide
          ? w.manager
          : clubManager(
              w,
              w.clubs.find((c) => c.id === clubs[side])!,
            );
      const slots = FORMATIONS[a.tactics[side]].slots;
      expect(a.tendencies![side]).toEqual(
        a.rosters[side].map((p, i) =>
          playerTendencies(p, manager, i < 11 ? slots[i]!.role : bestRoleAt(p.attrs, p.position)),
        ),
      );
    }
    // Revision 1 and the pre-feature path compute nothing new, and the match stream is untouched.
    const b = buildGridSetup(w, own, { observe: false, recordPlayers: true, model: first });
    expect(modelAtLeast(b, 1)).toBe(true);
    expect(modelAtLeast(b, 2)).toBe(false);
    expect(b.tendencies).toBeUndefined();
    const old = careerWorld({ seed: 'grid-setup' }, DISABLED_RELEASE);
    const c = buildGridSetup(old, own, { observe: false, recordPlayers: true });
    expect(modelAtLeast(c, 1)).toBe(false);
    expect(c.tendencies).toBeUndefined();
    expect([a.r(), a.r()]).toEqual([b.r(), b.r()]);
  });
});
