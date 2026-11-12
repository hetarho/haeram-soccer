import { ATTRIBUTES } from '../../contracts/src/player';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import {
  activePlayers,
  advanceRound,
  candidateStyles,
  clubOf,
  gateProjection,
  managerCandidates,
  managerOffers,
  openManagerMarket,
  managerStyleEffects,
  MANAGER_STYLES,
  moraleBaseline,
  operate,
  ownTacticalProfile,
  sponsorOffers,
  startingSquad,
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
  BUILD_PRESETS,
  buildOf,
  DIRECTION_DEFAULT,
  DIRECTION_KEYS,
  directionOf,
  POLICY_DEFAULTS,
  POLICY_KEYS,
  policyOf,
  presetBoard,
  composeBuild,
  NEUTRAL_BUILD,
} from './index';
import { BUILD_OPTIONS, BUILD_SLOTS } from '../../contracts/src/build';
import type { BuildCard, BuildEffects } from './build';
import { clubBuildSchema } from '../../contracts/src/schema';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import { simulatedWorld } from '../../../tests/fixtures/worlds';
import { holdRows } from './testing';
import { careerWorld } from './career.testkit';

/** The club on the released model: strategy cards, not the match model, are the subject. */
const world = (seed = 'build-cards') => simulatedWorld({ country: 'ENG', seed });
/** Which way each card effect helps the club; owner capital is no gain to it (→ECON-22). */
const HELPS: Partial<Record<keyof BuildEffects, 1 | -1>> = {
  academyIntake: 1,
  academyPotential: 1,
  youthGrowth: 1,
  // The scout's search (→CLUB-51): listing more, an abler band, reach abroad and prospects first
  // help; listing nobody abroad and never ranking potential first cost.
  scoutPerLine: 1,
  scoutAbilityShift: 1,
  scoutAbroadExtra: 1,
  scoutPotentialFirst: 1,
  scoutNeverPotentialFirst: -1,
  scoutNoAbroad: -1,
  incomingBids: 1,
  saleFee: 1,
  sponsor: 1,
  campaignIncome: 1,
  marketingFans: 1,
  localBaseRate: 1,
  gateDemand: 1,
  winFans: 1,
  homeStrength: 1,
  wage: -1,
  moraleBaseline: 1,
};
/** A club founded with a direction preset (→WEB-15), on the founding day. */
const founded = (preset: string, seed = `preset-${preset}`) => careerWorld({ seed, preset });

describe('manager styles', () => {
  it('offers four different schools a season, each a stable seeded order of all eight', () => {
    const w = world();
    expect(new Set(candidateStyles(w.seed, w.year))).toEqual(new Set(MANAGER_STYLES));
    expect(candidateStyles(w.seed, w.year)).toEqual(candidateStyles(w.seed, w.year));
    const styles = managerOffers(w).map((offer) => offer.style);
    expect(new Set(styles).size).toBe(4);
  });

  it('keeps the founding manager and interims exactly neutral', () => {
    // No career starts with the neutral founder any more: the taken-over manager keeps his school
    // (→OWNER-4), so a manager without one stands in for the founder STAFF-14 keeps neutral.
    const w = world();
    expect(w.manager.style).toBeDefined();
    delete w.manager.style;
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
    // From a manager without a school: the taken-over one brings his own (→OWNER-4).
    delete w.manager.style;
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
    // The takeover stored its season's market (→STAFF-17), so a later season's free agents come
    // in by opening that season's market, as a season close renews it.
    const firefighter = (w: ReturnType<typeof world>) =>
      managerCandidates(w).find(
        (offer) => offer.source === 'free' && offer.style === 'firefighter',
      );
    let w = world();
    for (let year = w.year + 1; !firefighter(w); year++) {
      w = { ...world(), year };
      openManagerMarket(w);
    }
    w.morale = 50;
    operate(w, { type: 'hire', id: firefighter(w)!.id });
    expect(w.manager.style).toBe('firefighter');
    expect(w.manager.until).toBe(w.year + 1);
    expect(w.morale).toBe(60);
    expect(moraleBaseline(w)).toBeGreaterThan(58);
    expect(w.events.at(-1)!.detail).toContain('소방수');
  });

  it('lets a developer field youngsters like the youth trait', () => {
    const w = world();
    const young = activePlayers(w).filter((p) => w.year - p.born <= 21);
    for (const player of young) for (const a of ATTRIBUTES) player.attrs[a] = 50;
    w.manager.style = 'developer';
    expect(managerStyleEffects(w).youthSelection).toBe(true);
    expect(managerStyleEffects(w).youthGrowth).toBe(1.3);
  });
});

describe('club builds', () => {
  it('plays a season with the build it holds', () => {
    // The build is held as founded or saved (→ECON-22); 46 rounds are built once.
    const { before, after } = cachedWorld('build-season', () => {
      const w = holdRows(world(), { build: { fans: 'community', culture: 'family' } });
      const before = structuredClone(w);
      for (let round = 0; round < 46; round++) advanceRound(w, undefined, false);
      return { before, after: w };
    });
    expect(before.build).toEqual({ fans: 'community', culture: 'family' });
    expect(after.build).toEqual(before.build);
    validateWorld(after);
  });

  it('makes every card a trade-off', () => {
    // Every card has a gain and a cost (→ECON-22), except that 구단주 투자 keeps only its wage
    // cost: the owner adds no capital to the club (→ECON-11).
    for (const slot of BUILD_SLOTS)
      for (const option of BUILD_OPTIONS[slot]) {
        const { effects } = (BUILD_CARDS[slot] as Record<string, BuildCard>)[option];
        const signs = (Object.entries(effects) as [keyof BuildEffects, number][]).flatMap(
          ([name, value]) => {
            const helps = HELPS[name];
            if (!helps) return [];
            return [Math.sign(NEUTRAL_BUILD[name] === 1 ? value - 1 : value) * helps];
          },
        );
        if (slot !== 'revenue' || option !== 'owner')
          expect(signs, `${slot}:${option}`).toContain(1);
        expect(signs, `${slot}:${option}`).toContain(-1);
      }
    for (const preset of BUILD_PRESETS)
      expect(clubBuildSchema.parse(preset.build)).toEqual(preset.build);
    expect(new Set(BUILD_PRESETS.map((preset) => JSON.stringify(preset.build))).size).toBe(7);
  });

  it('names the direction: a preset, the standard club or a mix', () => {
    expect(buildLabel(BUILD_PRESETS[0].build)).toBe(BUILD_PRESETS[0].label);
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

  it('fills every row with a preset at founding: the rows it names, every other row at its default', () => {
    expect(BUILD_PRESETS.map((preset) => preset.id)).toEqual([
      'local-pride',
      'youth-academy',
      'trading',
      'commercial',
      'global',
      'ambition',
      'shoestring',
    ]);
    for (const preset of BUILD_PRESETS) {
      const board = presetBoard(preset);
      expect(clubBuildSchema.parse(board.build)).toEqual(preset.build);
      for (const key of POLICY_KEYS)
        expect(board.policy[key], `${preset.id}:${key}`).toBe(
          preset.rows.policy?.[key] ?? POLICY_DEFAULTS[key],
        );
      expect(board.ticket).toBe(preset.rows.ticket ?? 0.05);
      // A club founded with it holds the whole board, each row as the engine reads it.
      const w = founded(preset.id);
      validateWorld(w);
      expect(buildOf(w)).toEqual(board.build);
      expect(policyOf(w)).toEqual(board.policy);
      expect(w.ticket).toBe(board.ticket);
      for (const key of DIRECTION_KEYS)
        expect(directionOf(w, key), `${preset.id}:${key}`).toBe(
          board.direction[key] ?? DIRECTION_DEFAULT[key],
        );
    }
    const youth = presetBoard(BUILD_PRESETS.find((preset) => preset.id === 'youth-academy')!);
    expect(youth.policy.academy).toBe(4);
    expect(youth.direction).toMatchObject({
      debut: 'early',
      manager: 'developer',
      coaches: 'elite',
    });
  });

  it('lights 글로벌 스카우팅 with all three conditions and not with two', () => {
    const w = world('global-scouting');
    const state = () => synergyStates(w).find((s) => s.id === 'global-scouting')!;
    w.build = { youth: 'worldwide' };
    w.policy = { ...POLICY_DEFAULTS, globalScouting: 3 };
    w.staff = w.staff!.map((member) =>
      member.role === 'scout' ? { ...member, ability: 64, trait: undefined } : member,
    );
    expect(state().active).toBe(false);
    expect(state().conditions.filter((condition) => condition.met)).toHaveLength(2);
    w.staff = w.staff!.map((member) =>
      member.role === 'scout' ? { ...member, ability: 65 } : member,
    );
    expect(state().active).toBe(true);
    // Its bonus is the intake's: a setting never makes a found player abler (→CLUB-50).
    expect(synergyEffects(w)).toMatchObject({ academyPotential: 2 });
    expect(synergyEffects(w)).not.toHaveProperty('marketPotential');
  });

  it('founds with a preset as its direction; absent stays 기본 방향, unknown is refused', () => {
    const plain = world('founding-direction');
    const youth = founded('youth-academy', 'founding-direction');
    expect(buildLabel(buildOf(youth))).toBe('유스 명가');
    // One direction event after the founding facts, none for the rows it implies.
    const added = youth.events.slice(plain.events.length);
    expect(added.map((event) => event.kind)).toEqual(['build']);
    expect(added[0]).toMatchObject({
      title: '방향 · 유스 명가',
      detail: '엘리트 선발 · 철저한 경쟁',
    });
    validateWorld(youth);
    expect(plain.build).toBeUndefined();
    expect(plain.policy).toBeUndefined();
    expect(plain.ticket).toBe(0.05);
    expect(plain.direction).toBeUndefined();
    expect(() => careerWorld({ seed: 'founding-direction', preset: 'galacticos' })).toThrow(
      '구단 방향',
    );
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
    // 구단주 투자 is its wage cost alone and 회원제 운영 leaves owner money alone (→ECON-22).
    expect(composeBuild({ revenue: 'owner' })).toEqual({ ...NEUTRAL_BUILD, wage: 1.05 });
    expect(composeBuild({ revenue: 'members' })).toEqual({
      ...NEUTRAL_BUILD,
      gateDemand: 0.05,
      winFans: 1.2,
      sponsor: 0.9,
    });
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
    // 광역 네트워크 lists one more per line (→CLUB-51), each one a player the world holds.
    expect(transferOffers(network).length).toBe(transferOffers(plain).length + 4);
    expect(buildEffects(plain)).toMatchObject({ sponsor: 1, saleFee: 1, gateDemand: 0 });
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
});
