import { describe, expect, it } from 'vitest';
import { createWorld, operate } from '../../../../packages/engine/src/index';
import { BUILD_PRESETS } from '../../../../packages/engine/src/build';
import { financeProjection } from '../../../../packages/engine/src/projection';
import { policyOf } from '../../../../packages/engine/src/policy';
import {
  areaSummary,
  dialPreview,
  draftChanges,
  draftCommands,
  draftFromRequest,
  draftWorld,
  withCard,
  withPolicy,
  withStrategy,
  withTicket,
  withDirection,
} from './board';
import { DIRECTION_AREAS, type AreaKey } from './areas';

const world = () =>
  createWorld({ country: 'ENG', name: 'Board', color: '#24664f', seed: 'board', difficulty: 2 });
/** The board sends only operations commands. */
const send = (w: ReturnType<typeof world>, command: unknown) =>
  operate(w, command as Parameters<typeof operate>[1]);
const localPride = BUILD_PRESETS.find((preset) => preset.id === 'local-pride')!;

describe('operating board draft', () => {
  it('a draft of cards and dials sends the build first, then each changed dial, then the ticket', () => {
    const w = world();
    let draft = withTicket(w, {}, 0.12);
    draft = withPolicy(w, draft, 'marketing', 3);
    draft = withStrategy(w, draft, localPride.build, localPride.label);
    draft = withPolicy(w, draft, 'support', 4);
    // A dial set back to its level in force drops out of the draft.
    draft = withPolicy(w, draft, 'recruitment', 5);
    draft = withPolicy(w, draft, 'recruitment', policyOf(w).recruitment);
    expect(draftChanges(w, draft).map((change) => change.kind)).toEqual([
      ...Array(6).fill('card'),
      'policy',
      'policy',
      'ticket',
    ]);
    const commands = draftCommands(w, draft);
    expect(commands).toEqual([
      { type: 'build', build: localPride.build, name: '동네의 자부심' },
      { type: 'policy', key: 'support', level: 4 },
      { type: 'policy', key: 'marketing', level: 3 },
      { type: 'ticket', price: 0.12 },
    ]);
    // Sent in order they leave the world as the draft showed it, and the draft is spent.
    const shown = draftWorld(w, draft);
    for (const command of commands) send(w, command);
    expect(w.build).toEqual(shown.build);
    expect(policyOf(w)).toEqual(policyOf(shown));
    expect(w.ticket).toBe(0.12);
    expect(draftChanges(w, draft)).toEqual([]);
    expect(draftCommands(w, draft)).toEqual([]);
    // A card tapped on its own makes the owner's mix, which carries no preset name.
    const mix = withCard(w, {}, 'youth', 'pathway');
    expect(draftCommands(w, mix)).toEqual([
      { type: 'build', build: { ...localPride.build, youth: 'pathway' } },
    ]);
    expect(withCard(w, mix, 'youth', 'homegrown')).toEqual({});
  });

  it('a card changed just now changes again at once: there are no locks (→ECON-22)', () => {
    const w = world();
    operate(w, { type: 'build', build: { youth: 'homegrown' } });
    const preset = withStrategy(w, {}, BUILD_PRESETS.find((p) => p.id === 'trading')!.build);
    for (const command of draftCommands(w, preset)) send(w, command);
    expect(w.build).toEqual(BUILD_PRESETS.find((p) => p.id === 'trading')!.build);
    for (const command of draftCommands(w, withCard(w, {}, 'youth', undefined))) send(w, command);
    expect(w.build?.youth).toBeUndefined();
  });

  it('a remedy request becomes a one-dial draft', () => {
    const w = world();
    const draft = draftFromRequest(w, { policy: { key: 'support', level: 2 } });
    expect(draft).toEqual({ policy: { support: 2 } });
    expect(draftChanges(w, draft)).toEqual([{ kind: 'policy', key: 'support', from: 3, to: 2 }]);
    expect(draftCommands(w, draft)).toEqual([{ type: 'policy', key: 'support', level: 2 }]);
    // Less squad investment costs less each round and leaves more cash at season end.
    const preview = dialPreview(w, { kind: 'policy', key: 'support', from: 3, to: 2 });
    expect(BigInt(preview.perRound)).toBeLessThan(0n);
    expect(BigInt(preview.annual)).toBeLessThan(0n);
    expect(BigInt(preview.seasonEnd.low)).toBeGreaterThan(
      BigInt(financeProjection(w).seasonEnd.low),
    );
    expect(draftFromRequest(w, { ticket: 0.035 })).toEqual({ ticket: 0.035 });
    const ticket = dialPreview(w, { kind: 'ticket', from: w.ticket, to: 0.035 });
    expect(ticket.gate!.attendanceHigh).toBeGreaterThan(ticket.gateNow!.attendanceHigh);
    // A level already in force drafts nothing.
    expect(draftFromRequest(w, { policy: { key: 'support', level: 3 } })).toEqual({});
    expect(draftCommands(w, draftFromRequest(w, { ticket: w.ticket }))).toEqual([]);
  });
});

describe('direction areas', () => {
  it('area summary names the options in force', () => {
    const w = world();
    const area = (key: AreaKey) => DIRECTION_AREAS.find((item) => item.key === key)!;
    expect(areaSummary(w, area('youth'))).toBe('표준 · 표준 · 표준 · 기본 운영');
    expect(areaSummary(w, area('market'))).toBe('표준');
    // The staff area has no card: its rows only.
    expect(areaSummary(w, area('staff'))).toBe('상관없음 · 표준 · 표준');
    send(w, { type: 'build', build: { scouting: 'data' } });
    send(w, { type: 'policy', key: 'recruitment', level: 2 });
    expect(areaSummary(w, area('scouting'))).toBe('데이터 스카우팅 · 젊은 선수 위주');
    expect(areaSummary(w, area('fans'))).toBe('표준 · 보통');
    w.ticket = 0.06;
    expect(areaSummary(w, area('fans'))).toBe('표준 · 사용자 지정');
    send(w, { type: 'direction', key: 'finance', option: 'careful' });
    send(w, { type: 'direction', key: 'renewal', option: 'frugal' });
    expect(areaSummary(w, area('finance'))).toBe('표준 · 입소문 · 신중');
    expect(areaSummary(w, area('squad'))).toBe('표준 · 표준 · 짠물');
  });

  it('drafts a direction row like a dial and sends it last', () => {
    const w = world();
    let d = withDirection(w, {}, 'finance', 'stable');
    d = withPolicy(w, d, 'marketing', 2);
    expect(draftChanges(w, d)).toEqual([
      { kind: 'policy', key: 'marketing', from: 1, to: 2 },
      { kind: 'direction', key: 'finance', from: 'standard', to: 'stable' },
    ]);
    expect(draftCommands(w, d)).toEqual([
      { type: 'policy', key: 'marketing', level: 2 },
      { type: 'direction', key: 'finance', option: 'stable' },
    ]);
    expect(draftWorld(w, d).direction).toEqual({ finance: 'stable' });
    // The option in force takes the row out of the draft.
    expect(withDirection(w, d, 'finance', 'standard')).toEqual({ policy: { marketing: 2 } });
    for (const command of draftCommands(w, d)) send(w, command);
    expect(w.direction).toEqual({ finance: 'stable' });
  });
});
