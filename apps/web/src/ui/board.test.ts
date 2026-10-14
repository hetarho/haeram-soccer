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
  areaBase,
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
    draft = withPolicy(w, draft, 'globalMarketing', 3);
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
      { type: 'policy', key: 'globalMarketing', level: 3 },
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
    expect(areaSummary(w, area('local'))).toBe('표준 · 없음 · 없음 · 보통');
    w.ticket = 0.06;
    expect(areaSummary(w, area('local'))).toBe('표준 · 없음 · 없음 · 사용자 지정');
    // The 글로벌 area has no card; its header also names the base it builds (→ECON-34).
    expect(areaSummary(w, area('global'))).toBe('입소문 · 없음 · 안 함');
    expect(areaBase(w, area('global'))).toBe('글로벌 인지도 0');
    w.localBase = 41.6;
    expect(areaBase(w, area('local'))).toBe('지역 기반 42');
    expect(areaBase(w, area('finance'))).toBeUndefined();
    send(w, { type: 'direction', key: 'finance', option: 'careful' });
    send(w, { type: 'direction', key: 'renewal', option: 'frugal' });
    expect(areaSummary(w, area('finance'))).toBe('표준 · 신중');
    expect(areaSummary(w, area('squad'))).toBe('표준 · 표준 · 짠물');
  });

  it('holds eight areas, 지역 and 글로벌 with the investment rows, every row once', () => {
    expect(DIRECTION_AREAS.map((area) => area.label)).toEqual([
      '선수단·계약',
      '영입',
      '매각',
      '유소년',
      '스태프',
      '재정',
      '지역',
      '글로벌',
    ]);
    const local = DIRECTION_AREAS.find((area) => area.key === 'local')!,
      global = DIRECTION_AREAS.find((area) => area.key === 'global')!;
    expect(local).toMatchObject({ card: 'fans', base: 'local' });
    expect(local.rows).toEqual(['localInvest', 'grassroots', 'ticket']);
    expect(global.card).toBeUndefined();
    expect(global.rows).toEqual(['globalMarketing', 'globalScouting', 'tour']);
    const rows = DIRECTION_AREAS.flatMap((area) => area.rows);
    expect(new Set(rows).size).toBe(rows.length);
    expect(rows).not.toContain('marketing');
  });

  it('drafts an investment row with its cost per round and the cash at season end', () => {
    const w = world();
    const d = withPolicy(w, {}, 'globalScouting', 4);
    const [change] = draftChanges(w, d);
    expect(change).toEqual({ kind: 'policy', key: 'globalScouting', from: 1, to: 4 });
    const preview = dialPreview(w, change as Extract<typeof change, { kind: 'policy' }>);
    expect(BigInt(preview.perRound)).toBeGreaterThan(0n);
    expect(BigInt(preview.annual)).toBeGreaterThan(0n);
    expect(BigInt(preview.seasonEnd.high)).toBeLessThan(BigInt(preview.seasonEndNow.high));
    // A tour costs nothing per round: it pays as a season starts.
    const tour = withPolicy(w, {}, 'tour', 3);
    const [trip] = draftChanges(w, tour);
    expect(dialPreview(w, trip as Extract<typeof trip, { kind: 'policy' }>).perRound).toBe('0');
  });

  it('drafts a direction row like a dial and sends it last', () => {
    const w = world();
    let d = withDirection(w, {}, 'finance', 'stable');
    d = withPolicy(w, d, 'localInvest', 2);
    expect(draftChanges(w, d)).toEqual([
      { kind: 'policy', key: 'localInvest', from: 1, to: 2 },
      { kind: 'direction', key: 'finance', from: 'standard', to: 'stable' },
    ]);
    expect(draftCommands(w, d)).toEqual([
      { type: 'policy', key: 'localInvest', level: 2 },
      { type: 'direction', key: 'finance', option: 'stable' },
    ]);
    expect(draftWorld(w, d).direction).toEqual({ finance: 'stable' });
    // The option in force takes the row out of the draft.
    expect(withDirection(w, d, 'finance', 'standard')).toEqual({ policy: { localInvest: 2 } });
    for (const command of draftCommands(w, d)) send(w, command);
    expect(w.direction).toEqual({ finance: 'stable' });
  });
});
