import { encode } from '../../apps/web/src/adapters/persistence';
import type { IdentityDraftAction } from '../../apps/web/src/ui/clubIdentityDraft';
import type { ClubIdentity, KitRole } from '../../packages/contracts/src/identity';
import type { Founding, World } from '../../packages/contracts/src/types';
import { FULL_MODEL_CHECKPOINT_SCHEMA } from '../../packages/contracts/src/versions';
import { createWorld, identityOf, installMissingIdentities } from '../../packages/engine/src/index';
import { simulatedWorld } from './worlds';

/**
 * Marked synthetic fixtures for the club-identity continuity journeys (T254; →KIT-9/12/15,
 * →SAVE-3/20/21/22). Worlds come from the real createWorld, settlement and codec paths. Nothing
 * here relabels gameplay rules or skips validation: an older container is today's payload under
 * envelope schema 1, as a writer before identities wrote it, and newer data is only ever refused.
 */

/** The founding screen's first representative colour (T250). */
export const FIRST_COLOUR = '#bf7956';

/**
 * The design the continuity journey founds: a one-colour crest and three patterned shirts.
 * Upper case on purpose: the stored spelling is kept (KIT-1).
 */
export const FOUNDED_DESIGN: ClubIdentity = {
  version: 1,
  colours: ['#C8102E', '#1B2A49'],
  crest: { shape: 'french', pattern: 'sash', emblem: 'crown', primary: '#C8102E' },
  kits: {
    home: { pattern: 'checks', primary: '#C8102E', secondary: '#1B2A49' },
    away: { pattern: 'hoops', primary: '#FFD100', secondary: '#1B2A49' },
    third: { pattern: 'halves', primary: '#7A1FA2', secondary: '#FFD100' },
  },
};

/**
 * The editor steps the journey takes from a founding session's draft to `FOUNDED_DESIGN`, in its
 * order, as the editor's own draft actions. Any session's draft works: every field is set.
 */
export const FOUNDING_ACTIONS: IdentityDraftAction[] = [
  { type: 'colour', index: 0, colour: '#C8102E' },
  { type: 'colour', index: 1, colour: '#1B2A49' },
  // 프렌치 방패 · 왕관: french, sash, crown.
  { type: 'crest-preset', index: 2 },
  { type: 'crest-colour', region: 'primary', colour: '#C8102E' },
  { type: 'crest-colour', region: 'secondary', colour: null },
  ...(['home', 'away', 'third'] as const).flatMap((role): IdentityDraftAction[] => {
    const shirt = FOUNDED_DESIGN.kits[role];
    return [
      { type: 'shirt-pattern', role, pattern: shirt.pattern },
      { type: 'shirt-colour', role, region: 'primary', colour: shirt.primary },
      { type: 'shirt-colour', role, region: 'secondary', colour: shirt.secondary! },
      { type: 'shirt-colour', role, region: 'trim', colour: null },
    ];
  }),
];

/** The colour the later edit gives the shirt the settled match was played in. */
export const EDITED_SHIRT_COLOUR = '#E0218A';

/** The later edit: a three-colour crest and a new secondary for the shirt `role` was worn in. */
export const editActions = (role: KitRole): IdentityDraftAction[] => [
  { type: 'crest-colour', region: 'secondary', colour: '#1B2A49' },
  { type: 'crest-colour', region: 'accent', colour: '#FFD100' },
  { type: 'shirt-colour', role, region: 'secondary', colour: EDITED_SHIRT_COLOUR },
];
/** `FOUNDED_DESIGN` after `editActions(role)`, written out. */
export function editedDesign(role: KitRole): ClubIdentity {
  return {
    ...FOUNDED_DESIGN,
    crest: { ...FOUNDED_DESIGN.crest, secondary: '#1B2A49', accent: '#FFD100' },
    kits: {
      ...FOUNDED_DESIGN.kits,
      [role]: { ...FOUNDED_DESIGN.kits[role], secondary: EDITED_SHIRT_COLOUR },
    },
  };
}

/** A new career with every business decision delegated, so seeded play meets no owner stop. */
export function delegatedCareer(seed: string, name: string) {
  const w = createWorld({ country: 'ENG', name, color: FIRST_COLOUR, seed, level: 'easy' });
  const responsibilities = w.settings!.responsibilities;
  for (const key of Object.keys(responsibilities) as (keyof typeof responsibilities)[])
    responsibilities[key] = 'delegated';
  return w;
}

export const LEGACY_FOUNDING: Founding = {
  country: 'ENG',
  name: 'Legacy Kit Athletic',
  color: '#385577',
  seed: 'identity-legacy',
  level: 'easy',
};
/**
 * A current-rules career as it was saved before club identities: two rounds played, then every
 * identity, recorded appearance and pending kit choice taken away.
 */
export function preIdentityCareer(): World {
  const w = simulatedWorld(LEGACY_FOUNDING, { rounds: 2 });
  for (const club of w.clubs) delete club.identity;
  for (const match of w.ownMatches) delete match.appearance;
  delete w.kitChoice;
  return w;
}
/**
 * The checkpoint a container-1 writer made of `w`: today's canonical payload and its checksum
 * (which covers only the payload) under envelope schema 1. Without identities or appearances the
 * payload holds nothing a container-1 reader would drop.
 */
export async function containerOneCheckpoint(w: World, generation = 1, parentGeneration = 0) {
  return JSON.stringify({
    ...JSON.parse(await encode(w, generation, parentGeneration)),
    schema: 1,
  });
}
/** What writer activation makes of a pre-identity career: missing designs, one revision, no more. */
export function adoptedCareer(legacy: World) {
  const w = structuredClone(legacy);
  installMissingIdentities(w);
  w.revision++;
  return w;
}

/** The game-in-play manifest naming `raw` as the committed checkpoint in slot:a (→SAVE-3). */
export function manifestOf(raw: string) {
  const { worldId, generation, parentGeneration } = JSON.parse(raw) as {
    worldId: string;
    generation: number;
    parentGeneration: number;
  };
  return JSON.stringify({ slot: 0, worldId, generation, parentGeneration });
}

/**
 * Newer data a later version may write over a valid predecessor: an envelope schema this version
 * does not know, or a newer own-club identity format inside a valid current envelope.
 */
export const FUTURE_CHECKPOINTS: Record<
  string,
  (w: World, generation: number, parentGeneration: number) => Promise<string>
> = {
  // The container after the match-model one (→SAVE-23), which this version cannot know.
  [`envelope schema ${FULL_MODEL_CHECKPOINT_SCHEMA + 1}`]: async (
    w,
    generation,
    parentGeneration,
  ) =>
    JSON.stringify({
      ...JSON.parse(await encode(w, generation, parentGeneration)),
      schema: FULL_MODEL_CHECKPOINT_SCHEMA + 1,
    }),
  'identity format 2': async (w, generation, parentGeneration) => {
    const future = structuredClone(w);
    const own = future.clubs.find((club) => club.id === future.playerClub)!;
    own.identity = { ...identityOf(future, own.id), version: 2 } as unknown as ClubIdentity;
    return encode(future, generation, parentGeneration);
  },
};
