import { expect, it } from 'vitest';
import type { MatchRecord } from '../../../../packages/contracts/src/types';
import { createWorld } from '../../../../packages/engine/src/index';
import { squad } from '../../../../packages/engine/src/world';
import { banText, cardCounts, leagueDiscipline, leagueReds } from './discipline';
import { ownLeagueIds } from './league';

it("lists the league's cards and bans", () => {
  const w = createWorld({
    country: 'ENG',
    name: 'Cards',
    color: '#24664f',
    seed: 'cards',
    level: 'easy' as const,
  });
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
