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
  buildLabel,
  buildTitleName,
  clubNews,
  readBuildTitle,
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
    operate(w, { type: 'hire', id: managerOffers(w)[index].id });
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
  it('applies a build at once and records it', () => {
    const w = world();
    operate(w, { type: 'build', build: { fans: 'community', culture: 'family' } });
    expect(w.build).toEqual({ fans: 'community', culture: 'family' });
    expect(w.events.at(-1)).toMatchObject({
      kind: 'build',
      title: '방향 · 맞춤 방향',
      detail: '지역 밀착 · 가족 같은 클럽',
    });
    // The next change applies at once too: there are no locks (→ECON-22).
    operate(w, { type: 'build', build: { revenue: 'commercial' } });
    expect(w.build).toEqual({ revenue: 'commercial' });
    operate(w, { type: 'build', build: { fans: 'community', culture: 'family' } });
    // Re-sending the same build is not a change.
    operate(w, { type: 'build', build: { culture: 'family', fans: 'community' } });
    expect(() => operate(w, { type: 'build', build: { fans: 'nowhere' } as never })).toThrow(
      '방향 카드',
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
    expect(new Set(BUILD_PRESETS.map((preset) => JSON.stringify(preset.build))).size).toBe(5);
  });

  it('names the strategy in the history: a saved name, a preset, the standard club or a mix', () => {
    const saved = world();
    operate(saved, { type: 'build', build: { youth: 'elite' }, name: '  우리 방식  ' });
    expect(saved.events.at(-1)!.title).toBe('방향 · 우리 방식');
    const preset = world();
    operate(preset, { type: 'build', build: BUILD_PRESETS[0].build });
    expect(preset.events.at(-1)!.title).toBe(`방향 · ${BUILD_PRESETS[0].label}`);
    expect(buildLabel({})).toBe('기본 방향');
    expect(buildLabel({ youth: 'elite' })).toBe('맞춤 방향');
  });

  it('reads build titles recorded before the rename', () => {
    expect(readBuildTitle('운영 전략 · 기본 전략')).toBe('방향 · 기본 방향');
    expect(readBuildTitle('운영 전략 · 맞춤 전략')).toBe('방향 · 맞춤 방향');
    expect(readBuildTitle(`운영 전략 · ${BUILD_PRESETS[0].label}`)).toBe(
      `방향 · ${BUILD_PRESETS[0].label}`,
    );
    expect(readBuildTitle('방향 · 우리 방식')).toBe('방향 · 우리 방식');
    expect(buildTitleName('운영 전략 · 맞춤 전략')).toBe('맞춤 방향');
    // Club news reads either title the same way; an older vision keeps its own word.
    const w = world();
    const club = clubOf(w).name;
    w.events.push(
      { ...w.events[0], kind: 'build', title: '운영 전략 · 맞춤 전략', detail: '지역 밀착' },
      { ...w.events[0], kind: 'build', title: '방향 · 우리 방식', detail: '성골 유스' },
      { ...w.events[0], kind: 'vision', title: '구단 비전 · 유스 명가', detail: '' },
    );
    const titles = clubNews(w).map((item) => item.title);
    expect(titles).toContain(`${club}, 방향 '맞춤 방향' 발표`);
    expect(titles).toContain(`${club}, 방향 '우리 방식' 발표`);
    expect(titles).toContain(`${club}, 구단 비전 '유스 명가' 발표`);
  });

  it('gives every preset one synergy it lights or aims at', () => {
    const lit = (id: string) => {
      const w = world();
      w.build = BUILD_PRESETS.find((preset) => preset.id === id)!.build;
      return synergyStates(w);
    };
    expect(lit('local-pride').find((s) => s.id === 'local-heroes')!.active).toBe(true);
    // 트레이딩 머신 aims at its synergy: its cards meet two conditions, 빠른 데뷔 the third.
    const trading = lit('trading').find((s) => s.id === 'trading-machine')!;
    expect(trading.conditions.filter((condition) => condition.met)).toHaveLength(2);
    // The others aim at a synergy the owner completes with dials, staff or the stadium.
    const commercial = lit('commercial').find((s) => s.id === 'commercial')!;
    expect(commercial.conditions[0].met).toBe(true);
    // Small starts keep morale level while wages fall.
    const shoestring = composeBuild(BUILD_PRESETS.find((p) => p.id === 'shoestring')!.build);
    expect(shoestring.moraleBaseline).toBe(0);
    expect(shoestring.wage).toBeCloseTo(0.97 * 0.94);
  });

  it('adds additions and multiplies multipliers across slots, neutral when empty', () => {
    expect(composeBuild({})).toEqual(NEUTRAL_BUILD);
    const stacked = composeBuild({ revenue: 'commercial', fans: 'families', scouting: 'local' });
    expect(stacked.sponsor).toBeCloseTo(1.2);
    expect(stacked.marketingFans).toBeCloseTo(1.2 * 1.1);
    expect(stacked.gateDemand).toBeCloseTo(-0.03 + 0.04 + 0.02);
    // 지역 상생 speeds the 지역 기반 the rows build (→ECON-34) at a small sponsor cost.
    expect(composeBuild({ fans: 'mutual' })).toMatchObject({ localBaseRate: 1.5, sponsor: 0.95 });
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
    expect(BigInt(sponsorOffers(commercial, 'local')[0].annual)).toBeGreaterThan(
      BigInt(sponsorOffers(plain, 'local')[0].annual),
    );
    expect(BigInt(sponsorOffers(community, 'local')[0].annual)).toBeLessThan(
      BigInt(sponsorOffers(plain, 'local')[0].annual),
    );
    expect(gateProjection(community).attendanceHigh).toBeGreaterThanOrEqual(
      gateProjection(plain).attendanceHigh,
    );
    expect(transferOffers(network).length).toBe(transferOffers(plain).length + 3);
    expect(buildEffects(plain)).toMatchObject({ sponsor: 1, saleFee: 1, gateDemand: 0 });
  });

  it('loads a rules 1.6–1.7 vision as the cards it stood for', () => {
    const w = world();
    const legacy = { ...structuredClone(w), vision: 'trading', visionYear: w.year };
    const loaded = validateWorld(legacy);
    expect(loaded.build).toEqual(LEGACY_VISION_BUILDS.trading);
    // Its yearly lock is gone with the yearly change (→SAVE-10).
    expect('buildYear' in loaded).toBe(false);
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
    w.policy = { support: 3, recruitment: 3, globalMarketing: 4 };
    w.stadium = 4;
    const commercial = synergyStates(w).find((synergy) => synergy.id === 'commercial')!;
    expect(commercial.active).toBe(true);
    expect(synergyEffects(w).sponsor).toBeCloseTo(1.1);
    w.stadium = 3;
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
    // 트레이딩 머신 asks 데뷔 시점 빠른 데뷔, the row that took 1군 직행 경로's place (→CLUB-32).
    w.build = { scouting: 'data', market: 'showcase' };
    expect(synergyStates(w).find((synergy) => synergy.id === 'trading-machine')!.active).toBe(
      false,
    );
    w.direction = { debut: 'early' };
    expect(synergyStates(w).find((synergy) => synergy.id === 'trading-machine')!.active).toBe(true);
  });

  it('states the exact odds of a golden prospect and raises them with academy investment', () => {
    const w = world();
    const base = academyIntakeOutlook(w);
    expect(base.golden).toBeGreaterThanOrEqual(0);
    expect(base.golden).toBeLessThanOrEqual(1);
    w.policy = { support: 3, recruitment: 3, academy: 5 };
    const elite = academyIntakeOutlook(w);
    expect(elite.size).toBe(base.size + 2);
    expect(elite.golden).toBeGreaterThan(base.golden);
    expect(staffMember(w, 'youth')).toBeDefined();
  });
});
