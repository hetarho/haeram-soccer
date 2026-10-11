# STAFF Manager demands and personality
> r10 | Define the implemented browser-demo behavior for manager demands and personality.

## decisions
- STAFF-1 [o] Manager offers show ability, development (육성: growth of players under 27), philosophy, flexibility, pride, selection trait (or none), salary and term; hiring charges disclosed costs.
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
- STAFF-12 [o] Hired managers may carry a selection trait: youth (+4 selection value for age ≤ 21), rotation (fatigue weighs double) or stable (fatigue weighs half). The founding manager has none; a developer style (→STAFF-14) selects like the youth trait, so a developer never draws it, a firefighter's youth draw becomes stable and a gegenpress coach's stable draw becomes rotation.
- STAFF-13 [o] Training choice, academy promotion/release, answers to other clubs' offers, the main sponsor (→ECON-21) and coach hiring (→STAFF-15) can be delegated to the staff; new clubs delegate training and the academy and decide offers and sponsors themselves (→WEB-45 level 2); any explicit owner choice takes that decision back, and delegation can be restored. Delegated decisions are reported in the inbox.
  - a delegated youth director promotes nobody while cash is below one year of operating costs and reports the deferral. ← every promotion adds a first-team wage
  - releasing a coach takes coach hiring back, so the staff do not refill the post at once.

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
  - candidates fit their school: youth/flexibility/pride bands positional 50–80/15–45/60–95, gegenpress 55–85/25–55/45–80 (ages 34–58), counter 40–65/45–80/50–90, organizer 40–65/25–55/40–75, motivator 45–75/50–85/35–70, developer 70–90/40–75/25–60, firefighter 35–55/55–90/45–80 with level 55–85 and ages 50–64 (a veteran at or past his prime, OVR = POT), data head coach 50–80/60–90/25–50 (ages 32–48); other levels 45–85. The draws keep their order, so names, ids and philosophies stay put; the founding manager and interims are unbanded.
  - a three-season manager renews himself at the close as before; the firefighter signs to the end of the current season and leaves at the close (interim, departure choice) unless renewed: renew-manager is allowed while he is not interim and his contract ends by next season, at quote(120 + ability) a year with a 10% fee, one season at a time. On 1 April the owner is reminded (연봉 · 계약금 · 1시즌); with coach hiring delegated the staff renew him when the club can afford it and report it. The reminder settles when he renews, leaves or is replaced.
  - the founding manager and an interim have no style and are exactly neutral; effects apply to the own club only, in the same profile the pre-match laboratory reads (→MATCH-9).

- STAFF-15 [o] Coaching investment per department: the owner only chooses how much quality each department buys (절약 volunteers, 균형 the 55–78 band, 최고 the 65–90 band; absent is 균형); with hiring delegated the staff renew and hire to it, so no department is left empty. ← the owner decides the budget, not every contract
  - only with coach hiring delegated (intervention level 4) do the dials show and act; at levels 1–3 the owner hires, renews and replaces coaches personally
  - raising a dial while delegated replaces that department's vacancy or volunteer at once when affordable; a contracted coach is compared at his contract's end
  - a 1.9 club-wide level loads as that level in every department
  - the 균형 and 최고 bands are the level a coach reaches (→STAFF-16); a young one in the band starts below it
  | level | label | hires |
  |---|---|---|
  | 1 | 절약 | unpaid ability-50 volunteers |
  | 2 (default) | 균형 | the mid-market candidate (55–78) |
  | 3 | 최고 | the best candidate (65–90), else the mid one |
  - delegated, at the season boundary: an expiring paid coach is renewed (fee 10% of the going wage, two more seasons) when his ability is within 3 of the planned hire and the club can afford it; otherwise the planned hire replaces him; volunteers are upgraded to the plan; a vacancy is filled at once (daily).
  - affordability: cash after the fee still covers 13 rounds (the cash warning) of costs with the new wage; failing that the next cheaper band, then a volunteer.
  - not delegated: on 1 April a renewal-season inbox item (kind staff-renewal; stops the clock at intervention levels 1–3 →WEB-45) lists coaches whose contracts end at the close; the owner renews (going wage, 10% fee), replaces, or hands hiring to the staff. Unrenewed coaches leave at the close with a staff-renewal vacancy item.
  - the delegated staff report one summary of renewals and hires.

- STAFF-16 [o] Managers and coaches have an age and a ceiling (potential): one younger than his prime starts 0.7 a year below the level drawn for him and can reach up to 1.1 a year above it; each season he closes 15–40% of the gap; from 60 he loses 0–2 a season with his ceiling. ← trusting a young manager or coach should be a real bet on growth
  | | hired at | prime | other |
  |---|---|---|---|
  | manager | 32–64 | 46 | retires at 70; a young candidate asks 3 less wage per point he is still short |
  | coach | 25–62 | 42 | wage follows his current ability |
  - the founding manager and an interim keep the drawn level (an interim never grows); volunteers and people from older saves have no age or ceiling and stay put
  - growth is reported as manager-growth and staff-growth events; OVR (ability) and POT (ceiling) show on every manager and coach (→WEB-55)
## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r10 261012 STAFF-1✎ ambition→selection trait, 육성 wording; STAFF-12✎ +trait remaps per school; STAFF-14✎ +attribute and age bands per school, the firefighter leaves at the close unless renewed season by season (1 April reminder, delegated renewal)
- r9 261012 STAFF-15✎ bands are the level reached; STAFF-16+ ages, ceilings, growth to 60, decline after, managers retire at 70
- r8 261011 STAFF-15✎ one club-wide coaching level→one dial per department, shown and acted on only with coach hiring delegated; a raised dial fills a volunteer post at once
- r7 261011 STAFF-13✎ four delegable decisions→five with coach hiring, a released coach takes hiring back; STAFF-15+ coaching investment levels, delegated renewals and hires without vacancies, spring renewal season
- r6 261010 STAFF-12✎ +developer style selects youth; STAFF-14+ eight manager styles with tactic, effects and contract terms
- r5 261009 STAFF-13✎ three delegable decisions→four with the main sponsor; delegated promotions wait while cash is under a year of costs
- r4 261009 STAFF-13✎ all three delegated by default→training and academy delegated, transfer answers by the owner
- r3 261008 STAFF-11+ STAFF-12+ STAFF-13+ manager-only staff→seven coaching departments with traits, manager selection traits and owner delegation
- r2 261008 STAFF-9+ STAFF-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r1 261007 initial
