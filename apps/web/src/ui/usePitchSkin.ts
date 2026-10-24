import { useLayoutEffect, useState, type RefObject } from 'react';
import { useOptionalTheme } from '../presentation/react';
import { DEFAULT_PITCH_SKIN, resolvePitchSkin, type PitchSkin } from './pitchPainting';

/** CSS resolves the pack-relative URL before we decode it; no URL guessing or theme-ID branch. */
export function usePitchSkin(element: RefObject<Element | null>): PitchSkin {
  const theme = useOptionalTheme();
  const [skin, setSkin] = useState(DEFAULT_PITCH_SKIN);
  useLayoutEffect(() => {
    if (!element.current) return;
    const style = getComputedStyle(element.current);
    const resolved = resolvePitchSkin(style);
    const source = /^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage)?.[1];
    setSkin(resolved);
    if (!source || new URL(source, location.href).origin !== location.origin) return;
    const image = new Image();
    let current = true;
    image.src = source;
    void image
      .decode()
      .then(() => {
        if (current && image.naturalWidth && image.naturalHeight)
          setSkin({ ...resolved, texture: image, textureUrl: image.src });
      })
      .catch(() => {
        // Decorative material failure leaves the resolved solid ground and live labels usable.
      });
    return () => {
      current = false;
    };
  }, [theme, element]);
  return skin;
}
