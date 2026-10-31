import { describe, expect, it, vi } from 'vitest';
import { canonical } from '../../contracts/src/index';
import * as finance from './finance';
import { LINE_MINIMUM } from './player';
import { activePlayers, clubOf, formationOf, lineOfPlayer, slotOvr } from './player-state';
import { recruitmentFit, type TransferOffer } from './recruitment';
import { scoutVerdict, VERDICT_CONFIG } from './scout-verdict';
import { shortLines } from './signings';
import { createWorld } from './index';
import { squad, startingSquad } from './world';
import { transferOffers } from './ops-squad';
import { worldMarketDetail } from './world-market';
import { worldMarketFixture } from './world-market.testkit';

function world() {
  const w = createWorld({
    country: 'ENG',
    name: 'Verdict United',
    color: '#224433',
    seed: 'scout-verdict',
    level: 'easy' as const,
  });
  w.cash = '999999999999';
  return w;
}
/** A fee-bearing candidate aged 26 with no growth room: no prospect, no decline, no free agent. */
function candidate(w: ReturnType<typeof world>): TransferOffer {
  const offer = structuredClone(
    transferOffers(w).find((o) => o.available && !o.freeAgent && !o.player.loanUntil)!,
  );
  offer.player.born = w.year - 26;
  offer.player.potential = 30;
  return offer;
}
/** His real fit with the slot values set, so the gap is `value − starter`. */
function fitAt(
  w: ReturnType<typeof world>,
  offer: TransferOffer,
  value: number,
  starter: number,
  slot: Partial<ReturnType<typeof recruitmentFit>['slot']> = {},
) {
  const fit = recruitmentFit(w, offer);
  return {
    ...fit,
    fitDelta: 0,
    slot: {
      ...fit.slot,
      arrival: value,
      settled: value,
      value,
      starter: { ...fit.slot.starter, value: starter },
      ...slot,
    },
  };
}

describe("the scout's verdict (→CLUB-47)", () => {
  it('grades by the first row that holds on the slot gap', () => {
    const w = world(),
      offer = candidate(w);
    expect(shortLines(w)).toEqual([]);
    const cases: [number, string][] = [
      [12, 'A'],
      [10, 'A'],
      [9, 'B'],
      [5, 'B'],
      [4, 'C'],
      [2, 'C'],
      [1, 'D'],
      [-4, 'D'],
      [-5, 'E'],
      [-9, 'E'],
    ];
    for (const [gap, grade] of cases) {
      const verdict = scoutVerdict(w, offer, fitAt(w, offer, 60 + gap, 60))!;
      expect([gap, verdict.grade]).toEqual([gap, grade]);
      expect(verdict.gap).toBe(gap);
    }
    expect(VERDICT_CONFIG).toMatchObject({ starter: 10, upgrade: 5, compete: 2, backup: -5 });
  });

  it('gives C to a short line or a prospect at his main position whatever the gap', () => {
    const w = world(),
      offer = candidate(w),
      line = lineOfPlayer(offer.player);
    // A prospect: 23 or under, at his main position, potential 5 above the starter there.
    const young = structuredClone(offer);
    young.player.born = w.year - 23;
    young.player.potential = 65;
    const main = { position: young.player.position };
    expect(scoutVerdict(w, young, fitAt(w, young, 50, 60, main))!.grade).toBe('C');
    young.player.potential = 64;
    expect(scoutVerdict(w, young, fitAt(w, young, 50, 60, main))!.grade).toBe('E');
    young.player.potential = 65;
    young.player.born = w.year - 24;
    expect(scoutVerdict(w, young, fitAt(w, young, 50, 60, main))!.grade).toBe('E');
    // A short line: his line below its minimum.
    const same = activePlayers(w).filter((p) => lineOfPlayer(p) === line);
    for (const p of same.slice(0, same.length - LINE_MINIMUM[line] + 1)) p.status = 'sold';
    expect(shortLines(w).map((need) => need.line)).toContain(line);
    const verdict = scoutVerdict(w, offer, fitAt(w, offer, 50, 60))!;
    expect(verdict.grade).toBe('C');
    expect(verdict.pros[0]).toMatch(/^부족한 .+ 채움$/);
  });

  it('names at most two facts for and two against, in their order', () => {
    const w = world(),
      offer = candidate(w),
      line = lineOfPlayer(offer.player);
    w.shortlist = {
      year: w.year,
      day: 0,
      entries: [{ playerId: offer.player.id, line }],
      requests: [{ line, kind: 'short', pick: offer.player.id }],
    };
    const asked = scoutVerdict(w, offer, fitAt(w, offer, 66, 60))!;
    expect(asked.pros).toEqual(['감독이 고른 선수', expect.stringMatching(/^감독 요청 충족 · /)]);
    delete w.shortlist;
    // A new career has no revenue yet, so 재정 기조's wage share fails every signing; give it some.
    const revenue = vi.spyOn(finance, 'recentRevenue').mockReturnValue('999999999999');
    // The gap is the verdict's own line, never a reason.
    const plain = scoutVerdict(w, offer, { ...fitAt(w, offer, 66, 60), fitDelta: 3 })!;
    expect(plain).toMatchObject({ gap: 6, slot: { value: 66 }, starter: { value: 60 } });
    expect(plain.pros).toEqual(['전술 적합도 +3']);
    expect(plain.cons).toEqual([]);
    revenue.mockRestore();

    const old = structuredClone(offer);
    old.player.born = w.year - VERDICT_CONFIG.declineAge;
    w.cash = '0';
    const against = scoutVerdict(w, old, fitAt(w, old, 58, 60, { arrival: 55 }))!;
    expect(against.cons).toEqual([
      '적응 전 55 · 적응 후 58',
      `${VERDICT_CONFIG.declineAge}세 · 속도·체력이 해마다 떨어지는 나이`,
    ]);
    const settled = scoutVerdict(w, old, fitAt(w, old, 61, 60))!;
    expect(settled.cons[0]).toBe(
      `${VERDICT_CONFIG.declineAge}세 · 속도·체력이 해마다 떨어지는 나이`,
    );
    expect(settled.cons[1]).toMatch(/재정 기조/);

    const prospect = structuredClone(offer);
    prospect.player.born = w.year - 21;
    prospect.player.potential = 80;
    prospect.freeAgent = true;
    w.cash = '999999999999';
    const growing = scoutVerdict(w, prospect, fitAt(w, prospect, 50, 60))!;
    expect(growing.pros[0]).toMatch(/^성장 여지 \+\d+ · 21세$/);
    expect(growing.pros[1]).toBe('자유계약 · 이적료 없음');
  });

  it('gives our own players none and changes nothing in the world', () => {
    const w = world(),
      offer = candidate(w);
    w.cash = '0';
    const before = canonical(w);
    scoutVerdict(w, offer, recruitmentFit(w, offer));
    expect(canonical(w)).toBe(before);
    expect(scoutVerdict(w, { ...offer, own: true }, recruitmentFit(w, offer))).toBe(undefined);
  });

  it("measures the gap at CLUB-14's slot as a request does, adaptation left out", () => {
    const w = worldMarketFixture(),
      target = {
        world: w.id,
        kind: 'club' as const,
        clubId: 'foreign',
        playerId: squad(w, w.clubs[1])[0].id,
      };
    const detail = worldMarketDetail(w, target),
      { slot } = detail.buy,
      place = formationOf(w.tactic)[slot.index]!,
      starter = startingSquad(w, clubOf(w))[slot.index]!;
    expect(slot.starter).toEqual({
      id: starter.id,
      name: starter.name,
      value: Math.round(slotOvr(starter, place)),
    });
    expect(slot.value).toBe(Math.round(slotOvr(detail.offer.player, place)));
    expect(detail.verdict).toMatchObject({
      gap: slot.value - slot.starter.value,
      slot: { position: slot.position, role: slot.role, value: slot.value },
    });
  });
});
