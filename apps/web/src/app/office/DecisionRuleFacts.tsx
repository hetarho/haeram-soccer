import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { localizeValue, useTextLocale } from '../../presentation/text';
import { richMessage } from '../../presentation/LocalizedMessage';
import type { ResponsibilityKey, World } from '../../../../../packages/contracts/src/types';
import { MANAGER_PRIORITY_INFO } from '../../../../../packages/engine/src/hiring-info';
import { useOfficeRead } from '../../shared/lib/useOfficeRead';
import {
  annualWageLimit,
  financeStance,
  debutRule,
  releaseRule,
} from '../../../../../packages/engine/src/direction';
import { SALE_BARS } from '../../../../../packages/engine/src/transfer-policy';
import { STYLE_INFO } from '../../../../../packages/engine/src/styles';
import { clubOf } from '../../../../../packages/engine/src/player-state';
import { compactMoney } from '../../presentation/format';
import s from '../../shared/ui/styles/OwnerOffice.module.css';

/** The actual criteria produced by the owner's instructions and this duty's spending limits. */
export function DecisionRuleFacts({
  w,
  responsibility,
}: {
  w: World;
  responsibility: ResponsibilityKey;
}) {
  useTextLocale();
  const office = useOfficeRead(w);
  if (!office) return null;
  const finance = financeStance(w, responsibility === 'sponsors' ? undefined : responsibility);
  const rows: [string, string][] = [];
  if (responsibility === 'manager') {
    const rule = office.managerCriteria;
    rows.push(
      [sourceMessage('copy.DecisionRuleFacts.32ae423352'), MANAGER_PRIORITY_INFO[rule.priority]],
      [
        sourceMessage('copy.DecisionRuleFacts.3bbfd0b0be'),
        sourceMessage('copy.BallonDorView.3585c2642b', { p0: rule.term }),
      ],
      [sourceMessage('copy.DecisionRuleFacts.f4112139f5'), `${rule.minYouth}`],
      [
        sourceMessage('copy.DecisionRuleFacts.6b8a766f44'),
        rule.schools.map((school) => STYLE_INFO[school].label).join(' · ') ||
          sourceMessage('copy.DecisionRuleFacts.a4b69faf0c'),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.3b9eef79b1'),
        rule.poach
          ? sourceMessage('copy.DecisionRuleFacts.2bd83b8e58')
          : sourceMessage('copy.DecisionRuleFacts.58565d61a0'),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.0d688c4c9d'),
        rule.whenNone === 'best'
          ? sourceMessage('copy.DecisionRuleFacts.8136d36cd8')
          : sourceMessage('copy.DecisionRuleFacts.5986598913'),
      ],
    );
  } else if (responsibility === 'staff') {
    const rule = office.coachCriteria;
    rows.push(
      [
        sourceMessage('copy.DecisionRuleFacts.06a7364655'),
        rule.volunteer ? sourceMessage('copy.DecisionRuleFacts.1fa180496c') : `${rule.minAbility}`,
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.32ae423352'),
        rule.priority === 'ability'
          ? sourceMessage('team.sort.ability')
          : sourceMessage('copy.DecisionRuleFacts.f96961c954'),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.3bbfd0b0be'),
        sourceMessage('copy.BallonDorView.3585c2642b', { p0: rule.term }),
      ],
    );
  } else if (responsibility === 'contracts') {
    const rule = office.talkRule;
    rows.push(
      [
        sourceMessage('copy.DecisionRuleFacts.e71a6c33af'),
        sourceMessage('copy.DecisionRuleFacts.e231958584', { p0: Math.round(rule.maxPay * 100) }),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.4c6407981b'),
        rule.startersOnly
          ? sourceMessage('copy.DecisionRuleFacts.173c289afd')
          : sourceMessage('copy.DecisionRuleFacts.a4b69faf0c'),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.4039d1bad8'),
        rule.maxAge
          ? sourceMessage('copy.DecisionRuleFacts.460e216041', { p0: rule.maxAge })
          : sourceMessage('copy.BusinessWorkbench.72ea3d64ac'),
      ],
    );
  } else if (responsibility === 'recruitment') {
    rows.push(
      [
        sourceMessage('copy.DecisionRuleFacts.240516ddab'),
        finance.signing.margin === undefined
          ? sourceMessage('copy.ClubSettingControl.dfc8cdd784')
          : sourceMessage('copy.DecisionRuleFacts.a034883172', { p0: finance.signing.margin }),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.484bee05ce'),
        sourceMessage('copy.CareerRecordBook.e414915261', { p0: finance.signing.upgrades }),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.ae532c93e1'),
        sourceMessage('copy.DecisionRuleFacts.fc43ee6f67', {
          p0: Math.round(finance.signing.feeShare * 100),
        }),
      ],
    );
  } else if (responsibility === 'sales') {
    const bar = SALE_BARS[w.build?.market ?? 'standard'];
    rows.push(
      [
        sourceMessage('copy.DecisionRuleFacts.194ebe196c'),
        sourceMessage('copy.DecisionRuleFacts.6ab7b15bab', { p0: bar[0] }),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.3b0fabd181'),
        sourceMessage('copy.DecisionRuleFacts.6ab7b15bab', { p0: bar[1] }),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.51ca5e6d9e'),
        sourceMessage('copy.DecisionRuleFacts.cf9392769e', {
          p0: finance.sellSteps[0],
          p1: finance.sellSteps[1],
        }),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.05c37fed85'),
        sourceMessage('copy.DecisionRuleFacts.f6242a4a68'),
      ],
    );
  } else if (responsibility === 'academy') {
    const debut = debutRule(w),
      release = releaseRule(w);
    rows.push(
      [
        sourceMessage('copy.DecisionRuleFacts.a0a245c001'),
        sourceMessage('copy.DecisionRuleFacts.3ccd6678a3', { p0: finance.promotionYears }),
      ],
      [sourceMessage('copy.DecisionRuleFacts.cb4f822ddd'), `${debut.startersMargin}`],
      [
        sourceMessage('copy.DecisionRuleFacts.94c4c8d265'),
        debut.fromAge
          ? sourceMessage('copy.ClubOverview.9c2b927c8a', { p0: debut.fromAge })
          : sourceMessage('copy.DecisionRuleFacts.24e57b1004'),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.3e1fff66f0'),
        Number.isFinite(release.age)
          ? sourceMessage('copy.DecisionRuleFacts.c5eb052b25', {
              p0: release.age,
              p1:
                release.against === 'starters'
                  ? sourceMessage('copy.DecisionRuleFacts.466151385d')
                  : sourceMessage('copy.DecisionRuleFacts.1fdaeae257'),
            })
          : sourceMessage('copy.DecisionRuleFacts.925b3fa9ea'),
      ],
    );
  } else {
    rows.push(
      [
        sourceMessage('copy.DecisionRuleFacts.67e7ba0fc0'),
        sourceMessage('copy.DecisionRuleFacts.ce2f162105'),
      ],
      [
        sourceMessage('copy.DecisionRuleFacts.03d3131adb'),
        sourceMessage('copy.DecisionRuleFacts.762bf8c7b6'),
      ],
      [
        sourceMessage('copy.influences.636b022e8b'),
        sourceMessage('copy.DecisionRuleFacts.74dc30bc6b'),
      ],
    );
  }
  if (responsibility !== 'sponsors' && responsibility !== 'sales') {
    const cap = annualWageLimit(w, responsibility);
    rows.push([
      sourceMessage('copy.DecisionRuleFacts.415d9bc84f'),
      cap === undefined
        ? sourceMessage('copy.ClubSettingControl.5d57a45e99')
        : sourceMessage('copy.ClubSettingControl.1db473c2be', {
            p0: compactMoney(cap, clubOf(w).country, w.year),
          }),
    ]);
    if (responsibility !== 'academy')
      rows.push([
        sourceMessage('copy.DecisionRuleFacts.d1a8a12997'),
        sourceMessage('copy.DecisionRuleFacts.3978ca1d5b', { p0: finance.runway }),
      ]);
    if (responsibility === 'contracts' || responsibility === 'recruitment')
      rows.push([
        sourceMessage('copy.DecisionRuleFacts.2af6383499'),
        sourceMessage('copy.DecisionRuleFacts.75b19a3ba2', {
          p0: Math.round(finance.wageShare * 100),
        }),
      ]);
  }
  return (
    <details data-ui="disclosure" className={s.ruleFacts}>
      <summary>{richMessage('copy.DecisionRuleFacts.8f29be123c')}</summary>
      <dl>
        {localizeValue(
          rows.map(([label, value]) => (
            <div key={label}>
              <dt>{localizeValue(label)}</dt>
              <dd>{localizeValue(value)}</dd>
            </div>
          )),
        )}
      </dl>
    </details>
  );
}
