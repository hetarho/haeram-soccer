import { describe, expect, it } from 'vitest';
import { activePlayers, advanceRound, careOffer, CARE_INFO, createWorld, operate } from './index';

const input = {
  country: 'ENG' as const,
  name: 'Care Club',
  color: '#7a3b2e',
  seed: 'care-actions',
  difficulty: 1,
};

describe('care actions', () => {
  it('spends, changes morale and fatigue, and records the decision', () => {
    const w = createWorld(input);
    for (const player of activePlayers(w)) player.fatigue = 30;
    w.morale = 40;
    const cash = BigInt(w.cash);
    const dinner = careOffer(w, 'team-dinner');
    operate(w, { type: 'care', kind: 'team-dinner' });
    expect(w.morale).toBe(45);
    expect(BigInt(w.cash)).toBe(cash - BigInt(dinner.cost));
    operate(w, { type: 'care', kind: 'rest-day' });
    expect(activePlayers(w).every((player) => player.fatigue === 24)).toBe(true);
    expect(w.morale).toBe(47);
    expect(w.events.at(-1)?.kind).toBe('care:rest-day');
  });

  it('waits out each cooldown in settled rounds', () => {
    const w = createWorld(input);
    operate(w, { type: 'care', kind: 'medical' });
    expect(careOffer(w, 'medical')).toMatchObject({ available: false, wait: 2 });
    expect(() => operate(w, { type: 'care', kind: 'medical' })).toThrow('라운드 뒤');
    while (careOffer(w, 'medical').wait > 0) advanceRound(w);
    expect(careOffer(w, 'medical').available).toBe(true);
  });

  it('trades fatigue for friendly income and trust for a free morale lift', () => {
    const w = createWorld(input);
    const cash = BigInt(w.cash),
      trust = w.manager.trust;
    const friendly = careOffer(w, 'friendly');
    operate(w, { type: 'care', kind: 'friendly' });
    expect(BigInt(w.cash)).toBe(cash + BigInt(friendly.income));
    expect(activePlayers(w).every((player) => player.fatigue >= CARE_INFO.friendly.fatigue)).toBe(
      true,
    );
    operate(w, { type: 'care', kind: 'owner-visit' });
    expect(w.manager.trust).toBe(trust - 1);
  });

  it('fails cleanly without the cash and starts older saves from neutral morale', () => {
    const w = createWorld(input);
    delete w.morale;
    w.cash = '0';
    expect(careOffer(w, 'bonus')).toMatchObject({ available: false, reason: '자금 부족' });
    expect(() => operate(w, { type: 'care', kind: 'bonus' })).toThrow('자금 부족');
    operate(w, { type: 'care', kind: 'owner-visit' });
    expect(w.morale).toBe(63);
  });
});
