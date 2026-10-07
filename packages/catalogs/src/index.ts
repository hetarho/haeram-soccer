export const CATALOG_VERSION = '2026-demo-1';
import priceData from '../data/prices.json';
import type { CountryCode } from '../../contracts/src/types';
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
  scale: number;
  source: string;
  reference: string;
}
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
    given: ['Arthur', 'George', 'Edward', 'William', 'Albert', 'Thomas', 'Henry', 'Walter'],
    family: ['Bennett', 'Foster', 'Hughes', 'Turner', 'Hawkins', 'Brooks', 'Watson', 'Clarke'],
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
    given: ['Luis', 'Antonio', 'Manuel', 'Pablo', 'Ramon', 'Javier'],
    family: ['Vega', 'Moreno', 'Santos', 'Rojas', 'Navarro', 'Ruiz'],
    scale: 25,
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
    given: ['Otto', 'Fritz', 'Karl', 'Emil', 'Heinrich', 'Franz'],
    family: ['Weber', 'Keller', 'Fischer', 'Braun', 'Wolf', 'Schmidt'],
    scale: 20,
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
    given: ['Giovanni', 'Luigi', 'Carlo', 'Mario', 'Pietro', 'Enzo'],
    family: ['Ricci', 'Ferraro', 'Moretti', 'Costa', 'Rossi', 'Romano'],
    scale: 25,
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
    given: ['Louis', 'Pierre', 'Andre', 'Jean', 'Emile', 'Paul'],
    family: ['Laurent', 'Moreau', 'Garnier', 'Mercier', 'Petit', 'Dubois'],
    scale: 25,
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
    given: ['Joao', 'Miguel', 'Jose', 'Pedro', 'Nuno', 'Rui'],
    family: ['Silva', 'Costa', 'Pereira', 'Sousa', 'Lopes', 'Mendes'],
    scale: 4500,
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
    given: ['Jan', 'Pieter', 'Willem', 'Hendrik', 'Dirk', 'Johan'],
    family: ['Bakker', 'Visser', 'Smit', 'Jansen', 'Vos', 'Bos'],
    scale: 12,
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
    given: ['Jules', 'Victor', 'Leon', 'Henri', 'Luc', 'Paul'],
    family: ['Peeters', 'Janssens', 'Lambert', 'Willems', 'Dubois', 'Maes'],
    scale: 25,
    source:
      'https://www.proleague.be/nieuws/challenger-pro-league-heeft-nieuw-format-zonder-quota-voor-u23',
    reference: '2026/27: 18/15; senior/reserve/expansion exceptions normalized',
  },
];
export const NORMALIZATION =
  '현대 리그 수·규모와 승강 형태를 참고한 데모입니다. 리저브·기간 우승·지역 라이선스·세부 UEFA 출전 배정은 간소화했습니다.';
export const country = (code: string) => {
  const c = COUNTRIES.find((c) => c.code === code);
  if (!c) throw new Error('지원하지 않는 국가입니다.');
  return c;
};
function rawPriceIndex(
  code: string,
  year: number,
): { value: number; status: 'observed' | 'estimated' | 'projected'; source: string } {
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
export { priceData };
