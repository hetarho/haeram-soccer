import { RowSaver } from '../../apps/web/src/adapters/rowSaver';
import { SAVE_SCHEMA_VERSION } from '../../apps/web/src/adapters/saveSchema';
import { encodeSaveFile, saveMetaOf } from '../../apps/web/src/adapters/saveFile';
import { sqlRecordStore } from '../../apps/web/src/adapters/sqlRecordStore';
import type { ClubIdentity, KitRole } from '../../packages/contracts/src/identity';
import type { World } from '../../packages/contracts/src/types';
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
import { nodeSqliteDriver } from './node-sqlite';
import { saveFileOf } from './save-file';
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
 * The save file of a pre-identity career `w` (→SAVE-9): without identities or appearances it holds
 * nothing a later writer adds, and it is what a supported earlier career looks like once it is
 * saved by this version.
 */
export const legacyCareerFile = saveFileOf;
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

/**
 * Newer data a later version may write over a valid game: a database schema this version does not
 * know, or a newer own-club identity format inside a valid current database.
 */
export const FUTURE_FILES: Record<string, (w: World) => Promise<Uint8Array>> = {
  [`database schema ${SAVE_SCHEMA_VERSION + 1}`]: async (w) => {
    const driver = nodeSqliteDriver();
    try {
      const store = sqlRecordStore(driver);
      new RowSaver(store).save(w);
      store.write({
        put: [],
        delete: [],
        meta: { schema_version: String(SAVE_SCHEMA_VERSION + 1) },
      });
      return await encodeSaveFile(saveMetaOf(store.meta()), driver.serialize());
    } finally {
      driver.close();
    }
  },
  'identity format 3': async (w) => {
    const future = structuredClone(w);
    const own = future.clubs.find((club) => club.id === future.playerClub)!;
    own.identity = { ...identityOf(future, own.id), version: 3 } as unknown as ClubIdentity;
    return saveFileOf(future);
  },
};
