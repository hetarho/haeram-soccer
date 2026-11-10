import { describe, expect, it } from 'vitest';
import { canonical, validateWorld } from '../../contracts/src/index';
import type { Fixture, OwnerTrait, World } from '../../contracts/src/types';
import { OWNER_TRAITS } from './owner-config';
import {
  askedFeeFactor,
  hasTrait,
  intakePotential,
  networkAbility,
  networkCandidates,
  scoutRangeScale,
  sponsorFactor,
  talismanStrength,
  wageDemandFactor,
} from './owner-traits';
import { matchForm, npcMatchContext, prepareMatch } from './match';
import { effectiveGap } from './match-rules';
import { buildGridSetup } from './grid/setup';
import { findClub, ratingOf, squad } from './world';
import { talkTerms } from './contracts';
import { transferOffers } from './scout-search';
import { worldMarketOffer } from './world-market';
import { FREE_AGENTS, managerCandidates, refreshManagerMarket } from './managerMarket';
import { staffCandidates } from './staff';
import { academyIntakeDay, academyPlayers, runAcademyIntake } from './academy';
import { personalityRange } from './player';
import { careerAssessment, aptitudeLabel } from './career-assessment';
import { coachingGrade } from './aptitude';
import { sponsorOffers } from './sponsors';
import { activePlayers, overall } from './player-state';
import { withOwner } from './testing';
import { DISABLED_RELEASE } from '../../../tests/fixtures/releases';
import { careerWorld } from './career.testkit';

/** A career taken over by an owner without traits: every trait standing aside. */
const FOUNDED = careerWorld({ seed: 'owner-traits' }, DISABLED_RELEASE);
const world = () => structuredClone(FOUNDED);
/** The same career with an owner holding `traits`. */
function owned(...traits: OwnerTrait[]) {
  const w = world();
  withOwner(w, { traits });
  return w;
}
const ratioOf = (a: string, b: string) => Number(a) / Number(b);

describe('owner traits (→OWNER-5)', () => {
  it('act only while the owner holds them', () => {
    const none = world(),
      plain = owned(),
      all = owned('talisman', 'negotiator', 'networker', 'talentSpotter', 'marketer');
    for (const w of [none, plain]) {
      expect(hasTrait(w, 'talisman')).toBe(false);
      expect([
        talismanStrength(w),
        wageDemandFactor(w),
        askedFeeFactor(w),
        networkCandidates(w),
        networkAbility(w),
        intakePotential(w),
        scoutRangeScale(w),
        sponsorFactor(w),
      ]).toEqual([0, 1, 1, 0, 0, 0, 1, 1]);
    }
    expect([
      talismanStrength(all),
      wageDemandFactor(all),
      askedFeeFactor(all),
      networkCandidates(all),
      networkAbility(all),
      intakePotential(all),
      scoutRangeScale(all),
      sponsorFactor(all),
    ]).toEqual([
      OWNER_TRAITS.talisman.strength,
      OWNER_TRAITS.negotiator.wages,
      OWNER_TRAITS.negotiator.fees,
      OWNER_TRAITS.networker.candidates,
      OWNER_TRAITS.networker.ability,
      OWNER_TRAITS.talentSpotter.potential,
      OWNER_TRAITS.talentSpotter.scoutRange,
      OWNER_TRAITS.marketer.sponsor,
    ]);
  });

  it('change no site for an owner without them, as for a founded career', () => {
    const read = (w: World) => {
      const own = w.fixtures.find((f) => f.home === w.playerClub || f.away === w.playerClub)!;
      return canonical({
        strength: prepareMatch(w, own).strength,
        talk: talkTerms(w, activePlayers(w)[0]!),
        offers: transferOffers(w).map((o) => [o.player.id, o.fee, o.loanFee]),
        managers: managerCandidates(w).map((m) => [m.id, m.ability, m.wage]),
        coaches: staffCandidates(w, 'attack').map((c) => [c.id, c.ability, c.wage]),
        sponsors: sponsorOffers(w, 'local'),
        range: careerAssessment(w, activePlayers(w)[0]!, false),
      });
    };
    expect(read(owned('businessman', 'fansFriend', 'politician'))).toBe(read(world()));
  });
});

describe('승리의 부적 (→OWNER-6)', () => {
  /** Each side's strength from its pre-gap level: diminishing returns, then the day's form. */
  function strengths(base: [number, number], form: [number, number]) {
    const gap = base[0] - base[1],
      ease = (effectiveGap(gap) - gap) / 2;
    return [base[0] + ease + form[0], base[1] - ease + form[1]];
  }
  const fixtureAt = (w: World, home: boolean) =>
    w.fixtures.find((f) => (home ? f.home : f.away) === w.playerClub)!;

  it.each([true, false])(
    'adds to the own club alone, at home %s, the opponent kept at its own level',
    (home) => {
      const plain = world(),
        lucky = owned('talisman'),
        f: Fixture = fixtureAt(plain, home),
        own = home ? 0 : 1,
        other = 1 - own;
      const before = prepareMatch(plain, f),
        after = prepareMatch(lucky, f);
      // The opponent's level, worked out as the engine works out any club nobody owns.
      const opponent = findClub(plain, other === 0 ? f.home : f.away),
        theirs =
          ratingOf(plain, opponent, before.squads[other]) +
          npcMatchContext(plain, opponent) +
          (other === 0 ? 3 : 0),
        form = matchForm(plain, f);
      const ease =
        other === 1
          ? theirs + form[1] - before.strength[1]!
          : before.strength[0]! - theirs - form[0];
      const ours = before.strength[own]! - (own === 0 ? ease : -ease) - form[own]!;
      const level = (mine: number): [number, number] =>
        own === 0 ? [mine, theirs] : [theirs, mine];
      strengths(level(ours), form).forEach((s, i) => expect(before.strength[i]).toBeCloseTo(s, 9));
      strengths(level(ours + OWNER_TRAITS.talisman.strength), form).forEach((s, i) =>
        expect(after.strength[i]).toBeCloseTo(s, 9),
      );
      expect(after.squads).toEqual(before.squads);
    },
  );

  it('moves the grid engine through the same setup', () => {
    const plain = world(),
      lucky = owned('talisman'),
      f = fixtureAt(plain, true);
    const before = buildGridSetup(plain, f, { observe: false, recordPlayers: false }),
      after = buildGridSetup(lucky, f, { observe: false, recordPlayers: false });
    // Half the gap to each side's skills (→MATCH-2): ours up, theirs down by as much.
    expect(after.shift[0]).toBeGreaterThan(before.shift[0]);
    expect(after.shift[1]).toBeLessThan(before.shift[1]);
    expect(after.shift[0] + after.shift[1]).toBeCloseTo(before.shift[0] + before.shift[1], 9);
  });
});

describe('협상의 달인', () => {
  it('lowers an own player’s demand and so his floor (→CLUB-26)', () => {
    const plain = world(),
      sharp = owned('negotiator');
    for (const [i, p] of activePlayers(plain).slice(0, 5).entries()) {
      const before = talkTerms(plain, p),
        after = talkTerms(sharp, activePlayers(sharp)[i]!);
      expect(ratioOf(after.demand, before.demand)).toBeCloseTo(OWNER_TRAITS.negotiator.wages, 2);
      expect(BigInt(after.floor)).toBeLessThan(BigInt(before.floor));
      expect(after.goodwill).toEqual(before.goodwill);
    }
  });

  it('lowers the fee a selling club asks, on the market list and for its players', () => {
    const plain = world(),
      sharp = owned('negotiator');
    const before = transferOffers(plain),
      after = transferOffers(sharp);
    expect(after.map((o) => o.player.id)).toEqual(before.map((o) => o.player.id));
    for (const [i, offer] of after.entries()) {
      // A free agent has no fee to lower; a loan fee is not a transfer fee.
      expect(offer.loanFee).toBe(before[i]!.loanFee);
      if (offer.freeAgent) expect(offer.fee).toBe('0');
      else expect(ratioOf(offer.fee, before[i]!.fee)).toBeCloseTo(OWNER_TRAITS.negotiator.fees, 2);
    }
    const club = plain.clubs.find((c) => c.id !== plain.playerClub && c.tier === 0)!,
      player = squad(plain, club)[0]!,
      target = { world: plain.id, kind: 'club' as const, clubId: club.id, playerId: player.id };
    const asked = worldMarketOffer(plain, target)!,
      lowered = worldMarketOffer(sharp, { ...target, world: sharp.id })!;
    expect(ratioOf(lowered.fee, asked.fee)).toBeCloseTo(OWNER_TRAITS.negotiator.fees, 2);
    expect(lowered.player.wage).toBe(asked.player.wage);
  });
});

describe('마당발', () => {
  const { candidates, ability } = OWNER_TRAITS.networker;
  const boosted = (base: number) => Math.min(99, base + ability);
  /** The career taken over by an owner with 마당발: the takeover opens the manager market. */
  const networked = () =>
    careerWorld({ seed: 'owner-traits', traits: ['networker'] }, DISABLED_RELEASE);

  it('lists one more free-agent manager, each drawn abler at the same wage (→STAFF-17)', () => {
    const plain = world(),
      wide = networked();
    const free = (w: World) => managerCandidates(w).filter((m) => m.source === 'free');
    const before = free(plain),
      after = free(wide);
    expect(after).toHaveLength(before.length + candidates);
    for (const [i, m] of before.entries()) {
      expect(after[i]!.id).toBe(m.id);
      expect(after[i]!.ability).toBe(boosted(m.ability));
      expect(after[i]!.potential).toBeGreaterThanOrEqual(after[i]!.ability);
      expect(after[i]!.wage).toBe(m.wage);
      // His signing fee goes by his level, as every free agent's does.
      expect(BigInt(after[i]!.fee)).toBeGreaterThan(BigInt(m.fee));
    }
    // Other clubs' managers are who they are.
    const club = (w: World) => managerCandidates(w).filter((m) => m.source === 'club');
    expect(club(wide)).toEqual(club(plain));
  });

  it('keeps one more free agent through a market refresh, each new one abler', () => {
    const plain = world(),
      wide = networked();
    refreshManagerMarket(plain);
    refreshManagerMarket(wide);
    const before = plain.managerMarket!.free,
      after = wide.managerMarket!.free;
    expect(after.length).toBeGreaterThanOrEqual(4 + candidates);
    expect(after.length).toBeLessThanOrEqual(8 + candidates);
    let shared = 0;
    for (const m of after) {
      const same = before.find((other) => other.id === m.id);
      if (!same) continue;
      shared++;
      expect(m.ability).toBe(boosted(same.ability));
    }
    expect(shared).toBeGreaterThan(0);
  });

  it('saves a manager market holding its full 마당발 pool', () => {
    const wide = networked();
    refreshManagerMarket(wide);
    const m = wide.managerMarket!,
      [first] = m.free;
    m.free = Array.from({ length: FREE_AGENTS.max + candidates }, (_, i) => ({
      ...first!,
      id: `${first!.id}-full-${i}`,
    }));
    expect(() => validateWorld(wide)).not.toThrow();
  });

  it('opens each staff pool with one more free agent, each abler at the same price (→STAFF-49)', () => {
    const plain = world(),
      wide = networked();
    const free = (w: World) => staffCandidates(w, 'attack').filter((c) => c.source === 'free');
    const before = free(plain),
      after = free(wide);
    expect(after).toHaveLength(before.length + candidates);
    for (const [i, c] of before.entries()) {
      expect(after[i]!.id).toBe(c.id);
      expect(after[i]!.ability).toBe(boosted(c.ability));
      expect([after[i]!.wage, after[i]!.fee]).toEqual([c.wage, c.fee]);
    }
    // Other clubs' holders keep their level.
    const club = (w: World) => staffCandidates(w, 'attack').filter((c) => c.source === 'club');
    expect(club(wide)).toEqual(club(plain));
    // The plain list is read again, not served from the networked one.
    expect(free(plain)).toEqual(before);
  });
});

describe('원석 감별사', () => {
  it('adds potential to every academy prospect at the intake (→CLUB-16)', () => {
    const intake = (w: World) => {
      w.calendar = { day: academyIntakeDay(w) };
      runAcademyIntake(w);
      return academyPlayers(w);
    };
    const before = intake(world()),
      after = intake(owned('talentSpotter'));
    expect(after.map((p) => p.id)).toEqual(before.map((p) => p.id));
    let raised = 0;
    for (const [i, p] of after.entries()) {
      const was = before[i]!;
      expect(overall(p)).toBe(overall(was));
      expect(p.potential).toBeGreaterThanOrEqual(was.potential);
      expect(p.potential).toBeLessThanOrEqual(was.potential + OWNER_TRAITS.talentSpotter.potential);
      if (p.potential === Math.min(99, was.potential + OWNER_TRAITS.talentSpotter.potential))
        raised++;
    }
    expect(raised).toBeGreaterThan(0);
  });

  it('reads other clubs’ players’ grades half as wide (→PLAYER-18)', () => {
    const { scoutRange } = OWNER_TRAITS.talentSpotter;
    expect(personalityRange(3, undefined, scoutRange)).toEqual([2, 4]);
    expect(personalityRange(3, 40, scoutRange)).toEqual([2, 4]);
    expect(personalityRange(3, 65, scoutRange)).toEqual([3, 3]);
    expect(personalityRange(3, 85, scoutRange)).toEqual([3, 3]);
    expect(personalityRange(5, undefined, scoutRange)).toEqual([4, 5]);
    const plain = world(),
      keen = owned('talentSpotter');
    const subject = plain.clubs
      .filter((c) => c.id !== plain.playerClub)
      .flatMap((c) => squad(plain, c))
      .find((p) => coachingGrade(p) !== undefined)!;
    const grade = coachingGrade(subject)!;
    expect(careerAssessment(plain, subject, false).coaching).toBe(aptitudeLabel(grade, false));
    expect(careerAssessment(keen, subject, false).coaching).toBe(
      aptitudeLabel(grade, false, undefined, scoutRange),
    );
    expect(careerAssessment(keen, subject, false).coaching).not.toBe(
      careerAssessment(plain, subject, false).coaching,
    );
    // His own players read exactly with or without the trait.
    expect(careerAssessment(keen, subject, true).coaching).toBe(aptitudeLabel(grade, true));
  });
});

describe('마케팅 귀재', () => {
  it('raises every sponsor offer, base and bonus (→ECON-8)', () => {
    const plain = world(),
      sold = owned('marketer');
    const before = sponsorOffers(plain, 'local'),
      after = sponsorOffers(sold, 'local');
    expect(after.map((o) => [o.kind, o.term])).toEqual(before.map((o) => [o.kind, o.term]));
    for (const [i, offer] of after.entries()) {
      expect(ratioOf(offer.annual, before[i]!.annual)).toBeCloseTo(
        OWNER_TRAITS.marketer.sponsor,
        2,
      );
      if (before[i]!.bonus !== '0')
        expect(ratioOf(offer.bonus, before[i]!.bonus)).toBeCloseTo(
          OWNER_TRAITS.marketer.sponsor,
          2,
        );
    }
  });
});
