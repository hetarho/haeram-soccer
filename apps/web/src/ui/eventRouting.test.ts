import { describe, expect, it } from 'vitest';
import type { Command, World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import { answersRequest, eventDesk } from './eventRouting';

const item = (patch: Partial<StopReason> = {}): StopReason => ({
  id: 'request',
  attention: true,
  kind: 'staff-report',
  ref: 'subject',
  title: 'Synthetic request',
  detail: 'Facts',
  year: 1950,
  day: 1,
  ...patch,
});
describe('approval destinations use the existing responsibility', () => {
  it.each([
    ['contracts', 'players'],
    ['recruitment', 'players'],
    ['sales', 'players'],
    ['academy', 'players'],
    ['manager', 'staff'],
    ['staff', 'staff'],
    ['sponsors', 'sponsor'],
  ] as const)('%s goes to %s', (responsibility, desk) => {
    expect(eventDesk(item({ responsibility }))).toBe(desk);
  });
  it('keeps joint player/staff approvals in player work regardless of the direct half', () => {
    expect(
      eventDesk(item({ responsibility: 'staff', responsibilities: ['contracts', 'staff'] })),
    ).toBe('players');
    expect(eventDesk(item({ responsibility: 'staff', responsibilities: ['sales', 'staff'] }))).toBe(
      'players',
    );
  });
  it('routes recovery and sponsor notices but preserves both observation flows', () => {
    expect(eventDesk(item({ kind: 'finance' }))).toBe('investment');
    expect(eventDesk(item({ kind: 'finance', title: '후원 안내' }))).toBe('sponsor');
    expect(eventDesk(item({ kind: 'sponsor-ending' }))).toBe('sponsor');
    expect(eventDesk(item({ kind: 'match' }))).toBeUndefined();
    expect(eventDesk(item({ kind: 'window-open' }))).toBeUndefined();
    expect(eventDesk(item({ kind: 'cup' }))).toBeUndefined();
  });
});
describe('a submission answers only its own subject', () => {
  const w = { manager: { id: 'manager' }, staff: [{ id: 'coach', role: 'assistant' }] } as World;
  it.each([
    { type: 'respond-bid', id: 'subject', accept: false },
    { type: 'contract-offer', player: 'subject', wage: '100', term: 2 },
    { type: 'contract-decline', player: 'subject' },
    { type: 'answer-playing-coach', player: 'subject', accept: true },
    { type: 'resolve-mediation', id: 'subject', support: 'balanced' },
    { type: 'promote-youth', id: 'subject' },
    { type: 'release-youth', id: 'subject' },
  ] satisfies Command[])('matches $type by identity', (command) => {
    expect(answersRequest(w, item(), command)).toBe(true);
    expect(answersRequest(w, item({ ref: 'another' }), command)).toBe(false);
  });
  it('matches the precise manager, staff post, sponsor slot and money recovery', () => {
    expect(
      answersRequest(w, item({ kind: 'staff-renewal', ref: 'manager' }), { type: 'renew-manager' }),
    ).toBe(true);
    expect(
      answersRequest(w, item({ kind: 'staff-renewal', ref: 'coach' }), { type: 'renew-manager' }),
    ).toBe(false);
    expect(
      answersRequest(w, item({ kind: 'staff-renewal', ref: 'coach' }), {
        type: 'renew-staff',
        role: 'assistant',
      }),
    ).toBe(true);
    expect(
      answersRequest(w, item({ kind: 'staff-renewal', ref: 'scout' }), {
        type: 'hire-staff',
        role: 'scout',
        candidate: 0,
      }),
    ).toBe(true);
    expect(
      answersRequest(w, item({ ref: 'local' }), { type: 'sign-sponsor', slot: 'local', offer: 0 }),
    ).toBe(true);
    expect(answersRequest(w, item({ kind: 'finance' }), { type: 'support' })).toBe(true);
    expect(answersRequest(w, item(), { type: 'settings', settings: {} } as Command)).toBe(false);
  });
});
