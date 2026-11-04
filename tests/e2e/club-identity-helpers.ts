import { openClubhouse, openClubRecords } from './competition-navigation';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from '../../apps/web/src/adapters/persistence';
import type { DesignStudio, KitRole } from '../../packages/contracts/src/identity';
import type { World } from '../../packages/contracts/src/types';
import { DESIGNERS } from '../../packages/engine/src/design-fees';
import type { CanvasImage } from '../fixtures/figure-evidence';
import { continueSlot } from './slots';
import { watchNext } from './watch';
import { configureResponsibilities, reportKit } from './events';
import { aroundOffice, openArea, outsideOffice } from './office';
import { startCareer, startFlow, type CareerStart } from './start';

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
const MANIFEST = 'haeram-soccor:manifest';

export const ownClub = (w: World) => w.clubs.find((club) => club.id === w.playerClub)!;
export const nav = (page: Page) => page.getByRole('navigation', { name: '모바일 게임 메뉴' });
/** The HUD, whose crest follows the applied identity (→WEB-49). */
export { gameHud as hud } from './layout';
/** SVG crest parts painted in `fill`, exactly as stored. */
export const crestFill = (scope: Locator, fill: string) => scope.locator(`[fill="${fill}"]`);

/** The settings menu lives in the HUD, which the office hides (→WEB-39). */
async function openMenu(page: Page) {
  await page.getByRole('button', { name: '설정', exact: true }).click();
  return page.getByRole('dialog', { name: '설정', exact: true });
}
const closeMenu = (menu: Locator) =>
  menu.getByRole('button', { name: '창 닫기', exact: true }).click();
/** The file 기록 내보내기 downloads from the HUD menu, as text; mid-edit in the office too. */
export const exportRaw = (page: Page) =>
  aroundOffice(page, async () => {
    const menu = await openMenu(page);
    const downloading = page.waitForEvent('download');
    await menu.getByRole('button', { name: '기록 내보내기', exact: true }).click();
    const raw = await readFile((await (await downloading).path())!, 'utf8');
    await closeMenu(menu);
    return raw;
  });
export const exportWorld = async (page: Page): Promise<World> =>
  (await decode(await exportRaw(page))).world;
/** 저장 재시도 from the HUD menu, after a failed checkpoint. */
export const retrySave = (page: Page) =>
  aroundOffice(page, async () => {
    const menu = await openMenu(page);
    await menu.getByRole('button', { name: '저장 재시도', exact: true }).click();
    await closeMenu(menu);
  });
/** The 알림·뉴스 dialog opened from the HUD menu (→WEB-51/66). */
export async function openNotices(page: Page) {
  await outsideOffice(page);
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

/** The game in play's IndexedDB active checkpoint. */
export const committedRaw = (page: Page) => idbGet(page, 'checkpoints', 'active');
/** The committed world, once the save status says every revision is on disk. */
export async function savedWorld(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  return (await decode((await committedRaw(page))!)).world;
}

export { idbGet, idbPut, seedCheckpoints } from './checkpoint-storage';
import { idbGet } from './checkpoint-storage';
/** Active, commit manifest and verified IndexedDB predecessor. */
export async function checkpointStorage(page: Page) {
  return {
    active: await idbGet(page, 'checkpoints', 'active'),
    manifest: await page.evaluate((key) => localStorage.getItem(key), MANIFEST),
    previous: await idbGet(page, 'checkpoints', 'previous'),
  };
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
  sent: Record<string, number>;
  stale: number;
}
type ProbeWindow = typeof window & { identityProbe: IdentityProbe };
/**
 * Counts the design commands the page sends its engine worker, by
 * type; `refuseNextDesignCommand` makes the next one carry an outdated world revision, which the
 * host refuses before any effect (→SAVE-6).
 */
export async function watchIdentityCommands(page: Page) {
  await page.addInitScript(() => {
    const watched = ['design-commission', 'adopt-design', 'discard-designs', 'redraw-designs'];
    const probe: IdentityProbe = { sent: {}, stale: 0 };
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
      const type = request?.body?.type === 'command' ? request.body.command?.type : undefined;
      if (type && watched.includes(type)) {
        probe.sent[type] = (probe.sent[type] ?? 0) + 1;
        if (probe.stale > 0) {
          probe.stale--;
          message = { ...request, expectedRevision: (request!.expectedRevision ?? 0) - 1 };
        }
      }
      Reflect.apply(post, this, transfer === undefined ? [message] : [message, transfer]);
    } as typeof post;
  });
}
/** The watched commands sent so far, by type. */
export const identityCommands = (page: Page) =>
  page.evaluate(() => (window as ProbeWindow).identityProbe.sent);
export const refuseNextDesignCommand = (page: Page) =>
  page.evaluate(() => {
    (window as ProbeWindow).identityProbe.stale = 1;
  });

/**
 * Takes a club over in the start flow on screen (→WEB-15): the seed's first affordable club, or
 * the one `start` names. Resolves with the club's name once its home is on screen and saved.
 */
export const takeOverHere = (page: Page, seed: string, start: CareerStart = {}) =>
  startCareer(page, { ...start, seed });
export async function openSlots(page: Page) {
  await outsideOffice(page);
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
  await expect(startFlow(page)).toContainText(`슬롯 ${slot} · 새 게임`);
}
export async function continueGame(page: Page, slot: number) {
  await openSlots(page);
  await continueSlot(page, slot);
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
}

/** 구단 운영 › 구단 디자인: the applied design, or the drafts a commission delivered. */
export const designView = (page: Page) =>
  page.getByRole('region', { name: '구단 디자인', exact: true });
export const appliedPanel = (view: Locator) =>
  view.getByRole('heading', { name: '지금 디자인', exact: true });
export const draftsPanel = (view: Locator) =>
  view.getByRole('heading', { name: '받은 시안', exact: true });
/** 구단 운영 › 구단 디자인 from home, once its lazily loaded section is there (→WEB-108/110). */
export async function openDesign(page: Page) {
  await openArea(page, '구단 디자인');
  const view = designView(page);
  await expect(appliedPanel(view).or(draftsPanel(view))).toBeVisible();
  return view;
}
export const requestButton = (view: Locator) =>
  view.getByRole('button', { name: '변경 의뢰', exact: true });
export const DESIGNER_LABEL: Record<DesignStudio, string> = {
  local: '동네 디자이너',
  studio: '디자인 스튜디오',
  star: '유명 디자이너',
};
/** The colours of a commission: the main, then 보조 and 포인트, each `null` or left out for 없음. */
export type CommissionColours = readonly [string, (string | null)?, (string | null)?];
const COLOUR_STEPS = ['메인', '보조', '포인트'] as const;
export const paletteOf = (view: Locator, step: (typeof COLOUR_STEPS)[number]) =>
  view.getByRole('group', { name: `${step} 색`, exact: true });
/**
 * 변경 의뢰 up to the designer step: the main colour, then 보조 and 포인트 or 없음, where 보조 없음
 * leaves no 포인트 to choose (→WEB-108). Nothing is sent yet.
 */
export async function chooseColours(view: Locator, colours: CommissionColours) {
  await requestButton(view).click();
  for (const [index, step] of COLOUR_STEPS.entries()) {
    if (index === 2 && !colours[1]) break;
    await paletteOf(view, step)
      .getByRole('button', { name: colours[index] ?? '없음', exact: true })
      .click();
    await view.getByRole('button', { name: '다음', exact: true }).click();
  }
  await expect(view.getByRole('heading', { name: '디자이너', exact: true })).toBeVisible();
}
/** Picks the designer and answers 예; the drafts arrive at once. */
export async function confirmCommission(view: Locator, studio: DesignStudio = 'studio') {
  await view
    .getByRole('group', { name: '디자이너', exact: true })
    .getByRole('button', { name: DESIGNER_LABEL[studio], exact: true })
    .click();
  await view.getByRole('button', { name: '예', exact: true }).click();
  await expect(draftsPanel(view)).toBeVisible();
  await expect(draftItems(view)).toHaveCount(DESIGNERS[studio].drafts);
}
/**
 * A whole commission (→WEB-108) and the drafts it delivered, read back from the committed save:
 * their contents are the designer's, generated from the world's seed and revision.
 */
export async function commission(
  page: Page,
  view: Locator,
  colours: CommissionColours,
  studio: DesignStudio = 'studio',
) {
  const revision = (await savedWorld(page)).revision;
  await chooseColours(view, colours);
  await confirmCommission(view, studio);
  return committedCommission(page, revision);
}
/** The commission the save holds once a revision after `revision` is committed. */
export async function committedCommission(page: Page, revision: number) {
  await expect.poll(async () => (await savedWorld(page)).revision).toBeGreaterThan(revision);
  return (await savedWorld(page)).designCommission!;
}
/** The delivered drafts, in their order, each with its 이 시안으로 결정. */
export const draftItems = (view: Locator) =>
  view
    .getByRole('listitem')
    .filter({ has: view.page().getByRole('button', { name: '이 시안으로 결정', exact: true }) });
export const adoptButton = (view: Locator, draft: number) =>
  draftItems(view).nth(draft).getByRole('button', { name: '이 시안으로 결정', exact: true });
export const discardButton = (view: Locator) =>
  view.getByRole('button', { name: '전부 버리기', exact: true });
export const redrawButton = (view: Locator) => view.getByRole('button', { name: /^재설정 · 반값/ });
/** 이 시안으로 결정: the draft becomes the club's design and the view returns to it (→KIT-12). */
export async function adoptDraft(view: Locator, draft: number) {
  await adoptButton(view, draft).click();
  await expect(appliedPanel(view)).toBeVisible();
}

export const hubPreparation = (page: Page) =>
  page.getByTestId('club-hub').getByRole('button', { name: '상세 리포트', exact: true });
/** Opens preparation and unfolds its shirt selector (→WEB-88). */
export async function openKit(page: Page, opener?: Locator) {
  // Home's preparation is outside the office, back home from wherever it was entered.
  if (!opener) {
    await outsideOffice(page);
    if (!(await page.getByTestId('club-hub').isVisible())) await openClubhouse(page);
  }
  await (opener ?? hubPreparation(page)).click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  // The report reads first; its kit section is its only owner choice (→WEB-88).
  await expect(dialog).toBeVisible();
  const kit = (await reportKit(dialog)).getByTestId('fixture-kit');
  await kit.getByTestId('fixture-kit-summary').click();
  await expect(
    kit.getByRole('radiogroup', { name: '이 경기 우리 유니폼', exact: true }),
  ).toBeVisible();
  return { dialog, kit };
}
export const kitRadio = (kit: Locator, role: KitRole) =>
  kit.getByRole('radio', { name: `우리 ${KIT_LABEL[role]} 유니폼`, exact: true });
export async function closePreparation(page: Page, dialog: Locator, decided: boolean) {
  await dialog.getByRole('button', { name: '확인하고 홈으로', exact: true }).click();
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
  await outsideOffice(page);
  await openClubRecords(page);
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
/** The visible match pitch Canvas in `scope`: the theatre's, or a replay's in its dialog. */
export const visiblePitch = (scope: Page | Locator) =>
  scope.locator(PITCH_CANVAS).filter({ visible: true }).last();
/**
 * One frame of the pitch Canvas `canvas`: its device pixels and laid-out width, read at once so
 * every check on it sees the same instant. The figure evidence in `tests/fixtures/figure-evidence`
 * reads it in Node at the size the pitch paints its figures.
 */
export async function pitchImage(canvas: Locator): Promise<CanvasImage> {
  const { bytes, ...frame } = await canvas.evaluate((element) => {
    const c = element as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let binary = '';
    for (let i = 0; i < data.length; i += 0x8000)
      binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return { width: c.width, height: c.height, cssWidth: c.clientWidth, bytes: btoa(binary) };
  });
  return { ...frame, data: Buffer.from(bytes, 'base64') };
}
/** Keeps a screenshot of `target` with the test's report: the preview or pitch actually shown. */
export async function keepScreenshot(testInfo: TestInfo, name: string, target: Locator) {
  await testInfo.attach(name, { body: await target.screenshot(), contentType: 'image/png' });
}
