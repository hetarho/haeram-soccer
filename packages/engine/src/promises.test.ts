import { describe, it, expect } from 'vitest';
import {
  createWorld,
  transferOffers,
  operate,
  managerCandidates,
  yearlyStaff,
  transferWindowDays,
  judgeRequests,
  noteSigning,
} from './index';
import { detectMediations, resolveMediation, promiseForMediation } from './mediation';
import { judgePromises, cancelPromises } from './promises';
import { lineOf } from './player';
import { canonical, validateWorld } from '../../contracts/src/index';
function fixture(winter = false, line: 'MF' | 'GK' = 'MF') {
  const w = createWorld({
    country: 'ENG',
    name: 'Fixed Promise',
    color: '#224466',
    seed: 'promise',
    level: 'normal',
  });
  if (winter) {
    w.calendar = { day: transferWindowDays(w.year).winterOpen };
    w.round = Math.floor(w.calendar.day / 7);
    delete w.scorerSeason;
  }
  const offer = transferOffers(w).find((o) => o.available && lineOf(o.player.position) === line)!;
  w.shortlist = {
    year: w.year,
    day: w.calendar!.day,
    entries: [{ playerId: offer.player.id, line }],
    requests: [{ kind: 'short', line, pick: offer.player.id }],
  };
  w.cash = '0';
  w.settings!.responsibilities.recruitment = 'direct';
  detectMediations(w);
  resolveMediation(w, w.mediations![0].id, 'manager', 'delegated');
  return { w, offer, promise: w.promises![0] };
}
function afterDeadline(
  w: ReturnType<typeof createWorld>,
  promise: NonNullable<typeof w.promises>[number],
) {
  w.year = promise.deadline.year;
  w.calendar = { day: promise.deadline.day + 1 };
  w.round = Math.floor(w.calendar.day / 7);
}
describe('fixed-deadline reinforcement commitments', () => {
  it('retains summer-to-winter and winter-to-next-summer deadlines through repeated promise requests and reloads', () => {
    for (const winter of [false, true]) {
      const { w, promise } = fixture(winter);
      expect(promise.deadline).toEqual({
        year: w.year + (winter ? 1 : 0),
        day: winter
          ? transferWindowDays(w.year + 1).summerClose
          : transferWindowDays(w.year).winterClose,
      });
      const end = structuredClone(promise.deadline);
      w.calendar!.day++;
      w.round = Math.floor(w.calendar!.day / 7);
      const again = promiseForMediation(w, w.mediations![0]);
      expect(again.id).toBe(promise.id);
      expect(again.deadline).toEqual(end);
      expect(w.promises).toHaveLength(1);
      expect(validateWorld(JSON.parse(canonical(w))).promises![0].deadline).toEqual(end);
    }
  });
  it('waits through the deadline and counts permanent, loan and free arrivals through noteSigning, even when later sold', () => {
    for (const kind of ['permanent', 'loan', 'free'] as const) {
      const { w, promise } = fixture(false, kind === 'free' ? 'GK' : 'MF');
      w.calendar = { day: promise.deadline.day };
      w.cash = '999999999999';
      const offers = transferOffers(w);
      const index = offers.findIndex(
        (o) =>
          o.available &&
          lineOf(o.player.position) === promise.target.line &&
          (kind === 'free' ? o.freeAgent : !o.freeAgent),
      );
      expect(index).toBeGreaterThanOrEqual(0);
      const id = offers[index].player.id;
      operate(w, { type: 'recruit', candidate: index, ...(kind === 'loan' ? { loan: true } : {}) });
      const player = w.players.find((p) => p.id === id)!;
      player.status = 'sold';
      judgePromises(w);
      expect(promise.status).toBe('pending');
      afterDeadline(w, promise);
      judgePromises(w);
      expect(promise.status).toBe('fulfilled');
      expect(promise.arrival!.player).toBe(player.id);
      const before = canonical(w);
      judgePromises(w);
      expect(canonical(w)).toBe(before);
    }
  });
  it('excludes late, pre-promise, existing-squad, bid-only and academy-only facts while retaining original target after tactics change', () => {
    const { w, offer, promise } = fixture();
    w.tactic = 'possession';
    const prospect = {
      ...structuredClone(offer.player),
      id: 'academy-only-prospect',
      born: w.year - 18,
    };
    w.academy = { players: [prospect] };
    operate(w, { type: 'promote-youth', id: prospect.id });
    expect(w.recruitmentArrivals).toBeUndefined();
    w.bids = [
      {
        id: 'not-an-arrival',
        direction: 'out',
        playerId: offer.player.id,
        fee: offer.fee,
        year: w.year,
        day: 0,
        due: 1,
        status: 'pending',
      },
    ];
    w.recruitmentArrivals = [
      {
        player: offer.player.id,
        name: offer.player.name,
        position: offer.player.position,
        positions: offer.player.positions,
        at: { year: promise.deadline.year, day: promise.deadline.day + 1 },
      },
    ];
    const trust = w.manager.trust,
      morale = w.morale;
    afterDeadline(w, promise);
    judgePromises(w);
    expect(promise.status).toBe('unfulfilled');
    expect(promise.reason).toContain('중재');
    expect(w.manager.trust).toBe(trust);
    expect(w.morale).toBe(morale);
  });
  it('does not count a recorded arrival before the promise interval', () => {
    const { w, offer, promise } = fixture(true);
    w.recruitmentArrivals = [
      {
        player: offer.player.id,
        name: offer.player.name,
        position: offer.player.position,
        positions: offer.player.positions,
        at: { year: w.year, day: 0 },
      },
    ];
    afterDeadline(w, promise);
    judgePromises(w);
    expect(promise.status).toBe('unfulfilled');
  });
  it('keeps an early suitable alternative and ignores a later role/tactic change', () => {
    const { w, promise } = fixture();
    promise.target = { kind: 'upgrade', line: 'MF', slot: 5, position: 'CM' };
    w.mediations![0].target = { ...promise.target };
    const candidate = transferOffers(w).find((o) => (o.player.positions.CM ?? 0) >= 2)!;
    const other = {
      ...structuredClone(candidate.player),
      id: 'alternative-arrival',
      name: 'Alternative Arrival',
    };
    w.players.push(other);
    noteSigning(w, other);
    w.tactic = 'counter';
    afterDeadline(w, promise);
    judgePromises(w);
    expect(promise.status).toBe('fulfilled');
    expect(promise.arrival!.player).toBe(other.id);
  });
  it('orders same-date commitments by code-unit player ID', () => {
    const { w, offer, promise } = fixture();
    // localeCompare puts ':2:' before ':20:'; code units put '0' (0x30) before ':' (0x3a).
    w.recruitmentArrivals = ['ENG:1:0:2:p:3:1990', 'ENG:1:0:20:p:1:1990'].map((player) => ({
      player,
      name: player,
      position: offer.player.position,
      positions: offer.player.positions,
      at: { ...promise.created },
    }));
    afterDeadline(w, promise);
    judgePromises(w);
    expect(promise.status).toBe('fulfilled');
    expect(promise.arrival!.player).toBe('ENG:1:0:20:p:1:1990');
  });
  it('cancels on replacement, expiry/retirement or explicit departure, while director changes retain the commitment', () => {
    const replacement = fixture();
    replacement.w.cash = '999999999999';
    const pick = managerCandidates(replacement.w).find((m) => !m.person)!;
    operate(replacement.w, { type: 'hire', id: pick.id });
    expect(replacement.w.promises![0].status).toBe('cancelled');
    const expiry = fixture();
    expiry.w.manager.until = expiry.w.year;
    yearlyStaff(expiry.w);
    expect(expiry.w.promises![0].status).toBe('cancelled');
    const retirement = fixture();
    retirement.w.manager.born = retirement.w.year - 70;
    yearlyStaff(retirement.w);
    expect(retirement.w.promises![0].status).toBe('cancelled');
    const { w, promise } = fixture();
    operate(w, { type: 'release-staff', role: 'director' });
    judgePromises(w);
    expect(promise.status).toBe('pending');
    cancelPromises(w, w.manager.id, '실제 퇴임');
    expect(promise.status).toBe('cancelled');
    expect(promise.reason).toBe('실제 퇴임');
  });
  it('keeps the separate once-only window trust loss and never rewrites it after an early free arrival fulfils a promise', () => {
    const { w, offer, promise } = fixture();
    w.shortlist!.window = {
      year: w.year,
      opening: 0,
      manager: w.manager.id,
      requests: [{ line: 'MF', kind: 'short' }],
    };
    const trust = w.manager.trust;
    judgeRequests(w);
    expect(w.manager.trust).toBe(trust - 3);
    judgeRequests(w);
    expect(w.manager.trust).toBe(trust - 3);
    w.calendar = { day: transferWindowDays(w.year).summerClose + 1 };
    const p = structuredClone(offer.player);
    w.players.push(p);
    noteSigning(w, p);
    afterDeadline(w, promise);
    judgePromises(w);
    expect(promise.status).toBe('fulfilled');
    expect(w.manager.trust).toBe(trust - 3);
  });
});
