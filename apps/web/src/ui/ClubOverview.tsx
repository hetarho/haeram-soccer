import type { ReactNode } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import { activePlayers, clubOf, overall } from '../../../../packages/engine/src/player-state';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { stadiumCapacity } from '../../../../packages/engine/src/facilities';
import { localSupporters } from '../../../../packages/engine/src/fans';
import { MANAGER_GONE, STAFF_ROLES, staffMember } from '../../../../packages/engine/src/staff-info';
import { Card } from './Card';
import { ClubCrest } from './ClubCrest';
import { Money } from './Money';
import { clubDivision, orderIds, ownLeagueIds } from './league';
import { number, seasonName } from './format';
import { squadRegistration } from './squadRegistration';
import { cashState, squadAvailability, teamStates, type StateKey } from './teamState';
import s from './ClubOverview.module.css';

function Facts({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  return (
    <dl className={s.facts}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Live club facts, using the same ratings, availability and costs as the working pages. */
export function ClubOverview({ w }: { w: World }) {
  const club = clubOf(w);
  const squad = activePlayers(w);
  const youth = (w.academy?.players ?? []).filter((player) => player.status === 'active');
  const availability = squadAvailability(w);
  const registered = squadRegistration(w);
  const states = teamStates(w);
  const state = (key: StateKey) => states.find((item) => item.key === key)!;
  const strength = state('strength');
  const fatigue = state('fatigue');
  const morale = state('morale');
  const manager = state('manager');
  const finance = cashState(w);
  const costs = operatingCosts(w);
  const net = BigInt(w.income) - BigInt(w.expense);
  const league = orderIds(ownLeagueIds(w), w.tables);
  const table = w.tables[club.id];
  const average = (value: (player: (typeof squad)[number]) => number) =>
    squad.length ? (squad.reduce((sum, player) => sum + value(player), 0) / squad.length).toFixed(1) : '—';
  const staffed = STAFF_ROLES.filter((post) => staffMember(w, post)).length;
  const money = (value: string | bigint) => <Money value={value} code={club.country} year={w.year} />;
  const condition = (item: ReturnType<typeof teamStates>[number]) => (
    <span data-tone={item.tone}>{item.value} <small>· {item.status}</small></span>
  );
  return (
    <section className={s.overview} aria-label="우리 팀 오버뷰">
      <header className={s.heading}>
        <div className={s.identity}>
          <ClubCrest w={w} id={club.id} size={40} />
          <div>
            <h2>{club.name}</h2>
            <p>{seasonName(w.year)} 시즌 · {clubDivision(w, club)}</p>
          </div>
        </div>
        <span className={s.league}>
          {table?.played
            ? `리그 ${league.indexOf(club.id) + 1}위 · 승점 ${table.points} · ${table.played}경기`
            : '리그 개막 전'}
        </span>
      </header>

      <div className={s.metrics}>
        <Card title="팀 OVR" className={s.metric}>
          <strong className={s.value}>{strength.value}</strong>
          <p className={s.note}>{strength.status.replace('리그 ', '리그 전력 ')}</p>
        </Card>
        <Card title="1군 선수" className={s.metric}>
          <strong className={s.value}>{squad.length}<small>명</small></strong>
          <p className={s.note}>유소년 {youth.length}명 별도</p>
        </Card>
        <Card title="출전 가능" className={s.metric}>
          <strong className={s.value}>{availability.available}<small> / {availability.total}명</small></strong>
          <p className={s.note}>부상 {availability.injured} · 출장 정지 {availability.suspended}</p>
        </Card>
        <Card title="보유 자금" className={s.metric}>
          <strong className={`${s.value} ${s.money}`} data-negative={BigInt(w.cash) < 0n || undefined}>
            {money(w.cash)}
          </strong>
          <p className={s.note} data-tone={finance.tone}>자금 여력 {finance.value} · {finance.status}</p>
        </Card>
      </div>

      <div className={s.cards}>
        <Card surface="sheet" title="선수단 구성" meta="SQUAD">
          <Facts rows={[
            ['1군 / 유소년', `${squad.length}명 / ${youth.length}명`],
            ['선수 평균 OVR', average(overall)],
            ['선수 평균 나이', squad.length ? `${average((player) => w.year - player.born)}세` : '—'],
            ['임대 합류', `${squad.filter((player) => player.loanUntil !== undefined).length}명`],
            ['리그 등록', registered.value],
          ]} />
          <p className={s.note}>{registered.detail}</p>
        </Card>
        <Card surface="sheet" title="선수단 컨디션" meta="CONDITION">
          <Facts rows={[
            ['선발 평균 피로', condition(fatigue)],
            ['팀 분위기', condition(morale)],
            ['부상 / 출장 정지', `${availability.injured}명 / ${availability.suspended}명`],
            ['불만 선수', `${squad.filter((player) => player.unhappy).length}명`],
            ['감독 입지', condition(manager)],
          ]} />
          <p className={s.note}>출장 정지는 모든 대회의 잔여 징계를 포함합니다.</p>
        </Card>
        <Card surface="sheet" title="구단 재정" meta="FINANCE">
          <Facts rows={[
            ['시즌 누적 수입', money(w.income)],
            ['시즌 누적 지출', money(w.expense)],
            ['시즌 수지', <span data-negative={net < 0n || undefined}>{money(net)}</span>],
            ['다음 라운드 고정 지출', money(costs.nextRound)],
            ['연간 고정비', money(costs.annual)],
          ]} />
          <p className={s.note}>자금 여력은 현재 잔고와 고정비 기준이며, 미래 수입은 포함하지 않습니다.</p>
        </Card>
        <Card surface="sheet" title="스태프 · 구단 기반" meta="CLUB">
          <Facts rows={[
            ['감독', w.manager.name === MANAGER_GONE ? '공석' : `${w.manager.name}${w.manager.interim ? ' · 대행' : ''}`],
            ['단장', staffMember(w, 'director')?.name ?? '공석'],
            ['스태프 재직', `${staffed} / ${STAFF_ROLES.length}명`],
            ['경기장 수용 인원', `${number(stadiumCapacity(w))}석`],
            ['지역 서포터', `${number(localSupporters(w))}명`],
            ['구단 평판', number(club.reputation)],
          ]} />
          <p className={s.note}>스태프 인원은 감독을 제외한 직무 기준입니다.</p>
        </Card>
      </div>
    </section>
  );
}
