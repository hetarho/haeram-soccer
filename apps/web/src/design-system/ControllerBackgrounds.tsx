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
        <span>컨트롤러 배경 · 3가지 시안</span>
        <div role="group" aria-label="컨트롤러 진행 방식 미리보기">
          <button
            data-ui="tertiary"
            aria-pressed={mode === 'automatic'}
            onClick={() => setPreviewMode(controller, 'automatic')}
          >
            자동
          </button>
          <button
            data-ui="tertiary"
            aria-pressed={mode === 'manual'}
            onClick={() => setPreviewMode(controller, 'manual')}
          >
            수동
          </button>
        </div>
      </div>
      {options.map((option) => {
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
                  <span>{option.id}</span> {option.title}
                </h2>
                <p>{option.description}</p>
              </div>
              <button
                className="cb-choose"
                data-ui="tertiary"
                aria-label={`${option.id} ${option.title} 선택`}
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
                {selection === option.id ? '선택됨 ✓' : '선택'}
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
      })}
    </div>
  );
}
