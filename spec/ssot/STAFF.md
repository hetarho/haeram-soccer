# STAFF Manager demands and personality
> r15 | Define the implemented browser-demo behavior for manager demands and personality.

## decisions
- STAFF-1 [o] Manager offers show ability, development (육성: growth of players under 27), philosophy, flexibility, pride, selection trait (or none), salary and term; hiring charges disclosed costs.
- STAFF-2 [o] Owner tactical requests specify possession/balanced/counter/pressing and a tone: respectful, evidence, support, or demand.
- STAFF-3 [o] Response score combines flexibility and trust, philosophy mismatch, tone, pride, and prior conflicts; seeded response may accept, reluctantly accept, condition, or refuse.
- STAFF-4 [o] Only accepted/reluctantly accepted requests change applied tactics; conditional requests require visible support acceptance.
- STAFF-5 [o] Repeated strong interference reduces trust and increases conflicts; a proud manager at trust <=25 may resign after accumulated conflict or a severe ultimatum.
- STAFF-6 [o] Display accepted tactic, pending/refused demand, trust and dissatisfaction signals separately. Repeated identical requests do not farm trust.
- STAFF-7 [o] Resignation appoints a basic interim and preserves tenure and departure facts; with the manager post delegated (→STAFF-18) the staff appoint a successor at once and the clock runs on, otherwise it stops unattended simulation and the owner hires a successor.
- STAFF-8 [o] All reactions and explanations follow actual state; manager speech never claims an unperformed transfer or tactic change.

- STAFF-9 [o] A manager answers each tactic/tone combination at most once per season-round; changing tones cannot reroll a previous response or farm positive trust. Positive trust from accepted requests or conditional support is awarded at most once per manager per season-round; older saves start with empty bounded request history.

- STAFF-10 [o] Before requesting tactics, show the manager philosophy, trust, likely response range and strong-demand trust cost. A forecast is not a guarantee; display the actual response and applied tactic separately.

- STAFF-11 [o] Seven coaching departments sit below the manager: assistant (passing growth, training choice), attack, defense, goalkeeping, fitness (stamina, recovery), youth director (academy intake and growth) and chief scout (market size, potential, negotiation). ← real club structure; each department owns a visible effect
  - effect multiplier 1 + (ability − 50)/200 within 0.85–1.25; traits: developer (age ≤ 21 growth), specialist (department skill ×1.15), recovery (+2 fatigue recovery), spotter (higher potential found), negotiator (lower fees, better acceptance)
  - absent staff (older saves) and ability-50 trait-less members are exactly neutral; a vacant department is worse than neutral
  - new clubs start with unpaid ability-50 volunteers; hired coaches cost a wage fixed for a term of 1–5 seasons the owner chooses (delegated staff: the department's criteria, →STAFF-15) plus a signing fee; replacing or releasing a paid coach or manager pays 25% of the annual wage for each season left on his contract
- STAFF-12 [o] Hired managers may carry a selection trait: youth (+4 selection value for age ≤ 21), rotation (fatigue weighs double) or stable (fatigue weighs half). The founding manager has none; a developer style (→STAFF-14) selects like the youth trait, so a developer never draws it, a firefighter's youth draw becomes stable and a gegenpress coach's stable draw becomes rotation.
- STAFF-13 [o] The staff take these decisions for the owner exactly when the intervention level delegates them (→WEB-45), never by a switch of their own: academy promotion and release, contract talks (→CLUB-26), answers to other clubs' offers (→CLUB-18), sponsors (→ECON-21), the coaching departments' hiring and renewal (→STAFF-15) and the manager post (→STAFF-18). New clubs start at level 2: the staff take the academy and contract talks, the owner the rest. Delegated decisions are reported in the inbox. The training focus of the first team and the academy is never among them: the coaches always set it (→CLUB-13, →CLUB-31).
  - only the level changes who decides. At any level the owner may still promote or release a prospect, offer or decline in a pending contract talk, answer a bid, sign a sponsor, and hire, renew or release staff himself; none of these changes delegation, so a delegated department fills a post the owner empties by its criteria.
  - a delegated youth director promotes a prospect of promotion age (→CLUB-16) who matches the weakest first-teamer of his role or its starters minus 10 while the squad and the role have room, and releases a prospect turning 19 unpromoted whose potential is below the weakest first-teamer of his role, keeping the rest in U-21 until they are ready or turn 21; he promotes nobody while cash is below one year of operating costs and reports the deferral. ← every promotion adds a first-team wage

- STAFF-14 [o] Every hire candidate belongs to a school of football; new free agents (→STAFF-17) take their schools in turn from a seeded order of all eight per season, drawn from their own stream so the other attributes stay put. ← choosing a manager is choosing how the club plays and grows, with a clear price
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
  - a style with a tactic sets the manager's philosophy; the owner chooses a term of 1–5 seasons when hiring or renewing, never past the manager's 70th year, and the firefighter signs for 1; the wage is fixed for the term.
  - candidates fit their school: youth/flexibility/pride bands positional 50–80/15–45/60–95, gegenpress 55–85/25–55/45–80 (ages 34–58), counter 40–65/45–80/50–90, organizer 40–65/25–55/40–75, motivator 45–75/50–85/35–70, developer 70–90/40–75/25–60, firefighter 35–55/55–90/45–80 with level 55–85 and ages 50–64 (a veteran at or past his prime, OVR = POT), data head coach 50–80/60–90/25–50 (ages 32–48); other levels 45–85. The draws keep their order, so names, ids and philosophies stay put; the founding manager and interims are unbanded.
  - no manager renews himself: on 1 April the owner is reminded of a contract ending at the close (연봉 · 계약금 · term) and may renew while the manager is not interim, at quote(120 + ability) a year with a 10% fee, for 1–5 seasons (the firefighter 1); with the manager post delegated the staff decide (→STAFF-18); an unrenewed manager leaves at the close (interim, departure choice). The reminder settles when he renews, leaves or is replaced.
  - the founding manager and an interim have no style and are exactly neutral; effects apply to the own club only, in the same profile the pre-match laboratory reads (→MATCH-9).

- STAFF-15 [o] The coaching departments are run by the owner or, when the intervention level delegates them (level 4 →WEB-45), by the staff under each department's hiring criteria, which the owner sets at any level. ← the owner decides what a good hire is, not every contract
  | criterion | values | default |
  |---|---|---|
  | 자원봉사로 운영 | on: an unpaid ability-50 volunteer holds the post | off |
  | 최소 능력 | 0–99 | 55 |
  | 특성 | any, or one of the department's traits (→STAFF-11) | any |
  | 연봉 상한 | none, or the going wage of a coach of ability 50–90 in steps of 5, shown in today's money | none |
  | 우선 | 능력 높은 순, 연봉 낮은 순 | 연봉 낮은 순 |
  | 계약 기간 | 1–5 seasons | 2 |
  - a candidate (→STAFF-11, the season's three per department) matches when he meets every criterion and the club can afford him: cash after his fee still covers 13 rounds (the cash warning) of costs with his wage in place of the one he replaces.
  - delegated, a vacancy or a volunteer's post is filled at once by the first match in the chosen order, unless 자원봉사로 운영; with no match a volunteer holds it, the staff report it once and look again daily and when the season's candidates change.
  - delegated, at the season boundary an expiring paid coach who meets the criteria and is affordable is renewed (going wage, 10% fee, the criteria's term) unless a match beats him clearly: 3+ ability (능력 높은 순) or a wage 10%+ lower (연봉 낮은 순). One who no longer meets them is replaced by the first match, renewed when there is none and he is affordable, else a volunteer takes the post; with 자원봉사로 운영 a volunteer takes it.
  - changed criteria act at once only on a vacancy or a volunteer's post; a contracted coach is judged at his contract's end.
  - not delegated: on 1 April a renewal-season inbox item (kind staff-renewal; stops the clock at intervention levels 1–3 →WEB-45) lists coaches whose contracts end at the close; the owner renews (going wage fixed for a term of 1–5 seasons, 10% fee) or replaces. Unrenewed coaches leave at the close with a staff-renewal vacancy item.
  - the delegated staff report one summary of renewals and hires; each department shows whom its criteria would hire today.

- STAFF-16 [o] Managers and coaches have an age and a ceiling (potential): one younger than his prime starts 0.7 a year below the level drawn for him and can reach up to 1.1 a year above it; each season he closes 15–40% of the gap; from 60 he loses 0–2 a season with his ceiling. ← trusting a young manager or coach should be a real bet on growth
  | | hired at | prime | other |
  |---|---|---|---|
  | manager | 32–64 | 46 | retires at 70; a young candidate asks 3 less wage per point he is still short |
  | coach | 25–62 | 42 | wage follows his current ability |
  - the founding manager and an interim keep the drawn level (an interim never grows); volunteers and people from older saves have no age or ceiling and stay put
  - growth is reported as manager-growth and staff-growth events; OVR (ability) and POT (ceiling) show on every manager and coach (→WEB-55)
- STAFF-17 [o] Managers form a market that moves while the season runs (rules 1.13.0). ← a fixed list of four, still showing the man just hired, read as a menu rather than football
  - free agents (자유계약 감독): a pool of 4–8 kept in the world. Every 4 league rounds and at the season close, from a stream of its own so matches and other draws stay put: each free agent signs elsewhere with 25% and leaves; managers sacked in our league join; new free agents fill the pool to at least 4 (school order →STAFF-14, school bands →STAFF-14, levels 45–85).
  - every club has a named manager derived from the seed, the club and its count of managers; his level follows the club's strength (±8) inside his school's bands. A club in the bottom quarter of our league that lost 3 of its last 5 sacks its manager with 40% at a refresh, a relegated club at the close with 60%; the sacked manager joins the free agents, the club names its next one and the news reports it.
  - hiring a free agent costs his signing fee; hiring another club's manager also pays compensation (웃돈) of 1.5 × his annual wage, and that club names its next manager. Candidates from other clubs are the managers of our league and the division above, the eight best by level.
  - the manager the owner hires leaves the pool; the manager he replaces (not an interim) joins it; a hired candidate never shows as a candidate again while he is in charge.
  - the manager's 교체 action opens the market (→WEB-40): free agents first, then other clubs' managers with club, OVR/POT, school, wage, compensation and total, and says when the list next changes.
- STAFF-18 [o] With the manager post delegated the staff appoint and renew managers by the manager criteria the owner sets, and report every appointment, renewal and search that found nobody. ← owners who leave the club to run itself still need a manager in charge, of the kind they chose
  | criterion | values | default |
  |---|---|---|
  | 최소 OVR | 0–99 | 0 |
  | 학파 | any, or one or more of the eight schools (→STAFF-14) | any |
  | 최소 유연성 | 0–100 | 0 |
  | 최대 자존심 | 0–100 | 100 |
  | 최소 육성 | 0–100 | 0 |
  | 선발 성향 | any, or one or more of none, youth, rotation, stable (→STAFF-12) | any |
  | 연봉 상한 | none, or the going wage of a manager of OVR 50–90 in steps of 5, shown in today's money | none |
  | 우선 | OVR 높은 순, 잠재력 높은 순, 연봉 낮은 순 | OVR 높은 순 |
  | 계약 기간 | 1–5 seasons (the firefighter 1, never past his 70th year →STAFF-14) | 2 |
  | 다른 구단 감독 | free agents only, or other clubs' managers too, with compensation (→STAFF-17) | free agents only |
  | 맞는 후보가 없으면 | 기다림, or 가장 나은 후보: the best affordable free agent in the chosen order | 기다림 |
  - a candidate matches when he meets every criterion and the club can afford him: cash after his fee and any compensation still covers 13 rounds of costs with his wage in place of the current one (as →STAFF-15).
  - a vacancy (resignation, retirement, an unrenewed contract, the firefighter leaving) is filled at once by the first match; with none, 기다림 keeps the interim in charge without stopping the clock while the staff look again daily (the market moves every 4 league rounds →STAFF-17).
  - on 1 April an expiring manager who meets the criteria is renewed unless a match beats him clearly in the chosen order: 3+ OVR, 3+ potential or a wage 10%+ lower. One who does not meet them leaves at the close when a match exists and is renewed when none does.
  - 사람's 감독 tab shows who appoints at the current level, the criteria (editable at any level) and whom the staff would appoint today (→WEB-43); intervention level 4 delegates the post (→WEB-45).
- STAFF-19 [o] The owner reaches training only through its coaches, from their cards in 사람's 코치진 (→WEB-43): the assistant for the first team (→CLUB-13), the youth director for the academy (→CLUB-31). ← owners in real clubs interfere through people, and interference costs them coaches
  - 제안 (suggest) a focus for the next 4 settled rounds: the coach accepts with a chance stated before, 0.55, +0.3 when his rule picks it now, −0.25 when his rule calls for recovery (or 1군 준비) and the suggestion is something else, −(ability − 50)/200, within 0.1–0.95, drawn from the world's stream for that coach and round. Accepted, the focus holds 4 rounds; refused, nothing changes. One suggestion per coach every 2 settled rounds.
  - 강행 (force) a focus: it holds 4 settled rounds without asking, and the coach's strain this season rises by one; he then resigns with 15% × his strain (15%, 30%, 45%, at most 60%), stated before. A resignation leaves the post vacant like a release without compensation (→STAFF-11, →STAFF-15) and is reported; strain clears when a season starts. A volunteer never resigns.
  - while a suggestion or an order holds, the 훈련 tab and the coach's card name it with the rounds left; a new one replaces it.
## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r15 261013 STAFF-13✎ the training focus among delegated decisions→never delegated, the coaches always set it; staff release at 19→at 19 only below the first team, else kept until 21; STAFF-19+ owner suggestions and forced orders to the assistant and the youth director
- r14 261013 STAFF-13✎ a switch per decision in its home, owner choices taking a decision back (focus, talk answer, coach release)→the intervention level alone, owner actions never change delegation, the focus only the assistant's while delegated; STAFF-15✎ a switch per department→the level (4) for every department, criteria set at any level; STAFF-18✎ the 감독 tab's switch→who appoints at the level
- r13 261013 STAFF-11✎ delegated term 2→the criteria's; STAFF-13✎ one coach switch→one per department, +which owner choices take back, +the youth director's rule; STAFF-15✎ investment dial 절약/균형/최고→hiring criteria per department; STAFF-18✎ rule school/best/strategy→manager criteria (OVR, schools, flexibility, pride, youth work, trait, wage cap, order, term, poaching, no match)
- r12 261012 STAFF-7✎ resignation always stopping the clock→the staff appoint a successor when the post is delegated; STAFF-11✎ release 25% of the annual wage→25% for each season left, +coach terms 1–5; STAFF-13✎ +contract talks and the manager post, the main sponsor→sponsors; STAFF-14✎ terms 3 seasons (firefighter 1) and self-renewal→owner-chosen 1–5 seasons, no self-renewal; STAFF-15✎ +renewal term 1–5; STAFF-17✎ 감독 후보 tab→the manager's 교체 action; STAFF-18+ delegated manager appointment with an owner-chosen rule
- r11 261012 STAFF-14✎ four seasonal candidates→schools for new free agents; STAFF-17+ manager market: free-agent pool refreshed every 4 rounds and at the close, sackings in our league, named managers for every club, poaching with 1.5× wage compensation, hired manager leaves the list
- r10 261012 STAFF-1✎ ambition→selection trait, 육성 wording; STAFF-12✎ +trait remaps per school; STAFF-14✎ +attribute and age bands per school, the firefighter leaves at the close unless renewed season by season (1 April reminder, delegated renewal)
- r9 261012 STAFF-15✎ bands as the level at hire→bands as the level reached; STAFF-16+ ages, ceilings, growth to 60, decline after, managers retire at 70
- r8 261011 STAFF-15✎ one club-wide coaching level→one dial per department, shown and acted on only with coach hiring delegated; a raised dial fills a volunteer post at once
- r7 261011 STAFF-13✎ four delegable decisions→five with coach hiring, a released coach takes hiring back; STAFF-15+ coaching investment levels, delegated renewals and hires without vacancies, spring renewal season
- r6 261010 STAFF-12✎ none→a developer style selects youth; STAFF-14+ eight manager styles with tactic, effects and contract terms
- r5 261009 STAFF-13✎ three delegable decisions→four with the main sponsor; delegated promotions wait while cash is under a year of costs
- r4 261009 STAFF-13✎ all three delegated by default→training and academy delegated, transfer answers by the owner
- r3 261008 STAFF-11+ STAFF-12+ STAFF-13+ manager-only staff→seven coaching departments with traits, manager selection traits and owner delegation
- r2 261008 STAFF-9+ STAFF-10+ automatic-only selection→automatic or manual two-action preparation; last-request-only trust protection→bounded per-round negotiation history
- r1 261007 initial
