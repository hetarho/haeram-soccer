import { uiSvg } from '../../../../../scripts/ui-art-resources.mjs';

/** Thin stepped controls retain the established native integer grid. */
export function dropdownPixelSources() {
  const outline = 'M8 0h112v4h4v4h4v112h-4v4h-4v4H8v-4H4v-4H0V8h4V4h4Z';
  const inside = 'M10 4h108v4h6v110h-4v6H10v-4H4V10h4V8h2Z';
  const face = 'M12 8h104v4h4v104h-4v4H12v-4H8V12h4Z';
  return [
    ['trigger', '#121b16', '#465b4d', '#637b64'],
    ['popup', '#1c2720', '#526a57', '#81957a'],
    ['selection', '#375b3f', '#63855f', '#a1cf9b'],
  ].map(([name, fill, edge, light]) => ({
    name,
    svg: uiSvg(
      128,
      128,
      `<path d="${outline}" fill="${edge}"/><path d="${inside}" fill="${light}"/><path d="${face}" fill="${fill}"/>`,
      true,
    ),
  }));
}
