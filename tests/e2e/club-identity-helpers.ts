import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import { SHIRT_PATTERN_LABELS } from '../../apps/web/src/ui/kitPainting';
import { KIT_ROLES, type ClubIdentity, type KitRole } from '../../packages/contracts/src/identity';
import type { World } from '../../packages/contracts/src/types';
import { continueSlot } from './slots';
import { watchNext } from './watch';
import { configureResponsibilities } from './events';

/**
 * Browser helpers shared by the club-identity journeys (→KIT, →SAVE-3/20/21/22). Evidence is what
 * the page shows, the checkpoints it stores and the files it exports, decoded in Node; nothing
 * reaches into application state.
 */

/** The supported phone sizes of the primary edit/preview path (→WEB-17/63). */
export const PHONE_VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
] as const;
export const KIT_LABEL: Record<KitRole, string> = { home: '홈', away: '어웨이', third: '세컨' };
/** `SAVE_DATA_UPDATED` of runtime/client.ts, the writer's notice after an adoption is committed. */
export const SAVE_DATA_UPDATED = '기존 기록을 보존하고 저장 데이터를 현재 형식으로 갱신했어요.';
const SLOT_A = 'haeram-soccor:slot:a';
const SLOT_B = 'haeram-soccor:slot:b';
const MANIFEST = 'haeram-soccor:manifest';

export const ownClub = (w: World) => w.clubs.find((club) => club.id === w.playerClub)!;
export const nav = (page: Page) => page.getByRole('navigation', { name: '모바일 게임 메뉴' });
/** The HUD, whose crest follows the applied identity (→WEB-49). */
export { gameHud as hud } from './layout';
/** SVG crest parts painted in `fill`, exactly as stored. */
export const crestFill = (scope: Locator, fill: string) => scope.locator(`[fill="${fill}"]`);

async function openMenu(page: Page) {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  return page.getByRole('dialog', { name: '설정', exact: true });
}
const closeMenu = (menu: Locator) =>
  menu.getByRole('button', { name: '창 닫기', exact: true }).click();
/** The file 기록 내보내기 downloads from the HUD menu, as text. */
export async function exportRaw(page: Page) {
  const menu = await openMenu(page);
  const downloading = page.waitForEvent('download');
  await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
  const raw = await readFile((await (await downloading).path())!, 'utf8');
  await closeMenu(menu);
  return raw;
}
export const exportWorld = async (page: Page): Promise<World> =>
  (await decode(await exportRaw(page))).world;
/** 저장 재시도 from the HUD menu, after a failed checkpoint. */
export async function retrySave(page: Page) {
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: '저장 재시도', exact: true }).click();
  await closeMenu(menu);
}
/** The 알림·뉴스 dialog opened from the HUD menu (→WEB-51/66). */
export async function openNotices(page: Page) {
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: '알림·뉴스', exact: true }).click();
  const inbox = page.getByRole('dialog', { name: '알림·뉴스', exact: true });
  await expect(inbox).toBeVisible();
  return inbox;
}
export const closeNotices = (inbox: Locator) =>
  inbox.getByRole('button', { name: '닫기', exact: true }).click();
export const notice = (inbox: Locator, text: string) =>
  inbox.getByRole('listitem').filter({ hasText: text });

/**
 * The committed checkpoint the manifest names (→SAVE-3), raw: IndexedDB `checkpoints/active` for
 * `slot: 3`, else slot:a/b of a seeded or fallback layout.
 */
export async function committedRaw(page: Page) {
  const manifest = await page.evaluate((key) => localStorage.getItem(key), MANIFEST);
  return activeOf(page, manifest);
}
async function activeOf(page: Page, manifest: string | null) {
  const slot = (JSON.parse(manifest || 'null') as { slot?: number } | null)?.slot;
  if (slot === 3) return idbGet(page, 'checkpoints', 'active');
  return page.evaluate((key) => localStorage.getItem(key), slot === 1 ? SLOT_B : SLOT_A);
}
/** The committed world, once the save status says every revision is on disk. */
export async function savedWorld(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return (await decode((await committedRaw(page))!)).world;
}

/** One value of the app's IndexedDB store (database haeram-soccor, version 2). */
export const idbGet = (page: Page, store: 'games' | 'checkpoints', key: string) =>
  page.evaluate(
    ({ store, key }) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open('haeram-soccor', 2);
        open.onupgradeneeded = () => {
          for (const name of ['games', 'checkpoints'])
            if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction(store, 'readonly').objectStore(store).get(key);
          get.onsuccess = () => {
            db.close();
            resolve(typeof get.result === 'string' ? get.result : null);
          };
          get.onerror = () => {
            db.close();
            reject(get.error);
          };
        };
      }),
    { store, key },
  );
/**
 * The game in play's raw checkpoint storage: the active copy the manifest names (IndexedDB, or
 * slot:a as seeded before the first commit), the manifest and the IndexedDB previous copy.
 */
export async function checkpointStorage(page: Page) {
  const manifest = await page.evaluate((key) => localStorage.getItem(key), MANIFEST);
  return {
    active: await activeOf(page, manifest),
    manifest,
    previous: await idbGet(page, 'checkpoints', 'previous'),
  };
}
/** The localStorage checkpoints of the earlier layout, gone once the game moved to IndexedDB. */
export const localCheckpoints = (page: Page) =>
  page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), [SLOT_A, SLOT_B]);
/** Overwrites one value of the app's IndexedDB store, e.g. to corrupt the active copy. */
export const idbPut = (page: Page, store: 'games' | 'checkpoints', key: string, value: string) =>
  page.evaluate(
    ({ store, key, value }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('haeram-soccor', 2);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { store, key, value },
  );
/**
 * Writes the game in play's checkpoints as the slot:a layout's writer would have left them (the
 * app moves them to IndexedDB on its first commit), from the static same-origin 404 page so no
 * app instance is running; the caller then opens the game.
 */
export async function seedCheckpoints(
  page: Page,
  seed: { active: string; manifest: string; previous?: string },
) {
  await page.goto('/404.html');
  await page.evaluate(
    ({ active, manifest, previous, keys }) =>
      new Promise<void>((resolve, reject) => {
        localStorage.setItem(keys.active, active);
        localStorage.setItem(keys.manifest, manifest);
        if (previous === undefined) return resolve();
        const open = indexedDB.open('haeram-soccor', 2);
        open.onupgradeneeded = () => {
          for (const name of ['games', 'checkpoints'])
            if (!open.result.objectStoreNames.contains(name)) open.result.createObjectStore(name);
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('checkpoints', 'readwrite');
          tx.objectStore('checkpoints').put(previous, 'previous');
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      }),
    { ...seed, keys: { active: SLOT_A, manifest: MANIFEST } },
  );
}

const FAIL_FLAG = 'haeram-test:fail-writes';
/**
 * Makes this page's writes of the active checkpoint, IndexedDB `checkpoints/active` (→SAVE-3),
 * throw a quota error whenever the flag `failWrites` sets is on; the flag lives in sessionStorage,
 * so it holds across navigations.
 */
export async function failableWrites(page: Page) {
  await page.addInitScript(
    ({ flag }) => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (
        this: IDBObjectStore,
        value: unknown,
        key?: IDBValidKey,
      ) {
        if (this.name === 'checkpoints' && key === 'active' && sessionStorage.getItem(flag) === '1')
          throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
        return put.call(this, value, key);
      };
    },
    { flag: FAIL_FLAG },
  );
}
export const failWrites = (page: Page, on: boolean) =>
  page.evaluate(
    ({ flag, on }) => (on ? sessionStorage.setItem(flag, '1') : sessionStorage.removeItem(flag)),
    { flag: FAIL_FLAG, on },
  );

interface IdentityProbe {
  sent: number;
  stale: number;
}
type ProbeWindow = typeof window & { identityProbe: IdentityProbe };
/**
 * Counts the club-identity commands the page sends its engine worker; `refuseNextApply` makes the
 * next one carry an outdated world revision, which the host refuses before any effect (→SAVE-6).
 */
export async function watchIdentityCommands(page: Page) {
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
export const identityCommands = (page: Page) =>
  page.evaluate(() => (window as ProbeWindow).identityProbe.sent);
export const refuseNextApply = (page: Page) =>
  page.evaluate(() => {
    (window as ProbeWindow).identityProbe.stale = 1;
  });

/** Fills the founding form; `design` runs inside the open 꾸미기 editor before 클럽 창단. */
export async function foundHere(
  page: Page,
  name: string,
  seed: string,
  design?: (editor: Locator) => Promise<void>,
) {
  const founding = page.getByTestId('club-founding');
  await founding.getByLabel('클럽 이름').fill(name);
  await founding.getByText('고급 설정', { exact: true }).click();
  await founding.getByLabel('세계 생성 시드').fill(seed);
  if (design) {
    await founding.getByRole('button', { name: '구단 디자인 꾸미기', exact: true }).click();
    const editor = page.getByRole('dialog', { name: '구단 디자인' });
    await expect(editor.getByRole('group', { name: '색상', exact: true })).toBeVisible();
    await design(editor);
    await editor.getByRole('button', { name: '이 디자인 사용', exact: true }).click();
    await expect(editor).toHaveCount(0);
  }
  await founding.getByRole('button', { name: '클럽 창단' }).click();
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
}
export async function openSlots(page: Page) {
  const menu = await openMenu(page);
  await menu.getByRole('button', { name: '게임 슬롯', exact: true }).click();
  await expect(page.getByTestId('game-slots')).toBeVisible();
}
/** 새 게임 in an empty slot of the slot screen. */
export async function newGameIn(page: Page, slot: number) {
  await openSlots(page);
  await page
    .getByTestId('game-slots')
    .getByRole('listitem', { name: `슬롯 ${slot} · 빈 슬롯` })
    .getByRole('button', { name: '새 게임' })
    .click();
  await expect(page.getByTestId('club-founding')).toContainText(`슬롯 ${slot} · 새 게임`);
}
export async function continueGame(page: Page, slot: number) {
  await openSlots(page);
  await continueSlot(page, slot);
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
}

export const colourCode = (scope: Locator, label: string) =>
  scope.getByLabel(label, { exact: true });
const roleButton = (editor: Locator, role: KitRole) =>
  editor
    .getByRole('group', { name: '편집할 유니폼', exact: true })
    .getByRole('button', { name: `${KIT_LABEL[role]} 유니폼`, exact: true });
/** Selects the shirt whose pattern is being edited. */
export async function editShirt(editor: Locator, role: KitRole) {
  await roleButton(editor, role).click();
  return editor.getByRole('group', { name: '색상', exact: true });
}
/** Set the three named colours, ready-made crest and shirt patterns through real controls. */
export async function designInEditor(editor: Locator, design: ClubIdentity, preset: string) {
  for (const role of KIT_ROLES)
    await colourCode(editor, `${KIT_LABEL[role]} 색 코드`).fill(design.kits[role].primary);
  await editor
    .getByRole('group', { name: '기본 엠블럼', exact: true })
    .getByRole('button', { name: preset, exact: true })
    .click();
  for (const role of KIT_ROLES) {
    await editShirt(editor, role);
    await editor
      .getByRole('group', { name: `${KIT_LABEL[role]} 유니폼 무늬`, exact: true })
      .getByRole('button', { name: SHIRT_PATTERN_LABELS[design.kits[role].pattern], exact: true })
      .click();
  }
}

/** 구단 운영 › 구단 디자인 from the tab bar, once its lazily loaded editor is there (→WEB-39). */
export async function openDesign(page: Page) {
  await nav(page).getByRole('button', { name: '구단 운영', exact: true }).click();
  await page.getByRole('tab', { name: '구단 디자인', exact: true }).click();
  await expect(page).toHaveURL(/\/direction\?view=identity$/);
  const view = page.getByRole('region', { name: '구단 디자인', exact: true });
  await expect(view.getByRole('group', { name: '색상', exact: true })).toBeVisible();
  return view;
}
export const designBar = (view: Locator) =>
  view.getByRole('group', { name: '구단 디자인 적용', exact: true });
export const designStatus = (view: Locator) => designBar(view).getByRole('status');
export const applyButton = (view: Locator) =>
  designBar(view).getByRole('button', { name: '적용', exact: true });
/** 적용 that succeeds, with its outcome card read (→WEB-36). */
export async function applyDesign(page: Page, view: Locator) {
  await applyButton(view).click();
  await expect(designStatus(view)).toHaveText('적용된 디자인');
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toContainText('구단 디자인을 적용했어요');
  await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
}

export const hubPreparation = (page: Page) =>
  page.getByTestId('club-hub').getByRole('button', { name: '전술·선발 준비', exact: true });
/** Opens preparation and unfolds its shirt selector (→WEB-88). */
export async function openKit(page: Page, opener: Locator = hubPreparation(page)) {
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  const kit = dialog.getByTestId('fixture-kit');
  await kit.getByTestId('fixture-kit-summary').click();
  await expect(
    kit.getByRole('radiogroup', { name: '이 경기 우리 유니폼', exact: true }),
  ).toBeVisible();
  return { dialog, kit };
}
export const kitRadio = (kit: Locator, role: KitRole) =>
  kit.getByRole('radio', { name: `우리 ${KIT_LABEL[role]} 유니폼`, exact: true });
export async function closePreparation(page: Page, dialog: Locator, decided: boolean) {
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  if (!decided) return;
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toBeVisible();
  await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  await expect(outcome).toHaveCount(0);
}

/** Watches the next match and stops at the final whistle, where the presentation stays. */
export async function watchToWhistle(page: Page) {
  // Identity edits/reloads compare one settled fixture; keep the calendar stopped afterwards.
  await configureResponsibilities(page, { mode: 'manual' });
  await watchNext(page);
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByTestId('match-result-summary')).toBeVisible();
}
/** The records-room replay of this season's first listed own match (→WEB-54). */
export async function openRecordedMatch(page: Page) {
  await page.getByRole('button', { name: '클럽 기록실', exact: true }).click();
  await page.getByRole('tab', { name: '시즌별 기록', exact: true }).click();
  await page.getByRole('table', { name: '시즌별 기록' }).getByRole('button').first().click();
  await expect(page.getByRole('combobox', { name: '기록 시즌', exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: '시즌 기록 보기' })
    .getByRole('button', { name: '경기', exact: true })
    .click();
  await page.getByRole('button', { name: '경기 기록 보기', exact: true }).first().click();
  return page.getByRole('dialog', { name: '지난 경기 상세' });
}
export const PITCH_CANVAS = 'canvas[aria-label="22명의 선수와 공으로 표현하는 경기"]';
/** Canvas pixels within `tolerance` (sum of channel differences) of `hex`: painted, not a legend. */
export const canvasPixels = (canvas: Locator, hex: string, tolerance = 30) =>
  canvas.evaluate(
    (element, { hex, tolerance }) => {
      const c = element as HTMLCanvasElement;
      const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
      let count = 0;
      for (let i = 0; i < data.length; i += 4)
        if (
          Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) <=
          tolerance
        )
          count++;
      return count;
    },
    { hex, tolerance },
  );
/** Keeps a screenshot of `target` with the test's report: the preview or pitch actually shown. */
export async function keepScreenshot(testInfo: TestInfo, name: string, target: Locator) {
  await testInfo.attach(name, { body: await target.screenshot(), contentType: 'image/png' });
}
