/**
 * ab-demo scaffold (development only, never shipped). `/?ab-demo=finance` opens a fixed demo career
 * on home and `/?ab-demo=finance-tight` the same career with little cash, for the A/B comparison of
 * the club-money, delegation and owner-fortune variants. Each save goes through the client's
 * ordinary portable import (the start page's file import: worker inspection, activation, checkpoint
 * commit), so nothing here edits a world. `scripts/ab-demo-saves.ts` writes the two saves; App loads
 * this module only under `import.meta.env.DEV`, so a production build drops it with the saves.
 */
import type { GameClient } from '../runtime/client';

export const AB_DEMO_PARAM = 'ab-demo';
const SAVES = {
  finance: () => import('./finance.haeram-save.json?raw'),
  'finance-tight': () => import('./finance-tight.haeram-save.json?raw'),
};
export type AbDemo = keyof typeof SAVES;
/** runtime/progression.ts's per-world clock records: a reopened demo starts with its clock stopped. */
const CLOCK_KEY = 'haeram-soccor:clock';

/** The demo an address asks for; undefined without the parameter or with an unknown name. */
export function requestedDemo(search: string): AbDemo | undefined {
  const name = new URLSearchParams(search).get(AB_DEMO_PARAM);
  return name !== null && Object.hasOwn(SAVES, name) ? (name as AbDemo) : undefined;
}

/** The address without the demo parameter, so a reload continues the imported career. */
export function addressWithoutDemo(pathname: string, search: string, hash: string) {
  const params = new URLSearchParams(search);
  params.delete(AB_DEMO_PARAM);
  const rest = params.toString();
  return `${pathname}${rest ? `?${rest}` : ''}${hash}`;
}

/**
 * Imports the requested demo into `client` (replacing any game in play on this origin) and enters
 * the game; `enter` is App's screen setter. Does nothing without the parameter.
 */
export async function boot(client: GameClient, enter: (screen: 'game') => void) {
  const demo = requestedDemo(location.search);
  if (!demo) return;
  try {
    localStorage.removeItem(CLOCK_KEY);
  } catch {
    /* without storage no clock resumes anyway */
  }
  try {
    await client.importFile((await SAVES[demo]()).default);
  } catch (error) {
    // A read-only tab (another tab holds the writer lock) cannot import; it shows what it has.
    console.error(error);
    return;
  }
  history.replaceState(
    history.state,
    '',
    addressWithoutDemo(location.pathname, location.search, location.hash),
  );
  enter('game');
}
