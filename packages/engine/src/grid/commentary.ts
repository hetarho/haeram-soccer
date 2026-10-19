/**
 * Korean live commentary for one trace entry (design §10.3, →MATCH-24): the cell names of MATCH-14 and
 * only the spatial terms docs/MATCH-BASELINES.md marks as verified in Korean football media.
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
const ga = (w: string) => `${w}${finalOf(w) ? '이' : '가'}`;
/** The object particle 을/를. */
const eul = (w: string) => `${w}${finalOf(w) ? '을' : '를'}`;

const WHISTLE = ['전반 종료', '후반 종료', '연장 전반 종료', '연장 후반 종료'] as const;
const RESTART: Record<string, string> = {
  kickoff: '킥오프',
  throwIn: '스로인',
  goalKick: '골킥',
  corner: '코너킥',
  freeKick: '프리킥',
  indirectFreeKick: '프리킥',
  penalty: '페널티킥',
};

/** The ball's touchline side, in the attack frame of `side`. */
function sideOf(side: 0 | 1, p: Point): 'left' | 'right' {
  return attackFrame(side, p)[1] < PITCH.width / 2 ? 'left' : 'right';
}

export function describe(entry: CommentaryEntry, ctx: CommentaryContext): string {
  const { side } = entry;
  const name = (sd: 0 | 1, idx: number | undefined) =>
    (idx === undefined ? undefined : ctx.names[sd]?.[idx]) ?? '선수';
  const a = name(side, entry.idx);
  const r = name(side, entry.receiver);
  const by = entry.by ? name(entry.by[0], entry.by[1]) : '상대';
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
      ? ' — 골!'
      : entry.result === 'save'
        ? ` — ${by} 선방`
        : entry.result === 'block'
          ? ` — ${ga(by)} 막아냄`
          : ' — 빗나감';
  const won = () => (entry.receiver !== undefined ? r : by);
  /** How a delivery into the box ended. */
  const delivery = () => {
    if (entry.result)
      return ` — ${ga(r)} ${shotPlace()}에서 ${entry.header ? '헤더' : '슛'}${result()}`;
    switch (entry.outcome) {
      case 'complete':
        return ` — ${ga(r)} 받음`;
      case 'held':
        return ` — ${ga(by)} 잡아냄`;
      case 'intercepted':
        return ` — ${ga(by)} 끊어냄`;
      case 'loose':
        return ` — 세컨드 볼은 ${won()}`;
      case 'out':
        return ' — 골라인 밖으로';
      default:
        return '';
    }
  };
  /** How a pass ended, after its passer is named. */
  const follow = () => {
    switch (entry.outcome) {
      case 'complete':
        return ` — ${r}에게`;
      case 'intercepted':
        return ` — ${ga(by)} 끊어냄`;
      case 'loose':
        return ` — 흘러나온 공은 ${won()}`;
      case 'out':
        return ' — 라인 밖으로';
      default:
        return '';
    }
  };

  if (entry.outcome === 'incident')
    switch (entry.action) {
      case 'yellow':
        return `${a} 경고`;
      case 'secondYellow':
        return `${a} 경고 누적 퇴장`;
      case 'red':
        return `${a} 퇴장`;
      case 'sub':
        return `${a} ↔ ${name(side, entry.other)} 교체`;
      case 'injury':
        return `${a} 부상`;
      default:
        return WHISTLE[entry.period - 1]!;
    }
  if (entry.outcome === 'foul') {
    const fouled = entry.on ? name(entry.on[0], entry.on[1]) : a;
    return `${by}의 파울 — ${fouled} 넘어짐`;
  }
  if (entry.outcome === 'offside') return `${entry.receiver === undefined ? a : r} 오프사이드`;

  if (entry.spot) {
    if (entry.action === 'dropBall') return `드롭볼 — ${a}${follow()}`;
    const head = `${a}의 ${RESTART[entry.action] ?? '프리킥'}`;
    if (entry.action === 'penalty') return `${head}${result()}`;
    if (entry.kind === 'shot') return `${head}, 직접 슈팅${result()}`;
    if (entry.kind === 'cross') return `${head}${delivery()}`;
    return `${head}${follow()}`;
  }

  // In play: the carrier's situation leads the line.
  const counter = tags?.phase === 'counter' ? '역습 — ' : '';
  const subject = tags?.betweenLines
    ? `라인 사이에서 받은 ${a}`
    : tags?.inBehind && (entry.action === 'shot' || entry.action === 'carry')
      ? `뒷공간으로 빠져나간 ${a}`
      : tags?.orientation === 'backToGoal' && entry.action === 'holdUp'
        ? `등지고 받은 ${a}`
        : a;
  const at = place ? `${place}에서 ` : '';
  switch (entry.action) {
    case 'pass': {
      if (entry.outcome === 'intercepted') return `${counter}${by}, ${a}의 패스를 인터셉트`;
      if (entry.outcome !== 'complete') return `${counter}${subject}의 패스${follow()}`;
      if (entry.kind === 'through') return `${counter}${subject}의 침투 패스 — ${ga(r)} 뒷공간으로`;
      if (entry.lineBreaking) return `${counter}${subject}의 라인 브레이킹 패스 — ${r}에게`;
      if (entry.kind === 'switch') return `${counter}${subject}의 측면 전환 — ${r}에게`;
      const pass = entry.kind === 'long' ? '롱패스' : '패스';
      return `${counter}${subject}, ${at}${r}에게 ${pass}`;
    }
    case 'cross':
      return `${counter}${subject}, ${at}크로스${delivery()}`;
    case 'cutBack':
      return `${counter}${at}${subject}의 컷백${delivery()}`;
    case 'shot':
      return `${counter}${subject}, ${shotPlace()}에서 ${entry.header ? '헤더' : '슛'}${result()}`;
    case 'carry':
    case 'takeOn': {
      const what = entry.action === 'carry' ? '운반' : '돌파';
      if (entry.outcome === 'complete') {
        const end = entry.to ? cellName(cellOf(attackFrame(side, entry.to))) : place;
        return entry.action === 'carry'
          ? `${counter}${subject}, ${end}까지 운반`
          : `${counter}${subject}, ${at}돌파 성공`;
      }
      if (entry.outcome === 'tackled') return `${by}의 태클 — ${a}의 ${eul(what)} 막아냄`;
      if (entry.outcome === 'loose') return `${a}의 ${what} 시도 — 흘러나온 공은 ${won()}`;
      return `${a}의 ${what}${follow()}`;
    }
    case 'holdUp':
      if (entry.outcome === 'tackled') return `${by}의 태클 — ${a}의 공을 빼앗음`;
      return `${subject}, 공을 지켜냄`;
    case 'clearance':
      if (entry.outcome === 'loose') return `${a}의 걷어내기 — 세컨드 볼은 ${won()}`;
      return `${a}의 걷어내기${follow()}`;
    default:
      return `${a}${follow()}`;
  }
}
