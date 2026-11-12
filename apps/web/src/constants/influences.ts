import { message as sourceMessage } from '../../../../packages/contracts/src/messages';
/** Reviewed causal relationships; this data imports no game execution code. */
import type {
  Consequence,
  Control,
  Decision,
  Factor,
  InfluenceGroup,
  Outcome,
  PlayerAction,
  SourceRef,
} from './catalog.ts';
const f = (
  name: string,
  effect: string,
  children: Factor[] = [],
  control: Control = sourceMessage('copy.influences.1419e09797'),
): Factor => ({
  name,
  effect,
  ...(children.length ? { children } : {}),
  ...(control ? { control } : {}),
});
const direct = (name: string, effect: string, children: Factor[] = []) =>
  f(name, effect, children, sourceMessage('copy.influences.636b022e8b'));
const src = (file: string, ...symbols: string[]): SourceRef[] =>
  symbols.map((symbol) => ({ file: `packages/engine/src/${file}.ts`, symbol }));
const link = (outcome: string, effect: string): Consequence => ({ outcome, effect });
const o = (
  id: string,
  title: string,
  decision: Decision,
  summary: string,
  factors: Factor[],
  sources: SourceRef[],
  consequences: Consequence[] = [],
  absent: string[] = [],
): Outcome => ({ id, title, decision, summary, factors, sources, consequences, absent });

export const INFLUENCE_GROUPS: InfluenceGroup[] = [
  {
    id: 'contracts',
    title: sourceMessage('copy.influences.31b976b577'),
    description: sourceMessage('copy.influences.f3485e4cef'),
    outcomes: [
      o(
        'renewal-acceptance',
        sourceMessage('copy.influences.27ee29052c'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.6673d85f1d'),
        [
          direct(
            sourceMessage('copy.influences.dfc8397da5'),
            sourceMessage('copy.influences.ed0a78f335'),
          ),
          f(
            sourceMessage('copy.influences.1651867839'),
            sourceMessage('copy.influences.acf56e4057'),
            [
              f(
                sourceMessage('copy.influences.c02780226a'),
                sourceMessage('copy.influences.90fea834cb'),
              ),
              f(
                sourceMessage('copy.influences.b3e6749e9b'),
                sourceMessage('copy.influences.7ce83cab10'),
              ),
              f(
                sourceMessage('copy.influences.7cf7e44c5b'),
                sourceMessage('copy.influences.4d27e5ca04'),
              ),
              direct(
                sourceMessage('copy.influences.e481a36981'),
                sourceMessage('copy.influences.7bb76311ee'),
              ),
            ],
          ),
          direct(
            sourceMessage('copy.influences.8581fca550'),
            sourceMessage('copy.influences.0863adfa9c'),
          ),
          f(
            sourceMessage('copy.influences.c738d39ee8'),
            sourceMessage('copy.influences.203bb1dbaf'),
          ),
        ],
        [
          ...src('contracts', 'offerContract', 'talkTerms', 'talkFor', 'openTalk'),
          ...src('market-prices', 'marketWageUnits'),
        ],
        [
          link('operating-cost', sourceMessage('copy.influences.2ce4f697f6')),
          link('unhappy', sourceMessage('copy.influences.1db3bb5135')),
        ],
        [
          sourceMessage('copy.influences.4815157f05'),
          sourceMessage('copy.influences.e860cd3be7'),
          sourceMessage('copy.influences.563ee5e074'),
        ],
      ),
      o(
        'wage-demand',
        sourceMessage('copy.influences.bb873b45a7'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.e0ce083938'),
        [
          f(
            sourceMessage('copy.influences.0c34d4ca75'),
            sourceMessage('copy.influences.f426744387'),
          ),
          f(
            sourceMessage('copy.influences.7e0f4ff31e'),
            sourceMessage('copy.influences.82c41810b3'),
          ),
          f(
            sourceMessage('copy.influences.3951838bf4'),
            sourceMessage('copy.influences.0ec2750251'),
          ),
          f(
            sourceMessage('copy.influences.59c3b0bdf1'),
            sourceMessage('copy.influences.240640c48a'),
          ),
          f(
            sourceMessage('influences.starPaySpread.name'),
            sourceMessage('influences.starPaySpread.effect'),
          ),
          f(
            sourceMessage('copy.influences.9d51a1abbe'),
            sourceMessage('copy.influences.805720fa68'),
          ),
        ],
        [
          ...src(
            'market-prices',
            'marketPoints',
            'marketWageUnits',
            'starWagePremium',
            'starPaySpread',
          ),
          ...src('contracts', 'playerWorth', 'talkGoodwill', 'talkTerms'),
        ],
        [
          link('renewal-acceptance', sourceMessage('copy.influences.6a2ca85bd9')),
          link('auto-renewal', sourceMessage('copy.influences.db7b60b6dd')),
        ],
      ),
      o(
        'contract-opening',
        sourceMessage('copy.influences.547f9130b8'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.c233998b3d'),
        [
          f(
            sourceMessage('copy.influences.9b822ca5b5'),
            sourceMessage('copy.influences.4dea12775b'),
          ),
          f(
            sourceMessage('copy.influences.1bb55c26dc'),
            sourceMessage('copy.influences.a8b0d1e7eb'),
          ),
          f(
            sourceMessage('copy.influences.9a88a5f798'),
            sourceMessage('copy.influences.54a83b1807'),
          ),
          f(
            sourceMessage('copy.influences.395a144de7'),
            sourceMessage('copy.influences.6fd86ac50d'),
          ),
        ],
        src('contracts', 'underpaid', 'contractTalks'),
        [link('renewal-acceptance', sourceMessage('copy.influences.4434867017'))],
      ),
      o(
        'auto-renewal',
        sourceMessage('copy.influences.9a23a64d98'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.87ae3f2b58'),
        [
          direct(
            sourceMessage('copy.influences.c2ad8b97c3'),
            sourceMessage('copy.influences.5ecef69aa8'),
          ),
          direct(
            sourceMessage('copy.influences.ab3ba3b4eb'),
            sourceMessage('copy.influences.8a9b9e3c7b'),
          ),
          direct(
            sourceMessage('copy.influences.b5e655298f'),
            sourceMessage('copy.influences.ffe8b73e06'),
          ),
          f(
            sourceMessage('copy.influences.c72e9a1a58'),
            sourceMessage('copy.influences.f7a64d7cd7'),
          ),
          f(
            sourceMessage('copy.influences.7bed6e4a39'),
            sourceMessage('copy.influences.6a8b94e53b'),
          ),
        ],
        src('contracts', 'staffTalkVerdict', 'staffTerm'),
        [link('unhappy', sourceMessage('copy.influences.0e3d79953a'))],
      ),
      o(
        'persuasion',
        sourceMessage('copy.influences.47632ba255'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('copy.influences.b22b690b22'),
        [
          f(
            sourceMessage('copy.influences.18c3bf60ff'),
            sourceMessage('copy.influences.48e98c2dd6'),
          ),
          f(
            sourceMessage('copy.influences.f38379e6ab'),
            sourceMessage('copy.influences.2eb5362c44'),
          ),
          f(
            sourceMessage('copy.influences.42cb5c77b7'),
            sourceMessage('copy.influences.b8dd1cb415'),
          ),
        ],
        src('contracts', 'talkRoundChance', 'talksRound'),
        [link('unhappy', sourceMessage('copy.influences.1e5100d167'))],
      ),
      o(
        'unhappy',
        sourceMessage('copy.influences.6802ead58b'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.35e01cc959'),
        [
          direct(
            sourceMessage('copy.influences.f9f8cf110a'),
            sourceMessage('copy.influences.4521157863'),
          ),
          direct(
            sourceMessage('copy.influences.5e3ce3c5db'),
            sourceMessage('copy.influences.ab0703dd1a'),
          ),
          f(
            sourceMessage('copy.influences.69decc2ea6'),
            sourceMessage('copy.influences.b945bb3843'),
          ),
          direct(
            sourceMessage('copy.influences.36a9ed06a5'),
            sourceMessage('copy.influences.c581750999'),
          ),
        ],
        src('contracts', 'declineTalk', 'ambitionAfterDecline', 'endAmbition', 'transferRequests'),
        [
          link('effective-ovr', sourceMessage('copy.influences.37bfc664cc')),
          link('squad-morale', sourceMessage('copy.influences.a2e0fe2b99')),
          link('incoming-bids', sourceMessage('copy.influences.fafe6660c6')),
        ],
      ),
      o(
        'contract-clauses',
        sourceMessage('copy.influences.abf2b170a8'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.2f1ca57dfc'),
        [
          f(
            sourceMessage('copy.influences.522954cac2'),
            sourceMessage('copy.influences.4aea6c85cb'),
          ),
          f(
            sourceMessage('copy.influences.48b6e7f8e8'),
            sourceMessage('copy.influences.c7759fa4cb'),
          ),
          f(
            sourceMessage('copy.influences.6a059ddb65'),
            sourceMessage('copy.influences.f3d9fe61e5'),
          ),
        ],
        [
          ...src('contracts', 'settleClauses', 'applyClauses'),
          ...src('ballon-dor-award', 'payBallonDorBonus'),
        ],
        [link('operating-cost', sourceMessage('copy.influences.1cbf6a4e71'))],
      ),
      o(
        'contract-expiry',
        sourceMessage('copy.influences.4662d75ead'),
        sourceMessage('copy.influences.855031644f'),
        sourceMessage('copy.influences.2f5199472e'),
        [
          direct(
            sourceMessage('copy.influences.0378f67514'),
            sourceMessage('copy.influences.739899dc88'),
          ),
          f(
            sourceMessage('copy.influences.6f3356e241'),
            sourceMessage('copy.influences.0a0662572b'),
          ),
          f(
            sourceMessage('copy.influences.4937cfb106'),
            sourceMessage('copy.influences.a8954db978'),
          ),
        ],
        src('contracts', 'expireContracts'),
        [
          link('team-selection', sourceMessage('copy.influences.d4c7ef051c')),
          link('cash-balance', sourceMessage('copy.influences.adce5bce45')),
        ],
      ),
    ],
  },
  {
    id: 'transfers',
    title: sourceMessage('copy.influences.3e3348f42b'),
    description: sourceMessage('copy.influences.586fee6b07'),
    outcomes: [
      o(
        'registration-room',
        sourceMessage('copy.influences.85fff5d1c8'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.77f7c37e4d'),
        [
          f(
            sourceMessage('copy.influences.cfb91e2f1d'),
            sourceMessage('copy.influences.90424ea5f0'),
          ),
          f(
            sourceMessage('copy.influences.258b0e250a'),
            sourceMessage('copy.influences.e61da4e7f9'),
          ),
          f(
            sourceMessage('copy.influences.e247946547'),
            sourceMessage('copy.influences.c665e62f8e'),
          ),
        ],
        src('registration', 'registrationExempt', 'registration', 'registrationRoom'),
        [
          link('signing-completion', sourceMessage('copy.influences.5c8a833efa')),
          link('youth-promotion', sourceMessage('copy.influences.0bbeefc854')),
        ],
      ),

      o(
        'bid-acceptance',
        sourceMessage('copy.influences.08b77af5d3'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('copy.influences.5d932797ee'),
        [
          direct(
            sourceMessage('copy.influences.057a24531e'),
            sourceMessage('copy.influences.30606ecc8f'),
          ),
          f(
            sourceMessage('copy.influences.bd4f4df5ef'),
            sourceMessage('copy.influences.26d0d00f6c'),
          ),
          f(
            sourceMessage('copy.influences.efc030c146'),
            sourceMessage('copy.influences.26f7e290d0'),
          ),
          f(
            sourceMessage('copy.influences.d030ac91b8'),
            sourceMessage('copy.influences.d44015bda6'),
          ),
        ],
        [
          ...src('transfers', 'acceptanceChance', 'decideOutgoing'),
          ...src('staff', 'applyDepartment'),
        ],
        [link('signing-completion', sourceMessage('copy.influences.8cab7784b6'))],
        [sourceMessage('copy.influences.c1c6699c69'), sourceMessage('copy.influences.cc8059e4ce')],
      ),
      o(
        'bid-counter',
        sourceMessage('copy.influences.416948cf1f'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.8dcc4b0c78'),
        [
          direct(
            sourceMessage('copy.influences.dfb2bff0f9'),
            sourceMessage('copy.influences.fc1da9ed27'),
          ),
          f(
            sourceMessage('copy.influences.2291140e04'),
            sourceMessage('copy.influences.fd0263eec2'),
          ),
          direct(
            sourceMessage('copy.influences.6ddf180dcf'),
            sourceMessage('copy.influences.950ccf3f3d'),
          ),
          f(
            sourceMessage('copy.influences.1afee00464'),
            sourceMessage('copy.influences.78867aa5dd'),
          ),
        ],
        src('transfers', 'decideOutgoing', 'answerStaffCounter', 'respondBid'),
        [link('signing-completion', sourceMessage('copy.influences.d24a8e0784'))],
      ),
      o(
        'transfer-price',
        sourceMessage('copy.influences.c5af8b60e2'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.37a9954464'),
        [
          f(
            sourceMessage('copy.influences.090b42e88a'),
            sourceMessage('copy.influences.0d0ee433b8'),
          ),
          f(
            sourceMessage('copy.influences.3d2dc81093'),
            sourceMessage('copy.influences.44a7d0215f'),
          ),
          f(
            sourceMessage('copy.influences.56ee258ab1'),
            sourceMessage('copy.influences.060af3ccac'),
          ),
          direct(
            sourceMessage('copy.influences.26e6d97008'),
            sourceMessage('copy.influences.9e4e7498c5'),
          ),
        ],
        [
          ...src('market-prices', 'marketValueUnits', 'transferPremium'),
          ...src('scout-search', 'transferOffers'),
        ],
        [
          link('bid-acceptance', sourceMessage('copy.influences.aa5a978010')),
          link('cash-balance', sourceMessage('copy.influences.9eb179dd37')),
        ],
      ),
      o(
        'signing-completion',
        sourceMessage('copy.influences.b99a52e50a'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.c2c4d6f40b'),
        [
          f(
            sourceMessage('copy.influences.0b931146e7'),
            sourceMessage('copy.influences.fa5f348093'),
          ),
          f(
            sourceMessage('copy.influences.a8bc69269c'),
            sourceMessage('copy.influences.fd08acdf46'),
          ),
          f(
            sourceMessage('copy.influences.755f73a7cb'),
            sourceMessage('copy.influences.7818a40f65'),
          ),
          f(
            sourceMessage('copy.influences.6cd9ebc32b'),
            sourceMessage('copy.influences.05f66402e6'),
          ),
          direct(
            sourceMessage('copy.influences.97227a2684'),
            sourceMessage('copy.influences.4c3bd21275'),
          ),
        ],
        [
          ...src('transfers', 'signingBlocker', 'completeSigning'),
          ...src('registration', 'registrationRoom'),
        ],
        [
          link('adaptation', sourceMessage('copy.influences.d7fe4771d2')),
          link('operating-cost', sourceMessage('copy.influences.264b2dbbfe')),
          link('fan-mood', sourceMessage('copy.influences.d191a83cd1')),
        ],
      ),
      o(
        'free-agent',
        sourceMessage('copy.influences.4ed9b818d3'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.4f1cc58a88'),
        [
          direct(
            sourceMessage('copy.influences.c9ccbdc9c8'),
            sourceMessage('copy.influences.45fb021c6b'),
          ),
          f(
            sourceMessage('copy.influences.92ffb09b6b'),
            sourceMessage('copy.influences.df1b9961d8'),
          ),
          f(
            sourceMessage('copy.influences.85e82579e2'),
            sourceMessage('copy.influences.a080988296'),
          ),
        ],
        [...src('ops-squad', 'squadCommand'), ...src('scout-search', 'transferOffers')],
        [
          link('operating-cost', sourceMessage('copy.influences.8dbd11097e')),
          link('team-selection', sourceMessage('copy.influences.5d8c0a9d0b')),
        ],
      ),
      o(
        'incoming-bids',
        sourceMessage('copy.influences.2c3c49a236'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.07d1e6d91b'),
        [
          direct(
            sourceMessage('copy.influences.c495efb630'),
            sourceMessage('copy.influences.723e46334c'),
          ),
          f(
            sourceMessage('copy.influences.2806f6b7b5'),
            sourceMessage('copy.influences.5841194518'),
          ),
          f(
            sourceMessage('copy.influences.2c7f60d5cf'),
            sourceMessage('copy.influences.f66283b32c'),
          ),
          direct(
            sourceMessage('copy.influences.e8f1ace0bf'),
            sourceMessage('copy.influences.5022988b32'),
          ),
        ],
        src('transfers', 'incomingBid', 'listedOffers', 'suitorFor'),
        [link('sale-approval', sourceMessage('copy.influences.9ba7cedbb9'))],
      ),
      o(
        'sale-approval',
        sourceMessage('copy.influences.66798ce7e7'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.8c86ef32d6'),
        [
          direct(
            sourceMessage('copy.influences.c073e80f27'),
            sourceMessage('copy.influences.6b1d6e0399'),
          ),
          f(
            sourceMessage('copy.influences.327d93c0a6'),
            sourceMessage('copy.influences.58e1bb36c4'),
          ),
          f(
            sourceMessage('copy.influences.a9dd04374c'),
            sourceMessage('copy.influences.069450f068'),
          ),
          f(
            sourceMessage('copy.influences.c7a9a1f195'),
            sourceMessage('copy.influences.a854acf92a'),
          ),
        ],
        src('transfers', 'saleBlocker', 'respondBid', 'completeSale'),
        [
          link('cash-balance', sourceMessage('copy.influences.38e8c997d0')),
          link('team-selection', sourceMessage('copy.influences.1aafdfca24')),
          link('fan-mood', sourceMessage('copy.influences.55c3dceb38')),
          link('unhappy', sourceMessage('copy.influences.e396dd5456')),
        ],
      ),
      o(
        'auto-signing',
        sourceMessage('copy.influences.e4a72f5c27'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.7a23437bf0'),
        [
          direct(
            sourceMessage('copy.influences.b642346f5a'),
            sourceMessage('copy.influences.8f64f667e6'),
          ),
          f(
            sourceMessage('copy.influences.8ce5dd5f33'),
            sourceMessage('copy.influences.e69492b8ac'),
          ),
          f(
            sourceMessage('copy.influences.8e99ffcf85'),
            sourceMessage('copy.influences.b15e361ada'),
          ),
          f(
            sourceMessage('copy.influences.b6f4ef8492'),
            sourceMessage('copy.influences.b04a4e0d1e'),
          ),
        ],
        src('signings', 'signingVerdict', 'candidates', 'needLine'),
        [
          link('bid-acceptance', sourceMessage('copy.influences.493003c002')),
          link('manager-request', sourceMessage('copy.influences.fc028b5aa5')),
        ],
      ),
      o(
        'scouting',
        sourceMessage('copy.influences.dd4ccc4a2b'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.c6140c7da5'),
        [
          f(
            sourceMessage('copy.influences.718aad0a5f'),
            sourceMessage('copy.influences.090ce351cd'),
          ),
          f(
            sourceMessage('copy.influences.f52de760da'),
            sourceMessage('copy.influences.540644434f'),
          ),
          direct(
            sourceMessage('copy.influences.1a079c1edf'),
            sourceMessage('copy.influences.e096b976a4'),
          ),
          f(
            sourceMessage('copy.influences.9f92b08340'),
            sourceMessage('copy.influences.b20b534278'),
          ),
        ],
        [
          ...src('scout-search', 'scoutReach', 'transferOffers'),
          ...src('player', 'personalityRange'),
          ...src('recruitment', 'recruitmentFit'),
        ],
        [link('team-selection', sourceMessage('copy.influences.5511935141'))],
      ),
    ],
  },
  {
    id: 'matches',
    title: sourceMessage('copy.influences.b4678aa935'),
    description: sourceMessage('copy.influences.ef733c0cf7'),
    outcomes: [
      o(
        'match-processing',
        sourceMessage('copy.influences.2394b5a0dd'),
        sourceMessage('copy.influences.855031644f'),
        sourceMessage('copy.influences.3d4fe6cfd5'),
        [
          f(
            sourceMessage('copy.influences.306ef5665b'),
            sourceMessage('copy.influences.9f1f549fed'),
          ),
          f(
            sourceMessage('copy.influences.70cc49e1a0'),
            sourceMessage('copy.influences.afccd9ffae'),
          ),
          direct(
            sourceMessage('copy.influences.d6d39797a1'),
            sourceMessage('copy.influences.6a2e7d4641'),
          ),
          f(
            sourceMessage('copy.influences.69c2462dcb'),
            sourceMessage('copy.influences.0c78ef6341'),
          ),
        ],
        [
          ...src('match', 'simulateMatch', 'candidateMatch'),
          ...src('aggregate/engine', 'simulateAggregate'),
        ],
        [link('progression', sourceMessage('copy.influences.8a49f0362a'))],
        [sourceMessage('copy.influences.a342ed6ba3')],
      ),
      o(
        'movement-offside',
        sourceMessage('influences.match.offsideTitle'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('influences.match.offsideSummary'),
        [
          f(
            sourceMessage('influences.match.forwardPasses'),
            sourceMessage('influences.match.forwardPassesEffect'),
          ),
          f(
            sourceMessage('influences.match.receiverDecisions'),
            sourceMessage('influences.match.receiverDecisionsEffect'),
          ),
          f(
            sourceMessage('influences.match.pictureShape'),
            sourceMessage('influences.match.pictureShapeEffect'),
          ),
        ],
        [
          ...src('aggregate/team', 'generateTeamFacts', 'passGroup'),
          ...src('aggregate/players', 'OFFSIDE_CALL', 'attributePlayerFacts'),
          ...src('staging/shape', 'placeFor'),
          ...src('staging/tendency', 'tendency', 'roleFreedom'),
        ],
        [link('shot-quality', sourceMessage('copy.influences.8e1bbb0fec'))],
        [sourceMessage('influences.match.tendenciesAbsent')],
      ),

      o(
        'team-selection',
        sourceMessage('copy.influences.46620aead4'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.a5a2ebe38a'),
        [
          f(
            sourceMessage('copy.influences.e0e2594788'),
            sourceMessage('copy.influences.9d0226882a'),
          ),
          f(
            sourceMessage('copy.influences.2e1360630b'),
            sourceMessage('copy.influences.5e82ec8595'),
          ),
          f(
            sourceMessage('copy.influences.afa70443b7'),
            sourceMessage('copy.influences.a3572d5d70'),
          ),
          f(
            sourceMessage('copy.influences.fe860cc8dd'),
            sourceMessage('copy.influences.1adf1c4a4a'),
          ),
        ],
        [
          ...src('world', 'selectionValue', 'lineup', 'ownStarters'),
          ...src('player-state', 'slotOvr'),
        ],
        [
          link('match-strength', sourceMessage('copy.influences.8a9bca556c')),
          link('adaptation', sourceMessage('copy.influences.f2a529c347')),
        ],
      ),
      o(
        'effective-ovr',
        sourceMessage('copy.influences.064e921ad2'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.b35029e4ee'),
        [
          f(
            sourceMessage('copy.influences.afe36165f5'),
            sourceMessage('copy.influences.d50caaa508'),
          ),
          f(
            sourceMessage('copy.influences.68b4558788'),
            sourceMessage('copy.influences.a5165e1e5f'),
          ),
          f(
            sourceMessage('copy.influences.f9aa922a0f'),
            sourceMessage('copy.influences.0b63049d87'),
          ),
          f(
            sourceMessage('copy.influences.37e9bb3ac7'),
            sourceMessage('copy.influences.4438221d51'),
          ),
        ],
        [
          ...src('player-state', 'slotOvr', 'unhappyPenalty'),
          ...src('player', 'ovrAt', 'levelFactor', 'adaptationMultiplier'),
          ...src('aggregate/engine', 'aggregateSkillAccess'),
        ],
        [link('match-strength', sourceMessage('copy.influences.5f0a70bbf0'))],
      ),
      o(
        'match-strength',
        sourceMessage('copy.influences.ed0433b09b'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.2ab149b5ee'),
        [
          f(
            sourceMessage('copy.influences.0b5fb24130'),
            sourceMessage('copy.influences.357dfff0b0'),
          ),
          f(
            sourceMessage('copy.influences.6e798bc4ba'),
            sourceMessage('copy.influences.6f9b52cc51'),
          ),
          f(
            sourceMessage('copy.influences.b5ba14d3ff'),
            sourceMessage('copy.influences.e0128c15ed'),
          ),
          f(
            sourceMessage('copy.influences.8060711243'),
            sourceMessage('copy.influences.c76c65ddc0'),
          ),
          f(
            sourceMessage('copy.influences.33071d20ed'),
            sourceMessage('copy.influences.b9da78430f'),
          ),
        ],
        [
          ...src('match', 'prepareMatch'),
          ...src('world', 'ratingOf'),
          ...src('strategy', 'tacticalProfile'),
        ],
        [
          link('squad-morale', sourceMessage('copy.influences.aeb17dddac')),
          link('reputation', sourceMessage('copy.influences.ae1c230018')),
          link('fan-mood', sourceMessage('copy.influences.831559e985')),
        ],
        [sourceMessage('copy.influences.03c4d91833')],
      ),
      o(
        'tactical-play',
        sourceMessage('copy.influences.308404051e'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('influences.match.tacticalSummary'),
        [
          f(
            sourceMessage('copy.influences.efc1f9a43c'),
            sourceMessage('copy.influences.91e47e16f7'),
          ),
          f(
            sourceMessage('copy.influences.4344f92bf3'),
            sourceMessage('copy.influences.5e164c8930'),
          ),
          f(
            sourceMessage('influences.match.attribution'),
            sourceMessage('influences.match.attributionEffect'),
          ),
        ],
        [
          ...src('strategy', 'tacticalProfile'),
          ...src('aggregate/team', 'generateTeamFacts', 'attackOf'),
          ...src('aggregate/players', 'attributePlayerFacts'),
          ...src('match-weights', 'ROLE_ACTION', 'TRAIT_ACTION', 'actionWeight'),
        ],
        [
          link('match-fatigue', sourceMessage('copy.influences.5d1f3ba823')),
          link('shot-quality', sourceMessage('copy.influences.b32689f42e')),
        ],
        [sourceMessage('influences.match.tendenciesAbsent')],
      ),
      o(
        'pass-success',
        sourceMessage('copy.influences.15b0ea34b3'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('influences.match.passSummary'),
        [
          f(
            sourceMessage('copy.influences.ccbba1cf2e'),
            sourceMessage('copy.influences.003e6c4df3'),
          ),
          f(
            sourceMessage('influences.match.passKind'),
            sourceMessage('influences.match.passKindEffect'),
          ),
          f(
            sourceMessage('influences.match.passOpponent'),
            sourceMessage('influences.match.passOpponentEffect'),
          ),
          f(
            sourceMessage('copy.influences.6c0f0eace4'),
            sourceMessage('influences.match.crossEffect'),
          ),
        ],
        src('aggregate/team', 'completionShift', 'completionTo', 'passGroup', 'passesAndCarries'),
        [link('shot-quality', sourceMessage('copy.influences.2df0c48065'))],
      ),
      o(
        'take-on',
        sourceMessage('copy.influences.dd268eae3f'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('influences.match.takeOnSummary'),
        [
          f(
            sourceMessage('copy.influences.17bef28d91'),
            sourceMessage('copy.influences.c84295330a'),
          ),
          f(
            sourceMessage('copy.influences.394a42bad2'),
            sourceMessage('copy.influences.f4768b877f'),
          ),
          f(
            sourceMessage('influences.match.takeOnZone'),
            sourceMessage('copy.influences.531e29f6e3'),
          ),
        ],
        src('aggregate/team', 'carriesFrom', 'foulsOn'),
        [
          link('discipline', sourceMessage('copy.influences.da69ecaeec')),
          link('shot-quality', sourceMessage('copy.influences.470fab60a6')),
        ],
      ),
      o(
        'shot-quality',
        sourceMessage('copy.influences.9987a5a355'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.23615ceeaf'),
        [
          f(
            sourceMessage('copy.influences.1fdb630e83'),
            sourceMessage('copy.influences.9e0c071c2e'),
          ),
          f(
            sourceMessage('influences.match.shotDelivery'),
            sourceMessage('influences.match.shotDeliveryEffect'),
          ),
          f(
            sourceMessage('copy.influences.5bbb07141c'),
            sourceMessage('copy.influences.7f569380dc'),
          ),
          f(
            sourceMessage('influences.match.shotDefence'),
            sourceMessage('influences.match.shotDefenceEffect'),
          ),
          f(
            sourceMessage('influences.match.shotScore'),
            sourceMessage('influences.match.shotScoreEffect'),
          ),
        ],
        src('aggregate/team', 'shoot', 'openPlayShots', 'setPieceShots', 'keepByScore'),
        [link('match-strength', sourceMessage('copy.influences.7980ffd281'))],
      ),
      o(
        'discipline',
        sourceMessage('copy.influences.b21c7f542a'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('influences.match.disciplineSummary'),
        [
          f(
            sourceMessage('influences.match.cardRates'),
            sourceMessage('influences.match.cardRatesEffect'),
          ),
          f(
            sourceMessage('copy.influences.a913f58991'),
            sourceMessage('copy.influences.f7032006b0'),
          ),
          f(
            sourceMessage('copy.influences.ab64191528'),
            sourceMessage('copy.influences.82687b5867'),
          ),
        ],
        [
          ...src('aggregate/participation', 'planParticipation'),
          ...src('discipline', 'leagueYellowBan', 'competitionOf'),
        ],
        [link('team-selection', sourceMessage('copy.influences.d6b9dfdd38'))],
      ),
      o(
        'match-fatigue',
        sourceMessage('copy.influences.b14fc41698'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.b1e59aea79'),
        [
          f(
            sourceMessage('copy.influences.b779795ea4'),
            sourceMessage('copy.influences.b5e4f919b4'),
          ),
          f(
            sourceMessage('copy.influences.e2b1a14ba9'),
            sourceMessage('copy.influences.507bf592db'),
          ),
          f(
            sourceMessage('copy.influences.36c7d18fe8'),
            sourceMessage('copy.influences.03d86c894f'),
          ),
          f(
            sourceMessage('copy.influences.f49bea3e88'),
            sourceMessage('copy.influences.60461b040f'),
          ),
        ],
        [
          ...src('strategy', 'fatigueCost'),
          ...src('aggregate/participation', 'planParticipation'),
          ...src('aggregate/engine', 'aggregatePlan'),
          ...src('training', 'settleTraining'),
        ],
        [
          link('injury', sourceMessage('copy.influences.6bcbe620c9')),
          link('team-selection', sourceMessage('copy.influences.ec4823a22f')),
        ],
      ),
      o(
        'penalties',
        sourceMessage('copy.influences.e5824c6f6b'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('copy.influences.2c89dbce2e'),
        [
          f(
            sourceMessage('copy.influences.7e5ffbdd6e'),
            sourceMessage('copy.influences.258b12db07'),
          ),
          f(
            sourceMessage('copy.influences.7230368544'),
            sourceMessage('copy.influences.e70293d30e'),
          ),
          f(
            sourceMessage('copy.influences.80df3197a1'),
            sourceMessage('copy.influences.30a4948cf3'),
          ),
        ],
        [
          ...src('aggregate/team', 'foulsOn', 'shoot'),
          ...src('aggregate/engine', 'aggregateShootout'),
        ],
      ),
    ],
  },
  {
    id: 'development',
    title: sourceMessage('copy.influences.749b0d4a6b'),
    description: sourceMessage('copy.influences.94aaea983b'),
    outcomes: [
      o(
        'player-personality',
        sourceMessage('copy.influences.65e57e6899'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.124ca948ef'),
        [
          f(
            sourceMessage('copy.influences.f22434c1d6'),
            sourceMessage('copy.influences.280ab3c58d'),
          ),
          f(
            sourceMessage('copy.influences.af26f66619'),
            sourceMessage('copy.influences.bb27d8aeef'),
          ),
          f(
            sourceMessage('copy.influences.7589bac4d7'),
            sourceMessage('copy.influences.444d15cd3d'),
          ),
          f(
            sourceMessage('influences.match.traitsRole'),
            sourceMessage('copy.influences.d6cc599b9b'),
          ),
        ],
        [
          ...src('player', 'PROFESSIONALISM_RATE', 'ADAPTABILITY_RATE', 'AMBITION_UNHAPPY'),
          ...src('match-weights', 'TRAIT_ACTION'),
          ...src('morale', 'leadersInLastXi'),
        ],
        [
          link('player-growth', sourceMessage('copy.influences.6960772acd')),
          link('adaptation', sourceMessage('copy.influences.a9729793e2')),
          link('unhappy', sourceMessage('copy.influences.abbe8e192e')),
        ],
      ),

      o(
        'training-focus',
        sourceMessage('copy.influences.7219c6cf08'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.9c717db13f'),
        [
          f(
            sourceMessage('copy.influences.c7ea4d6d1d'),
            sourceMessage('copy.influences.56616dafbc'),
          ),
          f(
            sourceMessage('copy.influences.997f12679d'),
            sourceMessage('copy.influences.4c077a24d3'),
          ),
          direct(
            sourceMessage('copy.influences.7762acf4c2'),
            sourceMessage('copy.influences.29e6efd9fa'),
          ),
        ],
        src('staff', 'autoTrainingAdvice', 'autoPlayerFocus'),
        [
          link('player-growth', sourceMessage('copy.influences.b4e038a9db')),
          link('injury', sourceMessage('copy.influences.4033e96446')),
          link('squad-morale', sourceMessage('copy.influences.7f1ccb53a9')),
        ],
      ),
      o(
        'player-growth',
        sourceMessage('copy.influences.83256d4703'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.3ac7cc32bc'),
        [
          f(
            sourceMessage('copy.influences.bc896a524f'),
            sourceMessage('copy.influences.5b36be9452'),
          ),
          f(
            sourceMessage('copy.influences.f22434c1d6'),
            sourceMessage('copy.influences.d2904d206e'),
          ),
          f(
            sourceMessage('copy.influences.44232efad0'),
            sourceMessage('copy.influences.7a04d5d09d'),
          ),
          direct(
            sourceMessage('copy.influences.63fd172d5f'),
            sourceMessage('copy.influences.b8d22fcc6f'),
          ),
          f(
            sourceMessage('copy.influences.d128dc0cc9'),
            sourceMessage('copy.influences.f29b37b8dd'),
          ),
        ],
        [
          ...src('training', 'roundGain', 'growAttributes', 'settleTraining'),
          ...src('player', 'overshootFactor'),
        ],
        [
          link('effective-ovr', sourceMessage('copy.influences.bb0993a727')),
          link('wage-demand', sourceMessage('copy.influences.67738f7332')),
        ],
        [sourceMessage('copy.influences.96c92c43cf')],
      ),
      o(
        'annual-growth',
        sourceMessage('copy.influences.1379ad6952'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.91ea87c912'),
        [
          f(
            sourceMessage('copy.influences.6245037eee'),
            sourceMessage('copy.influences.93f0405483'),
          ),
          f(
            sourceMessage('copy.influences.bf68cbcca9'),
            sourceMessage('copy.influences.8116244825'),
          ),
          f(
            sourceMessage('copy.influences.9b71cc5943'),
            sourceMessage('copy.influences.453a972b61'),
          ),
        ],
        [...src('training', 'developAnnually'), ...src('player', 'AGEING')],
        [
          link('wage-demand', sourceMessage('copy.influences.0688676b58')),
          link('team-selection', sourceMessage('copy.influences.6862cda5a1')),
        ],
      ),
      o(
        'potential-change',
        sourceMessage('copy.influences.9b89bd30ba'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('copy.influences.33bbefe06d'),
        [
          f(
            sourceMessage('copy.influences.7d017a417a'),
            sourceMessage('copy.influences.7e0e184942'),
          ),
          f(
            sourceMessage('copy.influences.f2b9e13031'),
            sourceMessage('copy.influences.bf2f72efca'),
          ),
          f(
            sourceMessage('copy.influences.64469b81b8'),
            sourceMessage('copy.influences.c6ee0861de'),
          ),
        ],
        src('training', 'revisePotential'),
        [
          link('player-growth', sourceMessage('copy.influences.fc5d936733')),
          link('transfer-price', sourceMessage('copy.influences.e7b91c34a6')),
        ],
        [sourceMessage('copy.influences.942b357b1f')],
      ),
      o(
        'adaptation',
        sourceMessage('copy.influences.af5820e132'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.4458228f5e'),
        [
          f(
            sourceMessage('copy.influences.8121b16128'),
            sourceMessage('copy.influences.fb48eca5d3'),
          ),
          f(
            sourceMessage('copy.influences.64869b3fa4'),
            sourceMessage('copy.influences.82242348a6'),
          ),
          f(
            sourceMessage('copy.influences.6507331426'),
            sourceMessage('copy.influences.ec02d5270a'),
          ),
          direct(
            sourceMessage('copy.influences.4e0080bed2'),
            sourceMessage('copy.influences.c204a59530'),
          ),
        ],
        [
          ...src('adaptation', 'settleRate', 'settleStarts', 'settleSubs', 'onManagerChange'),
          ...src('player', 'adaptationStart'),
        ],
        [
          link('effective-ovr', sourceMessage('copy.influences.650dd22f57')),
          link('player-growth', sourceMessage('copy.influences.97ee18fb28')),
        ],
      ),
      o(
        'injury',
        sourceMessage('copy.influences.94c565536d'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('copy.influences.a96395cc62'),
        [
          f(
            sourceMessage('copy.influences.273ab71bf9'),
            sourceMessage('copy.influences.9a7b594b03'),
          ),
          f(
            sourceMessage('copy.influences.0bc7a652a0'),
            sourceMessage('copy.influences.b920919238'),
          ),
          f(
            sourceMessage('copy.influences.773e7a4fe0'),
            sourceMessage('copy.influences.1d7dd3b520'),
          ),
          f(
            sourceMessage('copy.influences.c876719aec'),
            sourceMessage('copy.influences.5f05166aad'),
          ),
        ],
        [
          ...src('injury-rules', 'injuryChance'),
          ...src('aggregate/participation', 'planParticipation'),
          ...src('careers', 'trainingInjuries'),
        ],
        [
          link('team-selection', sourceMessage('copy.influences.a949a14843')),
          link('auto-signing', sourceMessage('copy.influences.2c34e29ba9')),
        ],
      ),
      o(
        'academy-intake',
        sourceMessage('copy.influences.b7d5e0e93d'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.0080170c1d'),
        [
          f(
            sourceMessage('copy.influences.474363c806'),
            sourceMessage('copy.influences.7aa41579da'),
          ),
          direct(
            sourceMessage('copy.influences.acb23f99e7'),
            sourceMessage('copy.influences.026e08ad62'),
          ),
          direct(
            sourceMessage('copy.influences.ce0824bf39'),
            sourceMessage('copy.influences.00dbb50afc'),
          ),
          f(
            sourceMessage('copy.influences.a26fc309d7'),
            sourceMessage('copy.influences.7cc87693b0'),
          ),
        ],
        [
          ...src('academy', 'academyIntakeSize', 'academyPotentialBonus', 'runAcademyIntake'),
          ...src('staff', 'applyDepartment'),
        ],
        [link('academy-development', sourceMessage('copy.influences.8dece1d095'))],
      ),
      o(
        'academy-development',
        sourceMessage('copy.influences.34dc6648ad'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.030756c0fb'),
        [
          f(
            sourceMessage('copy.influences.38d2d722a2'),
            sourceMessage('copy.influences.db0d729e55'),
          ),
          f(
            sourceMessage('copy.influences.6d18379936'),
            sourceMessage('copy.influences.e8521b3695'),
          ),
          direct(
            sourceMessage('copy.influences.794fa2be8b'),
            sourceMessage('copy.influences.bf5dfc6248'),
          ),
          f(
            sourceMessage('copy.influences.d654fe4834'),
            sourceMessage('copy.influences.c0669a5cf7'),
          ),
        ],
        src('academy', 'developAcademy', 'youthAdvice', 'readinessOf'),
        [link('youth-promotion', sourceMessage('copy.influences.c2052f4ef1'))],
      ),
      o(
        'youth-promotion',
        sourceMessage('copy.influences.6e20ee5e29'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.f4a231c213'),
        [
          direct(
            sourceMessage('copy.influences.4fa5e4e823'),
            sourceMessage('copy.influences.d7f212d893'),
          ),
          f(
            sourceMessage('copy.influences.f682a6c227'),
            sourceMessage('copy.influences.c4fd6278db'),
          ),
          direct(
            sourceMessage('copy.influences.a61e47c93c'),
            sourceMessage('copy.influences.0012585dc7'),
          ),
          direct(
            sourceMessage('copy.influences.09adb3bceb'),
            sourceMessage('copy.influences.5215f3d636'),
          ),
          f(
            sourceMessage('copy.influences.8f8e577599'),
            sourceMessage('copy.influences.bd18bb7108'),
          ),
        ],
        src('academy', 'promoteYouth', 'releaseYouth', 'seasonAcademy'),
        [
          link('operating-cost', sourceMessage('copy.influences.f9b03536fe')),
          link('team-selection', sourceMessage('copy.influences.96154aba0e')),
        ],
      ),
      o(
        'retirement',
        sourceMessage('copy.influences.07fbc1b3f8'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.ef771c1499'),
        [
          f(
            sourceMessage('copy.influences.f2992646d7'),
            sourceMessage('copy.influences.7a419b767c'),
          ),
          f(
            sourceMessage('copy.influences.c01289a966'),
            sourceMessage('copy.influences.0af01007b1'),
          ),
          direct(
            sourceMessage('copy.influences.0c25ace3e7'),
            sourceMessage('copy.influences.9c7513ae87'),
          ),
          f(
            sourceMessage('copy.influences.cae4947828'),
            sourceMessage('copy.influences.5df8e16f20'),
          ),
        ],
        [
          ...src('careers', 'retirementChanceWithContext'),
          ...src('playing-coach', 'answerPlayingCoach', 'playingCoachQuote'),
        ],
        [
          link('team-selection', sourceMessage('copy.influences.992f250017')),
          link('staff-impact', sourceMessage('copy.influences.e8e25ffe28')),
        ],
      ),
    ],
  },
  {
    id: 'staff',
    title: sourceMessage('copy.influences.3d399f99c0'),
    description: sourceMessage('copy.influences.c484cc2863'),
    outcomes: [
      o(
        'manager-hiring',
        sourceMessage('copy.influences.cc64322b47'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.aeb19d67c0'),
        [
          direct(
            sourceMessage('copy.influences.9f6f5b9f51'),
            sourceMessage('copy.influences.bb5b023f74'),
          ),
          f(
            sourceMessage('copy.influences.bb517f95fb'),
            sourceMessage('copy.influences.1a8bdfa2fc'),
          ),
          f(
            sourceMessage('copy.influences.26d6f26319'),
            sourceMessage('copy.influences.b53a0d4f39'),
          ),
          f(
            sourceMessage('copy.influences.cf7ffa2f62'),
            sourceMessage('copy.influences.e892c01500'),
          ),
        ],
        [
          ...src('ops-staff', 'staffCommand', 'installManager', 'managerPayoff'),
          ...src('adaptation', 'onManagerChange'),
        ],
        [
          link('tactical-play', sourceMessage('copy.influences.dca9c5a8d8')),
          link('adaptation', sourceMessage('copy.influences.eafd30e294')),
          link('operating-cost', sourceMessage('copy.influences.13b9be1763')),
        ],
      ),
      o(
        'staff-impact',
        sourceMessage('copy.influences.d28ef2f0da'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.0fc3fca5f2'),
        [
          f(
            sourceMessage('copy.influences.93597ff491'),
            sourceMessage('copy.influences.ecdb6ab8e3'),
          ),
          f(
            sourceMessage('copy.influences.e3e5796bf5'),
            sourceMessage('copy.influences.7a7abd7c90'),
            [
              f(sourceMessage('staff.role.fitness'), sourceMessage('copy.influences.0479cdd50c')),
              f(
                sourceMessage('copy.influences.735dbd0bc6'),
                sourceMessage('copy.influences.5752fde7d2'),
              ),
              f(
                sourceMessage('copy.influences.ed76d32963'),
                sourceMessage('copy.influences.6280d577ee'),
              ),
              f(sourceMessage('staff.role.director'), sourceMessage('copy.influences.a1b5103b30')),
            ],
          ),
          direct(
            sourceMessage('copy.influences.953faad309'),
            sourceMessage('copy.influences.5f1d44d4cf'),
          ),
        ],
        src('staff', 'applyDepartment', 'staffEffects', 'hireStaff', 'releaseStaff'),
        [
          link('player-growth', sourceMessage('copy.influences.8145d4b710')),
          link('academy-intake', sourceMessage('copy.influences.c0dd11e1ca')),
          link('bid-acceptance', sourceMessage('copy.influences.38da85f6d6')),
          link('operating-cost', sourceMessage('copy.influences.59cbd8db12')),
        ],
      ),
      o(
        'staff-market',
        sourceMessage('copy.influences.62ed08ca15'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.af525e66e4'),
        [
          f(
            sourceMessage('copy.influences.aaca85655d'),
            sourceMessage('copy.influences.e03041b493'),
          ),
          f(
            sourceMessage('copy.influences.4cdcc0d092'),
            sourceMessage('copy.influences.27c5e5dcfd'),
          ),
          direct(
            sourceMessage('copy.influences.bee84b3ea1'),
            sourceMessage('copy.influences.d25b3b8740'),
          ),
          direct(
            sourceMessage('copy.influences.1959c83520'),
            sourceMessage('copy.influences.189c901ace'),
          ),
          f(
            sourceMessage('copy.influences.38144f4b61'),
            sourceMessage('copy.influences.5703d166c2'),
          ),
        ],
        [
          ...src('club-staff', 'refreshStaffMarket', 'poachStaff'),
          ...src('staff', 'coachFits', 'fillDelegatedPost'),
          ...src('ops-staff', 'appointDelegatedManager'),
        ],
        [
          link('manager-hiring', sourceMessage('copy.influences.dcd8f8b399')),
          link('staff-impact', sourceMessage('copy.influences.3f82d8e781')),
        ],
      ),
      o(
        'delegation',
        sourceMessage('copy.influences.bced249584'),
        sourceMessage('copy.influences.855031644f'),
        sourceMessage('copy.influences.b72a6a16f9'),
        [
          direct(
            sourceMessage('copy.influences.ef419344b0'),
            sourceMessage('copy.influences.976b5904ed'),
          ),
          f(
            sourceMessage('copy.influences.200afa58fd'),
            sourceMessage('copy.influences.d0ec47da69'),
          ),
          f(
            sourceMessage('copy.influences.26d36cb6af'),
            sourceMessage('copy.influences.7e732728fd'),
          ),
        ],
        src('responsibilities', 'defaultSettings', 'isDelegated', 'changedResponsibilities'),
        [
          link('auto-renewal', sourceMessage('copy.influences.f3e7ad4445')),
          link('auto-signing', sourceMessage('copy.influences.acd5e1db59')),
          link('sponsor-deal', sourceMessage('copy.influences.7f3eb8ecd3')),
        ],
      ),
      o(
        'manager-request',
        sourceMessage('copy.influences.5a4f10ba04'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.25b6f18ee3'),
        [
          f(
            sourceMessage('copy.influences.1f8740ec5f'),
            sourceMessage('copy.influences.3b104e5f45'),
          ),
          f(
            sourceMessage('copy.influences.b83e81a2a3'),
            sourceMessage('copy.influences.932cb63c2e'),
          ),
          f(
            sourceMessage('copy.influences.17768624a4'),
            sourceMessage('copy.influences.f22ca7a082'),
          ),
        ],
        src('signings', 'judgeRequests', 'meetsRequest'),
        [
          link('manager-resignation', sourceMessage('copy.influences.01086c6293')),
          link('squad-morale', sourceMessage('copy.influences.7ff342cc52')),
        ],
      ),
      o(
        'mediation',
        sourceMessage('copy.influences.c3bb08961f'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.a00fda4752'),
        [
          f(
            sourceMessage('copy.influences.fd025c7255'),
            sourceMessage('copy.influences.dbad22082f'),
          ),
          direct(
            sourceMessage('copy.influences.3ec08e6f46'),
            sourceMessage('copy.influences.2941106a5d'),
          ),
          f(
            sourceMessage('copy.influences.3e1db6345e'),
            sourceMessage('copy.influences.e4c8d73ab4'),
          ),
        ],
        src('mediation', 'detectMediations', 'resolveMediation'),
        [
          link('bid-acceptance', sourceMessage('copy.influences.038e860317')),
          link('promise-result', sourceMessage('copy.influences.8849ea7b9c')),
        ],
        [sourceMessage('copy.influences.2f49d22728')],
      ),
      o(
        'promise-result',
        sourceMessage('copy.influences.21c899a4ae'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.50c5f187c7'),
        [
          f(
            sourceMessage('copy.influences.9530877ba1'),
            sourceMessage('copy.influences.860b64c43a'),
          ),
          f(
            sourceMessage('copy.influences.3607591b25'),
            sourceMessage('copy.influences.b80cb4df60'),
          ),
          f(
            sourceMessage('copy.influences.ecaf037276'),
            sourceMessage('copy.influences.2cdd3b7acd'),
          ),
        ],
        src('promises', 'judgePromises', 'finish', 'cancelPromises'),
        [link('manager-request', sourceMessage('copy.influences.d6a8cdea42'))],
        [sourceMessage('copy.influences.96e782750f')],
      ),
      o(
        'manager-resignation',
        sourceMessage('copy.influences.843d93244b'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.50194d1115'),
        [
          f(
            sourceMessage('copy.influences.255b704bd6'),
            sourceMessage('copy.influences.d63a71b125'),
          ),
          f(
            sourceMessage('copy.influences.d190dad964'),
            sourceMessage('copy.influences.968b280830'),
          ),
          f(
            sourceMessage('copy.influences.6a6a71ca79'),
            sourceMessage('copy.influences.6231e03600'),
          ),
        ],
        src('ops-staff', 'settleManagerTrust', 'yearlyStaff'),
        [link('manager-hiring', sourceMessage('copy.influences.5c1740e8ba'))],
      ),
      o(
        'overdue-approvals',
        sourceMessage('copy.influences.f7167901fb'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.2aba4e8a12'),
        [
          direct(
            sourceMessage('copy.influences.7a814d7907'),
            sourceMessage('copy.influences.2acc328484'),
          ),
          f(
            sourceMessage('copy.influences.f58bf48439'),
            sourceMessage('copy.influences.8d34e363e3'),
          ),
          f(
            sourceMessage('copy.influences.69ae5ee3a1'),
            sourceMessage('copy.influences.ec77e0b5c9'),
          ),
        ],
        src('approvals', 'overdueApprovals', 'overdueMoraleCost', 'countApprovalWaits'),
        [link('squad-morale', sourceMessage('copy.influences.85ddcb34dc'))],
      ),
    ],
  },
  {
    id: 'finances',
    title: sourceMessage('copy.influences.ca994e5436'),
    description: sourceMessage('copy.influences.7c8bc4956b'),
    outcomes: [
      o(
        'cash-balance',
        sourceMessage('copy.influences.36258b47f4'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.f820ba60c6'),
        [
          f(
            sourceMessage('copy.influences.e603cb3e2f'),
            sourceMessage('copy.influences.7302d236ef'),
          ),
          direct(
            sourceMessage('copy.influences.48006e43f8'),
            sourceMessage('copy.influences.38a954a74f'),
          ),
          f(
            sourceMessage('copy.influences.2c4b5ba871'),
            sourceMessage('copy.influences.5051c7dca7'),
          ),
          direct(
            sourceMessage('copy.influences.de5d902181'),
            sourceMessage('copy.influences.991f6762b5'),
          ),
        ],
        src('finance', 'operatingCosts', 'seasonResult', 'financialBreakdown'),
        [
          link('club-bankruptcy', sourceMessage('copy.influences.478978ed5d')),
          link('auto-signing', sourceMessage('copy.influences.0ed424bdfa')),
        ],
      ),
      o(
        'operating-cost',
        sourceMessage('copy.influences.73f9e24908'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.7e54d39511'),
        [
          f(
            sourceMessage('copy.influences.c7a1ae03c9'),
            sourceMessage('copy.influences.41f0a215d0'),
          ),
          direct(
            sourceMessage('copy.influences.77f7212dac'),
            sourceMessage('copy.influences.717f5044ca'),
          ),
          f(
            sourceMessage('copy.influences.aa0109ad0f'),
            sourceMessage('copy.influences.7a22d70d08'),
          ),
          f(
            sourceMessage('copy.influences.27e252a84d'),
            sourceMessage('copy.influences.2008fdd492'),
          ),
        ],
        src('finance', 'operatingCosts', 'assessOperatingExpenses', 'wageBill'),
        [
          link('cash-balance', sourceMessage('copy.influences.8a78b17c5d')),
          link('auto-renewal', sourceMessage('copy.influences.232f49e525')),
          link('auto-signing', sourceMessage('copy.influences.991e5596e5')),
        ],
      ),
      o(
        'gate-income',
        sourceMessage('copy.influences.04f14c44b4'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.8255a0ea21'),
        [
          f(
            sourceMessage('copy.influences.346fe39c9b'),
            sourceMessage('copy.influences.1cf9a13997'),
          ),
          f(
            sourceMessage('copy.influences.80721a953c'),
            sourceMessage('copy.influences.305dca0731'),
          ),
          direct(
            sourceMessage('copy.influences.264b46b51d'),
            sourceMessage('copy.influences.e0581d333d'),
          ),
          f(
            sourceMessage('copy.influences.27a3746d72'),
            sourceMessage('copy.influences.5703955fe8'),
          ),
        ],
        [
          ...src('finance', 'gateProjection', 'opponentDraw', 'leagueMatchFactor'),
          ...src('fans', 'localSupporters'),
        ],
        [link('cash-balance', sourceMessage('copy.influences.94157ffce9'))],
      ),
      o(
        'sponsor-value',
        sourceMessage('copy.influences.eefd745eed'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.742b5d7904'),
        [
          f(
            sourceMessage('copy.influences.54cd51631a'),
            sourceMessage('copy.influences.d99b209565'),
          ),
          f(
            sourceMessage('copy.influences.37949d33fe'),
            sourceMessage('copy.influences.80a14a5b43'),
          ),
          f(
            sourceMessage('copy.influences.3b8ce2789e'),
            sourceMessage('copy.influences.039e771565'),
          ),
          direct(
            sourceMessage('copy.influences.39b08d2dec'),
            sourceMessage('copy.influences.facc3e0913'),
          ),
        ],
        src('sponsors', 'commercialValue', 'sponsorOffers', 'sponsorSlotOpen'),
        [link('sponsor-deal', sourceMessage('copy.influences.814839ea22'))],
      ),
      o(
        'sponsor-deal',
        sourceMessage('copy.influences.628295e9a2'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.7ff08febd5'),
        [
          direct(
            sourceMessage('copy.influences.68a553e06c'),
            sourceMessage('copy.influences.449c52a25c'),
          ),
          f(
            sourceMessage('copy.influences.ea7e45c31d'),
            sourceMessage('copy.influences.0eba453857'),
          ),
          f(
            sourceMessage('copy.influences.b2e9c7cbea'),
            sourceMessage('copy.influences.c6f6bb3340'),
          ),
          f(
            sourceMessage('copy.influences.cfd9f7b1aa'),
            sourceMessage('copy.influences.c25646c8d1'),
          ),
        ],
        src('sponsors', 'signSponsor', 'delegatedSponsors', 'sponsorAnnual', 'yearlySponsor'),
        [link('cash-balance', sourceMessage('copy.influences.ab952e9efe'))],
      ),
      o(
        'reputation',
        sourceMessage('copy.influences.ac7097f673'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.5c64de586d'),
        [
          f(
            sourceMessage('copy.influences.9cc2e6eaca'),
            sourceMessage('copy.influences.4089690885'),
          ),
          f(
            sourceMessage('copy.influences.b7737ea108'),
            sourceMessage('copy.influences.afd0bf0b73'),
          ),
          f(
            sourceMessage('copy.influences.ab56e94b75'),
            sourceMessage('copy.influences.b013691fe9'),
          ),
        ],
        src('reputation', 'settleReputation', 'awardReputation'),
        [
          link('supporters', sourceMessage('copy.influences.ce34dc0d64')),
          link('sponsor-value', sourceMessage('copy.influences.671d362aa3')),
          link('bid-acceptance', sourceMessage('copy.influences.06e334015e')),
        ],
      ),
      o(
        'supporters',
        sourceMessage('copy.influences.0bc611ea93'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.c96774bb87'),
        [
          f(
            sourceMessage('copy.influences.28d93a6c2d'),
            sourceMessage('copy.influences.b3cde7a511'),
          ),
          direct(
            sourceMessage('copy.influences.c6ed6a46a2'),
            sourceMessage('copy.influences.4798795574'),
          ),
          direct(
            sourceMessage('copy.influences.517019ebd5'),
            sourceMessage('copy.influences.54ff4e554d'),
          ),
          direct(
            sourceMessage('copy.influences.f39e48758d'),
            sourceMessage('copy.influences.7d7e67a766'),
          ),
        ],
        [
          ...src('fans', 'driftFans', 'fansAfterMatch'),
          ...src('bases', 'baseEffects', 'settleBases', 'seasonTour'),
        ],
        [
          link('gate-income', sourceMessage('copy.influences.0a5a663b97')),
          link('sponsor-value', sourceMessage('copy.influences.752c7f969f')),
          link('academy-intake', sourceMessage('copy.influences.4548833bc3')),
        ],
        [sourceMessage('copy.influences.627f8ab029')],
      ),
      o(
        'facilities',
        sourceMessage('copy.influences.174bfa81d0'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.32ad69cc94'),
        [
          direct(
            sourceMessage('copy.influences.cc7c09caff'),
            sourceMessage('copy.influences.82773381fd'),
          ),
          direct(
            sourceMessage('copy.influences.4ae084e737'),
            sourceMessage('copy.influences.859fefbbf4'),
          ),
          direct(
            sourceMessage('copy.influences.2e12c3b8db'),
            sourceMessage('copy.influences.7ce7aebcd4'),
          ),
          f(
            sourceMessage('copy.influences.6f2bd3ff87'),
            sourceMessage('copy.influences.5c44b271ae'),
          ),
        ],
        [
          ...src(
            'facility-model',
            'stadiumCapacity',
            'TRAINING_GROUND',
            'academyFacilityTerms',
            'facilityUpkeepUnits',
          ),
          ...src('facilities', 'progressFacilityWorks'),
        ],
        [
          link('gate-income', sourceMessage('copy.influences.ffa19d1155')),
          link('player-growth', sourceMessage('copy.influences.8767114886')),
          link('academy-intake', sourceMessage('copy.influences.784e831484')),
          link('operating-cost', sourceMessage('copy.influences.e9bf054179')),
        ],
      ),
      o(
        'squad-morale',
        sourceMessage('copy.influences.e44f676806'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.08d7089f20'),
        [
          f(
            sourceMessage('copy.influences.dc4f353d1c'),
            sourceMessage('copy.influences.478c14b1d9'),
          ),
          f(
            sourceMessage('copy.influences.8265bc0c34'),
            sourceMessage('copy.influences.cf006e48cc'),
          ),
          f(
            sourceMessage('copy.influences.303b856990'),
            sourceMessage('copy.influences.6e1e628ac7'),
          ),
          direct(
            sourceMessage('copy.influences.b3fbc541cc'),
            sourceMessage('copy.influences.a64c71e58c'),
          ),
        ],
        src('morale', 'moraleBaseline', 'moraleAfterMatch', 'settleMorale'),
        [
          link('match-strength', sourceMessage('copy.influences.89e6651d4f')),
          link('renewal-acceptance', sourceMessage('copy.influences.b6876ed41b')),
          link('training-focus', sourceMessage('copy.influences.12dd799bd5')),
        ],
      ),
      o(
        'club-bankruptcy',
        sourceMessage('copy.influences.c09ed2b08e'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.b894978469'),
        [
          f(
            sourceMessage('copy.influences.3598092128'),
            sourceMessage('copy.influences.676d33a175'),
          ),
          f(
            sourceMessage('copy.influences.363ae81e3c'),
            sourceMessage('copy.influences.3f3fe5de16'),
          ),
          direct(
            sourceMessage('copy.influences.59664fef57'),
            sourceMessage('copy.influences.82dc835727'),
          ),
        ],
        src('settlement', 'insolvency'),
        [link('career-end', sourceMessage('copy.influences.32f0df2a39'))],
      ),
    ],
  },
  {
    id: 'owner',
    title: sourceMessage('copy.influences.30fcc0e16e'),
    description: sourceMessage('copy.influences.5bbeebc91b'),
    outcomes: [
      o(
        'takeover-price',
        sourceMessage('copy.influences.8566f30551'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.4835cc02bb'),
        [
          f(
            sourceMessage('copy.influences.abee6a544b'),
            sourceMessage('copy.influences.5b537e3f22'),
          ),
          f(
            sourceMessage('copy.influences.847bf4a893'),
            sourceMessage('copy.influences.2614ef47d6'),
          ),
          f(
            sourceMessage('copy.influences.aa0c60a4f2'),
            sourceMessage('copy.influences.9d22862e30'),
          ),
          f(
            sourceMessage('copy.influences.c251caa473'),
            sourceMessage('copy.influences.cfad11f1ed'),
          ),
        ],
        [...src('club-value', 'clubValue', 'tierFortune'), ...src('takeover', 'takeOver')],
        [
          link('cash-balance', sourceMessage('copy.influences.635538dd19')),
          link('owner-fortune', sourceMessage('copy.influences.c0ddccc7c6')),
          link('operating-cost', sourceMessage('copy.influences.d3ba2fc476')),
        ],
      ),
      o(
        'owner-fortune',
        sourceMessage('copy.influences.a4f35a00e7'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.ececa37ca6'),
        [
          f(
            sourceMessage('copy.influences.a65a409994'),
            sourceMessage('copy.influences.d66518bb6b'),
            [],
            sourceMessage('copy.influences.a88bb369fc'),
          ),
          f(
            sourceMessage('copy.influences.aec767914c'),
            sourceMessage('copy.influences.d4aecfd77f'),
            [],
            sourceMessage('copy.influences.a88bb369fc'),
          ),
          direct(
            sourceMessage('copy.influences.d948a41bed'),
            sourceMessage('copy.influences.e0fdb2a7fe'),
          ),
          f(
            sourceMessage('copy.influences.4a0e5746fd'),
            sourceMessage('copy.influences.f71a33cb72'),
          ),
        ],
        [
          ...src('club-value', 'tierAnchor', 'tierFortune'),
          ...src('takeover', 'takeOver'),
          ...src('owner', 'settle'),
        ],
        [
          link('business-result', sourceMessage('copy.influences.1ab9f3b98a')),
          link('owner-injection', sourceMessage('copy.influences.ff8c7d07d3')),
          link('owner-bankruptcy', sourceMessage('copy.influences.7d6ce3f38c')),
        ],
      ),
      o(
        'business-result',
        sourceMessage('copy.influences.f92cca65ce'),
        sourceMessage('copy.influences.bf7f08b3cb'),
        sourceMessage('copy.influences.a743252b4a'),
        [
          direct(
            sourceMessage('copy.influences.db4838080d'),
            sourceMessage('copy.influences.f6e868f3bd'),
          ),
          f(
            sourceMessage('copy.influences.138f5a1900'),
            sourceMessage('copy.influences.c4c0405302'),
          ),
          f(
            sourceMessage('copy.influences.fc9f107c29'),
            sourceMessage('copy.influences.f83a2b83a5'),
          ),
          f(
            sourceMessage('copy.influences.9a1699bec9'),
            sourceMessage('copy.influences.c35453720c'),
          ),
        ],
        src('owner', 'businessChance', 'stakeAmount', 'settle'),
        [
          link('owner-fortune', sourceMessage('copy.influences.d8ca4931da')),
          link('owner-bankruptcy', sourceMessage('copy.influences.e3d69eaf0f')),
        ],
        [sourceMessage('copy.influences.b9e67219c7')],
      ),
      o(
        'owner-injection',
        sourceMessage('copy.influences.9d5141a0c8'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.50207e2ffc'),
        [
          direct(
            sourceMessage('copy.influences.e3ca80e997'),
            sourceMessage('copy.influences.a9f883d7af'),
          ),
          f(
            sourceMessage('copy.influences.5f80481e92'),
            sourceMessage('copy.influences.8d242a6e42'),
          ),
          f(
            sourceMessage('copy.influences.a6c5ac4642'),
            sourceMessage('copy.influences.0659d8b2e1'),
          ),
          f(
            sourceMessage('copy.influences.03761d9258'),
            sourceMessage('copy.influences.9e4a17e581'),
          ),
        ],
        [...src('owner', 'inject', 'ffpRoom'), ...src('fan-mood', 'fanMoodInjection')],
        [
          link('cash-balance', sourceMessage('copy.influences.cd2b633a0e')),
          link('owner-fortune', sourceMessage('copy.influences.b52bd59350')),
          link('fan-mood', sourceMessage('copy.influences.674b922503')),
          link('auto-signing', sourceMessage('copy.influences.f5a218ced3')),
        ],
        [sourceMessage('copy.influences.2778d807a4')],
      ),
      o(
        'owner-dividend',
        sourceMessage('copy.influences.c68e86d2f5'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.d0853a60c8'),
        [
          direct(
            sourceMessage('copy.influences.9ecab69458'),
            sourceMessage('copy.influences.d4ed8b9bad'),
          ),
          f(
            sourceMessage('copy.influences.ecb9349fe4'),
            sourceMessage('copy.influences.fdbb7bf2e9'),
          ),
          f(
            sourceMessage('copy.influences.fe0d2821eb'),
            sourceMessage('copy.influences.56fd1e41f8'),
          ),
          f(
            sourceMessage('copy.influences.dc0e47f0a2'),
            sourceMessage('copy.influences.adb8a9b331'),
          ),
        ],
        [...src('owner', 'payDividend'), ...src('fan-mood', 'fanMoodDividend')],
        [
          link('owner-fortune', sourceMessage('copy.influences.2fcda61878')),
          link('cash-balance', sourceMessage('copy.influences.2563c50ece')),
          link('fan-mood', sourceMessage('copy.influences.32693a5e9f')),
        ],
      ),
      o(
        'owner-bankruptcy',
        sourceMessage('copy.influences.519120db91'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.a8bd94ce23'),
        [
          f(
            sourceMessage('copy.influences.f18c4dee65'),
            sourceMessage('copy.influences.16eca6fdb0'),
          ),
          f(
            sourceMessage('copy.influences.2c1a57e4fb'),
            sourceMessage('copy.influences.607c06310d'),
          ),
          direct(
            sourceMessage('copy.influences.e66f73e255'),
            sourceMessage('copy.influences.dffc51e497'),
          ),
          f(
            sourceMessage('copy.influences.fb948546b9'),
            sourceMessage('copy.influences.9b9f52d5e8'),
          ),
        ],
        src('owner', 'livingCost', 'settle', 'ownerClose'),
        [link('career-end', sourceMessage('copy.influences.f1eb3101a6'))],
      ),
      o(
        'fan-mood',
        sourceMessage('copy.influences.b450e0cf15'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.f6408dfbbf'),
        [
          f(
            sourceMessage('copy.influences.59b8a8117a'),
            sourceMessage('copy.influences.e7981edc03'),
          ),
          direct(
            sourceMessage('copy.influences.185957bb5d'),
            sourceMessage('copy.influences.c77b783b59'),
          ),
          direct(
            sourceMessage('copy.influences.b16bea91ae'),
            sourceMessage('copy.influences.6905b4bb19'),
          ),
          direct(
            sourceMessage('copy.influences.641340ac14'),
            sourceMessage('copy.influences.f117c25454'),
          ),
          f(
            sourceMessage('copy.influences.822dbe3a6c'),
            sourceMessage('copy.influences.0b1416d82b'),
          ),
        ],
        src(
          'fan-mood',
          'fanMoodAfterLeagueMatch',
          'fanMoodClose',
          'fanMoodTransfer',
          'fanMoodIdentity',
          'move',
        ),
        [link('owner-exit', sourceMessage('copy.influences.1c77955c38'))],
        [sourceMessage('copy.influences.f0f1753e69')],
      ),
      o(
        'owner-exit',
        sourceMessage('copy.influences.53b926665d'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.f2521d6fb6'),
        [
          f(
            sourceMessage('copy.influences.e930a76748'),
            sourceMessage('copy.influences.26de745ebe'),
          ),
          f(
            sourceMessage('copy.influences.2cc02ac7ee'),
            sourceMessage('copy.influences.9eda3def0a'),
          ),
          direct(
            sourceMessage('copy.influences.7435b426d4'),
            sourceMessage('copy.influences.65be894657'),
          ),
        ],
        src('fan-mood', 'fanMoodRound'),
        [link('career-end', sourceMessage('copy.influences.6f1447edde'))],
      ),
      o(
        'owner-traits',
        sourceMessage('copy.influences.38ab443a8d'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.0c066650e8'),
        [
          f(
            sourceMessage('copy.influences.d52b77e5d1'),
            sourceMessage('copy.influences.be865ad3b2'),
            [],
            sourceMessage('copy.influences.a88bb369fc'),
          ),
          f(
            sourceMessage('copy.influences.e79c26d378'),
            sourceMessage('copy.influences.d89f4779a8'),
            [],
            sourceMessage('copy.influences.a88bb369fc'),
          ),
          f(
            sourceMessage('copy.influences.9f6cf92605'),
            sourceMessage('copy.influences.258e1094ca'),
            [],
            sourceMessage('copy.influences.a88bb369fc'),
          ),
        ],
        src('owner-config', 'OWNER_TRAITS'),
        [
          link('wage-demand', sourceMessage('copy.influences.280a6bcba4')),
          link('business-result', sourceMessage('copy.influences.52942abea7')),
          link('sponsor-value', sourceMessage('copy.influences.f6b226ba14')),
          link('academy-intake', sourceMessage('copy.influences.ec1191bb5e')),
        ],
      ),
    ],
  },
  {
    id: 'world',
    title: sourceMessage('copy.influences.5b7e3a9fcf'),
    description: sourceMessage('copy.influences.3862c09e6c'),
    outcomes: [
      o(
        'league-finish',
        sourceMessage('copy.influences.c6162f0aa4'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.b1e76a8b39'),
        [
          f(
            sourceMessage('copy.influences.089e49a334'),
            sourceMessage('copy.influences.16ad7e7c98'),
          ),
          f(
            sourceMessage('copy.influences.00f77fe33d'),
            sourceMessage('copy.influences.7b6cf949ec'),
          ),
          f(
            sourceMessage('copy.influences.5b27270850'),
            sourceMessage('copy.influences.d8e5329724'),
          ),
        ],
        [...src('league-fixtures', 'ranked'), ...src('season', 'closeSeason')],
        [
          link('reputation', sourceMessage('copy.influences.65c2cfac4a')),
          link('contract-clauses', sourceMessage('copy.influences.e973767a3b')),
          link('prize-money', sourceMessage('copy.influences.ef72cd8902')),
          link('fan-mood', sourceMessage('copy.influences.3831fe3276')),
        ],
      ),
      o(
        'european-entry',
        sourceMessage('copy.influences.da51457aba'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.8a31868191'),
        [
          f(
            sourceMessage('copy.influences.daed59cff1'),
            sourceMessage('copy.influences.3dba781a64'),
          ),
          f(
            sourceMessage('copy.influences.3706373563'),
            sourceMessage('copy.influences.25d26b150e'),
          ),
          f(
            sourceMessage('copy.influences.8b83309a1f'),
            sourceMessage('copy.influences.c848aac9dd'),
          ),
        ],
        [
          ...src('europe-access', 'europeanAccess', 'associationAccessOrder'),
          ...src('europe-coefficients', 'associationCoefficients'),
        ],
        [
          link('prize-money', sourceMessage('copy.influences.3389c587b7')),
          link('match-fatigue', sourceMessage('copy.influences.a9ce453b73')),
        ],
      ),
      o(
        'prize-money',
        sourceMessage('copy.influences.408a5c2f2c'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.2f07d2eba9'),
        [
          f(
            sourceMessage('copy.influences.49f9d66269'),
            sourceMessage('copy.influences.f37d932fbe'),
          ),
          f(
            sourceMessage('copy.influences.e38e3287d7'),
            sourceMessage('copy.influences.3fab8d869c'),
          ),
          f(
            sourceMessage('copy.influences.0e01758512'),
            sourceMessage('copy.influences.4bcab5a026'),
          ),
        ],
        src('finance', 'leagueShare', 'leagueMerit', 'parachutePayment', 'matchBonus'),
        [link('cash-balance', sourceMessage('copy.influences.76113ab69d'))],
      ),
      o(
        'historical-economy',
        sourceMessage('copy.influences.5c1e626b4a'),
        sourceMessage('copy.influences.855031644f'),
        sourceMessage('copy.influences.0819bd2cc6'),
        [
          f(
            sourceMessage('copy.influences.9c0eccd6a6'),
            sourceMessage('copy.influences.e14cc68e8f'),
          ),
          f(
            sourceMessage('copy.influences.3873f257d0'),
            sourceMessage('copy.influences.3a2baed38e'),
          ),
          f(
            sourceMessage('copy.influences.08ee9a93b6'),
            sourceMessage('copy.influences.218e23a95e'),
          ),
          f(
            sourceMessage('copy.influences.7c5ffaf641'),
            sourceMessage('copy.influences.f7e16504ab'),
          ),
        ],
        [
          ...src('economy', 'advanceEconomy'),
          ...src('quotes', 'footballQuote', 'quote'),
          ...src('registration', 'registration'),
        ],
        [
          link('wage-demand', sourceMessage('copy.influences.488e6130f7')),
          link('owner-injection', sourceMessage('copy.influences.d1cc8d2916')),
          link('signing-completion', sourceMessage('copy.influences.37147f7020')),
        ],
      ),
      o(
        'world-evolution',
        sourceMessage('copy.influences.362e156ec0'),
        sourceMessage('copy.influences.596bfc741f'),
        sourceMessage('copy.influences.e6f8512aa0'),
        [
          f(
            sourceMessage('copy.influences.7897c84fb0'),
            sourceMessage('copy.influences.0449b55136'),
          ),
          f(
            sourceMessage('copy.influences.a799e7ef8e'),
            sourceMessage('copy.influences.6905eea8e2'),
          ),
          f(
            sourceMessage('copy.influences.2310663dbf'),
            sourceMessage('copy.influences.600de29d69'),
          ),
          f(
            sourceMessage('influences.affordableSquad.name'),
            sourceMessage('influences.affordableSquad.effect'),
          ),
          f(
            sourceMessage('influences.competitionIncome.name'),
            sourceMessage('influences.competitionIncome.effect'),
          ),
        ],
        [
          ...src('dynamics', 'evolveClubs', 'successBonus', 'meansLevel'),
          ...src('adaptation', 'settleCohesion'),
          ...src('books', 'settleNpcBooks', 'bookCompetitionMoney'),
        ],
        [
          link('match-strength', sourceMessage('copy.influences.7fa3cab168')),
          link('takeover-price', sourceMessage('copy.influences.28ccffefdf')),
        ],
      ),
      o(
        'ballon-dor',
        sourceMessage('copy.influences.685bb54543'),
        sourceMessage('copy.influences.563601a7b9'),
        sourceMessage('copy.influences.4d2ed2ea8c'),
        [
          f(
            sourceMessage('copy.influences.c5bb2db6d6'),
            sourceMessage('copy.influences.0a61bb40ed'),
          ),
          f(
            sourceMessage('copy.influences.887de9d133'),
            sourceMessage('copy.influences.33f8a1f8d8'),
          ),
          f(
            sourceMessage('copy.influences.cc26392537'),
            sourceMessage('copy.influences.412e5d5ab9'),
          ),
        ],
        src('ballon-dor-award', 'ballonDorPodium'),
        [
          link('wage-demand', sourceMessage('copy.influences.6b42b48be5')),
          link('contract-clauses', sourceMessage('copy.influences.43687f6869')),
        ],
      ),
      o(
        'progression',
        sourceMessage('copy.influences.ba38e090a1'),
        sourceMessage('copy.influences.855031644f'),
        sourceMessage('copy.influences.79a3a3ab14'),
        [
          direct(
            sourceMessage('copy.influences.a9e66b18c6'),
            sourceMessage('copy.influences.e839e7bfd8'),
          ),
          f(
            sourceMessage('copy.influences.36a188d189'),
            sourceMessage('copy.influences.6a835c8070'),
          ),
          f(
            sourceMessage('copy.influences.13ea4e1429'),
            sourceMessage('copy.influences.4a554f7f7f'),
            [],
            sourceMessage('copy.influences.a88bb369fc'),
          ),
        ],
        [...src('season', 'advanceDays', 'advanceRound'), ...src('training', 'settleTraining')],
        [
          link('player-growth', sourceMessage('copy.influences.2aa443955f')),
          link('cash-balance', sourceMessage('copy.influences.61ac9e3a09')),
        ],
        [sourceMessage('copy.influences.f2b7ae835e')],
      ),
      o(
        'identity',
        sourceMessage('copy.influences.bb4258b6e0'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.a09c4ade63'),
        [
          direct(
            sourceMessage('copy.influences.fdd44b9de2'),
            sourceMessage('copy.influences.0089c11d1b'),
          ),
          direct(
            sourceMessage('copy.influences.5fb1d079a6'),
            sourceMessage('copy.influences.a64d3a0e22'),
          ),
          direct(
            sourceMessage('copy.influences.45c9c2ffc2'),
            sourceMessage('copy.influences.e4a7fa9505'),
          ),
        ],
        [
          ...src('design-studio', 'commissionDesign', 'redrawDesigns', 'adoptDesign'),
          ...src('identity-operations', 'chooseMatchKit'),
        ],
        [
          link('cash-balance', sourceMessage('copy.influences.6ef18ef864')),
          link('fan-mood', sourceMessage('copy.influences.2bd8600083')),
        ],
        [sourceMessage('copy.influences.1076fff16a')],
      ),
      o(
        'career-end',
        sourceMessage('copy.influences.983fdf16f5'),
        sourceMessage('copy.influences.462bf6b264'),
        sourceMessage('copy.influences.b97ce4bb6a'),
        [
          f(
            sourceMessage('copy.influences.376e14aa76'),
            sourceMessage('copy.influences.3c348b103f'),
          ),
          f(
            sourceMessage('copy.influences.78ad3bc9dc'),
            sourceMessage('copy.influences.dfb91abe87'),
          ),
          f(
            sourceMessage('copy.influences.453eef871d'),
            sourceMessage('copy.influences.7984de2f63'),
          ),
        ],
        [...src('owner', 'ownerClose'), ...src('fan-mood', 'fanMoodRound')],
        [],
        [sourceMessage('copy.influences.00a1666ce8')],
      ),
    ],
  },
];

const action = (
  id: string,
  title: string,
  control: Control,
  effects: Consequence[],
): PlayerAction => ({ id, title, control, effects });
export const PLAYER_ACTIONS: PlayerAction[] = [
  action(
    'raise-wage',
    sourceMessage('copy.influences.6c7e36a5b3'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('renewal-acceptance', sourceMessage('copy.influences.8408b7c312')),
      link('operating-cost', sourceMessage('copy.influences.2e5ff80ef0')),
      link('auto-signing', sourceMessage('copy.influences.256b196958')),
    ],
  ),
  action(
    'decline-contract',
    sourceMessage('copy.influences.39ad21d942'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('persuasion', sourceMessage('copy.influences.17d5e01d85')),
      link('unhappy', sourceMessage('copy.influences.5e00067f42')),
    ],
  ),
  action(
    'contract-term',
    sourceMessage('copy.influences.70e62e276d'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('contract-expiry', sourceMessage('copy.influences.97cdd5f22f')),
      link('operating-cost', sourceMessage('copy.influences.4a6007ea06')),
    ],
  ),
  action(
    'raise-fee',
    sourceMessage('copy.influences.54fb2ac507'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('bid-acceptance', sourceMessage('copy.influences.8275d6cf40')),
      link('cash-balance', sourceMessage('copy.influences.1db6b12cdc')),
    ],
  ),
  action(
    'counter-bid',
    sourceMessage('copy.influences.ecc61e2c0c'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('bid-counter', sourceMessage('copy.influences.80dc0af0ee')),
      link('signing-completion', sourceMessage('copy.influences.ac48bdf576')),
    ],
  ),
  action(
    'free-or-loan',
    sourceMessage('copy.influences.4833a6f2c8'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('free-agent', sourceMessage('copy.influences.4b4b5674f1')),
      link('operating-cost', sourceMessage('copy.influences.d41feaf7a1')),
    ],
  ),
  action(
    'sell-player',
    sourceMessage('copy.influences.27069eba04'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('cash-balance', sourceMessage('copy.influences.664e9cc6c7')),
      link('team-selection', sourceMessage('copy.influences.d32a2ebbbb')),
      link('fan-mood', sourceMessage('copy.influences.d52e282d13')),
    ],
  ),
  action(
    'reject-sale',
    sourceMessage('copy.influences.3086a8615d'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('unhappy', sourceMessage('copy.influences.c72d420209')),
      link('team-selection', sourceMessage('copy.influences.ab6b98afc6')),
    ],
  ),
  action(
    'transfer-stance',
    sourceMessage('copy.influences.101d470ab0'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('incoming-bids', sourceMessage('copy.influences.de24101b7c'))],
  ),
  action(
    'promote-youth',
    sourceMessage('copy.influences.761096c5ea'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('youth-promotion', sourceMessage('copy.influences.d4b57537e7')),
      link('operating-cost', sourceMessage('copy.influences.640004ffb2')),
    ],
  ),
  action(
    'hire-manager',
    sourceMessage('copy.influences.b5b5ed2f62'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('manager-hiring', sourceMessage('copy.influences.3a2b61eaa2')),
      link('adaptation', sourceMessage('copy.influences.10d8fc9982')),
    ],
  ),
  action(
    'hire-coach',
    sourceMessage('copy.influences.8e47d97197'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('staff-impact', sourceMessage('copy.influences.efe7a00cbf')),
      link('operating-cost', sourceMessage('copy.influences.bc9ed790ca')),
    ],
  ),
  action(
    'playing-coach',
    sourceMessage('copy.influences.a4ab535800'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('retirement', sourceMessage('copy.influences.d6061267af'))],
  ),
  action(
    'delegate-work',
    sourceMessage('copy.influences.69e0d70f21'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('delegation', sourceMessage('copy.influences.14e2865357')),
      link('auto-renewal', sourceMessage('copy.influences.b78d2c389d')),
      link('auto-signing', sourceMessage('copy.influences.00d84ab911')),
    ],
  ),
  action(
    'mediate',
    sourceMessage('copy.influences.992e13fa9a'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('mediation', sourceMessage('copy.influences.d123adb2da')),
      link('promise-result', sourceMessage('copy.influences.37ec55f236')),
    ],
  ),
  action(
    'approvals',
    sourceMessage('copy.influences.c3b6b248b8'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('overdue-approvals', sourceMessage('copy.influences.89512d992e'))],
  ),
  action(
    'sign-sponsor',
    sourceMessage('copy.influences.8c2dc575b7'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('sponsor-deal', sourceMessage('copy.influences.b37a333433'))],
  ),
  action(
    'inject-money',
    sourceMessage('copy.influences.acbd262b95'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('owner-injection', sourceMessage('copy.influences.79206d24d3')),
      link('fan-mood', sourceMessage('copy.influences.b258995da5')),
    ],
  ),
  action(
    'business-stake',
    sourceMessage('copy.influences.1771816e05'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('business-result', sourceMessage('copy.influences.3268a3e890'))],
  ),
  action(
    'take-dividend',
    sourceMessage('copy.influences.d63dae01fa'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('owner-dividend', sourceMessage('copy.influences.63eae3626d')),
      link('fan-mood', sourceMessage('copy.influences.4455f2c622')),
    ],
  ),
  action(
    'design',
    sourceMessage('copy.influences.72dae066f0'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('identity', sourceMessage('copy.influences.892a13a051'))],
  ),
  action(
    'advance-time',
    sourceMessage('copy.influences.9940cc061e'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('progression', sourceMessage('copy.influences.3fff6d82c7'))],
  ),
  action(
    'start-choices',
    sourceMessage('copy.influences.c226b60d25'),
    sourceMessage('copy.influences.a88bb369fc'),
    [
      link('owner-fortune', sourceMessage('copy.influences.dbbe790c64')),
      link('owner-traits', sourceMessage('copy.influences.aeaeca0651')),
      link('world-evolution', sourceMessage('copy.influences.0adc54e096')),
    ],
  ),
  action(
    'tactics-lineup',
    sourceMessage('copy.influences.359906692b'),
    sourceMessage('copy.influences.856c359b42'),
    [
      link('team-selection', sourceMessage('copy.influences.8dc9bcb169')),
      link('tactical-play', sourceMessage('copy.influences.678adbbeb7')),
    ],
  ),
  action(
    'training-control',
    sourceMessage('copy.influences.b8afec2126'),
    sourceMessage('copy.influences.856c359b42'),
    [link('training-focus', sourceMessage('copy.influences.bb04858740'))],
  ),
  action(
    'direction-control',
    sourceMessage('copy.influences.a8da6d84b4'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('wage-demand', sourceMessage('copy.influences.fc04c47a92')),
      link('gate-income', sourceMessage('copy.influences.5532723898')),
      link('auto-signing', sourceMessage('copy.influences.574ce33bdb')),
    ],
  ),
  action(
    'decision-guidelines',
    sourceMessage('copy.influences.ec4ef1fcd4'),
    sourceMessage('copy.influences.636b022e8b'),
    [
      link('manager-hiring', sourceMessage('copy.influences.0db0ae72e2')),
      link('auto-renewal', sourceMessage('copy.influences.5fb843e35f')),
      link('auto-signing', sourceMessage('copy.influences.1c4ff67ec8')),
      link('incoming-bids', sourceMessage('copy.influences.2922b90a1b')),
      link('youth-promotion', sourceMessage('copy.influences.d6d5b42828')),
    ],
  ),
  action(
    'facility-work',
    sourceMessage('copy.influences.eb44aac1a2'),
    sourceMessage('copy.influences.636b022e8b'),
    [link('facilities', sourceMessage('copy.influences.2e6410b0a0'))],
  ),
];
