/**
 * Every player's four play tendencies (→PLAYER-26), shown in the match inspector: 자유도 is the
 * freedom his manager gives him (→STAFF-46); 규율, 압박 성향 and 예측력 come from his attributes
 * and a stable personality drawn once from his ID. Pure functions nothing in play reads yet: T435
 * stores them once per match on match-model revision 2, T432 moves players by `freedom` and T433
 * by the other three.
 */
import type { RoleId } from '../../../contracts/src/player';
import type { Manager, MatchRecord, Player } from '../../../contracts/src/types';
import { bestRoleAt, FORMATIONS } from '../player';
import { clamp, random } from '../primitives';

export const TENDENCY_CONFIG = {
  /** Weight of the stable personality draw in 규율, 압박 성향 and 예측력. */
  personalityWeight: 0.25,
  /** 규율: defending (태클, 위치선정) and 패스 hold a player in the shape. */
  discipline: { base: 0.18, defense: 0.42, passing: 0.18 },
  /** 압박 성향: defending, attacking (슈팅, 드리블) and 체력 send him to the ball. */
  pressing: { base: 0.15, defense: 0.28, attack: 0.2, stamina: 0.1 },
  /** 예측력: how early he reads play, from 패스 and defending together. */
  anticipation: { base: 0.16, skills: 0.5 },
  /** 자유도 = floor + span × the manager's flexibility × role creativity × his 판단력 (→STAFF-46). */
  freedom: { floor: 0.1, span: 0.9 },
  /** The flexibility the founding manager and an interim give: no school, the band's middle. */
  neutralFlexibility: 50,
  /**
   * How freely media describe each role (→PLAYER-5, docs/MATCH-BASELINES.md), 0.2 the slot a
   * manager keeps a player in, 1.0 a free role.
   */
  roleCreativity: {
    // a keeper whose job is his line and his box
    shotStopper: 0.2,
    // comes off his line behind a high defence and joins the build-up between the centre-backs
    sweeperKeeper: 0.3,
    // centre-backs hold the line: stepping out to a forward or splitting wide stays in the shape
    stopper: 0.2,
    coverDefender: 0.2,
    ballPlayingDefender: 0.2,
    // stays on his side in his own half as rest defence
    defensiveFullBack: 0.25,
    // a back five's wide man in the middle third
    defensiveWingBack: 0.35,
    // steps into midfield in the build-up
    invertedFullBack: 0.5,
    // goes round his winger to the byline
    overlappingFullBack: 0.55,
    // holds the width alone up the whole flank and takes the switch
    attackingWingBack: 0.6,
    // holding midfielders screen the centre-backs and the lanes between the lines
    anchor: 0.2,
    ballWinner: 0.2,
    // the wide middle third and early crosses
    wideMidfielder: 0.35,
    // links from between the lines of defence and midfield
    deepLyingPlaymaker: 0.45,
    // drifts across from deep to find the switch and the line-breaking pass
    regista: 0.5,
    // touchline, one against one, the byline
    traditionalWinger: 0.45,
    // carries and arrives late in the box
    boxToBox: 0.55,
    // spreads into the half-space and runs between centre-back and full-back
    mezzala: 0.65,
    // comes inside from the flank into the half-space and between the lines
    widePlaymaker: 0.65,
    // cuts inside to curl at the far post or slip a through ball
    invertedWinger: 0.65,
    // a 10 between the lines in zone 14
    attackingMidfielder: 0.7,
    // late runs to the penalty spot
    shadowStriker: 0.7,
    // back to goal, aerial duels and lay-offs
    targetMan: 0.3,
    // on the last defender's shoulder in the six-yard box and around the spot
    poacher: 0.35,
    // holds up, links, runs and shoots: every forward's job
    completeForward: 0.75,
    // roams freely to find the free pocket
    trequartista: 1,
    // drops into the pockets and zone 14, drawing centre-backs out
    falseNine: 1,
  } satisfies Record<RoleId, number>,
} as const;

/** What a manager's freedom reads: his flexibility and whether he has a school or is an interim. */
export type TendencyManager = Pick<Manager, 'flexibility' | 'interim' | 'style'>;
export type TendencyPlayer = Pick<Player, 'id' | 'attrs'>;
/** Each tendency in 0–1. */
export interface PlayerTendencies {
  freedom: number;
  discipline: number;
  pressing: number;
  anticipation: number;
}

const unit = (n: number) => clamp(n, 0, 1);

/**
 * The flexibility a manager gives freedom from (→STAFF-46): his own, but the founding manager and
 * an interim have no school (→STAFF-14) and give the neutral one. A club nobody owns passes its
 * named manager, who always has a school.
 */
function givenFlexibility(manager: TendencyManager) {
  return manager.interim || !manager.style
    ? TENDENCY_CONFIG.neutralFlexibility
    : manager.flexibility;
}

/** His stable personality: drawn from his ID alone, so no fixture rerolls it. */
function personality(id: string) {
  const r = random(`personality:${id}`);
  // The first draw was a personal 자유도, which his manager now gives instead; it stays drawn so
  // the other three keep their values.
  r();
  return { discipline: r(), pressing: r(), anticipation: r() };
}

/**
 * A player's four tendencies under `manager` in `role`. Freedom reads 판단력 and none of the
 * others do, so T433 counts no attribute twice through it (→PLAYER-26).
 */
export function playerTendencies(
  player: TendencyPlayer,
  manager: TendencyManager,
  role: RoleId,
): PlayerTendencies {
  const c = TENDENCY_CONFIG,
    a = player.attrs,
    innate = personality(player.id);
  const attack = unit((a.finishing + a.dribbling) / 200),
    passing = unit(a.passing / 100),
    defense = unit((a.tackling + a.positioning) / 200),
    endurance = unit(a.stamina / 100);
  const given =
    (givenFlexibility(manager) / 100) * c.roleCreativity[role] * (0.5 + a.decisions / 200);
  return {
    freedom: unit(c.freedom.floor + c.freedom.span * given),
    discipline: unit(
      c.discipline.base +
        defense * c.discipline.defense +
        passing * c.discipline.passing +
        innate.discipline * c.personalityWeight,
    ),
    pressing: unit(
      c.pressing.base +
        defense * c.pressing.defense +
        attack * c.pressing.attack +
        endurance * c.pressing.stamina +
        innate.pressing * c.personalityWeight,
    ),
    anticipation: unit(
      c.anticipation.base +
        ((passing + defense) / 2) * c.anticipation.skills +
        innate.anticipation * c.personalityWeight,
    ),
  };
}

/**
 * The role a matchday player has in a played match, for the inspector: a starter his slot's, a
 * substitute the role of the man he replaced (a red card's reshuffle aside, →MATCH-20), an unused
 * substitute his best role at his main position (→PLAYER-6).
 */
export function matchdayRole(
  record: Pick<MatchRecord, 'tactics' | 'incidents'>,
  squad: readonly Pick<Player, 'id' | 'attrs' | 'position'>[],
  side: 0 | 1,
  index: number,
): RoleId {
  const player = squad[index]!,
    slots = FORMATIONS[record.tactics[side]].slots;
  const replaced = new Map(
    (record.incidents ?? []).flatMap((incident) =>
      incident.kind === 'sub' && incident.side === side && incident.other
        ? [[incident.other, incident.player] as const]
        : [],
    ),
  );
  let id = player.id;
  // A substituted player never returns (→MATCH-20), so the chain ends at a starter.
  for (let hops = 0; replaced.has(id) && hops < squad.length; hops++) id = replaced.get(id)!;
  const at = squad.findIndex((p) => p.id === id);
  return at >= 0 && at < slots.length ? slots[at]!.role : bestRoleAt(player.attrs, player.position);
}
