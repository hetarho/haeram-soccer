import { describe, expect, it } from 'vitest';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../contracts/src/detail';
import {
  activeMatchModel,
  MATCH_MODEL_REVISION,
  type FullMatchRecord,
} from '../../contracts/src/match-model';
import { canonical } from '../../contracts/src/index';
import type { MatchRecord, World } from '../../contracts/src/types';
import { CURRENT_ENGINE_VERSION, upgradeWorldRules } from '../../contracts/src/versions';
import { ENABLED_RELEASE } from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { onPreviousRevision, PREVIOUS_REVISION } from '../../../tests/fixtures/earlier-saves';
import { currentDay } from './calendar';
import { M } from './match/record';
import { advanceRound } from './index';
import { careerWorld } from './career.testkit';
import {
  activateMatchModel,
  assertFullMatchRecord,
  MATCH_MODEL_RELEASE,
  validateFullMatchRecord,
} from './match-model';
import { clubManager } from './managerMarket';
import { matchForm, prepareMatch } from './match';
import { effectiveGap } from './match-rules';
import { trackingBoundary } from './npc-stats';
import { PORTABLE_MATH } from './portable-math';
import { zeroMetrics } from './primitives';
import { findClub, ratingOf } from './world';

/** A synthetic 1–0: eleven lines a side, a scorer, his creator and one passer for the away side. */
function fullRecord(): FullMatchRecord {
  const line = (id: string, set: Partial<Record<keyof typeof M, number>> = {}) => {
    const metrics = zeroMetrics();
    metrics[M.minutes] = 90;
    for (const [key, value] of Object.entries(set)) metrics[M[key as keyof typeof M]] = value;
    return { id, metrics, detail: emptyPlayerDetail() };
  };
  const scorer = line('h:scorer', { goals: 1, shots: 2, onTarget: 1, passes: 2, completed: 2 });
  scorer.detail[PD.xg] = 50;
  const creator = line('h:creator', { assists: 1, passes: 8, completed: 6 });
  creator.detail[PD.keyPasses] = 1;
  creator.detail[PD.xa] = 50;
  creator.detail[PD.bigChancesCreated] = 1;
  const home = [scorer, creator, ...Array.from({ length: 9 }, (_, i) => line(`h:${i}`))];
  const away = [
    line('a:0', { passes: 5, completed: 4 }),
    ...Array.from({ length: 10 }, (_, i) => line(`a:${i + 1}`)),
  ];
  const team = (set: Partial<Record<keyof typeof M, number>>) => {
    const metrics = zeroMetrics();
    for (const [key, value] of Object.entries(set)) metrics[M[key as keyof typeof M]] = value;
    return metrics;
  };
  const homeDetail = emptyTeamDetail();
  homeDetail[TD.keyPasses] = 1;
  homeDetail[TD.bigChances] = 1;
  homeDetail[TD.bigChancesScored] = 1;
  homeDetail[TD.boxShots] = 2;
  return {
    id: 'f:1',
    year: 2024,
    round: 3,
    kind: 'league',
    home: 'ENG:a',
    away: 'ENG:b',
    country: 'ENG',
    groupKey: 'ENG:0:0',
    score: { home: 1, away: 0 },
    metrics: [
      team({
        goals: 1,
        assists: 1,
        passes: 10,
        completed: 8,
        shots: 2,
        onTarget: 1,
        minutes: 90,
        possession: 50,
      }),
      team({ passes: 5, completed: 4, minutes: 90, possession: 40 }),
    ],
    players: [...home, ...away],
    highlights: [],
    tactics: ['balanced', 'press'],
    xg: [0.5, 0],
    detail: [homeDetail, emptyTeamDetail()],
    incidents: [],
    lineCounts: [11, 11],
    added: [2, 4],
    model: MATCH_MODEL_REVISION,
  };
}

describe('the full match record (→MATCH-13, MATCH-27)', () => {
  it('releases the full model to new and supported careers (T286)', () => {
    expect(MATCH_MODEL_RELEASE).toEqual({ revision: MATCH_MODEL_REVISION });
    // A world without model data names none until its writer load activates the release.
    expect(activeMatchModel({})).toBeUndefined();
    expect(validateFullMatchRecord(fullRecord())).toEqual([]);
    expect(() => assertFullMatchRecord(fullRecord())).not.toThrow();
  });

  it('preserves old optional record fields', () => {
    const full = fullRecord();
    const old: MatchRecord = { ...full };
    for (const key of ['model', 'incidents', 'lineCounts', 'added', 'xg', 'detail'] as const)
      delete old[key];
    old.players = full.players.map(({ id, metrics }) => ({ id, metrics }));
    const before = structuredClone(old);
    // The check names what an older record lacks; it never fills or repairs it.
    expect(validateFullMatchRecord(old)).toContain('model revision missing');
    expect(old).toEqual(before);
    // A rules upgrade carries older records as stored: no field gains a value or a placeholder.
    // A catalog pin move is a rules upgrade too: the records stay as stored.
    const world = {
      engine: CURRENT_ENGINE_VERSION,
      catalog: '2026-demo-2',
      revision: 4,
      ownMatches: [old],
    } as unknown as World;
    const upgraded = upgradeWorldRules(world, { catalog: '2026-demo-3', catalogHash: 'h' });
    expect(upgraded.engine).toBe(CURRENT_ENGINE_VERSION);
    expect(upgraded.ownMatches[0]).toBe(old);
    expect(Object.keys(upgraded.ownMatches[0]!).sort()).toEqual(Object.keys(before).sort());
    expect(upgraded.matchModel).toBeUndefined();
  });

  it('requires every full-model counter', () => {
    const missing = (edit: (r: FullMatchRecord) => void) => {
      const r = fullRecord();
      edit(r);
      return validateFullMatchRecord(r);
    };
    expect(missing((r) => delete (r as MatchRecord).model)).toEqual(['model revision missing']);
    expect(missing((r) => ((r as MatchRecord).model = 'continuous-aggregate-11' as never))).toEqual(
      ['unknown model revision continuous-aggregate-11'],
    );
    expect(missing((r) => delete (r as MatchRecord).incidents)).toEqual(['incident list missing']);
    expect(missing((r) => delete (r as MatchRecord).xg)).toEqual(['team xG missing']);
    expect(missing((r) => delete (r as MatchRecord).added)).toEqual(['added time missing']);
    expect(missing((r) => delete (r as MatchRecord).lineCounts)).toEqual(['line split missing']);
    expect(missing((r) => delete (r.players[4] as MatchRecord['players'][number]).detail)).toEqual([
      'h:2 advanced counters missing',
    ]);
    expect(missing((r) => r.detail[1].pop())).toHaveLength(1);
    expect(missing((r) => r.players[0]!.detail.pop())).toHaveLength(1);
    expect(missing((r) => (r.metrics[0][M.saves] = -1))).toHaveLength(1);
    expect(missing((r) => (r.detail[0][TD.crosses] = 0.5))).toHaveLength(1);
    const untracked: MatchRecord = fullRecord();
    delete untracked.incidents;
    expect(() => assertFullMatchRecord(untracked)).toThrow(/f:1/);
  });

  it('rejects impossible participation and contribution sums', () => {
    const issues = (edit: (r: FullMatchRecord) => void) => {
      const r = fullRecord();
      edit(r);
      return validateFullMatchRecord(r);
    };
    // A player credited with a goal the side never scored.
    expect(issues((r) => (r.players[12]!.metrics[M.goals] = 1)).join()).toMatch(/goals/);
    // More minutes than eleven players can play.
    expect(
      issues((r) => {
        const sub = { ...structuredClone(r.players[21]!), id: 'a:sub' };
        sub.metrics[M.minutes] = 30;
        r.players.push(sub);
        r.lineCounts = [11, 12];
        r.incidents = [{ minute: 60, side: 1, kind: 'sub', player: 'a:10', other: 'a:sub' }];
      }).join(),
    ).toMatch(/minutes 1020 > 990/);
    // A line that never played, and a player on both sides.
    expect(issues((r) => (r.players[5]!.metrics[M.minutes] = 0)).join()).toMatch(/minutes 0/);
    expect(issues((r) => (r.players[20]!.id = 'h:0')).join()).toMatch(/two lines/);
    // Key passes beyond shots, completions beyond attempts, assists beyond key passes.
    expect(issues((r) => (r.detail[0][TD.keyPasses] = 3)).length).toBeGreaterThan(0);
    expect(issues((r) => (r.players[1]!.metrics[M.completed] = 9)).length).toBeGreaterThan(0);
    expect(issues((r) => (r.metrics[1][M.assists] = 1)).length).toBeGreaterThan(0);
    // Player xG that does not add up to the side's.
    expect(issues((r) => (r.players[0]!.detail[PD.xg] = 90)).join()).toMatch(/player xG/);
    // Incidents name participants, follow the timeline and agree with the card counters.
    expect(
      issues(
        (r) => (r.incidents = [{ minute: 30, side: 0, kind: 'yellow', player: 'a:3' }]),
      ).join(),
    ).toMatch(/outside side 0/);
    expect(
      issues(
        (r) => (r.incidents = [{ minute: 30, side: 0, kind: 'yellow', player: 'h:3' }]),
      ).join(),
    ).toMatch(/yellow cards disagree/);
    expect(
      issues((r) => {
        r.incidents = [
          { minute: 20, side: 0, kind: 'red', player: 'h:3' },
          { minute: 50, side: 0, kind: 'injury', player: 'h:3' },
        ];
        r.detail[0][TD.redCards] = 1;
        r.players[5]!.detail[PD.redCards] = 1;
        r.players[5]!.metrics[M.minutes] = 19;
      }).join(),
    ).toMatch(/injury at 50 names h:3 off the pitch/);
    // Extra time without four added periods; a level shoot-out.
    expect(issues((r) => (r.regulation = { home: 1, away: 0 })).join()).toMatch(/added-time/);
    expect(issues((r) => (r.shootout = { home: 3, away: 3 })).join()).toMatch(/shoot-out/);
    // The counters the world schema bounds: final-third and build-up passes within passes,
    // progressive passes within completions, one shot's xG at most 0.80.
    expect(issues((r) => (r.detail[1][TD.finalThirdPasses] = 6)).join()).toMatch(/final-third/);
    expect(issues((r) => (r.detail[1][TD.buildUpPasses] = 6)).join()).toMatch(/build-up/);
    expect(issues((r) => (r.detail[1][TD.progressivePasses] = 5)).join()).toMatch(/progressive/);
    expect(issues((r) => (r.players[1]!.detail[PD.xa] = 81)).join()).toMatch(/xA/);
  });

  it('ties every line to the substitution and dismissal timeline', () => {
    /** The home starter h:0 replaced by h:sub at `minute`, credited the given minutes. */
    const swap = (minute: number, starter: number, substitute: number, other = 'h:sub') => {
      const r = fullRecord();
      const sub = { ...structuredClone(r.players[2]!), id: 'h:sub' };
      sub.metrics[M.minutes] = substitute;
      r.players[2]!.metrics[M.minutes] = starter;
      r.players.splice(11, 0, sub);
      r.lineCounts = [12, 11];
      r.incidents = [{ minute, side: 0, kind: 'sub', player: 'h:0', other }];
      return validateFullMatchRecord(r);
    };
    // Off a minute before the 61st-minute stamp: 60 and 30 minutes.
    expect(swap(61, 60, 30)).toEqual([]);
    // A starter replaced at 30′ credited 90; a substitute entering at 80′ credited 60.
    expect(swap(31, 90, 60).join()).toMatch(/h:0 minutes 90 for 0′–30′/);
    expect(swap(81, 80, 60).join()).toMatch(/h:sub minutes 60 for 80′–90′/);
    // The incoming player is a starter already on the pitch.
    expect(swap(61, 60, 30, 'h:1').join()).toMatch(/h:1 comes on at 61 as a starter/);
    // A twelfth line without a substitution.
    const extra = fullRecord();
    extra.players.splice(11, 0, { ...structuredClone(extra.players[2]!), id: 'h:extra' });
    extra.lineCounts = [12, 11];
    expect(validateFullMatchRecord(extra).join()).toMatch(/12 lines for 0 substitutions/);
    // A player sent off cannot be replaced afterwards, and his minutes stop at the card.
    const off = fullRecord();
    off.incidents = [{ minute: 41, side: 1, kind: 'red', player: 'a:4' }];
    off.detail[1][TD.redCards] = 1;
    off.players[15]!.detail[PD.redCards] = 1;
    off.players[15]!.metrics[M.minutes] = 40;
    expect(validateFullMatchRecord(off)).toEqual([]);
    off.players[15]!.metrics[M.minutes] = 90;
    expect(validateFullMatchRecord(off).join()).toMatch(/a:4 minutes 90 for 0′–40′/);
  });
});

describe('prospective activation (→SAVE-23, HIST-17)', () => {
  const founding = { country: 'ENG' as const, seed: 'match-model' };
  it('records the model from the takeover', () => {
    const founded = careerWorld({ seed: founding.seed });
    const boundary = trackingBoundary(founded);
    expect(founded.matchModel).toEqual({
      revision: MATCH_MODEL_REVISION,
      activated: { year: founded.year, day: currentDay(founded), revision: founded.revision },
      trackedFrom: boundary,
      coverage: 'founding',
    });
    expect(founded.npcSeason).toEqual({
      year: founded.year,
      model: MATCH_MODEL_REVISION,
      trackedFrom: boundary,
      competitions: [],
    });
    // The switch as released and an enabled release take over the same career.
    expect(canonical(careerWorld({ seed: founding.seed }, ENABLED_RELEASE))).toBe(
      canonical(founded),
    );
  });

  it('activateMatchModel leaves a modelled world and earlier rules untouched', () => {
    const untouched = (w: World) => {
      const before = canonical(w);
      expect(activateMatchModel(w, ENABLED_RELEASE)).toBe(false);
      expect(canonical(w)).toBe(before);
    };
    const w = structuredClone(simulatedWorld(founding, { rounds: 2 }));
    // A recorded model is the career's model: never moved to a later boundary.
    w.round++;
    untouched(w);
    // Any model data counts, a single full record included.
    const recorded = structuredClone(w);
    delete recorded.matchModel;
    delete recorded.npcSeason;
    untouched(recorded);
    const earlier = structuredClone(recorded);
    for (const m of earlier.ownMatches) delete m.model;
    earlier.engine = '3.0.0';
    untouched(earlier);
  });
});

describe('a career on an earlier revision (→SAVE-23)', () => {
  const founding = { country: 'ENG' as const, seed: 'match-model-3' };
  /** A career two rounds in, saved by the game before this one: only its labels are read. */
  const onRevision10 = () =>
    onPreviousRevision(structuredClone(simulatedWorld(founding, { rounds: 2 })));

  it('moves to the scripted model at the safe boundary and replays nothing', () => {
    const career = onRevision10();
    const before = structuredClone(career);
    expect(before.ownMatches.length).toBeGreaterThan(0);
    expect(activateMatchModel(career, MATCH_MODEL_RELEASE)).toBe(true);
    const expected = structuredClone(before);
    expected.matchModel!.revision = MATCH_MODEL_REVISION;
    expected.npcSeason!.model = MATCH_MODEL_REVISION;
    expect(canonical(career)).toBe(canonical(expected));
    // Once there it stays, and an earlier release never moves it back.
    expect(activateMatchModel(career, { revision: PREVIOUS_REVISION })).toBe(false);
    for (let n = 0; n < 2; n++) advanceRound(career, undefined, false);
    // Archived records are what a replay draws (→WEB-23): every settled one is as it was.
    expect(canonical(career.ownMatches.slice(0, before.ownMatches.length))).toBe(
      canonical(before.ownMatches),
    );
    const added = career.ownMatches.slice(before.ownMatches.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((m) => m.model === MATCH_MODEL_REVISION && m.material)).toBe(true);
  });
});

describe("a club nobody owns plays with its manager's context (→MATCH-2)", () => {
  const w = careerWorld({ seed: 'match-model-3' });
  const ability = (club: string) => clubManager(w, findClub(w, club)).ability;
  const nobodys = w.fixtures.filter(
    (f) =>
      f.home !== w.playerClub && f.away !== w.playerClub && ability(f.home) !== ability(f.away),
  );

  it('adds (ability − 50)/4 for each side, its morale at the neutral 60', () => {
    expect(nobodys.length).toBeGreaterThan(0);
    for (const f of nobodys.slice(0, 5)) {
      const p = prepareMatch(w, f, PORTABLE_MATH),
        form = matchForm(w, f);
      const rating = [
        ratingOf(w, findClub(w, f.home), p.squads[0]),
        ratingOf(w, findClub(w, f.away), p.squads[1]),
      ];
      const manager = [(ability(f.home) - 50) / 4, (ability(f.away) - 50) / 4];
      // The gap before diminishing returns, from what each side brings beyond its XI.
      const gap =
        effectiveGap(rating[0]! + 3 + manager[0]! - rating[1]! - manager[1]!) + form[0] - form[1];
      const sum = rating[0]! + rating[1]! + 3 + manager[0]! + manager[1]! + form[0] + form[1];
      expect(p.strength[0]! - p.strength[1]!).toBeCloseTo(gap, 9);
      expect(p.strength[0]! + p.strength[1]!).toBeCloseTo(sum, 9);
    }
    // The manager who plays is the one the market shows, derived without a stored draw: reading
    // him leaves the world, its market and every stream as they were (→STAFF-17).
    const fresh = careerWorld({ seed: 'match-model-3' });
    const untouched = canonical(fresh);
    for (const f of nobodys.slice(0, 5)) prepareMatch(fresh, f, PORTABLE_MATH);
    expect(canonical(fresh)).toBe(untouched);
  });
});
