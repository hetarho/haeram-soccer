# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: approval-requests.spec.ts >> home approval returns keep request identity and stale history at 390
- Location: tests/e2e/approval-requests.spec.ts:9:3

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('event-card').and(getByRole('complementary', { name: '이벤트', exact: true }))
Expected: 2
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" getByTestId('event-card').and(getByRole('complementary', { name: '이벤트', exact: true })) with timeout 5000ms
  - waiting for getByTestId('event-card').and(getByRole('complementary', { name: '이벤트', exact: true }))
    14 × locator resolved to 0 elements
       - unexpected value "0"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - main [ref=e4]:
    - generic [ref=e5]:
      - button "설정" [ref=e6] [cursor=pointer]
      - generic [ref=e16]:
        - generic [ref=e17]: Pending Duties
        - generic [ref=e18]:
          - generic [aria-hidden] [ref=e19]: BETA
          - generic [ref=e20]: 베타 버전 0.7 · 정식 출시 전까지 게임이 바뀔 수 있어요
      - generic [ref=e21]: 1950.08.05
      - button "운영 자금 £4,166,666,666 13s 3d · 안정 · 자금 상황 보기" [ref=e22] [cursor=pointer]:
        - generic [ref=e23]: £4.16B
      - button "알림·뉴스 · 새 소식 6개" [ref=e25] [cursor=pointer]:
        - generic [aria-hidden] [ref=e27]: "6"
    - region "클럽 키우기" [ref=e31]:
      - region "이번 시즌" [ref=e32]:
        - generic [ref=e33]:
          - generic [ref=e34]: 잉글랜드 아마추어 리그
          - generic [aria-hidden] [ref=e35]: 컵
          - generic [ref=e36]:
            - generic "우리 리그 30라운드 중 0라운드" [ref=e37]:
              - generic [ref=e38]: 라운드
              - generic [ref=e39]:
                - generic [ref=e40]: "0"
                - generic [ref=e41]: / 30
            - generic [ref=e42]:
              - generic [ref=e43]: 리그 순위
              - generic [ref=e44]:
                - generic [ref=e45]: —
                - generic [ref=e46]: /16위
            - generic [ref=e47]:
              - generic [ref=e48]: 승점 0
              - generic [ref=e49]: 0-0-0
          - generic [ref=e51]:
            - generic [ref=e52]: 컵대회
            - generic [ref=e53]: 1개
          - generic [ref=e54]:
            - generic [ref=e55]:
              - text: 리그 진행률
              - generic [ref=e56]: 0.0%
            - progressbar "리그 진행률" [ref=e57]
      - region "다음 경기" [ref=e58]:
        - generic [ref=e59]:
          - generic [ref=e60]:
            - heading "NEXT MATCH" [level=2] [ref=e61]
            - generic [ref=e62]: 아마추어 리그
          - generic [ref=e63]:
            - heading [level=3] [ref=e64]:
              - text: vs
              - button "Bristol Ironworks Amateurs 팀 정보" [ref=e65] [cursor=pointer]:
                - generic [ref=e73]: Bristol Ironworks Amateurs
            - generic [ref=e74]: 홈
            - button "상세 리포트" [ref=e75] [cursor=pointer]
      - region "구단주 사무실" [ref=e76]:
        - img "1950–60년대 감독실 기본 · 매치데이 인쇄" [ref=e78]
        - generic [ref=e80]:
          - generic [ref=e81]: 구단주 사무실
          - generic [ref=e82]:
            - text: 결재 대기
            - generic [ref=e83]: "2"
            - text: 건
          - button "들어가기" [ref=e84] [cursor=pointer]
        - region "팀 상태" [ref=e85]:
          - list [ref=e86]:
            - listitem [ref=e87]:
              - button "팀 전력 28 · 리그 10/16위 · 대처 방법 보기" [ref=e88] [cursor=pointer]:
                - generic [ref=e89]: 팀 전력
                - generic [ref=e90]: "28"
                - generic [ref=e92]:
                  - text: 리그
                  - strong [ref=e93]: "10"
                  - text: /
                  - strong [ref=e94]: "16"
                  - text: 위
            - listitem [ref=e95]:
              - button "피로 0 · 상쾌 · 대처 방법 보기" [ref=e96] [cursor=pointer]:
                - generic [ref=e97]: 피로
                - generic [ref=e98]: "0"
                - generic [ref=e100]: 상쾌
            - listitem [ref=e101]:
              - button "분위기 60 · 좋음 · 대처 방법 보기" [ref=e102] [cursor=pointer]:
                - generic [ref=e103]: 분위기
                - generic [ref=e104]: "60"
                - generic [ref=e106]: 좋음
            - listitem [ref=e107]:
              - button "감독 입지 65 · 안정 · 대처 방법 보기" [ref=e108] [cursor=pointer]:
                - generic [ref=e109]: 감독 입지
                - generic [ref=e110]: "65"
                - generic [ref=e112]: 안정
            - listitem [ref=e113]:
              - button "선수단 20/40 · 여유 · 대처 방법 보기" [ref=e114] [cursor=pointer]:
                - generic [ref=e115]: 선수단
                - generic [ref=e116]: 20/40
                - generic [ref=e118]: 여유
          - paragraph [ref=e119]: 팀이 안정적이에요. 상태를 누르면 미리 챙길 방법을 볼 수 있어요.
      - navigation "클럽하우스" [ref=e120]:
        - button "감독 사무실" [ref=e121] [cursor=pointer]
        - button "코칭스태프실" [ref=e123] [cursor=pointer]
        - button "훈련장" [ref=e125] [cursor=pointer]
        - button "유소년 훈련장" [ref=e127] [cursor=pointer]
      - button "클럽 소식·시즌 브리핑" [ref=e130] [cursor=pointer]
      - figure "우리 구장 · 동네 구장 2500석 · 팬 800명" [ref=e132]:
        - img "1950–60년대 구장 1단계 기본 · 매치데이 인쇄" [ref=e134]
        - generic [ref=e135]:
          - generic [ref=e136]:
            - generic [aria-hidden] [ref=e137]: ♥
            - text: 800명의 서포터
          - generic [ref=e138]: 동네 구장
          - generic [ref=e139]:
            - generic [aria-hidden] [ref=e140]: ▲
            - text: 2,500석
        - generic [ref=e141]: 구장 1단계
    - region "시즌 진행" [ref=e142]:
      - generic [ref=e143]:
        - button "진행 방식 변경" [ref=e144] [cursor=pointer]:
          - generic [ref=e145]: "MODE:"
          - generic [ref=e146]: MANUAL
        - button "결재라인 모아보기" [ref=e147] [cursor=pointer]: 결재 설정
      - progressbar "시즌 경과 일수" [ref=e148]
      - group "수동 진행" [ref=e149]:
        - button "다음 이벤트" [disabled] [ref=e150]
  - generic [ref=e153]: 저장 완료 · r15 · 물가 관측
  - navigation "모바일 게임 메뉴" [ref=e154]:
    - button "리그" [ref=e155] [cursor=pointer]
    - button "컵" [ref=e158] [cursor=pointer]
    - button "클럽하우스" [ref=e161] [cursor=pointer]:
      - generic [aria-hidden]: "2"
      - generic [ref=e164]: · 결재 대기 2건
    - button "이적시장" [ref=e165] [cursor=pointer]
    - button "기록" [ref=e168] [cursor=pointer]
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | import { pendingDecisions } from '../../packages/engine/src/stopping';
  3  | import { pendingAcquisitionCareer, importResponsibilityCareer } from './responsibility-fixtures';
  4  | import { eventCard, reviewEvent } from './events';
  5  | import { officeBar, officeTitle } from './office';
  6  | import { exportedCareer } from './career-fixtures';
  7  | 
  8  | for (const width of [390, 1280]) {
  9  |   test(`home approval returns keep request identity and stale history at ${width}`, async ({
  10 |     page,
  11 |   }) => {
  12 |     await page.setViewportSize({ width, height: 844 });
  13 |     const w = pendingAcquisitionCareer();
  14 |     w.settings!.mode = 'manual';
  15 |     w.settings!.observations = { matchEve: false, windowOpen: false };
  16 |     const ids = pendingDecisions(w).map((item) => item.id);
  17 |     await importResponsibilityCareer(page, w);
  18 |     const cards = eventCard(page);
> 19 |     await expect(cards).toHaveCount(ids.length);
     |                         ^ Error: expect(locator).toHaveCount(expected) failed
  20 |     expect(
  21 |       await cards.evaluateAll((cards) => cards.map((card) => card.getAttribute('data-request-id'))),
  22 |     ).toEqual(ids);
  23 |     await expect(cards.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);
  24 |     // Every cancellation route returns to the same unresolved list without a command.
  25 |     for (const exit of ['cancel', 'home', 'office', 'browser'] as const) {
  26 |       const request = await reviewEvent(page, cards.first());
  27 |       await expect(officeTitle(page)).toHaveText('선수 계약');
  28 |       await expect(request).toHaveAttribute('data-request-id', ids[0]);
  29 |       await expect(request.getByRole('button', { name: '역제안 수락', exact: true })).toBeVisible();
  30 |       if (exit === 'browser') await page.goBack();
  31 |       else if (exit === 'office')
  32 |         await officeBar(page).getByRole('button', { name: '사무실', exact: true }).click();
  33 |       else
  34 |         await request
  35 |           .getByRole('button', { name: exit === 'cancel' ? '취소' : '홈으로', exact: true })
  36 |           .click();
  37 |       await expect(page.getByTestId('club-hub')).toBeVisible();
  38 |       expect(pendingDecisions(await exportedCareer(page)).map((item) => item.id)).toEqual(ids);
  39 |     }
  40 |     const request = await reviewEvent(page, cards.first());
  41 |     await request.getByRole('button', { name: '거절', exact: true }).click();
  42 |     await expect(page).toHaveURL(/\/journal$/);
  43 |     await expect(cards).toHaveCount(ids.length - 1);
  44 |     await expect(cards.first()).toHaveAttribute('data-request-id', ids[1]);
  45 |     // Browser back reads the resolved request, with no second submission control.
  46 |     await page.goBack();
  47 |     await expect(request).toContainText('이미 처리되었거나 조건이 바뀐 요청');
  48 |     await expect(request.getByRole('button', { name: '거절', exact: true })).toHaveCount(0);
  49 |     await page.goForward();
  50 |     await expect(cards.first()).toHaveAttribute('data-request-id', ids[1]);
  51 |     await reviewEvent(page, cards.first());
  52 |     await request.getByRole('button', { name: '거절', exact: true }).click();
  53 |     await expect(page).toHaveURL(/\/journal$/);
  54 |     await expect(cards).toHaveCount(0);
  55 |     const after = await exportedCareer(page);
  56 |     expect(pendingDecisions(after)).toHaveLength(0);
  57 |     expect(after.calendar).toEqual(w.calendar);
  58 |   });
  59 | }
  60 | 
```