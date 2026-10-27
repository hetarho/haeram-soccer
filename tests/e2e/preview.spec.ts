import { openCurrentClubSeason } from './record-navigation';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('built deep links, module worker, cache/CSP and missing assets', async ({ page, request }) => {
  test.skip(!process.env.PREVIEW_BUILD, 'Production preview gate');
  await page.goto('/');
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: '클럽 기록실', exact: true })).toBeVisible();
  // A records tab keeps its own address, so a reload reopens it.
  await openCurrentClubSeason(page);
  await expect(page).toHaveURL(/\/history\?section=club&season=1950$/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
  const html = await request.get('/history');
  expect(html.status()).toBe(200);
  expect(html.headers()['cache-control']).toBe('no-cache');
  expect(html.headers()['content-security-policy']).toContain("worker-src 'self'");
  for (const path of [
    '/season?competition=cup',
    '/first-team?view=training',
    '/academy',
    '/staff?view=coaches',
    '/history?section=league',
  ]) {
    const route = await request.get(path);
    expect(route.status(), path).toBe(200);
    expect(route.headers()['cache-control'], path).toBe('no-cache');
    expect(await route.text(), path).toMatch(/src="[^"\n]+\.js"/);
  }
  const entry = await request.get('/');
  const asset = (await entry.text()).match(/src="([^"]+\.js)"/)![1];
  const js = await request.get(asset);
  expect(js.status()).toBe(200);
  expect(js.headers()['content-type']).toContain('javascript');
  expect(js.headers()['cache-control']).toContain('immutable');
  expect((await request.get('/assets/never-existed.js')).status()).toBe(404);
});
test('serves the _headers set', async ({ request }) => {
  test.skip(!process.env.PREVIEW_BUILD, 'Production preview gate');
  // What Netlify would send per path: every block whose pattern matches, later ones winning.
  const blocks: { pattern: string; headers: [string, string][] }[] = [];
  const file = new URL('../../apps/web/dist/_headers', import.meta.url);
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const [, indent, rest] = line.match(/^(\s*)(.*)$/)!;
    if (!indent) blocks.push({ pattern: rest.trim(), headers: [] });
    else {
      const [key, ...value] = rest.split(':');
      blocks.at(-1)!.headers.push([key.trim().toLowerCase(), value.join(':').trim()]);
    }
  }
  const declared = (pathname: string) =>
    Object.fromEntries(
      blocks
        .filter(({ pattern }) =>
          pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern,
        )
        .flatMap(({ headers }) => headers),
    );
  const entry = await request.get('/');
  const asset = (await entry.text()).match(/src="([^"]+\.js)"/)![1];
  expect(asset).toMatch(/^\/assets\//);
  for (const pathname of ['/', '/history/1951', asset]) {
    const expected = declared(pathname);
    expect(Object.keys(expected)).toEqual(
      expect.arrayContaining(['permissions-policy', 'content-security-policy', 'cache-control']),
    );
    const response = await request.get(pathname);
    expect(response.status(), pathname).toBe(200);
    const received = response.headers();
    for (const [name, value] of Object.entries(expected))
      expect(received[name], `${pathname} ${name}`).toBe(value);
  }
});
