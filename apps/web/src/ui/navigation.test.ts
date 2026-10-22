import { describe, expect, it } from 'vitest';
import { createIdentityDraft } from '../../../../packages/engine/src/club-identity';
import { afterApply, clubDesignState, type ClubDesignDraft } from './ClubDesignView';
import { reduceIdentityDraft } from './clubIdentityDraft';
import { BUSINESS_TABS, businessTab, routeOf } from './state';
import { useTaskMemory } from './taskMemory';

describe('addresses (→WEB-39, WEB-43, WEB-70)', () => {
  it("routeOf maps /squad, /transfers and /manager with each view to 사람's tabs", () => {
    expect(routeOf('/squad', '')).toEqual({ page: 'people', view: 'players', address: '/people' });
    expect(routeOf('/transfers', '')).toEqual({
      page: 'people',
      view: 'market',
      address: '/people?view=market',
    });
    expect(routeOf('/manager', '')).toEqual({
      page: 'people',
      view: 'manager',
      address: '/people?view=manager',
    });
    expect(routeOf('/manager', '?view=coaches')).toEqual({
      page: 'people',
      view: 'coaches',
      address: '/people?view=coaches',
    });
    expect(routeOf('/manager', '?view=delegation')).toEqual({
      page: 'people',
      view: 'manager',
      address: '/people?view=manager',
    });
    // The candidates view opens 감독 with the manager market, from either address.
    for (const pathname of ['/manager', '/people'])
      expect(routeOf(pathname, '?view=candidates')).toEqual({
        page: 'people',
        view: 'manager',
        market: true,
        address: '/people?view=manager',
      });
  });

  it('routeOf keeps /people and /training views', () => {
    expect(routeOf('/people', '')).toEqual({ page: 'people', view: 'players' });
    for (const view of ['market', 'manager', 'coaches'])
      expect(routeOf('/people', `?view=${view}`)).toEqual({ page: 'people', view });
    expect(routeOf('/training', '')).toEqual({ page: 'training', view: 'training' });
    expect(routeOf('/training', '?view=academy')).toEqual({ page: 'training', view: 'academy' });
    // The first tab keeps no ?view=; an unknown view opens the first tab.
    expect(routeOf('/people', '?view=players')).toEqual({
      page: 'people',
      view: 'players',
      address: '/people',
    });
    expect(routeOf('/training', '?view=gym')).toEqual({
      page: 'training',
      view: 'training',
      address: '/training',
    });
    // Other pages keep their addresses as they are.
    expect(routeOf('/leagues', '?view=table')).toEqual({ page: 'league' });
    expect(routeOf('/history/1951', '')).toEqual({ page: 'history' });
    expect(routeOf('/', '')).toEqual({ page: 'dashboard' });
  });

  it('routeOf opens 방향 at /direction and every older /business address on its tab', () => {
    expect(routeOf('/direction', '')).toEqual({ page: 'business', view: 'strategy' });
    for (const view of ['build', 'finance', 'sponsor'])
      expect(routeOf('/direction', `?view=${view}`)).toEqual({ page: 'business', view });
    // The first tab keeps no ?view=; an unknown view opens the first tab.
    expect(routeOf('/direction', '?view=strategy')).toEqual({
      page: 'business',
      view: 'strategy',
      address: '/direction',
    });
    expect(routeOf('/direction', '?view=campaigns')).toEqual({
      page: 'business',
      view: 'strategy',
      address: '/direction',
    });
    for (const [search, view, address] of [
      ['', 'strategy', '/direction'],
      ['?view=strategy', 'strategy', '/direction'],
      ['?view=build', 'build', '/direction?view=build'],
      ['?view=finance', 'finance', '/direction?view=finance'],
      ['?view=sponsor', 'sponsor', '/direction?view=sponsor'],
      ['?view=office', 'office', '/direction?view=office'],
      // Views from before 방향: 시설 is 증축 now, 마케팅 and its campaigns sit under 자금.
      ['?view=facility', 'build', '/direction?view=build'],
      ['?view=marketing', 'finance', '/direction?view=finance'],
    ] as const)
      expect(routeOf('/business', search)).toEqual({ page: 'business', view, address });
  });

  it('구단 디자인 and 구단주 사무실 have stable 방향 tabs at /direction?view=identity (→WEB-39)', () => {
    expect(BUSINESS_TABS.map(([id, label]) => `${id}:${label}`)).toEqual([
      'strategy:운영 방침',
      'build:시설',
      'finance:재정',
      'sponsor:후원',
      'identity:구단 디자인',
      'office:구단주 사무실',
    ]);
    expect(businessTab('identity')).toBe('identity');
    expect(routeOf('/direction', '?view=identity')).toEqual({ page: 'business', view: 'identity' });
    expect(routeOf('/business', '?view=identity')).toEqual({
      page: 'business',
      view: 'identity',
      address: '/direction?view=identity',
    });
  });
});

describe('the career design draft (→WEB-74, WEB-86)', () => {
  const applied = createIdentityDraft({ country: 'ENG', seed: 'career-design', color: '#3A7bC2' });
  const edited = reduceIdentityDraft(applied, { type: 'colour', index: 0, colour: '#E0218A' });
  const work: ClubDesignDraft = { worldId: 'w1', entry: structuredClone(applied), draft: edited };

  it('shows the applied design until an edit, then the draft against its entry', () => {
    expect(clubDesignState(null, 'w1', applied)).toEqual({
      draft: null,
      value: applied,
      changed: false,
      stale: false,
    });
    expect(clubDesignState(work, 'w1', applied)).toEqual({
      draft: work,
      value: edited,
      changed: true,
      stale: false,
    });
    // An edit taken back by hand is a draft with nothing to apply.
    expect(
      clubDesignState({ ...work, draft: structuredClone(applied) }, 'w1', applied).changed,
    ).toBe(false);
  });

  it('compares designs, not objects or revisions, and ignores another game', () => {
    // A day later the world is a new projection carrying an equal design: the draft stands.
    const projected = JSON.parse(JSON.stringify(applied));
    expect(clubDesignState(work, 'w1', projected)).toMatchObject({ changed: true, stale: false });
    // Another applied design since the draft began makes it stale, never silently replaced.
    const newer = reduceIdentityDraft(applied, {
      type: 'crest-colour',
      region: 'primary',
      colour: '#123456',
    });
    expect(clubDesignState(work, 'w1', newer)).toMatchObject({ value: edited, stale: true });
    // A draft kept for another game is not this game's.
    expect(clubDesignState(work, 'w2', applied)).toEqual({
      draft: null,
      value: applied,
      changed: false,
      stale: false,
    });
  });

  it('clears after its apply and keeps an edit made while the apply was queued', () => {
    expect(afterApply(work, edited)).toBeNull();
    expect(afterApply(null, edited)).toBeNull();
    const later = reduceIdentityDraft(edited, { type: 'shirt-reuse', role: 'away' });
    expect(afterApply({ ...work, draft: later }, edited)).toEqual({
      worldId: 'w1',
      entry: edited,
      draft: later,
    });
  });

  it('task memory keeps a career draft until another game is activated', () => {
    const memory = useTaskMemory.getState();
    memory.activate('w1');
    useTaskMemory.setState({ values: { 'club-identity-draft': work } });
    useTaskMemory.getState().activate('w1');
    expect(useTaskMemory.getState().values['club-identity-draft']).toBe(work);
    useTaskMemory.getState().activate('w2');
    expect(useTaskMemory.getState().values).toEqual({});
  });
});
