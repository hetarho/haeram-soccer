import { encode } from '../../apps/web/src/adapters/persistence';
import type { ClubIdentity, KitRole } from '../../packages/contracts/src/identity';
import type { World } from '../../packages/contracts/src/types';
import { MANAGER_HISTORY_CHECKPOINT_SCHEMA } from '../../packages/contracts/src/versions';
import {
  activateMatchModel,
  ensureManagerHistory,
  identityOf,
  installMissingIdentities,
  MATCH_MODEL_RELEASE,
  type MatchModelRelease,
} from '../../packages/engine/src/index';
import { careerWorld, type CareerInput } from '../../packages/engine/src/career.testkit';
import { withoutMatchModel } from './earlier-saves';
import { simulatedWorld, withoutManagerHistory } from './worlds';

/**
 * Marked synthetic fixtures for the club-identity continuity journeys (T254; →KIT-9/12/15,
 * →SAVE-3/20/21/22). Worlds come from the real takeover, settlement and codec paths. Nothing
 * here relabels gameplay rules or skips validation: an older container is today's payload under
 * envelope schema 1, as a writer before identities wrote it, and newer data is only ever refused.
 */

/**
 * The design the continuity journey applies: a one-colour crest and three patterned shirts.
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

/** The colour the later edit gives the shirt the settled match was played in. */
export const EDITED_SHIRT_COLOUR = '#E0218A';

/**
 * The later design: `FOUNDED_DESIGN` with a three-colour crest and a new secondary for the shirt
 * `role` was worn in.
 */
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
export function delegatedCareer(seed: string) {
  const w = careerWorld({ country: 'ENG', seed });
  const responsibilities = w.settings!.responsibilities;
  for (const key of Object.keys(responsibilities) as (keyof typeof responsibilities)[])
    responsibilities[key] = 'delegated';
  return w;
}

export const LEGACY_CAREER: CareerInput = { country: 'ENG', seed: 'identity-legacy' };
/**
 * A current-rules career as it was saved before club identities: taken over and played two rounds,
 * then saved without the full model's data, as every career before its release was (→SAVE-23),
 * every identity, recorded appearance and pending kit choice taken away, and the manager history
 * that came later still (→SAVE-24).
 */
export function preIdentityCareer(): World {
  const w = withoutMatchModel(
    withoutManagerHistory(structuredClone(simulatedWorld(LEGACY_CAREER, { rounds: 2 }))),
  );
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
/**
 * What writer activation makes of a pre-identity career: missing designs, one revision, the full
 * match model recorded there when `release` is on (the build's switch by default, →SAVE-23) and
 * own-manager tracking started there (→SAVE-24), no more — the host's order and single revision.
 */
export function adoptedCareer(legacy: World, release: MatchModelRelease = MATCH_MODEL_RELEASE) {
  const w = structuredClone(legacy);
  installMissingIdentities(w);
  w.revision++;
  activateMatchModel(w, release);
  ensureManagerHistory(w);
  return w;
}

/** The game-in-play manifest naming `raw` as the committed IndexedDB checkpoint (→SAVE-3). */
export function manifestOf(raw: string) {
  const { worldId, generation, parentGeneration } = JSON.parse(raw) as {
    worldId: string;
    generation: number;
    parentGeneration: number;
  };
  return JSON.stringify({ worldId, generation, parentGeneration });
}

/**
 * Newer data a later version may write over a valid predecessor: an envelope schema this version
 * does not know, or a newer own-club identity format inside a valid current envelope.
 */
export const FUTURE_CHECKPOINTS: Record<
  string,
  (w: World, generation: number, parentGeneration: number) => Promise<string>
> = {
  // The container after the manager-history one (→SAVE-24), which this version cannot know.
  [`envelope schema ${MANAGER_HISTORY_CHECKPOINT_SCHEMA + 1}`]: async (
    w,
    generation,
    parentGeneration,
  ) =>
    JSON.stringify({
      ...JSON.parse(await encode(w, generation, parentGeneration)),
      schema: MANAGER_HISTORY_CHECKPOINT_SCHEMA + 1,
    }),
  'identity format 3': async (w, generation, parentGeneration) => {
    const future = structuredClone(w);
    const own = future.clubs.find((club) => club.id === future.playerClub)!;
    own.identity = { ...identityOf(future, own.id), version: 3 } as unknown as ClubIdentity;
    return encode(future, generation, parentGeneration);
  },
};
