import { expect, test, type Locator, type Page } from '@playwright/test';
import { decode } from '../../apps/web/src/adapters/persistence';
import { competitionLabel } from '../../apps/web/src/ui/format';
import { canonical } from '../../packages/contracts/src/index';
import { KIT_ROLES, type KitRole } from '../../packages/contracts/src/identity';
import type { Fixture, World } from '../../packages/contracts/src/types';
import {
  advanceToNextMatch,
  createWorld,
  currentDay,
  identityOf,
  nextOwnFixture,
  operate,
} from '../../packages/engine/src/index';
import { appearanceForFixture } from '../../packages/engine/src/match-appearance';
import { ALL_DELEGATED } from './events';
import { importResponsibilityCareer } from './responsibility-fixtures';

/**
 * KIT-6/7/8, WEB-88, SAVE-20: our shirt for the named next fixture, chosen in preparation. Careers
 * are marked synthetic worlds reached through real seeded play (`kit-prep-a`: a home league match,
 * then an away one, then an away cup tie) and enter through the ordinary file import.
 */

const LABEL: Record<KitRole, string> = { home: '홈', away: '원정', third: '서드' };
const ownSide = (w: World, f: Fixture) => (f.home === w.playerClub ? 0 : 1);

/** A new career with every business decision delegated, after `matches` own matches. */
function career(matches: number) {
  const w = createWorld({
    country: 'ENG',
    name: 'Kit Town',
    color: '#bf7956',
    seed: 'kit-prep-a',
    level: 'easy',
  });
  Object.assign(w.settings!.responsibilities, ALL_DELEGATED);
  for (let i = 0; i < matches; i++) advanceToNextMatch(w);
  return w;
}
/** What `fixture` records once our `role` is chosen for it, from the engine itself. */
function chosenAppearance(w: World, fixture: Fixture, role: KitRole) {
  const chosen = structuredClone(w);
  operate(chosen, { type: 'match-kit', fixtureId: fixture.id, role });
  return appearanceForFixture(chosen, fixture);
}

/** The committed checkpoint's world, once every revision is on disk. */
async function savedWorld(page: Page) {
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  const raw = await page.evaluate(() => {
    const manifest = JSON.parse(localStorage.getItem('haeram-soccor:manifest')!);
    return localStorage.getItem(`haeram-soccor:slot:${manifest.slot ? 'b' : 'a'}`)!;
  });
  return (await decode(raw)).world;
}
const recorded = async (page: Page, id: string) =>
  (await savedWorld(page)).ownMatches.find((match) => match.id === id)?.appearance;

const hubPreparation = (page: Page) =>
  page.getByTestId('club-hub').getByRole('button', { name: '전술·선발 준비', exact: true });
/** Opens preparation and unfolds its shirt selector once queued work has settled. */
async function openKit(page: Page, opener: Locator) {
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  const kit = dialog.getByTestId('fixture-kit');
  await kit.getByTestId('fixture-kit-summary').click();
  await expect(
    kit.getByRole('radiogroup', { name: '이 경기 우리 유니폼', exact: true }),
  ).toBeVisible();
  return { dialog, kit };
}
const radio = (kit: Locator, role: KitRole) =>
  kit.getByRole('radio', { name: `우리 ${LABEL[role]} 유니폼`, exact: true });
async function closePreparation(page: Page, dialog: Locator, decided: boolean) {
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  if (!decided) return;
  const outcome = page.getByTestId('action-outcome');
  await expect(outcome).toBeVisible();
  await outcome.getByRole('button', { name: '확인', exact: true }).click();
  await expect(outcome).toHaveCount(0);
}
async function watchToResult(page: Page) {
  await page.getByTestId('hub-play').click();
  await expect(page.getByTestId('match-theatre')).toBeVisible();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(page.getByTestId('match-result-summary')).toBeVisible();
}

test('our home league shirt is previewed, committed once, kept through reload and worn only in that fixture', async ({
  page,
}) => {
  test.slow();
  const viewport = { width: 360, height: 740 };
  await page.setViewportSize(viewport);
  const w = career(0);
  const next = nextOwnFixture(w)!;
  expect(ownSide(w, next)).toBe(0);
  const automatic = appearanceForFixture(w, next).sides[0].role;
  const role = KIT_ROLES.find((r) => r !== automatic)!;
  const designs = canonical(w.clubs.map((club) => club.identity));
  await importResponsibilityCareer(page, w);
  const before = await savedWorld(page);
  const { dialog, kit } = await openKit(page, hubPreparation(page));
  await expect(kit).toHaveAttribute('data-fixture-id', next.id);
  await expect(kit.getByTestId('fixture-kit-context')).toContainText('Kit Town 대 ');
  await expect(kit.getByTestId('fixture-kit-context')).toContainText('우리 홈 경기');
  await expect(kit.getByTestId('fixture-kit-summary')).toHaveText(/· 자동$/);
  await expect(kit.getByTestId('fixture-kit-recommendation')).toContainText(
    `자동 추천: 우리 ${LABEL[automatic]} 유니폼`,
  );
  // Both sides' shirts and automatic keepers are named before anything is chosen.
  const caption = kit.locator('figcaption');
  await expect(caption).toContainText(`홈 Kit Town: ${LABEL[automatic]} 유니폼`);
  await expect(caption).toContainText('골키퍼는 자동으로 골라요');
  await expect(kit.getByRole('radio', { checked: true })).toHaveCount(0);
  // Choosing redraws only the preview: our side stays at home and nothing is saved.
  await radio(kit, role).click();
  await expect(radio(kit, role)).toHaveAttribute('aria-checked', 'true');
  await expect(caption).toContainText(`홈 Kit Town: ${LABEL[role]} 유니폼`);
  await expect(kit.getByTestId('fixture-kit-state')).toContainText(
    `미리보기: ${LABEL[role]} 유니폼 · 아직 정하지 않았어요.`,
  );
  const unsaved = await savedWorld(page);
  expect(unsaved.revision).toBe(before.revision);
  expect('kitChoice' in unsaved).toBe(false);
  // Phone-size touch targets and no sideways overflow inside the sheet (→WEB-17).
  for (const target of [
    kit.getByTestId('fixture-kit-summary'),
    ...KIT_ROLES.map((r) => radio(kit, r)),
    kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }),
    kit.getByRole('button', { name: '자동 선택으로 되돌리기', exact: true }),
  ]) {
    const bounds = await target.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  }
  expect(
    await kit.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(1);

  await kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }).click();
  await expect(kit.getByTestId('fixture-kit-message')).toContainText(
    `${LABEL[role]} 유니폼으로 정했어요.`,
  );
  await expect(kit.getByTestId('fixture-kit-summary')).toHaveText(/· 직접 고름$/);
  await expect
    .poll(async () => (await savedWorld(page)).kitChoice)
    .toEqual({ fixtureId: next.id, role });
  const chosen = await savedWorld(page);
  // One owner decision: the saved designs, tactic, lineup and date are untouched.
  expect(chosen.revision).toBe(before.revision + 1);
  expect(canonical(chosen.clubs.map((club) => club.identity))).toBe(designs);
  expect([chosen.tactic, chosen.lineup, currentDay(chosen)]).toEqual([
    before.tactic,
    before.lineup,
    currentDay(before),
  ]);
  await closePreparation(page, dialog, true);

  await page.reload();
  await expect(page.getByTestId('club-hub')).toBeVisible();
  const reopened = await openKit(page, hubPreparation(page));
  await expect(reopened.kit).toHaveAttribute('data-fixture-id', next.id);
  await expect(radio(reopened.kit, role)).toHaveAttribute('aria-checked', 'true');
  await expect(reopened.kit.getByTestId('fixture-kit-state')).toContainText(
    `정해 둔 유니폼: ${LABEL[role]}`,
  );
  await closePreparation(page, reopened.dialog, false);

  await watchToResult(page);
  const expected = chosenAppearance(w, next, role);
  expect(expected.sides[0]).toMatchObject({ club: w.playerClub, role });
  await expect.poll(() => recorded(page, next.id)).toEqual(expected);
  const settled = await savedWorld(page);
  expect('kitChoice' in settled).toBe(false);
  // The following fixture is offered again with automatic selection.
  const following = nextOwnFixture(settled)!;
  const after = await openKit(
    page,
    page.getByTestId('match-theatre').getByRole('button', { name: '전술·선발 준비', exact: true }),
  );
  await expect(after.kit).toHaveAttribute('data-fixture-id', following.id);
  await expect(after.kit.getByTestId('fixture-kit-summary')).toHaveText(/· 자동$/);
  await expect(after.kit.getByRole('radio', { checked: true })).toHaveCount(0);
  await closePreparation(page, after.dialog, false);
});

test('our away shirt maps to the away side and stays apart from the lineup decision', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const w = career(1);
  const next = nextOwnFixture(w)!;
  expect(ownSide(w, next)).toBe(1);
  const automatic = appearanceForFixture(w, next).sides[1].role;
  const role = KIT_ROLES.find((r) => r !== automatic)!;
  await importResponsibilityCareer(page, w);
  const before = await savedWorld(page);
  const { dialog, kit } = await openKit(page, hubPreparation(page));
  await expect(kit).toHaveAttribute('data-fixture-id', next.id);
  await expect(kit.getByTestId('fixture-kit-context')).toContainText(
    ' 대 Kit Town · 우리 원정 경기',
  );
  await radio(kit, role).click();
  await expect(kit.locator('figcaption')).toContainText(`원정 Kit Town: ${LABEL[role]} 유니폼`);
  await kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }).click();
  await expect
    .poll(async () => (await savedWorld(page)).kitChoice)
    .toEqual({ fixtureId: next.id, role });
  expect((await savedWorld(page)).lineup).toEqual(before.lineup);
  // The lineup has its own draft and command; the shirt choice survives it unchanged.
  await dialog.getByRole('tab', { name: '선발 선택', exact: true }).click();
  await dialog.getByRole('button', { name: '피로 회복 우선으로 선택', exact: true }).click();
  await dialog.getByRole('button', { name: '이 선발로 다음 경기 준비', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('선발 11명을 저장했습니다.');
  await expect(kit.getByTestId('fixture-kit-summary')).toHaveText(/· 직접 고름$/);
  await expect.poll(async () => (await savedWorld(page)).lineup?.length).toBe(11);
  const both = await savedWorld(page);
  expect(both.kitChoice).toEqual({ fixtureId: next.id, role });
  expect(both.tactic).toBe(before.tactic);
  await closePreparation(page, dialog, true);

  await watchToResult(page);
  const expected = chosenAppearance(w, next, role);
  expect(expected.sides[1]).toMatchObject({ club: w.playerClub, role });
  expect(expected.sides[0].club).toBe(next.home);
  await expect.poll(() => recorded(page, next.id)).toEqual(expected);
  expect('kitChoice' in (await savedWorld(page))).toBe(false);
});

test('a warned cup-tie clash can be confirmed, reads read-only elsewhere and returns to automatic selection', async ({
  page,
  context,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const w = career(3);
  const next = nextOwnFixture(w)!;
  expect(next.kind).toBe('cup');
  const own = ownSide(w, next);
  // A marked synthetic rival sharing our palette: all three of its shirts are our home shirt.
  const rival = w.clubs.find((club) => club.id === (own === 0 ? next.away : next.home))!;
  const shared = identityOf(w, w.playerClub).kits.home;
  rival.identity = {
    ...identityOf(w, rival.id),
    kits: { home: { ...shared }, away: { ...shared }, third: { ...shared } },
  };
  const automatic = appearanceForFixture(w, next);
  expect(automatic.sides[own].role).not.toBe('home');
  expect(chosenAppearance(w, next, 'home').warnings).toContain('teams');
  await importResponsibilityCareer(page, w);
  const { dialog, kit } = await openKit(page, hubPreparation(page));
  await expect(kit).toHaveAttribute('data-fixture-id', next.id);
  await expect(kit.getByTestId('fixture-kit-context')).toContainText(competitionLabel(w, next));
  await expect(kit.getByTestId('fixture-kit-context')).toContainText(
    `우리 ${own === 0 ? '홈' : '원정'} 경기`,
  );
  await radio(kit, 'home').click();
  await expect(kit.getByTestId('fixture-kit-warning')).toContainText(
    `더 잘 구분되는 ${LABEL[automatic.sides[own].role]} 유니폼을 추천해요.`,
  );
  await expect(kit.locator('figcaption')).toContainText(
    '경고: 두 팀 유니폼이 비슷해 구분하기 어려워요.',
  );
  // The warning informs; it adds no stop and the owner may still confirm (→KIT-7).
  await kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }).click();
  await expect(kit.getByTestId('fixture-kit-message')).toContainText('홈 유니폼으로 정했어요.');
  await expect
    .poll(async () => (await savedWorld(page)).kitChoice)
    .toEqual({ fixtureId: next.id, role: 'home' });

  const viewer = await context.newPage();
  try {
    await viewer.setViewportSize({ width: 390, height: 844 });
    await viewer.goto('/journal');
    await expect(viewer.getByTestId('club-hub')).toBeVisible();
    const view = await openKit(viewer, hubPreparation(viewer));
    await expect(view.kit.getByTestId('fixture-kit-summary')).toHaveText(/· 직접 고름$/);
    await expect(view.kit).toContainText('읽기 전용 탭에서는 유니폼을 정할 수 없어요.');
    for (const role of KIT_ROLES) await expect(radio(view.kit, role)).toBeDisabled();
    await expect(
      view.kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }),
    ).toBeDisabled();
    await expect(
      view.kit.getByRole('button', { name: '자동 선택으로 되돌리기', exact: true }),
    ).toBeDisabled();
  } finally {
    await viewer.close();
  }

  await kit.getByRole('button', { name: '자동 선택으로 되돌리기', exact: true }).click();
  await expect(kit.getByTestId('fixture-kit-message')).toContainText('자동 선택으로 되돌렸어요.');
  await expect(kit.getByTestId('fixture-kit-summary')).toHaveText(/· 자동$/);
  await expect(kit.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect.poll(async () => 'kitChoice' in (await savedWorld(page))).toBe(false);
  await closePreparation(page, dialog, true);

  await watchToResult(page);
  await expect.poll(() => recorded(page, next.id)).toEqual(automatic);
});

test('automatic play moving the next fixture restarts the preview and never applies the drafted shirt', async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 390, height: 844 });
  const w = career(0);
  // No match-eve stop: the clock plays the match as a result while preparation stays open.
  w.settings!.observations.matchEve = false;
  const next = nextOwnFixture(w)!;
  const automatic = appearanceForFixture(w, next);
  const drafted = KIT_ROLES.find((r) => r !== automatic.sides[ownSide(w, next)].role)!;
  await importResponsibilityCareer(page, w);
  await page.getByRole('button', { name: '자동 진행 시작', exact: true }).click();
  const { dialog, kit } = await openKit(page, hubPreparation(page));
  await expect(kit).toHaveAttribute('data-fixture-id', next.id);
  await radio(kit, drafted).click();
  await expect(kit.getByTestId('fixture-kit-state')).toContainText(
    `미리보기: ${LABEL[drafted]} 유니폼`,
  );
  await expect(kit).not.toHaveAttribute('data-fixture-id', next.id, { timeout: 20000 });
  await expect(kit).toContainText('다음 경기가 바뀌었어요');
  await expect(kit).toContainText(`고르던 ${LABEL[drafted]} 유니폼은 적용하지 않았어요.`);
  await expect(kit.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(
    kit.getByRole('button', { name: '이 유니폼으로 정하기', exact: true }),
  ).toBeDisabled();
  await closePreparation(page, dialog, false);
  // The match was played through without an acknowledgement; the clock is still running.
  const stop = page.getByRole('button', { name: '자동 진행 정지', exact: true });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect.poll(() => recorded(page, next.id), { timeout: 20000 }).toEqual(automatic);
  expect('kitChoice' in (await savedWorld(page))).toBe(false);
});
