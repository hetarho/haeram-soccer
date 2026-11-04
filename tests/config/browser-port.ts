import { execFileSync } from 'node:child_process';

/** Asks the kernel for a port nothing holds, then lets it go for the web server to take. */
const PROBE =
  "const s=require('node:net').createServer();s.listen(0,()=>{process.stdout.write(String(s.address().port));s.close()})";

export function freePort(): number {
  return Number(execFileSync(process.execPath, ['-e', PROBE], { encoding: 'utf8' }));
}

/**
 * The browser runs' web server port. Playwright starts `webServer` before `globalSetup`, so the
 * e2e lock never covers the port: with a fixed 4173, a batch gate failed at once ("already used")
 * while another checkout's or a left-over preview held it. A port the caller sets is kept;
 * otherwise the run takes a free one and publishes it, so the workers that reload the config
 * share it.
 */
export function browserTestPort(env: NodeJS.ProcessEnv = process.env, pick = freePort): number {
  const port = Number(env.BROWSER_TEST_PORT) || pick();
  env.BROWSER_TEST_PORT = String(port);
  return port;
}
