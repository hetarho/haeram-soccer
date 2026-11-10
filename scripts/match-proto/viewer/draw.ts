// Canvas 2D painting of one sample (ARCH-7: presentation only). Text drawn here is digits, symbols
// and identifiers from the data; there is no authored prose (ARCH-32).
import { PROTO_CONFIG } from '../core/config.ts';
import {
  BOX_X,
  BOX_Y,
  CENTRE,
  GOAL_Y,
  HALFWAY,
  PENALTY_X,
  PITCH,
  POST_HIGH,
  POST_LOW,
} from '../core/pitch.ts';
import type { Playback, Vec } from '../core/types.ts';
import {
  captionAt,
  clockLabel,
  flashesAt,
  offsideLines,
  scoreAt,
  toCanvas,
  type Flash,
  type Sample,
  type View,
} from './model.ts';

const { viewer } = PROTO_CONFIG;
const C = viewer.colours;
const M = viewer.markings;
const STRIPES = 10;
const TEAM_COLOURS = [C.home, C.away] as const;
const KEEPER_COLOURS = [C.keeperHome, C.keeperAway] as const;

export interface DrawOptions {
  offsideLines: boolean;
  roles: boolean;
  trail: boolean;
  width: number;
  height: number;
}

const line = (ctx: CanvasRenderingContext2D, view: View, a: Vec, b: Vec): void => {
  const [ax, ay] = toCanvas(view, a);
  const [bx, by] = toCanvas(view, b);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
};

/** A rectangle given by two world corners. */
const rect = (ctx: CanvasRenderingContext2D, view: View, a: Vec, b: Vec): void => {
  const [ax, ay] = toCanvas(view, a);
  const [bx, by] = toCanvas(view, b);
  ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
};

const disc = (
  ctx: CanvasRenderingContext2D,
  view: View,
  p: Vec,
  radiusPx: number,
  fill: boolean,
): void => {
  const [x, y] = toCanvas(view, p);
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  if (fill) ctx.fill();
  else ctx.stroke();
};

const grass = (ctx: CanvasRenderingContext2D, view: View, options: DrawOptions): void => {
  ctx.fillStyle = C.grassB;
  ctx.fillRect(0, 0, options.width, options.height);
  const [x0, y0] = toCanvas(view, [0, 0]);
  const w = (PITCH.length / STRIPES) * view.scale;
  for (let k = 0; k < STRIPES; k++) {
    ctx.fillStyle = k % 2 === 0 ? C.grassA : C.grassB;
    ctx.fillRect(x0 + k * w, y0, w, PITCH.width * view.scale);
  }
};

const markings = (ctx: CanvasRenderingContext2D, view: View): void => {
  ctx.strokeStyle = C.line;
  ctx.fillStyle = C.line;
  ctx.lineWidth = 2;
  rect(ctx, view, [0, 0], [PITCH.length, PITCH.width]);
  line(ctx, view, [HALFWAY, 0], [HALFWAY, PITCH.width]);
  disc(ctx, view, CENTRE, M.circle * view.scale, false);
  disc(ctx, view, CENTRE, Math.max(2, M.spot * view.scale), true);
  const [areaDepth, areaWidth] = M.goalArea;
  for (const end of [0, PITCH.length]) {
    const dir = end === 0 ? 1 : -1;
    const at = (depth: number): number => end + dir * depth;
    rect(ctx, view, [end, BOX_Y[0]], [at(PITCH.length - BOX_X), BOX_Y[1]]);
    rect(ctx, view, [end, GOAL_Y - areaWidth / 2], [at(areaDepth), GOAL_Y + areaWidth / 2]);
    disc(ctx, view, [at(PITCH.length - PENALTY_X), GOAL_Y], Math.max(2, M.spot * view.scale), true);
    rect(ctx, view, [end, POST_LOW], [at(-M.goalDepth), POST_HIGH]);
  }
};

const overlays = (
  ctx: CanvasRenderingContext2D,
  view: View,
  playback: Playback,
  sample: Sample,
): void => {
  const lines = offsideLines(playback, sample);
  ctx.save();
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  lines.forEach((x, team) => {
    ctx.strokeStyle = TEAM_COLOURS[team];
    line(ctx, view, [x, 0], [x, PITCH.width]);
  });
  ctx.restore();
};

const trailLine = (ctx: CanvasRenderingContext2D, view: View, trail: readonly Vec[]): void => {
  ctx.save();
  ctx.strokeStyle = C.ball;
  ctx.lineWidth = 2;
  for (let k = 1; k < trail.length; k++) {
    ctx.globalAlpha = k / trail.length;
    line(ctx, view, trail[k - 1], trail[k]);
  }
  ctx.restore();
};

const players = (
  ctx: CanvasRenderingContext2D,
  view: View,
  playback: Playback,
  sample: Sample,
  options: DrawOptions,
): void => {
  const r = Math.max(viewer.minPlayerPx, viewer.playerRadius * view.scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const player of playback.fixture.players) {
    const s = sample.players[player.index];
    const [x, y] = toCanvas(view, [s.x, s.y]);
    ctx.fillStyle = player.slot === 0 ? KEEPER_COLOURS[player.team] : TEAM_COLOURS[player.team];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.number;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + s.fx * r * (1 - viewer.facingTick), y + s.fy * r * (1 - viewer.facingTick));
    ctx.lineTo(x + s.fx * r, y + s.fy * r);
    ctx.stroke();
    ctx.fillStyle = C.number;
    ctx.font = `bold ${Math.round(r * viewer.numberScale)}px sans-serif`;
    ctx.fillText(String(player.number), x, y);
    if (options.roles) {
      ctx.font = `${viewer.roleFontPx}px sans-serif`;
      ctx.fillText(player.role, x, y + r + viewer.roleFontPx);
    }
    if (player.index === sample.owner) {
      ctx.strokeStyle = C.owner;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
};

const ball = (ctx: CanvasRenderingContext2D, view: View, sample: Sample): void => {
  const [bx, by, z] = sample.ball;
  const [x, y] = toCanvas(view, [bx, by]);
  const r = Math.max(viewer.minBallPx, viewer.ballRadius * (1 + z * viewer.ballGrow) * view.scale);
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ball;
  ctx.strokeStyle = C.ballEdge;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y - z * viewer.ballLift * view.scale, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

const flash = (ctx: CanvasRenderingContext2D, view: View, f: Flash): void => {
  const fade = Math.max(0, 1 - f.age / viewer.flashSeconds);
  const [x, y] = toCanvas(view, f.at);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.lineWidth = 2;
  if (f.kind === 'offside') {
    ctx.strokeStyle = C.offside;
    ctx.fillStyle = C.offside;
    if (f.line !== undefined) line(ctx, view, [f.line, 0], [f.line, PITCH.width]);
    const size = Math.max(6, view.scale * 1.5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - size * 2);
    ctx.lineTo(x + size, y - size * 1.5);
    ctx.lineTo(x, y - size);
    ctx.fill();
  } else if (f.kind === 'goal') {
    ctx.strokeStyle = C.owner;
    ctx.beginPath();
    ctx.arc(x, y, (2 + (f.age / viewer.flashSeconds) * 10) * view.scale, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = C.hudText;
    ctx.beginPath();
    ctx.arc(x, y, 1.8 * view.scale, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
};

const hud = (
  ctx: CanvasRenderingContext2D,
  playback: Playback,
  sample: Sample,
  options: DrawOptions,
): void => {
  const h = viewer.hud;
  const mid = h / 2;
  const [home, away] = scoreAt(playback, sample.t);
  ctx.fillStyle = C.hud;
  ctx.fillRect(0, 0, options.width, h);
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${viewer.hudFontPx}px sans-serif`;
  const em = viewer.hudFontPx;
  ctx.textAlign = 'left';
  ctx.fillStyle = C.home;
  ctx.fillText(playback.fixture.teams[0].code, em * 0.6, mid);
  ctx.fillStyle = C.hudText;
  ctx.textAlign = 'center';
  ctx.fillText(`${home} – ${away}`, em * 3, mid);
  ctx.textAlign = 'left';
  ctx.fillStyle = C.away;
  ctx.fillText(playback.fixture.teams[1].code, em * 4.6, mid);
  ctx.fillStyle = C.hudText;
  ctx.fillText(clockLabel(sample.t), em * 6.4, mid);
  ctx.font = `${viewer.captionFontPx}px monospace`;
  ctx.fillText(captionAt(playback, sample.t), em * 10.2, mid);
};

/** Paints the pitch, the overlays, the players, the ball, the recent flashes and the HUD bar. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  view: View,
  playback: Playback,
  sample: Sample,
  options: DrawOptions,
  trail?: readonly Vec[],
): void {
  grass(ctx, view, options);
  markings(ctx, view);
  if (options.offsideLines) overlays(ctx, view, playback, sample);
  if (options.trail && trail) trailLine(ctx, view, trail);
  players(ctx, view, playback, sample, options);
  ball(ctx, view, sample);
  for (const f of flashesAt(playback, sample.t)) flash(ctx, view, f);
  hud(ctx, playback, sample, options);
}
