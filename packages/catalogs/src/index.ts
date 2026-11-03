export const CATALOG_VERSION = '2026-demo-5';
import squadRulesData from '../data/squad-rules.json' with { type: 'json' };
import priceData from '../data/prices.json' with { type: 'json' };
import footballData from '../data/football-index.json' with { type: 'json' };
import namesData from '../data/names.json' with { type: 'json' };
import type { CountryCode } from '../../contracts/src/types';
import type { CatalogPin } from '../../contracts/src/versions';
import type { LoadCatalog } from '../../contracts/src/schema';
/** Provenance of a catalog figure (→ECON-3): never call a proxy or an estimate an observation. */
export type Observation = 'observed' | 'estimated' | 'projected';
export interface CountryProfile {
  code: CountryCode;
  iso: string;
  name: string;
  flag: string;
  groups: number[][];
  moves: number[];
  automatic: number[];
  cities: string[];
  terms: string[];
  given: string[];
  family: string[];
  /**
   * The country's money per £1 of 1901 prices, in its 1901 unit, that every quote multiplies: set
   * so its 1999 amounts convert at the real rate, €1.518 per £ through the euro's fixed rates
   * (→ECON-35).
   */
  scale: number;
  source: string;
  reference: string;
}
/** Each country's person-name pools (→WORLD-12), curated with the references the file names. */
const NAMES: Record<CountryCode, { given: string[]; family: string[] }> = namesData.countries;
export const COUNTRIES: CountryProfile[] = [
  {
    code: 'ENG',
    iso: 'GBR',
    name: '잉글랜드',
    flag: '🏴',
    groups: [[20], [24], [24], [24]],
    moves: [3, 3, 4],
    automatic: [2, 2, 3],
    cities: ['York', 'Bristol', 'Oxford', 'Leeds', 'Bath', 'Lancaster', 'Durham', 'Norwich'],
    terms: ['Forge', 'Railway', 'Borough', 'Ironworks', 'Mill', 'Meadow', 'Vale', 'Harbour'],
    given: NAMES.ENG.given,
    family: NAMES.ENG.family,
    scale: 1,
    source: 'https://www.efl.com/documents/efl-handbook.pdf',
    reference: '2026/27: 20/24/24/24',
  },
  {
    code: 'ESP',
    iso: 'ESP',
    name: '스페인',
    flag: '🇪🇸',
    groups: [[20], [22]],
    moves: [3],
    automatic: [2],
    cities: ['Sevilla', 'Bilbao', 'Oviedo', 'Vigo', 'Toledo', 'Malaga', 'Leon', 'Granada'],
    terms: ['Forja', 'Aurora', 'Acero', 'Puerto', 'Sierra', 'Alameda'],
    given: NAMES.ESP.given,
    family: NAMES.ESP.family,
    scale: 126.3,
    source: 'https://www.laliga.com/en-GB/transparency/institutional-information',
    reference: 'Modern: 20/22',
  },
  {
    code: 'GER',
    iso: 'DEU',
    name: '독일',
    flag: '🇩🇪',
    groups: [[18], [18], [20]],
    moves: [3, 3],
    automatic: [2, 2],
    cities: ['Bremen', 'Kiel', 'Bonn', 'Essen', 'Dresden', 'Mainz', 'Aachen', 'Lubeck'],
    terms: ['Eisen', 'Werk', 'Wald', 'Hafen', 'Adler', 'Kraft'],
    given: NAMES.GER.given,
    family: NAMES.GER.family,
    scale: 111.2,
    source:
      'https://www.bundesliga.com/en/faq/what-are-the-rules-and-regulations-of-soccer/how-does-promotion-and-relegation-work-in-the-bundesliga-10645',
    reference: 'Modern: 18/18/20; 2 direct + relegation playoff',
  },
  {
    code: 'ITA',
    iso: 'ITA',
    name: '이탈리아',
    flag: '🇮🇹',
    groups: [[20], [20], [20, 20, 20]],
    moves: [3, 4],
    automatic: [2, 3],
    cities: ['Torino', 'Parma', 'Modena', 'Bari', 'Pisa', 'Como', 'Lucca', 'Bergamo'],
    terms: ['Ferro', 'Aurora', 'Borgo', 'Olivo', 'Officina', 'Vela'],
    given: NAMES.ITA.given,
    family: NAMES.ITA.family,
    scale: 1988,
    source: 'https://www.lega-pro.com/com/2526-208L.pdf',
    reference: '2025/26: 20/20/3×20; regional allocation normalized',
  },
  {
    code: 'FRA',
    iso: 'FRA',
    name: '프랑스',
    flag: '🇫🇷',
    groups: [[18], [18], [18]],
    moves: [3, 3],
    automatic: [2, 2],
    cities: ['Rouen', 'Tours', 'Dijon', 'Reims', 'Metz', 'Nantes', 'Lille', 'Brest'],
    terms: ['Forges', 'Aurore', 'Port', 'Atelier', 'Vallee', 'Chene'],
    given: NAMES.FRA.given,
    family: NAMES.FRA.family,
    scale: 1607,
    source: 'https://ligue1.com/fr/articles/l1_article_5089-',
    reference: '2026/27: 18/18/18',
  },
  {
    code: 'POR',
    iso: 'PRT',
    name: '포르투갈',
    flag: '🇵🇹',
    groups: [[18], [18]],
    moves: [3],
    automatic: [2],
    cities: ['Braga', 'Faro', 'Coimbra', 'Aveiro', 'Evora', 'Viseu', 'Setubal', 'Guimaraes'],
    terms: ['Ferro', 'Aurora', 'Mar', 'Oficina', 'Vale', 'Nave'],
    given: NAMES.POR.given,
    family: NAMES.POR.family,
    scale: 60510,
    source: 'https://www.ligaportugal.pt/pages/sobre-a-liga',
    reference: '2025/26: 18/18; reserves normalized to fictional senior clubs',
  },
  {
    code: 'NED',
    iso: 'NLD',
    name: '네덜란드',
    flag: '🇳🇱',
    groups: [[18], [20]],
    moves: [3],
    automatic: [2],
    cities: ['Delft', 'Leiden', 'Haarlem', 'Breda', 'Zwolle', 'Alkmaar', 'Gouda', 'Venlo'],
    terms: ['Haven', 'IJzer', 'Weide', 'Spoor', 'Wind', 'Brug'],
    given: NAMES.NED.given,
    family: NAMES.NED.family,
    scale: 9.019,
    source: 'https://www.knvb.nl/competities/eredivisie/historie',
    reference: 'Modern: 18/20; period-title qualification normalized',
  },
  {
    code: 'BEL',
    iso: 'BEL',
    name: '벨기에',
    flag: '🇧🇪',
    groups: [[18], [15]],
    moves: [3],
    automatic: [2],
    cities: ['Gent', 'Brugge', 'Leuven', 'Namur', 'Mons', 'Mechelen', 'Liege', 'Kortrijk'],
    terms: ['Forge', 'Haven', 'Atelier', 'Val', 'Spoor', 'Union'],
    given: NAMES.BEL.given,
    family: NAMES.BEL.family,
    scale: 154.4,
    source:
      'https://www.proleague.be/nieuws/challenger-pro-league-heeft-nieuw-format-zonder-quota-voor-u23',
    reference: '2026/27: 18/15; senior/reserve/expansion exceptions normalized',
  },
];
export const country = (code: string) => {
  const c = COUNTRIES.find((c) => c.code === code);
  if (!c) throw new Error('지원하지 않는 국가입니다.');
  return c;
};
function rawPriceIndex(
  code: string,
  year: number,
): { value: number; status: Observation; source: string } {
  const c = country(code);
  const values = priceData.worldBank[c.iso as keyof typeof priceData.worldBank] as Record<
    string,
    number
  >;
  const years = Object.keys(values)
    .map(Number)
    .sort((a, b) => a - b);
  const first = years[0],
    last = years.at(-1)!;
  if (values[year] !== undefined)
    return { value: values[year], status: 'observed', source: 'World Bank CPI (2010=100)' };
  if (year < first) {
    const uk = priceData.ukHistorical as Record<string, number>;
    const y = Math.max(1901, year);
    return {
      value: (values[first] * uk[y]) / uk[first],
      status: code === 'ENG' ? 'observed' : 'estimated',
      source:
        code === 'ENG'
          ? 'ONS long-run historical series, linked'
          : 'ONS UK proxy linked to national CPI',
    };
  }
  return {
    value: values[last] * 1.02 ** (year - last),
    status: 'projected',
    source: '최근 관측 이후 연 2% 가정',
  };
}
const priceCache = new Map<string, ReturnType<typeof rawPriceIndex>>();
export function priceIndex(code: string, year: number) {
  const key = `${code}:${year}`;
  const cached = priceCache.get(key);
  if (cached) return cached;
  const value = rawPriceIndex(code, year);
  priceCache.set(key, value);
  return value;
}
/** What football pays and charges in a country and year, beyond consumer prices (→ECON-26). */
export interface FootballIndex {
  value: number;
  /** The index divided by the price index, normalized to the catalog's base year. */
  real: number;
  status: Observation;
  source: string;
}
/**
 * What a league's central money, above all its television rights, is worth in a country and year
 * (→ECON-31). `real` is its multiple against prices on the football index's footing: below 1
 * before television sold league football, far above the football index's from the 1990s.
 */
export type BroadcastingIndex = FootballIndex;
/** Sponsor slots in the order they open (→ECON-8). */
export const SPONSOR_SLOTS = ['local', 'kit', 'shirt', 'stadium', 'sleeve'] as const;
export type SponsorSlot = (typeof SPONSOR_SLOTS)[number];
export interface SponsorSlotEra {
  year: number;
  status: Observation;
  source: string;
}
interface IndexEra {
  to: number;
  status: Observation;
  note: string;
  sources: string[];
}
function observation(value: string): Observation {
  if (value === 'observed' || value === 'estimated' || value === 'projected') return value;
  throw new Error(`카탈로그 관측 상태가 올바르지 않습니다: ${value}`);
}
/** The less certain of two statuses: a football estimate on an observed price stays an estimate. */
function leastCertain(a: Observation, b: Observation): Observation {
  if (a === 'projected' || b === 'projected') return 'projected';
  return a === 'observed' && b === 'observed' ? 'observed' : 'estimated';
}
const footballSources: Record<string, string> = footballData.sources;
function attribute(note: string, keys: readonly string[]) {
  const texts = keys.map((key) => {
    const source = footballSources[key];
    if (!source) throw new Error(`카탈로그 출처가 없습니다: ${key}`);
    return source;
  });
  return `${note} — ${texts.join('; ')}`;
}
/** An index's eras and each country's real multiple at the end of every era. */
interface EraTable {
  eras: IndexEra[];
  real: Record<string, { real: number[] }>;
}
interface EraRows {
  eras: { to: number; status: string; note: string; sources: string[] }[];
  index: Record<string, { real: number[] }>;
}
function eraTable(data: EraRows): EraTable {
  return {
    eras: data.eras.map((era) => ({
      to: era.to,
      status: observation(era.status),
      note: era.note,
      sources: era.sources,
    })),
    real: data.index,
  };
}
const football = eraTable(footballData),
  broadcasting = eraTable(footballData.broadcasting);
interface SlotRow {
  year: number;
  status: string;
  note: string;
  sources: string[];
}
/** Opening years are composed once at load, so a lookup costs nothing (like priceIndex's cache). */
function sponsorTable() {
  const table: Record<string, Record<string, SponsorSlotEra>> = {};
  for (const [code, rows] of Object.entries<Record<string, SlotRow>>(footballData.slots)) {
    const eras: Record<string, SponsorSlotEra> = {};
    for (const [slot, row] of Object.entries(rows))
      eras[slot] = {
        year: row.year,
        status: observation(row.status),
        source: attribute(row.note, row.sources),
      };
    table[code] = eras;
  }
  return table;
}
const sponsorEras = sponsorTable();
/**
 * An era index in a country and year: prices times a real multiple that is flat through the first
 * era, grows geometrically from each era's anchor to the next, and holds after the coverage while
 * prices are projected (→ECON-2).
 */
function rawEraIndex(table: EraTable, code: string, year: number): FootballIndex {
  const c = country(code);
  const price = priceIndex(code, year);
  const { eras } = table,
    real = table.real[c.code].real;
  const last = eras.length - 1;
  if (year > eras[last].to) {
    const note = 'After the catalog coverage the real multiple holds and prices are projected';
    return {
      value: price.value * real[last],
      real: real[last],
      status: 'projected',
      source: attribute(note, [...eras[last].sources, c.code]),
    };
  }
  const era = eras.findIndex((e) => year <= e.to);
  const from = era === 0 ? footballData.from : eras[era - 1].to;
  const start = era === 0 ? real[0] : real[era - 1];
  const progress = year <= from ? 0 : (year - from) / (eras[era].to - from);
  const multiple = start * (real[era] / start) ** progress;
  return {
    value: price.value * multiple,
    real: multiple,
    status: leastCertain(price.status, eras[era].status),
    source: attribute(eras[era].note, [...eras[era].sources, c.code]),
  };
}
/** Each lookup is composed once, like priceIndex's. */
function cachedIndex(table: EraTable) {
  const cache = new Map<string, FootballIndex>();
  return (code: string, year: number): FootballIndex => {
    const key = `${code}:${year}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const value = rawEraIndex(table, code, year);
    cache.set(key, value);
    return value;
  };
}
const footballLookup = cachedIndex(football),
  broadcastingLookup = cachedIndex(broadcasting);
export function footballIndex(code: string, year: number): FootballIndex {
  return footballLookup(code, year);
}
/** The broadcasting index league distributions are quoted on (→ECON-31, →ECON-28). */
export function broadcastingIndex(code: string, year: number): BroadcastingIndex {
  return broadcastingLookup(code, year);
}
export function sponsorSlotOpens(code: string, slot: SponsorSlot): SponsorSlotEra {
  const era = sponsorEras[country(code).code][slot];
  if (!era) throw new Error('지원하지 않는 후원 슬롯입니다.');
  return era;
}
/** What a load reads from the catalog to bring a world from older rules forward (→SAVE-10). */
export const LOAD_CATALOG: LoadCatalog = {
  sponsorSlotOpens: (code, slot) => sponsorSlotOpens(code, slot).year,
};
export interface CurrencyPeriod {
  code: string;
  symbol: string;
  units: number;
  num: bigint;
  den: bigint;
  estimated: boolean;
}
const euro: Record<string, [bigint, bigint]> = {
  ESP: [1000n, 166386n],
  GER: [100000n, 195583n],
  ITA: [100n, 193627n],
  FRA: [100000n, 655957n],
  POR: [1000n, 200482n],
  NED: [100000n, 220371n],
  BEL: [10000n, 403399n],
};
export function currency(code: string, year: number): CurrencyPeriod {
  if (code === 'ENG')
    return {
      code: year < 1971 ? 'GBP-LSD' : 'GBP',
      symbol: '£',
      units: year < 1971 ? 240 : 100,
      num: 1n,
      den: 1n,
      estimated: false,
    };
  if (year >= 1999) {
    const [num, den] = euro[code];
    const historical = code === 'FRA' ? 100n : code === 'POR' ? 1000n : code === 'GER' ? 10n : 1n;
    return { code: 'EUR', symbol: '€', units: 100, num, den: den * historical, estimated: false };
  }
  const legacy: Record<string, [string, string]> = {
    ESP: ['ESP', '₧'],
    GER: [year < 1948 ? 'MARK' : 'DEM', year < 1948 ? 'M' : 'DM'],
    ITA: ['ITL', '₤'],
    FRA: [year < 1960 ? 'FRF-OLD' : 'FRF', 'Fr'],
    POR: [year < 1911 ? 'REIS' : 'PTE', year < 1911 ? 'Rs' : 'Esc'],
    NED: ['NLG', 'ƒ'],
    BEL: ['BEF', 'Fr'],
  };
  const [label, symbol] = legacy[code];
  return {
    code: label,
    symbol,
    units: code === 'POR' && year < 1911 ? 1 : 100,
    num: 1n,
    den:
      code === 'FRA' && year >= 1960
        ? 100n
        : code === 'POR' && year >= 1911
          ? 1000n
          : code === 'GER' && year >= 1948
            ? 10n
            : 1n,
    estimated: code === 'GER' && year < 1948,
  };
}
export { priceData, footballData, squadRulesData, namesData };

import { CATALOG_HASH } from './fingerprint';
export { CATALOG_HASH };
/** The catalog a world pins when it is founded or activated (→SAVE-10, →ARCH-10). */
export const CURRENT_CATALOG: CatalogPin = {
  catalog: CATALOG_VERSION,
  catalogHash: CATALOG_HASH,
};

export interface RegistrationRow {
  country: string;
  tiers: number[];
  from: number;
  to: number | null;
  max: number;
  exempt?: {
    ageAtMost?: number;
    loansCount?: true;
    goalkeepers?: true;
    graduatesAgeAtMost?: number;
  };
  bandiera?: { extra: number; seasons: number };
  status: 'observed' | 'estimated';
  sources: string[];
}
export interface RegistrationCatalog {
  ceiling: number;
  ceilingSources: string[];
  rules: RegistrationRow[];
}
export type RegistrationRule = Partial<Pick<RegistrationRow, 'country' | 'tiers' | 'from' | 'to'>> &
  Omit<RegistrationRow, 'country' | 'tiers' | 'from' | 'to'> & { ceiling: number };
/** Season-start years are inclusive; unspecified eras/divisions use only the game's ceiling. */
export function registrationRule(code: string, tier: number, year: number): RegistrationRule {
  const data = squadRulesData as RegistrationCatalog;
  const profile = COUNTRIES.find((c) => c.code === code);
  const row = profile
    ? data.rules.find(
        (r) =>
          r.country === code &&
          r.tiers.includes(tier) &&
          year >= r.from &&
          (r.to === null || year <= r.to),
      )
    : undefined;
  return row
    ? { ...row, ceiling: data.ceiling }
    : {
        max: data.ceiling,
        ceiling: data.ceiling,
        status: 'estimated',
        sources: data.ceilingSources,
      };
}
/** Build-time catalog validation, also exported for negative provenance/range regression cases. */
export function validateRegistrationCatalog(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Missing squad registration catalog');
  const data = input as RegistrationCatalog;
  const sourced = (sources: unknown): sources is string[] =>
    Array.isArray(sources) &&
    sources.length > 0 &&
    sources.every((s) => typeof s === 'string' && s.startsWith('https://'));
  if (data.ceiling !== 40 || !sourced(data.ceilingSources) || !Array.isArray(data.rules))
    throw new Error('Invalid squad ceiling or sources');
  const ranges = new Map<string, Array<{ from: number; to: number }>>();
  for (const row of data.rules) {
    const profile = COUNTRIES.find((c) => c.code === row.country);
    if (
      !profile ||
      !Array.isArray(row.tiers) ||
      row.tiers.length === 0 ||
      new Set(row.tiers).size !== row.tiers.length ||
      row.tiers.some((t) => !Number.isInteger(t) || t < 0 || t >= profile.groups.length)
    )
      throw new Error('Unknown squad country or division');
    if (
      !Number.isInteger(row.from) ||
      row.from < 1901 ||
      (row.to !== null && (!Number.isInteger(row.to) || row.to < row.from)) ||
      !Number.isInteger(row.max) ||
      row.max < 1 ||
      row.max > data.ceiling
    )
      throw new Error('Invalid squad season or maximum');
    if (!['observed', 'estimated'].includes(row.status) || !sourced(row.sources))
      throw new Error('Invalid squad provenance');
    if (row.exempt) {
      for (const age of [row.exempt.ageAtMost, row.exempt.graduatesAgeAtMost])
        if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 99))
          throw new Error('Invalid registration exemption age');
      for (const flag of [row.exempt.loansCount, row.exempt.goalkeepers])
        if (flag !== undefined && flag !== true)
          throw new Error('Invalid registration exemption flag');
    }
    if (
      row.bandiera &&
      (!Number.isInteger(row.bandiera.extra) ||
        row.bandiera.extra < 1 ||
        !Number.isInteger(row.bandiera.seasons) ||
        row.bandiera.seasons < 1)
    )
      throw new Error('Invalid bandiera rule');
    for (const tier of row.tiers) {
      const key = `${row.country}:${tier}`,
        list = ranges.get(key) ?? [];
      const to = row.to ?? Infinity;
      if (list.some((old) => row.from <= old.to && to >= old.from))
        throw new Error(`Overlapping squad eras: ${key}`);
      list.push({ from: row.from, to });
      ranges.set(key, list);
    }
  }
}
/** The least each country's pools hold (→WORLD-12). */
export const NAME_POOL_MINIMUM = { given: 100, family: 200 } as const;
/**
 * Build-time name-pool validation (→ARCH-10, →WORLD-12): referenced, every country's pools large
 * enough, no name twice in a pool, each NFC-normalised, a given name one word.
 */
export function validateNamePools(input: unknown) {
  const data = input as {
    references?: unknown;
    countries?: Record<string, { given?: unknown; family?: unknown }>;
  };
  if (
    !Array.isArray(data?.references) ||
    data.references.length === 0 ||
    data.references.some((s) => typeof s !== 'string' || !s.startsWith('https://'))
  )
    throw new Error('Name pools without references');
  for (const c of COUNTRIES)
    for (const kind of ['given', 'family'] as const) {
      const pool = data.countries?.[c.code]?.[kind];
      if (!Array.isArray(pool) || pool.length < NAME_POOL_MINIMUM[kind])
        throw new Error(`Name pool ${c.code} ${kind} holds fewer than ${NAME_POOL_MINIMUM[kind]}`);
      if (new Set(pool).size !== pool.length)
        throw new Error(`Name pool ${c.code} ${kind} repeats a name`);
      for (const name of pool)
        if (
          typeof name !== 'string' ||
          name !== name.normalize('NFC') ||
          name !== name.trim() ||
          name === '' ||
          /\s{2}/.test(name) ||
          (kind === 'given' && /\s/.test(name))
        )
          throw new Error(`Name pool ${c.code} ${kind} holds an invalid name: ${String(name)}`);
    }
}
