import { message as sourceMessage } from '../../../../../packages/contracts/src/messages';
import { BAND_KEYS, cellName, LANE_KEYS } from '../../../../../packages/engine/src/grid/pitch';
import type { GlossaryEntry } from './metricGlossary';

/** Column heads of the pitch-zones table: the five lanes, left to right in the attacking direction. */
const LANES = [
  sourceMessage('copy.glossaryEntries.7087773f6a'),
  sourceMessage('copy.glossaryEntries.e6042799eb'),
  sourceMessage('copy.glossaryEntries.25c630c275'),
  sourceMessage('copy.glossaryEntries.ab7d5aa356'),
  sourceMessage('copy.glossaryEntries.4646f1d7c9'),
] as const;

/**
 * The 40 named cells (→MATCH-14), the attacking end on top. A cell named "lane + band" shows only
 * its band under the lane's column; a cell with its own football name shows that name.
 */
function pitchZoneRows(): string[][] {
  return BAND_KEYS.map((_, i) => {
    const band = BAND_KEYS.length - 1 - i;
    return LANE_KEYS.map((_, lane) => {
      const cell = band * LANE_KEYS.length + lane;
      if (band === 7 && lane === 2) return `${cellName(cell, 'near')}·${cellName(cell, 'far')}`;
      const name = cellName(cell);
      const prefix = `${LANES[lane]} `;
      return name.startsWith(prefix) ? name.slice(prefix.length) : name;
    });
  });
}

/** Every glossary entry (→WEB-53); imported only by lazily loaded screens and the sheet. */
export const GLOSSARY: readonly GlossaryEntry[] = [
  {
    id: 'xg',
    term: sourceMessage('copy.glossaryEntries.a85504b010'),
    abbr: 'xG',
    standard: sourceMessage('copy.glossaryEntries.bca54c6924'),
    here: sourceMessage('copy.glossaryEntries.c234364be4'),
    read: sourceMessage('copy.glossaryEntries.4b787b850e'),
  },
  {
    id: 'xga',
    term: sourceMessage('copy.glossaryEntries.7879d08666'),
    abbr: 'xGA',
    standard: sourceMessage('copy.glossaryEntries.99cc0737fb'),
    here: sourceMessage('copy.glossaryEntries.84fa4ea8c2'),
    read: sourceMessage('copy.glossaryEntries.499b32038e'),
  },
  {
    id: 'xa',
    term: sourceMessage('copy.glossaryEntries.0a5fa10c98'),
    abbr: 'xA',
    standard: sourceMessage('copy.glossaryEntries.22664f2ec1'),
    here: sourceMessage('copy.glossaryEntries.21eb4f6d67'),
    read: sourceMessage('copy.glossaryEntries.4bbeb2c87f'),
  },
  {
    id: 'key-pass',
    term: sourceMessage('copy.MatchReport.532ac6f371'),
    abbr: 'KP',
    standard: sourceMessage('copy.glossaryEntries.844c46204e'),
    here: sourceMessage('copy.glossaryEntries.2b60bdad2c'),
    read: sourceMessage('copy.glossaryEntries.f2ffcc9e39'),
  },
  {
    id: 'big-chance',
    term: sourceMessage('copy.LeagueFullStats.233a5dfe38'),
    standard: sourceMessage('copy.glossaryEntries.1cfe6a0f0b'),
    here: sourceMessage('copy.glossaryEntries.dc3d80f3c4'),
    read: sourceMessage('copy.glossaryEntries.f1e699439c'),
  },
  {
    id: 'box-shot',
    term: sourceMessage('copy.advanced.6b88079ae9'),
    standard: sourceMessage('copy.glossaryEntries.59b33f4d97'),
    here: sourceMessage('copy.glossaryEntries.4d131d7375'),
    read: sourceMessage('copy.glossaryEntries.764571ddbe'),
  },
  {
    id: 'final-third',
    term: sourceMessage('copy.PlayerAdvancedStats.c4f75aa388'),
    standard: sourceMessage('copy.glossaryEntries.c21c73e282'),
    here: sourceMessage('copy.glossaryEntries.0cbeff878b'),
    read: sourceMessage('copy.glossaryEntries.f98ec91970'),
  },
  {
    id: 'progressive',
    term: sourceMessage('copy.PlayerAdvancedStats.af1b560101'),
    standard: sourceMessage('copy.glossaryEntries.84d1833abd'),
    here: sourceMessage('copy.glossaryEntries.9bc97a7789'),
    read: sourceMessage('copy.glossaryEntries.543ff198a7'),
  },
  {
    id: 'take-on',
    term: sourceMessage('copy.advanced.a85fbde940'),
    abbr: sourceMessage('copy.glossaryEntries.778bb9edef'),
    standard: sourceMessage('copy.glossaryEntries.5b5810fbc5'),
    here: sourceMessage('copy.glossaryEntries.a0c279d7ac'),
    read: sourceMessage('copy.glossaryEntries.83b18108df'),
  },
  {
    id: 'high-turnover',
    term: sourceMessage('copy.PlayerAdvancedStats.11212f27d2'),
    standard: sourceMessage('copy.glossaryEntries.7edea96502'),
    here: sourceMessage('copy.glossaryEntries.aa2a76ad39'),
    read: sourceMessage('copy.glossaryEntries.7864f17e70'),
  },
  {
    id: 'ppda',
    term: sourceMessage('copy.glossaryEntries.90469fea79'),
    abbr: 'PPDA',
    standard: sourceMessage('copy.glossaryEntries.ec13f806d9'),
    here: sourceMessage('copy.glossaryEntries.6428490703'),
    read: sourceMessage('copy.glossaryEntries.542bc128cd'),
  },
  {
    id: 'field-tilt',
    term: sourceMessage('copy.SeasonReview.c7c1a585f2'),
    standard: sourceMessage('copy.glossaryEntries.9e6cf6a4e1'),
    here: sourceMessage('copy.glossaryEntries.f4c3fb1c8f'),
    read: sourceMessage('copy.glossaryEntries.b52fabd05a'),
  },
  {
    id: 'possession',
    term: sourceMessage('copy.stories.6169842c01'),
    standard: sourceMessage('copy.glossaryEntries.07664f4d5b'),
    here: sourceMessage('copy.glossaryEntries.56ee1c6c0d'),
    read: sourceMessage('copy.glossaryEntries.8b2138b16a'),
  },
  {
    id: 'pass-accuracy',
    term: sourceMessage('copy.summary.5101559c4e'),
    standard: sourceMessage('copy.glossaryEntries.ac646d3de4'),
    here: sourceMessage('copy.glossaryEntries.e4e5e64303'),
    read: sourceMessage('copy.glossaryEntries.805362406c'),
  },
  {
    id: 'on-target',
    term: sourceMessage('copy.summary.2d9b22c49c'),
    standard: sourceMessage('copy.glossaryEntries.3b64f5b350'),
    here: sourceMessage('copy.glossaryEntries.a1a6e82e3f'),
    read: sourceMessage('copy.glossaryEntries.f34453f631'),
  },
  {
    id: 'finishing',
    term: sourceMessage('copy.glossaryEntries.e951b94f82'),
    abbr: sourceMessage('copy.SeasonReview.dc53b01006'),
    standard: sourceMessage('copy.glossaryEntries.683fd8ea29'),
    here: sourceMessage('copy.glossaryEntries.77cbc4dd4b'),
    read: sourceMessage('copy.glossaryEntries.5ea32b5e5d'),
  },
  {
    id: 'goals-prevented',
    term: sourceMessage('copy.glossaryEntries.3215dfb430'),
    abbr: sourceMessage('copy.SeasonReview.46c69aaf33'),
    standard: sourceMessage('copy.glossaryEntries.2e3d190cf6'),
    here: sourceMessage('copy.glossaryEntries.0603941db3'),
    read: sourceMessage('copy.glossaryEntries.f6b38c0884'),
  },
  {
    id: 'xpts',
    term: sourceMessage('copy.SeasonReview.32c15a3712'),
    abbr: 'xPts',
    standard: sourceMessage('copy.glossaryEntries.c58a54bd37'),
    here: sourceMessage('copy.glossaryEntries.25da5374d5'),
    read: sourceMessage('copy.glossaryEntries.4d8bee4fea'),
  },
  {
    id: 'tackles-interceptions',
    term: sourceMessage('copy.advanced.1a691bf32f'),
    abbr: 'Tkl+Int',
    standard: sourceMessage('copy.glossaryEntries.4c5d73caa3'),
    here: sourceMessage('copy.glossaryEntries.c8eeaa2cc5'),
    read: sourceMessage('copy.glossaryEntries.4739d11b16'),
  },
  {
    id: 'saves',
    term: sourceMessage('copy.RecordsRoom.2a022bd612'),
    standard: sourceMessage('copy.glossaryEntries.47f6e75657'),
    here: sourceMessage('copy.glossaryEntries.a9dba207f1'),
    read: sourceMessage('copy.glossaryEntries.4472fec7c6'),
  },
  {
    id: 'clean-sheet',
    term: sourceMessage('copy.SeasonReview.2d238e2626'),
    standard: sourceMessage('copy.glossaryEntries.f3b46bad12'),
    here: sourceMessage('copy.glossaryEntries.8f7eae4b13'),
    read: sourceMessage('copy.glossaryEntries.b4d7974db9'),
  },
  {
    id: 'box-entry',
    term: sourceMessage('copy.MatchReport.649752aebf'),
    standard: sourceMessage('copy.glossaryEntries.718736f387'),
    here: sourceMessage('copy.glossaryEntries.d5a1993012'),
    read: sourceMessage('copy.glossaryEntries.5af09c6109'),
  },
  {
    id: 'front-of-box-entry',
    term: sourceMessage('copy.advanced.d77d2a88ec'),
    standard: sourceMessage('copy.glossaryEntries.0d46a272ba'),
    here: sourceMessage('copy.glossaryEntries.5444d78f9b'),
    read: sourceMessage('copy.glossaryEntries.c5fb4c382c'),
  },
  {
    id: 'line-breaking',
    term: sourceMessage('copy.PlayerAdvancedStats.0ad2f4840a'),
    standard: sourceMessage('copy.glossaryEntries.e26afa5bd8'),
    here: sourceMessage('copy.glossaryEntries.e8cbdcf8f2'),
    read: sourceMessage('copy.glossaryEntries.f5cfc5c1f7'),
  },
  {
    id: 'xt',
    term: sourceMessage('copy.glossaryEntries.5d8b4221a2'),
    abbr: 'xT',
    standard: sourceMessage('copy.glossaryEntries.17cb3a77f5'),
    here: sourceMessage('copy.glossaryEntries.2d4b938ebd'),
    read: sourceMessage('copy.glossaryEntries.6ab6994e1b'),
  },
  {
    id: 'cross',
    term: sourceMessage('copy.summary.0796453f8e'),
    standard: sourceMessage('copy.glossaryEntries.5a13f33c49'),
    here: sourceMessage('copy.glossaryEntries.e29d71ce4c'),
    read: sourceMessage('copy.glossaryEntries.4db0023456'),
  },
  {
    id: 'cut-back',
    term: sourceMessage('copy.PlayerAdvancedStats.cf8188e2fc'),
    standard: sourceMessage('copy.glossaryEntries.312161e645'),
    here: sourceMessage('copy.glossaryEntries.8e3d4f05c8'),
    read: sourceMessage('copy.glossaryEntries.88671b7f6f'),
  },
  {
    id: 'through-ball',
    term: sourceMessage('copy.glossaryEntries.8db655587f'),
    abbr: sourceMessage('copy.glossaryEntries.ed8ce793ac'),
    standard: sourceMessage('copy.glossaryEntries.3a3886b0f1'),
    here: sourceMessage('copy.glossaryEntries.5f4169ad80'),
    read: sourceMessage('copy.glossaryEntries.f22f15a348'),
  },
  {
    id: 'progressive-carry',
    term: sourceMessage('copy.PlayerAdvancedStats.0801bcf3fb'),
    standard: sourceMessage('copy.glossaryEntries.83324aaf29'),
    here: sourceMessage('copy.glossaryEntries.61b7177e2d'),
    read: sourceMessage('copy.glossaryEntries.f1d978cf52'),
  },
  {
    id: 'fouls',
    term: sourceMessage('copy.summary.a9d93d66a9'),
    standard: sourceMessage('copy.glossaryEntries.90e2abecc2'),
    here: sourceMessage('copy.glossaryEntries.f72eb6f1a4'),
    read: sourceMessage('copy.glossaryEntries.01555e8c92'),
  },
  {
    id: 'cards',
    term: sourceMessage('copy.MatchReport.54c8d68f37'),
    standard: sourceMessage('copy.glossaryEntries.855a9a74e6'),
    here: sourceMessage('copy.glossaryEntries.a40f6f8b6f'),
    read: sourceMessage('copy.glossaryEntries.57838c3c1c'),
  },
  {
    id: 'offside',
    term: sourceMessage('copy.summary.7858515c16'),
    standard: sourceMessage('copy.glossaryEntries.bc5b4c58f9'),
    here: sourceMessage('copy.glossaryEntries.ba23659e74'),
    read: sourceMessage('copy.glossaryEntries.65b3e730ec'),
  },
  {
    id: 'set-piece',
    term: sourceMessage('copy.glossaryEntries.20ae1b09e5'),
    standard: sourceMessage('copy.glossaryEntries.06ec910710'),
    here: sourceMessage('copy.glossaryEntries.f2d46716db'),
    read: sourceMessage('copy.glossaryEntries.c9699457da'),
  },
  {
    id: 'pitch-zones',
    term: sourceMessage('copy.glossaryEntries.7c74b604b4'),
    standard: sourceMessage('copy.glossaryEntries.24c8b154de'),
    here: sourceMessage('copy.glossaryEntries.0f868c6267'),
    read: sourceMessage('copy.glossaryEntries.a21e31075d'),
    table: {
      caption: sourceMessage('copy.glossaryEntries.c93350ead2'),
      head: LANES,
      rows: pitchZoneRows(),
    },
  },
  {
    id: 'touch-tags',
    term: sourceMessage('copy.glossaryEntries.fa3a35e10f'),
    standard: sourceMessage('copy.glossaryEntries.a5e32a8767'),
    here: sourceMessage('copy.glossaryEntries.40a048d5c0'),
    read: sourceMessage('copy.glossaryEntries.daffa517b8'),
  },
];

export const glossaryEntry = (id: string) => GLOSSARY.find((entry) => entry.id === id);
