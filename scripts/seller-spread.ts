/**
 * Seller-spread diagnosis (T784; CLUB-33's seller targets, CLUB-51, CLUB-25, CLUB-46).
 *
 * Plays delegated careers from a generated world (→WORLD-13) day by day and records every fee
 * signing the 단장 makes: its seller, the seller's division and strength, the fee against his value
 * on the seller's division and against what his ability would cost at a top-flight club (→CLUB-25,
 * →CLUB-46), the band he came from (the manager's pick, the shortlist or the rest of the scout's
 * list, →CLUB-33) and the candidates ranked ahead of him that the money checks passed over
 * (→ECON-33). At each of the 단장's looks it also keeps how the scout's list is spread over clubs.
 * Read-only: nothing here changes a rule.
 *
 *   pnpm exec tsx scripts/seller-spread.ts --seed spread-0 --tier oil --finance aggressive
 *   options: --country ENG   --from 2000 (takeover)   --until 2007 (last season played)
 *            --inject 0.25 (a share of the fortune put in on each season's first day, within FFP)
 *            --world-dir DIR (keep the generated world)   --prepare (only that)
 *            --out FILE (the career as JSON)   --in a.json,b.json (report kept careers only)
 *            --supply (the generated world's players at the top of the search band, by club)
 *            --setting line|list|signed|kept, joined by + (T784's named candidate rules for the
 *            run: LIST_SPREAD's list shapes, UPGRADE_MEASURE's `signed`, REFILL_SALE's `kept`)
 *
 * Over the kept careers it reports CLUB-33's seller targets: the most of a window's fee signings
 * one seller supplied, and the largest share of the fee signings over any five seasons.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { CountryCode, Line, TransferBid, World } from '../packages/contracts/src/types';
import type { TakeoverDecade, WealthTier } from '../packages/contracts/src/owner';
import { careerEnded } from '../packages/contracts/src/owner';
import { generateHistory } from '../packages/engine/src/history';
import { takeOver } from '../packages/engine/src/takeover';
import { pricedClubs, reachOf, tierFortune } from '../packages/engine/src/club-value';
import { pays } from '../packages/engine/src/listing';
import { ffpRoom, ownerCommand } from '../packages/engine/src/owner';
import { defaultSettings, RESPONSIBILITY_KEYS } from '../packages/engine/src/responsibilities';
import { advanceDays } from '../packages/engine/src/season';
import { currentDay } from '../packages/engine/src/calendar';
import { marketValueAt } from '../packages/engine/src/market-prices';
import { lineOfPlayer, overall } from '../packages/engine/src/player-state';
import { squad } from '../packages/engine/src/world';
import { transferOffers } from '../packages/engine/src/scout-search';
import {
  shortlistOffers,
  signingRequests,
  signingVerdict,
  UPGRADE_MEASURE,
} from '../packages/engine/src/signings';
import { staffBidShare } from '../packages/engine/src/director-bidding';
import { transferWindowDays } from '../packages/engine/src/transfer-window';
import { quote } from '../packages/engine/src/index';
import { LIST_SPREAD } from '../packages/engine/src/scout-search';
import { REFILL_SALE } from '../packages/engine/src/world-market';

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1]! : fallback;
};
const SEED = option('seed', 'spread-0');
const CODE = option('country', 'ENG') as CountryCode;
const TIER = option('tier', 'oil') as WealthTier;
const FINANCE = option('finance', 'aggressive');
const FROM = Number(option('from', '2000')) as TakeoverDecade;
const UNTIL = Number(option('until', '2007'));
const INJECT = Number(option('inject', '0'));
const WORLD_DIR = option('world-dir', '');
const SETTING = option('setting', '');

/** Minor units of one 1901 price unit in this country and year (→ECON-26's units). */
const unitOf = (year: number) => Number(quote(CODE, year, 1_000_000)) / 1_000_000;

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

export interface Signing {
  year: number;
  day: number;
  window: 'summer' | 'winter';
  player: string;
  ovr: number;
  potential: number;
  age: number;
  line: Line;
  need: string;
  /** The band he came from (→CLUB-33): the manager's pick, the shortlist, the rest of the list. */
  band: 'pick' | 'shortlist' | 'list';
  seller: string;
  sellerTier: number;
  sellerStrength: number;
  sellerCountry: string;
  /** 1901 price units of the season. */
  fee: number;
  asking: number;
  /** His value on the seller's division, and on the top flight's (→CLUB-25, →CLUB-46). */
  value: number;
  valueTop: number;
  /** Candidates of his line ranked ahead of him that the money checks passed over, by club. */
  passed: { club: string; ovr: number; fee: number; reason: string }[];
  /** How many of the seller's players were on the scout's list that day. */
  sellerListed: number;
  listSize: number;
  status?: TransferBid['status'];
}
export interface Look {
  year: number;
  day: number;
  size: number;
  clubs: number;
  /** The club holding most of the list, and how many of its players are listed. */
  top: string;
  topCount: number;
  /** The tiers the list's club players come from. */
  tiers: number[];
}
export interface Career {
  seed: string;
  code: string;
  tier: string;
  finance: string;
  inject: number;
  setting: string;
  club: string;
  clubTier: number;
  from: number;
  until: number;
  signings: Signing[];
  looks: Look[];
  /** Completed fee signings per seller from the transfer facts (→HIST-20). */
  facts: { year: number; day: number; club: string; fee: number; player: string }[];
  seasons: { year: number; tier: number; rank: number; cash: number }[];
}

function snapshotLook(w: World): Look {
  const offers = transferOffers(w).filter((o) => o.available && !o.player.loanUntil);
  const counts = new Map<string, number>();
  const tiers: number[] = [];
  for (const o of offers) {
    if (o.source?.kind !== 'club') continue;
    counts.set(o.source.club, (counts.get(o.source.club) ?? 0) + 1);
    tiers.push(w.clubs.find((c) => c.id === (o.source as { club: string }).club)?.tier ?? -1);
  }
  const top = [...counts].sort((a, b) => b[1] - a[1])[0];
  return {
    year: w.year,
    day: currentDay(w),
    size: offers.length,
    clubs: counts.size,
    top: top?.[0] ?? '-',
    topCount: top?.[1] ?? 0,
    tiers,
  };
}

function signingOf(w: World, bid: TransferBid, tried: Set<string>): Signing | undefined {
  const offers = transferOffers(w).filter((o) => o.available && !o.player.loanUntil);
  const offer = offers.find((o) => o.player.id === bid.playerId) ?? undefined;
  const player = bid.offer?.player ?? offer?.player;
  if (!player || !bid.club) return undefined;
  const seller = w.clubs.find((c) => c.id === bid.club)!;
  const unit = unitOf(w.year),
    ovr = overall(player),
    line = lineOfPlayer(player);
  const listed = new Set(shortlistOffers(w).map(({ offer: o }) => o.player.id));
  const picks = new Set(signingRequests(w).map((r) => r.pick));
  const rank = (id: string) => (picks.has(id) ? 0 : listed.has(id) ? 1 : 2);
  const band = (['pick', 'shortlist', 'list'] as const)[rank(player.id)];
  const share = BigInt(staffBidShare(w));
  const passed = offers
    .filter(
      (o) =>
        o.player.id !== player.id &&
        !tried.has(o.player.id) &&
        lineOfPlayer(o.player) === line &&
        (rank(o.player.id) < rank(player.id) ||
          (rank(o.player.id) === rank(player.id) && overall(o.player) > ovr)),
    )
    .flatMap((o) => {
      const fee = o.freeAgent ? '0' : ((BigInt(o.fee) * share) / 100n).toString();
      const verdict = signingVerdict(w, o.player, fee);
      return verdict.ok
        ? []
        : [
            {
              club: o.source?.kind === 'club' ? o.source.club : 'free',
              ovr: overall(o.player),
              fee: Number(fee) / unit,
              reason: String(verdict.reason).slice(0, 60),
            },
          ];
    });
  return {
    year: w.year,
    day: currentDay(w),
    window: windowOf(w.year, currentDay(w)).endsWith('w') ? 'winter' : 'summer',
    player: player.id,
    ovr,
    potential: player.potential,
    age: w.year - player.born,
    line,
    need: bid.staff ?? '-',
    band,
    seller: seller.id,
    sellerTier: seller.tier,
    sellerStrength: seller.strength,
    sellerCountry: seller.country,
    fee: Number(bid.fee) / unit,
    asking: Number(bid.offer?.fee ?? offer?.fee ?? '0') / unit,
    value: Number(marketValueAt(CODE, w.year, seller.tier, player)) / unit,
    valueTop: Number(marketValueAt(CODE, w.year, 0, player)) / unit,
    passed,
    sellerListed: offers.filter((o) => o.source?.kind === 'club' && o.source.club === seller.id)
      .length,
    listSize: offers.length,
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
  w.decisionBudgets = {
    ...w.decisionBudgets,
    recruitment: { finance: FINANCE },
  } as World['decisionBudgets'];
  const career: Career = {
    seed: SEED,
    code: CODE,
    tier: TIER,
    finance: FINANCE,
    inject: INJECT,
    setting: SETTING,
    club: pick.club.id,
    clubTier: pick.club.tier,
    from: FROM,
    until: UNTIL,
    signings: [],
    looks: [],
    facts: [],
    seasons: [],
  };
  const bids = new Map<string, { bid: TransferBid; signing: Signing }>();
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
  const started = performance.now();
  while (w.year <= UNTIL && !careerEnded(w)) {
    const before = new Set((w.bids ?? []).map((b) => b.id));
    const tried = new Set(
      (w.bids ?? [])
        .filter((b) => b.direction === 'out' && b.year === w.year)
        .map((b) => b.playerId),
    );
    advanceDays(w, 1, undefined, false);
    if (w.year !== season) {
      const own = w.clubs.find((c) => c.id === w.playerClub)!;
      const archive = w.history?.at(-1);
      career.seasons.push({
        year: season,
        tier: own.tier,
        rank: archive?.rank ?? 0,
        cash: Number(w.cash) / unitOf(w.year),
      });
      console.error(
        `${SEED} ${TIER} ${FINANCE} ${season} done in ${((performance.now() - started) / 1000).toFixed(0)} s, ${career.signings.length} bids`,
      );
      season = w.year;
      inject();
    }
    const day = currentDay(w);
    const fresh = (w.bids ?? []).filter(
      (b) => !before.has(b.id) && b.direction === 'out' && b.staff && b.day === day,
    );
    if (fresh.length) career.looks.push(snapshotLook(w));
    for (const bid of fresh) {
      if (bid.fee === '0' || !bid.club) continue;
      const signing = signingOf(w, bid, tried);
      if (signing) {
        career.signings.push(signing);
        bids.set(bid.id, { bid, signing });
      }
    }
    const facts = w.transfers?.facts ?? [];
    for (const fact of facts.slice(factsSeen))
      if (fact.direction === 'in' && !fact.loan && BigInt(fact.fee) > 0n && fact.club)
        career.facts.push({
          year: fact.year,
          day: fact.day,
          club: fact.club,
          fee: Number(fact.fee) / unitOf(fact.year),
          player: fact.player,
        });
    factsSeen = facts.length;
  }
  for (const { bid, signing } of bids.values()) signing.status = bid.status;
  return career;
}

// ---- Report ----------------------------------------------------------------------------------
/** A season's summer window runs to 1 September, its winter window from 1 January (→CLUB-17). */
const windowOf = (year: number, day: number) =>
  `${year}${day > transferWindowDays(year).summerClose ? 'w' : 's'}`;

/** CLUB-33's seller targets over completed fee signings. */
export function sellerTargets(facts: Career['facts'], from: number, until: number) {
  const byWindow = new Map<string, Map<string, number>>();
  for (const f of facts) {
    const key = windowOf(f.year, f.day),
      m = byWindow.get(key) ?? new Map<string, number>();
    m.set(f.club, (m.get(f.club) ?? 0) + 1);
    byWindow.set(key, m);
  }
  const windowMax = Math.max(0, ...[...byWindow.values()].flatMap((m) => [...m.values()]));
  // Every five-season span, and apart those of four or more fee signings, where a quarter can hold.
  let fiveMax = 0,
    fiveAt = '',
    fourMax = 0,
    fourAt = '-';
  for (let start = from; start + 4 <= until; start++) {
    const span = facts.filter((f) => f.year >= start && f.year <= start + 4);
    if (!span.length) continue;
    const counts = new Map<string, number>();
    for (const f of span) counts.set(f.club, (counts.get(f.club) ?? 0) + 1);
    const most = Math.max(...counts.values()),
      top = most / span.length,
      at = `${start}–${start + 4} (${most}/${span.length})`;
    if (top > fiveMax) [fiveMax, fiveAt] = [top, at];
    if (span.length >= 4 && top > fourMax) [fourMax, fourAt] = [top, at];
  }
  return { windowMax, fiveMax, fiveAt, fourMax, fourAt, signings: facts.length };
}

function report(careers: Career[]) {
  for (const c of careers) {
    const t = sellerTargets(c.facts, c.from, c.until);
    const signed = c.signings.filter((s) => s.status === 'completed');
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const sellers = new Map<string, number>();
    for (const f of c.facts) sellers.set(f.club, (sellers.get(f.club) ?? 0) + 1);
    console.log(
      `\n## ${c.seed} ${c.code} ${c.tier} ${c.finance} inject ${c.inject}${c.setting ? ` setting ${c.setting}` : ''} — club ${c.club} (tier ${c.clubTier}), ${c.from}–${c.until}`,
    );
    console.log(
      `fee signings ${t.signings}; one seller's most in a window ${t.windowMax} (target ≤ 2); largest five-season share ${(t.fiveMax * 100).toFixed(0)}% ${t.fiveAt} (target ≤ 25%; over spans of 4+ signings ${(t.fourMax * 100).toFixed(0)}% ${t.fourAt})`,
    );
    console.log(
      `sellers: ${[...sellers]
        .sort((a, b) => b[1] - a[1])
        .map(([club, n]) => `${club}×${n}`)
        .join(' ')}`,
    );
    console.log(
      `signed: mean OVR ${mean(signed.map((s) => s.ovr)).toFixed(1)}, fee/value(seller div) ${mean(signed.map((s) => s.fee / s.value)).toFixed(2)}, fee/value(top flight) ${mean(signed.map((s) => s.fee / s.valueTop)).toFixed(2)}, seller tiers ${signed.map((s) => s.sellerTier).join('')}`,
    );
    const bands = ['pick', 'shortlist', 'list'].map(
      (b) => `${b} ${signed.filter((s) => s.band === b).length}`,
    );
    console.log(
      `bands of signed: ${bands.join(', ')}; bids ${c.signings.length} (${[
        'completed',
        'rejected',
        'countered',
        'expired',
        'pending',
        'accepted',
      ]
        .map((s) => `${s} ${c.signings.filter((x) => x.status === s).length}`)
        .join(', ')})`,
    );
    console.log(
      `passed over for money per bid: mean ${mean(c.signings.map((s) => s.passed.length)).toFixed(1)}; seller's players on the list when bid for: mean ${mean(c.signings.map((s) => s.sellerListed)).toFixed(1)} of ${mean(c.signings.map((s) => s.listSize)).toFixed(1)}`,
    );
    console.log(
      `scout's list at looks: mean ${mean(c.looks.map((l) => l.clubs)).toFixed(1)} clubs over ${mean(c.looks.map((l) => l.size)).toFixed(1)} players; top club holds ${mean(c.looks.map((l) => l.topCount)).toFixed(1)}; list tiers ${[0, 1, 2, 3, 4].map((t) => `${t}:${c.looks.flatMap((l) => l.tiers).filter((x) => x === t).length}`).join(' ')}`,
    );
    for (const s of c.signings)
      console.log(
        `  ${s.year}/${s.day} ${s.window} ${s.need} ${s.band} ${s.line} OVR ${s.ovr} age ${s.age} from ${s.seller} (t${s.sellerTier} str ${s.sellerStrength}, ${s.sellerListed}/${s.listSize} listed) fee ${s.fee.toFixed(0)} ask ${s.asking.toFixed(0)} value ${s.value.toFixed(0)} top ${s.valueTop.toFixed(0)} ${s.status}; passed ${s.passed.map((p) => `${p.club}:${p.ovr}`).join(' ') || '-'}`,
      );
  }
  const all = careers.map((c) => sellerTargets(c.facts, c.from, c.until));
  console.log(
    `\nall careers: window max ${Math.max(...all.map((t) => t.windowMax))}, five-season max ${(Math.max(...all.map((t) => t.fiveMax)) * 100).toFixed(0)}% (spans of 4+ signings ${(Math.max(...all.map((t) => t.fourMax)) * 100).toFixed(0)}%), careers meeting both ${all.filter((t) => t.windowMax <= 2 && t.fiveMax <= 0.25).length}/${all.length} (on spans of 4+ ${all.filter((t) => t.windowMax <= 2 && t.fourMax <= 0.25).length}/${all.length})`,
  );
}

/**
 * --supply: in the generated world, the players at the top of 영입 기조 표준's search (→ECON-16: ages
 * 18–30, OVR up to 85) in the country, by club: how few clubs hold the players a list ranked by
 * ability takes first, and those clubs' strengths.
 */
function supplyReport(w: World) {
  const top = 85,
    from = top - 2;
  const clubs = w.clubs
    .filter((c) => c.country === CODE && !c.representative)
    .map((c) => {
      const players = squad(w, c).filter((p) => {
        const age = w.year - p.born,
          ovr = overall(p);
        return age >= 18 && age <= 30 && ovr >= from && ovr <= top;
      });
      return { c, players };
    })
    .filter((x) => x.players.length)
    .sort((a, b) => b.players.length - a.players.length);
  const total = clubs.reduce((n, x) => n + x.players.length, 0);
  console.log(
    `\n## supply ${SEED} ${CODE} ${w.year}: ${total} players aged 18–30 at OVR ${from}–${top} in ${clubs.length} clubs`,
  );
  for (const { c, players } of clubs.slice(0, 8))
    console.log(
      `  ${c.id} tier ${c.tier} strength ${c.strength}: ${players.length} (${(
        ['GK', 'DF', 'MF', 'FW'] as const
      )
        .map((line) => `${line} ${players.filter((p) => lineOfPlayer(p) === line).length}`)
        .join(', ')})`,
    );
  const strongest = w.clubs
    .filter((c) => c.country === CODE && c.tier === 0)
    .map((c) => c.strength)
    .sort((a, b) => b - a)
    .slice(0, 6);
  console.log(`  the top flight's strongest clubs: ${strongest.join(', ')}`);
}

function main() {
  if (args.includes('--supply')) {
    supplyReport(worldAt());
    return;
  }
  if (option('in', '')) {
    report(
      option('in', '')
        .split(',')
        .map((f) => JSON.parse(readFileSync(f, 'utf8')) as Career),
    );
    return;
  }
  for (const part of SETTING ? SETTING.split('+') : []) {
    if (part === 'line' || part === 'list') LIST_SPREAD.inForce = part;
    else if (part === 'signed') UPGRADE_MEASURE.inForce = part;
    else if (part === 'kept') REFILL_SALE.inForce = part;
    else throw new Error(`unknown setting ${part}`);
  }
  const career = playCareer();
  if (!career) return;
  if (option('out', '')) writeFileSync(option('out', ''), JSON.stringify(career));
  report([career]);
}
main();
