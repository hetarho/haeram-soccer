import { createLoadedLocale } from '../../apps/web/src/presentation/locale';
import { setLocaleFormatters, number } from '../../apps/web/src/presentation/format';
import { displayMessage, setTextLocale } from '../../apps/web/src/presentation/text';
import {
  presentationSamples,
  locate,
  presentationAdvance,
  frameElapsedMs,
  WATCH_SPEEDS,
  figureActionWindows,
  gaitDistances,
  keepersBySample,
  matchLook,
  createFigurePainter,
  playerLook,
  poseAt,
  markerRadius,
  paintPitchBall,
  PITCH_PAD,
  PITCH_METRES,
  createGroundPainter,
  type PitchSkin,
} from '../../apps/web/src/entities/match/logic';
import type { LocalePack, PackRegistry } from '../../apps/web/src/presentation/contracts';
import type { SourceMessageId } from '../../packages/contracts/src/messages';
import { assertComparable, readExport, type ComparisonExport } from './data';
import { ownSeconds, periodsOf, sharedTimeline, sharedPreparations } from './model';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const config = JSON.parse(element('config').textContent!) as {
  registry: PackRegistry<'locale'>;
  selected: LocalePack;
  baselinePack: LocalePack;
};
const locale = createLoadedLocale(config.registry, config.selected, config.baselinePack);
setTextLocale(locale);
setLocaleFormatters(locale.formatters);
const text = displayMessage;
const set = (id: string, key: SourceMessageId) => {
  element(id).textContent = text(key);
};
set('heading', 'naturalFootball.title');
set('same', 'naturalFootball.sameFacts');
set('help', 'naturalFootball.help');
set('loading', 'naturalFootball.loading');
set('speed-label', 'copy.Pitch.d65ad19603');
const seekInput = element<HTMLInputElement>('seek');
seekInput.setAttribute('aria-label', text('match.replay.seek'));
const speedInput = element<HTMLSelectElement>('speed');
for (const speed of WATCH_SPEEDS) {
  const option = document.createElement('option');
  option.value = String(speed);
  option.textContent = `${number(speed)}×`;
  speedInput.append(option);
}
for (const [id, seconds] of [
  ['back', -5],
  ['forward', 5],
] as const)
  element(id).textContent = text('naturalFootball.step', { seconds: number(seconds) });
const skin: PitchSkin = {
  ground: '#183e2e',
  chartGround: '#102b20',
  stripe: '#1d4934',
  stripeAlt: '#21513a',
  line: '#dce8d49c',
  goal: '#e8efe6aa',
  markerOutline: '#ffffffcc',
  ball: '#fff',
  ballEdge: '#21392a',
  ballSeam: '#21392a',
  carrier: '#e8c15a',
  selection: '#f1f0e8',
  idleText: '#d7dcc5',
  lineWidth: 1.4,
  markerWidth: 1.2,
  pixelSize: 0,
  textureOpacity: 0,
  textureSize: 160,
};

async function load(id: string) {
  const bytes = Uint8Array.from(atob(element(id).textContent!.trim()), (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return readExport(JSON.parse(await new Response(stream).text()));
}
function prepare(data: ComparisonExport, version: SourceMessageId) {
  const article = document.createElement('article');
  const header = document.createElement('header');
  const heading = document.createElement('h2');
  heading.textContent = text(version);
  const score = document.createElement('p');
  score.className = 'score';
  const clock = document.createElement('span');
  clock.className = 'clock';
  const provenance = document.createElement('p');
  provenance.className = 'provenance';
  provenance.textContent = text('naturalFootball.provenance', {
    seed: data.meta.seed,
    sha: data.meta.head.slice(0, 8),
  });
  header.append(heading, score, clock, provenance);
  const canvas = document.createElement('canvas');
  canvas.width = 1050;
  canvas.height = 680;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    text('naturalFootball.pitch', {
      version: text(version),
      home: data.meta.home,
      away: data.meta.away,
    }),
  );
  const metrics = document.createElement('div');
  metrics.className = 'metrics';
  for (const [key, parameters] of [
    ['naturalFootball.pressure2', { count: number(data.meta.diagnostics.pressureSpells2) }],
    ['naturalFootball.pressure5', { count: number(data.meta.diagnostics.pressureSpells5) }],
  ] as const) {
    const line = document.createElement('p');
    line.textContent = text(key, parameters);
    metrics.append(line);
  }
  article.append(header, canvas, metrics);
  element('panels').append(article);
  const timed = presentationSamples(data.playback.frames);
  return {
    data,
    canvas,
    score,
    clock,
    timed,
    periods: periodsOf(data.playback.frames),
    distances: gaitDistances(timed.samples),
    windows: figureActionWindows(data.playback.frames),
    keepers: keepersBySample(timed.samples, data.playback.squads),
    look: matchLook(data.playback.record),
    painter: createFigurePainter(),
    ground: createGroundPainter(),
    playerCount: 0,
    ball: [0, 0] as [number, number],
  };
}
type Panel = ReturnType<typeof prepare>;
function draw(panel: Panel, seconds: number, clock: string) {
  const { canvas, timed, data } = panel;
  const ctx = canvas.getContext('2d')!;
  const width = canvas.width,
    height = canvas.height,
    pad = width * PITCH_PAD;
  const fw = width - 2 * pad,
    fh = height - 2 * pad;
  const index = locate(timed.times, seconds, timed.sampleBreak),
    k = Math.floor(index),
    blend = index - k;
  const sample = timed.samples[k],
    next = timed.samples[Math.min(k + 1, timed.samples.length - 1)];
  const track = locate(timed.trackTimes, seconds, timed.trackBreak),
    tk = Math.floor(track),
    tb = track - tk;
  const a = timed.track[tk] ?? [...sample.ball, 0],
    b = timed.track[tk + 1] ?? a;
  const ball = [a[0] + (b[0] - a[0]) * tb, a[1] + (b[1] - a[1]) * tb] as [number, number];
  const ballHeight = a[2] + (b[2] - a[2]) * tb;
  panel.ball = ball;
  panel.ground.draw(ctx, width, height, 1, skin);
  let count = 0;
  for (const side of [0, 1] as const) {
    for (const player of sample.players?.[side] ?? []) {
      const after = next.players?.[side].find((p) => p.id === player.id);
      const position = [
        player.position[0] +
          ((after?.position[0] ?? player.position[0]) - player.position[0]) * blend,
        player.position[1] +
          ((after?.position[1] ?? player.position[1]) - player.position[1]) * blend,
      ] as [number, number];
      const dt = timed.sampleBreak(k) ? 0 : next.time - sample.time;
      const velocity: [number, number] =
        after && dt > 0
          ? [
              (after.position[0] - player.position[0]) / dt,
              (after.position[1] - player.position[1]) / dt,
            ]
          : player.velocity;
      const screenVelocity: [number, number] = [(velocity[0] * fw) / 100, (velocity[1] * fh) / 100];
      const keeper = panel.keepers[k][side] === player.id;
      const distances = panel.distances.get(player.id);
      const distance = distances
        ? distances[k] + ((distances[k + 1] ?? distances[k]) - distances[k]) * blend
        : NaN;
      const pose = poseAt(
        {
          id: player.id,
          keeper,
          time: seconds,
          position,
          speed: Math.hypot(velocity[0] * PITCH_METRES[0], velocity[1] * PITCH_METRES[1]),
          velocity: screenVelocity,
          velocityBefore: screenVelocity,
          toBall: [((ball[0] - position[0]) * fw) / 100, ((ball[1] - position[1]) * fh) / 100],
          ballHeight,
          carrier: sample.ownerId === player.id,
          distance,
        },
        panel.windows.get(player.id),
        { reducedMotion: false, unit: [fw / 100, fh / 100] },
      );
      const x = pad + (position[0] * fw) / 100,
        y = pad + (position[1] * fh) / 100;
      panel.painter.draw(
        ctx,
        pose,
        keeper ? panel.look.sides[side].keeperKit : panel.look.sides[side].kit,
        {
          x,
          y,
          radius: markerRadius(width),
          dpr: 1,
          look: playerLook(player.id),
          outline: '#ffffffaa',
          outlineWidth: 0.8,
        },
      );
      const jersey = data.playback.squads[side].findIndex((p) => p.id === player.id) + 1;
      ctx.fillStyle = '#fff';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(number(jersey), x, y + 22);
      count++;
    }
  }
  const bx = pad + (ball[0] * fw) / 100,
    by = pad + (ball[1] * fh) / 100;
  ctx.fillStyle = '#071a1680';
  ctx.beginPath();
  ctx.ellipse(bx, by, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  paintPitchBall(
    ctx,
    bx,
    by - (ballHeight * fh) / 100,
    4 + Math.min(ballHeight / 30, 1),
    skin,
    seconds * 0.5,
  );
  panel.playerCount = count;
  const frameIndex = Math.min(Math.floor(seconds / 60), data.playback.frames.length - 1);
  const frame = data.playback.frames[frameIndex];
  const score = { ...frame.score };
  for (const event of frame.events ?? []) {
    if (event.outcome === 'goal' && frameIndex * 60 + event.t > seconds) {
      if (event.side === 0) score.home--;
      else score.away--;
    }
  }
  panel.score.textContent = `${number(score.home)} – ${number(score.away)}`;
  panel.clock.textContent = clock;
}

async function start() {
  const data = await Promise.all([load('baseline-data'), load('candidate-data')]);
  assertComparable(data[0], data[1]);
  const panels = [
    prepare(data[0], 'naturalFootball.baseline'),
    prepare(data[1], 'naturalFootball.improved'),
  ];
  element('match').textContent = text('naturalFootball.match', {
    home: data[0].meta.home,
    away: data[0].meta.away,
  });
  const shared = sharedTimeline(data.map((d) => d.playback.frames));
  const preparations = sharedPreparations(
    data.map((d) => d.playback.frames),
    shared,
  );
  seekInput.max = String(shared.length);
  let seconds = 0,
    playing = false,
    speed = 1,
    previous = 0;
  const toggle = element<HTMLButtonElement>('toggle');
  const updateToggle = () => {
    toggle.textContent = text(playing ? 'copy.Pitch.4f51c0c8ad' : 'copy.Pitch.d43a776c5e');
    toggle.setAttribute('aria-pressed', String(playing));
  };
  const clockAt = () => {
    const first = panels[0];
    const own = ownSeconds(first.periods, shared, seconds);
    const frame =
      first.data.playback.frames[
        Math.min(Math.floor(own / 60), first.data.playback.frames.length - 1)
      ];
    return text('naturalFootball.clock', {
      minute: frame.label,
      second: locale.formatters.decimal(Math.floor(own % 60), {
        minimumIntegerDigits: 2,
        maximumFractionDigits: 0,
      }),
    });
  };
  const render = () => {
    const clock = clockAt();
    for (const panel of panels) draw(panel, ownSeconds(panel.periods, shared, seconds), clock);
    element('clock').textContent = clock;
    seekInput.value = String(seconds);
  };
  const seek = (value: number) => {
    seconds = Math.max(0, Math.min(shared.length, value));
    render();
  };
  const play = (value: boolean) => {
    playing = value;
    previous = 0;
    updateToggle();
  };
  toggle.onclick = () => play(!playing);
  element('back').onclick = () => seek(seconds - 5);
  element('forward').onclick = () => seek(seconds + 5);
  seekInput.oninput = () => seek(Number(seekInput.value));
  speedInput.onchange = () => {
    speed = Number(speedInput.value);
  };
  document.addEventListener('keydown', (event) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement
    )
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      play(!playing);
    }
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      seek(seconds + (event.code === 'ArrowLeft' ? -5 : 5));
    }
  });
  const animate = (time: number) => {
    if (playing) {
      seconds = presentationAdvance(
        seconds,
        frameElapsedMs(time, previous),
        speed,
        shared.length,
        preparations,
      );
      if (seconds >= shared.length) play(false);
      render();
    }
    previous = time;
    requestAnimationFrame(animate);
  };
  updateToggle();
  render();
  requestAnimationFrame(animate);
  element('loading').hidden = true;
  element('controls').hidden = false;
  Object.assign(window, {
    naturalFootball: {
      seek,
      play,
      state: () => ({
        seconds,
        playing,
        speed,
        length: shared.length,
        panels: panels.map((p) => ({
          clock: p.clock.textContent,
          players: p.playerCount,
          ball: p.ball,
          score: p.score.textContent,
        })),
      }),
    },
  });
}
start().catch((error) => {
  const status = element('loading');
  status.className = 'error';
  status.setAttribute('role', 'alert');
  status.textContent = text('naturalFootball.failed', {
    detail: error instanceof Error ? error.message : String(error),
  });
});
