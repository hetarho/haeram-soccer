import { useLayoutEffect, useState, type RefObject } from 'react';
import { useOptionalTheme } from '../presentation/react';
import { DEFAULT_PITCH_SKIN, resolvePitchSkin, type PitchSkin } from './pitchPainting';

/** CSS resolves the pack-relative URL before we decode it; no URL guessing or theme-ID branch. */
export function usePitchSkin(element: RefObject<Element | null>): PitchSkin {
  const theme = useOptionalTheme();
  const [skin, setSkin] = useState(DEFAULT_PITCH_SKIN);
  useLayoutEffect(() => {
    let current = true;
    let version = 0;
    let timer = 0;
    const prepare = () => {
      if (!current || !element.current) return;
      const request = ++version;
      const style = getComputedStyle(element.current);
      const resolved = resolvePitchSkin(style);
      const source = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage)?.[1];
      setSkin(resolved);
      if (!source || new URL(source, location.href).origin !== location.origin) return;
      const image = new Image();
      image.src = source;
      void image
        .decode()
        .then(() => {
          if (current && request === version && image.naturalWidth && image.naturalHeight)
            setSkin({ ...resolved, texture: image, textureUrl: image.src });
        })
        .catch(() => {
          // Decorative material failure leaves the resolved solid ground and live labels usable.
        });
    };
    // A media-gated pack and its imported/lazy CSS can finish applying after React publishes it.
    // Prepare after activation and resource loads, rather than caching that transient empty style.
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(prepare, 0);
    };
    const loaded = (event: Event) => {
      if (event.target instanceof HTMLLinkElement && event.target.rel === 'stylesheet') schedule();
    };
    document.addEventListener('load', loaded, true);
    schedule();
    return () => {
      current = false;
      window.clearTimeout(timer);
      document.removeEventListener('load', loaded, true);
    };
  }, [theme, element]);
  return skin;
}
