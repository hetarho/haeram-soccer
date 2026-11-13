import type { MatchFrame } from '../../packages/contracts/src/types';

/**
 * Historical press.py contract: once per holder interval, count its longest consecutive close
 * pressure run. Distances are playback units, duration is the staging's own elapsed seconds;
 * restarts whose dead interval contains the possession's start are excluded. This is a diagnostic,
 * not a real-football target or the staging metrics gate. Screen-clock retiming is not measured.
 */
export function pressureDiagnostics(frames: readonly MatchFrame[]) {
  let pressureSeconds = 0,
    pressureSpells2 = 0,
    pressureSpells5 = 0;
  for (const frame of frames) {
    const t0 = frame.startSeconds ?? 0;
    const motion = frame.motion ?? [];
    const dead = (frame.stoppages ?? []).map((s) => [t0 + s.dead, t0 + s.kick]);
    const holders = frame.holders ?? [];
    for (let k = 0; k < holders.length; k++) {
      const [start, who] = holders[k];
      if (!who) continue;
      const from = t0 + start,
        to = t0 + (holders[k + 1]?.[0] ?? 60);
      if (dead.some(([a, b]) => a <= from && from <= b)) continue;
      let run = 0,
        best = 0,
        previous: number | undefined,
        wasClose = false;
      for (const sample of motion) {
        const t = sample.elapsedSeconds;
        if (t < from || t > to) continue;
        const side = sample.players.findIndex((players) => players.some((p) => p.id === who));
        if (side < 0) continue;
        const carrier = sample.players[side].find((p) => p.id === who)!;
        const close = sample.players[1 - side].some(
          (p) =>
            p.state !== 'keeper' &&
            Math.hypot(p.position[0] - carrier.position[0], p.position[1] - carrier.position[1]) <
              2,
        );
        if (close) {
          const duration = previous !== undefined && wasClose ? t - previous : 0;
          run += duration;
          pressureSeconds += duration;
          best = Math.max(best, run);
        } else run = 0;
        previous = t;
        wasClose = close;
      }
      if (best >= 2) pressureSpells2++;
      if (best >= 5) pressureSpells5++;
    }
  }
  return { pressureSeconds, pressureSpells2, pressureSpells5 };
}
