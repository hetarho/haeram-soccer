import { emptyTeamDetail } from '../../contracts/src/detail';
import { describe, expect, it } from 'vitest';
import type { MatchPlayback, MatchRecord, Player, World } from '../../contracts/src/types';
import { MATCH_MODEL_REVISION } from '../../contracts/src/match-model';
import { worldMarketFixture } from './world-market.testkit';
import { zeroMetrics } from './primitives';
import { M } from './match/record';
import { settleNpcSeason } from './npc-stats';
import { closeNpcSummer } from './npc-careers';
import { deriveClubNews, initializeNewsJournal, recordRetirementNews } from './news';
import { recordTransfer } from './transfer-records';
import { closePlayerLines, linkOwnMatchPlayers, linkPlayer, playerRecord, retirePlayerRecord, settleAbsentPlayerRecords } from './player-records';

/** Two synthetic participants, no fixtures simulated and no world generation. */
function fixture() {
  const w = worldMarketFixture();
  w.players = w.players.slice(0, 2);
  w.clubs[2]!.representative = true;
  w.squads = { foreign: [] };
  w.npcSeason = { year: w.year, model: MATCH_MODEL_REVISION,
    trackedFrom: { year: w.year, day: 1, round: 1 }, competitions: [] };
  return w;
}
function playback(w: World, p: Player, club = 'foreign', kind: 'league' | 'cup' = 'league', conceded = 0, substitute = false): MatchPlayback {
  const metrics = zeroMetrics();
  metrics[M.minutes] = substitute ? 30 : 90;
  metrics[M.goals] = 1;
  metrics[M.assists] = 2;
  metrics[M.saves] = p.position === 'GK' ? 4 : 0;
  return { record: { year: w.year, kind, groupKey: kind, home: club, away: 'representative',
    score: { home: 1, away: conceded }, metrics: [zeroMetrics(), zeroMetrics()],
    lineCounts: [1, 0], players: [{ id: p.id, metrics }],
    incidents: substitute ? [{ kind: 'sub', other: p.id }] : [],
  }, squads: [[p], []] } as unknown as MatchPlayback;
}

describe('persisted player records on isolated settled inputs', () => {
  it('combines all competitions, keeps both clubs of a winter move, and never invents untracked lines', () => {
    const w = fixture(), p = w.players[1]!;
    settleNpcSeason(w, playback(w, p), true);
    settleNpcSeason(w, playback(w, p, 'foreign', 'cup'), true);
    settleNpcSeason(w, playback(w, p, 'own'), true);
    closePlayerLines(w);
    expect(w.playerRecords![p.id]!.lines).toEqual([
      { year: w.year, club: 'foreign', appearances: 2, goals: 2, assists: 4 },
      { year: w.year, club: 'own', appearances: 1, goals: 1, assists: 2 },
    ]);
    closePlayerLines(w);
    expect(w.playerRecords![p.id]!.lines).toHaveLength(2);
    w.year++;
    closePlayerLines(w);
    expect(w.playerRecords![p.id]!.lines).toHaveLength(2);
    delete w.npcSeason;
    closePlayerLines(w);
    expect(w.playerRecords![p.id]!.lines).toHaveLength(2);
  });

  it.each([true, false])('counts starting keeper clean sheets (resultsOnly=%s), including a conceded match and a substitute', (resultsOnly) => {
    const w = fixture(), p = w.players[0]!;
    const settle = (match: MatchPlayback) => {
      if (!resultsOnly) {
        match.record.model = MATCH_MODEL_REVISION;
        match.record.detail = [emptyTeamDetail(), emptyTeamDetail()];
        match.record.xg = [0, 0];
      }
      settleNpcSeason(w, match, resultsOnly);
    };
    p.position = 'GK';
    settle(playback(w, p));
    settle(playback(w, p, 'foreign', 'league', 1));
    settle(playback(w, p, 'foreign', 'cup', 0, true));
    closePlayerLines(w);
    expect(w.playerRecords![p.id]!.lines).toEqual([
      { year: w.year, club: 'foreign', appearances: 3, goals: 3, assists: 6, saves: 12, cleanSheets: 1 },
    ]);
    // A supported pre-tracking contribution stays unavailable, even after a newly tracked match.
    delete w.npcSeason!.competitions[0]!.players[0]!.clubs[0]!.cleanSheets;
    settle(playback(w, p));
    closePlayerLines(w);
    expect(w.playerRecords![p.id]!.lines![0]).not.toHaveProperty('cleanSheets');
  });

  it('links participants and retained incident names, excluding unused bench players', () => {
    const w = fixture();
    const metrics = zeroMetrics();
    metrics[M.minutes] = 1;
    linkOwnMatchPlayers(w, { players: [{ id: 'opponent', metrics }, { id: 'bench', metrics: zeroMetrics() }],
      incidents: [{ player: 'other-opponent', other: 'substitute' }],
    } as unknown as MatchRecord);
    for (const id of ['opponent', 'other-opponent', 'substitute']) expect(w.playerRecords![id]!.linked).toBe(true);
    expect(w.playerRecords!.bench).toBeUndefined();
    recordTransfer(w, { direction: 'in', loan: false, player: { id: 'signed', name: 'Synthetic' }, fee: '1' });
    expect(w.playerRecords!.signed!.linked).toBe(true);
  });

  it('sets a news identity link only when the writer keeps the headline, with pure reads unchanged', () => {
    const w = fixture(), p = w.players[1]!;
    const match = playback(w, p, 'own').record;
    match.id = 'synthetic-news-match';
    match.round = 1;
    match.highlights = [];
    match.tactics = ['balanced', 'balanced'];
    match.players[0]!.metrics[M.goals] = 3;
    match.score = { home: 3, away: 0 };
    w.ownMatches = [match];
    const candidates = deriveClubNews(w);
    expect(candidates.some((item) => item.players?.includes(p.id))).toBe(true);
    expect(w.playerRecords).toBeUndefined();
    initializeNewsJournal(w);
    expect(w.playerRecords![p.id]!.linked).toBe(true);
  });

  it('keeps only linked NPC retirees, snapshots before annual ageing, and never writes news for a removed id', () => {
    const w = fixture();
    const [kept, removed] = w.players.map((p, i) => ({ ...structuredClone(p), id: `npc:${i}`, born: 1910, retiring: w.year }));
    w.squads!.foreign = [kept!, removed!];
    playerRecord(w, removed!.id).lines = [{ year: w.year - 1, club: 'foreign', appearances: 1, goals: 1, assists: 0 }];
    playerRecord(w, 'already-gone');
    linkPlayer(w, kept!.id);
    initializeNewsJournal(w);
    const profile = structuredClone(kept);
    closeNpcSummer(w, undefined, false);
    expect(w.playerRecords![kept!.id]!.retired).toEqual({ year: w.year, club: 'foreign', profile });
    expect(w.playerRecords![removed!.id]).toBeUndefined();
    expect(w.playerRecords!['already-gone']).toBeUndefined();
    const items = Object.values(w.newsJournal!.seasons).flat();
    expect(items.filter((item) => item.players?.includes(kept!.id))).toHaveLength(1);
    expect(items.some((item) => item.players?.includes(removed!.id))).toBe(false);
    recordRetirementNews(w, removed!, 'foreign');
    expect(w.playerRecords![removed!.id]).toBeUndefined();
    expect(Object.values(w.newsJournal!.seasons).flat()).toEqual(items);
    settleAbsentPlayerRecords(w);
    expect(w.playerRecords![kept!.id]!.retired!.profile).toEqual(profile);
  });

  it('preserves own career rows and a free agent profile without fabricating a last club', () => {
    const w = fixture(), own = w.players[0]!;
    own.career[M.goals] = 7;
    expect(retirePlayerRecord(w, own, w.playerClub)).toBe(true);
    expect(own.career[M.goals]).toBe(7);
    const free = { ...structuredClone(own), id: 'free', freeSince: w.year };
    linkPlayer(w, free.id);
    expect(retirePlayerRecord(w, free)).toBe(true);
    expect(w.playerRecords!.free!.retired).not.toHaveProperty('club');
    expect(w.playerRecords!.free!.retired!.profile).not.toHaveProperty('freeSince');
  });
});
