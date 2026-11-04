import { useEffect, useState } from 'react';
import type { FacilityPart, PolicyKey, PolicyLevel, World } from '../../../../packages/contracts/src/types';
import { POLICY_INFO, policyEffects, policyOf } from '../../../../packages/engine/src/policy';
import {
  ACADEMY_FACILITY, FACILITY_PART_LABEL, TRAINING_GROUND, STADIUM_STEPS,
  facilityWork, partLevel, partTop,
} from '../../../../packages/engine/src/facilities';
import { facilityInvestmentPreview } from '../../../../packages/engine/src/investment';
import { operatingCosts, roundShare } from '../../../../packages/engine/src/finance';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { STAFF_INFO, STAFF_ROLES, staffMember } from '../../../../packages/engine/src/staff-info';
import type { ClientState, GameClient } from '../runtime/client';
import { gameActionsBlocked, useGameState } from '../runtime/store';
import { Card } from './Card';
import { FacilityArt } from './FacilityArt';
import { Dialog } from './Dialog';
import { DeskStats } from './OfficeDesk';
import { Money } from './Money';
import { PixelIcon } from './PixelIcon';
import { number } from './format';
import { useAddressTab } from './PageTabs';
import { OPERATIONS_VIEWS, operationsAddress } from './clubSections';
import { INVESTMENT_AREAS, INVESTMENT_PAGES, type InvestmentArea } from './investmentAreas';
import { openInvestment, openDecisionSettings, useFacilityRequest } from './state';
import { BusinessWorkbench } from './BusinessWorkbench';
import { InvestmentTotals } from './InvestmentTotals';
import { BuildSetting, InvestmentSlider, TicketSetting, useClubSettingAction as useInvestmentAction } from './ClubSettingControl';
import { PASSIVE_BUILDS, PASSIVE_POLICIES } from './clubControls';
import { OwnerFunds } from './OwnerSheet';
import { FixtureKitSelector } from './FixtureKitSelector';
import s from './InvestmentView.module.css';

function Amount({ w, value, plain = false }: { w: World; value: string | bigint; plain?: boolean }) {
  return <Money value={value} code={clubOf(w).country} year={w.year} plain={plain} />;
}

function BudgetSetting({ w, client, policyKey }: { w: World; client: GameClient; policyKey: PolicyKey }) {
  const policy = policyOf(w);
  const current = policy[policyKey];
  const [selected, setSelected] = useState<PolicyLevel>(current);
  useEffect(() => setSelected(current), [current]);
  const action = useInvestmentAction(client);
  const info = POLICY_INFO[policyKey];
  const option = info.levels.find((level) => level.level === selected)!;
  const effects = policyEffects({ ...policy, [policyKey]: selected });
  const preview = operatingCosts({ ...w, policy: { ...policy, [policyKey]: selected } });
  const base = operatingCosts({ ...w, policy: { ...policy, [policyKey]: 1 } });
  const annual = policyKey === 'support' ? preview.expenses : policyKey === 'academy' ? preview.academy
    : policyKey === 'recruitment' || policyKey === 'tour' ? undefined
    : (BigInt(preview.annual) - BigInt(base.annual)).toString();
  return (
    <Card surface="sheet" title={info.label} meta={policyKey === 'tour' ? '시즌 운영' : '운영 투자'} className={s.panel} data-control={`policy:${policyKey}`}>
      <p className={s.note}>현재 적용 · {info.levels.find((level) => level.level === current)!.name}</p>
      <InvestmentSlider
        label={`${info.label} 수준`}
        options={info.levels.map((level) => ({ value: level.level, name: level.name }))}
        value={selected}
        disabled={action.blocked}
        onChange={setSelected}
      />
      <div className={s.selection} data-surface="inset">
        {policyKey === 'support' ? (
          <dl className={s.supportFacts}>
            <div><dt>연간 운영비</dt><dd><Amount w={w} value={preview.expenses} /></dd></div>
            <div><dt>협상 호감</dt><dd>{effects.goodwill > 0 ? '+' : ''}{effects.goodwill}%</dd></div>
            <div><dt>선수 성장</dt><dd>×{effects.developmentMultiplier}</dd></div>
            <div><dt>추가 피로 회복</dt><dd>{effects.recoveryBonus > 0 ? '+' : ''}{effects.recoveryBonus}</dd></div>
          </dl>
        ) : <>
        <b>{option.name}</b>
        <p>{option.summary}</p>
        {annual !== undefined && (
          <DeskStats label={`${info.label} 비용`} stats={[
            { label: '이 항목 연간 투자', value: <Amount w={w} value={annual} /> },
            { label: '다음 라운드 지출', value: <Amount w={w} value={roundShare(annual, w.round >= 46 ? 0 : w.round + 1)} /> },
            { label: '구단 연간 고정비 합계', value: <Amount w={w} value={preview.annual} /> },
          ]} />
        )}
        </>}
      </div>
      <div className={s.apply}>
        <p className={s.note}>{policyKey === 'recruitment'
          ? '실제 이적료와 급여는 영입 계약을 체결할 때 결정됩니다.'
          : policyKey === 'support'
            ? '지원 운영비는 다음 정산부터 반영됩니다. 기존 선수·감독·스태프 급여는 별도입니다.'
            : policyKey === 'tour' ? '시즌 시작에 투어 수입·인지도·피로가 함께 반영됩니다.'
            : '반복 지출은 다음 정산부터 반영됩니다.'}</p>
        <button type="button" data-ui="primary" disabled={action.blocked || selected === current}
          onClick={() => void action.apply({ type: 'club-policy', key: policyKey, level: selected }, `${info.label} 수준을 적용했어요.`)}>
          {action.busy ? '적용 중…' : policyKey === 'tour' ? '투어 일정 적용' : '투자 수준 적용'}
        </button>
      </div>
      {action.error && <p role="alert">{action.error}</p>}
      {action.message && <p role="status" className={s.note}>{action.message}</p>}
    </Card>
  );
}

function facilityEffect(part: FacilityPart, level: number) {
  if (part === 'stadium') return `${number(STADIUM_STEPS[level].capacity)}석`;
  if (part === 'training') {
    const terms = TRAINING_GROUND[level];
    return `선수 성장 ×${terms.growth} · 추가 피로 회복 +${terms.recoveryBonus} · 협상 호감 +${terms.goodwill}%`;
  }
  const effect = ACADEMY_FACILITY[level];
  return `입단 +${effect.intake}명 · 잠재력 +${effect.potential} · 성장 ×${effect.growth}`;
}

function facilityBenefits(part: FacilityPart, level: number): readonly (readonly [string, string])[] {
  if (part === 'training') {
    const terms = TRAINING_GROUND[level];
    return [
      ['선수 성장', `×${terms.growth}`],
      ['추가 피로 회복', `+${terms.recoveryBonus}`],
      ['협상 호감', `+${terms.goodwill}%`],
    ];
  }
  if (part === 'academy') {
    const terms = ACADEMY_FACILITY[level];
    return [
      ['유소년 성장', `×${terms.growth}`],
      ['추가 입단 인원', `+${terms.intake}명`],
      ['입단 잠재력', `+${terms.potential}`],
    ];
  }
  return [['수용 인원', `${number(STADIUM_STEPS[level].capacity)}석`]];
}

function facilityUpgradeTitle(part: FacilityPart, expansion: boolean) {
  if (part === 'stadium') return expansion ? '경기장 증축' : '경기장 재건축';
  return `${FACILITY_PART_LABEL[part]} 업그레이드`;
}

function FacilitySnapshot({ w, part, level, maintenance, future = false }: {
  w: World;
  part: FacilityPart;
  level: number;
  maintenance: string;
  future?: boolean;
}) {
  const scene = {
    ...w,
    ...(part === 'training' ? { trainingGround: level }
      : part === 'academy' ? { academyFacility: level } : { stadium: level }),
  };
  return (
    <Card
      surface="detail"
      title={future ? '완공 후' : '현재'}
      className={s.facilitySnapshot}
      data-future={future || undefined}
      aria-label={`${future ? '완공 후' : '현재'} ${FACILITY_PART_LABEL[part]}`}
    >
      <div className={s.compareScene}>
        <FacilityArt kind={part} world={scene} view={part === 'stadium' ? 'exterior' : undefined} className={s.art} eager />
        <div className={s.overlay}>
          {part === 'stadium' && <small>{STADIUM_STEPS[level].name}</small>}
          <b>{level}/{partTop(part)}단계</b>
        </div>
      </div>
      <dl className={s.benefitFacts}>
        {facilityBenefits(part, level).map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <div className={s.maintenance}>
        <span>연간 유지비</span>
        <b><Amount w={w} value={maintenance} plain /></b>
      </div>
    </Card>
  );
}

function FacilityUpgrade({ w, client, part }: { w: World; client: GameClient; part: FacilityPart }) {
  const level = partLevel(w, part);
  const preview = facilityInvestmentPreview(w, part);
  const running = facilityWork(w, part);
  const next = preview.next;
  const action = useInvestmentAction(client);
  const [quote, setQuote] = useState<{
    from: number;
    to: number;
    cost: string;
    days: number;
    maintenanceBefore: string;
    maintenanceAfter: string;
    cashBefore: string;
    cashAfter: string;
    capacityDuring: number;
    expansion: boolean;
  }>();
  const label = FACILITY_PART_LABEL[part];
  return (
    <Card surface="sheet" title={label} meta="시설 투자" className={s.panel} id={`investment-facility-${part}`}>
      <div className={s.facilityScene}>
        <FacilityArt kind={part} world={w} view={part === 'stadium' ? 'exterior' : undefined} className={s.art} eager />
        <div className={`${s.overlay} ${s.facilityCaption}`}>
          <b>{level}/{partTop(part)}단계</b>
          <p>{facilityEffect(part, level)}</p>
        </div>
      </div>
      {running ? (
        <div className={s.selection} data-surface="inset" role="status">
          <b>{running.to}단계 공사 중 · 완공까지 {running.left}일</b>
          <progress max={running.days} value={running.days - running.left} aria-label={`${label} 공사 진행`} />
          <p>완공 후 {facilityEffect(part, running.to)}</p>
        </div>
      ) : next ? (
        <>
          <div className={s.facilityAction}>
            <button type="button" data-ui="primary" disabled={action.blocked || !preview.affordable || !preview.eligible}
              onClick={() => setQuote({
                from: level,
                to: next.to,
                cost: next.cost,
                days: next.days,
                maintenanceBefore: preview.partMaintenanceBefore,
                maintenanceAfter: preview.partMaintenanceAfter,
                cashBefore: w.cash,
                cashAfter: preview.cashAfter,
                capacityDuring: preview.capacityDuring,
                expansion: next.kind === 'expansion',
              })}>
              {part === 'stadium'
                ? `${facilityUpgradeTitle(part, next.kind === 'expansion')}하기`
                : `${label} ${next.to}단계로 업그레이드`}
            </button>
            {!preview.affordable && <p className={s.note}>공사를 시작하기에는 보유 자금이 부족합니다.</p>}
          </div>
        </>
      ) : <p className={s.note}>최고 단계 시설입니다.</p>}
      {action.error && !quote && <p role="alert">{action.error}</p>}
      {quote && (
        <Dialog
          label={`${facilityUpgradeTitle(part, quote.expansion)} · ${quote.days}일 소요`}
          wide
          onClose={() => { if (!action.busy) setQuote(undefined); }}
          summary={
            <dl className={s.upgradeFinances}>
              <div><dt>공사비</dt><dd><b><Amount w={w} value={quote.cost} plain /></b></dd></div>
              <div>
                <dt>재정 · 구단 잔고</dt>
                <dd className={s.balanceChange}>
                  <span className={s.previousMoney}><Amount w={w} value={quote.cashBefore} plain /></span>
                  <span aria-hidden="true">→</span>
                  <b><Amount w={w} value={quote.cashAfter} plain /></b>
                </dd>
              </div>
            </dl>
          }
          actions={
          <div className={s.dialogActions}>
            <button type="button" disabled={action.busy} onClick={() => setQuote(undefined)}>취소</button>
            <button type="button" data-ui="primary" disabled={action.blocked} onClick={async () => {
              if (await action.apply({ type: 'facility-upgrade', part, from: quote.from, cost: quote.cost }, '시설 공사를 시작했어요.')) setQuote(undefined);
            }}>{action.busy ? '시작 중…' : '공사비 지불하고 시작'}</button>
          </div>
        }>
          <div className={s.upgradeComparison}>
            <FacilitySnapshot w={w} part={part} level={quote.from} maintenance={quote.maintenanceBefore} />
            <span className={s.comparisonArrow} aria-hidden="true">→</span>
            <FacilitySnapshot w={w} part={part} level={quote.to} maintenance={quote.maintenanceAfter} future />
          </div>
          <div className={s.upgradeNotes}>
            {quote.expansion && <p>증축 중 수용 인원 {number(quote.capacityDuring)}석</p>}
            <p>공사비는 지금 지불하고, 효과와 유지비는 완공일부터 적용됩니다.</p>
            {part === 'training' && <p>성장 배율은 27세 미만 선수, 회복은 훈련 정산, 협상 호감은 완공 후 시작하는 협상에 적용됩니다.</p>}
          </div>
          {action.error && <p role="alert">{action.error}</p>}
        </Dialog>
      )}
    </Card>
  );
}

function CoachingInvestment({ w }: { w: World }) {
  const count = STAFF_ROLES.filter((post) => staffMember(w, post)).length;
  return (
    <>
      <Card surface="sheet" title={`현재 코치진 · ${count}/${STAFF_ROLES.length}명`} className={s.panel}>
        <DeskStats label="코치진 비용" stats={[
          { label: '연간 스태프 급여', value: <Amount w={w} value={operatingCosts(w).staffWages} /> },
          { label: '공석', value: `${STAFF_ROLES.length - count}자리` },
        ]} />
        <dl className={s.staff}>
          {STAFF_ROLES.map((post) => {
            const member = staffMember(w, post);
            return <div key={post}><dt>{STAFF_INFO[post].label}</dt><dd>{member ? <>{member.name} <small>OVR {member.ability}</small></> : '공석'}</dd></div>;
          })}
        </dl>
        <p className={s.note}>현재 재직자의 능력이 만드는 상시 효과입니다. 채용 지침과 인사는 결재 설정의 스태프 인사에서 관리합니다.</p>
        <button type="button" data-ui="secondary" aria-haspopup="dialog" onClick={() => openDecisionSettings('staff')}>결재 설정 · 스태프 인사</button>
      </Card>
    </>
  );
}

function InvestmentDetails({ area, state, client }: { area: InvestmentArea; state: ClientState; client: GameClient }) {
  const w = state.view!.world;
  const blocked = useGameState(gameActionsBlocked);
  return <>
    {PASSIVE_POLICIES[area].map((key) => <BudgetSetting key={key} w={w} client={client} policyKey={key} />)}
    {PASSIVE_BUILDS[area].map((slot) => <Card key={slot} surface="sheet" title="상시 운영 효과" className={s.panel}>
      <BuildSetting w={w} client={client} slot={slot} />
    </Card>)}
    {area === 'firstTeam' && <FacilityUpgrade w={w} client={client} part="training" />}
    {area === 'youth' && <FacilityUpgrade w={w} client={client} part="academy" />}
    {area === 'stadium' && <>
      <Card surface="sheet" title="입장 수입" className={s.panel}><TicketSetting w={w} client={client} /></Card>
      <FacilityUpgrade w={w} client={client} part="stadium" />
    </>}
    {area === 'coaches' && <CoachingInvestment w={w} />}
    {area === 'finance' && <>
      {w.owner && <OwnerFunds client={client} />}
      <BusinessWorkbench state={state} client={client} part="finance" />
    </>}
    {area === 'identity' && <>
      <BusinessWorkbench state={state} client={client} part="identity" />
      <Card surface="sheet" title="다음 경기 유니폼" className={s.panel}><FixtureKitSelector client={client} blocked={blocked} /></Card>
    </>}
  </>;
}

export function InvestmentView({ state, client }: { state: ClientState; client: GameClient }) {
  const w = state.view!.world;
  const [view] = useAddressTab('view', OPERATIONS_VIEWS, 'investment', { world: w.id, key: 'club-operations', path: '/club-operations', keepFirst: true });
  const [area] = useAddressTab('area', INVESTMENT_PAGES, 'overview', { world: w.id, key: 'investment-area', path: operationsAddress('investment') });
  const selected = INVESTMENT_AREAS.find((item) => item.id === area);
  const request = useFacilityRequest((store) => store.request);
  useEffect(() => {
    if (!request || !selected) return;
    useFacilityRequest.getState().take();
    const frame = requestAnimationFrame(() => document.getElementById(`investment-facility-${request}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    return () => cancelAnimationFrame(frame);
  }, [request, selected]);
  if (view !== 'investment') return (
    <div className={s.page}>
      <BusinessWorkbench state={state} client={client} part={view} />
    </div>
  );
  return (
    <section className={s.page} aria-label={selected ? `${selected.title} 투자` : '구단주 사무실'}>
      {selected ? (
        <>
          <header className={s.title}><h2>{selected.title}</h2><p>{selected.description}</p></header>
          <InvestmentTotals w={w} area={selected.id} />
          {selected.id !== 'firstTeam' && selected.id !== 'youth' && selected.id !== 'stadium' && (
            <div className={s.hero}>
              <FacilityArt kind={selected.art} world={w} className={s.art} eager />
              <div className={s.overlay}><b>{selected.title}</b></div>
            </div>
          )}
          <div className={s.details} key={`${w.id}:${selected.id}`}><InvestmentDetails area={selected.id} state={state} client={client} /></div>
        </>
      ) : (
        <>
          <header className={s.title}><h2>구단주 사무실</h2><p>투자·시설·상시 운영 효과를 관리하세요. 담당자의 판단 지침과 인사·계약은 결재 설정에서 정합니다.</p></header>
          <div className={s.gallery}>
            {INVESTMENT_AREAS.map((item) => (
              <button key={item.id} type="button" className={s.destination} aria-label={`${item.title} 투자 관리`} onClick={() => openInvestment(item.id)}>
                <FacilityArt kind={item.art} world={w} view={item.id === 'stadium' ? 'exterior' : undefined} className={s.art} />
                <span className={s.overlay}><b>{item.title}</b><span>{item.description}</span></span>
                <span className={s.enter} aria-hidden="true"><PixelIcon name="chevronRight" size={24} /></span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
