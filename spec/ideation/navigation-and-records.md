# IDEATION navigation-and-records
> st:ready@261015 | Put club seasons first in records, standings first in leagues, and give each destination a clear subject and time scope.

## vision
- Problem: the owner regularly wants records → season-by-season history, cannot explain the four choices inside summary, seldom opens the separately named season-record tab, and expects the league table before a league overview.
- Target: owners alternating between the present competition and their club's accumulated story over a long career.
- Core value: a destination first answers the question its name promises; subject, season, competition scope and the way back remain recognisable across views.
- Evidence: source inspection plus fresh synthetic browser careers at 390×844 and 1440×1000, including one completed season. Current gameplay/navigation code is at cc3039f; the local typography work changes presentation, not these destinations. Observed journeys establish what the interface does; no usage telemetry establishes what every player prefers.
- Mode: autonomous ideation. Adopted items below are recommended planning choices, recorded in STATE inbox; the current WEB/HIST rules and runtime remain unchanged.

## explored
- [o] Diagnose the taxonomy before rearranging tabs: the current records menu mixes time ranges, object types, chart types and containers at the same level.

  | Priority | Observed structure and evidence | Why it is difficult | Recommended direction |
  |---|---|---|---|
  | High | Records opens on `요약`, then defaults to `트로피`; the other segments are `Elo`, `시즌별 기록`, `기타 기록`. [RecordsRoom](../../apps/web/src/ui/RecordsRoom.tsx#L165) | This is a second menu with four unrelated destinations, rather than a summary of the club. The owner's regular season-list task starts behind a misleading category. | Make `시즌별 기록` the first records view. Give achievements, growth and all-time records names that describe their contents. |
  | High | `시즌별 기록` is a list under summary, while `시즌 기록` is another top-level tab with `개요 / 경기 / 결정`. [RecordsRoom](../../apps/web/src/ui/RecordsRoom.tsx#L346) | Nearly identical labels hide the distinction between a list of seasons and the detail of one season. The separate detail defaults to the current season even after another archived season was explored elsewhere. | Make season list → selected season → review/matches/decisions one continuous records journey. Include the current season explicitly as in progress. |
  | High | A record-list season row opens `/leagues?...season=1950&tab=table`; returning to records opens summary → trophies again. Browser reproduction agrees with [SeasonTable](../../apps/web/src/ui/ClubTrends.tsx#L339), [openLeagueSeason](../../apps/web/src/ui/state.ts#L319) and [RecordsRoom](../../apps/web/src/ui/RecordsRoom.tsx#L77). | A season row looks like the way to read the club's year, but its whole-row action leaves the records destination for the league table. The return loses the part being read. | Open the club's season detail from the row. Offer a separately named `이 시즌 리그 순위표` link, preserving the record season and return position. |
  | High | A new league visit selects `개요`, while `순위표` is second. [LiveSeason](../../apps/web/src/ui/LiveSeason.tsx#L59) | The first screen answers a different question from the owner's repeated standings task. | Start the league on standings. Put the competition and season context above the views. |
  | High | After choosing `GER.0.0` on the league table, opening scorers keeps `league=GER.0.0` in the address, removes the country/division controls and shows `우리 팀 리그의 모든 선수`. [LiveSeason](../../apps/web/src/ui/LiveSeason.tsx#L326), [ScorerPanels](../../apps/web/src/ui/ScorerPanels.tsx#L38). | The selected competition does not consistently govern neighbouring tabs. The copy admits the narrower scope, but the owner must discover that the subject changed. The same source asymmetry exists in rank history and past-season own-club views. | Keep competition/season scope visible across views. Show records for that scope only when retained; otherwise clearly identify own-league-only availability or explain that the selected competition lacks those records. |
  | Medium | League overview is our rank race, gaps, recent form and next rival, plus our fixture notebook. Similar current-club context appears in the home season-detail sheet and after-match detail. [LeagueOverview](../../apps/web/src/ui/LeagueInsights.tsx#L212), [OverviewPane](../../apps/web/src/ui/LiveSeason.tsx#L293), [ClubJournal](../../apps/web/src/ui/App.tsx#L237). | A competition destination is led by an own-club briefing. Making that briefing the gate to the table duplicates context and blurs the league's purpose. | Put the current club briefing on home. Put the club's closed-season review in records. Keep the competition table, results and competition records in leagues. |
  | Medium | Current league tabs are `개요 / 순위표 / 라운드 결과 / 순위 추이 / 득점 순위 / 득점왕 추이`; an archived season switches to `결산 / 순위표 / 우리 경기 / 순위 추이 / 득점 순위`, with `결산` as its initial default. [state](../../apps/web/src/ui/state.ts#L325), [LiveSeason](../../apps/web/src/ui/LiveSeason.tsx#L448) | Changing the time period changes both the first task and the navigation categories. Competition-wide records and own-club records become siblings without a clear boundary. | Keep competition-first views stable across seasons. Put our-season review behind an explicit link to records, and explain unavailable historical detail without inventing it. |
  | Medium | Cups puts named competitions and `역사` in one top-level bar, then asks for the competition again inside history. [CupsView](../../apps/web/src/ui/CupsView.tsx#L275), [CupHistory](../../apps/web/src/ui/CupHistory.tsx#L344). | Competition and time are mixed on one axis; opening history restarts the competition choice and uses a different exploration pattern from league seasons. | Choose the competition once, then the season, then bracket/results/competition records. Link our archived cup run from the corresponding club season. |
  | Medium | `구단 방향` contains `방향 / 증축 / 자금 / 후원`. [state](../../apps/web/src/ui/state.ts#L46), [Operations](../../apps/web/src/ui/Operations.tsx#L18). | The parent and one child have the same name; an owner seeking cash or a sponsor must know that business operations are filed under direction. | Consider `구단 운영` as the parent while keeping `방향` as the policy board. Preserve the useful separation between policy and staff execution. |
  | Medium | Home's `시즌 상세` opens a sheet containing both statistical reading and `한 라운드 진행 / 시즌 끝까지 진행`. [ClubHub](../../apps/web/src/ui/ClubHub.tsx#L244), [ClubJournal](../../apps/web/src/ui/App.tsx#L212). | A reading destination is also an undiscoverable home for major progression tools; the same season is read through another detached interface. | Let season detail orient and link to the club season record. Give bulk progression an explicitly named tools entry; retain the commands and their consequence labels. |
  | Lower | `Elo` appears as an isolated summary segment and a separate growth chart; records `선수` means all-time top-10 boards, and `감독` means appointments/departures plus the current manager. Season-table value cells use today's money without a column-level explanation. [ClubTrends](../../apps/web/src/ui/ClubTrends.tsx#L188), [ClubLeaders](../../apps/web/src/ui/CareerRecordBook.tsx#L261), [RecordsRoom](../../apps/web/src/ui/RecordsRoom.tsx#L208). | Metric, object and time labels do not predict the task. A current reading and a historical comparison are hard to distinguish by name alone. | Group current Elo context with its growth history; use `선수 통산` and `감독 이력`; identify today's-money comparison in financial column labels. |
  | Lower | HUD `소식함` and floating `클럽 뉴스` are two parallel reading surfaces; the inbox includes club events and system notices, while news retells recorded club facts. [InboxButton](../../apps/web/src/ui/EventCenter.tsx#L395), [NewsSheet](../../apps/web/src/ui/NewsFeed.tsx#L193). | Similar labels make it harder to predict where a pending event, operational notice or narrative recap will be found. | Test `알림·결정` versus `구단 뉴스`, with pending decisions explicitly distinguished from read history. Preserve their different purposes instead of blindly merging them. |

- [o] Default records to a season-by-season career list, including a clearly marked current season followed by closed seasons newest first. Season rows lead to the club's own review; competition-table links are separate.
- [o] Default league to standings for the chosen competition and season. Proposed lenses: `순위표 / 일정·결과 / 팀 기록 / 선수 기록`.
  - Current round results and our fixture notebook belong under schedule/results, with competition-wide and own fixtures clearly identified.
  - Rank charts support the table; scorer-race charts support player records. A chart need not become a separate top-level navigation destination.
  - Team records initially use retained table facts such as points and goals. This proposal does not imply that every historical league has every detailed statistic.
- [o] Adopt five records categories as the working direction: `시즌별 기록 / 구단 성장 / 명예·최고기록 / 선수 통산 / 감독 이력`.
  - Season detail: the named season, club review, our match records and major decisions; it keeps competition filtering where it already applies.
  - Club growth: pyramid position, Elo with current context, values, supporters and money over time. Label periods and historical-money basis.
  - Honours/records: trophy cabinet and clearly named club records, with focused subviews if needed; do not recreate an unbounded stack of every panel.
  - Player totals: all-time club leaderboards, including former players where retained.
  - Manager history: the appointment/departure story, linked from the relevant seasons.
- [o] Preserve context through cross-links: subject, season, competition filter and the destination to return to. A default first visit and a return to an inspected season are different journeys.
- [o] Treat the user's rarely opened season-record tab as a discovery problem to investigate, not evidence that its useful analysis should be deleted.
- [o] Keep the current people/training split and policy-versus-execution distinction. These already answer different owner questions; several secondary labels need work rather than another wholesale merger.
- [x] Move the entire live league overview into records ← current rank gaps, form and next opponent belong to the current-club briefing; only the archived club-season review belongs to records.
- [x] Keep the four-part summary and only remember its last selection ← that reduces repeated clicks but leaves the misleading category, duplicated season labels and cross-destination season journey intact.
- [x] Remove trophies, Elo, season analysis or old records because their current placement is confusing ← the problem is where facts are presented, not their value or retention.
- [x] Merge league, cups and records into one universal archive tab ← it would hide the distinction between a competition's field and the owner's club career.
- [?] Confirm lower-priority naming with the owner before applying it: `구단 운영`, `명예·최고기록`, `감독 이력`, and `알림·결정` are working labels.

## shape
- Destination responsibilities:

  | Destination | First question | First view | Detail that belongs there |
  |---|---|---|---|
  | Home | What is happening to my club now, and what needs me? | Next match, current competitive context and decisions | Short current-season briefing and explicit onward links |
  | League | Where does each club stand in this competition? | Standings | Schedule/results, table-derived team records and available player records for the chosen league/season |
  | Cups | What is the state of this competition and our tie? | Chosen competition's current bracket/phase | Season-specific results, brackets and competition honours |
  | Club records | How has our club progressed, and what happened in a particular season? | Season-by-season career list | Our season review, matches, decisions, growth, honours and all-time club/player/manager records |
  | People | Who plays, joins and stays? | Current squad | Market, manager and coaching staff |
  | Training | How are the players developing? | Team/player training | Academy development, growth and adaptation |
  | Club operations, working label | What are our policies, resources and facilities? | Direction board | Construction, cash, ledger and sponsors |

- Recommended records map:

  ```text
  Club records
  ├─ Season-by-season records (first)
  │  ├─ Current season — in progress
  │  └─ A closed season
  │     ├─ Club season review
  │     ├─ Our matches
  │     ├─ Major decisions
  │     └─ Explicit links to this season's league table and cup run
  ├─ Club growth
  ├─ Honours and club records
  ├─ Player career totals
  └─ Manager history
  ```

- Priority order:
  1. Records entry and season-list/detail continuity; remove the generic summary gate without losing its contents.
  2. Standings-first league entry; keep league/season scope visible and honest across every lens.
  3. Relocate the own-club season review and current briefing; align archived/live competition navigation.
  4. Cups' competition/season pattern and secondary labels after the first journeys are evaluated.
- flow: records → career season list → chosen club season → analysis/matches/decisions → optional explicit competition link → return to the same club season.
- flow: league → selected competition and season → standings → fixtures or competition records, with the subject and period still visible.
- v1: presentation ownership, defaults, discoverable season navigation, labels, context-preserving cross-links and explicit data-availability messages / not: new game rules, new historical collection, archive pruning, removal of analysis, a new universal hub or immediate code changes.
- Validation scenarios for the later specification:
  - Enter records, identify the latest closed season and open its club review without passing through league tables.
  - Open a season's league table deliberately, then return to the club season and its prior list context.
  - Enter league and see standings first; changing season preserves the competition and the chosen lens where data exists.
  - Choose another country/division and then player records: the chosen subject is maintained, or the narrower availability is stated before displaying own-league data.
  - Find archived cup progress and our historical scorers from the club season, with an explicit distinction between all competitions and league-only figures.
  - Inspect an early career and a long career, including promotions and seasons lacking older detailed archives. Do not claim player-wide preference or improved completion times without testing them.

## domains
- WEB: revise WEB-40/47/54 for league defaults, club-season ownership and records structure; WEB-10/11 for home briefing and progression-tool discovery; WEB-65/69 for consistent competition scope and view categories. Evaluate WEB-39/43/51/66 labels in a separate lower-priority pass. Existing SSOTs require update-ssot rather than a new domain.
- HIST: preserve HIST-1/2/4/6/8/12/13. The first pass relocates existing facts and labels their scope; any new historical statistics need their own planning decision and must not be implied by a new tab name.

## open
- Which depth of the combined club season review should lead: results/leaders first, with financial and detailed analytical sections below, or another ordering? Recommended default is football results and the season's story, then finance and advanced detail.
- Should `명예·최고기록` stay one destination with clear subviews, or separate if its contents remain too long? Preserve the existing one-view-at-a-time benefit.
- Exact fallback when another league lacks player/round detail: unavailable view with explanation or an explicitly named own-league lens. Do not silently change the subject.
- Is the owner happy with the working operations/inbox labels? These remain proposals rather than prerequisites to the records/league changes.
- Validate the new season journey with an actual long-career owner before claiming it solves every discovery problem. This audit confirms structure and the reported friction, not measured broad usage.
