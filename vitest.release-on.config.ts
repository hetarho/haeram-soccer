import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config.ts';

// The unit run with the release switch on (tests/setup/release-on.ts), before the switch flips.
export default mergeConfig(
  base,
  defineConfig({ test: { setupFiles: ['tests/setup/release-on.ts'] } }),
);
