export interface Story {
  id: string;
  title: string;
  group: string;
  components: string[];
  description: string;
  page?: 'firstTeam' | 'staff' | 'training' | 'academy' | 'business' | 'history';
  query?: string;
}

const story = (
  id: string,
  title: string,
  group: string,
  components: string[],
  description: string,
  extra: Partial<Story> = {},
): Story => ({ id, title, group, components, description, ...extra });

export const STORIES: Story[] = [
  story(
    'controls',
    '버튼 · 입력 · 선택',
    '기본 UI',
    ['Select', 'Segments', 'DirectionRow', 'ClubStaff'],
    'Primary·Secondary·Tertiary 버튼과 비활성 상태, 입력 필드, 체크박스, 드롭다운, 세그먼트와 계약 기간 다이얼.',
  ),
  story(
    'tabs',
    '탭 · 패널 · 표',
    '기본 UI',
    ['PageTabs', 'App', 'Attributes', 'OfficeBar'],
    '탭 선택과 표, 패널 헤더, 정보 행, 업무 내비게이션.',
  ),
  story(
    'cards',
    '카드 · 배경 면 3단계',
    '기본 UI',
    ['Card', 'FixtureNotebook'],
    '캔버스·내용지·기록 카드의 면 계층과 제목, 메타 정보, 본문, 액션 조합.',
  ),
  story(
    'icons',
    '아이콘 · 트로피',
    '기본 UI',
    ['PixelIcon', 'TrophyIcon'],
    '현재 테마가 제공하는 모든 의미 아이콘과 획득·미획득 트로피.',
  ),
  story(
    'badges',
    '배지 · 승무패 · 능력치 · 금액',
    '기본 UI',
    [
      'OvrBadge',
      'HomeAwayBadge',
      'ResultBadge',
      'Money',
      'AnimatedMoney',
      'BetaMark',
      'ClubLink',
      'PlayerSheet',
      'PersonCareer',
      'Term',
    ],
    '승·무·패와 점수 배지, 홈·원정 배지, 능력치 등급, 잠재력, 금액과 상세 정보 링크.',
  ),
  story(
    'charts',
    '그래프 · 분석 피치',
    '기본 UI',
    ['Chart', 'HeatPitch', 'FormationPitch'],
    '선 그래프, 인터랙티브 분석 피치, 히트맵과 포메이션.',
  ),
  story(
    'settings',
    '테마 · 언어 설정',
    '기본 UI',
    ['PresentationSettings'],
    '실제 게임에서 사용하는 화면 설정 컨트롤과 선택 창.',
  ),
  story(
    'home',
    '클럽하우스 전체',
    '홈 · 대회',
    ['ClubHub', 'NewsFeed'],
    '시즌 요약, 다음 경기, 구단주 사무실과 퀵 액션.',
  ),
  story(
    'home-cards',
    '시즌 · 다음 경기 · 퀵 액션 · 팀 상태',
    '홈 · 대회',
    ['ClubHub', 'QuickActions', 'TeamStateTiles', 'RemedySheet'],
    '홈의 개별 카드, 주제별 퀵 액션 시트, 사무실의 팀 상태와 대처 방법 시트.',
  ),
  story(
    'controller',
    '진행 컨트롤러 · 메뉴',
    '홈 · 대회',
    ['ProgressControls', 'ProgressModeSwitch', 'HudCash', 'AppMenu', 'CashAlarm'],
    '진행 속도, 재생/정지, 업무 분장, 현금과 게임 메뉴. 시간은 흐르지 않습니다.',
  ),
  story(
    'league',
    '리그 순위 · 라운드 결과',
    '홈 · 대회',
    ['LeagueInsights', 'LeaguePicker', 'ScorerPanels'],
    '리그 선택, 순위표와 범례, 라운드별 경기 결과, 득점 순위.',
  ),
  story(
    'season',
    '현재 시즌 화면',
    '홈 · 대회',
    ['LiveSeason', 'CompetitionTabs', 'LeagueFullStats'],
    '팀·선수·경기 탭과 현재 시즌의 상세 통계.',
  ),
  story(
    'cups',
    '국내컵 · 유럽대항전',
    '홈 · 대회',
    ['CupsView', 'Bracket'],
    '대회 선택, 조별 순위와 토너먼트 대진표.',
  ),
  story(
    'fixtures',
    '경기 수첩',
    '홈 · 대회',
    ['FixtureNotebook'],
    '예정/종료 경기 필터, 일정, 결과와 기록 열기.',
  ),
  story(
    'pitch',
    '경기 관전 · 스코어보드',
    '경기 · 선수',
    ['Pitch', 'MatchCharts', 'MatchMoments'],
    '샘플 경기의 기록 재생, 스코어보드와 관전 상세.',
  ),
  story(
    'match-report',
    '경기 보고서 · 분석',
    '경기 · 선수',
    ['MatchReport', 'MatchMaterial', 'MatchReportCard'],
    '경기 요약, 팀 통계와 세부 분석 자료.',
  ),
  story(
    'preparation',
    '전술 · 선발 준비',
    '경기 · 선수',
    ['StrategyPanel', 'FixtureKitSelector', 'TacticalLab', 'MatchBriefing'],
    '다음 상대 분석, 전술 비교, 선발과 경기 유니폼 선택.',
  ),
  story(
    'profile',
    '선수 프로필 · 기록',
    '경기 · 선수',
    ['PlayerProfile', 'PlayerPerformance', 'PlayerAdvancedStats'],
    '실제 선수의 16개 능력치, 포지션, 성격과 시즌 기록.',
  ),
  story(
    'player-sheet',
    '선수 상세 시트',
    '경기 · 선수',
    ['PlayerSheetDialog'],
    '상세 프로필과 계약·훈련·경력 정보가 있는 실제 선수 대화상자.',
  ),
  story(
    'comparison',
    '선수 비교',
    '경기 · 선수',
    ['PlayerComparison'],
    '두 선수 선택과 시즌/통산 비교.',
  ),
  story(
    'roster',
    '선수단 · 필터',
    '사람 · 훈련',
    ['Rich', 'RosterFilters', 'PersonnelHubs'],
    '선수 카드, 이적 상태, 상세 지표와 계약 협상.',
    { page: 'firstTeam', query: 'view=players' },
  ),
  story(
    'manager',
    '감독 사무실',
    '사람 · 훈련',
    ['Rich', 'ClubStaff', 'StyleCard', 'PlaceActivities'],
    '감독 성향, 전술 요청, 신뢰와 구단주 선택.',
    { page: 'firstTeam', query: 'view=manager' },
  ),
  story(
    'staff',
    '코칭스태프실',
    '사람 · 훈련',
    ['Rich', 'ClubStaff', 'DecisionOwner'],
    '직책별 스태프, 코칭 계획과 채용·계약.',
    { page: 'staff', query: 'view=coaches' },
  ),
  story(
    'recruitment',
    '영입 데스크 · 스카우트',
    '사람 · 훈련',
    ['RecruitmentDesk', 'ScoutShortlist', 'MediationReview'],
    '세계 선수 검색, 영입 후보와 제안·감독 중재.',
  ),
  story(
    'training',
    '훈련장',
    '사람 · 훈련',
    ['TrainingView', 'TrainingOrderSheet', 'FacilityOverview'],
    '팀 훈련, 선수별 성장과 구단주 제안.',
    { page: 'training' },
  ),
  story(
    'academy',
    '유소년 훈련장',
    '사람 · 훈련',
    ['TrainingView', 'AcademyPanel', 'PlayingCoachReview'],
    '유소년 선수, 훈련 방향과 승격/방출.',
    { page: 'academy' },
  ),
  story(
    'styles',
    '감독 학파 카드',
    '사람 · 훈련',
    ['StyleCard'],
    '기본형과 모든 감독 학파의 이점·제약.',
  ),
  story(
    'office',
    '구단주 사무실',
    '운영 · 시설',
    ['OfficeLobby', 'Operations'],
    '업무별 개요, 결재 요청과 업무 분장.',
    { page: 'business' },
  ),
  story(
    'contracts',
    '선수 계약 업무',
    '운영 · 시설',
    ['Rich', 'PlayerOfficePanel', 'BusinessWorkbench'],
    '계약·영입·매각·유소년 업무와 결재 라인.',
    { page: 'business', query: 'view=players' },
  ),
  story(
    'staff-contracts',
    '스태프 계약 업무',
    '운영 · 시설',
    ['Rich', 'BusinessWorkbench'],
    '감독과 스태프의 계약 및 채용.',
    { page: 'business', query: 'view=staff' },
  ),
  story(
    'investment',
    '재정 · 투자 업무',
    '운영 · 시설',
    ['Rich', 'FinanceOutlook', 'FinancialBreakdown', 'FacilityParts'],
    '재정 현황, 출자, 시설과 투자 방향.',
    { page: 'business', query: 'view=investment' },
  ),
  story(
    'sponsors',
    '후원 업무',
    '운영 · 시설',
    ['Rich', 'BusinessWorkbench'],
    '후원 슬롯, 계약 조건과 제안.',
    { page: 'business', query: 'view=sponsors' },
  ),
  story(
    'identity',
    '엠블럼 · 유니폼 편집기',
    '운영 · 시설',
    ['ClubIdentityEditor', 'ClubCrest', 'KitSwatch', 'KitPitchPreview'],
    '엠블럼 구성과 홈·원정·세 번째·골키퍼 유니폼을 실제 렌더러로 편집.',
  ),
  story(
    'design',
    '클럽 디자인 업무',
    '운영 · 시설',
    ['ClubDesignView'],
    '현재 클럽 디자인, 편집과 적용 확인.',
  ),
  story(
    'policy',
    '운영 전략 · 방향',
    '운영 · 시설',
    ['StrategyBoard', 'StrategyComposer', 'DirectionLines', 'PolicyBoard', 'PolicyContext'],
    '전략 프리셋, 적용 전 변경 비교와 방향 다이얼.',
  ),
  story(
    'facilities',
    '시설 일러스트 · 단계',
    '운영 · 시설',
    ['FacilityArt', 'FacilityOverview', 'FacilityParts'],
    '경기장·라커룸·감독실·스태프실·훈련장·유소년 시설의 테마별 그림.',
  ),
  story(
    'finance',
    '재정 장부 · 전망',
    '운영 · 시설',
    ['FinancialBreakdown', 'FinanceOutlook'],
    '수입·지출 상세와 재정 전망.',
  ),
  story(
    'records',
    '클럽 기록실',
    '기록 · 시작',
    [
      'RecordsRoom',
      'ManagerHistory',
      'TransferRecords',
      'CompetitionRecords',
      'SeasonAnalysis',
      'AnalysisExport',
    ],
    '업적, 시즌·감독·이적 기록과 분석 내보내기.',
    { page: 'history' },
  ),
  story(
    'career',
    '통산 기록 · 트로피장',
    '기록 · 시작',
    ['CareerRecordBook', 'ClubTrends', 'MilestoneCollection'],
    '통산 요약, 선수 리더, 시즌 흐름과 트로피.',
  ),
  story(
    'season-review',
    '지난 시즌 · 결산',
    '기록 · 시작',
    ['SeasonReview', 'PastSeason', 'CupHistory'],
    '지난 시즌의 성과와 대회 기록.',
  ),
  story(
    'founding',
    '창단 화면',
    '기록 · 시작',
    ['ClubFounding'],
    '새 게임의 국가·이름·난이도·운영 방향과 디자인 설정.',
  ),
  story(
    'slots',
    '게임 슬롯',
    '기록 · 시작',
    ['GameSlotScreen'],
    '비어 있는 슬롯과 샘플 클럽이 있는 슬롯. 저장소는 메모리입니다.',
  ),
  story(
    'dialogs',
    '대화상자 · 시트 · 알림',
    '시트 · 피드백',
    ['Dialog', 'FeedbackOverlay', 'ActionOutcome'],
    '일반·넓은·작은 선택 창, 오류와 알림, 긴 내용 스크롤.',
  ),
  story(
    'events',
    '알림함 · 이벤트',
    '시트 · 피드백',
    ['EventCenter', 'NewsFeed'],
    '실제 샘플 게임의 알림함과 소식 목록.',
  ),
  story(
    'office-overview',
    '업무 분장',
    '시트 · 피드백',
    ['OwnerOfficeView', 'DecisionOwner'],
    '부서별 결재 라인과 책임자 선택.',
  ),
  story(
    'glossary',
    '용어 사전 · 가이드',
    '시트 · 피드백',
    ['GlossarySheet', 'PlayGuide', 'Term'],
    '축구 지표 설명과 클럽 키우기 가이드.',
  ),
  story(
    'league-history',
    '역대 리그 시즌',
    '기록 · 시작',
    ['LiveSeason', 'PastSeason'],
    '과거 리그 순위, 선수 기록과 시즌 선택.',
  ),
  story(
    'cup-history',
    '역대 컵 대회',
    '기록 · 시작',
    ['CupsView', 'CupHistory'],
    '국내컵·유럽대항전의 시즌별 결과와 우승 기록.',
  ),
  story(
    'alerts',
    '업적 · 자금 위기 · 복귀 보고',
    '시트 · 피드백',
    ['Celebration', 'CashAlarm', 'AwaySummary'],
    '축하 배너, 현금 부족 경고와 자리를 비운 동안의 보고서.',
  ),
  story(
    'lab',
    '매치 엔진 실험실',
    '홈 · 대회',
    ['lab/LabPage'],
    '실험실에서만 사용하는 설정·실행·비교 컴포넌트. 설정은 임시 메모리에 저장됩니다.',
  ),

  story(
    'async-states',
    '로딩 · 빈 화면 · 오류',
    '기본 UI',
    ['ManagerHistory'],
    '실제 비동기 화면의 로딩, 빈 데이터, 오류와 재시도 상태.',
  ),
];

export const GROUPS = [...new Set(STORIES.map((item) => item.group))];
export const componentSource = (name: string) =>
  `src/${name.includes('/') ? name : 'ui/' + name}.tsx`;
export function matchingStories(query: string, group?: string) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return STORIES.filter(
    (item) =>
      (!group || item.group === group) &&
      words.every((word) =>
        [item.title, item.group, item.description, ...item.components]
          .join(' ')
          .toLocaleLowerCase()
          .includes(word),
      ),
  );
}

/** Keep each screen's real pathname so its address-driven tabs work in the preview. */
export function previewAddress(item: Story, theme: string) {
  const paths = {
    firstTeam: '/first-team',
    staff: '/staff',
    training: '/training',
    academy: '/academy',
    business: '/direction',
    history: '/history?section=club',
  };
  const competitionPaths: Record<string, string> = {
    season: '/season?competition=league',
    'league-history': '/history?section=league',
    cups: '/season?competition=cup',
    'cup-history': '/history?section=cup',
  };
  const path = item.page ? paths[item.page] : (competitionPaths[item.id] ?? '/design-system');
  const url = new URL(path, 'http://preview.invalid');
  url.searchParams.set('__design_system', item.id);
  url.searchParams.set('theme', theme);
  new URLSearchParams(item.query).forEach((value, key) => url.searchParams.set(key, value));
  return url.pathname + url.search;
}
