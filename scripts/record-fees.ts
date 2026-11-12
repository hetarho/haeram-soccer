/**
 * Record-fee diagnosis (T785; CLUB-33's record target, CLUB-46, CLUB-25, ECON-33, OWNER-3).
 *
 * Plays delegated careers from a generated world (→WORLD-13) day by day and, on each of the 단장's
 * regular looks in an open window (→CLUB-33), reads the money he may spend and what he could buy
 * with it: the cash above 재정 기조's runway and the fee share it allows (→ECON-33), the wage-bill
 * ceiling against the revenue over the last 12 months (→CLUB-26) and the season's cash projection;
 * the needs open (short lines, replacements, upgrades and how many upgrades are left); the dearest
 * players on the scout's list (→CLUB-51), the 단장's candidates, and the dearest players of every
 * playable top flight, each with his gap over our starter at his best slot and the first check that
 * passes him over. It records every fee signing and the dearest one per season against the British
 * record standing then (→CLUB-46), the 단장's completed upgrades each season and, on every day from
 * the takeover to the first round played, the same reads, where the wage-bill ceiling may pass
 * every candidate over. Read-only unless `--setting` names a reading other than the rules in force.
 *
 *   pnpm exec tsx scripts/record-fees.ts --seed spread-0 --tier oil --finance aggressive --inject 0.25
 *   options: --country ENG   --from 2000 (takeover)   --until 2002 (last season played)
 *            --world-dir DIR (keep the generated world)   --out FILE   --in a.json,b.json
 *            --setting xi|fixed|open|books|released (joined by +: SEARCH_CEILING's `xi` (in force
 *            since T809), `fixed` (released before it) or `open`; REVENUE_SINCE_TAKEOVER's `books`
 *            (in force since T809; `revenue`, T785's name, too) or `released`)
 *            --recruitment 1–5 (영입 기조, the owner's dial; 3)
 *            --abroad 1–5 (해외 스카우트망, the owner's dial; 1)   --brief (no per-look lines)
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { CountryCode, Player, SpendRequest, World } from '../packages/contracts/src/types';
import type { TakeoverDecade, WealthTier } from '../packages/contracts/src/owner';
import { careerEnded } from '../packages/contracts/src/owner';
import { generateHistory } from '../packages/engine/src/history';
import { takeOver } from '../packages/engine/src/takeover';
import { pricedClubs, reachOf, tierFortune } from '../packages/engine/src/club-value';
import { pays } from '../packages/engine/src/listing';
import { ffpRoom, ownerCommand } from '../packages/engine/src/owner';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../packages/engine/src/responsibilities';
import { advanceDays } from '../packages/engine/src/season';
import { currentDay, SEASON_ROUNDS } from '../packages/engine/src/calendar';
import {
  activePlayers,
  formationOf,
  overall,
  slotOvr,
  unhappyPenalty,
} from '../packages/engine/src/player-state';
import { ownStarters, squad } from '../packages/engine/src/world';
import { scoutReach, transferOffers } from '../packages/engine/src/scout-search';
import { shortLines, signingVerdict, SIGNING_CONFIG } from '../packages/engine/src/signings';
import { staffBidShare } from '../packages/engine/src/director-bidding';
import { transferWindow, transferWindowDays } from '../packages/engine/src/transfer-window';
import { delegatePlan, insolvencyStop } from '../packages/engine/src/delegation';
import { SAFETY_ROUNDS } from '../packages/engine/src/delegation-info';
import { operatingCosts } from '../packages/engine/src/finance';
import { financeProjection } from '../packages/engine/src/projection';
import { openNeeds } from '../packages/engine/src/replacements';
import { clubTerms } from '../packages/engine/src/world-market';
import { ratio } from '../packages/engine/src/primitives';
import { REVENUE_SINCE_TAKEOVER } from '../packages/engine/src/finance';
import { SEARCH_CEILING } from '../packages/engine/src/scout-search';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1]! : fallback;
};
const SEED = option('seed', 'spread-0');
const CODE = option('country', 'ENG') as CountryCode;
const TIER = option('tier', 'oil') as WealthTier;
const FINANCE = option('finance', 'aggressive');
/** The legacy 재정 기조 names map to the 단장's spending request (→`SpendRequest`). */
const REQUEST_OF: Record<string, SpendRequest> = {
  stable: 1,
  careful: 2,
  standard: 3,
  bold: 4,
  aggressive: 5,
};

const FROM = Number(option('from', '2000')) as TakeoverDecade;
const UNTIL = Number(option('until', '2002'));
const INJECT = Number(option('inject', '0'));
const WORLD_DIR = option('world-dir', '');
const SETTING = option('setting', '');
const RECRUITMENT = Number(option('recruitment', '3'));
const ABROAD = Number(option('abroad', '1'));

/** British record fees as they were set: [year, pounds] (as scripts/calibrate-transfers.ts). */
const RECORDS: [number, number][] = [
  [1996, 15_000_000],
  [1999, 22_500_000],
  [2001, 28_100_000],
  [2002, 29_100_000],
  [2006, 30_800_000],
  [2008, 32_500_000],
  [2009, 80_000_000],
  [2013, 85_300_000],
  [2016, 89_000_000],
  [2018, 105_000_000],
  [2023, 106_800_000],
  [2025, 125_000_000],
];
const standingRecord = (year: number) =>
  RECORDS.filter(([y]) => y <= year).at(-1)?.[1] ?? RECORDS[0]![1];
/** Pounds of a minor-unit amount (ENG keeps pence). */
const pounds = (amount: string | bigint) => Number(amount) / 100;
const m = (n: number) => `£${(n / 1e6).toFixed(1)}m`;

function worldAt(): World {
  const file = WORLD_DIR && `${WORLD_DIR}/${SEED}-${FROM}.json`;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as World;
  const t = performance.now();
  const w = generateHistory(SEED, FROM);
  console.error(`${SEED}: world to ${FROM} in ${((performance.now() - t) / 1000).toFixed(0)} s`);
  if (file) {
    mkdirSync(WORLD_DIR, { recursive: true });
    writeFileSync(`${file}.part`, JSON.stringify(w));
    renameSync(`${file}.part`, file);
  }
  return w;
}

/** LEAGUE-13's reference club: the median-priced club of the tier's band in the country it pays. */
function pickClub(w: World) {
  const priced = pricedClubs(w),
    fortune = tierFortune(w, TIER, priced);
  const clubs = reachOf(w, TIER, priced)
    .filter((entry) => entry.club.country === CODE)
    .reverse();
  const median = clubs[clubs.length >> 1];
  if (!median) return undefined;
  return pays(w, median, fortune)
    ? median
    : clubs.filter((e) => pays(w, e, fortune) && clubs.indexOf(e) < clubs.indexOf(median)).at(-1);
}

interface Candidate {
  ovr: number;
  age: number;
  club: string;
  tier: number;
  country: string;
  fee: number;
  wage: number;
  /** His best gap over our starter at a slot he plays at 준수 or better (→CLUB-33). */
  gap: number;
  inBand: boolean;
  /** The first check that passes him over: wage cap, runway, share, wage bill, projection; or ok. */
  check: string;
}
interface Read {
  year: number;
  day: number;
  window: string;
  cash: number;
  runway: number;
  spare: number;
  cap: number;
  wageBill: number;
  revenue: number;
  wageRoom: number;
  projection: number;
  squad: number;
  short: number;
  replacements: number;
  upgradesUsed: number;
  starters: number;
  band: [number, number];
  list: Candidate[];
  world: Candidate[];
}
interface Signing {
  year: number;
  day: number;
  ovr: number;
  fee: number;
  club: string;
}
interface Career {
  seed: string;
  tier: string;
  finance: string;
  inject: number;
  setting: string;
  /** The readings the career was played on (careers before T809 do not say: both released). */
  rules?: {
    ceiling: (typeof SEARCH_CEILING)['inForce'];
    revenue: (typeof REVENUE_SINCE_TAKEOVER)['inForce'];
  };
  recruitment?: number;
  abroad?: number;
  club: string;
  clubTier: number;
  clubStrength: number;
  from: number;
  until: number;
  reads: Read[];
  /**
   * A read on the takeover day and on every day after it until the first league round is played,
   * when the revenue over the last 12 months has no round of the owner's season to rest on
   * (careers before T809 do not say).
   */
  opening?: Read[];
  signings: Signing[];
  seasons: {
    year: number;
    tier: number;
    rank: number;
    cash: number;
    fortune: number;
    /** The 단장's completed upgrade signings, fee or free (careers before T809 do not say). */
    upgrades?: number;
  }[];
}

/** The first of the 단장's plan's checks a signing fails, as `signingVerdict` orders them. */
function checkOf(w: World, player: Player, fee: string) {
  const plan = delegatePlan(w, 'recruitment'),
    wage = BigInt(player.wage);
  const verdict = signingVerdict(w, player, fee);
  if (verdict.ok) return 'ok';
  if (wage > 0n && BigInt(plan.committed) + wage > BigInt(plan.budget)) return 'wage bill';
  if (BigInt(fee) + wage > BigInt(plan.left)) return 'share';
  return insolvencyStop(w, BigInt(fee), wage, true) ? 'runway' : 'projection';
}

function gapOf(w: World, player: Player) {
  const slots = formationOf(w.tactic),
    starters = ownStarters(w);
  let best = -99;
  slots.forEach((slot, i) => {
    if ((player.positions[slot.position] ?? 0) < SIGNING_CONFIG.fitLevel) return;
    const starter = starters[i];
    const value = starter ? slotOvr(starter, slot) + unhappyPenalty(starter) : 0;
    best = Math.max(best, slotOvr(player, slot) - value);
  });
  return best;
}

function candidate(w: World, player: Player, fee: string, club: string, inBand: boolean) {
  const c = w.clubs.find((one) => one.id === club);
  const bid = ratio(fee, BigInt(staffBidShare(w)), 100n);
  return {
    ovr: overall(player),
    age: w.year - player.born,
    club,
    tier: c?.tier ?? -1,
    country: c?.country ?? '-',
    fee: pounds(bid),
    wage: pounds(player.wage),
    gap: gapOf(w, player),
    inBand,
    check: checkOf(w, player, bid),
  } satisfies Candidate;
}

function read(w: World): Read {
  const plan = delegatePlan(w, 'recruitment'),
    costs = operatingCosts(w),
    perRound = BigInt(costs.annual) / BigInt(SEASON_ROUNDS),
    runway = perRound * BigInt(SAFETY_ROUNDS),
    spare = BigInt(w.cash) - runway,
    cap = BigInt(plan.left),
    revenue = BigInt(plan.revenue),
    bill = BigInt(plan.committed);
  const reach = scoutReach(w),
    [low, high] = reach.ability,
    [young, old] = reach.age;
  const day = currentDay(w);
  const bids = (w.bids ?? []).filter((b) => b.direction === 'out' && b.year === w.year && b.staff);
  const list = transferOffers(w)
    .filter((o) => o.available && !o.player.loanUntil && !o.freeAgent && o.source?.kind === 'club')
    .map((o) => candidate(w, o.player, o.fee, (o.source as { club: string }).club, true))
    .sort((a, b) => b.fee - a.fee)
    .slice(0, 5);
  // Every playable top flight's players, the dearest first; only the first few are read whole.
  const priced: { c: (typeof w.clubs)[number]; p: Player; terms: ReturnType<typeof clubTerms> }[] =
    [];
  for (const c of w.clubs) {
    if (c.id === w.playerClub || c.representative || c.tier !== 0) continue;
    for (const p of squad(w, c)) priced.push({ c, p, terms: clubTerms(w, c, p) });
  }
  priced.sort((a, b) => Number(BigInt(b.terms.fee) - BigInt(a.terms.fee)));
  const worldPlayers = priced.slice(0, 8).map(({ c, p, terms }) => {
    const age = w.year - p.born,
      ovr = overall(p);
    return candidate(
      w,
      terms.player,
      terms.fee,
      c.id,
      ovr >= low && ovr <= high && age >= young && age <= old,
    );
  });
  const projection = financeProjection(w).seasonEnd.low;
  return {
    year: w.year,
    day,
    window: transferWindow(w, day).kind ?? '-',
    cash: pounds(w.cash),
    runway: pounds(runway),
    spare: pounds(spare),
    cap: pounds(cap),
    wageBill: pounds(bill),
    revenue: pounds(revenue),
    wageRoom: pounds(BigInt(plan.budget) - bill),
    projection: pounds(projection),
    squad: activePlayers(w).length,
    short: shortLines(w).length,
    replacements: openNeeds(w).length,
    upgradesUsed: bids.filter(
      (b) => b.staff === 'upgrade' && ['completed', 'pending', 'countered'].includes(b.status),
    ).length,
    starters: Math.round(
      ownStarters(w).reduce((n, p, i) => n + slotOvr(p, formationOf(w.tactic)[i]!), 0) / 11,
    ),
    band: [low, high],
    list,
    world: worldPlayers,
  };
}

function playCareer(): Career | undefined {
  const w = worldAt();
  if (args.includes('--prepare')) return undefined;
  const pick = pickClub(w);
  if (!pick) return undefined;
  takeOver(w, pick.club.id, { tier: TIER, traits: [] });
  w.settings = defaultSettings();
  for (const key of RESPONSIBILITY_KEYS) w.settings.responsibilities[key] = 'delegated';
  w.delegationRequests = { recruitment: REQUEST_OF[FINANCE] ?? 3 };
  // 영입 기조 (→ECON-16), the owner's own dial: 3 (표준) unless the run names another level.
  if (RECRUITMENT !== 3) w.policy = { ...w.policy, recruitment: RECRUITMENT } as World['policy'];
  // 해외 스카우트망 (→ECON-16, CLUB-51), the owner's dial for the top flights abroad: 1 unless named.
  if (ABROAD !== 1) w.policy = { ...w.policy, globalScouting: ABROAD } as World['policy'];
  const career: Career = {
    seed: SEED,
    tier: TIER,
    finance: FINANCE,
    inject: INJECT,
    setting: SETTING,
    rules: { ceiling: SEARCH_CEILING.inForce, revenue: REVENUE_SINCE_TAKEOVER.inForce },
    recruitment: RECRUITMENT,
    abroad: ABROAD,
    club: pick.club.id,
    clubTier: pick.club.tier,
    clubStrength: pick.club.strength,
    from: FROM,
    until: UNTIL,
    reads: [],
    opening: [],
    signings: [],
    seasons: [],
  };
  let factsSeen = w.transfers?.facts.length ?? 0,
    season = w.year;
  const inject = () => {
    const owner = w.owner!;
    if (!INJECT || BigInt(owner.fortune) <= 0n) return;
    let amount = BigInt(Math.floor(Number(owner.fortune) * INJECT));
    const room = ffpRoom(w);
    if (room !== undefined && amount > BigInt(room)) amount = BigInt(room);
    if (amount > 0n) ownerCommand(w, { type: 'owner-inject', amount: amount.toString() });
  };
  inject();
  career.opening!.push(read(w));
  const started = performance.now();
  // The 단장's upgrade bids completed, by season, read every day so a close's tidying loses none.
  const upgrades = new Map<number, Set<string>>();
  while (w.year <= UNTIL && !careerEnded(w)) {
    advanceDays(w, 1, undefined, false);
    if (w.year === FROM && w.round === 0) career.opening!.push(read(w));
    for (const bid of w.bids ?? [])
      if (bid.direction === 'out' && bid.staff === 'upgrade' && bid.status === 'completed') {
        if (!upgrades.has(bid.year)) upgrades.set(bid.year, new Set());
        upgrades.get(bid.year)!.add(bid.id);
      }
    if (w.year !== season) {
      const own = w.clubs.find((c) => c.id === w.playerClub)!;
      const archive = w.history?.at(-1);
      career.seasons.push({
        year: season,
        tier: own.tier,
        rank: archive?.rank ?? 0,
        cash: pounds(w.cash),
        fortune: pounds(w.owner?.fortune ?? '0'),
        upgrades: upgrades.get(season)?.size ?? 0,
      });
      console.error(
        `${SEED} ${TIER} ${FINANCE} ${season} done in ${((performance.now() - started) / 1000).toFixed(0)} s`,
      );
      season = w.year;
      inject();
    }
    const day = currentDay(w),
      window = transferWindow(w, day);
    if (window.open) {
      const d = transferWindowDays(w.year),
        opening = day <= d.summerClose ? d.summerOpen : d.winterOpen;
      if ((day - opening) % SIGNING_CONFIG.lookDays === 0) career.reads.push(read(w));
    }
    const facts = w.transfers?.facts ?? [];
    for (const fact of facts.slice(factsSeen))
      if (fact.direction === 'in' && !fact.loan && BigInt(fact.fee) > 0n && fact.club) {
        const p = activePlayers(w).find((one) => one.id === fact.player);
        career.signings.push({
          year: fact.year,
          day: fact.day,
          ovr: p ? overall(p) : 0,
          fee: pounds(fact.fee),
          club: fact.club,
        });
      }
    factsSeen = facts.length;
  }
  return career;
}

/** The readings a career was played on; a career before T809 names only its candidate settings. */
function rulesOf(c: Career): NonNullable<Career['rules']> {
  if (c.rules) return c.rules;
  const parts = c.setting.split('+');
  return {
    ceiling: parts.includes('open') ? 'open' : parts.includes('xi') ? 'xi' : 'fixed',
    revenue: parts.includes('revenue') || parts.includes('books') ? 'books' : 'released',
  };
}
/** The best dearest fee signing against the standing record within the first three seasons. */
const bestRatio = (c: Career) =>
  Math.max(
    0,
    ...c.signings.filter((s) => s.year <= c.from + 2).map((s) => s.fee / standingRecord(s.year)),
  );
/** Upgrade bids made (pending, countered or completed) by each season's last look. */
const upgradeBids = (c: Career) =>
  c.seasons.map((s) =>
    Math.max(0, ...c.reads.filter((r) => r.year === s.year).map((r) => r.upgradesUsed)),
  );
/** Over some reads: the list's five dearest the wage-bill ceiling passed over. */
function wageBillOver(reads: readonly Read[]) {
  const list = reads.flatMap((r) => r.list);
  return {
    reads: reads.length,
    refused: list.filter((x) => x.check === 'wage bill').length,
    read: list.length,
    readsRefusing: reads.filter((r) => r.list.some((x) => x.check === 'wage bill')).length,
    firstRevenue: reads[0]?.revenue ?? 0,
  };
}
/** The first season: from the takeover day to the first round, and the regular looks. */
const firstSeasonWageBill = (c: Career) => ({
  opening: c.opening && wageBillOver(c.opening),
  looks: wageBillOver(c.reads.filter((r) => r.year === c.from)),
});
const wageBillLabel = (c: Career) => {
  const { opening, looks } = firstSeasonWageBill(c);
  return `${opening ? `${opening.refused} of ${opening.read} on ${opening.readsRefusing} of ${opening.reads} days to round 1 (revenue on the takeover day ${m(opening.firstRevenue)})` : 'days to round 1 not recorded'}; ${looks.refused} of ${looks.read} in ${looks.readsRefusing} of ${looks.reads} looks`;
};

function report(careers: Career[]) {
  for (const c of careers) {
    const rules = rulesOf(c);
    console.log(
      `\n## ${c.seed} ${c.tier} ${c.finance} inject ${c.inject}${c.setting ? ` setting ${c.setting}` : ''} (ceiling ${rules.ceiling}, revenue ${rules.revenue}) recruitment ${c.recruitment ?? 3} abroad ${c.abroad ?? 1} — ${c.club} (tier ${c.clubTier}, strength ${c.clubStrength}), ${c.from}–${c.until}`,
    );
    for (const s of c.seasons)
      console.log(
        `season ${s.year}: tier ${s.tier} rank ${s.rank}, cash at close ${m(s.cash)}, fortune ${m(s.fortune)}${s.upgrades !== undefined ? `, upgrades completed ${s.upgrades}` : ''}`,
      );
    console.log(
      `upgrade bids by each season's last look ${upgradeBids(c).join(' / ')}; first season, the list's five dearest passed over by the wage bill: ${wageBillLabel(c)}`,
    );
    const years = [...new Set(c.signings.map((s) => s.year))];
    for (let year = c.from; year <= c.until; year++) {
      const fees = c.signings.filter((s) => s.year === year).sort((a, b) => b.fee - a.fee);
      const dearest = fees[0];
      console.log(
        `${year}/${String(year + 1).slice(2)}: ${fees.length} fee signings, dearest ${dearest ? `${m(dearest.fee)} (OVR ${dearest.ovr}, ${dearest.club})` : '-'}; record ${m(standingRecord(year))}, ratio ${dearest ? (dearest.fee / standingRecord(year)).toFixed(2) : '0'}`,
      );
    }
    void years;
    const best = bestRatio(c);
    console.log(
      `target: dearest ≥ 0.5× record within the first three seasons — best ${best.toFixed(2)} ${best >= 0.5 ? 'MET' : 'unmet'}`,
    );
    // Over every look: which check passed the candidates over, and how often the list held a
    // candidate beating a starter by 공격적's margin (2) at all.
    const tally = (xs: Candidate[]) => {
      const counts = new Map<string, number>();
      for (const x of xs) counts.set(x.check, (counts.get(x.check) ?? 0) + 1);
      return [...counts].map(([k, n]) => `${k} ${n}`).join(', ');
    };
    const list = c.reads.flatMap((r) => r.list),
      world = c.reads.flatMap((r) => r.world.slice(0, 5));
    console.log(
      `looks ${c.reads.length}: list's 5 dearest — checks ${tally(list)}; a gap of 2+ in ${c.reads.filter((r) => r.list.some((x) => x.gap >= 2)).length} looks; dearest listed ${m(Math.max(0, ...list.map((x) => x.fee)))}`,
    );
    console.log(
      `  the top flights' 5 dearest — checks ${tally(world)}; within the search band ${world.filter((x) => x.inBand).length}/${world.length}; dearest ${m(Math.max(0, ...world.map((x) => x.fee)))}; wage-bill room at the last look ${m(c.reads.at(-1)?.wageRoom ?? 0)}, squad ${c.reads.at(-1)?.squad ?? 0}`,
    );
    if (args.includes('--brief')) continue;
    for (const r of c.reads) {
      console.log(
        `  ${r.year}/${r.day} ${r.window}: cash ${m(r.cash)} runway ${m(r.runway)} spare ${m(r.spare)} cap ${m(r.cap)}; wage bill ${m(r.wageBill)} / revenue ${m(r.revenue)}, room ${m(r.wageRoom)}; projection ${m(r.projection)}; squad ${r.squad} short ${r.short} repl ${r.replacements} upgrades used ${r.upgradesUsed}; XI ${r.starters}; band ${r.band.join('–')}`,
      );
      const line = (x: Candidate) =>
        `${x.ovr}/${x.age} ${x.club}(t${x.tier}) ${m(x.fee)} w${m(x.wage)} gap ${x.gap.toFixed(1)}${x.inBand ? '' : ' out-of-band'} → ${x.check}`;
      console.log(`    list: ${r.list.map(line).join(' | ') || '-'}`);
      console.log(`    world: ${r.world.slice(0, 5).map(line).join(' | ') || '-'}`);
    }
  }
  const results = careers.map(bestRatio);
  console.log(
    `\nall careers: best dearest/record in the first three seasons ${results.map((r) => r.toFixed(2)).join(' ')}; meeting 0.5× ${results.filter((r) => r >= 0.5).length}/${results.length}`,
  );
  // One row a career, for a benchmark README.
  console.log(
    '\n| career | ceiling · revenue | dearest a season (×record) | best | upgrade bids a season | upgrades completed | first season: wage bill passed over |',
  );
  console.log('|---|---|---|---|---|---|---|');
  for (const c of careers) {
    const rules = rulesOf(c),
      seasons = [];
    for (let year = c.from; year <= c.until; year++) {
      const dearest = c.signings.filter((s) => s.year === year).sort((a, b) => b.fee - a.fee)[0];
      seasons.push(dearest ? (dearest.fee / standingRecord(year)).toFixed(2) : '-');
    }
    const completed = c.seasons.every((s) => s.upgrades !== undefined)
      ? c.seasons.map((s) => s.upgrades).join(' / ')
      : 'not recorded';
    console.log(
      `| ${c.seed} ${c.tier}${c.recruitment && c.recruitment !== 3 ? ` rec${c.recruitment}` : ''}${c.abroad && c.abroad !== 1 ? ` abroad${c.abroad}` : ''} | ${rules.ceiling} · ${rules.revenue} | ${seasons.join(' / ')} | ${bestRatio(c).toFixed(2)} | ${upgradeBids(c).join(' / ')} | ${completed} | ${wageBillLabel(c)} |`,
    );
  }
}

function main() {
  if (option('in', '')) {
    report(
      option('in', '')
        .split(',')
        .map((f) => JSON.parse(readFileSync(f, 'utf8')) as Career),
    );
    return;
  }
  for (const part of SETTING ? SETTING.split('+') : []) {
    if (part === 'revenue' || part === 'books') REVENUE_SINCE_TAKEOVER.inForce = 'books';
    else if (part === 'released') REVENUE_SINCE_TAKEOVER.inForce = 'released';
    else if (part === 'open' || part === 'xi' || part === 'fixed') SEARCH_CEILING.inForce = part;
    else throw new Error(`unknown setting ${part}`);
  }
  const career = playCareer();
  if (!career) return;
  if (option('out', '')) writeFileSync(option('out', ''), JSON.stringify(career));
  report([career]);
}
main();
