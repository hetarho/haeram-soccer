import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { ClubLink } from '../entities/club';
import { openPlayer, PlayerLink } from '../entities/player';
import { ClubDetailHost } from '../widgets/club-detail';
import { PlayerDetailHost } from '../widgets/player-detail';
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
import { OwnerSheetBody } from '../ui/OwnerSheet.tsx';
import { GameOver } from '../ui/GameOver';
import { FAN_MOOD } from '../../../../packages/engine/src/owner-config';
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
import { PlayerComparison } from '../ui/PlayerComparison';
import Rich from '../ui/Rich';
import { RecruitmentDesk } from '../ui/RecruitmentDesk';
import { StyleCard } from '../ui/StyleCard';
import { STYLE_INFO } from '../../../../packages/engine/src/styles';
import { ClubDesignView } from '../ui/ClubDesignView';
import { identityOf } from '../../../../packages/engine/src/club-identity';
import { KIT_ROLES } from '../../../../packages/contracts/src/identity';
import { ClubCrest } from '../ui/ClubCrest';
import { KitSwatch } from '../ui/KitSwatch';
import { KitPitchPreview } from '../ui/KitPitchPreview';
import { editorPreviewAppearance, KIT_ROLE_LABELS } from '../ui/identityPreview';
import { DirectionAreas } from '../ui/DirectionFacts';
import { FacilityOverview } from '../ui/FacilityOverview';
import { FacilityParts } from '../ui/FacilityParts';
import { FinancialBreakdown } from '../ui/FinancialBreakdown';
import { FinanceOutlook } from '../ui/FinanceOutlook';
import { CareerRecordBook, TrophyCabinet, ClubLeaders } from '../ui/CareerRecordBook';
import { ClubTrends, SeasonTable } from '../ui/ClubTrends';
import { SeasonReview } from '../ui/SeasonReview';
import { StartFlow } from '../ui/StartFlow';
import { canAfford, takeoverYear, type ClubProfile } from '../ui/startChoices';
import type {
  ClubListing,
  StartChoice,
  WealthTier,
} from '../../../../packages/contracts/src/owner';
import type {
  GenerationDigest,
  GenerationFeat,
  World,
} from '../../../../packages/contracts/src/types';
import { COUNTRIES, country, currency } from '../../../../packages/catalogs/src/index';
import { eloOf } from '../../../../packages/engine/src/elo';
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
const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  useTextLocale();
  return (
    <section className="ds-example">
      <h2>{localizeValue(title)}</h2>
      <div className="ds-example-body">{localizeValue(children)}</div>
    </section>
  );
};
const noop = () => {};

function Controls() {
  useTextLocale();
  const [selected, setSelected] = useState('balanced');
  const [term, setTerm] = useState<1 | 2 | 3 | 4 | 5>(3);
  return (
    <>
      <Section title={displayMessage('copy.stories.8da3c6e3b2')}>
        <div className="ds-button-variants">
          <div>
            <span>{richMessage('copy.stories.edcd00e464')}</span>
            <button data-ui="primary" className={app.primary}>
              {richMessage('copy.stories.106c5fab1b')}
            </button>
            <button data-ui="primary" disabled>
              {richMessage('copy.stories.106c5fab1b')}
            </button>
          </div>
          <div>
            <span>{richMessage('copy.stories.e0674f2b5c')}</span>
            <button data-ui="secondary">{richMessage('copy.stories.379f00798f')}</button>
            <button data-ui="secondary" disabled>
              {richMessage('copy.stories.379f00798f')}
            </button>
          </div>
          <div>
            <span>{richMessage('copy.stories.c7ac39dcb7')}</span>
            <button data-ui="tertiary">{richMessage('copy.stories.d2276a8437')}</button>
            <button data-ui="tertiary" disabled>
              {richMessage('copy.stories.d2276a8437')}
            </button>
          </div>
        </div>
        <div className="ds-row">
          <button>{richMessage('copy.stories.d0d029381c')}</button>
          <button disabled>{richMessage('copy.stories.14d967638b')}</button>
          <button aria-label={displayMessage('shell.menu')}>
            <PixelIcon name="menu" />
          </button>
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.3aab4cbf9a')}>
        <div className="ds-row ds-fields">
          <label>
            {richMessage('copy.stories.3e354a77d5', {
              p0: <input defaultValue="Haeram Athletic" />,
            })}
          </label>
          <label>
            {richMessage('copy.stories.9813fd8d43', {
              p0: <input type="number" defaultValue={1950} />,
            })}
          </label>
          <label>
            {richMessage('copy.stories.cb541a4058', {
              p0: <input placeholder={displayMessage('copy.stories.c4b779ece3')} />,
            })}
          </label>
          <label>
            {richMessage('copy.stories.72f445a329', {
              p0: <input disabled value={sourceMessage('copy.stories.0891edaa9e')} readOnly />,
            })}
          </label>
        </div>
        <label className="ds-block-label">
          {richMessage('copy.stories.ec6a040be9', {
            p0: <textarea defaultValue={sourceMessage('copy.stories.cf396e6271')} rows={3} />,
          })}
        </label>
      </Section>
      <Section title={displayMessage('copy.stories.e28a0b7467')}>
        <div className="ds-row">
          <label>
            {richMessage('copy.stories.3b25a7c19c', {
              p0: <input type="checkbox" defaultChecked />,
            })}
          </label>
          <label>{richMessage('copy.stories.1fa5f89a4e', { p0: <input type="checkbox" /> })}</label>
          <label>
            {richMessage('copy.stories.466631fd57', { p0: <input type="checkbox" disabled /> })}
          </label>
          <label>
            {richMessage('copy.stories.1f8a258228', {
              p0: <input type="checkbox" defaultChecked disabled />,
            })}
          </label>
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.d24bfbd377')}>
        <div className="ds-row ds-selects">
          <Select
            aria-label={displayMessage('copy.stories.04991a4957')}
            value={selected}
            onValueChange={setSelected}
          >
            <option value="balanced">{richMessage('copy.stories.a7e151c7eb')}</option>
            <option value="possession" data-hint={sourceMessage('copy.stories.65bf056942')}>
              {richMessage('copy.stories.6169842c01')}
            </option>
            <option value="counter">{richMessage('copy.stories.6b52f66491')}</option>
            <option value="press" disabled>
              {richMessage('copy.stories.9be767b50d')}
            </option>
          </Select>
          <Select
            aria-label={displayMessage('copy.stories.79aaee6e4e')}
            value="off"
            onValueChange={noop}
            disabled
          >
            <option value="off">{richMessage('copy.stories.8bb10df879')}</option>
          </Select>
        </div>
        <Segments
          label={displayMessage('copy.stories.68eb080998')}
          options={[
            ['balanced', sourceMessage('copy.stories.634269a095')],
            ['possession', sourceMessage('copy.stories.6169842c01')],
            ['counter', sourceMessage('copy.stories.6b52f66491')],
          ]}
          value={selected}
          onChange={setSelected}
        />
      </Section>
      <Section title={displayMessage('copy.stories.e115500fcc')}>
        <TermDial
          label={displayMessage('copy.stories.ebf9376720')}
          value={term}
          onChange={setTerm}
        />
      </Section>
    </>
  );
}
function Cards({ runtime }: { runtime: Runtime }) {
  useTextLocale();
  return (
    <>
      <Section title={displayMessage('copy.stories.13522992e9')}>
        <Card
          as="section"
          surface="sheet"
          title={displayMessage('copy.stories.48d0a6dcab')}
          meta={sourceMessage('copy.stories.1b29e127ae')}
        >
          <div className="ds-grid">
            <Card
              title={displayMessage('copy.stories.ba5e91d811')}
              meta={sourceMessage('copy.stories.21b3bdf60f')}
            >
              <b>{richMessage('copy.stories.cdf73c5e68')}</b>
              <p>{richMessage('copy.stories.0c754ae114')}</p>
            </Card>
            <Card
              title={displayMessage('copy.stories.5d34747c15')}
              meta={sourceMessage('copy.stories.7fbb0aa9c3')}
              actions={
                <>
                  <button data-ui="primary">{richMessage('copy.stories.bde16b30e5')}</button>
                  <button>{richMessage('copy.stories.a3b55318c6')}</button>
                </>
              }
            >
              <p>{richMessage('copy.stories.cdbca72b5d')}</p>
            </Card>
          </div>
        </Card>
      </Section>
      <Section title={displayMessage('copy.stories.af5fa1460a')}>
        <Card aria-label={displayMessage('copy.stories.d426abebb7')}>
          <span>{richMessage('copy.stories.e6740b3682')}</span>
        </Card>
      </Section>
      <Section title={displayMessage('copy.stories.5cf258e1e3')}>
        <FixtureNotebook w={runtime.view.world} client={runtime.client} />
      </Section>
    </>
  );
}

function Tabs({ runtime }: { runtime: Runtime }) {
  useTextLocale();
  const [tab, setTab] = useState('overview');
  const w = runtime.view.world;
  return (
    <>
      <Section title={displayMessage('copy.stories.3b4a1a5795')}>
        <TabList
          tabs={[
            ['overview', sourceMessage('copy.stories.dc015df639')],
            ['players', sourceMessage('copy.stories.c50c28f608')],
            ['details', sourceMessage('copy.stories.ba044580a1')],
          ]}
          value={tab}
          onChange={setTab}
          label={displayMessage('copy.stories.82bbea1a8e')}
          idPrefix="example"
        />
        <TabPanel value={tab} idPrefix="example">
          <div className={app.panelBody}>
            {localizeValue(
              tab === 'overview'
                ? sourceMessage('copy.stories.e229f6fce6')
                : tab === 'players'
                  ? sourceMessage('copy.stories.d384ae3203')
                  : sourceMessage('copy.stories.d9c1fd7839'),
            )}
          </div>
        </TabPanel>
      </Section>
      <Section title={displayMessage('copy.stories.0f07336fde')}>
        <Panel
          title={displayMessage('copy.stories.62618f9b9e')}
          note={sourceMessage('copy.stories.9361c6a879')}
          action={<button data-ui="link">{richMessage('copy.stories.5e604f3f8c')}</button>}
          footer={sourceMessage('copy.stories.a699ad1a3c')}
        >
          <div className={app.panelBody}>
            <Attributes
              rows={[
                [
                  sourceMessage('copy.stories.66fe016209'),
                  sourceMessage('copy.stories.4b8e088602'),
                ],
                [sourceMessage('team.column.player'), 24, sourceMessage('copy.stories.1ad794cb8f')],
                [sourceMessage('copy.stories.745afb3b4a'), <OvrBadge key="ovr" value={72} />],
                [
                  sourceMessage('copy.stories.e10195a123'),
                  sourceMessage('copy.stories.4b15b49bbe'),
                ],
              ]}
            />
          </div>
        </Panel>
      </Section>
      <Section title={displayMessage('copy.stories.16d1c9050a')}>
        <Table w={w} ids={ownLeagueIds(w)} limit={8} />
      </Section>
      <Section title={displayMessage('copy.stories.ef2f1fee9e')}>
        <OfficeBar title={displayMessage('copy.stories.cb2c18aee9')} />
      </Section>
    </>
  );
}
function Icons() {
  useTextLocale();
  const theme = useTheme();
  const icons = Object.keys(theme.pack.icons).filter((key) => !key.startsWith('trophy.'));
  return (
    <>
      <Section title={displayMessage('copy.stories.729ac61e59')}>
        <div className="ds-icon-grid">
          {localizeValue(
            icons.map((name) => (
              <div key={name}>
                <PixelIcon name={name as Parameters<typeof PixelIcon>[0]['name']} size={28} />
                <code>{localizeValue(name)}</code>
              </div>
            )),
          )}
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.30364f4f94')}>
        <div className="ds-icon-grid">
          {localizeValue(
            (
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
                <code>{localizeValue(kind)}</code>
              </div>
            )),
          )}
        </div>
      </Section>
    </>
  );
}
function Badges({ runtime }: { runtime: Runtime }) {
  useTextLocale();
  const w = runtime.view.world,
    player = w.players[0];
  return (
    <>
      <Section title={displayMessage('copy.stories.79cb83e15f')}>
        <div className="ds-row">
          <ResultBadge result={sourceMessage('result.win')} />
          <ResultBadge result={sourceMessage('result.draw')} />
          <ResultBadge result={sourceMessage('result.loss')} />
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.9374611636')}>
        <div className="ds-row">
          <ResultBadge result={sourceMessage('result.win')} score={[2, 1]} />
          <ResultBadge result={sourceMessage('result.draw')} score={[0, 0]} />
          <ResultBadge result={sourceMessage('result.loss')} score={[1, 3]} />
          <ResultBadge result={sourceMessage('result.win')} score={[10, 2]} />
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.3a7a2de9a0')}>
        <div className="ds-row">
          <HomeAwayBadge side="home" />
          <HomeAwayBadge side="away" />
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.98dfaa1092')}>
        <div className="ds-row">
          {localizeValue(
            POSITIONS.map((position) => <PositionBadge key={position} position={position} />),
          )}
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.0339e2b979')}>
        <div className="ds-row">
          {localizeValue(
            (['manager', ...STAFF_ROLES] as const).map((post) => (
              <StaffRoleBadge key={post} post={post} />
            )),
          )}
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.1cf17632da')}>
        <div className="ds-row">
          {localizeValue(
            [42, 58, 70, 80, 90].map((value) => <OvrBadge key={value} value={value} role="ST" />),
          )}
          <OvrBadge value={72} role="CM" potential={86} />
          <OvrBadge value={91} role="GK" large />
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.84ab5c090b')}>
        <Attributes
          rows={[
            [sourceMessage('copy.stories.b2f5bb4485'), <OvrBadge key="bronze" value={42} />],
            [sourceMessage('copy.stories.ea61e88c69'), <OvrBadge key="silver" value={58} />],
            [sourceMessage('copy.stories.28ab0d9c9e'), <OvrBadge key="gold" value={70} />],
            [sourceMessage('copy.stories.7d7ecf0bd4'), <OvrBadge key="platinum" value={80} />],
            [sourceMessage('copy.stories.e87fbf653b'), <OvrBadge key="ruby" value={90} />],
          ]}
        />
      </Section>
      <Section title={displayMessage('copy.stories.74426b646c')}>
        <div className="ds-row">
          <Money value="1250000" code="ENG" year={w.year} />
          <Money value="-850000" code="ENG" year={w.year} />
          <AnimatedMoney value={w.cash} format={(value) => Number(value).toLocaleString()} />
          <BetaMark />
          <BetaMark version />
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.57e41b8a97')}>
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
  useTextLocale();
  return (
    <>
      <Section title={displayMessage('copy.stories.3e5b90ae05')}>
        <Chart
          label={displayMessage('copy.stories.0c2041254e')}
          values={[42, 46, 44, 56, 62, 58, 72]}
          labels={['1950', '1951', '1952', '1953', '1954', '1955', '1956']}
        />
      </Section>
      <Section title={displayMessage('copy.stories.a05d8e00e4')}>
        <div className="ds-grid">
          <MaterialPitch label={displayMessage('copy.stories.6e427f1cbb')}>
            <circle
              cx="55"
              cy="40"
              r="5"
              fill="var(--accent)"
              data-label={sourceMessage('copy.stories.8ed79e92e2')}
            />
          </MaterialPitch>
          <HeatPitch
            map={{
              cells: Array.from({ length: 40 }, (_, i) =>
                Math.round(24 * Math.exp(-((Math.floor(i / 5) - 5) ** 2 + ((i % 5) - 1) ** 2) / 3)),
              ),
              touches: 225,
            }}
            label={displayMessage('copy.stories.7eab29dbe3')}
          />
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.9c5e998784')}>
        <div className="ds-grid">
          {localizeValue(
            (['balanced', 'possession', 'counter', 'press'] as const).map((tactic) => (
              <FormationPitch
                key={tactic}
                tactic={tactic}
                label={localizeValue(tactic)}
                compact
                slot={(index) => <b>{localizeValue(index + 1)}</b>}
              />
            )),
          )}
        </div>
      </Section>
    </>
  );
}

/** The sample club's applied identity, as generated (→KIT-2/11), in each identity component. */
function Identity({ runtime }: { runtime: Runtime }) {
  useTextLocale();
  const w = runtime.view.world;
  const club = w.clubs.find((club) => club.id === w.playerClub)!;
  const identity = identityOf(w, club.id);
  const preview = editorPreviewAppearance(identity, 'home', 'light');
  return (
    <>
      <Section title={displayMessage('copy.stories.4e33739903')}>
        <div className="ds-row">
          {localizeValue(
            [24, 44, 72].map((size) => (
              <ClubCrest
                key={size}
                w={w}
                id={club.id}
                size={size}
                label={displayMessage('copy.stories.271c77b3ac', { p0: club.name })}
              />
            )),
          )}
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.b5f801ed2c')}>
        <div className="ds-row">
          {localizeValue(
            KIT_ROLES.map((role) => (
              <KitSwatch
                key={role}
                shirt={identity.kits[role]}
                label={displayMessage('copy.stories.d4f4589c92', { p0: KIT_ROLE_LABELS[role] })}
                size={64}
                number={10}
              />
            )),
          )}
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.746814a1c6')}>
        <KitPitchPreview appearance={preview.appearance} labels={preview.labels} />
      </Section>
    </>
  );
}
function Dialogs() {
  useTextLocale();
  const [opened, setOpened] = useState('');
  const [feedback, setFeedback] = useState(false);
  return (
    <>
      <Section title={displayMessage('copy.stories.df68ee56ca')}>
        <div className="ds-row">
          {localizeValue(
            [
              ['normal', sourceMessage('copy.stories.b0070110b9')],
              ['wide', sourceMessage('copy.stories.f769227258')],
              ['picker', sourceMessage('copy.stories.b69a9c6669')],
              ['long', sourceMessage('copy.stories.d9eed2b4a4')],
            ].map(([id, label]) => (
              <button key={id} onClick={() => setOpened(id)}>
                {richMessage('copy.stories.a779e41652', { p0: label })}
              </button>
            )),
          )}
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.fd9de4e542')}>
        <p role="status">{richMessage('copy.stories.b466f3e847')}</p>
        <p role="alert" className="ds-error">
          {richMessage('copy.stories.da355ffe7f')}
        </p>
        <button onClick={() => setFeedback(!feedback)}>
          {richMessage('copy.stories.dc42cf3025')}
        </button>
      </Section>
      {localizeValue(
        opened && (
          <Dialog
            label={displayMessage('copy.stories.7867ac5c7c')}
            onClose={() => setOpened('')}
            wide={opened === 'wide'}
            picker={opened === 'picker'}
            actions={
              <>
                <button onClick={() => setOpened('')}>{richMessage('common.cancel')}</button>
                <button data-ui="primary" onClick={() => setOpened('')}>
                  {richMessage('copy.stories.1aacb54c49')}
                </button>
              </>
            }
          >
            <div className={app.panelBody}>
              {localizeValue(
                Array.from({ length: opened === 'long' ? 30 : 1 }, (_, index) => (
                  <p key={index}>{richMessage('copy.stories.ac59ab2f38')}</p>
                )),
              )}
              <Select
                aria-label={displayMessage('copy.stories.44f3a54c33')}
                value="a"
                onValueChange={noop}
              >
                <option value="a">{richMessage('copy.stories.4bfcfb9ef7')}</option>
                <option value="b">{richMessage('copy.stories.0099b05e57')}</option>
              </Select>
            </div>
          </Dialog>
        ),
      )}
      {localizeValue(
        feedback && (
          <FeedbackOverlay>
            <div data-surface="panel">
              <p>{richMessage('copy.stories.cd0ca7ad44')}</p>
              <button onClick={() => setFeedback(false)}>
                {richMessage('copy.stories.1aacb54c49')}
              </button>
            </div>
          </FeedbackOverlay>
        ),
      )}
    </>
  );
}
function Slots({ runtime }: { runtime: Runtime }) {
  useTextLocale();
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
function previewSheet(w: World, clubId: string, year: number): ClubProfile | undefined {
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
    staff: [
      {
        post: 'manager',
        name: w.manager.name,
        age: 51,
        rating: strength,
        note: sourceMessage('copy.stories.e9cf30d9cb'),
      },
    ],
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
/**
 * A sample season of the generation history view (→WEB-115) from the preview world's clubs: its
 * Elo top 10, the first club of each playable country as champion and, from 1955/56, the European
 * Cup and 발롱도르; a feat card on the 1946 restart and every few seasons after it.
 */
function previewDigest(w: World, season: number): GenerationDigest {
  const named = (club: World['clubs'][number]) => ({
    id: club.id,
    name: club.name,
    country: club.country,
  });
  const elo = [...w.clubs]
    .sort((a, b) => eloOf(b) - eloOf(a))
    .slice(0, 10)
    .map((club) => ({ ...named(club), elo: Math.round(eloOf(club)) }));
  const champions = COUNTRIES.flatMap(({ code }) => {
    const club = w.clubs.find((item) => item.country === code && !item.representative);
    return club ? [{ country: code, club: named(club) }] : [];
  });
  const best = w.clubs.find((club) => club.id === elo[0]?.id) ?? w.clubs[0]!;
  const european = season > 1955;
  const feat: GenerationFeat | undefined =
    season === 1946
      ? { kind: 'war' }
      : european && season % 3 === 0
        ? { kind: 'europe-two', club: named(best), competition: 'European Cup', count: 2 }
        : season % 4 === 0
          ? { kind: 'league-run', club: champions[0]!.club, count: 5 }
          : undefined;
  return {
    season,
    closed: season === 1946 ? 1938 : season - 1,
    elo,
    champions,
    europe: european ? [{ kind: 'ucl', name: 'European Cup', club: named(best) }] : [],
    ...(european
      ? { ballonDor: { name: w.players[0]?.name ?? 'A. Player', club: named(best) } }
      : {}),
    ...(feat ? { feat } : {}),
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
  useTextLocale();
  const w = runtime.view.world;
  const [mode, setMode] = useState<'choice' | 'progress' | 'list'>('choice');
  const [run, setRun] = useState<{ choice: StartChoice; season: number }>();
  const [listed, setListed] = useState<ReturnType<typeof previewStart>>();
  // The history view's season (→WEB-115): the simulated run's, and a fixed one for 생성 중.
  const digest = useMemo(
    () => (run && run.season > 1930 ? previewDigest(w, run.season) : undefined),
    [w, run],
  );
  const sample = useMemo(() => previewDigest(w, 1965), [w]);
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
  const takeOver = (clubId: string) =>
    notify(sourceMessage('copy.stories.07eda20028', { p0: clubId }));
  const loadClub = (clubId: string) =>
    new Promise<ClubProfile | undefined>((resolve) =>
      setTimeout(
        () => resolve(previewSheet(w, clubId, takeoverYear(run?.choice.decade ?? 1950))),
        300,
      ),
    );
  return (
    <>
      <Segments
        label={displayMessage('copy.stories.b49f4cf2d5')}
        options={[
          ['choice', sourceMessage('copy.stories.0eef71c2ed')],
          ['progress', sourceMessage('copy.stories.ecd1faae81')],
          ['list', sourceMessage('copy.stories.77244f1ba7')],
        ]}
        value={mode}
        onChange={(next) => {
          setMode(next);
          setRun(undefined);
          setListed(undefined);
        }}
      />
      {localizeValue(
        mode === 'choice' && (
          <StartFlow
            key="choice"
            slot={1}
            onBack={noop}
            onGenerate={(choice) => setRun({ choice, season: 1930 })}
            progress={run && !listed ? { season: run.season } : undefined}
            digest={digest}
            listings={listed?.listings}
            fortune={listed?.fortune}
            loadClub={loadClub}
            onTakeOver={takeOver}
          />
        ),
      )}
      {localizeValue(
        mode === 'progress' && (
          <StartFlow
            key="progress"
            initial={{ tier: 'oil', traits: ['talisman', 'marketer'], decade: 1970 }}
            progress={{ season: 1965 }}
            digest={sample}
            onGenerate={noop}
            onTakeOver={takeOver}
          />
        ),
      )}
      {localizeValue(
        mode === 'list' && (
          <StartFlow
            key="list"
            initial={{ tier: 'midsize', decade: 1950 }}
            {...previewStart(w, 'midsize', 1950)}
            loadClub={loadClub}
            onGenerate={noop}
            onTakeOver={takeOver}
          />
        ),
      )}
    </>
  );
}

/**
 * The sample club with an owner (→OWNER): a 산업 자본가 with two traits, a quarter of his fortune
 * staked, the takeover's loan and a 팬 민심 that `fanMood` sets, below the floor for 퇴진 압박.
 */
function previewOwner<T extends Pick<World, 'clubs' | 'playerClub' | 'year' | 'currency'>>(
  w: T,
  fanMood = 54,
  fortune = '2400000',
): T {
  const own = w.clubs.find((club) => club.id === w.playerClub)!;
  return {
    ...w,
    owner: {
      tier: 'industrial',
      traits: ['businessman', 'fansFriend'],
      fortune,
      stake: 25,
      dividendShare: 0,
      fanMood,
      ...(fanMood < FAN_MOOD.floor ? { fanCrisis: { rounds: 3 } } : {}),
      ...(BigInt(fortune) < 0n ? { ownerCrisis: { since: { year: w.year, day: 120 } } } : {}),
      ffpInjections: [],
      takeover: {
        year: w.year,
        clubId: own.id,
        price: '3100000',
        debt: '900000',
        fortune: '5500000',
        currency: w.currency,
        lastIncome: '2600000',
      },
      seasonRecords: [],
    },
    loan: { balance: '900000', installment: '207880', seasonsLeft: 5 },
  };
}
/** The 구단주 sheet and its statuses on the sample club (→WEB-114, OWNER-14/15). */
function OwnerStory({ runtime, notify }: { runtime: Runtime; notify: (message: string) => void }) {
  useTextLocale();
  const { view } = runtime;
  const [state, setState] = useState<'calm' | 'crisis'>('calm');
  const w = state === 'calm' ? previewOwner(view.world) : previewOwner(view.world, 18, '-350000');
  // The HUD chip and the statuses read the store: it holds the chosen state's world meanwhile.
  useEffect(() => {
    const world =
      state === 'calm' ? previewOwner(view.world) : previewOwner(view.world, 18, '-350000');
    gameStore.setState({ view: { ...view, world } });
    return () => gameStore.setState({ view });
  }, [state, view]);
  return (
    <>
      <Segments
        label={displayMessage('copy.stories.b49f4cf2d5')}
        options={[
          ['calm', sourceMessage('copy.stories.9e157962ab')],
          ['crisis', sourceMessage('copy.stories.ca02d1ff61')],
        ]}
        value={state}
        onChange={setState}
      />
      <Section title={displayMessage('copy.stories.d422aebbbb')}>
        <div className="ds-row">
          <HudCash />
        </div>
      </Section>
      <Section title={displayMessage('copy.stories.025b193e8d')}>
        <CashAlarm />
      </Section>
      <Section title={displayMessage('copy.stories.947e7c6b60')}>
        <OwnerSheetBody
          key={state}
          w={w as World}
          sending={false}
          message=""
          onCommand={async (command) => {
            notify(sourceMessage('copy.stories.bf910f8b7b', { p0: command.type }));
            return true;
          }}
        />
      </Section>
    </>
  );
}
/** The career's last page by each cause (→WEB-56, OWNER-16). */
function GameOverStory({
  runtime,
  notify,
}: {
  runtime: Runtime;
  notify: (message: string) => void;
}) {
  useTextLocale();
  const w = runtime.view.world;
  const [cause, setCause] = useState<'club' | 'owner' | 'fans'>('club');
  const ended = (
    cause === 'club'
      ? { ...w, bankrupt: { year: w.year, round: w.round, day: 200 } }
      : { ...previewOwner(w, cause === 'fans' ? 9 : 40, '-800000'), ended: cause }
  ) as World;
  return (
    <>
      <Segments
        label={displayMessage('copy.stories.b53e586382')}
        options={[
          ['club', sourceMessage('copy.influences.c09ed2b08e')],
          ['owner', sourceMessage('copy.stories.ca78f66cf8')],
          ['fans', sourceMessage('copy.stories.4e6b8dec47')],
        ]}
        value={cause}
        onChange={setCause}
      />
      <GameOver
        w={ended}
        onExport={() => notify(sourceMessage('copy.stories.16a25eb029'))}
        onNew={() => notify(sourceMessage('copy.stories.74e2d5c9b6'))}
        onSlots={() => notify(sourceMessage('copy.stories.e18e18be47'))}
      />
    </>
  );
}

function Alerts({ runtime }: { runtime: Runtime }) {
  useTextLocale();
  const { view, controller } = runtime;
  const w = view.world;
  const [serial, setSerial] = useState(0);
  return (
    <>
      <Section title={displayMessage('copy.stories.804db2a169')}>
        <div className="ds-row">
          <button
            onClick={() =>
              gameStore.setState({
                view: { ...view, world: { ...w, cash: '-50000', insolvent: 2 } },
              })
            }
          >
            {richMessage('copy.stories.7d1d57ce0c')}
          </button>
          <button onClick={() => gameStore.setState({ view })}>
            {richMessage('copy.stories.1aa710f300')}
          </button>
        </div>
        <CashAlarm />
      </Section>
      <Section title={displayMessage('copy.stories.89601fbd3f')}>
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
                    tag: sourceMessage('navigation.history'),
                    tone: 'good',
                    weight: 'major',
                    title: sourceMessage('copy.stories.3aace02427'),
                    detail: sourceMessage('copy.stories.ca4f616845'),
                    celebrate: true,
                  },
                  ...view.news,
                ],
              },
            });
          }}
        >
          {richMessage('copy.stories.4429adccab')}
        </button>
      </Section>
      <Section title={displayMessage('copy.stories.f39dd6f6a5')}>
        <button
          onClick={() => {
            const from = clockMark(w, view.totalMatches - 3);
            controller.store.setState({ away: { ...from, day: from.day - 14 } });
          }}
        >
          {richMessage('copy.stories.310901d72b')}
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
  useTextLocale();
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
            <Section title={displayMessage('copy.stories.0bd8cf2b14')}>
              <ManagerHistory
                loading
                onInspect={noop}
                onOpenSeason={noop}
                onLoadMore={noop}
                onRetry={noop}
              />
            </Section>
            <Section title={displayMessage('copy.stories.40ae8b7656')}>
              <ManagerHistory
                onInspect={noop}
                onOpenSeason={noop}
                onLoadMore={noop}
                onRetry={noop}
              />
            </Section>
            <Section title={displayMessage('copy.stories.d487479ca5')}>
              <ManagerHistory
                error={sourceMessage('copy.stories.8a87ccd3ba')}
                onInspect={noop}
                onOpenSeason={noop}
                onLoadMore={noop}
                onRetry={() => notify(sourceMessage('copy.stories.d3b7256831'))}
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
          <Section title={displayMessage('copy.stories.0dd5958fe4')}>
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
            <Section title={displayMessage('copy.stories.46b104203b')}>
              <div className="ds-row">
                <HudCash />
                <ProgressModeSwitch client={client} controller={controller} />
                <button onClick={() => setMenu(true)}>
                  {richMessage('copy.stories.4ba74ef6aa')}
                </button>
              </div>
              <ProgressControls client={client} controller={controller} />
              <ProgressOverview />
            </Section>
            {localizeValue(
              menu && (
                <AppMenu
                  onClose={() => setMenu(false)}
                  onNews={noop}
                  onGuide={noop}
                  onGlossary={noop}
                  saveTools={
                    <button onClick={() => notify(sourceMessage('copy.stories.1c2def8100'))}>
                      {richMessage('copy.stories.aae2e4fbf4')}
                    </button>
                  }
                />
              ),
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
              <button>{richMessage('copy.stories.11886b7242')}</button>
            </MatchReportCard>
          </>
        );
        break;
      case 'preparation':
        content = (
          <>
            {localizeValue(
              !open && (
                <button onClick={() => setOpen(true)}>
                  {richMessage('copy.stories.bbd3890ad5')}
                </button>
              ),
            )}
            {localizeValue(
              open && <StrategyPanel w={w} client={client} onClose={() => setOpen(false)} />,
            )}
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
          <button onClick={() => openPlayer({ id: player.id, scope: 'season' })}>
            {richMessage('copy.stories.7518e4e467')}
          </button>
        );
        break;
      case 'comparison':
        content = (
          <>
            <button onClick={() => setOpen(true)}>{richMessage('copy.stories.406a6309e0')}</button>
            {localizeValue(
              open && (
                <PlayerComparison
                  w={w}
                  client={client}
                  initialScope="season"
                  onClose={() => setOpen(false)}
                />
              ),
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
            {localizeValue(
              (Object.keys(STYLE_INFO) as (keyof typeof STYLE_INFO)[]).map((style) => (
                <StyleCard key={style} style={style} />
              )),
            )}
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
              {localizeValue(
                (['stadium', 'locker', 'manager', 'staff', 'training', 'academy'] as const).map(
                  (kind) => (
                    <FacilityOverview key={kind} w={w} kind={kind} title={localizeValue(kind)}>
                      {richMessage('copy.stories.9b96a71a77', { p0: w.year })}
                    </FacilityOverview>
                  ),
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
      case 'start-flow':
        content = <StartFlowStory runtime={runtime} notify={notify} />;
        break;
      case 'owner-sheet':
        content = <OwnerStory runtime={runtime} notify={notify} />;
        break;
      case 'game-over':
        content = <GameOverStory runtime={runtime} notify={notify} />;
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
              {richMessage('copy.stories.ac10b14be9')}
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
            <button onClick={() => setOpen(true)}>{richMessage('copy.stories.16453c4409')}</button>
            <button onClick={() => useGlossary.getState().show('xg')}>
              {richMessage('copy.stories.46370bec2e')}
            </button>
            {localizeValue(
              open && (
                <PlayGuide goals={runtime.view.milestones.goals} onClose={() => setOpen(false)} />
              ),
            )}
          </>
        );
        break;
      default:
        content = <p>{richMessage('copy.stories.654e217221')}</p>;
    }
  return (
    <>
      <main className="ds-preview-content">{localizeValue(content)}</main>
      {localizeValue(
        preparing && <StrategyPanel w={w} client={client} onClose={() => setPreparing(false)} />,
      )}
      <PlayerDetailHost client={client} />
      <ClubDetailHost client={client} />
      <GlossaryHost />
    </>
  );
}
