import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { Ban, Player, World } from '../../../../packages/contracts/src/types';
import {
  activePlayers,
  clubOf,
  formationOf,
  ownMultiplier,
  slotOvr,
  injuryDaysLeft,
  isInjured,
} from '../../../../packages/engine/src/player-state';
import { startingSquad } from '../../../../packages/engine/src/world';
import { tacticLabel } from '../../../../packages/engine/src/tactics';
import { lineupSummary } from '../../../../packages/engine/src/strategy';
import { nextOwnFixture } from '../../../../packages/engine/src/calendar';
import { isUnavailable } from '../../../../packages/engine/src/discipline';
import {
  benchFor,
  eraRules,
  takersFor,
  type EraRules,
} from '../../../../packages/engine/src/grid/setup';
import { FORMATIONS, ROLE_LABEL } from '../../../../packages/engine/src/player';
import { FormationPitch, LEVEL_LABEL } from './FormationPitch';
import type { GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { Card } from './Card';
import { Dialog } from './Dialog';
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
  if (!era.named) return '교체 없음 (1965년 이전)';
  if (era.injuryOnly) return `부상 교체 ${era.maxSubs}명`;
  return `교체 명단 ${era.named}명 · 최대 ${era.maxSubs}명 교체${era.windows ? ` (${era.windows}회)` : ''}`;
}
/** Where a ban counts: the league, a named domestic cup, every domestic competition or Europe. */
function banScope(w: World, scope: Ban['scope']) {
  if (scope === 'league') return '리그';
  if (scope === 'domestic') return '국내 대회';
  if (scope === 'europe') return '유럽 대회';
  return (
    w.cups?.find((cup) => cup.fixtures.some((f) => `cup:${f.groupKey}` === scope))?.name ||
    '컵 대회'
  );
}

/**
 * The manager's XI for the next fixture in his formation, read-only (→CLUB-10): each slot with
 * its position and role, the player's level there, adaptation and 실효 OVR, and the side's
 * strength and fatigue.
 */
function ManagerLineup({ w, xi }: { w: World; xi: Player[] }) {
  const slots = formationOf(w.tactic);
  const summary = lineupSummary(xi, w.tactic);
  const values: { key: keyof typeof summary; label: string }[] = [
    { key: 'strength', label: '선발 전력' },
    { key: 'fatigue', label: '평균 피로' },
    { key: 'attack', label: '공격수 마무리' },
    { key: 'keeper', label: 'GK 선방 능력' },
  ];
  return (
    <section data-surface="panel" className={s.section} aria-label="감독의 선발">
      <div className={s.sectionHead}>
        <h3>감독의 선발</h3>
        <span>
          {FORMATIONS[w.tactic].name} · {tacticLabel[w.tactic]}
        </span>
      </div>
      <div className={s.preview} aria-label="선발 전력과 피로">
        {values.map(({ key, label }) => (
          <div key={key}>
            <span>{label}</span>
            <strong>{summary[key]}</strong>
          </div>
        ))}
      </div>
      <FormationPitch
        tactic={w.tactic}
        label={`${FORMATIONS[w.tactic].name} 선발 배치`}
        slotLabel={(index) => xi[index]?.name.split(' ').at(-1) ?? '—'}
        slotTitle={(index) => xi[index]?.name ?? '빈 자리'}
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
                {place.position} · {ROLE_LABEL[place.role]}
              </small>
              <b>{player ? player.name.split(' ').at(-1) : '—'}</b>
              {player && (
                <>
                  <span>
                    실효 {Math.round(slotOvr(player, place, ownMultiplier(player)))} ·{' '}
                    {level ? LEVEL_LABEL[level] : '미숙'}
                  </span>
                  <span>적응 {player.adaptation.toFixed(2)}</span>
                </>
              )}
            </div>
          );
        }}
      />
      <p className={s.hint}>
        감독이 자리마다 실효 능력과 피로를 비교해 선발과 전술을 정해요. 부상이나 징계로 빠진 선수는
        고르지 않아요.
      </p>
    </section>
  );
}

/**
 * What the manager names around the XI for the next fixture, read-only (→CLUB-6, MATCH-20): the
 * substitutes, the set-piece takers as the match picks them, and who is out and why.
 */
function MatchdaySquad({ w, xi }: { w: World; xi: Player[] }) {
  const next = nextOwnFixture(w);
  const era = eraRules(w.year);
  const bench = next
    ? benchFor(w, clubOf(w), xi, era, (p) => isUnavailable(w, p, w.playerClub, next))
    : benchFor(w, clubOf(w), xi, era);
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
          ...(days > 0 ? [`부상 ${days}일`] : []),
          ...own.map((ban) => `출장 정지 ${ban.matches}경기 (${banScope(w, ban.scope)})`),
        ],
      },
    ];
  });
  return (
    <section data-surface="sheet" className={s.matchday} aria-label="감독이 정한 경기 명단">
      <h4>감독이 정한 경기 명단</h4>
      <p className={s.hint}>{eraRuleLine(era)}</p>
      <dl>
        <div>
          <dt>교체 명단</dt>
          <dd>
            {bench.length
              ? bench.map((player) => `${player.name} (${player.position})`).join(' · ')
              : '없음'}
          </dd>
        </div>
        {(
          [
            ['penalty', '페널티킥'],
            ['directFreeKick', '직접 프리킥'],
            ['corner', '코너킥'],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{takers ? xi[takers[key]]!.name : '—'}</dd>
          </div>
        ))}
        <div>
          <dt>출전 불가</dt>
          <dd>
            {out.length ? (
              <ul>
                {out.map(({ player, reasons }) => (
                  <li key={player.id}>
                    {player.name} · {player.position} · {reasons.join(' · ')}
                  </li>
                ))}
              </ul>
            ) : (
              '없음'
            )}
          </dd>
        </div>
      </dl>
      <p className={s.hint}>
        교체 명단과 키커는 감독이 선발에 맞춰 정해요. 부상이나 징계로 빠진 선수는 명단에 오르지
        않아요.
      </p>
    </section>
  );
}

/**
 * The next-match detailed report (→WEB-11, WEB-88): the manager's report, his XI and matchday
 * squad, read-only, and the kit section, the report's only owner choice. The manager picks the
 * tactic and the lineup (→CLUB-6, STAFF-22).
 */
export const StrategyPanel = memo(function StrategyPanel({ w, client, onClose }: Props) {
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
      {open && (
        <Dialog
          label="다음 경기 상세 리포트"
          onClose={close}
          wide
          actions={
            <div className={s.actions}>
              <button data-ui="primary" className={s.primary} onClick={close}>
                확인하고 홈으로
              </button>
            </div>
          }
        >
          <MatchBriefing w={w} xi={xi} />
          <ManagerLineup w={w} xi={xi} />
          <MatchdaySquad w={w} xi={xi} />
          {/* The kit is its own section and command, apart from the manager's calls (→KIT-6). */}
          <Card as="section" className={s.kit} aria-label="유니폼" title="유니폼">
            {settling ? (
              <p className={s.hint} role="status">
                진행 중인 처리를 마치고 다음 경기 유니폼을 불러오는 중…
              </p>
            ) : (
              <FixtureKitSelector client={client} blocked={blocked} />
            )}
          </Card>
        </Dialog>
      )}
    </>
  );
});
