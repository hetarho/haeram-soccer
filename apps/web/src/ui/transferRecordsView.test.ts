import { describe, expect, it } from 'vitest';
import type { Club, Event, Player, TransferFact } from '../../../../packages/contracts/src/types';
import { inTodayMoney, transferLedger } from '../../../../packages/engine/src/transfer-records';
import { transferRecordsView, transferSeasons, type TransferWorld } from './transferRecordsView';

const YEAR = 1960;
const clubs = [
  { id: 'own', country: 'ENG' },
  { id: 'rival', country: 'ENG' },
] as Club[];
const fact = (name: string, fee: string, more: Partial<TransferFact> = {}): TransferFact => ({
  direction: 'in',
  loan: false,
  player: `p:${name}`,
  name,
  fee,
  currency: 'GBP-LSD',
  year: YEAR,
  day: 10,
  ...more,
});
const world = (facts: TransferFact[], events: Event[] = [], players: string[] = []) =>
  ({
    clubs,
    playerClub: 'own',
    year: YEAR,
    players: players.map((id) => ({ id }) as Player),
    events,
    transfers: { ledgerBefore: events.length, facts },
  }) satisfies TransferWorld;

describe('transfer records view (→WEB-54, HIST-20)', () => {
  it('ranks signings by today’s money', () => {
    const w = world(
      [
        fact('recent', '900000'),
        fact('earlier', '800000', { year: YEAR - 20, club: 'rival' }),
        fact('sold', '5000000', { direction: 'out' }),
      ],
      [],
      ['p:recent'],
    );
    const { rows } = transferRecordsView(w, [], { direction: 'in', shown: 10 });
    expect(BigInt(inTodayMoney(w, '800000', YEAR - 20))).toBeGreaterThan(900000n);
    expect(rows.map((r) => [r.rank, r.label])).toEqual([
      [1, 'earlier'],
      [2, 'recent'],
    ]);
    // The retained player opens his sheet; the known club its team sheet.
    expect(rows[0]).toMatchObject({ club: 'rival', fee: '800000', year: YEAR - 20 });
    expect(rows[0].player).toBeUndefined();
    expect(rows[1]).toMatchObject({ player: 'p:recent', today: '900000', fee: '900000' });
    expect(rows[1].club).toBeUndefined();
    expect(transferSeasons(w, [])).toEqual([YEAR, YEAR - 20]);
    expect(
      transferRecordsView(w, [], { direction: 'in', year: YEAR - 20, shown: 10 }).rows,
    ).toHaveLength(1);
  });

  it('labels loans', () => {
    const w = world([fact('loaned', '300', { loan: true }), fact('bought', '200')]);
    expect(
      transferRecordsView(w, [], { direction: 'in', shown: 10 }).rows.map((r) => r.kind),
    ).toEqual(['임대', '이적']);
  });

  it('shows ledger rows without links', () => {
    const events: Event[] = [
      {
        year: YEAR - 1,
        round: 3,
        kind: 'transfer-out',
        title: 'Old Hand의 새로운 도전',
        detail: '',
        amount: '4000',
      },
      { year: YEAR - 1, round: 4, kind: 'transfer-in', title: '자유계약', detail: '', amount: '0' },
    ];
    const w = { ...world([], events), transfers: undefined };
    const ledger = transferLedger(w);
    const { rows } = transferRecordsView(w, ledger, { direction: 'out', shown: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: 'Old Hand의 새로운 도전', year: YEAR - 1, fee: '4000' });
    expect(rows[0].player).toBeUndefined();
    expect(rows[0].club).toBeUndefined();
    expect(rows[0].kind).toBeUndefined();
    expect(transferRecordsView(w, ledger, { direction: 'in', shown: 10 }).rows).toEqual([]);
    expect(transferSeasons(w, ledger)).toEqual([YEAR - 1]);
  });

  it('paginates by ten up to 100', () => {
    const w = world(Array.from({ length: 120 }, (_, i) => fact(`n${i}`, String(1000 + i))));
    const first = transferRecordsView(w, [], { direction: 'in', shown: 10 });
    expect(first.rows).toHaveLength(10);
    expect(first.rows[0].label).toBe('n119');
    expect(first.next).toBe(20);
    expect(transferRecordsView(w, [], { direction: 'in', shown: 90 }).next).toBe(100);
    const last = transferRecordsView(w, [], { direction: 'in', shown: 100 });
    expect(last.rows).toHaveLength(100);
    expect(last.next).toBe(100);
    const short = world(Array.from({ length: 13 }, (_, i) => fact(`s${i}`, String(10 + i))));
    expect(transferRecordsView(short, [], { direction: 'in', shown: 10 }).next).toBe(13);
    expect(transferRecordsView(short, [], { direction: 'in', shown: 13 }).next).toBe(13);
  });
});
