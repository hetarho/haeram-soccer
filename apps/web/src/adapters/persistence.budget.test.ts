import { describe, expect, it, vi } from 'vitest';
import type { World } from '../../../../packages/contracts/src/types';
import type { EncodedPayload } from './compression';
import { encode } from './persistence';
import { INDEXED_CHECKPOINT_LIMIT, ACTIVE } from './repository';
const { encodePayload } = vi.hoisted(() => ({ encodePayload: vi.fn() }));
vi.mock('./compression', () => ({ encodePayload, decodePayload: vi.fn() }));
vi.mock('./packing', () => ({ pack: () => ({ synthetic: 'exact input' }), unpack: vi.fn() }));
const world = {
  id: 'world',
  engine: '0.7.0',
  catalog: 'catalog',
  catalogHash: '0'.repeat(64),
  ownMatches: [],
} as unknown as World;

describe('complete checkpoint encoding budgets', () => {
  it('accounts for the complete envelope and storage key at the exact UTF-16 boundary', async () => {
    let accepts: ((candidate: EncodedPayload) => boolean) | undefined;
    encodePayload.mockImplementation(async (_bytes, predicate) => {
      accepts = predicate;
      return { codec: 'gzip-cjk14', payload: 'x' };
    });
    const raw = await encode(world, 1, 0);
    const headerChars = raw.length - 1;
    const fits: EncodedPayload = {
      codec: 'gzip-cjk14',
      payload: 'x'.repeat(INDEXED_CHECKPOINT_LIMIT / 2 - ACTIVE.length - headerChars),
    };
    expect(accepts!(fits)).toBe(true);
    expect(accepts!({ ...fits, payload: fits.payload + 'x' })).toBe(false);
  });
  it('checks actual portable UTF-8 bytes as well as UTF-16 storage size', async () => {
    let accepts: ((candidate: EncodedPayload) => boolean) | undefined;
    encodePayload.mockImplementation(async (_bytes, predicate) => {
      accepts = predicate;
      return { codec: 'gzip-cjk14', payload: 'x' };
    });
    await encode(world, 1, 0);
    expect(accepts!({ codec: 'gzip-cjk14', payload: '한'.repeat(3_000_000) })).toBe(false);
  });
});
