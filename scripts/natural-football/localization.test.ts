import { afterEach, expect, it } from 'vitest';
import { createLoadedLocale } from '../../apps/web/src/presentation/locale';
import { displayMessage, setTextLocale } from '../../apps/web/src/presentation/text';
import type { PackRegistry } from '../../apps/web/src/presentation/contracts';

const registry: PackRegistry<'locale'> = {
  schemaVersion: 1,
  defaultId: 'ko-KR',
  entries: [
    { id: 'ko-KR', label: '한국어', resource: 'ko.json', direction: 'ltr' },
    { id: 'en-GB', label: 'English', resource: 'en.json', direction: 'ltr' },
  ],
};
afterEach(() => setTextLocale());
it('keeps club names and seed IDs verbatim even when they resemble translated source labels', () => {
  const ko = {
    schemaVersion: 1 as const,
    id: 'ko-KR',
    messages: {
      'naturalFootball.match': '{home} 대 {away}',
      'naturalFootball.provenance': '{seed} · {sha}',
      'copy.Pitch.d43a776c5e': '재생',
    },
  };
  const en = {
    schemaVersion: 1 as const,
    id: 'en-GB',
    messages: {
      'naturalFootball.match': '{home} v {away}',
      'naturalFootball.provenance': '{seed} · {sha}',
      'copy.Pitch.d43a776c5e': 'play',
    },
  };
  setTextLocale(createLoadedLocale(registry, en, ko));
  expect(displayMessage('naturalFootball.match', { home: '재생', away: 'away' })).toBe(
    '재생 v away',
  );
  expect(displayMessage('naturalFootball.provenance', { seed: '재생', sha: 'abc123' })).toBe(
    '재생 · abc123',
  );
});
