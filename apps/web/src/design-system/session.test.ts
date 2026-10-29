import { afterEach, describe, expect, it, vi } from 'vitest';
import { isolatePreviewSession, memoryStorage } from './session';

afterEach(() => vi.unstubAllGlobals());
describe('isolated preview settings', () => {
  it('supports sample identifiers when LAN HTTP omits randomUUID', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    isolatePreviewSession(null);
    expect(crypto.randomUUID()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it('implements ephemeral browser storage, independently for every frame', () => {
    const a = memoryStorage(),
      b = memoryStorage();
    a.setItem('library', 'sample');
    expect(a.getItem('library')).toBe('sample');
    expect(b.getItem('library')).toBeNull();
    expect(a.length).toBe(1);
    expect(a.key(0)).toBe('library');
    a.removeItem('library');
    expect(a.length).toBe(0);
  });
  it('leaves existing settings/saves untouched and seeds only the requested theme', () => {
    const persisted = memoryStorage();
    persisted.setItem('game-save', 'original');
    vi.stubGlobal('window', { localStorage: persisted, sessionStorage: persisted });
    isolatePreviewSession('pixel');
    expect(window.localStorage).not.toBe(persisted);
    expect(window.localStorage.getItem('game-save')).toBeNull();
    expect(JSON.parse(window.localStorage.getItem('haeram-soccor:presentation')!)).toEqual({
      themeId: 'pixel',
    });
    window.localStorage.clear();
    expect(persisted.getItem('game-save')).toBe('original');
  });
});
