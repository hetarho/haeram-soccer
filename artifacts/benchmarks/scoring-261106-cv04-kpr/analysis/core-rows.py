"""T689 cv04-kpr: selected rows of MATCH-28's core condition (`grid-bands.ts --report --only core`) side by
side — MATCH-23 targets and MATCH-30 counters with their value and status, and the condition's hat-tricks.
python3 -I core-rows.py FILE ..."""
import json, sys

ROWS = ['shots', 'xgPerShot', 'possessionShots', 'shotsGoalArea', 'shotsBox', 'shotsOutside', 'crossCompletion',
        'goals', 'setPieceGoals', 'penaltyGoals', 'headedGoals', 'goalsFW', 'goalsMF', 'goalsDF']
ADV = ['bigChances', 'bigChancesScored', 'boxShots', 'boxEntries', 'frontOfBoxEntries', 'throughBalls', 'cutBacks']


def index(xs):
    return {x.get('id'): x for x in xs} if isinstance(xs, list) else xs


files = [json.load(open(f)) for f in sys.argv[1:]]
conds = [d['conditions'][0] for d in files]
print('| row | ' + ' | '.join(f.split('/')[-1].replace('.json', '') for f in sys.argv[1:]) + ' |')
print('|---|' + '---|' * len(files))
for key, group in [(k, 'targets') for k in ROWS] + [(k, 'advancedCounters') for k in ADV]:
    cells = []
    for c in conds:
        x = index(c[group]).get(key) or {}
        v = x.get('value')
        st = x.get('status', '')
        cells.append('-' if v is None else f"{v:.3g} {'✓' if st == 'inside' else '✗' if st == 'outside' else '?'}")
    print(f'| {key} | ' + ' | '.join(cells) + ' |')
cells = []
for c in conds:
    h = c['concentration']['hatTricks']
    cells.append(f"{h['value']:.3f} [{h['interval'][0]:.3f}, {h['interval'][1]:.3f}]")
print('| hat-tricks a match | ' + ' | '.join(cells) + ' |')
