import { describe, expect, it } from 'vitest';
import root from '../../../package.json';
import web from '../../../apps/web/package.json';
import catalogs from '../../catalogs/package.json';
import engine from '../../engine/package.json';
import contracts from '../package.json';
import { MATCH_MODEL_REVISION } from './match-model';
import type { World } from './types';
import {
  CONTINUED_ENGINE_VERSION,
  CURRENT_ENGINE_VERSION,
  earlierRulesMessage,
  envelopeEngine,
  isEarlierEngine,
  LEGACY_ENGINE_VERSIONS,
  NEWER_GAME_MESSAGE,
  SaveCompatibilityError,
  SUPPORTED_ENGINE_VERSIONS,
  upgradeWorldRules,
} from './versions';

const PIN = { catalog: '2026-demo-3', catalogHash: 'h' };
/** The facts a rules upgrade must carry as stored, on a career small enough to compare whole. */
const career = (engine: string) =>
  ({
    schema: 1,
    engine,
    ...PIN,
    id: 'world',
    revision: 41,
    year: 1962,
    round: 6,
    ownMatches: [{ id: 'f:1', year: 1962, round: 3, score: { home: 1, away: 0 } }],
    matchModel: { revision: MATCH_MODEL_REVISION },
  }) as unknown as World;

describe('game version 0.7.0 (→SAVE-10)', () => {
  it('is every package version and the rules a world plays', () => {
    expect(CURRENT_ENGINE_VERSION).toBe('0.7.0');
    for (const pkg of [root, web, contracts, engine, catalogs])
      expect(pkg.version).toBe(CURRENT_ENGINE_VERSION);
    // Only the current version and the rules-4.0.0 label it continues, no older range.
    expect(SUPPORTED_ENGINE_VERSIONS).toEqual([CURRENT_ENGINE_VERSION, CONTINUED_ENGINE_VERSION]);
    expect(CONTINUED_ENGINE_VERSION).toBe('4.0.0');
  });

  it('a rules-4.0.0 checkpoint loads and is written as 0.7.0, its facts unchanged', () => {
    const stored = career('4.0.0');
    const before = structuredClone(stored);
    const upgraded = upgradeWorldRules(stored, PIN);
    expect(upgraded).toEqual({ ...before, engine: '0.7.0', revision: before.revision + 1 });
    // Every retained fact is carried as stored, and the stored world is not touched.
    expect(upgraded.ownMatches).toBe(stored.ownMatches);
    expect(upgraded.matchModel).toBe(stored.matchModel);
    expect(stored).toEqual(before);
    // The upgraded career is current: a second activation changes nothing.
    expect(upgradeWorldRules(upgraded, PIN)).toBe(upgraded);
    expect(isEarlierEngine('4.0.0')).toBe(false);
    expect(LEGACY_ENGINE_VERSIONS).not.toContain('4.0.0');
    expect(envelopeEngine('{"schema":4,"engine":"4.0.0"}')).toBe('4.0.0');
  });

  it('keeps every released earlier version as earlier rules, refused with its message', () => {
    expect(LEGACY_ENGINE_VERSIONS).toContain('1.0.0');
    expect(LEGACY_ENGINE_VERSIONS).toContain('1.22.0');
    expect(LEGACY_ENGINE_VERSIONS).toContain('2.0.0');
    expect(LEGACY_ENGINE_VERSIONS).toContain('3.0.0');
    expect(LEGACY_ENGINE_VERSIONS).not.toContain(CURRENT_ENGINE_VERSION);
    for (const legacy of LEGACY_ENGINE_VERSIONS) {
      expect(isEarlierEngine(legacy)).toBe(true);
      expect(() => upgradeWorldRules(career(legacy), PIN)).toThrow(SaveCompatibilityError);
    }
    expect(earlierRulesMessage('1.22.0')).toBe(
      '이 저장은 규칙 1.22.0 커리어입니다 — 게임 버전 0.7.0 커리어만 열 수 있습니다. 새 커리어를 시작하세요',
    );
  });

  it('an unknown engine version is refused as from a newer game', () => {
    // Neither current, the 4.0.0 label nor a released earlier version, whatever its number.
    for (const unknown of ['9.0.0', '0.8.0', '0.6.0', '4.0.1', '1.9.9', '1.23.0', 'x.y.z']) {
      expect(isEarlierEngine(unknown)).toBe(false);
      const stored = career(unknown);
      const before = structuredClone(stored);
      expect(() => upgradeWorldRules(stored, PIN)).toThrow(SaveCompatibilityError);
      expect(stored).toEqual(before);
    }
    expect(NEWER_GAME_MESSAGE).toContain('지원하지 않는 저장');
    expect(NEWER_GAME_MESSAGE).toContain('게임 버전 0.7.0보다 새로운 게임');
  });
});
