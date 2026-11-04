import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import type { ReactNode } from 'react';
import type { PolicyKey, World } from '../../../../packages/contracts/src/types';
import { POLICY_INFO, policyEffects, policyOf } from '../../../../packages/engine/src/policy';
import {
  ACADEMY_FACILITY,
  TRAINING_GROUND,
  STADIUM_STEPS,
  facilityPartUpkeep,
  stadiumCapacity,
  partTop,
} from '../../../../packages/engine/src/facilities';
import { STAFF_ROLES, staffMember } from '../../../../packages/engine/src/staff-info';
import { buildEffects } from '../../../../packages/engine/src/build';
import { KIT_ROLE_LABELS } from './identityPreview';
import { askedFeeFactor } from '../../../../packages/engine/src/owner-traits';
import { DIRECTION_INFO, directionOf } from '../../../../packages/engine/src/direction';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { Card } from './Card';
import { Money } from './Money';
import { number } from './format';
import { INVESTMENT_AREAS, type InvestmentArea } from './investmentAreas';
import type { OfficeRead } from '../runtime/officeRead';
import { useOfficeRead } from './useOfficeRead';
import s from './InvestmentView.module.css';

type Totals = { rows: [string, ReactNode][]; meta: string; note: string };
const rounded = (value: number) => Number(value.toFixed(4));
const signed = (value: number) => `${value >= 0 ? '+' : ''}${rounded(value)}`;
const times = (value: number) => `×${rounded(value)}`;

/** Current effects and recurring costs, using the engine's completed facts and applied choices. */
function totalsOf(w: World, area: InvestmentArea, office: OfficeRead): Totals {
  const policy = policyOf(w);
  const effects = policyEffects(policy);
  const costs = office.costs;
  const club = clubOf(w);
  const money = (value: string | bigint) => (
    <Money value={value} code={club.country} year={w.year} plain />
  );
  const policyCost = (key: PolicyKey) =>
    BigInt(costs.annual) - BigInt(office.policyCosts[key][1]!.annual);
  switch (area) {
    case 'firstTeam': {
      const ground = TRAINING_GROUND[w.trainingGround];
      const build = buildEffects(w);
      return {
        meta: sourceMessage('copy.InvestmentTotals.7c59ec3469', {
          p0: POLICY_INFO.support.levels[policy.support - 1].name,
          p1: w.trainingGround,
          p2: partTop('training'),
        }),
        rows: [
          [
            sourceMessage('copy.InvestmentTotals.d9eefc91be'),
            money(BigInt(costs.expenses) + BigInt(facilityPartUpkeep(w, 'training'))),
          ],
          [
            sourceMessage('copy.InvestmentTotals.4d46fe50b9'),
            `${signed(effects.goodwill + ground.goodwill)}%`,
          ],
          [
            sourceMessage('copy.InvestmentTotals.f5d5d839bb'),
            times(effects.developmentMultiplier * ground.growth),
          ],
          [
            sourceMessage('copy.InvestmentTotals.2aa2ff71ea'),
            signed(effects.recoveryBonus + ground.recoveryBonus),
          ],
          [
            sourceMessage('copy.InvestmentTotals.ba02c71f0d'),
            times(effects.developmentMultiplier * ground.growth * build.youthGrowth),
          ],
          [sourceMessage('copy.ClubSettingControl.6a3eb5782b'), rounded(office.moraleBaseline)],
        ],
        note: sourceMessage('copy.InvestmentTotals.c2f8d48010'),
      };
    }
    case 'youth': {
      const staff = office.staff;
      const facility = ACADEMY_FACILITY[w.academyFacility];
      const count = (w.academy?.players ?? []).filter(
        (player) => player.status === 'active',
      ).length;
      return {
        meta: sourceMessage('copy.InvestmentTotals.d51692b2ef', {
          p0: POLICY_INFO.academy.levels[policy.academy - 1].name,
          p1: w.academyFacility,
          p2: partTop('academy'),
        }),
        rows: [
          [
            sourceMessage('copy.InvestmentTotals.d9eefc91be'),
            money(BigInt(costs.academy) + BigInt(facilityPartUpkeep(w, 'academy'))),
          ],
          [sourceMessage('copy.InvestmentTotals.f695772131'), times(office.academy.growth)],
          [
            sourceMessage('copy.InvestmentTotals.00de51daf9'),
            sourceMessage('copy.CareerRecordBook.e414915261', {
              p0: Math.min(office.academy.intake, Math.max(0, office.academy.limit - count)),
            }),
          ],
          [
            sourceMessage('copy.InvestmentTotals.80d5f9cdea'),
            signed(office.academy.potential + staff.academyQuality),
          ],
          [
            sourceMessage('copy.InvestmentTotals.97f572795e'),
            signed(facility.potential + Math.round(staff.academyQuality / 4)),
          ],
          [
            sourceMessage('copy.InvestmentTotals.dd3378ebe5'),
            sourceMessage('copy.InvestmentTotals.94bfe0de7d', {
              p0: count,
              p1: office.academy.limit,
            }),
          ],
        ],
        note: sourceMessage('copy.InvestmentTotals.4fe6367342'),
      };
    }
    case 'coaches': {
      const staff = office.staff;
      const factors = Object.values(staff.development);
      const count = STAFF_ROLES.filter((role) => staffMember(w, role)).length;
      const choice = DIRECTION_INFO.coaches.options.find(
        (option) => option.id === directionOf(w, 'coaches'),
      )!;
      return {
        meta: sourceMessage('copy.InvestmentTotals.bc16198267'),
        rows: [
          [sourceMessage('copy.InvestmentTotals.5bbadf590b'), money(costs.staffWages)],
          [
            sourceMessage('copy.InvestmentTotals.f0b225e54d'),
            sourceMessage('copy.InvestmentTotals.94bfe0de7d', {
              p0: count,
              p1: STAFF_ROLES.length,
            }),
          ],
          [
            sourceMessage('copy.InvestmentTotals.155df6d121'),
            `${times(Math.min(...factors))}–${times(Math.max(...factors))}`,
          ],
          [sourceMessage('copy.ClubSettingControl.b71dbf73eb'), times(staff.youthDevelopment)],
          [sourceMessage('copy.InvestmentTotals.f695772131'), times(staff.academyGrowth)],
          [sourceMessage('copy.InvestmentTotals.2aa2ff71ea'), signed(staff.recoveryBonus)],
        ],
        note: sourceMessage('copy.InvestmentTotals.e7348f8975', { p0: choice.name }),
      };
    }
    case 'stadium': {
      const gate = office.gate;
      return {
        meta: STADIUM_STEPS[w.stadium].name,
        rows: [
          [
            sourceMessage('copy.InvestmentTotals.7993f638ba'),
            money(facilityPartUpkeep(w, 'stadium')),
          ],
          [
            sourceMessage('copy.InvestmentTotals.1647c3415a'),
            sourceMessage('copy.ClubOperations.e718a2e7a8', { p0: number(stadiumCapacity(w)) }),
          ],
          [
            sourceMessage('copy.ClubSettingControl.02739c722e'),
            sourceMessage('copy.ClubSettingControl.af70cdc2c5', {
              p0: number(gate.attendanceLow),
              p1: number(gate.attendanceHigh),
            }),
          ],
          [
            sourceMessage('copy.ClubSettingControl.34a401372c'),
            <>
              {localizeValue(money(gate.incomeLow))}–{localizeValue(money(gate.incomeHigh))}
            </>,
          ],
        ],
        note: sourceMessage('copy.InvestmentTotals.89840e9508'),
      };
    }
    case 'scouting': {
      const staff = office.staff;
      const build = buildEffects(w);
      const synergy = office.synergy;
      return {
        meta: sourceMessage('copy.InvestmentTotals.20c70a9ad2', {
          p0: POLICY_INFO.globalScouting.levels[policy.globalScouting - 1].name,
        }),
        rows: [
          [sourceMessage('copy.InvestmentTotals.1ed6e49616'), money(policyCost('globalScouting'))],
          [
            sourceMessage('copy.InvestmentTotals.ee6e8e042b'),
            sourceMessage('copy.CareerRecordBook.e414915261', {
              p0: Math.max(
                4,
                staff.scoutCandidates + build.marketCandidates + effects.scoutCandidates,
              ),
            }),
          ],
          [
            sourceMessage('copy.InvestmentTotals.83f8c5e865'),
            sourceMessage('copy.CareerRecordBook.e414915261', { p0: effects.scoutCandidates }),
          ],
          [
            sourceMessage('copy.InvestmentTotals.087b0956c7'),
            signed(
              staff.scoutPotential +
                build.marketPotential +
                synergy.marketPotential +
                effects.scoutPotential,
            ),
          ],
          [sourceMessage('copy.InvestmentTotals.8463f3a14a'), signed(build.marketAbility)],
          [
            sourceMessage('copy.InvestmentTotals.543598fb18'),
            times(staff.feeMultiplier * synergy.feeMultiplier * askedFeeFactor(w)),
          ],
        ],
        note: sourceMessage('copy.InvestmentTotals.98f706b029'),
      };
    }
    case 'community': {
      const bases = office.bases;
      const build = buildEffects(w);
      const synergy = office.synergy;
      const tour = office.tour;
      return {
        meta: sourceMessage('copy.InvestmentTotals.191ff9a57f'),
        rows: [
          [
            sourceMessage('copy.InvestmentTotals.1ed6e49616'),
            money(policyCost('localInvest') + policyCost('globalMarketing')),
          ],
          [sourceMessage('copy.InvestmentTotals.254a2547b3'), rounded(w.localBase ?? 0)],
          [sourceMessage('copy.InvestmentTotals.4e1d9fdfc3'), rounded(w.globalReach ?? 0)],
          [sourceMessage('copy.InvestmentTotals.5187941134'), times(office.gate.marketing)],
          [sourceMessage('copy.InvestmentTotals.d9a37d2983'), signed(office.marketingFans)],
          [
            sourceMessage('copy.InvestmentTotals.136b63adc9'),
            times(bases.localSponsor * build.sponsor * synergy.sponsor),
          ],
          [
            sourceMessage('copy.InvestmentTotals.b4f3558db1'),
            times(bases.globalSponsor * build.sponsor * synergy.sponsor),
          ],
          [
            sourceMessage('copy.ClubOverview.cb2dfd3966'),
            sourceMessage('copy.CareerRecordBook.e414915261', {
              p0: number(office.localSupporters),
            }),
          ],
          [sourceMessage('copy.InvestmentTotals.8efd128329'), money(tour.income)],
          [
            sourceMessage('copy.InvestmentTotals.48920f0011'),
            sourceMessage('copy.InvestmentTotals.edd5e904bb', { p0: tour.reach, p1: tour.fatigue }),
          ],
        ],
        note: sourceMessage('copy.InvestmentTotals.ec34036684', {
          p0: effects.baseTargets.local,
          p1: effects.baseTargets.global,
        }),
      };
    }
    case 'finance': {
      const build = buildEffects(w),
        synergy = office.synergy;
      return {
        meta: sourceMessage('copy.InvestmentTotals.3d4e4a105f'),
        rows: [
          [sourceMessage('copy.HudCash.5008c66043'), money(w.cash)],
          [
            sourceMessage('copy.InvestmentTotals.aa2afbf21f'),
            w.owner ? money(w.owner.fortune) : sourceMessage('copy.InvestmentTotals.bf8fa4f1dd'),
          ],
          [sourceMessage('copy.BusinessWorkbench.d69ab3db74'), money(costs.annual)],
          [
            sourceMessage('copy.InvestmentTotals.696ec7e130'),
            times(build.sponsor * synergy.sponsor),
          ],
          [sourceMessage('copy.InvestmentTotals.79fba02452'), times(build.wage)],
          [sourceMessage('copy.influences.9ecab69458'), `${w.owner?.dividendShare ?? 0}%`],
        ],
        note: sourceMessage('copy.InvestmentTotals.51f049e2fb'),
      };
    }
    case 'identity':
      return {
        meta: sourceMessage('copy.InvestmentTotals.7c877f7005'),
        rows: [
          [sourceMessage('copy.InvestmentTotals.47dfdfd818'), club.name],
          [sourceMessage('copy.HudCash.5008c66043'), money(w.cash)],
          [
            sourceMessage('copy.InvestmentTotals.eadb246cf4'),
            w.designCommission
              ? sourceMessage('copy.InvestmentTotals.e50f2c9014')
              : sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
          ],
          [
            sourceMessage('copy.InvestmentTotals.6f94240307'),
            w.kitChoice
              ? KIT_ROLE_LABELS[w.kitChoice.role]
              : sourceMessage('copy.DecisionRuleFacts.67e7ba0fc0'),
          ],
        ],
        note: sourceMessage('copy.InvestmentTotals.5a68684178'),
      };
  }
}

export function InvestmentTotals({ w, area }: { w: World; area: InvestmentArea }) {
  useTextLocale();
  const title = INVESTMENT_AREAS.find((item) => item.id === area)!.title;
  const office = useOfficeRead(w);
  if (!office) return null;
  const { rows, meta, note } = totalsOf(w, area, office);
  return (
    <Card
      surface="ticket"
      title={displayMessage('copy.InvestmentTotals.da53a41e1e', { p0: title })}
      meta={sourceMessage('copy.InvestmentTotals.4cc8a528aa', { p0: meta })}
      className={s.panel}
      aria-label={displayMessage('copy.InvestmentTotals.35a1b36c14', { p0: title })}
    >
      <dl className={`${s.totalFacts} ${rows.length === 6 ? s.totalFactsSix : ''}`}>
        {localizeValue(
          rows.map(([label, value]) => (
            <div
              key={label}
              data-wide={
                (
                  [
                    sourceMessage('copy.ClubSettingControl.02739c722e'),
                    sourceMessage('copy.ClubSettingControl.34a401372c'),
                    sourceMessage('copy.InvestmentTotals.155df6d121'),
                  ] as readonly string[]
                ).includes(label) || undefined
              }
            >
              <dt>{localizeValue(label)}</dt>
              <dd>{localizeValue(value)}</dd>
            </div>
          )),
        )}
      </dl>
      <p className={s.note}>{localizeValue(note)}</p>
    </Card>
  );
}
