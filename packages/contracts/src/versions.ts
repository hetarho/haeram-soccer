import { message as sourceMessage } from './messages';
import type { World } from './types';

/**
 * The game's one version (→SAVE-10): every package's `version`, the rules a world plays and what the
 * screens print. 0.8.0 starts the rules-5.0.0 line, a career begun by taking a club over
 * (→SAVE-26); a match-model revision ships inside a version (→SAVE-23).
 */
export const CURRENT_ENGINE_VERSION = '0.8.2';
/**
 * The rules-4.0.0 line: its own label and game version 0.7.0, which continued it. Its careers were
 * written in the match-model and manager-history containers too (→SAVE-23/24), so the legacy
 * reset recognizes them there (→SAVE-26).
 */
export const RULES_FOUR_VERSIONS: readonly string[] = ['4.0.0', '0.7.0'];
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
 * bid's player and terms as its `offer` (a bid pending from before has none); 1.16.0 pays league
 * distributions and cup and continental prizes on the broadcasting index and a local-supporter
 * gate on the football index of catalog 2026-demo-2 with no global fan income, quotes facilities
 * on the football index, charges operating expenses on the larger of the division amount and a
 * share of last season's turnover (the division amount after a relegation), recorded as
 * `operatingExpenses` when a season starts, signs sponsors per slot by era, pays players market
 * wages agreed in contract talks at the window openings (unhappy players, transfer requests,
 * expiring contracts), gives every player an agent and every contract signed promotion and
 * relegation clauses, lets the owner choose staff and manager terms, saves one intervention
 * level (`intervention`) that alone delegates contract talks under a talk rule (`talkRule`,
 * declined past 65% of revenue on the wage bill), the manager post and the coaching departments
 * under hiring criteria (`hiring`), and applies the operating strategy at once with no lock in
 * place of one change a season (`buildYear`), a lock per slot (`buildChanged`) and a reservation
 * (`buildNext`), all read only from older worlds (a 1.15 sponsor loads as its slot's contract;
 * staff switches (`delegation`) load as the level and coaching investment levels as hiring
 * criteria; wages stay until renewal; a world without `operatingExpenses` pays its division's
 * floor until its next season starts; activation draws each existing player's agent from his id,
 * running contracts carry no clauses until their next signing and a reserved strategy is dropped
 * with an inbox item naming it); 1.17.0 keeps the direction rows the delegated staff follow
 * (`direction`: 재계약 기조, 선호 학파, 감독 기조, 코치 기조, 재정 기조) in place of the talk rule
 * and the hiring and manager criteria, which load as the nearest rows (activation names them in
 * the inbox), and hands the staff sponsors, the coaches and the manager from intervention level 3;
 * 1.18.0 adds the youth rows 육성 목표 and 데뷔 시점, replaces the 1군 직행 경로 card with 엘리트
 * 선발 (a build holding it loads with 데뷔 시점 빠른 데뷔) and lets delegated staff set stances;
 * 1.19.0 adds 지역 기반 and 글로벌 인지도 (`localBase`, `globalReach`) built by the 지역 and
 * 글로벌 dials in place of marketing (a marketing level loads as 해외 마케팅), starts no campaign
 * and replaces the 글로벌 브랜드 card with 지역 상생; 1.20.0 lets the chief scout sign players with
 * transfers delegated, marking his bids `staff`; 1.21.0 adds the 글로벌 스카우팅 synergy and founds
 * a club with the direction preset chosen (no new fields); 1.22.0 adds the 단장 (staff role
 * `director`), who carries the transfer negotiation the chief scout carried and takes contract
 * talks, the manager post and transfers when delegated, his bids marked `staff` (activation gives
 * an older club a volunteer 단장, or moves a negotiator chief scout to the post with his contract
 * and a volunteer to the scout's). 2.0.0 is the player model (→PLAYER): 14 attributes, sided
 * positions with levels, roles, traits, adaptation and other clubs' 조직력, formations, four
 * difficulty levels; it starts new careers, and earlier versions are no longer read (→SAVE-16).
 * 4.0.0 plays the own club's matches touch by touch on the grid engine (every other fixture on the
 * probabilistic path), gives players 16 attributes, adds cards and suspensions, in-match
 * substitutions and injuries, extra time and shoot-outs and post-match material; it starts new
 * careers, and a recognized earlier career is cleared once on writer activation (→SAVE-18, SAVE-19).
 * 0.7.0 numbers the game itself and plays the 4.0.0 rules unchanged (→SAVE-10). 0.8.0 starts the
 * rules-5.0.0 line: a career begins by taking over a club of a world generated from 1930, with the
 * owner's fortune, traits, books and the seasons before him (→SAVE-26); a 0.7.0 or 4.0.0 career
 * founded in an amateur league has none of them to convert, so it is cleared once on writer
 * activation like every earlier line (→SAVE-18, WEB-62), its exported files refused on import.
 */
/**
 * Explicit same-rules patch labels, never an open-ended older range. Incompatible earlier
 * gameplay remains refused (→SAVE-10, SAVE-16, SAVE-19, SAVE-26).
 */
export const COMPATIBLE_ENGINE_VERSIONS: readonly string[] = ['0.8.0', '0.8.1'];
export const SUPPORTED_ENGINE_VERSIONS: readonly string[] = [
  CURRENT_ENGINE_VERSION,
  ...COMPATIBLE_ENGINE_VERSIONS,
];
/** A world pins its catalog ID and the fingerprint recorded with it (→ARCH-10). */
export type CatalogPin = Pick<World, 'catalog' | 'catalogHash'>;
/**
 * Catalogs an older checkpoint may be pinned to, each by the hash recorded then. 2026-demo-2 added
 * the football index and the sponsor-slot eras and left prices as they were, so a 2026-demo-1 save
 * changes no recorded fact and moves its pin on writer activation (→SAVE-10). Catalog 2026-demo-3
 * adds sourced registration rules; both older pins preserve historical prices and index facts.
 * 2026-demo-4 re-levels every country's money but England's (→ECON-35), so only an English career
 * moves from these pins; another country's is refused on load. 2026-demo-5 changes only the
 * person-name pools (→WORLD-12), so a 2026-demo-4 career of any country moves.
 */
export const PRIOR_CATALOG_HASHES: Readonly<Record<string, string>> = {
  '2026-demo-4': '1381bd5891d2bad9f879a83b2f9965f106151c71747232b3c550d180b9785e97',
  '2026-demo-3': '5c4dc847344070fba54562572233a41a00ca2adac9c132f6a93845876b06da4f',
  '2026-demo-2': 'f51d581ce05db0e27e25216615b1cce5c67e00bf6bb5da6118407f63167284ae',
  '2026-demo-1': '94375c9a798cba789f2d6b319171bf7b45d52090ab0b83ca56b14626d196f679',
};
/** Catalogs whose money stood at the 1901 parities, before 2026-demo-4's levels (→ECON-35). */
export const PARITY_LEVEL_CATALOGS: readonly string[] = [
  '2026-demo-1',
  '2026-demo-2',
  '2026-demo-3',
];
export const RELEVELLED_MONEY_MESSAGE = sourceMessage('copy.versions.54108813b4');
/** Explicitly released historical rules; an arbitrary older semver is not reset permission. */
export const LEGACY_ENGINE_VERSIONS: readonly string[] = [
  ...Array.from({ length: 23 }, (_, minor) => `1.${minor}.0`),
  '2.0.0',
  '3.0.0',
  ...RULES_FOUR_VERSIONS,
];
/**
 * The checkpoint container (envelope) schema, separate from `World.schema` and the bridge protocol,
 * which stay 1. Container 2 carries club identities (→SAVE-20), so a reader that knows only 1
 * refuses such a save instead of silently dropping the designs.
 */
export const CURRENT_CHECKPOINT_SCHEMA = 2;
/**
 * The container after the identity container, for checkpoints carrying full-model metadata, NPC
 * season aggregates or full records (→SAVE-23), so an older reader refuses them instead of dropping
 * fields. Only such worlds are written in it (`checkpointSchemaFor`); unactivated worlds keep the
 * current container.
 */
export const FULL_MODEL_CHECKPOINT_SCHEMA = 3;
/**
 * The container after the full-model one, for checkpoints carrying own-manager history facts or a
 * record linked to a tenure (→SAVE-24), with or without full-model data, so an older reader
 * refuses them instead of dropping the attribution.
 */
export const MANAGER_HISTORY_CHECKPOINT_SCHEMA = 4;
/** Containers this version reads; any other is a compatibility failure, never corruption. */
export const SUPPORTED_CHECKPOINT_SCHEMAS = [
  1,
  CURRENT_CHECKPOINT_SCHEMA,
  FULL_MODEL_CHECKPOINT_SCHEMA,
  MANAGER_HISTORY_CHECKPOINT_SCHEMA,
] as const;
/** Whether a world holds own-manager history facts or an own record linked to a tenure. */
export const carriesManagerHistory = (w: Pick<World, 'managerHistory' | 'ownMatches'>) =>
  !!w.managerHistory || w.ownMatches.some((m) => m.managerTenure !== undefined);
export type CheckpointSchema = (typeof SUPPORTED_CHECKPOINT_SCHEMAS)[number];
export const isCheckpointSchema = (value: unknown): value is CheckpointSchema =>
  (SUPPORTED_CHECKPOINT_SCHEMAS as readonly unknown[]).includes(value);
export const SAVE_COMPATIBILITY_CODE = 'save-compatibility' as const;

export class SaveCompatibilityError extends Error {
  readonly code = SAVE_COMPATIBILITY_CODE;
  constructor(
    message: string = sourceMessage('copy.versions.0c69f5a349'),
    /** The rules version the save was written under, when that is why it cannot open. */
    readonly engine?: string,
  ) {
    super(message);
    this.name = 'SaveCompatibilityError';
  }
}
/**
 * Whether `engine` is a released earlier rules version: an earlier-rules career (→SAVE-16). The game
 * version restarted its numbering at 0.7.0, so only the released list says what came before; any
 * other unsupported version is from a newer game (→SAVE-11).
 */
export const isEarlierEngine = (engine: string) => LEGACY_ENGINE_VERSIONS.includes(engine);
/** What an earlier-rules save says when it is asked to open (→SAVE-16). */
export const earlierRulesMessage = (engine: string) =>
  sourceMessage('copy.versions.1d608b421f', { p0: engine, p1: CURRENT_ENGINE_VERSION });
/** What a save of a version neither supported nor earlier says: it is from a newer game (→SAVE-11). */
export const NEWER_GAME_MESSAGE = sourceMessage('copy.versions.29c62efe49', {
  p0: CURRENT_ENGINE_VERSION,
});
/**
 * The rules version an envelope names in its header, read without decoding its payload; none for a
 * container this version cannot read, whose header is not evidence of earlier rules.
 */
export function envelopeEngine(raw: string) {
  const header = raw.slice(0, 400);
  const schema = /"schema"\s*:\s*(\d{1,9})\b/.exec(header)?.[1];
  if (!isCheckpointSchema(Number(schema))) return undefined;
  return /"engine"\s*:\s*"([^"]{1,20})"/.exec(header)?.[1];
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
 * The writer-activation rules step every load, import and the worker share (→SAVE-3, SAVE-10): only
 * rule metadata — a supported label becomes the current version — the catalog pin and the revision
 * change; absent optional fields and all prior facts survive.
 */
export function upgradeWorldRules(w: World, pin: CatalogPin): World {
  if (w.engine === CURRENT_ENGINE_VERSION && w.catalog === pin.catalog) return w;
  if (!SUPPORTED_ENGINE_VERSIONS.includes(w.engine)) throw new SaveCompatibilityError();
  if (!Number.isSafeInteger(w.revision + 1)) throw new Error(sourceMessage('copy.host.b53dad7fec'));
  return {
    ...w,
    engine: CURRENT_ENGINE_VERSION,
    catalog: pin.catalog,
    catalogHash: pin.catalogHash,
    revision: w.revision + 1,
  };
}
