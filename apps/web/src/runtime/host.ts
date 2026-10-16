import { mediationPreview } from '../../../../packages/engine/src/mediation';
import { personCareer } from './personCareer';
import { STAFF_ROLES, staffCandidates } from '../../../../packages/engine/src/staff';
import { careerAssessment } from '../../../../packages/engine/src/career-assessment';
import { nextEventDays } from '../../../../packages/engine/src/next-event';
import { pendingDecisions, stoppingReasons } from '../../../../packages/engine/src/stopping';
import {
  createWorld,
  advanceRound,
  advanceDays,
  seasonLength,
  groupKey,
  closeSeason,
  operate,
  managerCandidates,
  transferOffers,
  sponsorSlots,
  operatingCost,
  europeanCoefficient,
  clubNews,
  BANKRUPT_MESSAGE,
} from '../../../../packages/engine/src/index';
import type { World, MatchPlayback } from '../../../../packages/contracts/src/types';
import {
  isSaveCompatibilityError,
  upgradeWorldRules,
} from '../../../../packages/contracts/src/versions';
import { CURRENT_CATALOG } from '../../../../packages/catalogs/src/index';
import { decode, encode } from '../adapters/persistence';
import { clubMilestones } from '../../../../packages/engine/src/goals';
import { financialBreakdown } from '../../../../packages/engine/src/finance';
import { requestSchema, type CodecJob, type Request, type Reply, type View } from './protocol';
import { clubRecords } from './clubRecords';
import { headToHead } from './headToHead';
const failure = (input: unknown, request: Request | undefined, error: unknown) => ({
  requestId: request?.requestId ?? ((input as { requestId?: string })?.requestId || 'invalid'),
  ok: false,
  error: String(error).slice(0, 1600),
});
export class Host {
  world?: World;
  private session?: string;
  private acknowledgments = new Map<string, Reply>();
  private queue = Promise.resolve();
  // One immutable, fully validated inspection, consumed on activation. Match the complete raw
  // string; never reuse a live world or trust header/checksum identity alone.
  private inspected?: { raw: string; result: Awaited<ReturnType<typeof decode>> };
  private newsCache?: { key: string; news: View['news'] };
  cancelled = false;
  /** The port to the client's codec worker, which builds every checkpoint (→ARCH-13). */
  codec?: { postMessage(job: CodecJob): void };
  constructor(private progress: (reply: Reply) => void = () => {}) {}
  handle(input: unknown): Promise<Reply> {
    // A read is answered at once, between a command's simulation steps: queued behind a long
    // command, its watchdog would run out while only the command reports progress.
    const type = (input as { body?: { type?: unknown } } | null)?.body?.type;
    if (
      type === 'head-to-head' ||
      type === 'person-career' ||
      type === 'recruitment-history' ||
      type === 'mediation-preview' ||
      type === 'league-fixtures' ||
      type === 'club-records' ||
      type === 'archive'
    )
      return Promise.resolve(this.read(input));
    const task = this.queue.then(() => this.execute(input));
    this.queue = task.then(
      () => {},
      () => {},
    );
    return task;
  }
  /**
   * News reads the whole career (records, debuts, event order), so it is derived here rather than
   * from the projected world, whose recent windows would shift IDs and replay celebrations.
   */
  private news(w: World): View['news'] {
    const key = [
      w.id,
      w.year,
      w.round,
      w.ownMatches.length,
      w.events.length,
      w.rankHistory?.length,
      w.history.length,
    ].join(':');
    if (this.newsCache?.key !== key) this.newsCache = { key, news: clubNews(w) };
    return this.newsCache.news;
  }
  private view(w = this.world): View | undefined {
    if (!w) return;
    const own = w.clubs.find((c) => c.id === w.playerClub)!;
    const ownGroup = groupKey(own);
    const { people: _people, ...projected } = w;
    void _people;
    return {
      coaches: Object.fromEntries(STAFF_ROLES.map((role) => [role, staffCandidates(w, role)])),
      careers: Object.fromEntries(
        [...w.players.filter((p) => p.status === 'active'), ...(w.academy?.players ?? [])].map(
          (p) => [p.id, careerAssessment(w, p, true)],
        ),
      ),
      world: {
        ...projected,
        mediations: [
          ...(w.mediations ?? []).filter((m) => m.status === 'pending'),
          ...(w.mediations ?? []).filter((m) => m.status !== 'pending').slice(-20),
        ],
        promises: [
          ...(w.promises ?? []).filter((p) => p.status === 'pending'),
          ...(w.promises ?? []).filter((p) => p.status !== 'pending').slice(-20),
        ],
        ownMatches: w.ownMatches.slice(-30),
        fixtures: w.fixtures.filter(
          (f) =>
            f.home === w.playerClub ||
            f.away === w.playerClub ||
            (w.lower ? f.kind === 'lower' : f.groupKey === ownGroup),
        ),
        // Brackets and scorer tables come with the archive request; the small rank series and Elo
        // spread stay for the records charts.
        history: w.history.map((h) => {
          const season = {
            ...h,
            standings: [],
            europe: h.europe.map((e) => ({ ...e, standings: [], secondStandings: undefined })),
          };
          delete season.brackets;
          delete season.scorers;
          return season;
        }),
        events: w.events.slice(-150),
        // Only the own country's cup is shown in full; the others report their winners.
        ...(w.cups
          ? {
              cups: w.cups.map((cup) =>
                cup.country === own.country ? cup : { ...cup, clubs: [], rounds: [], fixtures: [] },
              ),
            }
          : {}),
      },
      totalMatches: w.ownMatches.length,
      supportUsed: w.events.filter((event) => event.year === w.year && event.kind === 'support')
        .length,
      milestones: clubMilestones(w),
      managers: managerCandidates(w),
      transfers: transferOffers(w),
      sponsors: sponsorSlots(w),
      annualCost: operatingCost(w),
      coefficient: europeanCoefficient(w),
      finance: financialBreakdown(w),
      news: this.news(w),
    };
  }
  /**
   * Read-only requests, validated like commands but answered from the live world without a
   * revision check, a receipt or a view: they change nothing and publish nothing.
   */
  private read(input: unknown): Reply {
    let request: Request | undefined;
    try {
      request = requestSchema.parse(input);
      const body = request.body,
        w = this.world;
      if (this.session && this.session !== request.session)
        throw new Error('이전 세션의 요청입니다.');
      if (!w) throw new Error('먼저 클럽을 창단하세요.');
      if (body.type === 'recruitment-history')
        return {
          requestId: request.requestId,
          ok: true,
          recruitmentHistory: structuredClone({
            mediations: w.mediations ?? [],
            promises: w.promises ?? [],
          }),
        };
      if (body.type === 'mediation-preview')
        return {
          requestId: request.requestId,
          ok: true,
          mediationPreview: mediationPreview(w, body.id, body.support),
        };
      if (body.type === 'person-career') {
        const detail = personCareer(w, body.person);
        if (!detail) throw new Error('기록된 인물 경력이 없습니다.');
        return { requestId: request.requestId, ok: true, personCareer: detail };
      }
      if (body.type === 'archive')
        return {
          requestId: request.requestId,
          ok: true,
          archive: {
            season: w.history.find((h) => h.year === body.year),
            matches: w.ownMatches.filter((m) => m.year === body.year),
            events: w.events.filter((e) => e.year === body.year),
            managers: w.events.filter((e) => e.kind.startsWith('manager-')),
          },
        };
      if (body.type === 'league-fixtures') {
        const key = `${body.country}:${body.tier}:${body.group}`;
        return {
          requestId: request.requestId,
          ok: true,
          leagueFixtures: w.fixtures.filter(
            (f) => f.year === w.year && f.kind === 'league' && f.groupKey === key,
          ),
        };
      }
      if (body.type === 'club-records')
        return {
          requestId: request.requestId,
          ok: true,
          clubRecords: clubRecords(w.ownMatches, w.playerClub),
        };
      if (body.type !== 'head-to-head') throw new Error('읽기 요청이 아닙니다.');
      if (body.club === w.playerClub || !w.clubs.some((club) => club.id === body.club))
        throw new Error('맞대결 상대를 찾을 수 없습니다.');
      return {
        requestId: request.requestId,
        ok: true,
        headToHead: headToHead(w.ownMatches, w.playerClub, body.club),
      };
    } catch (error) {
      return failure(input, request, error);
    }
  }
  /**
   * Posts the world as it stands after every earlier command to the codec worker, whatever revision
   * the client last saw; posting copies it, so the next command never waits for the checkpoint.
   */
  private save(r: Request): Reply {
    const w = this.world;
    if (!w) throw new Error('먼저 클럽을 창단하세요.');
    if (!this.codec) throw new Error('저장 Worker가 연결되지 않았습니다.');
    this.codec.postMessage({
      id: r.requestId,
      world: w,
      generation: r.generation,
      parentGeneration: r.parentGeneration,
    });
    return { requestId: r.requestId, ok: true, saving: { worldId: w.id, revision: w.revision } };
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
      if (r.body.type === 'save') return this.save(r);
      if (r.body.type !== 'inspect' && r.expectedRevision !== (this.world?.revision ?? -1))
        throw new Error('세계가 변경되었습니다. 오래된 요청은 적용하지 않습니다.');
      if (this.world?.receiptIds.includes(r.requestId)) throw new Error('이미 처리된 요청입니다.');
      let playback: MatchPlayback | undefined,
        raw: string | undefined,
        envelope: Reply['envelope'],
        candidate: World | undefined,
        worldMetadata: Reply['worldMetadata'],
        upgraded = false;
      let changed = false;
      this.cancelled = false;
      if (r.body.type === 'inspect') {
        if (r.body.upgrade && !r.body.activate)
          throw new Error('규칙 업그레이드는 활성화할 때만 가능합니다.');
        const result =
          this.inspected?.raw === r.body.raw ? this.inspected.result : await decode(r.body.raw);
        this.inspected = r.body.activate ? undefined : { raw: r.body.raw, result };
        const activated = r.body.upgrade
          ? upgradeWorldRules(result.world, CURRENT_CATALOG)
          : result.world;
        upgraded = activated !== result.world;
        if (r.body.metadataOnly) worldMetadata = { id: activated.id, revision: activated.revision };
        else if (!r.body.activate) candidate = structuredClone(activated);
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
          if (w.bankrupt && cmd.type !== 'read-inbox') throw new Error(BANKRUPT_MESSAGE);
          if (cmd.type === 'next-event') {
            let days = 0;
            for (const day of nextEventDays(w)) {
              void day;
              // No intermediate view/progress publication or public cancel journey.
              if (++days % 14 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
            }
          } else if (cmd.type === 'advance-days' || cmd.type === 'next-match') {
            if (w.critical) throw new Error('중요한 알림을 확인한 후 계속하세요.');
            if (pendingDecisions(w).length) throw new Error('먼저 대기 중인 결정을 처리하세요.');
            const matchCount = w.ownMatches.length,
              year = w.year,
              stop = new Set(cmd.type === 'advance-days' ? cmd.stop : []),
              known = new Set((w.inbox || []).map((item) => item.id));
            const limit = cmd.type === 'advance-days' ? cmd.days : 2 * seasonLength(w);
            // Only a watched match needs its movement frames; a day step plays our match through
            // as a result, with the same duel chain and facts, nine times faster.
            const watched = cmd.type === 'next-match';
            for (let n = 0; n < limit; n++) {
              if (this.cancelled) break;
              const p = advanceDays(w, 1, undefined, watched);
              if (p?.frames.length) playback = p;
              if (
                w.critical ||
                w.bankrupt ||
                (cmd.type === 'next-match' && w.ownMatches.length > matchCount)
              )
                break;
              // Every step ends when the season closes. A multi-day step also ends on the day any
              // club news arrives or our match is played, so the date lands on that day; the
              // clock itself stops only for enabled kinds (WEB-18).
              if (
                w.year !== year ||
                pendingDecisions(w).length > 0 ||
                (cmd.type === 'advance-days' &&
                  stoppingReasons(w).some((item) => stop.has(item.kind))) ||
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
              if (w.bankrupt) break;
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
            if (cmd.type === 'season' && w.round === 46 && !w.bankrupt) {
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
      }
      if (changed && this.world)
        this.world.receiptIds = [...this.world.receiptIds.slice(-199), r.requestId];
      const reply: Reply = {
        requestId: r.requestId,
        ok: true,
        view: this.view(),
        playback,
        raw,
        envelope,
        candidate,
        worldMetadata,
        cancelled: this.cancelled,
        upgraded: upgraded || undefined,
      };
      this.acknowledgments.set(r.requestId, reply);
      if (this.acknowledgments.size > 32)
        this.acknowledgments.delete(this.acknowledgments.keys().next().value!);
      return reply;
    } catch (error) {
      return {
        ...failure(input, request, error),
        errorCode: isSaveCompatibilityError(error) ? error.code : undefined,
        view: this.view(),
      };
    }
  }
}
