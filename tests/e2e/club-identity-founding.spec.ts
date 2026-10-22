import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import {
  linkedIdentityColours,
  reduceIdentityDraft,
  type IdentityDraftAction,
} from '../../apps/web/src/ui/clubIdentityDraft';
import type { ClubIdentity } from '../../packages/contracts/src/identity';
import { clubIdentitySchema } from '../../packages/contracts/src/identitySchema';
import type { World } from '../../packages/contracts/src/types';
import { createIdentityDraft } from '../../packages/engine/src/club-identity';
import { createWorld } from '../../packages/engine/src/index';
import { chooseOption } from './select';
import { continueSlot, seedSlot } from './slots';

/**
 * KIT-14, WEB-15/86, SAVE-20: founding drafts one club design per session, the 꾸미기 editor
 * changes it only through an explicit 사용, and the founded club carries exactly that design
 * through reload and the slot screen. Evidence is the exported checkpoint, decoded.
 */

/** The representative main colour a founding session's design starts from. */
const FIRST_COLOUR = '#bf7956';
/** What `customise` does in the editor, as the editor's own draft actions. */
const CUSTOMISED: IdentityDraftAction[] = [
  // Upper-case on purpose: the stored spelling is kept (KIT-1).
  { type: 'kit-colour', role: 'home', colour: '#1D6F42' },
  { type: 'crest-preset', index: 4 },
  { type: 'shirt-pattern', role: 'away', pattern: 'halves' },
  { type: 'kit-colour', role: 'away', colour: '#E0218A' },
];

/** The design a founding session starts from: its seed and the first country, ENG. */
const sessionDraft = (seed: string) =>
  linkedIdentityColours(createIdentityDraft({ country: 'ENG', seed, color: FIRST_COLOUR }));
const customised = (seed: string) =>
  CUSTOMISED.reduce<ClubIdentity>(reduceIdentityDraft, sessionDraft(seed));

async function exportWorld(page: Page): Promise<World> {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '설정' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await downloading;
  const raw = await readFile((await file.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return (await decode(raw)).world;
}
const ownClub = (w: World) => w.clubs.find((club) => club.id === w.playerClub)!;

/** The seed this founding session was mounted with, read from the advanced settings. */
async function sessionSeed(founding: Locator) {
  await founding.getByText('고급 설정', { exact: true }).click();
  return founding.getByLabel('세계 생성 시드').inputValue();
}
const designEntry = (page: Page) =>
  page
    .getByTestId('club-founding')
    .getByRole('button', { name: '구단 디자인 꾸미기', exact: true });
/** Opens 꾸미기 and waits for the lazily loaded editor. */
async function openDesign(page: Page) {
  await designEntry(page).click();
  const editor = page.getByRole('dialog', { name: '구단 디자인' });
  await expect(editor.getByRole('group', { name: '색상', exact: true })).toBeVisible();
  return editor;
}
/** The editor steps of `CUSTOMISED`, through its real controls. */
async function customise(editor: Locator) {
  await editor.getByLabel('홈 색 코드', { exact: true }).fill('#1D6F42');
  await editor
    .getByRole('group', { name: '기본 엠블럼', exact: true })
    .getByRole('button', { name: '마름모 · 번개', exact: true })
    .click();
  await editor
    .getByRole('group', { name: '편집할 유니폼', exact: true })
    .getByRole('button', { name: '어웨이 유니폼', exact: true })
    .click();
  await editor
    .getByRole('group', { name: '어웨이 유니폼 무늬', exact: true })
    .getByRole('button', { name: '좌우 반반', exact: true })
    .click();
  await editor.getByLabel('어웨이 색 코드', { exact: true }).fill('#E0218A');
}
const useDesign = (editor: Locator) =>
  editor.getByRole('button', { name: '이 디자인 사용', exact: true }).click();

/** Canvas pixels within a small distance of `hex`: the painted shirts, not a legend. */
function colourPixels(canvas: Locator, hex: string) {
  return canvas.evaluate((element, hex) => {
    const c = element as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) <= 30)
        count++;
    return count;
  }, hex);
}

test('the exact previewed design is the founded identity after reload and continuing the slot', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const founding = page.getByTestId('club-founding');
  const seed = await sessionSeed(founding);
  const editor = await openDesign(page);
  // WEB-87: the pitch preview paints the shirt being edited while choosing, before 사용.
  const pitch = editor.getByRole('img', { name: '경기장 유니폼 미리보기' });
  const before = await colourPixels(pitch, '#E0218A');
  await customise(editor);
  await expect.poll(() => colourPixels(pitch, '#E0218A')).toBeGreaterThan(before + 20);
  await useDesign(editor);
  await expect(editor).toHaveCount(0);
  // The summary on the basic screen shows the used crest.
  await expect(designEntry(page).locator('svg rect').first()).toHaveAttribute('fill', '#1D6F42');
  // Reopening shows exactly the used design.
  const again = await openDesign(page);
  await expect(again.getByLabel('홈 색 코드', { exact: true })).toHaveValue('#1D6F42');
  await expect(
    again.getByRole('group', { name: '기본 엠블럼', exact: true }).getByRole('button', {
      name: '마름모 · 번개',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await again.getByRole('button', { name: '취소', exact: true }).click();
  await founding.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });

  const expected = customised(seed);
  const founded = await exportWorld(page);
  const club = ownClub(founded);
  expect(founded.seed).toBe(seed);
  expect(club.identity).toEqual(expected);
  // Founding.color is the design's main colour; no other colour was drawn for the club.
  expect(club.color).toBe('#1D6F42');
  expect(clubIdentitySchema.parse(club.identity)).toEqual(expected);

  // A reload continues the game, never flashing a founding form, with the same design.
  await page.addInitScript(() => {
    const audit = { seenFounding: false };
    (window as typeof window & { identityFoundingAudit: typeof audit }).identityFoundingAudit =
      audit;
    const check = () => {
      if (document.querySelector('[data-testid="club-founding"]')?.getClientRects().length)
        audit.seenFounding = true;
    };
    new MutationObserver(check).observe(document, { childList: true, subtree: true });
    check();
  });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { identityFoundingAudit: { seenFounding: boolean } })
          .identityFoundingAudit.seenFounding,
    ),
  ).toBe(false);
  expect(ownClub(await exportWorld(page)).identity).toEqual(expected);

  // Continuing the slot from the slot screen keeps it as well.
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page
    .getByRole('dialog', { name: '설정' })
    .getByRole('button', { name: '게임 슬롯', exact: true })
    .click();
  await continueSlot(page, 1);
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  expect(ownClub(await exportWorld(page)).identity).toEqual(expected);
});

test('founding without customising still gives the previewed draft with three complete shirts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const founding = page.getByTestId('club-founding');
  const seed = await sessionSeed(founding);
  await founding.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  const club = ownClub(await exportWorld(page));
  expect(club.identity).toEqual(sessionDraft(seed));
  expect(club.color).toBe(FIRST_COLOUR);
  const { kits } = clubIdentitySchema.parse(club.identity);
  expect(Object.keys(kits).sort()).toEqual(['away', 'home', 'third']);
  for (const shirt of Object.values(kits)) {
    expect(shirt.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
    if (shirt.pattern !== 'plain') expect(shirt.secondary).toMatch(/^#[0-9a-fA-F]{6}$/);
  }
});

test('changing seed and country keeps a customised design, and cancel restores the entry design', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const founding = page.getByTestId('club-founding');
  const seed = await sessionSeed(founding);
  const editor = await openDesign(page);
  await customise(editor);
  await useDesign(editor);
  // 취소 drops an unfinished edit: the design on editor entry stays.
  const cancelled = await openDesign(page);
  await cancelled.getByLabel('홈 색 코드', { exact: true }).fill('#000000');
  await cancelled.getByRole('button', { name: '취소', exact: true }).click();
  await expect(cancelled).toHaveCount(0);
  // Neither the seed nor the country rerolls the session's design.
  await founding.getByLabel('세계 생성 시드').fill('identity-founding-other-seed');
  await chooseOption(founding.getByRole('combobox', { name: '창단 국가', exact: true }), 'FRA');
  const kept = await openDesign(page);
  await expect(kept.getByLabel('홈 색 코드', { exact: true })).toHaveValue('#1D6F42');
  await kept
    .getByRole('group', { name: '편집할 유니폼', exact: true })
    .getByRole('button', { name: '어웨이 유니폼', exact: true })
    .click();
  await expect(
    kept.getByRole('group', { name: '어웨이 유니폼 무늬', exact: true }).getByRole('button', {
      name: '좌우 반반',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  // Closing without 사용 keeps the session design too.
  await kept.getByLabel('홈 색 코드', { exact: true }).fill('#000000');
  await page.keyboard.press('Escape');
  await expect(kept).toHaveCount(0);
  await founding.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  const founded = await exportWorld(page);
  expect(founded.seed).toBe('identity-founding-other-seed');
  expect(ownClub(founded).country).toBe('FRA');
  expect(ownClub(founded).identity).toEqual(customised(seed));
});

test('the design editor keeps every control reachable and returns focus to its entry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const entry = designEntry(page);
  await entry.focus();
  await page.keyboard.press('Enter');
  const editor = page.getByRole('dialog', { name: '구단 디자인' });
  await expect(editor.getByRole('group', { name: '색상', exact: true })).toBeVisible();
  // With the composer open every control the editor has is on screen.
  await editor.getByRole('button', { name: '직접 꾸미기', exact: true }).click();
  await expect(editor.getByRole('group', { name: '엠블럼 모양', exact: true })).toBeVisible();
  const misses = await editor.evaluate((dialog) => {
    const body = dialog.querySelector<HTMLElement>('[class*="modalBody"]')!;
    const found: string[] = [];
    const controls = dialog.querySelectorAll<HTMLElement>('button,input,summary,[role="combobox"]');
    for (const control of controls) {
      if (!control.getClientRects().length) continue;
      // Scrolling inside the dialog reaches the control (→WEB-63).
      control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = control.getBoundingClientRect();
      const room = body.contains(control)
        ? body.getBoundingClientRect()
        : new DOMRect(0, 0, innerWidth, innerHeight);
      const top = Math.max(room.top, 0);
      const bottom = Math.min(room.bottom, innerHeight);
      if (
        box.top < top - 1 ||
        box.bottom > bottom + 1 ||
        box.left < -1 ||
        box.right > innerWidth + 1 ||
        box.width < 44 ||
        box.height < 44
      )
        found.push(
          `${control.getAttribute('aria-label') || control.textContent} ${JSON.stringify(box)}`,
        );
    }
    return found;
  });
  expect(misses).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollTop)).toBe(0);
  await expect(editor.getByRole('button', { name: '이 디자인 사용', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await expect(editor.getByRole('button', { name: '취소', exact: true })).toBeInViewport({
    ratio: 1,
  });
  // Escape closes the editor onto its entry.
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(entry).toBeFocused();
  // So do 취소 and 사용.
  await page.keyboard.press('Enter');
  await editor.getByRole('button', { name: '취소', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(entry).toBeFocused();
  await page.keyboard.press('Enter');
  await useDesign(editor);
  await expect(editor).toHaveCount(0);
  await expect(entry).toBeFocused();
});

test('another founding slot starts from a clean design', async ({ page }) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSlot(
    page,
    createWorld({
      country: 'ENG',
      name: 'Parked Identity',
      color: FIRST_COLOUR,
      seed: 'parked-identity',
      level: 'easy',
    }),
  );
  await page.goto('/');
  const slots = page.getByTestId('game-slots');
  const founding = page.getByTestId('club-founding');
  await slots
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await expect(founding).toContainText('슬롯 2 · 새 게임');
  const editor = await openDesign(page);
  await customise(editor);
  await useDesign(editor);
  await expect(designEntry(page).locator('svg rect').first()).toHaveAttribute('fill', '#1D6F42');
  // Leaving that founding abandons its session; the next slot's founding starts its own.
  await founding.getByRole('button', { name: '← 게임 슬롯' }).click();
  await slots
    .getByRole('listitem', { name: '슬롯 3 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await expect(founding).toContainText('슬롯 3 · 새 게임');
  const seed = await sessionSeed(founding);
  const clean = await openDesign(page);
  await expect(clean.getByLabel('홈 색 코드', { exact: true })).toHaveValue(FIRST_COLOUR);
  await clean.getByRole('button', { name: '취소', exact: true }).click();
  await founding.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  expect(ownClub(await exportWorld(page)).identity).toEqual(sessionDraft(seed));
});

test('random crest selection keeps the three colours and persists the previewed composition', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const editor = await openDesign(page);
  const chosen = { home: '#123456', away: '#ABCDEF', third: '#5A2478' };
  await editor.getByLabel('홈 색 코드', { exact: true }).fill(chosen.home);
  await editor.getByLabel('어웨이 색 코드', { exact: true }).fill(chosen.away);
  await editor.getByLabel('세컨 색 코드', { exact: true }).fill(chosen.third);
  await editor.getByRole('button', { name: '직접 꾸미기', exact: true }).click();
  const parts = async () =>
    Promise.all(
      ['모양', '바탕 무늬', '엠블럼 모양'].map((name) =>
        editor
          .getByRole('group', { name, exact: true })
          .getByRole('button', { pressed: true })
          .getAttribute('aria-label'),
      ),
    );
  const before = await parts();
  await editor.getByRole('button', { name: '엠블럼 랜덤 선택', exact: true }).click();
  const after = await parts();
  expect(after).not.toEqual(before);
  await expect(editor.getByLabel('홈 색 코드', { exact: true })).toHaveValue(chosen.home);
  await expect(editor.getByLabel('어웨이 색 코드', { exact: true })).toHaveValue(chosen.away);
  await expect(editor.getByLabel('세컨 색 코드', { exact: true })).toHaveValue(chosen.third);
  await useDesign(editor);
  const again = await openDesign(page);
  if (
    (await again
      .getByRole('button', { name: '직접 꾸미기', exact: true })
      .getAttribute('aria-expanded')) === 'false'
  )
    await again.getByRole('button', { name: '직접 꾸미기', exact: true }).click();
  expect(await parts()).toEqual(after);
  await useDesign(again);
  await page.getByTestId('club-founding').getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  const identity = ownClub(await exportWorld(page)).identity!;
  expect(identity.colours).toEqual([chosen.home, chosen.away, chosen.third]);
  expect(identity.crest).toMatchObject({ primary: chosen.home, secondary: chosen.away });
  expect(identity.crest).not.toHaveProperty('accent');
  expect(
    Object.fromEntries(Object.entries(identity.kits).map(([role, shirt]) => [role, shirt.primary])),
  ).toEqual(chosen);
});
