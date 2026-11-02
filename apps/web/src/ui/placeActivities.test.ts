import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import { makePlayer } from '../../../../packages/engine/src/world';
import { promoteYouth } from '../../../../packages/engine/src/academy';
import type { GameClient } from '../runtime/client';
import type { Reply, View } from '../runtime/protocol';
import { initialClientState } from '../runtime/store';
import { PlaceActivities } from './PlaceActivities';
import { Money } from './Money';
import { activityUnavailable, placeActivities, placeActivityClient } from './placeActivityChoices';

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
    // No closed season yet: no Ballon d'Or podium prices a signing (→CLUB-29).
    history: [],
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

describe('place activity units', () => {
  it.each([
    { country: 'ENG', year: 1950, tier: 0, age: 18 },
    { country: 'ENG', year: 2020, tier: 1, age: 17 },
    { country: 'ESP', year: 2005, tier: 2, age: 19 },
    { country: 'ITA', year: 1990, tier: 2, age: 20 },
  ])(
    'quotes the actual annual wage before promotion in $country $year',
    ({ country, year, tier, age }) => {
      const { world, state, client, command } = fixture();
      world.year = year;
      Object.assign(world.clubs[0], { country, tier });
      world.academy!.players = world.academy!.players.filter((one) => one.id === 'ready');
      world.academy!.players[0].born = year - age;
      const before = structuredClone(world);
      const preview = placeActivities(world).academy.players.find(
        (one) => one.player.id === 'ready',
      )!;
      expect(world).toEqual(before);
      const settled = structuredClone(world);
      promoteYouth(settled, preview.player.id);
      const contract = settled.players.find((one) => one.id === preview.player.id)!;
      expect(BigInt(contract.wage)).toBeGreaterThan(0n);
      expect(contract.wage).not.toBe(preview.player.wage);
      expect(preview).toMatchObject({ promotionWage: contract.wage });
      const html = renderToStaticMarkup(createElement(PlaceActivities, { state, client }));
      const wage = renderToStaticMarkup(
        createElement(Money, { value: contract.wage, code: country, year }),
      );
      expect(html).toContain(`승격 후 연봉 ${wage}`);
      expect(html).toContain(`계약 종료 ${contract.until}년`);
      expect(command).not.toHaveBeenCalled();
      expect(world).toEqual(before);
    },
  );

  it('reads the academy place without changing facts or offering any request', () => {
    const { world } = fixture();
    const before = structuredClone(world);
    const model = placeActivities(world);
    expect(Object.keys(model).sort()).toEqual(['academy', 'facts', 'records']);
    expect(model.facts[0]).toMatch(/^유소년 2\/\d+명 · 1군 자리 \d+개$/);
    // The youth director's own call, read-only (→WEB-102).
    expect(model.facts.at(-1)).toMatch(/^유스 디렉터 Synthetic Youth Director · /);
    world.staff = [];
    expect(placeActivities(world).facts.at(-1)).toMatch(/^유스 디렉터 공석 · /);
    world.staff = before.staff;
    expect(world).toEqual(before);
  });

  it('states promotion eligibility from the age and the registration rules', () => {
    const { world } = fixture();
    const academy = placeActivities(world).academy;
    expect(
      academy.players.find((one) => one.player.id === 'young')!.promotionUnavailable,
    ).toContain('17세');
    expect(
      academy.players.find((one) => one.player.id === 'ready')!.promotionUnavailable,
    ).toBeUndefined();
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
      placeActivities(world).academy.players.find((one) => one.player.id === 'young')!
        .promotionUnavailable,
    ).toBeUndefined();
  });

  it('keeps only relevant real records, newest first and bounded', () => {
    const { world } = fixture();
    world.events = [
      'youth-intake',
      'care:meeting',
      'youth-promotion',
      'youth-release',
      'youth-promotion',
      'unrelated',
    ].map((kind, i) => ({
      kind,
      year: 1950,
      round: 7,
      title: `${kind} ${i}`,
      detail: 'actual engine detail',
    }));
    expect(placeActivities(world).records.map((one) => one.title)).toEqual([
      'youth-promotion 4',
      'youth-release 3',
      'youth-promotion 2',
    ]);
  });

  it('renders the inspectable academy in read-only mode without submitting', () => {
    const { world, state, client, command } = fixture();
    state.readonly = true;
    const html = renderToStaticMarkup(createElement(PlaceActivities, { state, client }));
    expect(html).toContain('place-activities-academy');
    expect(html).toContain('읽기 전용');
    expect(html).toContain('시장 급여');
    expect(html).toContain('육성 기회를 잃어요');
    expect(html).toContain('U-17 ×1.3');
    expect(html.match(/aria-label="유소년 아카데미"/g)).toHaveLength(1);
    expect(html).toContain('승격·방출 검토');
    expect(html).not.toContain('>1군 승격</button>');
    expect(command).not.toHaveBeenCalled();
    expect(world.revision).toBe(0);
  });
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
      type: 'promote-youth',
      id: 'ready',
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

  it('forwards academy commands through the existing client unchanged', async () => {
    const f = fixture();
    const scoped = placeActivityClient(f.client, f.world, () => true, vi.fn());
    const commands = [
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
        const first = scoped.command({ type: 'promote-youth', id: 'ready' });
        await scoped.command({ type: 'promote-youth', id: 'ready' });
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
    const command = { type: 'release-youth', id: 'young' } as const;
    expect(await scoped.command(command)).toBeUndefined();
    expect(failed).toHaveBeenLastCalledWith('actual failure');
    expect(await scoped.command(command)).toMatchObject({ ok: true });
  });
});
