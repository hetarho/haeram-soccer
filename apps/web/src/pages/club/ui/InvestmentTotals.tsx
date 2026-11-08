import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import type { ReactNode } from 'react';
import type { PolicyKey, World } from '../../../../../../packages/contracts/src/types';
import { POLICY_INFO, policyOf } from '../../../../../../packages/engine/src/policy';
import {
  STADIUM_STEPS,
  facilityPartUpkeep,
  stadiumCapacity,
  partTop,
} from '../../../../../../packages/engine/src/facilities';
import { STAFF_ROLES, staffMember } from '../../../../../../packages/engine/src/staff-info';
import { KIT_ROLE_LABELS } from '../../../entities/match';
import { clubOf } from '../../../../../../packages/engine/src/player-state';
import { Card } from '../../../shared/ui/Card';
import { Money } from '../../../shared/ui/Money';
import { number } from '../../../presentation/format';
import { INVESTMENT_AREAS, type InvestmentArea } from '../../../shared/routing/investmentAreas';
import type { OfficeRead } from '../../../runtime/officeRead';
import { useOfficeRead } from '../../../shared/lib/useOfficeRead';
import {
  EFFECT_NAMES,
  areaRows,
  contributionText,
  effectValueText,
  factorValueText,
  sourceText,
  type AreaRow,
} from '../lib/officeLedger';
import { openOfficeLobby } from '../../../shared/routing/state';
import s from '../../../shared/ui/styles/InvestmentView.module.css';

type Row = [string, ReactNode];
/** An area's own spend and facts; what its controls do comes from the office's effects. */
interface AreaCard {
  meta: string;
  costs: Row[];
  facts: Row[];
  note?: string;
}

function cardOf(w: World, area: InvestmentArea, office: OfficeRead): AreaCard {
  const policy = policyOf(w);
  const costs = office.costs;
  const club = clubOf(w);
  const money = (value: string | bigint) => (
    <Money value={value} code={club.country} year={w.year} plain />
  );
  const policyCost = (key: PolicyKey) =>
    BigInt(costs.annual) - BigInt(office.policyCosts[key][1]!.annual);
  switch (area) {
    case 'firstTeam':
      return {
        meta: sourceMessage('copy.InvestmentTotals.7c59ec3469', {
          p0: POLICY_INFO.support.levels[policy.support - 1].name,
          p1: w.trainingGround,
          p2: partTop('training'),
        }),
        costs: [
          [
            sourceMessage('copy.InvestmentTotals.d9eefc91be'),
            money(BigInt(costs.expenses) + BigInt(facilityPartUpkeep(w, 'training'))),
          ],
        ],
        facts: [],
      };
    case 'youth': {
      const count = (w.academy?.players ?? []).filter(
        (player) => player.status === 'active',
      ).length;
      return {
        meta: sourceMessage('copy.InvestmentTotals.d51692b2ef', {
          p0: POLICY_INFO.academy.levels[policy.academy - 1].name,
          p1: w.academyFacility,
          p2: partTop('academy'),
        }),
        costs: [
          [
            sourceMessage('copy.InvestmentTotals.d9eefc91be'),
            money(BigInt(costs.academy) + BigInt(facilityPartUpkeep(w, 'academy'))),
          ],
        ],
        facts: [
          [
            sourceMessage('copy.InvestmentTotals.00de51daf9'),
            sourceMessage('copy.CareerRecordBook.e414915261', {
              p0: Math.min(office.academy.intake, Math.max(0, office.academy.limit - count)),
            }),
          ],
          [
            sourceMessage('copy.InvestmentTotals.dd3378ebe5'),
            sourceMessage('copy.InvestmentTotals.94bfe0de7d', {
              p0: count,
              p1: office.academy.limit,
            }),
          ],
        ],
      };
    }
    case 'coaches':
      return {
        meta: sourceMessage('copy.InvestmentTotals.bc16198267'),
        costs: [[sourceMessage('copy.InvestmentTotals.5bbadf590b'), money(costs.staffWages)]],
        facts: [
          [
            sourceMessage('copy.InvestmentTotals.f0b225e54d'),
            sourceMessage('copy.InvestmentTotals.94bfe0de7d', {
              p0: STAFF_ROLES.filter((role) => staffMember(w, role)).length,
              p1: STAFF_ROLES.length,
            }),
          ],
        ],
      };
    case 'stadium':
      return {
        meta: STADIUM_STEPS[w.stadium].name,
        costs: [
          [
            sourceMessage('copy.InvestmentTotals.7993f638ba'),
            money(facilityPartUpkeep(w, 'stadium')),
          ],
        ],
        facts: [
          [
            sourceMessage('copy.InvestmentTotals.1647c3415a'),
            sourceMessage('copy.ClubOperations.e718a2e7a8', { p0: number(stadiumCapacity(w)) }),
          ],
        ],
      };
    // Where and how the chief scout searches (→CLUB-51); his counts are the office's effects.
    case 'scouting':
      return {
        meta: sourceMessage('copy.InvestmentTotals.20c70a9ad2', {
          p0: POLICY_INFO.globalScouting.levels[policy.globalScouting - 1].name,
        }),
        costs: [
          [sourceMessage('copy.InvestmentTotals.1ed6e49616'), money(policyCost('globalScouting'))],
        ],
        facts: [
          [sourceMessage('copy.InvestmentTotals.0b4115576a'), office.scout.homeLabel],
          [
            sourceMessage('copy.InvestmentTotals.675ac21040'),
            sourceMessage('copy.CareerRecordBook.e414915261', { p0: office.scout.abroadPlaces }),
          ],
          [
            sourceMessage('copy.InvestmentTotals.eea6c23023'),
            sourceMessage('copy.InvestmentTotals.8e3862bb0b', {
              p0: office.scout.age[0],
              p1: office.scout.age[1],
              p2: office.scout.ability[0],
              p3: office.scout.ability[1],
            }),
          ],
          [
            sourceMessage('team.sort'),
            office.scout.potentialFirst === 'all'
              ? sourceMessage('copy.InvestmentTotals.270b3e1770')
              : office.scout.potentialFirst === 'young'
                ? sourceMessage('copy.InvestmentTotals.71b2e62b86', { p0: office.scout.youngAge })
                : sourceMessage('copy.InvestmentTotals.976ef07387'),
          ],
        ],
      };
    case 'community':
      return {
        meta: sourceMessage('copy.InvestmentTotals.191ff9a57f'),
        costs: [
          [
            sourceMessage('copy.InvestmentTotals.1ed6e49616'),
            money(policyCost('localInvest') + policyCost('globalMarketing')),
          ],
        ],
        facts: [
          [sourceMessage('copy.InvestmentTotals.8efd128329'), money(office.tour.income)],
          [
            sourceMessage('copy.InvestmentTotals.48920f0011'),
            sourceMessage('copy.InvestmentTotals.edd5e904bb', {
              p0: office.tour.reach,
              p1: office.tour.fatigue,
            }),
          ],
        ],
      };
    case 'finance':
      return {
        meta: sourceMessage('copy.InvestmentTotals.3d4e4a105f'),
        costs: [[sourceMessage('copy.BusinessWorkbench.d69ab3db74'), money(costs.annual)]],
        facts: [
          [sourceMessage('copy.HudCash.5008c66043'), money(w.cash)],
          [
            sourceMessage('copy.InvestmentTotals.aa2afbf21f'),
            w.owner ? money(w.owner.fortune) : sourceMessage('copy.InvestmentTotals.bf8fa4f1dd'),
          ],
          [sourceMessage('copy.influences.9ecab69458'), `${w.owner?.dividendShare ?? 0}%`],
        ],
      };
    case 'identity':
      return {
        meta: sourceMessage('copy.InvestmentTotals.7c877f7005'),
        costs: [],
        facts: [
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

/** One of the area's effect rows: its own share, or one factor read alone. */
function effectRow(w: World, office: OfficeRead, row: AreaRow): Row {
  const name = displayMessage(EFFECT_NAMES[row.effect.id]);
  if (row.kind === 'factor')
    return [
      displayMessage('office.area.factor', {
        effect: name,
        source: sourceText(row.factor.source, w, office.effects).name,
      }),
      factorValueText(row.effect, row.factor),
    ];
  return [
    name,
    row.whole ? effectValueText(row.effect, row.value) : contributionText(row.effect, row.value),
  ];
}
const wideRow = (row: AreaRow) =>
  row.kind === 'factor' || row.effect.unit === 'range' || row.effect.current !== undefined;

/**
 * What an area's controls do together (→WEB-116): its spend, each value its own controls move,
 * summed from them alone, and its facts. The office lists every value whole.
 */
export function InvestmentTotals({ w, area }: { w: World; area: InvestmentArea }) {
  useTextLocale();
  const title = INVESTMENT_AREAS.find((item) => item.id === area)!.title;
  const office = useOfficeRead(w);
  if (!office) return null;
  const { meta, costs, facts, note } = cardOf(w, area, office);
  const effects = areaRows(office.effects.effects, area);
  const rows: [Row, boolean][] = [
    ...costs.map((row): [Row, boolean] => [row, false]),
    ...effects.map((row): [Row, boolean] => [effectRow(w, office, row), wideRow(row)]),
    ...facts.map((row): [Row, boolean] => [row, false]),
  ];
  return (
    <Card
      surface="ticket"
      title={displayMessage('copy.InvestmentTotals.da53a41e1e', { p0: title })}
      meta={sourceMessage('copy.InvestmentTotals.4cc8a528aa', { p0: meta })}
      className={s.panel}
      aria-label={displayMessage('copy.InvestmentTotals.35a1b36c14', { p0: title })}
    >
      <dl className={`${s.totalFacts} ${rows.length === 6 ? s.totalFactsSix : ''}`}>
        {rows.map(([[label, value], wide], index) => (
          <div key={index} data-wide={wide || undefined}>
            <dt>{localizeValue(label)}</dt>
            <dd>{localizeValue(value)}</dd>
          </div>
        ))}
      </dl>
      {note ? (
        <p className={s.note}>{localizeValue(note)}</p>
      ) : (
        <div className={s.totalsNote}>
          <p className={s.note}>{displayMessage('office.area.note')}</p>
          <button type="button" data-ui="secondary" onClick={openOfficeLobby}>
            {displayMessage('office.area.all')}
          </button>
        </div>
      )}
    </Card>
  );
}
