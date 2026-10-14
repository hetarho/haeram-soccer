import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { footballIndex } from '../../catalogs/src/index';
import type {
  ContractTerm,
  ManagerStyle,
  Player,
  Staff,
  StaffRole,
  StaffTrait,
  World,
} from '../../contracts/src/types';
import {
  activePlayers,
  activeTrainingFocus,
  advanceRound,
  autoTrainingAdvice,
  autoTrainingFocus,
  basicStaff,
  clearlyCheaper,
  COACH_RENEWAL_MARGIN,
  coachMatches,
  coachPickPreview,
  coachProspect,
  coachSeason,
  coachWage,
  createWorld,
  dailyStaff,
  departmentMultiplier,
  hireStaff,
  lineup,
  makeManager,
  MANAGER_GONE,
  MANAGER_STYLES,
  MANAGER_TRAIT_INFO,
  managerCandidates,
  managerOffers,
  managerRenewal,
  managerTermLimit,
  marketOf,
  operate,
  operatingCosts,
  overall,
  quote,
  ratio,
  releaseCost,
  releaseStaff,
  renewalDay,
  renewalTerms,
  seasonStaff,
  selectedLineup,
  settleTraining,
  simulateSeason,
  STAFF_INFO,
  STAFF_ROLES,
  staffCandidates,
  staffEffects,
  staffImpact,
  staffQuote,
  staffWageTotal,
  STYLE_INFO,
  yearlyStaff,
} from './index';

const NEUTRAL = {
  development: { attack: 1, passing: 1, defense: 1, keeper: 1, stamina: 1 },
  youthDevelopment: 1,
  recoveryBonus: 0,
  academyQuality: 0,
  academyGrowth: 1,
  scoutPotential: 0,
  scoutCandidates: 8,
  feeMultiplier: 1,
  bidAcceptance: 0,
};

function world(seed = 'coaching-staff') {
  const w = createWorld({
    country: 'ENG',
    name: 'Bootroom Rovers',
    color: '#334455',
    seed,
    difficulty: 2,
  });
  w.cash = '999999999';
  return w;
}

/** Young equal players under an ordered balanced focus, so growth is directly comparable. */
function trainingWorld() {
  const w = world();
  w.trainingOrders = { assistant: { focus: 'balanced', rounds: 4, forced: true } };
  w.manager.youth = 60;
  for (const player of w.players) {
    player.born = w.year - 20;
    player.potential = 85;
    player.attack = player.passing = player.defense = player.keeper = player.stamina = 40;
    player.fatigue = 30;
  }
  return w;
}

function coach(w: World, role: StaffRole, ability: number, trait?: StaffTrait) {
  w.staff = (w.staff || basicStaff(w)).map((member) => {
    if (member.role !== role) return member;
    const { trait: _previous, ...rest } = member;
    void _previous;
    return { ...rest, ability, ...(trait ? { trait } : {}) };
  });
  return w;
}

const settled = (w: World) => {
  w.round = 1;
  settleTraining(w);
  return w;
};

describe('coaching staff', () => {
  it('founds the club with seven unpaid ability-50 volunteers that change nothing', () => {
    const w = world();
    expect(w.staff).toHaveLength(7);
    expect(w.staff!.map((member) => member.role)).toEqual(STAFF_ROLES);
    for (const member of w.staff!) {
      expect(member.ability).toBe(50);
      expect(member.trait).toBeUndefined();
      expect(member.wage).toBe('0');
    }
    expect(staffWageTotal(w)).toBe(0n);
    expect(staffEffects(w)).toStrictEqual(NEUTRAL);
    expect(staffEffects({ ...w, staff: undefined })).toStrictEqual(NEUTRAL);
    expect(canonical(operatingCosts(w))).toBe(
      canonical(operatingCosts({ ...w, staff: undefined })),
    );
    // Slightly below 50 rounds to zero, not -0.
    expect(Object.is(staffEffects(coach(world(), 'fitness', 45)).recoveryBonus, 0)).toBe(true);
  });

  it('plays a season identically with basic staff and with no staff at all (older saves)', () => {
    const basic = world('neutral-season'),
      old = world('neutral-season');
    // Before delegation existed the owner decided everything.
    for (const w of [basic, old]) delete w.intervention;
    delete old.staff;
    simulateSeason(basic);
    simulateSeason(old);
    expect(basic.staff).toHaveLength(7);
    expect(old.staff).toBeUndefined();
    expect(canonical({ ...basic, staff: undefined })).toBe(canonical(old));
    validateWorld(basic);
    validateWorld(old);
  });

  it('scales each department monotonically with ability and lifts it further with traits', () => {
    const at = (role: StaffRole, ability: number, trait?: StaffTrait) =>
      staffEffects(coach(world(), role, ability, trait));
    expect(departmentMultiplier(50)).toBe(1);
    expect(departmentMultiplier(70)).toBeCloseTo(1.1, 10);
    expect(departmentMultiplier(100)).toBe(1.25);
    expect(departmentMultiplier(10)).toBe(0.85);
    const pairs: [StaffRole, keyof typeof NEUTRAL.development][] = [
      ['assistant', 'passing'],
      ['attack', 'attack'],
      ['defense', 'defense'],
      ['goalkeeping', 'keeper'],
      ['fitness', 'stamina'],
    ];
    for (let ability = 20; ability < 100; ability += 10) {
      const low = (role: StaffRole) => at(role, ability),
        high = (role: StaffRole) => at(role, ability + 10);
      for (const [role, skill] of pairs)
        expect(high(role).development[skill]).toBeGreaterThanOrEqual(low(role).development[skill]);
      expect(high('fitness').recoveryBonus).toBeGreaterThanOrEqual(low('fitness').recoveryBonus);
      expect(high('youth').academyQuality).toBeGreaterThanOrEqual(low('youth').academyQuality);
      expect(high('youth').academyGrowth).toBeGreaterThanOrEqual(low('youth').academyGrowth);
      expect(high('scout').scoutPotential).toBeGreaterThanOrEqual(low('scout').scoutPotential);
      expect(high('scout').scoutCandidates).toBeGreaterThanOrEqual(low('scout').scoutCandidates);
      expect(high('scout').bidAcceptance).toBeGreaterThan(low('scout').bidAcceptance);
    }
    expect(at('attack', 90).development.attack).toBeCloseTo(1.2, 10);
    expect(at('attack', 90, 'specialist').development.attack).toBeCloseTo(1.2 * 1.15, 10);
    expect(at('attack', 90).development.defense).toBe(1);
    expect(at('assistant', 50, 'developer').youthDevelopment).toBe(1.3);
    const both = coach(coach(world(), 'assistant', 50, 'developer'), 'youth', 50, 'developer');
    expect(staffEffects(both).youthDevelopment).toBeCloseTo(1.3 * 1.1, 10);
    expect(staffEffects(both).academyGrowth).toBeCloseTo(1.3, 10);
    expect(at('fitness', 90).recoveryBonus).toBe(2);
    expect(at('fitness', 90, 'recovery').recoveryBonus).toBe(4);
    expect(at('fitness', 20).recoveryBonus).toBe(-1);
    expect(at('youth', 70).academyQuality).toBe(4);
    expect(at('youth', 70, 'spotter').academyQuality).toBe(10);
    expect(at('scout', 80, 'spotter').scoutPotential).toBe(9);
    expect(at('scout', 95).scoutCandidates).toBe(11);
    expect(at('scout', 10).scoutCandidates).toBe(5);
    expect(at('scout', 50, 'negotiator')).toMatchObject({ feeMultiplier: 0.9, bidAcceptance: 0.1 });
    expect(staffImpact(coach(world(), 'attack', 90, 'specialist'), 'attack')).toContain('×1.38');
  });

  it('turns better coaches into faster growth and recovery on the same settled round', () => {
    const forward = (w: World) => activePlayers(w).find((player) => player.role === 'FWD')!;
    const base = settled(trainingWorld()),
      strong = settled(coach(trainingWorld(), 'attack', 90, 'specialist'));
    expect(forward(strong).attack).toBeGreaterThan(forward(base).attack);
    expect(forward(strong).stamina).toBe(forward(base).stamina);
    expect(forward(strong).developed).toBeGreaterThan(forward(base).developed!);
    const rested = settled(coach(trainingWorld(), 'fitness', 90, 'recovery'));
    expect(forward(rested).fatigue).toBe(forward(base).fatigue - 4);
    const nurtured = settled(coach(trainingWorld(), 'assistant', 50, 'developer'));
    expect(forward(nurtured).developed).toBeGreaterThan(forward(base).developed!);
  });

  it('makes an empty department worse than a basic volunteer', () => {
    const w = world(),
      cash = w.cash;
    for (const role of STAFF_ROLES) operate(w, { type: 'release-staff', role });
    expect(w.cash).toBe(cash);
    expect(w.staff).toEqual([]);
    expect(staffEffects(w)).toStrictEqual({
      development: { attack: 0.9, passing: 0.9, defense: 0.9, keeper: 0.9, stamina: 0.9 },
      youthDevelopment: 1,
      recoveryBonus: -1,
      academyQuality: -5,
      academyGrowth: 0.9,
      scoutPotential: -3,
      scoutCandidates: 6,
      feeMultiplier: 1,
      bidAcceptance: -0.05,
    });
    const releases = w.events.filter((event) => event.kind === 'staff-release');
    expect(releases).toHaveLength(7);
    expect(releases.every((event) => event.amount === undefined)).toBe(true);
    expect(() => releaseStaff(w, 'scout')).toThrow('비어 있는');
    expect(staffImpact(w, 'scout')).toContain('공석');
    const fwd = (x: World) => activePlayers(x).find((player) => player.role === 'FWD')!;
    const vacant = trainingWorld();
    vacant.staff = [];
    expect(fwd(settled(vacant)).attack).toBeLessThan(fwd(settled(trainingWorld())).attack);
  });

  it('offers three seeded candidates per role and season, never someone already employed', () => {
    const w = world();
    for (const role of STAFF_ROLES) {
      const offers = staffCandidates(w, role);
      expect(canonical(offers)).toBe(canonical(staffCandidates(structuredClone(w), role)));
      expect(offers).toHaveLength(3);
      offers.forEach((offer, i) => {
        expect(offer.role).toBe(role);
        // The band is the level a coach reaches; a young one is below it now (→STAFF-16).
        expect(offer.potential).toBeGreaterThanOrEqual([45, 55, 65][i]);
        expect(offer.ability).toBeLessThanOrEqual([65, 78, 90][i]);
        expect(offer.ability).toBeLessThanOrEqual(offer.potential!);
        expect(w.year - offer.born!).toBeGreaterThanOrEqual(25);
        expect(w.year - offer.born!).toBeLessThanOrEqual(62);
        if (i > 0) expect(offer.trait).toBeDefined();
        if (offer.trait) expect(STAFF_INFO[role].traits).toContain(offer.trait);
        expect(offer.fee).toBe(ratio(offer.wage, 1n, 4n));
        expect(BigInt(offer.wage)).toBeGreaterThan(0n);
        expect([w.year + 2, w.year + 3]).toContain(offer.until);
      });
      const nextSeason = staffCandidates({ ...w, year: w.year + 1 }, role);
      expect(canonical(nextSeason)).not.toBe(canonical(offers));
    }
    expect(staffCandidates(w, 'chef' as StaffRole)).toEqual([]);
  });

  it('charges the signing fee, compensates a replaced paid coach and pays wages from then on', () => {
    const w = world(),
      start = BigInt(w.cash),
      [first, second, third] = staffCandidates(w, 'attack');
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 0 });
    expect(BigInt(w.cash)).toBe(start - BigInt(first.fee));
    const { fee: _fee, ...contract } = first;
    void _fee;
    expect(w.staff!.find((member) => member.role === 'attack')).toEqual(contract);
    expect(w.staff!.map((member) => member.role)).toEqual(STAFF_ROLES);
    expect(staffWageTotal(w)).toBe(BigInt(first.wage));
    expect(operatingCosts(w).staffWages).toBe(first.wage);
    expect(w.events.at(-1)).toMatchObject({ kind: 'staff-hire', amount: first.fee });
    // The hired coach is no longer offered, so indices refer to who is still available.
    expect(staffCandidates(w, 'attack').map((offer) => offer.id)).toEqual([second.id, third.id]);
    // A replaced coach is owed 25% of his wage for each season left on his contract.
    const before = BigInt(w.cash),
      owed = BigInt(ratio(first.wage, BigInt(first.until - w.year), 4n));
    hireStaff(w, 'attack', 0);
    expect(BigInt(w.cash)).toBe(before - BigInt(second.fee) - owed);
    expect(w.events.at(-1)!.amount).toBe((BigInt(second.fee) + owed).toString());
    const released = BigInt(w.cash);
    releaseStaff(w, 'attack');
    expect(BigInt(w.cash)).toBe(
      released - BigInt(ratio(second.wage, BigInt(second.until - w.year), 4n)),
    );
    expect(w.staff!.some((member) => member.role === 'attack')).toBe(false);
    expect(() => hireStaff(w, 'attack', 7)).toThrow('스태프 후보');
    validateWorld(w);
  });

  it('refuses an unaffordable hire without touching the club and staffs older saves on demand', () => {
    const w = world();
    w.cash = '0';
    const before = canonical(w);
    expect(() => operate(w, { type: 'hire-staff', role: 'scout', candidate: 2 })).toThrow(
      '보유 자금이 부족합니다.',
    );
    expect(canonical(w)).toBe(before);
    const old = world();
    delete old.staff;
    hireStaff(old, 'scout', 2);
    expect(old.staff).toHaveLength(7);
    expect(old.staff!.find((member) => member.role === 'scout')!.ability).toBeGreaterThanOrEqual(
      65,
    );
  });

  it('ends paid contracts at the season boundary with an attention report and renews volunteers', () => {
    const w = world();
    hireStaff(w, 'goalkeeping', 1);
    const keeperCoach = w.staff!.find((member) => member.role === 'goalkeeping')!;
    w.year = keeperCoach.until - 1;
    seasonStaff(w);
    expect(w.staff!.some((member) => member.id === keeperCoach.id)).toBe(true);
    w.year = keeperCoach.until;
    seasonStaff(w);
    expect(w.staff!.some((member) => member.role === 'goalkeeping')).toBe(false);
    expect(w.staff).toHaveLength(6);
    expect(w.staff!.every((member) => member.until === w.year + 1)).toBe(true);
    expect(w.events.at(-1)!.kind).toBe('staff-leave');
    expect(w.inbox!.at(-1)).toMatchObject({
      kind: 'staff-renewal',
      attention: true,
      ref: keeperCoach.id,
    });
    const old = world();
    delete old.staff;
    seasonStaff(old);
    expect(old.staff).toBeUndefined();
  });

  it('keeps the club staffed through simulated seasons and stays valid', () => {
    const w = world('staff-seasons');
    simulateSeason(w);
    simulateSeason(w);
    expect(w.staff!.map((member) => member.role)).toEqual(STAFF_ROLES);
    expect(w.staff!.every((member) => member.until === w.year + 1)).toBe(true);
    validateWorld(w);
  });
});

describe('delegated training focus', () => {
  function rested(w = world()) {
    for (const player of w.players) {
      player.born = w.year - 25;
      player.fatigue = 0;
    }
    return w;
  }
  const starters = (w: World) => selectedLineup(activePlayers(w), w.lineup, w.manager, w.year);

  it('rests a tired XI, nurtures young starters and otherwise trains balanced', () => {
    const w = rested();
    expect(activeTrainingFocus(w)).toBe(autoTrainingFocus(w));
    expect(autoTrainingFocus(w)).toBe('balanced');
    for (const player of starters(w).slice(0, 2)) player.born = w.year - 21;
    expect(autoTrainingFocus(w)).toBe('balanced');
    starters(w)[2].born = w.year - 19;
    expect(autoTrainingFocus(w)).toBe('youth');
    // Uniform fatigue keeps the same XI, whose average is what the assistant reads.
    for (const player of w.players) player.fatigue = 30;
    expect(autoTrainingFocus(w)).toBe('recovery');
    for (const player of w.players) player.fatigue = 29;
    expect(autoTrainingFocus(w)).toBe('youth');
    const developer = coach(rested(), 'assistant', 50, 'developer');
    expect(autoTrainingFocus(developer)).toBe('youth');
    expect(autoTrainingAdvice(developer).reason).toContain('육성형');
    expect(autoTrainingAdvice(w).reason).toContain('21세 이하 선발 3명');
  });

  it("applies the assistant's choice at every level until the owner forces another", () => {
    const w = rested();
    for (const player of w.players) player.fatigue = 40;
    expect(activeTrainingFocus(w)).toBe('recovery');
    settled(w);
    expect(activePlayers(w).every((player) => player.fatigue === 24)).toBe(true);
    expect(activePlayers(w).every((player) => player.developed === undefined)).toBe(true);
    for (const level of [1, 4] as const) {
      operate(w, { type: 'intervention', level });
      expect(activeTrainingFocus(w)).toBe(autoTrainingFocus(w));
    }
    operate(w, { type: 'coach-training', coach: 'assistant', focus: 'balanced', force: true });
    expect(activeTrainingFocus(w)).toBe('balanced');
  });

  it('decides the focus once per round even as earlier players recover', () => {
    const w = rested();
    // The XI averages exactly the threshold; recovering the first players must not flip the rest.
    for (const player of w.players) player.fatigue = 30;
    w.round = 1;
    settleTraining(w);
    expect(new Set(activePlayers(w).map((player) => player.fatigue))).toEqual(new Set([14]));
    expect(activePlayers(w).every((player) => player.developed === undefined)).toBe(true);
  });
});

describe('manager traits', () => {
  it('gives hire candidates seeded traits without changing their other attributes', () => {
    const w = world(),
      seen = new Set<string>(),
      styles = new Set<string>();
    for (let year = 1901; year < 1913; year++) {
      const offers = managerOffers({ ...w, year });
      expect(new Set(offers.map((offer) => offer.style)).size).toBe(4);
      offers.forEach((offer, i) => {
        const plain = makeManager('ENG', w.seed, year, i + 1, offer.style);
        const { trait, fee, style, philosophy, until, ...rest } = offer;
        void fee;
        const { philosophy: plainPhilosophy, until: _until, ...plainRest } = plain;
        void _until;
        expect(rest).toEqual(plainRest);
        // A school that plays one way brings its tactic; the others keep the drawn philosophy.
        expect(philosophy).toBe(STYLE_INFO[style].tactic ?? plainPhilosophy);
        expect(until).toBe(year + STYLE_INFO[style].term);
        seen.add(trait || 'none');
        styles.add(style);
      });
    }
    expect(seen).toEqual(new Set(['youth', 'rotation', 'stable', 'none']));
    expect(styles.size).toBe(MANAGER_STYLES.length);
    expect(world().manager.style).toBeUndefined();
    expect(world().manager.trait).toBeUndefined();
    expect(canonical(managerOffers(w))).toBe(canonical(managerOffers(structuredClone(w))));
  });

  it('keeps the chosen candidate trait on the hired manager', () => {
    const w = world();
    let year = w.year;
    while (!managerOffers({ ...w, year }).some((offer) => offer.trait)) year++;
    w.year = year;
    const index = managerOffers(w).findIndex((offer) => offer.trait),
      offer = managerOffers(w)[index];
    operate(w, { type: 'hire', id: offer.id });
    expect(w.manager.id).toBe(offer.id);
    expect(w.manager.trait).toBe(offer.trait);
    expect(w.events.at(-1)!.detail).toContain(MANAGER_TRAIT_INFO[offer.trait!].label);
    validateWorld(w);
  });

  it('lets the trait change the automatic lineup', () => {
    const w = world(),
      base = (player: Player, value: number, age: number, fatigue = 0) => {
        player.attack = player.passing = player.defense = player.stamina = value;
        player.born = w.year - age;
        player.fatigue = fatigue;
      };
    const defenders = w.players.filter((player) => player.role === 'DEF');
    defenders.forEach((player) => base(player, 50, 28));
    base(defenders[4], 30, 28);
    base(defenders[5], 49, 20);
    const picked = () => lineup(activePlayers(w), w.manager, w.year).map((player) => player.id);
    expect(picked()).not.toContain(defenders[5].id);
    w.manager = { ...w.manager, trait: 'youth' };
    expect(picked()).toContain(defenders[5].id);
    expect(overall(defenders[5])).toBe(49);
    // Rotation rests a tired starter for a fresher, slightly weaker player.
    base(defenders[5], 45, 28);
    base(defenders[0], 50, 28, 20);
    w.manager = { ...w.manager, trait: undefined };
    expect(picked()).toContain(defenders[0].id);
    w.manager = { ...w.manager, trait: 'rotation' };
    expect(picked()).not.toContain(defenders[0].id);
    // Stable keeps a tired starter the neutral manager would rest.
    base(defenders[0], 50, 28, 40);
    w.manager = { ...w.manager, trait: undefined };
    expect(picked()).not.toContain(defenders[0].id);
    w.manager = { ...w.manager, trait: 'stable' };
    expect(picked()).toContain(defenders[0].id);
  });

  it('settles a full round with a traited manager deterministically', () => {
    const a = world('trait-round'),
      b = world('trait-round');
    for (const w of [a, b]) w.manager = { ...w.manager, trait: 'youth' };
    advanceRound(a, undefined, false);
    advanceRound(b, undefined, false);
    expect(canonical(a)).toBe(canonical(b));
  });
});

describe('coach hiring by 코치 기조 (STAFF-15)', () => {
  const coachOf = (w: World, role: StaffRole) => w.staff!.find((member) => member.role === role);
  const byWage = (a: { wage: string }, b: { wage: string }) =>
    BigInt(a.wage) < BigInt(b.wage) ? -1 : BigInt(a.wage) > BigInt(b.wage) ? 1 : 0;
  const coaches = (w: World, option: string) =>
    operate(w, { type: 'direction', key: 'coaches', option });
  /** The first test seed whose attack candidates satisfy `fits`, so a case never hangs on luck. */
  const seedWhere = (prefix: string, fits: (abilities: number[]) => boolean) => {
    for (let i = 0; i < 200; i++) {
      const seed = `${prefix}-${i}`;
      if (fits(staffCandidates(world(seed), 'attack').map((offer) => offer.ability))) return seed;
    }
    throw new Error(`no seed for ${prefix}`);
  };
  /** A paid coach whose contract ended with the season just closed, the coaches delegated. */
  function expiring(seed: string, ability: number, option: string) {
    const w = world(seed);
    const veteran: Staff = {
      id: `${seed}:veteran`,
      role: 'attack',
      name: 'Veteran Coach',
      ability,
      wage: coachWage(w, ability),
      since: w.year - 2,
      until: w.year,
    };
    w.staff = w.staff!.map((member) => (member.role === 'attack' ? veteran : member));
    w.intervention = 3;
    if (option !== 'standard') w.direction = { coaches: option as never };
    return { w, veteran };
  }

  it('the delegated staff hire the first match of 코치 기조 in every department', () => {
    const w = world('criteria-first');
    // 표준: ability 55 or more, the cheapest first, for two seasons.
    const cheapest = staffCandidates(w, 'attack')
      .filter((offer) => offer.ability >= 55)
      .sort(byWage)[0];
    expect(cheapest).toBeDefined();
    // A row set while the owner runs the departments changes nothing until level 3 hands them over.
    coaches(w, 'cheap');
    coaches(w, 'standard');
    expect(coachOf(w, 'attack')!.wage).toBe('0');
    operate(w, { type: 'intervention', level: 3 });
    expect(coachOf(w, 'attack')).toMatchObject({ id: cheapest.id, until: w.year + 2 });
    expect(coachOf(w, 'attack')!.term).toBeUndefined();
    expect(w.events.some((event) => event.detail.includes('스태프 위임 선임'))).toBe(true);
    // What a department's card shows: the pick, or why nobody.
    expect(coachPickPreview(w, 'scout').reason).toContain('계약이 끝날 때 코치 기조로');

    // 최고 수준: ability 65 or more, the ablest first, for three seasons.
    const seed = seedWhere('criteria-elite', (abilities) => abilities.some((a) => a >= 65));
    const elite = world(seed);
    coaches(elite, 'elite');
    const ablest = [...staffCandidates(elite, 'attack')].sort((a, b) => b.ability - a.ability)[0];
    operate(elite, { type: 'intervention', level: 3 });
    expect(coachOf(elite, 'attack')).toMatchObject({ id: ablest.id, until: elite.year + 3 });
    validateWorld(elite);
  });

  it('with no match a volunteer holds the post and the staff report it once a season', () => {
    const w = world(seedWhere('criteria-none', (abilities) => abilities.every((a) => a < 65)));
    coaches(w, 'elite');
    operate(w, { type: 'intervention', level: 3 });
    expect(coachOf(w, 'attack')).toMatchObject({ wage: '0', ability: 50 });
    const reports = () =>
      (w.inbox || []).filter((item) => item.ref?.startsWith('coach-search:attack:'));
    expect(reports()).toHaveLength(1);
    expect(reports()[0]).toMatchObject({
      kind: 'staff-report',
      attention: false,
      ref: `coach-search:attack:${w.year}`,
      title: '공격 코치: 코치 기조에 맞는 코치가 없어요',
    });
    expect(reports()[0].detail).toBe(
      '능력 65 이상인 후보가 없어요 · 코치 기조 최고 수준 · 자원봉사 코치가 자리를 지켜요',
    );
    // The staff look again daily without repeating the report; a vacancy gets a volunteer.
    w.staff = w.staff!.filter((member) => member.role !== 'attack');
    dailyStaff(w);
    dailyStaff(w);
    expect(coachOf(w, 'attack')).toMatchObject({ wage: '0', ability: 50 });
    expect(reports()).toHaveLength(1);
    validateWorld(w);
    // A new season's search reports again, unless its candidates now hold a match.
    w.year += 1;
    const matchNext = staffCandidates(w, 'attack').some((offer) => offer.ability >= 65);
    dailyStaff(w);
    if (matchNext) expect(coachOf(w, 'attack')!.wage).not.toBe('0');
    else expect(reports()).toHaveLength(2);
    // Nobody affordable is a reason of its own.
    const broke = world('criteria-broke');
    broke.cash = '0';
    coaches(broke, 'cheap');
    operate(broke, { type: 'intervention', level: 3 });
    expect(coachOf(broke, 'fitness')!.wage).toBe('0');
    expect(broke.inbox!.at(-1)!.detail).toMatch(/^자금 여력에 맞는 후보가 없어요 · /);
  });

  it('renews an expiring coach who meets 코치 기조 unless a match beats him by 3 ability or a 10% lower wage', () => {
    // 최고 수준 (the ablest first): the ablest match must be 3 better.
    const seed = seedWhere('renew-ability', (abilities) => Math.max(...abilities) >= 68);
    const probe = expiring(seed, 50, 'elite');
    const ablest = coachMatches(probe.w, 'attack', probe.veteran)[0];
    const kept = expiring(seed, ablest.ability - COACH_RENEWAL_MARGIN + 1, 'elite');
    const terms = renewalTerms(kept.w, kept.veteran, 3);
    const cash = BigInt(kept.w.cash);
    seasonStaff(kept.w);
    expect(coachOf(kept.w, 'attack')).toMatchObject({
      id: kept.veteran.id,
      wage: terms.wage,
      until: kept.w.year + 3,
    });
    expect(BigInt(kept.w.cash)).toBe(cash - BigInt(terms.fee));
    expect(kept.w.inbox!.at(-1)).toMatchObject({
      kind: 'staff-report',
      title: '코치진 정비 · 1건',
    });
    expect(kept.w.inbox!.at(-1)!.detail).toBe(
      '코치 기조 최고 수준 · 공격 코치 Veteran Coach 재계약(3시즌)',
    );
    const beaten = expiring(seed, ablest.ability - COACH_RENEWAL_MARGIN, 'elite');
    seasonStaff(beaten.w);
    expect(coachOf(beaten.w, 'attack')).toMatchObject({ id: ablest.id, until: beaten.w.year + 3 });
    expect(beaten.w.events.some((event) => event.kind === 'staff-leave')).toBe(true);

    // 저비용 (the cheapest first): the cheapest match must ask at most 90% of his going wage.
    const cheap = expiring('renew-wage', 60, 'cheap');
    const cheapest = coachMatches(cheap.w, 'attack', cheap.veteran)[0];
    const cutoff = Array.from({ length: 100 }, (_, ability) => ability).find((ability) =>
      clearlyCheaper(cheapest.wage, coachWage(cheap.w, ability)),
    )!;
    expect(cutoff - 1).toBeGreaterThanOrEqual(45);
    const stays = expiring('renew-wage', cutoff - 1, 'cheap');
    seasonStaff(stays.w);
    expect(coachOf(stays.w, 'attack')!.id).toBe(stays.veteran.id);
    const priced = expiring('renew-wage', cutoff, 'cheap');
    seasonStaff(priced.w);
    expect(coachOf(priced.w, 'attack')!.id).toBe(cheapest.id);

    // One who no longer meets it makes way for a match, is renewed when there is none and the
    // club can afford him, and otherwise a volunteer takes the post.
    const below = expiring('renew-below', 40, 'standard');
    const match = coachMatches(below.w, 'attack', below.veteran)[0];
    seasonStaff(below.w);
    expect(coachOf(below.w, 'attack')!.id).toBe(match.id);
    const none = seedWhere('renew-alone', (abilities) => abilities.every((a) => a < 65));
    const alone = expiring(none, 60, 'elite');
    seasonStaff(alone.w);
    expect(coachOf(alone.w, 'attack')!.id).toBe(alone.veteran.id);
    const broke = expiring(none, 60, 'elite');
    broke.w.cash = '0';
    seasonStaff(broke.w);
    expect(coachOf(broke.w, 'attack')).toMatchObject({ wage: '0', ability: 50 });
    expect(broke.w.inbox!.at(-1)!.detail).toContain('Veteran Coach 계약 만료 → 자원봉사');
    validateWorld(kept.w);
  });

  it('코치 기조 자원봉사 keeps volunteers', () => {
    const w = world('criteria-volunteer');
    coaches(w, 'volunteer');
    operate(w, { type: 'intervention', level: 3 });
    const volunteer = coachOf(w, 'scout')!;
    expect(volunteer.wage).toBe('0');
    // Nothing to report: the owner asked for volunteers.
    expect((w.inbox || []).some((item) => item.ref?.startsWith('coach-search:'))).toBe(false);
    expect(coachPickPreview(w, 'scout').pick).toBeUndefined();
    expect(coachPickPreview(w, 'scout').reason).toContain('코치 기조 자원봉사');
    // A vacancy gets one.
    w.staff = w.staff!.filter((member) => member.role !== 'scout');
    dailyStaff(w);
    expect(coachOf(w, 'scout')).toMatchObject({ wage: '0', ability: 50 });
    // An expiring paid coach makes way for a volunteer, even one who would fit.
    const { w: season, veteran } = expiring('criteria-volunteer-season', 80, 'volunteer');
    seasonStaff(season);
    expect(coachOf(season, 'attack')).toMatchObject({ wage: '0', ability: 50 });
    expect(coachOf(season, 'attack')!.id).not.toBe(veteran.id);
  });

  it("a new 코치 기조 fills a volunteer post at once while a contracted coach waits for his contract's end", () => {
    const w = world(seedWhere('criteria-change', (abilities) => abilities.every((a) => a < 65)));
    w.intervention = 3;
    w.direction = { coaches: 'elite' };
    operate(w, { type: 'hire-staff', role: 'defense', candidate: 0, term: 2 });
    const contracted = coachOf(w, 'defense')!;
    expect(coachOf(w, 'attack')!.wage).toBe('0');
    const cheapest = staffCandidates(w, 'attack')
      .filter((offer) => offer.ability >= 45)
      .sort(byWage)[0];
    coaches(w, 'cheap');
    expect(coachOf(w, 'attack')!.id).toBe(cheapest.id);
    // A contracted coach is judged only when his contract ends.
    coaches(w, 'elite');
    dailyStaff(w);
    expect(coachOf(w, 'defense')!.id).toBe(contracted.id);
    expect(coachPickPreview(w, 'defense').reason).toContain('계약이 끝날 때');
  });

  it('releasing a coach leaves delegation to the level, so the staff refill the post', () => {
    const w = world('criteria-release');
    operate(w, { type: 'intervention', level: 4 });
    const fitness = coachOf(w, 'fitness')!;
    operate(w, { type: 'release-staff', role: 'attack' });
    expect(w.intervention).toBe(4);
    // The staff fill the post the owner emptied by its criteria; the other department is as it was.
    dailyStaff(w);
    expect(coachOf(w, 'attack')).toBeDefined();
    expect(coachOf(w, 'fitness')).toEqual(fitness);
  });

  it('reads coaching levels saved by rules 1.9–1.15 as the nearest 코치 기조', () => {
    const w = world('department-legacy');
    const saved = JSON.parse(canonical(w));
    // A club-wide 최고 level, then 절약 in every department.
    saved.coaching = 3;
    const elite = validateWorld(saved);
    expect('coaching' in elite).toBe(false);
    expect('hiring' in elite).toBe(false);
    expect(elite.direction).toEqual({ coaches: 'elite' });
    saved.coaching = Object.fromEntries(STAFF_ROLES.map((role) => [role, 1]));
    expect(validateWorld(saved).direction).toEqual({ coaches: 'volunteer' });
  });
});

describe('coach and manager careers', () => {
  it('starts young coaches below the level they reach and grows them toward it', () => {
    const young = coachProspect('career:young', 70, [30, 30], 46),
      prime = coachProspect('career:prime', 70, [50, 50], 46);
    expect(young.ability).toBeLessThan(70);
    expect(young.potential).toBeGreaterThan(70);
    expect(prime).toEqual({ age: 50, ability: 70, potential: 70 });
    let { ability, potential } = young;
    for (let season = 0; season < 12; season++)
      ({ ability, potential } = coachSeason(`career:${season}`, ability, potential, 30 + season));
    expect(ability).toBe(potential);
    expect(potential).toBe(young.potential);
    // From 60 a coach fades by up to two a season, his ceiling with him.
    const old = coachSeason('career:old', 80, 80, 63);
    expect(old.ability).toBeGreaterThanOrEqual(78);
    expect(old.ability).toBeLessThanOrEqual(80);
    expect(old.potential).toBe(old.ability);
  });

  it('offers managers with ages and ceilings and grows the hired one each season', () => {
    const w = world('manager-careers');
    const offers = managerOffers(w);
    for (const offer of offers) {
      const age = w.year - offer.born!;
      expect(age).toBeGreaterThanOrEqual(32);
      expect(age).toBeLessThanOrEqual(64);
      expect(offer.potential!).toBeGreaterThanOrEqual(offer.ability);
      if (age >= 46) expect(offer.potential).toBe(offer.ability);
    }
    w.manager = { ...w.manager, ability: 50, potential: 70, born: w.year - 34, interim: false };
    simulateSeason(w);
    expect(w.manager.ability).toBeGreaterThan(50);
    expect(w.manager.ability).toBeLessThanOrEqual(70);
    expect(w.events.some((e) => e.kind === 'manager-growth')).toBe(true);
    validateWorld(w);
  });

  it('retires a manager at 70 and keeps older saves without ages in place', () => {
    const w = world('manager-retire');
    w.manager = { ...w.manager, born: w.year - 69, potential: w.manager.ability };
    simulateSeason(w);
    expect(w.critical).toBeDefined();
    expect(w.manager.interim).toBe(true);
    const old = world('manager-no-age');
    const { born: _born, potential: _potential, ...rest } = old.manager;
    void _born;
    void _potential;
    old.manager = { ...rest, since: old.year };
    const ability = old.manager.ability;
    simulateSeason(old);
    expect(old.manager.ability).toBe(ability);
  });

  it('grows hired coaches and leaves volunteers at 50', () => {
    const w = world('coach-growth');
    hireStaff(w, 'attack', 0);
    w.staff = w.staff!.map((member) =>
      member.role === 'attack'
        ? { ...member, ability: 50, potential: 72, born: w.year - 28, until: w.year + 3 }
        : member,
    );
    w.year += 1;
    seasonStaff(w);
    const coach = w.staff!.find((member) => member.role === 'attack')!;
    expect(coach.ability).toBeGreaterThan(50);
    expect(w.staff!.find((member) => member.role === 'defense')!.ability).toBe(50);
    expect(w.events.some((e) => e.kind === 'staff-growth')).toBe(true);
  });
});

describe('contract terms (STAFF-11, STAFF-14)', () => {
  const coachOf = (w: World, role: StaffRole) => w.staff!.find((member) => member.role === role)!;
  const ownReminder = (w: World) =>
    (w.inbox || []).find((item) => item.kind === 'staff-renewal' && item.ref === w.manager.id);

  it('signs coaches for the term the owner chooses at a wage fixed for it', () => {
    const w = world('coach-terms');
    const offer = staffCandidates(w, 'attack')[1],
      start = BigInt(w.cash);
    operate(w, { type: 'hire-staff', role: 'attack', candidate: 1, term: 4 });
    expect(coachOf(w, 'attack')).toMatchObject({
      id: offer.id,
      wage: offer.wage,
      until: w.year + 4,
      term: 4,
    });
    expect(BigInt(w.cash)).toBe(start - BigInt(offer.fee));
    // He grows over the seasons but his wage stays until a renewal prices his ability again.
    w.year += 3;
    seasonStaff(w);
    const member = coachOf(w, 'attack');
    expect(member.wage).toBe(offer.wage);
    const terms = renewalTerms(w, member, 3);
    operate(w, { type: 'renew-staff', role: 'attack', term: 3 });
    expect(coachOf(w, 'attack')).toMatchObject({
      wage: terms.wage,
      until: member.until + 3,
      term: 3,
    });
    // Without a choice the earlier two seasons apply, and no owner term is kept.
    operate(w, { type: 'hire-staff', role: 'defense', candidate: 0, term: 1 });
    expect(coachOf(w, 'defense').until).toBe(w.year + 1);
    operate(w, { type: 'renew-staff', role: 'defense' });
    expect(coachOf(w, 'defense').until).toBe(w.year + 3);
    expect(coachOf(w, 'defense').term).toBeUndefined();
    const before = canonical(w);
    expect(() =>
      operate(w, { type: 'hire-staff', role: 'scout', candidate: 0, term: 6 as ContractTerm }),
    ).toThrow('계약 기간');
    expect(() =>
      operate(w, { type: 'renew-staff', role: 'attack', term: 0 as ContractTerm }),
    ).toThrow('계약 기간');
    expect(canonical(w)).toBe(before);
  });

  it('pays 25% of the annual wage for each season left when a coach goes early', () => {
    const w = world('release-terms');
    operate(w, { type: 'hire-staff', role: 'fitness', candidate: 2, term: 4 });
    const coach = coachOf(w, 'fitness');
    // Four seasons left: a whole year's wage.
    expect(releaseCost(w, coach)).toBe(coach.wage);
    const cash = BigInt(w.cash);
    operate(w, { type: 'release-staff', role: 'fitness' });
    expect(BigInt(w.cash)).toBe(cash - BigInt(coach.wage));
    expect(w.events.at(-1)!.detail).toContain('잔여 계약 4시즌 보상금');
    // In the final season a quarter; a volunteer leaves freely.
    operate(w, { type: 'hire-staff', role: 'fitness', candidate: 1, term: 2 });
    const short = coachOf(w, 'fitness');
    w.year += 1;
    expect(releaseCost(w, short)).toBe(ratio(short.wage, 1n, 4n));
    expect(releaseCost(w, coachOf(w, 'scout'))).toBe('0');
  });

  it('never signs a manager past his 70th year, and the firefighter for one season', () => {
    const w = world('seventy');
    expect(managerTermLimit({ born: w.year - 50 }, w.year)).toBe(5);
    expect(managerTermLimit({ born: w.year - 67 }, w.year)).toBe(3);
    expect(managerTermLimit({ style: 'firefighter', born: w.year - 55 }, w.year)).toBe(1);
    // Older saves without an age keep the plain five.
    expect(managerTermLimit({}, w.year)).toBe(5);
    const market = structuredClone(marketOf(w));
    const [veteran, crisis] = market.free.filter((m) => m.style !== 'firefighter');
    veteran.born = w.year - 67;
    crisis.style = 'firefighter';
    w.managerMarket = market;
    const before = canonical(w);
    expect(() => operate(w, { type: 'hire', id: crisis.id, term: 2 })).toThrow('소방수');
    expect(() => operate(w, { type: 'hire', id: veteran.id, term: 4 })).toThrow('70세');
    expect(canonical(w)).toBe(before);
    // Three seasons take the veteran to the close of his 70th year.
    operate(w, { type: 'hire', id: veteran.id, term: 3 });
    expect(w.manager).toMatchObject({ id: veteran.id, until: veteran.born + 70, term: 3 });
    // Renewing at 68 with the contract ending at this close: one more season fits.
    w.manager.until = w.year + 1;
    w.manager.born = w.year - 68;
    expect(managerRenewal(w)!.limit).toBe(1);
    expect(() => operate(w, { type: 'renew-manager', term: 2 })).toThrow('70세');
    // A year older he retires at this close: nothing to renew and no 1 April reminder.
    w.manager.born = w.year - 69;
    expect(managerRenewal(w)).toBeUndefined();
    w.calendar = { day: renewalDay(w.year) };
    dailyStaff(w);
    expect(ownReminder(w)).toBeUndefined();
  });

  it('lets no manager renew himself: a 1 April reminder, then he leaves at the close', () => {
    const w = world('no-self-renewal');
    w.manager.until = w.year + 1;
    const { id, name } = w.manager,
      { limit } = managerRenewal(w)!;
    expect(limit).toBeGreaterThan(1);
    w.calendar = { day: renewalDay(w.year) };
    dailyStaff(w);
    expect(ownReminder(w)).toMatchObject({
      attention: true,
      title: `${name} 감독 계약이 이번 시즌 끝에 끝나요`,
    });
    expect(ownReminder(w)!.detail).toContain(`· 1–${limit}시즌)`);
    w.year++;
    yearlyStaff(w);
    expect(w.manager.interim).toBe(true);
    expect(w.critical).toBe(MANAGER_GONE);
    expect(w.events.some((event) => event.kind === 'manager-renew')).toBe(false);
    expect(w.events.find((event) => event.kind === 'manager-departure')!.detail).toContain(
      '재계약 없이 계약 기간을 마치고 떠났습니다.',
    );
    expect(w.inbox!.find((item) => item.ref === id)!.read).toBe(true);
    // Renewed by the owner he stays, on the wage fixed when he signed.
    const kept = world('no-self-renewal');
    kept.manager.until = kept.year + 1;
    const terms = managerRenewal(kept, 3)!;
    operate(kept, { type: 'renew-manager', term: 3 });
    expect(kept.manager).toMatchObject({ until: kept.year + 4, wage: terms.wage, term: 3 });
    kept.year++;
    yearlyStaff(kept);
    expect(kept.manager).toMatchObject({ id, wage: terms.wage, interim: false });
    expect(kept.critical).toBeUndefined();
  });

  it("lets delegated staff sign and renew coaches for 코치 기조's term", () => {
    const seed = Array.from({ length: 200 }, (_, i) => `delegated-terms-${i}`).find((candidate) =>
      staffCandidates(world(candidate), 'attack').some((offer) => offer.ability >= 65),
    )!;
    const w = world(seed);
    w.direction = { coaches: 'elite' };
    operate(w, { type: 'intervention', level: 3 });
    const hired = coachOf(w, 'attack');
    expect(hired.until).toBe(w.year + 3);
    expect(hired.term).toBeUndefined();
    // A coach no new candidate beats: his contract ends with the season just closed and the staff
    // keep him for three more.
    w.staff = w.staff!.map((member) =>
      member.id === hired.id
        ? { ...member, ability: 95, potential: 95, born: hired.until - 40 }
        : member,
    );
    w.year = hired.until;
    seasonStaff(w);
    expect(coachOf(w, 'attack')).toMatchObject({ id: hired.id, until: w.year + 3 });
    expect(w.events.some((event) => event.kind === 'staff-renew')).toBe(true);
  });

  it('prices managers and coaches on the football index', () => {
    const w = world('indexed-wages');
    w.year = 2005;
    w.manager = { ...w.manager, born: 1955, until: 2006 };
    const real = footballIndex('ENG', 2005).real,
      indexed = (units: number) =>
        ratio(quote('ENG', 2005, units), BigInt(Math.round(real * 1_000_000)), 1_000_000n);
    expect(real).toBeGreaterThan(1);
    expect(managerRenewal(w)!.wage).toBe(indexed(120 + w.manager.ability));
    const offer = staffCandidates(w, 'attack')[0];
    expect(offer.wage).toBe(indexed((offer.ability - 30) * 1.5));
    // Before commercialisation football follows prices, so early wages are unchanged.
    expect(staffQuote(world(), 100)).toBe(quote('ENG', 1950, 100));
  });
});

describe('delegated manager appointment (STAFF-7, STAFF-18)', () => {
  /** Four free agents of known schools and levels, with the manager post delegated. */
  function seeded(seed: string) {
    const w = world(seed);
    w.intervention = 4;
    const market = structuredClone(marketOf(w));
    const levels: [ManagerStyle, number][] = [
      ['developer', 70],
      ['positional', 80],
      ['motivator', 60],
      ['gegenpress', 75],
    ];
    market.free = market.free.slice(0, 4).map((m, i) => ({
      ...m,
      style: levels[i][0],
      ability: levels[i][1],
      potential: levels[i][1],
      born: w.year - 50,
      wage: staffQuote(w, 120 + levels[i][1]),
    }));
    w.managerMarket = market;
    const by = (style: ManagerStyle) => market.free.find((m) => m.style === style)!;
    return { w, by };
  }
  /** Makes the proud manager resign over one more strong demand (→STAFF-5). */
  function resignOverDemand(w: World) {
    w.manager = { ...w.manager, pride: 90, trust: 20, conflicts: 2 };
    operate(w, { type: 'tactics', tactic: 'counter', tone: 'demand' });
  }

  it("appoints a successor at once for the criteria's term when a manager resigns", () => {
    const { w, by } = seeded('delegated-resign');
    w.manager = { ...w.manager, style: 'developer' };
    // The default criteria: any school, the highest OVR first, two seasons.
    const best = by('positional'),
      fee = managerCandidates(w).find((c) => c.id === best.id)!.fee;
    const cash = BigInt(w.cash);
    resignOverDemand(w);
    expect(w.critical).toBeUndefined();
    expect(w.manager).toMatchObject({
      id: best.id,
      interim: false,
      since: w.year,
      until: w.year + 2,
    });
    expect(w.manager.term).toBeUndefined();
    expect(w.tactic).toBe(w.manager.philosophy);
    expect(BigInt(w.cash)).toBe(cash - BigInt(fee));
    expect(w.events.at(-1)).toMatchObject({ kind: 'manager-hire', amount: fee });
    expect(w.events.at(-1)!.detail).toContain('스태프 위임 선임');
    expect(w.inbox!.at(-1)).toMatchObject({
      kind: 'staff-report',
      attention: false,
      title: `포지셔널 플레이 ${best.name} 감독 선임`,
    });
    expect(w.inbox!.at(-1)!.detail).toMatch(
      /^스태프가 선호 학파와 감독 기조에 맞는 자유계약 감독을 2시즌 계약했어요 · OVR 80 · .* · 선호 학파 상관없음 · 감독 기조 표준$/,
    );
    expect(managerCandidates(w).some((c) => c.id === best.id)).toBe(false);
    validateWorld(w);
    // Without delegation the departure stops the clock for the owner.
    const owner = seeded('owner-resign').w;
    owner.intervention = 2;
    resignOverDemand(owner);
    expect(owner.manager.interim).toBe(true);
    expect(owner.critical).toBe(MANAGER_GONE);
  });

  it('fills retirement and unrenewed vacancies at the close, a firefighter for one season', () => {
    const retiring = seeded('delegated-retire').w;
    retiring.manager = { ...retiring.manager, born: retiring.year - 69 };
    retiring.year++;
    yearlyStaff(retiring);
    expect(retiring.manager.interim).toBe(false);
    expect(retiring.critical).toBeUndefined();
    expect(retiring.events.some((e) => e.detail.includes('은퇴'))).toBe(true);

    const { w, by } = seeded('delegated-expiry');
    const firefighter = by('positional');
    w.managerMarket!.free = w.managerMarket!.free.map((m) =>
      m.id === firefighter.id ? { ...m, style: 'firefighter' as const } : m,
    );
    // 감독 기조's terms of two or three seasons still sign the firefighter for one.
    operate(w, { type: 'direction', key: 'manager', option: 'young' });
    w.manager.until = w.year + 1;
    w.year++;
    yearlyStaff(w);
    expect(w.critical).toBeUndefined();
    expect(w.manager).toMatchObject({ id: firefighter.id, until: w.year + 1 });
  });
});
