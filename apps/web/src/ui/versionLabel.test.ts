import { describe, expect, it } from 'vitest';
import { CURRENT_ENGINE_VERSION } from '../../../../packages/contracts/src/versions';
import { BETA_MARK, isBetaVersion, shortVersion, versionLabel } from './versionLabel';

describe('the BETA mark and game version label (→WEB-101, SAVE-10)', () => {
  it('reads v0.7 BETA from the version constant', () => {
    expect(CURRENT_ENGINE_VERSION).toBe('0.7.0');
    expect(versionLabel()).toBe('v0.7 BETA');
    expect(versionLabel()).toBe(`v${shortVersion(CURRENT_ENGINE_VERSION)} ${BETA_MARK}`);
    expect(BETA_MARK).toBe('BETA');
  });

  it('prints major.minor of whatever version it is given, never a fixed string', () => {
    expect(shortVersion('0.8.3')).toBe('0.8');
    expect(versionLabel('0.12.1')).toBe('v0.12 BETA');
  });

  it('is a beta until 1.0', () => {
    expect(isBetaVersion()).toBe(true);
    expect(isBetaVersion('0.99.9')).toBe(true);
    expect(isBetaVersion('1.0.0')).toBe(false);
  });
});
