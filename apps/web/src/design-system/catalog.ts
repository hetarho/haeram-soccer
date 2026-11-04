import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
export interface Story {
  id: string;
  title: string;
  group: string;
  components: string[];
  description: string;
  page?:
    'team' | 'firstTeam' | 'staff' | 'training' | 'academy' | 'operations' | 'business' | 'history';
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
    sourceMessage('copy.catalog.a238434a99'),
    sourceMessage('copy.catalog.701cef250c'),
    ['Select', 'Segments', 'ClubStaff'],
    sourceMessage('copy.catalog.610f0fecc2'),
  ),
  story(
    'tabs',
    sourceMessage('copy.catalog.0df6d04fc0'),
    sourceMessage('copy.catalog.701cef250c'),
    ['PageTabs', 'App', 'Attributes', 'OfficeBar'],
    sourceMessage('copy.catalog.1f378f3069'),
  ),
  story(
    'cards',
    sourceMessage('copy.catalog.eda864441b'),
    sourceMessage('copy.catalog.701cef250c'),
    ['Card', 'FixtureNotebook'],
    sourceMessage('copy.catalog.98c4a0c392'),
  ),
  story(
    'icons',
    sourceMessage('copy.catalog.db99102755'),
    sourceMessage('copy.catalog.701cef250c'),
    ['PixelIcon', 'TrophyIcon'],
    sourceMessage('copy.catalog.530419d84c'),
  ),
  story(
    'badges',
    sourceMessage('copy.catalog.b641ec9829'),
    sourceMessage('copy.catalog.701cef250c'),
    [
      'OvrBadge',
      'HomeAwayBadge',
      'PositionBadge',
      'StaffRoleBadge',
      'ResultBadge',
      'Money',
      'AnimatedMoney',
      'BetaMark',
      'entities/club/ui/ClubLink',
      'entities/player/ui/PlayerLink',
      'widgets/player-detail/ui/OwnPlayerSheet',
      'PersonCareer',
      'Term',
    ],
    sourceMessage('copy.catalog.ed15aa1b74'),
  ),
  story(
    'charts',
    sourceMessage('copy.catalog.a066fd16b4'),
    sourceMessage('copy.catalog.701cef250c'),
    ['Chart', 'HeatPitch', 'FormationPitch'],
    sourceMessage('copy.catalog.e21e9778fe'),
  ),
  story(
    'settings',
    sourceMessage('copy.catalog.dc83397af0'),
    sourceMessage('copy.catalog.701cef250c'),
    ['PresentationSettings'],
    sourceMessage('copy.catalog.cffd2b21c9'),
  ),
  story(
    'home',
    sourceMessage('copy.catalog.608c798e22'),
    sourceMessage('copy.catalog.4fada577de'),
    ['ClubHub', 'NewsFeed'],
    sourceMessage('copy.catalog.cd6db07a2c'),
  ),
  story(
    'home-cards',
    sourceMessage('copy.catalog.37ce4a34d0'),
    sourceMessage('copy.catalog.4fada577de'),
    ['ClubHub', 'FacilityArt'],
    sourceMessage('copy.catalog.64b005369e'),
  ),
  story(
    'controller',
    sourceMessage('copy.catalog.e5186dba23'),
    sourceMessage('copy.catalog.4fada577de'),
    ['ProgressControls', 'ProgressModeSwitch', 'HudCash', 'AppMenu', 'CashAlarm'],
    sourceMessage('copy.catalog.abcf3aa288'),
  ),
  story(
    'controller-backgrounds',
    sourceMessage('copy.catalog.12677db021'),
    sourceMessage('copy.catalog.4fada577de'),
    ['ProgressControls'],
    sourceMessage('copy.catalog.08bd7de4a9'),
  ),
  story(
    'league',
    sourceMessage('copy.catalog.5d45d13a19'),
    sourceMessage('copy.catalog.4fada577de'),
    ['LeagueInsights', 'LeaguePicker', 'ScorerPanels'],
    sourceMessage('copy.catalog.8596e65f98'),
  ),
  story(
    'season',
    sourceMessage('copy.catalog.d8b5f47fa8'),
    sourceMessage('copy.catalog.4fada577de'),
    ['LiveSeason', 'CompetitionTabs', 'LeagueFullStats'],
    sourceMessage('copy.catalog.0a5cd726b2'),
  ),
  story(
    'cups',
    sourceMessage('copy.catalog.85ec0cdbfa'),
    sourceMessage('copy.catalog.4fada577de'),
    ['CupsView', 'Bracket'],
    sourceMessage('copy.catalog.c95853d7f6'),
  ),
  story(
    'fixtures',
    sourceMessage('copy.catalog.1dfffb87c1'),
    sourceMessage('copy.catalog.4fada577de'),
    ['FixtureNotebook'],
    sourceMessage('copy.catalog.f2dab993a8'),
  ),
  story(
    'pitch',
    sourceMessage('copy.catalog.1eb08df150'),
    sourceMessage('copy.catalog.15c20b5a23'),
    ['Pitch', 'MatchCharts', 'MatchMoments'],
    sourceMessage('copy.catalog.4dff05e21f'),
  ),
  story(
    'match-report',
    sourceMessage('copy.catalog.4914f883c3'),
    sourceMessage('copy.catalog.15c20b5a23'),
    ['MatchReport', 'MatchMaterial', 'MatchReportCard'],
    sourceMessage('copy.catalog.3c0f6cdf6c'),
  ),
  story(
    'preparation',
    sourceMessage('copy.catalog.50b403ba8e'),
    sourceMessage('copy.catalog.15c20b5a23'),
    ['StrategyPanel', 'FixtureKitSelector', 'MatchBriefing'],
    sourceMessage('copy.catalog.d0522ada61'),
  ),
  story(
    'profile',
    sourceMessage('copy.catalog.322388f07f'),
    sourceMessage('copy.catalog.15c20b5a23'),
    ['PlayerProfile', 'PlayerPerformance', 'PlayerAdvancedStats'],
    sourceMessage('copy.catalog.1de4d14d46'),
  ),
  story(
    'player-sheet',
    sourceMessage('copy.catalog.28c59852fb'),
    sourceMessage('copy.catalog.15c20b5a23'),
    ['widgets/player-detail/ui/OwnPlayerSheet'],
    sourceMessage('copy.catalog.e7a77d0f26'),
  ),
  story(
    'comparison',
    sourceMessage('copy.catalog.a547646260'),
    sourceMessage('copy.catalog.15c20b5a23'),
    ['PlayerComparison'],
    sourceMessage('copy.catalog.05d435b13d'),
  ),
  story(
    'team',
    sourceMessage('copy.catalog.62ff484541'),
    sourceMessage('copy.catalog.f79a9371bf'),
    ['TeamDirectory', 'PositionBadge', 'OvrBadge', 'PageTabs'],
    sourceMessage('copy.catalog.b29caf82c2'),
    { page: 'team', query: 'view=players' },
  ),
  story(
    'roster',
    sourceMessage('copy.catalog.101188dbc2'),
    sourceMessage('copy.catalog.f79a9371bf'),
    ['Rich', 'RosterFilters', 'PersonnelHubs'],
    sourceMessage('copy.catalog.b992e7bf73'),
    { page: 'firstTeam', query: 'view=players' },
  ),
  story(
    'staff',
    sourceMessage('copy.catalog.4632839363'),
    sourceMessage('copy.catalog.f79a9371bf'),
    ['Rich', 'ClubStaff', 'StyleCard', 'DecisionOwner'],
    sourceMessage('copy.catalog.fa03c777d0'),
    { page: 'staff', query: 'view=coaches' },
  ),
  story(
    'recruitment',
    sourceMessage('copy.catalog.366c78bb7e'),
    sourceMessage('copy.catalog.f79a9371bf'),
    ['RecruitmentDesk', 'ScoutShortlist', 'MediationReview'],
    sourceMessage('copy.catalog.babe4f2b01'),
  ),
  story(
    'training',
    sourceMessage('club.section.training'),
    sourceMessage('copy.catalog.f79a9371bf'),
    ['TrainingView', 'FacilityOverview'],
    sourceMessage('copy.catalog.b2487931ff'),
    { page: 'training' },
  ),
  story(
    'academy',
    sourceMessage('team.view.academy'),
    sourceMessage('copy.catalog.f79a9371bf'),
    ['TrainingView', 'PlaceActivities', 'AcademyPanel'],
    sourceMessage('copy.catalog.3b20abf248'),
    { page: 'academy' },
  ),
  story(
    'styles',
    sourceMessage('copy.catalog.d0f949287a'),
    sourceMessage('copy.catalog.f79a9371bf'),
    ['StyleCard'],
    sourceMessage('copy.catalog.8c2894d4ba'),
  ),
  story(
    'office',
    sourceMessage('copy.catalog.9a8019d09c'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['ApprovalQueue', 'Operations', 'FacilityOverview', 'ClubHub', 'PlayingCoachReview'],
    sourceMessage('copy.catalog.19b3d489e7'),
    { page: 'business' },
  ),
  story(
    'investment',
    sourceMessage('copy.catalog.7cd3763a7b'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['ClubOperations', 'ClubNavigation', 'FinanceOutlook', 'FinancialBreakdown', 'FacilityParts'],
    sourceMessage('copy.catalog.9d86f34fda'),
    { page: 'operations', query: 'view=investment' },
  ),
  story(
    'sponsors',
    sourceMessage('copy.catalog.b0e5d4542d'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['ClubOperations', 'BusinessWorkbench'],
    sourceMessage('copy.catalog.9c30ba6963'),
    { page: 'operations', query: 'view=sponsor' },
  ),
  story(
    'operations-identity',
    sourceMessage('copy.catalog.a35d27f26f'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['ClubOperations', 'ClubDesignView'],
    sourceMessage('copy.catalog.da54563b6f'),
    { page: 'operations', query: 'view=identity' },
  ),
  story(
    'identity',
    sourceMessage('copy.catalog.6d642e2ae3'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['ClubCrest', 'KitSwatch', 'KitPitchPreview'],
    sourceMessage('copy.catalog.d179c2b43e'),
  ),
  story(
    'design',
    sourceMessage('copy.catalog.c91f19bc2c'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['ClubDesignView'],
    sourceMessage('copy.catalog.574b1dc79b'),
  ),
  story(
    'policy',
    sourceMessage('copy.catalog.dd3b883de1'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['DirectionFacts'],
    sourceMessage('copy.catalog.a2a1cc49f7'),
  ),
  story(
    'facilities',
    sourceMessage('copy.catalog.9638e3f47e'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['FacilityArt', 'FacilityOverview', 'FacilityParts'],
    sourceMessage('copy.catalog.a0593feafc'),
  ),
  story(
    'finance',
    sourceMessage('copy.catalog.47a990104c'),
    sourceMessage('copy.catalog.2cc2710200'),
    ['FinancialBreakdown', 'FinanceOutlook'],
    sourceMessage('copy.catalog.ba038976e0'),
  ),
  story(
    'records',
    sourceMessage('copy.catalog.e123f414e6'),
    sourceMessage('copy.catalog.1b09e06607'),
    [
      'RecordsRoom',
      'ManagerHistory',
      'TransferRecords',
      'CompetitionRecords',
      'SeasonAnalysis',
      'AnalysisExport',
    ],
    sourceMessage('copy.catalog.5131620581'),
    { page: 'history' },
  ),
  story(
    'career',
    sourceMessage('copy.catalog.78d812191b'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['CareerRecordBook', 'ClubTrends'],
    sourceMessage('copy.catalog.d380307a58'),
  ),
  story(
    'season-review',
    sourceMessage('copy.catalog.39d610a719'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['SeasonReview', 'PastSeason', 'CupHistory'],
    sourceMessage('copy.catalog.df12e799f2'),
  ),
  story(
    'start-flow',
    sourceMessage('copy.catalog.5df798b42e'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['StartFlow', 'ClubListing', 'widgets/club-detail/ui/ClubDetail'],
    sourceMessage('copy.catalog.43922fb1b9'),
  ),
  story(
    'owner-sheet',
    sourceMessage('copy.catalog.92fcd8c199'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['OwnerSheet', 'HudCash', 'CashAlarm'],
    sourceMessage('copy.catalog.8512faeaa2'),
  ),
  story(
    'game-over',
    sourceMessage('copy.catalog.f041a37093'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['GameOver'],
    sourceMessage('copy.catalog.fb84c2b4e7'),
  ),
  story(
    'slots',
    sourceMessage('slots.title'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['GameSlotScreen'],
    sourceMessage('copy.catalog.61d2a43497'),
  ),
  story(
    'dialogs',
    sourceMessage('copy.catalog.afd24af600'),
    sourceMessage('copy.catalog.441767557c'),
    ['Dialog', 'FeedbackOverlay', 'ActionOutcome'],
    sourceMessage('copy.catalog.2b04bb84e4'),
  ),
  story(
    'events',
    sourceMessage('copy.catalog.16ab395850'),
    sourceMessage('copy.catalog.441767557c'),
    ['EventCenter', 'NewsFeed'],
    sourceMessage('copy.catalog.d03258b736'),
  ),
  story(
    'office-overview',
    sourceMessage('copy.catalog.5fc32bc20a'),
    sourceMessage('copy.catalog.441767557c'),
    ['OwnerOfficeView', 'DecisionOwner'],
    sourceMessage('copy.catalog.2d59d4b833'),
  ),
  story(
    'glossary',
    sourceMessage('copy.catalog.1d4f151f1d'),
    sourceMessage('copy.catalog.441767557c'),
    ['GlossarySheet', 'PlayGuide', 'Term'],
    sourceMessage('copy.catalog.5216bb24d5'),
  ),
  story(
    'league-history',
    sourceMessage('copy.catalog.0276b261ab'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['LiveSeason', 'PastSeason'],
    sourceMessage('copy.catalog.1293ae9225'),
  ),
  story(
    'cup-history',
    sourceMessage('copy.catalog.c578294d95'),
    sourceMessage('copy.catalog.1b09e06607'),
    ['CupsView', 'CupHistory'],
    sourceMessage('copy.catalog.2203a8cd2c'),
  ),
  story(
    'alerts',
    sourceMessage('copy.catalog.9ea015cfa3'),
    sourceMessage('copy.catalog.441767557c'),
    ['Celebration', 'CashAlarm', 'AwaySummary'],
    sourceMessage('copy.catalog.6651c36c3f'),
  ),
  story(
    'lab',
    sourceMessage('copy.catalog.832a672e3e'),
    sourceMessage('copy.catalog.4fada577de'),
    ['lab/LabPage'],
    sourceMessage('copy.catalog.25329fd46d'),
  ),

  story(
    'async-states',
    sourceMessage('copy.catalog.7d458f4f27'),
    sourceMessage('copy.catalog.701cef250c'),
    ['ManagerHistory'],
    sourceMessage('copy.catalog.d052afcada'),
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
    team: '/team',
    firstTeam: '/first-team',
    staff: '/staff',
    training: '/training',
    academy: '/academy',
    operations: '/club-operations',
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
