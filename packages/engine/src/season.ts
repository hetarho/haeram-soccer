import { advanceEconomy } from './economy';
import { prepareEurope, advanceEurope, finishEurope as finishContinental } from './europe';
import {
  delegatedBusiness,
  gate,
  settleRound,
  settleSeasonPrize,
  sponsorReminder,
  yearlyStaff,
} from './operations';
import type { Club, Fixture, MatchPlayback, TableRow, World } from '../../contracts/src/types';
import { COUNTRIES, country } from '../../catalogs/src/index';
import { addMetrics, clamp, random, zeroMetrics, compareIds } from './primitives';
import { activePlayers, addEvent, clubOf, makePlayer, quote, rating } from './world';
import { simulateMatch } from './match';
import { fatigueCost } from './strategy';
import { developAnnually, settleTraining } from './training';
import { runAcademyIntake, seasonAcademy } from './academy';
import { dailyMarket } from './transfers';
import { moraleAfterMatch } from './morale';
import { settleWinBonus } from './care';
import { managerStyleEffects } from './styles';
import { synergyEffects } from './synergy';
import { buildEffects } from './build';
import { seasonStaff } from './staff';
import {
  currentDay,
  ROUND_INTERVAL_DAYS,
  SEASON_END_DAY,
  SEASON_ROUNDS,
  seasonLength,
} from './calendar';
import {
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
        .slice(0, 7),
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
  if (continental) prepareEurope(w);
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
/** Preserve the league membership at this point, even after promotion or relegation. */
export function snapshotStandings(w: World) {
  const own = clubOf(w);
  const members = w.lower
    ? w.clubs.filter((c) =>
        w.fixtures.some((f) => f.kind === 'lower' && (f.home === c.id || f.away === c.id)),
      )
    : w.clubs.filter((c) => groupKey(c) === groupKey(own) && !c.representative);
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
    club.fans = Math.round(
      clamp(club.fans * (win ? 1 + 0.012 * buildEffects(w).winFans : 0.998), 200, 5000000),
    );
    moraleAfterMatch(w, saved);
    settleWinBonus(w, saved);
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
        kind: key.startsWith('cup') ? 'cup' : 'playoff',
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
export function finishDomesticCups(w: World) {
  for (const c of COUNTRIES) {
    const cs = w.clubs.filter((cl) => cl.country === c.code && !cl.representative);
    w.cupWinners[c.code] = tournament(w, cs, `cup:${c.code}`).id;
  }
}
export function promote(w: World) {
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
    const reservePool = w.clubs
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
        if (c.id === w.playerClub) {
          w.lower = true;
          addEvent(
            w,
            'relegation',
            '다시 시작하는 계절',
            '간소화된 하부 구간에서 프로 복귀에 도전합니다.',
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
export function closeSeason(w: World, finishEurope?: (w: World) => void) {
  if (w.round < 46 || w.fixtures.some((f) => !f.score))
    throw new Error('아직 정규 시즌이 끝나지 않았습니다.');
  finishDomesticCups(w);
  (finishEurope || finishContinental)(w);
  const wasLower = w.lower;
  const own = clubOf(w),
    oldTier = own.tier,
    oldGroup = own.group;
  const table = w.tables[own.id],
    order = ranked(
      w,
      w.lower
        ? w.clubs.filter((c) =>
            w.fixtures.some((f) => f.kind === 'lower' && (f.home === c.id || f.away === c.id)),
          )
        : w.clubs.filter((c) => groupKey(c) === groupKey(own) && !c.representative),
    );
  settleSeasonPrize(w, order.findIndex((c) => c.id === own.id) + 1, order.length);
  const champions = COUNTRIES.map((c) => ({
    country: c.code,
    club: ranked(
      w,
      w.clubs.filter((cl) => cl.country === c.code && cl.tier === 0 && !cl.representative),
    )[0].id,
    cup: w.cupWinners[c.code],
  }));
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
      .map((t) => ({
        kind: t.key,
        name: t.name,
        winner: t.winner!,
        field: t.field,
        standings: t.firstStandings,
        secondStandings: t.secondStandings,
      })),
  });
  w.lastChampions = champions;
  promote(w);
  const last = country(own.country).groups.length - 1;
  if (wasLower) {
    const lowerClubs = w.clubs.filter((c) =>
      w.fixtures.some((f) => f.kind === 'lower' && (f.home === c.id || f.away === c.id)),
    );
    const lowerOrder = ranked(w, lowerClubs);
    let winner = lowerOrder[0];
    if (winner.id !== own.id && lowerOrder.slice(1, 4).some((c) => c.id === own.id))
      winner = tournament(w, lowerOrder.slice(1, 4), 'lower-promotion');
    if (winner.id === own.id) {
      const replacement = ranked(
        w,
        w.clubs.filter((c) => c.country === own.country && c.tier === last && !c.representative),
      ).at(-1)!;
      replacement.tier = last + 1;
      replacement.representative = true;
      w.lower = false;
      own.tier = last;
      own.group = replacement.group;
      addEvent(w, 'promotion', '프로 무대로 복귀', `${own.name} · ${last + 1}부`);
    }
  }
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
  advanceEconomy(w, w.year - 1);
  yearlyStaff(w);
  seasonStaff(w);
  seasonAcademy(w);
  w.income = '0';
  w.expense = '0';
  for (const p of activePlayers(w)) {
    const age = w.year - p.born;
    if (age >= 36 || (p.loanUntil && p.loanUntil <= w.year)) {
      p.status = 'retired';
      addEvent(
        w,
        'retirement',
        `${p.name}의 다음 장`,
        age >= 36 ? '선수 생활을 마무리했습니다.' : '임대 기간이 끝났습니다.',
      );
      continue;
    }
    developAnnually(w, p);
    p.fatigue = 0;
    p.season = zeroMetrics();
    if (p.until <= w.year) {
      p.wage = quote(
        own.country,
        w.year,
        Math.max(15, Math.round((p.attack + p.passing + p.defense) / 3) - 18),
      );
      p.until = w.year + 3;
    }
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
        Math.max(35, rating(w, own) - 5),
        role,
        18,
      ),
    );
  }
  own.reputation = clamp(own.reputation + Math.max(-1, table.points / 25 - 1));
  own.strength = rating(w, own);
  w.europe = [];
  prepareSeason(w);
  // The new season's first day of club business opens the summer window.
  clubDay(w);
  sponsorReminder(w);
}
export function advanceRound(
  w: World,
  settlement?: (w: World, p: MatchPlayback) => void,
  observe = true,
) {
  if (w.round >= 46) return undefined;
  if (!w.rankHistory) snapshotStandings(w);
  ensureScorers(w);
  w.round++;
  const from = currentDay(w),
    to = Math.max(from, w.round * ROUND_INTERVAL_DAYS);
  // Whole-round jumps still live through each skipped day of club business.
  for (let day = from + 1; day <= to; day++) {
    w.calendar = { day };
    clubDay(w);
  }
  w.calendar = { day: to };
  let ownPlayback: MatchPlayback | undefined;
  for (const f of w.fixtures.filter((f) => f.round === w.round && !f.score)) {
    const own = f.home === w.playerClub || f.away === w.playerClub;
    const p = simulateMatch(w, f, own && observe, own || isScoringFixture(w, f));
    f.score = p.record.score;
    recordMatch(w, p, true);
    if (own) {
      ownPlayback = p;
      settlement?.(w, p);
    }
  }
  settleTraining(w);
  advanceEurope(
    w,
    (world, p) => {
      ownPlayback = p;
      settlement?.(world, p);
    },
    undefined,
    observe,
  );
  settleRound(w);
  snapshotStandings(w);
  snapshotScorers(w);
  w.revision++;
  return ownPlayback;
}

/** Daily club business outside matches: academy intake, the transfer market and sponsors. */
export function clubDay(w: World) {
  runAcademyIntake(w);
  dailyMarket(w);
  delegatedBusiness(w);
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
  if (w.critical) return undefined;
  w.calendar ||= { day: currentDay(w) };
  if (!w.rankHistory) snapshotStandings(w);
  ensureScorers(w);
  let ownPlayback: MatchPlayback | undefined;
  const capture = (world: World, p: MatchPlayback) => {
    ownPlayback = p;
    settlement?.(world, p);
  };
  for (let n = 0; n < days; n++) {
    w.calendar.day++;
    // The season closes the day after its final round; the empty summer is skipped.
    if (w.calendar.day > SEASON_END_DAY || w.calendar.day >= seasonLength(w)) {
      closeSeason(w);
      w.revision++;
    } else if (w.round < SEASON_ROUNDS && w.calendar.day >= (w.round + 1) * ROUND_INTERVAL_DAYS) {
      // The round has no skipped days here, so the match day's business runs once after it.
      advanceRound(w, capture, observe);
      clubDay(w);
    } else {
      advanceEurope(w, capture, w.calendar.day, observe);
      clubDay(w);
      w.revision++;
    }
    if (w.critical) break;
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
