import { describe, expect, it } from 'vitest';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../contracts/src/detail';
import {
  activeMatchModel,
  MATCH_MODEL_REVISION,
  MATCH_MODEL_REVISIONS,
  type FullMatchRecord,
} from '../../contracts/src/match-model';
import { canonical } from '../../contracts/src/index';
import type { MatchRecord, World } from '../../contracts/src/types';
import { upgradeWorldRules } from '../../contracts/src/versions';
import {
  declaredRelease,
  DISABLED_RELEASE,
  ENABLED_RELEASE,
} from '../../../tests/fixtures/releases';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { currentDay } from './calendar';
import { M } from './grid/record';
import { advanceRound, createWorld } from './index';
import {
  activateMatchModel,
  assertFullMatchRecord,
  MATCH_MODEL_RELEASE,
  validateFullMatchRecord,
  type MatchModelRelease,
} from './match-model';
import { trackingBoundary } from './npc-stats';
import { zeroMetrics } from './primitives';

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
    // The switch as the source declares it, which the release-on probe keeps before setting it.
    expect(declaredRelease()).toEqual({ revision: MATCH_MODEL_REVISION, enabled: true });
    expect(MATCH_MODEL_RELEASE).toEqual({ revision: MATCH_MODEL_REVISION, enabled: true });
    // A world without model data still plays the pre-feature model, with no metadata.
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
    const world = {
      engine: '4.0.0',
      catalog: '2026-demo-2',
      revision: 4,
      ownMatches: [old],
    } as unknown as World;
    const upgraded = upgradeWorldRules(world, { catalog: '2026-demo-3', catalogHash: 'h' });
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
    expect(missing((r) => ((r as MatchRecord).model = 'continuous-aggregate-3' as never))).toEqual([
      'unknown model revision continuous-aggregate-3',
    ]);
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
  const founding = {
    country: 'ENG' as const,
    name: 'Model Athletic',
    color: '#224466',
    seed: 'match-model',
    level: 'normal' as const,
  };
  it('records the model from founding or from the next unplayed day', () => {
    // Careers founded before the release, then activated by it.
    const founded = simulatedWorld(founding, {}, DISABLED_RELEASE);
    const boundary = trackingBoundary(founded);
    expect(activateMatchModel(founded, ENABLED_RELEASE)).toBe(true);
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
    // Founding with the switch on is the same career recorded from its first day, and a founding
    // now takes the switch as released.
    expect(canonical(createWorld(founding, ENABLED_RELEASE))).toBe(canonical(founded));
    expect(canonical(createWorld(founding))).toBe(canonical(founded));
    expect(createWorld(founding, DISABLED_RELEASE).matchModel).toBeUndefined();
    // Mid-season only the model and its empty ledger are added; every settled fact stays.
    const played = simulatedWorld(founding, { rounds: 2 }, DISABLED_RELEASE);
    const before = structuredClone(played);
    expect(activateMatchModel(played, ENABLED_RELEASE)).toBe(true);
    expect(played.matchModel).toMatchObject({
      trackedFrom: trackingBoundary(before),
      coverage: 'activation',
    });
    expect(played.npcSeason!.competitions).toEqual([]);
    const { matchModel: _model, npcSeason: _season, ...rest } = played;
    void _model;
    void _season;
    expect(canonical(rest)).toBe(canonical(before));
    expect(played.ownMatches.length).toBeGreaterThan(0);
    expect(played.ownMatches.every((m) => m.model === undefined)).toBe(true);
  });

  it('activateMatchModel leaves a disabled release, a modelled world and earlier rules untouched', () => {
    const untouched = (w: World, release = ENABLED_RELEASE) => {
      const before = canonical(w);
      expect(activateMatchModel(w, release)).toBe(false);
      expect(canonical(w)).toBe(before);
    };
    const w = simulatedWorld(founding, { rounds: 2 }, DISABLED_RELEASE);
    untouched(w, DISABLED_RELEASE);
    expect(w.matchModel).toBeUndefined();
    // A recorded model is the career's model: never moved to a later boundary.
    const modelled = structuredClone(w);
    activateMatchModel(modelled, ENABLED_RELEASE);
    modelled.round++;
    untouched(modelled);
    // Any model data counts, a single full record included.
    const recorded = structuredClone(w);
    recorded.ownMatches.at(-1)!.model = MATCH_MODEL_REVISION;
    untouched(recorded);
    const earlier = structuredClone(w);
    earlier.engine = '3.0.0';
    untouched(earlier);
  });
});

describe('match-model revision 2 (→SAVE-23, T435)', () => {
  const founding = {
    country: 'ENG' as const,
    name: 'Revision Athletic',
    color: '#224466',
    seed: 'match-model-2',
    level: 'normal' as const,
  };
  const [first, second] = MATCH_MODEL_REVISIONS;
  const REVISION_1: MatchModelRelease = { revision: first, enabled: true };
  /** A career two rounds into revision 1, as one released before T435 saved it. */
  const onRevision1 = () => structuredClone(simulatedWorld(founding, { rounds: 2 }, REVISION_1));
  const withoutModel = ({ matchModel: _m, npcSeason: _s, ...rest }: World) => (
    void _m,
    void _s,
    rest
  );
  const counted = (w: World) =>
    w.npcSeason!.competitions.reduce(
      (n, c) => n + c.clubs.reduce((sum, club) => sum + club.matches, 0),
      0,
    );

  it('a revision-1 world moves to revision 2 at the safe boundary', () => {
    const w = onRevision1();
    expect(w.matchModel!.revision).toBe(first);
    expect(w.npcSeason!.model).toBe(first);
    const before = structuredClone(w);
    expect(activateMatchModel(w, ENABLED_RELEASE)).toBe(true);
    // Only the revision moves: its activation, tracking boundary and coverage stay.
    expect(w.matchModel).toEqual({ ...before.matchModel!, revision: second });
    expect(w.npcSeason).toEqual({ ...before.npcSeason!, model: second });
    expect(canonical(withoutModel(w))).toBe(canonical(withoutModel(before)));
    // Once there it stays, and an earlier release never moves it back.
    const upgraded = canonical(w);
    expect(activateMatchModel(w, ENABLED_RELEASE)).toBe(false);
    expect(activateMatchModel(w, REVISION_1)).toBe(false);
    expect(canonical(w)).toBe(upgraded);
  });

  it('settled matches keep and replay under revision 1', () => {
    const w = onRevision1();
    const settled = structuredClone(w.ownMatches);
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((m) => m.model === first)).toBe(true);
    activateMatchModel(w, ENABLED_RELEASE);
    const before = counted(w);
    for (let n = 0; n < 2; n++) advanceRound(w, undefined, false);
    // Archived records are what a replay draws (→WEB-32): every settled one is as it was.
    expect(canonical(w.ownMatches.slice(0, settled.length))).toBe(canonical(settled));
    const added = w.ownMatches.slice(settled.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((m) => m.model === second)).toBe(true);
    // The season's aggregates go on counting the results revision 2 settles.
    expect(counted(w)).toBeGreaterThan(before);
  });

  it("revision 2's own matches play T432's freedom, revision 1 keeps its football", () => {
    const kept = onRevision1(),
      upgraded = onRevision1();
    const settled = kept.ownMatches.length;
    activateMatchModel(upgraded, ENABLED_RELEASE);
    for (const w of [kept, upgraded]) for (let n = 0; n < 2; n++) advanceRound(w, undefined, false);
    // T432 moves revision 2's players (until then both revisions played the same football).
    const own = (w: World) =>
      canonical(w.ownMatches.slice(settled).map(({ model: _model, ...m }) => (void _model, m)));
    expect(own(upgraded)).not.toBe(own(kept));
    expect(upgraded.ownMatches.at(-1)!.model).toBe(second);
    expect(kept.ownMatches.at(-1)!.model).toBe(first);
  });
});
