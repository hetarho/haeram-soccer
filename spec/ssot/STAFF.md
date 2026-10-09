# STAFF Manager demands and personality
> r6 | Define the implemented browser-demo behavior for manager demands and personality.

## decisions
- STAFF-1 [o] Manager offers show ability, development, philosophy, flexibility, pride, ambition, salary and term; hiring charges disclosed costs.
- STAFF-2 [o] Owner tactical requests specify possession/balanced/counter/pressing and a tone: respectful, evidence, support, or demand.
- STAFF-3 [o] Response score combines flexibility and trust, philosophy mismatch, tone, pride, and prior conflicts; seeded response may accept, reluctantly accept, condition, or refuse.
- STAFF-4 [o] Only accepted/reluctantly accepted requests change applied tactics; conditional requests require visible support acceptance.
- STAFF-5 [o] Repeated strong interference reduces trust and increases conflicts; a proud manager at trust <=25 may resign after accumulated conflict or a severe ultimatum.
- STAFF-6 [o] Display accepted tactic, pending/refused demand, trust and dissatisfaction signals separately. Repeated identical requests do not farm trust.
- STAFF-7 [o] Resignation stops unattended simulation, appoints a basic interim, preserves tenure and departure facts, and lets the owner hire a successor.
- STAFF-8 [o] All reactions and explanations follow actual state; manager speech never claims an unperformed transfer or tactic change.

- STAFF-9 [o] A manager answers each tactic/tone combination at most once per season-round; changing tones cannot reroll a previous response or farm positive trust. Positive trust from accepted requests or conditional support is awarded at most once per manager per season-round; older saves start with empty bounded request history.

- STAFF-10 [o] Before requesting tactics, show the manager philosophy, trust, likely response range and strong-demand trust cost. A forecast is not a guarantee; display the actual response and applied tactic separately.

- STAFF-11 [o] Seven coaching departments sit below the manager: assistant (passing growth, training choice), attack, defense, goalkeeping, fitness (stamina, recovery), youth director (academy intake and growth) and chief scout (market size, potential, negotiation). ← real club structure; each department owns a visible effect
  - effect multiplier 1 + (ability − 50)/200 within 0.85–1.25; traits: developer (age ≤ 21 growth), specialist (department skill ×1.15), recovery (+2 fatigue recovery), spotter (higher potential found), negotiator (lower fees, better acceptance)
  - absent staff (older saves) and ability-50 trait-less members are exactly neutral; a vacant department is worse than neutral
  - new clubs start with unpaid ability-50 volunteers; hired coaches cost wages plus a signing fee; replacing or releasing a paid coach pays 25% of the annual wage
- STAFF-12 [o] Hired managers may carry a selection trait: youth (+4 selection value for age ≤ 21), rotation (fatigue weighs double) or stable (fatigue weighs half). The founding manager has none; a developer style (→STAFF-14) selects like the youth trait.
- STAFF-13 [o] Training choice, academy promotion/release, answers to other clubs' offers and the main sponsor (→ECON-21) can be delegated to the staff; new clubs delegate training and the academy and decide offers and sponsors themselves (→WEB-45 level 2); any explicit owner choice takes that decision back, and delegation can be restored. Delegated decisions are reported in the inbox.
  - a delegated youth director promotes nobody while cash is below one year of operating costs and reports the deferral. ← every promotion adds a first-team wage

- STAFF-14 [o] Every hire candidate belongs to a school of football; the four candidates of a season show four different schools from a seeded order of all eight, drawn from their own stream so the other attributes stay put. ← choosing a manager is choosing how the club plays and grows, with a clear price
  | style | tactic | effects |
  |---|---|---|
  | 포지셔널 플레이 | possession | pass +2, possession +2, shots −0.5 points; opponent build-up −1 point; tactic requests −6 |
  | 게겐프레싱 | press | shots +0.8; opponent build-up −3 points; in-match drain ×1.1; fatigue +1 per match |
  | 실리 역습 | counter | opponent chances −1.2, possession −2, shots +0.3; opponent final-third passes −1.5 points |
  | 수비 조직가 | balanced | opponent chances −1.8, shots −0.8; opponent final-third passes −1 point |
  | 동기부여형 | own | morale baseline +6, defeats cost 2 less, squad meetings work 20 points more often |
  | 육성형 | own | growth of players aged ≤ 21 ×1.3; selects them like the youth trait |
  | 소방수 | own | strength +1.5, morale baseline +3, morale +10 on arrival; growth ×0.85; one-season contract |
  | 데이터 헤드코치 | own | tactic requests +15, bid acceptance +5 points; morale baseline −2 |
  - a style with a tactic sets the manager's philosophy; contract terms are 3 seasons except the firefighter's 1.
  - the founding manager and an interim have no style and are exactly neutral; effects apply to the own club only, in the same profile the pre-match laboratory reads (→MATCH-9).

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r6 261010 STAFF-12✎ +developer style selects youth; STAFF-14+ eight manager styles with tactic, effects and contract terms
- r5 261009 STAFF-13✎ three delegable decisions→four with the main sponsor; delegated promotions wait while cash is under a year of costs
- r4 261009 STAFF-13✎ all three delegated by default→training and academy delegated, transfer answers by the owner
- r3 261008 STAFF-11+ STAFF-12+ STAFF-13+ manager-only staff→seven coaching departments with traits, manager selection traits and owner delegation
- r2 261008 STAFF-9+ STAFF-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r1 261007 initial
