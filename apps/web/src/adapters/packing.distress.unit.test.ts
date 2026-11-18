import { describe, expect, it } from 'vitest';
import { clubBooksSchema } from '../../../../packages/contracts/src/schema';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import { emptyTable } from '../../../../packages/engine/src/league-fixtures';
import { pack, unpack } from './packing';

describe('optional distress facts in compact checkpoints', () => {
  it('preserves positive deductions/reasons, queued seasons and write-offs without extending old history tuples', () => {
    const w = worldMarketFixture();
    const deduction = { deducted: 10, deductionReason: 'administration' as const };
    w.tables[w.playerClub] = { ...emptyTable(), ...deduction };
    w.distress = {
      stage: 3,
      overHalfRounds: 8,
      deductionSeason: w.year,
      pendingDeduction: { season: w.year + 1, points: 10 },
    };
    const club = w.clubs[1]!;
    club.books = {
      seasons: [
        {
          year: w.year - 1,
          income: '5',
          wages: '10',
          costs: '2',
          result: '-7',
          debtWriteOff: '900719925474099312345',
        },
      ],
      cash: '0',
      debt: '50',
      debtWriteOff: '25',
      distress: { stage: 2, overHalfRounds: 8 },
    };
    w.history = [
      {
        year: w.year - 1,
        tier: 0,
        group: 0,
        rank: 1,
        points: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        cash: '0',
        currency: w.currency,
        income: '0',
        expense: '0',
        fans: 0,
        rating: 0,
        manager: w.manager.name,
        metrics: w.players[0]!.season,
        standings: [[0, 0, 0, 0, 0, 0]],
        champions: [],
        europe: [],
        ...deduction,
        leagueDeductions: { [w.playerClub]: deduction },
      },
    ];
    const roundTrip = () => unpack(JSON.parse(JSON.stringify(pack(w))));
    const restored = roundTrip();
    expect(restored.tables[w.playerClub]).toEqual(w.tables[w.playerClub]);
    expect(restored.distress).toEqual(w.distress);
    expect(restored.clubs[1]!.books).toEqual(club.books);
    expect(clubBooksSchema.parse(restored.clubs[1]!.books)).toEqual(club.books);
    expect(restored.history).toEqual(w.history);
    delete w.distress;
    w.tables[w.playerClub] = emptyTable();
    delete club.books.distress;
    delete club.books.debtWriteOff;
    delete club.books.seasons[0]!.debtWriteOff;
    delete w.history[0]!.deducted;
    delete w.history[0]!.deductionReason;
    delete w.history[0]!.leagueDeductions;
    const old = roundTrip();
    expect(old).not.toHaveProperty('distress');
    expect(old.tables[w.playerClub]).not.toHaveProperty('deducted');
    expect(old.clubs[1]!.books).not.toHaveProperty('debtWriteOff');
    expect(old.clubs[1]!.books!.seasons[0]).not.toHaveProperty('debtWriteOff');
    expect(old.history[0]).not.toHaveProperty('leagueDeductions');
    expect(old.history[0]!.standings).toEqual([[0, 0, 0, 0, 0, 0]]);
  });
});
