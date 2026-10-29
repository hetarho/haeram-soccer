import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { componentSource, GROUPS, matchingStories, previewAddress, STORIES } from './catalog';

describe('design-system catalog', () => {
  it('has unique shareable addresses and real component source paths', () => {
    expect(new Set(STORIES.map((story) => story.id)).size).toBe(STORIES.length);
    for (const story of STORIES) {
      expect(story.components.length).toBeGreaterThan(0);
      for (const component of story.components)
        expect(
          existsSync(new URL(`../../${componentSource(component)}`, import.meta.url)),
          component,
        ).toBe(true);
    }
    expect(GROUPS).toHaveLength(7);
  });
  it('finds screen copy and component source names without case sensitivity', () => {
    expect(matchingStories('select').map((story) => story.id)).toContain('controls');
    expect(matchingStories('PLAYERPROFILE').map((story) => story.id)).toContain('profile');
    expect(matchingStories('선수 프로필').map((story) => story.id)).toContain('profile');
    expect(matchingStories('', '기본 UI').every((story) => story.group === '기본 UI')).toBe(true);
    expect(matchingStories('존재하지않는컴포넌트')).toEqual([]);
  });
  it('preserves real screen paths and selectors in isolated frame addresses', () => {
    const roster = STORIES.find((story) => story.id === 'roster')!;
    const url = new URL(previewAddress(roster, 'pixel'), 'http://localhost');
    expect(url.pathname).toBe('/first-team');
    expect(url.searchParams.get('view')).toBe('players');
    expect(url.searchParams.get('__design_system')).toBe('roster');
    expect(url.searchParams.get('theme')).toBe('pixel');
  });
});
