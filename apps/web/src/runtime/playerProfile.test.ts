import { describe, expect, it } from 'vitest';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { squad } from '../../../../packages/engine/src/world';
import { squadPlayer } from './clubProfile';

describe('every player-profile identity on a small prepared roster', () => {
  it('resolves in order, includes players outside the eighteen, clones facts and never creates records', () => {
    const w = worldMarketFixture();
    const rep = w.clubs[2]!;
    rep.representative = true;
    const player = { ...structuredClone(w.players[0]!), id: 'moved' };
    w.squads = { foreign: [...Array.from({ length: 18 }, (_, i) => ({ ...player, id: `bench:${i}` })), player] };
    const free = { ...structuredClone(player), id: 'free', freeSince: w.year };
    w.freeAgents = [free];
    const retired = { ...structuredClone(player), id: 'retired' };
    w.playerRecords = { retired: { moves: [], linked: true,
      lines: [{ year: w.year - 1, club: 'foreign', appearances: 2, goals: 1, assists: 0 }],
      retired: { year: w.year - 1, club: 'foreign', profile: retired },
    } };
    const before = structuredClone(w);
    expect(squadPlayer(w, w.players[0]!.id)!.kind).toBe('own');
    expect(squadPlayer(w, player.id, rep.id)).toMatchObject({ kind: 'squad', club: 'foreign', player });
    expect(squadPlayer(w, free.id)!).toMatchObject({ kind: 'free', player: free });
    expect(squadPlayer(w, free.id)!).not.toHaveProperty('club');
    const read = squadPlayer(w, retired.id)!;
    expect(read).toMatchObject({ kind: 'retired', club: 'foreign', player: retired,
      lines: w.playerRecords.retired!.lines, retired: { year: w.year - 1, club: 'foreign' } });
    read.player.attrs.passing = -1;
    read.lines[0]!.goals = -1;
    expect(squadPlayer(w, squad(w, rep)[0]!.id)!.kind).toBe('representative');
    expect(squadPlayer(w, 'unknown')).toBeUndefined();
    expect(w).toEqual(before);
  });
});
