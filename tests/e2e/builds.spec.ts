import { chooseOption } from './select';
import { expect, test } from '@playwright/test';
import {
  clubOf,
  createWorld,
  nextOwnFixture,
  npcTactic,
  startingSquad,
  tacticalProfile,
  tacticLabel,
} from '../../packages/engine/src/index';
import type { Tactic } from '../../packages/contracts/src/types';
import { settle } from './layout';

test('discloses roster and opponent tactical fit before an actual seeded match', async ({
  page,
}) => {
  const founding = {
    country: 'ENG' as const,
    name: 'Haeram Athletic',
    color: '#bf7956',
    seed: 'tactical-build-disclosure',
    difficulty: 2,
  };
  const reference = createWorld(founding);
  const next = nextOwnFixture(reference)!;
  const opponent = reference.clubs.find(
    (club) => club.id === (next.home === reference.playerClub ? next.away : next.home),
  )!;
  const opponentTactic = npcTactic(opponent);
  const starters = startingSquad(reference, clubOf(reference));

  await page.goto('/');
  await page.getByText('고급 설정', { exact: true }).click();
  await page.getByLabel('세계 생성 시드').fill(founding.seed);
  await page.getByRole('button', { name: '넉넉한 출발' }).click();
  await page.getByRole('button', { name: '클럽 창단' }).click();
  await page.getByTestId('club-hub').getByRole('button', { name: '전술·선발 준비' }).click();
  const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(opponent.name, { exact: true })).toBeVisible();
  await expect(
    dialog.getByText(`상대 성향 ${tacticLabel[opponentTactic]}`, { exact: false }),
  ).toBeVisible();
  const tactics = dialog.getByRole('region', { name: '경기 전술 준비' });
  const disclosures: Record<Tactic, { benefit: string; cost: string }> = {
    balanced: {
      benefit: '수비 안정성과 무리하지 않는 경기 운영.',
      cost: '점유와 슛에 특화한 추가 이점은 적어요.',
    },
    possession: {
      benefit: '미드필더 패스로 볼을 오래 소유해요.',
      cost: '직접 슛이 줄어요. 패스 능력이 낮으면 효과가 작아요.',
    },
    counter: {
      benefit: '수비와 공격수를 살려 압박 뒤 공간을 노려요.',
      cost: '공을 내줘요. 상대가 내려서면 기회를 만들기 어려워요.',
    },
    press: {
      benefit: '체력 좋은 선발이 상대의 패스를 방해해요.',
      cost: '피로 비용이 커요. 지친 선수단은 압박 효과가 떨어져요.',
    },
  };
  for (const tactic of Object.keys(disclosures) as Tactic[]) {
    const card = tactics.getByRole('button', {
      name: new RegExp(`^${tacticLabel[tactic]} 선발 적합도`),
    });
    await expect(card).toContainText(
      `선발 적합도 ${tacticalProfile(starters, tactic, opponentTactic).fit}/100`,
    );
    await expect(card).toContainText(disclosures[tactic].benefit);
    await expect(card).toContainText(disclosures[tactic].cost);
  }
  await expect(tactics.getByText('승리 확률이 아니며', { exact: false })).toBeVisible();
  const possession = tactics.getByRole('button', { name: /^점유 선발 적합도/ });
  const counter = tactics.getByRole('button', { name: /^역습 선발 적합도/ });
  await possession.click();
  await expect(possession).toHaveAttribute('aria-pressed', 'true');
  await counter.click();
  await expect(counter).toHaveAttribute('aria-pressed', 'true');
  await expect(possession).toHaveAttribute('aria-pressed', 'false');
  await chooseOption(
    dialog.getByRole('combobox', { name: '전술 요청 방식', exact: true }),
    'demand',
  );
  await expect(dialog.getByLabel('감독 예상 반응')).toContainText('강한 요구: 신뢰 18 감소');
  await chooseOption(
    dialog.getByRole('combobox', { name: '전술 요청 방식', exact: true }),
    'respect',
  );
  await dialog.getByRole('button', { name: '감독에게 전술 요청', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('역습 요청 ·');
  const applied = await tactics.locator('[class*="sectionHead"] b').innerText();
  await expect(page.getByTestId('calendar')).toHaveText(/1901\/02 · 라운드 0$/);
  await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByTestId('hub-play').click();
  const match = page.getByRole('region', { name: '경기 관전', exact: true });
  await expect(match.getByText(opponent.name, { exact: true })).toBeVisible();
  const matchup =
    next.home === reference.playerClub
      ? `${applied} vs ${tacticLabel[opponentTactic]}`
      : `${tacticLabel[opponentTactic]} vs ${applied}`;
  await expect(match.getByText(matchup, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  await expect(match.getByText(/90′ ·.*경기 종료/)).toBeVisible();
  await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  await expect(match.getByText('점유율', { exact: true })).toBeVisible();
  await expect(match.getByText('유효 슈팅', { exact: true })).toBeVisible();
  await expect(match.getByText('패스 성공', { exact: true })).toBeVisible();
  await expect(page.getByTestId('save-status')).toContainText('저장 완료');
});

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`keeps quick lineup and sticky confirmation reachable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByText('고급 설정', { exact: true }).click();
    await page.getByLabel('세계 생성 시드').fill(`preparation-${viewport.width}`);
    await page.getByRole('button', { name: '넉넉한 출발' }).click();
    await page.getByRole('button', { name: '클럽 창단' }).click();
    const opener = page.getByTestId('club-hub').getByRole('button', { name: '전술·선발 준비' });
    await opener.click();
    const dialog = page.getByRole('dialog', { name: '다음 경기 전술과 선발 준비' });
    const tacticTab = dialog.getByRole('tab', { name: '전술 선택', exact: true });
    const lineupTab = dialog.getByRole('tab', { name: '선발 선택', exact: true });
    await expect(tacticTab).toHaveAttribute('aria-selected', 'true');
    const cards = dialog.getByRole('region', { name: '경기 전술 준비' }).getByRole('button');
    await settle(page);
    const bounds = await Promise.all((await cards.all()).map((card) => card.boundingBox()));
    expect(bounds).toHaveLength(4);
    expect(bounds[0]!.y).toBe(bounds[1]!.y);
    expect(bounds[2]!.y).toBe(bounds[3]!.y);
    expect(bounds[1]!.x).toBeGreaterThan(bounds[0]!.x);
    expect(bounds[2]!.y).toBeGreaterThan(bounds[0]!.y);
    await tacticTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(lineupTab).toBeFocused();
    await expect(lineupTab).toHaveAttribute('aria-selected', 'true');
    const strongest = dialog.getByRole('button', { name: '전력 우선으로 선택', exact: true });
    const rest = dialog.getByRole('button', { name: '피로 회복 우선으로 선택', exact: true });
    const save = dialog.getByRole('button', { name: '이 선발로 다음 경기 준비', exact: true });
    const close = dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true });
    for (const target of [strongest, rest, save, close]) {
      const rect = await target.boundingBox();
      expect(rect, await target.innerText()).not.toBeNull();
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
    }
    await rest.click();
    await expect(rest).toHaveAttribute('aria-pressed', 'true');
    await save.click();
    await expect(dialog.getByRole('status')).toContainText('선발 11명을 저장했습니다.');
    await dialog.getByText('선수별 교체', { exact: true }).click();
    await settle(page);
    const footerRect = await save.boundingBox();
    const body = dialog.locator('[class*="modalBody"]');
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const afterScroll = await save.boundingBox();
    expect(afterScroll!.y).toBe(footerRect!.y);
    expect(afterScroll!.y + afterScroll!.height).toBeLessThanOrEqual(viewport.height);
    await close.click();
    await expect(opener).toBeFocused();
    await page.reload();
    await expect(page.getByTestId('hub-preparation')).toContainText('직접 고른 선발');
  });
}
