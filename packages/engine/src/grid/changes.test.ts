import { describe, expect, it } from 'vitest';
import type { Manager, Tactic } from '../../../contracts/src/types';
import { injuryChance } from '../careers';
import { DISABLED_RELEASE } from '../../../../tests/fixtures/releases';
import { createWorld } from '../index';
import { lineOf } from '../player';
import { random } from '../primitives';
import { injuryHazard, planChanges, subPolicyFor, type Change } from './changes';
import { playGrid } from './engine';
import { M } from './record';
import { buildGridSetup, type GridSetup } from './setup';
import { createState, slotOf, type GridState } from './state';

// The pre-feature path's substitution mechanics, as the other grid files pin them (T417).
const w = createWorld(
  {
    country: 'ENG',
    name: 'Grid Changes Lab',
    color: '#2a5d8f',
    seed: 'grid-changes',
    level: 'normal',
  },
  DISABLED_RELEASE,
);
const [home, away] = w.clubs.filter(
  (c) => c.country === 'ENG' && c.tier === 0 && c.id !== w.playerClub,
);
const fixture = (id: string, year: number) => ({
  ...w.fixtures[0]!,
  id,
  year,
  home: home!.id,
  away: away!.id,
});
const setupAt = (id: string, year: number, tactics: [Tactic, Tactic] = ['balanced', 'balanced']) =>
  buildGridSetup(w, fixture(id, year), { observe: false, recordPlayers: true, tactics });
const play = (id: string, year: number, edit?: (setup: GridSetup) => void) => {
  const setup = setupAt(id, year);
  edit?.(setup);
  return playGrid(setup).record;
};
const manager = (patch: Partial<Manager>): Manager => ({ ...w.manager, interim: false, ...patch });

/** A fresh 2010 state at `minute` (45 exactly is half-time), with every player's pre-match fatigue set. */
function stateAt(
  minute: number,
  opts: { fatigue?: number; score?: [number, number]; policy?: Partial<Manager> } = {},
): GridState {
  const setup = setupAt(`state-${minute}`, 2010);
  if (opts.policy) setup.managers[0] = subPolicyFor(manager(opts.policy));
  const s = createState(setup);
  for (const side of s.players)
    for (const gp of side) gp.player = { ...gp.player, fatigue: opts.fatigue ?? 10 };
  s.period = minute < 45 ? 1 : 2;
  s.t = minute < 45 ? minute * 60 : (minute - 45) * 60;
  s.elapsed = minute * 60;
  s.score = opts.score ?? [0, 0];
  return s;
}
const plan = (s: GridState, side: 0 | 1 = 0): Change[] => planChanges(s, side, random('plan'));
const reasons = (changes: Change[]) => changes.map((c) => c.reason);
const lineIn = (s: GridState, c: Change) => lineOf(s.players[0][c.in]!.player.position);
const lineOut = (s: GridState, c: Change) => lineOf(slotOf(s, s.players[0][c.out]!).position);

describe('grid substitutions and injuries', () => {
  it('injures about 1.8% of players a match and more late and under press', () => {
    const s = stateAt(0);
    const gp = s.players[0][5]!;
    gp.player = { ...gp.player, fatigue: 10, attrs: { ...gp.player.attrs, stamina: 70 } };
    // The hazard over a whole match adds up to the →CLUB-23 chance.
    let sum = 0;
    for (let t = 0; t < 5400; t += 6) {
      s.period = t < 2700 ? 1 : 2;
      s.t = t < 2700 ? t : t - 2700;
      sum += injuryHazard(s, gp, 6);
    }
    expect(injuryChance(gp.player, false)).toBeCloseTo(0.018, 6);
    expect(sum).toBeCloseTo(0.018, 3);
    const at = (minute: number, pressing = false) => {
      const late = stateAt(minute);
      late.setup.pressing = [pressing, pressing];
      return injuryHazard(late, { ...late.players[0][5]!, player: gp.player }, 6);
    };
    expect(at(80)).toBeGreaterThan(at(10) * 1.5);
    expect(at(30, true)).toBeCloseTo(at(30) * 1.15, 9);
    // In play, players are hurt at about that rate.
    let hurt = 0;
    const n = 100;
    for (let i = 0; i < n; i++)
      hurt += (play(`hurt-${i}`, 2010).incidents ?? []).filter((x) => x.kind === 'injury').length;
    expect(hurt / (22 * n)).toBeGreaterThan(0.01);
    expect(hurt / (22 * n)).toBeLessThan(0.03);
  });

  it('uses no substitutes before 1965 and plays short after an injury', () => {
    let short = 0;
    for (let i = 0; i < 40; i++) {
      const record = play(`short-${i}`, 1950);
      expect(record.incidents?.some((x) => x.kind === 'sub') ?? false).toBe(false);
      expect(record.lineCounts).toEqual([11, 11]);
      for (const x of record.incidents ?? [])
        if (x.kind === 'injury') {
          short++;
          const line = record.players.find((p) => p.id === x.player)!;
          expect(line.metrics[M.minutes]).toBeLessThanOrEqual(x.minute);
        }
    }
    expect(short).toBeGreaterThan(0);
  });

  it('allows only injury substitutes in 1965', () => {
    let subs = 0;
    for (let i = 0; i < 60; i++) {
      const incidents = play(`y1965-${i}`, 1965).incidents ?? [];
      for (const side of [0, 1] as const) {
        const own = incidents.filter((x) => x.side === side);
        const changes = own.filter((x) => x.kind === 'sub');
        expect(changes.length).toBeLessThanOrEqual(1);
        for (const c of changes)
          expect(own.some((x) => x.kind === 'injury' && x.player === c.player)).toBe(true);
        subs += changes.length;
      }
    }
    expect(subs).toBeGreaterThan(0);
  });

  it('uses at most three windows from 2022', () => {
    let full = 0;
    for (let i = 0; i < 20; i++) {
      const record = play(`windows-${i}`, 2023);
      for (const side of [0, 1] as const) {
        const subs = (record.incidents ?? []).filter((x) => x.side === side && x.kind === 'sub');
        expect(subs.length).toBeLessThanOrEqual(5);
        // Half-time changes are stamped 46′ and use no window.
        const windows = new Set(
          subs.filter((x) => x.minute !== 46).map((x) => `${x.minute}+${x.added ?? 0}`),
        );
        expect(windows.size).toBeLessThanOrEqual(3);
        if (subs.length === 5) full++;
      }
    }
    expect(full).toBeGreaterThan(0);
  });

  it('lets a gegenpress manager change tired pressers from the 55th minute', () => {
    expect(subPolicyFor(manager({ style: 'gegenpress' }))).toMatchObject({
      fatigueFrom: 55,
      earlyPress: true,
    });
    expect(subPolicyFor(manager({ trait: 'rotation' })).earlyPress).toBe(true);
    expect(subPolicyFor(manager({ style: 'gegenpress', interim: true })).earlyPress).toBe(false);
    const press = { fatigue: 40, policy: { style: 'gegenpress' as const } };
    expect(plan(stateAt(54, press))).toEqual([]);
    expect(reasons(plan(stateAt(56, press)))).toEqual(['policy']);
    expect(plan(stateAt(56, { fatigue: 40 }))).toEqual([]);
    expect(reasons(plan(stateAt(61, { fatigue: 40 })))).toEqual(['policy']);
    // At half-time only the early presser changes his tired players.
    expect(reasons(plan(stateAt(45, { ...press, fatigue: 60 })))).toContain('policy');
    expect(plan(stateAt(45, { fatigue: 60 }))).toEqual([]);
  });

  it('protects a lead late under a counter or organiser manager', () => {
    for (const style of ['counter', 'organizer'] as const) {
      expect(reasons(plan(stateAt(74, { score: [1, 0], policy: { style } })))).not.toContain(
        'protect',
      );
      const s = stateAt(76, { score: [1, 0], policy: { style } });
      const change = plan(s).find((c) => c.reason === 'protect')!;
      expect(lineOut(s, change)).toBe('FW');
      expect(['DF', 'MF']).toContain(lineIn(s, change));
      expect(reasons(plan(stateAt(76, { score: [1, 1], policy: { style } })))).not.toContain(
        'protect',
      );
    }
    expect(reasons(plan(stateAt(76, { score: [1, 0] })))).not.toContain('protect');
  });

  it('chases a deficit under a firefighter', () => {
    for (const style of ['firefighter', 'motivator'] as const) {
      const s = stateAt(45, { score: [0, 1], policy: { style } });
      const [change] = plan(s);
      expect(change!.reason).toBe('chase');
      expect(lineIn(s, change!)).toBe('FW');
      expect(['DF', 'MF']).toContain(lineOut(s, change!));
      expect(reasons(plan(stateAt(45, { score: [1, 1], policy: { style } })))).toEqual([]);
    }
    expect(plan(stateAt(45, { score: [0, 1] }))).toEqual([]);
    expect(reasons(plan(stateAt(55, { score: [0, 1] })))).toEqual([]);
  });

  it('gives minutes to a young player under a developer', () => {
    const young = (s: GridState) => {
      const gp = s.players[0][s.players[0].length - 1]!;
      gp.player = { ...gp.player, born: s.setup.f.year - 19 };
      return gp.idx;
    };
    const s = stateAt(81, { policy: { style: 'developer' } });
    const idx = young(s);
    const change = plan(s).find((c) => c.reason === 'youth')!;
    expect(change.in).toBe(idx);
    const early = stateAt(79, { policy: { style: 'developer' } });
    young(early);
    expect(reasons(plan(early))).not.toContain('youth');
    const behind = stateAt(81, { score: [0, 1], policy: { style: 'developer' } });
    young(behind);
    expect(reasons(plan(behind))).not.toContain('youth');
  });

  it('delays changes by ten minutes with the stable trait', () => {
    expect(subPolicyFor(manager({ trait: 'stable' })).delay).toBe(10);
    const stable = { fatigue: 40, policy: { trait: 'stable' as const } };
    expect(reasons(plan(stateAt(61, { fatigue: 40 })))).toEqual(['policy']);
    expect(plan(stateAt(61, stable))).toEqual([]);
    expect(plan(stateAt(69, stable))).toEqual([]);
    expect(reasons(plan(stateAt(71, stable)))).toEqual(['policy']);
  });

  it('rebalances after a red card', () => {
    const sendOff = (s: GridState) => {
      const back = s.players[0].find(
        (gp) => gp.slot > 0 && lineOf(slotOf(s, gp).position) === 'DF',
      )!;
      back.sentOff = true;
      back.onPitch = false;
      s.changes[0].reds = 1;
      return back.slot;
    };
    const s = stateAt(30);
    const slot = sendOff(s);
    const [change] = plan(s);
    expect(change).toMatchObject({ reason: 'rebalance', slot });
    expect(lineOut(s, change!)).toBe('FW');
    expect(['DF', 'MF']).toContain(lineIn(s, change!));
    const behind = stateAt(30, { score: [0, 1] });
    sendOff(behind);
    expect(plan(behind)).toEqual([]);
  });

  it('credits substitutes with their minutes', () => {
    let seen = 0;
    for (let i = 0; i < 20; i++) {
      const record = play(`minutes-${i}`, 2010);
      const counts = record.lineCounts!;
      expect(record.players).toHaveLength(counts[0] + counts[1]);
      for (const side of [0, 1] as const) {
        const subs = (record.incidents ?? []).filter((x) => x.side === side && x.kind === 'sub');
        expect(counts[side]).toBe(11 + subs.length);
        const lines = record.players.slice(side * counts[0], side * counts[0] + counts[side]);
        // Substitutes follow the starters in the order they came on.
        expect(lines.slice(11).map((p) => p.id)).toEqual(subs.map((x) => x.other));
        // Each player's regulation minutes run from his entry to his exit, both about a minute before the stamp.
        const own = (record.incidents ?? []).filter((x) => x.side === side);
        const entry = (id: string) => {
          const x = own.find((y) => y.kind === 'sub' && y.other === id);
          return x ? x.minute - 1 : 0;
        };
        const exit = (id: string) => {
          const x = own.find((y) => y.kind !== 'yellow' && y.player === id);
          return x ? x.minute - 1 : 90;
        };
        for (const line of lines) {
          expect(line.metrics[M.minutes]).toBeGreaterThan(0);
          expect(
            Math.abs(line.metrics[M.minutes]! - (exit(line.id) - entry(line.id))),
          ).toBeLessThanOrEqual(2);
        }
        seen += subs.length;
        expect(record.metrics[side]![M.minutes]).toBe(90);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });
});
