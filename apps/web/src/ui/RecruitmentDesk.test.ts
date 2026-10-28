import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldMarketOffer, WorldMarketPage } from '../../../../packages/contracts/src/types';
import { worldMarketFixture } from '../../../../packages/engine/src/world-market.testkit';
import type { ClientState, GameClient } from '../runtime/client';
import { initialClientState } from '../runtime/store';
import { RecruitmentDesk } from './RecruitmentDesk';
import { DEFAULT_MARKET_QUERY, type MarketDetail, type MarketQuery } from './worldMarket';

const { choices, reads } = vi.hoisted(() => ({
  choices: {} as Record<string, unknown>,
  reads: {
    page: undefined as WorldMarketPage | undefined,
    detail: undefined as MarketDetail | undefined,
    error: undefined as string | undefined,
    blocked: false,
    query: vi.fn(),
    inspect: vi.fn(),
  },
}));
vi.mock('./worldMarket', async (original) => ({
  ...(await original<typeof import('./worldMarket')>()),
  useMarketPage: (...args: unknown[]) => {
    reads.query(...args);
    return { value: reads.page, error: reads.error, retry: vi.fn() };
  },
  useMarketDetail: (...args: unknown[]) => {
    reads.inspect(...args);
    return { value: args[3] ? reads.detail : undefined, retry: vi.fn() };
  },
}));
vi.mock('./taskMemory', () => ({
  useTaskState: (_world: string, key: string, initial: unknown) => [
    choices[key] ?? initial,
    (value: unknown) => {
      choices[key] = typeof value === 'function' ? value(choices[key] ?? initial) : value;
    },
  ],
}));
vi.mock('../runtime/store', async (original) => ({
  ...(await original<typeof import('../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) =>
    reads.blocked
      ? true
      : selector({ ...initialClientState, busy: false, processing: false, readonly: false }),
}));
vi.mock('./Dialog', () => ({
  Dialog: ({ children, actions }: { children: ReactNode; actions: ReactNode }) =>
    createElement('div', {}, children, actions),
}));

// Three represented clubs and a prepared XI; no world initialization, progression or worker.
const w = worldMarketFixture();
const offer: WorldMarketOffer = {
  player: { ...w.players[0], id: 'external', name: 'External Player', wage: '200' },
  target: { world: w.id, kind: 'club', clubId: 'foreign', playerId: 'external' },
  source: { club: 'foreign', name: 'Foreign Club', country: 'ESP', tier: 0, group: 0 },
  fee: '1000',
  loanFee: '100',
  freeAgent: false,
  available: true,
  recommended: false,
  own: false,
  foreign: true,
};
const preview = {
  slot: { index: 0, position: 'GK', role: 'shotStopper', arrival: 32, settled: 40 },
  beforeStrength: 40,
  afterStrength: 41,
  strengthDelta: 1,
  beforeFit: 50,
  afterFit: 51,
  fitDelta: 1,
  manual: false,
  willStart: true,
  fee: offer.fee,
  wage: '200',
  annualAfter: '1000',
  cashAfter: '999999998999',
  runwayRounds: 999,
  affordable: true,
  eligible: true,
  reason: '자동 선발 후보',
} as MarketDetail['buy'];
const detail = (): MarketDetail => ({
  world: w.id,
  revision: w.revision,
  offer,
  buy: { ...preview },
  loan: { ...preview, fee: offer.loanFee },
  bid: { asking: offer.fee, chance: 0.5, label: '보통', counterPossible: true },
});
let tree: ReactElement;
const client = {
  state: { view: { world: w }, error: undefined },
  command: vi.fn(async () => ({ ok: true })),
} as unknown as GameClient;
const state = { view: { world: w, transfers: [] } } as unknown as ClientState;
function Capture() {
  tree = RecruitmentDesk({ state, client });
  return tree;
}
const render = () => renderToStaticMarkup(createElement(Capture));
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [
    node,
    ...elements((node.props.children as ReactNode) ?? null),
    ...elements((node.props.actions as ReactNode) ?? null),
  ];
}
const control = (label: string) =>
  elements(tree).find((node) => node.props['aria-label'] === label)!;
const submit = () =>
  elements(tree).find(
    (node) =>
      node.type === 'button' &&
      Array.isArray(node.props.children) &&
      node.props.children.includes(' 제안 보내기'),
  )!;
const ids = (markup: string) =>
  [...markup.matchAll(/data-candidate-id="([^"]+)"/g)].map((match) => match[1]);

beforeEach(() => {
  for (const key of Object.keys(choices)) delete choices[key];
  reads.page = {
    world: w.id,
    revision: w.revision,
    page: 0,
    pageSize: 50,
    total: 101,
    items: [offer],
  };
  reads.detail = undefined;
  reads.error = undefined;
  reads.blocked = false;
  w.bids = undefined;
  vi.clearAllMocks();
  client.state.view = state.view;
});

describe('paged whole-world recruitment desk', () => {
  it('renders only worker page rows, total/page state, source and non-recommended inspection', () => {
    const markup = render();
    expect(ids(markup)).toEqual(['external']);
    expect(markup).toContain('총 101명');
    expect(markup).toContain('1 / 3 페이지');
    expect(markup).toContain('Foreign Club');
    expect(markup).toContain('스페인 1부');
    expect(markup).toContain('aria-label="External Player 상세 보기"');
    expect(markup).toContain('aria-label="영입 필터"');
    expect(markup).toContain('aria-label="이적 협상 · 0건 진행 중"');
    expect(markup).not.toContain('<article');
    expect(reads.query.mock.lastCall?.[3]).toEqual(DEFAULT_MARKET_QUERY);
    expect(reads.inspect.mock.calls.every((args) => args[3] === undefined)).toBe(true);
  });
  it('passes filters/sorts to the worker and resets pages on search', () => {
    choices['world-market-query'] = {
      ...DEFAULT_MARKET_QUERY,
      page: 2,
      line: 'DF',
      recommendedOnly: true,
      fit: 'improves',
      team: 'foreign',
      league: { country: 'ESP', tier: 0, group: 0 },
      sort: 'wage',
      direction: 'asc',
    };
    render();
    expect(reads.query.mock.lastCall?.[3]).toEqual(choices['world-market-query']);
    const input = elements(tree).find((node) => node.type === 'input')!;
    (input.props.onChange as (event: unknown) => void)({ target: { value: 'Ada' } });
    expect(choices['world-market-query']).toMatchObject({
      page: 0,
      name: 'Ada',
      sort: 'wage',
      direction: 'asc',
    });
    choices['market-panel'] = 'filters';
    render();
    expect(
      elements(control('영입 후보 정렬').props.children as ReactNode).map(
        (item) => item.props.value,
      ),
    ).toEqual(['name', 'age', 'ovr', 'potential', 'fee', 'wage']);
    expect(control('영입 리그')).toBeDefined();
    expect(control('영입 구단')).toBeDefined();
    expect(elements(control('영입 포지션').props.children as ReactNode)).toHaveLength(15);
  });
  it('uses server-clamped pages and retains comparison targets across pages', () => {
    choices['world-market-query'] = { ...DEFAULT_MARKET_QUERY, page: 8 };
    choices['world-market-comparison'] = [offer.target, { ...offer.target, playerId: 'off-page' }];
    reads.page = { ...reads.page!, page: 1, total: 51, items: [] };
    const markup = render();
    expect(markup).toContain('2 / 2 페이지');
    expect(markup).toContain('aria-label="선택한 2명 비교"');
    const previous = elements(tree).find((node) => node.props.children === '이전 페이지')!;
    (previous.props.onClick as () => void)();
    expect(choices['world-market-query']).toMatchObject({ page: 0 });
    expect(choices['world-market-comparison']).toHaveLength(2);
  });
  it.each([
    ['position', '영입 포지션', '모든 포지션'],
    ['league', '영입 리그', '모든 리그'],
    ['team', '영입 구단', '모든 구단·자유계약'],
  ] as const)(
    'clears only the %s restriction using its selectable all option',
    (field, label, allLabel) => {
      const query: MarketQuery = {
        ...DEFAULT_MARKET_QUERY,
        page: 3,
        name: 'Ada',
        recommendedOnly: true,
        fit: 'improves',
        position: 'GK',
        league: { country: 'ESP', tier: 0, group: 0 },
        team: 'foreign',
        sort: 'wage',
        direction: 'asc',
      };
      choices['world-market-query'] = query;
      choices['market-panel'] = 'filters';
      render();
      const select = control(label);
      const all = elements(select.props.children as ReactNode).find(
        (node) => node.props.children === allLabel,
      )!;
      // Shared Select removes empty option values from its actual selectable list.
      expect(all.props.value).toBeTruthy();
      (select.props.onValueChange as (value: string) => void)(all.props.value as string);
      const next = choices['world-market-query'] as MarketQuery;
      expect(next).toEqual({ ...query, page: 0, [field]: undefined });
      render();
      expect(reads.query.mock.lastCall?.[3]).toEqual(next);
      expect(control(label).props.value).toBe(all.props.value);
    },
  );
  it('distinguishes loading, retryable failures and empty filters with a clear action', () => {
    reads.page = undefined;
    expect(render()).toContain('세계 선수 목록을 불러오고 있어요.');
    reads.error = 'retry query';
    expect(render()).toContain('목록 다시 조회');
    reads.page = { world: w.id, revision: w.revision, page: 0, pageSize: 50, total: 0, items: [] };
    reads.error = undefined;
    choices['world-market-query'] = { ...DEFAULT_MARKET_QUERY, name: 'No such player' };
    expect(render()).toContain('이 조건에 맞는 선수가 없어요.');
    const clear = elements(tree).find((node) => node.props.children === '필터 지우기')!;
    (clear.props.onClick as () => void)();
    expect(choices['world-market-query']).toEqual(DEFAULT_MARKET_QUERY);
  });
  it('approaches a non-scout target with authoritative terms and no row index', async () => {
    choices['world-market-bidding'] = { target: offer.target, asking: offer.fee };
    reads.detail = detail();
    const markup = render();
    expect(markup).toContain('반복 연봉');
    expect(markup).toContain('계약 / 임대 반환');
    expect(markup).toContain('합류 32 → 적응 후 40');
    expect(markup).toContain('직접 발굴');
    expect(submit().props.disabled).toBe(false);
    await (submit().props.onClick as () => Promise<void>)();
    expect(client.command).toHaveBeenCalledWith(
      { type: 'bid', target: offer.target, fee: '1000' },
      { background: true },
    );
  });
  it('selects a player by identity and signs a selected free agent through the existing command', () => {
    render();
    (control('External Player 상세 보기').props.onClick as () => void)();
    expect(choices['world-market-viewing']).toEqual(offer.target);
    reads.detail = detail();
    reads.detail.offer = {
      ...offer,
      freeAgent: true,
      fee: '0',
      source: undefined,
      target: { world: w.id, kind: 'offer', playerId: offer.player.id },
    };
    render();
    const card = elements(tree).find((node) => node.props.candidate)!;
    (card.props.onRecruit as (loan: boolean) => void)(false);
    expect(client.command).toHaveBeenCalledWith(
      { type: 'recruit', target: reads.detail.offer.target, loan: false },
      { background: true },
    );
  });
  it.each([true, false])(
    'offers only a permanent signing for a free agent with window open=%s',
    (open) => {
      const day = w.calendar!.day;
      w.calendar!.day = open ? 3 : 60;
      try {
        choices['world-market-viewing'] = offer.target;
        reads.detail = detail();
        reads.detail.offer = {
          ...offer,
          freeAgent: true,
          fee: '0',
          source: undefined,
          target: { world: w.id, kind: 'offer', playerId: offer.player.id },
        };
        // The preview permits the prepared player financially and for registration. The UI must
        // additionally honor the stable-target command's unsupported free-agent loan contract.
        reads.detail.buy.fee = '0';
        const markup = render();
        expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>1시즌 임대<\/button>/);
        expect(markup).toContain(
          '자유계약 선수는 임대할 수 없어요. 자유계약 영입을 이용해 주세요.',
        );
        expect(markup).toMatch(/<button(?![^>]*disabled)[^>]*>자유계약 영입<\/button>/);
        const card = elements(tree).find((node) => node.props.candidate)!;
        (card.props.onRecruit as (loan: boolean) => void)(true);
        expect(client.command).not.toHaveBeenCalled();
        (card.props.onRecruit as (loan: boolean) => void)(false);
        expect(client.command).toHaveBeenCalledExactlyOnceWith(
          { type: 'recruit', target: reads.detail.offer.target, loan: false },
          { background: true },
        );
      } finally {
        w.calendar!.day = day;
      }
    },
  );
  it('keeps inspection enabled during automatic play and rejects a late command from another game', async () => {
    reads.blocked = true;
    render();
    expect(control('External Player 상세 보기').props.disabled).toBeUndefined();
    reads.blocked = false;
    choices['world-market-bidding'] = { target: offer.target, asking: offer.fee };
    reads.detail = detail();
    render();
    client.state.view = { ...state.view!, world: { ...state.view!.world, id: 'another-world' } };
    await (submit().props.onClick as () => Promise<void>)();
    expect(client.command).not.toHaveBeenCalled();
  });
  it.each(['own', 'locked', 'stale', 'pending'] as const)(
    'guards %s approaches while preserving inspection',
    async (guard) => {
      choices['world-market-bidding'] = { target: offer.target, asking: offer.fee };
      reads.detail = detail();
      if (guard === 'own') {
        reads.detail.offer = { ...offer, own: true, available: false };
        reads.detail.buy.eligible = false;
      }
      if (guard === 'locked') reads.blocked = true;
      if (guard === 'stale') reads.detail.revision--;
      if (guard === 'pending')
        w.bids = [
          { direction: 'out', playerId: offer.player.id, status: 'pending' },
        ] as typeof w.bids;
      const markup = render();
      expect(submit().props.disabled).toBe(true);
      expect(markup).toContain('External Player');
      await (submit().props.onClick as () => Promise<void>)();
      expect(client.command).not.toHaveBeenCalled();
    },
  );
});
