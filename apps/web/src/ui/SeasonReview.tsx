import { useState } from 'react';
import { ClubCrest } from './ClubCrest';
import type { World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { transferWindow, WINDOW_INFO } from '../../../../packages/engine/src/transfers';
import { clubOf } from '../../../../packages/engine/src/world';
import type { GameClient } from '../runtime/client';
import { money, number, seasonName } from './format';
import { TransferCeremony } from './TransferCeremony';
import s from './SeasonReview.module.css';

function divisionName(w: World, tier: number) {
  return tier >= country(clubOf(w).country).groups.length ? '하부 구간' : `${tier + 1}부`;
}
const signed = (value: number) => (value > 0 ? `+${number(value)}` : number(value));

/**
 * The closed season at a glance: where the club finished, what it earned and spent, what the
 * next season looks like, and the way into the transfer window that opens with it.
 */
export function SeasonReview({
  w,
  candidates,
  client,
  onMarket,
  onHome,
}: {
  w: World;
  candidates: number;
  client: GameClient;
  onMarket: () => void;
  onHome: () => void;
}) {
  const [ceremony, setCeremony] = useState(false);
  const season = w.history.at(-1);
  if (!season)
    return (
      <section className={s.empty} data-testid="season-review">
        <h2>아직 마친 시즌이 없어요</h2>
        <p>첫 시즌의 마지막 경기가 끝나면 이곳에서 한 시즌을 돌아봐요.</p>
        <button className={s.primary} onClick={onHome}>
          홈으로
        </button>
      </section>
    );
  const club = clubOf(w),
    previous = w.history.at(-2),
    // Amounts were recorded in the closed season's currency.
    format = (value: string) => money(value, club.country, season.year),
    clubs = w.rankHistory?.filter((snapshot) => snapshot.year === season.year).at(-1)?.rows.length,
    move = club.tier < season.tier ? 'up' : club.tier > season.tier ? 'down' : 'stay',
    from = divisionName(w, season.tier),
    to = divisionName(w, club.tier),
    net = BigInt(season.income) - BigInt(season.expense),
    income = BigInt(season.income),
    expense = BigInt(season.expense),
    widest = income > expense ? income : expense,
    width = (value: bigint) => `${widest > 0n ? Number((value * 1000n) / widest) / 10 : 0}%`,
    prize = w.events.find((e) => e.year === season.year && e.kind === 'season-prize')?.amount,
    window = transferWindow(w),
    windowInfo = WINDOW_INFO[window.kind || 'summer'];
  const ribbon =
    move === 'up'
      ? { text: `승격! ${from} → ${to}`, tone: s.up }
      : move === 'down'
        ? { text: `강등 · ${from} → ${to}`, tone: s.down }
        : { text: `잔류 · ${from}`, tone: s.stay };
  const openWindowItems = async () => {
    for (const item of (w.inbox || []).filter((i) => i.kind === 'window-open' && !i.read))
      await client.command({ type: 'read-inbox', id: item.id });
  };
  return (
    <div className={s.review} data-testid="season-review">
      <section className={s.hero}>
        <small className={s.kicker}>SEASON {seasonName(season.year)} · FINAL WHISTLE</small>
        <h2>
          <ClubCrest w={w} id={club.id} size={30} />
          {club.name}
        </h2>
        <div className={s.rank} aria-label={`최종 순위 ${season.rank}위`}>
          <b>{season.rank}</b>
          <span>
            위{clubs ? ` / ${clubs}` : ''}
            <small>{from} 최종 순위</small>
          </span>
        </div>
        <p className={`${s.ribbon} ${ribbon.tone}`} data-testid="season-move">
          {ribbon.text}
        </p>
        {previous && (
          <p className={s.compare}>
            지난 시즌 {divisionName(w, previous.tier)} {previous.rank}위 · 승점 {previous.points}
          </p>
        )}
      </section>

      <ul className={s.tiles}>
        <li>
          <span>승점</span>
          <b>{season.points}</b>
          <small>{season.played}경기</small>
        </li>
        <li>
          <span>전적</span>
          <b>
            {season.won}승 {season.drawn}무 {season.lost}패
          </b>
          <small>승률 {season.played ? Math.round((season.won / season.played) * 100) : 0}%</small>
        </li>
        <li>
          <span>득실</span>
          <b>
            {season.gf}:{season.ga}
          </b>
          <small>골득실 {signed(season.gf - season.ga)}</small>
        </li>
        <li>
          <span>서포터</span>
          <b>{number(season.fans)}명</b>
          <small>
            {previous ? `지난 시즌보다 ${signed(season.fans - previous.fans)}명` : '첫 시즌'}
          </small>
        </li>
      </ul>

      <section className={s.panel} aria-label="시즌 재정">
        <header>
          <h3>시즌 재정</h3>
          <b className={net < 0n ? s.negative : s.positive}>
            손익 {net > 0n ? '+' : ''}
            {format(net.toString())}
          </b>
        </header>
        <div className={s.bars}>
          <div>
            <span>수입</span>
            <i className={s.incomeBar} style={{ width: width(income) }} />
            <b>{format(season.income)}</b>
          </div>
          <div>
            <span>지출</span>
            <i className={s.expenseBar} style={{ width: width(expense) }} />
            <b>{format(season.expense)}</b>
          </div>
        </div>
        <p className={s.note}>
          시즌 말 자금 {format(season.cash)}
          {prize ? ` · 순위 상금 ${format(prize)} 포함` : ' · 순위 상금 없음'}
        </p>
      </section>

      <section className={s.panel} aria-label="다음 시즌">
        <header>
          <h3>{seasonName(w.year)} 시즌 준비</h3>
          <small>{w.lower ? '프로 복귀 도전' : to}</small>
        </header>
        <dl className={s.next}>
          <div>
            <dt>운영 자금</dt>
            <dd>{money(w.cash, club.country, w.year)}</dd>
          </div>
          <div>
            <dt>연간 운영비</dt>
            <dd>{money(operatingCosts(w).annual, club.country, w.year)}</dd>
          </div>
          <div>
            <dt>후원</dt>
            <dd>
              {w.sponsor
                ? `${w.sponsor.name} · ${w.sponsor.until}년까지`
                : '없음 · 구단 운영에서 계약'}
            </dd>
          </div>
          <div>
            <dt>이적시장</dt>
            <dd>{window.label}</dd>
          </div>
        </dl>
      </section>

      <div className={s.actions}>
        {window.open ? (
          <button className={s.market} onClick={() => setCeremony(true)}>
            ✦ {windowInfo.name} 열기
          </button>
        ) : (
          <button className={s.primary} onClick={onMarket}>
            이적 시장 보기
          </button>
        )}
        <button onClick={onHome}>홈으로</button>
      </div>
      {ceremony && (
        <TransferCeremony
          w={w}
          candidates={candidates}
          onEnter={() => {
            setCeremony(false);
            void openWindowItems();
            onMarket();
          }}
          onClose={() => {
            setCeremony(false);
            void openWindowItems();
          }}
        />
      )}
    </div>
  );
}
