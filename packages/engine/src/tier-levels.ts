/**
 * Where each pyramid tier's clubs are generated and settle (→LEAGUE-10), a read leaf: the market's
 * prices read it to place a player's ability between the tiers (→CLUB-25) without world
 * generation.
 */

/** Generated strength of a club in a pyramid tier: each tier is about 11 points below the one above. */
export function tierStrengthRange(tier: number): [number, number] {
  return [72 - tier * 11, 82 - tier * 11];
}

/** Typical division strength (WORLD-15), shared by generation and ability-fit pricing. */
export function tierLevel(tier: number) {
  return 90 - 10 * (tier + 1);
}
