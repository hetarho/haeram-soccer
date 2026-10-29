import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { OfficeLobby } from './OfficeLobby';
import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import {
  defaultSettings,
  RESPONSIBILITY_KEYS,
} from '../../../../packages/engine/src/responsibilities';
import { delegationCounts, officeFacts } from './officeSummary';
vi.mock('./FacilityArt', () => ({ FacilityArt: () => null }));
vi.mock('./teamState', () => ({ cashState: () => ({ value: '약 12주' }) }));
const world = () =>
  ({
    playerClub: 'club',
    year: 1950,
    cash: '10000',
    clubs: [{ id: 'club', country: 'ENG' }],
    players: [
      { id: 'one', name: 'One', status: 'active', wage: '100', until: 1951 },
      { status: 'sold', wage: '200' },
    ],
    academy: { players: [{ id: 'youth' }] },
    manager: { name: 'Manager' },
    staff: [],
    settings: defaultSettings(),
  }) as unknown as World;
const slots = [{ open: true }, { open: false }] as SponsorSlotView[];
describe('office lobby facts', () => {
  it('leads with actual work and retains independent saved choices on inspection', () => {
    const w = world(),
      before = structuredClone(w);
    const facts = officeFacts(w, slots);
    expect(facts.players).toBe('1군 1명 · 유소년 1명 · 만료 1명 · 계약 협상 0건');
    expect(facts.staff).toBe('감독 Manager · 스태프 0명 · 결재 대기 0건');
    expect(facts.investment).toContain('자금 여력 약 12주');
    expect(facts.sponsor).toBe('후원 0/1자리');
    expect(w).toEqual(before);
  });
  it('leads the lobby with live pending requests and opens their matching desk facts', () => {
    const w = world();
    const pending = [
      {
        id: 'manager-approval',
        responsibility: 'manager',
        kind: 'staff-renewal',
        title: 'Manager renewal',
      },
    ] as StopReason[];
    const html = renderToStaticMarkup(
      createElement(OfficeLobby, {
        w,
        sponsors: slots,
        pending,
        onOpen: vi.fn(),
        onOverview: vi.fn(),
      }),
    );
    expect(html).toContain('결재 대기 1건');
    expect(html).toContain('Manager renewal · 검토하기');
    expect(html).toContain('재정·투자');
    expect(html).toContain('data-testid="facility-overview"');
    expect(html).not.toContain('role="dialog"');
    expect(officeFacts(w, slots, pending).staff).toContain('결재 대기 1건');
  });
  it('keeps ongoing construction visible alongside finance', () => {
    const w = world();
    w.facilityWorks = {
      stadium: { to: 1, year: 1950, day: 180 },
      training: { to: 1, year: 1950, day: 90 },
    };
    expect(officeFacts(w, slots).investment).toContain('공사 중 2건');
  });
  it('counts observations and all seven responsibilities without conflating them', () => {
    const w = world();
    for (const key of RESPONSIBILITY_KEYS) w.settings!.responsibilities[key] = 'direct';
    w.settings!.observations = { matchEve: true, windowOpen: true };
    expect(delegationCounts(w)).toEqual({ delegated: 0, direct: 9, total: 9 });
    w.settings!.responsibilities.sponsors = 'delegated';
    w.settings!.observations.windowOpen = false;
    expect(delegationCounts(w)).toEqual({ delegated: 2, direct: 7, total: 9 });
  });
  it('counts signed sponsor slots among the open ones', () => {
    expect(
      officeFacts(world(), [{ open: true, contract: {} }, { open: false }] as SponsorSlotView[])
        .sponsor,
    ).toBe('후원 1/1자리');
  });
});
