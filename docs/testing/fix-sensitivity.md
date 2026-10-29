# Regression-test sensitivity — issues #300, #301, #302, #306, #309 and #311

A regression test is evidence only if it fails while its defect is present
(issue #302, slice A). This file records that, for every fix from the issue
#300, #301, #306, #309 and #311 audits and from issue #302's disturbance
matrix (slice B): the tests that fail with the fix taken out. It was produced
by `scripts/fix-sensitivity.mjs` on 2026-10-27 (the patch applied to
`ec08eb4`), for issue #306 on 2026-10-28 (the patch applied to `8bee894`; for
the two follow-ups, the patches applied to `514f5eb`), for issue #309 on
2026-10-29 (the patch applied to `fd17788`) and for issue #311 on 2026-10-29.
To reproduce:

```bash
node scripts/fix-sensitivity.mjs \
  632a180 c8e4268 c925f10 3749058 23ee366 ea69ddf ed8d688 f068664 19c5ef0 c958eb0 45b7350 \
  ca5bf5d cdb8c80 e572ebd ec08eb4 \
  --inject scripts/defects/b04-recap-cache-count-only.patch --md details.md

# issue #306
node scripts/fix-sensitivity.mjs \
  601889d 059f33b e428b50 e2dac8b c556612 10d0f4b a2644a9 7bf24b9 1054cd8 e1fd5fb 92ca408 70c05d3 \
  --inject scripts/defects/r04-forge-unclaimed.patch --md details.md

# issue #306 — the follow-ups (TDA-BUTTON-NO-TARGET, R04's third point)
node scripts/fix-sensitivity.mjs \
  23b2c8b be61488 514f5eb \
  --inject scripts/defects/tda-which-fight-unspoken.patch \
  --inject scripts/defects/tda-which-fight-twice.patch \
  --inject scripts/defects/r04-xp-before-write.patch \
  --inject scripts/defects/r04-reward-earned-unearned.patch \
  --inject scripts/defects/r04-connection-gone-silent.patch \
  --inject scripts/defects/r04-ledger-unread.patch \
  --inject scripts/defects/r04-retry-claims-late.patch \
  --inject scripts/defects/r04-retry-any-user.patch \
  --inject scripts/defects/r04-retry-repeatable.patch \
  --inject scripts/defects/r04-fight-stamp-optimistic.patch --md details.md

# issue #309
node scripts/fix-sensitivity.mjs \
  84390ef fa9290a d4c648c b40abbc 9d65ac9 0da44e1 611979e 1f0584c fd17788 \
  --inject scripts/defects/n02-integrity-to-pc.patch --md details.md

# issue #311
node scripts/fix-sensitivity.mjs \
  d1d7826 4b8b3f3 c3e5dbc 52cdc67 2f7afdb 2e2aebc 97b4438 35f5ecf da75b67 --md details.md
```

Exit code 0 means every entry below is sensitive. Each check runs in a
temporary git worktree; the checkout it is run from is not touched.

## How to read it

- **Revert** (a commit id): the fix commit is checked out, its tests run (all
  pass), then its `src/` changes are undone — the files it changed restored
  from its parent, the files it added deleted — and the same tests run again.
- **Inject** (a patch in `scripts/defects/`): the patch puts the specific
  defect back into HEAD; its preamble names the tests to run and the ones
  that must fail.
- **(new)** marks a test the fix commit added. **(API)** marks a test that
  failed only because an export the fix added was missing ("… is not a
  function"): that shows the test depends on the fix's code, not that it
  catches the behaviour, so it isn't counted. B04's tests were mostly of
  that kind under revert, so B04 is also shown by injecting its defect.
- "timed out — the test hung" is how vitest reports a test that timed out:
  the defect itself is a hang (F06's stalled body, F15's queue).

## Summary by finding

### Issues #300 and #301

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| #300 F01 TRANSCRIPT-LOSS | 3749058 | revert | 4 — `private-channel.test.js` (a failed write's turns kept and written once, in order; retried by itself; two overlapping flushes both land; a journal that can't be created) |
| #300 F02 UPGRADE-DOUBLE-APPLY | 632a180 | revert | 5 — `moveCardRelay.test.js` (Burn / Improve refused until the original is recorded; on a booted table the burn waits for the original, then applies only the upgrade) |
| #300 F03 BURN-PAST-MAX | 632a180 | revert | 4 — `burnMomentum.test.js` (the preview never passes the maximum, impact-reduced maximum included) |
| #300 F04 REPAIR-UNPAID | c925f10 | revert | 4 — `repair.test.js` (no repairs for an unowned payer, too little supply, no payer, or a rejected supply write) |
| #300 F05 SUPPLY-SYNC-DROP | 3749058 | revert | 2 — `sharedSupply.test.js` (an edit during a sync still reaches every PC; the mirror's own writes start no pass) |
| #300 F06 BODY-UNBOUNDED | 23ee366 | revert | 3 — `fetchWithTimeout.test.js` (a stalled body read, a never-ending stream and the Anthropic proxy's caller all time out instead of hanging) |
| #300 F07 SITE-WRONG-SECTOR | c925f10 | revert | 3 — `siteDiscovery.test.js` (reveal and clear take the exact site across sectors); 15 more in `precursorSites.test.js` fail only on the missing `selectSectorSite` |
| #300 F08 AUDIO-DOUBLE-LOOP | 23ee366 | revert | 2 — `audio.test.js` (a resumed segment plays the rest one at a time) |
| #300 F09 AUDIO-STOP-LOADING | 23ee366 | revert | 2 — `audio.test.js` (a sound that loads after stop(), or after another card took over, never plays) |
| #300 F10 PTT-EARLY-RELEASE | 23ee366 | revert | 4 — `speechInput.test.js` (a release before recognition starts cancels it; a late start is stopped) |
| #300 F11 BEGIN-TWICE | c925f10 | revert | 4 — `sessionRelayDialogs.test.js` (a second Begin, or two at once, apply the start effects once) |
| #300 F12 PANEL-ACTOR-STALE | ea69ddf | revert | 6 — `entityPanel.test.js` (Actor create / update / delete re-render the open panel) and `hookGates.test.js` |
| #300 F13 XCARD-IN-FLIGHT | c8e4268 | revert | 4 — `xcardInFlight.test.js` (every narrator entry point discards a reply that arrives after an X-Card) and `multiplayerConcurrency.test.js` (the queued oracle follow-up) |
| #300 F14 CREATE-PERSIST-WHOLE | c8e4268 | revert | 11 — `entityRegistrationMerge.test.js` (every entity creator, art and sector storage keep a mid-narration X-Card), `persistResolutionMerge.test.js`, `campaignStateFields.test.js` |
| #300 F15 QUEUE-CAP-SHORT | 23ee366 | revert | 5 — `gmRelay.test.js` (per-kind budgets, counted from the predecessor's start) and `multiplayerConcurrency.test.js` (a slow follow-up holds the next relay) |
| #300 F16 PRIVATE-LINES-WORDING | ea69ddf | revert | 3 — `helpJournal.test.js` (no help text promises Private Lines are invisible to other players) |
| #300 follow-ups (AUDIO-RESUME-LABEL, PTT-QUICK-REPRESS) | ed8d688 | revert | 4 — `audioCardButton.test.js`, `speechInput.test.js` |
| #301 B01 picker target | f068664 | revert | 15 — `connectionPickerTarget.test.js`, `developRelationship.test.js`, `cardActions.test.js`, `statEnrichment.test.js` |
| #301 B02 same-name vows | 19c5ef0 | revert | 8 — `cardButtonWiring.test.js`, `vowAttribution.test.js`; one more fails only on a missing export |
| #301 B03 Chronicle identity | c958eb0 | revert | 9 — `chronicle.test.js` (rename, same-named characters, split histories), `recap.test.js` |
| #301 B04 recap after a correction | 45b7350 | revert, then inject | revert: 3 (10 more fail only on the missing `campaignRecapCacheKey`); inject `b04-recap-cache-count-only.patch`: 5 — `recap.test.js` (an in-place correction, a same-count replacement, a regeneration from the corrected Chronicle, a pre-hash cache) and `sessionSummary.test.js` (a cache from another chronicle never opens the session) |

### Issue #302 slice B — found by the disturbance matrix

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| LOCK-CLAIM-WEDGE, LOCK-RELEASE-NO-RETRY | ca5bf5d | revert | 2 — `faultMatrix.test.js` (a refused claim, then a move that narrates; a refused release, retried by the pipeline's `finally`) |
| XCARD-UNSAVED-CLAIMED, XCARD-UNSAVED-RELAYED | cdb8c80 | revert | 4 — `faultMatrix.test.js` (the GM's own X-Card; a player's relayed one) and `safety.test.js` (the "could not be saved" wording; the canonical GM's failed write) |
| DRAFT-CONFIRM-TWICE | e572ebd | revert | 1 — `faultMatrix.test.js` (a double-click on Confirm) |
| SUFFER-PICK-TWICE | ec08eb4 | revert | 4 — `faultMatrix.test.js` (two picks on one client; the player and the GM; the pick-two control, which fails because a player's pick could not be recorded on the GM's card) and `gmRelay.test.js` (the kind is declared); 4 more in `sufferCard.test.js` fail only on the missing export |

### Issue #306 — the post-fix audit

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| R01 XCARD-RESUME-REVIVES | 601889d | revert | 3 — `xcardInFlight.test.js` (the card played and resumed during the call: move narration, and the seven other entry points) and `persistResolutionMerge.test.js` (the play count survives a stale persist) |
| R02 CHRONICLE-STALE-SAVE | 059f33b | revert | 5 — `chroniclePanel.test.js` (pin, delete, a re-type from the type select, a second pin and a pin after a delete each keep an entry written after the panel opened); 3 more in `chronicle.test.js` / `recap.test.js` fail only on the missing by-id edits |
| R02 CHRONICLE-APPEND-RACE, R11 CHRONICLE-PLAYER-UNWRITABLE | a2644a9 | revert | 19 — `chronicleRelay.test.js` (overlapping appends; a pin overlapping an append; on a booted table a player's pin and note, the panel's re-render, no GM connected), `chronicleWriter.test.js` (the writer's entry goes to the GM), `chronicle.test.js` (a write reports whether it wrote), `hookGates.test.js`; 5 more fail only on the missing handler |
| R03 SUPPLY-STALE-PASS | 1054cd8 | revert | 2 — `sharedSupply.test.js` (a newer edit to a PC the pass hasn't reached; an older write landing after a PC's own edit) |
| R04 FULFIL-PAID-RACE | 7bf24b9 | revert | 2 — `nativePayoffOnce.test.js` (overlapping fulfilments of one vow; a refused legacy write leaves the cached campaign alone) |
| R04 FORGE-BONDED-RACE | 7bf24b9, test 8bee894 | inject `r04-forge-unclaimed.patch` | 1 — `nativePayoffOnce.test.js` (overlapping forgings). Under revert the forge tests fail only on the missing export; the first version of the test mocked `connection.js` and passed with the defect in (the payoff's second concurrent dynamic import got the real module), so 8bee894 rewrote it on the real store |
| R05 POSITION-PROJECTION-DROPPED | e428b50 | revert | 2 — `progressTrackSelection.test.js` (a bad spot downgrades Take Decisive Action with another fight open; a Strike's position lands on its own fight) |
| R06 TRACK-ROLL-BY-LABEL | e1fd5fb | revert | 7 — `progressTrackSelection.test.js` (combat and expedition rolls on the second of two same-named rows; a row deleted before the roll), `combat.test.js` / `expedition.test.js` (the id rule), `progressRollBridge.test.js` (the panel's and the expedition card's flags) |
| R07 TRANSCRIPT-SESSION-MIX | e2dac8b | revert | 2 — `private-channel.test.js` (a failed batch and an unflushed batch from the last session) |
| R08 TRANSCRIPT-BY-NAME | 92ca408 | revert | 4 — `private-channel.test.js` (a rename; a split session; another user's same-named journal; an unflagged journal stamped) |
| R09 VOLUME-ZERO-LOST | c556612 | revert | 2 — `audioCardButton.test.js` (0% on the card), `audio.test.js` (the blob adapter at 0) |
| R10 PTT-OFF-IGNORED | 10d0f4b | revert | 3 — `speechInputSetting.test.js` (the setting's real onChange, off and on again), `speechInput.test.js` (re-initialising); 3 more fail only on the missing `disableSpeechInput` |
| R12 ENCOUNTER-COMPENDIUM-TOKEN | 70c05d3 | revert | 4 — `encounterSpawn.test.js` (first use imports; an earlier import is reused, either marker; a failed import posts the card) |
| TDA-BUTTON-NO-TARGET — a card names its fight | 23b2c8b | revert | 2 — `progressTrackSelection.test.js` (two fights open: a Strike's Finish the Fight scores and finishes its own fight; Battle from an Enter the Fray card ends its own fight) |
| TDA-BUTTON-NO-TARGET — which fight? | be61488 | revert; inject `tda-which-fight-unspoken.patch`, `tda-which-fight-twice.patch` | 2 under revert — `progressTrackSelection.test.js` (a Take Decisive Action naming no fight posts the card and rolls nothing; one pick per card). By injection: the pick is spoken as the roller (1); the GM's pick stamp holds on another client (1) |
| R04 NATIVE-PAYOFF-NO-RETRY | 514f5eb | revert; inject the eight `r04-*.patch` follow-up patches | 15 under revert — `payoffFailure.test.js` (13: every step lands; a refused legacy write pays no XP and a Retry pays it once; a refused grant posts no "Reward earned"; a refused claim; a connection gone; a step that fails again; the ledger; a duplicate fulfilment; GM only; a refused claim of the card; the forge; a won fight's reward; the victory card's button) and `cardActions.test.js` (2: a mark or a deepen that does not land stays unapplied). 4 more fail only on the missing `applyPayoffRetry`; injection covers each. By injection: XP before the write (1), "Reward earned" after a refused grant (2), a missing connection skipped silently (1), a Retry that ignores the ledger (1), a late claim (3), any user (2), a repeatable Retry (2), an optimistic victory-card stamp (3) |

### Issue #309 — the audit after #307

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| N01 XP-30-TRUNCATION | 84390ef | revert | 4 — `actorBridge.test.js` (28 + 5, 29 + 2 and 42 + 2 XP), `flowDefectFixes.test.js` (a legacy box's XP past 30, and above it) |
| N02 WITHSTAND-RECOVERY-NOOP | 0da44e1 | revert; inject `n02-integrity-to-pc.patch` | 9 under revert — `sufferCard.test.js` (7: strong hit, weak-hit trade, miss, a battered ship, the PC's own battered, a card naming no vehicle, no vehicle at all), `statEnrichment.test.js` (the roll names its vehicle), `persistResolution.test.js` (the card carries the targets). By injection, 9 — six of those card tests (the battered-ship one checks availability, which the patch leaves alone) and the three pipeline tests `consequenceTargets.test.js` gained in 611979e / fd17788 |
| N03 COMPANION-CONSEQUENCES-NOOP | 611979e | revert | 7 — `consequenceTargets.test.js` (a strong hit heals the rolled companion; the weak hit's recovery offered and applied, through the pipeline), `sufferCard.test.js` (weak-hit trade, miss, two companions, none), `statEnrichment.test.js` (the roll names its companion); 4 more in `actorBridge.test.js` fail only on the missing companion helpers |
| N04 GAIN-GROUND-TARGET-LOST | 1f0584c | revert | 6 — `consequenceTargets.test.js` (two fights open: the named fight gains; an old choice after its fight finished marks nothing), `sufferDialog.test.js` (4: the card's own fight; finished; gone or unnamed; an older card's sole-open reading) |
| N05 FULFIL-CLAIM-REFUSED | b40abbc | revert | 2 — `payoffFailure.test.js` (a refused paid flag pays nothing, then a duplicate pays once and the Retry nothing; a Retry after a refused paid flag, then duplicates, pay once) |
| N06 LEGACY-XP-FAILURE-HIDDEN | 9d65ac9 | revert | 4 — `payoffFailure.test.js` (a PC's refused box XP and its Retry; every PC refused, then a Retry refused again; the forge; a box filled in the move pipeline) |
| N07 SUFFER-STAMP-REPEAT | fd17788 | revert | 5 — `sufferCard.test.js` (a refused claim, single and multi-select; a follow-up picker that cannot be posted; a write refused after the claim and its Retry), `consequenceTargets.test.js` (a refused write in a chained choice, its GM Retry on a booted table) |
| N08 END-SESSION-REPEAT | d4c648c | revert | 7 — `sessionRelayDialogs.test.js` (a second End; two at once; the first focus noted; a refused save then a retry; the dialog's wording; on a booted table, two players at once and one after the other) |
| N09 BEGIN-SESSION-CACHE-WEDGE | fa9290a | revert | 1 — `sessionRelayDialogs.test.js` (a refused save leaves the cache as it was, and a retry begins the session) |

### Issue #311 — the audit after #310

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| P01 NEG-MOMENTUM-IGNORED | d1d7826 | revert | 6 — `resolver.test.js` (-3 cancels a 3; adds still count; -2 leaves a 3; a progress roll has no die), `moveRules.test.js` (through the pipeline: a miss, not a strong hit), `bondCommand.test.js` (a `!bond` roll); 1 more fails only on the missing `cancelsActionDie` |
| P02 WEAK-RECOVERY-COST-ONLY | 4b8b3f3 | revert | 9 — `moveRules.test.js` (5: weak Heal wounded paying momentum and paying supply, unwounded; weak Hearten shaken and not), `resolver.test.js` (4: the composed Heal and Hearten options, fresh copies per call, Hearten's table row) |
| P04 BURN-REFUND-NOMINAL | c3e5dbc | revert | 2 — `resultUpgrade.test.js` (a loss clamped at 0 is not refunded; the solo fallback's loss is) |
| P05 IMPROVE-PTP-KEPT | 52cdc67 | revert | 3 — `resultUpgrade.test.js` (Improve rewinds the clock and refunds the health; its reversal card), `improveResult.test.js` (the improve card carries the reversals) |
| P06 UPGRADE-STAMP-REPEAT | 2f7afdb | revert | 6 — `resultUpgrade.test.js` (4: a refused Improve claim, a refused Burn claim, a meter write refused after the claim and its GM Retry, a refused refund after a burn), `actorBridge.test.js` (2: the vow-clock rewind reports what it could not save) |
| P03 UPGRADE-CHOICES-STALE | 2e2aebc, 97b4438 | revert | 8 + 1 — `resultUpgrade.test.js` (6: a burned Face Danger's card retired; a refused retirement still refuses the pick; a burned Hearten offers its recovery once; an improved Heal too; a chosen consequence closes the burn; the GM checks the cards when the close stamp is lost), `burnMomentum.test.js` (2: the blocker's "choice-made", the burn card's targets); 97b4438's own: a pick whose follow-up picker cannot be posted leaves the upgrades open |
| P07 SHIP-FINALIZE-REPEAT | 35f5ecf | revert | 4 — `finalizeLifecycle.test.js` (a repeat Finalise keeps the edited Notes and calls no one; Regenerate re-stamps), `finalize.test.js` (2: a seeded connection's first Finalise stamps it; a blank one too) |
| P08 SESSION-BONUS-NO-RETRY | da75b67 | revert | 2 — `sessionMomentum.test.js` (End: the refused PC's award goes to the GMs' Retry, End again names it, the Retry pays it once; Begin's vignette the same) |

The audit's own probes (issue #311 appendices A and B), with their
assertions inverted to the expected behaviour, pass on the fixed code: all
twelve.

## Controls: new tests that pass with and without the fix

A fix's tests include controls — the case that must keep working — which
pass either way by design. The script lists every new test that passed both
ways; each was read and is a control:

| Test | What it keeps working |
| --- | --- |
| `moveCardRelay` › applyImproveFromRelay swaps the recorded original's meters for the strong hit's | Improve Result still applies once the original is recorded (F02) |
| `xcardInFlight` › without an X-Card the same reply is narrated | narration without an X-Card (F13) |
| `repair` › applies the base points with no trade at all | a repair with no supply trade (F04) |
| `sessionRelayDialogs` › canonical GM: flip → momentum → clocks run locally, in order | the first Begin a Session (F11) |
| `sessionRelayDialogs` › End then Begin applies the next session's start effects | a new session after End (F11) |
| `sharedSupply` › an independent edit on any PC is mirrored to the others | an ordinary sync (F05) |
| `fetchWithTimeout` › a body read in time is returned, and the deadline is cleared | a body read before the deadline (F06) |
| `speechInput` › a normal hold and release stops the capture and keeps its transcript | an ordinary push-to-talk (F10) |
| `speechInput` › a hold that outlasts its utterance does not start a second capture | one utterance per hold (PTT-QUICK-REPRESS) |
| `speechInput` › a run ending after destroy() starts nothing | teardown (PTT-QUICK-REPRESS) |
| `entityPanel` › stays quiet while the panel is closed | no re-render of a closed panel (F12) |
| `entityPanel` › openEntityPanel opens the one Entity Panel on its list | opening the panel once its dead id parameter was removed (PANEL-OPEN-ID-DEAD) |
| `audioCardButton` › reads Pause while a resumed narration is still playing | the label during playback (AUDIO-RESUME-LABEL) |
| `developRelationship` › an empty id falls through to the name ladder | a typed move with no picker id (B01) |
| `developRelationship` › a named bonded connection still resolves to itself | an explicitly named bonded connection (B01) |
| `cardButtonWiring` › a shared vow (one vowId on every PC) still pays every copy | a vow the party swore together (B02) |
| `xcardInFlight` › a narration started after the resume is narrated | resuming lets new narrations run (#306 R01) |
| `xcardInFlight` › a narration started while the X-Card was still active stays paused — no Claude call | the entry gate (#306 R01) |
| `progressTrackSelection` › in control, the same roll stays a strong hit | no downgrade in control (#306 R05) |
| `private-channel` › turns in one session still share one batch — one write per flush | batching within a session (#306 R07) |
| `audioCardButton` › plays at the setting otherwise / plays at 0.8 when the setting is unset | a set volume and the default (#306 R09) |
| `chronicleRelay` › the GM created the journal, and the player cannot write it directly — Foundry's default | the modelled journal permission (#306 R11) |
| `nativePayoffOnce` › two different vows that overlap are both paid | independent vows (#306 R04) |
| `nativePayoffOnce` › a fulfilment after the first has finished pays nothing — the paid flag | the paid flag (#306 R04) |
| `progressTrackSelection` › an older card that names no fight, one fight open, still rolls that fight | a card without the stamp, one fight open (TDA-BUTTON-NO-TARGET) |
| `progressTrackSelection` › a typed Take Decisive Action that names its fight rolls it without asking | no question when the fight is named (TDA-BUTTON-NO-TARGET) |
| `sufferCard` › weak hit: unavailable — and nothing charged — when the companion is at 0 | the recovery's own rule: no health, no trade (#309 N03) |
| `moveRules` › a negative momentum that does not match leaves the die: -2 with a 3 is a strong hit | a nonmatching negative momentum (#311 P01) |
| `resolver` › positive momentum, or none given, cancels nothing | no momentum input, as Quench's calls (#311 P01) |
| `bondCommand` › a negative momentum that does not match the die leaves it | the same on `!bond` (#311 P01) |
| `resultUpgrade` › the ordinary route still refunds its loss: Endure Harm, health 5 → 4 → 5 | the refund that already worked (#311 P04) |
| `resultUpgrade` › Burn Momentum to a strong hit: the clock rewinds to 0/4 and health 4 → 5 | the burn's reversal, which Improve now shares (#311 P05) |

Two more passed both ways under 611979e's revert because they cover N02,
fixed in the commit before it: `consequenceTargets` › a strong hit's +1
integrity raises it / a weak hit's trade costs a momentum and raises it.
Injecting N02's defect (`n02-integrity-to-pc.patch`) fails both.

## Details

Generated by the command above.

### 632a180 — fix: Burn Momentum / Improve Result apply only the final outcome (issue #300 F02, F03)

Test files: `tests/unit/burnMomentum.test.js`, `tests/unit/moveCardRelay.test.js`. Source restored: 4 file(s).

- With the fix: 50 passed, 0 failed.
- Without it: 9 failed (9 new; 0 only for a missing export); 41 still pass (1 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/burnMomentum.test.js › buildBurnState never previews momentum above the maximum (10/10 with +1 against [9, 10]) | AssertionError: expected { canBurn: true, …(11) } to be null |
| (new) tests/unit/burnMomentum.test.js › buildBurnState records the clamped momentum on an eligible card | AssertionError: expected 11 to be 10 // Object.is equality |
| (new) tests/unit/burnMomentum.test.js › buildBurnState clamps to an impact-reduced maximum (two impacts: max 8) | AssertionError: expected { canBurn: true, …(11) } to be null |
| (new) tests/unit/burnMomentum.test.js › buildBurnState counts only impacts, not every truthy debility field | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/moveCardRelay.test.js › applyBurnFromRelay refuses while the original outcome is not recorded yet | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/moveCardRelay.test.js › applyBurnFromRelay burns the momentum the PC holds now, not the card's stale preview | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/moveCardRelay.test.js › applyBurnFromRelay is refused once the result was improved, and an improvement once momentum was burned | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/moveCardRelay.test.js › applyImproveFromRelay refuses while the original outcome is not recorded yet (issue #300 F02) | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/moveCardRelay.test.js › across a booted table Burn Momentum waits for the original result to be recorded, then applies only the upgraded one | AssertionError: expected false to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/moveCardRelay.test.js › applyImproveFromRelay swaps the recorded original's meters for the strong hit's

### c8e4268 — fix: an X-Card played mid-narration stops it and is never reverted (issue #300 F13, F14)

Test files: `tests/unit/campaignStateFields.test.js`, `tests/unit/entityRegistrationMerge.test.js`, `tests/unit/multiplayerConcurrency.test.js`, `tests/unit/persistResolutionMerge.test.js`, `tests/unit/xcardInFlight.test.js`. Source restored: 12 file(s).

- With the fix: 38 passed, 0 failed.
- Without it: 15 failed (14 new; 0 only for a missing export); 23 still pass (1 new).
- Verdict: **sensitive** — 15 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/campaignStateFields.test.js › campaignState fields — a writer and a reader for each src/entities/registry.js ENTITY_ID_LISTS names only live fields | Error: ENTITY_ID_LISTS not found in src/entities/registry.js |
| (new) tests/unit/entityRegistrationMerge.test.js › createConnection keeps what was relayed meanwhile and registers the new id on the store | AssertionError: expected { xCardActive: false, …(2) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › createSettlement keeps what was relayed meanwhile and registers the new id on the store | AssertionError: expected { xCardActive: false, …(2) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › createPlanet keeps what was relayed meanwhile and registers the new id on the store | AssertionError: expected { xCardActive: false, …(2) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › createLocation keeps what was relayed meanwhile and registers the new id on the store | AssertionError: expected { xCardActive: false, …(2) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › createShip keeps what was relayed meanwhile and registers the new id on the store | AssertionError: expected { xCardActive: false, …(2) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › createCreature keeps what was relayed meanwhile and registers the new id on the store | AssertionError: expected { xCardActive: false, …(2) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › createFaction keeps what was relayed meanwhile and registers the new id on the store | AssertionError: expected { xCardActive: false, …(2) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › storeArtAsset adds its index entry to the store without reverting relayed writes | AssertionError: expected { xCardActive: false, …(1) } to match object { xCardActive: true, …(2) } |
| (new) tests/unit/entityRegistrationMerge.test.js › storeSector writes the sector, the active sector and its entity ids onto the latest store | AssertionError: expected { xCardActive: false, …(5) } to match object { xCardActive: true, …(2) } |
| tests/unit/multiplayerConcurrency.test.js › the GM relay queue runs relayed actions one at a time — a flag waits for the oracle follow-up ahead of it — but the X-Card skips the line | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |
| (new) tests/unit/persistResolutionMerge.test.js › persistResolution — concurrent writes survive the stale working copy keeps every art index entry from both sides | AssertionError: expected { Object (a-pipeline) } to deeply equal { …(2) } |
| (new) tests/unit/xcardInFlight.test.js › an X-Card played while the narration is generated discards the reply move narration: the paused notice, no narrator card, no sidecar facts | AssertionError: expected 'The reactor screams as the hull split…' to be null |
| (new) tests/unit/xcardInFlight.test.js › an X-Card played while the narration is generated discards the reply @scene: the paused fallback card, no answer | AssertionError: expected 'The reactor screams as the hull split…' to be null |
| (new) tests/unit/xcardInFlight.test.js › an X-Card played while the narration is generated discards the reply paced narration, the oracle follow-up, vignettes, clocks, vow scenes and the inciting incident return nothing | AssertionError: expected [ …(6) ] to deeply equal [ null, null, null, null, null, null ] |

- New test passing with and without the fix (a control?): tests/unit/xcardInFlight.test.js › an X-Card played while the narration is generated discards the reply without an X-Card the same reply is narrated

### c925f10 — fix: repairs need paid supply, sites match across sectors, a session begins once (issue #300 F04, F07, F11)

Test files: `tests/unit/precursorSites.test.js`, `tests/unit/repair.test.js`, `tests/unit/sessionRelayDialogs.test.js`, `tests/unit/siteDiscovery.test.js`. Source restored: 7 file(s).

- With the fix: 100 passed, 0 failed.
- Without it: 26 failed (26 new; 15 only for a missing export); 74 still pass (3 new).
- Verdict: **sensitive** — 11 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector returns null when there are no undiscovered sites | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector matches an exact name (case-insensitive, leading 'the' stripped) | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector matches a substring in either direction | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector falls back to a type keyword when one undiscovered site of that type exists | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector substring-matches the first candidate when the keyword is in several names | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector returns null for an ambiguous keyword with no name hit and several candidates | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector auto-selects the sole undiscovered site when nothing else matches | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — the ladder within a sector takes an explicit site id over every rung, and honours `eligible` | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — requireLabelMatch (expedition→site stamping) still falls back to the sole undiscovered site by default (reveal path) | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — requireLabelMatch (expedition→site stamping) returns null for a non-matching label when requireLabelMatch is set (stamping path) | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — requireLabelMatch (expedition→site stamping) still resolves confident matches with requireLabelMatch set | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — across sectors an exact name in a later sector beats an earlier sector's sole site | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — across sectors an explicit site id beats an earlier sector's sole site | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — across sectors a type-keyword guess is ambiguous across sectors unless the active sector settles it | TypeError: (0 , selectSectorSite) is not a function |
| (new) (API) tests/unit/precursorSites.test.js › selectSectorSite — across sectors the sole-site guess fires only when one candidate is left in scope | TypeError: (0 , selectSectorSite) is not a function |
| (new) tests/unit/repair.test.js › applyRepairSpends refuses to debit a PC the requester does not own — and repairs nothing | AssertionError: expected 3 to be 1 // Object.is equality |
| (new) tests/unit/repair.test.js › applyRepairSpends spends nothing and repairs nothing when the PC has less supply than traded | AssertionError: expected +0 to be 1 // Object.is equality |
| (new) tests/unit/repair.test.js › applyRepairSpends repairs nothing when no character resolved to pay | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/repair.test.js › applyRepairSpends repairs nothing when the supply write is rejected | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) tests/unit/sessionRelayDialogs.test.js › Begin a Session applies a session's start effects once — a second Begin posts a note and changes nothing | AssertionError: expected undefined to be 'JvvW103HGCE4VSvR' // Object.is equality |
| (new) tests/unit/sessionRelayDialogs.test.js › Begin a Session two Begins at once apply the start effects once | AssertionError: expected [ 'momentum:a1:1', …(3) ] to deeply equal [ 'momentum:a1:1', …(2) ] |
| (new) tests/unit/sessionRelayDialogs.test.js › Begin a Session a session that went idle is begun anew, although nobody ended it | AssertionError: expected 's-old' to be 'DFh6ke4LnbRURFAh' // Object.is equality |
| (new) tests/unit/sessionRelayDialogs.test.js › Begin a Session the dialog does not open on a session already begun | AssertionError: expected [ { …(3) } ] to have a length of +0 but got 1 |
| (new) tests/unit/siteDiscovery.test.js › reveal / clear across sectors (issue #300 F07) reveals the exact target with its id, not the earlier sector's sole site | AssertionError: expected 'mine' to be 'target-site' // Object.is equality |
| (new) tests/unit/siteDiscovery.test.js › reveal / clear across sectors (issue #300 F07) reveals the exact name without an id | AssertionError: expected 'mine' to be 'target-site' // Object.is equality |
| (new) tests/unit/siteDiscovery.test.js › reveal / clear across sectors (issue #300 F07) clears the exact target, not the earlier sector's sole discovered site | AssertionError: expected 'mine' to be 'target-site' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/repair.test.js › applyRepairSpends applies the base points with no trade at all
- New test passing with and without the fix (a control?): tests/unit/sessionRelayDialogs.test.js › Begin a Session canonical GM: flip → momentum → clocks run locally, in order
- New test passing with and without the fix (a control?): tests/unit/sessionRelayDialogs.test.js › Begin a Session End then Begin applies the next session's start effects

### 3749058 — fix: Private Channel turns survive a failed save; shared supply converges (issue #300 F01, F05)

Test files: `tests/unit/private-channel.test.js`, `tests/unit/sharedSupply.test.js`. Source restored: 2 file(s).

- With the fix: 56 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 50 still pass (1 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/private-channel.test.js › transcript write/read keeps the turns of a failed write and writes them once, in order, on the retry | AssertionError: Target cannot be null or undefined. |
| (new) tests/unit/private-channel.test.js › transcript write/read retries a failed write by itself | AssertionError: expected '&lt;p class="pc-turn pc-turn-player">&lt;st…' to contain 'Kept.' |
| (new) tests/unit/private-channel.test.js › transcript write/read two overlapping flushes both land — the second builds on the first | timed out — the test hung |
| (new) tests/unit/private-channel.test.js › transcript write/read keeps the turns when the journal cannot be created, and writes them to their own session's page later | AssertionError: expected '' to contain 'In session one.' |
| (new) tests/unit/sharedSupply.test.js › the updateActor hook (canonical GM) a second edit made while a sync is writing still reaches every PC — once, with no cascade | AssertionError: expected 4 to be 3 // Object.is equality |
| (new) tests/unit/sharedSupply.test.js › the updateActor hook (canonical GM) its own sibling writes never start another pass | AssertionError: expected "update" to not be called at all, but actually been called 1 times |

- New test passing with and without the fix (a control?): tests/unit/sharedSupply.test.js › the updateActor hook (canonical GM) an independent edit on any PC is mirrored to the others

### 23ee366 — fix: request deadlines cover the body; audio, push-to-talk and the GM queue stop overrunning (issue #300 F06, F08, F09, F10, F15)

Test files: `tests/unit/audio.test.js`, `tests/unit/fetchWithTimeout.test.js`, `tests/unit/gmRelay.test.js`, `tests/unit/multiplayerConcurrency.test.js`, `tests/unit/speechInput.test.js`. Source restored: 4 file(s).

- With the fix: 142 passed, 0 failed.
- Without it: 16 failed (16 new; 0 only for a missing export); 126 still pass (2 new).
- Verdict: **sensitive** — 16 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audio.test.js › PlaybackSession resumes a paused segment and still plays the rest one at a time | AssertionError: expected [ '/A.mp3', '/B.mp3', '/C.mp3' ] to deeply equal [ '/A.mp3', '/B.mp3' ] |
| (new) tests/unit/audio.test.js › PlaybackSession pausing and resuming twice in one segment still starts the next segment once | AssertionError: expected [ '/A.mp3', '/B.mp3', '/C.mp3' ] to deeply equal [ '/A.mp3', '/B.mp3' ] |
| (new) tests/unit/audio.test.js › PlaybackSession a sound that finishes loading after stop() never plays | timed out — the test hung |
| (new) tests/unit/audio.test.js › PlaybackSession a card that takes over while the old one loads is the only one heard | AssertionError: expected [ '/old.mp3', '/new.mp3' ] to deeply equal [ '/new.mp3' ] |
| (new) tests/unit/fetchWithTimeout.test.js › fetchWithTimeout — the deadline covers the body rejects a body read that stalls past timeoutMs | timed out — the test hung |
| (new) tests/unit/fetchWithTimeout.test.js › fetchWithTimeout — the deadline covers the body stops a real Response whose stream never ends | timed out — the test hung |
| (new) tests/unit/fetchWithTimeout.test.js › fetchWithTimeout — the deadline covers the body a caller of the Anthropic proxy gets the timeout, not a hang | timed out — the test hung |
| (new) tests/unit/gmRelay.test.js › GM_ACTIONS wiring contract marks the handlers that await a Claude call, and their budget covers two bounded requests | AssertionError: expected [] to deeply equal [ 'move.burnMomentum', …(4) ] |
| (new) tests/unit/gmRelay.test.js › runGmAction — serialised on the GM a Claude-calling action ahead is waited on for its own, longer budget | AssertionError: expected "applySafetyFlag" to not be called at all, but actually been called 1 times |
| (new) tests/unit/gmRelay.test.js › runGmAction — serialised on the GM a Claude-calling action that never settles is still passed, after GM_CLAUDE_ACTION_TIMEOUT_MS | timed out — the test hung |
| (new) tests/unit/gmRelay.test.js › runGmAction — serialised on the GM a backlog behind a hung action still runs one at a time — each budget counts from when that action starts | AssertionError: expected [] to deeply equal [ 'b:start' ] |
| (new) tests/unit/multiplayerConcurrency.test.js › the GM relay queue a slow follow-up holds the next relay past GM_ACTION_TIMEOUT_MS; a stalled request ends at its deadline and the relay runs | AssertionError: expected [ { _id: '9m259DRp3t1vRxZn', …(4) } ] to be undefined |
| (new) tests/unit/speechInput.test.js › push-to-talk start / release a release before recognition starts cancels it | AssertionError: expected [ 'start' ] to deeply equal [ 'start', 'abort' ] |
| (new) tests/unit/speechInput.test.js › push-to-talk start / release a start that arrives after the release is stopped at once | AssertionError: expected [ 'start' ] to deeply equal [ 'start', 'abort', 'abort' ] |
| (new) tests/unit/speechInput.test.js › push-to-talk start / release pressing again while recognition is still starting does not start it twice | AssertionError: expected [ 'start', 'start' ] to deeply equal [ 'start' ] |
| (new) tests/unit/speechInput.test.js › push-to-talk start / release after a cancelled start ends, the next press starts a fresh capture | AssertionError: expected [ 'start', 'start', 'stop' ] to deeply equal [ 'start', 'abort', 'start', 'stop' ] |

- New test passing with and without the fix (a control?): tests/unit/fetchWithTimeout.test.js › fetchWithTimeout — the deadline covers the body a body read in time is returned, and the deadline is cleared
- New test passing with and without the fix (a control?): tests/unit/speechInput.test.js › push-to-talk start / release a normal hold and release stops the capture and keeps its transcript

### ea69ddf — fix: the Entity Panel refreshes for Actor-hosted entities; Private Lines help states real privacy (issue #300 F12, F16)

Test files: `tests/unit/entityPanel.test.js`, `tests/unit/helpJournal.test.js`, `tests/unit/hookGates.test.js`. Source restored: 3 file(s).

- With the fix: 13 passed, 0 failed.
- Without it: 9 failed (8 new; 0 only for a missing export); 4 still pass (1 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityPanel.test.js › Entity Panel — Actor-hosted entities creating an entity Actor re-renders the open panel, which lists it; a plain Actor does not | AssertionError: expected "render" to be called 1 times, but got 0 times |
| (new) tests/unit/entityPanel.test.js › Entity Panel — Actor-hosted entities a rename, a record edit or a ship impact re-renders; an unrelated Actor update does not | AssertionError: expected "render" to be called 3 times, but got 0 times |
| (new) tests/unit/entityPanel.test.js › Entity Panel — Actor-hosted entities removing an entity record from an Actor re-renders, so the entry leaves the list | AssertionError: expected "render" to be called 1 times, but got 0 times |
| (new) tests/unit/entityPanel.test.js › Entity Panel — Actor-hosted entities deleting the selected entity Actor clears the selection and re-renders the list | AssertionError: expected "render" to be called 1 times, but got 0 times |
| (new) tests/unit/entityPanel.test.js › Entity Panel — Actor-hosted entities deleting an entity Actor re-renders the list; deleting a plain Actor does not | AssertionError: expected "render" to be called 1 times, but got 0 times |
| (new) tests/unit/helpJournal.test.js › help journal — Private Lines privacy wording no longer promises the lines are never visible to other players | AssertionError: expected '&lt;h2>Safety System&lt;/h2>&lt;p>The safety s…' not to match /never visible to other players/i |
| (new) tests/unit/helpJournal.test.js › help journal — Private Lines privacy wording says who can see them, what is never shared, and that they sit in shared world data | AssertionError: expected '&lt;h2>Safety System&lt;/h2>&lt;p>The safety s…' to contain '&lt;strong>Who can see them:&lt;/strong> th…' |
| (new) tests/unit/helpJournal.test.js › help journal — Private Lines privacy wording no module text promises Private Lines are visible only to their owner | AssertionError: expected [ 'src/help/helpJournal.js', …(1) ] to deeply equal [] |
| tests/unit/hookGates.test.js › document hook handlers run their shared writes on one client every LOCAL_ONLY entry still names an ungated handler | AssertionError: src/ui/entityPanel.js createActor inline#1 no longer exists — remove it from LOCAL_ONLY: expected false to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/entityPanel.test.js › Entity Panel — Actor-hosted entities stays quiet while the panel is closed

### ed8d688 — fix: resumed audio labels, quick push-to-talk re-press, dead entity-panel id (issue #300 follow-ups)

Test files: `tests/unit/audioCardButton.test.js`, `tests/unit/entityPanel.test.js`, `tests/unit/speechInput.test.js`. Source restored: 4 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 15 still pass (4 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioCardButton.test.js › narrator card audio button reads Play once a resumed narration has finished — not Pause | AssertionError: expected 'playing' to be 'idle' // Object.is equality |
| (new) tests/unit/speechInput.test.js › push-to-talk pressed again before the last run has ended a press while a cancelled start winds down captures once the run ends | AssertionError: expected [ 'start', 'abort', 'stop' ] to deeply equal [ 'start', 'abort', 'start', 'stop' ] |
| (new) tests/unit/speechInput.test.js › push-to-talk pressed again before the last run has ended a press while the last utterance is processed captures after it | AssertionError: expected [ 'start', 'stop' ] to deeply equal [ 'start', 'stop', 'start' ] |
| (new) tests/unit/speechInput.test.js › push-to-talk pressed again before the last run has ended a press released again before the run ends starts nothing | AssertionError: expected [ 'start', 'abort', 'abort' ] to deeply equal [ 'start', 'abort' ] |

- New test passing with and without the fix (a control?): tests/unit/audioCardButton.test.js › narrator card audio button reads Pause while a resumed narration is still playing
- New test passing with and without the fix (a control?): tests/unit/entityPanel.test.js › openEntityPanel opens the one Entity Panel on its list
- New test passing with and without the fix (a control?): tests/unit/speechInput.test.js › push-to-talk pressed again before the last run has ended a hold that outlasts its utterance does not start a second capture
- New test passing with and without the fix (a control?): tests/unit/speechInput.test.js › push-to-talk pressed again before the last run has ended a run ending after destroy() starts nothing

### f068664 — fix: the connection picker's choice reaches the move it forces (issue #301 B01)

Test files: `tests/unit/cardActions.test.js`, `tests/unit/connectionPickerTarget.test.js`, `tests/unit/developRelationship.test.js`, `tests/unit/statEnrichment.test.js`. Source restored: 4 file(s).

- With the fix: 106 passed, 0 failed.
- Without it: 15 failed (13 new; 0 only for a missing export); 91 still pass (2 new).
- Verdict: **sensitive** — 15 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/cardActions.test.js › applyConnectionPick posts the forced move once, speaking as the clicker's PC, and resolves the card | AssertionError: expected { bypassPacing: true, …(1) } to deeply equal { bypassPacing: true, …(3) } |
| (new) tests/unit/cardActions.test.js › applyConnectionPick names the card's choice — not the client's relayed name — as the target | AssertionError: expected { bypassPacing: true, …(1) } to match object { forcedMoveTarget: 'Sable', …(1) } |
| tests/unit/cardActions.test.js › applyConnectionPick validates a card that predates the choices flag against its button HTML (develop) | AssertionError: expected { bypassPacing: true, …(1) } to match object { …(3) } |
| (new) tests/unit/cardActions.test.js › applyConnectionPick a pre-choices button with no host id still names its connection | AssertionError: expected undefined to be 'Ren' // Object.is equality |
| (new) tests/unit/connectionPickerTarget.test.js › Forge a Bond from the picker several un-bonded connections: the pick is scored and forged (was score 0, a certain miss) | AssertionError: expected { …(17) } to match object { moveId: 'forge_a_bond', …(3) } |
| (new) tests/unit/connectionPickerTarget.test.js › Forge a Bond from the picker with one bonded connection, the pick — not the bonded one — is scored and forged | AssertionError: expected 40 to be 32 // Object.is equality |
| (new) tests/unit/connectionPickerTarget.test.js › Forge a Bond from the picker typed with no target: the sole un-bonded connection is scored and forged, never the bonded one | AssertionError: expected 40 to be 32 // Object.is equality |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship from the picker marks the picked connection — not the sole bonded one | AssertionError: expected { …(17) } to match object { …(2) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship from the picker with several un-bonded connections the pick is still marked (was: nothing) | AssertionError: expected +0 to be 8 // Object.is equality |
| (new) tests/unit/developRelationship.test.js › selectConnection by host id (a picker's choice) resolves the id over the sole-bonded fallback and over a same-named connection | AssertionError: expected 'a' to be 'b' // Object.is equality |
| (new) tests/unit/developRelationship.test.js › selectConnection by host id (a picker's choice) an id that matches no active connection resolves nothing — never a name guess | AssertionError: expected { _id: 'b', name: 'Sable', …(4) } to be null |
| (new) tests/unit/developRelationship.test.js › selectConnection unbonded (Forge a Bond) never falls back to a bonded connection | AssertionError: expected 'a' to be 'b' // Object.is equality |
| (new) tests/unit/developRelationship.test.js › selectConnection unbonded (Forge a Bond) returns null when several un-bonded connections could be meant | AssertionError: expected { _id: 'a', name: 'Kira', …(3) } to be null |
| (new) tests/unit/statEnrichment.test.js › enrichProgressTicks forge_a_bond: the picker's host id scores the picked connection | AssertionError: expected { source: 'connection', …(4) } to match object { label: 'Sable', ticks: 32 } |
| (new) tests/unit/statEnrichment.test.js › enrichProgressTicks forge_a_bond: no target and several un-bonded connections scores nothing — not the bonded one | AssertionError: expected 40 to be +0 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/developRelationship.test.js › selectConnection by host id (a picker's choice) an empty id falls through to the name ladder
- New test passing with and without the fix (a control?): tests/unit/developRelationship.test.js › selectConnection unbonded (Forge a Bond) a named bonded connection still resolves to itself (the forge then pays nothing)

### 19c5ef0 — fix: vow payoffs resolve the roller's own vow (issue #301 B02)

Test files: `tests/unit/cardButtonWiring.test.js`, `tests/unit/vowAttribution.test.js`. Source restored: 1 file(s).

- With the fix: 34 passed, 0 failed.
- Without it: 9 failed (9 new; 1 only for a missing export); 25 still pass (1 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) native fulfil (roller's vow already completed, the other still open): the roller is paid, the other PC untouched | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) native fulfil with both still open: the roller's vow, though another PC is listed first | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) the other PC's vow is paid on their own fulfilment — not early, on the roller's | AssertionError: expected { stamped: true, supplied: true, …(1) } to deeply equal { stamped: false, …(2) } |
| (new) tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) resolveVowItemCopies: the roller's vow (open before completed), the scored item by id, else the old ladder | AssertionError: expected 'v-a' to be 'v-b' // Object.is equality |
| (new) tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) a duplicated actor's shared item id resolves to the roller's copy | AssertionError: expected 'pc-a' to be 'pc-b' // Object.is equality |
| (new) tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) resolveVowHolderActor: the roller holds their own same-named vow | AssertionError: expected { id: 'pc-a', name: 'Ash', …(12) } to be { id: 'pc-b', name: 'Bex', …(12) } // Object.is equality |
| (new) (API) tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) the won-fight card names the roller's vow rank and connection — 🤝 Deepen acts on it | TypeError: (0 , postFightVowMilestoneCard) is not a function |
| (new) tests/unit/vowAttribution.test.js › Fulfill Your Vow completes and pays the roller's vow — not the first PC's same-named one | AssertionError: expected { completed: false, paid: true } to deeply equal { completed: true, paid: true } |
| (new) tests/unit/vowAttribution.test.js › Forsake Your Vow forsakes the roller's vow — not the first PC's same-named one | AssertionError: expected { completed: false, forsaken: false } to deeply equal { completed: true, forsaken: true } |

- New test passing with and without the fix (a control?): tests/unit/cardButtonWiring.test.js › independent same-name vows — every payoff resolves the roller's own vow (issue #301 B02) a shared vow (one vowId on every PC) still pays every copy, the reward to the roller

### c958eb0 — fix: a Chronicle belongs to its actor by id, not by name (issue #301 B03)

Test files: `tests/unit/chronicle.test.js`, `tests/unit/recap.test.js`. Source restored: 3 file(s).

- With the fix: 54 passed, 0 failed.
- Without it: 9 failed (9 new; 0 only for a missing export); 45 still pass (0 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) a rename keeps the history in one journal, relabelled with the new name | AssertionError: expected [ 'We opened the vault.' ] to deeply equal [ 'We found the vault.', …(1) ] |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) characters who share a name keep separate chronicles | AssertionError: expected [ 'Ash A found a vault.', …(1) ] to deeply equal [ 'Ash A found a vault.' ] |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) a history an earlier rename split reads as one, and the next write folds it into one journal | AssertionError: expected [ 'We opened the vault.' ] to deeply equal [ 'We found the vault.', …(2) ] |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) an edit and a panel save reach an entry wherever a split left it — and a delete sticks | AssertionError: expected [ 'We opened the vault.' ] to deeply equal [ 'Vex survived.', …(1) ] |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) never attaches a journal that belongs to another character, whatever its name | AssertionError: expected [ 'Ash\'s secret.' ] to deeply equal [] |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) adopts an unflagged journal under the name when one character has it, and stamps it on write | TypeError: Cannot read properties of undefined (reading 'chronicleActorId') |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) no code outside chronicle.js finds a Chronicle journal by its name (the panel and Quench did) | AssertionError: expected [ 'character/chroniclePanel.js', …(1) ] to deeply equal [] |
| (new) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) attaches an unflagged journal to neither of two characters who share its name | AssertionError: expected [ 'Whose is this?' ] to deeply equal [] |
| (new) tests/unit/recap.test.js › getCampaignRecap() — same-named characters (issue #301 B03) each character's entries reach the recap once | AssertionError: expected 2 to be 1 // Object.is equality |

### 45b7350 — fix: the campaign recap is used only while it matches its chronicle (issue #301 B04)

Test files: `tests/unit/narratorDetailPersistence.test.js`, `tests/unit/recap.test.js`, `tests/unit/sessionManagement.test.js`, `tests/unit/sessionSummary.test.js`. Source restored: 3 file(s).

- With the fix: 108 passed, 0 failed.
- Without it: 13 failed (9 new; 10 only for a missing export); 95 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (API) tests/unit/narratorDetailPersistence.test.js › a session carries into the next one (C3, C4) End a Session, then Begin: a new session, told what happened last session | TypeError: campaignRecapCacheKey is not a function |
| (API) tests/unit/narratorDetailPersistence.test.js › a session carries into the next one (C3, C4) chat activity keeps a long session alive; once idle past four hours it is not revived | TypeError: campaignRecapCacheKey is not a function |
| (new) (API) tests/unit/recap.test.js › getCampaignRecap() — cache returns cached text while the chronicle is unchanged | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) an in-place correction invalidates it — and with no key, no stale recap is returned | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) a same-count replacement — the wrong entry deleted, the right one added — invalidates it | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) with a key, the recap is regenerated from the corrected chronicle, and that cache is then reused | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) an unchanged chronicle reuses the cache without a Claude call | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) pinning or re-typing an entry keeps the recap — neither is in it | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) forceRefresh regenerates even a current recap | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) a cache from before the hash existed is regenerated once, even with a matching count | AssertionError: expected 'Old recap.' to be 'Fresh recap.' // Object.is equality |
| tests/unit/sessionManagement.test.js › CampaignStateSchema includes campaignRecapCache field with expected shape | AssertionError: expected undefined to be null |
| (API) tests/unit/sessionSummary.test.js › earlier sessions reach every prose mode (issue #286 C3) the campaign recap comes from its cache on the session's first narration only, in any mode | TypeError: (0 , campaignRecapCacheKey) is not a function |
| (new) tests/unit/sessionSummary.test.js › earlier sessions reach every prose mode (issue #286 C3) a cache made from a different chronicle never opens the session (issue #301 B04) | AssertionError: expected 'The campaign so far.' to be '' // Object.is equality |

### ca5bf5d — fix: a refused write no longer leaves the move lock set (issue #302)

Test files: `tests/unit/faultMatrix.test.js`. Source restored: 1 file(s).

- With the fix: 16 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 14 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/faultMatrix.test.js › the move lock survives a refused write the lock claim is refused: no move runs, the GM is told, and the next move runs — the lock is not left set | AssertionError: expected [] to deep equally contain StringMatching{…} |
| (new) tests/unit/faultMatrix.test.js › the move lock survives a refused write the lock release is refused once: the pipeline's finally releases it — the next move runs | AssertionError: expected true to be false // Object.is equality |

### cdb8c80 — fix: the X-Card card says when its pause could not be saved (issue #302)

Test files: `tests/unit/faultMatrix.test.js`, `tests/unit/safety.test.js`. Source restored: 2 file(s).

- With the fix: 46 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 42 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/faultMatrix.test.js › the X-Card card says whether its pause was saved the GM's X-Card pause is refused: the card says it was not saved, with no resume button | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/faultMatrix.test.js › the X-Card card says whether its pause was saved a player's X-Card the GM cannot save: the GM's card says so — the player's card could not know | AssertionError: expected [ [ 'pl-1', true ] ] to deeply equal [ [ 'pl-1', true ], [ 'gm-1', false ] ] |
| (new) tests/unit/safety.test.js › X-Card play / resume postXCardCard (not saved) says the pause could not be saved, with no resume button | AssertionError: expected '&lt;div class="starforged-move-card xcar…' to match /The pause could not be saved/ |
| (new) tests/unit/safety.test.js › X-Card play / resume playXCard on the canonical GM whose write fails says the pause was not saved | AssertionError: expected { recorded: true } to deeply equal { recorded: false } |

### e572ebd — fix: Confirm on a new NPC's draft card creates it once (issue #302)

Test files: `tests/unit/faultMatrix.test.js`. Source restored: 1 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 18 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/faultMatrix.test.js › Confirm on a new NPC's draft card applies once Confirm on a new NPC clicked twice before the first finished: one NPC card | AssertionError: expected [ …(2) ] to have a length of 1 but got 2 |

### ec08eb4 — fix: a suffer card applies one pick, on the canonical GM (issue #302)

Test files: `tests/unit/faultMatrix.test.js`, `tests/unit/gmRelay.test.js`, `tests/unit/sufferCard.test.js`. Source restored: 2 file(s).

- With the fix: 96 passed, 0 failed.
- Without it: 8 failed (7 new; 4 only for a missing export); 87 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/faultMatrix.test.js › a suffer card applies one pick two suffer moves picked from one card on one client: one is applied | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/faultMatrix.test.js › a suffer card applies one pick the player and the GM each pick a suffer move from the same card: one is applied | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/faultMatrix.test.js › a suffer card applies one pick a pick-two card still takes two picks, one after the other (control) | AssertionError: expected { sufferCard: true, …(6) } to match object { resolved: false, …(1) } |
| tests/unit/gmRelay.test.js › GM_ACTIONS wiring contract declares the one-shot card-button kinds | AssertionError: suffer.pick: expected undefined to be defined |
| (new) (API) tests/unit/sufferCard.test.js › applySufferPickFromRelay — a pick applies once, on the canonical GM applies the owner's pick and resolves the card; a second pick applies nothing | TypeError: (0 , applySufferPickFromRelay) is not a function |
| (new) (API) tests/unit/sufferCard.test.js › applySufferPickFromRelay — a pick applies once, on the canonical GM refuses a requester who neither is a GM nor owns the PC | TypeError: (0 , applySufferPickFromRelay) is not a function |
| (new) (API) tests/unit/sufferCard.test.js › applySufferPickFromRelay — a pick applies once, on the canonical GM refuses a pick the card does not offer — the payload only names a button | TypeError: (0 , applySufferPickFromRelay) is not a function |
| (new) (API) tests/unit/sufferCard.test.js › applySufferPickFromRelay — a pick applies once, on the canonical GM warns and applies nothing when the card is gone | TypeError: (0 , applySufferPickFromRelay) is not a function |

### `scripts/defects/b04-recap-cache-count-only.patch` — B04 (issue #301) — the campaign recap cache is checked by its entry count only, so a correction that keeps the count keeps the stale recap

Test files: `tests/unit/recap.test.js`, `tests/unit/sessionSummary.test.js`.

- On HEAD: 62 passed, 0 failed.
- With the defect: 5 failed (0 only for a missing export); 57 still pass.
- Verdict: **sensitive** — 5 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) an in-place correction invalidates it — and with no key, no stale recap is returned | AssertionError: expected 'Vex died.' to be '' // Object.is equality |
| tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) a same-count replacement — the wrong entry deleted, the right one added — invalidates it | AssertionError: expected 'Vex died.' to be '' // Object.is equality |
| tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) with a key, the recap is regenerated from the corrected chronicle, and that cache is then reused | AssertionError: expected 'Vex died.' to be 'Fresh recap.' // Object.is equality |
| tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) a cache from before the hash existed is regenerated once, even with a matching count | AssertionError: expected 'Old recap.' to be 'Fresh recap.' // Object.is equality |
| tests/unit/sessionSummary.test.js › earlier sessions reach every prose mode (issue #286 C3) a cache made from a different chronicle never opens the session (issue #301 B04) | AssertionError: expected 'The campaign so far.' to be '' // Object.is equality |

### 601889d — fix: a resumed X-Card no longer revives the narration it stopped (issue #306 R01)

Test files: `tests/unit/persistResolutionMerge.test.js`, `tests/unit/xcardInFlight.test.js`. Source restored: 3 file(s).

- With the fix: 21 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 18 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/persistResolutionMerge.test.js › persistResolution — concurrent writes survive the stale working copy keeps the X-Card play count when the card is played and resumed mid-pipeline (issue #306 R01) | AssertionError: expected undefined to be 1 // Object.is equality |
| (new) tests/unit/xcardInFlight.test.js › an X-Card played and resumed while the narration is generated still discards the reply move narration: no narrator card, no sidecar facts, and the notice says it was discarded | AssertionError: expected 'The reactor screams as the hull split…' to be null |
| (new) tests/unit/xcardInFlight.test.js › an X-Card played and resumed while the narration is generated still discards the reply @scene, paced narration, the oracle follow-up, vignettes, clocks, vow scenes and the inciting incident return nothing | AssertionError: expected [ …(7) ] to deeply equal [ null, null, null, null, null, …(2) ] |

- New test passing with and without the fix (a control?): tests/unit/xcardInFlight.test.js › an X-Card played and resumed while the narration is generated still discards the reply a narration started after the resume is narrated
- New test passing with and without the fix (a control?): tests/unit/xcardInFlight.test.js › an X-Card played and resumed while the narration is generated still discards the reply a narration started while the X-Card was still active stays paused — no Claude call

### 059f33b — fix: a Chronicle pin, delete or re-type keeps newer entries (issue #306 R02)

Test files: `tests/unit/chronicle.test.js`, `tests/unit/chroniclePanel.test.js`, `tests/unit/recap.test.js`. Source restored: 2 file(s).

- With the fix: 66 passed, 0 failed.
- Without it: 8 failed (6 new; 3 only for a missing export); 58 still pass (0 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/chronicle.test.js › identity by actor id, not by name (issue #301 B03) an edit and a panel delete reach an entry wherever a split left it — and the delete sticks | TypeError: (0 , deleteChronicleEntry) is not a function |
| (new) tests/unit/chroniclePanel.test.js › Chronicle panel actions keep entries written after the panel opened (issue #306 R02) pinning an older entry keeps the newer one, and pins only the chosen entry | AssertionError: expected [ 'Original.' ] to deeply equal [ 'Original.', 'New automatic beat.' ] |
| (new) tests/unit/chroniclePanel.test.js › Chronicle panel actions keep entries written after the panel opened (issue #306 R02) deleting an older entry keeps the newer one | AssertionError: expected [] to deeply equal [ 'New automatic beat.' ] |
| (new) tests/unit/chroniclePanel.test.js › Chronicle panel actions keep entries written after the panel opened (issue #306 R02) re-typing an older entry from the type select keeps the newer one | AssertionError: expected [ 'Original.' ] to deeply equal [ 'Original.', 'New automatic beat.' ] |
| (new) tests/unit/chroniclePanel.test.js › Chronicle panel actions keep entries written after the panel opened (issue #306 R02) a second pin click unpins — the write applies the pin the row showed, flipped | AssertionError: expected [ false ] to deeply equal [ false, false ] |
| (new) tests/unit/chroniclePanel.test.js › Chronicle panel actions keep entries written after the panel opened (issue #306 R02) an entry deleted meanwhile is not brought back by a pin | AssertionError: expected [] to deeply equal [ 'New automatic beat.' ] |
| (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) a same-count replacement — the wrong entry deleted, the right one added — invalidates it | TypeError: (0 , deleteChronicleEntry) is not a function |
| (API) tests/unit/recap.test.js › getCampaignRecap() — the cache after a chronicle correction (issue #301 B04) pinning or re-typing an entry keeps the recap — neither is in it | TypeError: (0 , setChronicleEntryPinned) is not a function |

### e428b50 — fix: with two fights open, a fight's position counts (issue #306 R05)

Test files: `tests/unit/progressTrackSelection.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/progressTrackSelection.test.js › two fights open: a fight's own position reaches Take Decisive Action (issue #306 R05) in a bad spot, a strong hit without a match counts as a weak hit | AssertionError: expected [ [ 'take_decisive_action', …(1) ] ] to deeply equal [ [ 'take_decisive_action', …(1) ] ] |
| (new) tests/unit/progressTrackSelection.test.js › two fights open: a fight's own position reaches Take Decisive Action (issue #306 R05) a Strike's position lands on the fight it targeted, not on nothing | AssertionError: expected 'in_control' to be 'bad_spot' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/progressTrackSelection.test.js › two fights open: a fight's own position reaches Take Decisive Action (issue #306 R05) in control, the same roll stays a strong hit

### e2dac8b — fix: a new session's Private Channel turns go to its own page (issue #306 R07)

Test files: `tests/unit/private-channel.test.js`. Source restored: 1 file(s).

- With the fix: 49 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 47 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/private-channel.test.js › transcript write/read a new session's turns never join a failed batch from the last session | AssertionError: expected '&lt;p class="pc-turn pc-turn-player">&lt;st…' not to contain 'New session opening.' |
| (new) tests/unit/private-channel.test.js › transcript write/read a new session's turns never join an unflushed batch from the last session | AssertionError: expected '&lt;p class="pc-turn pc-turn-player">&lt;st…' not to contain 'First words of session two.' |

- New test passing with and without the fix (a control?): tests/unit/private-channel.test.js › transcript write/read turns in one session still share one batch — one write per flush

### c556612 — fix: narrator audio at 0% volume plays silently (issue #306 R09)

Test files: `tests/unit/audio.test.js`, `tests/unit/audioCardButton.test.js`. Source restored: 2 file(s).

- With the fix: 72 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 70 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audio.test.js › _createSound blob URL adapter keeps a session volume of 0 on the HTMLAudioElement, and clamps the rest | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/audioCardButton.test.js › narrator card audio volume plays at 0 when the volume setting is 0% | AssertionError: expected 0.8 to be +0 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/audioCardButton.test.js › narrator card audio volume plays at the setting otherwise
- New test passing with and without the fix (a control?): tests/unit/audioCardButton.test.js › narrator card audio volume plays at 0.8 when the setting is unset

### 10d0f4b — fix: turning Push-to-Talk off takes effect at once (issue #306 R10)

Test files: `tests/unit/speechInput.test.js`, `tests/unit/speechInputSetting.test.js`. Source restored: 2 file(s).

- With the fix: 16 passed, 0 failed.
- Without it: 6 failed (6 new; 3 only for a missing export); 10 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/speechInput.test.js › turning push-to-talk off stops a capture in progress, and the existing button can start no other | TypeError: (0 , disableSpeechInput) is not a function |
| (new) (API) tests/unit/speechInput.test.js › turning push-to-talk off removes every 🎙 button | TypeError: (0 , disableSpeechInput) is not a function |
| (new) (API) tests/unit/speechInput.test.js › turning push-to-talk off turned on again, a fresh controller captures and the old engine stays stopped | TypeError: (0 , disableSpeechInput) is not a function |
| (new) tests/unit/speechInput.test.js › turning push-to-talk off initialising again replaces the controller without leaving the old one listening | AssertionError: expected [ 'start' ] to deeply equal [ 'start', 'abort' ] |
| (new) tests/unit/speechInputSetting.test.js › the Push-to-Talk setting takes effect at once off: a capture in progress stops, the button goes, and a stale press starts nothing | AssertionError: expected [ 'start' ] to deeply equal [ 'start', 'abort' ] |
| (new) tests/unit/speechInputSetting.test.js › the Push-to-Talk setting takes effect at once on again: one fresh controller, and the button is back | AssertionError: expected [] to deeply equal [ 'start' ] |

### a2644a9 — fix: Chronicle edits are applied by the canonical GM, one at a time (issue #306 R11, R02)

Test files: `tests/unit/chronicle.test.js`, `tests/unit/chroniclePanel.test.js`, `tests/unit/chronicleRelay.test.js`, `tests/unit/chronicleWriter.test.js`, `tests/unit/hookGates.test.js`. Source restored: 5 file(s).

- With the fix: 65 passed, 0 failed.
- Without it: 24 failed (10 new; 5 only for a missing export); 41 still pass (1 new).
- Verdict: **sensitive** — 19 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/chronicle.test.js › addChronicleEntry does nothing if actor does not exist | AssertionError: expected undefined to be false // Object.is equality |
| tests/unit/chronicle.test.js › updateChronicleEntry does nothing for unknown entryId | AssertionError: expected undefined to be false // Object.is equality |
| tests/unit/chronicle.test.js › error path coverage addChronicleEntry returns silently when JournalEntry.create throws | AssertionError: expected undefined to be false // Object.is equality |
| (new) (API) tests/unit/chronicleRelay.test.js › chronicle.edit — the canonical GM's handler (issue #306 R11) the PC's owner edits text, pins and adds a note | TypeError: (0 , applyChronicleEditFromRelay) is not a function |
| (new) (API) tests/unit/chronicleRelay.test.js › chronicle.edit — the canonical GM's handler (issue #306 R11) a player who does not own the PC changes nothing | TypeError: (0 , applyChronicleEditFromRelay) is not a function |
| (new) (API) tests/unit/chronicleRelay.test.js › chronicle.edit — the canonical GM's handler (issue #306 R11) re-type and delete are a GM's; the owner is refused | TypeError: (0 , applyChronicleEditFromRelay) is not a function |
| (new) (API) tests/unit/chronicleRelay.test.js › chronicle.edit — the canonical GM's handler (issue #306 R11) a player's add is an annotation — never an automated entry or another type | TypeError: (0 , applyChronicleEditFromRelay) is not a function |
| (new) (API) tests/unit/chronicleRelay.test.js › chronicle.edit — the canonical GM's handler (issue #306 R11) refuses an empty text, an unknown op and a missing entry; clamps a long text | TypeError: (0 , applyChronicleEditFromRelay) is not a function |
| (new) tests/unit/chronicleRelay.test.js › chronicle.edit — the canonical GM's handler (issue #306 R11) two appends that overlap both survive | AssertionError: expected [ 'Original.', 'First incoming beat.' ] to deeply equal [ 'Original.', …(2) ] |
| (new) tests/unit/chronicleRelay.test.js › chronicle.edit — the canonical GM's handler (issue #306 R11) a pin that overlaps an append keeps both | AssertionError: expected [ [ 'Original.', false ], …(1) ] to deeply equal [ [ 'Original.', true ], …(1) ] |
| (new) tests/unit/chronicleRelay.test.js › a player edits their GM-created Chronicle from their own panel (issue #306 R11) a pin and a note from the player's panel are applied by the GM | Error: User Pat lacks permission to update JournalEntryPage [jrn-1-p1] — no OWNER permission on the journal (permission-faithful test stub, tests/helpers/foundr |
| (new) tests/unit/chronicleRelay.test.js › a player edits their GM-created Chronicle from their own panel (issue #306 R11) the player's open panel re-renders when the GM applies the edit — a relay has no ack | AssertionError: expected 2 to be greater than 2 |
| (new) tests/unit/chronicleRelay.test.js › a player edits their GM-created Chronicle from their own panel (issue #306 R11) with no GM connected the edit is not saved, and the player is told | AssertionError: expected 'Starforged Companion: the Chronicle p…' to match /no GM is connected/ |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() writes the parsed entry to the first PC in characterIds | AssertionError: expected null to deeply equal { type: 'revelation', …(4) } |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() falls back to the first player-owned character Actor when characterIds is empty | AssertionError: expected null not to be null |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() falls back to "moment" when the model returns an unknown type | AssertionError: expected undefined to be 'moment' // Object.is equality |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() strips JSON markdown fences from the model response | AssertionError: expected undefined to be 'Beat.' // Object.is equality |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() marks the entry as automated and stamps the sessionId + moveId | TypeError: Cannot read properties of undefined (reading '1') |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() records a beat at or above the floor | AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() records an unrated beat (fail-open — never a silent blackout) | AssertionError: expected undefined to be 'A beat with no salience field.' // Object.is equality |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() does not store the salience field on the chronicle entry | TypeError: Cannot convert undefined or null to object |
| tests/unit/chronicleWriter.test.js › writeChronicleEntry() respects a chronicle floor lowered to "scene" | AssertionError: expected undefined to be 'Kept once the floor is lowered.' // Object.is equality |
| tests/unit/chronicleWriter.test.js › scheduleChronicleEntry() schedules the API call after the async delay | AssertionError: expected "spy" to be called 1 times, but got 0 times |
| tests/unit/hookGates.test.js › document hook handlers run their shared writes on one client every LOCAL_ONLY entry still names an ungated handler | AssertionError: src/character/chroniclePanel.js updateJournalEntryPage inline#1 no longer exists — remove it from LOCAL_ONLY: expected false to be true // Objec |

- New test passing with and without the fix (a control?): tests/unit/chronicleRelay.test.js › a player edits their GM-created Chronicle from their own panel (issue #306 R11) the GM created the journal, and the player cannot write it directly — Foundry's default

### 7bf24b9 — fix: a native vow fulfilment or bond forging pays once (issue #306 R04)

Test files: `tests/unit/nativePayoffOnce.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 4 failed (4 new; 2 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/nativePayoffOnce.test.js › a native vow fulfilment pays once (issue #306 R04) two fulfilments of one vow that overlap pay the Quests legacy once | AssertionError: expected 4 to be 2 // Object.is equality |
| (new) tests/unit/nativePayoffOnce.test.js › a native vow fulfilment pays once (issue #306 R04) the legacy is written on a copy — a refused write leaves the cached campaign as it was | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) (API) tests/unit/nativePayoffOnce.test.js › a native Forge a Bond pays once (issue #306 R04, the same race on `bonded`) two forges of one bond that overlap pay the bonds legacy once | TypeError: payForgedBondNative is not a function |
| (new) (API) tests/unit/nativePayoffOnce.test.js › a native Forge a Bond pays once (issue #306 R04, the same race on `bonded`) a forge after the bond has formed pays nothing | TypeError: payForgedBondNative is not a function |

- New test passing with and without the fix (a control?): tests/unit/nativePayoffOnce.test.js › a native vow fulfilment pays once (issue #306 R04) two different vows that overlap are both paid
- New test passing with and without the fix (a control?): tests/unit/nativePayoffOnce.test.js › a native vow fulfilment pays once (issue #306 R04) a fulfilment after the first has finished pays nothing — the paid flag

### 1054cd8 — fix: the newest shared-supply change wins, whichever PC it was on (issue #306 R03)

Test files: `tests/unit/sharedSupply.test.js`. Source restored: 1 file(s).

- With the fix: 12 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 10 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sharedSupply.test.js › the updateActor hook (canonical GM) a newer edit to a PC the pass has not reached yet wins | AssertionError: expected [ 2, 2, 2 ] to deeply equal [ 4, 4, 4 ] |
| (new) tests/unit/sharedSupply.test.js › the updateActor hook (canonical GM) a PC whose own edit an older pass overwrote is set back to its edit | AssertionError: expected [ 2, 2, 2 ] to deeply equal [ 4, 4, 4 ] |

### e1fd5fb — fix: a track rolled from its row is the one scored and completed (issue #306 R06)

Test files: `tests/unit/combat.test.js`, `tests/unit/expedition.test.js`, `tests/unit/progressRollBridge.test.js`, `tests/unit/progressTrackSelection.test.js`. Source restored: 5 file(s).

- With the fix: 55 passed, 0 failed.
- Without it: 7 failed (7 new; 0 only for a missing export); 48 still pass (0 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/combat.test.js › selectCombatTrack an id picks that open fight; an unknown or finished one picks nothing — never a namesake | AssertionError: expected 'c1' to be 'c2' // Object.is equality |
| (new) tests/unit/expedition.test.js › selectExpeditionTrack an id picks that open expedition; an unknown or finished one picks nothing — never a namesake | AssertionError: expected 'a' to be 'b' // Object.is equality |
| (new) tests/unit/progressRollBridge.test.js › the row's id rides the roll the panel's Roll posts the row id beside its label | AssertionError: expected { bypassPacing: true, …(2) } to match object { …(3) } |
| (new) tests/unit/progressRollBridge.test.js › the row's id rides the roll an expedition card's Finish button forwards the card's track id | AssertionError: expected { bypassPacing: true, …(2) } to match object { …(3) } |
| (new) tests/unit/progressTrackSelection.test.js › two same-named tracks: the panel's Roll acts on the row clicked (issue #306 R06) a combat roll scores and completes the selected row, not its namesake | AssertionError: expected [ [ 'take_decisive_action', 'miss' ] ] to deeply equal [ [ 'take_decisive_action', …(1) ] ] |
| (new) tests/unit/progressTrackSelection.test.js › two same-named tracks: the panel's Roll acts on the row clicked (issue #306 R06) a expedition roll scores and completes the selected row, not its namesake | AssertionError: expected [ [ 'finish_an_expedition', 'miss' ] ] to deeply equal [ [ 'finish_an_expedition', …(1) ] ] |
| (new) tests/unit/progressTrackSelection.test.js › two same-named tracks: the panel's Roll acts on the row clicked (issue #306 R06) a row deleted before the roll resolves rolls nothing — not its namesake, not a 0 score | AssertionError: expected [ { …(4) } ] to deeply equal [] |

### 92ca408 — fix: a renamed player keeps their Private Channel history (issue #306 R08)

Test files: `tests/unit/private-channel.test.js`. Source restored: 1 file(s).

- With the fix: 53 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 49 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/private-channel.test.js › transcript write/read a renamed player still reads their session, and the next write keeps one journal, relabelled | AssertionError: expected '' to contain 'Private record before renaming.' |
| (new) tests/unit/private-channel.test.js › transcript write/read a session an earlier rename split over two journals reads as one, oldest page first | AssertionError: expected '&lt;p>Later.&lt;/p>' to be '&lt;p>Earlier.&lt;/p>&lt;p>Later.&lt;/p>' // Object.is equality |
| (new) tests/unit/private-channel.test.js › transcript write/read a journal under the player's name that another user owns is never theirs | AssertionError: expected '&lt;p>Not yours.&lt;/p>' to be '' // Object.is equality |
| (new) tests/unit/private-channel.test.js › transcript write/read an unflagged journal under the player's name is adopted, and stamped on the next write | TypeError: Cannot read properties of undefined (reading 'privateChannelOwner') |

### 70c05d3 — fix: an encounter token is backed by a world Actor (issue #306 R12)

Test files: `tests/unit/encounterSpawn.test.js`. Source restored: 2 file(s).

- With the fix: 16 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 12 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/encounterSpawn.test.js › spawnEncounter places a token backed by a world Actor (issue #306 R12) imports the foe on first use, and the token names the world Actor | AssertionError: expected "spy" to be called 1 times, but got 0 times |
| (new) tests/unit/encounterSpawn.test.js › spawnEncounter places a token backed by a world Actor (issue #306 R12) reuses a world Actor already imported from that entry — no second import | AssertionError: expected [ 'compendium-foe' ] to deeply equal [ 'earlier-import' ] |
| (new) tests/unit/encounterSpawn.test.js › spawnEncounter places a token backed by a world Actor (issue #306 R12) reuses an older import marked with flags.core.sourceId | AssertionError: expected [ 'compendium-foe' ] to deeply equal [ 'legacy-import' ] |
| (new) tests/unit/encounterSpawn.test.js › spawnEncounter places a token backed by a world Actor (issue #306 R12) when the import fails, posts the stat card instead of a token for a compendium-only id | AssertionError: expected true to be false // Object.is equality |

### `scripts/defects/r04-forge-unclaimed.patch` — issue #306 R04 sibling — payForgedBondNative forges without claiming the bond, so two native Forge a Bond rolls arriving together both pay the bonds legacy

Test files: `tests/unit/nativePayoffOnce.test.js`.

- On HEAD: 6 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 5 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/nativePayoffOnce.test.js › a native Forge a Bond pays once (issue #306 R04, the same race on `bonded`) two forgings of one bond that overlap pay the bonds legacy once | AssertionError: expected 4 to be 2 // Object.is equality |

### 23b2c8b — fix: a combat card's Finish the Fight and Battle name their fight

Test files: `tests/unit/progressTrackSelection.test.js`. Source restored: 2 file(s).

- With the fix: 9 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 7 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/progressTrackSelection.test.js › a combat card names its fight (TDA-BUTTON-NO-TARGET) two fights open: a Strike's Finish the Fight scores and finishes the Strike's fight | AssertionError: expected { moveResolution: true, …(2) } to match object { …(2) } |
| (new) tests/unit/progressTrackSelection.test.js › a combat card names its fight (TDA-BUTTON-NO-TARGET) Battle from an Enter the Fray card ends that fight while another is open | AssertionError: expected { Object (combatTrackCard, created) } to match object { created: true, …(2) } |

- New test passing with and without the fix (a control?): tests/unit/progressTrackSelection.test.js › a combat card names its fight (TDA-BUTTON-NO-TARGET) an older card that names no fight, one fight open, still rolls that fight

### be61488 — fix: a Take Decisive Action that names no fight asks which

Test files: `tests/unit/progressTrackSelection.test.js`. Source restored: 2 file(s).

- With the fix: 12 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 10 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/progressTrackSelection.test.js › a Take Decisive Action that names no fight asks which (TDA-BUTTON-NO-TARGET) two fights open: nothing is rolled — the card lists them, and a pick rolls that fight for the roller | AssertionError: expected [ { …(4) } ] to deeply equal [] |
| (new) tests/unit/progressTrackSelection.test.js › a Take Decisive Action that names no fight asks which (TDA-BUTTON-NO-TARGET) one pick per card: a second click, on another client, rolls nothing more | AssertionError: a which-fight card: expected undefined to be truthy |

- New test passing with and without the fix (a control?): tests/unit/progressTrackSelection.test.js › a Take Decisive Action that names no fight asks which (TDA-BUTTON-NO-TARGET) a typed Take Decisive Action that names its fight rolls it without asking

### 514f5eb — fix: a payoff step that does not land is told to the GMs, with a Retry (issue #306 R04)

Test files: `tests/unit/cardActions.test.js`, `tests/unit/payoffFailure.test.js`. Source restored: 4 file(s).

- With the fix: 42 passed, 0 failed.
- Without it: 19 failed (19 new; 4 only for a missing export); 23 still pass (0 new).
- Verdict: **sensitive** — 15 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/cardActions.test.js › won-fight card actions a mark that does not land stays unapplied — the press is the retry — and the GMs are told (issue #306 R04) | AssertionError: expected { applied: true } to deeply equal { applied: false, reason: 'refused' } |
| (new) tests/unit/cardActions.test.js › won-fight card actions a deepen that does not land (the connection gone) stays unapplied and is reported | AssertionError: expected { applied: true } to deeply equal { applied: false, reason: 'not-found' } |
| (new) (API) tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) a GM's press claims the card, then re-runs its steps from the card | TypeError: applyPayoffRetry is not a function |
| (new) (API) tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) once: a repeat press, or two at once, re-run nothing more | TypeError: applyPayoffRetry is not a function |
| (new) (API) tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) a refused claim re-runs nothing | TypeError: applyPayoffRetry is not a function |
| (new) (API) tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) refuses a player, a card a player wrote, and a report without a Retry | TypeError: applyPayoffRetry is not a function |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) every step lands: no card, and each step is on the vow's ledger | AssertionError: expected undefined to deeply equal { legacy: true, deepen: true, …(1) } |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused legacy write: no XP, a GM card with the legacy as it stands; Retry pays the ticks and XP once | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused reward grant: no "Reward earned"; Retry gives it once | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused reward claim gives nothing; Retry claims and gives it | AssertionError: expected 5 to be 3 // Object.is equality |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a connection no longer open is reported, not skipped | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a step that fails again goes on a fresh card with its own Retry | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a Retry skips a step the vow's ledger says landed meanwhile | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a duplicate fulfilment after a partial failure pays nothing more | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) only a GM may retry: a player's relayed press applies nothing | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a press whose claim is refused applies nothing, and the button re-arms | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/payoffFailure.test.js › a bond forged on the sheet: a refused bonds legacy goes to the GMs (issue #306 R04) the forge card says the legacy is not yet marked; Retry marks it once | AssertionError: the forge card: expected undefined to be truthy |
| (new) tests/unit/payoffFailure.test.js › a won fight: its reward and its victory card report what did not land (issue #306 R04) a refused reward grant after a won fight goes to the GMs; Retry gives it once | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |
| (new) tests/unit/payoffFailure.test.js › a won fight: its reward and its victory card report what did not land (issue #306 R04) a refused milestone mark leaves the victory card's button live and tells the GMs; pressing again marks once | AssertionError: expected true to be undefined |

### `scripts/defects/tda-which-fight-unspoken.patch` — TDA-BUTTON-NO-TARGET — a which-fight pick posts the move with no speaker, so the GM's pick is credited to whoever clicked, not the player who made the move

Test files: `tests/unit/progressTrackSelection.test.js`.

- On HEAD: 12 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 11 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/progressTrackSelection.test.js › a Take Decisive Action that names no fight asks which (TDA-BUTTON-NO-TARGET) two fights open: nothing is rolled — the card lists them, and a pick rolls that fight for the roller | AssertionError: expected undefined to be 'pc-pat' // Object.is equality |

### `scripts/defects/tda-which-fight-twice.patch` — TDA-BUTTON-NO-TARGET — a which-fight card's buttons ignore the GM's pick stamp, so another client's click rolls a second Take Decisive Action

Test files: `tests/unit/progressTrackSelection.test.js`.

- On HEAD: 12 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 11 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/progressTrackSelection.test.js › a Take Decisive Action that names no fight asks which (TDA-BUTTON-NO-TARGET) one pick per card: a second click, on another client, rolls nothing more | AssertionError: expected [ 'take_decisive_action', …(1) ] to deeply equal [ 'take_decisive_action' ] |

### `scripts/defects/r04-xp-before-write.patch` — issue #306 R04 — writeLegacyTicks awards a filled box's XP before its write, so a refused legacy write still pays the XP

Test files: `tests/unit/payoffFailure.test.js`.

- On HEAD: 13 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 12 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused legacy write: no XP, a GM card with the legacy as it stands; Retry pays the ticks and XP once | AssertionError: expected 2 to be +0 // Object.is equality |

### `scripts/defects/r04-reward-earned-unearned.patch` — issue #306 R04 — a refused reward grant is ignored: "Reward earned" is posted and nothing is reported

Test files: `tests/unit/payoffFailure.test.js`.

- On HEAD: 13 passed, 0 failed.
- With the defect: 2 failed (0 only for a missing export); 11 still pass.
- Verdict: **sensitive** — 2 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused reward grant: no "Reward earned"; Retry gives it once | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |
| tests/unit/payoffFailure.test.js › a won fight: its reward and its victory card report what did not land (issue #306 R04) a refused reward grant after a won fight goes to the GMs; Retry gives it once | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |

### `scripts/defects/r04-connection-gone-silent.patch` — issue #306 R04 — deepenLinkedConnection treats a connection no longer open as done, so the deepen is skipped without a word

Test files: `tests/unit/payoffFailure.test.js`.

- On HEAD: 13 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 12 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a connection no longer open is reported, not skipped | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |

### `scripts/defects/r04-ledger-unread.patch` — issue #306 R04 — a payoff Retry ignores the vow's ledger, so a step recorded as landed is applied again

Test files: `tests/unit/payoffFailure.test.js`.

- On HEAD: 13 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 12 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a Retry skips a step the vow's ledger says landed meanwhile | AssertionError: expected 4 to be 2 // Object.is equality |

### `scripts/defects/r04-retry-claims-late.patch` — issue #306 R04 — a payoff Retry re-runs its steps before claiming the card, so a press whose claim is refused still applies them, and the next press applies them again

Test files: `tests/unit/payoffFailure.test.js`, `tests/unit/cardActions.test.js`.

- On HEAD: 42 passed, 0 failed.
- With the defect: 3 failed (0 only for a missing export); 39 still pass.
- Verdict: **sensitive** — 3 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) a GM's press claims the card, then re-runs its steps from the card | AssertionError: expected [ 'retry', 'claim' ] to deeply equal [ 'claim', 'retry' ] |
| tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) a refused claim re-runs nothing | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a press whose claim is refused applies nothing, and the button re-arms | AssertionError: expected 4 to be 2 // Object.is equality |

### `scripts/defects/r04-retry-any-user.patch` — issue #306 R04 — a payoff Retry does not check that the requester is a GM

Test files: `tests/unit/payoffFailure.test.js`, `tests/unit/cardActions.test.js`.

- On HEAD: 42 passed, 0 failed.
- With the defect: 2 failed (0 only for a missing export); 40 still pass.
- Verdict: **sensitive** — 2 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) refuses a player, a card a player wrote, and a report without a Retry | AssertionError: expected undefined to be 'not-gm' // Object.is equality |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) only a GM may retry: a player's relayed press applies nothing | AssertionError: expected 4 to be 2 // Object.is equality |

### `scripts/defects/r04-fight-stamp-optimistic.patch` — issue #306 R04 — a won-fight card action is stamped applied whatever its step reported, so a refused mark can't be retried from the card and nobody is told

Test files: `tests/unit/payoffFailure.test.js`, `tests/unit/cardActions.test.js`.

- On HEAD: 42 passed, 0 failed.
- With the defect: 3 failed (0 only for a missing export); 39 still pass.
- Verdict: **sensitive** — 3 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/cardActions.test.js › won-fight card actions a mark that does not land stays unapplied — the press is the retry — and the GMs are told (issue #306 R04) | AssertionError: expected { applied: true } to deeply equal { applied: false, reason: 'refused' } |
| tests/unit/cardActions.test.js › won-fight card actions a deepen that does not land (the connection gone) stays unapplied and is reported | AssertionError: expected { applied: true } to deeply equal { applied: false, reason: 'not-found' } |
| tests/unit/payoffFailure.test.js › a won fight: its reward and its victory card report what did not land (issue #306 R04) a refused milestone mark leaves the victory card's button live and tells the GMs; pressing again marks once | AssertionError: expected true to be undefined |

### `scripts/defects/r04-retry-repeatable.patch` — issue #306 R04 — a payoff Retry ignores the card's claim, so a second press after the first has finished re-runs its steps

Test files: `tests/unit/payoffFailure.test.js`, `tests/unit/cardActions.test.js`.

- On HEAD: 42 passed, 0 failed.
- With the defect: 2 failed (0 only for a missing export); 40 still pass.
- Verdict: **sensitive** — 2 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/cardActions.test.js › a payoff failure card's Retry (issue #306 R04) once: a repeat press, or two at once, re-run nothing more | AssertionError: expected undefined to be 'already-resolved' // Object.is equality |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused legacy write: no XP, a GM card with the legacy as it stands; Retry pays the ticks and XP once | AssertionError: expected { applied: true, failed: +0 } to match object { applied: false, …(1) } |

### 84390ef — fix: XP awards have no 30-point cap (issue #309 N01)

Test files: `tests/unit/actorBridge.test.js`, `tests/unit/flowDefectFixes.test.js`. Source restored: 2 file(s).

- With the fix: 99 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 95 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/actorBridge.test.js › awardXP has no 30-point cap: 28 + 5 XP is 33 | AssertionError: expected 30 to be 33 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › awardXP has no 30-point cap: 29 + 2 XP is 31 | AssertionError: expected 30 to be 31 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › awardXP has no 30-point cap: 42 + 2 XP is 44 | AssertionError: expected 30 to be 44 // Object.is equality |
| (new) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) awards a box's XP past 30, and never lowers XP already above it | AssertionError: expected 30 to be 31 // Object.is equality |

### fa9290a — fix: a refused Begin a Session save no longer blocks its retry (issue #309 N09)

Test files: `tests/unit/sessionRelayDialogs.test.js`. Source restored: 1 file(s).

- With the fix: 29 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 28 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sessionRelayDialogs.test.js › Begin a Session a refused save leaves the cached state as it was, and a retry begins the session | AssertionError: expected { sessionActive: true, …(6) } to deeply equal { sessionActive: false, …(3) } |

### d4c648c — fix: End a Session ends a session once (issue #309 N08)

Test files: `tests/unit/sessionRelayDialogs.test.js`. Source restored: 1 file(s).

- With the fix: 36 passed, 0 failed.
- Without it: 7 failed (7 new; 0 only for a missing export); 29 still pass (0 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sessionRelayDialogs.test.js › End a Session ends a session once (issue #309 N08) a second End repeats nothing and pays no momentum; its focus replaces the one noted | AssertionError: expected undefined to deeply equal { alreadyEnded: false } |
| (new) tests/unit/sessionRelayDialogs.test.js › End a Session ends a session once (issue #309 N08) two Ends at once close the session and pay the momentum once | TypeError: Cannot read properties of undefined (reading 'alreadyEnded') |
| (new) tests/unit/sessionRelayDialogs.test.js › End a Session ends a session once (issue #309 N08) the first focus noted pays the momentum once, even when the ending noted none | AssertionError: expected undefined to deeply equal { alreadyEnded: true } |
| (new) tests/unit/sessionRelayDialogs.test.js › End a Session ends a session once (issue #309 N08) a refused save leaves the cached state as it was, and a retry ends the session | AssertionError: expected { sessionActive: false, …(5) } to match object { sessionActive: true, …(1) } |
| (new) tests/unit/sessionRelayDialogs.test.js › End a Session ends a session once (issue #309 N08) the dialog on an ended session says a new focus corrects the old one | AssertionError: expected '\n    &lt;form class="sf-end-session-for…' to match /already ended/ |
| (new) tests/unit/sessionRelayDialogs.test.js › across a booted table End a Session two players end the same session (issue #309 N08) at once: the GM closes it and pays the momentum once; the second focus corrects the first | AssertionError: expected [ 'gm-1 momentum:a1', …(3) ] to deeply equal [ 'gm-1 momentum:a1', …(1) ] |
| (new) tests/unit/sessionRelayDialogs.test.js › across a booted table End a Session two players end the same session (issue #309 N08) one after the other: the second ends nothing and pays nothing — the GM's note is its only card | AssertionError: expected [ 'gm-1 momentum:a1', …(3) ] to deeply equal [ 'gm-1 momentum:a1', …(1) ] |

### b40abbc — fix: a refused paid flag no longer lets a vow's payoff repeat (issue #309 N05)

Test files: `tests/unit/payoffFailure.test.js`. Source restored: 1 file(s).

- With the fix: 15 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 13 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused paid flag applies nothing and tells the GMs; a duplicate then pays once, and the Retry nothing more | AssertionError: expected { quests: 4, deepen: 8, …(2) } to deeply equal { quests: 2, deepen: +0, …(2) } |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) after a refused paid flag, the Retry pays once and a later duplicate pays nothing | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |

### 9d65ac9 — fix: a refused legacy XP award is reported and retryable (issue #309 N06)

Test files: `tests/unit/payoffFailure.test.js`. Source restored: 1 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 15 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a PC's refused box XP goes to the GMs; Retry gives that PC's XP alone, once | AssertionError: expected [ Array(1) ] to deeply equal [ StringContaining{…} ] |
| (new) tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused box XP with every PC refused posts no "XP earned"; a Retry refused again goes on a fresh card | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |
| (new) tests/unit/payoffFailure.test.js › a bond forged on the sheet: a refused bonds legacy goes to the GMs (issue #306 R04) a refused box XP is reported with the bond forged and its legacy marked; Retry gives the XP once | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/payoffFailure.test.js › a legacy box filled in the move pipeline: a refused XP award goes to the GMs Retry gives that PC's XP once | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |

### 0da44e1 — fix: Withstand Damage's integrity choices change the vehicle (issue #309 N02)

Test files: `tests/unit/persistResolution.test.js`, `tests/unit/statEnrichment.test.js`, `tests/unit/sufferCard.test.js`. Source restored: 6 file(s).

- With the fix: 75 passed, 0 failed.
- Without it: 9 failed (9 new; 0 only for a missing export); 66 still pass (0 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/persistResolution.test.js › persistResolution — the suffer card carries the move's targets stamps the targets into the card's executorOpts beside the outcome flags | AssertionError: expected { isMiss: false, …(1) } to deeply equal { isMiss: false, …(2) } |
| (new) tests/unit/statEnrichment.test.js › resolveStatValue — vehicle integrity an integrity roll names the vehicle it was made against | AssertionError: expected { moveId: 'withstand_damage', …(2) } to match object { statValue: 3, …(1) } |
| (new) tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) strong hit: +1 integrity raises the vehicle's integrity | AssertionError: expected 2 to be 3 // Object.is equality |
| (new) tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) weak hit: the trade costs momentum and raises integrity | AssertionError: expected { momentum: 1, integrity: 2 } to deeply equal { momentum: 1, integrity: 3 } |
| (new) tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) miss: -1 integrity lowers it | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) a battered vehicle: its +1 integrity choices are unavailable, and nothing is charged | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' to match /data-option-index="0"[^>]*disabled/ |
| (new) tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) the PC's own battered impact is not the vehicle's | AssertionError: expected 2 to be 3 // Object.is equality |
| (new) tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) a card naming no vehicle (posted before this fix) changes the command vehicle | AssertionError: expected 2 to be 3 // Object.is equality |
| (new) tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) no vehicle at all: +1 integrity is unavailable, and a -1 the card cannot apply says so | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |

### 611979e — fix: Companion Takes a Hit changes the companion's health (issue #309 N03)

Test files: `tests/unit/actorBridge.test.js`, `tests/unit/consequenceTargets.test.js`, `tests/unit/statEnrichment.test.js`, `tests/unit/sufferCard.test.js`. Source restored: 6 file(s).

- With the fix: 167 passed, 0 failed.
- Without it: 11 failed (11 new; 4 only for a missing export); 156 still pass (3 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/actorBridge.test.js › companion health — the Companion asset's track lists Companion-category assets with an enabled track — not other assets | TypeError: (0 , listCompanionAssets) is not a function |
| (new) (API) tests/unit/actorBridge.test.js › companion health — the Companion asset's track getCompanionAsset: the one named, else the only one — none when several and none named | TypeError: (0 , getCompanionAsset) is not a function |
| (new) (API) tests/unit/actorBridge.test.js › companion health — the Companion asset's track applyCompanionHealthChange writes the track, kept within min..max | TypeError: (0 , applyCompanionHealthChange) is not a function |
| (new) (API) tests/unit/actorBridge.test.js › companion health — the Companion asset's track reports a refused write and a missing companion instead of dropping them | TypeError: (0 , applyCompanionHealthChange) is not a function |
| (new) tests/unit/consequenceTargets.test.js › Companion Takes a Hit — the companion the roll was made for (issue #309 N03) a strong hit gives that companion +1 health | AssertionError: expected { glow: 2, drone: 1 } to deeply equal { glow: 3, drone: 1 } |
| (new) tests/unit/consequenceTargets.test.js › Companion Takes a Hit — the companion the roll was made for (issue #309 N03) a weak hit offers the recovery, and the trade heals that companion for a momentum | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' not to match /data-option-index="0"[^>]*disabled/ |
| (new) tests/unit/statEnrichment.test.js › resolveStatValue — vehicle integrity a companion_health roll names the companion it was made for — the one it read | AssertionError: expected { …(3) } to match object { statValue: 3, …(1) } |
| (new) tests/unit/sufferCard.test.js › Companion Takes a Hit — its health choices change the companion (issue #309 N03) weak hit: the recovery is offered while the companion has health, and heals it for a momentum | AssertionError: expected { applied: false, …(1) } to deeply equal { applied: true } |
| (new) tests/unit/sufferCard.test.js › Companion Takes a Hit — its health choices change the companion (issue #309 N03) miss: -1 companion health lowers the companion's track | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/sufferCard.test.js › Companion Takes a Hit — its health choices change the companion (issue #309 N03) with two companions, the card's own companion is the one changed | AssertionError: expected { glow: 2, drone: 1 } to deeply equal { glow: 2, drone: +0 } |
| (new) tests/unit/sufferCard.test.js › Companion Takes a Hit — its health choices change the companion (issue #309 N03) no companion to change: the card says the change was not applied | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' to contain 'Not applied: companion health -1 — no…' |

- New test passing with and without the fix (a control?): tests/unit/consequenceTargets.test.js › Withstand Damage — the vehicle the roll was made against (issue #309 N02) a strong hit's +1 integrity raises it
- New test passing with and without the fix (a control?): tests/unit/consequenceTargets.test.js › Withstand Damage — the vehicle the roll was made against (issue #309 N02) a weak hit's trade costs a momentum and raises it
- New test passing with and without the fix (a control?): tests/unit/sufferCard.test.js › Companion Takes a Hit — its health choices change the companion (issue #309 N03) weak hit: unavailable — and nothing charged — when the companion is at 0

### 1f0584c — fix: Gain Ground's progress choice marks its own fight (issue #309 N04)

Test files: `tests/unit/consequenceTargets.test.js`, `tests/unit/sufferDialog.test.js`. Source restored: 4 file(s).

- With the fix: 48 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 42 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/consequenceTargets.test.js › Gain Ground — "Mark progress" marks the fight the move was about (issue #309 N04) with two fights open, the named fight gains the progress | AssertionError: expected undefined to be 'scNtXKta77YWlrGk' // Object.is equality |
| (new) tests/unit/consequenceTargets.test.js › Gain Ground — "Mark progress" marks the fight the move was about (issue #309 N04) an old choice marks nothing once its fight is over — not a fight opened since | AssertionError: expected 8 to be +0 // Object.is equality |
| (new) tests/unit/sufferDialog.test.js › runSufferResolution — combat-progress marks the card's own fight (issue #309 N04) marks the card's fight while another is open too | AssertionError: expected [] to deeply equal [ 'boarders' ] |
| (new) tests/unit/sufferDialog.test.js › runSufferResolution — combat-progress marks the card's own fight (issue #309 N04) marks nothing once its fight is over — not the fight that is open now | AssertionError: expected [ 'turret' ] to deeply equal [] |
| (new) tests/unit/sufferDialog.test.js › runSufferResolution — combat-progress marks the card's own fight (issue #309 N04) marks nothing when its fight is gone, or when the move named none | AssertionError: expected [ 'turret', 'turret' ] to deeply equal [] |
| (new) tests/unit/sufferDialog.test.js › runSufferResolution — combat-progress marks the card's own fight (issue #309 N04) a card naming no fight (posted before the card carried one) marks the sole open fight | AssertionError: expected { kind: 'combat-progress', …(2) } to match object { ok: false, reason: 'ambiguous' } |

### fd17788 — fix: a suffer pick is claimed before its effects (issue #309 N07)

Test files: `tests/unit/consequenceTargets.test.js`, `tests/unit/sufferCard.test.js`. Source restored: 3 file(s).

- With the fix: 39 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 34 still pass (0 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/consequenceTargets.test.js › Withstand Damage — the vehicle the roll was made against (issue #309 N02) a refused write in the trade is told on the card, and the GMs' Retry applies it once | AssertionError: expected { integrity: 2, momentum: 2 } to deeply equal { integrity: 3, momentum: 2 } |
| (new) tests/unit/sufferCard.test.js › a pick is claimed before its effects (issue #309 N07) a refused claim applies nothing; the next press applies the cost once | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/sufferCard.test.js › a pick is claimed before its effects (issue #309 N07) a multi-select pick is claimed too: refused, nothing applies and it can be made again | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/sufferCard.test.js › a pick is claimed before its effects (issue #309 N07) a nested suffer move whose follow-up picker cannot be posted re-opens the card | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/sufferCard.test.js › a pick is claimed before its effects (issue #309 N07) a write refused after the claim: the card says so, and the GMs' Retry applies it once | Error: promise rejected "Error: refused by the test" instead of resolving |

### `scripts/defects/n02-integrity-to-pc.patch` — issue #309 N02 — a consequence card's integrity change goes to the PC's meters again, which have no integrity: dropped

Test files: `tests/unit/consequenceTargets.test.js`, `tests/unit/sufferCard.test.js`.

- On HEAD: 39 passed, 0 failed.
- With the defect: 9 failed (0 only for a missing export); 30 still pass.
- Verdict: **sensitive** — 9 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/consequenceTargets.test.js › Withstand Damage — the vehicle the roll was made against (issue #309 N02) a strong hit's +1 integrity raises it | AssertionError: expected 2 to be 3 // Object.is equality |
| tests/unit/consequenceTargets.test.js › Withstand Damage — the vehicle the roll was made against (issue #309 N02) a weak hit's trade costs a momentum and raises it | AssertionError: expected { integrity: 2, momentum: 1 } to deeply equal { integrity: 3, momentum: 1 } |
| tests/unit/consequenceTargets.test.js › Withstand Damage — the vehicle the roll was made against (issue #309 N02) a refused write in the trade is told on the card, and the GMs' Retry applies it once | AssertionError: expected { integrity: 2, momentum: 2 } to deeply equal { integrity: 3, momentum: 2 } |
| tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) strong hit: +1 integrity raises the vehicle's integrity | AssertionError: expected 2 to be 3 // Object.is equality |
| tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) weak hit: the trade costs momentum and raises integrity | AssertionError: expected { momentum: 1, integrity: 2 } to deeply equal { momentum: 1, integrity: 3 } |
| tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) miss: -1 integrity lowers it | AssertionError: expected 2 to be 1 // Object.is equality |
| tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) the PC's own battered impact is not the vehicle's | AssertionError: expected 2 to be 3 // Object.is equality |
| tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) a card naming no vehicle (posted before this fix) changes the command vehicle | AssertionError: expected 2 to be 3 // Object.is equality |
| tests/unit/sufferCard.test.js › Withstand Damage — its integrity choices change the vehicle (issue #309 N02) no vehicle at all: +1 integrity is unavailable, and a -1 the card cannot apply says so | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' to contain 'Not applied: integrity -1 — no vehicl…' |

### d1d7826 — fix: negative momentum cancels a matching action die (issue #311 P01)

Test files: `tests/unit/bondCommand.test.js`, `tests/unit/moveRules.test.js`, `tests/unit/resolver.test.js`. Source restored: 5 file(s).

- With the fix: 293 passed, 0 failed.
- Without it: 7 failed (7 new; 1 only for a missing export); 286 still pass (3 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/bondCommand.test.js › handleBondCommand — author client the roller's negative momentum cancels a matching action die | AssertionError: expected '&lt;div class="sf-bond-card">&lt;strong>Dev…' to match /…/s> \(cancelled by momentum -3\) \+ 2 = &lt;strong>2&lt;\ |
| (new) tests/unit/moveRules.test.js › P01 — negative momentum cancels a matching action die momentum -3 cancels a 3: iron 3 against 4 and 5 is a miss, not a strong hit | AssertionError: expected 'strong_hit' to be 'miss' // Object.is equality |
| (new) tests/unit/resolver.test.js › resolveMove negative momentum cancels a matching action die momentum -3 cancels a 3: the score is the stat alone, a miss against 4 and 5 | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/resolver.test.js › resolveMove negative momentum cancels a matching action die adds still count with the die cancelled | AssertionError: expected 8 to be 5 // Object.is equality |
| (new) tests/unit/resolver.test.js › resolveMove negative momentum cancels a matching action die a negative momentum that does not match leaves the die: -2 with a 3 scores 6 | AssertionError: expected undefined to be false // Object.is equality |
| (new) tests/unit/resolver.test.js › resolveMove negative momentum cancels a matching action die a progress roll has no action die to cancel | AssertionError: expected undefined to be false // Object.is equality |
| (new) (API) tests/unit/resolver.test.js › resolveMove negative momentum cancels a matching action die cancelsActionDie matches the die to the momentum's absolute value | TypeError: cancelsActionDie is not a function |

- New test passing with and without the fix (a control?): tests/unit/bondCommand.test.js › handleBondCommand — author client a negative momentum that does not match the die leaves it
- New test passing with and without the fix (a control?): tests/unit/moveRules.test.js › P01 — negative momentum cancels a matching action die a negative momentum that does not match leaves the die: -2 with a 3 is a strong hit
- New test passing with and without the fix (a control?): tests/unit/resolver.test.js › resolveMove negative momentum cancels a matching action die positive momentum, or none given, cancels nothing

### 4b8b3f3 — fix: a weak Heal or Hearten recovers, then pays its cost (issue #311 P02)

Test files: `tests/unit/moveRules.test.js`, `tests/unit/resolver.test.js`. Source restored: 1 file(s).

- With the fix: 282 passed, 0 failed.
- Without it: 9 failed (8 new; 0 only for a missing export); 273 still pass (0 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/moveRules.test.js › P02 — a weak recovery is the strong hit's, plus its cost weak Heal, wounded, paying momentum: wounded cleared, health 1 → 3, momentum 8 → 6 | AssertionError: expected { health: 1, spirit: 5, …(4) } to match object { health: 3, wounded: false, …(2) } |
| (new) tests/unit/moveRules.test.js › P02 — a weak recovery is the strong hit's, plus its cost weak Heal, wounded, paying supply: wounded cleared, health 1 → 3, supply 3 → 1 | AssertionError: expected { health: 1, spirit: 5, …(4) } to match object { health: 3, wounded: false, …(2) } |
| (new) tests/unit/moveRules.test.js › P02 — a weak recovery is the strong hit's, plus its cost weak Heal, not wounded: +3 health then the cost; the wounded options are unavailable | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' to match /data-option-index="0" disabled/ |
| (new) tests/unit/moveRules.test.js › P02 — a weak recovery is the strong hit's, plus its cost weak Hearten, shaken: shaken cleared, spirit 1 → 2, momentum 8 → 7 — paid with the recovery | AssertionError: expected 7 to be 8 // Object.is equality |
| (new) tests/unit/moveRules.test.js › P02 — a weak recovery is the strong hit's, plus its cost weak Hearten, not shaken: spirit 1 → 3, momentum 8 → 7 | TypeError: Cannot read properties of undefined (reading '_id') |
| tests/unit/resolver.test.js › mapConsequences — full handler coverage hearten:weak_hit returns a complete consequences object | AssertionError: expected -1 to be +0 // Object.is equality |
| (new) tests/unit/resolver.test.js › recover-move dialog prompts heal:weak_hit offers the strong hit's recovery, then each cost | AssertionError: expected [ { …(3) }, { …(3) } ] to have a length of 4 but got 2 |
| (new) tests/unit/resolver.test.js › recover-move dialog prompts hearten:weak_hit offers the strong hit's recovery, then Lose Momentum (-1) — not a bare -1 | AssertionError: expected -1 to be +0 // Object.is equality |
| (new) tests/unit/resolver.test.js › recover-move dialog prompts each call returns its own options — a prompt stored on one card is not another's | TypeError: Cannot read properties of undefined (reading 'push') |

### c3e5dbc — fix: a burn refunds the Pay the Price loss that landed (issue #311 P04)

Test files: `tests/unit/resultUpgrade.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/resultUpgrade.test.js › P04 — a burn refunds the Pay the Price loss that landed a loss clamped at 0 health is not refunded: health stays 0 | AssertionError: expected { Object (move, amount, ...) } to be null |
| (new) tests/unit/resultUpgrade.test.js › P04 — a burn refunds the Pay the Price loss that landed the solo fallback's real loss is refunded: companion route → Endure Harm, health 5 → 4 → 5 | AssertionError: expected null to match object { move: 'endure_harm', …(5) } |

- New test passing with and without the fix (a control?): tests/unit/resultUpgrade.test.js › P04 — a burn refunds the Pay the Price loss that landed the ordinary route still refunds its loss: Endure Harm, health 5 → 4 → 5

### 52cdc67 — fix: Improve Result undoes the miss's Pay the Price, as a burn does (issue #311 P05)

Test files: `tests/unit/improveResult.test.js`, `tests/unit/resultUpgrade.test.js`. Source restored: 4 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 16 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/improveResult.test.js › buildImproveState carries the miss's Pay the Price reversals, as the burn's card does | AssertionError: expected undefined to deeply equal { clocksAdvanced: [ { …(3) } ], …(1) } |
| (new) tests/unit/resultUpgrade.test.js › P05 — both upgrades undo the superseded miss's Pay the Price Improve Result to a strong hit: the clock rewinds to 0/4 and health 4 → 5 | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P05 — both upgrades undo the superseded miss's Pay the Price the improvement's own cost still stands: its note is on the card | TypeError: .toMatch() expects to receive a string, but got undefined |

- New test passing with and without the fix (a control?): tests/unit/resultUpgrade.test.js › P05 — both upgrades undo the superseded miss's Pay the Price Burn Momentum to a strong hit: the clock rewinds to 0/4 and health 4 → 5

### 2f7afdb — fix: a burn or improvement is claimed before its effects (issue #311 P06)

Test files: `tests/unit/actorBridge.test.js`, `tests/unit/resultUpgrade.test.js`. Source restored: 5 file(s).

- With the fix: 102 passed, 0 failed.
- Without it: 6 failed (5 new; 0 only for a missing export); 96 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/actorBridge.test.js › revertVowClocksForBurn is a no-op for empty input | AssertionError: expected undefined to deeply equal [] |
| (new) tests/unit/actorBridge.test.js › revertVowClocksForBurn returns the entries whose write was refused | AssertionError: expected undefined to deeply equal [ { …(3) } ] |
| (new) tests/unit/resultUpgrade.test.js › P06 — an upgrade is claimed before its effects a refused Improve Result claim applies nothing; the press after a fresh render applies it once | AssertionError: expected 4 to be 3 // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P06 — an upgrade is claimed before its effects a refused Burn Momentum claim applies nothing; the press after a fresh render burns once | AssertionError: expected 4 to be 8 // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P06 — an upgrade is claimed before its effects a meter write refused after the claim is told to the GMs, and their Retry applies it once | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P06 — an upgrade is claimed before its effects a Pay the Price refund refused after a burn's claim is retried for that PC alone | TypeError: Cannot read properties of undefined (reading 'flags') |

### 2e2aebc — fix: an upgraded result's choice cards follow it (issue #311 P03)

Test files: `tests/unit/burnMomentum.test.js`, `tests/unit/resultUpgrade.test.js`. Source restored: 6 file(s).

- With the fix: 38 passed, 0 failed.
- Without it: 8 failed (8 new; 0 only for a missing export); 30 still pass (0 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/burnMomentum.test.js › resultUpgradeBlocker names the reason in order: already upgraded, consequence chosen, original pending | AssertionError: expected null to be 'choice-made' // Object.is equality |
| (new) tests/unit/burnMomentum.test.js › buildBurnState — the move's targets carries them for the upgraded outcome's choice card | AssertionError: expected undefined to deeply equal { vehicleActorId: 'ship-1', …(2) } |
| (new) tests/unit/resultUpgrade.test.js › P03 — an upgrade reconciles the move's choice cards a weak Face Danger burned to a strong hit retires its suffer card — the obsolete cost is not charged | AssertionError: expected undefined to be 'UzaCFccB34I1Wb61' // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P03 — an upgrade reconciles the move's choice cards a pick still refuses when the card could not be retired, and retires it then | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P03 — an upgrade reconciles the move's choice cards a weak Hearten burned to a strong hit offers the strong hit's recovery, once | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P03 — an upgrade reconciles the move's choice cards a weak Heal improved to a strong hit offers the strong hit's recovery, with no cost | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P03 — an upgrade reconciles the move's choice cards a consequence chosen first closes Burn Momentum — the button says so, and the GM refuses it | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/resultUpgrade.test.js › P03 — an upgrade reconciles the move's choice cards the GM checks the choice cards themselves, so a lost close stamp does not reopen the upgrade | AssertionError: expected true to be falsy |

### 35f5ecf — fix: a ship's Finalise completes once (issue #311 P07)

Test files: `tests/unit/finalize.test.js`, `tests/unit/finalizeLifecycle.test.js`. Source restored: 3 file(s).

- With the fix: 28 passed, 0 failed.
- Without it: 4 failed (3 new; 0 only for a missing export); 24 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/finalize.test.js › finalizeEntity — connection runs the seed (finalize-first) seeds a blank connection card: oracles → Characteristics, marks seeded | AssertionError: expected undefined to deeply equal Any&lt;String> |
| (new) tests/unit/finalize.test.js › finalizeEntity — connection runs the seed (finalize-first) on a card the creation hook seeded, Finalise records completion only — Notes kept | AssertionError: expected undefined to deeply equal Any&lt;String> |
| (new) tests/unit/finalizeLifecycle.test.js › P07 — a ship's Finalise completes once; Regenerate is the way to write it again the first Finalise stamps finalizedAt; a second ordinary one keeps the edited Notes and asks the narrator nothing | AssertionError: expected undefined to deeply equal Any&lt;String> |
| (new) tests/unit/finalizeLifecycle.test.js › P07 — a ship's Finalise completes once; Regenerate is the way to write it again Regenerate (force) writes the introduction again and re-stamps completion | AssertionError: expected false to be true // Object.is equality |

### da75b67 — fix: a session momentum award that does not land can be retried (issue #311 P08)

Test files: `tests/unit/sessionMomentum.test.js`. Source restored: 2 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sessionMomentum.test.js › P08 — a session momentum award that does not land is retried for that PC End: the refused PC's +1 goes to the GMs' Retry; End again pays nothing and says so; the Retry pays it once | TypeError: Cannot read properties of undefined (reading 'flags') |
| (new) tests/unit/sessionMomentum.test.js › P08 — a session momentum award that does not land is retried for that PC Begin's Spotlight Vignette momentum is reported the same way | TypeError: Cannot read properties of undefined (reading 'flags') |

### 97b4438 — fix: a consequence closes its move's upgrades once its choice stands (issue #311 P03)

Test files: `tests/unit/resultUpgrade.test.js`. Source restored: 1 file(s).

- With the fix: 17 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 16 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/resultUpgrade.test.js › P03 — an upgrade reconciles the move's choice cards a pick whose follow-up picker cannot be posted re-opens its card, and leaves the upgrades open | AssertionError: expected true to be undefined |
