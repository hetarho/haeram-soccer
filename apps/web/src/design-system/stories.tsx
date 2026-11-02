import { lazy, useEffect, useState, type ReactNode } from 'react';
import type { Story } from './catalog';
import type { Sample, previewRuntime } from './client';
import { Panel, Table } from '../ui/App';
import { Select } from '../ui/Select';
import { Segments } from '../ui/Segments';
import { TabList, TabPanel } from '../ui/PageTabs';
import { Attributes } from '../ui/Attributes';
import { OfficeBar } from '../ui/OfficeBar';
import { TermDial } from '../ui/ClubStaff';
import { PixelIcon } from '../ui/PixelIcon';
import { TrophyIcon, type TrophyKind } from '../ui/TrophyIcon';
import { OvrBadge } from '../ui/OvrBadge';
import { HomeAwayBadge } from '../ui/HomeAwayBadge';
import { PositionBadge } from '../ui/PositionBadge';
import { StaffRoleBadge } from '../ui/StaffRoleBadge';
import { STAFF_ROLES } from '../../../../packages/engine/src/staff-info';
import { POSITIONS } from '../../../../packages/contracts/src/player';
import { ResultBadge } from '../ui/ResultBadge';
import { Money } from '../ui/Money';
import { AnimatedMoney } from '../ui/AnimatedMoney';
import { BetaMark } from '../ui/BetaMark';
import { ClubLink } from '../ui/ClubLink';
import { PlayerLink, PlayerSheetHost } from '../ui/PlayerSheet';
import { TeamSheetHost } from '../ui/TeamSheet';
import { PersonCareerLink } from '../ui/PersonCareer';
import { Term } from '../ui/Term';
import { Chart } from '../ui/Chart';
import { HeatPitch, MaterialPitch } from '../ui/HeatPitch';
import { FormationPitch } from '../ui/FormationPitch';
import {
  PresentationSettings,
  PresentationSettingsControls,
  PresentationSettingsTrigger,
} from '../ui/PresentationSettings';
import { ClubHub, NextMatchCard, OfficeEntrance, SeasonCard, CupBriefing } from '../ui/ClubHub';
import { NewsList, useNewsSheet } from '../ui/NewsFeed';
import { ProgressControls, ProgressOverview } from '../ui/ProgressControls';
import { ControllerBackgrounds } from './ControllerBackgrounds';
import { ProgressModeSwitch } from '../ui/ProgressModeSwitch';
import { HudCash } from '../ui/HudCash';
import { AppMenu } from '../ui/AppMenu';
import { LeagueOverview, Standings, RoundResults } from '../ui/LeagueInsights';
import { ScorerStandings } from '../ui/ScorerPanels';
import { LeaguePicker } from '../ui/LeaguePicker';
import { LiveSeason } from '../ui/LiveSeason';
import { CupsView } from '../ui/CupsView';
import { FixtureNotebook } from '../ui/FixtureNotebook';
import { Card } from '../ui/Card';
import { Pitch } from '../ui/Pitch';
import { MatchReport } from '../ui/MatchReport';
import { MatchMaterial } from '../ui/MatchMaterial';
import { MatchReportCard } from '../ui/MatchReportCard';
import { StrategyPanel } from '../ui/StrategyPanel';
import { PlayerProfile } from '../ui/PlayerProfile';
import { PlayerPerformance } from '../ui/PlayerPerformance';
import { PlayerAdvancedStats } from '../ui/PlayerAdvancedStats';
import { PlayerSheet } from '../ui/PlayerSheetDialog';
import { PlayerComparison } from '../ui/PlayerComparison';
import Rich from '../ui/Rich';
import { RecruitmentDesk } from '../ui/RecruitmentDesk';
import { StyleCard } from '../ui/StyleCard';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { ClubIdentityEditor } from '../ui/ClubIdentityEditor';
import { ClubDesignView } from '../ui/ClubDesignView';
import { createIdentityDraft } from '../../../../packages/engine/src/club-identity';
import { DirectionAreas } from '../ui/DirectionFacts';
import { FacilityOverview } from '../ui/FacilityOverview';
import { FacilityParts } from '../ui/FacilityParts';
import { FinancialBreakdown } from '../ui/FinancialBreakdown';
import { FinanceOutlook } from '../ui/FinanceOutlook';
import { CareerRecordBook, TrophyCabinet, ClubLeaders } from '../ui/CareerRecordBook';
import { ClubTrends, SeasonTable } from '../ui/ClubTrends';
import { SeasonReview } from '../ui/SeasonReview';
import { ClubFounding } from '../ui/ClubFounding';
import { StartFlow } from '../ui/StartFlow';
import { canAfford, takeoverYear, type ClubSheetFacts } from '../ui/startChoices';
import type {
  ClubListing,
  StartChoice,
  WealthTier,
} from '../../../../packages/contracts/src/owner';
import type { World } from '../../../../packages/contracts/src/types';
import { country, currency } from '../../../../packages/catalogs/src/index';
import { GameSlotScreen } from '../ui/GameSlotScreen';
import { GameSlots } from '../runtime/slots';
import { GameIndexStore } from '../adapters/games';
import { memoryStorage } from './session';
import { Dialog } from '../ui/Dialog';
import { FeedbackOverlay } from '../ui/FeedbackOverlay';
import { CommunicationsCenter } from '../ui/EventCenter';
import { OwnerOffice } from '../ui/OwnerOfficeView';
import { GlossaryHost } from '../ui/Glossary';
import { useGlossary } from '../ui/metricGlossary';
import { PlayGuide } from '../ui/PlayGuide';
import { ownLeagueIds } from '../ui/league';
import { useTheme } from '../presentation/react';
import app from '../ui/App.module.css';

import { CashAlarm } from '../ui/CashAlarm';
import { AwaySummary } from '../ui/AwaySummary';
import { CelebrationHost } from '../ui/Celebration';
import { ManagerHistory } from '../ui/ManagerHistory';
import { clockMark } from '../runtime/progression';
import { gameStore } from '../runtime/store';
const LabPage = lazy(() =>
  import('../lab/LabPage').then((module) => ({ default: module.LabPage })),
);

type Runtime = Sample & ReturnType<typeof previewRuntime>;
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="ds-example">
    <h2>{title}</h2>
    <div className="ds-example-body">{children}</div>
  </section>
);
const noop = () => {};

function Controls() {
  const [selected, setSelected] = useState('balanced');
  const [term, setTerm] = useState<1 | 2 | 3 | 4 | 5>(3);
  return (
    <>
      <Section title="버튼 · Primary / Secondary / Tertiary">
        <div className="ds-button-variants">
          <div>
            <span>Primary · 주요 동작</span>
            <button data-ui="primary" className={app.primary}>
              경기 시작
            </button>
            <button data-ui="primary" disabled>
              경기 시작
            </button>
          </div>
          <div>
            <span>Secondary · 보조 동작</span>
            <button data-ui="secondary">선택 적용</button>
            <button data-ui="secondary" disabled>
              선택 적용
            </button>
          </div>
          <div>
            <span>Tertiary · 추가 동작</span>
            <button data-ui="tertiary">기록 보기</button>
            <button data-ui="tertiary" disabled>
              기록 보기
            </button>
          </div>
        </div>
        <div className="ds-row">
          <button>기본 버튼</button>
          <button disabled>비활성 버튼</button>
          <button aria-label="설정">
            <PixelIcon name="menu" />
          </button>
        </div>
      </Section>
      <Section title="입력 필드">
        <div className="ds-row ds-fields">
          <label>
            클럽 이름
            <input defaultValue="Haeram Athletic" />
          </label>
          <label>
            숫자
            <input type="number" defaultValue={1950} />
          </label>
          <label>
            빈 값
            <input placeholder="클럽 이름을 입력하세요" />
          </label>
          <label>
            비활성
            <input disabled value="편집할 수 없는 값" readOnly />
          </label>
        </div>
        <label className="ds-block-label">
          메모
          <textarea defaultValue="긴 한국어 문장과 여러 줄 텍스트의 여백을 확인합니다." rows={3} />
        </label>
      </Section>
      <Section title="체크박스">
        <div className="ds-row">
          <label>
            <input type="checkbox" defaultChecked /> 선택한 옵션
          </label>
          <label>
            <input type="checkbox" /> 기본 옵션
          </label>
          <label>
            <input type="checkbox" disabled /> 비활성 옵션
          </label>
          <label>
            <input type="checkbox" defaultChecked disabled /> 비활성 선택
          </label>
        </div>
      </Section>
      <Section title="Select · Segments">
        <div className="ds-row ds-selects">
          <Select aria-label="전술 선택" value={selected} onValueChange={setSelected}>
            <option value="balanced">균형 잡힌 플레이</option>
            <option value="possession" data-hint="점유율을 높이는 전술">
              점유율
            </option>
            <option value="counter">역습</option>
            <option value="press" disabled>
              압박 · 선택 불가
            </option>
          </Select>
          <Select aria-label="비활성 선택" value="off" onValueChange={noop} disabled>
            <option value="off">선택할 수 없어요</option>
          </Select>
        </div>
        <Segments
          label="전술 세그먼트"
          options={[
            ['balanced', '균형'],
            ['possession', '점유율'],
            ['counter', '역습'],
          ]}
          value={selected}
          onChange={setSelected}
        />
      </Section>
      <Section title="TermDial">
        <TermDial label="계약 기간" value={term} onChange={setTerm} />
      </Section>
    </>
  );
}
function Cards({ runtime }: { runtime: Runtime }) {
  return (
    <>
      <Section title="Card · 3단계 배경 면">
        <Card
          as="section"
          surface="sheet"
          title="내용지 · 2단계"
          meta="바탕 · 1단계는 이 예제 뒤의 캔버스"
        >
          <div className="ds-grid">
            <Card title="기록 카드 · 3단계" meta="프리미어리그 · 홈 경기">
              <b>HAERAM 2–1 ATHLETIC</b>
              <p>제목과 기록은 가장 밝은 종이 면에서 읽습니다.</p>
            </Card>
            <Card
              title="액션이 있는 카드"
              meta="보조 정보 · 경기 결과"
              actions={
                <>
                  <button data-ui="primary">분석 보기</button>
                  <button>경기 자료</button>
                </>
              }
            >
              <p>긴 한국어 제목과 본문, 여러 버튼도 내용에 맞게 줄바꿈합니다.</p>
            </Card>
          </div>
        </Card>
      </Section>
      <Section title="본문만 있는 Card">
        <Card aria-label="짧은 기록">
          <span>다음 경기는 토요일에 열립니다.</span>
        </Card>
      </Section>
      <Section title="실제 사용 · 경기 수첩">
        <FixtureNotebook w={runtime.view.world} client={runtime.client} />
      </Section>
    </>
  );
}

function Tabs({ runtime }: { runtime: Runtime }) {
  const [tab, setTab] = useState('overview');
  const w = runtime.view.world;
  return (
    <>
      <Section title="TabList · TabPanel">
        <TabList
          tabs={[
            ['overview', '개요'],
            ['players', '선수 기록'],
            ['details', '상세 분석'],
          ]}
          value={tab}
          onChange={setTab}
          label="예제 탭"
          idPrefix="example"
        />
        <TabPanel value={tab} idPrefix="example">
          <div className={app.panelBody}>
            {tab === 'overview'
              ? '구단의 현재 상태를 확인합니다.'
              : tab === 'players'
                ? '선수별 기록을 확인합니다.'
                : '경기별 분석을 확인합니다.'}
          </div>
        </TabPanel>
      </Section>
      <Section title="Panel · Attributes">
        <Panel
          title="구단 현황"
          note="시즌 요약"
          action={<button data-ui="link">상세 보기 →</button>}
          footer="등록 선수와 현재 전력은 선수단 변경에 따라 갱신됩니다."
        >
          <div className={app.panelBody}>
            <Attributes
              rows={[
                ['소속 리그', '잉글랜드'],
                ['선수', 24, '등록한 선수 수'],
                ['현재 전력', <OvrBadge key="ovr" value={72} />],
                ['상태', '좋음'],
              ]}
            />
          </div>
        </Panel>
      </Section>
      <Section title="Table">
        <Table w={w} ids={ownLeagueIds(w)} limit={8} />
      </Section>
      <Section title="OfficeBar">
        <OfficeBar title="선수 계약" />
      </Section>
    </>
  );
}
function Icons() {
  const theme = useTheme();
  const icons = Object.keys(theme.pack.icons).filter((key) => !key.startsWith('trophy.'));
  return (
    <>
      <Section title="테마의 전체 의미 아이콘">
        <div className="ds-icon-grid">
          {icons.map((name) => (
            <div key={name}>
              <PixelIcon name={name as Parameters<typeof PixelIcon>[0]['name']} size={28} />
              <code>{name}</code>
            </div>
          ))}
        </div>
      </Section>
      <Section title="TrophyIcon · 획득 / 미획득">
        <div className="ds-icon-grid">
          {(
            [
              'league',
              'cup',
              'continental',
              'final',
              'promotion',
              'relegation',
              'best',
            ] as TrophyKind[]
          ).map((kind) => (
            <div key={kind}>
              <TrophyIcon kind={kind} />
              <TrophyIcon kind={kind} earned={false} />
              <code>{kind}</code>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
function Badges({ runtime }: { runtime: Runtime }) {
  const w = runtime.view.world,
    player = w.players[0];
  return (
    <>
      <Section title="ResultBadge · 승 · 무 · 패">
        <div className="ds-row">
          <ResultBadge result="승" />
          <ResultBadge result="무" />
          <ResultBadge result="패" />
        </div>
      </Section>
      <Section title="ResultBadge · 최근 경기 점수">
        <div className="ds-row">
          <ResultBadge result="승" score={[2, 1]} />
          <ResultBadge result="무" score={[0, 0]} />
          <ResultBadge result="패" score={[1, 3]} />
          <ResultBadge result="승" score={[10, 2]} />
        </div>
      </Section>
      <Section title="HomeAwayBadge · 홈과 원정">
        <div className="ds-row">
          <HomeAwayBadge side="home" />
          <HomeAwayBadge side="away" />
        </div>
      </Section>
      <Section title="PositionBadge · 골키퍼 · 수비 · 미드필드 · 공격">
        <div className="ds-row">
          {POSITIONS.map((position) => (
            <PositionBadge key={position} position={position} />
          ))}
        </div>
      </Section>
      <Section title="StaffRoleBadge · 감독 · 단장 · 코치진">
        <div className="ds-row">
          {(['manager', ...STAFF_ROLES] as const).map((post) => (
            <StaffRoleBadge key={post} post={post} />
          ))}
        </div>
      </Section>
      <Section title="OvrBadge · 등급과 잠재력">
        <div className="ds-row">
          {[42, 58, 70, 80, 90].map((value) => (
            <OvrBadge key={value} value={value} role="ST" />
          ))}
          <OvrBadge value={72} role="CM" potential={86} />
          <OvrBadge value={91} role="GK" large />
        </div>
      </Section>
      <Section title="행 안의 오버롤 · 5단계">
        <Attributes
          rows={[
            ['브론즈 · 50 미만', <OvrBadge key="bronze" value={42} />],
            ['실버 · 50–64', <OvrBadge key="silver" value={58} />],
            ['골드 · 65–74', <OvrBadge key="gold" value={70} />],
            ['플래티넘 · 75–84', <OvrBadge key="platinum" value={80} />],
            ['루비 · 85+', <OvrBadge key="ruby" value={90} />],
          ]}
        />
      </Section>
      <Section title="금액 · BETA">
        <div className="ds-row">
          <Money value="1250000" code="ENG" year={w.year} />
          <Money value="-850000" code="ENG" year={w.year} />
          <AnimatedMoney value={w.cash} format={(value) => Number(value).toLocaleString()} />
          <BetaMark />
          <BetaMark version />
        </div>
      </Section>
      <Section title="상세 정보 링크">
        <div className="ds-row">
          <ClubLink w={w} id={w.playerClub} />
          <PlayerLink id={player.id} name={player.name} />
          <PersonCareerLink id={w.manager.id!} name={w.manager.name} client={runtime.client} />
          <Term id="xg" />
        </div>
      </Section>
    </>
  );
}
function Charts() {
  return (
    <>
      <Section title="Chart">
        <Chart
          label="시즌별 전력"
          values={[42, 46, 44, 56, 62, 58, 72]}
          labels={['1950', '1951', '1952', '1953', '1954', '1955', '1956']}
        />
      </Section>
      <Section title="MaterialPitch · HeatPitch">
        <div className="ds-grid">
          <MaterialPitch label="공격 방향 분석">
            <circle cx="55" cy="40" r="5" fill="var(--accent)" data-label="예시 공격 위치" />
          </MaterialPitch>
          <HeatPitch
            map={{
              cells: Array.from({ length: 40 }, (_, i) =>
                Math.round(24 * Math.exp(-((Math.floor(i / 5) - 5) ** 2 + ((i % 5) - 1) ** 2) / 3)),
              ),
              touches: 225,
            }}
            label="선수 터치 히트맵"
          />
        </div>
      </Section>
      <Section title="FormationPitch">
        <div className="ds-grid">
          {(['balanced', 'possession', 'counter', 'press'] as const).map((tactic) => (
            <FormationPitch
              key={tactic}
              tactic={tactic}
              label={tactic}
              compact
              slot={(index) => <b>{index + 1}</b>}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

function Identity({ runtime }: { runtime: Runtime }) {
  const club = runtime.view.world.clubs.find((club) => club.id === runtime.view.world.playerClub)!;
  const [value, setValue] = useState(() =>
    createIdentityDraft({ country: 'ENG', color: club.color, seed: 'design-system' }),
  );
  return <ClubIdentityEditor value={value} onChange={setValue} />;
}
function Dialogs() {
  const [opened, setOpened] = useState('');
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <Section title="Dialog · 실제 대화상자">
        <div className="ds-row">
          {[
            ['normal', '기본 시트'],
            ['wide', '넓은 시트'],
            ['picker', '작은 선택 창'],
            ['long', '긴 내용 스크롤'],
          ].map(([id, label]) => (
            <button key={id} onClick={() => setOpened(id)}>
              {label} 열기
            </button>
          ))}
        </div>
      </Section>
      <Section title="상태 메시지">
        <p role="status">변경 내용을 저장했어요.</p>
        <p role="alert" className="ds-error">
          진행할 수 없어요. 입력한 값을 확인해 주세요.
        </p>
        <button onClick={() => setFeedback(!feedback)}>떠 있는 알림 표시</button>
      </Section>
      {opened && (
        <Dialog
          label="대화상자 미리보기"
          onClose={() => setOpened('')}
          wide={opened === 'wide'}
          picker={opened === 'picker'}
          actions={
            <>
              <button onClick={() => setOpened('')}>취소</button>
              <button data-ui="primary" onClick={() => setOpened('')}>
                확인
              </button>
            </>
          }
        >
          <div className={app.panelBody}>
            {Array.from({ length: opened === 'long' ? 30 : 1 }, (_, index) => (
              <p key={index}>
                테마의 헤더, 본문, 닫기 버튼과 하단 동작을 확인합니다. 모바일에서는 시트의 배치와
                스크롤을 확인할 수 있어요.
              </p>
            ))}
            <Select aria-label="대화상자 안의 선택" value="a" onValueChange={noop}>
              <option value="a">기본 옵션</option>
              <option value="b">다른 옵션</option>
            </Select>
          </div>
        </Dialog>
      )}
      {feedback && (
        <FeedbackOverlay>
          <div data-surface="panel">
            <p>새로운 경기 결과가 도착했어요.</p>
            <button onClick={() => setFeedback(false)}>확인</button>
          </div>
        </FeedbackOverlay>
      )}
    </>
  );
}
function Slots({ runtime }: { runtime: Runtime }) {
  const [slots] = useState(
    () =>
      new GameSlots(runtime.client, new GameIndexStore(memoryStorage()), {
        get: async () => undefined,
        put: async () => {},
        remove: async () => {},
      }),
  );
  return (
    <GameSlotScreen
      slots={slots}
      onEnter={noop}
      onNew={async () => {}}
      onExport={noop}
      onRemovedInPlay={noop}
    />
  );
}

/** Preview prices from the sample world's clubs: dearer with strength and over the decades. */
const previewScale = (year: number) => (year < 1960 ? 1 : year < 1980 ? 4 : year < 2000 ? 20 : 60);
const previewMinor = (pounds: number, code: string, year: number) =>
  String(
    BigInt(Math.round(pounds)) * BigInt(currency(code, year).units) * (code === 'ENG' ? 1n : 10n),
  );
/** Where each preview tier's fortune sits among the prices, richest first. */
const PREVIEW_REACH: Record<WealthTier, number> = {
  oil: 1,
  chaebol: 0.9,
  industrial: 0.75,
  midsize: 0.5,
  local: 0.3,
  selfmade: 0.1,
};
function previewStart(w: World, tier: WealthTier, year: number) {
  const clubs = w.clubs.filter(
    (club) =>
      !club.representative &&
      club.id !== w.playerClub &&
      club.tier < country(club.country).groups.length,
  );
  const pounds = (strength: number) => 1000 * 1.12 ** (strength - 40) * previewScale(year);
  const prices = clubs.map((club) => pounds(club.strength)).sort((a, b) => a - b);
  const reach = PREVIEW_REACH[tier];
  const fortunePounds =
    reach >= 1 ? prices.at(-1)! * 2 : prices[Math.floor(reach * (prices.length - 1))];
  const fortune = previewMinor(fortunePounds, 'ENG', year);
  const listings: ClubListing[] = clubs.map((club, index) => {
    const price = pounds(club.strength);
    const amount = (share: number) => previewMinor(price * share, club.country, year);
    const listing: ClubListing = {
      clubId: club.id,
      name: club.name,
      country: club.country as ClubListing['country'],
      division: club.tier,
      currency: currency(club.country, year).code,
      price: amount(1),
      pricePounds: previewMinor(price, 'ENG', year),
      cash: amount(0.1),
      debt: amount(index % 4 === 0 ? 0.4 : 0),
      lastIncome: amount(0.3),
      lastWages: amount(0.18),
      strength: Math.round(club.strength),
      affordable: false,
    };
    return { ...listing, affordable: canAfford(listing, fortune) };
  });
  return { listings, fortune };
}
function previewSheet(w: World, clubId: string, year: number): ClubSheetFacts | undefined {
  const club = w.clubs.find((item) => item.id === clubId);
  if (!club) return undefined;
  const strength = Math.round(club.strength);
  return {
    crest: club.identity?.crest,
    squad: w.players.slice(0, 18).map((player, index) => ({
      id: player.id,
      name: player.name,
      position: player.position,
      age: w.year - player.born,
      ovr: Math.max(30, strength + 6 - index),
    })),
    manager: { name: w.manager.name, age: 51, rating: strength, note: '실리 축구 · 4-4-2' },
    stadium: { name: `${club.name} Park`, seats: 12_000 + strength * 300 },
    history: {
      league: club.tier === 0 ? 2 : 0,
      cup: 1,
      europe: 0,
      seasons: [1, 2, 3, 4, 5].map((back) => ({
        year: year - back,
        division: club.tier,
        place: 1 + ((strength + back * 7) % 18),
      })),
    },
  };
}
/** The start flow on preview data: every step, a simulated generation and the takeover list. */
function StartFlowStory({
  runtime,
  notify,
}: {
  runtime: Runtime;
  notify: (message: string) => void;
}) {
  const w = runtime.view.world;
  const [mode, setMode] = useState<'choice' | 'progress' | 'list'>('choice');
  const [run, setRun] = useState<{ choice: StartChoice; season: number }>();
  const [listed, setListed] = useState<ReturnType<typeof previewStart>>();
  useEffect(() => {
    if (!run || listed) return;
    const year = takeoverYear(run.choice.decade);
    const timer = setTimeout(() => {
      if (run.season >= year) setListed(previewStart(w, run.choice.tier, year));
      // The war seasons are never played (→WORLD-14).
      else setRun({ ...run, season: run.season === 1938 ? 1946 : run.season + 1 });
    }, 90);
    return () => clearTimeout(timer);
  }, [run, listed, w]);
  const takeOver = (clubId: string, preset?: string) =>
    notify(`${clubId} 인수 · ${preset ?? '기본 방향'} (미리보기)`);
  const loadClub = (clubId: string) =>
    new Promise<ClubSheetFacts | undefined>((resolve) =>
      setTimeout(
        () => resolve(previewSheet(w, clubId, takeoverYear(run?.choice.decade ?? 1950))),
        300,
      ),
    );
  return (
    <>
      <Segments
        label="미리보기 상태"
        options={[
          ['choice', '처음부터'],
          ['progress', '생성 중'],
          ['list', '구단 목록'],
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setRun(undefined);
          setListed(undefined);
        }}
      />
      {mode === 'choice' && (
        <StartFlow
          key="choice"
          slot={1}
          onBack={noop}
          onGenerate={(choice) => setRun({ choice, season: 1930 })}
          progress={run && !listed ? { season: run.season } : undefined}
          listings={listed?.listings}
          fortune={listed?.fortune}
          loadClub={loadClub}
          onTakeOver={takeOver}
        />
      )}
      {mode === 'progress' && (
        <StartFlow
          key="progress"
          initial={{ tier: 'oil', traits: ['talisman', 'marketer'], decade: 1960 }}
          progress={{ season: 1947 }}
          onGenerate={noop}
          onTakeOver={takeOver}
        />
      )}
      {mode === 'list' && (
        <StartFlow
          key="list"
          initial={{ tier: 'midsize', decade: 1950 }}
          {...previewStart(w, 'midsize', 1950)}
          loadClub={loadClub}
          onGenerate={noop}
          onTakeOver={takeOver}
        />
      )}
    </>
  );
}

function Alerts({ runtime }: { runtime: Runtime }) {
  const { view, controller } = runtime;
  const w = view.world;
  const [serial, setSerial] = useState(0);
  return (
    <>
      <Section title="CashAlarm · 실제 자금 위기 경고">
        <div className="ds-row">
          <button
            onClick={() =>
              gameStore.setState({
                view: { ...view, world: { ...w, cash: '-50000', insolvent: 2 } },
              })
            }
          >
            현금 부족 상태
          </button>
          <button onClick={() => gameStore.setState({ view })}>정상 상태로</button>
        </div>
        <CashAlarm />
      </Section>
      <Section title="CelebrationHost · 업적 축하">
        <button
          onClick={() => {
            setSerial(serial + 1);
            gameStore.setState({
              view: {
                ...view,
                news: [
                  {
                    id: `preview-celebration-${serial}`,
                    year: w.year,
                    round: w.round,
                    order: serial,
                    tag: '기록',
                    tone: 'good',
                    weight: 'major',
                    title: '샘플 클럽이 리그 우승을 차지했어요',
                    detail: '업적 알림의 테마와 애니메이션을 확인합니다.',
                    celebrate: true,
                  },
                  ...view.news,
                ],
              },
            });
          }}
        >
          축하 배너 표시
        </button>
      </Section>
      <Section title="AwaySummary · 복귀 보고">
        <button
          onClick={() => {
            const from = clockMark(w, view.totalMatches - 3);
            controller.store.setState({ away: { ...from, day: from.day - 14 } });
          }}
        >
          자리를 비운 동안 보고서 열기
        </button>
      </Section>
      <CelebrationHost />
      <AwaySummary controller={controller} />
    </>
  );
}

export default function StoryRenderer({
  story,
  runtime,
  notify,
}: {
  story: Story;
  runtime: Runtime;
  notify: (message: string) => void;
}) {
  const { state, client, controller, playback } = runtime;
  const w = runtime.view.world;
  const player = w.players[0];
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState(false);
  const [preparing, setPreparing] = useState(false);
  let content: ReactNode;
  if (story.page)
    content = <Rich page={story.page} state={state} client={client} controller={controller} />;
  else
    switch (story.id) {
      case 'async-states':
        content = (
          <>
            <Section title="로딩">
              <ManagerHistory
                loading
                onInspect={noop}
                onOpenSeason={noop}
                onLoadMore={noop}
                onRetry={noop}
              />
            </Section>
            <Section title="빈 화면">
              <ManagerHistory
                onInspect={noop}
                onOpenSeason={noop}
                onLoadMore={noop}
                onRetry={noop}
              />
            </Section>
            <Section title="오류 · 재시도">
              <ManagerHistory
                error="기록을 불러오지 못했어요."
                onInspect={noop}
                onOpenSeason={noop}
                onLoadMore={noop}
                onRetry={() => notify('재시도 버튼 미리보기입니다.')}
              />
            </Section>
          </>
        );
        break;
      case 'league-history':
        content = <LiveSeason page="leagueHistory" client={client} controller={controller} />;
        break;
      case 'cup-history':
        content = <CupsView w={w} coefficient={runtime.view.coefficient} client={client} />;
        break;
      case 'alerts':
        content = <Alerts runtime={runtime} />;
        break;
      case 'lab':
        content = <LabPage />;
        break;
      case 'controls':
        content = <Controls />;
        break;
      case 'cards':
        content = <Cards runtime={runtime} />;
        break;
      case 'tabs':
        content = <Tabs runtime={runtime} />;
        break;
      case 'icons':
        content = <Icons />;
        break;
      case 'badges':
        content = <Badges runtime={runtime} />;
        break;
      case 'charts':
        content = <Charts />;
        break;
      case 'settings':
        content = (
          <Section title="PresentationSettings">
            <PresentationSettingsControls />
            <PresentationSettingsTrigger />
            <PresentationSettings />
          </Section>
        );
        break;
      case 'home':
        content = <ClubHub w={w} client={client} />;
        break;
      case 'home-cards':
        content = (
          <>
            <SeasonCard w={w} active />
            <NextMatchCard w={w} onPrepare={() => setPreparing(true)} />
            <CupBriefing w={w} />
            <OfficeEntrance w={w} />
          </>
        );
        break;
      case 'controller-backgrounds':
        content = <ControllerBackgrounds client={client} controller={controller} />;
        break;
      case 'controller':
        content = (
          <>
            <Section title="HUD / ProgressControls">
              <div className="ds-row">
                <HudCash />
                <ProgressModeSwitch client={client} controller={controller} />
                <button onClick={() => setMenu(true)}>게임 메뉴 열기</button>
              </div>
              <ProgressControls client={client} controller={controller} />
              <ProgressOverview />
            </Section>
            {menu && (
              <AppMenu
                onClose={() => setMenu(false)}
                onNews={noop}
                onGuide={noop}
                onGlossary={noop}
                saveTools={
                  <button onClick={() => notify('저장 도구 미리보기입니다.')}>저장 도구</button>
                }
              />
            )}
          </>
        );
        break;
      case 'league':
        content = (
          <>
            <LeaguePicker onLeague={noop} />
            <LeagueOverview w={w} />
            <Standings w={w} ids={ownLeagueIds(w)} />
            <RoundResults w={w} ids={ownLeagueIds(w)} />
            <ScorerStandings w={w} />
          </>
        );
        break;
      case 'season':
        content = <LiveSeason page="league" client={client} controller={controller} />;
        break;
      case 'cups':
        content = <CupsView w={w} coefficient={runtime.view.coefficient} client={client} />;
        break;
      case 'fixtures':
        content = <FixtureNotebook w={w} client={client} />;
        break;
      case 'pitch':
        content = <Pitch playback={playback} world={w} summary />;
        break;
      case 'match-report':
        content = (
          <>
            <MatchReport record={playback.record} w={w} />
            <MatchMaterial record={playback.record} w={w} />
            <MatchReportCard w={w} fixture={w.fixtures[0]}>
              <button>관전하기</button>
            </MatchReportCard>
          </>
        );
        break;
      case 'preparation':
        content = (
          <>
            {!open && <button onClick={() => setOpen(true)}>상세 리포트 열기</button>}
            {open && <StrategyPanel w={w} client={client} onClose={() => setOpen(false)} />}
          </>
        );
        break;
      case 'profile':
        content = (
          <>
            <PlayerProfile w={w} player={player} own />
            <PlayerPerformance player={player} scope="season" />
            <PlayerAdvancedStats w={w} player={player} scope="season" />
          </>
        );
        break;
      case 'player-sheet':
        content = (
          <>
            <button onClick={() => setOpen(true)}>선수 상세 열기</button>
            {open && (
              <PlayerSheet
                w={w}
                player={player}
                scope="season"
                client={client}
                onClose={() => setOpen(false)}
              />
            )}
          </>
        );
        break;
      case 'comparison':
        content = (
          <>
            <button onClick={() => setOpen(true)}>선수 비교 열기</button>
            {open && (
              <PlayerComparison
                w={w}
                client={client}
                initialScope="season"
                onClose={() => setOpen(false)}
              />
            )}
          </>
        );
        break;
      case 'recruitment':
        content = <RecruitmentDesk state={state} client={client} />;
        break;
      case 'styles':
        content = (
          <div className="ds-grid">
            <StyleCard />
            {(Object.keys(STYLE_INFO) as (keyof typeof STYLE_INFO)[]).map((style) => (
              <StyleCard key={style} style={style} />
            ))}
          </div>
        );
        break;
      case 'identity':
        content = <Identity runtime={runtime} />;
        break;
      case 'design':
        content = <ClubDesignView state={state} client={client} />;
        break;
      case 'policy':
        content = (
          <DirectionAreas
            w={w}
            areas={['squad', 'scouting', 'market', 'youth', 'staff', 'finance', 'local', 'global']}
          />
        );
        break;
      case 'facilities':
        content = (
          <>
            <div className="ds-grid">
              {(['stadium', 'locker', 'manager', 'staff', 'training', 'academy'] as const).map(
                (kind) => (
                  <FacilityOverview key={kind} w={w} kind={kind} title={kind}>
                    현재 연도 {w.year} · 완료된 시설 단계의 일러스트
                  </FacilityOverview>
                ),
              )}
            </div>
            <FacilityParts w={w} />
          </>
        );
        break;
      case 'finance':
        content = (
          <>
            <FinancialBreakdown w={w} />
            <FinanceOutlook w={w} />
          </>
        );
        break;
      case 'career':
        content = (
          <>
            <CareerRecordBook w={w} />
            <TrophyCabinet w={w} />
            <ClubLeaders w={w} />
            <ClubTrends w={w} />
            <SeasonTable w={w} />
          </>
        );
        break;
      case 'season-review':
        content = <SeasonReview w={w} year={w.history[0]?.year ?? w.year} />;
        break;
      case 'founding':
        content = <ClubFounding client={client} state={state} onBack={noop} />;
        break;
      case 'start-flow':
        content = <StartFlowStory runtime={runtime} notify={notify} />;
        break;
      case 'slots':
        content = <Slots runtime={runtime} />;
        break;
      case 'dialogs':
        content = <Dialogs />;
        break;
      case 'events':
        content = (
          <>
            <button onClick={() => useNewsSheet.getState().show('notifications')}>
              알림함 열기
            </button>
            <NewsList w={w} />
            <CommunicationsCenter client={client} />
          </>
        );
        break;
      case 'office-overview':
        content = <OwnerOffice client={client} controller={controller} />;
        break;
      case 'glossary':
        content = (
          <>
            <button onClick={() => setOpen(true)}>가이드 열기</button>
            <button onClick={() => useGlossary.getState().show('xg')}>용어 사전 열기</button>
            {open && (
              <PlayGuide goals={runtime.view.milestones.goals} onClose={() => setOpen(false)} />
            )}
          </>
        );
        break;
      default:
        content = <p>등록되지 않은 예제입니다.</p>;
    }
  return (
    <>
      <main className="ds-preview-content">{content}</main>
      {preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />}
      <PlayerSheetHost client={client} />
      <TeamSheetHost client={client} />
      <GlossaryHost />
    </>
  );
}
