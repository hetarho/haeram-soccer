# T400 screen settings

Calibration round 60 from the tree with T400's neutral score state (one segment), each run's configs patched by `--patch` (`aggregate` is `AGGREGATE_CONFIG`). Every run:

```
pnpm exec tsx scripts/match-parity.ts --report --partition calibration --round 60 --jobs 8 --scale 5 --conditions 'core:equal-top-tier,gap:0,gap:20,tier:tier1,era:2024,knockout:single-match,tactics:possession-possession,tactics:possession-press,tactics:possession-counter,tactics:possession-balanced,tactics:press-possession,tactics:press-press,tactics:press-counter,tactics:press-balanced,tactics:counter-possession,tactics:counter-press,tactics:counter-counter,tactics:counter-balanced,tactics:balanced-possession,tactics:balanced-press,tactics:balanced-counter,tactics:balanced-balanced,fatigue:0,fatigue:20,fatigue:32,fatigue:50,gap:-35,gap:-30,gap:-25,gap:-20,gap:-15,gap:-10,gap:-5,gap:5,gap:10,gap:15,gap:25,gap:30,gap:35,gap:40' --reference 'core:equal-top-tier,gap:0,gap:20,tier:tier1,era:2024,knockout:single-match,tactics:possession-possession,tactics:possession-press,tactics:possession-counter,tactics:possession-balanced,tactics:press-possession,tactics:press-press,tactics:press-counter,tactics:press-balanced,tactics:counter-possession,tactics:counter-press,tactics:counter-counter,tactics:counter-balanced,tactics:balanced-possession,tactics:balanced-press,tactics:balanced-counter,tactics:balanced-balanced,fatigue:0,fatigue:20,fatigue:32,fatigue:50' --reference-scale 1 --reference-cache <dir> [--patch <json>]
```

| run | patch |
|---|---|
| base | `{}` |
| s0 | `{"aggregate":{"scoreState":{"segments":6,"volume":0,"risk":0}}}` |
| s1 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.2,"risk":0}}}` |
| s2 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0}}}` |
| s3 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.6,"risk":0}}}` |
| s4 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.2}}}` |
| s5 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4}}}` |
| s6 | `{"aggregate":{"scoreState":{"segments":3,"volume":0.4,"risk":0.2}}}` |
| s7 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.8,"risk":0.4}}}` |
| r1 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.2,"risk":0}}}` |
| r2 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0}}}` |
| r3 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.2}}}` |
| r4 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4}}}` |
| r5 | `{"aggregate":{"scoreState":{"segments":3,"volume":0.4,"risk":0.2}}}` |
| r6 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.3,"risk":0.3}}}` |
| r7 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.6,"risk":0.3}}}` |
| l1 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.27}}}` |
| l2 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.14},"failed":{"touch":0.34,"corner":0.27}}}` |
| l3 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.27,"intercepted":0.2}}}` |
| l4 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.27},"passes":{"perMatch":880}}}` |
| m1 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.78,"completion":0.09},"failed":{"touch":0.34,"corner":0.24,"byline":0.66,"intercepted":0.18}}}` |
| m2 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.78,"completion":0.09},"failed":{"touch":0.34,"corner":0.22,"byline":0.62,"intercepted":0.18}}}` |
| m3 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.78,"completion":0.09},"failed":{"touch":0.34,"corner":0.24,"byline":0.66,"intercepted":0.18},"tactics":{"balanced":{"guard":1}}}}` |
| m4 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.78,"completion":0.09},"failed":{"touch":0.34,"corner":0.24,"byline":0.66,"intercepted":0.18},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}}}}` |
| m5 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.78,"completion":0.09},"failed":{"touch":0.34,"corner":0.24,"byline":0.66,"intercepted":0.18},"tactics":{"balanced":{"guard":1},"counter":{"shot":1.3}}}}` |
| n1 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.2},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}}}}` |
| n2 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.26,"byline":0.58,"intercepted":0.2},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}}}}` |
| n3 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.14},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.2},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}}}}` |
| n4 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.2}}}` |
| n5 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.18},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}}}}` |
| p1 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.14},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.18},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}},"shots":{"scale":0.52}}}` |
| p2 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.12},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.18},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}},"shots":{"scale":0.52}}}` |
| p3 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.14},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.16},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}},"shots":{"scale":0.52}}}` |
| q1 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.14},"failed":{"touch":0.34,"corner":0.26,"byline":0.62,"intercepted":0.17},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}},"shots":{"scale":0.52}}}` |
| q2 | `{"aggregate":{"scoreState":{"segments":6,"volume":0.4,"risk":0.4},"crosses":{"scale":0.69,"completion":0.14},"failed":{"touch":0.36,"corner":0.26,"byline":0.62,"intercepted":0.17},"tactics":{"balanced":{"guard":1},"counter":{"guard":0.9}},"shots":{"scale":0.52}}}` |

Validation round 63 ran `v63-base` and `v63-p1` (p1's patch) with the same arguments, `--partition validation --round 63`, plus `--seasons 20 --stress 5000`.
