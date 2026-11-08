import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { settingsOf } from '../../../../../../packages/engine/src/responsibilities';
import { careerEnded } from '../../../../../../packages/contracts/src/owner';
import { Select } from '../../../shared/ui/Select';
import { PixelIcon } from '../../../shared/ui/PixelIcon';
import { currentDay, seasonLength } from '../../../../../../packages/engine/src/calendar';
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import {
  useProgression,
  type Pace,
  type ProgressionController,
} from '../../../runtime/progression';
import type { GameClient } from '../../../runtime/client';
import { ProgressModeSwitch } from './ProgressModeSwitch';
import { ownDivisionRound } from '../../../entities/league';
import { useLocale } from '../../../presentation/react';
import { Dialog } from '../../../shared/ui/Dialog';
import { openPrimary, useNavigation, type Page } from '../../../shared/routing/state';
import { ApprovalButtons } from '../../../features/approvals';
import p from '../../../shared/ui/styles/ProgressControls.module.css';

// The result notice's report loads only when opened, outside the main chunk (→ARCH-28).
const MatchReport = lazy(() =>
  import('../../../features/match-viewer/ui/MatchReport').then((module) => ({
    default: module.MatchReport,
  })),
);

const PACES: [Pace, string, string][] = [
  ['x1', '1×', sourceMessage('copy.ProgressControls.631e071e41')],
  ['x2', '2×', sourceMessage('copy.ProgressControls.ed4b871fd5')],
  ['x5', '5×', sourceMessage('copy.ProgressControls.ac638f71f3')],
  ['x10', '10×', sourceMessage('copy.ProgressControls.cc7550306a')],
];

/**
 * The league and round stay near the HUD (today is in the HUD) while transport stays below the
 * scrolling view. Home reads them in its season card (→WEB-11), so only other views show it.
 */
export const ProgressOverview = memo(function ProgressOverview({
  compact = false,
}: {
  compact?: boolean;
}) {
  useTextLocale();
  const w = useGameState((state) => state.view!.world);
  const { t } = useLocale();
  const club = w.clubs.find((club) => club.id === w.playerClub)!;
  const round = compact ? ownDivisionRound(w) : undefined;
  return (
    <section
      className={p.overview}
      data-ui="season-overview"
      aria-label={displayMessage('copy.ProgressControls.f7cd8bd5b1')}
      data-testid={compact ? 'mini-clock' : undefined}
    >
      <header className={p.calendarSummary} data-ui="calendar-header">
        <small>{localizeValue(t('shell.division', { division: club.tier + 1 }))}</small>
      </header>
      {localizeValue(
        round && (
          <div
            className={p.round}
            aria-label={displayMessage('copy.ClubHub.9a0f4b3241', {
              p0: round.total,
              p1: round.played,
            })}
          >
            <small>{richMessage('copy.ProgressControls.7c8da9c1c5')}</small>
            <strong data-testid="game-round">{localizeValue(round.played)}</strong>
            <small className={p.roundTotal} data-testid="game-round-total">
              / {localizeValue(round.total)}
            </small>
          </div>
        ),
      )}
    </section>
  );
});

/**
 * Where the manual 다음 이벤트 shows the event it reaches or reopens (→WEB-83). The owner office
 * keeps to its approvals and draws no observation over them (→WEB-39), so the action taken there
 * moves to the clubhouse, beside NEXT MATCH (→WEB-11), before the controller decides what happens;
 * the office's queue or review is remembered as the task left. Every other place stays put.
 */
export function nextEventPlace(page: Page): Page | undefined {
  return page === 'business' ? 'dashboard' : undefined;
}

/** Play starts the shared clock; the dropdown only sets its pace (→WEB-18). */
export const ProgressControls = memo(function ProgressControls({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  useTextLocale();
  const state = useGameState((state) => state);
  const { running, pace, resultNotice } = useProgression(controller, (state) => state);
  const [report, setReport] = useState<string>();
  // When the clock stops itself (e.g. at a match eve) the toggle flips from stop to start; a
  // click landing just after that was aimed at the old label, so it must not start the clock.
  const userStop = useRef(false);
  const wasRunning = useRef(running);
  // Never stopped yet: a play right after the page opens counts (performance.now() starts at 0).
  const autoStoppedAt = useRef(-Infinity);
  useEffect(() => {
    if (wasRunning.current && !running && !userStop.current)
      autoStoppedAt.current = performance.now();
    userStop.current = false;
    wasRunning.current = running;
  }, [running]);
  const w = state.view!.world;
  const mode = settingsOf(w).mode;
  const manual = mode === 'manual';
  const blocked = !!(state.readonly || state.error || w.critical || careerEnded(w));
  const buttons = manual ? (
    <div
      className={p.buttons}
      role="group"
      aria-label={displayMessage('copy.ProgressControls.ada5a7be8d')}
    >
      <button
        data-ui="link"
        className={p.nextEvent}
        disabled={gameActionsBlocked(state) || blocked}
        onClick={() => {
          const place = nextEventPlace(useNavigation.getState().page);
          if (place) openPrimary(place);
          void controller.nextEvent();
        }}
      >
        {richMessage('copy.ProgressControls.dde292aa5d', {
          p0: <PixelIcon name="chevronRight" size={16} />,
        })}
      </button>
    </div>
  ) : (
    <div
      className={p.buttons}
      role="group"
      aria-label={displayMessage('copy.ProgressControls.2e9caf5c97')}
    >
      <button
        data-ui="icon"
        className={`${p.toggle} ${running ? p.pause : ''}`}
        aria-label={localizeValue(
          running
            ? sourceMessage('copy.ProgressControls.c174b33064')
            : sourceMessage('copy.ProgressControls.53fa045696'),
        )}
        disabled={!running && (blocked || gameActionsBlocked(state))}
        onClick={() => {
          if (running) {
            userStop.current = true;
            controller.pause();
          } else if (performance.now() - autoStoppedAt.current >= 500) controller.start();
        }}
      >
        <PixelIcon name={running ? 'pause' : 'play'} size={16} />
      </button>
      <Select
        className={p.pace}
        hintLayout="inline"
        aria-label={displayMessage('copy.ProgressControls.3aa0bc205e')}
        value={pace}
        disabled={blocked || (!running && state.processing)}
        onValueChange={(value) => controller.setPace(value as Pace)}
      >
        {localizeValue(
          PACES.map(([value, label, description]) => (
            <option key={value} value={value} data-hint={description}>
              {localizeValue(label)}
            </option>
          )),
        )}
      </Select>
    </div>
  );
  // Progression stays local to this row; global news lives in the HUD.
  const progress = Math.round((currentDay(w) / Math.max(1, seasonLength(w))) * 1000) / 10;
  const noticed = resultNotice && w.ownMatches.find((m) => m.id === resultNotice.matchId);
  const opened = report !== undefined ? w.ownMatches.find((m) => m.id === report) : undefined;
  const name = (id: string) => w.clubs.find((club) => club.id === id)?.name ?? id;
  return (
    <section
      className={p.controls}
      data-ui="season-transport"
      aria-label={displayMessage('copy.ProgressControls.c5bc079806')}
    >
      <div className={p.modeGroup}>
        <ProgressModeSwitch client={client} controller={controller} />
        <ApprovalButtons />
      </div>
      {localizeValue(
        noticed && (
          <button
            className={p.resultNotice}
            data-testid="result-notice"
            onClick={() => {
              setReport(noticed.id);
              controller.clearResultNotice();
            }}
          >
            {localizeValue(name(noticed.home))} {localizeValue(noticed.score.home)}–
            {localizeValue(noticed.score.away)} {localizeValue(name(noticed.away))}
          </button>
        ),
      )}
      {localizeValue(
        opened && (
          <Dialog
            label={displayMessage('copy.ProgressControls.58e1400d59')}
            onClose={() => setReport(undefined)}
            wide
          >
            <Suspense
              fallback={<p role="status">{richMessage('copy.FixtureNotebook.0998cc7d18')}</p>}
            >
              <MatchReport record={opened} w={w} />
            </Suspense>
          </Dialog>
        ),
      )}
      <i
        className={p.progress}
        role="progressbar"
        aria-label={displayMessage('copy.ProgressControls.f9c5c5dc03')}
        aria-valuenow={currentDay(w)}
        aria-valuemin={0}
        aria-valuemax={seasonLength(w)}
        style={{ width: `${progress}%` }}
      />
      {localizeValue(buttons)}
    </section>
  );
});
