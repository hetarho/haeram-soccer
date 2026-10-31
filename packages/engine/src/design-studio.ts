import {
  CREST_EMBLEMS,
  CREST_PATTERNS,
  CREST_SHAPES,
  DESIGN_STUDIOS,
  SHIRT_PATTERNS,
  type ClubIdentity,
  type DesignStudio,
  type IdentityColours,
  type ShirtDesign,
  type ShirtPattern,
} from '../../contracts/src/identity';
import { identityColoursSchema } from '../../contracts/src/identitySchema';
import type { World } from '../../contracts/src/types';
import { DESIGNERS, designFee, redrawFee } from './design-fees';
import { addEvent } from './events';
import { applyClubIdentity } from './identity-operations';
import { random } from './primitives';
import { debit } from './transactions';

export { DESIGNERS, designFee, redrawFee };

/**
 * The owner sets only the club's colours; a designer paid from operating funds draws the crest and
 * kits as a few drafts, and the owner adopts one. Draws are hash-seeded, never the sporting stream.
 */

const WHITE = '#ffffff';
const DARKS = ['#0b1f44', '#121212', '#455a64'];

/** Black or white, whichever reads on `hex`. */
function contrast(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b! > 150 ? '#121212' : WHITE;
}

function shirt(pattern: ShirtPattern, primary: string, secondary: string, trim?: string) {
  const design: ShirtDesign =
    pattern === 'plain' ? { pattern, primary } : { pattern, primary, secondary };
  if (trim && trim.toLowerCase() !== primary.toLowerCase()) design.trim = trim;
  return design;
}

/** `count` drafts in the owner's colours, each with its own home pattern. */
export function designDrafts(seed: string, colours: IdentityColours, count: number) {
  const r = random(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(r() * list.length)]!;
  const [main, sub = contrast(colours[0]), accent] = colours;
  // Fisher–Yates, so every engine shuffles alike.
  const homes: ShirtPattern[] = [...SHIRT_PATTERNS];
  for (let i = homes.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [homes[i], homes[j]] = [homes[j]!, homes[i]!];
  }
  const drafts: ClubIdentity[] = [];
  for (let i = 0; i < count; i++) {
    const trim = r() < 0.5 ? (accent ?? sub) : undefined;
    const aways = [WHITE, sub].filter((c) => c.toLowerCase() !== main.toLowerCase());
    const awayField = aways.length ? pick(aways) : DARKS[0]!;
    const thirdField = pick(accent ? [...DARKS, accent] : DARKS);
    drafts.push({
      version: 1,
      colours: [...colours] as IdentityColours,
      crest: {
        shape: pick(CREST_SHAPES),
        pattern: pick(CREST_PATTERNS),
        emblem: pick(CREST_EMBLEMS),
        primary: main,
        secondary: sub,
        ...(accent ? { accent } : {}),
      },
      kits: {
        home: shirt(homes[i % homes.length]!, main, sub, trim),
        away: shirt(pick(SHIRT_PATTERNS), awayField, main, pick([main, sub])),
        third: shirt(pick(SHIRT_PATTERNS), thirdField, sub, main),
      },
    });
  }
  return drafts;
}

/** Pays the designer and keeps the drafts it delivers, replacing any not yet adopted. */
export function commissionDesign(w: World, studio: DesignStudio, colours: IdentityColours) {
  if (!DESIGN_STUDIOS.includes(studio)) throw new Error('디자이너를 확인해 주세요.');
  if (!identityColoursSchema.safeParse(colours).success)
    throw new Error('구단 색상을 확인해 주세요.');
  const fee = designFee(w, studio);
  debit(w, fee);
  const { label, drafts } = DESIGNERS[studio];
  w.designCommission = {
    studio,
    colours: [...colours] as IdentityColours,
    drafts: designDrafts(`${w.seed}:design:${w.revision}:${studio}`, colours, drafts),
  };
  addEvent(w, 'design', '구단 디자인 의뢰', `${label} · 시안 ${drafts}개`, fee);
}

/** Pays half the fee for a fresh set of drafts from the same designer in the same colours. */
export function redrawDesigns(w: World) {
  const commission = w.designCommission;
  if (!commission) throw new Error('다시 그릴 시안이 없어요.');
  const { studio, colours } = commission;
  const fee = redrawFee(w, studio);
  debit(w, fee);
  const { label, drafts } = DESIGNERS[studio];
  w.designCommission = {
    studio,
    colours,
    drafts: designDrafts(`${w.seed}:design:${w.revision}:${studio}`, colours, drafts),
  };
  addEvent(w, 'design', '구단 디자인 재설정', `${label} · 시안 ${drafts}개 · 반값`, fee);
}

/** Applies one delivered draft as the club's design; the commission ends with it. */
export function adoptDesign(w: World, draft: number) {
  const chosen = w.designCommission?.drafts[draft];
  if (!chosen) throw new Error('시안이 없어요. 디자이너에게 다시 의뢰해 주세요.');
  applyClubIdentity(w, chosen);
  delete w.designCommission;
}

/** Throws the delivered drafts away unused; the fee stays spent. */
export function discardDesigns(w: World) {
  if (!w.designCommission) throw new Error('버릴 시안이 없어요.');
  delete w.designCommission;
}
