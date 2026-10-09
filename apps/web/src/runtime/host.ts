import {
  createWorld,
  advanceRound,
  advanceDays,
  seasonLength,
  groupKey,
  closeSeason,
  operate,
  managerOffers,
  transferOffers,
  sponsorOffers,
  campaignOffers,
  operatingCost,
  europeanCoefficient,
  unreadAttention,
} from '../../../../packages/engine/src/index';
import type { World, MatchPlayback } from '../../../../packages/contracts/src/types';
import {
  isSaveCompatibilityError,
  upgradeWorldRules,
} from '../../../../packages/contracts/src/versions';
import { decode, encode } from '../adapters/persistence';
import { clubMilestones } from '../../../../packages/engine/src/goals';
import { financialBreakdown } from '../../../../packages/engine/src/finance';
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
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    const ownGroup = groupKey(own);
    return {
      world: {
        ...w,
        ownMatches: w.ownMatches.slice(-30),
        fixtures: w.fixtures.filter(
          (f) =>
            f.home === w.playerClub ||
            f.away === w.playerClub ||
            (w.lower ? f.kind === 'lower' : f.groupKey === ownGroup),
        ),
        history: w.history.map((h) => ({
          ...h,
          standings: [],
          europe: h.europe.map((e) => ({ ...e, standings: [], secondStandings: undefined })),
        })),
        events: w.events.slice(-150),
      },
      totalMatches: w.ownMatches.length,
      supportUsed: w.events.filter((event) => event.year === w.year && event.kind === 'support')
        .length,
      milestones: clubMilestones(w),
      managers: managerOffers(w),
      transfers: transferOffers(w),
      sponsors: sponsorOffers(w),
      campaigns: campaignOffers(w),
      annualCost: operatingCost(w),
      coefficient: europeanCoefficient(w),
      finance: financialBreakdown(w),
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
        candidate: World | undefined,
        upgraded = false;
      let changed = false;
      this.cancelled = false;
      if (r.body.type === 'inspect') {
        if (r.body.upgrade && !r.body.activate)
          throw new Error('규칙 업그레이드는 활성화할 때만 가능합니다.');
        const result = await decode(r.body.raw);
        const activated = r.body.upgrade ? upgradeWorldRules(result.world) : result.world;
        upgraded = activated !== result.world;
        candidate = this.view(activated)!.world;
        if (r.body.activate) this.world = activated;
        if (upgraded) raw = await encode(activated, r.generation, r.parentGeneration);
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
          if (cmd.type === 'advance-days' || cmd.type === 'next-match') {
            if (w.critical) throw new Error('중요한 알림을 확인한 후 계속하세요.');
            const matchCount = w.ownMatches.length,
              year = w.year,
              stop = new Set(cmd.type === 'advance-days' ? cmd.stop : []),
              seen = new Set(unreadAttention(w).map((item) => item.id)),
              known = new Set((w.inbox || []).map((item) => item.id));
            const limit = cmd.type === 'advance-days' ? cmd.days : 2 * seasonLength(w);
            for (let n = 0; n < limit; n++) {
              if (this.cancelled) break;
              const p = advanceDays(w, 1);
              if (p) playback = p;
              if (w.critical || (cmd.type === 'next-match' && w.ownMatches.length > matchCount))
                break;
              // Every step ends when the season closes. A multi-day step also ends on the day any
              // club news arrives or our match is played, so the date lands on that day; the
              // clock itself stops only for enabled kinds (WEB-18).
              if (
                w.year !== year ||
                unreadAttention(w).some((item) => stop.has(item.kind) && !seen.has(item.id)) ||
                (cmd.type === 'advance-days' &&
                  n < limit - 1 &&
                  (w.ownMatches.length > matchCount ||
                    (w.inbox || []).some((item) => !known.has(item.id))))
              )
                break;
              if (n % 14 === 0) {
                this.progress({ requestId: r.requestId, ok: true, progress: (n + 1) / limit });
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
          } else if (cmd.type === 'advance' || cmd.type === 'season') {
            const limit = cmd.type === 'season' ? 46 - w.round : cmd.rounds;
            if (cmd.type === 'season' && w.critical)
              throw new Error('중요한 알림을 확인한 후 계속하세요.');
            for (let n = 0; n < limit; n++) {
              if (this.cancelled) break;
              if (w.round >= 46) {
                closeSeason(w);
                w.revision++;
              }
              const p = advanceRound(w, undefined, cmd.type !== 'season');
              if (p?.frames.length) playback = p;
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
        upgraded: upgraded || undefined,
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
        errorCode: isSaveCompatibilityError(error) ? error.code : undefined,
        view: this.view(),
      };
    }
  }
}
