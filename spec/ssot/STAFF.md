# STAFF Manager demands and personality
> r5 | Define the implemented browser-demo behavior for manager demands and personality.

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
- STAFF-12 [o] Hired managers may carry a selection trait: youth (+4 selection value for age ≤ 21), rotation (fatigue weighs double) or stable (fatigue weighs half). The founding manager has none.
- STAFF-13 [o] Training choice, academy promotion/release, answers to other clubs' offers and the main sponsor (→ECON-21) can be delegated to the staff; new clubs delegate training and the academy and decide offers and sponsors themselves (→WEB-45 level 2); any explicit owner choice takes that decision back, and delegation can be restored. Delegated decisions are reported in the inbox.
  - a delegated youth director promotes nobody while cash is below one year of operating costs and reports the deferral. ← every promotion adds a first-team wage

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r5 261009 STAFF-13✎ three delegable decisions→four with the main sponsor; delegated promotions wait while cash is under a year of costs
- r4 261009 STAFF-13✎ all three delegated by default→training and academy delegated, transfer answers by the owner
- r3 261008 STAFF-11+ STAFF-12+ STAFF-13+ manager-only staff→seven coaching departments with traits, manager selection traits and owner delegation
- r2 261008 STAFF-9+ STAFF-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r1 261007 initial
