import { useEffect, useRef, useState } from 'react';
import type { Command, FacilityPart, PolicyKey, PolicyLevel, World } from '../../../../packages/contracts/src/types';
import { POLICY_INFO, policyEffects, policyOf } from '../../../../packages/engine/src/policy';
import { DIRECTION_INFO, directionOf } from '../../../../packages/engine/src/direction';
import {
  ACADEMY_FACILITY, FACILITY_PART_LABEL, TRAINING_GROUND, STADIUM_STEPS,
  facilityWork, partLevel, partTop, stadiumCapacity,
} from '../../../../packages/engine/src/facilities';
import { facilityInvestmentPreview } from '../../../../packages/engine/src/investment';
import { operatingCosts, roundShare, gateProjection } from '../../../../packages/engine/src/finance';
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
import { openInvestment, openPersonnel, useFacilityRequest } from './state';
import { BusinessWorkbench } from './BusinessWorkbench';
import s from './InvestmentView.module.css';

function Amount({ w, value }: { w: World; value: string | bigint }) {
  return <Money value={value} code={clubOf(w).country} year={w.year} />;
}

function useInvestmentAction(client: GameClient) {
  const blocked = useGameState(gameActionsBlocked);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const apply = async (command: Command, success: string) => {
    if (blocked || pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await client.command(command);
      setMessage(success);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { blocked: blocked || busy, busy, error, message, apply };
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
    <Card surface="sheet" title={info.label} meta="운영 투자" className={s.panel}>
      <p className={s.note}>현재 적용 · {info.levels.find((level) => level.level === current)!.name}</p>
      {policyKey === 'support' ? (
        <label className={s.budgetSlider}>
          <b>{option.name}</b>
          <input
            type="range"
            min={1}
            max={info.levels.length}
            step={1}
            value={selected}
            aria-label="선수단 투자 수준"
            aria-valuetext={option.name}
            disabled={action.blocked}
            onChange={(event) => setSelected(Number(event.currentTarget.value) as PolicyLevel)}
          />
          <span className={s.sliderNames} aria-hidden="true">
            {info.levels.map((level) => (
              <span key={level.level} data-selected={selected === level.level || undefined}>{level.name}</span>
            ))}
          </span>
        </label>
      ) : <div className={s.options} role="group" aria-label={`${info.label} 수준`}>
        {info.levels.map((level) => (
          <button
            key={level.level}
            type="button"
            data-ui={selected === level.level ? 'secondary' : undefined}
            aria-pressed={selected === level.level}
            disabled={action.blocked}
            onClick={() => setSelected(level.level)}
          >
            <small>{level.level}단계</small>
            <span>{level.name}</span>
          </button>
        ))}
      </div>}
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
            : '반복 지출은 다음 정산부터 반영됩니다.'}</p>
        <button type="button" data-ui="primary" disabled={action.blocked || selected === current}
          onClick={() => void action.apply({ type: 'club-policy', key: policyKey, level: selected }, `${info.label} 수준을 적용했어요.`)}>
          {action.busy ? '적용 중…' : '투자 수준 적용'}
        </button>
      </div>
      {action.error && <p role="alert">{action.error}</p>}
      {action.message && <p role="status" className={s.note}>{action.message}</p>}
    </Card>
  );
}

function facilityEffect(part: FacilityPart, level: number) {
  if (part === 'stadium') return `${number(STADIUM_STEPS[level].capacity)}석`;
  if (part === 'training') return `선수 성장 기반 +${TRAINING_GROUND[level].base}`;
  const effect = ACADEMY_FACILITY[level];
  return `입단 +${effect.intake}명 · 잠재력 +${effect.potential} · 성장 ×${effect.growth}`;
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
    title: string;
    days: number;
    maintenanceIncrease: string;
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
                title: next.label,
                days: next.days,
                maintenanceIncrease: preview.maintenanceIncrease,
                cashAfter: preview.cashAfter,
                capacityDuring: preview.capacityDuring,
                expansion: next.kind === 'expansion',
              })}>
              {label} {next.to}단계로 업그레이드
            </button>
            {!preview.affordable && <p className={s.note}>공사를 시작하기에는 보유 자금이 부족합니다.</p>}
          </div>
        </>
      ) : <p className={s.note}>최고 단계 시설입니다.</p>}
      {action.error && !quote && <p role="alert">{action.error}</p>}
      {quote && (
        <Dialog label={quote.title} onClose={() => { if (!action.busy) setQuote(undefined); }} actions={
          <div className={s.dialogActions}>
            <button type="button" disabled={action.busy} onClick={() => setQuote(undefined)}>취소</button>
            <button type="button" data-ui="primary" disabled={action.blocked} onClick={async () => {
              if (await action.apply({ type: 'facility-upgrade', part, from: quote.from, cost: quote.cost }, '시설 공사를 시작했어요.')) setQuote(undefined);
            }}>{action.busy ? '시작 중…' : '공사비 지불하고 시작'}</button>
          </div>
        }>
          <div className={s.selection} data-surface="inset">
            <p>완공 후 {facilityEffect(part, quote.to)}</p>
            <DeskStats label={`${label} 공사 견적`} stats={[
              { label: '공사비', value: <Amount w={w} value={quote.cost} /> },
              { label: '공사 기간', value: `${quote.days}일` },
              { label: '연간 유지비 증가', value: <Amount w={w} value={quote.maintenanceIncrease} /> },
              { label: '공사 후 잔고', value: <Amount w={w} value={quote.cashAfter} /> },
            ]} />
            {quote.expansion && <p>증축 중에는 관중석 일부가 닫힙니다. 공사 중 수용 {number(quote.capacityDuring)}석</p>}
            <p>공사비는 시작할 때 결제되며, 시설 효과와 유지비는 완공일부터 적용됩니다.</p>
          </div>
          {action.error && <p role="alert">{action.error}</p>}
        </Dialog>
      )}
    </Card>
  );
}

function CoachingInvestment({ w, client }: { w: World; client: GameClient }) {
  const current = directionOf(w, 'coaches');
  const [choice, setChoice] = useState(current);
  useEffect(() => setChoice(current), [current]);
  const action = useInvestmentAction(client);
  const options = DIRECTION_INFO.coaches.options;
  const option = options.find((option) => option.id === choice)!;
  const count = STAFF_ROLES.filter((post) => staffMember(w, post)).length;
  return (
    <>
      <Card surface="sheet" title="코치진 채용 투자 수준" meta="스태프 투자" className={s.panel}>
        <p className={s.note}>현재 적용 · {options.find((option) => option.id === current)!.name}</p>
        <div className={s.options} role="group" aria-label="코치진 채용 투자 수준">
          {options.map((option) => (
            <button key={option.id} type="button" aria-pressed={choice === option.id} data-ui={choice === option.id ? 'secondary' : undefined}
              disabled={action.blocked} onClick={() => setChoice(option.id)}>{option.name}</button>
          ))}
        </div>
        <div className={s.selection} data-surface="inset"><b>{option.name}</b><p>{option.summary}</p></div>
        <div className={s.apply}>
          <p className={s.note}>자동 채용·재계약의 기준입니다. 현재 계약한 코치의 연봉과 계약은 유지됩니다.</p>
          <button type="button" data-ui="primary" disabled={action.blocked || current === choice}
            onClick={() => void action.apply({ type: 'coaching-investment', choice }, '코치진 채용 기준을 적용했어요.')}>
            {action.busy ? '적용 중…' : '채용 투자 수준 적용'}
          </button>
        </div>
        {action.error && <p role="alert">{action.error}</p>}
        {action.message && <p role="status" className={s.note}>{action.message}</p>}
      </Card>
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
        <button type="button" data-ui="secondary" onClick={() => openPersonnel({ page: 'staff', view: 'coaches' })}>코치진 채용·계약 관리 ↗</button>
      </Card>
    </>
  );
}

function InvestmentDetails({ area, w, client }: { area: InvestmentArea; w: World; client: GameClient }) {
  if (area === 'firstTeam') return <><BudgetSetting w={w} client={client} policyKey="support" /><FacilityUpgrade w={w} client={client} part="training" /></>;
  if (area === 'youth') return <><BudgetSetting w={w} client={client} policyKey="academy" /><FacilityUpgrade w={w} client={client} part="academy" /><BudgetSetting w={w} client={client} policyKey="grassroots" /></>;
  if (area === 'coaches') return <CoachingInvestment w={w} client={client} />;
  if (area === 'scouting') return <><BudgetSetting w={w} client={client} policyKey="recruitment" /><BudgetSetting w={w} client={client} policyKey="globalScouting" /></>;
  if (area === 'community') return <><DeskStats label="팬 기반" stats={[
    { label: '지역 기반', value: Math.round(w.localBase ?? 0) },
    { label: '글로벌 인지도', value: Math.round(w.globalReach ?? 0) },
  ]} /><BudgetSetting w={w} client={client} policyKey="localInvest" /><BudgetSetting w={w} client={client} policyKey="globalMarketing" /></>;
  const gate = gateProjection(w);
  return <><DeskStats label="경기장 현황" stats={[
    { label: '현재 수용 인원', value: `${number(stadiumCapacity(w))}석` },
    { label: '예상 홈 관중', value: `${number(gate.attendanceLow)}–${number(gate.attendanceHigh)}명` },
  ]} /><FacilityUpgrade w={w} client={client} part="stadium" /></>;
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
          {selected.id === 'firstTeam' || selected.id === 'youth' || selected.id === 'stadium' ? (
            <header className={s.title}><h2>{selected.title}</h2><p>{selected.description}</p></header>
          ) : (
            <header className={s.hero}>
              <FacilityArt kind={selected.art} world={w} className={s.art} eager />
              <div className={s.overlay}><h2>{selected.title}</h2><p>{selected.description}</p></div>
            </header>
          )}
          <div className={s.details} key={`${w.id}:${selected.id}`}><InvestmentDetails area={selected.id} w={w} client={client} /></div>
        </>
      ) : (
        <>
          <header className={s.title}><h2>구단주 사무실</h2><p>투자할 분야를 선택하세요.</p></header>
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
