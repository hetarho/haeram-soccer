import sys
p = sys.argv[1]
s = open(p).read()


def rep(a, b, count=1):
    global s
    assert s.count(a) == count, (a[:80], s.count(a))
    s = s.replace(a, b)


rep("""Your club's matches play on the grid engine: 22 players on a 105 × 68 m pitch decide and contest every pass, carry, cross and shot against real-football distributions, and watching shows that same match minute by minute with Korean commentary, cards, substitutions and added time. Fixtures between other clubs take a faster probabilistic path on the same scoring curve.""",
    """Your club's matches play on the grid engine: 22 players on a 105 × 68 m pitch decide and contest every pass, carry, cross and shot against real-football distributions, and watching shows that same match minute by minute with Korean commentary, cards, substitutions and added time. A new career plays the full match model from its founding (released in T286): players move continuously with their own intentions and team jobs, and every fixture between other clubs — league, cups and Europe — settles on an aggregate path that produces the same complete statistics (xG, passes, duels, cards, every player's line), so the league lenses and player comparisons read complete records for every club. A supported career saved before the release switches to the model at its next load from that day on: earlier results keep their recorded statistics and the league names where counting started; nothing is replayed or backfilled.""")
rep("""The encoded checkpoint limit is **1.5 MiB**, and the two-checkpoint budget is **3.5 MiB**, using conservative UTF-16 accounting.""",
    """The encoded checkpoint limit is **3 MiB** and namespaced localStorage use at most **3.5 MiB**, using conservative UTF-16 accounting.""")
open(p, 'w').write(s)
print('ok')
