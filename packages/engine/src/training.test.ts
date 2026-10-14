import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Player, TrainingFocus } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { mainOvr, weightsFor } from './player';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import { requestSchema } from '../../../apps/web/src/runtime/protocol';
import {
  activePlayers,
  advanceDays,
  advanceRound,
  createWorld,
  developAnnually,
  developmentOutlook,
  marketWage,
  operate,
  overall,
  policyOf,
  settleTraining,
  trainingFocusInfo,
  trainingSummary,
  FOUNDING_YEAR,
} from './index';

function world(focus: TrainingFocus = 'balanced') {
  const w = createWorld({
    country: 'ENG',
    name: 'Academy United',
    color: '#224433',
    seed: 'training-progress',
    level: 'easy' as const,
  });
  w.cash = '999999999';
  w.manager.youth = 60;
  w.tactic = 'balanced';
  for (const player of w.players) {
    player.born = w.year - 20;
    player.potential = 85;
    for (const a of ATTRIBUTES) player.attrs[a] = 40;
    player.fatigue = 50;
    // Paid as the market rates them now, so nobody asks for a raise (→CLUB-26).
    player.wage = marketWage(w, player);
  }
  // The owner holds the focus with an order; the assistant's rule would rest this tired squad.
  w.trainingOrders = { assistant: { focus, rounds: 4, forced: true } };
  return w;
}

const development = (w: ReturnType<typeof world>) =>
  w.players.reduce((sum, player) => sum + (player.developed || 0), 0);
const ovr = (player: Player) => mainOvr(player);
const fatigue = (w: ReturnType<typeof world>) =>
  w.players.reduce((sum, player) => sum + player.fatigue, 0);

describe('earned player growth and training choices', () => {
  it('hard focus numbers', () => {
    expect(trainingFocusInfo.balanced).toMatchObject({ recovery: 11, developmentMultiplier: 1 });
    expect(trainingFocusInfo.recovery).toMatchObject({ recovery: 16, developmentMultiplier: 0.4 });
    expect(trainingFocusInfo.hard).toMatchObject({ recovery: 6, developmentMultiplier: 1.6 });
  });

  it('settles faster hard development against stronger recovery on the same seeded rounds', () => {
    const balanced = world(),
      youth = world('hard'),
      recovery = world('recovery');
    for (let round = 0; round < 6; round++)
      for (const w of [balanced, youth, recovery]) {
        // An order holds four rounds; the owner renews it every round here.
        w.trainingOrders = { assistant: { ...w.trainingOrders!.assistant!, rounds: 4 } };
        advanceRound(w, undefined, false);
      }
    expect(development(youth)).toBeGreaterThan(development(balanced));
    expect(development(balanced)).toBeGreaterThan(0);
    expect(development(recovery)).toBeGreaterThan(0);
    expect(development(balanced)).toBeGreaterThan(development(recovery));
    expect(fatigue(youth)).toBeGreaterThan(fatigue(balanced));
    expect(fatigue(balanced)).toBeGreaterThan(fatigue(recovery));
    for (const w of [balanced, youth, recovery]) validateWorld(w);
  });

  it('makes summaries, repeated focus changes and idle days grant no player growth or recovery', () => {
    const w = world(),
      before = canonical(w.players);
    const readBefore = canonical(w);
    expect(trainingSummary(w).focus).toBe('balanced');
    expect(trainingSummary(w).players[0].nextGain).toBeGreaterThan(0);
    expect(canonical(w)).toBe(readBefore);
    for (const focus of ['hard', 'recovery', 'balanced', 'hard'] as const) {
      operate(w, { type: 'coach-training', coach: 'assistant', focus, force: true });
      settleTraining(w);
    }
    advanceDays(w, 6, undefined, false);
    expect(w.round).toBe(0);
    expect(canonical(w.players)).toBe(before);
    expect(w.trainingAt).toBeUndefined();
    expect(w.events.filter((event) => event.kind === 'training-focus')).toHaveLength(4);
  });

  it('prevents a focus change or duplicate boundary from awarding extra growth or recovery', () => {
    const w = world('hard');
    advanceRound(w, undefined, false);
    const before = canonical(w.players);
    settleTraining(w);
    expect(canonical(w.players)).toBe(before);
    operate(w, { type: 'coach-training', coach: 'assistant', focus: 'recovery', force: true });
    settleTraining(w);
    expect(canonical(w.players)).toBe(before);
    expect(w.trainingAt).toBe(`${FOUNDING_YEAR}:1`);
    advanceRound(w, undefined, false);
    expect(development(w)).toBeGreaterThan(0);
    // The forced 회복 round still grows a little (×0.4, →CLUB-11).
    expect(development(w)).toBeGreaterThan(
      JSON.parse(before).reduce(
        (sum: number, player: { developed?: number }) => sum + (player.developed || 0),
        0,
      ),
    );
    expect(w.trainingAt).toBe(`${FOUNDING_YEAR}:2`);
  });

  it('preserves focus, actual development and the boundary guard across export/import', async () => {
    const w = world('hard');
    advanceRound(w, undefined, false);
    const restored = (await decode(await encode(w, 1, 0))).world;
    expect(canonical(restored)).toBe(canonical(w));
    const before = canonical(restored);
    settleTraining(restored);
    expect(canonical(restored)).toBe(before);
    const continuous = structuredClone(w);
    advanceRound(continuous, undefined, false);
    advanceRound(restored, undefined, false);
    expect(canonical(restored)).toBe(canonical(continuous));
  });

  it('accepts older saves without fields and lets the assistant pick at the next round', async () => {
    const old = world();
    delete old.trainingOrders;
    for (const player of old.players) player.fatigue = 0;
    expect(old.trainingOrders).toBeUndefined();
    expect(old.trainingAt).toBeUndefined();
    expect(old.players.every((player) => player.developed === undefined)).toBe(true);
    const restored = (await decode(await encode(old, 1, 0))).world;
    // A fresh squad of 20-year-olds in good spirits: the assistant trains them hard (→CLUB-13).
    expect(trainingSummary(restored).focus).toBe('hard');
    advanceRound(restored, undefined, false);
    expect(restored.trainingAt).toBe(`${FOUNDING_YEAR}:1`);
    expect(development(restored)).toBeGreaterThan(0);
    validateWorld(restored);
  });

  it('growth spreads by position weights', () => {
    const w = world('hard'),
      player = w.players.find((candidate) => candidate.position === 'CM')!;
    for (const a of ATTRIBUTES) player.attrs[a] = 40;
    const weights = weightsFor('CM');
    w.round = 1;
    settleTraining(w);
    const gained = (a: (typeof ATTRIBUTES)[number]) => player.attrs[a] - 40;
    expect(gained('passing')).toBeGreaterThan(gained('vision'));
    expect(gained('vision')).toBeGreaterThan(gained('dribbling'));
    expect(gained('dribbling')).toBeGreaterThan(0);
    for (const a of ATTRIBUTES) if (!weights[a]) expect(gained(a)).toBe(0);
    expect(player.developed).toBeCloseTo(ovr(player) - 40, 1);
  });

  it('stops growth at potential and records only actual gains', () => {
    const w = world('hard'),
      player = w.players.find((candidate) => candidate.position === 'CM')!;
    for (const a of ATTRIBUTES) player.attrs[a] = 60;
    player.potential = 60.05;
    w.round = 1;
    settleTraining(w);
    expect(ovr(player)).toBeLessThanOrEqual(60.05 + 1e-9);
    const earned = player.developed;
    const before = { ...player.attrs };
    w.round++;
    settleTraining(w);
    expect(player.developed).toBe(earned);
    expect(player.attrs).toEqual(before);
  });

  it('recovery still grows a little', () => {
    const rested = world('recovery'),
      worked = world();
    for (const w of [rested, worked]) {
      w.round = 1;
      settleTraining(w);
    }
    expect(development(rested)).toBeGreaterThan(0);
    expect(development(rested)).toBeLessThan(development(worked) * 0.5);
  });

  it('uses each player potential rather than team strength for annual development', () => {
    const weak = world(),
      strong = world();
    for (let index = 1; index < weak.players.length; index++)
      for (const a of ATTRIBUTES) {
        weak.players[index].attrs[a] = 20;
        strong.players[index].attrs[a] = 95;
      }
    developAnnually(weak, weak.players[0]);
    developAnnually(strong, strong.players[0]);
    expect(canonical(weak.players[0])).toBe(canonical(strong.players[0]));
    expect(ovr(weak.players[0])).toBeGreaterThan(40);
    expect(weak.players[0].developed).toBeCloseTo(ovr(weak.players[0]) - 40, 1);
  });

  it('makes manager youth skill, the training ground and younger age help uncapped development', () => {
    const gain = (youth: number, ground: number, age = 20) => {
      const w = world(),
        player = w.players[0];
      w.manager.youth = youth;
      w.trainingGround = ground;
      player.born = w.year - age;
      for (const a of ATTRIBUTES) player.attrs[a] = 60;
      player.potential = 70;
      w.round = 1;
      settleTraining(w);
      return ovr(player) - 60;
    };
    expect(gain(100, 0)).toBeGreaterThan(gain(0, 0));
    expect(gain(60, 5)).toBeGreaterThan(gain(60, 0));
    expect(gain(60, 0, 20)).toBeGreaterThan(gain(60, 0, 26));
  });

  it('keeps young annual growth within ceilings while older players still decline', () => {
    const w = world(),
      young = w.players[0],
      older = w.players[1];
    young.potential = 70;
    for (const a of ATTRIBUTES) young.attrs[a] = 95;
    developAnnually(w, young);
    expect(ovr(young)).toBe(95);
    expect(young.developed).toBeUndefined();
    older.born = w.year - 32;
    for (const a of ATTRIBUTES) older.attrs[a] = 80;
    older.developed = 4.25;
    developAnnually(w, older);
    expect(ovr(older)).toBeLessThan(80);
    expect(ovr(older)).toBeGreaterThan(78);
    expect(older.developed).toBe(4.25);
  });

  it('quantizes new gains and caps compact accumulated development', () => {
    const w = world('hard');
    w.round = 1;
    w.players[0].developed = 499.99;
    settleTraining(w);
    expect(w.players[0].developed).toBe(500);
    for (const player of activePlayers(w)) {
      for (const value of [...ATTRIBUTES.map((a) => player.attrs[a]), player.developed || 0])
        expect(value * 100).toBeCloseTo(Math.round(value * 100), 8);
    }
    expect(
      w.events.filter((event) => event.kind !== 'founding' && event.kind !== 'training-focus'),
    ).toEqual([]);
  });

  it('developmentOutlook multiplies the same terms a settled round uses', () => {
    for (const style of ['developer', 'firefighter'] as const) {
      const w = world('hard');
      w.policy = { ...policyOf(w), support: 4 };
      w.trainingGround = 3;
      w.manager.youth = 70;
      w.manager.style = style;
      w.direction = { debut: 'early' };
      w.staff = w.staff!.map((member) =>
        member.role === 'assistant'
          ? { ...member, ability: 80, trait: 'developer' as const }
          : member.role === 'defense'
            ? { ...member, ability: 20 }
            : member,
      );
      w.players.forEach((player, index) => {
        player.born = w.year - (17 + (index % 10));
        player.potential = 44 + (index % 7) * 3;
      });
      const read = canonical(w),
        outlook = developmentOutlook(w);
      expect(canonical(w)).toBe(read);
      const value = (key: string) => outlook.factors.find((factor) => factor.key === key)!.value;
      expect(value('focus')).toBe(trainingFocusInfo.hard.developmentMultiplier);
      expect(value('investment')).toBe(1.12);
      expect(value('build-youth')).toBe(1.2);
      expect(value('coaches-youth')).toBe(1.3);
      expect(value(style === 'developer' ? 'style-youth' : 'style')).toBe(
        style === 'developer' ? 1.3 : 0.85,
      );
      expect(outlook.skills.tackling).toBeLessThan(1);
      const before = structuredClone(w.players);
      w.round = 1;
      settleTraining(w);
      let checked = 0,
        young = 0;
      for (const was of before) {
        const age = w.year - was.born,
          gap = Math.max(0, was.potential - overall(was)),
          ageWeight = age < 21 ? 1 : age < 24 ? 0.85 : 0.65;
        // Above the base cap the round grows by the cap instead (→CLUB-12).
        if (age >= 27 || (gap / 400) * value('base') * ageWeight >= 0.12) continue;
        const product = outlook.factors
          .filter((factor) => factor.applies === 'all' || age <= 21)
          .reduce((all, factor) => all * factor.value, 1);
        const gain = Math.round((gap / 400) * ageWeight * product * 100) / 100,
          now = w.players.find((player) => player.id === was.id)!;
        // The round's gain spreads by the main position's weights at half its size (→PLAYER-15).
        const weights = weightsFor(was.position);
        const total = ATTRIBUTES.reduce((sum, a) => sum + weights[a], 0),
          squares = ATTRIBUTES.reduce((sum, a) => sum + weights[a] ** 2, 0);
        const scale = (Math.min(gain * 0.5, was.potential - mainOvr(was)) * total) / squares;
        for (const a of ATTRIBUTES) {
          const expected = weights[a]
            ? Math.round(scale * weights[a] * outlook.skills[a] * 100) / 100
            : 0;
          expect(Math.abs(now.attrs[a] - was.attrs[a] - expected)).toBeLessThanOrEqual(0.0100001);
        }
        checked++;
        if (age <= 21) young++;
      }
      expect(checked).toBeGreaterThan(15);
      expect(young).toBeGreaterThan(5);
      expect(checked - young).toBeGreaterThan(5);
    }
  });

  it('lists players aged 23 or under who can still grow, largest gap first', () => {
    const w = world();
    w.players.forEach((player, index) => {
      player.born = w.year - (18 + (index % 8));
      player.potential = 40 + ((index * 7) % 13);
      player.developed = index / 4;
    });
    const growing = developmentOutlook(w).growing;
    const expected = w.players.filter(
      (player) =>
        player.status === 'active' &&
        w.year - player.born <= 23 &&
        Math.round(player.potential) > overall(player),
    );
    expect(expected.length).toBeGreaterThan(5);
    expect(growing.map((entry) => entry.player.id).sort()).toEqual(
      expected.map((player) => player.id).sort(),
    );
    for (const [index, entry] of growing.entries()) {
      expect(entry.age).toBe(w.year - entry.player.born);
      expect(entry.age).toBeLessThanOrEqual(23);
      expect(entry.ability).toBe(overall(entry.player));
      expect(entry.potential).toBe(Math.round(entry.player.potential));
      expect(entry.gap).toBe(entry.potential - entry.ability);
      expect(entry.gap).toBeGreaterThan(0);
      expect(entry.developed).toBe(entry.player.developed);
      if (index) expect(growing[index - 1].gap).toBeGreaterThanOrEqual(entry.gap);
    }
    expect(new Set(growing.map((entry) => entry.gap)).size).toBeGreaterThan(2);
  });

  it('validates the saved training command at the worker boundary and rejects invalid plans', () => {
    const input = {
      protocol: 1,
      session: 'training',
      requestId: 'plan',
      expectedRevision: 0,
      generation: 1,
      parentGeneration: 0,
      body: {
        type: 'command',
        command: { type: 'coach-training', coach: 'assistant', focus: 'hard', force: true },
      },
    };
    expect(requestSchema.parse(input).body).toEqual(input.body);
    expect(() =>
      requestSchema.parse({
        ...input,
        body: {
          type: 'command',
          command: { type: 'coach-training', coach: 'assistant', focus: 'instant' },
        },
      }),
    ).toThrow();
    const w = world();
    w.players[0].developed = 501;
    expect(() => validateWorld(w)).toThrow();
  });
});
