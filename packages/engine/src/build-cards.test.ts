import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  academyIntakeOutlook,
  activePlayers,
  advanceRound,
  candidateStyles,
  clubOf,
  createWorld,
  gateProjection,
  managerOffers,
  managerStyleEffects,
  MANAGER_STYLES,
  moraleBaseline,
  operate,
  ownTacticalProfile,
  sponsorOffers,
  startingSquad,
  staffMember,
  STYLE_INFO,
  synergyEffects,
  synergyStates,
  tacticalProfile,
  transferOffers,
  buildEffects,
  BUILD_CARDS,
  BUILD_COMBINATIONS,
  BUILD_PRESETS,
  cardLines,
  composeBuild,
  effectLines,
  NEUTRAL_BUILD,
} from './index';
import { BUILD_OPTIONS, BUILD_SLOTS, LEGACY_VISION_BUILDS } from '../../contracts/src/build';
import { clubBuildSchema } from '../../contracts/src/schema';

const world = (seed = 'build-cards') =>
  createWorld({ country: 'ENG', name: 'Build FC', color: '#2a4d3c', seed, difficulty: 2 });

describe('manager styles', () => {
  it('offers four different schools a season, each a stable seeded order of all eight', () => {
    const w = world();
    expect(new Set(candidateStyles(w.seed, w.year))).toEqual(new Set(MANAGER_STYLES));
    expect(candidateStyles(w.seed, w.year)).toEqual(candidateStyles(w.seed, w.year));
    const styles = managerOffers(w).map((offer) => offer.style);
    expect(new Set(styles).size).toBe(4);
  });

  it('keeps the founding manager and interims exactly neutral', () => {
    const w = world();
    expect(w.manager.style).toBeUndefined();
    expect(managerStyleEffects(w)).toMatchObject({ pass: 0, defense: 0, strength: 0, growth: 1 });
    const squad = startingSquad(w, clubOf(w));
    expect(canonical(ownTacticalProfile(w, squad, 'balanced'))).toBe(
      canonical(tacticalProfile(squad, 'balanced')),
    );
    w.manager.style = 'gegenpress';
    w.manager.interim = true;
    expect(managerStyleEffects(w).lineHigh).toBe(0);
  });

  it('moves the own profile by the school it hires and states the tradeoff', () => {
    const w = world();
    const squad = startingSquad(w, clubOf(w));
    const plain = ownTacticalProfile(w, squad, 'possession');
    w.manager.style = 'positional';
    const positional = ownTacticalProfile(w, squad, 'possession');
    expect(positional.pass).toBeCloseTo(plain.pass + 2);
    expect(positional.shot).toBeCloseTo(plain.shot - 0.5);
    for (const style of MANAGER_STYLES) {
      expect(STYLE_INFO[style].pros.length).toBeGreaterThan(0);
      expect(STYLE_INFO[style].cons.length).toBeGreaterThan(0);
    }
  });

  it('brings a firefighter in for one season with an immediate lift', () => {
    let w = world();
    let index = managerOffers(w).findIndex((offer) => offer.style === 'firefighter');
    for (let year = w.year + 1; index < 0; year++) {
      w = { ...world(), year };
      index = managerOffers(w).findIndex((offer) => offer.style === 'firefighter');
    }
    w.morale = 50;
    operate(w, { type: 'hire', candidate: index });
    expect(w.manager.style).toBe('firefighter');
    expect(w.manager.until).toBe(w.year + 1);
    expect(w.morale).toBe(60);
    expect(moraleBaseline(w)).toBeGreaterThan(58);
    expect(w.events.at(-1)!.detail).toContain('소방수');
  });

  it('lets a developer field youngsters like the youth trait', () => {
    const w = world();
    const young = activePlayers(w).filter((p) => w.year - p.born <= 21);
    for (const player of young) player.attack = player.passing = player.defense = 50;
    w.manager.style = 'developer';
    expect(managerStyleEffects(w).youthSelection).toBe(true);
    expect(managerStyleEffects(w).youthGrowth).toBe(1.3);
  });
});

describe('club builds', () => {
  it('commits to one build change a season and records it', () => {
    const w = world();
    operate(w, { type: 'build', build: { fans: 'community', culture: 'family' } });
    expect(w.build).toEqual({ fans: 'community', culture: 'family' });
    expect(w.buildYear).toBe(w.year);
    expect(w.events.at(-1)).toMatchObject({
      kind: 'build',
      title: '구단 빌드 · 맞춤 빌드',
      detail: '지역 밀착 · 가족 같은 클럽',
    });
    expect(() => operate(w, { type: 'build', build: { revenue: 'commercial' } })).toThrow('한 번');
    // Re-sending the same build is not a change.
    operate(w, { type: 'build', build: { culture: 'family', fans: 'community' } });
    expect(() => operate(w, { type: 'build', build: { fans: 'nowhere' } as never })).toThrow(
      '빌드 카드',
    );
    for (let round = 0; round < 46; round++) advanceRound(w, undefined, false);
    validateWorld(w);
  });

  it('offers thousands of builds where every card is a trade-off', () => {
    expect(BUILD_COMBINATIONS).toBe(5 ** 6);
    for (const slot of BUILD_SLOTS)
      for (const option of BUILD_OPTIONS[slot]) {
        const lines = cardLines((BUILD_CARDS[slot] as Record<string, never>)[option]);
        expect(lines.pros.length, `${slot}:${option}`).toBeGreaterThan(0);
        expect(lines.cons.length, `${slot}:${option}`).toBeGreaterThan(0);
      }
    for (const preset of BUILD_PRESETS)
      expect(clubBuildSchema.parse(preset.build)).toEqual(preset.build);
    expect(new Set(BUILD_PRESETS.map((preset) => JSON.stringify(preset.build))).size).toBe(6);
  });

  it('adds additions and multiplies multipliers across slots, neutral when empty', () => {
    expect(composeBuild({})).toEqual(NEUTRAL_BUILD);
    const stacked = composeBuild({ revenue: 'commercial', fans: 'global', scouting: 'local' });
    expect(stacked.sponsor).toBeCloseTo(1.2 * 1.1);
    expect(stacked.marketingFans).toBeCloseTo(1.2 * 1.3);
    expect(stacked.gateDemand).toBeCloseTo(-0.03 - 0.04 + 0.02);
    expect(stacked.wage).toBeCloseTo(0.97);
    // Opposite cards that cancel out are not listed as a change.
    const lines = effectLines(composeBuild({ scouting: 'local', culture: 'family' }));
    expect([...lines.pros, ...lines.cons].some((line) => line.startsWith('선수 급여'))).toBe(false);
    expect(composeBuild({ revenue: 'owner' }).ownerCapital).toBe(5);
    expect(composeBuild({ revenue: 'members' }).ownerCapital).toBe(2);
  });

  it('changes the offers and demand it promises and leaves standard clubs exact', () => {
    const plain = world(),
      commercial = world(),
      community = world(),
      network = world();
    commercial.build = { revenue: 'commercial' };
    community.build = { revenue: 'members', fans: 'community' };
    network.build = { scouting: 'network' };
    expect(BigInt(sponsorOffers(commercial)[0].annual)).toBeGreaterThan(
      BigInt(sponsorOffers(plain)[0].annual),
    );
    expect(BigInt(sponsorOffers(community)[0].annual)).toBeLessThan(
      BigInt(sponsorOffers(plain)[0].annual),
    );
    expect(gateProjection(community).attendanceHigh).toBeGreaterThanOrEqual(
      gateProjection(plain).attendanceHigh,
    );
    expect(transferOffers(network).length).toBe(transferOffers(plain).length + 3);
    expect(buildEffects(plain)).toMatchObject({ sponsor: 1, saleFee: 1, gateDemand: 0 });
  });

  it('loads a rules 1.6–1.7 vision as the preset of the same name', () => {
    const w = world();
    const legacy = { ...structuredClone(w), vision: 'trading', visionYear: w.year };
    const loaded = validateWorld(legacy);
    expect(loaded.build).toEqual(LEGACY_VISION_BUILDS.trading);
    expect(loaded.buildYear).toBe(w.year);
    expect('vision' in loaded).toBe(false);
    expect(validateWorld({ ...structuredClone(w), vision: 'balanced' }).build).toBeUndefined();
    // Like any unknown field, an unrecognised vision is dropped: the club stays standard.
    expect(validateWorld({ ...structuredClone(w), vision: 'galacticos' }).build).toBeUndefined();
  });
});

describe('build synergies and odds', () => {
  it('lights a synergy only when every condition is met', () => {
    const w = world();
    expect(synergyStates(w).every((synergy) => !synergy.active)).toBe(true);
    expect(synergyEffects(w)).toMatchObject({ pass: 0, sponsor: 1, academyGrowth: 1 });
    w.build = { revenue: 'commercial' };
    w.policy = { support: 3, recruitment: 3, marketing: 4, academy: 1 };
    w.facilities = 6;
    const commercial = synergyStates(w).find((synergy) => synergy.id === 'commercial')!;
    expect(commercial.active).toBe(true);
    expect(synergyEffects(w).sponsor).toBeCloseTo(1.1);
    w.facilities = 5;
    expect(synergyStates(w).find((synergy) => synergy.id === 'commercial')!.active).toBe(false);
  });

  it('lights cross-slot build combos from the cards alone', () => {
    const w = world();
    const local = () => synergyStates(w).find((synergy) => synergy.id === 'local-heroes')!;
    w.build = { youth: 'homegrown', fans: 'community' };
    expect(local().active).toBe(false);
    w.build = { youth: 'partnership', fans: 'community', culture: 'family' };
    expect(local().active).toBe(true);
    expect(synergyEffects(w)).toMatchObject({ moraleBaseline: 2, academyPotential: 2 });
    w.build = { scouting: 'data', youth: 'pathway', market: 'showcase' };
    expect(synergyStates(w).find((synergy) => synergy.id === 'trading-machine')!.active).toBe(true);
  });

  it('states the exact odds of a golden prospect and raises them with academy investment', () => {
    const w = world();
    const base = academyIntakeOutlook(w);
    expect(base.golden).toBeGreaterThanOrEqual(0);
    expect(base.golden).toBeLessThanOrEqual(1);
    w.policy = { support: 3, recruitment: 3, marketing: 1, academy: 5 };
    const elite = academyIntakeOutlook(w);
    expect(elite.size).toBe(base.size + 2);
    expect(elite.golden).toBeGreaterThan(base.golden);
    expect(staffMember(w, 'youth')).toBeDefined();
  });
});
