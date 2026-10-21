import { describe, expect, it, vi } from 'vitest';
import { PresentationPreferencesStore } from './presentationPreferences';

describe('presentation preferences outside game saves', () => {
  it('restores a registered selection without reading game checkpoints', () => {
    const getItem = vi.fn(() => JSON.stringify({ localeId: 'ko-KR', themeId: 'pixel' }));
    const setItem = vi.fn();
    const store = new PresentationPreferencesStore(() => ({ getItem, setItem }));
    expect(store.read()).toEqual({ localeId: 'ko-KR', themeId: 'pixel' });
    expect(getItem).toHaveBeenCalledExactlyOnceWith('haeram-soccor:presentation');
    expect(store.write({ localeId: 'fr', themeId: 'unseen-theme' })).toBe(true);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(
      'haeram-soccor:presentation',
      JSON.stringify({ localeId: 'fr', themeId: 'unseen-theme' }),
    );
  });

  it('uses session settings when storage is denied', () => {
    const store = new PresentationPreferencesStore(() => {
      throw new Error('denied');
    });
    expect(store.read()).toEqual({});
    expect(store.write({ localeId: 'ko-KR', themeId: 'pixel' })).toBe(false);
    expect(store.read()).toEqual({ localeId: 'ko-KR', themeId: 'pixel' });
    expect(store.sessionOnly).toBe(true);
  });

  it.each(['{invalid', '[]', 'null', '42', '{"localeId":"../bad","themeId":42}'])(
    'ignores malformed setting data: %s',
    (raw) => {
      const store = new PresentationPreferencesStore(() => ({
        getItem: () => raw,
        setItem: vi.fn(),
      }));
      expect(store.read()).toEqual({});
      expect(store.write({ localeId: 'ko-KR', themeId: 'pixel' })).toBe(true);
    },
  );
});
