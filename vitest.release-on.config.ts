import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.ts';

// The unit run with the release switch on (tests/setup/release-on.ts). Since T286 the source
// declares the switch on, so this run equals `test:unit`; it stays for probing a later release.
export default mergeConfig(
  base,
  defineConfig({ test: { setupFiles: ['tests/setup/release-on.ts'] } }),
);
