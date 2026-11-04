import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { browserTestPort, freePort } from './browser-port';

describe('browser test port', () => {
  it('keeps the port the caller set', () => {
    const env: NodeJS.ProcessEnv = { BROWSER_TEST_PORT: '4497' };
    expect(browserTestPort(env, () => 1)).toBe(4497);
  });

  it('picks one port and publishes it for the workers', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(browserTestPort(env, () => 45123)).toBe(45123);
    expect(env.BROWSER_TEST_PORT).toBe('45123');
    expect(browserTestPort(env, () => 1)).toBe(45123);
  });

  it('picks a port the web server can take', async () => {
    const port = freePort();
    expect(port).toBeGreaterThan(0);
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, resolve);
    });
    await new Promise((resolve) => server.close(resolve));
  });
});
