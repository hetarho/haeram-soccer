import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import type { MatchRecord, TransferFact } from '../../contracts/src/types';
import { createWorld } from './founding';
import { operate } from './operations';
import { advanceEconomy } from './economy';
import { hasOwner, OWNER_PENDING_MESSAGE, ownerClose, ownerDay, ownerSettleGap } from './owner';
import {
  fanMoodAfterLeagueMatch,
  fanMoodClose,
  fanMoodIdentity,
  fanMoodRound,
  fanMoodTransfer,
} from './fan-mood';
import { withOwner } from './testing';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';

/** A founded career: no owner state, so every owner rule stands aside. */
const world = () =>
  createWorld(
    {
      country: 'ENG',
      name: 'Proprietors Town',
      color: '#335577',
      seed: 'owner-foundation',
      level: 'normal' as const,
    },
    DISABLED_RELEASE,
  );

const OWNER_COMMANDS = [
  { type: 'owner-stake', percent: 20 },
  { type: 'owner-inject', amount: '1000' },
  { type: 'owner-dividend', share: 50 },
] as const;

describe('owner commands (→OWNER-7/9/11)', () => {
  it.each(OWNER_COMMANDS)('refuses $type while the career has no owner', (cmd) => {
    const w = world(),
      before = canonical(w);
    expect(() => operate(w, cmd)).toThrow(OWNER_PENDING_MESSAGE);
    expect(canonical(w)).toBe(before);
  });
});

describe('owner hooks without an owner', () => {
  it('return at once and change nothing in a founded career', () => {
    const w = world(),
      before = canonical(w);
    // The hooks never read their facts without an owner, so stand-ins serve.
    const result = { id: 'league:1', home: w.playerClub } as MatchRecord,
      fact = { direction: 'in', player: w.players[0]!.id, fee: '1' } as TransferFact;
    ownerDay(w);
    ownerClose(w);
    ownerSettleGap(w, { year: w.year, day: 0 }, { year: w.year + 7, day: 0 });
    fanMoodAfterLeagueMatch(w, result);
    fanMoodRound(w);
    fanMoodClose(w);
    fanMoodTransfer(w, fact);
    fanMoodIdentity(w);
    expect(canonical(w)).toBe(before);
  });
  it('treats a founded career as owned and only an ownerless world as nobody’s', () => {
    const w = world();
    expect(hasOwner(w)).toBe(true);
    expect(hasOwner({ playerClub: '' })).toBe(false);
  });
});

describe('a currency change (→ECON-6)', () => {
  it('converts the fortune, the FFP injections and the loan once, keeping the takeover facts', () => {
    const w = world();
    // 240 old pence to the pound became 100 new pence in 1971.
    w.year = 1970;
    w.currency = 'GBP-LSD';
    const owner = withOwner(w, {
      fortune: '-24000',
      ffpInjections: [{ season: 1969, amount: '4800' }],
    });
    w.loan = { balance: '48000', installment: '9600', seasonsLeft: 4 };
    const takeover = structuredClone(owner.takeover);
    w.year = 1971;
    advanceEconomy(w, 1970);
    expect(w.currency).toBe('GBP');
    expect(w.owner!.fortune).toBe('-10000');
    expect(w.owner!.ffpInjections).toEqual([{ season: 1969, amount: '2000' }]);
    expect(w.loan).toEqual({ balance: '20000', installment: '4000', seasonsLeft: 4 });
    expect(w.owner!.takeover).toEqual(takeover);
    // Exactly once: the same money again converts nothing more.
    const after = canonical(w);
    advanceEconomy(w, 1970);
    expect(canonical(w)).toBe(after);
  });
});
