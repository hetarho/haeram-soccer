import type { World } from './types';

export const CURRENT_ENGINE_VERSION = '1.16.0';
/**
 * 1.1.0 added club policy; 1.2.0 staff, academy, transfer windows and the inbox; 1.3.0 closes
 * the season after its final round, opens the summer window there, normalizes league match
 * income to a 46-game season and adds business delegation and cash warnings; 1.4.0 plays own and
 * own-league matches as player duels and adds care actions; 1.5.0 starts clubs level with their
 * league, rates every club by its XI, charges only fatigue beyond match fitness, raises weekly
 * recovery and records match xG; 1.6.0 records advanced match counters, defends tactic lines,
 * adds manager styles, owner requests to the manager, club visions and academy investment; 1.7.0
 * lets delegated staff weigh age, contract, cash runway and prospects when selling; 1.8.0 replaces
 * the six club visions with a six-slot club build (a stored vision loads as its preset); 1.9.0
 * founds clubs in 1950 in the amateur league, plays domestic cups and continental knockouts during
 * the season, rates every club by Elo, evolves clubs nobody owns, adds injuries, spring retirement
 * announcements, a transfer list instead of instant sales and a coaching investment with
 * delegated hiring, and recalibrates match outcomes; 1.10.0 replaces the transfer list's asking
 * prices with a stance per player (listed, open, untouchable) and sets coaching investment per
 * department (a 1.9 listing loads as listed, a club-wide level as every department's); 1.11.0
 * gives managers and coaches an age and a ceiling they grow toward (fading from 60, managers
 * retiring at 70); people from older saves keep their level; 1.12.0 archives what a closed
 * season's pages need once its live tables are gone: the league's ten leading scorers, the own
 * rank after every round, the Club Elo spread and the brackets of the own cup and the continental
 * knockouts (seasons closed earlier keep none); 1.13.0 keeps a strategy reserved for the next
 * season and a manager market of free agents, sacked managers and other clubs' managers; 1.14.0
 * plays continental legs on each era's gap (two weeks before 2003, then one, the Champions
 * League's last 16 three until 2024), knockout-only eras from September; 1.15.0 lives every
 * progression mode through the same days in one order with draws named by what they settle,
 * swaps the amateur level with the last professional division by the amateur table, converts
 * every live amount at a currency change, lists the market per settings and keeps an outgoing
 * bid's player and terms as its `offer` (a bid pending from before has none); 1.16.0 pays a league
 * distribution and a local-supporter gate on the football index of catalog 2026-demo-2 with no
 * global fan income, signs sponsors per slot by era, pays players market wages agreed in contract
 * talks at the window openings (unhappy players, transfer requests, expiring contracts), gives
 * every player an agent and every contract signed promotion and relegation clauses, lets the owner
 * choose staff and manager terms and delegate contract talks and the manager post (a 1.15 sponsor
 * loads as its slot's contract; wages stay until renewal; activation draws each existing player's
 * agent from his id, and running contracts carry no clauses until their next signing).
 */
export const SUPPORTED_ENGINE_VERSIONS: readonly string[] = [
  '1.0.0',
  '1.1.0',
  '1.2.0',
  '1.3.0',
  '1.4.0',
  '1.5.0',
  '1.6.0',
  '1.7.0',
  '1.8.0',
  '1.9.0',
  '1.10.0',
  '1.11.0',
  '1.12.0',
  '1.13.0',
  '1.14.0',
  '1.15.0',
  CURRENT_ENGINE_VERSION,
];
/** A world pins its catalog ID and the fingerprint recorded with it (→ARCH-10). */
export type CatalogPin = Pick<World, 'catalog' | 'catalogHash'>;
/**
 * Catalogs an older checkpoint may be pinned to, each by the hash recorded then. 2026-demo-2 added
 * the football index and the sponsor-slot eras and left prices as they were, so a 2026-demo-1 save
 * changes no recorded fact and moves its pin on writer activation (→SAVE-10).
 */
export const PRIOR_CATALOG_HASHES: Readonly<Record<string, string>> = {
  '2026-demo-1': '94375c9a798cba789f2d6b319171bf7b45d52090ab0b83ca56b14626d196f679',
};
export const SAVE_COMPATIBILITY_CODE = 'save-compatibility' as const;

export class SaveCompatibilityError extends Error {
  readonly code = SAVE_COMPATIBILITY_CODE;
  constructor(
    message = '지원하지 않는 저장 버전 또는 카탈로그입니다. 원본 파일을 내보내 보관하세요.',
  ) {
    super(message);
    this.name = 'SaveCompatibilityError';
  }
}

export function isSaveCompatibilityError(error: unknown): error is SaveCompatibilityError {
  return (
    error instanceof SaveCompatibilityError ||
    (!!error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === SAVE_COMPATIBILITY_CODE)
  );
}

/**
 * Only rule metadata, the catalog pin and the revision change; absent optional fields and all prior
 * facts survive.
 */
export function upgradeWorldRules(w: World, pin: CatalogPin): World {
  if (w.engine === CURRENT_ENGINE_VERSION && w.catalog === pin.catalog) return w;
  if (!SUPPORTED_ENGINE_VERSIONS.includes(w.engine)) throw new SaveCompatibilityError();
  if (!Number.isSafeInteger(w.revision + 1)) throw new Error('저장 revision 범위를 초과했습니다.');
  return {
    ...w,
    engine: CURRENT_ENGINE_VERSION,
    catalog: pin.catalog,
    catalogHash: pin.catalogHash,
    revision: w.revision + 1,
  };
}
