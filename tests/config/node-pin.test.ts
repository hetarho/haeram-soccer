import { expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const pinned = readFileSync('.node-version', 'utf8').trim();

/** `NODE_VERSION` from `netlify.toml`'s `[build.environment]` table, if it sets one. */
function netlifyNodeVersion(toml: string): string | undefined {
  let table = '';
  for (const raw of toml.split('\n')) {
    const line = raw.trim();
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) table = header[1]!.trim();
    else if (table === 'build.environment') {
      const value = /^NODE_VERSION\s*=\s*"([^"]*)"/.exec(line);
      if (value) return value[1];
    }
  }
  return undefined;
}

/** Every `actions/setup-node` step in a workflow and whether it reads `.node-version`. */
function setupNodeSteps(yaml: string): { readsPin: boolean; pinsVersion: boolean }[] {
  const lines = yaml.split('\n');
  const steps: { readsPin: boolean; pinsVersion: boolean }[] = [];
  lines.forEach((line, index) => {
    const step = /^(\s*)- uses: actions\/setup-node@/.exec(line);
    if (!step) return;
    const indent = step[1]!.length;
    const body: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() && next.length - next.trimStart().length <= indent) break;
      body.push(next.trim());
    }
    steps.push({
      readsPin: body.includes('node-version-file: .node-version'),
      pinsVersion: body.some((item) => item.startsWith('node-version:')),
    });
  });
  return steps;
}

it('reads the Netlify Node version from the [build.environment] table only', () => {
  expect(netlifyNodeVersion('[build]\n  command = "x"\n')).toBeUndefined();
  expect(netlifyNodeVersion('[build.environment]\n  NODE_VERSION = "24.12.0"\n')).toBe('24.12.0');
  expect(netlifyNodeVersion('[context.production.environment]\n  NODE_VERSION = "1"\n')).toBe(
    undefined,
  );
  expect(
    setupNodeSteps(
      '    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 24\n      - run: x\n',
    ),
  ).toEqual([{ readsPin: false, pinsVersion: true }]);
});

it('keeps .node-version the one Node pin for Netlify, engines and CI', () => {
  expect(pinned).toMatch(/^\d+\.\d+\.\d+$/);
  const netlify = netlifyNodeVersion(readFileSync('netlify.toml', 'utf8'));
  if (netlify !== undefined) expect(netlify, 'netlify.toml NODE_VERSION').toBe(pinned);
  const engines = (
    JSON.parse(readFileSync('package.json', 'utf8')) as { engines?: { node?: string } }
  ).engines?.node;
  expect(engines, 'package.json engines.node').toBe(`>=${pinned}`);
  const workflows = readdirSync('.github/workflows').filter((file) => /\.ya?ml$/.test(file));
  expect(workflows.length).toBeGreaterThan(0);
  for (const file of workflows) {
    const steps = setupNodeSteps(readFileSync(join('.github/workflows', file), 'utf8'));
    for (const step of steps)
      expect(step, `${file} setup-node`).toEqual({ readsPin: true, pinsVersion: false });
  }
});
