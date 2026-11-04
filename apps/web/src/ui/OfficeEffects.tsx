import { useState } from 'react';
import type { World } from '../../../../packages/contracts/src/types';
import type {
  EffectFactor,
  EffectId,
  LedgerEffect,
} from '../../../../packages/engine/src/effect-ledger';
import { clubOf } from '../../../../packages/engine/src/player-state';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { Card } from './Card';
import { Dialog } from './Dialog';
import { Money } from './Money';
import { PixelIcon } from './PixelIcon';
import {
  EFFECT_NAMES,
  EFFECT_NOTES,
  GROUP_NAMES,
  ONLY_NAMES,
  effectDestination,
  effectGroups,
  effectValueText,
  factorValueText,
  neutralFactor,
  openEffectDestination,
  sourceText,
  type OfficeEffectsRead,
} from './officeLedger';
import { useOfficeRead } from './useOfficeRead';
import s from './OfficeEffects.module.css';

function Amount({ w, value }: { w: World; value: string }) {
  return <Money value={value} code={clubOf(w).country} year={w.year} plain />;
}
function EffectValue({ w, effect }: { w: World; effect: LedgerEffect }) {
  return effect.unit === 'money' ? (
    <Amount w={w} value={effect.amount!} />
  ) : (
    <>{effectValueText(effect)}</>
  );
}

/**
 * The owner office's effects in force (→WEB-116): every value the club's choices move, by group.
 * A value opens the factors that make it; a factor opens the control that sets it.
 */
export function OfficeEffects({ w }: { w: World }) {
  useTextLocale();
  const office = useOfficeRead(w);
  const [open, setOpen] = useState<EffectId>();
  if (!office) return <p role="status">{displayMessage('office.effects.loading')}</p>;
  const { effects } = office.effects;
  const shown = effects.find((effect) => effect.id === open);
  return (
    <div className={s.effects} data-testid="office-effects">
      {effectGroups(effects).map((group) => (
        <Card
          key={group}
          surface="sheet"
          title={displayMessage(GROUP_NAMES[group])}
          className={s.group}
        >
          <ul className={s.rows}>
            {effects
              .filter((effect) => effect.group === group)
              .map((effect) => (
                <li key={effect.id}>
                  <button
                    type="button"
                    className={s.row}
                    aria-haspopup="dialog"
                    data-effect={effect.id}
                    onClick={() => setOpen(effect.id)}
                  >
                    <span>{displayMessage(EFFECT_NAMES[effect.id])}</span>
                    <b>
                      <EffectValue w={w} effect={effect} />
                    </b>
                    <PixelIcon name="chevronRight" size={16} />
                  </button>
                </li>
              ))}
          </ul>
        </Card>
      ))}
      {shown && (
        <EffectBreakdown
          w={w}
          read={office.effects}
          effect={shown}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  );
}

/** One value and every factor that makes it, each opening where it is set. */
function EffectBreakdown({
  w,
  read,
  effect,
  onClose,
}: {
  w: World;
  read: OfficeEffectsRead;
  effect: LedgerEffect;
  onClose: () => void;
}) {
  useTextLocale();
  return (
    <Dialog
      label={displayMessage(EFFECT_NAMES[effect.id])}
      onClose={onClose}
      summary={
        <div className={s.summary}>
          <b data-testid="effect-value">
            <EffectValue w={w} effect={effect} />
          </b>
          <p>{displayMessage(EFFECT_NOTES[effect.id])}</p>
        </div>
      }
    >
      <h3 className={s.factorsTitle}>{displayMessage('office.effects.factors')}</h3>
      <ul className={s.factors} data-testid="effect-factors">
        {effect.factors.map((factor, index) => (
          <FactorRow
            key={index}
            w={w}
            read={read}
            effect={effect}
            factor={factor}
            onLeave={onClose}
          />
        ))}
      </ul>
    </Dialog>
  );
}

function FactorRow({
  w,
  read,
  effect,
  factor,
  onLeave,
}: {
  w: World;
  read: OfficeEffectsRead;
  effect: LedgerEffect;
  factor: EffectFactor;
  onLeave: () => void;
}) {
  const { source } = factor,
    text = sourceText(source, w, read),
    destination = effectDestination(source),
    synergy =
      source.kind === 'synergy' ? read.synergies.find((item) => item.id === source.id) : undefined;
  const body = (
    <>
      <span className={s.source}>
        <b>{text.name}</b>
        {text.detail && <small>{text.detail}</small>}
        {factor.only && <small>{displayMessage(ONLY_NAMES[factor.only])}</small>}
      </span>
      <b className={s.share}>
        {effect.unit === 'money' ? (
          <Amount w={w} value={factor.amount!} />
        ) : (
          factorValueText(effect, factor)
        )}
      </b>
      {destination && <PixelIcon name="chevronRight" size={16} />}
    </>
  );
  return (
    <li data-neutral={neutralFactor(effect, factor) || undefined}>
      {destination ? (
        <button
          type="button"
          className={s.factor}
          onClick={() => {
            onLeave();
            openEffectDestination(destination);
          }}
        >
          {body}
        </button>
      ) : (
        <div className={s.factor}>{body}</div>
      )}
      {synergy && !synergy.active && (
        <ul className={s.conditions}>
          {synergy.conditions.map((condition, index) => (
            <li key={index} data-met={condition.met || undefined}>
              {localizeValue(condition.label)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
