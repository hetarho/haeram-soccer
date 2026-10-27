import { legacySettings } from './responsibilities';
import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import { footballIndex } from '../../catalogs/src/index';
import { cachedWorld } from '../../../tests/fixtures/cached-world';
import type {
  ContractTerm,
  ManagerStyle,
  Staff,
  StaffRole,
  StaffTrait,
  World,
} from '../../contracts/src/types';
import {
  bidOutlook,
  clearlyCheaper,
  COACH_RENEWAL_MARGIN,
  coachMatches,
  coachPickPreview,
  coachWage,
  createWorld,
  dailyStaff,
  MANAGER_GONE,
  managerCandidates,
  managerRenewal,
  managerTermLimit,
  marketOf,
  operate,
  quote,
  ratio,
  releaseCost,
  renewalDay,
  renewalTerms,
  seasonStaff,
  STAFF_INFO,
  STAFF_ROLES,
  staffCandidates,
  staffEffects,
  staffQuote,
  transferOffers,
  yearlyStaff,
} from './index';
import { world } from './staff.testkit';

describe('coach hiring by 코치 기조 (STAFF-15)', () => {
  const coachOf = (w: World, role: StaffRole) => w.staff!.find((member) => member.role === role);
  const byWage = (a: { wage: string }, b: { wage: string }) =>
    BigInt(a.wage) < BigInt(b.wage) ? -1 : BigInt(a.wage) > BigInt(b.wage) ? 1 : 0;
  const coaches = (w: World, option: string) =>
    operate(w, { type: 'direction', key: 'coaches', option });
  /** The first test seed whose attack candidates satisfy `fits`, so a case never hangs on luck. */
  const seedWhere = (prefix: string, fits: (abilities: number[]) => boolean) =>
    cachedWorld(`seed:${prefix}:${fits}`, () => {
      for (let i = 0; i < 200; i++) {
        const seed = `${prefix}-${i}`;
        if (fits(staffCandidates(world(seed, createWorld), 'attack').map((offer) => offer.ability)))
          return seed;
      }
      throw new Error(`no seed for ${prefix}`);
    });
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
    w.settings = legacySettings(3);
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
    // The known matching seed avoids generating 86 full worlds on a cold test cache.
    const w = world('criteria-change-85');
    expect(staffCandidates(w, 'attack').every((offer) => offer.ability < 65)).toBe(true);
    w.intervention = 3;
    w.settings = legacySettings(3);
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
    const seed = cachedWorld('seed:delegated-terms', () =>
      Array.from({ length: 200 }, (_, i) => `delegated-terms-${i}`).find((candidate) =>
        staffCandidates(world(candidate, createWorld), 'attack').some(
          (offer) => offer.ability >= 65,
        ),
      ),
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
    w.settings = legacySettings(4);
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
    expect(w.events.at(-1)!.detail).toContain('단장 선임');
    expect(w.inbox!.at(-1)).toMatchObject({
      kind: 'staff-report',
      attention: false,
      title: `포지셔널 플레이 ${best.name} 감독 선임`,
    });
    expect(w.inbox!.at(-1)!.detail).toMatch(
      /^단장이 선호 학파와 감독 기조에 맞는 자유계약 감독을 2시즌 계약했어요 · OVR 80 · .* · 선호 학파 상관없음 · 감독 기조 표준$/,
    );
    expect(managerCandidates(w).some((c) => c.id === best.id)).toBe(false);
    validateWorld(w);
    // Without delegation the departure stops the clock for the owner.
    const owner = seeded('owner-resign').w;
    owner.intervention = 2;
    owner.settings = legacySettings(2);
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

describe('the 단장 (STAFF-20)', () => {
  it('is hired, released and renewed like any department, from three candidates a season', () => {
    const w = world('director-post');
    expect(STAFF_ROLES[0]).toBe('director');
    expect(STAFF_INFO.director).toEqual({
      label: '단장',
      duty: '이적·계약 협상과 감독 선임',
      traits: ['negotiator', 'closer'],
    });
    expect(STAFF_INFO.scout.traits).toEqual(['spotter']);
    const offers = staffCandidates(w, 'director');
    expect(offers).toHaveLength(3);
    expect(
      offers.every(
        (offer) => !offer.trait || offer.trait === 'negotiator' || offer.trait === 'closer',
      ),
    ).toBe(true);
    expect(
      cachedWorld('scout-offers', () =>
        Array.from({ length: 12 }, (_, i) =>
          staffCandidates(world(`scouts-${i}`, createWorld), 'scout'),
        ),
      )
        .flat()
        .every((offer) => !offer.trait || offer.trait === 'spotter'),
    ).toBe(true);
    operate(w, { type: 'hire-staff', role: 'director', candidate: 2, term: 3 });
    const hired = w.staff!.find((member) => member.role === 'director')!;
    expect(hired).toMatchObject({ id: offers[2].id, until: w.year + 3, term: 3 });
    expect(w.staff![0]).toBe(hired);
    expect(w.events.at(-1)!.title).toBe(`단장 ${hired.name} 선임`);
    w.year = hired.until - 1;
    operate(w, { type: 'renew-staff', role: 'director', term: 2 });
    expect(w.staff![0]).toMatchObject({ id: hired.id, until: hired.until + 2 });
    operate(w, { type: 'release-staff', role: 'director' });
    expect(w.staff!.some((member) => member.role === 'director')).toBe(false);
    expect(staffEffects(w).bidAcceptance).toBe(-0.05);
  });

  it('the staff fill his post by 코치 기조 from level 3, the coaching departments with him', () => {
    const w = world('director-delegated');
    expect(w.intervention).toBe(2);
    dailyStaff(w);
    expect(w.staff![0]).toMatchObject({ role: 'director', wage: '0' });
    operate(w, { type: 'intervention', level: 3 });
    const director = w.staff![0];
    expect(director.role).toBe('director');
    expect(BigInt(director.wage)).toBeGreaterThan(0n);
    expect(director.ability).toBeGreaterThanOrEqual(55);
    expect(w.events.some((event) => event.title === `단장 ${director.name} 선임`)).toBe(true);
  });

  it('carries the transfer negotiation the chief scout carried', () => {
    // The chance of a bid at a candidate's asking fee, whichever list the settings draw.
    const base = world('director-talks'),
      asking = transferOffers(base)[2].fee,
      chance = (w: World) => bidOutlook(w, 2, transferOffers(w)[2].fee).chance;
    const set = (w: World, role: StaffRole, ability: number, trait?: StaffTrait) => {
      w.staff = w.staff!.map((member) =>
        member.role === role ? { ...member, ability, ...(trait ? { trait } : {}) } : member,
      );
      return w;
    };
    // His ability alone keeps the list as it is and moves the chance by (ability − 50)/250.
    const able = set(world('director-talks'), 'director', 75);
    expect(transferOffers(able)[2].fee).toBe(asking);
    expect(chance(able)).toBeCloseTo(chance(base) + 0.1, 10);
    // A chief scout of any ability or trait no longer negotiates.
    const scout = set(world('director-talks'), 'scout', 90, 'negotiator');
    expect(staffEffects(scout)).toMatchObject({ feeMultiplier: 1, bidAcceptance: 0 });
    expect(chance(scout)).toBe(chance(base));
    // A negotiator asks less of every selling club: the list's fees fall by a tenth.
    const negotiator = set(world('director-talks'), 'director', 50, 'negotiator');
    const fees = (w: World) =>
      transferOffers(w)
        .slice(1)
        .reduce((sum, offer) => sum + BigInt(offer.fee), 0n);
    expect(staffEffects(negotiator)).toMatchObject({ feeMultiplier: 0.9, bidAcceptance: 0.1 });
    expect(Number((fees(negotiator) * 1000n) / fees(base)) / 1000).toBeLessThan(1);
    // A vacant post costs 5 points.
    const vacant = world('director-talks');
    vacant.staff = vacant.staff!.filter((member) => member.role !== 'director');
    expect(chance(vacant)).toBeCloseTo(chance(base) - 0.05, 10);
  });
});
