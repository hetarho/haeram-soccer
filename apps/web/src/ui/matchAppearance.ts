import type {
  AppearanceSide,
  CrestDesign,
  KitRole,
  KitWarning,
  ShirtDesign,
} from '../../../../packages/contracts/src/identity';
import type { MatchRecord, Player, PlayerMotion } from '../../../../packages/contracts/src/types';

/**
 * KIT-8/12, SAVE-22, WEB-49/50: how a match view draws both sides, taken only from the appearance
 * the record froze at settlement (spec/ssot/KIT.md). Nothing here reads a
 * world, so today's designs never stand in for a played match; a record without a snapshot stays
 * explicitly unrecorded, drawn with neutral stand-ins and a placeholder crest.
 */

/** What a match view says when its record carries no appearance (KIT-12). */
export const UNRECORDED_KIT = '유니폼 미기록';

export interface SideLook {
  crest: CrestDesign;
  /** The outfield shirt the side wore. */
  shirt: ShirtDesign;
  /** The goalkeeper's automatic colour, drawn as a plain shirt. */
  keeper: ShirtDesign;
  /** The worn role; absent when the match is unrecorded. */
  role?: KitRole;
}
export interface MatchLook {
  /** Whether the sides come from the record's snapshot; false draws the stand-ins below. */
  recorded: boolean;
  /** Home, then away. */
  sides: readonly [SideLook, SideLook];
  warnings: readonly KitWarning[];
}

function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

/** A neutral crest for a match whose crests were not recorded: no club's colours. */
export const PLACEHOLDER_CREST: CrestDesign = frozen({
  shape: 'shield',
  pattern: 'plain',
  emblem: 'ball',
  primary: '#6b747c',
});
/**
 * Generic side markers for an unrecorded match: a light and a slate shirt and the fixed keeper
 * colours the pitch used before shirts were recorded. They claim nothing about the match.
 */
export const UNRECORDED_LOOK: MatchLook = frozen({
  recorded: false,
  sides: [
    {
      crest: PLACEHOLDER_CREST,
      shirt: { pattern: 'plain', primary: '#e4e0d4' },
      keeper: { pattern: 'plain', primary: '#f2c94c' },
    },
    {
      crest: PLACEHOLDER_CREST,
      shirt: { pattern: 'plain', primary: '#59636d' },
      keeper: { pattern: 'plain', primary: '#56ccf2' },
    },
  ],
  warnings: [],
});

const sideLook = (side: AppearanceSide): SideLook => ({
  crest: side.crest,
  shirt: side.shirt,
  keeper: { pattern: 'plain', primary: side.goalkeeper },
  role: side.role,
});
/**
 * The record's look, resolved once per record: its frozen appearance when present and naming this
 * record's two clubs, else the unrecorded stand-ins. The snapshot's own crest and shirt objects
 * are used as they are, never merged with or replaced by anything current.
 */
export function matchLook(record: Pick<MatchRecord, 'home' | 'away' | 'appearance'>): MatchLook {
  const appearance = record.appearance;
  if (
    !appearance ||
    appearance.sides[0].club !== record.home ||
    appearance.sides[1].club !== record.away
  )
    return UNRECORDED_LOOK;
  return {
    recorded: true,
    sides: [sideLook(appearance.sides[0]), sideLook(appearance.sides[1])],
    warnings: appearance.warnings,
  };
}

/** What `keepersBySample` reads of a presented sample: its minute and the players on the pitch. */
export interface PresentedSample {
  frame: number;
  players?: readonly [readonly PlayerMotion[], readonly PlayerMotion[]];
}
type Roster = readonly Pick<Player, 'id' | 'position'>[];

/**
 * Who stands in goal in each sample, by player ID per side: the player the engine moves as the
 * keeper; while he has the ball (`carry`), whoever it moved as keeper elsewhere in that minute;
 * else the previous sample's keeper while he is still on the pitch, so a minute in which the
 * engine never shows its keeper keeps his colour steady; else the player on the pitch whom the
 * whole matchday roster (starters and bench) lists as a goalkeeper. Slots and squad order play no
 * part, so a substitute keeper or an outfield player in goal after a red card is found as he
 * stands. A sample without players has no keeper and carries none on.
 */
export function keepersBySample(
  samples: readonly PresentedSample[],
  squads: readonly [Roster, Roster],
): [string | undefined, string | undefined][] {
  const goalkeepers = squads.map(
    (squad) => new Set(squad.filter((player) => player.position === 'GK').map((p) => p.id)),
  );
  const inGoal = (players: readonly PlayerMotion[] | undefined) =>
    players?.find((motion) => motion.state === 'keeper')?.id;
  const byMinute = new Map<number, [string | undefined, string | undefined]>();
  for (const sample of samples) {
    const known = byMinute.get(sample.frame) ?? [undefined, undefined];
    known[0] ??= inGoal(sample.players?.[0]);
    known[1] ??= inGoal(sample.players?.[1]);
    byMinute.set(sample.frame, known);
  }
  let previous: [string | undefined, string | undefined] = [undefined, undefined];
  return samples.map((sample) => {
    const keepers = ([0, 1] as const).map((side) => {
      const players = sample.players?.[side];
      if (!players) return undefined;
      const onPitch = (id: string | undefined) =>
        id && players.some((motion) => motion.id === id) ? id : undefined;
      return (
        inGoal(players) ??
        onPitch(byMinute.get(sample.frame)?.[side]) ??
        onPitch(previous[side]) ??
        players.find((motion) => goalkeepers[side]!.has(motion.id))?.id
      );
    }) as [string | undefined, string | undefined];
    previous = keepers;
    return keepers;
  });
}
