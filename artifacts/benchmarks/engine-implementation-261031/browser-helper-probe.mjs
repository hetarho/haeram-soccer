/** Production helper protocol on real browser workers, independent of existing UI journeys. */
import { build } from 'esbuild';
import { chromium, firefox, webkit } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const csp = /^\s*Content-Security-Policy:\s*(.+)$/m.exec(
  readFileSync(resolve(root, 'apps/web/public/_headers'), 'utf8'),
)[1];
const hostSource = `
import { found, day, canonical, HelperPool } from './scripts/perf/helper-workloads';
self.onmessage = async ({ data }) => {
  try {
    let snapshots = 0, patches = 0;
    const ports = data.ports.map(port => ({
      get onmessage() { return port.onmessage; },
      set onmessage(value) { port.onmessage = value; },
      postMessage(job) {
        if (job.copy !== undefined) snapshots++;
        if (job.patch !== undefined) patches++;
        port.postMessage(job);
      },
    }));
    const serial = new HelperPool([]), pool = new HelperPool(ports);
    let reference = found('browser-helper-parity'), helped = structuredClone(reference);
    for (let n = 1; n <= 43; n++) {
      if (n === 22) {
        reference = structuredClone(reference);
        helped = structuredClone(helped);
      }
      await day(reference, serial);
      await day(helped, pool);
      if (canonical(helped) !== canonical(reference)) throw new Error('World differs on day ' + n);
    }
    if (!pool.active || snapshots < 4 || !patches) throw new Error('Helpers did not retain active replicas');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(helped)));
    self.postMessage({ days: 43, snapshots, patches, active: pool.active,
      hash: [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('') });
    pool.dispose();
  } catch (error) { self.postMessage({ error: String(error) }); }
};`;
const options = { absWorkingDir: root, bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'error' };
const [host, helper] = await Promise.all([
  build({ ...options, stdin: { contents: hostSource, resolveDir: root, sourcefile: 'browser-helper-host.ts', loader: 'ts' } }),
  build({ ...options, entryPoints: ['apps/web/src/runtime/fixtureHelper.ts'] }),
]);
const files = new Map([
  ['/host.mjs', host.outputFiles[0].text],
  ['/helper.mjs', helper.outputFiles[0].text],
]);
const server = createServer((request, response) => {
  const source = files.get(request.url);
  response.writeHead(200, { 'Content-Type': source ? 'text/javascript' : 'text/html', 'Content-Security-Policy': csp });
  response.end(source ?? '<!doctype html><title>Production helper parity</title>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const results = [];
try {
  for (const [name, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]]) {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      await page.goto(address);
      const result = await page.evaluate(() => new Promise((resolve, reject) => {
        const host = new Worker('/host.mjs', { type: 'module' });
        const helpers = [0, 1].map(() => new Worker('/helper.mjs', { type: 'module' }));
        const stop = () => { host.terminate(); for (const worker of helpers) worker.terminate(); };
        const timer = setTimeout(() => { stop(); reject(new Error('Browser helper probe timed out')); }, 60000);
        const fail = error => { clearTimeout(timer); stop(); reject(error); };
        for (const worker of [host, ...helpers]) worker.onerror = event => fail(new Error(event.message));
        host.onmessage = event => {
          clearTimeout(timer); stop();
          if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data);
        };
        const ports = helpers.map(worker => {
          const channel = new MessageChannel();
          worker.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
          return channel.port2;
        });
        host.postMessage({ ports }, ports);
      }));
      results.push({ browser: name, ...result });
      console.log(JSON.stringify(results.at(-1)));
    } finally { await browser.close(); }
  }
  if (new Set(results.map(r => r.hash)).size !== 1) throw new Error('Cross-browser world hashes differ');
  const at = process.argv.indexOf('--json');
  if (at >= 0) writeFileSync(process.argv[at + 1], JSON.stringify({ csp, results }, null, 2) + '\n');
} finally { await new Promise(resolve => server.close(resolve)); }
