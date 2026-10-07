import { useId, useState, type ReactNode } from 'react';
import type { Command } from '../../../../packages/contracts/src/types';
import { clubOf, quote } from '../../../../packages/engine/src/world';
import { financialBreakdown, roundShare } from '../../../../packages/engine/src/finance';
import { sponsorAnnual } from '../../../../packages/engine/src/operations';
import { ratio } from '../../../../packages/engine/src/primitives';
import {
  facilityInvestmentPreview,
  fixedCostRunway,
  ticketInvestmentPreview,
} from '../../../../packages/engine/src/investment';
import type { ClientState, GameClient } from '../runtime/client';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { FinancialBreakdown } from './FinancialBreakdown';
import { money, number } from './format';
import s from './BusinessWorkbench.module.css';

const tabs = [
  ['facility', '시설'],
  ['sponsor', '후원'],
  ['marketing', '마케팅'],
  ['ticket', '티켓'],
] as const;
type Tab = (typeof tabs)[number][0];
const sponsorNames = {
  stable: '안정적인 후원',
  performance: '성과에 따른 후원',
  exclusive: '독점 후원',
  indexed: '물가 연동 후원',
};
const runway = (rounds: number) => (rounds >= 999 ? '999라운드 이상' : `${rounds}라운드`);

export function BusinessWorkbench({
  state,
  client,
  legacy,
}: {
  state: ClientState;
  client: GameClient;
  legacy?: ReactNode;
}) {
  const w = state.view!.world,
    club = clubOf(w),
    finance = state.view!.finance || financialBreakdown(w);
  const format = (value: string) => money(value, club.country, w.year);
  const processing = useGameState((current) => current.processing);
  const readonly = useGameState((current) => current.readonly);
  const error = useGameState((current) => current.error);
  const blocked = processing || readonly || !!error;
  const [tab, setTab] = useState<Tab>('facility');
  const [sheet, setSheet] = useState<'facility' | 'ledger' | 'legacy'>();
  const [draft, setDraft] = useState(String(w.ticket));
  const [message, setMessage] = useState('');
  const tabId = useId();
  const facility = facilityInvestmentPreview(w);
  const price = Number(draft),
    validPrice = draft.trim() !== '' && Number.isFinite(price) && price >= 0.01 && price <= 0.5;
  const ticket = validPrice ? ticketInvestmentPreview(w, price) : undefined;
  const games = Math.max(
    1,
    w.fixtures.filter(
      (fixture) =>
        ['league', 'lower'].includes(fixture.kind) &&
        (fixture.home === w.playerClub || fixture.away === w.playerClub),
    ).length,
  );
  const played = w.tables[w.playerClub]?.played || 0;
  const supportUsed = state.view!.supportUsed;
  const supportAmount = quote(club.country, w.year, 150);
  const act = async (command: Command, success: string) => {
    if (blocked) return false;
    const reply = await client.command(command, { background: true });
    setMessage(reply?.ok ? success : client.state.error || '선택을 저장하지 못했어요.');
    return !!reply?.ok;
  };
  const contribution = (
    <div className={s.contribution}>
      <div>
        <b>운영을 이어갈 자금</b>
        <p>
          {format(supportAmount)} 추가 출자 · 이번 시즌 {supportUsed}/3회 · 평판 2 감소
        </p>
      </div>
      <button
        disabled={blocked || supportUsed >= 3}
        onClick={() =>
          void act({ type: 'support' }, '추가 출자를 기록했어요. 운영 매출과 별도로 남습니다.')
        }
      >
        추가 출자
      </button>
    </div>
  );
  return (
    <section className={s.workbench} aria-label="클럽 투자 계획">
      <header className={s.heading}>
        <h2>클럽에 투자하기</h2>
        <span>내일의 성장, 오늘의 여유.</span>
      </header>
      <div className={s.summary}>
        <div>
          <span>운영 자금</span>
          <b>{format(w.cash)}</b>
        </div>
        <div>
          <span>다음 고정 지출</span>
          <b>{format(finance.costs.nextRound)}</b>
        </div>
        <div>
          <span>고정 지출 여유</span>
          <b>{runway(fixedCostRunway(w.cash, finance.costs.annual))}</b>
        </div>
      </div>
      <p className={s.note}>
        자금 여유는 급여와 시설 유지비 기준이에요. 미래 수입과 경기 개최비는 별도로 봐요.
      </p>
      {BigInt(w.cash) < 0n && contribution}
      <div className={s.tabs} role="tablist" aria-label="클럽 투자 선택">
        {tabs.map(([value, label], index) => (
          <button
            key={value}
            id={`${tabId}-${value}-tab`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={`${tabId}-${value}-panel`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => setTab(value)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              setTab(tabs[next][0]);
              document.getElementById(`${tabId}-${tabs[next][0]}-tab`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`${tabId}-${tab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-${tab}-tab`}
        className={s.panel}
      >
        {tab === 'facility' ? (
          <>
            <div className={s.panelHeading}>
              <div>
                <h3>우리 구장의 다음 단계</h3>
                <p>시설 Lv.{w.facilities} · 선수 육성과 관중석을 키워요.</p>
              </div>
              <span>
                Lv.{facility.facilitiesBefore} → {facility.facilitiesAfter}
              </span>
            </div>
            <div className={s.metrics}>
              <div>
                <span>수용 인원</span>
                <b>
                  {number(facility.capacityBefore)} → {number(facility.capacityAfter)}명
                </b>
              </div>
              <div>
                <span>현재 홈 관중 예상</span>
                <b>
                  {number(finance.gate.attendanceLow)}–{number(finance.gate.attendanceHigh)}명
                </b>
              </div>
              <div>
                <span>즉시 확장 비용</span>
                <b>{format(facility.cost)}</b>
              </div>
              <div>
                <span>연간 유지비 증가</span>
                <b>+{format(facility.maintenanceIncrease)}</b>
              </div>
              <div>
                <span>투자 후 자금</span>
                <b>{format(facility.cashAfter)}</b>
              </div>
              <div>
                <span>투자 후 고정 지출 여유</span>
                <b>{runway(facility.runwayRounds)}</b>
              </div>
            </div>
            <p className={s.note}>{facility.reason}</p>
            <button
              className={s.primary}
              disabled={blocked || !facility.eligible || !facility.affordable}
              onClick={(event) => {
                event.currentTarget.focus();
                setSheet('facility');
              }}
            >
              시설 투자 검토
            </button>
          </>
        ) : tab === 'sponsor' ? (
          <>
            <div className={s.panelHeading}>
              <h3>한 자리의 파트너</h3>
              <span>실제 리그 경기마다 분할 지급</span>
            </div>
            <p className={s.note}>
              올해 예정된 우리 리그 {games}경기 기준이에요. 계약 이후 경기만 지급하며 지난 경기를
              소급해 받지 않아요.
            </p>
            {w.sponsor ? (
              <article className={s.card} data-testid="current-sponsor">
                <h3>{w.sponsor.name}</h3>
                <p>
                  {sponsorNames[w.sponsor.kind]} · {w.sponsor.until}년 만료
                </p>
                <div className={s.metrics}>
                  <div>
                    <span>현재 유효 연간 기본금</span>
                    <b>{format(sponsorAnnual(w))}</b>
                  </div>
                  <div>
                    <span>다음 리그 기본 지급분</span>
                    <b>
                      {format(
                        played < games ? roundShare(sponsorAnnual(w), played + 1, games) : '0',
                      )}
                    </b>
                  </div>
                </div>
                {w.sponsor.kind === 'indexed' && (
                  <p className={s.note}>
                    계약 기준 기본금 {format(w.sponsor.annual)} · 현재 물가에 맞춰 조정해요.
                  </p>
                )}
                {w.sponsor.kind === 'performance' && (
                  <p className={s.note}>
                    리그·하위 리그의 홈과 원정 모두 승리{' '}
                    {format(ratio(w.sponsor.bonus, 1n, BigInt(games)))} · 무승부{' '}
                    {format(ratio(w.sponsor.bonus, 1n, BigInt(games * 3)))} 추가 지급
                  </p>
                )}
                {w.sponsor.kind === 'exclusive' && (
                  <p className={s.note}>
                    새로운 자체 상품 캠페인을 시작할 수 없어요. 이미 진행 중인 캠페인은 정산을
                    이어가요.
                  </p>
                )}
              </article>
            ) : (
              <div className={s.cards}>
                {state.view!.sponsors.map((offer) => (
                  <article
                    className={s.card}
                    key={offer.kind}
                    data-testid={`sponsor-${offer.kind}`}
                  >
                    <h3>{sponsorNames[offer.kind]}</h3>
                    <p>
                      {offer.name} · {offer.until}년 만료
                    </p>
                    <div className={s.metrics}>
                      <div>
                        <span>연간 기본금</span>
                        <b>{format(offer.annual)}</b>
                      </div>
                      <div>
                        <span>다음 리그 기본 지급분</span>
                        <b>
                          {format(
                            played < games ? roundShare(offer.annual, played + 1, games) : '0',
                          )}
                        </b>
                      </div>
                    </div>
                    <p className={s.note}>
                      {offer.kind === 'performance'
                        ? `리그·하위 리그 홈/원정 승리 ${format(ratio(offer.bonus, 1n, BigInt(games)))} · 무승부 ${format(ratio(offer.bonus, 1n, BigInt(games * 3)))} 추가 지급`
                        : offer.kind === 'exclusive'
                          ? '새 상품 캠페인이 제한돼요. 진행 중인 캠페인은 이어갑니다.'
                          : offer.kind === 'indexed'
                            ? '계약 이후 물가에 따라 기본금이 조정돼요.'
                            : '계약한 기본금의 명목 금액을 유지해요.'}
                    </p>
                    <button
                      disabled={blocked}
                      onClick={() =>
                        void act(
                          { type: 'sponsor', kind: offer.kind },
                          '후원 계약을 저장했어요. 이후 리그 경기부터 나눠 지급됩니다.',
                        )
                      }
                    >
                      후원 계약
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        ) : tab === 'marketing' ? (
          <>
            <div className={s.panelHeading}>
              <h3>동네와 함께 성장하기</h3>
              <span>정산까지 4라운드</span>
            </div>
            <div className={s.cards}>
              {state.view!.campaigns.map((offer) => {
                const pending = w.campaigns.find((campaign) => campaign.kind === offer.kind);
                const exclusive =
                  w.sponsor?.kind === 'exclusive' && offer.kind === 'merchandise' && !pending;
                const affordable = BigInt(w.cash) >= BigInt(offer.cost);
                return (
                  <article
                    className={s.card}
                    key={offer.kind}
                    data-testid={`campaign-${offer.kind}`}
                  >
                    <h3>{offer.label}</h3>
                    <div className={s.metrics}>
                      <div>
                        <span>{pending ? '지급한 비용' : '시작 비용'}</span>
                        <b>{format(pending?.cost || offer.cost)}</b>
                      </div>
                      <div>
                        <span>{pending ? '현재 운영 자금' : '시작 후 자금'}</span>
                        <b>
                          {format(
                            pending ? w.cash : (BigInt(w.cash) - BigInt(offer.cost)).toString(),
                          )}
                        </b>
                      </div>
                      {!pending && (
                        <>
                          <div>
                            <span>예상 총 회수</span>
                            <b>
                              {format(offer.min)}–{format(offer.max)}
                            </b>
                          </div>
                          <div>
                            <span>예상 순수익</span>
                            <b>
                              {format((BigInt(offer.min) - BigInt(offer.cost)).toString())}–
                              {format((BigInt(offer.max) - BigInt(offer.cost)).toString())}
                            </b>
                          </div>
                        </>
                      )}
                    </div>
                    <p className={s.note}>
                      {pending
                        ? `이미 시작 비용을 지급했어요. ${pending.remaining}라운드 뒤 실제 수입과 팬을 정산해요.`
                        : '4라운드 후 수입과 팬을 정산해요. 현재 수요 기준의 범위이며 순수익은 달라질 수 있어요.'}
                    </p>
                    <button
                      disabled={blocked || !!pending || exclusive || !affordable}
                      onClick={() =>
                        void act(
                          { type: 'campaign', kind: offer.kind },
                          '캠페인을 시작했어요. 4라운드 후 실제 결과를 확인하세요.',
                        )
                      }
                    >
                      {pending ? `${pending.remaining}라운드 남음` : '캠페인 시작'}
                    </button>
                    {exclusive && (
                      <p className={s.warning}>
                        독점 후원 중에는 새 상품 캠페인을 시작할 수 없어요.
                      </p>
                    )}
                    {!affordable && !pending && (
                      <p className={s.warning}>시작 비용에 쓸 자금이 부족해요.</p>
                    )}
                  </article>
                );
              })}
            </div>
            {w.events
              .filter((event) => event.kind === 'campaign-result')
              .slice(-2)
              .map((event, index) => (
                <p className={s.result} key={index}>
                  <b>{event.title}</b>
                  <span>{event.detail}</span>
                </p>
              ))}
          </>
        ) : (
          <>
            <div className={s.panelHeading}>
              <h3>가격과 관중 사이</h3>
              <span>현재 기준가격 {w.ticket.toFixed(2)}</span>
            </div>
            <label className={s.ticketInput}>
              1901년 기준 티켓 가격
              <input
                aria-label="티켓 기본가격"
                type="number"
                min="0.01"
                max="0.5"
                step="0.01"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                disabled={blocked}
              />
            </label>
            {ticket ? (
              <>
                <div className={s.gates} aria-label="티켓 가격 예상 비교">
                  {(
                    [
                      ['현재 가격', ticket.before],
                      ['새 가격 초안', ticket.after],
                    ] as const
                  ).map(([label, gate]) => (
                    <div key={label}>
                      <h4>{label}</h4>
                      <dl>
                        <div>
                          <dt>예상 관중</dt>
                          <dd>
                            {number(gate.attendanceLow)}–{number(gate.attendanceHigh)}명
                          </dd>
                        </div>
                        <div>
                          <dt>입장·상품 수입</dt>
                          <dd>
                            {format(gate.incomeLow)}–{format(gate.incomeHigh)}
                          </dd>
                        </div>
                        <div>
                          <dt>경기 개최비</dt>
                          <dd>
                            {format(gate.costLow)}–{format(gate.costHigh)}
                          </dd>
                        </div>
                        <div>
                          <dt>개최비를 뺀 수지</dt>
                          <dd>
                            {format((BigInt(gate.incomeLow) - BigInt(gate.costLow)).toString())}–
                            {format((BigInt(gate.incomeHigh) - BigInt(gate.costHigh)).toString())}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ))}
                </div>
                <p className={s.note}>
                  새 가격 1장 {format(quote(club.country, w.year, price))} · 높은 가격은 수요를
                  줄여요. 적용하기 전까지 실제 가격은 유지됩니다.
                </p>
              </>
            ) : (
              <p className={s.warning}>기준가격은 0.01–0.50 사이로 입력하세요.</p>
            )}
            <button
              className={s.primary}
              disabled={blocked || !validPrice || price === w.ticket}
              onClick={() =>
                void act(
                  { type: 'ticket', price },
                  '티켓 가격을 적용했어요. 다음 홈 경기부터 반영됩니다.',
                )
              }
            >
              티켓 가격 적용
            </button>
          </>
        )}
      </div>
      {message && (
        <p className={s.message} role="status">
          {message}
        </p>
      )}
      <div className={s.detailActions}>
        <button
          onClick={(event) => {
            event.currentTarget.focus();
            setSheet('ledger');
          }}
        >
          수입·지출 장부
        </button>
        {legacy && (
          <button
            onClick={(event) => {
              event.currentTarget.focus();
              setSheet('legacy');
            }}
          >
            화폐·물가 기준
          </button>
        )}
      </div>
      {BigInt(w.cash) >= 0n && (
        <details className={s.recovery}>
          <summary>운영을 이어갈 추가 출자</summary>
          {contribution}
        </details>
      )}
      {sheet === 'facility' ? (
        <Dialog
          label="시설 투자 확인"
          onClose={() => setSheet(undefined)}
          actions={
            <div className={s.reviewActions}>
              <button onClick={() => setSheet(undefined)}>취소</button>
              <button
                className={s.primary}
                disabled={blocked || !facility.eligible || !facility.affordable}
                onClick={async () => {
                  if (await act({ type: 'facility' }, '시설 확장과 새 유지비를 기록했어요.'))
                    setSheet(undefined);
                }}
              >
                시설 확장
              </button>
            </div>
          }
        >
          <h3>
            시설 Lv.{facility.facilitiesBefore} → Lv.{facility.facilitiesAfter}
          </h3>
          <p className={s.note}>
            선수 성장과 관중석을 키우는 대신, 즉시 비용과 반복 유지비가 늘어요.
          </p>
          <div className={s.metrics}>
            <div>
              <span>즉시 지출</span>
              <b>{format(facility.cost)}</b>
            </div>
            <div>
              <span>확장 후 자금</span>
              <b>{format(facility.cashAfter)}</b>
            </div>
            <div>
              <span>수용 인원</span>
              <b>
                {number(facility.capacityBefore)} → {number(facility.capacityAfter)}명
              </b>
            </div>
            <div>
              <span>현재 홈 관중 예상</span>
              <b>
                {number(finance.gate.attendanceLow)}–{number(finance.gate.attendanceHigh)}명
              </b>
            </div>
            <div>
              <span>연간 시설 유지비</span>
              <b>
                {format(facility.maintenanceBefore)} → {format(facility.maintenanceAfter)}
              </b>
            </div>
            <div>
              <span>유지비 증가</span>
              <b>+{format(facility.maintenanceIncrease)}</b>
            </div>
            <div>
              <span>새 연간 고정 지출</span>
              <b>{format(facility.annualAfter)}</b>
            </div>
            <div>
              <span>투자 후 고정 지출 여유</span>
              <b>{runway(facility.runwayRounds)}</b>
            </div>
          </div>
          <p className={s.note}>자금 여유에는 앞으로의 수입과 경기 개최비를 포함하지 않았어요.</p>
        </Dialog>
      ) : sheet === 'ledger' ? (
        <Dialog
          label="클럽 수입·지출 장부"
          onClose={() => setSheet(undefined)}
          wide
          actions={
            <div className={s.close}>
              <button onClick={() => setSheet(undefined)}>장부 확인 마치기</button>
            </div>
          }
        >
          <FinancialBreakdown w={w} breakdown={finance} />
        </Dialog>
      ) : sheet === 'legacy' && legacy ? (
        <Dialog
          label="화폐·물가 기준"
          onClose={() => setSheet(undefined)}
          wide
          actions={
            <div className={s.close}>
              <button onClick={() => setSheet(undefined)}>기록 확인 마치기</button>
            </div>
          }
        >
          {legacy}
        </Dialog>
      ) : null}
    </section>
  );
}
