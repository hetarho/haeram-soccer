# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: builds.spec.ts >> keeps quick lineup and sticky confirmation reachable at 390x844
- Location: tests/e2e/builds.spec.ts:125:3

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByRole('dialog', { name: '다음 경기 상세 리포트' }).getByRole('tab', { name: '전술 선택', exact: true })
Expected: "true"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" getByRole('dialog', { name: '다음 경기 상세 리포트' }).getByRole('tab', { name: '전술 선택', exact: true }) with timeout 5000ms
  - waiting for getByRole('dialog', { name: '다음 경기 상세 리포트' }).getByRole('tab', { name: '전술 선택', exact: true })

```

```yaml
- main:
  - button "설정"
  - text: Haeram Athletic 베타 버전 0.7 · 정식 출시 전까지 게임이 바뀔 수 있어요 1950.08.01
  - button "운영 자금 £2,777 11s 2d · 안정 · 자금 상황 보기": £2,777
  - button "알림·뉴스"
  - region "클럽 키우기":
    - region "이번 시즌":
      - text: 잉글랜드 아마추어 리그 라운드 0 / 30 리그 순위 — /16위 승점 0 0-0-0 컵대회 1개 리그 진행률 0.0%
      - progressbar "리그 진행률"
    - region "다음 경기":
      - heading "NEXT MATCH" [level=2]
      - text: 아마추어 리그
      - heading "vs Bristol Ironworks Amateurs 팀 정보" [level=3]:
        - text: vs
        - button "Bristol Ironworks Amateurs 팀 정보": Bristol Ironworks Amateurs
      - text: 홈
      - button "상세 리포트"
    - region "구단주 사무실":
      - img "1950–60년대 감독실 기본 · 매치데이 인쇄"
      - text: 구단주 사무실 결재 대기 0건
      - button "들어가기"
      - region "팀 상태":
        - list:
          - listitem:
            - button "팀 전력 30 · 리그 6/16위 · 대처 방법 보기":
              - text: 팀 전력 30 리그
              - strong: "6"
              - text: /
              - strong: "16"
              - text: 위
          - listitem:
            - button "피로 0 · 상쾌 · 대처 방법 보기": 피로 0 상쾌
          - listitem:
            - button "분위기 60 · 좋음 · 대처 방법 보기": 분위기 60 좋음
          - listitem:
            - button "감독 입지 65 · 안정 · 대처 방법 보기": 감독 입지 65 안정
          - listitem:
            - button "선수단 20/40 · 여유 · 대처 방법 보기": 선수단 20/40 여유
        - paragraph: 팀이 안정적이에요. 상태를 누르면 미리 챙길 방법을 볼 수 있어요.
    - navigation "클럽하우스":
      - button "감독 사무실"
      - button "코칭스태프실"
      - button "훈련장"
      - button "유소년 훈련장"
    - button "클럽 소식·시즌 브리핑"
    - figure "우리 구장 · 동네 구장 2500석 · 팬 800명":
      - img "1950–60년대 구장 1단계 기본 · 매치데이 인쇄"
      - text: 800명의 서포터 동네 구장 2,500석 구장 1단계
  - region "시즌 진행":
    - button "진행 방식 변경": "MODE: AUTO"
    - button "결재라인 모아보기": 결재 설정
    - progressbar "시즌 경과 일수"
    - group "자동 진행 속도":
      - button "자동 진행 시작"
      - combobox "자동 진행 배속": x1
- text: 저장 완료 · r0 · 물가 관측
- navigation "모바일 게임 메뉴":
  - button "리그"
  - button "컵"
  - button "클럽하우스"
  - button "이적시장"
  - button "기록"
- dialog "다음 경기 상세 리포트":
  - banner:
    - heading "다음 경기 상세 리포트" [level=2]
    - button "창 닫기"
  - region "감독 보고":
    - text: 감독 보고 · William Hughes → 구단주 · 1950년 8월 8일
    - paragraph: Bristol Ironworks Amateurs전(홈 · 아마추어 리그)은 4-4-2 역습로 나가겠습니다. 선발은 능력과 피로를 보고 제가 고르겠습니다. 상대는 전방 압박 성향이고, 전력은 우리가 4 앞섭니다.
  - region "우리 팀":
    - heading "Haeram Athletic" [level=3]
    - term: 전력
    - definition: "30"
    - term: 포메이션
    - definition: 4-4-2 · 역습
    - term: 학파
    - definition: 균형 · 창단 감독 · William Hughes
    - group "우리 팀 4-4-2 스쿼드": Hughes Turner Turner Brooks Hawkins Bennett Hughes Turner Bennett Bennett Clarke
    - heading "최근 0경기" [level=4]
    - paragraph: 확인할 수 있는 경기 결과가 없어요.
  - region "상대 팀":
    - heading "Bristol Ironworks Amateurs" [level=3]
    - term: 전력
    - definition: "26"
    - term: 포메이션
    - definition: 4-2-3-1 · 전방 압박
    - term: 학파
    - definition: 수비 조직가 · Albert Brooks
    - group "상대 팀 4-2-3-1 스쿼드": Watson Hughes Brooks Hughes Clarke Foster Watson Clarke Watson Clarke Foster
    - heading "최근 0경기" [level=4]
    - paragraph: 확인할 수 있는 경기 결과가 없어요.
  - region "최근 맞대결":
    - heading "최근 맞대결 · 0경기" [level=4]
    - paragraph: 아직 맞대결 기록이 없어요.
  - contentinfo:
    - button "의견 전달"
    - button "확인하고 홈으로"
```

# Test source

```ts
  39  |   await page.getByRole('button', { name: '쉬움' }).click();
  40  |   await page.getByRole('button', { name: '클럽 창단' }).click();
  41  |   await page.getByTestId('club-hub').getByRole('button', { name: '상세 리포트' }).click();
  42  |   const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  43  |   await expect(dialog).toBeVisible();
  44  |   // The report's right column is the opponent: its name and the shape it plays.
  45  |   const rival = dialog.getByRole('region', { name: '상대 팀', exact: true });
  46  |   await expect(rival.getByText(opponent.name, { exact: true })).toBeVisible();
  47  |   await expect(rival).toContainText(tacticLabel[opponentTactic]);
  48  |   const tactics = dialog.getByRole('region', { name: '경기 전술 준비' });
  49  |   const disclosures: Record<Tactic, { benefit: string; cost: string }> = {
  50  |     balanced: {
  51  |       benefit: '수비 안정성과 무리하지 않는 경기 운영.',
  52  |       cost: '점유와 슛에 특화한 추가 이점은 적어요.',
  53  |     },
  54  |     possession: {
  55  |       benefit: '미드필더 패스로 볼을 오래 소유해요.',
  56  |       cost: '직접 슛이 줄어요. 패스 능력이 낮으면 효과가 작아요.',
  57  |     },
  58  |     counter: {
  59  |       benefit: '수비와 공격수를 살려 압박 뒤 공간을 노려요.',
  60  |       cost: '공을 내줘요. 상대가 내려서면 기회를 만들기 어려워요.',
  61  |     },
  62  |     press: {
  63  |       benefit: '체력 좋은 선발이 상대의 패스를 방해해요.',
  64  |       cost: '피로 비용이 커요. 지친 선수단은 압박 효과가 떨어져요.',
  65  |     },
  66  |   };
  67  |   for (const tactic of Object.keys(disclosures) as Tactic[]) {
  68  |     const card = tactics.getByRole('button', {
  69  |       name: new RegExp(`^${tacticLabel[tactic]} 선발 적합도`),
  70  |     });
  71  |     await expect(card).toContainText(
  72  |       `선발 적합도 ${tacticalProfile(starters, tactic, opponentTactic).fit}/100`,
  73  |     );
  74  |     await expect(card).toContainText(disclosures[tactic].benefit);
  75  |     await expect(card).toContainText(disclosures[tactic].cost);
  76  |   }
  77  |   await expect(tactics.getByText('승리 확률이 아니며', { exact: false })).toBeVisible();
  78  |   const possession = tactics.getByRole('button', { name: /^점유 선발 적합도/ });
  79  |   const counter = tactics.getByRole('button', { name: /^역습 선발 적합도/ });
  80  |   await possession.click();
  81  |   await expect(possession).toHaveAttribute('aria-pressed', 'true');
  82  |   await counter.click();
  83  |   await expect(counter).toHaveAttribute('aria-pressed', 'true');
  84  |   await expect(possession).toHaveAttribute('aria-pressed', 'false');
  85  |   await chooseOption(
  86  |     dialog.getByRole('combobox', { name: '전술 요청 방식', exact: true }),
  87  |     'demand',
  88  |   );
  89  |   await expect(dialog.getByLabel('감독 예상 반응')).toContainText('강한 요구: 신뢰 18 감소');
  90  |   await chooseOption(
  91  |     dialog.getByRole('combobox', { name: '전술 요청 방식', exact: true }),
  92  |     'respect',
  93  |   );
  94  |   await dialog.getByRole('button', { name: '감독에게 전술 요청', exact: true }).click();
  95  |   await expect(dialog.getByRole('status')).toContainText('역습 요청 ·');
  96  |   const applied = await tactics.locator('[class*="sectionHead"] b').innerText();
  97  |   await expect(page.getByTestId('calendar')).toHaveAttribute('data-season', '1950');
  98  |   await expect(page.getByTestId('game-round')).toHaveText('0');
  99  |   await dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true }).click();
  100 |   await expect(dialog).toHaveCount(0);
  101 | 
  102 |   await watchNext(page);
  103 |   const match = page.getByTestId('match-theatre');
  104 |   await expect(match.getByText(opponent.name, { exact: true })).toBeVisible();
  105 |   const matchup =
  106 |     next.home === reference.playerClub
  107 |       ? `${applied} vs ${tacticLabel[opponentTactic]}`
  108 |       : `${tacticLabel[opponentTactic]} vs ${applied}`;
  109 |   await expect(match.getByText(matchup, { exact: true })).toBeVisible();
  110 |   await page.getByRole('button', { name: '결과 보기', exact: true }).click();
  111 |   await expect(match.getByText(/90(\+\d+)?′ ·.*경기 종료/)).toBeVisible();
  112 |   await page.getByRole('button', { name: '경기 상세', exact: true }).click();
  113 |   const stats = match.locator('[class*="matchStats"]');
  114 |   await expect(stats.getByText('점유율', { exact: true })).toBeVisible();
  115 |   await expect(stats.getByText('기대 득점 (xG)', { exact: true })).toBeVisible();
  116 |   await expect(stats.getByText('유효 슈팅', { exact: true })).toBeVisible();
  117 |   await expect(stats.getByText('패스 성공', { exact: true })).toBeVisible();
  118 |   await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  119 | });
  120 | 
  121 | for (const viewport of [
  122 |   { width: 360, height: 740 },
  123 |   { width: 390, height: 844 },
  124 | ]) {
  125 |   test(`keeps quick lineup and sticky confirmation reachable at ${viewport.width}x${viewport.height}`, async ({
  126 |     page,
  127 |   }) => {
  128 |     await page.setViewportSize(viewport);
  129 |     await page.goto('/');
  130 |     await page.getByText('고급 설정', { exact: true }).click();
  131 |     await page.getByLabel('세계 생성 시드').fill(`preparation-${viewport.width}`);
  132 |     await page.getByRole('button', { name: '쉬움' }).click();
  133 |     await page.getByRole('button', { name: '클럽 창단' }).click();
  134 |     const opener = page.getByTestId('club-hub').getByRole('button', { name: '상세 리포트' });
  135 |     await opener.click();
  136 |     const dialog = page.getByRole('dialog', { name: '다음 경기 상세 리포트' });
  137 |     const tacticTab = dialog.getByRole('tab', { name: '전술 선택', exact: true });
  138 |     const lineupTab = dialog.getByRole('tab', { name: '선발 선택', exact: true });
> 139 |     await expect(tacticTab).toHaveAttribute('aria-selected', 'true');
      |                             ^ Error: expect(locator).toHaveAttribute(expected) failed
  140 |     const cards = dialog.getByRole('region', { name: '경기 전술 준비' }).getByRole('button');
  141 |     await settle(page);
  142 |     const bounds = await Promise.all((await cards.all()).map((card) => card.boundingBox()));
  143 |     expect(bounds).toHaveLength(4);
  144 |     expect(bounds[0]!.y).toBe(bounds[1]!.y);
  145 |     expect(bounds[2]!.y).toBe(bounds[3]!.y);
  146 |     expect(bounds[1]!.x).toBeGreaterThan(bounds[0]!.x);
  147 |     expect(bounds[2]!.y).toBeGreaterThan(bounds[0]!.y);
  148 |     await tacticTab.focus();
  149 |     await page.keyboard.press('ArrowRight');
  150 |     await expect(lineupTab).toBeFocused();
  151 |     await expect(lineupTab).toHaveAttribute('aria-selected', 'true');
  152 |     const strongest = dialog.getByRole('button', { name: '전력 우선으로 선택', exact: true });
  153 |     const rest = dialog.getByRole('button', { name: '피로 회복 우선으로 선택', exact: true });
  154 |     const save = dialog.getByRole('button', { name: '이 선발로 다음 경기 준비', exact: true });
  155 |     const close = dialog.getByRole('button', { name: '준비 마치고 돌아가기', exact: true });
  156 |     for (const target of [strongest, rest, save, close]) {
  157 |       const rect = await target.boundingBox();
  158 |       expect(rect, await target.innerText()).not.toBeNull();
  159 |       expect(rect!.height).toBeGreaterThanOrEqual(44);
  160 |       expect(rect!.y).toBeGreaterThanOrEqual(0);
  161 |       expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height);
  162 |     }
  163 |     await rest.click();
  164 |     await expect(rest).toHaveAttribute('aria-pressed', 'true');
  165 |     await save.click();
  166 |     await expect(dialog.getByRole('status')).toContainText('선발 11명을 저장했습니다.');
  167 |     await dialog.getByText('선수별 교체', { exact: true }).click();
  168 |     await settle(page);
  169 |     const footerRect = await save.boundingBox();
  170 |     const body = dialog.locator('[class*="modalBody"]');
  171 |     await body.evaluate((element) => {
  172 |       element.scrollTop = element.scrollHeight;
  173 |     });
  174 |     const afterScroll = await save.boundingBox();
  175 |     expect(afterScroll!.y).toBe(footerRect!.y);
  176 |     expect(afterScroll!.y + afterScroll!.height).toBeLessThanOrEqual(viewport.height);
  177 |     await close.click();
  178 |     await expect(opener).toBeFocused();
  179 |     await expect(page.getByTestId('save-status')).toContainText('저장 완료');
  180 |     await page.reload();
  181 |     await opener.click();
  182 |     await expect(dialog.getByRole('region', { name: '감독 보고', exact: true })).toContainText(
  183 |       '정해 주신 11명',
  184 |     );
  185 |   });
  186 | }
  187 | 
```