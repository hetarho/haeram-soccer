import { describe, expect, it } from 'vitest';
import { canonical } from '../../contracts/src/index';
import { ATTRIBUTES } from '../../contracts/src/player';
import type { World } from '../../contracts/src/types';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { academyGrowth, academyIntakeSize, academyPotentialBonus } from './academy';
import { careerWorld } from './career.testkit';
import { talkGoodwill } from './contracts';
import { effectLedger, type EffectId, type LedgerEffect } from './effect-ledger';
import { gateProjection, operatingCosts } from './finance';
import { moraleBaseline } from './morale';
import { overall } from './player-state';
import { policyEffects, policyOf } from './policy';
import { scoutReach } from './scout-search';
import { staffEffects } from './staff';
import { developmentOutlook } from './training';

const world = () => cachedWorld('effect-ledger', () => careerWorld({ seed: 'effect-ledger' }));

/** The club as taken over, then three clubs whose every control and trait points elsewhere. */
const SETUPS: ((w: World) => void)[] = [
  () => {},
  (w) => {
    w.policy = {
      ...policyOf(w),
      support: 5,
      recruitment: 1,
      academy: 4,
      localInvest: 3,
      globalMarketing: 4,
      globalScouting: 5,
    };
    w.build = {
      youth: 'homegrown',
      scouting: 'data',
      market: 'selling',
      revenue: 'commercial',
      fans: 'community',
      culture: 'meritocracy',
    };
    w.direction = { ...w.direction, debut: 'early' };
    w.trainingGround = 3;
    w.academyFacility = 4;
    w.stadium = 4;
    w.manager.style = 'developer';
    w.manager.trust = 73;
    w.staff = w.staff!.map((member) => ({
      ...member,
      ability: 80,
      trait: member.role === 'director' ? ('negotiator' as const) : ('developer' as const),
    }));
    w.localBase = 64;
    w.globalReach = 40;
    w.owner!.traits = ['negotiator', 'talentSpotter'];
  },
  (w) => {
    w.policy = { ...policyOf(w), support: 1, recruitment: 5, tour: 3 };
    w.build = {
      youth: 'worldwide',
      scouting: 'proven',
      market: 'hold',
      revenue: 'frugal',
      fans: 'fortress',
      culture: 'stars',
    };
    w.manager.style = 'firefighter';
    w.manager.trust = 21;
    // Vacant scout and fitness posts read below a neutral volunteer.
    w.staff = w.staff!.filter((member) => member.role !== 'scout' && member.role !== 'fitness');
    w.globalReach = 70;
    w.morale = 82;
    w.owner!.traits = ['talisman', 'marketer', 'politician'];
  },
  (w) => {
    w.build = { scouting: 'local', market: 'showcase', revenue: 'members', fans: 'mutual' };
    w.build.culture = 'veterans';
    w.manager.style = 'headcoach';
    w.staff = w.staff!.map((member) => ({ ...member, ability: 30, trait: 'specialist' as const }));
    w.morale = 31;
  },
];

const ledgers = () =>
  SETUPS.map((setup) => {
    const w = world();
    setup(w);
    const read = canonical(w),
      ledger = effectLedger(w);
    // Reading the ledger changes nothing.
    expect(canonical(w)).toBe(read);
    const effect = (id: EffectId) => ledger.effects.find((item) => item.id === id)!;
    return { w, ledger, effect };
  });

/** What the factors make, as the value would without caps the effect does not have. */
function combined(effect: LedgerEffect) {
  const counted = effect.factors.filter((factor) => !factor.only);
  const raw = counted.reduce(
    (all, factor) => (effect.op === 'times' ? all * factor.value : all + factor.value),
    effect.op === 'times' ? 1 : 0,
  );
  const [low, high] = effect.bounds ?? [-Infinity, Infinity];
  return Math.min(high, Math.max(low, raw));
}

describe('effectLedger', () => {
  it('combines its factors into each value it reads', () => {
    for (const { ledger } of ledgers())
      for (const effect of ledger.effects) {
        if (effect.unit === 'money') {
          const sum = effect.factors.reduce((all, factor) => all + BigInt(factor.amount!), 0n);
          expect(sum.toString(), effect.id).toBe(effect.amount);
        } else if (effect.op !== 'none')
          expect(combined(effect), effect.id).toBeCloseTo(effect.value, 9);
      }
  });

  it('reads every value as the engine applies it', () => {
    for (const { w, effect } of ledgers()) {
      const outlook = developmentOutlook(w),
        product = (applies: 'all' | 'u21') =>
          outlook.factors
            .filter((factor) => factor.applies === 'all' || applies === 'u21')
            .reduce((all, factor) => all * factor.value, 1);
      expect(effect('growth').value).toBeCloseTo(product('all'), 9);
      expect(effect('growth').value * effect('youthGrowth').value).toBeCloseTo(product('u21'), 9);
      expect(effect('recovery').value).toBe(outlook.focus.recovery);
      expect(effect('morale').value).toBe(moraleBaseline(w));
      expect(effect('academyGrowth').value).toBe(academyGrowth(w));
      expect(effect('intake').value).toBe(academyIntakeSize(w));
      expect(effect('intakePotential').value).toBe(
        staffEffects(w).academyQuality + academyPotentialBonus(w),
      );
      const reach = scoutReach(w);
      expect(effect('scoutPerLine').value).toBe(reach.perLine);
      expect(effect('scoutAbroad').value).toBe(reach.abroad.length);
      expect(effect('scoutAbility').value).toBe(
        reach.ability[0] - policyEffects(policyOf(w)).offer.ability[0],
      );
      expect(effect('attendance').value).toBe(gateProjection(w).attendanceHigh);
      expect(effect('annualCosts').amount).toBe(operatingCosts(w).annual);
      const ordinary = w.players.find((player) => overall(player) < 70)!;
      expect(effect('goodwill').value).toBeCloseTo(talkGoodwill(w, ordinary).percent, 9);
    }
  });

  it('adds 스타 대우 for the players it reaches only', () => {
    const { w, effect } = ledgers()[2];
    const star = w.players[0];
    for (const attribute of ATTRIBUTES) star.attrs[attribute] = 95;
    expect(overall(star)).toBeGreaterThanOrEqual(70);
    const goodwill = effect('goodwill'),
      starShare = goodwill.factors.find((factor) => factor.only === 'star')!;
    expect(starShare.value).toBe(10);
    expect(
      Math.min(
        30,
        Math.max(
          -10,
          goodwill.factors.reduce((sum, factor) => sum + factor.value, 0),
        ),
      ),
    ).toBeCloseTo(talkGoodwill(w, star).percent, 9);
  });

  it('lists every control that can move a value, a neutral one at 1 or 0', () => {
    const { effect } = ledgers()[0];
    const sources = (id: EffectId) =>
      effect(id).factors.map((factor) =>
        'slot' in factor.source
          ? factor.source.slot
          : 'key' in factor.source
            ? factor.source.key
            : 'role' in factor.source
              ? factor.source.role
              : factor.source.kind,
      );
    expect(sources('youthGrowth')).toEqual([
      'manager',
      'assistant',
      'youth',
      'attack',
      'defense',
      'culture',
      'debut',
    ]);
    expect(effect('youthGrowth').factors.at(-1)!.value).toBe(1);
    expect(sources('wage')).toEqual(['scouting', 'revenue', 'culture']);
    expect(sources('incomingBids')).toEqual(['market']);
  });

  it('names active synergies and what a factor still needs', () => {
    const { ledger, effect } = ledgers()[1];
    const pipeline = ledger.synergies.find((synergy) => synergy.id === 'pipeline')!;
    const factor = effect('academyGrowth').factors.find(
      (item) => item.source.kind === 'synergy' && item.source.id === 'pipeline',
    )!;
    expect(factor.value).toBe(pipeline.active ? 1.15 : 1);
    expect(pipeline.conditions.length).toBeGreaterThan(0);
  });
});
