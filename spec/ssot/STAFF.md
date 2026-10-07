# STAFF Manager demands and personality
> r2 | Define the implemented browser-demo behavior for manager demands and personality.

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

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r2 261008 STAFF-9+ STAFF-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r1 261007 initial
