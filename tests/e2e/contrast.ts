/**
 * Contrast against the element's painted fallback surface, including translucent ancestors. A
 * control that paints its face on a pseudo-element names it, e.g. '::before'.
 */
export function textContrast(element: Element, face?: string) {
  const rgba = (value: string) => {
    const parts = value.match(/[\d.]+/g)!.map(Number);
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };
  const blend = (front: number[], back: number[]) =>
    front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3]));
  const layers: number[][] = face ? [rgba(getComputedStyle(element, face).backgroundColor)] : [];
  let opacity = 1;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    layers.push(rgba(style.backgroundColor));
    opacity *= Number(style.opacity);
  }
  let background = [255, 255, 255];
  for (const layer of layers.reverse()) background = blend(layer, background);
  const style = getComputedStyle(element);
  const foreground = rgba(style.color);
  foreground[3] *= opacity;
  const luminance = (color: number[]) => {
    const linear = color.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  };
  const a = luminance(blend(foreground, background));
  const b = luminance(background);
  return {
    ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    foreground: style.color,
    background,
    opacity,
  };
}
