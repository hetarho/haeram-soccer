import { describe, expect, it } from 'vitest';
import { prepareRelease, RELEASE_MANIFESTS, RULES_SOURCE } from './release-version';

function documents(): Record<string, string> {
  return {
    ...Object.fromEntries(
      RELEASE_MANIFESTS.map((file) => [
        file,
        JSON.stringify({ name: file, version: '0.8.0', private: true }),
      ]),
    ),
    [RULES_SOURCE]:
      "export const CURRENT_ENGINE_VERSION = '0.8.0';\n" +
      'export const COMPATIBLE_ENGINE_VERSIONS: readonly string[] = [];\n',
  };
}

describe('compatible release preparation', () => {
  it('synchronizes all five manifests and retains the previous explicit rules label', () => {
    const source = documents();
    const before = structuredClone(source);
    const prepared = prepareRelease(source);
    expect(prepared.version).toBe('0.8.1');
    for (const file of RELEASE_MANIFESTS)
      expect(JSON.parse(prepared.files[file]!)).toEqual({
        name: file,
        version: '0.8.1',
        private: true,
      });
    expect(prepared.files[RULES_SOURCE]).toContain("CURRENT_ENGINE_VERSION = '0.8.1'");
    expect(prepared.files[RULES_SOURCE]).toContain("readonly string[] = ['0.8.0']");
    expect(source).toEqual(before);
    const again = prepareRelease(prepared.files);
    expect(again.version).toBe('0.8.2');
    expect(again.files[RULES_SOURCE]).toContain("['0.8.0', '0.8.1']");
  });

  it('advances beyond an already bumped root without copying its mismatch', () => {
    const source = documents();
    source['package.json'] = '{"name":"root","version":"0.8.3"}';
    expect(prepareRelease(source).version).toBe('0.8.4');
  });

  it.each(['0.8.0', '0.9.0', '1.0.0', '0.8.1-next', '0.08.1'])(
    'rejects a non-forward or non-patch target %s without editing input',
    (version) => {
      const source = documents();
      const before = structuredClone(source);
      expect(() => prepareRelease(source, version)).toThrow();
      expect(source).toEqual(before);
    },
  );

  it('requires every manifest and the explicit compatibility declaration before editing', () => {
    const source = documents() as Record<string, string>;
    delete source[RELEASE_MANIFESTS[4]];
    expect(() => prepareRelease(source)).toThrow();
    source[RELEASE_MANIFESTS[4]] = '{"version":"0.8.0"}';
    source[RULES_SOURCE] = "export const CURRENT_ENGINE_VERSION = '0.8.0';";
    expect(() => prepareRelease(source)).toThrow();
  });
});
