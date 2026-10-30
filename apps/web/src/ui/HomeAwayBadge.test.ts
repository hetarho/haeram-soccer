import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import registryData from '../../public/presentation/locales/index.json';
import korean from '../../public/presentation/locales/ko-KR.json';
import english from '../../public/presentation/locales/en-GB.json';
import japanese from '../../public/presentation/locales/ja-JP.json';
import type { PresentationController } from '../presentation/controller';
import { validateLocalePack } from '../presentation/contracts';
import { createLoadedLocale } from '../presentation/locale';
import { PresentationProvider } from '../presentation/react';
import { validateRegistry } from '../presentation/registry';
import { HomeAwayBadge } from './HomeAwayBadge';

const registry = validateRegistry(registryData, 'locale');
const baseline = validateLocalePack(korean);

describe('localized home and away badges', () => {
  it.each([
    [korean, '홈', '원정'],
    [english, 'Home', 'Away'],
    [japanese, 'ホーム', 'アウェー'],
  ] as const)('renders the selected $0.id message pack', (pack, home, away) => {
    const locale = createLoadedLocale(registry, validateLocalePack(pack, baseline), baseline);
    const snapshot = { locale };
    const controller = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
    } as unknown as PresentationController;
    for (const [side, label] of [
      ['home', home],
      ['away', away],
    ] as const) {
      const markup = renderToStaticMarkup(
        createElement(PresentationProvider, {
          controller,
          children: createElement(HomeAwayBadge, { side }),
        }),
      );
      expect(markup).toContain(`data-ui="home-away-badge" data-side="${side}">${label}</span>`);
      expect(markup).not.toMatch(/<button|tabindex|role="button"/);
    }
  });
});
