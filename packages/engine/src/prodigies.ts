/**
 * Prodigies (신동, →WORLD-18): each summer the world draws one or two 14-year-olds near 60 OVR with
 * a potential of 88–96, each joining a club of the playable associations weighted by its academy
 * level and stature — a club nobody owns as a squad player, the owner's club into its academy
 * (→CLUB-16) — who grow three times faster until 18 (→PLAYER-15).
 */
import type { Club, Player, World } from '../../contracts/src/types';
import { ATTRIBUTES, type Attribute } from '../../contracts/src/player';
import { marketWageAt } from './market-prices';
import { ACADEMY_LIMIT } from './academy';
import { enrollSquadPlayer } from './persisted-squads';
import { movePerson } from './npc-continuity';
import { formationOf } from './player-state';
import { clamp, integer, random } from './primitives';
import { clubRegistration, registrationExempt } from './registration';
import { clubStyle } from './tactics';
import { generatedPlayer, invalidateNpcSquad, PRESS_LOAD_FATIGUE, stature } from './world';
import { mainOvr } from './player';

/** The goalkeeping three, which an outfielder's OVR never reads (→PLAYER-2). */
const GOALKEEPING: ReadonlySet<Attribute> = new Set(['reflexes', 'handling', 'distribution']);

/** WORLD-18's draw and PLAYER-15's growth; starting values. */
export const PRODIGY = {
  /** The chance a summer draws a second prodigy (one or two, about 1.5 a year). */
  twoChance: 0.5,
  age: 14,
  ovr: [57, 63],
  potential: [88, 96],
  /** His growth rate and season limit multiply by this until he turns `until`. */
  growth: 3,
  until: 18,
} as const;

/** The multiple a prodigy's growth takes at `age` (→PLAYER-15): `PRODIGY.growth` until 18, else 1. */
export function prodigyGrowth(player: Pick<Player, 'prodigy'>, age: number) {
  return player.prodigy && age < PRODIGY.until ? PRODIGY.growth : 1;
}

/** A club's chance weight (→WORLD-18): (academy level + 1) × (1 + its positive stature / 10). */
export function prodigyWeight(academy: number, size: number) {
  return (academy + 1) * (1 + Math.max(0, size) / 10);
}

/** Every club a prodigy may join this summer, with its weight, in the clubs' stable order. */
function candidates(w: World, year: number) {
  const out: { club: Club; weight: number }[] = [];
  for (const c of w.clubs) {
    if (c.representative) continue;
    const own = c.id === w.playerClub;
    if (own) {
      if ((w.academy?.players.length ?? 0) >= ACADEMY_LIMIT) continue;
    } else {
      const players = w.squads?.[c.id];
      if (!players || !c.levels) continue;
      // He arrives within the league's registration rule (→CLUB-44), as an intake's youngster
      // does: under the ceiling, and counted only where his age and academy are not exempt. His
      // position is drawn after the club, so he is read as an outfielder.
      const state = clubRegistration(c, year, players);
      if (state.total >= state.ceiling) continue;
      const arrival = {
        born: year - PRODIGY.age,
        position: 'CM' as const,
        graduate: true as const,
      };
      if (!registrationExempt(state.rule, year, arrival) && state.counted >= state.allowed)
        continue;
    }
    const academy = own ? w.academyFacility : c.levels!.academy;
    out.push({ club: c, weight: prodigyWeight(academy, stature(w.seed, c.id)) });
  }
  return out;
}

/**
 * The summer's prodigies, aged 14 in `year` (the season that opens after this close), drawn from
 * their own stream (`<seed>:prodigy:<year>`) so no other draw moves. Each joins a club drawn by its
 * weight; called once at each summer close after the youth intake, war-gap summers included.
 */
export function drawProdigies(w: World, year = w.year + 1): Player[] {
  const r = random(`${w.seed}:prodigy:${year}`);
  const count = r() < PRODIGY.twoChance ? 2 : 1;
  const drawn: Player[] = [];
  for (let i = 0; i < count; i++) {
    const pool = candidates(w, year);
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let pick = r() * total;
    const chosen = pool.find((entry) => (pick -= entry.weight) < 0) ?? pool.at(-1);
    if (!chosen) break;
    const c = chosen.club,
      own = c.id === w.playerClub;
    const slots = formationOf(clubStyle(c));
    const slot = slots[integer(r, 0, slots.length - 1)]!;
    const ovr = integer(r, PRODIGY.ovr[0], PRODIGY.ovr[1]),
      potential = integer(r, PRODIGY.potential[0], PRODIGY.potential[1]);
    const id = own ? `${c.id}:academy:${year}:prodigy${i}` : `${c.id}:y:${year}:prodigy${i}`;
    const p = generatedPlayer(
      c.country,
      w.seed,
      id,
      year,
      ovr,
      slot.position,
      PRODIGY.age,
      c.tier,
      slot.role,
    );
    // His OVR lands on the drawn value: every attribute his position reads moves alike.
    const shift = ovr - mainOvr(p);
    for (const a of ATTRIBUTES)
      if (p.position === 'GK' || !GOALKEEPING.has(a))
        p.attrs[a] = clamp(Math.round((p.attrs[a] + shift) * 100) / 100, 1, 99);
    p.wage = marketWageAt(c.country, year, c.tier, p);
    p.potential = clamp(Math.max(mainOvr(p), potential), 1, 99);
    p.prodigy = true;
    if (own) {
      // A prospect is unpaid until promoted, in the academy's youngest group (→CLUB-16).
      p.wage = '0';
      (w.academy ||= { players: [] }).players.push(p);
      movePerson(w, p, c.id, true);
    } else {
      p.graduate = true;
      p.joined = year;
      p.fatigue = clubStyle(c) === 'press' ? PRESS_LOAD_FATIGUE : 0;
      p.until = year + integer(random(`${w.seed}:${id}:contract`), 1, 5);
      w.squads![c.id]!.push(p);
      enrollSquadPlayer(w, c, p);
      invalidateNpcSquad(w, c.id);
    }
    drawn.push(p);
  }
  return drawn;
}
