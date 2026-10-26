import { describe, expect, it } from 'vitest';
import { createWorld } from '../../../../packages/engine/src/index';
import { RESPONSIBILITY_KEYS } from '../../../../packages/engine/src/responsibilities';
import { sponsorSlots } from '../../../../packages/engine/src/sponsors';
import { delegationCounts, officeFacts } from './officeSummary';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Office Club',
    color: '#24664f',
    seed: 'office-lobby',
    level: 'easy' as const,
  });

describe('office lobby facts (→WEB-39)', () => {
  it('names the direction, the ground, money, sponsors and who decides', () => {
    const w = world();
    const facts = officeFacts(w, sponsorSlots(w), []);
    expect(facts.strategy).toBe('기본 방향');
    expect(facts.build).toBe('동네 구장 · 2,500석');
    expect(facts.finance).toMatch(
      /^£[\d,.KMB]+ · 자금 여력 약 \d+(주|개월)$|^.+ · 자금 여력 1년 이상$/,
    );
    // A 1950 English club has only the local slot open, unsigned.
    expect(facts.sponsor).toBe('후원 0/1자리');
    const counts = delegationCounts(w);
    expect(facts.office).toBe(`보고받기 ${counts.direct} · 위임 ${counts.delegated}`);
  });

  it('reports works under way instead of the ground', () => {
    const w = world();
    w.facilityWorks = { stadium: { to: 1, year: 1950, day: 180 } };
    expect(officeFacts(w, sponsorSlots(w), []).build).toBe('공사 중 1건');
    w.facilityWorks.training = { to: 1, year: 1950, day: 90 };
    expect(officeFacts(w, sponsorSlots(w), []).build).toBe('공사 중 2건');
  });

  it('counts the nine report rows the way 결재 라인 shows them', () => {
    const w = world();
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'direct';
    w.settings!.observations = { matchEve: true, windowOpen: true };
    expect(delegationCounts(w)).toEqual({ delegated: 0, direct: 9, total: 9 });
    w.settings!.responsibilities.sponsors = 'delegated';
    w.settings!.observations.windowOpen = false;
    expect(delegationCounts(w)).toEqual({ delegated: 2, direct: 7, total: 9 });
  });

  it('counts signed sponsor slots among the open ones', () => {
    const w = world();
    const slots = sponsorSlots(w).map((slot) => ({ ...slot, open: true }));
    const signed = slots.map((slot, i) =>
      i === 0 ? { ...slot, contract: { slot: slot.slot } as never } : slot,
    );
    expect(officeFacts(w, signed, []).sponsor).toBe(`후원 1/${slots.length}자리`);
  });
});
