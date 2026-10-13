import { advanceEconomy } from './economy';
import {
  prepareEurope,
  advanceEurope,
  finishEurope as finishContinental,
  europeFinal,
} from './europe';
import { advanceCups, cupKey, finishCups, prepareCups } from './cups';
import { archivedRounds, finalOf, ownReached, type Settlement } from './knockout';
import { clubValuation, eloOf, eloRange, eloRank, settleElo, squadValue } from './ratings';
import { evolveClubs } from './dynamics';
import { announceRetirements, clearHealed, injuriesAfterMatch, retireAtClose } from './careers';
import { gate, settleLeagueMerit, settleRound } from './settlement';
import { assessOperatingExpenses } from './finance';
import { delegatedBusiness, sponsorReminder, yearlySponsor } from './ops-commercial';
import { yearlyStaff } from './ops-staff';
import type {
  BracketArchive,
  Club,
  CupRun,
  Fixture,
  MatchPlayback,
  TableRow,
  World,
} from '../../contracts/src/types';
import { COUNTRIES, country } from '../../catalogs/src/index';
import { addMetrics, clamp, random, zeroMetrics, compareIds } from './primitives';
import { activePlayers, addEvent, AMATEUR_CLUBS, clubOf, makePlayer, rating } from './world';
import { applyClauses, contractTalks, expireContracts, transferRequests } from './contracts';
import { simulateMatch } from './match';
import { fatigueCost } from './strategy';
import { developAnnually, settleTraining } from './training';
import { runAcademyIntake, seasonAcademy } from './academy';
import { dailyMarket } from './transfers';
import { moraleAfterMatch } from './morale';
import { settleWinBonus } from './care';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';
import { applyReservedBuild, buildEffects } from './build';
import { MARKET_REFRESH_ROUNDS, refreshManagerMarket } from './managerMarket';
import { dailyStaff, seasonStaff } from './staff';
import { fansAfterMatch } from './fans';
import {
  currentDay,
  ROUND_INTERVAL_DAYS,
  SEASON_END_DAY,
  SEASON_ROUNDS,
  seasonLength,
} from './calendar';
import {
  archivedScorers,
  ensureScorers,
  isScoringFixture,
  prepareScorers,
  recordScorers,
  snapshotScorers,
} from './scoring';
export const emptyTable = (): TableRow => ({
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  gf: 0,
  ga: 0,
  points: 0,
});
export function groupKey(c: Club) {
  return `${c.country}:${c.tier}:${c.group}`;
}
export function fixturesFor(clubs: Club[], year: number, globalRounds = 46): Fixture[] {
  const ring: (Club | null)[] = [...clubs].sort((a, b) => compareIds(a.id, b.id));
  if (ring.length % 2) ring.push(null);
  const n = ring.length;
  const matches: Fixture[] = [];
  for (let round = 0; round < (n - 1) * 2; round++) {
    for (let i = 0; i < n / 2; i++) {
      let a = ring[i],
        b = ring[n - 1 - i];
      if (!a || !b) continue;
      if (((round % (n - 1)) % 2 === 1) !== round >= n - 1) [a, b] = [b, a];
      matches.push({
        id: `${year}:${groupKey(a)}:${round}:${i}`,
        year,
        round: Math.floor((round * globalRounds) / ((n - 1) * 2)) + 1,
        kind: 'league',
        home: a.id,
        away: b.id,
        country: a.country,
        groupKey: groupKey(a),
      });
    }
    ring.splice(1, 0, ring.pop()!);
  }
  return matches;
}
export function prepareSeason(w: World, continental = true) {
  w.fixtures = [];
  w.tables = {};
  for (const c of w.clubs) w.tables[c.id] = emptyTable();
  const groups = new Map<string, Club[]>();
  for (const c of w.clubs)
    if (!c.representative && c.tier < country(c.country).groups.length) {
      const k = groupKey(c);
      groups.set(k, [...(groups.get(k) || []), c]);
    }
  for (const cs of groups.values()) w.fixtures.push(...fixturesFor(cs, w.year));
  if (w.lower) {
    const own = clubOf(w);
    const lower = [
      own,
      ...w.clubs
        .filter(
          (c) =>
            c.country === own.country &&
            c.representative &&
            c.tier === country(c.country).groups.length,
        )
        .slice(0, AMATEUR_CLUBS),
    ];
    w.fixtures.push(
      ...fixturesFor(lower, w.year).map((f) => ({
        ...f,
        kind: 'lower' as const,
        groupKey: 'lower',
      })),
    );
  }
  w.round = 0;
  w.calendar = { day: 0 };
  prepareScorers(w);
  w.rankHistory = (w.rankHistory || []).filter((s) => s.year >= w.year - 9 && s.year < w.year);
  w.cupWinners = {};
  if (continental) {
    prepareEurope(w);
    prepareCups(w);
  }
  snapshotStandings(w);
}
export function ranked(w: World, clubs: Club[]) {
  return [...clubs].sort((a, b) => {
    const x = w.tables[a.id] || emptyTable(),
      y = w.tables[b.id] || emptyTable();
    return (
      y.points - x.points || y.gf - y.ga - (x.gf - x.ga) || y.gf - x.gf || compareIds(a.id, b.id)
    );
  });
}
/**
 * The own league's clubs in world order: the amateur league's are those in its fixtures, found in
 * one pass (testing each club against every fixture took most of a season and of a policy-board
 * render).
 */
export function ownLeagueClubs(w: World) {
  if (!w.lower) {
    const key = groupKey(clubOf(w));
    return w.clubs.filter((c) => groupKey(c) === key && !c.representative);
  }
  return lowerLeagueClubs(w);
}
function lowerLeagueClubs(w: World) {
  const ids = new Set(w.fixtures.flatMap((f) => (f.kind === 'lower' ? [f.home, f.away] : [])));
  return w.clubs.filter((c) => ids.has(c.id));
}
/** Preserve the league membership at this point, even after promotion or relegation. */
export function snapshotStandings(w: World) {
  const own = clubOf(w);
  const members = ownLeagueClubs(w);
  const snapshots = (w.rankHistory || []).filter(
    (s) =>
      !(s.year === w.year && s.round === w.round && s.tier === own.tier && s.group === own.group),
  );
  w.rankHistory = [
    ...snapshots,
    {
      year: w.year,
      round: w.round,
      day: currentDay(w),
      tier: own.tier,
      group: own.group,
      rows: ranked(w, members).map((c) => {
        const row = w.tables[c.id] || emptyTable();
        return [w.clubs.indexOf(c), row.points, row.gf, row.ga];
      }),
    },
  ];
}
function settleTable(row: TableRow, gf: number, ga: number) {
  row.played++;
  row.gf += gf;
  row.ga += ga;
  if (gf > ga) {
    row.won++;
    row.points += 3;
  } else if (gf === ga) {
    row.drawn++;
    row.points++;
  } else row.lost++;
}
export function recordMatch(w: World, playback: MatchPlayback, league = false) {
  const m = playback.record;
  const own = m.home === w.playerClub || m.away === w.playerClub;
  if (own && w.ownMatches.some((existing) => existing.id === m.id)) return;
  settleElo(w, m);
  if (league) {
    settleTable(w.tables[m.home], m.score.home, m.score.away);
    settleTable(w.tables[m.away], m.score.away, m.score.home);
    recordScorers(w, playback);
  }
  if (own) {
    const ownIds = new Set(w.players.map((p) => p.id));
    const saved = { ...m, players: m.players.filter((p) => ownIds.has(p.id)) };
    w.ownMatches.push(saved);
    gate(w, m);
    // A pressing manager adds load; a synergy built for pressing takes some of it off.
    const extraLoad = managerStyleEffects(w).fatigueCost - synergyEffects(w).fatigueRelief;
    for (const line of saved.players) {
      const p = w.players.find((p) => p.id === line.id);
      if (p) {
        p.season = addMetrics(p.season, line.metrics);
        p.career = addMetrics(p.career, line.metrics);
        p.fatigue = clamp(
          p.fatigue + fatigueCost(p, m.tactics[m.home === w.playerClub ? 0 : 1]) + extraLoad,
        );
      }
    }
    const side = m.home === w.playerClub ? 0 : 1;
    const win = side === 0 ? m.score.home > m.score.away : m.score.away > m.score.home;
    const club = clubOf(w);
    club.fans = fansAfterMatch(club.fans, win, buildEffects(w).winFans);
    moraleAfterMatch(w, saved);
    settleWinBonus(w, saved);
    injuriesAfterMatch(w, saved);
  }
}
export function resolveTie(w: World, f: Fixture) {
  const existing = w.ownMatches.find((m) => m.id === f.id);
  if (existing) {
    if (existing.score.home !== existing.score.away)
      return existing.score.home > existing.score.away ? f.home : f.away;
    return random(`${w.seed}:penalty:${f.id}`)() < 0.5 ? f.home : f.away;
  }
  const own = f.home === w.playerClub || f.away === w.playerClub;
  const p = simulateMatch(w, f, false, own);
  if (p.record.score.home === p.record.score.away) {
    const r = random(`${w.seed}:penalty:${f.id}`);
    const winner = r() < 0.5 ? f.home : f.away;
    p.record.highlights.push({
      minute: 120,
      side: winner === f.home ? 0 : 1,
      player: '승부차기',
      action: `승부차기 ${winner === f.home ? '홈' : '원정'} 승리`,
    });
    recordMatch(w, p);
    return winner;
  }
  recordMatch(w, p);
  return p.record.score.home > p.record.score.away ? f.home : f.away;
}
function tournament(w: World, clubs: Club[], key: string) {
  let list = [...clubs].sort((a, b) => compareIds(a.id, b.id));
  let stage = 0;
  while (list.length > 1) {
    const next: Club[] = [];
    for (let i = 0; i < list.length; i += 2) {
      if (!list[i + 1]) {
        next.push(list[i]);
        continue;
      }
      const f: Fixture = {
        id: `${w.year}:${key}:${stage}:${i}`,
        year: w.year,
        round: 46 + stage,
        kind: 'playoff',
        home: list[i].id,
        away: list[i + 1].id,
        country: list[i].country,
        groupKey: key,
      };
      const winnerId = resolveTie(w, f);
      next.push(w.clubs.find((c) => c.id === winnerId)!);
    }
    list = next;
    stage++;
  }
  return list[0];
}
/**
 * The amateur clubs going up while the own club plays in the amateur league (→LEAGUE-6): one for
 * each club the last division relegates (two a group), every place but the last by the table just
 * played and the last by a playoff of the next four.
 */
function amateurEntrants(w: World) {
  const cp = country(clubOf(w).country),
    places = cp.groups[cp.groups.length - 1].length * 2;
  const order = ranked(w, lowerLeagueClubs(w));
  return {
    country: cp.code,
    clubs: [
      ...order.slice(0, places - 1),
      tournament(w, order.slice(places - 1, places + 3), 'lower-promotion'),
    ],
  };
}
export function promote(w: World) {
  // The amateur table is the season just played: settle it before any club moves.
  const amateurs = w.lower ? amateurEntrants(w) : undefined;
  const transfers: { club: Club; tier: number }[] = [];
  for (const cp of COUNTRIES) {
    for (let tier = 0; tier < cp.groups.length - 1; tier++) {
      const upper = w.clubs.filter(
        (c) => c.country === cp.code && c.tier === tier && !c.representative,
      );
      const lower = w.clubs.filter(
        (c) => c.country === cp.code && c.tier === tier + 1 && !c.representative,
      );
      const sortedUpper = ranked(w, upper);
      const count = cp.moves[tier];
      let promoted: Club[] = [];
      if (cp.groups[tier + 1].length > 1) {
        promoted = cp.groups[tier + 1].map(
          (_, g) =>
            ranked(
              w,
              lower.filter((c) => c.group === g),
            )[0],
        );
        const pool = cp.groups[tier + 1].flatMap((_, g) =>
          ranked(
            w,
            lower.filter((c) => c.group === g),
          ).slice(1, 4),
        );
        promoted.push(tournament(w, pool, `promotion:${cp.code}:${tier}`));
      } else {
        const order = ranked(w, lower),
          automatic = cp.automatic[tier];
        promoted = order.slice(0, automatic);
        if (count > automatic) {
          const challenger = tournament(
            w,
            order.slice(automatic, automatic + 4),
            `promotion:${cp.code}:${tier}`,
          );
          if (['GER', 'FRA', 'POR', 'NED', 'BEL'].includes(cp.code)) {
            const defender = sortedUpper[sortedUpper.length - count];
            const f: Fixture = {
              id: `${w.year}:barrage:${cp.code}:${tier}`,
              year: w.year,
              round: 50,
              kind: 'playoff',
              home: defender.id,
              away: challenger.id,
              country: cp.code,
              groupKey: 'promotion',
            };
            if (resolveTie(w, f) === challenger.id) promoted.push(challenger);
          } else promoted.push(challenger);
        }
      }
      for (const c of promoted) transfers.push({ club: c, tier });
      for (const c of sortedUpper.slice(-promoted.length))
        transfers.push({ club: c, tier: tier + 1 });
    }
  }
  for (const t of transfers) t.club.tier = t.tier;
  for (const cp of COUNTRIES) {
    const last = cp.groups.length - 1;
    // Where no amateur league is played, the strongest amateur clubs go up.
    const reservePool =
      amateurs?.country === cp.code
        ? [...amateurs.clubs]
        : w.clubs
            .filter((c) => c.country === cp.code && c.representative && c.tier === last + 1)
            .sort((a, b) => b.strength - a.strength || (a.id < b.id ? -1 : 1));
    for (let group = 0; group < cp.groups[last].length; group++) {
      const members = w.clubs.filter(
        (c) => c.country === cp.code && c.tier === last && c.group === group && !c.representative,
      );
      const previous = w.history.at(-1)!.standings;
      const candidates = members.filter((c) =>
        previous.some((row) => w.clubs[row[0]].id === c.id && row[1] === last && row[2] === group),
      );
      const drops = ranked(w, candidates).slice(-Math.min(2, candidates.length));
      for (let i = 0; i < drops.length; i++) {
        const c = drops[i],
          entry = reservePool.shift();
        if (!entry) continue;
        c.tier = last + 1;
        c.group = 0;
        c.representative = c.id !== w.playerClub;
        entry.tier = last;
        entry.group = group;
        entry.representative = false;
        if (entry.id === w.playerClub) {
          w.lower = false;
          const returning = w.history.some((h) => h.tier <= last);
          addEvent(
            w,
            'promotion',
            returning ? '프로 무대로 복귀' : '프로 무대 입성',
            `${entry.name} · ${last + 1}부`,
          );
        }
        if (c.id === w.playerClub) {
          w.lower = true;
          addEvent(
            w,
            'relegation',
            '다시 시작하는 계절',
            '아마추어 리그에서 프로 복귀에 도전합니다.',
          );
        }
      }
    }
    for (let tier = 0; tier < cp.groups.length; tier++) {
      const members = w.clubs
        .filter((c) => c.country === cp.code && c.tier === tier && !c.representative)
        .sort((a, b) => compareIds(a.id, b.id));
      let offset = 0;
      for (let group = 0; group < cp.groups[tier].length; group++) {
        for (const c of members.slice(offset, offset + cp.groups[tier][group])) c.group = group;
        offset += cp.groups[tier][group];
      }
    }
  }
}
/** How far the own club went in this season's cups (→HIST-12). */
function cupRuns(w: World): CupRun[] {
  const own = clubOf(w),
    runs: CupRun[] = [];
  const cup = w.cups?.find((c) => c.country === own.country);
  const domestic = cup && ownReached(w, cup.rounds);
  if (cup && domestic)
    runs.push({
      key: 'cup',
      name: cup.name,
      reached: domestic.label,
      ...(domestic.champion ? { champion: true } : {}),
    });
  for (const t of w.europe) {
    if (t.key === 'super' || !t.clubs.includes(w.playerClub)) continue;
    const rounds = t.rounds || [];
    const knockout = ownReached(
      w,
      rounds.filter((r) => !r.label.startsWith('예선')),
    );
    const played = (marker: string) =>
      t.fixtures.some(
        (f) => f.id.includes(marker) && (f.home === w.playerClub || f.away === w.playerClub),
      );
    const reached =
      knockout?.label ??
      (played(':second:')
        ? '2차 조별 리그'
        : played(':phase:')
          ? t.format === 'league'
            ? '리그 페이즈'
            : '조별 리그'
          : (ownReached(w, rounds)?.label ?? '예선'));
    runs.push({
      key: t.key,
      name: t.name,
      reached,
      ...(t.winner === w.playerClub ? { champion: true } : {}),
    });
  }
  return runs;
}
/**
 * The own league position after each round, from the snapshots the live rank graph draws (pruned
 * after ten seasons). None unless every round was recorded: older saves began mid-season, and a
 * shorter series would put each rank against the wrong round.
 */
function seasonRanks(w: World, tier: number, group: number) {
  const snapshots = (w.rankHistory || [])
    .filter((s) => s.year === w.year && s.round > 0 && s.tier === tier && s.group === group)
    .sort((a, b) => a.round - b.round);
  const ranks = snapshots.map(
    (s) => s.rows.findIndex(([index]) => w.clubs[index]?.id === w.playerClub) + 1,
  );
  return snapshots.length === w.round &&
    snapshots.every((s, i) => s.round === i + 1) &&
    ranks.every((rank) => rank > 0)
    ? ranks
    : undefined;
}
/** The brackets of the own country's cup and every continental knockout but the Super Cup. */
function seasonBrackets(w: World): BracketArchive[] {
  const cup = w.cups?.find((c) => c.country === clubOf(w).country);
  const sources = [
    ...(cup
      ? [{ key: 'cup', id: cupKey(cup.country), rounds: cup.rounds, fixtures: cup.fixtures }]
      : []),
    ...w.europe
      .filter((t) => t.key !== 'super')
      .map((t) => ({ key: t.key, id: t.key, rounds: t.rounds || [], fixtures: t.fixtures })),
  ];
  return sources.flatMap(({ key, id, rounds, fixtures }) => {
    const archived = archivedRounds(w, id, rounds, fixtures);
    return archived ? [{ key, rounds: archived }] : [];
  });
}
/**
 * What a closed season's pages show once its live tables are gone: the league's leading scorers,
 * the own rank after every round, the Club Elo spread against `league` and the brackets.
 */
function seasonRecords(w: World, league: Club[], tier: number, group: number) {
  const scorers = archivedScorers(w),
    ranks = seasonRanks(w, tier, group);
  return {
    ...(scorers ? { scorers } : {}),
    ...(ranks ? { ranks } : {}),
    ...(league.length ? { eloRange: eloRange(w, league) } : {}),
    brackets: seasonBrackets(w),
  };
}
export function closeSeason(w: World, finishEurope?: (w: World) => void) {
  // Clubs of our league as it was played, to see who went down once the season is closed.
  const leagueTiers = new Map(ownLeagueClubs(w).map((club) => [club.id, club.tier]));
  if (w.round < 46 || w.fixtures.some((f) => !f.score))
    throw new Error('아직 정규 시즌이 끝나지 않았습니다.');
  // Every path closes on the day after the final round, the day a day step closes on (→LEAGUE-9).
  if (currentDay(w) < SEASON_END_DAY + 1) w.calendar = { day: SEASON_END_DAY + 1 };
  finishCups(w);
  (finishEurope || finishContinental)(w);
  const own = clubOf(w),
    oldTier = own.tier,
    oldGroup = own.group;
  const table = w.tables[own.id],
    order = ranked(w, ownLeagueClubs(w));
  settleLeagueMerit(w, order.findIndex((c) => c.id === own.id) + 1, order.length);
  const champions = COUNTRIES.map((c) => {
    const cup = w.cups?.find((entry) => entry.country === c.code);
    const cupFinal = cup && finalOf(w, cupKey(c.code), cup.rounds, cup.fixtures);
    return {
      country: c.code,
      club: ranked(
        w,
        w.clubs.filter((cl) => cl.country === c.code && cl.tier === 0 && !cl.representative),
      )[0].id,
      cup: w.cupWinners[c.code],
      ...(cupFinal ? { cupFinal } : {}),
    };
  });
  const valuation = clubValuation(w);
  w.history.push({
    year: w.year,
    tier: oldTier,
    group: oldGroup,
    rank: order.findIndex((c) => c.id === own.id) + 1,
    points: table.points,
    played: table.played,
    won: table.won,
    drawn: table.drawn,
    lost: table.lost,
    gf: table.gf,
    ga: table.ga,
    cash: w.cash,
    currency: w.currency,
    income: w.income,
    expense: w.expense,
    fans: own.fans,
    rating: rating(w, own),
    manager: w.manager.name,
    metrics: w.ownMatches
      .filter((m) => m.year === w.year)
      .reduce((s, m) => addMetrics(s, m.metrics[m.home === w.playerClub ? 0 : 1]), zeroMetrics()),
    standings: w.clubs
      .filter((c) => !c.representative)
      .map((c) => {
        const t = w.tables[c.id];
        return [w.clubs.indexOf(c), c.tier, c.group, t.points, t.gf, t.ga];
      }),
    champions,
    europe: w.europe
      .filter((t) => t.winner)
      .map((t) => {
        const final = europeFinal(w, t);
        return {
          kind: t.key,
          name: t.name,
          winner: t.winner!,
          field: t.field,
          standings: t.firstStandings,
          secondStandings: t.secondStandings,
          ...(final ? { final } : {}),
        };
      }),
    elo: Math.round(eloOf(own)),
    eloRank: eloRank(w),
    squadValue: squadValue(w),
    clubValue: valuation.total,
    runs: cupRuns(w),
    ...seasonRecords(w, order, oldTier, oldGroup),
  });
  w.lastChampions = champions.map(({ country, club, cup }) => ({ country, club, cup }));
  retireAtClose(w);
  const tiers = new Map(w.clubs.map((c) => [c.id, c.tier]));
  promote(w);
  evolveClubs(w, tiers);
  if (own.tier !== oldTier)
    addEvent(
      w,
      own.tier < oldTier ? 'promotion' : 'relegation',
      own.tier < oldTier ? '새로운 무대로' : '다시 올라갈 준비',
      `${oldTier + 1}부 → ${own.tier + 1}부`,
    );
  addEvent(
    w,
    'season',
    '시즌의 마지막 페이지',
    `${w.year}/${String(w.year + 1).slice(2)} · ${table.points}점`,
  );
  w.year++;
  // The new season's books open before the close pays anything, so its renewals and hires are
  // booked where their events are (→ECON-10).
  w.income = '0';
  w.expense = '0';
  // A strategy reserved during the season becomes the new season's change (→ECON-22).
  applyReservedBuild(w);
  advanceEconomy(w, w.year - 1);
  // The new season's operating expenses, in its money and on the division it plays (→ECON-30),
  // before anything this rollover weighs fixed costs.
  w.operatingExpenses = assessOperatingExpenses(w);
  yearlySponsor(w);
  yearlyStaff(w);
  seasonStaff(w);
  seasonAcademy(w);
  // Youth come in five below the squad as it finished the season: an XI that expiring contracts
  // left short would otherwise bring every replacement in at the floor of 20 (→CLUB-3).
  const youthLevel = Math.max(20, rating(w, own) - 5);
  // Unrenewed contracts end: those players leave, before 1996 for a compensation (→CLUB-28).
  expireContracts(w, oldTier);
  // The running contracts' promotion or relegation clauses apply from the first round (→CLUB-29).
  if (own.tier !== oldTier) applyClauses(w, own.tier < oldTier ? 'promotion' : 'relegation');
  for (const p of activePlayers(w)) {
    if (p.loanUntil && p.loanUntil <= w.year) {
      p.status = 'retired';
      addEvent(w, 'retirement', `${p.name}의 다음 장`, '임대 기간이 끝났습니다.');
      continue;
    }
    developAnnually(w, p);
    p.fatigue = 0;
    p.season = zeroMetrics();
  }
  let i = 0;
  while (activePlayers(w).length < 18 || !activePlayers(w).some((p) => p.role === 'GK')) {
    const roles = activePlayers(w);
    const role =
      roles.filter((p) => p.role === 'GK').length < 2
        ? 'GK'
        : roles.filter((p) => p.role === 'DEF').length < 6
          ? 'DEF'
          : roles.filter((p) => p.role === 'MID').length < 6
            ? 'MID'
            : 'FWD';
    w.players.push(
      makePlayer(
        own.country,
        w.seed,
        `${own.id}:youth:${w.year}:${i++}`,
        w.year,
        youthLevel,
        role,
        18,
        own.tier,
      ),
    );
  }
  own.reputation = clamp(own.reputation + Math.max(-1, table.points / 25 - 1));
  own.strength = rating(w, own);
  w.europe = [];
  prepareSeason(w);
  // Relegated clubs may sack their managers into the market (→STAFF-17).
  refreshManagerMarket(
    w,
    new Set(
      w.clubs
        .filter(
          (club) => (leagueTiers.get(club.id) ?? club.tier) < club.tier && club.id !== w.playerClub,
        )
        .map((club) => club.id),
    ),
  );
  // The new season's first day of club business opens the summer window.
  clubDay(w);
  sponsorReminder(w);
}
/**
 * One round: the days up to and including its league match day, each lived as a day step lives it
 * (→LEAGUE-11), so midweek ties play on their own day before the league matches. Like the round
 * step always has, it carries on past a critical alert; the host stops after the round.
 */
export function advanceRound(w: World, settlement?: Settlement, observe = true) {
  if (w.round >= SEASON_ROUNDS || w.bankrupt) return undefined;
  beginDays(w);
  const round = w.round;
  let ownPlayback: MatchPlayback | undefined;
  const capture = (world: World, p: MatchPlayback) => {
    ownPlayback = p;
    settlement?.(world, p);
  };
  while (w.round === round && !w.bankrupt) stepDay(w, capture, observe);
  return ownPlayback;
}
/** A league match day: the round's matches, then its settlement and snapshots. */
function playRound(w: World, capture: Settlement, observe: boolean) {
  w.round++;
  for (const f of w.fixtures.filter((f) => f.round === w.round && !f.score)) {
    const own = f.home === w.playerClub || f.away === w.playerClub;
    const p = simulateMatch(w, f, own && observe, own || isScoringFixture(w, f));
    f.score = p.record.score;
    recordMatch(w, p, true);
    if (own) capture(w, p);
  }
  settleTraining(w);
  advanceEurope(w, capture, undefined, observe);
  advanceCups(w, capture, undefined, observe);
  settleRound(w);
  snapshotStandings(w);
  snapshotScorers(w);
  if (w.round % MARKET_REFRESH_ROUNDS === 0) refreshManagerMarket(w);
  w.revision++;
}
/** Records an older save may lack, set up before its first day is lived. */
function beginDays(w: World) {
  w.calendar ||= { day: currentDay(w) };
  if (!w.rankHistory) snapshotStandings(w);
  ensureScorers(w);
}
/**
 * The next day of the world season in its one order (→LEAGUE-11): the close on the day after the
 * final round; a league match day's matches and settlement before its club business; any other
 * day's ties before its club business.
 */
function stepDay(w: World, capture: Settlement, observe: boolean) {
  const day = currentDay(w) + 1;
  w.calendar = { day };
  // The season closes the day after its final round; the empty summer is skipped.
  if (day > SEASON_END_DAY || day >= seasonLength(w)) {
    closeSeason(w);
    w.revision++;
  } else if (w.round < SEASON_ROUNDS && day >= (w.round + 1) * ROUND_INTERVAL_DAYS) {
    playRound(w, capture, observe);
    clubDay(w);
  } else {
    advanceEurope(w, capture, day, observe);
    advanceCups(w, capture, day, observe);
    clubDay(w);
    w.revision++;
  }
}

/**
 * Daily club business outside matches: academy intake, the transfer market, sponsors, the staff,
 * spring retirement announcements, contract talks, transfer requests and healed injuries.
 */
export function clubDay(w: World) {
  runAcademyIntake(w);
  dailyMarket(w);
  delegatedBusiness(w);
  dailyStaff(w);
  announceRetirements(w);
  contractTalks(w);
  transferRequests(w);
  clearHealed(w);
}
/** Off days only move the clock. Matches and existing weekly costs settle on their due day. */
export function advanceDays(
  w: World,
  days: number,
  settlement?: (w: World, p: MatchPlayback) => void,
  observe = true,
) {
  if (!Number.isInteger(days) || days < 1 || days > 366)
    throw new Error('진행할 날짜 범위가 올바르지 않습니다.');
  if (w.critical || w.bankrupt) return undefined;
  beginDays(w);
  let ownPlayback: MatchPlayback | undefined;
  const capture = (world: World, p: MatchPlayback) => {
    ownPlayback = p;
    settlement?.(world, p);
  };
  for (let n = 0; n < days; n++) {
    stepDay(w, capture, observe);
    if (w.critical || w.bankrupt) break;
  }
  return ownPlayback;
}

/** Bypass empty weeks and the off-season, while still settling every intervening day. */
export function advanceToNextMatch(
  w: World,
  settlement?: (w: World, p: MatchPlayback) => void,
  observe = true,
) {
  const matchCount = w.ownMatches.length;
  let playback: MatchPlayback | undefined;
  for (let n = 0; n < 2 * seasonLength(w) && !w.critical; n++) {
    const p = advanceDays(w, 1, settlement, observe);
    if (p) playback = p;
    if (w.ownMatches.length > matchCount) break;
  }
  return playback;
}
