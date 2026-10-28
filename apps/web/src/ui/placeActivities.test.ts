import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CareKind, World } from '../../../../packages/contracts/src/types';
import {
  careOffer,
  CARE_KINDS,
  effectText,
  resolveCare,
} from '../../../../packages/engine/src/care';
import { makePlayer } from '../../../../packages/engine/src/world';
import { promoteYouth } from '../../../../packages/engine/src/academy';
import type { GameClient } from '../runtime/client';
import type { Reply, View } from '../runtime/protocol';
import { initialClientState } from '../runtime/store';
import { PlaceActivities } from './PlaceActivities.tsx';
import { careRequest } from './teamState';
import { activityUnavailable, placeActivities, placeActivityClient } from './placeActivities';

/** A few synthetic players and staff, one club; no world generation, matches or calendar steps. */
function fixture() {
  const player = (id: string, age: number) =>
    makePlayer('ENG', 'activity-unit', id, 1950, 40, 'CM', age);
  const world = {
    id: 'activity-unit',
    seed: 'activity-unit',
    revision: 0,
    year: 1950,
    round: 7,
    day: 0,
    playerClub: 'own',
    clubs: [{ id: 'own', country: 'ENG', tier: 0, fans: 800, reputation: 10 }],
    players: [player('active', 25), { ...player('sold', 25), status: 'sold' }],
    manager: {
      id: 'manager',
      name: 'Synthetic Manager',
      philosophy: 'balanced',
      ability: 50,
      youth: 50,
      flexibility: 50,
      pride: 50,
      trust: 50,
      wage: '0',
      interim: false,
    },
    staff: [
      { id: 'assistant', role: 'assistant', name: 'Synthetic Assistant', ability: 50, wage: '0' },
      { id: 'youth', role: 'youth', name: 'Synthetic Youth Director', ability: 50, wage: '0' },
    ],
    academy: { players: [player('young', 16), player('ready', 18)], intakeYear: 1949 },
    morale: 60,
    cash: '1000000000',
    income: '0',
    expense: '0',
    currency: 'GBP',
    events: [],
    ownMatches: [],
    fixtures: [],
    tables: {},
    tactic: 'balanced',
    stadium: 0,
    trainingGround: 0,
    academyFacility: 0,
  } as unknown as World;
  world.players.forEach((one) => {
    one.fatigue = 40;
  });
  const state = {
    ...initialClientState,
    busy: false,
    processing: false,
    readonly: false,
    activity: 'idle' as const,
    view: { world } as View,
  };
  const command = vi.fn<GameClient['command']>(async () => ({ ok: true }) as Reply);
  const client = { state, command } as unknown as GameClient;
  return { world, state, command, client };
}

describe('care disclosure units', () => {
  it.each(CARE_KINDS)(
    'shows authoritative gains, disadvantages, chances and cooldown for %s',
    (kind) => {
      const { world } = fixture();
      const before = structuredClone(world);
      const offer = careOffer(world, kind);
      const choice = careRequest(world, kind);
      expect(world).toEqual(before);
      expect(choice.care).toEqual(offer);
      expect(choice.by).toBe(offer.by);
      expect(choice.effect).toContain(`재요청 ${offer.cooldown}라운드 후`);
      const text = [
        choice.effect,
        choice.cost,
        ...(choice.chances?.map((one) => one.text) ?? []),
      ].join(' ');
      for (const outcome of offer.outcomes) expect(text).toContain(effectText(outcome));
      if (offer.outcomes.length > 1)
        expect(choice.chances?.map((one) => one.chance)).toEqual(
          offer.outcomes.map((one) => one.chance),
        );
      if (BigInt(offer.cost) > 0n) expect(choice.cost).not.toBe('무료');
      else if (BigInt(offer.perWin) > 0n) expect(text).toContain('자금이 부족해도 지급');
      else expect(text).toMatch(/분위기 −|감독 신뢰 −|피로 \+/);
    },
  );

  it.each(['backing', 'rest-day'] as const)(
    'shows and settles the morale trade-off for %s',
    (kind) => {
      const { world } = fixture();
      const outcome = resolveCare(world, kind);
      expect(careRequest(world, kind).effect).toContain('분위기 −2');
      expect(world.morale).toBe(58);
      expect(outcome).toMatchObject({
        morale: -2,
        trust: kind === 'backing' ? 8 : 0,
        fatigue: kind === 'rest-day' ? -6 : 0,
      });
      expect(world.manager.trust).toBe(kind === 'backing' ? 58 : 50);
      expect(world.players[0].fatigue).toBe(kind === 'rest-day' ? 34 : 40);
      expect(world.players[1].fatigue).toBe(40);
    },
  );

  it('does not consume draws on inspection and reads cooldowns from recorded settled rounds', () => {
    const { world } = fixture();
    const clone = structuredClone(world);
    for (let i = 0; i < 5; i++) placeActivities(world, 'manager');
    expect(resolveCare(world, 'meeting')).toEqual(resolveCare(clone, 'meeting'));
    expect(world).toEqual(clone);
    world.events.push({
      year: world.year,
      round: world.round,
      kind: 'care:meeting',
      title: 'recorded',
      detail: '',
    });
    expect(careRequest(world, 'meeting').unavailable).toBe('4라운드 뒤 다시 가능');
    world.round += 3;
    expect(careRequest(world, 'meeting').unavailable).toBe('1라운드 뒤 다시 가능');
    world.round++;
    expect(careRequest(world, 'meeting').unavailable).toBeUndefined();
  });

  it('explains actual cash, backing and existing bonus guards', () => {
    const { world } = fixture();
    world.cash = '0';
    expect(careRequest(world, 'recovery').unavailable).toBe('자금 부족');
    world.manager.trust = 85;
    expect(careRequest(world, 'backing').unavailable).toContain('이미 굳건');
    world.manager.trust = 50;
    world.manager.interim = true;
    expect(careRequest(world, 'backing').unavailable).toContain('임시 감독');
    world.winBonus = { matches: 3 };
    expect(careRequest(world, 'win-bonus').unavailable).toContain('남은 3경기');
  });
});

describe('place activity units', () => {
  it('quotes the actual annual wage before the existing promotion signs its contract', () => {
    const { world } = fixture();
    const before = structuredClone(world);
    const preview = placeActivities(world, 'academy').academy!.players.find(
      (one) => one.player.id === 'ready',
    )!;
    expect(world).toEqual(before);
    const settled = structuredClone(world);
    promoteYouth(settled, preview.player.id);
    const contract = settled.players.find((one) => one.id === preview.player.id)!;
    expect(BigInt(contract.wage)).toBeGreaterThan(0n);
    expect(preview).toMatchObject({ promotionWage: contract.wage });
  });

  it('groups every care kind into a small set of real requests without changing facts', () => {
    const { world } = fixture();
    const before = structuredClone(world);
    const kinds: string[] = [];
    for (const place of ['manager', 'coaching', 'training', 'academy'] as const) {
      const model = placeActivities(world, place);
      expect(model.choices.length).toBeLessThanOrEqual(4);
      expect(model.facts.length).toBeGreaterThan(0);
      kinds.push(...model.choices.map((one) => one.id));
    }
    expect(kinds.sort()).toEqual([...CARE_KINDS].sort());
    expect(placeActivities(world, 'manager').choices.map((one) => one.id)).toEqual([
      'backing',
      'meeting',
      'owner-visit',
      'win-bonus',
    ]);
    expect(world).toEqual(before);
  });

  it('uses youth focus multipliers, duration, staff risk and promotion eligibility', () => {
    const { world } = fixture();
    world.staff!.find((one) => one.role === 'youth')!.wage = '100';
    world.staff!.find((one) => one.role === 'youth')!.asked = {
      year: world.year,
      round: world.round,
    };
    const academy = placeActivities(world, 'academy');
    expect(academy.training).toMatchObject({ duration: 4, wait: 2, risk: 0.15 });
    expect(academy.training.youthFocuses.fundamentals.growth).toEqual({
      u17: 1.3,
      u19: 0.9,
      u21: 0.9,
    });
    expect(
      academy.academy!.players.find((one) => one.player.id === 'young')!.promotionUnavailable,
    ).toContain('17세');
    expect(
      academy.academy!.players.find((one) => one.player.id === 'ready')!.promotionUnavailable,
    ).toBeUndefined();
    world.staff = [];
    expect(placeActivities(world, 'academy').training.unavailable).toContain('자리가 비어');
    // Counted registration cap at a modern top-flight club, with only the candidate under 21.
    world.year = 2011;
    world.players = Array.from({ length: 25 }, (_, i) => ({
      ...world.players[0],
      id: `veteran-${i}`,
      born: 1980,
    }));
    world.academy!.players[0].born = 1994;
    // Exempt ENG prospect still fits: a full counted list must not hide an eligible promotion.
    expect(
      placeActivities(world, 'academy').academy!.players.find((one) => one.player.id === 'young')!
        .promotionUnavailable,
    ).toBeUndefined();
  });

  it('keeps only relevant real records, newest first and bounded', () => {
    const { world } = fixture();
    world.events = [
      'care:rest-day',
      'care:meeting',
      'care:backing',
      'care:owner-visit',
      'care:win-bonus',
      'unrelated',
    ].map((kind) => ({ kind, year: 1950, round: 7, title: kind, detail: 'actual engine detail' }));
    expect(placeActivities(world, 'manager').records.map((one) => one.kind)).toEqual([
      'care:win-bonus',
      'care:owner-visit',
      'care:backing',
    ]);
    expect(placeActivities(world, 'training').records.map((one) => one.kind)).toEqual([
      'care:rest-day',
    ]);
    expect(placeActivities(world, 'academy').records).toEqual([]);
  });

  it.each(['manager', 'coaching', 'training', 'academy'] as const)(
    'renders inspectable %s choices in read-only mode without submitting',
    (place) => {
      const { world, state, client, command } = fixture();
      state.readonly = true;
      const html = renderToStaticMarkup(createElement(PlaceActivities, { place, state, client }));
      expect(html).toContain(`place-activities-${place}`);
      expect(html).toContain('읽기 전용');
      if (place === 'academy') {
        expect(html).toContain('시장 급여');
        expect(html).toContain('육성 기회를 잃어요');
        expect(html).toContain('U-17 ×1.3');
      }
      expect(command).not.toHaveBeenCalled();
      expect(world.revision).toBe(0);
    },
  );
});

describe('place command guard units', () => {
  it.each([
    { readonly: true },
    { clockRunning: true },
    { processing: true },
    { busy: true },
    { pendingActions: 1 },
    { error: 'worker failed' },
  ])('prevents changes with %j', async (lock) => {
    const f = fixture();
    Object.assign(f.state, lock);
    expect(activityUnavailable(f.state, f.world)).toBeTruthy();
    await placeActivityClient(f.client, f.world, () => true, vi.fn()).command({
      type: 'care',
      kind: 'meeting',
    });
    expect(f.command).not.toHaveBeenCalled();
  });

  it('rejects stale revisions, critical/bankrupt worlds, and replaced games', async () => {
    for (const change of [
      { revision: 1 },
      { critical: 'blocker' },
      { bankrupt: true },
      { id: 'other' },
    ]) {
      const f = fixture();
      const expected = { id: f.world.id, revision: f.world.revision };
      Object.assign(f.world, change);
      await placeActivityClient(f.client, expected, () => true, vi.fn()).command({
        type: 'release-youth',
        id: 'young',
      });
      expect(f.command).not.toHaveBeenCalled();
    }
  });

  it('forwards care, training and academy commands through the existing client unchanged', async () => {
    const f = fixture();
    const scoped = placeActivityClient(f.client, f.world, () => true, vi.fn());
    const commands = [
      { type: 'care', kind: 'rest-day' },
      { type: 'coach-training', coach: 'youth', focus: 'firstTeam', force: false },
      { type: 'promote-youth', id: 'ready' },
      { type: 'release-youth', id: 'young' },
    ] as const;
    for (const command of commands) await scoped.command(command);
    expect(f.command.mock.calls.map((call) => call[0])).toEqual(commands);
  });

  it.each([true, false])(
    'blocks duplicate clicks and discards late replies (ok=%s) after replacement or cancellation',
    async (ok) => {
      for (const replace of [false, true]) {
        const f = fixture();
        let current = true;
        let resolve!: (reply: Reply) => void;
        f.command.mockImplementationOnce(
          () =>
            new Promise<Reply>((done) => {
              resolve = done;
            }),
        );
        const failed = vi.fn();
        const scoped = placeActivityClient(f.client, { ...f.world }, () => current, failed);
        const first = scoped.command({ type: 'care', kind: 'meeting' });
        await scoped.command({ type: 'care', kind: 'meeting' });
        expect(f.command).toHaveBeenCalledOnce();
        if (replace) f.world.id = 'other';
        else current = false;
        resolve({ ok, error: ok ? undefined : 'late error' } as Reply);
        expect(await first).toBeUndefined();
        expect(failed.mock.calls).toEqual([['']]);
      }
    },
  );

  it('keeps failed submissions retryable and reports only actual failures', async () => {
    const f = fixture();
    const failed = vi.fn();
    const scoped = placeActivityClient(f.client, f.world, () => true, failed);
    f.command.mockRejectedValueOnce(new Error('actual failure'));
    const command = { type: 'care', kind: 'meeting' as CareKind } as const;
    expect(await scoped.command(command)).toBeUndefined();
    expect(failed).toHaveBeenLastCalledWith('actual failure');
    expect(await scoped.command(command)).toMatchObject({ ok: true });
  });
});
