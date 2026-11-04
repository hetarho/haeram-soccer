import type { ReactNode } from 'react';
import type { PolicyKey, World } from '../../../../packages/contracts/src/types';
import { POLICY_INFO, policyEffects, policyOf, marketingFanGain } from '../../../../packages/engine/src/policy';
import { ACADEMY_FACILITY, TRAINING_GROUND, STADIUM_STEPS, facilityPartUpkeep, stadiumCapacity, partTop } from '../../../../packages/engine/src/facilities';
import { academyGrowth, academyIntakeSize, academyPotentialBonus, ACADEMY_LIMIT } from '../../../../packages/engine/src/academy';
import { operatingCosts, gateProjection } from '../../../../packages/engine/src/finance';
import { staffEffects } from '../../../../packages/engine/src/staff';
import { STAFF_ROLES, staffMember } from '../../../../packages/engine/src/staff-info';
import { buildEffects } from '../../../../packages/engine/src/build';
import { synergyEffects } from '../../../../packages/engine/src/synergy';
import { baseEffects, tourTerms } from '../../../../packages/engine/src/bases';
import { localSupporters } from '../../../../packages/engine/src/fans';
import { moraleBaseline } from '../../../../packages/engine/src/morale';
import { exclusiveSponsor, EXCLUSIVE_MARKETING } from '../../../../packages/engine/src/sponsors';
import { KIT_ROLE_LABELS } from './identityPreview';
import { askedFeeFactor } from '../../../../packages/engine/src/owner-traits';
import { DIRECTION_INFO, directionOf } from '../../../../packages/engine/src/direction';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { Card } from './Card';
import { Money } from './Money';
import { number } from './format';
import { INVESTMENT_AREAS, type InvestmentArea } from './investmentAreas';
import s from './InvestmentView.module.css';

type Totals = { rows: [string, ReactNode][]; meta: string; note: string };
const rounded = (value: number) => Number(value.toFixed(4));
const signed = (value: number) => `${value >= 0 ? '+' : ''}${rounded(value)}`;
const times = (value: number) => `×${rounded(value)}`;

/** Current effects and recurring costs, using the engine's completed facts and applied choices. */
function totalsOf(w: World, area: InvestmentArea): Totals {
  const policy = policyOf(w);
  const effects = policyEffects(policy);
  const costs = operatingCosts(w);
  const club = clubOf(w);
  const money = (value: string | bigint) => <Money value={value} code={club.country} year={w.year} plain />;
  const policyCost = (key: PolicyKey) => BigInt(costs.annual) - BigInt(operatingCosts({
    ...w, policy: { ...policy, [key]: 1 },
  }).annual);
  switch (area) {
    case 'firstTeam': {
      const ground = TRAINING_GROUND[w.trainingGround];
      const build = buildEffects(w);
      return {
        meta: `${POLICY_INFO.support.levels[policy.support - 1].name} · 훈련장 ${w.trainingGround}/${partTop('training')}단계`,
        rows: [
          ['연간 운영비', money(BigInt(costs.expenses) + BigInt(facilityPartUpkeep(w, 'training')))],
          ['협상 호감', `${signed(effects.goodwill + ground.goodwill)}%`],
          ['선수 성장', times(effects.developmentMultiplier * ground.growth)],
          ['추가 피로 회복', signed(effects.recoveryBonus + ground.recoveryBonus)],
          ['21세 이하 성장', times(effects.developmentMultiplier * ground.growth * build.youthGrowth)],
          ['분위기 기준점', rounded(moraleBaseline(w))],
        ],
        note: '지원비와 훈련장 유지비를 합산합니다. 성장에는 지원·훈련장·유망주 상시 효과를 곱하고, 분위기 기준점에는 문화·감독·시너지를 함께 반영합니다.',
      };
    }
    case 'youth': {
      const staff = staffEffects(w);
      const facility = ACADEMY_FACILITY[w.academyFacility];
      const count = (w.academy?.players ?? []).filter((player) => player.status === 'active').length;
      return {
        meta: `${POLICY_INFO.academy.levels[policy.academy - 1].name} · 유소년 시설 ${w.academyFacility}/${partTop('academy')}단계`,
        rows: [
          ['연간 운영비', money(BigInt(costs.academy) + BigInt(facilityPartUpkeep(w, 'academy')))],
          ['유소년 성장', times(academyGrowth(w))],
          ['다음 입단 인원', `${Math.min(academyIntakeSize(w), Math.max(0, ACADEMY_LIMIT - count))}명`],
          ['잠재력 보너스', signed(academyPotentialBonus(w) + staff.academyQuality)],
          ['입단 기량 보정', signed(facility.potential + Math.round(staff.academyQuality / 4))],
          ['현재 유소년', `${count}/${ACADEMY_LIMIT}명`],
        ],
        note: '유소년 투자와 시설 유지비를 합산합니다. 성장에는 코치·시설·투자 효과가 반영되며, 입단 능력은 선수별 기본값과 상한에 따라 달라집니다.',
      };
    }
    case 'coaches': {
      const staff = staffEffects(w);
      const factors = Object.values(staff.development);
      const count = STAFF_ROLES.filter((role) => staffMember(w, role)).length;
      const choice = DIRECTION_INFO.coaches.options.find((option) => option.id === directionOf(w, 'coaches'))!;
      return {
        meta: '현재 재직 스태프 기준',
        rows: [
          ['연간 스태프 급여', money(costs.staffWages)],
          ['재직 인원', `${count}/${STAFF_ROLES.length}명`],
          ['부문별 성장', `${times(Math.min(...factors))}–${times(Math.max(...factors))}`],
          ['1군 유망주 성장', times(staff.youthDevelopment)],
          ['유소년 성장', times(staff.academyGrowth)],
          ['추가 피로 회복', signed(staff.recoveryBonus)],
        ],
        note: `재직 중인 스태프의 실제 합산 효과입니다. 부문별 성장 배율은 담당 능력마다 다릅니다. 채용 지침(${choice.name})은 결재 설정의 스태프 인사에서 관리합니다.`,
      };
    }
    case 'stadium': {
      const gate = gateProjection(w);
      return {
        meta: STADIUM_STEPS[w.stadium].name,
        rows: [
          ['연간 유지비', money(facilityPartUpkeep(w, 'stadium'))],
          ['현재 수용 인원', `${number(stadiumCapacity(w))}석`],
          ['예상 홈 관중', `${number(gate.attendanceLow)}–${number(gate.attendanceHigh)}명`],
          ['예상 홈 수입', <>{money(gate.incomeLow)}–{money(gate.incomeHigh)}</>],
        ],
        note: '관중과 수입은 현재 가격·시설·팬 기반에서 동급 상대와 치르는 리그 홈 경기 기준입니다. 증축 중 닫힌 좌석도 반영합니다.',
      };
    }
    case 'scouting': {
      const staff = staffEffects(w);
      const build = buildEffects(w);
      const synergy = synergyEffects(w);
      return {
        meta: `${POLICY_INFO.globalScouting.levels[policy.globalScouting - 1].name} · 현재 스카우팅 환경`,
        rows: [
          ['연간 투자', money(policyCost('globalScouting'))],
          ['영입 후보 인원', `${Math.max(4, staff.scoutCandidates + build.marketCandidates + effects.scoutCandidates)}명`],
          ['해외 후보', `${effects.scoutCandidates}명`],
          ['잠재력 보정', signed(staff.scoutPotential + build.marketPotential + synergy.marketPotential + effects.scoutPotential)],
          ['능력 보정', signed(build.marketAbility)],
          ['협상 비용 배율', times(staff.feeMultiplier * synergy.feeMultiplier * askedFeeFactor(w))],
        ],
        note: '스카우트·망·방식·구단 시너지의 상시 효과를 합산합니다. 후보의 나이·유형은 결재 설정의 선수 영입 지침에서 정하며, 기조 자체는 이적료를 보정하지 않습니다.',
      };
    }
    case 'community': {
      const bases = baseEffects(w);
      const build = buildEffects(w);
      const synergy = synergyEffects(w);
      const tour = tourTerms(w, effects.tour);
      return {
        meta: '지역 투자 · 해외 마케팅 · 현재 팬 기반',
        rows: [
          ['연간 투자', money(policyCost('localInvest') + policyCost('globalMarketing'))],
          ['지역 기반', rounded(w.localBase ?? 0)],
          ['글로벌 인지도', rounded(w.globalReach ?? 0)],
          ['홍보 수요 배율', times(gateProjection(w).marketing)],
          ['라운드 홍보 팬 증가', signed(marketingFanGain(club.fans, effects.fanGrowth * build.marketingFans * (exclusiveSponsor(w) ? EXCLUSIVE_MARKETING : 1)))],
          ['지역 후원 가치', times(bases.localSponsor * build.sponsor * synergy.sponsor)],
          ['글로벌 후원 가치', times(bases.globalSponsor * build.sponsor * synergy.sponsor)],
          ['지역 서포터', `${number(localSupporters(w))}명`],
          ['시즌 시작 투어 수입', money(tour.income)],
          ['투어 효과', `인지도 +${tour.reach} · 피로 +${tour.fatigue}`],
        ],
        note: `해외 마케팅의 팬 증가와 현재 홍보·기반 효과입니다. 기반 목표는 지역 ${effects.baseTargets.local}, 글로벌 ${effects.baseTargets.global}입니다.`,
      };
    }
    case 'finance': {
      const build = buildEffects(w), synergy = synergyEffects(w);
      return {
        meta: '현재 자금 · 계약 · 수익 모델',
        rows: [
          ['구단 자금', money(w.cash)],
          ['사업자금', w.owner ? money(w.owner.fortune) : '구단주 없음'],
          ['연간 고정 지출', money(costs.annual)],
          ['후원 제안 배율', times(build.sponsor * synergy.sponsor)],
          ['신규 연봉 배율', times(build.wage)],
          ['배당 비율', `${w.owner?.dividendShare ?? 0}%`],
        ],
        note: '현재 계약의 고정 지출과 수익 모델의 상시 효과입니다. 사업 투자·자금 투입·배당은 아래에서 관리하고, 담당자의 지출 한도는 결재 설정의 공통 재정 지침에서 정합니다.',
      };
    }
    case 'identity': return {
      meta: '현재 구단 · 디자인 의뢰 · 경기복',
      rows: [
        ['구단', club.name],
        ['구단 자금', money(w.cash)],
        ['디자인 의뢰', w.designCommission ? '시안 선택 대기' : '없음'],
        ['경기 유니폼', w.kitChoice ? KIT_ROLE_LABELS[w.kitChoice.role] : '자동 선택'],
      ],
      note: '구단 디자인 의뢰·재의뢰·채택과 다음 경기 유니폼을 관리합니다. 의뢰 비용과 민심 변화는 선택 화면에 표시합니다.',
    };
  }
}

export function InvestmentTotals({ w, area }: { w: World; area: InvestmentArea }) {
  const title = INVESTMENT_AREAS.find((item) => item.id === area)!.title;
  const { rows, meta, note } = totalsOf(w, area);
  return (
    <Card surface="ticket" title={`${title} 종합 효과`} meta={`현재 적용 · ${meta}`} className={s.panel} aria-label={`${title} 합산 현황`}>
      <dl className={`${s.totalFacts} ${rows.length === 6 ? s.totalFactsSix : ''}`}>
        {rows.map(([label, value]) => (
          <div key={label} data-wide={['예상 홈 관중', '예상 홈 수입', '부문별 성장'].includes(label) || undefined}>
            <dt>{label}</dt><dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className={s.note}>{note}</p>
    </Card>
  );
}
