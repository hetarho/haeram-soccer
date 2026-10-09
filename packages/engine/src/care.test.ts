import { describe, expect, it } from 'vitest';
import {
  activePlayers,
  advanceRound,
  advanceToNextMatch,
  careOffer,
  CARE_INFO,
  CARE_KINDS,
  createWorld,
  operate,
  WIN_BONUS_MATCHES,
} from './index';

const input = {
  country: 'ENG' as const,
  name: 'Care Club',
  color: '#7a3b2e',
  seed: 'care-actions',
  difficulty: 1,
};

describe('owner requests', () => {
  it('states whole-percent chances that sum to 100 for every request', () => {
    const w = createWorld(input);
    for (const kind of CARE_KINDS) {
      const offer = careOffer(w, kind);
      expect(offer.outcomes.reduce((sum, outcome) => sum + outcome.chance, 0)).toBe(100);
      expect(offer.outcomes.every((outcome) => Number.isInteger(outcome.chance))).toBe(true);
      expect(offer.by).toBeTruthy();
    }
    expect(CARE_KINDS).not.toContain('bonus');
  });

  it('applies exactly one stated outcome and records who carried it out', () => {
    const w = createWorld(input);
    w.morale = 40;
    const before = w.morale,
      offer = careOffer(w, 'meeting');
    operate(w, { type: 'care', kind: 'meeting' });
    const change = w.morale! - before;
    expect(offer.outcomes.map((outcome) => outcome.morale)).toContain(change);
    expect(w.events.at(-1)).toMatchObject({ kind: 'care:meeting', title: offer.label });
    expect(w.events.at(-1)!.detail).toContain('감독');
  });

  it('lets a motivating manager make squad meetings work more often', () => {
    const plain = createWorld(input),
      motivator = createWorld(input);
    motivator.manager.style = 'motivator';
    const works = (w: typeof plain) => careOffer(w, 'meeting').outcomes[0].chance;
    expect(works(motivator)).toBeGreaterThan(works(plain));
    expect(careOffer(motivator, 'meeting').outcomes.at(-1)!.chance).toBeLessThan(
      careOffer(plain, 'meeting').outcomes.at(-1)!.chance,
    );
  });

  it('rests, recovers and earns with the fixed requests', () => {
    const w = createWorld(input);
    for (const player of activePlayers(w)) player.fatigue = 30;
    w.morale = 40;
    operate(w, { type: 'care', kind: 'rest-day' });
    expect(activePlayers(w).every((player) => player.fatigue === 24)).toBe(true);
    expect(w.morale).toBe(42);
    const cash = BigInt(w.cash),
      recovery = careOffer(w, 'recovery');
    operate(w, { type: 'care', kind: 'recovery' });
    expect(BigInt(w.cash)).toBe(cash - BigInt(recovery.cost));
    expect(activePlayers(w).every((player) => player.fatigue === 14)).toBe(true);
    const friendly = careOffer(w, 'friendly');
    operate(w, { type: 'care', kind: 'friendly' });
    expect(BigInt(w.cash)).toBe(cash - BigInt(recovery.cost) + BigInt(friendly.income));
    expect(activePlayers(w).every((player) => player.fatigue === 22)).toBe(true);
  });

  it('waits out each cooldown in settled rounds', () => {
    const w = createWorld(input);
    operate(w, { type: 'care', kind: 'recovery' });
    expect(careOffer(w, 'recovery')).toMatchObject({ available: false, wait: 2 });
    expect(() => operate(w, { type: 'care', kind: 'recovery' })).toThrow('라운드 뒤');
    while (careOffer(w, 'recovery').wait > 0) advanceRound(w);
    expect(careOffer(w, 'recovery').available).toBe(true);
  });

  it('backs the manager publicly only while his standing needs it', () => {
    const w = createWorld(input);
    w.manager.trust = 50;
    operate(w, { type: 'care', kind: 'backing' });
    expect(w.manager.trust).toBe(58);
    const firm = createWorld(input);
    firm.manager.trust = 90;
    expect(careOffer(firm, 'backing')).toMatchObject({ available: false });
    expect(() => operate(firm, { type: 'care', kind: 'backing' })).toThrow('굳건');
  });

  it('pays a promised win bonus after each win until the promise runs out', () => {
    const w = createWorld(input);
    operate(w, { type: 'care', kind: 'win-bonus' });
    expect(w.winBonus).toEqual({ matches: WIN_BONUS_MATCHES });
    expect(careOffer(w, 'win-bonus').available).toBe(false);
    const perWin = BigInt(careOffer(w, 'win-bonus').perWin);
    for (let played = 0; played < WIN_BONUS_MATCHES; played++) {
      const matches = w.ownMatches.length;
      advanceToNextMatch(w, undefined, false);
      expect(w.ownMatches.length).toBe(matches + 1);
    }
    expect(w.winBonus).toBeUndefined();
    const paid = w.events.filter((event) => event.kind === 'win-bonus');
    const wins = w.ownMatches.filter((m) =>
      m.home === w.playerClub ? m.score.home > m.score.away : m.score.away > m.score.home,
    ).length;
    expect(paid).toHaveLength(wins);
    for (const event of paid) expect(BigInt(event.amount!)).toBe(perWin);
  });

  it('fails cleanly without the cash and starts older saves from neutral morale', () => {
    const w = createWorld(input);
    delete w.morale;
    w.cash = '0';
    expect(careOffer(w, 'camp')).toMatchObject({ available: false, reason: '자금 부족' });
    expect(() => operate(w, { type: 'care', kind: 'camp' })).toThrow('자금 부족');
    operate(w, { type: 'care', kind: 'rest-day' });
    expect(w.morale).toBe(62);
    expect(CARE_INFO.camp.cost).toBeGreaterThan(0);
  });
});
