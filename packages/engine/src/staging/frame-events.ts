/** Translate only performed actions and incidents; commentary reads recorded qualifiers. */
import type { ScriptBeat } from '../../../contracts/src/match-script';
import { message as sourceMessage } from '../../../contracts/src/messages';
import type { MatchEvent } from '../../../contracts/src/types';
import { describe, type CommentaryEntry } from '../grid/commentary';
import { attackFrame, cellOf } from '../grid/pitch';
import { isPassLike, isRestartKind } from '../script/types';
import type { StageEvent, StagingId } from './staging';
import type { Vec } from './types';

export const units = (p: Vec): [number, number] => [(p[0] * 100) / 105, (p[1] * 100) / 68];
export interface FrameIdentity {
  ids: [string[], string[]];
  names: [string[], string[]];
}
export const playerId = (identity: FrameIdentity, p: StagingId | null | undefined): string =>
  p ? (identity.ids[p.side][p.line] ?? '') : '';
export const restartKind = (b: ScriptBeat): NonNullable<MatchEvent['restart']> | undefined =>
  b.kind === 'kickOff'
    ? 'kickoff'
    : b.kind === 'stoppage' || !isRestartKind(b.kind)
      ? undefined
      : (b.kind as NonNullable<MatchEvent['restart']>);

/** The actual resolution, preceding any later incident walks or a parry's retrieval. */
export function actionEnd(b: ScriptBeat, events: readonly StageEvent[]): StageEvent | undefined {
  const kinds: StageEvent['kind'][] =
    b.kind === 'shot' || b.kind === 'penalty' || b.shot !== undefined
      ? ['goal', 'save', 'block', 'wide']
      : b.outcome === 'complete' && isPassLike(b.kind)
        ? ['receive']
        : b.outcome === 'foul'
          ? ['foul']
          : b.outcome === 'tackled'
            ? ['tackle']
            : b.outcome === 'intercepted'
              ? ['intercept']
              : b.outcome === 'offside'
                ? ['offside']
                : b.outcome === 'out'
                  ? ['out']
                  : b.outcome === 'loose'
                    ? ['loose']
                    : ['performed'];
  return events.find((e) => kinds.includes(e.kind));
}

export interface StagedMatchEvent {
  at: number;
  period: 1 | 2 | 3 | 4;
  beat: number;
  value: Omit<MatchEvent, 't'>;
}

export function beatEvents(
  b: ScriptBeat,
  events: readonly StageEvent[],
  identity: FrameIdentity,
): StagedMatchEvent[] {
  if (b.period === 5) return [];
  const period = b.period;
  const id = (side: 0 | 1, line?: number) =>
    line === undefined ? '' : (identity.ids[side][line] ?? '');
  const other = (1 - b.side) as 0 | 1;
  const origin =
    events.find((e) => e.kind === 'kick' || e.kind === 'shot')?.at ??
    events.find((e) => e.kind === 'begin')?.at ??
    b.from;
  const result =
    b.outcome === 'saved'
      ? 'save'
      : b.outcome === 'blocked'
        ? 'block'
        : b.outcome === 'wide'
          ? 'miss'
          : b.outcome === 'goal'
            ? 'goal'
            : undefined;
  const restart = restartKind(b);
  const action =
    b.kind === 'kickOff'
      ? 'kickoff'
      : b.kind === 'stoppage'
        ? 'dropBall'
        : b.kind === 'pass' && (b.move === 'cross' || b.move === 'cutBack')
          ? b.move
          : b.kind;
  const entry: CommentaryEntry = {
    period,
    side: b.side,
    idx: b.actor,
    action,
    outcome: b.outcome,
    from: [...b.from],
    to: [...b.to],
    ...(b.receiver === undefined ? {} : { receiver: b.receiver }),
    ...(b.opponent === undefined ? {} : { by: [other, b.opponent] }),
    ...(b.outcome === 'foul' ? { on: [b.side, b.actor] } : {}),
    kind: result ? 'shot' : b.move,
    ...(restart ? { spot: [...b.from] } : {}),
    ...(result ? { result, shotAt: [...b.from], header: b.header } : {}),
    lineBreaking: b.lineBreaking,
    cell: cellOf(attackFrame(b.side, b.from)),
    tags: {
      phase: b.phase,
      orientation: 'facing',
      betweenLines: false,
      pocket: false,
      inBehind: false,
      channel: false,
      overload: 0,
    },
  };
  const out: StagedMatchEvent[] = [];
  const end = actionEnd(b, events);
  if (end && b.kind !== 'stoppage') {
    const kind: MatchEvent['kind'] =
      b.outcome === 'foul'
        ? 'foul'
        : b.outcome === 'offside'
          ? 'offside'
          : restart
            ? restart === 'kickoff'
              ? 'kickoff'
              : 'restart'
            : (action as MatchEvent['kind']);
    out.push({
      at: end.t,
      period,
      beat: b.index,
      value: {
        kind,
        side: kind === 'foul' ? other : b.side,
        actor:
          kind === 'foul'
            ? id(other, b.opponent)
            : kind === 'offside'
              ? id(b.side, b.receiver)
              : id(b.side, b.actor),
        ...(b.receiver === undefined || kind === 'offside'
          ? {}
          : { receiver: id(b.side, b.receiver) }),
        ...(kind === 'foul'
          ? { opponent: id(b.side, b.actor) }
          : end.other && end.other.side !== b.side
            ? { opponent: playerId(identity, end.other) }
            : {}),
        from: units(origin),
        to: units(end.at),
        ...(result ? {} : { ok: b.outcome === 'complete' }),
        lost:
          ['intercepted', 'tackled', 'offside', 'out', 'foul'].includes(b.outcome) ||
          (b.outcome === 'loose' && b.opponent !== undefined),
        ...(result ? { outcome: result } : {}),
        ...(b.xg === undefined ? {} : { xg: b.xg / 100 }),
        ...(b.header ? { header: true } : {}),
        ...(restart ? { restart } : {}),
        text: describe(entry, { names: identity.names }),
      },
    });
  }
  for (const e of events) {
    if (!['card', 'sub', 'injury', 'whistle'].includes(e.kind)) continue;
    const kind = e.kind as 'card' | 'sub' | 'injury' | 'whistle';
    const line: CommentaryEntry = {
      period,
      side: e.team,
      idx: e.actor?.line ?? -1,
      action: e.card ?? kind,
      outcome: 'incident',
      ...(e.other ? { other: e.other.line } : {}),
    };
    out.push({
      at: e.t,
      period,
      beat: b.index,
      value: {
        kind,
        side: e.team,
        actor: playerId(identity, e.actor),
        ...(kind === 'sub' && e.other ? { receiver: playerId(identity, e.other) } : {}),
        ...(kind === 'card'
          ? { card: e.card === 'yellow' ? ('yellow' as const) : ('red' as const) }
          : {}),
        from: units(e.at),
        to: units(e.at),
        text: describe(line, { names: identity.names }),
      },
    });
  }
  return out;
}

/** The same existing source labels and priority as the theatre's grid minute. */
export function leadingEvent(e: MatchEvent): { action: string; weight: number } {
  if (e.outcome === 'goal') return { action: sourceMessage('copy.summary.68a6cf8ed8'), weight: 3 };
  if (e.kind === 'card')
    return {
      action:
        e.card === 'red'
          ? sourceMessage('copy.LabPage.68e69c7b9c')
          : sourceMessage('copy.LabPage.6c0f751064'),
      weight: e.card === 'red' ? 2 : 1,
    };
  if (e.outcome === 'save')
    return { action: sourceMessage('copy.RecordsRoom.2a022bd612'), weight: 1 };
  if (e.outcome) return { action: sourceMessage('copy.commentary.2ec47beeb8'), weight: 1 };
  if (e.lost && e.opponent && e.kind !== 'foul')
    return {
      action:
        e.kind === 'carry' || e.kind === 'takeOn'
          ? sourceMessage('copy.Pitch.3f6ba38a9e')
          : sourceMessage('copy.Pitch.818d05f8ab'),
      weight: 0,
    };
  const labels: Partial<Record<MatchEvent['kind'], string>> = {
    sub: sourceMessage('copy.LabPage.084c5a6dd7'),
    injury: sourceMessage('copy.Pitch.0e9e3ce22b'),
    foul: sourceMessage('copy.summary.a9d93d66a9'),
    offside: sourceMessage('copy.summary.7858515c16'),
    cross: sourceMessage('copy.summary.0796453f8e'),
    cutBack: sourceMessage('copy.PlayerAdvancedStats.cf8188e2fc'),
    carry: sourceMessage('copy.commentary.8721afdd59'),
    takeOn: sourceMessage('copy.OwnPlayerSheet.f16160e08a'),
    clearance: sourceMessage('copy.playback.a41cff8ca1'),
  };
  const restarts: Partial<Record<NonNullable<MatchEvent['restart']>, string>> = {
    throwIn: sourceMessage('copy.commentary.d03bda1489'),
    goalKick: sourceMessage('copy.commentary.4ed0f773e0'),
    corner: sourceMessage('copy.summary.64f1e3a4bc'),
    freeKick: sourceMessage('copy.commentary.ce1432907c'),
    penalty: sourceMessage('copy.StrategyPanel.3d0a2ba63c'),
  };
  return {
    action:
      (e.restart && restarts[e.restart]) ||
      labels[e.kind] ||
      sourceMessage('copy.summary.17242c9658'),
    weight:
      ['sub', 'injury', 'foul', 'offside'].includes(e.kind) ||
      e.restart === 'corner' ||
      e.restart === 'penalty' ||
      e.restart === 'freeKick'
        ? 1
        : 0,
  };
}
