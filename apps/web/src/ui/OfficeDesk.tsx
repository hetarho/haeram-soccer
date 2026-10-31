import { useState, type HTMLAttributes, type ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type { StopReason } from '../../../../packages/engine/src/stopping';
import type { SponsorSlotView } from '../../../../packages/engine/src/sponsors';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { Card } from './Card';
import { FacilityArt } from './FacilityArt';
import type { FacilityScene } from './facilityScene';
import { compactMoney, seasonName } from './format';
import { RESPONSIBILITY_LABELS } from './intervention';
import { Money } from './Money';
import { eventDesk } from './eventRouting';
import { DESK_RESPONSIBILITIES } from './officeDesks';
import { delegationCounts } from './officeSummary';
import { playerOfficeOverview } from './playerOfficeWork';
import { cashState } from './teamState';
import { openApprovalRequest, type BusinessView } from './state';
import s from './OfficeDesk.module.css';

export type DeskStat = { label: string; value: ReactNode; note?: ReactNode };

/**
 * A room of the owner office (→WEB-39), worn like the clubhouse's office scene: its artwork under
 * a light shade with the room's name and waiting count, its ways in on a strip under the art.
 */
export function DeskScene({
  w,
  kind,
  title,
  caption,
  pending,
  actions,
}: {
  w: World;
  kind: FacilityScene;
  title: string;
  caption?: ReactNode;
  pending?: number;
  actions?: ReactNode;
}) {
  return (
    <section
      className={s.scene}
      data-office-part="scene"
      aria-label={`${title} 현황`}
      data-testid="desk-scene"
    >
      <div className={s.view}>
        <FacilityArt kind={kind} world={w} className={s.sceneArt} eager />
        <div className={s.shade} aria-hidden="true" />
        <header className={s.sceneHead}>
          <b>{title}</b>
          {pending !== undefined && (
            <span className={s.waiting}>
              결재 대기{' '}
              {pending > 0 ? <b data-ui="count">{pending > 99 ? '99+' : pending}</b> : '0'}건
            </span>
          )}
          {caption && <span className={s.caption}>{caption}</span>}
        </header>
      </div>
      {actions && <footer className={s.sceneActions}>{actions}</footer>}
    </section>
  );
}

/** A room's live figures as one row of tiles, kept off its artwork. */
export function DeskStats({ label, stats }: { label: string; stats: readonly DeskStat[] }) {
  return (
    <dl className={s.stats} data-count={stats.length} aria-label={label} data-testid="desk-stats">
      {stats.map((stat) => (
        <div key={stat.label} data-ui="stat-tile">
          <dt>{stat.label}</dt>
          <dd>
            <b>{stat.value}</b>
            {stat.note != null && <small>{stat.note}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The responsibility a waiting decision belongs to, as its row's tag. */
function requestTag(item: StopReason) {
  const key = item.responsibilities?.[0] ?? item.responsibility;
  if (key) return RESPONSIBILITY_LABELS[key];
  const desk = eventDesk(item);
  return desk === 'sponsor' ? '후원' : desk === 'investment' ? '재정' : '결재';
}

/**
 * Waiting decisions on the office's ticket, like the next-match report's memo: the first few as
 * rows with their responsibility and a review button, the rest one tap away.
 */
export function ApprovalTray({
  w,
  items,
  limit = 4,
}: {
  w: World;
  items: readonly StopReason[];
  limit?: number;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, limit);
  return (
    <Card
      as="section"
      surface="ticket"
      className={s.tray}
      aria-label="결재 대기 업무"
      meta={`결재함 · 대기 ${items.length}건`}
    >
      {items.length ? (
        <ul className={s.requests}>
          {shown.map((item) => (
            <li key={item.id}>
              <span data-ui="label" className={s.tag}>
                {requestTag(item)}
              </span>
              <span className={s.request}>{item.title}</span>
              <button
                type="button"
                className={s.review}
                aria-label={`${item.title} · 검토하기`}
                onClick={() => openApprovalRequest(w.id, item)}
              >
                검토
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={s.empty}>지금 결재할 업무가 없어요. 새 요청이 오면 여기에 쌓여요.</p>
      )}
      {items.length > limit && (
        <button
          type="button"
          data-ui="link"
          className={s.more}
          aria-expanded={all}
          onClick={() => setAll((open) => !open)}
        >
          {all ? '접기' : `${items.length - limit}건 더 보기`}
        </button>
      )}
    </Card>
  );
}

/** The office rooms' shared column. */
export function DeskBody({
  children,
  ...props
}: { children: ReactNode } & Omit<HTMLAttributes<HTMLDivElement>, 'className'>) {
  return (
    <div {...props} className={s.body}>
      {children}
    </div>
  );
}

/** A desk's approval line and criteria side by side on wide screens, stacked on phones. */
export function DeskSettings({ children }: { children: ReactNode }) {
  return <div className={s.settings}>{children}</div>;
}

const SCENES: Record<BusinessView, FacilityScene> = {
  players: 'locker',
  staff: 'staff',
  investment: 'training',
  sponsor: 'stadium',
  identity: 'locker',
};

/** One desk's scene, then the figures its work turns on, read from the live world only. */
export function OfficeDeskScene({
  w,
  view,
  title,
  sponsors,
  pending,
}: {
  w: World;
  view: Exclude<BusinessView, 'identity'>;
  title: string;
  sponsors: readonly SponsorSlotView[];
  pending: readonly StopReason[];
}) {
  const club = clubOf(w);
  const waiting = pending.filter((item) => eventDesk(item) === view);
  const settings = settingsOf(w);
  const auto = DESK_RESPONSIBILITIES[view].filter(
    (key) => settings.responsibilities[key] === 'delegated',
  ).length;
  const line = DESK_RESPONSIBILITIES[view].length
    ? `자동 처리 ${auto}/${DESK_RESPONSIBILITIES[view].length}`
    : undefined;
  let stats: DeskStat[], caption: ReactNode;
  if (view === 'players') {
    const facts = playerOfficeOverview(w, pending);
    caption = `1군 ${facts.players}명 · 유소년 ${w.academy?.players.length ?? 0}명 · ${line}`;
    stats = [
      {
        label: '1군 연봉 약정',
        value: <Money value={facts.wage} code={club.country} year={w.year} />,
        note: '연간',
      },
      { label: '이번 시즌 만료', value: `${facts.expiring.length}명` },
      { label: '계약 협상', value: `${facts.talks.length}건` },
      {
        label: '영입 / 매각 제안',
        value: `${facts.outgoing.length} / ${facts.incoming.length}건`,
      },
    ];
  } else if (view === 'staff') {
    caption = line;
    stats = [
      {
        label: w.manager.interim ? '임시 감독' : '감독',
        value: w.manager.name,
        note: `${seasonName(w.manager.until - 1)} 시즌까지`,
      },
      { label: '감독 능력', value: w.manager.ability },
      { label: '스태프', value: `${w.staff?.length ?? 0}명` },
    ];
  } else if (view === 'investment') {
    const cash = cashState(w);
    const works = Object.keys(w.facilityWorks ?? {}).length;
    const stadium = STADIUM_STEPS[w.stadium];
    caption = `${stadium.name} · 훈련장 ${w.trainingGround}단계 · 유소년 시설 ${w.academyFacility}단계`;
    stats = [
      { label: '보유 현금', value: compactMoney(w.cash, club.country, w.year) },
      { label: cash.label, value: cash.value, note: cash.status },
      { label: '경기장', value: `${stadium.capacity.toLocaleString('ko-KR')}석` },
      { label: '진행 중인 공사', value: `${works}건` },
    ];
  } else {
    const open = sponsors.filter((slot) => slot.open),
      signed = open.filter((slot) => slot.contract),
      next = sponsors.filter((slot) => !slot.open).sort((a, b) => a.opens - b.opens)[0];
    caption = line;
    stats = [
      { label: '계약한 자리', value: `${signed.length} / ${open.length}` },
      {
        label: '빈 자리',
        value: `${open.length - signed.length}자리`,
        note: open.some((slot) => !slot.contract && slot.offers.length) ? '제안 도착' : undefined,
      },
      {
        label: '다음 열리는 자리',
        value: next?.label ?? '없음',
        note: next ? `${seasonName(next.opens)} 시즌` : undefined,
      },
    ];
  }
  return (
    <>
      <DeskScene
        w={w}
        kind={SCENES[view]}
        title={title}
        caption={caption}
        pending={waiting.length}
      />
      <DeskStats label={`${title} 지표`} stats={stats} />
    </>
  );
}

/** The lobby's scene: the room with the office's waiting count and its two ways in. */
export function LobbyScene({
  w,
  pending,
  actions,
}: {
  w: World;
  pending: readonly StopReason[];
  actions: ReactNode;
}) {
  return (
    <DeskScene
      w={w}
      kind="manager"
      title="구단주 사무실"
      pending={pending.length}
      actions={actions}
    />
  );
}

/** The whole office at a glance: waiting decisions, delegation, money and sponsors. */
export function LobbyStats({
  w,
  sponsors,
  pending,
}: {
  w: World;
  sponsors: readonly SponsorSlotView[];
  pending: readonly StopReason[];
}) {
  const { delegated, total } = delegationCounts(w);
  const cash = cashState(w);
  const open = sponsors.filter((slot) => slot.open);
  return (
    <DeskStats
      label="구단주 사무실 지표"
      stats={[
        { label: '결재 대기', value: `${pending.length}건` },
        { label: '자동 처리', value: `${delegated} / ${total}`, note: '보고·결재 업무' },
        { label: cash.label, value: cash.value, note: cash.status },
        {
          label: '후원',
          value: `${open.filter((slot) => slot.contract).length} / ${open.length}자리`,
        },
      ]}
    />
  );
}
