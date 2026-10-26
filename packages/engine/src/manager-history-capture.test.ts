import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { World } from '../../contracts/src/types';
import { LOAD_CATALOG } from '../../catalogs/src/index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld, withoutManagerHistory } from '../../../tests/fixtures/worlds';
import { advanceRound, createWorld, managerCandidates, operate, simulateSeason } from './index';
import {
  attributeOwnMatch,
  captureCupTitle,
  captureSeasonClose,
  ensureManagerHistory,
} from './manager-history-capture';
import { yearlyStaff } from './ops-staff';
import { finishCups } from './cups';
import { legacySettings } from './responsibilities';
import { careerDate } from './person-careers';
import { currentDay } from './calendar';

const FOUNDING = {
  country: 'ENG' as const,
  name: 'Tenure Athletic',
  color: '#224466',
  seed: 'manager-capture',
  level: 'easy' as const,
};
/**
 * A founded career with money for hires; `delegated` hands the manager post to the staff. On the
 * pre-feature path: manager attribution, not the match model, is the subject.
 */
function founded(delegated = false) {
  const w = simulatedWorld(FOUNDING, {}, DISABLED_RELEASE);
  w.cash = '999999999999';
  if (delegated) {
    w.intervention = 4;
    w.settings = legacySettings(4);
  }
  return w;
}
const facts = (w: World) => w.managerHistory!;
const hire = (w: World, pick = 0) => {
  const candidate = managerCandidates(w).filter((c) => c.source !== 'club')[pick]!;
  operate(w, { type: 'hire', id: candidate.id });
  return candidate;
};
/** The proud manager resigns over one more strong demand (→STAFF-5). */
function resignOverDemand(w: World) {
  w.manager = { ...w.manager, pride: 90, trust: 20, conflicts: 2 };
  operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
}
/** Every fact of the career apart from the manager-history facts and links. */
const gameplay = (w: World) => canonical(withoutManagerHistory(structuredClone(w)));

describe('manager-history capture (→HIST-18/19, SAVE-24)', () => {
  it('tracks a new career from its founding', () => {
    const w = founded();
    expect(facts(w)).toMatchObject({
      club: w.playerClub,
      trackedFrom: { year: w.year, day: 0, revision: w.revision },
      coverage: 'founding',
      serial: 1,
      outcomes: [],
    });
    expect(facts(w).tenures).toEqual([
      expect.objectContaining({
        manager: w.manager.id,
        name: w.manager.name,
        interim: false,
        trackedFrom: { year: w.year, day: 0 },
        appointed: { year: w.year, day: 0 },
        knownSince: w.manager.since,
      }),
    ]);
    expect(() => validateWorld(w, LOAD_CATALOG)).not.toThrow();
  });

  it('records owner hires, same-day changes and renewals as the tenures they are', () => {
    const w = founded();
    const first = facts(w).tenures[0]!;
    // A renewal and a tactic request continue the tenure.
    w.manager.until = w.year + 1;
    operate(w, { type: 'renew-manager' });
    operate(w, { type: 'tactics', tactic: 'press', tone: 'respect' });
    expect(facts(w).tenures).toEqual([first]);
    // Two appointments on one day are two tenures in order, the first replaced the same day.
    const today = careerDate(w);
    const a = hire(w),
      b = hire(w);
    const [founding, second, third] = facts(w).tenures;
    expect(founding).toMatchObject({ ended: today, departure: 'replaced' });
    expect(second).toMatchObject({ manager: a.id, appointed: today, ended: today });
    expect(second).not.toHaveProperty('knownSince');
    expect(third).toMatchObject({ manager: b.id, appointed: today, interim: false });
    expect(third).not.toHaveProperty('ended');
    expect(new Set(facts(w).tenures.map((t) => t.id)).size).toBe(3);
    // Reappointing a manager who left the same day is a new tenure, not the old one reopened.
    const back = managerCandidates(w).find((c) => c.id === a.id)!;
    operate(w, { type: 'hire', id: back.id });
    expect(facts(w).tenures).toHaveLength(4);
    expect(facts(w).tenures[3]).toMatchObject({ manager: a.id, appointed: today });
    expect(facts(w).tenures[3]!.id).not.toBe(second!.id);
    expect(() => validateWorld(w, LOAD_CATALOG)).not.toThrow();
  });

  it('keeps a zero-match interim between a resignation and a delegated successor', () => {
    const w = founded(true);
    const today = careerDate(w);
    resignOverDemand(w);
    const [left, interim, successor] = facts(w).tenures;
    expect(left).toMatchObject({ ended: today, departure: 'resigned' });
    expect(interim).toMatchObject({ interim: true, trackedFrom: today, ended: today });
    expect(interim!.departure).toBe('replaced');
    expect(successor).toMatchObject({ manager: w.manager.id, interim: false });
    // The owner's resignation path without delegation keeps the interim in charge.
    const owner = founded();
    resignOverDemand(owner);
    expect(facts(owner).tenures.at(-1)).toMatchObject({ interim: true });
    expect(facts(owner).tenures.at(-1)).not.toHaveProperty('ended');
    expect(owner.manager.interim).toBe(true);
  });

  it('records retirement and contract expiry at the season boundary', () => {
    const retiring = founded();
    retiring.manager = { ...retiring.manager, born: retiring.year - 69 };
    retiring.year++;
    yearlyStaff(retiring);
    expect(facts(retiring).tenures[0]).toMatchObject({ departure: 'retired' });
    expect(facts(retiring).tenures[1]).toMatchObject({ interim: true });
    const expiring = founded();
    expiring.manager.until = expiring.year;
    expiring.year++;
    yearlyStaff(expiring);
    expect(facts(expiring).tenures[0]).toMatchObject({ departure: 'expired' });
  });

  it('credits a cup to the manager at its final, never to his successor, and only once', () => {
    const w = founded();
    const first = facts(w).tenures[0]!.id;
    captureCupTitle(w, 'cup');
    // The Super Cup counts whatever its prize or news.
    captureCupTitle(w, 'super');
    hire(w);
    captureCupTitle(w, 'cup');
    expect(facts(w).outcomes).toEqual([
      {
        source: { kind: 'cup-title', year: w.year, competition: 'cup' },
        tenure: first,
        at: careerDate(w),
      },
      {
        source: { kind: 'cup-title', year: w.year, competition: 'super' },
        tenure: first,
        at: careerDate(w),
      },
    ]);
  });

  it('credits a domestic cup as its final is decided in play', () => {
    // An overwhelming own squad, the cups played out as the close does; the first seeded career
    // whose final we win is the scene (a lost final still happens even then).
    const won = ['manager-cup-2', 'manager-cup-3', 'manager-cup-4']
      .map((seed) => {
        const w = createWorld({ ...FOUNDING, seed }, DISABLED_RELEASE);
        for (const p of w.players)
          for (const key of Object.keys(p.attrs) as (keyof typeof p.attrs)[]) p.attrs[key] = 99;
        finishCups(w);
        return w;
      })
      .find((w) => w.cups!.some((c) => c.winner === w.playerClub));
    expect(won).toBeDefined();
    const w = won!;
    expect(facts(w).outcomes).toEqual([
      {
        source: { kind: 'cup-title', year: w.year, competition: 'cup' },
        tenure: facts(w).tenures[0]!.id,
        at: careerDate(w),
      },
    ]);
  });

  it('credits the final table and a promotion, never a group move, before the close departs', () => {
    const w = founded();
    const club = w.clubs.find((c) => c.id === w.playerClub)!;
    const regrouped = structuredClone(w);
    captureSeasonClose(regrouped, { tier: club.tier, group: club.group + 1 });
    expect(facts(regrouped).outcomes.map((o) => o.source.kind)).toEqual(['league-finish']);
    captureSeasonClose(w, { tier: club.tier + 1, group: 0 });
    expect(facts(w).outcomes.map((o) => o.source)).toEqual([
      { kind: 'league-finish', year: w.year, country: club.country, tier: club.tier + 1, group: 0 },
      {
        kind: 'promotion',
        year: w.year,
        club: club.id,
        from: { country: club.country, tier: club.tier + 1, group: 0 },
        to: { country: club.country, tier: club.tier, group: club.group },
      },
    ]);
    // Settled again (a retry or a reload's replay of the close), nothing doubles.
    const once = canonical(facts(w));
    captureSeasonClose(w, { tier: club.tier + 1, group: 0 });
    expect(canonical(facts(w))).toBe(once);
  });

  it('settles the league finish before an expiring manager leaves at the close', () => {
    const w = cachedWorld('last round', () => {
      const w = founded();
      while (w.round < 45) advanceRound(w, undefined, false);
      return w;
    });
    w.manager.until = w.year;
    const year = w.year,
      first = facts(w).tenures[0]!.id;
    simulateSeason(w);
    const finish = facts(w).outcomes.find((o) => o.source.kind === 'league-finish')!;
    expect(finish).toMatchObject({ tenure: first, source: { year } });
    expect(facts(w).tenures[0]).toMatchObject({ ended: finish.at, departure: 'expired' });
    expect(facts(w).tenures.at(-1)!.trackedFrom).toEqual(finish.at);
    // Every own match of the season carries the tenure in charge when it settled.
    const own = w.ownMatches.filter((m) => m.year === year);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((m) => m.managerTenure === first)).toBe(true);
    expect(() => validateWorld(w, LOAD_CATALOG)).not.toThrow();
  });

  it('freezes a settled match and leaves untracked careers and their results untouched', () => {
    const w = cachedWorld('rounds played', () => {
      const w = founded();
      for (let n = 0; n < 2; n++) advanceRound(w, undefined, false);
      return w;
    });
    const record = w.ownMatches.at(-1)!;
    const first = record.managerTenure;
    expect(first).toBe(facts(w).tenures[0]!.id);
    hire(w);
    expect(attributeOwnMatch(w, record).managerTenure).toBe(first);
    // A career not yet tracked stays so through every hook; its gameplay is the same either way.
    const plain = withoutManagerHistory(structuredClone(w)),
      tracked = structuredClone(w);
    for (const world of [plain, tracked]) {
      hire(world, 1);
      captureCupTitle(world, 'cup');
      for (let n = 0; n < 2; n++) advanceRound(world, undefined, false);
    }
    expect(plain.managerHistory).toBeUndefined();
    expect(plain.ownMatches.some((m) => m.managerTenure !== undefined)).toBe(false);
    expect(gameplay(tracked)).toBe(gameplay(plain));
    const latest = tracked.ownMatches.at(-1)!;
    expect(latest.managerTenure).toBe(facts(tracked).tenures.at(-1)!.id);
  });

  it('starts an untracked career at an activation, keeping its known service year', () => {
    const w = withoutManagerHistory(
      cachedWorld('rounds played', () => {
        const w = founded();
        for (let n = 0; n < 2; n++) advanceRound(w, undefined, false);
        return w;
      }),
    );
    w.manager.since = w.year - 3;
    ensureManagerHistory(w);
    expect(facts(w)).toMatchObject({
      coverage: 'activation',
      trackedFrom: { year: w.year, day: currentDay(w), revision: w.revision },
    });
    expect(facts(w).tenures[0]).toMatchObject({ knownSince: w.year - 3 });
    expect(facts(w).tenures[0]).not.toHaveProperty('appointed');
    // Matches settled before stay unattributed, never guessed.
    expect(w.ownMatches.every((m) => m.managerTenure === undefined)).toBe(true);
    // A known year after today is no earlier service; it is left out rather than moved.
    const later = withoutManagerHistory(structuredClone(w));
    later.manager.since = later.year + 1;
    ensureManagerHistory(later);
    expect(facts(later).tenures[0]).not.toHaveProperty('knownSince');
  });
});
