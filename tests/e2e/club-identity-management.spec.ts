import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import {
  reduceIdentityDraft,
  type IdentityDraftAction,
} from '../../apps/web/src/ui/clubIdentityDraft';
import type { ClubIdentity } from '../../packages/contracts/src/identity';
import type { World } from '../../packages/contracts/src/types';
import { continueSlot } from './slots';

/**
 * KIT-9/10/12, WEB-39/71/74/86, SAVE-20: 구단 운영 › 구단 디자인 keeps a per-career draft until an
 * explicit 되돌리기 or a successful 적용, and 적용 is one club-identity command. Evidence is the
 * exported checkpoint, decoded, and the commands the page actually sends its engine worker.
 */

const NAME = 'Identity Works FC';
/** The founding screen's first representative colour (T250). */
const FIRST_COLOUR = '#bf7956';

interface IdentityProbe {
  sent: number;
  stale: number;
}
type ProbeWindow = typeof window & { identityProbe: IdentityProbe };
/**
 * Counts the club-identity commands this page sends its engine worker. Setting `stale` makes the
 * next one carry an outdated world revision, which the host refuses before any effect (→SAVE-6).
 */
async function watchIdentityCommands(page: Page) {
  await page.addInitScript(() => {
    const probe = { sent: 0, stale: 0 };
    (window as ProbeWindow).identityProbe = probe;
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (
      this: Worker,
      message: unknown,
      transfer?: Transferable[] | StructuredSerializeOptions,
    ) {
      const request = message as {
        expectedRevision?: number;
        body?: { type?: string; command?: { type?: string } };
      } | null;
      if (request?.body?.type === 'command' && request.body.command?.type === 'club-identity') {
        probe.sent++;
        if (probe.stale > 0) {
          probe.stale--;
          message = { ...request, expectedRevision: (request.expectedRevision ?? 0) - 1 };
        }
      }
      Reflect.apply(post, this, transfer === undefined ? [message] : [message, transfer]);
    } as typeof post;
  });
}
const commands = (page: Page) => page.evaluate(() => (window as ProbeWindow).identityProbe.sent);

async function exportRaw(page: Page) {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  const menu = page.getByRole('dialog', { name: '전체 메뉴' });
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const file = await downloading;
  const raw = await readFile((await file.path())!, 'utf8');
  await menu.getByRole('button', { name: '창 닫기', exact: true }).click();
  return raw;
}
const exportWorld = async (page: Page): Promise<World> =>
  (await decode(await exportRaw(page))).world;
const ownClub = (w: World) => w.clubs.find((club) => club.id === w.playerClub)!;
const ownIdentity = async (page: Page) => ownClub(await exportWorld(page)).identity!;
const apply = (identity: ClubIdentity, actions: IdentityDraftAction[]) =>
  actions.reduce<ClubIdentity>(reduceIdentityDraft, identity);

async function found(page: Page, seed: string, name = NAME) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await foundHere(page, seed, name);
}
async function foundHere(page: Page, seed: string, name: string) {
  const founding = page.getByTestId('club-founding');
  await founding.getByLabel('클럽 이름').fill(name);
  await founding.getByText('고급 설정', { exact: true }).click();
  await founding.getByLabel('세계 생성 시드').fill(seed);
  await founding.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
}
const nav = (page: Page) => page.getByRole('navigation', { name: '모바일 게임 메뉴' });
async function openSlots(page: Page) {
  await page.getByRole('button', { name: '전체 메뉴', exact: true }).click();
  await page
    .getByRole('dialog', { name: '전체 메뉴' })
    .getByRole('button', { name: '게임 슬롯', exact: true })
    .click();
  await expect(page.getByTestId('game-slots')).toBeVisible();
}
/** The design view, once its lazily loaded editor is there. */
async function designView(page: Page) {
  const view = page.getByRole('region', { name: '구단 디자인', exact: true });
  await expect(view.getByRole('group', { name: '대표색', exact: true })).toBeVisible();
  return view;
}
/** 구단 운영 › 구단 디자인 from the tab bar (→WEB-39). */
async function openDesign(page: Page) {
  await nav(page).getByRole('button', { name: '구단 운영', exact: true }).click();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  await expect(page).toHaveURL(/\/direction\?view=identity$/);
  return designView(page);
}
const bar = (view: Locator) => view.getByRole('group', { name: '구단 디자인 적용', exact: true });
const applyButton = (view: Locator) => bar(view).getByRole('button', { name: '적용', exact: true });
const colourCode = (view: Locator, label: string) => view.getByLabel(label, { exact: true });
const crestFill = (scope: Locator, fill: string) => scope.locator(`rect[fill="${fill}"]`);

test('palette edits keep every shirt, reuse changes one shirt, and each apply reaches every crest', async ({
  page,
}) => {
  test.slow();
  await watchIdentityCommands(page);
  await found(page, 'identity-management-palette');
  const before = await ownIdentity(page);
  const view = await openDesign(page);
  await expect(bar(view).getByRole('status')).toHaveText('적용된 디자인');
  await expect(applyButton(view)).toBeDisabled();
  await colourCode(view, '대표 주색 색 코드').fill('#E0218A');
  await colourCode(view, '대표 보조색 색 코드').fill('#F2F2F2');
  await colourCode(view, '바탕색 색 코드').fill('#E0218A');
  await expect(bar(view).getByRole('status')).toHaveText('적용 전 초안');
  // Editing and previewing commit nothing (KIT-9).
  expect(await ownIdentity(page)).toEqual(before);
  expect(await commands(page)).toBe(0);
  await applyButton(view).click();
  await expect(bar(view).getByRole('status')).toHaveText('적용된 디자인');
  expect(await commands(page)).toBe(1);
  const palette = apply(before, [
    { type: 'colour', index: 0, colour: '#E0218A' },
    { type: 'colour', index: 1, colour: '#F2F2F2' },
    { type: 'crest-colour', region: 'primary', colour: '#E0218A' },
  ]);
  const afterPalette = ownClub(await exportWorld(page));
  expect(afterPalette.identity).toEqual(palette);
  // KIT-10: the representative colours change; every saved shirt stays as designed.
  expect(afterPalette.identity!.kits).toEqual(before.kits);
  expect(afterPalette.color).toBe('#E0218A');

  // 대표색 적용 copies the representative colours into the selected shirt only.
  await view
    .getByRole('group', { name: '편집할 유니폼', exact: true })
    .getByRole('button', { name: '원정 유니폼', exact: true })
    .click();
  await view.getByRole('button', { name: '대표색 적용', exact: true }).click();
  await expect(bar(view).getByRole('status')).toHaveText('적용 전 초안');
  await applyButton(view).click();
  await expect(bar(view).getByRole('status')).toHaveText('적용된 디자인');
  expect(await commands(page)).toBe(2);
  const reused = apply(palette, [{ type: 'shirt-reuse', role: 'away' }]);
  const afterReuse = await ownIdentity(page);
  expect(afterReuse).toEqual(reused);
  expect(afterReuse.kits.away).not.toEqual(before.kits.away);
  expect(afterReuse.kits.home).toEqual(before.kits.home);
  expect(afterReuse.kits.third).toEqual(before.kits.third);

  // KIT-12/WEB-49: the current crest follows at once wherever the club is named.
  const hud = page.locator('header').filter({ has: page.getByTestId('calendar') });
  await expect(crestFill(hud, '#E0218A')).not.toHaveCount(0);
  await nav(page).getByRole('button', { name: '리그', exact: true }).click();
  const own = page
    .getByRole('table', { name: '리그 순위표' })
    .getByRole('button', { name: `${NAME} 팀 정보`, exact: true })
    .first();
  await expect(crestFill(own, '#E0218A')).not.toHaveCount(0);
  await own.click();
  const sheet = page.getByRole('dialog', { name: NAME, exact: true });
  await expect(crestFill(sheet, '#E0218A')).not.toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await openSlots(page);
  const slot = page.getByTestId('game-slots').getByRole('listitem', { name: '슬롯 1' });
  await expect(crestFill(slot, '#E0218A')).not.toHaveCount(0);
  await continueSlot(page, 1);
  await expect(page.getByTestId('club-hub')).toBeVisible();
  // …and survives a reload.
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  await expect(crestFill(hud, '#E0218A')).not.toHaveCount(0);
  expect(await ownIdentity(page)).toEqual(reused);
});

test('되돌리기 restores the entry design and a failed apply keeps the draft and the applied design', async ({
  page,
}) => {
  test.slow();
  await watchIdentityCommands(page);
  await found(page, 'identity-management-cancel');
  const before = await ownIdentity(page);
  const view = await openDesign(page);
  const main = colourCode(view, '대표 주색 색 코드');
  await expect(main).toHaveValue(FIRST_COLOUR);
  await main.fill('#123456');
  await expect(bar(view).getByRole('status')).toHaveText('적용 전 초안');
  await bar(view).getByRole('button', { name: '되돌리기', exact: true }).click();
  await expect(main).toHaveValue(FIRST_COLOUR);
  await expect(bar(view).getByRole('status')).toHaveText('적용된 디자인');
  await expect(bar(view).getByRole('button', { name: '되돌리기', exact: true })).toBeDisabled();
  expect(await commands(page)).toBe(0);
  expect(await ownIdentity(page)).toEqual(before);

  // The host refuses the next apply as outdated: the draft and the applied design both stay.
  await main.fill('#E0218A');
  await page.evaluate(() => {
    (window as ProbeWindow).identityProbe.stale = 1;
  });
  await applyButton(view).click();
  const failure = view.getByRole('alert');
  await expect(failure).toContainText('구단 디자인을 적용하지 못했어요.');
  expect(await commands(page)).toBe(1);
  await expect(main).toHaveValue('#E0218A');
  await expect(bar(view).getByRole('status')).toHaveText('적용 전 초안');
  expect(await ownIdentity(page)).toEqual(before);
  // Retry applies the kept draft.
  await failure.getByRole('button', { name: '다시 적용', exact: true }).click();
  await expect(bar(view).getByRole('status')).toHaveText('적용된 디자인');
  await expect(view.getByRole('alert')).toHaveCount(0);
  expect(await commands(page)).toBe(2);
  expect(await ownIdentity(page)).toEqual(
    apply(before, [{ type: 'colour', index: 0, colour: '#E0218A' }]),
  );
});

test('navigation detours and passing days keep the draft beside the policy draft', async ({
  page,
}) => {
  test.slow();
  await watchIdentityCommands(page);
  await found(page, 'identity-management-detours');
  const before = await ownIdentity(page);
  let view = await openDesign(page);
  await colourCode(view, '대표 주색 색 코드').fill('#E0218A');
  await view
    .getByRole('group', { name: '편집할 유니폼', exact: true })
    .getByRole('button', { name: '서드 유니폼', exact: true })
    .click();
  await view
    .getByRole('group', { name: '서드 유니폼 무늬', exact: true })
    .getByRole('button', { name: '체크', exact: true })
    .click();
  const drafted = apply(before, [
    { type: 'colour', index: 0, colour: '#E0218A' },
    { type: 'shirt-pattern', role: 'third', pattern: 'checks' },
  ]);
  const expectDraft = async (current: Locator) => {
    await expect(colourCode(current, '대표 주색 색 코드')).toHaveValue('#E0218A');
    await expect(bar(current).getByRole('status')).toHaveText('적용 전 초안');
    await expect(current.getByRole('alert')).toHaveCount(0);
    await expect(applyButton(current)).toBeEnabled();
  };
  // Another 구단 운영 tab and back.
  await page.getByRole('tab', { name: '시설', exact: true }).click();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  view = await designView(page);
  await expectDraft(view);
  // Another page and back: 구단 운영 returns to the tab it was left on (→WEB-74).
  await nav(page).getByRole('button', { name: '선수단·스태프', exact: true }).click();
  await expect(page).toHaveURL(/\/people/);
  await nav(page).getByRole('button', { name: '구단 운영', exact: true }).click();
  await expect(page.getByRole('tab', { name: '구단 디자인', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  view = await designView(page);
  await expectDraft(view);
  // Ordinary days advance the revision under an unchanged design: the draft stands and is not
  // stale. The editor itself neither starts nor stops the clock.
  const date = page.getByTestId('game-date');
  const today = await date.innerText();
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  await expect(date).not.toHaveText(today, { timeout: 20000 });
  const running = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  if (await running.count()) await running.click();
  await expectDraft(view);
  // A policy-board draft is a separate department draft (→WEB-60/77).
  await page.getByRole('tab', { name: '운영 방침', exact: true }).click();
  await expect(page.getByTestId('view-scroller').getByTestId('strategy-board')).toBeVisible();
  const finance = page.getByRole('region', { name: '재정', exact: true });
  await finance.getByRole('button', { name: /어디서 벌고/ }).click();
  await finance.getByRole('radio', { name: '재정 기조 신중', exact: true }).click();
  await expect(page.getByTestId('strategy-draft')).toBeVisible();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  view = await designView(page);
  await expectDraft(view);
  await applyButton(view).click();
  await expect(bar(view).getByRole('status')).toHaveText('적용된 디자인');
  expect(await commands(page)).toBe(1);
  expect(await ownIdentity(page)).toEqual(drafted);
  // Applying the design left the policy draft unapplied and in place.
  await page.getByRole('tab', { name: '운영 방침', exact: true }).click();
  await expect(page.getByTestId('strategy-draft')).toBeVisible();
});

test('another game never receives the draft', async ({ page }) => {
  test.slow();
  await found(page, 'identity-management-slot-one');
  const view = await openDesign(page);
  await colourCode(view, '대표 주색 색 코드').fill('#E0218A');
  await expect(bar(view).getByRole('status')).toHaveText('적용 전 초안');
  await openSlots(page);
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: '슬롯 2 · 빈 슬롯' })
    .getByRole('button', { name: '새 게임' })
    .click();
  await foundHere(page, 'identity-management-slot-two', 'Second Design Club');
  const second = await openDesign(page);
  await expect(colourCode(second, '대표 주색 색 코드')).toHaveValue(FIRST_COLOUR);
  await expect(bar(second).getByRole('status')).toHaveText('적용된 디자인');
  await expect(bar(second).getByRole('button', { name: '되돌리기', exact: true })).toBeDisabled();
  // Back in the first game the draft is gone too: it lived only while that game was in play.
  await openSlots(page);
  await continueSlot(page, 1);
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  const first = await openDesign(page);
  await expect(colourCode(first, '대표 주색 색 코드')).toHaveValue(FIRST_COLOUR);
  await expect(bar(first).getByRole('status')).toHaveText('적용된 디자인');
});

test('a read-only tab inspects the design but cannot apply it', async ({ page, context }) => {
  await found(page, 'identity-management-readonly');
  const applied = await ownIdentity(page);
  const viewer = await context.newPage();
  try {
    await viewer.setViewportSize({ width: 390, height: 844 });
    await viewer.goto('/direction?view=identity');
    const view = await designView(viewer);
    await expect(view).toContainText('읽기 전용 상태에서는 구단 디자인을 적용할 수 없어요.');
    await expect(bar(view).getByRole('status')).toHaveText('읽기 전용');
    await expect(applyButton(view)).toBeDisabled();
    const main = colourCode(view, '대표 주색 색 코드');
    await expect(main).toHaveValue(applied.colours[0]);
    await expect(main).toBeDisabled();
    // Inspection stays open: every shirt can still be looked at.
    const away = view
      .getByRole('group', { name: '편집할 유니폼', exact: true })
      .getByRole('button', { name: '원정 유니폼', exact: true });
    await away.click();
    await expect(away).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await viewer.close();
  }
  expect(await ownIdentity(page)).toEqual(applied);
});

test('a stale applied identity is never silently overwritten', async ({ page }) => {
  test.slow();
  await watchIdentityCommands(page);
  await found(page, 'identity-management-stale');
  const raw = await exportRaw(page);
  const view = await openDesign(page);
  await colourCode(view, '대표 주색 색 코드').fill('#E0218A');
  await expect(bar(view).getByRole('status')).toHaveText('적용 전 초안');
  // The same game comes back from a file whose applied crest has changed since the draft began.
  const { world } = await decode(raw);
  const newer = apply(ownClub(world).identity!, [
    { type: 'crest-colour', region: 'primary', colour: '#123456' },
  ]);
  ownClub(world).identity = newer;
  await page
    .locator('input[type=file]')
    .last()
    .setInputFiles({
      name: 'newer-design.json',
      mimeType: 'application/json',
      buffer: Buffer.from(await encode(world)),
    });
  await page
    .getByRole('dialog', { name: '기록 가져오기 확인' })
    .getByRole('button', { name: '기록 교체하고 가져오기' })
    .click();
  const hud = page.locator('header').filter({ has: page.getByTestId('calendar') });
  await expect(crestFill(hud, '#123456')).not.toHaveCount(0);
  await nav(page).getByRole('button', { name: '구단 운영', exact: true }).click();
  const stale = await designView(page);
  await expect(stale.getByRole('alert')).toContainText('적용된 구단 디자인이 바뀌었어요');
  await expect(colourCode(stale, '대표 주색 색 코드')).toHaveValue('#E0218A');
  await expect(applyButton(stale)).toBeDisabled();
  expect(await ownIdentity(page)).toEqual(newer);
  await stale
    .getByRole('alert')
    .getByRole('button', { name: '지금 적용된 디자인 불러오기', exact: true })
    .click();
  await expect(bar(stale).getByRole('status')).toHaveText('적용된 디자인');
  await expect(stale.getByRole('alert')).toHaveCount(0);
  await expect(colourCode(stale, '바탕색 색 코드')).toHaveValue('#123456');
  expect(await commands(page)).toBe(0);
  expect(await ownIdentity(page)).toEqual(newer);
});
