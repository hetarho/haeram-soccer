import { describe, expect, it } from 'vitest';
import { emptyPlayerDetail, emptyTeamDetail, PD, TD } from '../../contracts/src/detail';
import {
  activeMatchModel,
  MATCH_MODEL_REVISION,
  type FullMatchRecord,
} from '../../contracts/src/match-model';
import type { MatchRecord, World } from '../../contracts/src/types';
import { upgradeWorldRules } from '../../contracts/src/versions';
import { M } from './grid/record';
import { assertFullMatchRecord, MATCH_MODEL_RELEASE, validateFullMatchRecord } from './match-model';
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
  it('keeps production activation off and plays the pre-feature model without metadata', () => {
    expect(MATCH_MODEL_RELEASE).toEqual({ revision: MATCH_MODEL_REVISION, enabled: false });
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
    expect(missing((r) => ((r as MatchRecord).model = 'continuous-aggregate-2' as never))).toEqual([
      'unknown model revision continuous-aggregate-2',
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
      }).join(),
    ).toMatch(/after leaving/);
    // Extra time without four added periods; a level shoot-out.
    expect(issues((r) => (r.regulation = { home: 1, away: 0 })).join()).toMatch(/added-time/);
    expect(issues((r) => (r.shootout = { home: 3, away: 3 })).join()).toMatch(/shoot-out/);
  });
});
