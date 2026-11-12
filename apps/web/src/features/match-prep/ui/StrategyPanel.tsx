import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { Ban, Player, World } from '../../../../../../packages/contracts/src/types';
import {
  activePlayers,
  clubOf,
  formationOf,
  ownMultiplier,
  slotOvr,
  injuryDaysLeft,
  isInjured,
} from '../../../../../../packages/engine/src/player-state';
import { startingSquad } from '../../../../../../packages/engine/src/world';
import { tacticLabel } from '../../../../../../packages/engine/src/tactics';
import { lineupSummary } from '../../../../../../packages/engine/src/strategy';
import { nextOwnFixture } from '../../../../../../packages/engine/src/calendar';
import { isUnavailable } from '../../../../../../packages/engine/src/discipline';
import { ownBench, takersFor } from '../../../../../../packages/engine/src/match/bench';
import { eraRules, type EraRules } from '../../../../../../packages/engine/src/match/rules';
import { FORMATIONS, ROLE_LABEL } from '../../../../../../packages/engine/src/player';
import { FormationPitch, LEVEL_LABEL } from '../../../entities/player';
import type { GameClient } from '../../../runtime/client';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import { Card } from '../../../shared/ui/Card';
import { Dialog } from '../../../shared/ui/Dialog';
import { FixtureKitSelector } from './FixtureKitSelector';
import { MatchBriefing } from './MatchBriefing';
import s from './StrategyPanel.module.css';

type Props = {
  w: World;
  client: GameClient;
  onClose?: () => void;
};

/** The era's substitute rule in one line (→MATCH-20). */
function eraRuleLine(era: EraRules) {
  if (!era.named) return sourceMessage('copy.StrategyPanel.626d4d1b43');
  if (era.injuryOnly) return sourceMessage('copy.StrategyPanel.281a184e7e', { p0: era.maxSubs });
  return sourceMessage('copy.StrategyPanel.a041ada37e', {
    p0: era.named,
    p1: era.maxSubs,
    p2: era.windows ? sourceMessage('copy.StrategyPanel.8e012f761c', { p0: era.windows }) : '',
  });
}
/** Where a ban counts: the league, a named domestic cup, every domestic competition or Europe. */
function banScope(w: World, scope: Ban['scope']) {
  if (scope === 'league') return sourceMessage('navigation.league');
  if (scope === 'domestic') return sourceMessage('copy.StrategyPanel.d9e6be2780');
  if (scope === 'europe') return sourceMessage('copy.StrategyPanel.69f2bed53a');
  return (
    w.cups?.find((cup) => cup.fixtures.some((f) => `cup:${f.groupKey}` === scope))?.name ||
    sourceMessage('copy.ClubTrends.cf5a6ab3e0')
  );
}

/**
 * The manager's XI for the next fixture in his formation, read-only (→CLUB-10): each slot with
 * its position and role, the player's level there, adaptation and 실효 OVR, and the side's
 * strength and fatigue.
 */
function ManagerLineup({ w, xi }: { w: World; xi: Player[] }) {
  useTextLocale();
  const slots = formationOf(w.tactic);
  const summary = lineupSummary(xi, w.tactic);
  const values: { key: keyof typeof summary; label: string }[] = [
    { key: 'strength', label: sourceMessage('copy.StrategyPanel.a814616f8e') },
    { key: 'fatigue', label: sourceMessage('copy.StrategyPanel.14314f9cd8') },
    { key: 'attack', label: sourceMessage('copy.StrategyPanel.d26b1d5457') },
    { key: 'keeper', label: sourceMessage('copy.StrategyPanel.0289aa796e') },
  ];
  return (
    <section
      data-surface="panel"
      className={s.section}
      aria-label={displayMessage('copy.StrategyPanel.36f69f83b2')}
    >
      <div className={s.sectionHead}>
        <h3>{richMessage('copy.StrategyPanel.36f69f83b2')}</h3>
        <span>
          {FORMATIONS[w.tactic].name} · {localizeValue(tacticLabel[w.tactic])}
        </span>
      </div>
      <div className={s.preview} aria-label={displayMessage('copy.StrategyPanel.5d312f4a91')}>
        {localizeValue(
          values.map(({ key, label }) => (
            <div key={key}>
              <span>{localizeValue(label)}</span>
              <strong>{localizeValue(summary[key])}</strong>
            </div>
          )),
        )}
      </div>
      <FormationPitch
        tactic={w.tactic}
        label={displayMessage('copy.StrategyPanel.a3903b46c3', { p0: FORMATIONS[w.tactic].name })}
        slotLabel={(index) => xi[index]?.name.split(' ').at(-1) ?? '—'}
        slotTitle={(index) => xi[index]?.name ?? sourceMessage('copy.ClubOperations.0ba335204c')}
        slot={(index) => {
          const place = slots[index]!,
            player = xi[index];
          const level = player?.positions[place.position];
          return (
            <div
              className={s.slotCard}
              data-surface="inset"
              data-testid={`formation-slot-${index}`}
              data-level={level ?? 0}
            >
              <small>
                {localizeValue(place.position)} · {localizeValue(ROLE_LABEL[place.role])}
              </small>
              <b>{localizeValue(player ? player.name.split(' ').at(-1) : '—')}</b>
              {localizeValue(
                player && (
                  <>
                    <span>
                      {richMessage('copy.StrategyPanel.3f4c917b7b', {
                        p0: Math.round(slotOvr(player, place, ownMultiplier(player))),
                        p1: ' ',
                        p2: level
                          ? LEVEL_LABEL[level]
                          : sourceMessage('copy.StrategyPanel.101801be09'),
                      })}
                    </span>
                    <span>
                      {richMessage('copy.StrategyPanel.e570acfafc', {
                        p0: player.adaptation.toFixed(2),
                      })}
                    </span>
                  </>
                ),
              )}
            </div>
          );
        }}
      />
      <p className={s.hint}>{richMessage('copy.StrategyPanel.6c08447c4a')}</p>
    </section>
  );
}

/**
 * What the manager names around the XI for the next fixture, read-only (→CLUB-6, MATCH-20): the
 * substitutes, the set-piece takers as the match picks them, and who is out and why.
 */
function MatchdaySquad({ w, xi }: { w: World; xi: Player[] }) {
  useTextLocale();
  const next = nextOwnFixture(w);
  const era = eraRules(w.year);
  const bench = next
    ? ownBench(w, xi, era, (p) => isUnavailable(w, p, w.playerClub, next))
    : ownBench(w, xi, era);
  const takers = xi.length ? takersFor(xi) : undefined;
  const bans = w.discipline?.bans ?? [];
  const out = activePlayers(w).flatMap((player) => {
    const own = bans.filter((ban) => ban.player === player.id);
    const unavailable = next
      ? isUnavailable(w, player, w.playerClub, next)
      : isInjured(w, player) || own.length > 0;
    if (!unavailable) return [];
    const days = injuryDaysLeft(w, player);
    return [
      {
        player,
        reasons: [
          ...(days > 0 ? [sourceMessage('copy.StrategyPanel.c57cdfb98a', { p0: days })] : []),
          ...own.map((ban) =>
            sourceMessage('copy.StrategyPanel.cc3521e24b', {
              p0: ban.matches,
              p1: banScope(w, ban.scope),
            }),
          ),
        ],
      },
    ];
  });
  return (
    <section
      data-surface="sheet"
      className={s.matchday}
      aria-label={displayMessage('copy.StrategyPanel.fceb0546e2')}
    >
      <h4>{richMessage('copy.StrategyPanel.fceb0546e2')}</h4>
      <p className={s.hint}>{localizeValue(eraRuleLine(era))}</p>
      <dl>
        <div>
          <dt>{richMessage('copy.StrategyPanel.b3bb9702d7')}</dt>
          <dd>
            {localizeValue(
              bench.length
                ? bench.map((player) => `${player.name} (${player.position})`).join(' · ')
                : sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
            )}
          </dd>
        </div>
        {localizeValue(
          (
            [
              ['penalty', sourceMessage('copy.StrategyPanel.3d0a2ba63c')],
              ['directFreeKick', sourceMessage('copy.StrategyPanel.44e7ad6ce3')],
              ['corner', sourceMessage('copy.summary.64f1e3a4bc')],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <dt>{localizeValue(label)}</dt>
              <dd>{localizeValue(takers ? xi[takers[key]]!.name : '—')}</dd>
            </div>
          )),
        )}
        <div>
          <dt>{richMessage('copy.StrategyPanel.1ee90f04c7')}</dt>
          <dd>
            {localizeValue(
              out.length ? (
                <ul>
                  {localizeValue(
                    out.map(({ player, reasons }) => (
                      <li key={player.id}>
                        {player.name} · {localizeValue(player.position)} ·{' '}
                        {localizeValue(reasons.join(' · '))}
                      </li>
                    )),
                  )}
                </ul>
              ) : (
                sourceMessage('copy.BusinessWorkbench.72ea3d64ac')
              ),
            )}
          </dd>
        </div>
      </dl>
      <p className={s.hint}>{richMessage('copy.StrategyPanel.2e274c2052')}</p>
    </section>
  );
}

/**
 * The next-match detailed report (→WEB-11, WEB-88): the manager's report, his XI and matchday
 * squad, read-only, and the kit section, the report's only owner choice. The manager picks the
 * tactic and the lineup (→CLUB-6, STAFF-22).
 */
export const StrategyPanel = memo(function StrategyPanel({ w, client, onClose }: Props) {
  useTextLocale();
  const acting = useGameState(gameActionsBlocked);
  const [open, setOpen] = useState(false);
  // The kit section mounts once queued work has settled, on the fixture that is next then.
  const [settling, setSettling] = useState(false);
  const blocked = settling || acting || !!w.critical;
  const opening = useRef(false);
  const onDismiss = useRef(onClose);
  onDismiss.current = onClose;
  useEffect(
    () => () => {
      opening.current = false;
    },
    [],
  );
  const close = useCallback(() => {
    opening.current = false;
    setOpen(false);
    onDismiss.current?.();
  }, []);
  useEffect(() => {
    opening.current = true;
    setSettling(true);
    setOpen(true);
    void client.whenIdle().then(() => {
      if (opening.current) setSettling(false);
    });
  }, [client]);
  // The XI the manager fields for the next fixture: nobody injured or banned for it (→CLUB-6).
  const xi = startingSquad(w, clubOf(w), nextOwnFixture(w));
  return (
    <>
      {localizeValue(
        open && (
          <Dialog
            label={displayMessage('copy.catalog.50b403ba8e')}
            onClose={close}
            wide
            actions={
              <div className={s.actions}>
                <button data-ui="primary" className={s.primary} onClick={close}>
                  {richMessage('copy.StrategyPanel.ee132d1354')}
                </button>
              </div>
            }
          >
            <MatchBriefing w={w} xi={xi} />
            <ManagerLineup w={w} xi={xi} />
            <MatchdaySquad w={w} xi={xi} />
            {/* The kit is its own section and command, apart from the manager's calls (→KIT-6). */}
            <Card
              as="section"
              className={s.kit}
              aria-label={displayMessage('copy.StrategyPanel.77c8c91fbf')}
              title={displayMessage('copy.StrategyPanel.77c8c91fbf')}
            >
              {localizeValue(
                settling ? (
                  <p className={s.hint} role="status">
                    {richMessage('copy.StrategyPanel.333663c6f9')}
                  </p>
                ) : (
                  <FixtureKitSelector client={client} blocked={blocked} />
                ),
              )}
            </Card>
          </Dialog>
        ),
      )}
    </>
  );
});
