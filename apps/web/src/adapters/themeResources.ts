import type { FontResource } from '../presentation/contracts';
import type { ThemeResolver } from '../presentation/theme';

/** Staging may do I/O, but activation and disposal must be synchronous and reversible. */
export interface StagedThemeResource {
  activate(): void;
  dispose(): void;
}
export interface ThemeInstallationPorts {
  stageFont(font: FontResource): Promise<StagedThemeResource>;
  stageStylesheet(url: string): Promise<StagedThemeResource>;
  stageImage(url: string): Promise<StagedThemeResource>;
  installTokens(theme: ThemeResolver): { dispose(): void };
}
export interface InstalledTheme {
  theme: ThemeResolver;
  dispose(): void;
}
export class ThemeInstallationError extends Error {
  readonly retryable = true;
  constructor(readonly cause: unknown) {
    super('Unable to install theme resources');
    this.name = 'ThemeInstallationError';
  }
}

export function createBrowserThemePorts(document: Document): ThemeInstallationPorts {
  return {
    async stageFont(font) {
      const face = new FontFace(
        font.family,
        `url(${JSON.stringify(font.resource)})${font.format ? ` format("${font.format}")` : ''}`,
        { weight: font.weight, style: font.style ?? 'normal', display: font.display ?? 'swap' },
      );
      await face.load();
      return {
        activate: () => {
          document.fonts.add(face);
        },
        dispose: () => {
          document.fonts.delete(face);
        },
      };
    },
    stageStylesheet(url) {
      return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        // Load without applying the candidate's CSS before the transaction commits.
        link.media = 'not all';
        link.onload = () => {
          link.onload = link.onerror = null;
          resolve({
            activate: () => {
              link.media = 'all';
            },
            dispose: () => link.remove(),
          });
        };
        link.onerror = () => {
          link.onload = link.onerror = null;
          link.remove();
          reject(new Error(`Unable to load theme stylesheet: ${url}`));
        };
        document.head.append(link);
      });
    },
    async stageImage(url) {
      const image = document.createElement('img');
      image.decoding = 'async';
      const dispose = () => {
        image.removeAttribute('src');
        image.remove();
      };
      try {
        image.src = url;
        await image.decode();
        // Keep the decoded image owned until replacement; consumers use the same browser cache.
        return { activate() {}, dispose };
      } catch (error) {
        dispose();
        throw error;
      }
    },
    installTokens(theme) {
      const style = document.createElement('style');
      style.dataset.presentationTokens = '';
      style.textContent = ':root {}';
      document.head.append(style);
      try {
        const rule = style.sheet!.cssRules[0] as CSSStyleRule;
        for (const [key, value] of Object.entries(theme.tokens))
          rule.style.setProperty(`--${key}`, value);
        rule.style.setProperty('color-scheme', theme.colorScheme);
      } catch (error) {
        style.remove();
        throw error;
      }
      return { dispose: () => style.remove() };
    },
  };
}

/**
 * Stage selected fonts/CSS/image icons and the caller's current scene needs, never all scene slots.
 * A stale request returns null without activation.
 * A failure leaves previous resources owned and usable; successful replacement releases them.
 */
export async function installThemeResources(
  theme: ThemeResolver,
  options: {
    ports?: ThemeInstallationPorts;
    previous?: InstalledTheme;
    isCurrent?: () => boolean;
    /** Candidate-resolved URLs for mounted semantic icons/scenes, deduplicated before I/O. */
    requiredImages?: readonly string[];
  } = {},
): Promise<InstalledTheme | null> {
  const ports = options.ports ?? createBrowserThemePorts(document);
  const staged: StagedThemeResource[] = [];
  let tokenStyle: { dispose(): void } | undefined;
  const dispose = () => {
    tokenStyle?.dispose();
    tokenStyle = undefined;
    for (const resource of staged.splice(0).reverse()) resource.dispose();
  };
  try {
    const requests = theme.fonts.map((font) => Promise.resolve().then(() => ports.stageFont(font)));
    if (theme.stylesheet)
      requests.push(Promise.resolve().then(() => ports.stageStylesheet(theme.stylesheet!)));
    for (const url of new Set([...theme.iconImages, ...(options.requiredImages ?? [])]))
      requests.push(Promise.resolve().then(() => ports.stageImage(url)));
    const results = await Promise.allSettled(requests);
    for (const result of results) if (result.status === 'fulfilled') staged.push(result.value);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    // No await may separate this check from font/CSS/token activation.
    if (options.isCurrent && !options.isCurrent()) {
      dispose();
      return null;
    }
    for (const resource of staged) resource.activate();
    tokenStyle = ports.installTokens(theme);
    options.previous?.dispose();
    return { theme, dispose };
  } catch (cause) {
    dispose();
    throw new ThemeInstallationError(cause);
  }
}
