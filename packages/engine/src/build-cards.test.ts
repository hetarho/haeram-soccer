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
  visionEffects,
} from './index';

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

describe('club visions', () => {
  it('commits to one change a season and records it', () => {
    const w = world();
    operate(w, { type: 'vision', vision: 'community' });
    expect(w.vision).toBe('community');
    expect(w.events.at(-1)).toMatchObject({ kind: 'vision' });
    expect(() => operate(w, { type: 'vision', vision: 'commercial' })).toThrow('한 번');
    for (let round = 0; round < 46; round++) advanceRound(w, undefined, false);
    validateWorld(w);
  });

  it('changes the offers and demand it promises and leaves balanced clubs exact', () => {
    const plain = world(),
      commercial = world(),
      community = world();
    commercial.vision = 'commercial';
    community.vision = 'community';
    expect(BigInt(sponsorOffers(commercial)[0].annual)).toBeGreaterThan(
      BigInt(sponsorOffers(plain)[0].annual),
    );
    expect(BigInt(sponsorOffers(community)[0].annual)).toBeLessThan(
      BigInt(sponsorOffers(plain)[0].annual),
    );
    expect(gateProjection(community).attendanceHigh).toBeGreaterThanOrEqual(
      gateProjection(plain).attendanceHigh,
    );
    const academy = world();
    academy.vision = 'academy';
    expect(transferOffers(academy).length).toBe(transferOffers(plain).length - 2);
    expect(visionEffects(plain)).toMatchObject({ sponsor: 1, saleFee: 1, gateDemand: 0 });
  });
});

describe('build synergies and odds', () => {
  it('lights a synergy only when every condition is met', () => {
    const w = world();
    expect(synergyStates(w).every((synergy) => !synergy.active)).toBe(true);
    expect(synergyEffects(w)).toMatchObject({ pass: 0, sponsor: 1, academyGrowth: 1 });
    w.vision = 'commercial';
    w.policy = { support: 3, recruitment: 3, marketing: 4, academy: 1 };
    w.facilities = 6;
    const commercial = synergyStates(w).find((synergy) => synergy.id === 'commercial')!;
    expect(commercial.active).toBe(true);
    expect(synergyEffects(w).sponsor).toBeCloseTo(1.1);
    w.facilities = 5;
    expect(synergyStates(w).find((synergy) => synergy.id === 'commercial')!.active).toBe(false);
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
