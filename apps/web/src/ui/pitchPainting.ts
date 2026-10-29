/** Presentation-only pitch roles. Coordinates, shirts and clocks remain with their owners. */
const COLORS = {
  ground: '#253b31',
  chartGround: '#07110e',
  stripe: '#2b4538',
  stripeAlt: '#304b3d',
  line: '#d7dcc598',
  goal: '#e8efe6aa',
  markerOutline: '#ffffffcc',
  ball: '#ffffff',
  ballEdge: '#21392a',
  ballSeam: '#21392a',
  carrier: '#e8c15a',
  selection: '#f1f0e8',
  idleText: '#d7dcc5',
};

export interface PitchSkin extends Record<keyof typeof COLORS, string> {
  lineWidth: number;
  markerWidth: number;
  pixelSize: number;
  textureOpacity: number;
  textureSize: number;
  texture?: HTMLImageElement;
  textureUrl?: string;
}

export const DEFAULT_PITCH_SKIN: PitchSkin = Object.freeze({
  ...COLORS,
  lineWidth: 1.4,
  markerWidth: 1.2,
  pixelSize: 0,
  textureOpacity: 0,
  textureSize: 160,
});

export function resolvePitchSkin(style: Pick<CSSStyleDeclaration, 'getPropertyValue'>): PitchSkin {
  const value = (key: string) =>
    style.getPropertyValue(`--pitch-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`).trim();
  const numeric = (key: keyof PitchSkin, min: number, max: number) => {
    const text = value(key);
    const number = Number(text);
    return text && Number.isFinite(number) && number >= min && number <= max
      ? number
      : (DEFAULT_PITCH_SKIN[key] as number);
  };
  return Object.freeze({
    ...Object.fromEntries(
      Object.entries(COLORS).map(([key, fallback]) => [key, value(key) || fallback]),
    ),
    lineWidth: numeric('lineWidth', 0.5, 3),
    markerWidth: numeric('markerWidth', 0.5, 3),
    pixelSize: numeric('pixelSize', 0, 4),
    textureOpacity: numeric('textureOpacity', 0, 1),
    textureSize: numeric('textureSize', 16, 512),
  }) as PitchSkin;
}

/** The existing live geometry: all render treatments use this same projection. */
export const markerRadius = (width: number) => Math.max(6, width * 0.011);

export function paintPitchGround(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  skin: PitchSkin = DEFAULT_PITCH_SKIN,
) {
  const pad = width * 0.065;
  const fw = width - pad * 2;
  const fh = height - pad * 2;
  const x = (v: number) => pad + (fw * v) / 100;
  const y = (v: number) => pad + (fh * v) / 100;
  ctx.save();
  ctx.fillStyle = skin.ground;
  ctx.fillRect(0, 0, width, height);
  for (let stripe = 0; stripe < 10; stripe++) {
    ctx.fillStyle = stripe % 2 ? skin.stripe : skin.stripeAlt;
    ctx.fillRect(pad + (fw * stripe) / 10, pad, fw / 10 + 0.5, fh);
  }
  if (skin.texture && skin.textureOpacity) {
    const pattern = ctx.createPattern(skin.texture, 'repeat');
    if (pattern) {
      ctx.save();
      const sx = skin.textureSize / skin.texture.naturalWidth;
      const sy = skin.textureSize / skin.texture.naturalHeight;
      ctx.scale(sx, sy);
      ctx.globalAlpha = skin.textureOpacity;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width / sx, height / sy);
      ctx.restore();
    }
  }
  ctx.strokeStyle = skin.line;
  ctx.lineWidth = skin.lineWidth;
  ctx.strokeRect(pad, pad, fw, fh);
  ctx.beginPath();
  ctx.moveTo(x(50), pad);
  ctx.lineTo(x(50), y(100));
  ctx.stroke();
  ctx.beginPath();
  const centreRadius = Math.min(fw * 0.09, fh * 0.15);
  ctx.ellipse(x(50), y(50), centreRadius, centreRadius, 0, 0, Math.PI * 2);
  ctx.stroke();
  for (const side of [0, 1]) {
    ctx.strokeRect(x(side === 0 ? 0 : 82), y(22), fw * 0.18, fh * 0.56);
    ctx.strokeRect(x(side === 0 ? 0 : 94), y(38), fw * 0.06, fh * 0.24);
    ctx.fillStyle = skin.goal;
    ctx.fillRect(side === 0 ? pad - 4 : x(100), y(44), 4, fh * 0.12);
  }
  ctx.restore();
}

/** One replaceable static surface per mounted pitch; rAF only blits it. */
export function createGroundPainter(
  makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
) {
  let surface: HTMLCanvasElement | undefined;
  let previous: { width: number; height: number; dpr: number; skin: PitchSkin } | undefined;
  return {
    draw(
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      dpr: number,
      skin: PitchSkin,
    ) {
      if (width <= 0 || height <= 0) return;
      surface ??= makeCanvas();
      if (
        !previous ||
        previous.width !== width ||
        previous.height !== height ||
        previous.dpr !== dpr ||
        previous.skin !== skin
      ) {
        // Pixel art changes the static raster density, never player coordinates or interpolation.
        const scale = skin.pixelSize ? 1 / skin.pixelSize : dpr;
        surface.width = Math.ceil(width * scale);
        surface.height = Math.ceil(height * scale);
        const ground = surface.getContext('2d');
        if (!ground) {
          paintPitchGround(ctx, width, height, skin);
          return;
        }
        ground.setTransform(scale, 0, 0, scale, 0, 0);
        ground.imageSmoothingEnabled = !skin.pixelSize;
        paintPitchGround(ground, width, height, skin);
        previous = { width, height, dpr, skin };
      }
      ctx.save();
      ctx.imageSmoothingEnabled = !skin.pixelSize;
      ctx.drawImage(surface, 0, 0, width, height);
      ctx.restore();
    },
  };
}

/** The ground ball's radius on a pitch `width` CSS px wide; height enlarges it in the view. */
export const ballRadius = (width: number) => Math.max(3.2, width * 0.0065);

/**
 * The classic panels in ball radii: a central pentagon and five around it, each pentagon's centre
 * distance and corner radius. The outer ones are cut by the ball's edge.
 */
const BALL_PANELS = { centre: 0.36, ring: 0.95, outer: 0.34 } as const;

/** The pixel ball's outline in ball radii: a stepped octagon. */
const PIXEL_BALL = [
  [-0.5, -1],
  [0.5, -1],
  [0.5, -0.5],
  [1, -0.5],
  [1, 0.5],
  [0.5, 0.5],
  [0.5, 1],
  [-0.5, 1],
  [-0.5, 0.5],
  [-1, 0.5],
  [-1, -0.5],
  [-0.5, -0.5],
] as const;

/** Every panel's centre and corner radius around (x, y), turned by `spin`. */
function ballPanels(x: number, y: number, radius: number, spin: number) {
  const panels = [{ x, y, r: BALL_PANELS.centre * radius, turn: spin }];
  for (let i = 0; i < 5; i++) {
    const a = spin + (i * 2 * Math.PI) / 5 + Math.PI / 5;
    panels.push({
      x: x + Math.cos(a) * BALL_PANELS.ring * radius,
      y: y + Math.sin(a) * BALL_PANELS.ring * radius,
      r: BALL_PANELS.outer * radius,
      // The outer pentagons point at the centre one, as on a real ball.
      turn: a + Math.PI,
    });
  }
  return panels;
}

/**
 * A theme's football (MATCH-36): the leather in `skin.ball`, dark classic panels in
 * `skin.ballSeam` turned by `spin` radians as it travels, and a thin `skin.ballEdge` rim. The pixel
 * theme draws the same ball on its pixel grid. Centre and bounds are the same in every treatment.
 */
export function paintPitchBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  skin: PitchSkin,
  spin = 0,
) {
  const outline = () => {
    ctx.beginPath();
    if (skin.pixelSize) {
      for (const [index, [px, py]] of PIXEL_BALL.entries()) {
        if (index) ctx.lineTo(x + px * radius, y + py * radius);
        else ctx.moveTo(x + px * radius, y + py * radius);
      }
      ctx.closePath();
    } else ctx.arc(x, y, radius, 0, Math.PI * 2);
  };
  ctx.save();
  outline();
  ctx.fillStyle = skin.ball;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = skin.ballSeam;
  if (skin.pixelSize) {
    // One grid cell a panel, the centre one two cells across, snapped to the theme's pixels.
    const cell = skin.pixelSize;
    const snap = (v: number) => Math.round(v / cell) * cell;
    for (const [i, panel] of ballPanels(x, y, radius, spin).entries()) {
      const size = i ? cell : cell * 2;
      ctx.fillRect(snap(panel.x - size / 2), snap(panel.y - size / 2), size, size);
    }
  } else
    for (const panel of ballPanels(x, y, radius, spin)) {
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = panel.turn + (k * 2 * Math.PI) / 5;
        const px = panel.x + Math.cos(a) * panel.r,
          py = panel.y + Math.sin(a) * panel.r;
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  ctx.restore();
  // The rim, so the ball reads on every ground; the same path as the leather.
  outline();
  ctx.strokeStyle = skin.ballEdge;
  ctx.lineWidth = skin.pixelSize ? Math.min(1, skin.pixelSize / 2) : Math.max(0.6, radius * 0.14);
  ctx.stroke();
  ctx.restore();
}
