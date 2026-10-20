import { z } from 'zod';
import {
  CREST_EMBLEMS,
  CREST_PATTERNS,
  CREST_SHAPES,
  KIT_ROLES,
  KIT_WARNINGS,
  SHIRT_PATTERNS,
  type ClubIdentity,
  type CrestDesign,
  type FixtureKitChoice,
  type MatchAppearance,
  type ShirtDesign,
} from './identity';
import { SaveCompatibilityError } from './versions';

/** `#RRGGBB` in either hex case; the stored spelling is kept (KIT-1). */
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const id = z.string().min(1).max(100);
export const kitRoleSchema = z.enum(KIT_ROLES);

export const crestDesignSchema: z.ZodType<CrestDesign> = z.strictObject({
  shape: z.enum(CREST_SHAPES),
  pattern: z.enum(CREST_PATTERNS),
  emblem: z.enum(CREST_EMBLEMS),
  primary: colour,
  secondary: colour.optional(),
  accent: colour.optional(),
});
/** A plain shirt omits secondary; every patterned shirt names it (KIT-3, KIT-5). */
export const shirtDesignSchema: z.ZodType<ShirtDesign> = z
  .strictObject({
    pattern: z.enum(SHIRT_PATTERNS),
    primary: colour,
    secondary: colour.optional(),
    trim: colour.optional(),
  })
  .refine((shirt) => (shirt.pattern === 'plain') === (shirt.secondary === undefined), {
    message: 'plain shirts omit secondary; patterned shirts require it',
    path: ['secondary'],
  });
export const clubIdentitySchema: z.ZodType<ClubIdentity> = z.strictObject({
  version: z.literal(1),
  colours: z.union([
    z.tuple([colour]),
    z.tuple([colour, colour]),
    z.tuple([colour, colour, colour]),
  ]),
  crest: crestDesignSchema,
  kits: z.strictObject({
    home: shirtDesignSchema,
    away: shirtDesignSchema,
    third: shirtDesignSchema,
  }),
});
export const fixtureKitChoiceSchema: z.ZodType<FixtureKitChoice> = z.strictObject({
  fixtureId: id,
  role: kitRoleSchema,
});
const appearanceSide = z.strictObject({
  club: id,
  crest: crestDesignSchema,
  role: kitRoleSchema,
  shirt: shirtDesignSchema,
  goalkeeper: colour,
});
export const matchAppearanceSchema: z.ZodType<MatchAppearance> = z.strictObject({
  version: z.literal(1),
  sides: z.tuple([appearanceSide, appearanceSide]),
  warnings: z.array(z.enum(KIT_WARNINGS)).max(KIT_WARNINGS.length),
});

/** World.clubs and World.ownMatches limits of the world schema; larger inputs are not scanned. */
const MAX_CLUBS = 1000;
const MAX_RECORDS = 100000;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** A positive integer version above the current 1 comes from a newer game (SAVE-20–22). */
function assertVersion(value: unknown) {
  if (!record(value)) return;
  const version = value.version;
  if (typeof version === 'number' && Number.isSafeInteger(version) && version > 1)
    throw new SaveCompatibilityError();
}
/** One appearance snapshot's version; missing, invalid or current markers go on to strict parsing. */
export function assertAppearanceFormatVersion(value: unknown): void {
  assertVersion(value);
}
/**
 * Bounded preflight over a World-shaped value: future `clubs[*].identity` or `ownMatches[*].appearance`
 * versions throw SaveCompatibilityError before Zod reports them as corruption. It neither validates
 * the World nor installs defaults.
 */
export function assertIdentityFormatVersions(value: unknown): void {
  if (!record(value)) return;
  const { clubs, ownMatches } = value;
  if (
    (Array.isArray(clubs) && clubs.length > MAX_CLUBS) ||
    (Array.isArray(ownMatches) && ownMatches.length > MAX_RECORDS)
  )
    throw new Error('저장 데이터의 크기가 허용 범위를 넘습니다.');
  if (Array.isArray(clubs))
    for (const club of clubs) if (record(club)) assertVersion(club.identity);
  if (Array.isArray(ownMatches))
    for (const match of ownMatches)
      if (record(match)) assertAppearanceFormatVersion(match.appearance);
}
