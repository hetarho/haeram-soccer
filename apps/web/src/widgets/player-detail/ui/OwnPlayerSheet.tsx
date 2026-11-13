import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { PersonCareerLink } from '../../../features/person-career';
import type { GameClient } from '../../../runtime/client';
import type { Tallies } from '../../../runtime/playerTallies';
import { useMemo, useState } from 'react';
import type { Player, World } from '../../../../../../packages/contracts/src/types';
import { agentOf, clausesLabel, talkFor } from '../../../../../../packages/engine/src/contracts';
import { yellowWarning } from '../../../../../../packages/engine/src/discipline';
import { seasonHeat, type HeatMap } from '../../../../../../packages/engine/src/material';
import { HeatPitch } from '../../../entities/match';
import { Attributes } from '../../../entities/player';
import { clubRanks } from '../../../entities/player';
import { Dialog } from '../../../shared/ui/Dialog';
import { number, percent, seasonName } from '../../../presentation/format';
import { PlayerAdvancedStats } from '../../../entities/player';
import { bansOf, banText } from '../../../entities/player';
import { Select } from '../../../shared/ui/Select';
import { appearanceText, ofScope, playerStatus, type PlayerTally } from '../../../entities/player';
import type { PlayerScope } from '../../../entities/player';
import { PlayerPerformance } from '../../../entities/player';
import { PlayerProfile } from '../../../entities/player';
import { ballonDorLine } from '../../../entities/player';
import { openContractTalk } from '../../../shared/routing/state';
import { playerCallLine } from '../../../entities/player';
import a from '../../../shared/ui/styles/Analysis.module.css';
import s from '../../../shared/ui/styles/App.module.css';

/**
 * One of our players, past or present (→WEB-59): his club career first (appearances, goals, assists,
 * saves for a keeper, where he is now and his places on the club's all-time boards), then his
 * production over this season or the club career. A player who left only has the club career.
 */
export function OwnPlayerSheet({
  w,
  player,
  scope: initial,
  onClose,
  client,
  tally,
  tallies,
}: {
  w: World;
  player: Player;
  scope: PlayerScope;
  onClose: () => void;
  client: GameClient;
  /** His appearances, cards and season heat over every own match (the view's tallies). */
  tally?: PlayerTally;
  /** Complete retained counts, needed to compare his appearances with every other own identity. */
  tallies?: Readonly<Tallies['players']>;
}) {
  useTextLocale();
  const active = player.status === 'active';
  // His focus as the assistant sets it, read only (→CLUB-13).
  const training = active ? playerCallLine(w, player) : undefined;
  const [chosen, setChosen] = useState<PlayerScope>(initial);
  const scope = active ? chosen : 'career';
  const career = player.career,
    stats = player[scope],
    ranks = clubRanks(w.players, player.id, tallies);
  const appearances = (scope: PlayerScope) =>
    tally || tallies ? appearanceText(tally, scope) : '—';
  return (
    <Dialog label={player.name} fixed onClose={onClose}>
      {localizeValue(
        active && talkFor(w, player) && (
          <div
            className={s.playerActions}
            aria-label={displayMessage('copy.OwnPlayerSheet.a4436fd312')}
          >
            <button
              type="button"
              onClick={() => {
                onClose();
                openContractTalk(player.id);
              }}
            >
              {richMessage('copy.ClubStaff.5ca939d3e3')}
            </button>
          </div>
        ),
      )}
      <p>
        {richMessage('copy.OwnPlayerSheet.33c518b619', {
          p0: player.position,
          p1: sourceMessage('copy.ClubOverview.9c2b927c8a', { p0: w.year - player.born }),
          p2: ' ',
          p3: agentOf(w, player),
        })}
      </p>
      {localizeValue(
        active && !player.loanUntil && (
          <p>
            {richMessage('copy.OwnPlayerSheet.05902bf5f5', { p0: clausesLabel(player.clauses) })}
          </p>
        ),
      )}
      {localizeValue(
        training && (
          <p data-testid="player-training">
            {richMessage('copy.OwnPlayerSheet.8c97198d63', {
              p0: training.focus,
              p1: training.by,
              p2: training.reason,
            })}
          </p>
        ),
      )}
      {localizeValue(
        ballonDorLine(w.history, player.id) && (
          <p data-testid="ballon-dor-honours">
            {localizeValue(ballonDorLine(w.history, player.id))}
          </p>
        ),
      )}
      <PlayerProfile w={w} player={player} own={active} />
      <PersonCareerLink id={player.id} name={player.name} client={client} />
      <section
        data-surface="sheet"
        className={a.clubCareer}
        aria-label={displayMessage('copy.AnalysisExport.05b05e1b81')}
      >
        <h3>{richMessage('copy.AnalysisExport.05b05e1b81')}</h3>
        <p className={a.careerLine}>
          {richMessage('copy.OwnPlayerSheet.de486b2191', {
            p0: appearances('career'),
            p1: career[0],
            p2: career[1],
            p3:
              player.position === 'GK'
                ? sourceMessage('copy.OwnPlayerSheet.a4cbe1f80c', { p0: career[9] })
                : '',
          })}
        </p>
        {!tallies && <p className={a.note}>{richMessage('copy.fullStatsView.bacdff45b0')}</p>}
        <div className={a.chips}>
          <span className={a.status} data-status={player.status}>
            {localizeValue(playerStatus(player))}
          </span>
          {localizeValue(
            ranks.map(({ board, rank, shared }) => (
              <span key={board.key}>
                {richMessage('copy.OwnPlayerSheet.74aa1eed75', {
                  p0: board.short,
                  p1: shared ? sourceMessage('copy.OwnPlayerSheet.44c4823a61') : '',
                  p2: rank,
                })}
              </span>
            )),
          )}
        </div>
        <p className={a.note}>
          {richMessage('copy.OwnPlayerSheet.696342ccdb', {
            p0: ranks.length || !tallies ? '' : sourceMessage('copy.OwnPlayerSheet.a71a8e4900'),
          })}
        </p>
      </section>
      {localizeValue(
        active && (
          <div
            data-ui="choices"
            className={s.segments}
            role="group"
            aria-label={displayMessage('copy.OwnPlayerSheet.a91b84b5e0')}
          >
            {localizeValue(
              (
                [
                  ['season', sourceMessage('copy.ClubHub.ece63ccd56')],
                  ['career', sourceMessage('copy.OwnPlayerSheet.887b5e8bc3')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={scope === id}
                  className={scope === id ? s.selected : undefined}
                  onClick={() => setChosen(id)}
                >
                  {localizeValue(label)}
                </button>
              )),
            )}
          </div>
        ),
      )}
      <PlayerPerformance player={player} scope={scope} />
      <Attributes
        rows={[
          [sourceMessage('copy.BallonDorView.b849877c07'), appearances(scope)],
          [sourceMessage('copy.summary.eb4e291be3'), stats[0]],
          [sourceMessage('copy.BallonDorView.8d901cc28d'), stats[1]],
          [sourceMessage('copy.OwnPlayerSheet.05721df8c3'), stats[10]],
          [sourceMessage('copy.summary.5101559c4e'), percent(stats[3], stats[2])],
          [sourceMessage('copy.summary.da1cc31972'), stats[4]],
          [sourceMessage('copy.summary.2d9b22c49c'), stats[5]],
          [sourceMessage('copy.Pitch.3f6ba38a9e'), stats[6]],
          [sourceMessage('copy.Pitch.818d05f8ab'), stats[7]],
          [sourceMessage('copy.OwnPlayerSheet.f16160e08a'), stats[8]],
          [sourceMessage('copy.RecordsRoom.2a022bd612'), stats[9]],
        ]}
      />
      <p>
        {richMessage('copy.OwnPlayerSheet.2bd88855fc', {
          p0: number(stats[2]),
          p1: ' ',
          p2:
            scope === 'career'
              ? sourceMessage('copy.AnalysisExport.05b05e1b81')
              : sourceMessage('copy.AnalysisExport.2686dd9f2b'),
        })}
      </p>
      <PlayerAdvancedStats w={w} player={player} scope={scope} />
      <Discipline w={w} player={player} tally={tally} />
      <SeasonHeat w={w} player={player} tally={tally} />
      <button onClick={onClose}>{richMessage('copy.EventCenter.1e8c10206f')}</button>
    </Dialog>
  );
}

/** Cards this season and over the club career, and the bans still to serve (→WEB-59, HIST-16). */
function Discipline({ w, player, tally }: { w: World; player: Player; tally?: PlayerTally }) {
  useTextLocale();
  const active = player.status === 'active';
  const cards = (scope: PlayerScope) =>
    sourceMessage('copy.OwnPlayerSheet.2c8d01f562', {
      p0: ofScope(tally?.yellow, scope),
      p1: ofScope(tally?.red, scope),
    });
  const bans = active ? bansOf(w, player.id) : [];
  return (
    <section
      data-surface="sheet"
      className={a.clubCareer}
      aria-label={displayMessage('copy.ScorerPanels.5b16495c71')}
      data-testid="player-discipline"
    >
      <h3>{richMessage('copy.ScorerPanels.5b16495c71')}</h3>
      <p className={a.careerLine}>
        {richMessage('copy.OwnPlayerSheet.2a1c5637e9', {
          p0: active && sourceMessage('copy.OwnPlayerSheet.43f32b64e7', { p0: cards('season') }),
          p1: cards('career'),
        })}
      </p>
      {localizeValue(
        active && (
          <div className={a.chips}>
            {localizeValue(
              bans.length
                ? bans.map((ban, i) => <span key={i}>{localizeValue(banText(ban))}</span>)
                : sourceMessage('copy.OwnPlayerSheet.3c57f1eb14'),
            )}
            {localizeValue(
              yellowWarning(w, player) && <span>{richMessage('copy.Rich.51b23b5112')}</span>,
            )}
          </div>
        ),
      )}
    </section>
  );
}
/** This season's heat map from its matches, earlier seasons' from the archive (→MATCH-5). */
function SeasonHeat({ w, player, tally }: { w: World; player: Player; tally?: PlayerTally }) {
  useTextLocale();
  const seasons = useMemo(
    () => [
      ...(tally?.heat
        ? [
            {
              year: w.year,
              map: { cells: tally.heat, touches: tally.heat.reduce((a, b) => a + b, 0) },
            },
          ]
        : []),
      ...w.history
        .map((archive) => ({ year: archive.year, map: seasonHeat(archive, player.id) }))
        .filter((season): season is { year: number; map: HeatMap } => !!season.map)
        .reverse(),
    ],
    [tally?.heat, w.year, w.history, player.id],
  );
  const [year, setYear] = useState(seasons[0]?.year);
  const shown = seasons.find((season) => season.year === year) ?? seasons[0];
  return (
    <section
      data-surface="sheet"
      className={a.clubCareer}
      aria-label={displayMessage('copy.OwnPlayerSheet.e74c8b29cf')}
      data-testid="player-heat"
    >
      <h3>{richMessage('copy.OwnPlayerSheet.e74c8b29cf')}</h3>
      {localizeValue(
        shown ? (
          <>
            {localizeValue(
              seasons.length > 1 && (
                <label>
                  {richMessage('copy.LeagueInsights.c73072b6a4', {
                    p0: ' ',
                    p1: (
                      <Select
                        aria-label={displayMessage('copy.OwnPlayerSheet.ddfad4d645')}
                        value={shown.year}
                        onValueChange={(value) => setYear(Number(value))}
                      >
                        {localizeValue(
                          seasons.map((season) => (
                            <option key={season.year} value={season.year}>
                              {localizeValue(seasonName(season.year))}
                            </option>
                          )),
                        )}
                      </Select>
                    ),
                  })}
                </label>
              ),
            )}
            {/* His attack frame, toward the goal on the right (→WEB-99). */}
            <HeatPitch
              map={shown.map}
              label={displayMessage('copy.OwnPlayerSheet.345cb4c0b5', { p0: shown.map.touches })}
            />
            <p className={a.note}>
              {richMessage('copy.OwnPlayerSheet.ec92b57fca', { p0: seasonName(shown.year) })}
            </p>
          </>
        ) : (
          <p className={a.note}>{richMessage('copy.OwnPlayerSheet.e1fdde39bb')}</p>
        ),
      )}
    </section>
  );
}
