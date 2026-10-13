import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { TrainingFocus } from '../../contracts/src/types';
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
  roleSkills,
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
    difficulty: 2,
  });
  w.cash = '999999999';
  w.manager.youth = 60;
  w.tactic = 'balanced';
  // These cases exercise the owner's focus; delegated staff would rest this fatigue-50 squad.
  w.delegation = { ...w.delegation, training: false };
  for (const player of w.players) {
    player.born = w.year - 20;
    player.potential = 85;
    player.attack = player.passing = player.defense = player.keeper = player.stamina = 40;
    player.fatigue = 50;
    // Paid as the market rates them now, so nobody asks for a raise (→CLUB-26).
    player.wage = marketWage(w, player);
  }
  if (focus !== 'balanced') operate(w, { type: 'training', focus });
  return w;
}

const development = (w: ReturnType<typeof world>) =>
  w.players.reduce((sum, player) => sum + (player.developed || 0), 0);
const fatigue = (w: ReturnType<typeof world>) =>
  w.players.reduce((sum, player) => sum + player.fatigue, 0);

describe('earned player growth and training choices', () => {
  it('settles faster youth development against stronger recovery on the same seeded rounds', () => {
    const balanced = world(),
      youth = world('youth'),
      recovery = world('recovery');
    for (let round = 0; round < 6; round++) {
      advanceRound(balanced, undefined, false);
      advanceRound(youth, undefined, false);
      advanceRound(recovery, undefined, false);
    }
    expect(development(youth)).toBeGreaterThan(development(balanced));
    expect(development(balanced)).toBeGreaterThan(0);
    expect(development(recovery)).toBe(0);
    expect(fatigue(youth)).toBeGreaterThan(fatigue(balanced));
    expect(fatigue(balanced)).toBeGreaterThan(fatigue(recovery));
    expect(trainingFocusInfo.balanced.recovery).toBe(11);
    expect(trainingFocusInfo.youth.recovery).toBe(7);
    expect(trainingFocusInfo.recovery.recovery).toBe(16);
    for (const w of [balanced, youth, recovery]) validateWorld(w);
  });

  it('makes summaries, repeated focus changes and idle days grant no player growth or recovery', () => {
    const w = world(),
      before = canonical(w.players);
    const readBefore = canonical(w);
    expect(trainingSummary(w).focus).toBe('balanced');
    expect(trainingSummary(w).players[0].nextGain).toBeGreaterThan(0);
    expect(canonical(w)).toBe(readBefore);
    for (const focus of ['youth', 'recovery', 'balanced', 'youth'] as const) {
      operate(w, { type: 'training', focus });
      settleTraining(w);
    }
    advanceDays(w, 6, undefined, false);
    expect(w.round).toBe(0);
    expect(canonical(w.players)).toBe(before);
    expect(w.trainingAt).toBeUndefined();
    expect(w.events.filter((event) => event.kind === 'training-focus')).toHaveLength(4);
  });

  it('prevents a focus change or duplicate boundary from awarding extra growth or recovery', () => {
    const w = world('youth');
    advanceRound(w, undefined, false);
    const before = canonical(w.players);
    settleTraining(w);
    expect(canonical(w.players)).toBe(before);
    operate(w, { type: 'training', focus: 'recovery' });
    settleTraining(w);
    expect(canonical(w.players)).toBe(before);
    expect(w.trainingAt).toBe(`${FOUNDING_YEAR}:1`);
    advanceRound(w, undefined, false);
    expect(development(w)).toBeGreaterThan(0);
    expect(development(w)).toBe(
      JSON.parse(before).reduce(
        (sum: number, player: { developed?: number }) => sum + (player.developed || 0),
        0,
      ),
    );
    expect(w.trainingAt).toBe(`${FOUNDING_YEAR}:2`);
  });

  it('preserves focus, actual development and the boundary guard across export/import', async () => {
    const w = world('youth');
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

  it('accepts older saves without fields and applies balanced defaults at the next round', async () => {
    const old = world();
    expect(old.training).toBeUndefined();
    expect(old.trainingAt).toBeUndefined();
    expect(old.players.every((player) => player.developed === undefined)).toBe(true);
    const restored = (await decode(await encode(old, 1, 0))).world;
    expect(trainingSummary(restored).focus).toBe('balanced');
    advanceRound(restored, undefined, false);
    expect(restored.trainingAt).toBe(`${FOUNDING_YEAR}:1`);
    expect(development(restored)).toBeGreaterThan(0);
    validateWorld(restored);
  });

  it('caps primary skills, preserves above-potential values and records only actual gains', () => {
    const w = world('youth'),
      player = w.players.find((candidate) => candidate.role === 'MID')!;
    player.potential = 70;
    player.passing = 95;
    player.stamina = 69.99;
    w.round = 1;
    settleTraining(w);
    expect(player.passing).toBe(95);
    expect(player.stamina).toBe(70);
    expect(player.developed).toBeCloseTo(0.01, 8);
    const earned = player.developed;
    w.round++;
    settleTraining(w);
    expect(player.developed).toBe(earned);
    expect(player.stamina).toBe(70);
    expect(player.passing).toBe(95);
  });

  it('leaves fractional old-save attributes untouched during recovery training', () => {
    const w = world('recovery'),
      player = w.players[0];
    player.keeper = 45.123456;
    w.round = 1;
    settleTraining(w);
    expect(player.keeper).toBe(45.123456);
    expect(player.developed).toBeUndefined();
    expect(trainingSummary(w).players.every((prospect) => prospect.nextGain === 0)).toBe(true);
  });

  it('uses each player potential rather than team strength for annual development', () => {
    const weak = world(),
      strong = world();
    for (let index = 1; index < weak.players.length; index++) {
      for (const skill of ['attack', 'passing', 'defense', 'keeper', 'stamina'] as const) {
        weak.players[index][skill] = 20;
        strong.players[index][skill] = 95;
      }
    }
    developAnnually(weak, weak.players[0]);
    developAnnually(strong, strong.players[0]);
    expect(canonical(weak.players[0])).toBe(canonical(strong.players[0]));
    expect(weak.players[0].keeper).toBeGreaterThan(40);
    expect(weak.players[0].developed).toBeCloseTo(weak.players[0].keeper - 40, 8);
  });

  it('makes manager youth skill, facilities and younger age help uncapped development', () => {
    const gain = (youth: number, facilities: number, age = 20) => {
      const w = world(),
        player = w.players[0];
      w.manager.youth = youth;
      w.facilities = facilities;
      player.born = w.year - age;
      player.keeper = 60;
      player.potential = 70;
      w.round = 1;
      settleTraining(w);
      return player.keeper - 60;
    };
    expect(gain(100, 0)).toBeGreaterThan(gain(0, 0));
    expect(gain(60, 20)).toBeGreaterThan(gain(60, 0));
    expect(gain(60, 0, 20)).toBeGreaterThan(gain(60, 0, 26));
  });

  it('keeps young annual growth within ceilings while older players still decline', () => {
    const w = world(),
      young = w.players[0],
      older = w.players[1];
    young.potential = 70;
    young.keeper = 95;
    developAnnually(w, young);
    expect(young.keeper).toBe(95);
    expect(young.developed).toBeUndefined();
    older.born = w.year - 32;
    older.keeper = 80;
    older.developed = 4.25;
    developAnnually(w, older);
    expect(older.keeper).toBeLessThan(80);
    expect(older.keeper).toBeGreaterThan(78);
    expect(older.developed).toBe(4.25);
  });

  it('quantizes new gains and caps compact accumulated development', () => {
    const w = world('youth');
    w.round = 1;
    w.players[0].developed = 499.99;
    settleTraining(w);
    expect(w.players[0].developed).toBe(500);
    for (const player of activePlayers(w)) {
      for (const value of [
        player.attack,
        player.passing,
        player.defense,
        player.keeper,
        player.stamina,
        player.developed || 0,
      ])
        expect(value * 100).toBeCloseTo(Math.round(value * 100), 8);
    }
    expect(
      w.events.filter((event) => event.kind !== 'founding' && event.kind !== 'training-focus'),
    ).toEqual([]);
  });

  it('developmentOutlook multiplies the same terms a settled round uses', () => {
    for (const style of ['developer', 'firefighter'] as const) {
      const w = world('youth');
      w.policy = { ...policyOf(w), support: 4 };
      w.facilities = 6;
      w.manager.youth = 70;
      w.manager.style = style;
      w.build = { youth: 'pathway' };
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
      expect(value('focus')).toBe(trainingFocusInfo.youth.developmentMultiplier);
      expect(value('investment')).toBe(1.12);
      expect(value('build-youth')).toBe(1.2);
      expect(value('coaches-youth')).toBe(1.3);
      expect(value(style === 'developer' ? 'style-youth' : 'style')).toBe(
        style === 'developer' ? 1.3 : 0.85,
      );
      expect(outlook.skills.defense).toBeLessThan(1);
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
        for (const skill of roleSkills[was.role]) {
          const multiplier = outlook.skills[skill],
            expected = multiplier === 1 ? gain : Math.round(gain * multiplier * 100) / 100;
          expect(Math.abs(now[skill] - was[skill] - expected)).toBeLessThanOrEqual(0.0100001);
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
      body: { type: 'command', command: { type: 'training', focus: 'youth' } },
    };
    expect(requestSchema.parse(input).body).toEqual(input.body);
    expect(() =>
      requestSchema.parse({
        ...input,
        body: { type: 'command', command: { type: 'training', focus: 'instant' } },
      }),
    ).toThrow();
    const w = world();
    w.players[0].developed = 501;
    expect(() => validateWorld(w)).toThrow();
  });
});
