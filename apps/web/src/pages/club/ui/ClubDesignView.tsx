import { message as sourceMessage } from '../../../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../../../presentation/text';
import { richMessage } from '../../../presentation/LocalizedMessage';
import { useState } from 'react';
import {
  CREST_PALETTE,
  DESIGN_STUDIOS,
  KIT_ROLES,
  type ClubIdentity,
  type DesignStudio,
  type IdentityColours,
} from '../../../../../../packages/contracts/src/identity';
import { identityOf } from '../../../../../../packages/engine/src/club-identity';
import { DESIGNERS, designFee, redrawFee } from '../../../../../../packages/engine/src/design-fees';
import type { ClientState, GameClient } from '../../../runtime/client';
import { gameActionsBlocked, useGameState } from '../../../runtime/store';
import { CrestMark } from '../../../entities/club';
import { KitSwatch } from '../../../entities/match';
import { Money } from '../../../shared/ui/Money';
import { Segments } from '../../../shared/ui/Segments';
import s from './ClubDesignView.module.css';

/**
 * 구단 운영 › 구단 디자인: the current design, then a change request one step at a time — the
 * main, sub and point colours, then the designer — and the drafts it sends. The request's form
 * starts again once the drafts arrive; adopting one or throwing them all away returns to the first
 * page.
 */

const KIT_LABEL = {
  home: sourceMessage('fixture.home'),
  away: sourceMessage('fixture.away'),
  third: sourceMessage('copy.ClubDesignView.0969b0e255'),
} as const;
/** Each colour step: its name, what it paints, and whether it may be left out. */
const SLOTS = [
  [
    sourceMessage('copy.ClubDesignView.0b39b6a4e2'),
    sourceMessage('copy.ClubDesignView.87d0c67cd0'),
  ],
  [
    sourceMessage('copy.ClubDesignView.931b1921eb'),
    sourceMessage('copy.ClubDesignView.68d14e8d7a'),
  ],
  [sourceMessage('copy.BallonDorView.e5f25ab092'), sourceMessage('copy.ClubDesignView.69094662a0')],
] as const;
type Step = 'home' | 0 | 1 | 2 | 'confirm';
/** A colour step's answer: a colour, `null` for 없음, or nothing yet. */
type ColourPick = string | null | undefined;
type DesignCommand = Extract<
  Parameters<GameClient['command']>[0],
  { type: 'design-commission' | 'adopt-design' | 'discard-designs' | 'redraw-designs' }
>;
/** The change request being composed: its step, the colours picked so far and the designer. */
export interface DesignForm {
  step: Step;
  colours: ColourPick[];
  studio: DesignStudio;
}
export const FRESH_DESIGN_FORM: DesignForm = { step: 'home', colours: [], studio: 'studio' };

/**
 * The form once a design command has succeeded (→WEB-108). A commission, an adoption and a
 * discard each finish the request, so the form starts again on the first page: once the
 * commission is gone — adopted, thrown away, or replaced by an imported file of the same game —
 * the view shows the applied design, never the finished request. A redraw keeps the drafts. A
 * failed command keeps its form for a retry and never reaches here.
 */
export function designFormAfter(form: DesignForm, command: DesignCommand['type']): DesignForm {
  return command === 'redraw-designs' ? form : FRESH_DESIGN_FORM;
}

/** A design at a glance: the crest and the three shirts. */
function DesignCard({ identity, size = 48 }: { identity: ClubIdentity; size?: number }) {
  useTextLocale();
  return (
    <div className={s.design}>
      <CrestMark
        crest={identity.crest}
        size={size}
        label={displayMessage('copy.ClubDesignView.4a84e980c4')}
      />
      <div className={s.kits}>
        {localizeValue(
          KIT_ROLES.map((role) => (
            <figure key={role}>
              <KitSwatch
                shirt={identity.kits[role]}
                label={displayMessage('copy.stories.d4f4589c92', { p0: KIT_LABEL[role] })}
                size={size}
              />
              <figcaption>{localizeValue(KIT_LABEL[role])}</figcaption>
            </figure>
          )),
        )}
      </div>
    </div>
  );
}

/** The colours chosen so far, each named. */
function Chosen({ colours }: { colours: readonly ColourPick[] }) {
  useTextLocale();
  return (
    <ul className={s.chosen} aria-label={displayMessage('copy.ClubDesignView.5ff6b17715')}>
      {localizeValue(
        SLOTS.map(([label], index) => (
          <li key={label}>
            <span
              className={s.chip}
              style={{ background: colours[index] ?? undefined }}
              data-empty={!colours[index] || undefined}
            />
            {localizeValue(label)}
          </li>
        )),
      )}
    </ul>
  );
}

/** One colour slot's palette; the optional ones start with 없음. */
function Palette({
  index,
  value,
  taken,
  disabled,
  onPick,
}: {
  index: number;
  value: ColourPick;
  taken: readonly string[];
  disabled: boolean;
  onPick: (colour: string | null) => void;
}) {
  useTextLocale();
  return (
    <div
      className={s.palette}
      role="group"
      aria-label={displayMessage('copy.ClubDesignView.0ad3fc64a8', { p0: SLOTS[index]![0] })}
    >
      {localizeValue(
        index > 0 && (
          <button
            type="button"
            className={s.none}
            aria-pressed={value === null}
            disabled={disabled}
            onClick={() => onPick(null)}
          >
            {richMessage('copy.BusinessWorkbench.72ea3d64ac')}
          </button>
        ),
      )}
      {localizeValue(
        CREST_PALETTE.map((colour) => (
          <button
            key={colour}
            type="button"
            className={s.swatch}
            aria-label={localizeValue(colour)}
            aria-pressed={value === colour}
            disabled={disabled || (value !== colour && taken.includes(colour))}
            onClick={() => onPick(colour)}
          >
            <span className={s.fill} style={{ background: colour }} aria-hidden="true" />
          </button>
        )),
      )}
    </div>
  );
}

export function ClubDesignView({ state, client }: { state: ClientState; client: GameClient }) {
  useTextLocale();
  const w = state.view!.world;
  const code = w.clubs.find((club) => club.id === w.playerClub)!.country;
  const applied = identityOf(w, w.playerClub);
  const readonly = useGameState((current) => current.readonly);
  const blocked = useGameState(gameActionsBlocked);
  const [step, setStep] = useState<Step>(FRESH_DESIGN_FORM.step);
  const [colours, setColours] = useState<ColourPick[]>(FRESH_DESIGN_FORM.colours);
  const [studio, setStudio] = useState<DesignStudio>(FRESH_DESIGN_FORM.studio);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const commission = w.designCommission;
  const busy = readonly || blocked || pending;

  const send = async (command: DesignCommand) => {
    setPending(true);
    setError(undefined);
    const reply = await client.command(command);
    setPending(false);
    if (!reply?.ok) {
      setError(client.state.error ?? sourceMessage('copy.ClubDesignView.19b291120c'));
      return;
    }
    const form = designFormAfter({ step, colours, studio }, command.type);
    setStep(form.step);
    setColours(form.colours);
    setStudio(form.studio);
  };

  // Delivered drafts wait here until one is adopted or all are thrown away.
  if (commission) {
    const redraw = redrawFee(w, commission.studio);
    return (
      <section className={s.view} aria-label={displayMessage('club.operations.identity')}>
        <div
          data-surface="panel"
          className={s.panel}
          aria-label={displayMessage('copy.ClubDesignView.632b0bf141')}
        >
          <h3>{richMessage('copy.ClubDesignView.632b0bf141')}</h3>
          <p className={s.note}>
            {richMessage('copy.ClubDesignView.e5a36cf47b', {
              p0: DESIGNERS[commission.studio].label,
            })}
          </p>
          <Chosen colours={commission.colours} />
          <ol className={s.drafts}>
            {localizeValue(
              commission.drafts.map((draft, index) => (
                <li key={index} className={s.draft}>
                  <b>{richMessage('copy.ClubDesignView.9517fa3d89', { p0: index + 1 })}</b>
                  <DesignCard identity={draft} />
                  <button
                    type="button"
                    data-ui="primary"
                    disabled={busy}
                    onClick={() => void send({ type: 'adopt-design', draft: index })}
                  >
                    {richMessage('copy.ClubDesignView.efc7b98645')}
                  </button>
                </li>
              )),
            )}
          </ol>
          <div className={s.nav}>
            <button
              type="button"
              disabled={busy}
              onClick={() => void send({ type: 'discard-designs' })}
            >
              {richMessage('copy.ClubDesignView.742223c321')}
            </button>
            <button
              type="button"
              disabled={busy || BigInt(w.cash) < BigInt(redraw)}
              onClick={() => void send({ type: 'redraw-designs' })}
            >
              {richMessage('copy.ClubDesignView.98ffc505d2', {
                p0: <Money value={redraw} code={code} year={w.year} plain />,
              })}
            </button>
          </div>
          {localizeValue(
            error && (
              <p className={s.warn} role="alert">
                {localizeValue(error)}
              </p>
            ),
          )}
        </div>
      </section>
    );
  }

  if (step === 'home')
    return (
      <section className={s.view} aria-label={displayMessage('club.operations.identity')}>
        <div data-surface="panel" className={s.panel}>
          <h3>{richMessage('copy.ClubDesignView.a3a717bf6e')}</h3>
          <DesignCard identity={applied} size={64} />
          <p className={s.note}>{richMessage('copy.ClubDesignView.a0d8a4ddac')}</p>
          <button
            type="button"
            data-ui="primary"
            className={s.request}
            disabled={readonly}
            onClick={() => {
              setColours([]);
              setError(undefined);
              setStep(0);
            }}
          >
            {richMessage('copy.ClubDesignView.5edef58fc5')}
          </button>
          {localizeValue(
            readonly && <p className={s.note}>{richMessage('copy.ClubDesignView.b095395188')}</p>,
          )}
        </div>
      </section>
    );

  // 포인트 needs a 보조 before it, so without one that step is skipped both ways.
  const total = colours[1] === null ? 3 : 4;
  const position = step === 'confirm' ? total : step + 1;
  const back = (): Step =>
    step === 'confirm' ? (colours[1] ? 2 : 1) : step === 0 ? 'home' : ((step - 1) as Step);
  const next = (): Step =>
    step === 2 || (step === 1 && colours[1] === null)
      ? 'confirm'
      : (((step as number) + 1) as Step);
  const header = (
    <div className={s.stepHead}>
      <span className={s.count}>
        {localizeValue(position)} / {localizeValue(total)}
      </span>
      <Chosen colours={colours} />
    </div>
  );

  if (step === 'confirm') {
    const fee = designFee(w, studio);
    const short = BigInt(w.cash) < BigInt(fee);
    const chosen = colours.filter((colour) => typeof colour === 'string') as IdentityColours;
    return (
      <section className={s.view} aria-label={displayMessage('club.operations.identity')}>
        <div data-surface="panel" className={s.panel}>
          {localizeValue(header)}
          <h3>{richMessage('copy.ClubDesignView.81223d1051')}</h3>
          <Segments
            label={displayMessage('copy.ClubDesignView.81223d1051')}
            options={DESIGN_STUDIOS.map((id) => [id, DESIGNERS[id].label] as const)}
            value={studio}
            onChange={setStudio}
          />
          <p className={s.terms}>
            {richMessage('copy.ClubDesignView.4861691393', {
              p0: <Money value={fee} code={code} year={w.year} />,
              p1: ' ',
              p2: (
                <b>
                  {richMessage('copy.ConstantsPage.f62174360f', { p0: DESIGNERS[studio].drafts })}
                </b>
              ),
            })}
          </p>
          <p className={s.ask}>{richMessage('copy.ClubDesignView.d0d47619f9')}</p>
          {localizeValue(
            short && <p className={s.warn}>{richMessage('copy.ClubDesignView.a4a9dbf5dc')}</p>,
          )}
          {localizeValue(
            error && (
              <p className={s.warn} role="alert">
                {localizeValue(error)}
              </p>
            ),
          )}
          <div className={s.nav}>
            <button type="button" disabled={pending} onClick={() => setStep(back())}>
              {richMessage('copy.ClubDesignView.9474acc753')}
            </button>
            <button
              type="button"
              data-ui="primary"
              disabled={busy || short}
              onClick={() => void send({ type: 'design-commission', studio, colours: chosen })}
            >
              {localizeValue(
                pending
                  ? sourceMessage('copy.ClubDesignView.b69f111481')
                  : sourceMessage('copy.ClubDesignView.2eb73fba69'),
              )}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const [label, hint] = SLOTS[step]!;
  return (
    <section className={s.view} aria-label={displayMessage('club.operations.identity')}>
      <div data-surface="panel" className={s.panel}>
        {localizeValue(header)}
        <h3>{richMessage('copy.ClubDesignView.1234fdea49', { p0: label })}</h3>
        <p className={s.note}>
          {localizeValue(hint)}
          {localizeValue(step > 0 && sourceMessage('copy.ClubDesignView.3b896c8b15'))}
        </p>
        <Palette
          index={step}
          value={colours[step]}
          taken={colours.filter(
            (colour, at): colour is string => typeof colour === 'string' && at !== step,
          )}
          disabled={busy}
          onPick={(colour) =>
            setColours((current) => {
              const picked = [...current];
              picked[step] = colour;
              // Colours fill from the front: 보조 없음 takes the 포인트 with it.
              if (step === 1 && colour === null) picked[2] = undefined;
              return picked;
            })
          }
        />
        <div className={s.nav}>
          <button type="button" onClick={() => setStep(back())}>
            {localizeValue(
              step === 0
                ? sourceMessage('common.cancel')
                : sourceMessage('copy.ClubDesignView.da7e61c67c'),
            )}
          </button>
          <button
            type="button"
            data-ui="primary"
            disabled={colours[step] === undefined}
            onClick={() => setStep(next())}
          >
            {richMessage('copy.ClubDesignView.aef613c661')}
          </button>
        </div>
      </div>
    </section>
  );
}
