/**
 * ab-demo scaffold: writes the two dev-only demo careers that `/?ab-demo=finance` and
 * `/?ab-demo=finance-tight` import (apps/web/src/ab-demo/boot.ts), for the A/B comparison of the
 * club-money, delegation and owner-fortune variants. Run `pnpm exec tsx scripts/ab-demo-saves.ts`
 * (a few minutes: it lives four whole seasons) after an engine or save-format change.
 *
 * The career is deterministic: an 오일머니 owner takes over a Portuguese top-flight club in 1977,
 * hires a paid 단장, chief scout and youth coach, stakes a fifth of the fortune in the business and
 * lives four seasons (1977/78–1980/81) with all the club's work delegated, so the season archive,
 * the ledger, the transfers and the owner's season records hold several seasons of club money. His
 * fortune is scaled at the takeover so 1981/82 opens near the Esc19B a 1980 oil owner had. It
 * stops on the 20th day of 1981/82, the summer window still open and two league rounds played,
 * with 선수 영입 and 유소년 승격·방출 delegated, 선수 계약 and 선수 매각 direct and the other
 * responsibilities at their defaults; the progression clock is not running. `finance` holds
 * Esc200M (about 1.6 years of its Esc125M fixed costs; the ledger left Esc238M at the 1980/81
 * close); `finance-tight` the same career with Esc42M (a third of a year). Both set the cash at the
 * end without a ledger entry, so the archive's closing cash and the cash in play differ by that.
 */
import { writeFileSync } from 'node:fs';
import type { ResponsibilityKey, StaffRole, World } from '../packages/contracts/src/types';
import { currency } from '../packages/catalogs/src/index';
import {
  advanceDays,
  defaultSettings,
  moneyLabel,
  operate,
  operatingCosts,
  simulateSeason,
  staffCandidates,
} from '../packages/engine/src/index';
import { careerWorld } from '../packages/engine/src/career.testkit';
import { encode } from '../apps/web/src/adapters/persistence';

const DIR = 'apps/web/src/ab-demo';
const CLUB = 'POR:0:0:10';
const TAKEOVER = 1977;
/** Whole seasons lived before the one in play. */
const SEASONS = 4;
/** The two states' club cash at the end, in millions of the club's money. */
const RICH_CASH = 200n;
const TIGHT_CASH = 42n;
/**
 * The factor on the 1977 oil tier's starting fortune, which in nominal escudos is about half of a
 * 1980 one: the owner stays as rich against the club as the one-season demo's (Esc19.6B at the end).
 */
const FORTUNE_SCALE = { num: 183n, den: 100n };

/** The ablest free agent of a post, hired for three seasons through the owner's own command. */
function hireBest(w: World, role: StaffRole) {
  const pool = staffCandidates(w, role);
  let best = -1;
  pool.forEach((candidate, index) => {
    if (candidate.source === 'free' && (best < 0 || candidate.ability > pool[best].ability))
      best = index;
  });
  if (best < 0) throw new Error(`No free ${role} to hire`);
  operate(w, { type: 'hire-staff', role, candidate: best, candidateId: pool[best].id, term: 3 });
}

function demoCareer() {
  const w = careerWorld({
    seed: 'ab-demo-finance',
    country: 'POR',
    year: TAKEOVER,
    club: CLUB,
    tier: 'oil',
  });
  const owner = w.owner!;
  owner.takeover.fortune = (
    (BigInt(owner.takeover.fortune) * FORTUNE_SCALE.num) /
    FORTUNE_SCALE.den
  ).toString();
  owner.fortune = (BigInt(owner.takeover.fortune) - BigInt(owner.takeover.price)).toString();
  for (const role of ['director', 'scout', 'youth'] as const) hireBest(w, role);
  operate(w, { type: 'owner-stake', percent: 20 });
  // The seasons before run themselves, the manager's post included: renewals, signings and
  // appointments are not left waiting for an absent owner.
  const living = defaultSettings(),
    keys = Object.keys(living.responsibilities) as ResponsibilityKey[];
  for (const key of keys) living.responsibilities[key] = 'delegated';
  operate(w, { type: 'settings', settings: living });
  for (let n = 0; n < SEASONS; n++) {
    const started = Date.now();
    simulateSeason(w);
    const closed = w.history.at(-1)!;
    console.log(
      `${closed.year}/${String(closed.year + 1).slice(2)}: division ${closed.tier + 1} place ${closed.rank},` +
        ` income ${moneyLabel(w, closed.income)}, expense ${moneyLabel(w, closed.expense)},` +
        ` cash ${moneyLabel(w, closed.cash)}, ${((Date.now() - started) / 1000).toFixed(0)} s`,
    );
  }
  advanceDays(w, 20, undefined, false);
  if (w.critical || w.calendar?.day !== 20)
    throw new Error(`The demo stopped on day ${w.calendar?.day}: ${w.critical ?? 'no alert'}`);
  const settings = defaultSettings();
  settings.responsibilities.recruitment = 'delegated';
  settings.responsibilities.academy = 'delegated';
  settings.responsibilities.contracts = 'direct';
  settings.responsibilities.sales = 'direct';
  operate(w, { type: 'settings', settings });
  return w;
}

async function main() {
  const w = demoCareer();
  if (w.year !== TAKEOVER + SEASONS || w.history.length < SEASONS)
    throw new Error(`The career stopped in ${w.year} after ${w.history.length} seasons`);
  const annual = BigInt(operatingCosts(w).annual),
    million = 1_000_000n * BigInt(currency(CLUB.split(':')[0]!, w.year).units);
  const states: [name: string, cash: bigint][] = [
    ['finance', RICH_CASH * million],
    ['finance-tight', TIGHT_CASH * million],
  ];
  for (const [name, cash] of states) {
    const copy = structuredClone(w);
    copy.cash = cash.toString();
    const raw = await encode(copy, 1, 0);
    const file = `${DIR}/${name}.haeram-save.json`;
    writeFileSync(file, raw);
    console.log(
      `${file}: ${copy.year} day ${copy.calendar?.day} round ${copy.round}, cash ${moneyLabel(copy, copy.cash)}` +
        ` = ${(Number((cash * 100n) / annual) / 100).toFixed(2)} × fixed costs ${moneyLabel(copy, annual.toString())}/year,` +
        ` fortune ${moneyLabel(copy, copy.owner!.fortune)}, ${raw.length} chars`,
    );
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
