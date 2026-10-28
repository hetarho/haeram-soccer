import type {
  ClubIdentity,
  GoalkeeperKit,
  KitRole,
  ShirtDesign,
  WornKeeper,
  WornKit,
} from '../../contracts/src/identity';
import { contrast } from './identity-legacy';

/**
 * KIT-3, KIT-8, KIT-12: what a figure wears — a kit's shirt with its shorts and socks, and the
 * goalkeeper's kit (spec/ssot/KIT.md). A read leaf for selection, appearance capture and the
 * painters alike: contracts and pure colour arithmetic only, no world, draw or orchestration.
 * Every result is a fresh object, so changing it never reaches a saved design.
 */

/** Ink that reads on `hex`: near-black on light colours, white on dark ones, by relative luminance. */
export function contrastInk(hex: string): '#ffffff' | '#111111' {
  return contrast(hex, '#111111') >= contrast(hex, '#ffffff') ? '#111111' : '#ffffff';
}

/**
 * KIT-3's starting shorts: the shirt's second colour. KIT-4 links that colour into patterned
 * shirts as `secondary` and into plain ones as `trim`; a shirt with neither takes contrasting ink.
 * KIT-12 derives a version-1 record's shorts the same way from its recorded shirt.
 */
export function startingShorts(shirt: ShirtDesign): string {
  return shirt.secondary ?? shirt.trim ?? contrastInk(shirt.primary);
}
/** KIT-3's starting socks: the shirt's base colour. */
export function startingSocks(shirt: ShirtDesign): string {
  return shirt.primary;
}

/** The kit of `role`: its shirt, with each part the owner set over the starting rule. */
export function wornKit(identity: ClubIdentity, role: KitRole): WornKit {
  const shirt = identity.kits[role],
    set = identity.parts?.[role];
  return {
    shirt: { ...shirt },
    shorts: set?.shorts ?? startingShorts(shirt),
    socks: set?.socks ?? startingSocks(shirt),
  };
}

/** KIT-8's automatic keeper: a plain shirt, shorts and socks in `colour`, with contrasting gloves. */
export function automaticKeeper(colour: string): WornKeeper {
  return {
    shirt: { pattern: 'plain', primary: colour },
    shorts: colour,
    socks: colour,
    gloves: contrastInk(colour),
  };
}

/** The club's designed goalkeeper kit (KIT-8), or undefined when it has none, as every opponent. */
export function designedKeeper(identity: ClubIdentity): GoalkeeperKit | undefined {
  const kit = identity.goalkeeper;
  return kit && { ...kit, shirt: { ...kit.shirt } };
}

/**
 * The goalkeeper kit a club wears where nothing displaces it: its designed kit, else the automatic
 * kit in `colour`. Whether a fixture displaces a designed kit is kit selection's call (KIT-8).
 */
export function wornKeeper(identity: ClubIdentity, colour: string): WornKeeper {
  return designedKeeper(identity) ?? automaticKeeper(colour);
}
