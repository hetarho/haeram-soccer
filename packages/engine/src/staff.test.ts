import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Player, StaffRole, StaffTrait, World } from '../../contracts/src/types';
import {
  activePlayers,
  activeTrainingFocus,
  advanceRound,
  autoTrainingAdvice,
  autoTrainingFocus,
  basicStaff,
  createWorld,
  departmentMultiplier,
  hireStaff,
  lineup,
  makeManager,
  MANAGER_TRAIT_INFO,
  managerOffers,
  operate,
  operatingCosts,
  overall,
  ratio,
  releaseStaff,
  seasonStaff,
  selectedLineup,
  settleTraining,
  simulateSeason,
  STAFF_INFO,
  STAFF_ROLES,
  staffCandidates,
  staffEffects,
  staffImpact,
  staffWageTotal,
  MANAGER_STYLES,
  STYLE_INFO,
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

/** Young equal players under the owner's balanced focus, so growth is directly comparable. */
function trainingWorld() {
  const w = world();
  w.delegation = { ...w.delegation, training: false };
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
    for (const w of [basic, old]) delete w.delegation;
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
        expect(offer.ability).toBeGreaterThanOrEqual([45, 55, 65][i]);
        expect(offer.ability).toBeLessThanOrEqual([65, 78, 90][i]);
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
    const before = BigInt(w.cash),
      owed = BigInt(ratio(first.wage, 1n, 4n));
    hireStaff(w, 'attack', 0);
    expect(BigInt(w.cash)).toBe(before - BigInt(second.fee) - owed);
    expect(w.events.at(-1)!.amount).toBe((BigInt(second.fee) + owed).toString());
    const released = BigInt(w.cash);
    releaseStaff(w, 'attack');
    expect(BigInt(w.cash)).toBe(released - BigInt(ratio(second.wage, 1n, 4n)));
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
      kind: 'staff-report',
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
    expect(w.delegation?.training).toBe(true);
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

  it('applies the staff choice only while delegated and hands training back on an owner choice', () => {
    const w = rested();
    for (const player of w.players) player.fatigue = 40;
    expect(activeTrainingFocus(w)).toBe('recovery');
    settled(w);
    expect(activePlayers(w).every((player) => player.fatigue === 24)).toBe(true);
    expect(activePlayers(w).every((player) => player.developed === undefined)).toBe(true);
    operate(w, { type: 'training', focus: 'balanced' });
    expect(w.delegation?.training).toBe(false);
    expect(activeTrainingFocus(w)).toBe('balanced');
    operate(w, { type: 'delegate', key: 'training', value: true });
    expect(activeTrainingFocus(w)).toBe(autoTrainingFocus(w));
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
        const plain = makeManager('ENG', w.seed, year, i + 1);
        const { trait, fee, ambition, style, philosophy, until, ...rest } = offer;
        void fee;
        void ambition;
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
    operate(w, { type: 'hire', candidate: index });
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
