import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useRef, useState } from 'react';
import { settingsOf } from '../../../../packages/engine/src/responsibilities';
import { progressionPreferences } from '../adapters/progressionPreferences';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { useGameState } from '../runtime/store';
import { Dialog } from './Dialog';
import { modeSwitchBlocked, switchProgressMode } from './progressMode';
import s from './ProgressControls.module.css';

export function ProgressModeSwitch({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  useTextLocale();
  const state = useGameState((state) => state);
  const w = state.view!.world;
  const mode = settingsOf(w).mode;
  const [request, setRequest] = useState<{ id: string; mode: typeof mode }>();
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const inFlight = useRef(false);
  const close = () => {
    if (!inFlight.current) {
      setRequest(undefined);
      setError('');
      setRemember(false);
    }
  };
  const apply = async (expected: { id: string; mode: typeof mode }, savePreference: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setApplying(true);
    setError('');
    try {
      await switchProgressMode(client, controller, expected);
      if (savePreference) progressionPreferences.remember();
      setRequest(undefined);
      setRemember(false);
    } catch (cause) {
      setRequest(expected);
      setError(
        cause instanceof Error
          ? cause.message
          : sourceMessage('copy.ProgressModeSwitch.22521b20bc'),
      );
    } finally {
      inFlight.current = false;
      setApplying(false);
    }
  };
  const manual = request?.mode === 'automatic';
  const choose = () => {
    if (applying || modeSwitchBlocked(state)) return;
    const expected = { id: w.id, mode };
    setRemember(false);
    setError('');
    if (progressionPreferences.skipExplanation()) void apply(expected, false);
    else setRequest(expected);
  };
  return (
    <>
      <button
        className={s.modeSwitch}
        data-ui="primary"
        data-progress-mode
        aria-label={displayMessage('copy.ProgressModeSwitch.2154238879')}
        aria-haspopup={progressionPreferences.skipExplanation() ? undefined : 'dialog'}
        disabled={applying || modeSwitchBlocked(state)}
        title={localizeValue(
          state.clockRunning ? sourceMessage('copy.ProgressModeSwitch.7150e07f7e') : undefined,
        )}
        onClick={choose}
      >
        <span>{richMessage('copy.ProgressModeSwitch.125c615cb6')}</span>
        <span className={s.modeStatus} data-testid="progression-mode" aria-live="polite">
          {localizeValue(mode === 'manual' ? 'MANUAL' : 'AUTO')}
        </span>
      </button>
      {localizeValue(
        request && (
          <Dialog
            label={displayMessage('copy.ProgressModeSwitch.913a0ecd8c')}
            onClose={close}
            actions={
              <div className={s.modeActions}>
                <button disabled={applying} onClick={close}>
                  {richMessage('common.cancel')}
                </button>
                <button
                  data-ui="primary"
                  disabled={
                    applying ||
                    modeSwitchBlocked(state) ||
                    w.id !== request.id ||
                    mode !== request.mode
                  }
                  onClick={() => void apply(request, remember)}
                >
                  {localizeValue(
                    manual
                      ? sourceMessage('copy.ProgressModeSwitch.60d11a1d2d')
                      : sourceMessage('copy.ProgressModeSwitch.db8e714e4d'),
                  )}
                </button>
              </div>
            }
          >
            <div className={s.modeExplanation} aria-busy={applying}>
              <strong>{localizeValue(manual ? 'AUTO → MANUAL' : 'MANUAL → AUTO')}</strong>
              <p>
                {localizeValue(
                  manual
                    ? sourceMessage('copy.ProgressModeSwitch.e7cdb1cba6')
                    : sourceMessage('copy.ProgressModeSwitch.d3b71f95ae'),
                )}
              </p>
              <p>
                {localizeValue(
                  manual
                    ? sourceMessage('copy.ProgressModeSwitch.45b47fe011')
                    : sourceMessage('copy.ProgressModeSwitch.a64978b95f'),
                )}
              </p>
              <p className={s.modeHint}>{richMessage('copy.ProgressModeSwitch.b6a9cbcc96')}</p>
              <label className={s.remember}>
                {richMessage('copy.ProgressModeSwitch.17b0b8c9bc', {
                  p0: (
                    <input
                      type="checkbox"
                      checked={remember}
                      disabled={applying}
                      onChange={(event) => setRemember(event.target.checked)}
                    />
                  ),
                })}
              </label>
              {localizeValue(error && <p role="alert">{localizeValue(error)}</p>)}
            </div>
          </Dialog>
        ),
      )}
    </>
  );
}
