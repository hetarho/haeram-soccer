import { afterEach, expect, it, vi } from 'vitest';
import { emptyPlayerDetail, PD } from '../../../../../../packages/contracts/src/detail';
import type { FullStatsRead } from '../../../../../../packages/contracts/src/match-model';
import type { World } from '../../../../../../packages/contracts/src/types';
import * as squads from '../../../../../../packages/engine/src/world';
import type { MatchRecord } from '../../../../../../packages/contracts/src/types';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import { squad } from '../../../../../../packages/engine/src/world';
import { banText, cardCounts, leagueDiscipline, leagueReds } from './discipline';
import { ownLeagueIds } from '../../league/@x/player';

it("lists the league's cards and bans", () => {
  const w = careerWorld({ country: 'ENG', seed: 'cards' });
  const ids = ownLeagueIds(w);
  const rival = w.clubs.find((c) => c.id === ids.find((id) => id !== w.playerClub))!;
  const abroad = w.clubs.find((c) => !ids.includes(c.id))!;
  const [ours, booked] = w.players;
  const theirs = squad(w, rival)[4];
  const stranger = squad(w, abroad)[2];
  // An own league match: our player booked twice and sent off, their player shown a straight red;
  // a cup match's red is not the league's.
  const match = (kind: string, incidents: object[]) =>
    ({
      id: `${kind}:${w.ownMatches.length}`,
      year: w.year,
      kind,
      home: w.playerClub,
      away: rival.id,
      players: [],
      incidents,
    }) as unknown as MatchRecord;
  w.ownMatches.push(
    match('league', [
      { minute: 20, side: 0, kind: 'yellow', player: ours.id },
      { minute: 70, side: 0, kind: 'secondYellow', player: ours.id },
      { minute: 80, side: 1, kind: 'red', player: theirs.id, reason: 'violent' },
    ]),
    match('cup', [{ minute: 10, side: 0, kind: 'red', player: booked.id, reason: 'dogso' }]),
  );
  w.discipline = {
    year: w.year,
    yellows: {
      [ours.id]: { league: 2 },
      [booked.id]: { league: 4, 'cup:ENG': 1 },
      [stranger.id]: { league: 6 },
    },
    bans: [
      {
        player: ours.id,
        club: w.playerClub,
        matches: 1,
        scope: 'domestic',
        reason: 'secondYellow',
      },
      { player: theirs.id, club: rival.id, matches: 3, scope: 'domestic', reason: 'violent' },
      { player: booked.id, club: w.playerClub, matches: 1, scope: 'domestic', reason: 'dogso' },
      { player: stranger.id, club: abroad.id, matches: 1, scope: 'league', reason: 'yellows' },
    ],
    out: [],
  };
  // A second yellow is a yellow and a red; career counts every own match.
  expect(cardCounts(w).get(ours.id)).toEqual({
    season: { yellow: 2, red: 1 },
    career: { yellow: 2, red: 1 },
  });
  const reds = leagueReds(w);
  expect(reds).toEqual({ [ours.id]: 1, [theirs.id]: 1 });
  const rows = leagueDiscipline(w, ids, reds);
  // Most reds, then most yellows; the other league's player is not listed.
  expect(rows.map((row) => [row.name, row.club, row.yellows, row.reds])).toEqual([
    [ours.name, w.playerClub, 2, 1],
    [theirs.name, rival.id, 0, 1],
    [booked.name, w.playerClub, 4, 0],
  ]);
  expect(rows[1].bans.map(banText)).toEqual(['출장 정지 · 3경기 (국내)']);
  expect(rows.some((row) => row.id === stranger.id)).toBe(false);
  expect(leagueDiscipline(w, [abroad.id], {}).map((row) => row.bans.map(banText))).toEqual([
    ['출장 정지 · 1경기 (리그)'],
  ]);
});

// Synthetic aggregate rows; no season simulation or match execution.
const contribution = (club: string, reds: number) => {
  const detail = emptyPlayerDetail();
  detail[PD.redCards] = reds;
  return { club, appearances: 1, starts: 1, metrics: Array<number>(12).fill(0), detail };
};
const recorded = (): FullStatsRead => ({
  year: 2024,
  trackedFrom: { year: 2024, day: 0, round: 0 },
  untracked: 0,
  competition: {
    kind: 'league',
    groupKey: 'ENG:0:0',
    clubs: [],
    players: [
      {
        id: 'straight',
        name: 'Retained Straight',
        position: 'CB',
        clubs: [contribution('rival', 1)],
      },
      {
        id: 'second',
        name: 'Retained Second Yellow',
        position: 'CM',
        clubs: [contribution('rival', 1)],
      },
      { id: 'own', name: 'Own Player', position: 'ST', clubs: [contribution('own', 1)] },
      {
        id: 'moved',
        name: 'Departed Player',
        position: 'CM',
        clubs: [contribution('rival', 1), contribution('own', 2)],
      },
      { id: 'abroad', name: 'Outside League', position: 'ST', clubs: [contribution('abroad', 9)] },
    ],
  },
});
const syntheticWorld = () => {
  vi.spyOn(squads, 'squad').mockReturnValue([]);
  return {
    year: 2024,
    playerClub: 'own',
    seed: 'synthetic',
    clubs: [{ id: 'own' }, { id: 'rival' }, { id: 'abroad' }],
    players: [{ id: 'own', name: 'Own Player', status: 'active' }],
    discipline: {
      year: 2024,
      yellows: { own: { league: 2 }, second: { league: 2 } },
      bans: [],
      out: [],
    },
  } as unknown as World;
};
afterEach(() => vi.restoreAllMocks());

it('reads every retained red contribution once after bans expire, without own-match overlap', () => {
  const w = syntheticWorld(),
    read = recorded(),
    before = structuredClone(read);
  const rows = leagueDiscipline(w, ['own', 'rival'], { own: 1, straight: 10 }, read);
  expect(rows.map((r) => [r.id, r.reds, r.yellows])).toEqual([
    ['moved', 3, 0],
    ['own', 1, 2],
    ['second', 1, 2],
    ['straight', 1, 0],
  ]);
  expect(rows[0]).toMatchObject({
    name: 'Departed Player',
    clubs: ['rival', 'own'],
    club: undefined,
    bans: [],
  });
  expect(rows.find((r) => r.id === 'straight')).toMatchObject({
    name: 'Retained Straight',
    club: 'rival',
  });
  expect(read).toEqual(before);
});
it('filters contributions to the selected league and preserves known actual affiliation', () => {
  const w = syntheticWorld();
  w.scorerSeason = {
    year: 2024,
    players: [{ id: 'moved', name: 'Departed Player', club: 'rival' }],
  } as World['scorerSeason'];
  expect(leagueDiscipline(w, ['abroad'], {}, recorded()).map((r) => [r.id, r.reds])).toEqual([
    ['abroad', 9],
  ]);
  expect(leagueDiscipline(w, ['own', 'rival'], {}, recorded())[0]?.club).toBe('rival');
});
it('never overwrites retained read identities when resolving another unnamed player', () => {
  const w = syntheticWorld();
  w.discipline!.bans.push({
    player: 'unknown',
    club: 'rival',
    scope: 'league',
    reason: 'yellows',
    matches: 1,
  });
  vi.spyOn(squads, 'squad').mockReturnValue([
    { id: 'straight', name: 'Wrong Regenerated Identity' },
    { id: 'unknown', name: 'Known Roster' },
  ] as World['players']);
  const rows = leagueDiscipline(w, ['own', 'rival'], {}, recorded());
  expect(rows.find((r) => r.id === 'straight')?.name).toBe('Retained Straight');
  expect(rows.find((r) => r.id === 'unknown')?.name).toBe('Known Roster');
});
it('keeps known yellows and bans while red samples are unavailable, never a fabricated zero', () => {
  const w = syntheticWorld();
  w.discipline!.yellows = { own: { league: 2 } };
  expect(leagueDiscipline(w, ['own'], { own: 5 }, null)[0]).toMatchObject({
    yellows: 2,
    reds: undefined,
  });
  const read = recorded();
  read.untracked = 7;
  expect(leagueDiscipline(w, ['own'], { own: 5 }, read).find((row) => row.id === 'own')?.reds).toBe(
    1,
  );
  expect(
    leagueDiscipline(w, ['own'], { own: 5 }, { ...read, year: 2023 })[0]?.reds,
  ).toBeUndefined();
});
