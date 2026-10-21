import type { IconResource, THEME_ICON_ROLES } from '../presentation/contracts';
import { useOptionalTheme, useThemeNeed } from '../presentation/react';

export type PixelIconName = Exclude<(typeof THEME_ICON_ROLES)[number], `trophy.${string}`>;

/** Every pack uses the same decorative SVG/image boundary; controls supply accessible names. */
export function SemanticIcon({
  resource,
  size,
  className,
  name,
  semanticRole,
  variant,
}: {
  resource?: IconResource;
  size: number;
  className?: string;
  name?: string;
  semanticRole: string;
  variant?: string;
}) {
  useThemeNeed({ type: 'icon', role: semanticRole, variant });
  if (resource?.type === 'image')
    return (
      <img
        className={className}
        width={size}
        height={size}
        src={resource.resource}
        alt=""
        aria-hidden="true"
        data-pixel-icon={name}
      />
    );
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={resource?.viewBox ?? '0 0 16 16'}
      data-pixel-icon={name}
      aria-hidden="true"
      focusable="false"
      shapeRendering={resource?.shapeRendering}
      style={{ fill: 'currentColor', stroke: 'none' }}
    >
      {resource?.layers.map((layer, index) => (
        <path key={index} {...layer} />
      ))}
    </svg>
  );
}

export function PixelIcon({
  name,
  size = 24,
  className,
}: {
  name: PixelIconName;
  size?: number;
  className?: string;
}) {
  const theme = useOptionalTheme();
  return (
    <SemanticIcon
      resource={theme?.icon(name)}
      size={size}
      className={className}
      name={name}
      semanticRole={name}
    />
  );
}
