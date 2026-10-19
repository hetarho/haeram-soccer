import { useTaskMemory } from './taskMemory';
import type { SavedPolicy } from '../../../../packages/contracts/src/types';
import { describe, expect, it } from 'vitest';
import { createWorld, operate } from '../../../../packages/engine/src/index';
import { BUILD_PRESETS } from '../../../../packages/engine/src/build';
import { matchingPreset } from '../../../../packages/engine/src/presets';
import { financeProjection } from '../../../../packages/engine/src/projection';
import {
  POLICY_DEFAULTS,
  POLICY_INFO,
  POLICY_KEYS,
  policyOf,
} from '../../../../packages/engine/src/policy';
import {
  replaceDepartment,
  departmentDraft,
  discardDepartment,
  reconcileDraft,
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
  currentStepName,
  stepIndex,
  stepName,
  stepValue,
} from './board';
import { DIRECTION_AREAS, type AreaKey } from './areas';
import { TICKET_LEVELS } from './ticketLevels';

const world = () =>
  createWorld({
    country: 'ENG',
    name: 'Board',
    color: '#24664f',
    seed: 'board',
    level: 'easy' as const,
  });
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
      { type: 'build', build: localPride.build, name: '유스 순혈주의' },
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

  it('a preset drafts its whole board; a saved entry without rows drafts only its cards', () => {
    const w = world();
    const youth = BUILD_PRESETS.find((p) => p.id === 'youth-academy')!;
    const draft = withStrategy(w, {}, youth.build, youth.label, youth.rows);
    // Two cards, the academy and recruitment dials and six direction rows differ from a new club.
    expect(draftChanges(w, draft).map((change) => change.kind)).toEqual([
      'card',
      'card',
      'policy',
      'policy',
      ...Array(6).fill('direction'),
    ]);
    for (const command of draftCommands(w, draft)) send(w, command);
    expect(matchingPreset(w)?.id).toBe('youth-academy');
    // Another preset returns every row it does not name to its default.
    const trading = BUILD_PRESETS.find((p) => p.id === 'trading')!;
    for (const command of draftCommands(
      w,
      withStrategy(w, {}, trading.build, trading.label, trading.rows),
    ))
      send(w, command);
    expect(matchingPreset(w)?.id).toBe('trading');
    expect(policyOf(w).academy).toBe(1);
    expect(w.direction?.coaches).toBeUndefined();
    // Cards only: the rows in force stay.
    const cardsOnly = withStrategy(w, {}, localPride.build, '옛 방향');
    expect(draftChanges(w, cardsOnly).every((change) => change.kind === 'card')).toBe(true);
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
    expect(areaSummary(w, area('scouting'))).toBe('데이터 스카우팅 · 젊은 선수 위주 · 균형');
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

describe('department draft boundaries', () => {
  it('scopes cards and rows, merges the live build and leaves other departments drafted', () => {
    const w = world();
    let d = withStrategy(w, {}, localPride.build, localPride.label);
    d = withPolicy(w, d, 'recruitment', 2);
    d = withDirection(w, d, 'finance', 'careful');
    const scouting = departmentDraft(w, d, 'scouting');
    expect(draftChanges(w, scouting).map((c) => c.kind)).toEqual(['card', 'policy']);
    expect(scouting.name).toBeUndefined();
    expect(scouting.build).toEqual({ scouting: localPride.build.scouting });
    // Applied changes made elsewhere are retained at command generation time.
    send(w, { type: 'build', build: { revenue: 'commercial' } });
    const live = departmentDraft(w, d, 'scouting');
    expect(live.build?.revenue).toBe('commercial');
    const before = structuredClone(w);
    const commands = draftCommands(w, live);
    for (const command of commands) send(w, command);
    const rest = reconcileDraft(before, w, d, commands);
    expect(draftChanges(w, rest).some((c) => c.kind === 'direction' && c.key === 'finance')).toBe(
      true,
    );
    expect(draftChanges(w, departmentDraft(w, rest, 'scouting'))).toEqual([]);
    expect(draftChanges(w, rest).some((c) => c.kind === 'card' && c.slot === 'youth')).toBe(true);
    expect(
      draftChanges(w, discardDepartment(w, rest, 'finance')).some(
        (c) => c.kind === 'direction' && c.key === 'finance',
      ),
    ).toBe(false);
  });
  it('a partial refusal retains only unapplied commands for retry', () => {
    const w = world();
    let d = withCard(w, {}, 'scouting', 'data');
    d = withPolicy(w, d, 'recruitment', 2);
    d = withDirection(w, d, 'finance', 'careful');
    const before = structuredClone(w);
    const commands = draftCommands(w, departmentDraft(w, d, 'scouting'));
    send(w, commands[0]);
    const remaining = reconcileDraft(before, w, d, commands.slice(0, 1));
    expect(draftCommands(w, departmentDraft(w, remaining, 'scouting'))).toEqual([commands[1]]);
    expect(remaining.direction).toEqual({ finance: 'careful' });
    expect(reconcileDraft(w, w, remaining, [])).toEqual(remaining);
    for (const command of draftCommands(w, remaining)) send(w, command);
    expect(draftCommands(w, remaining)).toEqual([]);
  });
  it('another world never inherits board work', () => {
    useTaskMemory.getState().activate('first');
    useTaskMemory.setState({ values: { 'board-draft': { direction: { finance: 'careful' } } } });
    useTaskMemory.getState().activate('second');
    expect(useTaskMemory.getState().values).toEqual({});
  });
});

describe('department editor shared draft', () => {
  it('replacing and discarding a scoped edit preserves unrelated cards and rows', () => {
    const w = world();
    const full = withCard(w, withDirection(w, {}, 'finance', 'careful'), 'revenue', 'commercial');
    const scoped = withPolicy(w, withCard(w, {}, 'scouting', 'data'), 'recruitment', 2);
    const combined = replaceDepartment(w, full, 'scouting', scoped);
    expect(departmentDraft(w, combined, 'finance')).toEqual(full);
    expect(departmentDraft(w, combined, 'scouting')).toEqual(scoped);
    expect(replaceDepartment(w, combined, 'scouting', {})).toEqual(full);
  });
});

it('applies recruitment support only with its own department and retains it across finance apply', () => {
  const w = world();
  const d = withDirection(
    w,
    withDirection(w, {}, 'finance', 'careful'),
    'recruitmentSupport',
    'director',
  );
  expect(draftCommands(w, departmentDraft(w, d, 'scouting'))).toEqual([
    { type: 'direction', key: 'recruitmentSupport', option: 'director' },
  ]);
  const commands = draftCommands(w, departmentDraft(w, d, 'finance'));
  expect(commands).toEqual([{ type: 'direction', key: 'finance', option: 'careful' }]);
  const before = structuredClone(w);
  for (const command of commands) send(w, command);
  const rest = reconcileDraft(before, w, d, commands);
  expect(rest.direction).toEqual({ recruitmentSupport: 'director' });
  expect(draftCommands(w, rest)).toEqual([
    { type: 'direction', key: 'recruitmentSupport', option: 'director' },
  ]);
});

describe('dial steps', () => {
  it('stepValue and stepIndex round-trip every ticket level and policy level', () => {
    TICKET_LEVELS.forEach((level, index) => {
      expect(stepValue('ticket', index)).toBe(level.price);
      expect(stepIndex('ticket', stepValue('ticket', index))).toBe(index);
      expect(stepName('ticket', level.price)).toBe(level.name);
    });
    for (const key of POLICY_KEYS)
      POLICY_INFO[key].levels.forEach((level, index) => {
        expect(stepValue(key, index)).toBe(index + 1);
        expect(stepIndex(key, stepValue(key, index))).toBe(index);
        expect(stepName(key, index + 1)).toBe(level.name);
      });
  });
  it('a ticket price off the levels reads 사용자 지정', () => {
    const w = world();
    w.ticket = TICKET_LEVELS[2].price;
    expect(currentStepName(w, 'ticket')).toBe(TICKET_LEVELS[2].name);
    w.ticket = 0.06;
    expect(TICKET_LEVELS.some((level) => level.price === w.ticket)).toBe(false);
    expect(currentStepName(w, 'ticket')).toBe('사용자 지정');
    expect(stepIndex('ticket', w.ticket)).toBe(-1);
  });
  it('a missing academy policy reads the default level', () => {
    const w = world();
    // An older save's policy has no academy level.
    const older: SavedPolicy = { ...policyOf(w) };
    delete older.academy;
    w.policy = older;
    expect(currentStepName(w, 'academy')).toBe(
      POLICY_INFO.academy.levels[POLICY_DEFAULTS.academy - 1].name,
    );
    w.policy = { ...older, academy: undefined };
    expect(currentStepName(w, 'academy')).toBe('기본 운영');
    w.policy = { ...older, academy: 3 };
    expect(currentStepName(w, 'academy')).toBe('집중 투자');
    expect(currentStepName(w, 'recruitment')).toBe('균형');
  });
  it('areaSummary still lists card, direction and dial names in order', () => {
    const w = world();
    const area = (key: AreaKey) => DIRECTION_AREAS.find((item) => item.key === key)!;
    send(w, { type: 'build', build: { scouting: 'data' } });
    send(w, { type: 'policy', key: 'recruitment', level: 5 });
    send(w, { type: 'policy', key: 'academy', level: 2 });
    send(w, { type: 'policy', key: 'support', level: 1 });
    send(w, { type: 'direction', key: 'renewal', option: 'frugal' });
    // Card first, then each row in the area's order: a dial, then a direction row.
    expect(areaSummary(w, area('squad'))).toBe('표준 · 긴축 · 짠물');
    expect(areaSummary(w, area('scouting'))).toBe('데이터 스카우팅 · 즉시 전력 · 균형');
    // Direction rows before the academy dial, as the youth area lists them.
    expect(areaSummary(w, area('youth'))).toBe('표준 · 표준 · 표준 · 육성 강화');
    w.ticket = TICKET_LEVELS[4].price;
    expect(areaSummary(w, area('local'))).toBe('표준 · 없음 · 없음 · 프리미엄');
  });
});
