/// <reference lib="webworker" />
/**
 * A match lab worker (→LAB-4): plays its slice of a run in its own lab world, and generates sides,
 * probes reads, summarizes runs and plays watched matches (→LAB-9) for the page. Overrides live only here, for one slice at a time.
 */
import type { LabReply, LabRequest } from './protocol';
import {
  generateLabSide,
  labSideFromOvrs,
  labStarterAverage,
  labWorld,
  playSlice,
  playWatch,
  probeLabReads,
  setLabPlayerOvr,
} from './runner';
import { summarizeRun } from './summary';

const post = (reply: LabReply) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply);

self.onmessage = (event: MessageEvent<LabRequest>) => {
  const m = event.data;
  try {
    switch (m.type) {
      case 'run': {
        const outcome = playSlice(m.sides, m.runSeed, m.overrides, m.from, m.count, (done) =>
          post({ type: 'progress', runId: m.runId, done }),
        );
        if (outcome.ok)
          post({ type: 'samples', runId: m.runId, from: m.from, results: outcome.samples });
        else
          post({
            type: 'failed',
            runId: m.runId,
            message: '적용할 수 없는 수치가 있습니다',
            rejected: outcome.rejected,
          });
        return;
      }
      case 'probe':
        post({ type: 'reads', paths: probeLabReads() });
        return;
      case 'generate': {
        const input = {
          side: m.side,
          seed: m.seed,
          tactic: m.tactic,
          average: m.average,
          spread: m.spread,
        };
        const side = m.ovrs ? labSideFromOvrs(input, m.ovrs) : generateLabSide(input);
        post({ type: 'side', requestId: m.requestId, side });
        return;
      }
      case 'setOvr':
        post({
          type: 'side',
          requestId: m.requestId,
          side: setLabPlayerOvr(m.side, m.sideIndex, m.index, m.ovr),
        });
        return;
      case 'watch': {
        const outcome = playWatch(m.sides, m.seed, m.overrides);
        if (outcome.ok)
          post({ type: 'playback', requestId: m.requestId, playback: outcome.playback });
        else
          post({
            type: 'failed',
            runId: -1,
            requestId: m.requestId,
            message: '적용할 수 없는 수치가 있습니다',
            rejected: outcome.rejected,
          });
        return;
      }
      case 'world':
        post({ type: 'world', requestId: m.requestId, world: labWorld().w });
        return;
      case 'summarize': {
        const names = new Map(
          m.sides.flatMap((s) => s.players.map((p) => [p.id, p.name] as const)),
        );
        post({
          type: 'summary',
          runId: m.runId,
          summary: summarizeRun(m.samples, {
            names: (id) => names.get(id) ?? id,
            averages: [labStarterAverage(m.sides[0]), labStarterAverage(m.sides[1])],
          }),
        });
        return;
      }
    }
  } catch (error) {
    post({
      type: 'failed',
      runId: 'runId' in m ? m.runId : -1,
      ...('requestId' in m && { requestId: m.requestId }),
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
