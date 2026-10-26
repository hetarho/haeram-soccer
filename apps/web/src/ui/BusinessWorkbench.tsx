import { lazy, Suspense, useState, type ReactNode } from 'react';
import type {
  Command,
  SponsorContract,
  SponsorKind,
} from '../../../../packages/contracts/src/types';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { quote } from '../../../../packages/engine/src/quotes';
import { financialBreakdown, roundShare } from '../../../../packages/engine/src/finance';
import {
  SPONSOR_KIND_LABELS,
  sponsorAnnual,
  type SponsorBonus,
} from '../../../../packages/engine/src/sponsors';
import { ratio } from '../../../../packages/engine/src/primitives';
import { CAMPAIGNS } from '../../../../packages/engine/src/ops-commercial';
import { fixedCostRunway } from '../../../../packages/engine/src/investment';
import type { ClientState, GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { FacilityParts } from './FacilityParts';
import { STADIUM_STEPS } from '../../../../packages/engine/src/facilities';
import { FinancialBreakdown } from './FinancialBreakdown';
import { number } from './format';
import { DecisionOwner } from './DecisionOwner';
import { Money } from './Money';
import s from './BusinessWorkbench.module.css';

/**
 * The operations page's views: the ledger and fixed costs, one kind of deal, or the club's design.
 */
export type WorkbenchPart = 'finance' | 'build' | 'sponsor' | 'marketing' | 'identity';
/** The design editor loads when 구단 디자인 first opens, outside the other pages (→ARCH-28). */
const ClubDesignView = lazy(() =>
  import('./ClubDesignView').then((module) => ({ default: module.ClubDesignView })),
);
const bonusRule: Record<SponsorBonus, string> = {
  none: '없음',
  promotion: '승격·우승',
  results: '리그 승리·무승부',
};
const bonusNote: Record<SponsorBonus, string> = {
  none: '보너스 없음',
  promotion: '보너스는 승격하거나 우승한 시즌이 끝날 때 지급',
  results: '리그 무승부는 승리 보너스의 1/3',
};
const kindNote: Record<SponsorKind, string> = {
  stable: '기본금의 명목 금액을 유지해요.',
  performance: '기본금이 낮은 대신 보너스가 커요.',
  exclusive: '구단 상품 권리를 가져가서 해외 마케팅으로 느는 팬이 절반이 돼요.',
  indexed: '계약 이후 물가에 따라 기본금이 조정돼요.',
};
const runway = (rounds: number) => (rounds >= 999 ? '999라운드 이상' : `${rounds}라운드`);
const season = (year: number) => `${year}/${String(year + 1).slice(2)} 시즌`;
/** When a closed slot opens (→ECON-8): its year in our country, marked when estimated. */
function opening(
  opens: number,
  status: string,
  capacity: number | undefined,
  year: number,
  seats: number,
) {
  const era = `${season(opens)}부터${status === 'observed' ? '' : '(추정)'}`;
  if (!capacity) return `${era} 열려요.`;
  return opens <= year
    ? `경기장이 ${number(capacity)}석 이상이 되면 열려요. 지금 ${number(seats)}석이에요.`
    : `${era}, 경기장 ${number(capacity)}석 이상이면 열려요.`;
}

function SponsorContractCard({
  contract,
  rule,
  effective,
  next,
  bonus,
  year,
  format,
}: {
  contract: SponsorContract;
  rule: SponsorBonus;
  effective: string;
  next: string;
  bonus: ReactNode;
  year: number;
  format: (value: string) => ReactNode;
}) {
  const remaining = contract.until - year;
  return (
    <article
      data-surface="panel"
      className={s.card}
      data-testid={`sponsor-contract-${contract.slot}`}
    >
      <h3>{contract.name}</h3>
      <p>
        {SPONSOR_KIND_LABELS[contract.kind]} · {season(contract.until - 1)}까지
        {remaining === 1 ? ' · 이번 시즌이 마지막이에요' : ` · ${remaining}시즌 남음`}
      </p>
      <div className={s.metrics}>
        <div>
          <span>현재 연간 기본금</span>
          <b>{format(effective)}</b>
        </div>
        <div>
          <span>다음 리그 기본 지급분</span>
          <b>{format(next)}</b>
        </div>
        {bonus}
        {contract.kind === 'indexed' && (
          <div>
            <span>계약 기준 기본금</span>
            <b>{format(contract.annual)}</b>
          </div>
        )}
      </div>
      <p className={s.note}>
        {bonusNote[rule]}
        {contract.kind !== 'stable' && ` · ${kindNote[contract.kind]}`}
      </p>
    </article>
  );
}

export function BusinessWorkbench({
  state,
  client,
  part,
  legacy,
}: {
  state: ClientState;
  client: GameClient;
  part: WorkbenchPart;
  legacy?: ReactNode;
}) {
  // 구단 디자인 is the authoritative design editor (→WEB-39/71/86), not a money view.
  if (part === 'identity')
    return (
      <Suspense
        fallback={
          <p className={s.note} role="status">
            구단 디자인을 여는 중…
          </p>
        }
      >
        {/* One view per game: a pending apply or its message never carries over (→WEB-74). */}
        <ClubDesignView key={state.view!.world.id} state={state} client={client} />
      </Suspense>
    );
  return <MoneyWorkbench state={state} client={client} part={part} legacy={legacy} />;
}

function MoneyWorkbench({
  state,
  client,
  part,
  legacy,
}: {
  state: ClientState;
  client: GameClient;
  part: Exclude<WorkbenchPart, 'identity'>;
  legacy?: ReactNode;
}) {
  const w = state.view!.world,
    club = clubOf(w),
    finance = state.view!.finance || financialBreakdown(w);
  const format = (value: string) => <Money value={value} code={club.country} year={w.year} />;
  const blocked = useGameState(gameActionsBlocked);
  const tab = part;
  const [sheet, setSheet] = useState<'ledger' | 'legacy'>();
  const [message, setMessage] = useState('');
  const games = Math.max(
    1,
    w.fixtures.filter(
      (fixture) =>
        ['league', 'lower'].includes(fixture.kind) &&
        (fixture.home === w.playerClub || fixture.away === w.playerClub),
    ).length,
  );
  const played = w.tables[w.playerClub]?.played || 0;
  // A slot's bonus as a metric: per league win for the main sponsor, once for the kit supplier.
  const bonusMetric = (rule: SponsorBonus, bonus: string) =>
    rule === 'none' ? null : (
      <div>
        <span>{rule === 'results' ? '리그 승리 보너스' : '승격·우승 보너스'}</span>
        <b>{format(rule === 'results' ? ratio(bonus, 1n, BigInt(games)) : bonus)}</b>
      </div>
    );
  const supportUsed = state.view!.supportUsed;
  const supportAmount = quote(club.country, w.year, 150);
  const act = async (command: Command, success: string) => {
    if (blocked) return false;
    const reply = await client.command(command, { background: true });
    setMessage(reply?.ok ? success : client.state.error || '선택을 저장하지 못했어요.');
    return !!reply?.ok;
  };
  const contribution = (
    <div data-surface="tile" className={s.contribution}>
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
    <section
      className={s.workbench}
      aria-label={
        part === 'finance' ? '클럽 재정' : part === 'marketing' ? '캠페인' : '클럽 투자 계획'
      }
    >
      {part === 'finance' ? (
        <>
          <header className={s.heading}>
            <h2>고정 지출과 장부</h2>
            <span>매 라운드 빠져나가는 돈과 지금까지의 기록</span>
          </header>
          <div className={s.summary}>
            <div data-surface="tile">
              <span>연간 고정 지출</span>
              <b>{format(finance.costs.annual)}</b>
            </div>
            <div data-surface="tile">
              <span>다음 고정 지출</span>
              <b>{format(finance.costs.nextRound)}</b>
            </div>
            <div data-surface="tile">
              <span>고정 지출 여유</span>
              <b>{runway(fixedCostRunway(w.cash, finance.costs.annual))}</b>
            </div>
          </div>
          <p className={s.note}>
            자금 여유는 급여·시설 유지비·지역·글로벌 투자·운영 경비 기준이에요. 미래 수입과 경기
            개최비는 별도로 봐요.
          </p>
          {BigInt(w.cash) < 0n && contribution}
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
            <details data-surface="panel" className={s.recovery}>
              <summary>운영을 이어갈 추가 출자</summary>
              {contribution}
            </details>
          )}
        </>
      ) : (
        <div data-surface="panel" className={s.panel}>
          {tab === 'build' ? (
            <FacilityParts w={w} blocked={blocked} act={act} format={format} />
          ) : tab === 'sponsor' ? (
            <>
              <div className={s.panelHeading}>
                <h3>후원 자리</h3>
                <span>자리마다 한 계약 · 리그 경기마다 분할 지급</span>
              </div>
              <p className={s.note}>
                올해 예정된 우리 리그 {games}경기 기준이에요. 금액은 계약할 때 정해져 기간 내내
                고정되고, 끝나면 그때의 디비전·평판·순위·팬으로 다시 매겨요. 계약 이후 경기만
                지급하며 강등되면 남은 기간이 30% 줄어요.
              </p>
              <div className={s.slots}>
                {state.view!.sponsors.map((view) => (
                  <section
                    data-surface="panel"
                    className={s.slot}
                    key={view.slot}
                    aria-label={view.label}
                    data-testid={`sponsor-slot-${view.slot}`}
                  >
                    <header className={s.slotHeading}>
                      <h4>{view.label}</h4>
                      <span>
                        구단 상업 가치의 {Math.round(view.share * 100)}% · 보너스{' '}
                        {bonusRule[view.bonus]}
                      </span>
                    </header>
                    {!view.open ? (
                      <p className={s.note}>
                        {opening(
                          view.opens,
                          view.status,
                          view.capacity,
                          w.year,
                          STADIUM_STEPS[w.stadium].capacity,
                        )}
                      </p>
                    ) : view.contract ? (
                      <SponsorContractCard
                        contract={view.contract}
                        rule={view.bonus}
                        effective={sponsorAnnual(w, view.contract)}
                        next={
                          view.contract.lastPaid < w.year && played < games
                            ? roundShare(sponsorAnnual(w, view.contract), played + 1, games)
                            : '0'
                        }
                        bonus={bonusMetric(view.bonus, view.contract.bonus)}
                        year={w.year}
                        format={format}
                      />
                    ) : (
                      <div className={s.cards}>
                        {view.offers.map((offer, index) => (
                          <article
                            data-surface="panel"
                            className={s.card}
                            key={offer.kind}
                            data-testid={`sponsor-${view.slot}-${offer.kind}`}
                          >
                            <h3>{SPONSOR_KIND_LABELS[offer.kind]}</h3>
                            <p>
                              {offer.name} · {offer.term}시즌 · {season(offer.until - 1)}까지
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
                                    played < games
                                      ? roundShare(offer.annual, played + 1, games)
                                      : '0',
                                  )}
                                </b>
                              </div>
                              {bonusMetric(view.bonus, offer.bonus)}
                            </div>
                            <p className={s.note}>
                              {bonusNote[view.bonus]} · {kindNote[offer.kind]}
                            </p>
                            <button
                              disabled={blocked}
                              onClick={() =>
                                void act(
                                  { type: 'sign-sponsor', slot: view.slot, offer: index },
                                  `${view.label} 계약을 맺었어요. 다음 리그 경기부터 나눠 지급돼요.`,
                                )
                              }
                            >
                              {view.label} 계약
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
              <section className={s.delegation} aria-label="후원 위임">
                <DecisionOwner
                  w={w}
                  decision="sponsors"
                  auto="열린 후원 자리가 비면 운영팀이 그 자리의 안정형 제안 중 보장 금액이 가장 큰 계약을 바로 맺고 알려 줘요."
                  owner="후원 계약은 직접 골라요. 시즌을 빈 자리로 시작할 때와, 마지막 시즌인 계약이 남은 4월 1일에 알림으로 알려 드려요."
                />
              </section>
            </>
          ) : tab === 'marketing' ? (
            <>
              {/* Campaigns are no more (→ECON-7): one started before settles here, read-only. */}
              <div className={s.panelHeading}>
                <h3>진행 중인 캠페인</h3>
                <span>새 캠페인은 없어요 · 방향의 지역·글로벌에서 투자해요</span>
              </div>
              <div className={s.cards}>
                {w.campaigns.map((campaign) => (
                  <article
                    data-surface="panel"
                    className={s.card}
                    key={campaign.id}
                    data-testid={`campaign-${campaign.kind}`}
                  >
                    <h3>
                      {CAMPAIGNS.find((offer) => offer.kind === campaign.kind)?.label ?? '캠페인'}
                    </h3>
                    <div className={s.metrics}>
                      <div>
                        <span>지급한 비용</span>
                        <b>{format(campaign.cost)}</b>
                      </div>
                      <div>
                        <span>현재 운영 자금</span>
                        <b>{format(w.cash)}</b>
                      </div>
                    </div>
                    <p className={s.note}>
                      {campaign.remaining}라운드 뒤 실제 수입과 팬을 정산해요.
                    </p>
                  </article>
                ))}
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
          ) : null}
        </div>
      )}
      {message && (
        <p className={s.message} role="status">
          {message}
        </p>
      )}
      {sheet === 'ledger' ? (
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
