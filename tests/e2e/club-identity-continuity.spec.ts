import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode, encode } from '../../apps/web/src/adapters/persistence';
import {
  linkedIdentityColours,
  reduceIdentityDraft,
} from '../../apps/web/src/ui/clubIdentityDraft';
import { canonical } from '../../packages/contracts/src/index';
import { KIT_ROLES } from '../../packages/contracts/src/identity';
import type { World } from '../../packages/contracts/src/types';
import { MANAGER_HISTORY_CHECKPOINT_SCHEMA } from '../../packages/contracts/src/versions';
import { identityOf, nextOwnFixture } from '../../packages/engine/src/index';
import { legacyCrestMap } from '../../packages/engine/src/identity-legacy';
import { appearanceForFixture } from '../../packages/engine/src/match-appearance';
import {
  adoptedCareer,
  containerOneCheckpoint,
  delegatedCareer,
  EDITED_SHIRT_COLOUR,
  FIRST_COLOUR,
  FOUNDED_DESIGN,
  FUTURE_CHECKPOINTS,
  manifestOf,
  preIdentityCareer,
} from '../fixtures/club-identity';
import {
  applyButton,
  applyDesign,
  canvasPixels,
  checkpointStorage,
  closeNotices,
  closePreparation,
  colourCode,
  committedRaw,
  continueGame,
  crestFill,
  designInEditor,
  designStatus,
  exportRaw,
  exportWorld,
  failableWrites,
  failWrites,
  foundHere,
  hud,
  idbGet,
  identityCommands,
  KIT_LABEL,
  keepScreenshot,
  kitRadio,
  localCheckpoints,
  newGameIn,
  notice,
  openDesign,
  openKit,
  openNotices,
  openRecordedMatch,
  ownClub,
  PHONE_VIEWPORTS,
  PITCH_CANVAS,
  refuseNextApply,
  retrySave,
  SAVE_DATA_UPDATED,
  savedWorld,
  seedCheckpoints,
  watchIdentityCommands,
  watchToWhistle,
} from './club-identity-helpers';
import { ALL_DELEGATED, configureResponsibilities } from './events';
import { importResponsibilityCareer } from './responsibility-fixtures';
import { officeBar } from './office';

/**
 * KIT-9/12/15, WEB-86/87, SAVE-3/5/6/11/20/21/22: club designs and the kit a match was played in
 * stay exact through founding, settlement, later edits, export/import, reload, slot parking,
 * read-only inspection, failed writes and newer data. Evidence is the stored checkpoints and the
 * exported files decoded in Node against literal designs, beside what the page draws.
 */

/** The ready-made crest `FOUNDED_DESIGN` recolours: french, sash, crown. */
const PRESET = '프렌치 방패 · 왕관';
/** An unapplied representative colour that no applied design uses. */
const DRAFT_COLOUR = '#00A6A6';
/**
 * Base-colour pixels that prove the live pitch paints the worn shirt. At phone width each outfield
 * marker is a 12px disc; an away or third shirt keeps its linked trim ring (→KIT-4/10), so the
 * ring, pattern, outline and number leave about three exact base pixels per marker, ~30 in all.
 */
const WORN_PIXELS = 20;

for (const viewport of PHONE_VIEWPORTS)
  test(`founded, worn, edited and moved by file, designs and the earlier kit stay exact at ${viewport.width}x${viewport.height}`, async ({
    page,
    browser,
  }, testInfo) => {
    test.slow();
    const size = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.goto('/');
    const design = linkedIdentityColours({
      ...FOUNDED_DESIGN,
      kits: {
        ...FOUNDED_DESIGN.kits,
        away: { ...FOUNDED_DESIGN.kits.away, trim: FOUNDED_DESIGN.kits.home.primary },
        third: { ...FOUNDED_DESIGN.kits.third, trim: FOUNDED_DESIGN.kits.home.primary },
      },
    });
    // A home/away crest and three patterned shirts, chosen in the editor (→KIT-2/4/5).
    await foundHere(
      page,
      'Continuity Kit FC',
      `identity-continuity-${viewport.width}`,
      async (editor) => {
        const pitch = editor.getByRole('img', { name: '경기장 유니폼 미리보기' });
        await designInEditor(editor, design, PRESET);
        // The previews follow the draft before 사용 (→WEB-87): colours are linked and
        // the pitch preview paints the shirt being edited, the third, chosen last.
        await expect(colourCode(editor, '무늬색 색 코드')).toHaveCount(0);
        await expect.poll(() => canvasPixels(pitch, design.kits.third.primary)).toBeGreaterThan(20);
        await keepScreenshot(
          testInfo,
          `founding crest preview ${size}`,
          editor.getByRole('img', { name: /^엠블럼 미리보기/ }),
        );
        await keepScreenshot(testInfo, `founding pitch preview ${size}`, pitch);
      },
    );
    const founded = ownClub(await exportWorld(page));
    expect(founded.identity).toEqual(design);
    expect(founded.color).toBe(design.colours[0]);

    // One match settled in that design; nothing owner-held stops the days before it.
    await configureResponsibilities(page, { responsibilities: ALL_DELEGATED });
    await watchToWhistle(page);
    await keepScreenshot(testInfo, `observed match ${size}`, page.getByTestId('pitch-theatre'));
    await expect.poll(async () => (await savedWorld(page)).ownMatches.length).toBeGreaterThan(0);
    const played = await savedWorld(page);
    const record = played.ownMatches.at(-1)!;
    const side = record.home === played.playerClub ? 0 : 1;
    const frozen = record.appearance!;
    const worn = frozen.sides[side];
    expect(worn.club).toBe(played.playerClub);
    expect(worn.crest).toEqual(design.crest);
    expect(worn.shirt).toEqual(design.kits[worn.role]);
    expect(frozen).toEqual(appearanceForFixture(played, record));
    await expect
      .poll(() => canvasPixels(page.locator(PITCH_CANVAS).last(), worn.shirt.primary))
      .toBeGreaterThan(WORN_PIXELS);

    // Edit the linked palette; the already recorded appearance remains frozen (→KIT-9/12).
    const actions = [
      { type: 'kit-colour', role: 'home', colour: EDITED_SHIRT_COLOUR },
      { type: 'kit-colour', role: 'away', colour: '#1B2A49' },
      ...(worn.role === 'third'
        ? [{ type: 'kit-colour', role: 'third', colour: EDITED_SHIRT_COLOUR } as const]
        : []),
    ] as const;
    const edited = actions.reduce(reduceIdentityDraft, design);
    const view = await openDesign(page);
    for (const action of actions)
      await colourCode(view, `${KIT_LABEL[action.role]} 색 코드`).fill(action.colour);
    await keepScreenshot(
      testInfo,
      `edited crest preview ${size}`,
      view.getByRole('img', { name: /^엠블럼 미리보기/ }),
    );
    await applyDesign(page, view);
    await expect(crestFill(hud(page), edited.crest.primary)).not.toHaveCount(0);

    const raw = await exportRaw(page);
    const exported = (await decode(raw)).world;
    expect(ownClub(exported).identity).toEqual(edited);
    expect(ownClub(exported).color).toBe(edited.colours[0]);
    const kept = exported.ownMatches.find((match) => match.id === record.id)!;
    expect(kept.appearance).toEqual(frozen);
    // Today's design would dress that fixture differently; the record keeps what was worn (→KIT-12).
    expect(appearanceForFixture(exported, kept).sides[side]).not.toEqual(worn);

    // The file alone carries both into another browser profile (→SAVE-20/22).
    const elsewhere = await browser.newContext({ viewport });
    try {
      const other = await elsewhere.newPage();
      await other.goto(new URL('/', page.url()).href);
      await expect(other.getByRole('button', { name: '클럽 창단' })).toBeEnabled();
      await other
        .locator('input[type=file]')
        .last()
        .setInputFiles({
          name: 'continuity.haeram-save.json',
          mimeType: 'application/json',
          buffer: Buffer.from(raw),
        });
      await expect(other.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
      expect(canonical(await exportWorld(other))).toBe(canonical(exported));
      await expect(crestFill(hud(other), edited.crest.primary)).not.toHaveCount(0);
      // Its replay shows the recorded crest and shirt, not today's design.
      const replay = await openRecordedMatch(other);
      await expect(replay.getByTestId('match-kit-unrecorded')).toHaveCount(0);
      const score = replay.getByTestId('match-score');
      await expect(crestFill(score, design.crest.primary)).not.toHaveCount(0);
      for (const today of [edited.crest.primary, edited.crest.secondary!])
        await expect(crestFill(score, today)).toHaveCount(0);
      const canvas = replay.locator(PITCH_CANVAS);
      await expect
        .poll(() => canvasPixels(canvas, worn.shirt.primary))
        .toBeGreaterThan(WORN_PIXELS);
      expect(await canvasPixels(canvas, EDITED_SHIRT_COLOUR)).toBe(0);
      await keepScreenshot(
        testInfo,
        `recorded match after import ${size}`,
        replay.getByTestId('pitch-theatre'),
      );
    } finally {
      await elsewhere.close();
    }
  });

test('a shirt chosen for the next fixture survives reload and slot parking; another game gets neither it nor the design draft', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const w = delegatedCareer('identity-continuity-slots', 'Kit Keepers');
  const next = nextOwnFixture(w)!;
  const own = next.home === w.playerClub ? 0 : 1;
  const role = KIT_ROLES.find((r) => r !== appearanceForFixture(w, next).sides[own].role)!;
  const choice = { fixtureId: next.id, role };
  await importResponsibilityCareer(page, w);
  const applied = ownClub(await savedWorld(page)).identity!;
  const chosen = await openKit(page);
  await expect(chosen.kit).toHaveAttribute('data-fixture-id', next.id);
  await kitRadio(chosen.kit, role).click();
  await chosen.kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }).click();
  await expect(chosen.kit.getByTestId('fixture-kit-message')).toContainText(
    `${KIT_LABEL[role]} 유니폼으로 정했어요.`,
  );
  await expect.poll(async () => (await savedWorld(page)).kitChoice).toEqual(choice);
  await closePreparation(page, chosen.dialog, true);
  const expectChoice = async () => {
    const { dialog, kit } = await openKit(page);
    await expect(kit).toHaveAttribute('data-fixture-id', next.id);
    await expect(kitRadio(kit, role)).toHaveAttribute('aria-checked', 'true');
    await expect(kit.getByTestId('fixture-kit-state')).toContainText(
      `정해 둔 유니폼: ${KIT_LABEL[role]}`,
    );
    await closePreparation(page, dialog, false);
  };

  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  expect((await savedWorld(page)).kitChoice).toEqual(choice);
  await expectChoice();
  // An unapplied draft is session work of this game only (→WEB-74/86).
  const draft = await openDesign(page);
  await colourCode(draft, '홈 색 코드').fill(DRAFT_COLOUR);
  await expect(designStatus(draft)).toHaveText('적용 전 초안');

  // A new game in slot 2 parks this one first (→SAVE-14).
  await newGameIn(page, 2);
  await foundHere(page, 'Other Kit Club', 'identity-continuity-other');
  const index = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('haeram-soccor:games')!) as {
        slots: ({ id: string; worldId: string } | null)[];
      },
  );
  expect(index.slots[0]?.worldId).toBe(w.id);
  const parked = (await decode((await idbGet(page, 'games', index.slots[0]!.id))!)).world;
  expect(parked.kitChoice).toEqual(choice);
  expect(ownClub(parked).identity).toEqual(applied);
  const second = await savedWorld(page);
  expect(second.id).not.toBe(w.id);
  expect('kitChoice' in second).toBe(false);
  const other = await openKit(page);
  await expect(other.kit.getByTestId('fixture-kit-summary')).toHaveText(/· 자동$/);
  await expect(other.kit.getByRole('radio', { checked: true })).toHaveCount(0);
  await closePreparation(page, other.dialog, false);
  const otherDesign = await openDesign(page);
  await expect(colourCode(otherDesign, '홈 색 코드')).toHaveValue(FIRST_COLOUR);
  await expect(designStatus(otherDesign)).toHaveText('적용된 디자인');

  // Restored, the first game still has its choice and its applied design.
  await continueGame(page, 1);
  await expect.poll(async () => (await savedWorld(page)).id).toBe(w.id);
  expect((await savedWorld(page)).kitChoice).toEqual(choice);
  await expectChoice();
  const restored = await openDesign(page);
  await expect(colourCode(restored, '홈 색 코드')).toHaveValue(applied.colours[0]);
  await expect(designStatus(restored)).toHaveText('적용된 디자인');
});

/**
 * Writer activation has committed the pre-identity career once (→SAVE-3/21): at the next
 * generation, missing designs installed with every visible crest and colour kept (→KIT-15), no
 * recorded kit invented, the released full match model and manager tracking started there in its
 * container (→SAVE-23/24), and the original kept verbatim as the verified previous copy.
 */
async function expectAdopted(page: Page, legacy: World, original: string) {
  await expect.poll(() => committedRaw(page), { timeout: 20000 }).not.toBe(original);
  const { world, envelope } = await decode((await committedRaw(page))!);
  expect([envelope.schema, envelope.generation, envelope.parentGeneration]).toEqual([
    MANAGER_HISTORY_CHECKPOINT_SCHEMA,
    2,
    1,
  ]);
  expect(canonical(world)).toBe(canonical(adoptedCareer(legacy)));
  const crests = legacyCrestMap(legacy);
  for (const club of world.clubs) {
    const before = legacy.clubs.find((c) => c.id === club.id)!;
    expect(club.color).toBe(before.color);
    expect(club.identity!.crest).toEqual(crests.get(club.id));
    expect(club.identity!.colours).toEqual([before.color, crests.get(club.id)!.secondary]);
  }
  expect(world.ownMatches.length).toBeGreaterThan(0);
  expect(world.ownMatches.some((match) => 'appearance' in match)).toBe(false);
  expect(await idbGet(page, 'checkpoints', 'previous')).toBe(original);
  // The seeded slot:a career moved to IndexedDB with that commit (→SAVE-3).
  expect(await localCheckpoints(page)).toEqual([null, null]);
}

test('a pre-identity career keeps its crests and facts, gains only shirts on writer activation and says its kits were not recorded', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const legacy = preIdentityCareer();
  const raw = await containerOneCheckpoint(legacy);
  expect(JSON.parse(raw).schema).toBe(1);
  await seedCheckpoints(page, { active: raw, manifest: manifestOf(raw) });
  await page.goto('/journal');
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expectAdopted(page, legacy, raw);
  const crest = legacyCrestMap(legacy).get(legacy.playerClub)!;
  await expect(crestFill(hud(page), crest.primary)).not.toHaveCount(0);
  const inbox = await openNotices(page);
  await expect(notice(inbox, SAVE_DATA_UPDATED)).toHaveCount(1);
  await closeNotices(inbox);
  // Older playback says its kit was not recorded rather than borrowing today's (→KIT-12).
  const replay = await openRecordedMatch(page);
  await expect(replay.getByTestId('match-kit-unrecorded')).toHaveText('유니폼 미기록');
  await expect(replay.getByRole('img', { name: /엠블럼 미기록$/ })).toHaveCount(2);
  // A later load finds nothing missing and commits nothing more.
  await page.reload();
  // A reload restores the view it left, so the loaded game shows as the season HUD, not home.
  await expect(page.getByRole('region', { name: /^시즌 진행/ })).toBeVisible({ timeout: 30000 });
  expect(JSON.parse((await committedRaw(page))!).generation).toBe(2);
});

test('a read-only tab installs nothing; taking ownership adopts the designs once through the writer', async ({
  page,
  context,
}) => {
  test.slow();
  const holder = await context.newPage();
  await holder.goto('/');
  await expect(holder.getByRole('button', { name: '클럽 창단' })).toBeVisible();
  const legacy = preIdentityCareer();
  const raw = await containerOneCheckpoint(legacy);
  const manifest = manifestOf(raw);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedCheckpoints(page, { active: raw, manifest });
  await page.goto('/journal');
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  const readOnly = page.getByRole('status').filter({ hasText: '읽기 전용' });
  await expect(readOnly.first()).toBeVisible();
  // Inspection shows the designs the career would adopt, without installing them (→SAVE-6/21).
  const crest = legacyCrestMap(legacy).get(legacy.playerClub)!;
  await expect(crestFill(hud(page), crest.primary)).not.toHaveCount(0);
  const view = await openDesign(page);
  await expect(designStatus(view)).toHaveText('읽기 전용');
  await expect(applyButton(view)).toBeDisabled();
  const main = colourCode(view, '홈 색 코드');
  await expect(main).toHaveValue(ownClub(legacy).color);
  await expect(main).toBeDisabled();
  await expect(crestFill(view, crest.primary)).not.toHaveCount(0);
  // Nothing was installed in memory or written: the export is the stored checkpoint itself.
  expect(await exportRaw(page)).toBe(raw);
  expect(await checkpointStorage(page)).toEqual({ active: raw, manifest, previous: null });

  // The writer closes; this tab takes over and adopts through the validated writer path, once.
  await holder.close();
  await expect(readOnly).toHaveCount(0, { timeout: 20000 });
  await expectAdopted(page, legacy, raw);
  await expect(main).toBeEnabled();
  await expect(main).toHaveValue(ownClub(legacy).color);
  const inbox = await openNotices(page);
  await expect(notice(inbox, '다른 탭이 닫혀 이 탭에서 이어서 플레이합니다.')).toHaveCount(1);
  await expect(notice(inbox, SAVE_DATA_UPDATED)).toHaveCount(1);
});

test('a refused apply and a failed checkpoint keep the committed save, the draft and the export', async ({
  page,
}) => {
  test.slow();
  await failableWrites(page);
  await watchIdentityCommands(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const w = delegatedCareer('identity-continuity-failures', 'Failsafe Kits');
  await importResponsibilityCareer(page, w);
  const view = await openDesign(page);
  const field = colourCode(view, '홈 색 코드');
  // A first apply commits, so the committed checkpoint has a verified previous copy (→SAVE-3).
  await field.fill('#2A9D8F');
  await applyDesign(page, view);
  const committed = reduceIdentityDraft(identityOf(w, w.playerClub), {
    type: 'kit-colour',
    role: 'home',
    colour: '#2A9D8F',
  });
  await expect.poll(async () => ownClub(await savedWorld(page)).identity).toEqual(committed);
  const before = await checkpointStorage(page);
  expect(before.previous).not.toBeNull();

  // The host refuses an outdated apply before any effect: draft, disk and export are untouched.
  await field.fill('#E76F51');
  await refuseNextApply(page);
  await applyButton(view).click();
  const failure = view.getByRole('alert');
  await expect(failure).toContainText('구단 디자인을 적용하지 못했어요.');
  expect(await identityCommands(page)).toBe(2);
  await expect(designStatus(view)).toHaveText('적용 전 초안');
  await expect(field).toHaveValue('#E76F51');
  expect(await checkpointStorage(page)).toEqual(before);
  expect(ownClub(await exportWorld(page)).identity).toEqual(committed);

  // Applied, but its checkpoint cannot be written: the committed save stays loadable and the
  // applied design remains exportable from memory until a retry commits it (→SAVE-3/8).
  await failWrites(page, true);
  await failure.getByRole('button', { name: '다시 적용', exact: true }).click();
  await expect(designStatus(view)).toHaveText('적용된 디자인');
  const outcome = page.getByTestId('action-outcome');
  await outcome.getByRole('button', { name: /^(확인|알림 닫기)$/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: '저장 실패' })).toBeVisible();
  const retried = reduceIdentityDraft(committed, {
    type: 'kit-colour',
    role: 'home',
    colour: '#E76F51',
  });
  const failed = await checkpointStorage(page);
  expect([failed.active, failed.manifest]).toEqual([before.active, before.manifest]);
  // The committed checkpoint was copied and read back as the previous copy before the write.
  expect(failed.previous).toBe(before.active);
  expect(ownClub((await decode(failed.active!)).world).identity).toEqual(committed);
  expect(ownClub(await exportWorld(page)).identity).toEqual(retried);
  await failWrites(page, false);
  await retrySave(page);
  await expect.poll(async () => ownClub(await savedWorld(page)).identity).toEqual(retried);
  await page.reload();
  // A reload restores the view it left: the office's design area, not home.
  await expect(officeBar(page)).toBeVisible();
  await expect(page).toHaveURL(/\/direction\?view=identity$/);
  expect(ownClub(await savedWorld(page)).identity).toEqual(retried);
});

test('a failed adoption write keeps the original checkpoint and still exports the adopted career', async ({
  page,
}) => {
  test.slow();
  await failableWrites(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const legacy = preIdentityCareer();
  const raw = await containerOneCheckpoint(legacy);
  const manifest = manifestOf(raw);
  await seedCheckpoints(page, { active: raw, manifest });
  await failWrites(page, true);
  await page.goto('/journal');
  await expect(page.getByTestId('club-hub')).toBeVisible({ timeout: 30000 });
  await expect(
    page.getByRole('alert').filter({ hasText: '갱신한 저장 데이터를 저장하지 못했어요' }),
  ).toBeVisible();
  // The original is still the committed checkpoint, now also its verified previous copy.
  expect(await checkpointStorage(page)).toEqual({ active: raw, manifest, previous: raw });
  expect(canonical(await exportWorld(page))).toBe(canonical(adoptedCareer(legacy)));
  const inbox = await openNotices(page);
  await expect(notice(inbox, SAVE_DATA_UPDATED)).toHaveCount(0);
  await closeNotices(inbox);
  await failWrites(page, false);
  await retrySave(page);
  await expectAdopted(page, legacy, raw);
});

for (const [name, write] of Object.entries(FUTURE_CHECKPOINTS))
  test(`newer save data (${name}) over a valid older predecessor stays protected`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const w = delegatedCareer('identity-continuity-future', 'Future Kits');
    const older = await encode(w, 1, 0);
    const newer = await write(w, 2, 1);
    const stored = { active: newer, manifest: manifestOf(newer), previous: older };
    await seedCheckpoints(page, stored);
    await page.goto('/');
    const refused = page.getByRole('alert').filter({ hasText: '지원하지 않는' });
    await expect(refused.first()).toBeVisible();
    await expect(page.getByTestId('club-hub')).toHaveCount(0);
    expect(await checkpointStorage(page)).toEqual(stored);
    // Recovery exports the newer file exactly (→SAVE-11).
    const downloading = page.waitForEvent('download');
    await refused.getByRole('button', { name: '복구 기록 내보내기', exact: true }).click();
    expect(await readFile((await (await downloading).path())!, 'utf8')).toBe(newer);
    // Another load protects it again instead of falling back to the valid predecessor.
    await page.reload();
    await expect(refused.first()).toBeVisible();
    await expect(page.getByTestId('club-hub')).toHaveCount(0);
    expect(await checkpointStorage(page)).toEqual(stored);
  });
