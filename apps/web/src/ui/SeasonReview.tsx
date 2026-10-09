import { useEffect, useMemo, useState, type PointerEvent } from 'react';
import { ClubCrest } from './ClubCrest';
import type { MatchRecord, World } from '../../../../packages/contracts/src/types';
import { country } from '../../../../packages/catalogs/src/index';
import { operatingCosts } from '../../../../packages/engine/src/finance';
import { transferWindow, WINDOW_INFO } from '../../../../packages/engine/src/transfers';
import { clubOf } from '../../../../packages/engine/src/world';
import type { GameClient } from '../runtime/client';
import { money, number, seasonName } from './format';
import { seasonStats, share, type Leader, type SeasonStats } from './seasonStats';
import s from './SeasonReview.module.css';
import { Term } from './Glossary';

function divisionName(w: World, tier: number) {
  return tier >= country(clubOf(w).country).groups.length ? '하부 구간' : `${tier + 1}부`;
}
const signed = (value: number, digits = 0) => {
  const text = digits ? Math.abs(value).toFixed(digits) : number(Math.abs(value));
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : digits ? (0).toFixed(digits) : '0';
};
const one = (value: number) => value.toFixed(1);
const two = (value?: number) => (value === undefined ? '—' : value.toFixed(2));

/** Cumulative points against expected points by league matchday (two series, one axis). */
function PointsChart({ stats }: { stats: SeasonStats }) {
  const [focus, setFocus] = useState<number>();
  const rows = stats.progression;
  if (rows.length < 2) return null;
  const W = 320,
    H = 96,
    L = 24,
    R = 8,
    T = 6,
    B = 14;
  const max = Math.max(3, ...rows.map((r) => Math.max(r.points, r.xpts ?? 0)));
  const x = (i: number) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const xptsRows = rows.filter((r) => r.xpts !== undefined);
  const active = focus === undefined ? rows.length - 1 : focus;
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = ((event.clientX - box.left) / box.width) * W;
    setFocus(
      Math.max(
        0,
        Math.min(rows.length - 1, Math.round(((ratio - L) / (W - L - R)) * (rows.length - 1))),
      ),
    );
  };
  return (
    <figure className={s.chart}>
      <figcaption>
        <span>
          <i className={s.keyPoints} aria-hidden="true" />
          승점 <b>{rows[active].points}</b>
        </span>
        {xptsRows.length === rows.length && (
          <span>
            <i className={s.keyXpts} aria-hidden="true" />
            기대 승점 <b>{one(rows[active].xpts!)}</b>
          </span>
        )}
        <small>{active + 1}라운드</small>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`리그 누적 승점 ${stats.points}${stats.xpts !== undefined ? `, 기대 승점 ${one(stats.xpts)}` : ''}`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setFocus(undefined)}
      >
        {[0, Math.round(max / 2), Math.round(max)].map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} className={s.grid} />
            <text x={L - 4} y={y(tick) + 3} textAnchor="end" className={s.tick}>
              {tick}
            </text>
          </g>
        ))}
        {xptsRows.length === rows.length && (
          <polyline
            points={rows.map((r, i) => `${x(i)},${y(r.xpts!)}`).join(' ')}
            fill="none"
            stroke="#ffcb47"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <polyline
          points={rows.map((r, i) => `${x(i)},${y(r.points)}`).join(' ')}
          fill="none"
          stroke="#2fc274"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <line x1={x(active)} x2={x(active)} y1={T} y2={H - B} className={s.crosshair} />
        <circle
          cx={x(active)}
          cy={y(rows[active].points)}
          r="4"
          fill="#2fc274"
          stroke="#07110e"
          strokeWidth="2"
        />
        {rows[active].xpts !== undefined && (
          <circle
            cx={x(active)}
            cy={y(rows[active].xpts!)}
            r="4"
            fill="#ffcb47"
            stroke="#07110e"
            strokeWidth="2"
          />
        )}
      </svg>
    </figure>
  );
}

function Leaders({
  title,
  unit,
  leaders,
  digits,
}: {
  title: string;
  unit: string;
  leaders: Leader[];
  digits?: number;
}) {
  return (
    <div className={s.leader}>
      <span>{title}</span>
      {leaders.length ? (
        <ol>
          {leaders.map((leader) => (
            <li key={leader.id}>
              <b>{leader.name}</b>
              <em>
                {digits === undefined ? number(leader.value) : leader.value.toFixed(digits)}
                {unit}
              </em>
            </li>
          ))}
        </ol>
      ) : (
        <p>기록 없음</p>
      )}
    </div>
  );
}

/**
 * The closed season at a glance: where the club finished, the numbers football fans read (xG,
 * expected points, finishing, keeping, pressing), its leaders, the money and the season ahead.
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
  const season = w.history.at(-1);
  const [loaded, setLoaded] = useState<{
    year: number;
    matches?: MatchRecord[];
    error?: boolean;
  }>();
  useEffect(() => {
    if (!season) return;
    let valid = true;
    void client
      .archive(season.year)
      .then((data) => valid && setLoaded({ year: season.year, matches: data?.matches || [] }))
      .catch(() => valid && setLoaded({ year: season.year, error: true }));
    return () => {
      valid = false;
    };
  }, [client, season?.year]);
  const matches = loaded?.year === season?.year ? loaded?.matches : undefined;
  const stats = useMemo(() => (matches ? seasonStats(w, matches) : undefined), [w, matches]);
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
    prize = w.events.find((e) => e.year === season.year && e.kind === 'season-prize')?.amount,
    window = transferWindow(w),
    windowInfo = WINDOW_INFO[window.kind || 'summer'];
  const ribbon =
    move === 'up'
      ? { text: `승격 · ${from} → ${to}`, tone: s.up }
      : move === 'down'
        ? { text: `강등 · ${from} → ${to}`, tone: s.down }
        : { text: `잔류 · ${from}`, tone: s.stay };
  const openWindowItems = async () => {
    for (const item of (w.inbox || []).filter((i) => i.kind === 'window-open' && !i.read))
      await client.command({ type: 'read-inbox', id: item.id });
  };
  const per = (value: number) => (stats?.played ? one(value / stats.played) : '—');
  const xgReady = !!stats?.xgMatches;
  return (
    <div className={s.review} data-testid="season-review">
      <section className={s.hero}>
        <ClubCrest w={w} id={club.id} size={40} />
        <div className={s.heroText}>
          <small className={s.kicker}>{seasonName(season.year)} · FINAL WHISTLE</small>
          <h2>{club.name}</h2>
          <p className={`${s.ribbon} ${ribbon.tone}`} data-testid="season-move">
            {ribbon.text}
          </p>
        </div>
        <div className={s.rank} aria-label={`최종 순위 ${season.rank}위`}>
          <b>{season.rank}</b>
          <span>
            위{clubs ? `/${clubs}` : ''}
            <small>{previous ? `지난 ${previous.rank}위` : '첫 시즌'}</small>
          </span>
        </div>
      </section>

      <ul className={s.kpis}>
        <li>
          <span>승점</span>
          <b>{season.points}</b>
          <small>경기당 {season.played ? (season.points / season.played).toFixed(2) : '0'}</small>
        </li>
        <li>
          <span>전적</span>
          <b>
            {season.won}-{season.drawn}-{season.lost}
          </b>
          <small>승률 {share(season.won, season.played)}</small>
        </li>
        <li>
          <span>득실</span>
          <b>
            {season.gf}:{season.ga}
          </b>
          <small>골득실 {signed(season.gf - season.ga)}</small>
        </li>
        <li>
          <span>xG 득실</span>
          <b>{xgReady ? signed(stats!.xg! - stats!.xga!, 1) : '—'}</b>
          <small>
            {xgReady ? `xG ${one(stats!.xg!)} · xGA ${one(stats!.xga!)}` : 'xG 기록 없음'}
          </small>
        </li>
        <li>
          <span>기대 승점</span>
          <b>{xgReady ? one(stats!.xpts!) : '—'}</b>
          <small>
            {xgReady && stats!.xgMatches === stats!.played
              ? `실제와 ${signed(stats!.points - stats!.xpts!, 1)}`
              : '비교 불가'}
          </small>
        </li>
        <li>
          <span>서포터</span>
          <b>{number(season.fans)}</b>
          <small>{previous ? `${signed(season.fans - previous.fans)}명` : '첫 시즌'}</small>
        </li>
      </ul>

      {!stats ? (
        <p className={s.loading} role="status">
          {loaded?.error
            ? '경기 기록을 읽지 못했어요. 다시 열어 주세요.'
            : '시즌 경기 기록을 불러오는 중…'}
        </p>
      ) : (
        <>
          <PointsChart stats={stats} />
          <div className={s.groups}>
            <section aria-label="공격">
              <h3>공격</h3>
              <dl>
                <div>
                  <dt>득점 (경기당)</dt>
                  <dd>
                    {stats.gf} ({per(stats.gf)})
                  </dd>
                </div>
                <div>
                  <dt>xG (경기당)</dt>
                  <dd>{xgReady ? `${one(stats.xg!)} (${per(stats.xg!)})` : '—'}</dd>
                </div>
                <div>
                  <dt>득점 − xG</dt>
                  <dd className={xgReady ? (stats.gf >= stats.xg! ? s.good : s.bad) : undefined}>
                    {xgReady ? signed(stats.gf - stats.xg!, 1) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>경기당 슈팅</dt>
                  <dd>{per(stats.shots)}</dd>
                </div>
                <div>
                  <dt>유효 슈팅 비율</dt>
                  <dd>{share(stats.onTarget, stats.shots)}</dd>
                </div>
                <div>
                  <dt>슈팅 전환율</dt>
                  <dd>{share(stats.gf, stats.shots)}</dd>
                </div>
                {stats.detailMatches > 0 && (
                  <>
                    <div>
                      <dt>
                        <Term id="big-chance">빅찬스</Term> (결정률)
                      </dt>
                      <dd>
                        {stats.bigChances} ({share(stats.bigChancesScored, stats.bigChances)})
                      </dd>
                    </div>
                    <div>
                      <dt>
                        경기당 <Term id="key-pass">키패스</Term>
                      </dt>
                      <dd>{one(stats.keyPasses / stats.detailMatches)}</dd>
                    </div>
                  </>
                )}
              </dl>
            </section>
            <section aria-label="수비">
              <h3>수비</h3>
              <dl>
                <div>
                  <dt>실점 (경기당)</dt>
                  <dd>
                    {stats.ga} ({per(stats.ga)})
                  </dd>
                </div>
                <div>
                  <dt>xGA (경기당)</dt>
                  <dd>{xgReady ? `${one(stats.xga!)} (${per(stats.xga!)})` : '—'}</dd>
                </div>
                <div>
                  <dt>xGA − 실점</dt>
                  <dd className={xgReady ? (stats.xga! >= stats.ga ? s.good : s.bad) : undefined}>
                    {xgReady ? signed(stats.xga! - stats.ga, 1) : '—'}
                  </dd>
                </div>
                <div>
                  <dt>클린시트</dt>
                  <dd>
                    {stats.cleanSheets} ({share(stats.cleanSheets, stats.played)})
                  </dd>
                </div>
                <div>
                  <dt>선방률</dt>
                  <dd>{share(stats.saves, stats.onTargetAgainst)}</dd>
                </div>
                <div>
                  <dt>
                    <Term id="ppda">PPDA</Term>
                    {stats.pressPpda === undefined ? '*' : ''}
                  </dt>
                  <dd>{two(stats.pressPpda ?? stats.ppda)}</dd>
                </div>
              </dl>
            </section>
            <section aria-label="경기 운영">
              <h3>경기 운영</h3>
              <dl>
                <div>
                  <dt>평균 점유율</dt>
                  <dd>{one(stats.possession)}%</dd>
                </div>
                <div>
                  <dt>패스 성공률</dt>
                  <dd>
                    {stats.passAccuracy === undefined ? '—' : `${one(stats.passAccuracy * 100)}%`}
                  </dd>
                </div>
                <div>
                  <dt>경기당 패스</dt>
                  <dd>{Math.round(stats.passesPerGame)}</dd>
                </div>
                <div>
                  <dt>경기당 태클+인터셉트</dt>
                  <dd>{one(stats.defensiveActions)}</dd>
                </div>
                {stats.detailMatches > 0 && (
                  <>
                    <div>
                      <dt>
                        <Term id="final-third">파이널 서드</Term> 성공률
                      </dt>
                      <dd>{share(stats.finalThirdCompleted, stats.finalThirdPasses)}</dd>
                    </div>
                    <div>
                      <dt>
                        <Term id="field-tilt">필드 틸트</Term>
                      </dt>
                      <dd>
                        {stats.fieldTilt === undefined ? '—' : `${one(stats.fieldTilt * 100)}%`}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        경기당 <Term id="high-turnover">하이 턴오버</Term>
                      </dt>
                      <dd>{one(stats.highTurnovers / stats.detailMatches)}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt>홈</dt>
                  <dd>
                    {stats.home.won}-{stats.home.drawn}-{stats.home.lost} · {stats.home.points}점
                  </dd>
                </div>
                <div>
                  <dt>원정</dt>
                  <dd>
                    {stats.away.won}-{stats.away.drawn}-{stats.away.lost} · {stats.away.points}점
                  </dd>
                </div>
              </dl>
            </section>
          </div>
          <ul className={s.records}>
            <li>
              <span>최다 연속 무패</span>
              <b>{stats.longestUnbeaten}경기</b>
            </li>
            <li>
              <span>최다 연승</span>
              <b>{stats.longestWinning}경기</b>
            </li>
            <li>
              <span>최다 점수 차 승리</span>
              <b>
                {stats.biggestWin
                  ? `${stats.biggestWin.score} vs ${stats.biggestWin.opponent}`
                  : '—'}
              </b>
            </li>
            <li>
              <span>최다 점수 차 패배</span>
              <b>
                {stats.heaviestDefeat
                  ? `${stats.heaviestDefeat.score} vs ${stats.heaviestDefeat.opponent}`
                  : '—'}
              </b>
            </li>
          </ul>
          <section className={s.leaders} aria-label="시즌 리더">
            <Leaders title="득점" unit="골" leaders={stats.leaders.goals} />
            <Leaders title="도움" unit="개" leaders={stats.leaders.assists} />
            {stats.leaders.xa.length > 0 && (
              <Leaders title="기대 도움 (xA)" unit="" leaders={stats.leaders.xa} digits={2} />
            )}
            {stats.leaders.keyPasses.length > 0 && (
              <Leaders title="키패스" unit="개" leaders={stats.leaders.keyPasses} />
            )}
            <Leaders title="수비 (태클+인터셉트)" unit="회" leaders={stats.leaders.defending} />
            <Leaders title="출전" unit="분" leaders={stats.leaders.minutes} />
            <Leaders title="선방" unit="회" leaders={stats.leaders.saves} />
          </section>
          <p className={s.footnote}>
            리그 {stats.played}경기 기준.{' '}
            {stats.xgMatches < stats.played &&
              `xG·기대 승점은 기록이 있는 ${stats.xgMatches}경기만 셉니다. `}
            {stats.pressPpda === undefined
              ? '* PPDA는 전 구역 기준 근사치(상대 패스 ÷ 우리 태클·인터셉트)예요. '
              : 'PPDA는 상대가 자기 진영 2/3에서 한 패스 ÷ 그 구역에서의 우리 태클·인터셉트예요. '}
            낮을수록 강하게 압박했다는 뜻이에요. 기대 승점은 경기마다 양 팀 xG를 포아송 분포로
            계산했어요. 지표 이름을 누르면 정의를 볼 수 있어요.
          </p>
        </>
      )}

      <section className={s.money} aria-label="시즌 재정">
        <div>
          <span>수입</span>
          <b>{format(season.income)}</b>
        </div>
        <div>
          <span>지출</span>
          <b>{format(season.expense)}</b>
        </div>
        <div>
          <span>손익</span>
          <b className={net < 0n ? s.bad : s.good}>
            {net > 0n ? '+' : ''}
            {format(net.toString())}
          </b>
        </div>
        <div>
          <span>시즌 말 자금</span>
          <b>{format(season.cash)}</b>
          <small>{prize ? `상금 ${format(prize)} 포함` : '순위 상금 없음'}</small>
        </div>
      </section>

      <section className={s.next} aria-label="다음 시즌">
        <h3>
          {seasonName(w.year)} · {w.lower ? '프로 복귀 도전' : to}
        </h3>
        <ul>
          <li>자금 {money(w.cash, club.country, w.year)}</li>
          <li>연간 운영비 {money(operatingCosts(w).annual, club.country, w.year)}</li>
          <li>{w.sponsor ? `후원 ${w.sponsor.name} · ${w.sponsor.until}년까지` : '후원 없음'}</li>
          <li>이적시장 {window.label}</li>
        </ul>
      </section>

      <div className={s.actions}>
        <button
          className={s.primary}
          onClick={() => {
            if (window.open) void openWindowItems();
            onMarket();
          }}
        >
          {window.open ? `${windowInfo.name} 보기 · 후보 ${candidates}명` : '이적시장 보기'}
        </button>
        <button onClick={onHome}>홈으로</button>
      </div>
    </div>
  );
}
