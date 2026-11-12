/**
 * ab-demo scaffold: writes the two dev-only demo careers that `/?ab-demo=finance` and
 * `/?ab-demo=finance-tight` import (apps/web/src/ab-demo/boot.ts), for the A/B comparison of the
 * club-money, delegation and owner-fortune variants. Run `pnpm exec tsx scripts/ab-demo-saves.ts`
 * (about a minute: it lives a whole season) after an engine or save-format change.
 *
 * The career is deterministic: an 오일머니 owner takes over a Portuguese top-flight club in 1980,
 * where Esc200M is a plausible bank balance (about two years of its fixed costs), hires a paid
 * 단장, chief scout and youth coach, stakes a fifth of the fortune in the business and lives the
 * first season with the club's work delegated (the academy's spring intake brings prospects). It
 * stops on the 20th day of the next season, the summer window still open and two league rounds
 * played, with 선수 영입 and 유소년 승격·방출 delegated, 선수 계약 and 선수 매각 direct and the
 * other responsibilities at their defaults; the progression clock is not running.
 * `finance` holds Esc200M; `finance-tight` the same career with 0.4 years of fixed costs.
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
const RICH_CASH = 200_000_000n;
const TIGHT_YEARS = { num: 2n, den: 5n };

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
    year: 1980,
    club: CLUB,
    tier: 'oil',
  });
  for (const role of ['director', 'scout', 'youth'] as const) hireBest(w, role);
  operate(w, { type: 'owner-stake', percent: 20 });
  // The first season runs itself: renewals and signings are not left waiting for an absent owner.
  const living = defaultSettings(),
    keys = Object.keys(living.responsibilities) as ResponsibilityKey[];
  for (const key of keys) if (key !== 'manager') living.responsibilities[key] = 'delegated';
  operate(w, { type: 'settings', settings: living });
  simulateSeason(w);
  advanceDays(w, 20, undefined, false);
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
  const annual = BigInt(operatingCosts(w).annual),
    units = BigInt(currency(CLUB.split(':')[0]!, w.year).units),
    million = 1_000_000n * units;
  const states: [name: string, cash: bigint][] = [
    ['finance', RICH_CASH * units],
    ['finance-tight', ((annual * TIGHT_YEARS.num) / TIGHT_YEARS.den / million) * million],
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
