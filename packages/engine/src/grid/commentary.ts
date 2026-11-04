import { message as sourceMessage } from '../../../contracts/src/messages';
/**
 * Korean live commentary for one trace entry (→MATCH-24): the cell names of MATCH-14 and
 * only the spatial terms spec/ssot/MATCH.md marks as verified in Korean football media.
 */
import { attackFrame, cellBand, cellLane, cellName, cellOf, PITCH, type Point } from './pitch';
import type { TraceEntry } from './trace';

export interface CommentaryContext {
  /** Player names by side and roster index (the setup's rosters). */
  names: readonly [readonly string[], readonly string[]];
  /** The touchline the ball came from, in the shooting side's attack frame; decides near and far post. */
  ballSide?: 'left' | 'right';
}

export type CommentaryEntry = Pick<
  TraceEntry,
  | 'period'
  | 'side'
  | 'idx'
  | 'action'
  | 'outcome'
  | 'from'
  | 'to'
  | 'receiver'
  | 'by'
  | 'on'
  | 'kind'
  | 'lineBreaking'
  | 'spot'
  | 'shotAt'
  | 'result'
  | 'header'
  | 'other'
  | 'cell'
  | 'tags'
>;

/** 0 without a final consonant (or not Hangul), 8 for ㄹ, else another final. */
function finalOf(word: string): number {
  const c = word.charCodeAt(word.length - 1) - 0xac00;
  return c >= 0 && c <= 11171 ? c % 28 : 0;
}
/** The subject particle 이/가 after a name. */
const ga = (w: string) =>
  `${w}${finalOf(w) ? sourceMessage('copy.commentary.8bafb6b7d1') : sourceMessage('copy.commentary.64ee5293d3')}`;
/** The object particle 을/를. */
const eul = (w: string) =>
  `${w}${finalOf(w) ? sourceMessage('copy.commentary.3757457400') : sourceMessage('copy.commentary.20ffc2b0a0')}`;

const WHISTLE = [
  sourceMessage('copy.commentary.8c8464647e'),
  sourceMessage('copy.commentary.f450f1992b'),
  sourceMessage('copy.commentary.cfe310137e'),
  sourceMessage('copy.commentary.66a24b418b'),
] as const;
const RESTART: Record<string, string> = {
  kickoff: sourceMessage('copy.commentary.0904392d89'),
  throwIn: sourceMessage('copy.commentary.d03bda1489'),
  goalKick: sourceMessage('copy.commentary.4ed0f773e0'),
  corner: sourceMessage('copy.summary.64f1e3a4bc'),
  freeKick: sourceMessage('copy.commentary.ce1432907c'),
  indirectFreeKick: sourceMessage('copy.commentary.ce1432907c'),
  penalty: sourceMessage('copy.StrategyPanel.3d0a2ba63c'),
};

/** The ball's touchline side, in the attack frame of `side`. */
function sideOf(side: 0 | 1, p: Point): 'left' | 'right' {
  return attackFrame(side, p)[1] < PITCH.width / 2 ? 'left' : 'right';
}

export function describe(entry: CommentaryEntry, ctx: CommentaryContext): string {
  const { side } = entry;
  const name = (sd: 0 | 1, idx: number | undefined) =>
    (idx === undefined ? undefined : ctx.names[sd]?.[idx]) ?? sourceMessage('team.column.player');
  const a = name(side, entry.idx);
  const r = name(side, entry.receiver);
  const by = entry.by
    ? name(entry.by[0], entry.by[1])
    : sourceMessage('copy.MatchBriefing.6a3b6fa71b');
  const tags = entry.tags;
  const place = entry.cell === undefined ? undefined : cellName(entry.cell);
  const delivered = entry.from ?? entry.spot;
  const ballSide =
    ctx.ballSide ?? (entry.shotAt && delivered ? sideOf(side, delivered) : undefined);

  /** The shot's place; the goal-area centre splits into near and far post by the ball's side. */
  const shotPlace = () => {
    const at = entry.shotAt ?? entry.from ?? entry.spot;
    if (!at) return place ?? '';
    const p = attackFrame(side, at);
    const cell = cellOf(p);
    if (cellBand(cell) !== 7 || cellLane(cell) !== 2 || !ballSide) return cellName(cell);
    return cellName(cell, p[1] < PITCH.width / 2 === (ballSide === 'left') ? 'near' : 'far');
  };
  const result = () =>
    entry.result === 'goal'
      ? sourceMessage('copy.commentary.e92d90bf13')
      : entry.result === 'save'
        ? sourceMessage('copy.commentary.addf032dce', { p0: by })
        : entry.result === 'block'
          ? sourceMessage('copy.commentary.3d7694c309', { p0: ga(by) })
          : sourceMessage('copy.commentary.5339af6767');
  const won = () => (entry.receiver !== undefined ? r : by);
  /** How a delivery into the box ended. */
  const delivery = () => {
    if (entry.result)
      return sourceMessage('copy.commentary.50093cad06', {
        p0: ga(r),
        p1: shotPlace(),
        p2: entry.header
          ? sourceMessage('copy.commentary.999150ec9b')
          : sourceMessage('copy.commentary.2ec47beeb8'),
        p3: result(),
      });
    switch (entry.outcome) {
      case 'complete':
        return sourceMessage('copy.commentary.d3bdeb4059', { p0: ga(r) });
      case 'held':
        return sourceMessage('copy.commentary.8be94ea983', { p0: ga(by) });
      case 'intercepted':
        return sourceMessage('copy.commentary.6d964b706b', { p0: ga(by) });
      case 'loose':
        return sourceMessage('copy.commentary.635f67ba49', { p0: won() });
      case 'out':
        return sourceMessage('copy.commentary.e12301d91f');
      default:
        return '';
    }
  };
  /** How a pass ended, after its passer is named. */
  const follow = () => {
    switch (entry.outcome) {
      case 'complete':
        return sourceMessage('copy.commentary.99ea963957', { p0: r });
      case 'intercepted':
        return sourceMessage('copy.commentary.6d964b706b', { p0: ga(by) });
      case 'loose':
        return sourceMessage('copy.commentary.2ab731292c', { p0: won() });
      case 'out':
        return sourceMessage('copy.commentary.be42e9907d');
      default:
        return '';
    }
  };

  if (entry.outcome === 'incident')
    switch (entry.action) {
      case 'yellow':
        return sourceMessage('copy.commentary.ee459929a7', { p0: a });
      case 'secondYellow':
        return sourceMessage('copy.commentary.571188b0c8', { p0: a });
      case 'red':
        return sourceMessage('copy.commentary.fd4c3b72c6', { p0: a });
      case 'sub':
        return sourceMessage('copy.commentary.071263512d', { p0: a, p1: name(side, entry.other) });
      case 'injury':
        return sourceMessage('copy.commentary.ceb6981a7a', { p0: a });
      default:
        return WHISTLE[entry.period - 1]!;
    }
  if (entry.outcome === 'foul') {
    const fouled = entry.on ? name(entry.on[0], entry.on[1]) : a;
    return sourceMessage('copy.commentary.1fa4a32405', { p0: by, p1: fouled });
  }
  if (entry.outcome === 'offside')
    return sourceMessage('copy.commentary.ed147bf279', {
      p0: entry.receiver === undefined ? a : r,
    });

  if (entry.spot) {
    if (entry.action === 'dropBall')
      return sourceMessage('copy.commentary.f2fa6d3b0f', { p0: a, p1: follow() });
    const head = sourceMessage('copy.commentary.7927a12039', {
      p0: a,
      p1: RESTART[entry.action] ?? sourceMessage('copy.commentary.ce1432907c'),
    });
    if (entry.action === 'penalty') return `${head}${result()}`;
    if (entry.kind === 'shot')
      return sourceMessage('copy.commentary.178f1a2966', { p0: head, p1: result() });
    if (entry.kind === 'cross') return `${head}${delivery()}`;
    return `${head}${follow()}`;
  }

  // In play: the carrier's situation leads the line.
  const counter = tags?.phase === 'counter' ? sourceMessage('copy.commentary.3aec14091d') : '';
  const subject = tags?.betweenLines
    ? sourceMessage('copy.commentary.467e39fddc', { p0: a })
    : tags?.inBehind && (entry.action === 'shot' || entry.action === 'carry')
      ? sourceMessage('copy.commentary.ae52c3c521', { p0: a })
      : tags?.orientation === 'backToGoal' && entry.action === 'holdUp'
        ? sourceMessage('copy.commentary.1a8ff2b431', { p0: a })
        : a;
  const at = place ? sourceMessage('copy.commentary.2239dcd6c6', { p0: place }) : '';
  switch (entry.action) {
    case 'pass': {
      if (entry.outcome === 'intercepted')
        return sourceMessage('copy.commentary.53c1f8be8c', { p0: counter, p1: by, p2: a });
      if (entry.outcome !== 'complete')
        return sourceMessage('copy.commentary.c951d53b31', {
          p0: counter,
          p1: subject,
          p2: follow(),
        });
      if (entry.kind === 'through')
        return sourceMessage('copy.commentary.63faeee08e', { p0: counter, p1: subject, p2: ga(r) });
      if (entry.lineBreaking)
        return sourceMessage('copy.commentary.175ce3d3ba', { p0: counter, p1: subject, p2: r });
      if (entry.kind === 'switch')
        return sourceMessage('copy.commentary.59b6e21f1d', { p0: counter, p1: subject, p2: r });
      const pass =
        entry.kind === 'long'
          ? sourceMessage('copy.commentary.b5c46c4e9c')
          : sourceMessage('copy.summary.17242c9658');
      return sourceMessage('copy.commentary.2a6b43c66b', {
        p0: counter,
        p1: subject,
        p2: at,
        p3: r,
        p4: pass,
      });
    }
    case 'cross':
      return sourceMessage('copy.commentary.3525f6edd9', {
        p0: counter,
        p1: subject,
        p2: at,
        p3: delivery(),
      });
    case 'cutBack':
      return sourceMessage('copy.commentary.5f925e402d', {
        p0: counter,
        p1: at,
        p2: subject,
        p3: delivery(),
      });
    case 'shot':
      return sourceMessage('copy.commentary.b69d716e07', {
        p0: counter,
        p1: subject,
        p2: shotPlace(),
        p3: entry.header
          ? sourceMessage('copy.commentary.999150ec9b')
          : sourceMessage('copy.commentary.2ec47beeb8'),
        p4: result(),
      });
    case 'carry':
    case 'takeOn': {
      const what =
        entry.action === 'carry'
          ? sourceMessage('copy.commentary.8721afdd59')
          : sourceMessage('copy.OwnPlayerSheet.f16160e08a');
      if (entry.outcome === 'complete') {
        const end = entry.to ? cellName(cellOf(attackFrame(side, entry.to))) : place;
        return entry.action === 'carry'
          ? sourceMessage('copy.commentary.deea0e3f5c', { p0: counter, p1: subject, p2: end })
          : sourceMessage('copy.commentary.daf021a2ff', { p0: counter, p1: subject, p2: at });
      }
      if (entry.outcome === 'tackled')
        return sourceMessage('copy.commentary.89cbcf6104', { p0: by, p1: a, p2: eul(what) });
      if (entry.outcome === 'loose')
        return sourceMessage('copy.commentary.dba4a0ce4a', { p0: a, p1: what, p2: won() });
      return sourceMessage('copy.commentary.0c2e885810', { p0: a, p1: what, p2: follow() });
    }
    case 'holdUp':
      if (entry.outcome === 'tackled')
        return sourceMessage('copy.commentary.17ea83a488', { p0: by, p1: a });
      return sourceMessage('copy.commentary.b2361a5be3', { p0: subject });
    case 'clearance':
      if (entry.outcome === 'loose')
        return sourceMessage('copy.commentary.41697e768d', { p0: a, p1: won() });
      return sourceMessage('copy.commentary.a03079b231', { p0: a, p1: follow() });
    default:
      return `${a}${follow()}`;
  }
}
