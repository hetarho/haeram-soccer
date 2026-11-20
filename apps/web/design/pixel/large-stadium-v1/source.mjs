/**
 * Integer-grid source for the two largest pixel facility steps (stadium and locker room,
 * stages 9 and 10) in each of the three eras. Every pixel is computed from its coordinates
 * and the palettes below, so the output is byte-stable on every platform and needs no browser.
 */

export const LARGE_STADIUM_FAMILY = 'large-stadium-v1';
export const SCENE_WIDTH = 240;
export const SCENE_HEIGHT = 80;
export const SCENE_ERAS = ['heritage', 'terraces', 'contemporary'];
export const SCENE_KINDS = ['stadium', 'locker'];
export const SCENE_STAGES = [9, 10];

const PITCH_TOP = 63;
const WALL_Y = 60;

const rgb = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];

const mix = (a, b, t) => a.map((value, index) => Math.round(value + (b[index] - value) * t));

/** Deterministic 0..1 hash of a grid cell; used for sparse lamps, stains and shirts. */
const noise = (x, y, seed) => {
  let h =
    Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(seed + 1, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const paletteOf = (values) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, rgb(value)]));

const STADIUM_PALETTES = {
  heritage: paletteOf({
    skyTop: '#0a1420',
    skyHorizon: '#2b4152',
    star: '#8c9c8c',
    mast: '#0c1518',
    lamp: '#f0d89a',
    lampHalo: '#7d6d4a',
    roofEdge: '#3d4142',
    roofSoffit: '#1b1f21',
    truss: '#121619',
    concreteA: '#7b786e',
    concreteB: '#68655d',
    walk: '#a29d8c',
    seatA: '#4a3d30',
    seatB: '#3b4a3d',
    seatShade: '#231c17',
    upperA: '#5d5a52',
    upperB: '#4d4b44',
    windowLamp: '#e6c77e',
    boardA: '#5a4636',
    boardB: '#7a6049',
    boardEdge: '#1d2a28',
    grassA: '#2e713d',
    grassB: '#3a8048',
    line: '#cfc8a8',
    goal: '#eeeadb',
    net: '#8fa39a',
  }),
  terraces: paletteOf({
    skyTop: '#081423',
    skyHorizon: '#24405a',
    star: '#9fb2c0',
    mast: '#0b1620',
    lamp: '#f2dfa6',
    lampHalo: '#6f7a58',
    roofEdge: '#3a4650',
    roofSoffit: '#182027',
    truss: '#10181e',
    concreteA: '#8a8a82',
    concreteB: '#73736b',
    walk: '#b1aea0',
    seatA: '#2c4b70',
    seatB: '#22395a',
    seatShade: '#131f2f',
    upperA: '#7b3a30',
    upperB: '#662f27',
    windowLamp: '#f2d584',
    boardA: '#1f4c38',
    boardB: '#2a5f47',
    boardEdge: '#15231d',
    grassA: '#2b6d39',
    grassB: '#378144',
    line: '#d6d2bb',
    goal: '#f4f2e6',
    net: '#9aaba3',
  }),
  contemporary: paletteOf({
    skyTop: '#060f1c',
    skyHorizon: '#1f3a52',
    star: '#c4d4e2',
    mast: '#0a1419',
    lamp: '#e6eef4',
    lampHalo: '#56707e',
    roofEdge: '#56646c',
    roofSoffit: '#222b31',
    truss: '#151c21',
    concreteA: '#7f8a90',
    concreteB: '#6c777d',
    walk: '#c2cad0',
    seatA: '#2f5a4e',
    seatB: '#284b41',
    seatShade: '#14221e',
    upperA: '#e0e5e8',
    upperB: '#c6ced3',
    windowLamp: '#f5f8f2',
    boardA: '#1d2d33',
    boardB: '#26393f',
    boardEdge: '#0f181c',
    grassA: '#2a7340',
    grassB: '#35884b',
    line: '#e1e4d6',
    goal: '#f8f9f4',
    net: '#b7c4bb',
  }),
};

const LOCKER_PALETTES = {
  heritage: paletteOf({
    ceiling: '#1f2324',
    ceilingLow: '#2b3031',
    lamp: '#f0d89a',
    lampHalo: '#8a7650',
    window: '#2f4f66',
    windowHi: '#5d7f92',
    wallTop: '#b8b19c',
    wallLow: '#9d9784',
    panel: '#5f4a38',
    panelHi: '#7a604a',
    tileA: '#6d6a62',
    tileB: '#625f58',
    shine: '#8e8a7d',
    wood: '#6b4a2e',
    woodDark: '#4a3120',
    woodLight: '#86603c',
    shirtA: '#24553b',
    shirtB: '#e6e2d4',
    shirtC: '#2d3f6e',
    rug: '#2e5e3e',
    rugEdge: '#1b3b28',
    table: '#5b3f28',
    ball: '#d9cfb4',
    door: '#1e4a3a',
    doorFrame: '#5a4a3a',
    brass: '#c6a24f',
    gold: '#d2b04c',
    glass: '#8fb0bd',
    towel: '#eeeee4',
    physio: '#2f5e72',
  }),
  terraces: paletteOf({
    ceiling: '#1b2326',
    ceilingLow: '#263035',
    lamp: '#f4e1a4',
    lampHalo: '#7f7a58',
    window: '#2c4d62',
    windowHi: '#5c8298',
    wallTop: '#2f6150',
    wallLow: '#244f41',
    panel: '#3b7561',
    panelHi: '#4a8a74',
    tileA: '#c9cbc4',
    tileB: '#b3b6ae',
    shine: '#e4e7df',
    wood: '#5f5a4f',
    woodDark: '#3e3b34',
    woodLight: '#7d776a',
    shirtA: '#1e4f9a',
    shirtB: '#f1f1ea',
    shirtC: '#a5322c',
    rug: '#245a3b',
    rugEdge: '#163424',
    table: '#4e4a42',
    ball: '#eeeeea',
    door: '#253b47',
    doorFrame: '#4c5862',
    brass: '#b89b52',
    gold: '#d8b54e',
    glass: '#9cbccb',
    towel: '#f4f4f0',
    physio: '#2d7b93',
  }),
  contemporary: paletteOf({
    ceiling: '#171d21',
    ceilingLow: '#20282d',
    lamp: '#eaf2f6',
    lampHalo: '#56707e',
    window: '#264a5c',
    windowHi: '#70a0b4',
    wallTop: '#48535a',
    wallLow: '#3a444a',
    panel: '#2a3339',
    panelHi: '#38444c',
    tileA: '#7c868c',
    tileB: '#6c767c',
    shine: '#b5c2c8',
    wood: '#55626a',
    woodDark: '#363f45',
    woodLight: '#7c8a92',
    shirtA: '#1f6a50',
    shirtB: '#f2f5f2',
    shirtC: '#2f3b72',
    rug: '#1f5a40',
    rugEdge: '#133a2a',
    table: '#3b454c',
    ball: '#f2f4ee',
    door: '#1e3a44',
    doorFrame: '#5b6870',
    brass: '#b2b8b4',
    gold: '#d8c15f',
    glass: '#a6c8d4',
    towel: '#f7f8f6',
    physio: '#2b8fa0',
  }),
};

/** Stadium bowl geometry: the stand roofline runs from the corners down to the centre. */
const STADIUM_GEOMETRY = {
  9: { corner: 5, centre: 24, tiers: 4, masts: [12, 52, 188, 228], upperTier: false },
  10: { corner: 1, centre: 20, tiers: 5, masts: [8, 44, 196, 232], upperTier: true },
};

const roofY = (x, geometry) => {
  const u = Math.abs((x - 120) / 120);
  return Math.round(geometry.corner + (geometry.centre - geometry.corner) * (1 - u ** 1.6));
};

function stadiumShade(era, stage) {
  const palette = STADIUM_PALETTES[era];
  const geometry = STADIUM_GEOMETRY[stage];
  return (x, y) => {
    const top = roofY(x, geometry);
    // Floodlight heads sit on masts above the roof; masts run down into the sky band.
    for (const mast of geometry.masts) {
      if (y <= 5 && x >= mast - 4 && x <= mast + 5) {
        const lamp = (x - (mast - 4)) % 3 !== 2 && y >= 1 && y <= 2;
        if (lamp) return palette.lamp;
        if (y === 0 || y === 3) return palette.lampHalo;
        if (y > 3 && (x === mast || x === mast + 1)) return palette.mast;
      }
      if (y > 5 && y < top && (x === mast || x === mast + 1)) return palette.mast;
    }
    // Night sky above the roofline, with a few fixed stars.
    if (y < top) {
      if (y === top - 1) return palette.roofEdge;
      if (noise(x, y, 7) > 0.994) return palette.star;
      return mix(palette.skyTop, palette.skyHorizon, y / 30);
    }
    if (y === top) return palette.roofEdge;
    if (y <= top + 2) {
      if (x % 9 === 0) return palette.truss;
      return palette.roofSoffit;
    }
    // Goal frame at the far touchline, drawn in front of the stand bands behind it.
    if (x >= 114 && x <= 126 && y >= 53 && y <= 60) {
      if (y === 53 || x === 114 || x === 126) return palette.goal;
      return palette.net;
    }
    // Stand bands follow the roofline and sit above the far wall.
    if (y < WALL_Y) {
      const depth = Math.max(1, WALL_Y - top);
      const fraction = (y - top) / depth;
      const tier = Math.min(geometry.tiers - 1, Math.floor(fraction * geometry.tiers));
      const edgeFraction = fraction * geometry.tiers - tier;
      if (edgeFraction > 0.84) {
        if (noise(x, y, 13) > 0.6) return palette.windowLamp;
        return palette.walk;
      }
      const upper = geometry.upperTier && tier === 0;
      if ((x + tier * 3) % 11 === 0) return palette.seatShade;
      if (upper) return (x + y) % 2 ? palette.upperA : palette.upperB;
      if (edgeFraction < 0.08) return palette.concreteA;
      return (y + x) % 2 ? palette.seatA : palette.seatB;
    }
    // Far boards, the dark edge and the pitch.
    if (y === WALL_Y || y === WALL_Y + 1) {
      return Math.floor((x + 3) / 6) % 2 ? palette.boardA : palette.boardB;
    }
    if (y === WALL_Y + 2) return palette.boardEdge;
    if (y >= PITCH_TOP) {
      const stripe = Math.floor((y - PITCH_TOP) / 3) % 2;
      const base = stripe ? palette.grassA : palette.grassB;
      if (x === 120 && y >= PITCH_TOP) return palette.line;
      const ellipse = ((x - 120) / 14) ** 2 + ((y - 72) / 4) ** 2;
      if (Math.abs(ellipse - 1) < 0.12) return palette.line;
      if (y === 66 && (x <= 30 || x >= 210)) return palette.line;
      if ((x === 30 || x === 209) && y >= 66) return palette.line;
      return base;
    }
    return palette.boardEdge;
  };
}

function lockerShade(era, stage) {
  const palette = LOCKER_PALETTES[era];
  const pendants = stage === 9 ? [30, 75, 120, 165, 210] : [20, 60, 100, 140, 180, 220];
  const cabinet = stage === 9 || stage === 10;
  return (x, y) => {
    // Ceiling with pendant lamps.
    if (y < 12) {
      for (const lamp of pendants) {
        if (y >= 5 && y <= 6 && x >= lamp - 3 && x <= lamp + 2) return palette.lamp;
        if (y === 7 && x >= lamp - 4 && x <= lamp + 3) return palette.lampHalo;
      }
      if (era === 'contemporary' && y === 10) return palette.lamp;
      return mix(palette.ceiling, palette.ceilingLow, y / 12);
    }
    // Window band with mullions.
    if (y >= 12 && y < 16 && x >= 18 && x <= 222) {
      if (x % 12 === 0) return palette.wallTop;
      return noise(x, y, 3) > 0.5 ? palette.windowHi : palette.window;
    }
    // Lower room: wall, floor and furniture.
    if (y < 58) {
      if (y >= 16 && y < 22 && stage === 10) {
        if (y === 16 || y === 21) return palette.woodDark;
        if (x % 12 === 0) return palette.woodDark;
        if (y === 19) return palette.woodLight;
        return palette.ceilingLow;
      }
      if (era === 'contemporary' && y === 23) return x % 6 === 0 ? palette.lamp : palette.panelHi;
      // Door to the tunnel.
      if (x >= 108 && x <= 131 && y >= 24 && y <= 50) {
        if (x === 108 || x === 131 || y === 24) return palette.doorFrame;
        if (x === 119 || x === 120) return palette.doorFrame;
        if (x === 116 && y === 39) return palette.brass;
        if (x === 124 && y === 39) return palette.brass;
        return palette.door;
      }
      // Wall surface by era.
      let wall;
      if (era === 'heritage') {
        wall =
          y >= 44
            ? Math.floor(x / 4) % 2
              ? palette.panel
              : palette.panelHi
            : mix(palette.wallTop, palette.wallLow, (y - 16) / 40);
      } else if (era === 'terraces') {
        const grout = x % 8 === 0 || y % 6 === 0;
        wall = grout ? palette.wallLow : mix(palette.wallTop, palette.wallLow, (y - 16) / 40);
      } else {
        wall = y >= 44 ? palette.panel : mix(palette.wallTop, palette.wallLow, (y - 16) / 40);
      }
      if (y >= 44 && y < 52 && era !== 'heritage')
        wall = Math.floor(x / 4) % 2 ? palette.panel : palette.panelHi;
      // Trophy cabinet with gold pieces on the left wall for the larger steps.
      if (cabinet && x >= 3 && x <= 17 && y >= 26 && y <= 48) {
        if (x === 3 || x === 17 || y === 26 || y === 48) return palette.woodDark;
        if (y === 34 || y === 41) return palette.woodLight;
        if ((y === 32 || y === 39) && (x === 7 || x === 12)) return palette.gold;
        return palette.glass;
      }
      // Lockers: two banks with a central gap for the table and door.
      const lockerBank = (x >= 22 && x <= 98) || (x >= 142 && x <= 218);
      const rows = [
        [24, 36],
        [39, 51],
      ];
      if (lockerBank) {
        for (const [top, bottom] of rows) {
          if (y >= top && y <= bottom) {
            const cell = Math.floor((x - 22) / 8) + (x >= 142 ? 16 : 0);
            const local = (x - 22) % 8;
            const cellX = x >= 142 ? (x - 142) % 8 : local;
            if (cellX === 0) return palette.woodDark;
            if (y === top) return palette.woodDark;
            if (y === top + 1 && cellX === 3) return palette.woodLight;
            if (y === top + 3 && cellX >= 3 && cellX <= 4) return palette.woodDark;
            if (y === top + 2 && cellX >= 1 && cellX <= 6 && cell % 3 === 0) return palette.gold;
            const hasShirt = noise(cell, top, 5) > 0.35;
            if (hasShirt && y >= top + 4 && y <= top + 7 && cellX >= 2 && cellX <= 5) {
              const pick = Math.floor(noise(cell, top, 9) * 3);
              return [palette.shirtA, palette.shirtB, palette.shirtC][pick];
            }
            return noise(x, y, 17) > 0.97 ? palette.woodDark : palette.wood;
          }
        }
        if (y >= 52 && y <= 53) return palette.woodLight;
        if (y >= 54 && y <= 57 && x % 7 === 0) return palette.woodDark;
      }
      // Right-hand physio table, towels on rails and shower glass for the larger rooms.
      if (x >= 224 && x <= 238 && y >= 46 && y <= 54) {
        if (y === 46 || y === 54) return palette.woodDark;
        return palette.physio;
      }
      if (stage === 10 && x >= 186 && x <= 214 && y >= 24 && y <= 40) {
        if (x === 186 || x === 214 || y === 24 || y === 40) return palette.woodDark;
        return palette.glass;
      }
      if (x >= 98 && x <= 142 && y >= 46 && y <= 57) {
        if (y === 46) return palette.woodLight;
        if (y === 48 && (x === 104 || x === 136)) return palette.towel;
        return palette.table;
      }
      if (x >= 224 && x <= 238 && y === 26) return palette.towel;
      return wall;
    }
    // Floor with shine from the lamps above.
    if (y >= 58) {
      const ellipse = ((x - 120) / 48) ** 2 + ((y - 70) / 8) ** 2;
      if (Math.abs(ellipse - 1) < 0.1) return palette.rugEdge;
      if (ellipse < 1) return palette.rug;
      if (x >= 118 && x <= 122 && y === 49) return palette.ball;
      const tile = (Math.floor(x / 10) + Math.floor((y - 58) / 4)) % 2;
      let floor = tile ? palette.tileA : palette.tileB;
      for (const lamp of pendants) {
        const reach = Math.abs(x - lamp);
        if (reach <= 6 && y >= 60 && y <= 72 && noise(x, y, 23) > 0.35)
          floor = mix(floor, palette.shine, 0.45 * (1 - reach / 7));
      }
      return floor;
    }
    return palette.wood;
  };
}

/** Plain row-major RGB bytes for one scene. */
export function renderScene(shade) {
  const data = new Uint8Array(SCENE_WIDTH * SCENE_HEIGHT * 3);
  for (let y = 0; y < SCENE_HEIGHT; y++) {
    for (let x = 0; x < SCENE_WIDTH; x++) {
      const [r, g, b] = shade(x, y);
      const index = (y * SCENE_WIDTH + x) * 3;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
    }
  }
  return data;
}

export function sceneShade(era, kind, stage) {
  if (!SCENE_ERAS.includes(era)) throw new Error(`Unknown era: ${era}`);
  if (!SCENE_KINDS.includes(kind)) throw new Error(`Unknown kind: ${kind}`);
  if (!SCENE_STAGES.includes(stage)) throw new Error(`Unknown stage: ${stage}`);
  return kind === 'stadium' ? stadiumShade(era, stage) : lockerShade(era, stage);
}

/** Every new scene in deterministic order: era, kind, stage. */
export function largeStadiumScenes() {
  const scenes = [];
  for (const era of SCENE_ERAS)
    for (const kind of SCENE_KINDS)
      for (const stage of SCENE_STAGES)
        scenes.push({
          era,
          kind,
          stage,
          name: `${era}-${kind}-${stage}`,
          rgb: renderScene(sceneShade(era, kind, stage)),
        });
  return scenes;
}
