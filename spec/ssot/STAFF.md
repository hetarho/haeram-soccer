# STAFF Manager demands and personality
> r27 | Define the browser-demo rules for manager demands and personality.

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

- STAFF-11 [o] Seven coaching departments sit below the manager: assistant (training choice), attack, defense, goalkeeping, fitness (recovery), each scaling the growth of the attributes it owns (→PLAYER-15), youth director (academy intake and growth) and chief scout (market size and potential, the shortlist →CLUB-33); the 단장 sits beside them (→STAFF-20). ← real club structure; each department owns a visible effect
  - effect multiplier 1 + (ability − 50)/200 within 0.85–1.25; traits: developer (age ≤ 21 growth), specialist (department skill ×1.15), recovery (+2 fatigue recovery), spotter (higher potential found), negotiator (the 단장's: lower fees, better acceptance)
  - absent staff (older saves) and ability-50 trait-less members are exactly neutral; a vacant department is worse than neutral
  - new clubs start with unpaid ability-50 volunteers; hired coaches cost a wage fixed for a term of 1–5 seasons the owner chooses (delegated staff: 코치 기조's term, →STAFF-15) plus a signing fee; replacing or releasing a paid coach or manager pays 25% of the annual wage for each season left on his contract
- STAFF-12 [o] Hired managers may carry a selection trait: youth (+4 selection value for age ≤ 21), rotation (fatigue weighs double) or stable (fatigue weighs half). The founding manager has none; a developer style (→STAFF-14) selects like the youth trait, so a developer never draws it, a firefighter's youth draw becomes stable and a gegenpress coach's stable draw becomes rotation.
- STAFF-13 [o] Business decisions follow the seven independent responsibilities in →WEB-45. A delegated category follows its direction rows (→ECON-25) and existing financial checks (→ECON-33), and reports its decisions.
  - the director handles delegated player contracts, recruitment, sale responses and manager appointments; the youth director handles delegated academy promotion/release; commercial staff handle delegated sponsors; staff handle delegated staff appointments, including the director and scout.
  - recruitment and sales are separate authorities. Recruitment-owned mediation follows →CLUB-34; a direct category is never auto-decided merely because time progression is automatic.
  - new-game responsibility defaults are owned by →WEB-45. Training focus remains the coaches' decision at every configuration (→CLUB-13/31); suggestions and forced orders are →STAFF-19.
  - the owner may still promote/release a prospect, answer an available contract talk or bid, sign a sponsor, and hire/renew/release staff. Such an action never silently changes the category's responsibility; a delegated staff post can be refilled under 코치 기조.
  - a delegated youth director promotes a prospect of promotion age (→CLUB-16) who is ready by 데뷔 시점 (→CLUB-32), while the squad and line have room (→PLAYER-3), and releases by 육성 목표. Keep the rest in U-21 until ready or 21.
  - he promotes nobody below the 재정 기조 promotion floor (→ECON-33; a year of operating costs at 표준), and reports a deferral. ← every promotion adds a first-team wage

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

- STAFF-15 [o] The coaching departments are run by the owner or, when staff appointments are delegated (→WEB-45), by the staff under 코치 기조, a row of the 스태프 area (→ECON-25) the owner sets regardless of responsibility. ← the owner decides what a good hire is, not every contract
  | 코치 기조 | the staff hire |
  |---|---|
  | 자원봉사 | an unpaid ability-50 volunteer in every post |
  | 저비용 | ability 45+, the cheapest first, for 2 seasons |
  | 표준 (default) | ability 55+, the cheapest first, for 2 seasons |
  | 최고 수준 | ability 65+, the ablest first, for 3 seasons |
  - a candidate (→STAFF-11, the season's three generated candidates per department; former-player coaching entry is →STAFF-23/25/27) matches when he meets the option and the club can afford him: cash after his fee keeps the 재정 기조 runway (→ECON-33) with his wage in place of the one he replaces.
  - delegated, a vacancy or a volunteer's post is filled at once by the first match in the option's order, unless 자원봉사; with no match a volunteer holds it, the staff report it once and look again daily and when the season's candidates change.
  - delegated, at the season boundary an expiring paid coach who meets the option and is affordable is renewed (going wage, 10% fee, the option's term) unless a match beats him clearly: 3+ ability (the ablest first) or a wage 10%+ lower (the cheapest first). One who no longer meets it is replaced by the first match, renewed when there is none and he is affordable, else a volunteer takes the post; under 자원봉사 a volunteer takes it.
  - a changed 코치 기조 acts at once only on a vacancy or a volunteer's post; a contracted coach is judged at his contract's end.
  - not delegated: on 1 April a renewal-season inbox item (kind staff-renewal; stops for owner-held staff appointments →WEB-45) lists coaches whose contracts end at the close; the owner renews (going wage fixed for a term of 1–5 seasons, 10% fee) or replaces. Unrenewed coaches leave at the close with a staff-renewal vacancy item.
  - the delegated staff report one summary of renewals and hires; 코치진 shows whom 코치 기조 would hire today in each department.

- STAFF-16 [o] Managers and coaches have an age and a ceiling (potential): one younger than his prime starts 0.7 a year below the level drawn for him and can reach up to 1.1 a year above it; each season he closes 15–40% of the gap; from 60 he loses 0–2 a season with his ceiling. ← trusting a young manager or coach should be a real bet on growth
  | | hired at | prime | other |
  |---|---|---|---|
  | manager | 32–64 | 46 | retires at 70; a young candidate asks 3 less wage per point he is still short |
  | coach | 25–62 | 42 | wage follows his current ability |
  - the founding manager and an interim keep the drawn level (an interim never grows); volunteers and people from older saves have no age or ceiling and stay put
  - a former player keeps his actual birth year and age through the coaching/management career (→STAFF-23/24); never redraw his age from candidate-generation bands.
  - growth is reported as manager-growth and staff-growth events; OVR (ability) and POT (ceiling) show on every manager and coach (→WEB-55)

- STAFF-17 [o] Managers form a market that moves while the season runs (rules 1.13.0). ← a fixed list of four, still showing the man just hired, read as a menu rather than football
  - free agents (자유계약 감독): a pool of 4–8 kept in the world. Every 4 league rounds and at the season close, from a stream of its own so matches and other draws stay put: each free agent signs elsewhere with 25% and leaves; managers sacked in our league join; new free agents fill the pool to at least 4 (school order →STAFF-14, school bands →STAFF-14, levels 45–85).
  - every club has a named manager derived from the seed, the club and its count of managers; his level follows the club's strength (±8) inside his school's bands. A club in the bottom quarter of our league that lost 3 of its last 5 sacks its manager with 40% at a refresh, a relegated club at the close with 60%; the sacked manager joins the free agents, the club names its next one and the news reports it.
  - hiring a free agent costs his signing fee; hiring another club's manager also pays compensation (웃돈) of 1.5 × his annual wage, and that club names its next manager. Candidates from other clubs are the managers of our league and the division above, the eight best by level.
  - former-player coaches who qualify for management (→STAFF-24) can enter the manager market; their admission and pool integration require →STAFF-28.
  - the manager the owner hires leaves the pool; the manager he replaces (not an interim) joins it; a hired candidate never shows as a candidate again while he is in charge.
  - the manager's 교체 action opens the market (→WEB-40): free agents first, then other clubs' managers with club, OVR/POT, school, wage, compensation and total, and says when the list next changes.

- STAFF-18 [o] With manager appointments delegated independently (→WEB-45) the 단장 (→STAFF-20) appoints and renews managers by two rows of the 스태프 area (→ECON-25), and reports every appointment, renewal and search that found nobody. ← owners who leave the club to run itself still need a manager in charge, of the kind they chose
  - 선호 학파: any (default) or one of the eight schools (→STAFF-14); a candidate of another school never matches.
  | 감독 기조 | the staff look for | order | term | other clubs' managers | with no match |
  |---|---|---|---|---|---|
  | 표준 (default) | anyone | OVR first | 2 seasons | no | wait |
  | 육성가 | 육성 60+ | 육성 first | 3 seasons | no | the best affordable free agent |
  | 검증된 승부사 | anyone | OVR first | 3 seasons | yes, with compensation (→STAFF-17) | the best affordable free agent |
  | 젊은 감독 | anyone | potential first | 3 seasons | no | the best affordable free agent |
  | 저비용 | anyone | the lowest wage first | 2 seasons | no | the best affordable free agent |
  - a term never runs past the manager's 70th year, and the firefighter signs for 1 (→STAFF-14).
  - a candidate matches when he meets both rows and the club can afford him: cash after his fee and any compensation keeps the 재정 기조 runway (→ECON-33) with his wage in place of the current one (as →STAFF-15).
  - a vacancy (resignation, retirement, an unrenewed contract, the firefighter leaving) is filled at once by the first match; with none, 표준 waits — the interim stays in charge without stopping the clock while the staff look again daily (the market moves every 4 league rounds →STAFF-17) — and the other options take the best affordable free agent in their order.
  - on 1 April an expiring manager who meets both rows is renewed unless a match beats him clearly in the option's order: 3+ OVR, 3+ 육성, 3+ potential or a wage 10%+ lower. One who does not meet them leaves at the close when a match exists and is renewed when none does.
  - 사람's 감독 tab shows who holds the manager-appointment responsibility, the two rows (each opening the authoritative department sheet →WEB-77) and whom the staff would appoint today (→WEB-43).

- STAFF-19 [o] The owner reaches training only through its coaches, from 훈련 (→WEB-70): the assistant for the first team and for any one of its players (→CLUB-13), the youth director for the academy (→CLUB-31). ← owners in real clubs interfere through people, and interference costs them coaches
  - 제안 (suggest) a focus for the team, a player or the academy for the next 4 settled rounds: the coach accepts with a chance stated before, 0.55, +0.3 when his rule picks it now, −0.25 when his rule calls for recovery (or 1군 준비) and the suggestion is something else, −(ability − 50)/200, within 0.1–0.95, drawn from the world's stream for that coach and round. Accepted, the focus holds 4 rounds; refused, nothing changes. One suggestion per target (the team, each player, the academy) every 2 settled rounds; his rule for a player is his player rule (→CLUB-13).
  - 강행 (force) a focus for a target: it holds 4 settled rounds without asking, and the coach's strain this season rises by one whatever the target; he then resigns with 15% × his strain (15%, 30%, 45%, at most 60%), stated before. A resignation leaves the post vacant like a release without compensation (→STAFF-11, →STAFF-15) and is reported; strain clears when a season starts. A volunteer never resigns. This coach resignation adds no linked manager-trust penalty.
  - while a suggestion or an order holds, 훈련 names it on its target with the rounds left; a new one for the same target replaces it.

- STAFF-20 [o] The 단장 runs the club's player and manager business between the owner and the manager: when their separate responsibilities are delegated (→WEB-45) he takes contract talks (→CLUB-26), the manager post (→STAFF-18) and transfers — offers (→CLUB-18), stances (→CLUB-22) and signings (→CLUB-33) — and his reports name him. ← as at clubs with a sporting director, the head coach asks for players and the director decides; our manager picks and trains the team and never buys
  - he is hired, renewed and released like a coach (→STAFF-11, →STAFF-15, →STAFF-16), from three candidates a season; a new club starts with an unpaid ability-50 volunteer, and with the coaching departments delegated the staff fill his post by 코치 기조.
  - he carries the transfer negotiation the chief scout carried before: a selling club's acceptance (→CLUB-18) + (ability − 50)/250, and as a negotiator, his only trait, +0.1 more and asking fees ×0.9; a vacant post −0.05.
  - a decision its responsibility keeps with the owner is never his; he sets no direction row.
  - 사람's 코치진 shows his card first, with the responsibilities currently delegated to him (→WEB-43).

- STAFF-21 [o] Each school of football prefers attributes and play traits, and a player who has them adapts to its manager faster (→PLAYER-12). ← a gegenpressing coach settles runners first, a positional coach passers
  | school | attributes | play traits |
  |---|---|---|
  | 포지셔널 플레이 | 패스, 시야 | 플레이메이커, 테크니션, 빌드업 |
  | 게겐프레싱 | 체력, 태클 | 활동량, 태클러 |
  | 실리 역습 | 속도, 위치선정 | 스피드스터, 라인 브레이커 |
  | 수비 조직가 | 위치선정, 공중볼 | 공중 장악, 태클러 |
  | 동기부여형 | 체력 | 리더, 활동량 |
  | 육성형 | 패스, 드리블 | 테크니션, 플레이메이커 |
  | 소방수 | 몸싸움, 태클 | 리더, 공중 장악 |
  | 데이터 헤드코치 | 시야, 위치선정 | 라인 브레이커, 빌드업 |
  - his school factor is 0.8, +0.1 for each preferred attribute at 65 or more, +0.1 for each preferred play trait he carries, +0.1 under a 육성형 manager when aged 21 or under, at most 1.3; under the founding manager or an interim it is 1.0 for everyone.
- STAFF-22 [o] A side plays the formation of its applied tactic (→STAFF-4), and every slot asks a role (→PLAYER-5): ← 감독이 원하는 포지션 is a slot of his formation
  | tactic | formation | slots |
  |---|---|---|
  | possession | 4-3-3 | GK 스위퍼 키퍼; LB 인버티드 풀백, CB 볼 플레잉 디펜더, CB 커버형 센터백, RB 오버래핑 풀백; DM 앵커, CM 메짤라, CM 딥라잉 플레이메이커; LW 인버티드 윙어, ST 펄스 나인, RW 전통형 윙어 |
  | press | 4-2-3-1 | GK 스위퍼 키퍼; LB 오버래핑 풀백, CB 스토퍼, CB 커버형 센터백, RB 오버래핑 풀백; DM 볼 위닝 미드필더, CM 박스투박스; LW 인버티드 윙어, AM 섀도 스트라이커, RW 인버티드 윙어; ST 컴플리트 포워드 |
  | counter | 4-4-2 | GK 슈팅 스토퍼; LB 수비형 풀백, CB 스토퍼, CB 커버형 센터백, RB 수비형 풀백; LM 와이드 미드필더, CM 박스투박스, CM 딥라잉 플레이메이커, RM 와이드 미드필더; ST 타겟맨, ST 포처 |
  | balanced | 3-5-2 | GK 슈팅 스토퍼; CB 스토퍼, CB 커버형 센터백, CB 볼 플레잉 디펜더; LWB 수비형 윙백, DM 앵커, CM 박스투박스, CM 메짤라, RWB 공격형 윙백; ST 타겟맨, ST 포처 |
  - a tactic change changes the formation at once and costs no adaptation; only a new manager does (→PLAYER-13).
- STAFF-23 [o] Suitable players from any club can naturally choose a coaching career after retirement, based on coaching aptitude (→PLAYER-21), without an own-club service threshold. A playing-coach route can start before playing retirement (→STAFF-31).
  - the owner may encourage an own player toward coaching during →STAFF-29's retirement window. Encouragement does not guarantee career entry, an aptitude increase or employment.
  - an entrant becomes a coaching candidate as the same person, retaining actual age and playing history (→HIST-14, →WORLD-10); playing fame and OVR do not guarantee coaching ability.
  - employing or renewing a former player follows the ordinary staff appointment responsibility and existing disclosed contract/cost rules. Entry parameters are →STAFF-25; coaching ability/specialty and pool admission are →STAFF-27.

- STAFF-24 [o] A coach becomes a manager candidate only after coaching experience and aptitude for team management/tactical judgement qualify him together.
  - the experience minimum is three cumulative years of actual coaching employment, including full playing-coach service (→STAFF-30/31).
  - service alone never promotes every coach into management; remaining a specialist coach is a valid career.
  - candidacy does not appoint him. Hiring/renewal follows the manager responsibility, not his former-player status, and preserves existing contract and affordability rules.
  - the linked person history survives the change of role (→HIST-14). Exact qualification and school/ability assignment are →STAFF-28.

- STAFF-25 [o] At a coaching-qualified player's retirement announcement (→STAFF-38), decide his coaching-career intention once using a retained person-specific career draw.
  | true coaching aptitude | natural intention | with the once-only owner encouragement |
  |---|---|---|
  | 높음 | 50% | 65% |
  | 매우 높음 | 80% | 95% |
  - encouragement (→STAFF-29) compares the same retained draw with the higher threshold; do not reroll it. A player already intending to coach remains willing; otherwise show whether the encouragement changes his intention. Retain the response so reloads, settings changes and repeated visits cannot retry it.
  - a willing qualified player becomes a coaching candidate at actual playing retirement unless already employed as a coach; a playing coach keeps his existing coaching contract under →STAFF-35. Market admission is →STAFF-27. Neither intention nor encouragement appoints him or guarantees a job.
  - playing-coach employment requires its separate accepted contract (→STAFF-31/32). No separate mandatory coaching-course purchase is part of this entry path; ordinary employment costs remain in force.

- STAFF-26 [o] The recruitment department has a standing director/manager support policy: 단장 우선, 균형 or 감독 우선, with 균형 selected for a new game.
  - automatic mediation follows that policy; direct mediation can choose differently for the current case without silently changing the standing policy.
  - the policy decides whose reasoning receives greater weight; financial permissions and spending checks remain owned by →ECON-33.
  - the policy is edited through the recruitment department's authoritative policy workflow (→ECON-25, →WEB-77). Detailed resolution rules are →CLUB-36.

- STAFF-27 [?] Specify a former player's coaching specialty, initial ability/potential and admission to department candidate pools. Preserve actual age and ordinary disclosed employment costs; playing OVR or legend status grants no fixed coaching-potential bonus.

- STAFF-28 [?] Specify manager ability/potential and school assignment, and admission to the existing manager market. Coaching-service and managerial-aptitude requirements are →STAFF-30/39; qualification is candidacy, not automatic employment.

- STAFF-29 [o] The owner may encourage an own active player toward a coaching career once, after his retirement announcement and before his actual playing retirement.
  - show the player's actual response; an encouragement alone does not guarantee entry, an aptitude increase, a playing-coach contract or employment (→STAFF-23/25/31).
  - retain the attempt and response with the same person; reloading or changing screens cannot restore the once-per-player opportunity (→SAVE-17, →HIST-14).

- STAFF-30 [o] The former-player coaching-to-manager path requires at least three cumulative in-game years of actual coaching employment, as well as managerial aptitude (→STAFF-24/28).
  - add actual coaching service across clubs; unemployment and time merely listed as a candidate do not count. Preserve retained employment periods across role changes and reloads (→HIST-14, →SAVE-17).
  - playing-coach service counts in full, independently of player appearances: two years as a playing coach plus one year as a full-time coach meets the three-year minimum. Concurrent roles never count the same elapsed time twice.

- STAFF-31 [o] A player approaching retirement may spend one or two years as a playing coach, retaining active-player identity while holding one existing coaching post.
  - the person occupies that post in place of its coach, with the post's ordinary effects (→STAFF-11); no extra coaching slot or stacked second coach is created. Playing OVR does not determine coaching ability (→STAFF-27).
  - player and coach profiles link the same person, actual age and overlapping career periods (→WORLD-10, →HIST-14). Existing playing ageing, injury and ability rules remain in force.
  - the whole actual coaching period contributes to →STAFF-30, even when the person does not play matches. Conversion approval and salary are →STAFF-32/33; scheduled retirement and continued coaching are →STAFF-34/35; eligible posts and early role termination are →STAFF-36/37. Aptitude qualification is →STAFF-38 and career intentions require →STAFF-25.

- STAFF-32 [o] A playing-coach conversion belongs jointly to player contracts and staff appointments (→WEB-45).
  - if either responsibility is direct, stop progression and let the owner review/approve the combined proposal once, including both roles and their terms/costs. Do not auto-commit one half while waiting for the other.
  - only when both responsibilities are delegated may staff complete the conversion automatically, under the ordinary contract, hiring and affordability rules, and report it. Automatic time mode never bypasses an owner-held part of the decision.

- STAFF-33 [o] A playing coach receives his player-contract salary plus the ordinary coaching salary for the post he holds.
  - disclose the player amount, coaching amount and combined total before contract approval; use the existing player and coach pay rules without an additional playing-coach bonus.
  - being near retirement or becoming a playing coach does not itself cut the player salary; the existing contract/renewal rules determine it. Account for each component once.

- STAFF-34 [o] An accepted playing-coach arrangement defers the announced playing-retirement date by the selected one or two years, within the existing age-41 playing-retirement limit (→CLUB-3).
  - offer only a duration that fits the limit; if neither fits, no playing-coach extension is available. Do not extend past 41 or reset the person's age.
  - the player retires from playing at the agreed deferred date. The arrangement changes the announced retirement date, not the existing playing ageing, ability or injury coefficients.

- STAFF-35 [o] Playing retirement ends the player role and its salary; an unexpired coaching contract continues in the same post on its existing coaching salary and terms.
  - the person becomes a full-time coach without a new appointment or a reset of actual coaching service (→STAFF-30). Preserve the linked playing history and age.
  - if the coaching contract also expires, renewal or replacement follows the ordinary staff-appointment responsibility and contract rules (→STAFF-15). Do not silently guarantee a new coaching contract.

- STAFF-36 [o] Playing coaches may hold one suitable training post among assistant, attack, defense, goalkeeping, fitness and youth director (→STAFF-11).
  - suitability follows the person's coaching specialty/aptitude (→STAFF-27); do not let a playing coach fill every department without regard to suitability.
  - the director and chief scout are outside this playing-coach route. Existing department capacity and effects remain unchanged.

- STAFF-37 [o] Ending a playing coach's coaching post by dismissal or resignation preserves his player contract; he continues as a player under that contract and loses the coaching salary/post effect.
  - a player transfer or release that takes him out of the club also ends his coaching post there. Playing retirement instead follows the remaining-coach-contract rule in →STAFF-35.
  - each affected contract follows its ordinary termination/resignation and compensation rules, with costs disclosed before the action; do not invent an additional playing-coach severance charge.
  - respect every affected business responsibility (→WEB-45); ending both roles must not bypass a direct decision by automatically settling its part.

- STAFF-38 [o] A player's coaching or playing-coach career requires actual overall coaching aptitude of 높음 or 매우 높음 on →PLAYER-23's five-grade scale.
  - a scouting estimate cannot substitute for the true grade (→PLAYER-24), and owner encouragement does not waive the requirement. Qualification alone guarantees neither willingness, market entry nor employment (→STAFF-25/27).

- STAFF-39 [o] Former-player coaching-to-manager candidacy requires actual managerial aptitude of 높음 or 매우 높음, independently of coaching aptitude, plus the actual three-year coaching-service minimum (→STAFF-30).
  - high coaching aptitude alone does not qualify a manager, and high managerial aptitude does not bypass coaching experience. Meeting both conditions permits candidacy, not appointment (→STAFF-28).

## flow
- Play: validated input → deterministic outcome → recorded facts → visible feedback.

- Second career: active-player aptitude evaluation → retirement announcement and optional one-time encouragement → playing-coach appointment or retirement/coaching candidacy → actual coaching employment for at least three cumulative years → management candidacy only with managerial aptitude → direct/delegated appointment.

## constraints
- Follow →ARCH-1 and the owned rules of other domains; no private backend is required for local play.

## chg
- r27 261016 STAFF-25✎ entry timing/chance/encouragement response open→once at retirement announcement, natural 50/80% and encouraged 65/95%, retained draw and retirement candidacy without guaranteed employment
- r26 261016 STAFF-25/28/31✎ aptitude qualification open→STAFF-38/39, remaining entry/ability/market rules open; STAFF-38/39+ high-or-very-high coaching entry and separate managerial aptitude plus three-year service
- r25 261016 STAFF-25/31✎ playing-coach post/early-exit rules open→STAFF-36/37, entry intentions remain open; STAFF-36/37+ six suitable training posts, coach-only exit preserves player contract, player departure ends both roles under ordinary contract costs
- r24 261016 STAFF-25/31✎ retirement/continuation open→STAFF-34/35, remaining entry/eligibility/early separation open; STAFF-34/35+ one/two-year deferral capped at 41 and unexpired coach contract continues after playing retirement
- r23 261016 STAFF-25/31✎ authority/pay open→STAFF-32/33; STAFF-32/33+ one combined approval if either category is direct, both delegated for automatic conversion, player salary plus ordinary coach salary
- r22 261016 STAFF-23/24✎ retirement-only entry/unspecified service→playing-coach route and three-year service; STAFF-25/28✎ encouragement/service timing open→remaining entry/contract/aptitude rules; STAFF-29/30/31+ once after retirement notice, three-year cross-club service and existing-post playing coaches with full service credit
- r21 261016 STAFF-13/15/18/20✎ levels→independent responsibilities; STAFF-16/17✎ generated-only careers→former-player continuity; STAFF-19✎ coach-only effects→explicit no manager penalty; STAFF-23/24+ second careers; STAFF-25/27/28+ open entry/qualification; STAFF-26+ support policy (균형)
- r20 261015 STAFF-11✎ assistant passing growth and fitness stamina→each department scales the growth of the attributes it owns (→PLAYER-15); STAFF-13✎ the role has room→his line; STAFF-19✎ the coaches' cards in 사람's 코치진→훈련, +a single player as a target, one suggestion per coach→per target every 2 rounds; STAFF-21+ each school's preferred attributes and play traits and the school factor 0.8–1.3; STAFF-22+ a formation and slot roles per applied tactic
- r19 261014 STAFF-20+ the 단장: contract talks, the manager post and transfers when delegated, hired like a coach, the transfer negotiation; STAFF-11✎ the chief scout's negotiation→the 단장's; STAFF-13✎ +who takes each delegated decision; STAFF-18✎ the staff→the 단장 appoint managers
- r18 261014 STAFF-13✎ +signings (→CLUB-33)
- r17 261014 STAFF-13✎ youth director's fixed readiness (weakest first-teamer or starters minus 10) and release (19, below the weakest)→by 데뷔 시점 and 육성 목표 (→CLUB-32)
- r16 261014 STAFF-13✎ +decide by the area's direction rows within 재정 기조, promotion floor a year of costs→the 재정 기조 floor; STAFF-15✎ six hiring criteria per department at level 4→one 코치 기조 row (자원봉사, 저비용 45+, 표준 55+, 최고 수준 65+) at level 3+, 13 rounds→the 재정 기조 runway; STAFF-18✎ eleven manager criteria at level 4→선호 학파 and 감독 기조 (표준, 육성가, 검증된 승부사, 젊은 감독, 저비용) at level 3+, 기다림 by default→표준 waits, the others take the best affordable
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
