import { useEffect, useState } from 'react';
import type { MatchRecord, Player, Command } from '../../../../packages/contracts/src/types';
import { priceIndex, country, currency } from '../../../../packages/catalogs/src/index';
import { quote, tacticLabel } from '../../../../packages/engine/src/world';
import { ratio } from '../../../../packages/engine/src/primitives';
import type { ClientState, GameClient } from '../runtime/client';
import type { Reply } from '../runtime/protocol';
import { Panel } from './App';
import { Dialog } from './Dialog';
import type { Page } from './state';
import { Chart } from './Chart';
import { FinancialBreakdown } from './FinancialBreakdown';
import { Pitch } from './Pitch';
import { archivePlayback } from './replay';
import { money, number, percent, seasonName, kindLabel } from './format';
import s from './App.module.css';
type Props = { state: ClientState; client: GameClient };
const toneLabel = {
  respect: '정중하게 제안',
  evidence: '지표를 근거로',
  support: '지원을 약속하며',
  demand: '강하게 요구',
};
const sponsors = {
  stable: '안정적인 후원',
  performance: '성과에 따른 후원',
  exclusive: '독점 후원',
  indexed: '물가 연동 후원',
};
function Header({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className={s.hero}>
      <div>
        <div className={s.eyebrow}>{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Attributes({ rows }: { rows: [string, string | number][] }) {
  return (
    <div className={s.attributes}>
      {rows.map(([label, v]) => (
        <div className={s.attribute} key={label}>
          <span>{label}</span>
          <b>{typeof v === 'number' ? Math.round(v) : v}</b>
        </div>
      ))}
    </div>
  );
}
function ManagerView({ state, client }: Props) {
  const v = state.view!,
    w = v.world,
    m = w.manager,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [tactic, setTactic] = useState(w.tactic),
    [tone, setTone] = useState('respect');
  const disabled = state.busy || state.readonly;
  const response = w.events.filter((e) => e.kind === 'manager-response').at(-1);
  return (
    <>
      <Header
        eyebrow="THE PERSON BEHIND THE TACTICS"
        title="전술에도, 사람이 있습니다."
        description="감독의 철학을 듣고 제안하세요. 수락한 전술만 그라운드에 적용됩니다."
      />
      <div className={s.twoCols}>
        <Panel title={m.name} note={m.interim ? 'INTERIM MANAGER' : 'FIRST TEAM MANAGER'}>
          <div className={s.panelBody}>
            <span className={s.pill}>
              {m.since}년 부임 · {m.until}년까지
            </span>
            <Attributes
              rows={[
                ['철학', tacticLabel[m.philosophy]],
                ['지도력', m.ability],
                ['유소년 육성', m.youth],
                ['유연성', m.flexibility],
                ['자존심', m.pride],
                ['신뢰', m.trust],
                ['불만 누적', m.conflicts],
                ['연봉', money(m.wage, c.country, w.year)],
              ]}
            />
            <p className={s.muted}>
              {m.pride >= 75
                ? '자존심이 강한 감독입니다. 신뢰가 낮아진 상태에서 간섭을 계속하면 떠날 수 있습니다.'
                : m.flexibility >= 65
                  ? '변화를 비교적 열린 마음으로 받아들이는 감독입니다.'
                  : '자신의 철학을 지키려는 성향입니다. 납득할 근거와 지원을 준비하세요.'}
            </p>
          </div>
        </Panel>
        <Panel title="감독실에서의 대화" note="YOUR REQUEST">
          <div className={s.panelBody}>
            <p className={s.muted}>
              현재 적용 전술: <b>{tacticLabel[w.tactic]}</b>
              {w.requested && ` · 최근 요청: ${tacticLabel[w.requested]}`}
            </p>
            <div className={s.filters} style={{ marginTop: 20 }}>
              <label>
                전술{' '}
                <select
                  aria-label="요청 전술"
                  value={tactic}
                  onChange={(e) => setTactic(e.target.value as typeof tactic)}
                >
                  {Object.entries(tacticLabel).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                말투{' '}
                <select
                  aria-label="요청 말투"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                >
                  {Object.entries(toneLabel).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className={s.primary}
              disabled={disabled}
              onClick={() => void client.command({ type: 'tactics', tactic, tone })}
            >
              감독에게 제안하기
            </button>
            {m.pending && (
              <div className={s.critical} style={{ marginTop: 20 }}>
                조건 대기: {tacticLabel[m.pending]}
                <p>훈련 지원 {money(quote(c.country, w.year, 30), c.country, w.year)} 필요</p>
                <button
                  disabled={disabled}
                  onClick={() => void client.command({ type: 'accept-condition' })}
                >
                  훈련 지원하고 수락
                </button>
              </div>
            )}
            {response && (
              <blockquote className={s.notice} style={{ margin: '20px 0 0' }}>
                <b>{response.title}</b>
                <p>{response.detail}</p>
              </blockquote>
            )}
          </div>
          <div className={s.panelFoot}>
            요청 결과는 성향·신뢰·말투·이전 갈등을 따릅니다. 동일 요청은 신뢰를 반복해서 높이지
            않습니다.
          </div>
        </Panel>
      </div>
      <Panel title="새로운 지도자의 제안" note="COMPARE FOUR CANDIDATES">
        <div className={s.panelBody}>
          <div className={s.cards}>
            {v.managers.map((candidate, i) => {
              const fee = (
                BigInt(candidate.fee) + (m.interim ? 0n : BigInt(ratio(m.wage, 1n, 4n)))
              ).toString();
              return (
                <article className={s.card} key={candidate.id}>
                  <h3>{candidate.name}</h3>
                  <span className={s.pill}>{tacticLabel[candidate.philosophy]}</span>
                  <Attributes
                    rows={[
                      ['지도력', candidate.ability],
                      ['유소년 육성', candidate.youth],
                      ['유연성', candidate.flexibility],
                      ['자존심', candidate.pride],
                      ['야망', candidate.ambition],
                      ['연봉', money(candidate.wage, c.country, w.year)],
                    ]}
                  />
                  <p>
                    계약 {candidate.until}년까지 · 즉시 지출 {money(fee, c.country, w.year)} (이전
                    감독 보상 포함)
                  </p>
                  <button
                    disabled={disabled || candidate.id === m.id}
                    onClick={() => void client.command({ type: 'hire', candidate: i })}
                  >
                    {candidate.id === m.id ? '현재 감독' : '감독 선임'}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </Panel>
    </>
  );
}
function Squad({ state, client }: Props) {
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [tab, setTab] = useState('roster'),
    [selected, setSelected] = useState<Player>(),
    [compare, setCompare] = useState<number[]>([]),
    [scope, setScope] = useState('season'),
    [confirm, setConfirm] = useState<Player>();
  const disabled = state.busy || state.readonly;
  const active = w.players.filter((p) => p.status === 'active');
  const transfer = (n: number, loan = false) =>
    void client.command({ type: 'recruit', candidate: n, loan });
  const cards = (indices: number[]) =>
    indices.map((i) => {
      const o = v.transfers[i],
        p = o.player;
      return (
        <article className={s.card} key={p.id}>
          <h3>{p.name}</h3>
          <span className={s.pill}>
            {p.role} · {w.year - p.born}세
          </span>
          <Attributes
            rows={[
              ['공격', p.attack],
              ['패스', p.passing],
              ['수비', p.defense],
              ['골키핑', p.keeper],
              ['체력', p.stamina],
              ['잠재력', p.potential],
            ]}
          />
          <p>
            이적료 {money(o.fee, c.country, w.year)} · 연봉 {money(p.wage, c.country, w.year)} ·
            계약 {p.until}년
          </p>
          <p>임대료 {money(o.loanFee, c.country, w.year)} · 다음 시즌 반환</p>
          <div className={s.actions}>
            <button
              className={s.primary}
              disabled={disabled || !o.available || active.length >= 26}
              onClick={() => transfer(i)}
            >
              {o.available ? '선수 영입' : '계약 완료'}
            </button>
            <button
              disabled={disabled || !o.available || active.length >= 26}
              onClick={() => transfer(i, true)}
            >
              1시즌 임대
            </button>
            <label className={s.fileButton}>
              <input
                type="checkbox"
                checked={compare.includes(i)}
                onChange={(e) =>
                  setCompare(
                    e.target.checked ? [...compare.slice(-1), i] : compare.filter((n) => n !== i),
                  )
                }
              />{' '}
              비교
            </label>
          </div>
        </article>
      );
    });
  return (
    <>
      <Header
        eyebrow="PEOPLE MAKE A CLUB"
        title="이름들이, 전설이 되도록."
        description="능력과 잠재력, 연봉과 비용을 함께 비교하세요. 떠난 선수의 기록도 남습니다."
      />
      <div className={s.filters}>
        <button
          className={tab === 'roster' ? s.selected : undefined}
          onClick={() => setTab('roster')}
        >
          우리 선수단 · {active.length}/26
        </button>
        <button
          className={tab === 'market' ? s.selected : undefined}
          onClick={() => setTab('market')}
        >
          이적 시장
        </button>
        <label>
          지표 범위{' '}
          <select
            aria-label="선수 지표 범위"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="season">현재 시즌 · 모든 대회</option>
            <option value="career">우리 클럽 통산</option>
          </select>
        </label>
      </div>
      {tab === 'roster' ? (
        <Panel title="우리 클럽의 선수들" note="GK · DEF · MID · FWD">
          <div className={s.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>역할</th>
                  <th>선수</th>
                  <th>나이</th>
                  <th>공격</th>
                  <th>패스</th>
                  <th>수비</th>
                  <th>잠재력</th>
                  <th>득점</th>
                  <th>도움</th>
                  <th>피로</th>
                  <th>연봉</th>
                  <th>계약</th>
                  <th>선택</th>
                </tr>
              </thead>
              <tbody>
                {w.players
                  .filter((p) => p.status === 'active' || scope === 'career')
                  .map((p) => {
                    const stats = scope === 'career' ? p.career : p.season;
                    return (
                      <tr key={p.id}>
                        <td>{p.role}</td>
                        <td>
                          <button onClick={() => setSelected(p)}>{p.name}</button>
                          <small>
                            {' '}
                            {p.status === 'retired'
                              ? '은퇴'
                              : p.status === 'sold'
                                ? '매각'
                                : p.loanUntil
                                  ? '임대'
                                  : ''}
                          </small>
                        </td>
                        <td>{p.status === 'active' ? w.year - p.born : `${p.born}년생`}</td>
                        <td>{number(p.attack)}</td>
                        <td>{number(p.passing)}</td>
                        <td>{number(p.defense)}</td>
                        <td>{number(p.potential)}</td>
                        <td>{stats[0]}</td>
                        <td>{stats[1]}</td>
                        <td>{number(p.fatigue)}</td>
                        <td>{p.status === 'active' ? money(p.wage, c.country, w.year) : '—'}</td>
                        <td>{p.until}</td>
                        <td>
                          {p.status === 'active' && !p.loanUntil && (
                            <button disabled={disabled} onClick={() => setConfirm(p)}>
                              매각
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          <div className={s.panelFoot}>
            감독이 역할과 능력·피로에 따라 선발을 고릅니다. 시설과 육성 능력이 성장에 영향을 줍니다.
            매각은 최소 14명·골키퍼 1명 유지 조건입니다.
          </div>
        </Panel>
      ) : (
        <>
          <p className={s.muted} style={{ marginBottom: 16 }}>
            선수 구매 시 이적료를 즉시 지출하고, 연봉은 라운드마다 나누어 지급합니다. 비교는 최대
            2명입니다.
          </p>
          {compare.length > 0 && (
            <Panel title="후보 비교">
              <div className={s.panelBody}>
                <div className={s.cards}>{cards(compare)}</div>
              </div>
            </Panel>
          )}
          <div className={s.cards}>{cards(v.transfers.map((_, i) => i))}</div>
        </>
      )}
      {selected && (
        <Dialog label="선수 상세 기록" onClose={() => setSelected(undefined)}>
          <h2>{selected.name}</h2>
          <p>
            {selected.role} · {w.year - selected.born}세 · {selected.status}
          </p>
          <Attributes
            rows={[
              ['경력 득점', selected.career[0]],
              ['경력 도움', selected.career[1]],
              ['누적 출전 분', selected.career[10]],
              ['패스 성공률', percent(selected.career[3], selected.career[2])],
              ['슈팅', selected.career[4]],
              ['유효 슈팅', selected.career[5]],
              ['태클', selected.career[6]],
              ['인터셉트', selected.career[7]],
              ['돌파', selected.career[8]],
              ['선방', selected.career[9]],
            ]}
          />
          <p>분모: 패스 시도 {number(selected.career[2])}회 · 우리 클럽에서 기록된 경력</p>
          <button onClick={() => setSelected(undefined)}>닫기</button>
        </Dialog>
      )}
      {confirm && (
        <Dialog label="선수 매각 확인" onClose={() => setConfirm(undefined)}>
          <h2>{confirm.name}의 다음 무대</h2>
          <p>
            경력 기록은 보존됩니다. 매각 대금은{' '}
            {money(
              quote(
                c.country,
                w.year,
                Math.max(
                  10,
                  ((confirm.role === 'GK'
                    ? confirm.keeper
                    : Math.round(
                        (confirm.attack + confirm.passing + confirm.defense + confirm.stamina) / 4,
                      )) -
                    25) *
                    5,
                ),
              ),
              c.country,
              w.year,
            )}
            입니다.
          </p>
          <div className={s.actions}>
            <button onClick={() => setConfirm(undefined)}>취소</button>
            <button
              className={s.primary}
              disabled={disabled}
              onClick={() => {
                void client.command({ type: 'sell', id: confirm.id });
                setConfirm(undefined);
              }}
            >
              매각 확정
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
function Business({ state, client }: Props) {
  const v = state.view!,
    w = v.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [ticket, setTicket] = useState(w.ticket);
  const disabled = state.busy || state.readonly,
    cp = priceIndex(c.country, w.year);
  const act = (command: Command) => void client.command(command);
  return (
    <>
      <Header
        eyebrow="MORE THAN MATCH DAYS"
        title="동네와 함께, 더 멀리."
        description="마케팅과 후원, 티켓과 시설. 수익과 팬의 변화를 관찰하며 운영을 실험하세요."
      />
      <div className={s.stats}>
        {[
          ['현금 잔고', money(w.cash, c.country, w.year)],
          ['현재 시즌 수입', money(w.income, c.country, w.year)],
          ['현재 시즌 지출', money(w.expense, c.country, w.year)],
          [
            '자금 / 연간 운영비',
            `${((Number(w.cash) / Number(v.annualCost)) * 12).toFixed(1)}개월`,
          ],
        ].map(([label, value]) => (
          <div className={s.stat} key={label}>
            <div className={s.label}>{label}</div>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <FinancialBreakdown w={w} breakdown={v.finance} />
      <Panel title="작은 실험, 눈에 보이는 결과" note="MARKETING CAMPAIGNS">
        <div className={s.panelBody}>
          <div className={s.cards}>
            {v.campaigns.map((o) => {
              const pending = w.campaigns.find((c) => c.kind === o.kind);
              return (
                <article className={s.card} key={o.kind}>
                  <h3>{o.label}</h3>
                  <p>
                    비용 {money(o.cost, c.country, w.year)} · {o.rounds}라운드
                  </p>
                  <p>
                    기대 수입 범위 {money(o.min, c.country, w.year)}–
                    {money(o.max, c.country, w.year)}
                    <br />팬 증가와 수입은 수요에 따라 달라집니다.
                  </p>
                  <button
                    style={{ marginTop: 14 }}
                    disabled={
                      disabled ||
                      !!pending ||
                      (w.sponsor?.kind === 'exclusive' && o.kind === 'merchandise')
                    }
                    onClick={() => act({ type: 'campaign', kind: o.kind })}
                  >
                    {pending ? `${pending.remaining}라운드 남음` : '캠페인 시작'}
                  </button>
                </article>
              );
            })}
          </div>
          <ul className={s.timeline} style={{ marginTop: 20 }}>
            {w.events
              .filter((e) => e.kind === 'campaign-result')
              .slice(-4)
              .reverse()
              .map((e, i) => (
                <li key={i}>
                  <b>{e.title}</b>
                  <p>{e.detail}</p>
                </li>
              ))}
          </ul>
        </div>
      </Panel>
      <Panel title="우리 클럽의 파트너" note="MAIN SPONSOR">
        <div className={s.panelBody}>
          {w.sponsor ? (
            <>
              <h3>{w.sponsor.name}</h3>
              <p className={s.muted}>
                {sponsors[w.sponsor.kind]} · 연간 {money(w.sponsor.annual, c.country, w.year)} ·{' '}
                {w.sponsor.until}년까지 · 실제 리그 경기마다 분할 지급
              </p>
              {w.sponsor.kind === 'exclusive' && (
                <p>독점 후원 기간에는 자체 상품 캠페인이 제한됩니다.</p>
              )}
            </>
          ) : (
            <div className={s.cards}>
              {v.sponsors.map((o) => (
                <article className={s.card} key={o.kind}>
                  <h3>{sponsors[o.kind]}</h3>
                  <p>{o.name}</p>
                  <p>
                    연간 {money(o.annual, c.country, w.year)} · {o.until}년까지
                    <br />
                    {o.kind === 'performance'
                      ? `홈 경기 승리마다 성과 보너스의 1/20 (${money(o.bonus, c.country, w.year)} 기준)`
                      : o.kind === 'indexed'
                        ? '국가 CPI에 따른 연간 후원금 조정'
                        : o.kind === 'exclusive'
                          ? '자체 상품 캠페인 제한'
                          : '고정 명목 금액 보장'}
                  </p>
                  <button
                    disabled={disabled}
                    style={{ marginTop: 14 }}
                    onClick={() => act({ type: 'sponsor', kind: o.kind })}
                  >
                    후원 계약
                  </button>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className={s.panelFoot}>
          후원은 한 자리입니다. 연간 기본 후원금은 실제 리그 경기마다 나누어 받습니다. 성과 수당은
          경기 결과에 따라 지급됩니다.
        </div>
      </Panel>
      <div className={s.twoCols}>
        <Panel title="우리의 운동장">
          <div className={s.panelBody}>
            <p>
              시설 {w.facilities}단계 · 수용 {number(2500 + w.facilities * 5000)}명
            </p>
            <p className={s.muted}>
              시설은 선수 성장과 수용 인원을 높이고, 연간 운영비도 증가시킵니다.
            </p>
            <div className={s.actions}>
              <button
                disabled={disabled || w.facilities >= 30}
                onClick={() => act({ type: 'facility' })}
              >
                시설 확장 ·{' '}
                {money(
                  quote(c.country, w.year, 200 * (w.facilities + 1) ** 1.5),
                  c.country,
                  w.year,
                )}
              </button>
            </div>
            <label style={{ display: 'block', marginTop: 20 }}>
              1901년 기준 티켓 가격{' '}
              <input
                aria-label="티켓 기본가격"
                type="number"
                min={0.01}
                max={0.5}
                step={0.01}
                value={ticket}
                onChange={(e) => setTicket(Number(e.target.value))}
              />
            </label>
            <p className={s.muted}>
              현재 물가 적용 1장 {money(quote(c.country, w.year, ticket), c.country, w.year)} · 높은
              가격은 수요를 줄입니다.
            </p>
            <button disabled={disabled} onClick={() => act({ type: 'ticket', price: ticket })}>
              티켓 가격 적용
            </button>
          </div>
        </Panel>
        <Panel title="계속할 수 있는 선택">
          <div className={s.panelBody}>
            <p className={s.muted}>
              필수 급여와 운영비는 자금이 부족해도 발생합니다. 선수를 매각하거나 비용과 티켓 가격을
              조정해 운영 수지를 개선하세요.
            </p>
            <button
              disabled={disabled}
              style={{ marginTop: 16 }}
              onClick={() => act({ type: 'support' })}
            >
              구단주 추가 출자 · {money(quote(c.country, w.year, 150), c.country, w.year)}
            </button>
            <p className={s.muted} style={{ marginTop: 10 }}>
              시즌당 최대 3회 · 평판 -2 · 사용{' '}
              {w.events.filter((e) => e.year === w.year && e.kind === 'support').length}/3
            </p>
          </div>
        </Panel>
      </div>
      <Panel title="돈의 시대, 기록의 기준" note={cp.status.toUpperCase()}>
        <div className={s.panelBody}>
          <p>
            현재 화폐 {w.currency} · 물가지수 {cp.value.toFixed(2)}
          </p>
          <p className={s.muted}>
            {cp.source} ·{' '}
            {cp.status === 'observed'
              ? '실제 관측 자료'
              : cp.status === 'estimated'
                ? '영국 역사 지수에 연결한 추정치'
                : '최근 관측 이후 연 2% 가정'}
          </p>
          <p className={s.muted}>
            기존 고정 계약과 현금은 물가 때문에 자동 증액되지 않습니다. 통화 전환은 현재 잔고·계약만
            환산하고 과거 장부는 원래 단위로 남깁니다.
          </p>
        </div>
      </Panel>
    </>
  );
}
function History({ state, client }: Props) {
  const w = state.view!.world,
    c = w.clubs.find((c) => c.id === w.playerClub)!,
    [year, setYear] = useState(w.year),
    [archive, setArchive] = useState<Reply['archive']>(),
    [match, setMatch] = useState<MatchRecord>(),
    [filter, setFilter] = useState('all'),
    [historicalCode, setHistoricalCode] = useState(c.country),
    [tier, setTier] = useState(0),
    [historicalGroup, setHistoricalGroup] = useState(0);
  useEffect(() => {
    let valid = true;
    void client.archive(year).then((result) => {
      if (valid) setArchive(result);
    });
    return () => {
      valid = false;
    };
  }, [client, year, w.revision]);
  const matches = archive?.matches.filter((m) => filter === 'all' || m.kind === filter) || [],
    h = archive?.season;
  const rows =
    h?.standings
      .filter(
        (row) =>
          w.clubs[row[0]].country === historicalCode &&
          row[1] === tier &&
          row[2] === historicalGroup,
      )
      .sort((a, b) => b[3] - a[3] || b[4] - b[5] - (a[4] - a[5]) || b[4] - a[4] || a[0] - b[0]) ||
    [];
  const f = (n: string, y = year) => money(n, c.country, y);
  return (
    <>
      <Header
        eyebrow="NOTHING GOOD IS FORGOTTEN"
        title="작은 선택들이 만든, 긴 역사."
        description="시즌과 사람, 경기와 장부. 그때의 숫자를 그대로 펼쳐보세요."
      />
      <div className={s.twoCols}>
        <Panel title="서포터의 성장">
          <div className={s.panelBody}>
            <Chart
              label="서포터"
              values={w.history.map((h) => h.fans)}
              labels={w.history.map((h) => String(h.year))}
            />
          </div>
        </Panel>
        <Panel title="클럽의 디비전">
          <div className={s.panelBody}>
            <Chart
              label="디비전"
              inverse
              values={w.history.map((h) => h.tier + 1)}
              labels={w.history.map((h) => String(h.year))}
            />
          </div>
        </Panel>
        <Panel title="1901년 가격으로 비교한 장부">
          <div className={s.panelBody}>
            <Chart
              label="1901년 가격 기준 자금"
              values={w.history.map(
                (h) =>
                  Number(
                    ratio(
                      h.cash,
                      BigInt(quote(c.country, 1901, 1)),
                      BigInt(quote(c.country, h.year, 1)),
                    ),
                  ) / currency(c.country, 1901).units,
              )}
              labels={w.history.map((h) => String(h.year))}
            />
            <p className={s.muted}>
              물가와 화폐 전환을 보정한 1901년 기준 금액입니다. 초기 국가 자료가 없으면 영국 지수
              추정을 씁니다. 실험 전후 변화는 인과관계의 증명이 아닙니다.
            </p>
          </div>
        </Panel>
        <Panel title="감독들이 남긴 계절">
          <div className={s.panelBody}>
            <ul className={s.timeline}>
              {archive?.managers
                .filter((e) => e.kind === 'manager-hire' || e.kind === 'manager-departure')
                .map((e, i) => (
                  <li key={i}>
                    <small>
                      {e.year} · ROUND {e.round}
                    </small>
                    <b>{e.title}</b>
                    <p>{e.detail}</p>
                  </li>
                ))}
              <li>
                <b>{w.manager.name} · 현재</b>
                <p>
                  {w.manager.since}년부터 · {tacticLabel[w.manager.philosophy]}
                </p>
              </li>
            </ul>
          </div>
        </Panel>
      </div>
      <div className={s.filters}>
        <label>
          시즌{' '}
          <select
            aria-label="기록 시즌"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[...w.history.map((h) => h.year), w.year].reverse().map((y) => (
              <option key={y} value={y}>
                {seasonName(y)}
                {y === w.year ? ' 진행 중' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          대회 범위{' '}
          <select
            aria-label="기록 대회 범위"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">모든 대회</option>
            {Object.entries(kindLabel).map(([id, t]) => (
              <option key={id} value={id}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <span className={s.pill}>
          {matches.length}경기 · 전체 {state.view!.totalMatches}경기 보존
        </span>
      </div>
      {h && (
        <div className={s.stats}>
          {[
            ['리그 성적', `${h.tier + 1}부 ${h.rank}위 · ${h.points}pts`],
            ['서포터', number(h.fans)],
            ['당시 자금', f(h.cash)],
            ['당시 손익', f((BigInt(h.income) - BigInt(h.expense)).toString())],
          ].map(([label, value]) => (
            <div className={s.stat} key={label}>
              <div className={s.label}>{label}</div>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      <Panel title="경기의 페이지" note={seasonName(year)}>
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>라운드</th>
                <th>홈 클럽</th>
                <th>결과</th>
                <th>원정 클럽</th>
                <th>대회</th>
                <th>기록</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td>{m.round}</td>
                  <td>{w.clubs.find((c) => c.id === m.home)?.name}</td>
                  <td>
                    <b>
                      {m.score.home}–{m.score.away}
                    </b>
                  </td>
                  <td>{w.clubs.find((c) => c.id === m.away)?.name}</td>
                  <td>{kindLabel[m.kind]}</td>
                  <td>
                    <button onClick={() => setMatch(m)}>경기 기록 보기</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!matches.length && <div className={s.empty}>아직 기록된 경기가 없습니다.</div>}
        </div>
      </Panel>
      {h && (
        <>
          <Panel title="유럽의 우승과 순위" note="HISTORICAL HONORS">
            <div className={s.panelBody}>
              {h.europe.length ? (
                h.europe.map((e) => (
                  <details key={e.kind} style={{ marginBottom: 14 }}>
                    <summary>
                      <b>{e.name}</b> · {w.clubs.find((c) => c.id === e.winner)?.name} 우승 ·{' '}
                      {e.field}팀
                    </summary>
                    <div className={s.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>참가 클럽</th>
                            <th>경기</th>
                            <th>승점</th>
                            <th>득점</th>
                            <th>실점</th>
                          </tr>
                        </thead>
                        <tbody>
                          {e.standings?.map((row) => (
                            <tr key={row[0]}>
                              <td>{row[1]}</td>
                              <td>{w.clubs[row[0]].name}</td>
                              <td>{row[2]}</td>
                              <td>{row[3]}</td>
                              <td>{row[4]}</td>
                              <td>{row[5]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {e.secondStandings && (
                      <p className={s.muted}>
                        2차 조별 단계 {e.secondStandings.length}개 클럽 기록도 저장되어 있습니다.
                      </p>
                    )}
                  </details>
                ))
              ) : (
                <p className={s.muted}>아직 유럽대회 창설 이전의 시즌입니다.</p>
              )}
            </div>
          </Panel>
          <Panel title="그해의 각국 리그">
            <div className={s.panelBody}>
              <div className={s.filters}>
                <label>
                  국가{' '}
                  <select
                    aria-label="과거 국가"
                    value={historicalCode}
                    onChange={(e) => {
                      setHistoricalCode(e.target.value);
                      setTier(0);
                    }}
                  >
                    {h.champions.map((ch) => (
                      <option key={ch.country} value={ch.country}>
                        {country(ch.country).name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  디비전{' '}
                  <select
                    aria-label="과거 디비전"
                    value={tier}
                    onChange={(e) => {
                      setTier(Number(e.target.value));
                      setHistoricalGroup(0);
                    }}
                  >
                    {country(historicalCode).groups.map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}부
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className={s.muted}>
                리그 우승{' '}
                {
                  w.clubs.find(
                    (c) => c.id === h.champions.find((ch) => ch.country === historicalCode)?.club,
                  )?.name
                }{' '}
                · 국내 컵{' '}
                {
                  w.clubs.find(
                    (c) => c.id === h.champions.find((ch) => ch.country === historicalCode)?.cup,
                  )?.name
                }
              </p>
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>클럽</th>
                      <th>그룹</th>
                      <th>승점</th>
                      <th>득점</th>
                      <th>실점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr
                        key={row[0]}
                        className={w.clubs[row[0]].id === w.playerClub ? s.own : undefined}
                      >
                        <td>{i + 1}</td>
                        <td>{w.clubs[row[0]].name}</td>
                        <td>{String.fromCharCode(65 + row[2])}</td>
                        <td>{row[3]}</td>
                        <td>{row[4]}</td>
                        <td>{row[5]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Panel>
        </>
      )}
      <Panel title="그해의 결정들">
        <div className={s.panelBody}>
          <ul className={s.timeline}>
            {archive?.events
              .filter((e) => e.kind !== 'gate')
              .map((e, i) => (
                <li key={i}>
                  <small>
                    {e.year} · ROUND {e.round}{' '}
                    {e.amount && `· ${e.amount} ${e.currency} (원래 최소 단위)`}
                  </small>
                  <b>{e.title}</b>
                  <p>{e.detail}</p>
                </li>
              ))}
          </ul>
        </div>
      </Panel>
      {match && (
        <Dialog label="지난 경기 상세" onClose={() => setMatch(undefined)} wide>
          <button onClick={() => setMatch(undefined)}>닫기</button>
          <h2>
            {seasonName(match.year)} · {kindLabel[match.kind]}
          </h2>
          <Pitch playback={archivePlayback(match)} summary world={w} />
          <h3>선수별 기록 · 우리 클럽</h3>
          <div className={s.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>득점</th>
                  <th>선수</th>
                  <th>도움</th>
                  <th>패스 성공/시도</th>
                  <th>슈팅/유효</th>
                  <th>태클</th>
                  <th>선방</th>
                </tr>
              </thead>
              <tbody>
                {match.players.map((p) => (
                  <tr key={p.id}>
                    <td>{p.metrics[0]}</td>
                    <td>{w.players.find((owned) => owned.id === p.id)?.name}</td>
                    <td>{p.metrics[1]}</td>
                    <td>
                      {p.metrics[3]}/{p.metrics[2]}
                    </td>
                    <td>
                      {p.metrics[4]}/{p.metrics[5]}
                    </td>
                    <td>{p.metrics[6]}</td>
                    <td>{p.metrics[9]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.muted}>
            전체 경기 기록은 보존됩니다. 과거 관전에서는 저장된 골 이벤트를 재생하며, 상세 분 단위
            패스와 이동 경로는 저장하지 않습니다.
          </p>
        </Dialog>
      )}
    </>
  );
}
export default function Rich({ state, client, page }: Props & { page: Page }) {
  if (page === 'manager') return <ManagerView state={state} client={client} />;
  if (page === 'squad') return <Squad state={state} client={client} />;
  if (page === 'business') return <Business state={state} client={client} />;
  return <History state={state} client={client} />;
}
