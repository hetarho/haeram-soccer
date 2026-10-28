import type { ShirtDesign, WornKeeper, WornKit } from '../../../../packages/contracts/src/identity';
import {
  FIGURE_TORSO,
  figureShirtColourAt,
  shirtPatternRegions,
} from '../../../../packages/engine/src/kit-patterns';
import type { FigurePoint, FigurePose } from './figurePose';

/**
 * MATCH-36, KIT-3/7/8, WEB-49/87: one Canvas painter for the top-down player figure, shared by match
 * observation, retained replay and the kit previews (spec/ssot/MATCH.md). It draws a `FigurePose`
 * (T543) wearing a `WornKit` or `WornKeeper`; the torso's pattern and trim come from the shared
 * geometry in `kit-patterns.ts` (`FIGURE_TORSO`), the same one kit selection samples, so a point
 * is painted the colour selection judged it by.
 *
 * Painting draws only: it never changes the pose, the position or the kit. The painter keeps a
 * bounded cache of torso sprites (shirt, detail step, pixel size, DPR); limbs, head and outlines
 * are drawn live on every call, since the pose moves them.
 *
 * The body is drawn in one frame turned by the pose's `facing`: torso widths, forward up (−Y) and
 * the player's right +X, so `FIGURE_TORSO`'s unit square (chest at y=0) maps straight onto it.
 */

/**
 * Detail steps by the torso's width in device pixels (MATCH-36 scale rule): `full` from 40 px,
 * `medium` from 18 px, `flat` below.
 * - full: hair strands, sleeve cuffs, boot detail, shading, limb edges and glove seams;
 * - medium: drops the strands, cuffs, limb edges and glove seams;
 * - flat: flat colour areas only: the torso's pattern regions, limb outlines, the hair and a larger
 *   facing cue.
 */
export const FIGURE_LOD = Object.freeze({ full: 40, medium: 18 });
export type FigureDetail = 'full' | 'medium' | 'flat';

/** The fixed number of cached torso sprites; the oldest entry goes first beyond it (FIFO). */
export const FIGURE_SPRITE_LIMIT = 128;

/** MATCH-36: a player's own skin and hair, the same in every match; no gameplay meaning. */
export interface PlayerLook {
  skin: string;
  hair: string;
  style: HairStyle;
}
export const HAIR_STYLES = ['crop', 'short', 'curly', 'swept', 'buzz'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];

/** A broad, natural range of skin tones, lightest to darkest. */
export const SKIN_TONES: readonly string[] = Object.freeze([
  '#f5d6c0',
  '#ecc3a3',
  '#e0ad88',
  '#cf9670',
  '#bb8159',
  '#a26b45',
  '#8a5636',
  '#70432a',
  '#583322',
  '#41261a',
]);
/** Hair colours, darkest first; the darker ones repeat, as they are the most common. */
export const HAIR_COLOURS: readonly string[] = Object.freeze([
  '#15110f',
  '#15110f',
  '#241a14',
  '#241a14',
  '#38261a',
  '#38261a',
  '#523722',
  '#6f4c2d',
  '#93683d',
  '#b98d55',
  '#d2b177',
  '#8c4325',
]);
/** The hair colours a darker skin draws from: the first ones, the darkest. */
const DARK_HAIR = 7;
/** Skin tones from here on take `DARK_HAIR`. */
const DARK_SKIN = 6;

/** FNV-1a over the ID with a final avalanche, so similar IDs still spread over the palettes. */
function lookHash(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The look of player `id`, reproducible from the ID alone (MATCH-36). */
export function playerLook(id: string): PlayerLook {
  const h = lookHash(id);
  const skin = h % SKIN_TONES.length;
  const hairs = skin >= DARK_SKIN ? DARK_HAIR : HAIR_COLOURS.length;
  return {
    skin: SKIN_TONES[skin]!,
    hair: HAIR_COLOURS[(h >>> 8) % hairs]!,
    style: HAIR_STYLES[(h >>> 20) % HAIR_STYLES.length]!,
  };
}

/** The detail step for a torso `2 · radius` CSS px wide at `dpr` device px per CSS px. */
export function figureDetail(radius: number, dpr: number): FigureDetail {
  const pixels = 2 * radius * dpr;
  return pixels >= FIGURE_LOD.full ? 'full' : pixels >= FIGURE_LOD.medium ? 'medium' : 'flat';
}

/** The 2D calls that paint a figure or a sprite. A real `CanvasRenderingContext2D` satisfies it. */
export interface FigurePaintContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    start: number,
    end: number,
    ccw?: boolean,
  ): void;
  clip(): void;
  fill(rule?: CanvasFillRule): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
}

/** The target a figure is drawn into: the painting calls plus a blit of sprite surface `S`. */
export interface FigureContext<
  S extends FigureCanvas = HTMLCanvasElement,
> extends FigurePaintContext {
  drawImage(image: S, x: number, y: number, width: number, height: number): void;
}

/** An offscreen surface holding one torso sprite. A real `HTMLCanvasElement` satisfies it. */
export interface FigureCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): FigurePaintContext | null;
}

/** Makes a sprite surface of the given device-pixel size; injected by tests. */
export type FigureCanvasFactory<S extends FigureCanvas = FigureCanvas> = (
  width: number,
  height: number,
) => S;

export interface FigureDrawOptions<S extends FigureCanvas = HTMLCanvasElement> {
  /** The figure's centre, CSS px. */
  x: number;
  y: number;
  /** Half the torso's width, CSS px: callers on the pitch pass `markerRadius(width)` (MATCH-36). */
  radius: number;
  /** Device pixels per CSS pixel the target context is scaled by. */
  dpr: number;
  look: PlayerLook;
  /** The theme's marker outline and its width in CSS px (WEB-91), around the whole silhouette. */
  outline: string;
  outlineWidth: number;
  /**
   * Draws the ball this figure holds, at its socket, in the caller's own space; called at the
   * layer the socket sits in: at the feet over the legs, held high over the head. Without a socket
   * in the pose it is called last, over the figure.
   */
  ball?: (ctx: FigureContext<S>) => void;
}

export interface FigurePainter<S extends FigureCanvas = HTMLCanvasElement> {
  /**
   * Draw one figure. Every state change is made inside save/restore, so nothing leaks to the next
   * figure, the ball or a number tag.
   */
  draw(
    ctx: FigureContext<S>,
    pose: FigurePose,
    kit: WornKit | WornKeeper,
    options: FigureDrawOptions<S>,
  ): void;
  /** Number of cached sprites (at most `FIGURE_SPRITE_LIMIT`). */
  readonly size: number;
}

/**
 * Every length the figure is drawn with, in torso widths unless named otherwise; started from
 * prototype B's anatomy, rescaled to the T542 torso (width 1, depth 1 / `FIGURE_TORSO.aspect`).
 */
const PAINT = {
  thigh: 0.22,
  shin: 0.16,
  upperArm: 0.17,
  forearm: 0.14,
  /** The shorts' legs: width, and how far down the thigh they reach. */
  shortsLeg: 0.27,
  shortsLength: 0.5,
  /** The shorts around the hips: half width and half depth. */
  shorts: [0.33, 0.16],
  /** Where the sock starts down the shin, from the knee. */
  sockTop: 0.2,
  /** A sleeve's width and its share of the upper arm; the cuff is the end share of that. */
  sleeve: 0.21,
  sleeveLength: 0.55,
  cuff: 0.14,
  /** Boots: width, length, the toe's reach ahead of the ankle and each foot's outward turn. */
  boot: { width: 0.13, length: 0.27, toe: 0.06, splay: 0.15 },
  hand: 0.08,
  glove: 0.11,
  /** The nose, the facing cue, as radii across and along; larger at the flat step. */
  nose: [0.045, 0.06],
  flatNose: [0.075, 0.1],
  ear: [0.035, 0.05],
  /** A jump draws the body this much larger per torso width of lift, nearer the eye. */
  jumpScale: 0.5,
  /** Lying full length draws the torso this much deeper, the back toward the ground. */
  lyingStretch: 0.5,
  /** The ground shadow: half axes, its offset from the light and how a jump carries it away. */
  shadow: { rx: 0.62, ry: 0.36, offset: [0.07, 0.12], lift: 2 },
  /** Torso sprites are painted at this many pixels per device pixel, so turning keeps edges. */
  oversample: 2,
} as const;

const COLOURS = {
  shadow: '#0000003d',
  boot: '#17191b',
  bootDetail: '#d6d9cc',
  /** Inner edges between parts and the torso's own edge. */
  edge: '#00000038',
  shade: '#00000021',
  highlight: '#ffffff1c',
  strandLight: '#ffffff26',
  strandDark: '#00000033',
  seam: '#00000040',
};

/** Sleeves are sampled down this column of the torso, just inside each sleeve band. */
const SLEEVE_COLUMN = [0.1, 0.9] as const;
const SLEEVE_SAMPLES = 16;

const TAU = Math.PI * 2;

type Point = readonly [number, number];

/** A pose point in the body frame: forward is up (−Y), the player's right +X. */
const at = (p: FigurePoint): [number, number] => [p[0], -p[1]];
const along = (a: Point, b: Point, t: number): [number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/**
 * Where a pose point is drawn, CSS px: the frame `draw` paints in, centred at (x, y), a torso width
 * `2 · radius` px and larger with a jump. A held ball's socket goes through this.
 */
export function figurePoint(
  pose: FigurePose,
  point: readonly [number, number],
  options: Pick<FigureDrawOptions, 'x' | 'y' | 'radius'>,
): [number, number] {
  const scale = 2 * options.radius * (1 + pose.jump * PAINT.jumpScale);
  const c = Math.cos(pose.facing),
    s = Math.sin(pose.facing);
  return [
    options.x + (point[1] * c - point[0] * s) * scale,
    options.y + (point[1] * s + point[0] * c) * scale,
  ];
}

/** The torso's rounded rectangle at (left, top), `w` across and `d` deep, `FIGURE_TORSO`'s corners. */
function torsoPath(c: FigurePaintContext, left: number, top: number, w: number, d: number) {
  const rx = (FIGURE_TORSO.cornerRadius / FIGURE_TORSO.aspect) * w,
    ry = FIGURE_TORSO.cornerRadius * d;
  const right = left + w,
    bottom = top + d;
  c.beginPath();
  c.moveTo(left + rx, top);
  c.lineTo(right - rx, top);
  c.ellipse(right - rx, top + ry, rx, ry, 0, -Math.PI / 2, 0);
  c.lineTo(right, bottom - ry);
  c.ellipse(right - rx, bottom - ry, rx, ry, 0, 0, Math.PI / 2);
  c.lineTo(left + rx, bottom);
  c.ellipse(left + rx, bottom - ry, rx, ry, 0, Math.PI / 2, Math.PI);
  c.lineTo(left, top + ry);
  c.ellipse(left + rx, top + ry, rx, ry, 0, Math.PI, Math.PI * 1.5);
  c.closePath();
}

/** A whole ellipse as its own subpath, so several fill as one path without joining lines. */
function ellipsePath(
  c: FigurePaintContext,
  x: number,
  y: number,
  rx: number,
  ry: number,
  rotation = 0,
) {
  c.moveTo(x + rx * Math.cos(rotation), y + rx * Math.sin(rotation));
  c.ellipse(x, y, rx, ry, rotation, 0, TAU);
}

function polygonPath(c: FigurePaintContext, points: readonly Point[], w: number, d: number) {
  points.forEach(([u, v], i) => (i ? c.lineTo(u * w, v * d) : c.moveTo(u * w, v * d)));
  c.closePath();
}

/**
 * Paint a shirt into a `w`×`d` px torso sprite: field, the pattern's polygons and the sleeve and
 * collar trim, all from `FIGURE_TORSO`'s unit square, then translucent shading above `flat`.
 */
function paintTorso(
  c: FigurePaintContext,
  shirt: ShirtDesign,
  w: number,
  d: number,
  detail: FigureDetail,
) {
  const { aspect, sleeveTrim, collar } = FIGURE_TORSO;
  c.save();
  torsoPath(c, 0, 0, w, d);
  c.clip();
  c.fillStyle = shirt.primary;
  c.fillRect(0, 0, w, d);
  const regions = shirtPatternRegions(shirt.pattern);
  if (shirt.secondary !== undefined && regions.length) {
    c.beginPath();
    for (const polygon of regions) polygonPath(c, polygon, w, d);
    c.fillStyle = shirt.secondary;
    c.fill();
  }
  if (shirt.trim !== undefined) {
    // Sleeve bands at both shoulder ends, full depth.
    c.beginPath();
    for (const [x0, x1] of [
      [0, sleeveTrim],
      [1 - sleeveTrim, 1],
    ] as const)
      polygonPath(
        c,
        [
          [x0, 0],
          [x1, 0],
          [x1, 1],
          [x0, 1],
        ],
        w,
        d,
      );
    c.fillStyle = shirt.trim;
    c.fill();
    // The collar: the ring between its ellipse and the inner one the head covers, even-odd.
    c.beginPath();
    ellipsePath(c, collar.cx * w, collar.cy * d, collar.rx * w, collar.ry * d);
    ellipsePath(
      c,
      collar.cx * w,
      collar.cy * d,
      (collar.rx - collar.band) * w,
      (collar.ry - collar.band * aspect) * d,
    );
    c.fillStyle = shirt.trim;
    c.fill('evenodd');
  }
  if (detail !== 'flat') {
    // The back falls away from the light; a soft highlight sits on the near shoulder.
    c.fillStyle = COLOURS.shade;
    c.fillRect(0, d * 0.62, w, d * 0.38);
    c.beginPath();
    ellipsePath(c, w * 0.3, d * 0.32, w * 0.2, d * 0.24);
    c.fillStyle = COLOURS.highlight;
    c.fill();
    torsoPath(c, 0, 0, w, d);
    c.strokeStyle = COLOURS.edge;
    c.lineWidth = Math.max(1, w * 0.014);
    c.stroke();
  }
  c.restore();
}

/** Each sleeve's colour: the pattern colour covering most of the torso column beside its band. */
function sleeveColours(shirt: ShirtDesign): [string, string] {
  const [left, right] = SLEEVE_COLUMN.map((u) => {
    let secondary = 0;
    for (let j = 0; j < SLEEVE_SAMPLES; j++)
      if (figureShirtColourAt(shirt, u, (j + 0.5) / SLEEVE_SAMPLES) === shirt.secondary)
        secondary++;
    return secondary * 2 > SLEEVE_SAMPLES ? shirt.secondary! : shirt.primary;
  });
  return [left!, right!];
}

/**
 * The cache key: every visible shirt field, the detail step, the sprite's pixel width and the DPR.
 * A plain shirt shows no secondary, so a stray one does not split its entry.
 */
function torsoKey(shirt: ShirtDesign, detail: FigureDetail, pixels: number, dpr: number) {
  const secondary = shirt.pattern === 'plain' ? '' : (shirt.secondary ?? '');
  return [shirt.pattern, shirt.primary, secondary, shirt.trim ?? '', detail, pixels, dpr].join('|');
}

function browserCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

interface TorsoEntry<S> {
  canvas: S | null;
  sleeves: [string, string];
}

/** Where each part of a pose is drawn, in the body frame. */
function partsOf(pose: FigurePose) {
  const B = PAINT.boot;
  const legs = pose.legs.map((leg, i) => {
    const hip = at(leg.root),
      knee = at(leg.joint),
      foot = at(leg.end);
    // Boots point the way the hips face, each turned out a little.
    const turn = pose.twist + (i ? B.splay : -B.splay);
    return {
      hip,
      knee,
      foot,
      shorts: along(hip, knee, PAINT.shortsLength),
      sock: along(knee, foot, PAINT.sockTop),
      toe: [foot[0] + Math.sin(turn) * B.toe, foot[1] - Math.cos(turn) * B.toe] as const,
      turn,
    };
  });
  const arms = pose.arms.map((arm) => {
    const root = at(arm.root),
      elbow = at(arm.joint);
    return {
      root,
      elbow,
      hand: at(arm.end),
      sleeve: along(root, elbow, PAINT.sleeveLength),
      cuff: along(root, elbow, PAINT.sleeveLength * (1 - PAINT.cuff)),
    };
  });
  const hips = along(legs[0]!.hip, legs[1]!.hip, 0.5);
  return { legs, arms, hips, head: at(pose.head) };
}
type Parts = ReturnType<typeof partsOf>;

/** Stroke every segment of `list` as one path, round-ended unless `cap` says otherwise. */
function segments(
  c: FigurePaintContext,
  list: readonly (readonly [Point, Point])[],
  width: number,
  colour: string,
  cap: CanvasLineCap = 'round',
) {
  c.beginPath();
  for (const [a, b] of list) {
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
  }
  c.lineCap = cap;
  c.lineWidth = width;
  c.strokeStyle = colour;
  c.stroke();
}

/** Like `segments`, under a slightly wider darker edge at the full step. */
function limbs(
  c: FigurePaintContext,
  list: readonly (readonly [Point, Point])[],
  width: number,
  colour: string,
  detail: FigureDetail,
  edge: number,
  cap: CanvasLineCap = 'round',
) {
  if (detail === 'full') segments(c, list, width + edge * 2, COLOURS.edge, cap);
  segments(c, list, width, colour, cap);
}

/** Fill the ellipses of `list` ([x, y, rx, ry, rotation]) as one path. */
function blobs(
  c: FigurePaintContext,
  list: readonly (readonly [number, number, number, number, number])[],
  colour: string,
) {
  c.beginPath();
  for (const [x, y, rx, ry, rotation] of list) ellipsePath(c, x, y, rx, ry, rotation);
  c.fillStyle = colour;
  c.fill();
}

/** The hair's ellipses for `style` around the head at `head`, grown by `grow` (the outline). */
function hairShapes(
  style: HairStyle,
  head: Point,
  grow: number,
): (readonly [number, number, number, number, number])[] {
  const r = FIGURE_TORSO.head.r;
  const [hx, hy] = head;
  // The crown sits back on the head, leaving the forehead at the front as a skin crescent.
  const base = (back: number, across: number, deep: number) =>
    [hx, hy + r * back, r * across + grow, r * deep + grow, 0] as const;
  switch (style) {
    case 'crop':
      return [base(0.2, 1, 0.94)];
    case 'short':
      return [base(0.26, 1, 0.9)];
    case 'buzz':
      return [base(0.2, 0.92, 0.86)];
    case 'swept':
      // A fringe swept over to his right.
      return [
        base(0.2, 1, 0.94),
        [hx + r * 0.36, hy - r * 0.32, r * 0.52 + grow, r * 0.44 + grow, 0.5],
      ];
    case 'curly': {
      const shapes: (readonly [number, number, number, number, number])[] = [
        base(0.18, 1.04, 0.98),
      ];
      // Curls around the rim, none over the forehead.
      for (let k = 0; k < 7; k++) {
        const a = Math.PI * (0.05 + (k / 6) * 0.9);
        shapes.push([
          hx + Math.cos(a) * r * 0.78 * (k % 2 ? 1 : 0.96),
          hy + r * 0.18 + Math.sin(a) * r * 0.82,
          r * 0.34 + grow,
          r * 0.34 + grow,
          0,
        ]);
      }
      return shapes;
    }
  }
}

/** The nose, the facing cue, at the front of the head: [x, y, rx, ry]. */
function nose(head: Point, detail: FigureDetail) {
  const [rx, ry] = detail === 'flat' ? PAINT.flatNose : PAINT.nose;
  return [head[0], head[1] - FIGURE_TORSO.head.r - ry * 0.25, rx, ry] as const;
}

/**
 * Create a painter with its own torso-sprite cache. Keep one instance per mounted pitch or
 * preview. The factory defaults to a normal DOM canvas, created only when a sprite is first needed.
 */
export function createFigurePainter(): FigurePainter<HTMLCanvasElement>;
export function createFigurePainter<S extends FigureCanvas>(
  canvasFactory: FigureCanvasFactory<S>,
): FigurePainter<S>;
export function createFigurePainter(
  canvasFactory: FigureCanvasFactory = browserCanvas,
): FigurePainter<FigureCanvas> {
  const sprites = new Map<string, TorsoEntry<FigureCanvas>>();

  const torso = (shirt: ShirtDesign, detail: FigureDetail, width: number, dpr: number) => {
    const w = Math.max(1, Math.ceil(width * dpr * PAINT.oversample));
    const key = torsoKey(shirt, detail, w, dpr);
    // FIFO: a hit does not refresh an entry's place.
    const hit = sprites.get(key);
    if (hit) return hit;
    const d = Math.max(1, Math.ceil(w / FIGURE_TORSO.aspect));
    const canvas = canvasFactory(w, d);
    const c = canvas.getContext('2d');
    if (c) paintTorso(c, shirt, w, d, detail);
    const entry = { canvas: c ? canvas : null, sleeves: sleeveColours(shirt) };
    sprites.set(key, entry);
    while (sprites.size > FIGURE_SPRITE_LIMIT) sprites.delete(sprites.keys().next().value!);
    return entry;
  };

  return {
    get size() {
      return sprites.size;
    },
    draw(ctx, pose, kit, options) {
      const { x, y, radius, dpr, look, outline } = options;
      const detail = figureDetail(radius, dpr);
      const width = 2 * radius;
      const scale = width * (1 + pose.jump * PAINT.jumpScale);
      const turn = pose.facing + Math.PI / 2;
      const shirt = kit.shirt;
      const gloves = 'gloves' in kit ? kit.gloves : undefined;
      const sprite = torso(shirt, detail, width, dpr);
      const parts = partsOf(pose);
      const grow = options.outlineWidth / scale;
      // Inner edges between parts, 0.7 CSS px wide.
      const edge = 0.7 / scale;
      const depth = (1 + pose.lying * PAINT.lyingStretch) / FIGURE_TORSO.aspect;
      const top = -0.5 / FIGURE_TORSO.aspect;
      const socket = options.ball && pose.ball;
      const highBall = !!socket && socket.height > 0.5;

      const enter = () => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(turn);
        ctx.scale(scale, scale);
        ctx.lineJoin = 'round';
      };
      const ball = () => options.ball?.(ctx);

      ctx.save();
      paintShadow(ctx, pose, x, y, width, turn);
      enter();
      paintSilhouette(
        ctx,
        parts,
        look.style,
        outline,
        grow,
        depth,
        top,
        gloves !== undefined,
        detail,
      );
      paintLegs(ctx, parts, kit, look, detail, edge);
      paintShorts(ctx, parts, pose.twist, kit.shorts, detail, edge);
      if (socket && !highBall) {
        ctx.restore();
        ball();
        enter();
      }
      if (!pose.overhead)
        paintArms(ctx, parts, sprite.sleeves, shirt.trim, look, gloves, detail, edge);
      if (sprite.canvas) ctx.drawImage(sprite.canvas, -0.5, top, 1, depth);
      else {
        // No offscreen context (exhausted canvas memory): a solid shirt.
        torsoPath(ctx, -0.5, top, 1, depth);
        ctx.fillStyle = shirt.primary;
        ctx.fill();
      }
      paintHead(ctx, parts.head, look, detail);
      if (highBall) {
        ctx.restore();
        ball();
        enter();
      }
      if (pose.overhead)
        paintArms(ctx, parts, sprite.sleeves, shirt.trim, look, gloves, detail, edge);
      ctx.restore();
      if (options.ball && !socket) ball();
      ctx.restore();
    },
  };
}

/** The ground shadow, offset from the light in screen space and shaped by the body. */
function paintShadow(
  ctx: FigurePaintContext,
  pose: FigurePose,
  x: number,
  y: number,
  width: number,
  turn: number,
) {
  const S = PAINT.shadow;
  const away = width * (1 + pose.jump * S.lift) * (1 - pose.lying * 0.5);
  ctx.save();
  ctx.translate(x + S.offset[0] * away, y + S.offset[1] * away);
  ctx.rotate(turn);
  ctx.beginPath();
  ctx.ellipse(
    0,
    0,
    S.rx * width * (1 - pose.jump * 0.3),
    S.ry * width * (1 + pose.lying),
    0,
    0,
    TAU,
  );
  ctx.fillStyle = COLOURS.shadow;
  ctx.fill();
  ctx.restore();
}

/** Every part grown by the outline width in the outline colour, under the figure (WEB-91). */
function paintSilhouette(
  c: FigurePaintContext,
  { legs, arms, hips, head }: Parts,
  style: HairStyle,
  outline: string,
  grow: number,
  depth: number,
  top: number,
  keeper: boolean,
  detail: FigureDetail,
) {
  const g = grow * 2;
  segments(
    c,
    legs.map((l) => [l.hip, l.knee] as const),
    PAINT.thigh + g,
    outline,
  );
  segments(
    c,
    legs.map((l) => [l.knee, l.foot] as const),
    PAINT.shin + g,
    outline,
  );
  segments(
    c,
    legs.map((l) => [l.hip, l.shorts] as const),
    PAINT.shortsLeg + g,
    outline,
  );
  segments(
    c,
    arms.map((a) => [a.root, a.elbow] as const),
    PAINT.upperArm + g,
    outline,
  );
  segments(
    c,
    arms.map((a) => [a.root, a.sleeve] as const),
    PAINT.sleeve + g,
    outline,
    'butt',
  );
  segments(
    c,
    arms.map((a) => [a.elbow, a.hand] as const),
    PAINT.forearm + g,
    outline,
  );
  const B = PAINT.boot;
  const hand = keeper ? PAINT.glove : PAINT.hand;
  const [nx, ny, nrx, nry] = nose(head, detail);
  blobs(
    c,
    [
      [hips[0], hips[1], PAINT.shorts[0] + grow, PAINT.shorts[1] + grow, 0],
      ...legs.map(
        (l) => [l.toe[0], l.toe[1], B.width / 2 + grow, B.length / 2 + grow, l.turn] as const,
      ),
      ...arms.map((a) => [a.hand[0], a.hand[1], hand + grow, hand + grow, 0] as const),
      [head[0], head[1], FIGURE_TORSO.head.r + grow, FIGURE_TORSO.head.r + grow, 0],
      [nx, ny, nrx + grow, nry + grow, 0],
      ...hairShapes(style, head, grow),
    ],
    outline,
  );
  torsoPath(c, -0.5, top, 1, depth);
  c.lineWidth = g;
  c.strokeStyle = outline;
  c.stroke();
}

/** Thighs and shins in skin, socks to the boots, and the boots. */
function paintLegs(
  c: FigurePaintContext,
  { legs }: Parts,
  kit: WornKit | WornKeeper,
  look: PlayerLook,
  detail: FigureDetail,
  edge: number,
) {
  limbs(
    c,
    legs.map((l) => [l.hip, l.knee] as const),
    PAINT.thigh,
    look.skin,
    detail,
    edge,
  );
  limbs(
    c,
    legs.map((l) => [l.knee, l.sock] as const),
    PAINT.shin,
    look.skin,
    detail,
    edge,
  );
  limbs(
    c,
    legs.map((l) => [l.sock, l.foot] as const),
    PAINT.shin,
    kit.socks,
    detail,
    edge,
  );
  const B = PAINT.boot;
  blobs(
    c,
    legs.map((l) => [l.toe[0], l.toe[1], B.width / 2, B.length / 2, l.turn] as const),
    COLOURS.boot,
  );
  if (detail !== 'flat') {
    // A light band across each boot's laces.
    const across = legs.map((l) => {
      const c0 = Math.cos(l.turn),
        s0 = Math.sin(l.turn);
      const half = B.width * 0.32;
      return [
        [l.toe[0] - c0 * half + s0 * 0.02, l.toe[1] - s0 * half - c0 * 0.02],
        [l.toe[0] + c0 * half + s0 * 0.02, l.toe[1] + s0 * half - c0 * 0.02],
      ] as const;
    });
    segments(c, across, B.width * 0.22, COLOURS.bootDetail);
  }
}

/** The shorts: each leg's share of the thigh and the seat around the hips, turned with them. */
function paintShorts(
  c: FigurePaintContext,
  { legs, hips }: Parts,
  twist: number,
  colour: string,
  detail: FigureDetail,
  edge: number,
) {
  limbs(
    c,
    legs.map((l) => [l.hip, l.shorts] as const),
    PAINT.shortsLeg,
    colour,
    detail,
    edge,
  );
  blobs(c, [[hips[0], hips[1], PAINT.shorts[0], PAINT.shorts[1], twist]], colour);
}

/** Arms in skin with sleeves in the shirt's colours, then hands or gloves. */
function paintArms(
  c: FigurePaintContext,
  { arms }: Parts,
  sleeves: readonly [string, string],
  trim: string | undefined,
  look: PlayerLook,
  gloves: string | undefined,
  detail: FigureDetail,
  edge: number,
) {
  limbs(
    c,
    arms.map((a) => [a.root, a.elbow] as const),
    PAINT.upperArm,
    look.skin,
    detail,
    edge,
  );
  limbs(
    c,
    arms.map((a) => [a.elbow, a.hand] as const),
    PAINT.forearm,
    look.skin,
    detail,
    edge,
  );
  if (sleeves[0] === sleeves[1])
    limbs(
      c,
      arms.map((a) => [a.root, a.sleeve] as const),
      PAINT.sleeve,
      sleeves[0],
      detail,
      edge,
      'butt',
    );
  else
    arms.forEach((a, i) =>
      limbs(c, [[a.root, a.sleeve]], PAINT.sleeve, sleeves[i]!, detail, edge, 'butt'),
    );
  if (detail === 'full' && trim !== undefined)
    segments(
      c,
      arms.map((a) => [a.cuff, a.sleeve] as const),
      PAINT.sleeve,
      trim,
      'butt',
    );
  const hand = gloves !== undefined ? PAINT.glove : PAINT.hand;
  blobs(
    c,
    arms.map((a) => [a.hand[0], a.hand[1], hand, hand, 0] as const),
    gloves ?? look.skin,
  );
  if (gloves !== undefined && detail === 'full')
    // A seam across each glove's fingers.
    segments(
      c,
      arms.map(
        (a) =>
          [
            [a.hand[0] - hand * 0.6, a.hand[1] - hand * 0.25],
            [a.hand[0] + hand * 0.6, a.hand[1] - hand * 0.25],
          ] as const,
      ),
      hand * 0.16,
      COLOURS.seam,
    );
}

/** The head from above: skin, ears, the nose as the facing cue, then the hair over the crown. */
function paintHead(c: FigurePaintContext, centre: Point, look: PlayerLook, detail: FigureDetail) {
  const r = FIGURE_TORSO.head.r;
  const [hx, hy] = centre;
  if (detail !== 'flat')
    blobs(
      c,
      [
        [hx - r * 0.98, hy + r * 0.05, PAINT.ear[0], PAINT.ear[1], 0],
        [hx + r * 0.98, hy + r * 0.05, PAINT.ear[0], PAINT.ear[1], 0],
      ],
      look.skin,
    );
  const [nx, ny, nrx, nry] = nose(centre, detail);
  blobs(
    c,
    [
      [hx, hy, r, r, 0],
      [nx, ny, nrx, nry, 0],
    ],
    look.skin,
  );
  blobs(c, hairShapes(look.style, centre, 0), look.hair);
  if (detail === 'full') {
    // A few strands across the crown, catching and losing the light.
    for (const [colour, side] of [
      [COLOURS.strandLight, -1],
      [COLOURS.strandDark, 1],
    ] as const) {
      c.beginPath();
      for (const k of [0.2, 0.55]) {
        c.moveTo(hx + side * r * k, hy - r * 0.5);
        c.lineTo(hx + side * r * (k + 0.12), hy + r * 0.75);
      }
      c.lineCap = 'round';
      c.lineWidth = r * 0.09;
      c.strokeStyle = colour;
      c.stroke();
    }
  }
  if (detail !== 'flat')
    blobs(c, [[hx - r * 0.35, hy - r * 0.1, r * 0.3, r * 0.42, 0.4]], COLOURS.highlight);
}
