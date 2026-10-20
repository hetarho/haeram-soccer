import type { World } from './types';

export const CURRENT_ENGINE_VERSION = '4.0.0';
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
 */
/** Only rules 4.0.0: an earlier career is never converted (→SAVE-16, SAVE-19). */
export const SUPPORTED_ENGINE_VERSIONS: readonly string[] = [CURRENT_ENGINE_VERSION];
/** A world pins its catalog ID and the fingerprint recorded with it (→ARCH-10). */
export type CatalogPin = Pick<World, 'catalog' | 'catalogHash'>;
/**
 * Catalogs an older checkpoint may be pinned to, each by the hash recorded then. 2026-demo-2 added
 * the football index and the sponsor-slot eras and left prices as they were, so a 2026-demo-1 save
 * changes no recorded fact and moves its pin on writer activation (→SAVE-10). Catalog 2026-demo-3
 * adds sourced registration rules; both older pins preserve historical prices and index facts.
 */
export const PRIOR_CATALOG_HASHES: Readonly<Record<string, string>> = {
  '2026-demo-2': 'f51d581ce05db0e27e25216615b1cce5c67e00bf6bb5da6118407f63167284ae',
  '2026-demo-1': '94375c9a798cba789f2d6b319171bf7b45d52090ab0b83ca56b14626d196f679',
};
/** Explicitly released historical rules; an arbitrary older semver is not reset permission. */
export const LEGACY_ENGINE_VERSIONS: readonly string[] = [
  ...Array.from({ length: 23 }, (_, minor) => `1.${minor}.0`),
  '2.0.0',
  '3.0.0',
];
export const SAVE_COMPATIBILITY_CODE = 'save-compatibility' as const;

export class SaveCompatibilityError extends Error {
  readonly code = SAVE_COMPATIBILITY_CODE;
  constructor(
    message = '지원하지 않는 저장 버전 또는 카탈로그입니다. 원본 파일을 내보내 보관하세요.',
    /** The rules version the save was written under, when that is why it cannot open. */
    readonly engine?: string,
  ) {
    super(message);
    this.name = 'SaveCompatibilityError';
  }
}
/** Whether rules `engine` came before the current ones: an earlier-rules career (→SAVE-16). */
export function isEarlierEngine(engine: string) {
  const parts = (version: string) => version.split('.').map((part) => Number(part));
  const [found, current] = [parts(engine), parts(CURRENT_ENGINE_VERSION)];
  for (let i = 0; i < 3; i++) {
    const a = found[i] ?? 0,
      b = current[i] ?? 0;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (a !== b) return a < b;
  }
  return false;
}
/** What an earlier-rules save says when it is asked to open (→SAVE-16). */
export const earlierRulesMessage = (engine: string) =>
  `이 저장은 규칙 ${engine} 커리어입니다 — 규칙 ${CURRENT_ENGINE_VERSION} 커리어만 열 수 있습니다. 새 커리어를 시작하세요`;
/** The rules version an envelope names in its header, read without decoding its payload. */
export function envelopeEngine(raw: string) {
  return /"engine"\s*:\s*"([^"]{1,20})"/.exec(raw.slice(0, 400))?.[1];
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
