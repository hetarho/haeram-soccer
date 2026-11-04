import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
import { displayMessage, localizeValue, useTextLocale } from '../presentation/text';
import { richMessage } from '../presentation/LocalizedMessage';
import { useEffect, useState, type CSSProperties } from 'react';
import type { GameClient } from '../runtime/client';
import type { ProgressionController } from '../runtime/progression';
import { gameStore, useGameState } from '../runtime/store';
import { useTheme } from '../presentation/react';
import { ProgressControls } from '../ui/ProgressControls';
import {
  CONTROLLER_BACKGROUNDS,
  SELECTED_CONTROLLER_BACKGROUNDS,
} from './controllerBackgroundOptions';
import './controller-backgrounds.css';

const setPreviewMode = (controller: ProgressionController, next: 'manual' | 'automatic') => {
  controller.pause();
  gameStore.setState((state) => ({
    view: {
      ...state.view!,
      world: {
        ...state.view!.world,
        settings: { ...state.view!.world.settings!, mode: next },
      },
    },
  }));
};

/** Compare the selected background against its two retained alternatives. */
export function ControllerBackgrounds({
  client,
  controller,
}: {
  client: GameClient;
  controller: ProgressionController;
}) {
  useTextLocale();
  const theme = useTheme();
  const [selections, setSelections] = useState<Record<string, string>>({
    ...SELECTED_CONTROLLER_BACKGROUNDS,
  });
  const selection = selections[theme.id];
  const mode = useGameState((state) => state.view!.world.settings?.mode);
  useEffect(() => {
    setPreviewMode(controller, 'automatic');
  }, [controller]);
  const options = CONTROLLER_BACKGROUNDS.filter((option) => option.theme === theme.id);
  return (
    <div className="cb-review">
      <div className="cb-review-toolbar">
        <span>{richMessage('copy.ControllerBackgrounds.75a4342d58')}</span>
        <div role="group" aria-label={displayMessage('copy.ControllerBackgrounds.f2f24da393')}>
          <button
            data-ui="tertiary"
            aria-pressed={mode === 'automatic'}
            onClick={() => setPreviewMode(controller, 'automatic')}
          >
            {richMessage('copy.ControllerBackgrounds.ca7eb2ef0a')}
          </button>
          <button
            data-ui="tertiary"
            aria-pressed={mode === 'manual'}
            onClick={() => setPreviewMode(controller, 'manual')}
          >
            {richMessage('copy.ControllerBackgrounds.536c26ea0a')}
          </button>
        </div>
      </div>
      {localizeValue(
        options.map((option) => {
          const material = `/design/${option.theme}/controller-concepts-v1/tiles/${option.id}.${option.theme === 'pixel' ? 'png' : 'webp'}`;
          return (
            <article
              className="cb-option"
              key={option.id}
              data-option={option.id}
              data-picked={selection === option.id}
            >
              <header className="cb-option-heading">
                <div
                  className="cb-swatch"
                  aria-hidden="true"
                  style={{
                    backgroundColor: option.fill,
                    backgroundImage: `url("${material}")`,
                    backgroundSize: option.theme === 'pixel' ? '64px' : '256px',
                    imageRendering: option.theme === 'pixel' ? 'pixelated' : 'auto',
                  }}
                />
                <div className="cb-option-copy">
                  <h2>
                    <span>{localizeValue(option.id)}</span> {localizeValue(option.title)}
                  </h2>
                  <p>{localizeValue(option.description)}</p>
                </div>
                <button
                  className="cb-choose"
                  data-ui="tertiary"
                  aria-label={displayMessage('copy.ControllerBackgrounds.48e6b76e24', {
                    p0: option.id,
                    p1: option.title,
                  })}
                  aria-pressed={selection === option.id}
                  onClick={() => {
                    setSelections((current) => ({ ...current, [theme.id]: option.id }));
                    window.parent.postMessage(
                      {
                        type: 'controller-background-choice',
                        theme: theme.id,
                        id: option.id,
                        title: option.title,
                      },
                      location.origin,
                    );
                  }}
                >
                  {localizeValue(
                    selection === option.id
                      ? sourceMessage('copy.ControllerBackgrounds.ff05345534')
                      : sourceMessage('copy.ControllerBackgrounds.8d1a750c93'),
                  )}
                </button>
              </header>
              <div
                className="cb-material"
                style={
                  {
                    '--image-transport-material': `url("${material}")`,
                    '--transport-material-size': option.theme === 'pixel' ? '64px' : '256px',
                    '--transport-material-blend': 'normal',
                    '--transport-fill': option.fill,
                    '--transport-text': option.ink,
                    '--transport-muted': option.muted,
                  } as CSSProperties
                }
              >
                <ProgressControls client={client} controller={controller} />
              </div>
            </article>
          );
        }),
      )}
    </div>
  );
}
