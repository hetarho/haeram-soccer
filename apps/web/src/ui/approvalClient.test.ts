import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { GameClient } from '../runtime/client';
import type { Reply, View } from '../runtime/protocol';
import { initialClientState } from '../runtime/store';
import { approvalClient } from './approvalClient';
import type { ApprovalRequest } from './eventRouting';

const live = vi.hoisted(() => ({ ids: ['first', 'second'] }));
vi.mock('../runtime/progression', () => ({ stoppingEvents: () => live.ids.map((id) => ({ id })) }));
const request: ApprovalRequest = {
  world: 'world',
  desk: 'players',
  item: {
    id: 'first',
    attention: true,
    ref: 'bid',
    kind: 'incoming-bid',
    title: 'Synthetic bid',
    detail: '',
    year: 1950,
    day: 0,
  },
};
const answer = { type: 'respond-bid', id: 'bid', accept: false } as const;
function fixture() {
  const world = { id: 'world', manager: { id: 'manager' } } as World;
  const command = vi.fn(async () => {
    live.ids = ['second'];
    return { ok: true } as Reply;
  });
  const client = {
    state: {
      ...initialClientState,
      busy: false,
      processing: false,
      readonly: false,
      view: { world } as View,
    },
    command,
  } as unknown as GameClient;
  const current = vi.fn(() => client.state.view?.world.id === request.world);
  const submitted = vi.fn(),
    failed = vi.fn();
  return {
    client,
    command,
    current,
    submitted,
    failed,
    scoped: approvalClient(client, request, current, submitted, failed),
  };
}
beforeEach(() => {
  live.ids = ['first', 'second'];
});
describe('request command continuity', () => {
  it('returns only after acknowledged settlement and preserves other pending identities/order', async () => {
    const f = fixture();
    await f.scoped.command(answer);
    expect(f.submitted).toHaveBeenCalledOnce();
    expect(live.ids).toEqual(['second']);
    await f.scoped.command(answer);
    expect(f.command).toHaveBeenCalledOnce();
    expect(f.failed).toHaveBeenLastCalledWith(expect.stringContaining('이미 처리'));
  });
  it('rejects a simultaneous second click before React publishes busy state', async () => {
    const f = fixture();
    let resolve!: (reply: Reply) => void;
    f.command.mockImplementationOnce(
      () =>
        new Promise<Reply>((done) => {
          resolve = done;
        }),
    );
    const first = f.scoped.command(answer);
    await f.scoped.command(answer);
    expect(f.command).toHaveBeenCalledOnce();
    expect(f.submitted).not.toHaveBeenCalled();
    live.ids = ['second'];
    resolve({ ok: true } as Reply);
    await first;
    expect(f.submitted).toHaveBeenCalledOnce();
  });
  it('retains a failed request for retry, including thrown failures and unacknowledged results', async () => {
    const f = fixture();
    f.command.mockResolvedValueOnce({ ok: false, error: '자금 부족' } as Reply);
    await f.scoped.command(answer);
    expect(f.failed).toHaveBeenLastCalledWith('자금 부족');
    f.command.mockRejectedValueOnce(new Error('worker unavailable'));
    await f.scoped.command(answer);
    expect(f.failed).toHaveBeenLastCalledWith(expect.stringContaining('다시 시도'));
    f.command.mockResolvedValueOnce(undefined as unknown as Reply);
    await f.scoped.command(answer);
    expect(f.submitted).not.toHaveBeenCalled();
    expect(live.ids).toContain('first');
    await f.scoped.command(answer);
    expect(f.submitted).toHaveBeenCalledOnce();
  });
  it('does not return on an acknowledgement that leaves the request unresolved or an unrelated command', async () => {
    const f = fixture();
    f.command.mockResolvedValueOnce({ ok: true } as Reply);
    await f.scoped.command(answer);
    expect(f.submitted).not.toHaveBeenCalled();
    await f.scoped.command({ type: 'read-inbox', id: 'another' });
    expect(f.submitted).not.toHaveBeenCalled();
  });
  it.each(['world', 'request'] as const)(
    'ignores a late completion after changing %s',
    async (change) => {
      const f = fixture();
      let resolve!: (reply: Reply) => void;
      f.command.mockImplementationOnce(
        () =>
          new Promise<Reply>((done) => {
            resolve = done;
          }),
      );
      const pending = f.scoped.command(answer);
      if (change === 'world') f.client.state.view = { world: { id: 'new-world' } } as View;
      else f.current.mockReturnValue(false);
      resolve({ ok: true } as Reply);
      await pending;
      expect(f.submitted).not.toHaveBeenCalled();
      await f.scoped.command(answer);
      expect(f.command).toHaveBeenCalledOnce();
    },
  );
  it.each(['busy', 'processing', 'clockRunning', 'pendingActions', 'readonly', 'error'] as const)(
    'retains the %s protection',
    async (key) => {
      const f = fixture();
      Object.assign(f.client.state, {
        [key]: key === 'error' ? 'failure' : key === 'pendingActions' ? 1 : true,
      });
      await f.scoped.command(answer);
      expect(f.command).not.toHaveBeenCalled();
    },
  );
  it('retains critical and bankruptcy protection even when a stale control is invoked', async () => {
    const f = fixture();
    Object.assign(f.client.state.view!.world, { critical: { title: 'critical' } });
    await f.scoped.command(answer);
    Object.assign(f.client.state.view!.world, { critical: undefined, bankrupt: true });
    await f.scoped.command(answer);
    expect(f.command).not.toHaveBeenCalled();
  });
});
