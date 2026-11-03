# Scoring and retention investigation — 261103

No scoring candidate is released. The owner requires realistic measurements before a scoring commit, then prioritised publishing the validated award/wage changes and removing their work branch. The experimental source, driver and all results remain in the detached worktree `/home/deep/haeram/haeram-soccor/.tmp/bl03-calibration`; a checked portable archive is `artifacts/benchmarks/star-balance-261103/scoring-research.tar.gz` in the repository. The original save is unchanged.

## Evidence

There are 15,584 fixed-squad fixtures over the calibration and held-out partitions, plus the independent 1,020-game standard corpus. All fixed-squad match/scorer/shot invariants hold. There are also 32 actual whole-season career comparisons, with 1,216 league fixtures, including fatigue, injuries, contracts and automatic selection. Initial partial-season closes are excluded. The career harness checks retained own-player rows; the engine validates full results before storage omits the opponents' player lines.

The fixed-squad arms deliberately reset fitness and hold a lineup, so their scorer figures are stress measurements. Short pilots' 38-game extrapolations are not actual season totals. The owned-club career output does not measure the complete league's scoring-leader distribution. Its positional totals use primary positions rather than reconstructed played slots, so they are not proof of the MATCH-23 line-share bands.

Held-out fixed-squad partition: four seeds × four tactics × normal/stress × 38 fixtures per variant, 3,648 matches total:

| Variant | Normal goals / match | Normal top-scorer share | Peak-striker goals / match | Peak-striker top share | Largest peak-striker season |
|---|---:|---:|---:|---:|---:|
| baseline | 4.046 | 42.46% | 4.488 | 61.39% | 120 |
| earlySupport | 2.748 | 41.34% | 3.028 | 59.82% | 70 |
| room | 2.742 | 40.06% | 2.896 | 60.59% | 56 |

Reducing aggregate goals alone does not resolve scorer concentration. Seed-cluster bootstrap intervals and complete per-case figures are retained in `season-validation-v1.json`. No target was widened, goal capped, scorer reassigned or historical fact rewritten.

Actual career comparisons use the owner's copied 2036 export, close the shared partial season, then play the whole 2037 league. The normal arm retains the active roster. The stress arm gives its leading active striker Barker's estimated peak profile, age 26 and potential 99, on the copy. Two seed streams and four initial tactics are tested per variant. Managers may change tactic during the real season.

| Variant / roster | Match goals | Own goals / match | Mean club top scorer | Mean top share | Largest club top scorer |
|---|---:|---:|---:|---:|---:|
| baseline / saved roster | 3.158 | 1.020 | 14.75 | 38.01% | 30 |
| baseline / peak striker | 3.974 | 1.717 | 46.00 | 70.05% | 86 |
| clearCentral / saved roster | 2.313 | 0.674 | 7.75 | 30.27% | 12 |
| clearCentral / peak striker | 2.536 | 0.908 | 18.63 | 54.11% | 26 |

The candidate reduces totals but still concentrates a peak striker's goals and depresses the saved roster's attack. It fails the release gate. One baseline stress case has 86 goals, 370 shots and 2,966 minutes, team 110 scored / 96 conceded and rank 10. The peak-profile presence materially amplifies the anomaly; it is not a general explanation that every career must show it.

## Retention hypothesis

The owner's hypothesis that an exceptional player stayed unrealistically long is supported by an independent policy bottleneck:

- The current 2036 export is in automatic mode with every responsibility, including sales and contracts, delegated. It has no market build card. Historical settings are not reconstructed from that current snapshot.
- For delegated sales in the default open stance, `saleAllowed` rejects every starter younger than 30, regardless of fee. From 30 it still requires bench cover within three effective OVR; core-holding policy rejects any starter. Listed and untouchable players have separate rules and are not covered by that universal open-stance veto.
- Barker's actual ambition is 3. The current probability of resentment at a blocked bigger-club offer is zero at that grade. Without another source of unhappiness, that route cannot produce a transfer request.
- Default incoming offers are generated at a 6% daily chance for the whole club during a window, then select a player by ability/potential. Goals and award fame do not directly increase interest. Default unsolicited bids are 90–160% of value; untouchable standard prices are 200%, or 225% without cover, absent financial cuts.
- The retained player-specific events show 13 contract agreements, no transfer-stance changes and no transfer requests. Closed bid retention is only 60 globally. The actual historical offers and their rejection sequence cannot be recovered from this export. Retirement clears stance, so the retired snapshot does not prove his earlier stance.
- Current-2036 buyer sampling does find buyers at every tested ability, including 26 sampled clubs for OVR91 and two for OVR99. This does not reconstruct the 1990s buyer pool or prove there were no historical offers.

Long retention explains accumulation; it does not by itself establish that the scoring rate is realistic. Old archived award points with no honours recover Barker's closing OVR as 81 in 1993, 83 in 1994 and 91 from 1999–2003. He already scored 86 across all competitions at the first of those closes. The transfer policy and the extreme chance volume both need their own causal assessment.

The next balance decision should examine CLUB-18/24 and PLAYER-8/CLUB-27 before another broad match retune. Those are current explicit policies, so changing the sale veto or career pressure needs a specification change and measured transfer scenarios. No transfer-policy implementation is included in the published award/wage changes.
