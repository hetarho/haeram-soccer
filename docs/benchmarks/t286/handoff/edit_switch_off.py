"""T286: keep activation off after a failed release gate (applied to the worktree root given)."""
import sys
root = sys.argv[1]
GATE_NOTE = sys.argv[2] if len(sys.argv) > 2 else ''


def edit(path, pairs):
    p = f'{root}/{path}'
    s = open(p).read()
    for a, b in pairs:
        assert s.count(a) == 1, (path, a[:70], s.count(a))
        s = s.replace(a, b)
    open(p, 'w').write(s)


edit('packages/engine/src/match-model.ts', [(
    """/**
 * The internal release switch, on since T286 measured the combined model's throughput, capacity
 * and continuity gates passing (→ARCH-31, SAVE-23; its accuracy is reported beside it, →MATCH-28):
 * a new career is tracked from its founding and a supported rules-4.0.0 career activates at its
 * next writer load. Tests and measurements of the pre-feature path pass a disabled release
 * explicitly, and no player control or timing ever selects it.
 */
export const MATCH_MODEL_RELEASE: MatchModelRelease = {
  revision: MATCH_MODEL_REVISION,
  enabled: true,
};""",
    """/**
 * The internal release switch: off until the combined model's throughput, capacity and continuity
 * gates pass (→ARCH-31, SAVE-23; its accuracy is reported beside them, →MATCH-28). T286 measured
 * them on the reference machine with the switch on and a gate failed (docs/benchmarks/
 * full-model-release.json), so no world activates the model yet. Tests and measurements pass a
 * release explicitly, and no player control or timing ever selects it.
 */
export const MATCH_MODEL_RELEASE: MatchModelRelease = {
  revision: MATCH_MODEL_REVISION,
  enabled: false,
};""")])

edit('packages/engine/src/match-model.test.ts', [
    ("""  it('releases the full model to new and supported careers (T286)', () => {
    // The switch as the source declares it, which the release-on probe keeps before setting it.
    expect(declaredRelease()).toEqual({ revision: MATCH_MODEL_REVISION, enabled: true });
    expect(MATCH_MODEL_RELEASE).toEqual({ revision: MATCH_MODEL_REVISION, enabled: true });
    // A world without model data still plays the pre-feature model, with no metadata.""",
     """  it('keeps production activation off and plays the pre-feature model without metadata', () => {
    // The switch as the source declares it, which the release-on probe keeps before turning it on:
    // off while T286's release gates fail (docs/benchmarks/full-model-release.json).
    expect(declaredRelease()).toEqual({ revision: MATCH_MODEL_REVISION, enabled: false });
    expect(MATCH_MODEL_RELEASE.revision).toBe(MATCH_MODEL_REVISION);
    // A world without model data plays the pre-feature model, with no metadata."""),
    ("""    // Founding with the switch on is the same career recorded from its first day, and a founding
    // now takes the switch as released.
    expect(canonical(createWorld(founding, ENABLED_RELEASE))).toBe(canonical(founded));
    expect(canonical(createWorld(founding))).toBe(canonical(founded));
    expect(createWorld(founding, DISABLED_RELEASE).matchModel).toBeUndefined();""",
     """    // Founding with the switch on is the same career recorded from its first day.
    expect(canonical(createWorld(founding, ENABLED_RELEASE))).toBe(canonical(founded));
    expect(createWorld(founding, DISABLED_RELEASE).matchModel).toBeUndefined();"""),
])

edit('vitest.release-on.config.ts', [(
    """// The unit run with the release switch on (tests/setup/release-on.ts). Since T286 the source
// declares the switch on, so this run equals `test:unit`; it stays for probing a later release.""",
    """// The unit run with the release switch on (tests/setup/release-on.ts), before the switch flips.""")])

edit('tests/setup/release-on.ts', [(
    """ * internal release switch on, so a file shows it passes with the switch on (→SAVE-23); since T286
 * the source declares it on, so the probe changes nothing until a later release is probed. Only""",
    """ * internal release switch on, so a file shows it passes once the switch flips (→SAVE-23). Only""")])

edit('tests/e2e/manager-history.spec.ts', [(
    """  // The same writer load records the released full model there too (→SAVE-23).
  expect(activated.world.matchModel?.coverage).toBe('activation');""",
    """  // With the release switch on, the same writer load records the full model there too (→SAVE-23).
  expect(activated.world.matchModel?.coverage).toBe(
    MATCH_MODEL_RELEASE.enabled ? 'activation' : undefined,
  );""")])
print('ok')
