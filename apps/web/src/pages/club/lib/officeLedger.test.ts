import { describe, expect, it } from 'vitest';
import type { World } from '../../../../../../packages/contracts/src/types';
import { careerWorld } from '../../../../../../packages/engine/src/career.testkit';
import { effectLedger, type EffectId } from '../../../../../../packages/engine/src/effect-ledger';
import { cachedWorld } from '../../../../../../tests/fixtures/cached-world';
import { areaRows, effectDestination, effectValueText, type AreaRow } from './officeLedger';

/** A club whose U21 growth comes from coaches, the manager, the culture card and 빠른 데뷔. */
function world(): World {
  const w = cachedWorld('office-ledger', () => careerWorld({ seed: 'office-ledger' }));
  w.build = { culture: 'meritocracy', market: 'selling' };
  w.direction = { ...w.direction, debut: 'early' };
  w.manager.style = 'developer';
  w.staff = w.staff!.map((member) =>
    member.role === 'assistant' ? { ...member, trait: 'developer' as const } : member,
  );
  return w;
}
const share = (rows: AreaRow[], id: EffectId) =>
  rows.find((row) => row.kind === 'share' && row.effect.id === id) as
    Extract<AreaRow, { kind: 'share' }> | undefined;

describe('the office ledger read (→WEB-116)', () => {
  it("sums an area's own controls only, the office keeping the whole value", () => {
    const { effects } = effectLedger(world());
    const whole = effects.find((effect) => effect.id === 'youthGrowth')!;
    // Coaches ×1.3, the developer manager ×1.3, 철저한 경쟁 ×1.1 and 빠른 데뷔 ×1.2.
    expect(whole.value).toBeCloseTo(1.3 * 1.3 * 1.1 * 1.2, 9);
    const firstTeam = areaRows(effects, 'firstTeam');
    // The 1군 card reads the culture card it holds, not the coaches, the manager or the debut.
    expect(share(firstTeam, 'youthGrowth')!.value).toBeCloseTo(1.1, 9);
    expect(share(firstTeam, 'youthGrowth')!.whole).toBe(false);
    expect(share(areaRows(effects, 'coaches'), 'youthGrowth')!.value).toBeCloseTo(1.3, 9);
    // Its dials' main values stay listed even while they change nothing.
    for (const id of ['growth', 'recovery', 'goodwill', 'morale'] as const)
      expect(share(firstTeam, id), id).toBeDefined();
  });

  it('reads a value an area sets whole as the office does', () => {
    const { effects } = effectLedger(world());
    // 지역 기반's target comes from 지역 투자 alone, so 지역 사회 reads it whole.
    const base = share(areaRows(effects, 'community'), 'localBase')!;
    expect(base.whole).toBe(true);
    expect(effectValueText(base.effect, base.value)).toBe(effectValueText(base.effect));
  });

  it('sends each factor to the control that sets it, and reads facts in place', () => {
    expect(effectDestination({ kind: 'policy', key: 'support' })).toEqual({
      kind: 'investment',
      area: 'firstTeam',
      control: 'policy:support',
    });
    expect(effectDestination({ kind: 'policy', key: 'recruitment' })).toEqual({
      kind: 'investment',
      area: 'scouting',
      control: 'policy:recruitment',
    });
    expect(effectDestination({ kind: 'build', slot: 'culture' })).toEqual({
      kind: 'investment',
      area: 'firstTeam',
      control: 'build:culture',
    });
    expect(effectDestination({ kind: 'build', slot: 'market' })).toEqual({
      kind: 'investment',
      area: 'firstTeam',
      control: 'build:market',
    });
    expect(effectDestination({ kind: 'direction', key: 'debut' })).toEqual({
      kind: 'investment',
      area: 'youth',
      control: 'direction:debut',
    });
    expect(effectDestination({ kind: 'facility', part: 'training' })).toEqual({
      kind: 'investment',
      area: 'firstTeam',
      control: 'investment-facility-training',
    });
    expect(effectDestination({ kind: 'staff', role: 'assistant' })).toEqual({
      kind: 'investment',
      area: 'coaches',
    });
    expect(effectDestination({ kind: 'manager', term: 'style' })).toEqual({
      kind: 'decision',
      key: 'manager',
    });
    for (const source of [
      { kind: 'synergy', id: 'pipeline' },
      { kind: 'owner', trait: 'talisman' },
      { kind: 'fact', term: 'form' },
    ] as const)
      expect(effectDestination(source)).toBeUndefined();
  });
});
