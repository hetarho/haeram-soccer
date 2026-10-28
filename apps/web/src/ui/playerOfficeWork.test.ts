import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { defaultSettings } from '../../../../packages/engine/src/responsibilities';
import { areaOf, DIRECTION_AREAS } from './areas';
import { departmentDraft, discardDepartment, draftChanges, type BoardDraft } from './board';
import {
  PLAYER_WORK_SCOPES,
  PLAYER_WORK_TABS,
  playerOfficeOverview,
  playerWorkTab,
  saleOfferItems,
  workRequests,
} from './playerOfficeWork';
import { PlayerOverview } from './PlayerOfficePanel';
import { openOfficeWork } from './officeDesks';

// Minimal retained facts only; no catalogs, world generation, clock, storage or workers.
const world = () =>
  ({
    id: 'office-unit',
    year: 1950,
    round: 0,
    calendar: { day: 20 },
    playerClub: 'own',
    clubs: [{ id: 'own', country: 'ENG', name: 'Own' }],
    cash: '100000',
    ticket: 0.05,
    players: [
      {
        id: 'one',
        name: 'One',
        status: 'active',
        wage: '100',
        until: 1951,
        talk: { kind: 'improve', demand: '150', floor: '120', year: 1950, day: 10 },
      },
      { id: 'two', name: 'Two', status: 'active', wage: '200', until: 1953 },
      { id: 'sold', name: 'Sold', status: 'sold', wage: '999999', until: 1951 },
    ],
    staff: [
      { role: 'director', name: 'Real Director' },
      { role: 'youth', name: 'Real Youth Director' },
    ],
    settings: defaultSettings(),
    inbox: [],
    bids: [
      {
        id: 'in',
        direction: 'in',
        status: 'pending',
        playerId: 'one',
        year: 1950,
        day: 18,
        due: 22,
        fee: '500',
      },
      {
        id: 'out',
        direction: 'out',
        status: 'countered',
        playerId: 'external',
        year: 1950,
        day: 18,
        due: 22,
        fee: '500',
      },
      {
        id: 'old',
        direction: 'in',
        status: 'pending',
        playerId: 'one',
        year: 1950,
        day: 10,
        due: 19,
        fee: '500',
      },
      {
        id: 'closed',
        direction: 'in',
        status: 'completed',
        playerId: 'two',
        year: 1950,
        day: 10,
        due: 22,
        fee: '500',
      },
    ],
  }) as unknown as World;
const request = {
  id: 'one-contract',
  kind: 'contract-talk',
  responsibility: 'contracts',
  title: 'One contract',
  ref: 'one',
} as StopReason;

describe('player work scopes', () => {
  it('defaults to overview and separates all four existing responsibilities', () => {
    expect(PLAYER_WORK_TABS.map(([, label]) => label)).toEqual([
      '개요',
      '계약',
      '영입',
      '매각',
      '유소년 승격·방출',
    ]);
    expect(playerWorkTab(undefined)).toBe('overview');
    expect(playerWorkTab('players')).toBe('contracts');
    expect(playerWorkTab('market')).toBe('recruitment');
    expect(Object.values(PLAYER_WORK_SCOPES).map((scope) => scope.responsibility)).toEqual([
      'contracts',
      'recruitment',
      'sales',
      'academy',
    ]);
    expect(Object.values(PLAYER_WORK_SCOPES).map((scope) => scope.areas)).toEqual([
      ['finance'],
      ['scouting'],
      ['market'],
      ['youth'],
    ]);
  });
  it('keeps culture in the squad area and financial player rows in finance under the same keys', () => {
    expect(areaOf('culture')).toMatchObject({ key: 'squad', rows: [] });
    expect(areaOf('support').key).toBe('finance');
    expect(areaOf('renewal').key).toBe('finance');
    const rows = DIRECTION_AREAS.flatMap((area) => area.rows);
    expect(new Set(rows).size).toBe(rows.length);
  });
  it('applies/discards only finance and keeps culture and recruitment drafts independent', () => {
    const w = world();
    const draft: BoardDraft = {
      build: { culture: 'family', scouting: 'data' },
      policy: { support: 4, recruitment: 2 },
      direction: { renewal: 'frugal' },
    };
    const finance = departmentDraft(w, draft, 'finance');
    expect(finance.policy).toEqual({ support: 4 });
    expect(finance.direction).toEqual({ renewal: 'frugal' });
    expect(finance.build).toBeUndefined();
    const remaining = discardDepartment(w, draft, 'finance');
    expect(remaining.policy).toEqual({ recruitment: 2 });
    expect(remaining.direction).toBeUndefined();
    expect(
      draftChanges(w, remaining)
        .filter((change) => change.kind === 'card')
        .map((change) => change.slot),
    ).toEqual(['scouting', 'culture']);
  });
});
describe('real overview facts', () => {
  it('totals only active wages/contracts and live negotiations without mutating saved choices', () => {
    const w = world(),
      before = structuredClone(w);
    const facts = playerOfficeOverview(w, [request]);
    expect(facts).toMatchObject({ players: 2, wage: '300' });
    expect(facts.expiring.map((p) => p.id)).toEqual(['one']);
    expect(facts.talks.map((p) => p.id)).toEqual(['one']);
    expect(facts.incoming.map((bid) => bid.id)).toEqual(['in']);
    expect(facts.outgoing.map((bid) => bid.id)).toEqual(['out']);
    expect(facts.stances[0]).toMatchObject({ auto: false, actor: '구단주', pending: [request] });
    expect(facts.stances[3]).toMatchObject({ auto: true, actor: 'Real Youth Director' });
    expect(facts.stances[0].applied).toContain('재계약 기조');
    expect(facts.stances[0].applied).not.toContain('문화');
    expect(w).toEqual(before);
  });
  it('counts combined approvals once within each actual scope', () => {
    const joint = { ...request, responsibilities: ['contracts', 'staff'] } as StopReason;
    expect(workRequests([joint], 'contracts')).toEqual([joint]);
    expect(workRequests([joint], 'staff')).toEqual([joint]);
    expect(workRequests([joint], 'sales')).toEqual([]);
  });
  it('shows actual owners, expiry and negotiation facts and links from overview to real work', () => {
    const html = renderToStaticMarkup(
      createElement(PlayerOverview, { w: world(), pending: [request], onWork: vi.fn() }),
    );
    expect(html).toContain('선수 계약 개요');
    expect(html).toContain('계약 개선');
    expect(html).toContain('Real Youth Director');
    for (const label of [
      '계약 업무 열기',
      '영입 업무 열기',
      '매각 업무 열기',
      '유소년 승격·방출 업무 열기',
      'One contract · 검토하기',
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('role="group"');
  });
  it('keeps eligible sale intervention visible under automatic handling and omits expired/closed bids', () => {
    const w = world();
    w.settings!.responsibilities.sales = 'delegated';
    const before = structuredClone(w.settings);
    expect(saleOfferItems(w).map((item) => item.ref)).toEqual(['in']);
    expect(w.settings).toEqual(before);
  });
  it('creates separate browser entries while retaining the desk/request-independent query', () => {
    vi.stubGlobal('location', new URL('https://game.test/direction?view=players&work=overview'));
    vi.stubGlobal('history', { pushState: vi.fn(), state: { officeLobbyDepth: 2 } });
    vi.stubGlobal('document', { querySelector: () => ({ scrollTop: 44 }) });
    openOfficeWork('sales');
    expect(history.pushState).toHaveBeenCalledWith(
      { officeLobbyDepth: 3 },
      '',
      '/direction?view=players&work=sales',
    );
    vi.unstubAllGlobals();
  });
});
