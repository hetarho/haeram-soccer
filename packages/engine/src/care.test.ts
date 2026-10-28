import { describe, expect, it } from 'vitest';
import type { CareKind, MatchRecord, World } from '../../contracts/src/types';
import {
  careOffer,
  CARE_INFO,
  CARE_KINDS,
  effectText,
  outcomeText,
  resolveCare,
  settleWinBonus,
  WIN_BONUS_MATCHES,
  WIN_BONUS_UNITS,
} from './care';
import { operate } from './operations';
import { activePlayers, advanceRound, advanceToNextMatch, createWorld } from './index';
import { quote } from './quotes';

/** Synthetic care inputs only: no world generation, matches or calendar progression. */
const careWorld = (seed = 'care-0'): World =>
  ({
    seed,
    year: 1950,
    round: 7,
    revision: 0,
    playerClub: 'care-club',
    clubs: [{ id: 'care-club', country: 'ENG', fans: 800 }],
    manager: { trust: 50, interim: false },
    players: [
      { id: 'active-a', status: 'active', fatigue: 30 },
      { id: 'active-b', status: 'active', fatigue: 40 },
      { id: 'sold', status: 'sold', fatigue: 30 },
      { id: 'retired', status: 'retired', fatigue: 30 },
    ],
    morale: 60,
    cash: '1000000000',
    income: '0',
    expense: '0',
    currency: 'GBP',
    events: [],
    ownMatches: [{ id: 'settled-match', score: { home: 1, away: 0 } }],
  }) as unknown as World;

const request = (w: World, kind: CareKind) => operate(w, { type: 'care', kind });

describe('owner request units', () => {
  it.each(CARE_KINDS)('discloses a real disadvantage for %s without changing the world', (kind) => {
    const w = careWorld();
    const before = structuredClone(w);
    const offer = careOffer(w, kind);
    expect(w).toEqual(before);
    expect(offer.outcomes.reduce((sum, outcome) => sum + outcome.chance, 0)).toBe(100);
    expect(offer.outcomes.every((outcome) => Number.isInteger(outcome.chance))).toBe(true);
    expect(offer.by).toBeTruthy();
    expect(
      BigInt(offer.cost) > 0n ||
        BigInt(offer.perWin) > 0n ||
        offer.outcomes.some(
          (outcome) =>
            outcome.chance > 0 && (outcome.morale < 0 || outcome.trust < 0 || outcome.fatigue > 0),
        ),
    ).toBe(true);
  });

  it.each(CARE_KINDS)('applies exactly the previewed money and one outcome for %s', (kind) => {
    const w = careWorld();
    const before = structuredClone(w);
    const offer = careOffer(w, kind);
    request(w, kind);
    const outcome = offer.outcomes.find(
      (candidate) =>
        w.morale === before.morale! + candidate.morale &&
        w.manager.trust === before.manager.trust + candidate.trust &&
        w.players.every(
          (player, i) =>
            player.fatigue ===
            before.players[i].fatigue + (player.status === 'active' ? candidate.fatigue : 0),
        ),
    );
    expect(outcome).toBeDefined();
    expect(BigInt(w.cash)).toBe(BigInt(before.cash) - BigInt(offer.cost) + BigInt(offer.income));
    expect(BigInt(w.expense)).toBe(BigInt(offer.cost));
    expect(BigInt(w.income)).toBe(BigInt(offer.income));
    expect(w.events.at(-1)).toMatchObject({
      kind: `care:${kind}`,
      title: offer.label,
    });
    expect(w.events.at(-1)!.detail).toContain(`${offer.by} · ${outcomeText(outcome!)}`);
    expect(w.ownMatches).toEqual(before.ownMatches);
    const amount =
      BigInt(offer.cost) > 0n ? offer.cost : BigInt(offer.income) > 0n ? offer.income : undefined;
    expect(w.events.at(-1)!.amount).toBe(amount);
  });

  it.each([
    ['backing', 8, 0],
    ['rest-day', 0, -6],
  ] as const)('trades two morale for the stated gain from %s', (kind, trust, fatigue) => {
    const w = careWorld();
    const offer = careOffer(w, kind);
    expect(offer).toMatchObject({ cost: '0', perWin: '0' });
    expect(offer.outcomes).toEqual([
      expect.objectContaining({ chance: 100, morale: -2, trust, fatigue }),
    ]);
    expect(effectText(offer.outcomes[0])).toContain('분위기 −2');
    request(w, kind);
    expect(w.morale).toBe(58);
    expect(w.manager.trust).toBe(50 + trust);
    expect(w.players.map((player) => player.fatigue)).toEqual([30 + fatigue, 40 + fatigue, 30, 30]);
    expect(w.events.at(-1)!.detail).toContain('분위기 −2');
  });

  it('preserves costs, gains, chances, future obligations and cooldown lengths', () => {
    const w = careWorld();
    const offers = CARE_KINDS.map((kind) => {
      const offer = careOffer(w, kind);
      return {
        kind,
        cost: offer.cost,
        perWin: offer.perWin,
        income: offer.income,
        cooldown: offer.cooldown,
        outcomes: offer.outcomes.map(({ chance, morale, fatigue, trust }) => [
          chance,
          morale,
          fatigue,
          trust,
        ]),
      };
    });
    const price = (units: number) => quote('ENG', w.year, units);
    expect(offers).toEqual([
      {
        kind: 'meeting',
        cost: '0',
        perWin: '0',
        income: '0',
        cooldown: 4,
        outcomes: [
          [50, 7, 0, 0],
          [28, 2, 0, 0],
          [22, -3, 0, -2],
        ],
      },
      {
        kind: 'bonding',
        cost: price(15),
        perWin: '0',
        income: '0',
        cooldown: 3,
        outcomes: [
          [75, 5, 0, 0],
          [25, 2, 0, 0],
        ],
      },
      {
        kind: 'win-bonus',
        cost: '0',
        perWin: price(WIN_BONUS_UNITS),
        income: '0',
        cooldown: 8,
        outcomes: [[100, 3, 0, 0]],
      },
      {
        kind: 'owner-visit',
        cost: '0',
        perWin: '0',
        income: '0',
        cooldown: 4,
        outcomes: [
          [35, 4, 0, 0],
          [30, 1, 0, 0],
          [35, -3, 0, -3],
        ],
      },
      {
        kind: 'backing',
        cost: '0',
        perWin: '0',
        income: '0',
        cooldown: 10,
        outcomes: [[100, -2, 0, 8]],
      },
      {
        kind: 'camp',
        cost: price(60),
        perWin: '0',
        income: '0',
        cooldown: 12,
        outcomes: [[100, 5, -8, 0]],
      },
      {
        kind: 'rest-day',
        cost: '0',
        perWin: '0',
        income: '0',
        cooldown: 4,
        outcomes: [[100, -2, -6, 0]],
      },
      {
        kind: 'recovery',
        cost: price(30),
        perWin: '0',
        income: '0',
        cooldown: 2,
        outcomes: [[100, 0, -10, 0]],
      },
      {
        kind: 'friendly',
        cost: '0',
        perWin: '0',
        income: price(13),
        cooldown: 4,
        outcomes: [[100, 0, 8, 0]],
      },
    ]);
  });

  it('lets a motivating manager make meetings work more often and preserves their bounds', () => {
    const w = careWorld();
    const plain = careOffer(w, 'meeting');
    w.manager.style = 'motivator';
    const motivated = careOffer(w, 'meeting');
    expect(motivated.outcomes[0].chance).toBeGreaterThan(plain.outcomes[0].chance);
    expect(motivated.outcomes.at(-1)!.chance).toBeLessThan(plain.outcomes.at(-1)!.chance);
    w.manager.trust = 100;
    w.morale = 40;
    expect(careOffer(w, 'meeting').outcomes[0].chance).toBe(90);
    expect(careOffer(w, 'meeting').outcomes.at(-1)!.chance).toBeGreaterThan(0);
  });

  it.each([
    ['meeting', 'care-2', 0],
    ['meeting', 'care-1', 1],
    ['meeting', 'care-0', 2],
    ['bonding', 'care-2', 0],
    ['bonding', 'care-0', 1],
    ['owner-visit', 'care-4', 0],
    ['owner-visit', 'care-1', 1],
    ['owner-visit', 'care-0', 2],
  ] as const)('realizes %s outcome %s/%i deterministically despite reads', (kind, seed, index) => {
    const plain = careWorld(seed);
    const read = structuredClone(plain);
    const offer = careOffer(plain, kind);
    expect(resolveCare(plain, kind)).toEqual(offer.outcomes[index]);
    for (let i = 0; i < 6; i++) {
      careOffer(read, kind);
      operate(read, { type: 'read-inbox' });
    }
    expect(resolveCare(read, kind)).toEqual(offer.outcomes[index]);
    expect(read.morale).toBe(plain.morale);
    expect(read.manager.trust).toBe(plain.manager.trust);
  });

  it.each(CARE_KINDS)(
    'rejects repeated %s cleanly until its settled-round cooldown ends',
    (kind) => {
      const w = careWorld();
      request(w, kind);
      // A win-bonus promise is a separate match-bound guard, tested below.
      if (kind === 'win-bonus') delete w.winBonus;
      const before = structuredClone(w);
      expect(careOffer(w, kind)).toMatchObject({
        available: false,
        wait: CARE_INFO[kind].cooldown,
      });
      expect(() => request(w, kind)).toThrow('라운드 뒤');
      expect(w).toEqual(before);
      w.round += CARE_INFO[kind].cooldown - 1;
      expect(careOffer(w, kind)).toMatchObject({ available: false, wait: 1 });
      w.round++;
      expect(careOffer(w, kind)).toMatchObject({ available: true, wait: 0 });
    },
  );

  it.each(['bonding', 'camp', 'recovery'] as const)(
    'requires the exact previewed cash for %s',
    (kind) => {
      const w = careWorld();
      const offer = careOffer(w, kind);
      w.cash = (BigInt(offer.cost) - 1n).toString();
      const before = structuredClone(w);
      expect(careOffer(w, kind)).toMatchObject({ available: false, reason: '자금 부족' });
      expect(() => request(w, kind)).toThrow('자금 부족');
      expect(w).toEqual(before);
      w.cash = offer.cost;
      expect(careOffer(w, kind).available).toBe(true);
      request(w, kind);
      expect(w.cash).toBe('0');
    },
  );

  it.each([
    [85, false, '굳건'],
    [50, true, '임시 감독'],
  ] as const)(
    'refuses backing for trust %i / interim %s without changes',
    (trust, interim, reason) => {
      const w = careWorld();
      w.manager.trust = trust;
      w.manager.interim = interim;
      const before = structuredClone(w);
      expect(careOffer(w, 'backing').available).toBe(false);
      expect(() => request(w, 'backing')).toThrow(reason);
      expect(w).toEqual(before);
    },
  );

  it('keeps a win bonus owed at short cash until exactly five match results settle', () => {
    const w = careWorld();
    w.cash = '0';
    const offer = careOffer(w, 'win-bonus');
    request(w, 'win-bonus');
    expect(w.morale).toBe(63);
    expect(w.cash).toBe('0');
    expect(w.winBonus).toEqual({ matches: WIN_BONUS_MATCHES });
    w.round += offer.cooldown;
    const before = structuredClone(w);
    expect(() => request(w, 'win-bonus')).toThrow('이미 승리 수당');
    expect(w).toEqual(before);
    const scores = [
      [2, 0],
      [0, 2],
      [1, 1],
      [2, 1],
      [1, 2],
    ];
    for (const [i, [home, away]] of scores.entries()) {
      const match = {
        id: `care-match-${i}`,
        home: i % 2 === 0 ? w.playerClub : 'opponent',
        away: i % 2 === 0 ? 'opponent' : w.playerClub,
        score: { home, away },
      } as MatchRecord;
      settleWinBonus(w, match);
      expect(w.winBonus?.matches).toBe(i === scores.length - 1 ? undefined : scores.length - i - 1);
    }
    expect(BigInt(w.cash)).toBe(-2n * BigInt(offer.perWin));
    expect(BigInt(w.expense)).toBe(2n * BigInt(offer.perWin));
    expect(w.morale).toBe(67);
    expect(
      w.events.filter((event) => event.kind === 'win-bonus').map((event) => event.amount),
    ).toEqual([offer.perWin, offer.perWin]);
    expect(careOffer(w, 'win-bonus').available).toBe(false); // Debt still fails the cash guard.
    w.cash = '0';
    expect(careOffer(w, 'win-bonus').available).toBe(true);
    const expired = structuredClone(w);
    settleWinBonus(w, { home: w.playerClub, score: { home: 1, away: 0 } } as MatchRecord);
    expect(w).toEqual(expired);
  });

  it.each(['backing', 'rest-day'] as const)(
    'starts missing morale from 60 before %s costs it',
    (kind) => {
      const w = careWorld();
      delete w.morale;
      request(w, kind);
      expect(w.morale).toBe(58);
    },
  );

  it.each(['backing', 'rest-day'] as const)(
    'clamps %s outcomes at the morale and fatigue floors',
    (kind) => {
      const w = careWorld();
      w.morale = 1;
      w.manager.trust = 84;
      w.players[0].fatigue = 2;
      request(w, kind);
      expect(w.morale).toBe(0);
      expect(w.manager.trust).toBe(kind === 'backing' ? 92 : 84);
      expect(w.players[0].fatigue).toBe(kind === 'rest-day' ? 0 : 2);
    },
  );
});

const input = {
  country: 'ENG' as const,
  name: 'Care Club',
  color: '#7a3b2e',
  seed: 'care-actions',
  level: 'normal' as const,
};

describe('owner request integration', () => {
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
    expect(w.morale).toBe(38);
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

  it('an inbox read does not change a request', () => {
    // Every cooldown refuses a second use in the same round, so the round names the draw.
    for (const kind of CARE_KINDS) expect(CARE_INFO[kind].cooldown).toBeGreaterThan(0);
    const request = (reads: number) => {
      const w = createWorld(input);
      for (let i = 0; i < reads; i++) operate(w, { type: 'read-inbox' });
      operate(w, { type: 'care', kind: 'owner-visit' });
      return { event: w.events.at(-1), morale: w.morale, trust: w.manager.trust };
    };
    const plain = request(0);
    for (let reads = 1; reads <= 6; reads++) expect(request(reads)).toEqual(plain);
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
    expect(w.morale).toBe(58);
    expect(CARE_INFO.camp.cost).toBeGreaterThan(0);
  });
});
