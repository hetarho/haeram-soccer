import { describe, it, expect } from 'vitest';
import { createWorld, transferOffers, transferWindowDays } from './index';
import { detectMediations, delegatedMediations } from './mediation';
import { pendingDecisions } from './stopping';
import { pendingWorkPreview } from './pending-work';
import { lineOf } from './player';
import { canonical, validateWorld } from '../../contracts/src/index';
function fixture() {
  const w = createWorld({
    country: 'ENG',
    name: 'Actual Mediation',
    color: '#224466',
    seed: 'mediation',
    level: 'normal',
  });
  const offers = transferOffers(w),
    offer = offers.find((o) => o.available && lineOf(o.player.position) === 'MF')!;
  w.shortlist = {
    year: w.year,
    day: 0,
    entries: [{ playerId: offer.player.id, line: 'MF' }],
    requests: [{ kind: 'short', line: 'MF', pick: offer.player.id }],
  };
  w.cash = '0';
  w.settings!.responsibilities.recruitment = 'direct';
  return { w, offer };
}
describe('actual financial recruitment mediation', () => {
  it('records actual participants/reasons and deduplicates refreshed requests, menus and reload', () => {
    const { w, offer } = fixture();
    expect(detectMediations(w)).toHaveLength(1);
    const record = structuredClone(w.mediations![0]);
    expect(record).toMatchObject({
      manager: { id: w.manager.id, name: w.manager.name },
      director: { id: w.staff!.find((s) => s.role === 'director')!.id },
      target: { line: 'MF' },
      candidate: { id: offer.player.id },
      status: 'pending',
    });
    expect(record.directorReason).toContain('재정 기조');
    w.shortlist!.requests = [{ kind: 'short', line: 'MF' }];
    w.shortlist!.day = 1;
    w.calendar = { day: 1 };
    for (let i = 0; i < 3; i++) detectMediations(w);
    w.inbox = [];
    const restored = validateWorld(JSON.parse(canonical(w)));
    detectMediations(restored);
    expect(restored.mediations).toEqual([record]);
  });
  it('does not invent conflict without candidates, on a closed market, after an arrival, or after failed/owner-refused talks alone', () => {
    for (const mode of ['none', 'closed', 'met', 'refused', 'affordable'] as const) {
      const { w, offer } = fixture();
      if (mode === 'none') w.shortlist!.requests = [];
      if (mode === 'closed') w.calendar = { day: transferWindowDays(w.year).summerClose + 1 };
      if (mode === 'met')
        w.recruitmentArrivals = [
          {
            player: offer.player.id,
            name: offer.player.name,
            position: offer.player.position,
            positions: offer.player.positions,
            at: { year: w.year, day: 0 },
          },
        ];
      if (mode === 'refused') {
        const offers = transferOffers(w);
        w.bids = offers
          .filter((o) => o.available && lineOf(o.player.position) === 'MF')
          .map((o, i) => ({
            id: `failed:${i}`,
            direction: 'out',
            playerId: o.player.id,
            fee: o.fee,
            year: w.year,
            day: 0,
            due: 1,
            status: 'rejected',
          }));
      }
      if (mode === 'affordable') {
        w.cash = '999999999999';
        w.income = '999999999999';
        w.round = 23;
      }
      expect(detectMediations(w), mode).toHaveLength(0);
    }
  });
  it('deduplicates by target, not pick, while allowing independent targets and a changed manager', () => {
    const { w } = fixture();
    w.shortlist!.requests.push({ kind: 'short', line: 'FW' });
    expect(detectMediations(w)).toHaveLength(2);
    w.shortlist!.requests.reverse();
    expect(detectMediations(w)).toHaveLength(0);
    w.manager = { ...w.manager, id: 'coach:replacement', name: 'Actual Successor' };
    expect(detectMediations(w)).toHaveLength(2);
  });
  it('keeps owner decisions live in both modes and exposes delegated work to the resolver seam/handover preview', () => {
    const { w } = fixture();
    detectMediations(w);
    for (const mode of ['automatic', 'manual'] as const) {
      w.settings!.mode = mode;
      expect(pendingDecisions(w).filter((p) => p.ref === w.mediations![0].id)).toHaveLength(1);
    }
    const settings = structuredClone(w.settings!);
    settings.responsibilities.recruitment = 'delegated';
    expect(pendingWorkPreview(w, settings).find((p) => p.key === 'recruitment')!.refs).toContain(
      w.mediations![0].id,
    );
    w.settings = settings;
    expect(pendingDecisions(w).some((p) => p.ref === w.mediations![0].id)).toBe(false);
    expect(delegatedMediations(w)).toHaveLength(1);
  });
  it('rejects invalid record targets, unknown participant snapshots and impossible dates', () => {
    const { w } = fixture();
    detectMediations(w);
    for (const mutate of [
      (m: NonNullable<typeof w.mediations>[number]) => {
        m.director.name = '';
      },
      (m: NonNullable<typeof w.mediations>[number]) => {
        m.target.kind = 'upgrade';
      },
      (m: NonNullable<typeof w.mediations>[number]) => {
        m.created.year = w.year + 1;
      },
    ]) {
      const copy = structuredClone(w);
      mutate(copy.mediations![0]);
      expect(() => validateWorld(copy)).toThrow();
    }
  });
});
