import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Player, TrainingFocus } from '../../contracts/src/types';
import { ATTRIBUTES } from '../../contracts/src/player';
import { mainOvr, TRAINING_GAIN, weightsFor } from './player';
import { settleRate } from './adaptation';
import { TRAINING_INJURY, trainingInjuryChance } from './careers';
import { decode, encode } from '../../../apps/web/src/adapters/persistence';
import { requestSchema } from '../../../apps/web/src/runtime/protocol';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import {
  activePlayers,
  advanceDays,
  advanceRound,
  createWorld,
  developAnnually,
  developmentOutlook,
  focusFor,
  marketWage,
  overall,
  policyOf,
  settleTraining,
  trainingFocusInfo,
  trainingSummary,
  FOUNDING_YEAR,
} from './index';

/**
 * Each focus's fatigue: the assistant's rule trains this young squad in good spirits 하드 below 15,
 * 회복 from 30 and 균형 between (→CLUB-13), short of the 40 at which he rests a player alone.
 */
const TIRED: Record<TrainingFocus, number> = { hard: 10, balanced: 20, recovery: 35 };

/** The founded club, tired as far as makes the assistant train it `focus`. */
function world(focus: TrainingFocus = 'balanced') {
  const w = cachedWorld('world', founded);
  for (const player of w.players) player.fatigue = TIRED[focus];
  return w;
}

/** The club on the pre-feature path: training, not the match model, is the subject. */
function founded() {
  const w = createWorld(
    {
      country: 'ENG',
      name: 'Academy United',
      color: '#224433',
      seed: 'training-progress',
      level: 'easy' as const,
    },
    DISABLED_RELEASE,
  );
  w.settings = legacySettings(2);
  w.cash = '999999999';
  w.manager.youth = 60;
  w.tactic = 'balanced';
  for (const player of w.players) {
    player.born = w.year - 20;
    w.people![player.id].born = player.born;
    player.potential = 85;
    for (const a of ATTRIBUTES) player.attrs[a] = 40;
    player.personality = { ...player.personality, professionalism: 3 };
    w.people![player.id].professionalism = 3;
    // Paid as the market rates them now, so nobody asks for a raise (→CLUB-26).
    player.wage = marketWage(w, player);
  }
  return w;
}

/** A fresh world after its first round. */
const firstRound = () =>
  cachedWorld('hard:round-1', () => {
    const w = world('hard');
    advanceRound(w, undefined, false);
    return w;
  });

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

  it('settles faster hard development against stronger recovery over the same rounds', () => {
    const focuses = ['balanced', 'hard', 'recovery'] as const,
      worlds = focuses.map((focus) => world(focus)),
      recovered = [0, 0, 0];
    // Six settled rounds, each squad as tired before every one: the same focus all along.
    for (let round = 1; round <= 6; round++)
      worlds.forEach((w, i) => {
        for (const player of w.players) player.fatigue = TIRED[focuses[i]];
        const before = fatigue(w);
        w.round = round;
        settleTraining(w);
        recovered[i] += before - fatigue(w);
      });
    const [balanced, youth, recovery] = worlds;
    expect(development(youth)).toBeGreaterThan(development(balanced));
    expect(development(balanced)).toBeGreaterThan(0);
    expect(development(recovery)).toBeGreaterThan(0);
    expect(development(balanced)).toBeGreaterThan(development(recovery));
    // 하드 recovers 6 a round, 균형 11 and 회복 16 (→CLUB-11).
    expect(recovered[0]).toBeGreaterThan(recovered[1]);
    expect(recovered[2]).toBeGreaterThan(recovered[0]);
    // Rounds were set by hand; back on the calendar's round the worlds validate.
    for (const w of [balanced, youth, recovery]) {
      w.round = 0;
      validateWorld(w);
    }
  });

  it('makes summaries, settling before the first round and idle days grant no growth or recovery', () => {
    const w = world(),
      before = canonical(w.players);
    const readBefore = canonical(w);
    expect(trainingSummary(w).focus).toBe('balanced');
    expect(trainingSummary(w).players[0].nextGain).toBeGreaterThan(0);
    expect(canonical(w)).toBe(readBefore);
    settleTraining(w);
    advanceDays(w, 6, undefined, false);
    expect(w.round).toBe(0);
    expect(canonical(w.players)).toBe(before);
    expect(w.trainingAt).toBeUndefined();
  });

  it('prevents a duplicate boundary from awarding extra growth or recovery', () => {
    const w = firstRound();
    const before = canonical(w.players);
    settleTraining(w);
    settleTraining(w);
    expect(canonical(w.players)).toBe(before);
    expect(w.trainingAt).toBe(`${FOUNDING_YEAR}:1`);
    advanceRound(w, undefined, false);
    expect(development(w)).toBeGreaterThan(0);
    // The next round grows them again, whatever the assistant chose for it (→CLUB-11).
    expect(development(w)).toBeGreaterThan(
      JSON.parse(before).reduce(
        (sum: number, player: { developed?: number }) => sum + (player.developed || 0),
        0,
      ),
    );
    expect(w.trainingAt).toBe(`${FOUNDING_YEAR}:2`);
  });

  it('preserves focus, actual development and the boundary guard across export/import', async () => {
    const w = firstRound();
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
    delete old.hardStreak;
    for (const player of old.players) player.fatigue = 0;
    expect(old.hardStreak).toBeUndefined();
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
    expect(w.events.filter((event) => event.kind !== 'founding')).toEqual([]);
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

  it('rejects the withdrawn training command at the worker boundary and invalid growth', () => {
    // The owner no longer suggests or forces a focus (→STAFF-19 withdrawn, →CLUB-13).
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
    expect(() => requestSchema.parse(input)).toThrow();
    const w = world();
    w.players[0].developed = 501;
    expect(() => validateWorld(w)).toThrow();
  });
});

describe('training per player, its costs and growth (→CLUB-11, CLUB-23, PLAYER-12, PLAYER-15–17)', () => {
  /** Two identical worlds: one to change, one to compare against. */
  const twins = (focus: TrainingFocus = 'balanced') => [world(focus), world(focus)] as const;
  const cm = (w: ReturnType<typeof world>) => w.players.find((p) => p.position === 'CM')!;

  it('player rule rests the tired', () => {
    const w = world('hard'),
      p = cm(w),
      fresh = w.players.find((other) => other.id !== p.id)!;
    p.fatigue = 45;
    // The squad trains 하드; the assistant still rests a player at 40+.
    expect(focusFor(w, p)).toBe('recovery');
    expect(focusFor(w, fresh)).toBe('hard');
    w.round = 1;
    settleTraining(w);
    expect(p.fatigue).toBe(45 - 16);
    expect(fresh.fatigue).toBe(TIRED.hard - 6);
    // 회복 grows him less than his team-mates' 하드 (×0.4 against ×1.6).
    expect(p.developed!).toBeLessThan(fresh.developed!);
    // The summary names him as resting by the assistant's rule.
    p.fatigue = 45;
    expect(trainingSummary(w).own).toEqual([{ player: p, focus: 'recovery' }]);
  });

  it('hard training injures', () => {
    expect(trainingInjuryChance({ fatigue: 0 } as Player)).toBe(TRAINING_INJURY);
    expect(trainingInjuryChance({ fatigue: 90 } as Player)).toBeGreaterThan(TRAINING_INJURY);
    const [hard, balanced] = [world('hard'), world('balanced')];
    for (const w of [hard, balanced])
      for (let round = 1; round <= 60; round++) {
        for (const p of w.players) p.fatigue = TIRED[w === hard ? 'hard' : 'balanced'];
        w.round = round;
        settleTraining(w);
      }
    const hurt = (w: ReturnType<typeof world>) =>
      w.events.filter((event) => event.kind === 'injury' && event.title.includes('훈련 중'));
    expect(hurt(hard).length).toBeGreaterThan(0);
    expect(hurt(balanced)).toEqual([]);
    expect(hard.inbox!.some((item) => item.title.includes('훈련 중'))).toBe(true);
    hard.round = 0;
    validateWorld(hard);
  });

  it('adaptation capped by training', () => {
    const w = world('balanced'),
      p = cm(w);
    p.personality = { ...p.personality, adaptability: 3 };
    p.adaptation = 0.5;
    w.round = 1;
    settleTraining(w);
    expect(p.adaptation).toBeCloseTo(0.5 + TRAINING_GAIN.balanced * settleRate(w, p), 4);
    p.adaptation = 0.799;
    w.round = 2;
    settleTraining(w);
    expect(p.adaptation).toBe(0.8);
    // Past 0.80 only starts take him further; training leaves him where he is.
    p.adaptation = 0.85;
    w.round = 3;
    settleTraining(w);
    expect(p.adaptation).toBe(0.85);
    // 하드 settles faster than 회복.
    const [hard, rest] = [world('hard'), world('recovery')];
    for (const one of [hard, rest]) {
      cm(one).adaptation = 0.5;
      one.round = 1;
      settleTraining(one);
    }
    expect(cm(hard).adaptation).toBeGreaterThan(cm(rest).adaptation);
  });

  it('professional grows faster', () => {
    const [w, twin] = twins('hard');
    cm(w).personality = { ...cm(w).personality, professionalism: 5 };
    cm(twin).personality = { ...cm(twin).personality, professionalism: 1 };
    for (const one of [w, twin])
      for (let round = 1; round <= 4; round++) {
        one.round = round;
        settleTraining(one);
      }
    expect(cm(w).developed!).toBeGreaterThan(cm(twin).developed! * 1.5);
  });

  it('past potential only when settled', () => {
    const [w, twin] = twins('hard');
    for (const one of [w, twin]) {
      const p = cm(one);
      for (const a of ATTRIBUTES) p.attrs[a] = 60;
      p.potential = 60;
    }
    cm(w).adaptation = 0.95;
    cm(twin).adaptation = 0.85;
    for (const one of [w, twin])
      for (let round = 1; round <= 8; round++) {
        one.round = round;
        settleTraining(one);
      }
    expect(ovr(cm(twin))).toBe(60);
    expect(ovr(cm(w))).toBeGreaterThan(60);
    // The curve flattens sharply: eight rounds past potential stay well short of a point.
    expect(ovr(cm(w))).toBeLessThan(60.5);
    // A season's growth past it is cut the same way, and none for the unsettled.
    const settled = cm(w),
      before = ovr(settled);
    developAnnually(w, settled);
    developAnnually(twin, cm(twin));
    expect(ovr(settled) - before).toBeLessThan(1);
  });

  it('pace fades before vision', () => {
    const w = world(),
      p = cm(w);
    p.born = w.year - 30;
    for (const a of ATTRIBUTES) p.attrs[a] = 60;
    p.potential = 70;
    developAnnually(w, p);
    // 속도 declines from 29 by 2 a season; 시야 still grows until 32 (±0.5 noise each).
    expect(p.attrs.pace).toBeLessThanOrEqual(58.5);
    expect(p.attrs.pace).toBeGreaterThanOrEqual(57.5);
    expect(p.attrs.vision).toBeGreaterThanOrEqual(59.5);
  });
});
