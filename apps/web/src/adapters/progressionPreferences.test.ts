import { describe, expect, it } from 'vitest';
import { ProgressionPreferences } from './progressionPreferences';

describe('mode explanation preference', () => {
  it('starts with explanations, remembering one choice across instances', () => {
    const data = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    });
    const preference = new ProgressionPreferences(storage);
    expect(preference.skipExplanation()).toBe(false);
    preference.remember();
    expect(new ProgressionPreferences(storage).skipExplanation()).toBe(true);
  });
  it('ignores unknown persisted values and keeps a choice in denied storage for the session', () => {
    expect(
      new ProgressionPreferences(() => ({
        getItem: () => 'unknown',
        setItem: () => {},
      })).skipExplanation(),
    ).toBe(false);
    const preference = new ProgressionPreferences(() => {
      throw new Error('denied');
    });
    expect(preference.skipExplanation()).toBe(false);
    preference.remember();
    expect(preference.skipExplanation()).toBe(true);
  });
});
