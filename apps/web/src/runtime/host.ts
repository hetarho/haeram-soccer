import {
  createWorld,
  advanceRound,
  closeSeason,
  operate,
  managerOffers,
  transferOffers,
  sponsorOffers,
  campaignOffers,
  operatingCost,
  europeanCoefficient,
} from '../../../../packages/engine/src/index';
import type { World, MatchPlayback } from '../../../../packages/contracts/src/types';
import { decode, encode } from '../adapters/persistence';
import { requestSchema, type Request, type Reply, type View } from './protocol';
export class Host {
  world?: World;
  private session?: string;
  private acknowledgments = new Map<string, Reply>();
  private queue = Promise.resolve();
  cancelled = false;
  constructor(private progress: (reply: Reply) => void = () => {}) {}
  handle(input: unknown): Promise<Reply> {
    const task = this.queue.then(() => this.execute(input));
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  private view(w = this.world): View | undefined {
    if (!w) return;
    return {
      world: {
        ...w,
        ownMatches: w.ownMatches.slice(-30),
        fixtures: w.fixtures.filter((f) => f.home === w.playerClub || f.away === w.playerClub),
        history: w.history.map((h) => ({
          ...h,
          standings: [],
          europe: h.europe.map((e) => ({ ...e, standings: [], secondStandings: undefined })),
        })),
        events: w.events.slice(-150),
      },
      totalMatches: w.ownMatches.length,
      managers: managerOffers(w),
      transfers: transferOffers(w),
      sponsors: sponsorOffers(w),
      campaigns: campaignOffers(w),
      annualCost: operatingCost(w),
      coefficient: europeanCoefficient(w),
    };
  }
  private async execute(input: unknown): Promise<Reply> {
    let request: Request | undefined;
    try {
      request = requestSchema.parse(input);
      const r = request;
      if (this.session && this.session !== r.session) throw new Error('이전 세션의 요청입니다.');
      this.session = r.session;
      const previous = this.acknowledgments.get(r.requestId);
      if (previous) return previous;
      if (r.body.type !== 'inspect' && r.expectedRevision !== (this.world?.revision ?? -1))
        throw new Error('세계가 변경되었습니다. 오래된 요청은 적용하지 않습니다.');
      if (this.world?.receiptIds.includes(r.requestId)) throw new Error('이미 처리된 요청입니다.');
      let playback: MatchPlayback | undefined,
        raw: string | undefined,
        envelope: Reply['envelope'],
        archive: Reply['archive'],
        candidate: World | undefined;
      let changed = false;
      this.cancelled = false;
      if (r.body.type === 'inspect') {
        const result = await decode(r.body.raw);
        candidate = this.view(result.world)!.world;
        if (r.body.activate) this.world = result.world;
        envelope = result.envelope;
      } else if (r.body.type === 'found') {
        if (this.world && !r.body.replace)
          throw new Error('현재 세계가 있습니다. 파일 내보내기 후 새 게임을 시작하세요.');
        this.world = createWorld(r.body.input);
        changed = true;
      } else {
        const w = this.world;
        if (!w) throw new Error('먼저 클럽을 창단하세요.');
        if (r.body.type === 'command') {
          const cmd = r.body.command;
          if (cmd.type === 'advance' || cmd.type === 'season') {
            const limit = cmd.type === 'season' ? 46 - w.round : cmd.rounds;
            if (cmd.type === 'season' && w.critical)
              throw new Error('중요한 알림을 확인한 후 계속하세요.');
            for (let n = 0; n < limit; n++) {
              if (this.cancelled) break;
              if (w.round >= 46) {
                closeSeason(w);
                w.revision++;
              }
              const p = advanceRound(w);
              if (p) playback = p;
              if (n % 5 === 0) {
                this.progress({
                  requestId: r.requestId,
                  ok: true,
                  progress: (n + 1) / Math.max(1, limit),
                });
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
              if (w.critical) break;
            }
            if (cmd.type === 'season' && w.round === 46) {
              closeSeason(w);
              w.revision++;
            }
          } else operate(w, cmd);
          changed = true;
        } else if (r.body.type === 'ack-critical') {
          delete w.critical;
          w.revision++;
          changed = true;
        } else if (r.body.type === 'export')
          raw = await encode(w, r.generation, r.parentGeneration);
        if (r.body.type === 'archive') {
          const year = r.body.year;
          archive = {
            season: w.history.find((h) => h.year === year),
            matches: w.ownMatches.filter((m) => m.year === year),
            events: w.events.filter((e) => e.year === year),
            managers: w.events.filter((e) => e.kind.startsWith('manager-')),
          };
        }
      }
      if (changed && this.world) {
        this.world.receiptIds = [...this.world.receiptIds.slice(-199), r.requestId];
        raw = await encode(this.world, r.generation, r.parentGeneration);
      }
      const reply: Reply = {
        requestId: r.requestId,
        ok: true,
        view: this.view(),
        playback,
        raw,
        envelope,
        candidate,
        archive,
        cancelled: this.cancelled,
      };
      this.acknowledgments.set(r.requestId, reply);
      if (this.acknowledgments.size > 32)
        this.acknowledgments.delete(this.acknowledgments.keys().next().value!);
      return reply;
    } catch (error) {
      return {
        requestId:
          request?.requestId ?? ((input as { requestId?: string })?.requestId || 'invalid'),
        ok: false,
        error: String(error).slice(0, 1600),
        view: this.view(),
      };
    }
  }
}
