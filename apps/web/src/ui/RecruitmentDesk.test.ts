import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorld, transferOffers } from '../../../../packages/engine/src/index';
import { lineOf } from '../../../../packages/engine/src/player';
import { recruitmentPreview } from '../../../../packages/engine/src/recruitment';
import type { ClientState, GameClient } from '../runtime/client';
import { initialClientState } from '../runtime/store';
import { RecruitmentDesk } from './RecruitmentDesk';

const { choices } = vi.hoisted(() => ({ choices: {} as Record<string, unknown> }));
vi.mock('./taskMemory', () => ({
  useTaskState: (_world: string, key: string, initial: unknown) => [
    choices[key] ?? initial,
    vi.fn(),
  ],
}));
vi.mock('../runtime/store', async (original) => ({
  ...(await original<typeof import('../runtime/store')>()),
  useGameState: (selector: (state: ClientState) => unknown) => selector(initialClientState),
}));

const w = createWorld({
  country: 'ENG',
  name: 'Market Town',
  color: '#224433',
  seed: 'compact-market',
  level: 'easy',
});
const offers = transferOffers(w);
function render(transfers = offers) {
  const state = { view: { world: w, transfers } } as ClientState;
  return renderToStaticMarkup(createElement(RecruitmentDesk, { state, client: {} as GameClient }));
}
const ids = (markup: string) =>
  [...markup.matchAll(/data-candidate-id="([^"]+)"/g)].map((match) => match[1]);

beforeEach(() => {
  for (const key of Object.keys(choices)) delete choices[key];
});

describe('compact transfer market', () => {
  it('renders every candidate in a semantic table with controls instead of expanded panels', () => {
    const markup = render();
    expect(markup).toContain('<table');
    expect(markup).toContain('aria-label="영입 후보 목록"');
    expect(ids(markup).sort()).toEqual(offers.map((offer) => offer.player.id).sort());
    for (const offer of offers)
      expect(markup).toContain(`aria-label="${offer.player.name} 상세 보기"`);
    expect(markup).toContain('aria-label="영입 필터"');
    expect(markup).toContain('aria-label="영입 정보 · 필요한 영입과 감독 요청"');
    expect(markup).toContain('aria-label="이적 협상 · 0건 진행 중"');
    expect(markup).not.toContain('<article');
    expect(markup).not.toContain('지금 필요한 영입</h3>');
    expect(markup).not.toContain('영입 기조 ·');
    expect(markup).not.toContain('영입 포지션 선택');
    const extended = [
      ...offers,
      ...offers.map((offer) => ({
        ...offer,
        player: { ...offer.player, id: `${offer.player.id}:extra` },
      })),
    ];
    expect(ids(render(extended)).sort()).toEqual(extended.map((offer) => offer.player.id).sort());
  });

  it('preserves role filtering and potential sorting without dropping matching candidates', () => {
    choices['market-role'] = 'GK';
    choices['market-order'] = 'potential';
    const expected = offers
      .filter((offer) => lineOf(offer.player.position) === 'GK')
      .sort(
        (a, b) => b.player.potential - a.player.potential || a.player.id.localeCompare(b.player.id),
      );
    expect(ids(render())).toEqual(expected.map((offer) => offer.player.id));
  });

  it('preserves exact fee order and the existing positive-impact filter', () => {
    choices['market-order'] = 'fee';
    choices['market-boost'] = true;
    const expected = offers
      .filter((offer) => {
        const preview = recruitmentPreview(w, offer);
        return preview.strengthDelta > 0 || preview.fitDelta > 0;
      })
      .sort((a, b) =>
        BigInt(a.fee) < BigInt(b.fee)
          ? -1
          : BigInt(a.fee) > BigInt(b.fee)
            ? 1
            : a.player.id.localeCompare(b.player.id),
      );
    expect(ids(render())).toEqual(expected.map((offer) => offer.player.id));
  });

  it('keeps comparison selections available when the selected rows are filtered out', () => {
    choices['market-role'] = 'FW';
    choices['market-comparison'] = offers.slice(0, 2).map((offer) => offer.player.id);
    const markup = render();
    expect(markup).toMatch(/<button[^>]*aria-label="선택한 2명 비교"[^>]*>/);
    expect(markup.match(/<button[^>]*aria-label="선택한 2명 비교"[^>]*>/)?.[0]).not.toContain(
      'disabled',
    );
  });

  it('shows an actionable empty state and no candidate controls for an empty list', () => {
    const markup = render([]);
    expect(ids(markup)).toEqual([]);
    expect(markup).toContain('이 조건에 맞는 후보가 없어요. 필터를 바꿔보세요.');
    expect(markup).toContain('aria-label="영입 필터"');
  });
});
