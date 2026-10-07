import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import {
  advanceRound,
  createWorld,
  operate,
  quote,
  tacticRequestOutlook,
  TACTICS,
  yearlyStaff,
} from './index';

function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Dialogue United',
    color: '#125544',
    seed: 'dialogue-boundaries',
    difficulty: 2,
  });
  w.cash = '999999999';
  w.manager.philosophy = 'balanced';
  w.manager.pride = 0;
  w.tactic = 'balanced';
  return w;
}

describe('bounded manager negotiations', () => {
  it('allows different accepted requests but grants positive trust only once per round', () => {
    const w = world();
    w.manager.flexibility = 100;
    w.manager.trust = 80;
    for (const tactic of TACTICS)
      for (const tone of ['respect', 'evidence', 'support']) {
        operate(w, { type: 'tactics', tactic, tone });
        expect(w.tactic).toBe(tactic);
        expect(w.manager.trust).toBe(82);
      }
    expect(w.manager.requestHistory?.keys).toHaveLength(12);
    expect(w.manager.requestHistory?.trustAwarded).toBe(true);
    const before = canonical(w);
    expect(() => operate(w, { type: 'tactics', tactic: 'balanced', tone: 'respect' })).toThrow(
      '동일',
    );
    expect(canonical(w)).toBe(before);
  });

  it('keeps the first accepted response and seeded score behavior unchanged', () => {
    const w = world();
    w.manager.flexibility = 55;
    w.manager.trust = 60;
    const before = canonical(w);
    expect(tacticRequestOutlook(w, 'balanced', 'evidence')).toEqual({
      label: '수락',
      min: 67.75,
      max: 79.75,
      trustRisk: 0,
      alreadyAnswered: false,
    });
    expect(canonical(w)).toBe(before);
    operate(w, { type: 'tactics', tactic: 'balanced', tone: 'evidence' });
    expect(w.manager.trust).toBe(62);
    expect(w.events.at(-1)?.detail).toContain('수락했습니다');
    expect(w.tactic).toBe('balanced');
    expect(tacticRequestOutlook(w, 'balanced', 'evidence').alreadyAnswered).toBe(true);
  });

  it('shares the positive-trust limit between an acceptance and later paid support', () => {
    const w = world();
    w.manager.flexibility = 55;
    w.manager.trust = 60;
    operate(w, { type: 'tactics', tactic: 'balanced', tone: 'evidence' });
    operate(w, { type: 'tactics', tactic: 'press', tone: 'support' });
    expect(w.manager.pending).toBe('press');
    const before = BigInt(w.cash),
      cost = BigInt(quote('ENG', w.year, 30));
    operate(w, { type: 'accept-condition' });
    expect(w.tactic).toBe('press');
    expect(w.manager.trust).toBe(62);
    expect(BigInt(w.cash)).toBe(before - cost);
    expect(w.manager.pending).toBeUndefined();
    expect(() => operate(w, { type: 'accept-condition' })).toThrow('조건');
    expect(BigInt(w.cash)).toBe(before - cost);
  });

  it('shares the same limit when paid support happens before an accepted request', () => {
    const w = world();
    w.manager.flexibility = 55;
    w.manager.trust = 55;
    operate(w, { type: 'tactics', tactic: 'press', tone: 'support' });
    expect(w.manager.pending).toBe('press');
    operate(w, { type: 'accept-condition' });
    expect(w.manager.trust).toBe(58);
    operate(w, { type: 'tactics', tactic: 'balanced', tone: 'evidence' });
    expect(w.tactic).toBe('balanced');
    expect(w.manager.trust).toBe(58);
  });

  it('still charges repeated conditional agreements without repeated positive trust', () => {
    const w = world();
    w.manager.flexibility = 0;
    w.manager.trust = 50;
    const before = BigInt(w.cash),
      cost = BigInt(quote('ENG', w.year, 30));
    for (const tone of ['respect', 'support']) {
      operate(w, { type: 'tactics', tactic: 'balanced', tone });
      expect(w.manager.pending).toBe('balanced');
      operate(w, { type: 'accept-condition' });
      expect(w.manager.trust).toBe(53);
    }
    expect(BigInt(w.cash)).toBe(before - cost * 2n);
    expect(w.manager.requestHistory?.keys).toEqual(['balanced:respect', 'balanced:support']);
  });

  it('does not consume an award or lose a pending condition when payment fails', () => {
    const w = world();
    w.manager.flexibility = 0;
    w.manager.trust = 50;
    operate(w, { type: 'tactics', tactic: 'balanced', tone: 'respect' });
    w.cash = '0';
    const before = canonical(w);
    expect(() => operate(w, { type: 'accept-condition' })).toThrow('부족');
    expect(canonical(w)).toBe(before);
    expect(w.manager.requestHistory?.trustAwarded).toBe(false);
  });

  it('preserves answered combinations and the award limit across an actual save round-trip', async () => {
    const w = world();
    w.manager.flexibility = 100;
    w.manager.trust = 80;
    operate(w, { type: 'tactics', tactic: 'press', tone: 'respect' });
    operate(w, { type: 'tactics', tactic: 'balanced', tone: 'evidence' });
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(restored.manager.requestHistory).toEqual(w.manager.requestHistory);
    expect(tacticRequestOutlook(restored, 'press', 'respect').alreadyAnswered).toBe(true);
    expect(() => operate(restored, { type: 'tactics', tactic: 'press', tone: 'respect' })).toThrow(
      '동일',
    );
    operate(restored, { type: 'tactics', tactic: 'counter', tone: 'support' });
    expect(restored.manager.trust).toBe(82);
  });

  it('opens fresh replies and one new award after the next real round', () => {
    const w = world();
    w.manager.flexibility = 100;
    w.manager.trust = 80;
    operate(w, { type: 'tactics', tactic: 'balanced', tone: 'respect' });
    advanceRound(w, undefined, false);
    const before = canonical(w);
    expect(tacticRequestOutlook(w, 'balanced', 'respect').alreadyAnswered).toBe(false);
    expect(canonical(w)).toBe(before);
    operate(w, { type: 'tactics', tactic: 'balanced', tone: 'respect' });
    expect(w.manager.trust).toBe(84);
    expect(w.manager.requestHistory).toEqual({
      at: '1901:1',
      keys: ['balanced:respect'],
      trustAwarded: true,
    });
    validateWorld(w);
  });

  it('starts old saves without history and clears annual reply state', async () => {
    const w = world();
    w.manager.flexibility = 100;
    w.manager.trust = 80;
    w.manager.lastRequest = 'balanced:respect';
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(restored.manager.requestHistory).toBeUndefined();
    operate(restored, { type: 'tactics', tactic: 'balanced', tone: 'respect' });
    expect(restored.manager.trust).toBe(82);
    restored.year++;
    yearlyStaff(restored);
    expect(restored.manager.requestHistory).toBeUndefined();
    expect(tacticRequestOutlook(restored, 'balanced', 'respect').alreadyAnswered).toBe(false);
  });

  it('preserves strong-demand losses, conflicts and proud-manager resignation', () => {
    const w = world();
    w.manager.flexibility = 0;
    w.manager.trust = 60;
    expect(tacticRequestOutlook(w, 'press', 'demand').trustRisk).toBe(18);
    operate(w, { type: 'tactics', tactic: 'press', tone: 'demand' });
    expect(w.manager.trust).toBe(38);
    expect(w.manager.conflicts).toBe(2);
    w.manager.pride = 90;
    expect(tacticRequestOutlook(w, 'counter', 'demand').label).toBe('사직 위험');
    const originalManager = w.manager.id;
    operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
    expect(w.manager.id).not.toBe(originalManager);
    expect(w.manager.interim).toBe(true);
    expect(w.critical).toContain('감독');
  });

  it('rejects corrupt, duplicate or unbounded imported reply histories', () => {
    const w = world();
    const keys = TACTICS.flatMap((tactic) =>
      ['respect', 'evidence', 'support', 'demand'].map((tone) => `${tactic}:${tone}`),
    );
    w.manager.requestHistory = { at: '1901:0', keys, trustAwarded: false };
    expect(validateWorld(w).manager.requestHistory?.keys).toHaveLength(16);
    for (const invalidKeys of [
      [...keys, 'balanced:respect'],
      ['balanced:unknown'],
      ['press:respect', 'press:respect'],
    ]) {
      w.manager.requestHistory.keys = invalidKeys;
      expect(() => validateWorld(w)).toThrow();
    }
  });
});
