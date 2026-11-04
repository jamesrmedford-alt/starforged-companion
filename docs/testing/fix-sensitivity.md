# Regression-test sensitivity — issues #300, #301, #302, #306, #309, #311, #313, #314, #315, #316, #321, #322, #325, #326 and #329

A regression test is evidence only if it fails while its defect is present
(issue #302, slice A). This file records that, for every fix from the issue
#300, #301, #306, #309, #311, #313, #314, #315, #316, #321, #322, #325, #326 and #329 audits and from issue #302's disturbance
matrix (slice B): the tests that fail with the fix taken out. It was produced
by `scripts/fix-sensitivity.mjs` on 2026-10-27 (the patch applied to
`ec08eb4`), for issue #306 on 2026-10-28 (the patch applied to `8bee894`; for
the two follow-ups, the patches applied to `514f5eb`), for issue #309 on
2026-10-29 (the patch applied to `fd17788`), for issue #311 on 2026-10-29, for
issues #313, #314 and #315 on 2026-10-30, for issue #316 on 2026-10-31,
for issues #321 and #322 on 2026-11-01, for issues #325 and #326 on 2026-11-03 and for issue
#329 — and the four fixes found while fixing it — on 2026-11-04. To reproduce:

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

# issue #313
node scripts/fix-sensitivity.mjs 0e2e26e e362ef1 --md details.md

# issue #314
node scripts/fix-sensitivity.mjs \
  285fe00 257630b 5e9095d 082e78d d1e15a5 79c45d1 --md details.md

# issue #315
node scripts/fix-sensitivity.mjs \
  6879144 d9f8933 a9f238a 4e33ed1 7d5083b 29511e3 403ea27 9666fa6 --md details.md

# issue #316
node scripts/fix-sensitivity.mjs \
  e6c6500 eca4344 bb52b2b 775fd77 96043f2 300fb37 --md details.md

# issue #321 (the vendored system data is not checked out in the script's
# worktrees, so the tests that read it skip there — see the #321 summary)
node scripts/fix-sensitivity.mjs \
  0686a64 481bea4 6630c3b af10b33 66319f9 7f48b53 71182f0 88c55a1 3974061 \
  97a2b8f 2d15c73 b80b4ec 632b047 ced9f5e 4e1d531 8f24c65 88a72a8 26baf6c \
  798bec5 4c23f20 6f911d9 413e293 4768ebd 0d95837 11785cf 9f81053 c282a13 \
  f9f10c6 5df5b43 8f5b3c3 136d212 88960d0 187af8c cbb890a fb79e0a 32246f3 \
  100b3fd b85ed27 e2c62f4 b8c6cd9 b817cca 5c78275 160fd80 c4cba83 e7d7629 \
  6d8b29a 79ff7a5 0d25bb8 b0cdc45 2bbfd48 7f6e838 ec8fe0a 5f74fcb 87e2a28 \
  2b40416 5ff101f 804d44f eb22041 568964e f6050b0 175db78 83ff2f1 f2dcda2 \
  0a8b6b6 cc3cc68 9cff74f ab9f4aa e0c64d2 25c47ac 718991b 3c092ef 96bd02c \
  90bbb4d 68b0e11 \
  --md details.md

# issue #322 (V26 and V30 are shown by injection only: their reverts delete the
# module the fix added, so their tests fail there only on the missing export;
# V12's panel tests, which fail under revert only on missing exports, and
# V16's and V19's corrected tests are shown by injection too)
node scripts/fix-sensitivity.mjs \
  aba6885 5c3e769 8bb08d1 2da340c 7aae820 d625707 aece676 4684788 7eadfb4 \
  af143fc 528eef1 edd05b7 6d6044b 8c761cf b7bc7f8 33dd07f 68d6a3f b932b16 \
  2f65466 c7bd107 2a8beb3 4f497f9 d0c438b b7d37f5 1d74f12 21ccdd3 d74ca56 \
  7c3f8d5 ff289b7 08f13f0 512458c e1b67c0 \
  --inject scripts/defects/v12-clock-panels-stale.patch \
  --inject scripts/defects/v16-audio-cache-sweep.patch \
  --inject scripts/defects/v19-pc-name-ascii-boundary.patch \
  --inject scripts/defects/v26-upload-built-path-fallback.patch \
  --inject scripts/defects/v30-regenerate-drops-portrait.patch \
  --md details.md

# issue #325 (W27 is shown by injection only: its revert deletes the module
# the fix added, narration/thinking.js, so its tests fail there only on the
# missing export)
node scripts/fix-sensitivity.mjs \
  c1dcddb a7b2fee c5cfa95 7513677 cd30f1d 338c7dd 0e0b87a dd955f0 ea753af \
  512e5e1 97fef76 ba8f4ad b702879 beefce0 ef2f120 ffc073e 1d8613e e9118b0 \
  aa93f89 996ce8d ec200ff 75d3777 c27a789 b68c83d a28f53f f28ff0d 7a9426c \
  79a2b8e cca0c79 141bf63 817b0f6 f96221a 016e54e 1894d71 5e5bca0 5d02b19 \
  --inject scripts/defects/w27-short-calls-thinking-on.patch \
  --md details.md

# issue #326 (W76's, W82's and W84's are shown by hand: W76's test reads the
# vendored truths, which the worktrees do not check out; W82's fix is in
# scripts/ and W84's in lang/, which the script does not revert — so this
# command exits 1, on W76 and W82, and skips W84)
node scripts/fix-sensitivity.mjs \
  6799371 e7b3550 0967769 78e2c81 563fbf9 96648ac 46ccad0 099e7d9 94c5f91 \
  76edf21 06fa150 91b2113 6e790b3 c62c1d5 70d363e a3369da 142116f 3d5297a \
  599ede7 726f908 4abc3b3 8f76745 f5b7b23 49e3ae5 c82c3fe 55db420 b3d36e8 \
  28b05ae 853af87 b5b0cfd 58f7f71 c9b414b acf5361 bfae239 848bbf5 d2ae1b9 \
  e798d69 a890747 aa07659 04f8ede 4ba3f9d e313d2c b12b35e ee89103 b2a9762 \
  546a7b6 ced7270 70dc332 d5655f6 96d320e 7049b10 b17542d e157be0 e3f4ee0 \
  5004de1 a85398d cf27461 676aeb3 \
  --md details.md

# issue #329 (X04's is shown by hand: its test reads the vendored assets,
# which the worktrees do not check out — as committed in d6c2de4 the file
# failed to load there, so this command exits 1, on X04; 6026775 makes it
# skip instead)
node scripts/fix-sensitivity.mjs \
  c1c3791 e488234 dc4d2bd d6c2de4 0726854 5e38a44 9badb9b ae7e50e 91cae82 \
  9136c7b 77ed8bd f16e093 2310da9 a8deb17 \
  --md details.md

# issue #329 — the four found while fixing it (FULFIL-BUTTON-LOCAL-DISABLE,
# ENDURE-ZERO-ON-OTHER-OPTION, XCARD-CAPTURE-TRANSITIONS, NOTES-PROMOTED-BEFORE)
node scripts/fix-sensitivity.mjs \
  9ef6fde a93ba76 f43d0bb 082196a \
  --inject scripts/defects/notes-promoted-not-moved.patch \
  --inject scripts/defects/notes-promoted-moved-twice.patch \
  --inject scripts/defects/notes-promoted-html-resurrected.patch \
  --inject scripts/defects/notes-promoted-any-client.patch \
  --md details.md
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

### Issue #313 — the two found while fixing #311

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| SAA-WEAK-DOUBLE-MOMENTUM | 0e2e26e | revert | 3 — `moveRules.test.js` (2: momentum 2 stays 2 on the weak hit and is 4 after the "+2 momentum" pick, not 6; "+1 on your next move" leaves it at 2 and posts the reminder), `resolver.test.js` (the weak hit's row: no direct momentum, the two choices) |
| UPGRADE-PIPELINE-EFFECTS | e362ef1 | revert | 8 — `upgradeEffects.test.js` (6: a Strike burned from a miss marks twice on its fight and takes control; a Clash burned to a weak hit marks once, stays in the bad spot and keeps its price; a fight over by the burn is not marked and the card says so; an Undertake an Expedition improved from a miss begins and marks the expedition; an Enter the Fray burned while its threshold card waits changes the card's position, and the fight is created in it; a Battle burned from a lost miss gets its victory card), `burnMomentum.test.js` and `improveResult.test.js` (the card carries the move's target and ranks); 2 more fail only on the missing `effectsNoteHtml` |

### Issue #314 — the audit after #312

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| Q01 RESUPPLY-UNPREPARED-PLUS-2 | 285fe00 | revert | 4 — `moveRules.test.js` (2: unprepared at 0 takes 1 and the +2 is unavailable, on the strong and the weak hit), `resolver.test.js` (2: the strong and weak options' amounts and gates) |
| Q02 HARM-OVERFLOW-LOST | 257630b | revert | 11 — `sufferExecutor.test.js` (6: a loss of 3 at health 1, equal, below, at 0 already, at the momentum minimum; stress the same), `payThePriceRoutes.test.js` (3: Pay the Price at 0 health through the pipeline, the improvement's refund, the health receipt), `resultUpgrade.test.js` (2: the receipt at 0 health; the solo fallback's receipt is a list) |
| Q03 PTP-ROLL-TWICE-ROUTES-LOST | 5e9095d | revert | 18 — `oracleRoller.test.js` (11: each band's route as a list; harm + stress, a narrative leaf beside a routed one, two of the same leaf, a nested Roll twice, the recursion cap), `payThePriceRoutes.test.js` (6: both land through the pipeline and on the receipt, a burn refunds both, the one-route and duplicate-leaf cases, the direct control's list, `!ptp`), `creditTheRoller.test.js` (the `!ptp` route lands) |
| Q04 BOND-ITEM-MIRROR-BY-NAME | 082e78d | revert | 10 — `actorBridge.test.js` (5: a same-named Item keyed to another connection, on this PC and another; a renamed connection's Item by id; an ambiguous unkeyed name; a keyed Item over the name; the rank mirror the same), `bondCommand.test.js` (the rank mirror by the record's `_id`), `bondItemMirror.test.js` (4: one Sable's progress and rank write its Item alone; a renamed connection's rank from the pipeline and from `!bond`) |
| Q05 VOW-CLOCK-RETRY-WHOLE-STEP | d1e15a5 | revert | 3 — `resultUpgrade.test.js` (the second Item's refusal alone on the card and its Retry; a refusal on the first; a second refusal during the Retry on a fresh card) |
| Q06 BONDED-DEVELOP-NO-RANK | 79c45d1 | revert | 10 — `connectionPickerTarget.test.js` (8: epic Vega from the picker is 8, a strong hit, 2 ticks; typed, resolved before the dice; each of the five ranks; parity with `!bond`), `developRelationship.test.js` (2: the rank table; the roll's stat at every rank); 9 more fail only on the missing `bondedDevelopRoll` / `enrichBondedDevelop` |

The audit's own probes (issue #314 appendix A), with their assertions
inverted to the expected behaviour, pass on the fixed code: all twelve.

### Issue #315 — the audit after #314

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| S01 MOVE-LOCK-RELEASED-BY-OLDER | 6879144 | revert | 5 — `assetEffects.test.js` (A's prompt closes while B holds the lock: B keeps it, C is refused), `pipeline.test.js` (4: `releasePendingMoveLock` says whether the lock is free — a release, a refused one, already free, no state) |
| S08 RIDER-APPLIED-UNCOMMITTED | d9f8933 | revert | 6 — `assetEffects.test.js` (3: a refused integrity write and a refused progress save are not applied — the cache unchanged — and the GMs' Retry applies each once; one landed and one refused, the Retry replays the refused one only), `consequenceRiders.test.js` (3: one outcome per rider; a refused meter write; no character, no ship) |
| S02 RIDER-PROGRESS-CHOICE-BYPASSED | a9f238a | revert | 3 — `assetEffects.test.js` (2: a "you may mark progress" is offered with the lone track preselected, and Skip leaves it; "mark progress or +2 momentum" offers both, and momentum leaves the track), `consequenceRiders.test.js` (a progress option stays in its choice group) |
| S03 RIDER-PROGRESS-AMOUNT-LOST | 4e33ed1 | revert | 4 — `assetEffects.test.js` (+2 marks, -1, -2 to the floor, +2 through the picker) |
| S06 RIDER-PROGRESS-FINISHED-TRACK | 7d5083b | revert | 4 — `assetEffects.test.js` (only a finished track: not marked, the card says no open track; one open beside a finished one is the sole target; the picker offers open tracks only; a track finished while the prompt is open is not marked) |
| S05 RIDER-INTEGRITY-BATTERED | 29511e3 | revert | 3 — `assetEffects.test.js` (+1 integrity on a battered ship at 0 is not applied, and the card says why), `shipBatteredCanonical.test.js` (2: the same through `applyMeterRiders`, battered on both stores and on the sheet alone); 5 more fail only on the missing `changeIntegrity` |
| S04 REPAIR-TRADE-UNPREPARED | 403ea27 | revert | 2 — `repair.test.js` (the last supply traded marks unprepared, the repair lands, the card says both; a refused impact write leaves the payment and the repair, and the card says to mark it) |
| S07 CREW-UNPREPARED-ONE-PC | 9666fa6 | revert | 6 — `sufferExecutor.test.js` (3: A's sacrifice to 0 marks B, and the card names B; the roller already unprepared, the allies still marked; an ally's refused write is said, not thrown), `sharedSupply.test.js` (2: supply [0, 0] once synced, both unprepared, both momentum bounds lowered; a sheet edit raising supply clears no one), `repair.test.js` (the trade's ally is marked with the payer); 1 more fails only on the missing `supplyAllies` |

The audit's own probes (issue #315 appendix A), with their assertions
inverted to the expected behaviour, pass on the fixed code: all thirteen. One
probe needs its pick made explicit: S02's "choose one" now offers the
progress option first (checked by default), so choosing momentum ticks that
radio.

### Issue #316 — the audit after #315

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| T01 MOMENTUM-BASE-WRITEBACK | e6c6500 | revert | 13 — `actorBridge.test.js` (9: no `system.momentum.max` / `resetValue` in any meter write; three gains with one impact keep 9 / +1; a gain clamps to the getters' maximum; clearing the impact restores 10 / +2 with nothing written; an edited base reset is kept; marking an impact clamps 10 → 9 in one write, and 9 stays with none), `momentumBounds.test.js` (2: the same through the GM's pipeline — three strong hits keep 9 / +1, the stored bases 10 / 2, and the impact cleared restores 10 / +2; a gain clamps to the impact-reduced maximum), `repair.test.js` and `sharedSupply.test.js` (the #315 S04 / S07 bounds, now the effective ones) |
| T02 LEGACY-CAP-NO-CLEAR | eca4344 | revert | 11 — `legacyRollover.test.js` (3: from 38, three discoveries clear the track to 0 / 2 / 4 and pay 2 then 1 XP; a track frozen at 40 clears on the next; a mark short of the tenth box clears nothing), `flowDefectFixes.test.js` (5: `addLegacyTicks` returns the boxes, XP and clear; the tenth box clears and the overflow carries on at 1 XP), `persistResolutionMerge.test.js` (3: a cleared track is not reverted by the store's 38; a store record further along keeps its clear; the merged record counts its cycles); `legacyTracks.test.js` fails to load without the module |
| T03 SCENE-CLOCK-OUTLIVES-CHALLENGE | bb52b2b | revert | 5 — `sceneChallengeClock.test.js` (4: the panel's ✓ retires the paired clock, which Pay the Price then leaves at 0/4 and names on no card while another tension clock advances; `completeProgressTrack` the same; the panel's ✕ removes the clock; a refused clock write leaves the challenge open and warns, and the next press completes it), `clocks.test.js` (`!clock list` shows a retired clock); 4 more fail only on the missing `retireClock` / `removeClock` |
| T04 BEGIN-CLOCK-WRITE-LOST | 775fd77 | revert | 6 — `sessionStartClocks.test.js` (4: the refused write leaves the session begun, the clock card marked "not saved" and a GMs' card naming the rolled fill; a second Begin names the clock owed and the Retry saves the fill once without rolling again; a Retry after a GM's own advance does not advance twice; a player's press saves nothing), `clocksSessionStart.test.js` (2: every result names its clock and says it was saved; a refused write keeps the rolls, the cache unchanged); 3 more fail only on the missing `applyClockAdvances` |
| T05 NO-ROLL-MOVE-ROLLED | 96043f2 | revert | 9 — `resolver.test.js` (5: Make a Discovery draws no dice and has no outcome; a stat the interpreter named is not rolled and a negative momentum cancels nothing; every no-roll move in the table; a bonded Develop rolls +rank by its `rollKind`; action and progress moves keep their kinds), `noRollMoves.test.js` (3: the real waypoint follow-up has no dice, no outcome, no Burn, and momentum stays 9; a typed Make a Discovery the same; a Face Danger miss still rolls and offers a burn), `improveResult.test.js` (no Improve on a "none" resolution); 3 more fail only on the missing `moveRollKind` |
| T06 WAYPOINT-REWARD-STACKS | 300fb37 | revert | 8 — `waypointRewardClaim.test.js` (4: the ordinary +2 taken, the discovery is refused and its button closed on a re-render; the discovery first marks 2 ticks once, retires the ordinary choice and a re-render finds the claim; another player's click is refused and a GM's takes it as the roller; Confront Chaos is taken once), `cardButtonWiring.test.js` (4: a player's click relays `waypoint.oracle` with no local post; the canonical GM's click claims and posts once as the roller; a claimed card renders disabled; no GM re-arms); 9 more fail only on the missing `applyWaypointOraclePick` |

### Issue #321 — the seventh audit, part 1

Every fix commit is **sensitive**. U06 is seven sites in six commits (U06a
and U06g share one); U65's follow-up makes the truths-journal hooks write a
copy; a test-only follow-up to U02 changes nothing under `src/` and is not
listed; the refactor that routes the detection pass back through
`parseDetectionResponse` (after U15) changes no behaviour. Three fixes read the
vendored foundry-ironsworn data, which the script's worktrees do not check
out: there their vendor-reading tests skip. U31 and U32 are shown by their
other tests; U63's table comparison was run by hand with the data present.

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| U01 SOLO-SNAPSHOT-STALE | 0686a64 | revert | 3 — `soloSheetEditSnapshot.test.js` (3) |
| U02 FULFIL-VOW-NO-TARGET | 481bea4 | revert | 10 — `fulfilVowWhichVow.test.js` (5), `statEnrichment.test.js` (5); 12 more fail only on a missing export |
| U03 PTP-DOUBLE-ROLL | 6630c3b | revert | 6 — `payThePriceOneRoll.test.js` (2), `resolver.test.js` (4); 3 more fail only on a missing export |
| U04 FORCED-MOVE-FIRST-STAT | af10b33 | revert | 6 — `forcedMoveStat.test.js` (2), `interpreterExpectedMove.test.js` (4); 6 more fail only on a missing export |
| U05 PANELS-PLAYER-WRITES | 66319f9 | revert | 16 — `entityPanelRelay.test.js` (9), `progressTracksPanelRelay.test.js` (7); 7 more fail only on a missing export |
| U06a + U06g STALE-SNAPSHOT-WRITERS | 7f48b53 | revert | 3 — `loreRecapMoveMerge.test.js`, `loreRecapStaleWrite.test.js` (2) |
| U06b STALE-SNAPSHOT-WRITERS | 71182f0 | revert | 8 — `factCommandStaleWrite.test.js` (8) |
| U06c STALE-SNAPSHOT-WRITERS | 88c55a1 | revert | 4 — `siteDiscoveryStaleWrite.test.js` (4) |
| U06d STALE-SNAPSHOT-WRITERS | 3974061 | revert | 2 — `incitingPremiseStaleWrite.test.js` (2) |
| U06e STALE-SNAPSHOT-WRITERS | 97a2b8f | revert | 5 — `correctionDialogStaleWrite.test.js` (5) |
| U06f STALE-SNAPSHOT-WRITERS | 2d15c73 | revert | 3 — `startSceneAdoption.test.js` (3) |
| U07 XCARD-CONTENT-REMEMBERED | b80b4ec | revert | 17 — `narrationIdCards.test.js` (4), `xcardNarratorMemory.test.js` (12), `xcardNarratorMemoryTable.test.js`; 4 more fail only on a missing export |
| U08 MOVE-NARRATION-STALE-SAFETY | 632b047 | revert | 6 — `moveNarrationStaleSnapshot.test.js` (2), `narratorLiveSafety.test.js` (4) |
| U09 PRIVATE-CHANNEL-XCARD | ced9f5e | revert | 3 — `privateChannelXCard.test.js` (3) |
| U10 PRIVATE-JOURNAL-PLAYER-CREATE | 4e1d531 | revert | 3 — `hookGates.test.js`, `privateChannelPlayerJournal.test.js` (2); 1 more fail only on a missing export |
| U11 NATIVE-ROLL-KEYLESS | 8f24c65 | revert | 9 — `nativeRollKeyedRunner.test.js` (2), `nativeRollNarration.test.js` (7) |
| U12 SESSION-GATE-CARRIES-OVER | 88a72a8 | revert | 3 — `sessionGateRollover.test.js`, `sessionManagement.test.js`, `sessionRelayDialogs.test.js` |
| U13 SECTOR-LIST-WIPED | 26baf6c | revert | 11 — `sectorOverview.test.js` (11) |
| U14 SEVER-FALLBACK | 798bec5 | revert | 5 — `developRelationship.test.js` (3), `severCommand.test.js` (2) |
| U15 DETECTION-TRUNC-SILENT | 4c23f20 | revert | 3 — `detectionTruncation.test.js` (3) |
| U16 PHANTOM-TRACK | 6f911d9 | revert | 8 — `combat.test.js` (4), `expedition.test.js` (2), `progressTrackSelection.test.js` (2) |
| U17 WAYPOINT-MISS-NO-PTP | 413e293 | revert | 2 — `payThePriceOneRoll.test.js`, `resolver.test.js` |
| U18 FRAY-MOMENTUM-NO-POSITION | 4768ebd | revert | 1 — `resolver.test.js` |
| U19 COMBAT-POSITION-DRIFT | 0d95837 | revert | 7 — `combatPositionStores.test.js` (6), `progressTracksPanelRelay.test.js` |
| U20 SUGGESTION-BUTTONS-REPEAT | 11785cf | revert | 6 — `milestoneSuggestionOnce.test.js` (3), `recommitOnce.test.js` (3); 11 more fail only on a missing export |
| U21 NATIVE-BOND-NOT-NARRATED | 9f81053 | revert | 1 — `nativeBondRollNarration.test.js` |
| U22 CV-READY-SCAN-DEAD | c282a13 | revert | 1 — `commandVehicleLoadScan.test.js` |
| U23 FIRST-PC-ATTRIBUTION | f9f10c6 | revert | 14 — `chroniclePanel.test.js` (2), `connectionBondHolder.test.js` (2), `narratorPaced.test.js`, `private-channel.test.js` (2), `privateChannelOwnPc.test.js` (2), `rollerAttribution.test.js` (2), `speaker.test.js`, `swearTargetBondCrew.test.js` (2); 5 more fail only on a missing export |
| U24 SPEAKER-BOUND-NON-PC | 5df5b43 | revert | 2 — `speaker.test.js` (2) |
| U25 DRAFT-CONCURRENT-CONFIRM | 8f5b3c3 | revert | 4 — `draftCardConcurrentConfirm.test.js` (4) |
| U26 LONE-SHIP-NPC-DRAFT | 136d212 | revert | 3 — `loneShipNpcDraft.test.js` (3) |
| U27 RENAME-DROPS-NEW-NAME | 88960d0 | revert | 2 — `entityExtractor.test.js` (2) |
| U28 FACTION-CONFIRM-ATTITUDE | 187af8c | revert | 3 — `factionConfirmAttitude.test.js` (3) |
| U29 AUTOSEED-DOUBLE-PORTRAIT | cbb890a | revert | 2 — `autoSeedPortraitOwner.test.js` (2) |
| U30 DEDUP-TITLES | fb79e0a | revert | 3 — `dedupNameTitles.test.js` (2), `entityExtractor.test.js` |
| U31 STARSHIP-ICON-PATH | 32246f3 | revert | 2 — `ironswornAssets.test.js` (2) |
| U32 ENCOUNTER-CARD-EMPTY | 100b3fd | revert | 2 — `encounterSpawn.test.js` (2) |
| U33 PORTRAIT-PLAYER-CLICK | b85ed27 | revert | 4 — `portraitGmOnly.test.js` (4) |
| U34 SIDECAR-NO-SCENE | e2c62f4 | revert | 6 — `sidecarScenePaths.test.js` (4), `sidecarWithoutScene.test.js` (2) |
| U35 FALLBACK-IN-RING | b8c6cd9 | revert | 2 — `narratorFallback.test.js` (2) |
| U36 SCENE-CAPTURE-UNGATED | b817cca | revert | 2 — `sceneQueryCaptureGate.test.js` (2) |
| U37 CLARIFY-PICK-NO-ID | 5c78275 | revert | 3 — `clarificationDialog.test.js` (3) |
| U38 CORRECTION-DIALOG-RENDER | 160fd80 | revert | 8 — `correctionDialogStaleWrite.test.js` (4), `correctionDialogWiring.test.js` (4) |
| U39 RETRACTION-OVERREACH | c4cba83 | revert | 5 — `retractions.test.js` (5) |
| U40 LORE-RESTORE-STAYS-STRUCK | e7d7629 | revert | 6 — `loreRestore.test.js` (4), `worldJournal.test.js` (2) |
| U41 SIDECAR-BARE-FENCE | 6d8b29a | revert | 8 — `factContinuity.test.js` (8) |
| U42 PRIVATE-TRANSCRIPT-SPLIT | 79ff7a5 | revert | 2 — `privateChannelTranscript.test.js` (2); 3 more fail only on a missing export |
| U43 SHIP-POSITION-WORD-SCAN | 0d25bb8 | revert | 3 — `shipPosition.test.js` (3) |
| U44 CLASSIFIER-CONNECTIONS | b0cdc45 | revert | 2 — `pacing.test.js` (2) |
| U45 CLASSIFIER-MOVE-NAME | 2bbfd48 | revert | 10 — `narratorMoveHint.test.js` (2), `pacing.test.js` (8); 2 more fail only on a missing export |
| U46 SECTOR-CREATE-DOUBLE-CLICK | 7f6e838 | revert | 5 — `sectorPanel.test.js` (5) |
| U47 NEW-SECTOR-MOVES-SHIP | ec8fe0a | revert | 1 — `sectorSceneBuilder.test.js` |
| U48 SITE-LADDER-WRONG-SITE | 5f74fcb | revert | 8 — `precursorSites.test.js` (7), `siteDiscovery.test.js` |
| U49 MIGRATE-DELETES-GM-PAGES | 87e2a28 | revert | 5 — `entityMigrator.test.js`, `sectorOverview.test.js` (4) |
| U50 ZOOM-IN-NOT-ROLLED | 2b40416 | revert | 6 — `sectorGenerator.test.js` (5), `sectorPanel.test.js` |
| U51 SECTOR-PLANETS-DARK | 5ff101f | revert | 5 — `narratorPrompt.test.js` (2), `sectorContext.test.js`, `sectorPlanetsNarrator.test.js` (2); 1 more fail only on a missing export |
| U52 TOKEN-DRAG-PIN-LABEL | 804d44f | revert | 5 — `sectorSceneHooks.test.js` (4), `tokenDragArrival.test.js`; 6 more fail only on a missing export |
| U53 OFF-PIN-DOCKED | eb22041 | revert | 5 — `sectorSceneHooks.test.js` (5) |
| U54 DRAG-WITH-AUTOMOVE-OFF | 568964e | revert | 3 — `sectorSceneHooks.test.js` (3) |
| U55 SHARED-VOW-CLOCK-REPEATED | f6050b0 | revert | 5 — `actorBridge.test.js`, `sharedVowClockOnce.test.js` (4) |
| U56 PANEL-LOCATION-NO-SHIP | 175db78 | revert | 4 — `entityPanelCurrentLocation.test.js` (3), `shipPosition.test.js` |
| U57 TRACK-LOST-UPDATE | 83ff2f1 | revert | 4 — `progressTracksWriteQueue.test.js` (4) |
| U58 CACHED-SETTING-MUTATION | f2dcda2 | revert | 14 — `cachedSettingWrites.test.js` (14) |
| U59 AUDIO-DOUBLE-SYNTH | 0a8b6b6 | revert | 2 — `audioSynthesisOnce.test.js` (2) |
| U60 AUDIO-KEYLESS-BROWSE | cc3cc68 | revert | 4 — `audioKeylessPlayback.test.js`, `nonGmClientPaths.test.js` (3) |
| U61 END-VIGNETTE-SEVERED | 9cff74f | revert | 3 — `endSessionVignetteSeveredBond.test.js` (3) |
| U62 VOW-RANK-NUMERIC | ab9f4aa | revert | 2 — `vowRankName.test.js` (2) |
| U63 ORACLE-TABLE-FIDELITY | e0c64d2 | revert | 1 — `sectorGenerator.test.js` (the invented paired-name row); and 20 in `oracleTableFidelity.test.js` (one per corrected table: 132 pass with the fix, 20 fail without), run by hand with the vendored data present |
| U64 ORACLE-ODDS-TWO-WORD | 25c47ac | revert | 2 — `chatCommandRouting.test.js` (2) |
| U65 TRUTHS-RESAVE-STALE | 718991b | revert | 2 — `revisedTruthsLore.test.js` (2) |
| U65 (follow-up: the hooks write a copy) | 3c092ef | revert | 1 — `revisedTruthsLore.test.js` |
| U66 TRUTH-SUBRESULT-DARK | 96bd02c | revert | 1 — `narratorPrompt.test.js` |
| U67 QUICKSTART-TRUTHS-FLAGS | 90bbb4d | revert | 5 — `truths.test.js` (5) |
| U68 ORACLE-DIRECTIVES-LITERAL | 68b0e11 | revert | 4 — `oracleRoller.test.js` (4) |

### Issue #322 — the seventh audit, part 2

Every fix commit is **sensitive**, and the command above exits 0. Five
findings are also, or only, shown by injecting the defect into HEAD:

- **V26** and **V30** moved their fix into a new module
  (`net/uploadResult.js`, `art/notesPortrait.js`); a revert deletes it, so
  their tests fail there only on the missing export, and the command shows
  them by injection alone.
- **V12**'s panel tests fail under revert only on its missing exports (the
  one assertion there is the hook-gate catalogue's); the injection makes both
  panels' setting hooks render nothing.
- **V16** and **V19** each had a new test that passed both ways — not a
  control, a miss: V16's "caching a clip scans nothing" called the cache's
  write directly, where the old sweep never ran (the canonical GM fired it
  after a write, in `audio/index.js`), and V19's PC-name test used "Renée",
  whose ASCII final "e" the old ASCII word boundary matched. Commit `03ba63f`
  drives the GM's two cache paths and names "Zoë"; both corrected tests fail
  on their fix's parent source and under the injections. Their revert rows
  run the tests as each fix committed them.

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| V01 BOND-WEAK-HIT-SPLIT | aba6885 | revert | 28 — `bondCommand.test.js` (18), `connectionPickerTarget.test.js` (3), `developRelationship.test.js` (4), `resolver.test.js` (3); 3 more fail only on a missing export |
| V02 NEXT-MOVE-BONUS-DEAD | 5c3e769 | revert | 6 — `moveRules.test.js`, `nextMoveBonus.test.js` (5); 6 more fail only on a missing export |
| V03 COMBAT-POSITION-PER-FIGHT | 8bb08d1 | revert | 12 — `combatPositionPerCharacter.test.js` (8), `combatPositionStores.test.js` (4); 1 more fail only on a missing export |
| V04 BURN-COUNTS-OUTCOME-MOMENTUM | 2da340c | revert | 5 — `burnMomentum.test.js` (3), `moveCardRelay.test.js`, `resultUpgrade.test.js` |
| V05 RECAP-SESSION-NUMBER-DROPPED | 7aae820 | revert | 5 — `sessionRecapNumber.test.js` (5) |
| V06 HELP-SETTINGS-UNREACHABLE | d625707 | revert | 7 — `settingsPanelDocumentedRows.test.js` (7) |
| V07 HELP-RANK-TICKS-WRONG | aece676 | revert | 7 — `helpJournal.test.js` (7) |
| V08 INTERP-NUMBERS-TRUSTED | 4684788 | revert | 4 — `interpreterNumbers.test.js` (4) |
| V09 NARRATION-THROW-SKIPS-PERSIST | 7eadfb4 | revert | 1 — `narrationRefusedPersist.test.js` |
| V10 SECTOR-SWITCH-KEYWORD-PREFIX | af143fc | revert | 2 — `sectorSwitchKeywordName.test.js` (2) |
| V11 PANEL-CONN-PROGRESS-DEAD | 528eef1 | revert | 2 — `entityPanelConnectionProgress.test.js` (2) |
| V12 CLOCKS-PANEL-STALE | edd05b7 | revert | 1 — `hookGates.test.js`; 7 more fail only on a missing export |
| V12 (its panel tests) | edd05b7 | inject `v12-clock-panels-stale.patch` | 3 — `clocksPanelRefresh.test.js` (3) |
| V13 AUDIO-ERROR-NO-RETRY | 6d6044b | revert | 1 — `audioErrorRetry.test.js` |
| V14 AUDIO-STOP-WHILE-LOADING | 8c761cf | revert | 3 — `audioPauseBetweenSegments.test.js` (2), `audioStopWhileLoading.test.js` |
| V15 AUDIO-AUTOPLAY-OLD-CARD | b7bc7f8 | revert | 1 — `audioAutoplayHistoricalCard.test.js`; 1 more fail only on a missing export |
| V16 AUDIO-CACHE-CAP-DEAD | 33dd07f | revert | 3 — `audioCacheNoSweep.test.js` (2), `nonGmClientPaths.test.js` |
| V16 (the corrected test, 03ba63f) | — | inject `v16-audio-cache-sweep.patch` | 1 — `audioCacheNoSweep.test.js` |
| V17 NPC-TAG-UNCLOSED-LEAKS | 68d6a3f | revert | 5 — `segmentsUnclosedTag.test.js` (5) |
| V18 NARR-CARD-UNESCAPED | b932b16 | revert | 3 — `narrationCardHtml.test.js` (3) |
| V19 RELEVANCE-UNICODE-BOUNDARY | 2f65466 | revert | 3 — `relevanceUnicodeNames.test.js` (3); 1 more fail only on a missing export |
| V19 (the corrected test, 03ba63f) | — | inject `v19-pc-name-ascii-boundary.patch` | 1 — `relevanceUnicodeNames.test.js` |
| V20 SPOTLIGHT-FRAME-NAMES | c7bd107 | revert | 2 — `spotlightFrameNames.test.js` (2) |
| V21 PACE-OVERRIDE-OUTLIVES-SCENE | 2a8beb3 | revert | 2 — `paceOverrideSceneEnd.test.js` (2) |
| V22 PACED-CARD-NO-ENTITIES | 4f497f9 | revert | 1 — `pacedCardVoice.test.js` |
| V23 CLOCK-BEAT-VIGNETTE-ROLE | d0c438b | revert | 3 — `narratorModeRoles.test.js` (3) |
| V24 ENCOUNTER-TOKEN-OFF-CENTRE | b7d37f5 | revert | 3 — `encounterSpawn.test.js`, `encounterTokenCentre.test.js` (2) |
| V25 ART-ASSET-NAME-LOOKUP | 1d74f12 | revert | 2 — `artAssetLookupByName.test.js` (2) |
| V26 SECTOR-ART-UPLOAD-FAIL-PATH | d55c830 | inject `v26-upload-built-path-fallback.patch` | 12 — `uploadResult.test.js` (12) |
| V27 SECTOR-NPC-ROLLS-DROPPED | 21ccdd3 | revert | 1 — `sectorNpcRolls.test.js` |
| V28 CUSTOM-ORACLE-LINES-DROPPED | d74ca56 | revert | 6 — `customOracleParse.test.js` (6); 3 more fail only on a missing export |
| V29 CONN-MIGRATION-DELETES-BEFORE-PERSIST | 7c3f8d5 | revert | 2 — `connectionMigrationOrder.test.js` (2) |
| V30 REGENERATE-STRIPS-NOTES-PORTRAIT | c49e91b | inject `v30-regenerate-drops-portrait.patch` | 3 — `regenerateKeepsNotesPortrait.test.js` (3) |
| V31 FACTION-PAGE-BODY-STALE | ff289b7 | revert | 2 — `entityPageBodyRerender.test.js` (2) |
| V32 SHARED-VOW-SYNC-LOST-UPDATE | 08f13f0 | revert | 4 — `sharedVowSyncLostUpdate.test.js` (2), `swearVow.test.js` (2) |
| V33 CHRONICLE-TYPE-SELECT | 512458c | revert | 4 — `chroniclePanel.test.js` (4) |
| V34 TRUTHS-TWO-STORES | e1b67c0 | revert | 8 — `narrateVowSwearing.test.js`, `worldTruthsDialogNarrator.test.js` (7) |

### Issue #325 — the eighth audit, part 1

Every fix commit is **sensitive**, and the command above exits 0. **W27**
moved its fix into a new module (`narration/thinking.js`); a revert deletes
it, so its tests fail there only on the missing export, and the command
shows it by injecting the defect alone (`w27-short-calls-thinking-on.patch`:
the short calls send no `thinking` field).

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| W01 VOW-RANK-NUMERIC | c1dcddb | revert | 10 — `vowRankNumeric.test.js` (8), `vowRankNumericPipeline.test.js` (2) |
| W02 CLAIMED-PICK-DROPPED-WHILE-BUSY | a7b2fee | revert | 6 — `cardActions.test.js` (4), `deferredForcedMove.test.js` (2) |
| W03 PTP-NARRATED-TWICE | c5cfa95 | revert | 2 — `payThePriceOneRoll.test.js` (2) |
| W04 HEAL-HEALS-HEALER | 7513677 | revert | 7 — `healPatient.test.js` (7); 4 more fail only on a missing export |
| W05 XCARD-STALE-LEDGER | cd30f1d | revert | 2 — `xcardLiveLedger.test.js` (2) |
| W06 XCARD-SUMMARY-RESURRECTED | 338c7dd | revert | 2 — `xcardSummaryDrop.test.js` (2) |
| W07 XCARD-SHIP-POSITION | 0e0b87a | revert | 3 — `xcardShipPosition.test.js` (3) |
| W08 VENDOR-MOVE-CARD-NARRATED | dd955f0 | revert | 3 — `vendorMoveCardNotNarration.test.js` (3) |
| W09 PACED-ROLL-CLICKER | ea753af | revert | 2 — `pacedRollButtonRoller.test.js` (2) |
| W10 PTP-CREW-UNPREPARED-PLAYER | 512e5e1 | revert | 2 — `creditTheRoller.test.js`, `ptpCrewUnprepared.test.js`; 3 more fail only on a missing export |
| W11 BUTTONS-LOCAL-DISABLE | 97fef76 | revert | 12 — `battleButtonOnce.test.js` (3), `combatCardButtonsOnce.test.js` (3), `connectionSuggestionOnce.test.js` (2), `rewardAndLinkOnce.test.js` (4) |
| W12 ABILITY-ADDS-SUMMED | ba8f4ad | revert | 8 — `abilityAddsPerClause.test.js` (6), `abilityScanner.test.js` (2) |
| W13 IMPROVE-COUNT-WEAK-ON-MISS | b702879 | revert | 4 — `improveCountWeakOnly.test.js` (2), `improveResult.test.js` (2) |
| W14 RESIST-MISS-FREE-AT-ZERO | beefce0 | revert | 3 — `resistMissLossAtZero.test.js` (3) |
| W15 TWO-SUFFER-MOVES-SAME-MOVE | ef2f120 | revert | 3 — `sufferDialog.test.js` (2), `twoSufferMoves.test.js` |
| W16 SACRIFICE-UNPREPARED-FREE | ffc073e | revert | 3 — `sacrificeWhileUnprepared.test.js` (3) |
| W17 MOVE-TEXT-CONSEQUENCES | 1d8613e | revert | 9 — `aidYourAllyBenefits.test.js` (2), `moveTextConsequences.test.js` (7); 1 more fail only on a missing export |
| W18 BOND-ADDS-UNROLLED | e9118b0 | revert | 4 — `bondAddsRolled.test.js`, `swearToConnectionAdd.test.js` (3) |
| W19 INTERPRETER-STAT-OFF-LIST | aa93f89 | revert | 6 — `interpreterStatOnList.test.js` (6) |
| W20 RENARRATION-OUTCOME-MISSING | 996ce8d | revert | 3 — `nativeRollMoveOutcome.test.js`, `renarrationMoveOutcome.test.js` (2) |
| W21 PERSPECTIVE-AUTO-COUNTS-GM | ec200ff | revert | 3 — `narratorPrompt.test.js` (2), `perspectiveAutoPlayers.test.js` |
| W22 CONNECTION-DISPOSITION-NEUTRAL | 75d3777 | revert | 5 — `connectionDisposition.test.js` (2), `narratorPrompt.test.js`, `pacing.test.js` (2) |
| W23 MAKE-CONNECTION-PENDING-DRAFT | c27a789 | revert | 2 — `makeConnectionPendingDraft.test.js` (2) |
| W24 END-SCENE-DROPS-CONCURRENT-FACTS | b68c83d | revert | 2 — `endSceneLateFacts.test.js` (2) |
| W25 MOVE-LOCK-GM-HANDOVER | a28f53f | revert | 2 — `moveLockGmHandover.test.js` (2) |
| W26 PANEL-TEXT-UNESCAPED | f28ff0d | revert | 7 — `panelTextEscaping.test.js` (4), `trackLabelEscaping.test.js` (3) |
| W27 SHORT-CALLS-THINKING | 5f1395f | inject `w27-short-calls-thinking-on.patch` | 3 — `shortCallsThinkingOff.test.js` (3) |
| W28 FULFIL-LEGACY-TWICE | 7a9426c | revert | 1 — `fulfilLegacyOnce.test.js` |
| W29 WON-FIGHT-CARD-AFTER-FULFIL | 79a2b8e | revert | 6 — `milestone.test.js`, `wonFightCardAfterFulfil.test.js` (5) |
| W30 SELECTOR-SUBSTRING-INSIDE-WORD | cca0c79 | revert | 11 — `selectorWholeWords.test.js` (7), `severFragment.test.js` (4); 2 more fail only on a missing export |
| W31 SEED-REROLLS-NARRATED-IDENTITY | 141bf63 | revert | 7 — `entityExtractor.test.js` (3), `narratorDetailPersistence.test.js`, `seedKeepsNarratedIdentity.test.js` (2), `vignettePronouns.test.js` |
| W32 GALLEY-SOLO-PC-ABSENT | 817b0f6 | revert | 4 — `galleySoloGm.test.js` (4) |
| W33 INCITING-BOLD-LABEL | f96221a | revert | 4 — `incitingBoldLabels.test.js` (4) |
| W34 WJ-PANEL-FACT-OVERRIDE | 016e54e | revert | 3 — `wjPanelFactCatch.test.js` (3) |
| W35 TRUTHS-SINGLE-CATEGORY-SAVE | 1894d71 | revert | 2 — `truthsSingleCategorySave.test.js` (2); 1 more fail only on a missing export |
| W36 HINT-COMMON-NOUN / HINT-PC-SOCIAL | 5e5bca0 | revert | 5 — `pacedHintMove.test.js` (5) |
| W37 ROSTER-LOST-CONNECTION | 5d02b19 | revert | 3 — `sectorRosterLostConnection.test.js` (3) |

### Issue #326 — the eighth audit, part 2

Every fix commit is **sensitive**. Three are shown by hand, each with the
commit's own tests: **W76**'s quest-starter comparison reads the vendored
truths, which the script's worktrees do not check out, so it skips there —
run with the data present and `src/truths/tables.js` restored from its
parent, it fails; **W82**'s fix is in `scripts/deadscan.mjs` and **W84**'s
in `lang/en.json`, which the script does not revert — each restored from its
parent, its tests fail. **D6** added `moves/sceneChallenge.js`, so under its
revert `finishTheScene.test.js` fails to load; its `progressRollBridge.test.js`
assertions fail on the behaviour.

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| W38 INTERPRETER-DISPLAY-NAME | 6799371 | revert | 3 — `interpreterMoveDisplayName.test.js` (3) |
| W39 NOTES-HTML-IN-PROMPT | e7b3550 | revert | 4 — `entityCardNotesText.test.js` (4) |
| W40 MODE-LENGTH-CONFLICT | 0967769 | revert | 3 — `narratorModeLength.test.js` (3) |
| W41 XCARD-LOSES-EARLIER-STATE | 78e2c81 | revert | 4 — `xcardRestoresEarlierState.test.js` (4) |
| W42 XCARD-BEAT-PAST-ROLL-REPOST | 563fbf9 | revert | 2 — `xcardBeatForcedMove.test.js` (2) |
| W43 MILESTONE-PICKER-MARKS | 96648ac | revert | 3 — `milestonePicker.test.js`, `wonFightMilestonePickerMarks.test.js` (2) |
| W44 FINISH-VOW-SOLE-TWIN | 46ccad0 | revert | 2 — `finishVowByName.test.js` (2) |
| W45 POSITION-TWO-FIGHTS-DROPPED | 099e7d9 | revert | 1 — `positionRollerFight.test.js` |
| W46 FINISH-EXPEDITION-COURSE-CARD | 94c5f91 | revert | 1 — `finishExpeditionNoCourseCard.test.js` |
| W47 WAYPOINT-DISCOVERY-DOUBLE-ROLL | 76edf21 | revert | 6 — `resolver.test.js` (4), `waypointDiscoveryOnce.test.js` (2) |
| W48 BONDED-DEVELOP-SKIPS-NEXT-MOVE-ADD | 06fa150 | revert | 2 — `bondedDevelopTakesNextMoveAdd.test.js` (2) |
| W49 ENDURE-SUBSTITUTION-DISCARDED | 91b2113 | revert | 2 — `endureStatSubstitution.test.js` (2) |
| W50 MISCHIEF-ASIDE-READS-RATIONALE | 6e790b3 | revert | 1 — `mischiefAsideNarration.test.js` |
| W51 CACHED-STATE-COMMAND-WRITES | c62c1d5 | revert | 19 — `bondApplyCachedState.test.js`, `cachedStateRefusedWrites.test.js` (7), `cachedStateRefusedWritesTable.test.js` (9), `siteDiscovery.test.js` (2) |
| W52 LEGACY-XP-BEFORE-PERSIST | 70d363e | revert | 4 — `bondApplyXpAfterSave.test.js` (2), `flowDefectFixes.test.js`, `legacyXpAfterPersist.test.js`; 5 more fail only on a missing export |
| W53 CLOCK-LOST-UPDATE | a3369da | revert | 2 — `clockWritesSerialised.test.js` (2) |
| W54 READY-CREATORS-TWO-GMS | 142116f | revert | 1 — `readyCreatorsCanonicalGm.test.js` |
| W55 COMBAT-TRACKER-VIEWED-COMBAT | 3d5297a | revert | 3 — `combatTrackerViewedCombat.test.js` (3) |
| W56 POSITION-TOGGLE-CLICKER | 599ede7 | revert | 1 — `combatPositionToggleClicker.test.js` |
| W57 BURN-BLOCK-IN-HEADER | 726f908 | revert | 2 — `upgradeCardText.test.js` (2) |
| W58 PERSIST-DEAD-STEPS | 4abc3b3 | revert | 5 — `persistResolution.test.js`, `persistResolutionMerge.test.js`, `persistResolutionRetiredSteps.test.js` (2), `resolver.test.js` |
| W59 LEDGER-COMMAND-NO-SCENE | 8f76745 | revert | 2 — `ledgerCommandStartsScene.test.js` (2) |
| W60 TRUTH-SET-OVER-STRIKE | f5b7b23 | revert | 4 — `truthSetLiftsStrike.test.js` (4) |
| W61 STATE-ATTRIBUTE-CASE | 49e3ae5 | revert | 2 — `stateAttributeCaseBlind.test.js` (2) |
| W62 JOURNAL-QUALIFIER-UNCHECKED | c82c3fe | revert | 3 — `journalQualifierVocabulary.test.js` (3) |
| W63 CONTRADICTED-TRUTH-ID-DEAD | 55db420 | revert | 2 — `contradictedTruthId.test.js` (2); 3 more fail only on a missing export |
| W64 SESSION-LOG-RETRACTED-LORE | b3d36e8 | revert | 1 — `sessionLogLoreRetracted.test.js` |
| W65 SHIP-POSITION-LOCATION-LINE | 28b05ae | revert | 3 — `shipPositionRecordedLocation.test.js` (3) |
| W66 REVIEW-CARD-SHIP-HINT | 853af87 | revert | 2 — `reviewCardShipHint.test.js`, `worldJournal.test.js` |
| W67 CORRECT-A-FACT-HELP | b5b0cfd | revert | 4 — `truthIdsShown.test.js` (4) |
| W68 RENAME-FACTS-STAY-TEXT-BOUND | 58f7f71 | revert | 1 — `renamePromotesLedgerSubjects.test.js` |
| W69 AUTO-SEED-STALE-RECORD-WRITE | c9b414b | revert | 1 — `autoSeedFieldWrites.test.js` |
| W70 VOW-TARGET-FACTION-CONNECTION | acf5361 | revert | 10 — `incitingBoldLabels.test.js` (2), `incitingIncident.test.js` (6), `vowTargetKind.test.js` (2); 1 more fail only on a missing export |
| W71 LORE-CARD-UNESCAPED | bfae239 | revert | 2 — `loreRecapEscaped.test.js` (2) |
| W72 POPULATION-TABLES-UNREACHABLE | 848bbf5 | revert | 1 — `populationTablesPerRegion.test.js` |
| W73 SECTOR-STUB-PERSPECTIVE | d2ae1b9 | revert | 2 — `sectorStubPerspective.test.js` (2) |
| W74 SITE-LOCATION-KLASS | e798d69 | revert | 1 — `siteLocationKlass.test.js` |
| W75 SITE-RENAME-STALE | a890747 | revert | 2 — `siteRenamedName.test.js` (2) |
| W76 TRUTH-QUEST-STARTERS | aa07659 | revert, by hand | 1 — `truthQuestStarterFidelity.test.js` (the quest-starter comparison: eleven rows differ), run with the vendored truths present |
| W77 API-LOG-PLAYER-BUFFER-GROWS | 04f8ede | revert | 1 — `apiLogPlayerBuffer.test.js` |
| W78 API-LOG-SETTING-REACHABLE | 4ba3f9d | revert | 1 — `apiLogSettingReachable.test.js` |
| W81 AUDIO-SYNTH-REQUEST-UNCHECKED | e313d2c | revert | 4 — `audioSynthRequestValidation.test.js` (4) |
| W80 AUDIO-KEYLESS-GM-WAITS-ON-ITSELF | b12b35e | revert | 2 — `audioKeylessCanonicalGm.test.js` (2) |
| W79 AUDIO-KEYED-PLAYER-REBILLS | ee89103 | revert | 5 — `audioKeyedPlayerCache.test.js` (5) |
| W82 DEADSCAN-STRING-SELF-MENTION | b2a9762 | revert, by hand | 3 — `deadscan.test.js` (3), `scripts/deadscan.mjs` restored from its parent; 2 more fail only on a missing export |
| W83 HELP-DOC-DRIFT | 546a7b6 | revert | 6 — `helpDocDrift.test.js` (6) |
| W84 LANG-FILE-DEAD | ced7270 | revert, by hand | 1 — `langStringsConsumed.test.js`, `lang/en.json` restored from its parent |
| W85 SESSION-PANEL-PLAYER-BEGIN | 70dc332 | revert | 2 — `sessionPanelPlayerBegin.test.js` (2) |
| W86 TOOLBAR-PC-TOGGLE-STALE | d5655f6 | revert | 2 — `toolbarPrivateChannelToggle.test.js` (2); 1 more fail only on a missing export |
| W87 SPEECH-LANGUAGE-CHANGE-IGNORED | 96d320e | revert | 2 — `speechInputSetting.test.js` (2) |
| D1 VOW-DEEPEN-TWICE | 7049b10 | revert | 4 — `cardActions.test.js` (2), `vowDeepenOnce.test.js` (2) |
| D2 SCENE-PLACE-AT-END | b17542d | revert | 5 — `scenePlacePerTruth.test.js` (5) |
| D3 LEGACY-XP-OFF-SHEET | e157be0 | revert | 19 — `actorBridge.test.js`, `bondApplyXpAfterSave.test.js`, `bondCommand.test.js`, `flowDefectFixes.test.js` (5), `legacyRollover.test.js` (3), `legacyXpAfterPersist.test.js`, `payoffFailure.test.js` (7); 3 more fail only on a missing export; 1 file(s) fail to load without the fix |
| D4 UPGRADE-OLD-MOVE-CARD | e3f4ee0 | revert | 3 — `upgradeClosedByLaterMove.test.js` (3) |
| D5 SECTOR-PASSAGE-COUNT | 5004de1 | revert | 3 — `sectorGenerator.test.js` (3) |
| D6 SCENE-CHALLENGE-ROLL | a85398d | revert | 2 — `progressRollBridge.test.js` (2); 1 file(s) fail to load without the fix |
| D7 CLOSEWORLD-HANDLER | cf27461 | revert | 1 — `noCloseWorldHook.test.js` |
| D8 PCLESS-PLAYER-FIRST-PC | 676aeb3 | revert | 1 — `pclessPlayerNotRolled.test.js` |

### Issue #329 — the ninth audit, part 1

Every fix commit is **sensitive**. One is shown by hand: **X04**'s test
reads the vendored assets (its sweep covers every ability), which the
script's worktrees do not check out — run with the data present and
`src/moves/abilityScanner.js` restored from its parent, four of its six
assertions fail (the two that pass are the control and the "When you must …"
guard). **X06**'s two direct-handler tests fail under revert only on the
missing `applyCombatThresholdChoice` export; its two re-render tests fail on
the behaviour.

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| X01 XCARD-CAPTURE-NO-NARRATION-ID | c1c3791 | revert | 11 — `captureNarrationIdThreading.test.js` (5), `incitingIncident.test.js`, `xcardCaptureNarrationId.test.js` (5) |
| X02 CONSISTENCY-CHECK-STALE-LEDGER | e488234 | revert | 4 — `consistencyCheckLiveLedger.test.js` (3), `consistencyCheckLiveLedgerPipeline.test.js` |
| X03 ENDURE-AT-ZERO-MARK-AND-ROLL | dc4d2bd | revert | 13 — `endureAtZeroChoice.test.js` (9), `payThePriceRoutes.test.js`, `resultUpgrade.test.js`, `sufferExecutor.test.js` (2) |
| X04 ASSET-ADD-ON-COST-MENTION | d6c2de4 | revert, by hand | 4 — `assetAddsCostMention.test.js` (4), run with the vendored assets present |
| X05 CARD-REPOST-AS-CLICKER | 0726854 | revert | 9 — `cardButtonsRollerPipeline.test.js` (2), `cardRepostAsRoller.test.js` (6), `milestone.test.js` |
| X06 THRESHOLD-CARD-NO-CLAIM | 5e38a44 | revert | 2 — `thresholdCardClaim.test.js` (2); 2 more fail only on a missing export |
| X07 REWARD-LINK-REFUSED-WRITE | 9badb9b | revert | 4 — `rewardLinkRefusedWrite.test.js` (4) |
| X08 MOVE-LOCK-RELEASED-BY-STALE-PIPELINE | ae7e50e | revert | 3 — `moveLockClaimToken.test.js` (3) |
| X09 SIDECAR-APPLY-CACHED-MUTATE | 91cae82 | revert | 7 — `narrationCachedStoreWrites.test.js` (2), `narrationWorkingCopy.test.js` (5) |
| X10 SCENE-COMMAND-CACHED-MUTATE | 9136c7b | revert | 3 — `sceneCommandCachedWrite.test.js` (3) |
| X11 SECTOR-STORE-CACHED-MUTATE | 77ed8bd | revert | 2 — `sectorStoreCachedMutation.test.js` (2) |
| X12 NOTES-SHEET-NOT-MIRRORED | f16e093 | revert | 6 — `entityPanelRelay.test.js`, `notesSheetCanonical.test.js` (5) |
| X13 BEGIN-REFUSED-SILENT | 2310da9 | revert | 2 — `beginSessionRefusedWrite.test.js` (2) |
| X14 SESSION-GATE-SILENT-DROP | a8deb17 | revert | 5 — `helpDocDrift.test.js`, `sessionGateNotice.test.js` (4) |

### Issue #329 — the four found while fixing it

Every fix commit is **sensitive**. **NOTES-PROMOTED-BEFORE**'s migration
tests fail under revert only on its missing export
(`moveRecordNotesToSheets`), so four injected defects show them on the
behaviour: the move that clears the copy without appending it, appends a
detail the tab already holds, treats `updateShip`'s whole-notes HTML copy as
a promoted detail, or runs on a player's client.

| Finding | Fix | Shown by | Assertions that fail without the fix |
| --- | --- | --- | --- |
| FULFIL-BUTTON-LOCAL-DISABLE | 9ef6fde | revert | 6 — `cardButtonWiring.test.js` (2), `fulfilButtonOnce.test.js` (4) |
| ENDURE-ZERO-ON-OTHER-OPTION | a93ba76 | revert | 3 — `endureZeroOnMomentumPick.test.js` (3) |
| XCARD-CAPTURE-TRANSITIONS | f43d0bb | revert | 5 — `entityExtractor.test.js` (3), `xcardCaptureTransitions.test.js` (2) |
| NOTES-PROMOTED-BEFORE | 082196a | revert; 4 injected defects | 1 — `notesPromotedBefore.test.js` (6 more only on the missing export); the defects: not moved 3, moved twice 1, HTML resurrected 1, any client 1 |

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
| `moveRules` › prepared at supply 1: +2 supply restores to 3, and the clear-unprepared option is unavailable | the prepared branch (#314 Q01) |
| `payThePriceRoutes` › a burn refunds no momentum — its reset replaces it — and no health the loss never took | a burn's reset still replaces momentum (#314 Q02) |
| `resultUpgrade` › with nothing refused both clocks rewind once and no card is posted | the whole-step rewind (#314 Q05) |
| `connectionPickerTarget` › an un-bonded pick is still no roll's worth: +0, its own track marked | an un-bonded development (#314 Q06) |
| `assetEffects` › an early release that is refused holds the lock through the prompt; the finally then releases it | the finally's retry of a refused release (#315 S01) |
| `assetEffects` › control: every write lands — the summary lists them, and the GMs get no card | an asset effect that lands (#315 S08) |
| `assetEffects` › …and Apply marks the preselected track | applying an offered mark (#315 S02) |
| `assetEffects` › …and choosing the mark marks its preselected track, with no momentum | choosing the mark (#315 S02) — before the fix it passed only because the old one-option dialog could not take the pick and the track was marked unasked |
| `assetEffects` › control: a mark that is the outcome's own still marks the lone track, unasked | the single-track shortcut (#315 S02) |
| `assetEffects` › control: with two tracks, skipping an optional mark leaves both at 0 | the audit's own control (#315 S02) |
| `assetEffects` › +1 mark at 0 ticks: 8 / +2 marks at 32 ticks: 40 | one mark, and the 40-tick cap (#315 S03) |
| `assetEffects` › control: once Repair clears battered, the effect lands | integrity on a ship that is not battered (#315 S05) |
| `shipBatteredCanonical` › control: a ship that is not battered takes it / a -1 integrity effect lands on a battered ship | the same, and a loss while battered (#315 S05) |
| `repair` › control: supply left over marks nothing / already unprepared: it stays marked… / too little supply: nothing is spent… | a trade short of 0, an impact already marked, the pay-in-full check (#315 S04) |
| `sufferExecutor` › an ally already unprepared is not marked again or named / an NPC card is no crew, and a sacrifice short of 0 marks no one | the crew's limits (#315 S07) |
| `actorBridge` › readMomentumState reads the effective bounds without touching the sheet | the read side, which never wrote (#316 T01) |
| `momentumBounds` › control: no impacts — three strong hits leave the bounds at 10 / +2 | the audit's own control (#316 T01) |
| `sceneChallengeClock` › control: a cancelled removal changes nothing / control: a combat track's completion touches no clock | the confirm's No, and a track with no paired clock (#316 T03) |
| `sessionStartClocks` › control: Begin advances the clock once; a second Begin repeats nothing and owes nothing | the audit's own control (#316 T04) |
| `burnMomentum` › buildBurnState — a move that rolled nothing cannot be burned: returns null for a rollKind "none" resolution / control: an action-roll miss with the same momentum is eligible | a "none" resolution's null outcome already made no burn (the gate is shown by `noRollMoves` through the pipeline), and an action miss still burns (#316 T05) |

For issue #321 the script lists 75 new tests that pass both ways, under
each commit in the Details below. The fixing commits name each as a control
in its title or comment — the case that must keep working (a one-word odds
alias, a player-owned PC's sheet edit, a GM's own click, two PCs' own
same-named vows, a failed run that can be retried …) — or as a test whose
defect an earlier fix in the series already closed (U57's two panel races,
closed by U05's relay queue).

For issue #322 the script lists 26 new tests that pass both ways, under
each commit in the Details below; 24 are controls — named so in the test
(`control: …`), or the case that must keep working (a miss that pays
nothing, a full name that still matches, a Play after a Stop, an old card
played from its button, a fight's own position with no character's, a card
from before the burn recorded its outcome's momentum; and `playtestFixesV1728`
› the audio cache memo, an existing test whose stale mock V16's commit
removed). The other two were V16's and V19's misses, corrected in `03ba63f`
(above).

Two more passed both ways under 611979e's revert because they cover N02,
fixed in the commit before it: `consequenceTargets` › a strong hit's +1
integrity raises it / a weak hit's trade costs a momentum and raises it.
Injecting N02's defect (`n02-integrity-to-pc.patch`) fails both.

For issue #325 the script lists 60 new tests that pass both ways, under
each commit in the Details below. Each was read: 49 are named controls
(`control: …` — the case that must keep working, often the audit probe's own
control); ten are guards the fix must keep — a rank outside 1–5 keeps the
fallback (W01), a player with no PC pays nothing onto another player's
(W10), an un-bonded connection adds nothing (W18), "auto" with two or more
players is still third person (W21), a record with no disposition shows no
row (W22), "Captain Ren" still selects Ren, a name matching no one among two
bonded connections is still ambiguous and a vow named in a longer phrase is
still found (W30), an empty truths page is no save (W35), a capitalised move
beats a lowercase noun named after it (W36); and one is W19's Chaotic case,
where an unlisted stat is kept by the maintainer's decision.

For issue #326 the script lists 100 new tests that pass both ways. Each was
read: 87 are named controls; five are W82's, which pass there only because
the script does not revert `scripts/` (run by hand, above, they fail); and
eight are guards the fix must keep — another PC's fight is left alone (W45),
a built-in oracle id is still refused before anything is written (W51), a
clock write that fails does not hold up the next (W53), a cache answer
releases no keyless player's synthesis wait (W79), a player's Begin / End
opens the same dialogs as their commands (W85), a truth recorded before the
stamp still falls back to the scene's end place (D2), the move just made
keeps its own upgrades (D4) and a one-PC table still rolls its one PC (D8).

For issue #329 the script lists 22 new tests that pass both ways. Each was
read: 18 are named controls; four are guards the fix must keep — a
narration's own new truth is audited beside the live ledger (X02), a card
with no roller still posts as its author (X05), a milestone suggestion with
several open vows names none so the roller is asked (X05), and a Begin a
Session retried after a refusal begins the session and pays its momentum
once (X13). X04's two passing assertions, run by hand, are its control and
the "When you must …" guard.

For the four found while fixing it the script lists seven new tests that pass
both ways. Each was read: six are named controls (above 0 health no at-0
choice, and "-1 health" offers it once; the capture's transitions before the
X-Card, and an earlier narration's and a GM's change left alone; an
`updateShip` that leaves the notes alone, and an `!ship envision` append
still reaching the narrator's row); one is a guard the fix must keep — a
faction stance changed on the record since the narration stands
(XCARD-CAPTURE-TRANSITIONS).

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

### 285fe00 — fix: Resupply clears unprepared for +1 supply, never +2 (issue #314 Q01)

Test files: `tests/unit/moveRules.test.js`, `tests/unit/resolver.test.js`. Source restored: 1 file(s).

- With the fix: 286 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 282 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/moveRules.test.js › Q01 — Resupply: unprepared, clear it and +1 supply; otherwise +2 unprepared at supply 0: the clear-unprepared option restores 1, and the +2 option is unavailable | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' to match /data-option-index="1" disabled/ |
| (new) tests/unit/moveRules.test.js › Q01 — Resupply: unprepared, clear it and +1 supply; otherwise +2 the weak hit is gated the same way: unprepared at 0 takes 1, never 2 | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' to match /data-option-index="1" disabled/ |
| (new) tests/unit/resolver.test.js › recover-move dialog prompts resupply:strong_hit — unprepared: clear it and +1 supply; otherwise +2 — each branch gated on the impact | AssertionError: expected [ { clearImpact: 'unprepared' }, …(1) ] to deeply equal [ { clearImpact: 'unprepared' }, …(1) ] |
| (new) tests/unit/resolver.test.js › recover-move dialog prompts resupply:weak_hit keeps the same conditional supply, at a cost | AssertionError: expected undefined to be '!unprepared' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/moveRules.test.js › Q01 — Resupply: unprepared, clear it and +1 supply; otherwise +2 prepared at supply 1: +2 supply restores to 3, and the clear-unprepared option is unavailable

### 257630b — fix: harm or stress past the meter is momentum (issue #314 Q02)

Test files: `tests/unit/payThePriceRoutes.test.js`, `tests/unit/resultUpgrade.test.js`, `tests/unit/sufferExecutor.test.js`. Source restored: 3 file(s).

- With the fix: 55 passed, 0 failed.
- Without it: 11 failed (10 new; 0 only for a missing export); 44 still pass (1 new).
- Verdict: **sensitive** — 11 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/payThePriceRoutes.test.js › Q02 — harm past 0 health is momentum, through the move pipeline Pay the Price at 0 health: one Endure Harm card, health stays 0, momentum 9 → 8 | AssertionError: expected 9 to be 8 // Object.is equality |
| (new) tests/unit/payThePriceRoutes.test.js › Q02 — harm past 0 health is momentum, through the move pipeline an improvement refunds the momentum the harm took: 5 → 4, the strong hit's +2, +1 refunded = 7 | AssertionError: expected 5 to be 4 // Object.is equality |
| (new) tests/unit/payThePriceRoutes.test.js › Q02 — harm past 0 health is momentum, through the move pipeline the ordinary loss is unchanged: health 5 → 4, no momentum, and the receipt is the health | AssertionError: expected undefined to be null |
| (new) tests/unit/resultUpgrade.test.js › P04 — a burn refunds the Pay the Price loss that landed a loss at 0 health is momentum (issue #314 Q02): no health is refunded, and a burn's reset replaces the momentum | AssertionError: expected 9 to be 8 // Object.is equality |
| tests/unit/resultUpgrade.test.js › P04 — a burn refunds the Pay the Price loss that landed the solo fallback's real loss is refunded: companion route → Endure Harm, health 5 → 4 → 5 | AssertionError: expected undefined to deeply equal [ ObjectContaining{…} ] |
| (new) tests/unit/sufferExecutor.test.js › endureHarm harm past 0 health is momentum a loss of 3 at health 1: health 1 → 0, the other 2 as momentum 5 → 3 | AssertionError: expected [ { health: -3 } ] to deeply equal [ { health: -1 }, { momentum: -2 } ] |
| (new) tests/unit/sufferExecutor.test.js › endureHarm harm past 0 health is momentum a loss equal to the health left takes no momentum | AssertionError: expected undefined to be null |
| (new) tests/unit/sufferExecutor.test.js › endureHarm harm past 0 health is momentum a loss below the health left takes no momentum | AssertionError: expected undefined to be null |
| (new) tests/unit/sufferExecutor.test.js › endureHarm harm past 0 health is momentum at 0 health already, the whole loss is momentum, and no health write is made | AssertionError: expected [ { health: -2 } ] to deeply equal [ { momentum: -2 } ] |
| (new) tests/unit/sufferExecutor.test.js › endureHarm harm past 0 health is momentum at the momentum minimum, what cannot be taken is said on the card, not lost in silence | AssertionError: expected -5 to be -6 // Object.is equality |
| (new) tests/unit/sufferExecutor.test.js › endureStress stress past 0 spirit is momentum: a loss of 3 at spirit 1, momentum 5 → 3 | AssertionError: expected [ { spirit: -3 } ] to deeply equal [ { spirit: -1 }, { momentum: -2 } ] |

- New test passing with and without the fix (a control?): tests/unit/payThePriceRoutes.test.js › Q02 — harm past 0 health is momentum, through the move pipeline a burn refunds no momentum — its reset replaces it — and no health the loss never took

### 5e9095d — fix: a Pay the Price "Roll twice" lands each leaf's suffer route (issue #314 Q03)

Test files: `tests/unit/creditTheRoller.test.js`, `tests/unit/oracleRoller.test.js`, `tests/unit/payThePriceRoutes.test.js`. Source restored: 2 file(s).

- With the fix: 48 passed, 0 failed.
- Without it: 18 failed (17 new; 0 only for a missing export); 30 still pass (0 new).
- Verdict: **sensitive** — 18 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/creditTheRoller.test.js › across a booted table !pay-the-price: the routed suffer lands on the typist's PC — once, on the typist's client | AssertionError: expected [] to deeply equal [ { on: 'pl-1', …(2) } ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) surfaces the route for 'You are harmed' (75-81 band) | AssertionError: expected undefined to deeply equal [ { move: 'endure_harm', amount: 1 } ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) surfaces the route for 'You are stressed' (82-88 band) | AssertionError: expected undefined to deeply equal [ Array(1) ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) surfaces the route for 'You waste resources' (69-74 band) | AssertionError: expected undefined to deeply equal [ { …(2) } ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) surfaces the route for 'Your vehicle suffers damage' (63-68 band) | AssertionError: expected undefined to deeply equal [ { move: 'withstand_damage', …(1) } ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) surfaces the route with soloFallback for 'friend in harm's way' (51-56 band) | AssertionError: expected undefined to deeply equal [ { …(3) } ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) lists no route on narrative-only entries | AssertionError: expected undefined to deeply equal [] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) a 'Roll twice' keeps each leaf's route (issue #314 Q03) harm and stress: both routes, in the leaves' order, under the joined text | AssertionError: expected undefined to deeply equal [ …(2) ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) a 'Roll twice' keeps each leaf's route (issue #314 Q03) a narrative leaf and a routed one: the one route | AssertionError: expected undefined to deeply equal [ Array(1) ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) a 'Roll twice' keeps each leaf's route (issue #314 Q03) two of the same leaf are two routes — each lands once | AssertionError: expected undefined to deeply equal [ …(2) ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) a 'Roll twice' keeps each leaf's route (issue #314 Q03) a nested Roll twice adds its leaves' routes | AssertionError: expected undefined to deeply equal [ …(3) ] |
| (new) tests/unit/oracleRoller.test.js › rollOracle — Pay the Price sufferRoutes (F16 Phase E) a 'Roll twice' keeps each leaf's route (issue #314 Q03) the recursion cap ends a run of Roll twice with the directive's own text and no route | AssertionError: expected undefined to deeply equal [] |
| (new) tests/unit/payThePriceRoutes.test.js › Q03 — a Pay the Price 'Roll twice' lands each leaf's route 96 → 78 + 85: the card says harm and stress, both routes are on it, and both land | AssertionError: expected '&lt;div class="sf-ptp-card">&lt;strong>Pay …' to contain 'Routes to endure_harm (-1), endure_st…' |
| (new) tests/unit/payThePriceRoutes.test.js › Q03 — a Pay the Price 'Roll twice' lands each leaf's route a burn of that miss refunds the health and the spirit, in one write | TypeError: .toMatch() expects to receive a string, but got undefined |
| (new) tests/unit/payThePriceRoutes.test.js › Q03 — a Pay the Price 'Roll twice' lands each leaf's route a narrative leaf beside a routed one: the one route lands | AssertionError: expected 5 to be 4 // Object.is equality |
| (new) tests/unit/payThePriceRoutes.test.js › Q03 — a Pay the Price 'Roll twice' lands each leaf's route two of the same leaf each land: 78 + 80 is two Endure Harms, health 5 → 3 | AssertionError: expected 5 to be 3 // Object.is equality |
| (new) tests/unit/payThePriceRoutes.test.js › Q03 — a Pay the Price 'Roll twice' lands each leaf's route the direct-78 control is unchanged: one Endure Harm, health 5 → 4 | AssertionError: expected undefined to deeply equal [ { move: 'endure_harm', amount: 1 } ] |
| (new) tests/unit/payThePriceRoutes.test.js › Q03 — a Pay the Price 'Roll twice' lands each leaf's route !ptp lands each leaf too, on the typist's PC | AssertionError: expected '&lt;div class="sf-ptp-card">&lt;strong>Pay …' to contain 'Routes to endure_harm (-1), endure_st…' |

### 082e78d — fix: a bond Item mirrors its own connection, by the record's id (issue #314 Q04)

Test files: `tests/unit/actorBridge.test.js`, `tests/unit/bondCommand.test.js`, `tests/unit/bondItemMirror.test.js`. Source restored: 3 file(s).

- With the fix: 121 passed, 0 failed.
- Without it: 10 failed (10 new; 0 only for a missing export); 111 still pass (0 new).
- Verdict: **sensitive** — 10 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/actorBridge.test.js › setBondItemTicks a keyed Item matches its own connection only a same-named Item keyed to another connection keeps its ticks, on this PC and on another | AssertionError: expected 3 to be 1 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › setBondItemTicks a keyed Item matches its own connection only a keyed Item is found by its id after the connection was renamed; the stale name on another's Item does not match | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › setBondItemTicks a keyed Item matches its own connection only the name fallback takes an unkeyed Item only when it is the PC's one of that name | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › setBondItemTicks a keyed Item matches its own connection only a PC with a keyed Item for the connection ignores the name on its other Items | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › setBondItemRank raises the Item keyed to the connection — renamed or not — and never a same-named Item keyed to another | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler mirrors the rank onto the Item keyed by the record's _id — renamed or not — and leaves a same-named sibling's Item alone | AssertionError: expected 'dangerous' to be 'formidable' // Object.is equality |
| (new) tests/unit/bondItemMirror.test.js › Q04 — two connections named Sable marking one's relationship progress writes its Item alone | AssertionError: expected [ 8, 8 ] to deeply equal [ 8, 20 ] |
| (new) tests/unit/bondItemMirror.test.js › Q04 — two connections named Sable a strong hit with a match on one's Develop raises its record and its Item — the other Sable keeps its rank | AssertionError: expected [ 'formidable', 'formidable' ] to deeply equal [ 'formidable', 'dangerous' ] |
| (new) tests/unit/bondItemMirror.test.js › Q04 — a renamed connection the pipeline's rank raise reaches the Item keyed by the record's _id, though the Item still bears the old name | AssertionError: expected 'dangerous' to be 'formidable' // Object.is equality |
| (new) tests/unit/bondItemMirror.test.js › Q04 — a renamed connection `!bond` raises the renamed connection's Item too, and not a same-named sibling's | AssertionError: expected 'dangerous' to be 'formidable' // Object.is equality |

### d1e15a5 — fix: a partial vow-clock rewind retries only the Items still owed (issue #314 Q05)

Test files: `tests/unit/resultUpgrade.test.js`. Source restored: 1 file(s).

- With the fix: 21 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 18 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/resultUpgrade.test.js › Q05 — a partial vow-clock rewind retries only the Items still owed the second Item's refused rewind alone goes to the GMs; their Retry rewinds it once and leaves the first clock as it is | AssertionError: expected '&lt;div class="sf-clock-card">&lt;strong>⏰ …' to match /vow-a clock rewound/ |
| (new) tests/unit/resultUpgrade.test.js › Q05 — a partial vow-clock rewind retries only the Items still owed a refusal on the first Item: the second lands, the first alone is retried | AssertionError: expected [ 'vow-a', 'vow-b' ] to deeply equal [ 'vow-a' ] |
| (new) tests/unit/resultUpgrade.test.js › Q05 — a partial vow-clock rewind retries only the Items still owed a second refusal during the Retry goes on a fresh card with that Item alone; its Retry lands | AssertionError: expected [ 1, 3 ] to deeply equal [ 2, 3 ] |

- New test passing with and without the fix (a control?): tests/unit/resultUpgrade.test.js › Q05 — a partial vow-clock rewind retries only the Items still owed with nothing refused both clocks rewind once and no card is posted

### 79c45d1 — fix: a bonded Develop Your Relationship rolls +rank in the pipeline (issue #314 Q06)

Test files: `tests/unit/connectionPickerTarget.test.js`, `tests/unit/developRelationship.test.js`, `tests/unit/statEnrichment.test.js`. Source restored: 5 file(s).

- With the fix: 105 passed, 0 failed.
- Without it: 19 failed (19 new; 9 only for a missing export); 86 still pass (1 new).
- Verdict: **sensitive** — 10 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) from the picker: epic Vega is 3 + 5 = 8 against 4 and 7 — a strong hit, 2 bonds ticks (was +0, a miss, 0) | AssertionError: expected { …(18) } to match object { …(6) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) typed: the named bonded connection is resolved before the dice and rolled +rank | AssertionError: expected { …(10) } to match object { moveTargetId: 'conn-vega', …(2) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) troublesome: the stat is the rank, worth +1 | AssertionError: expected { …(27) } to match object { statUsed: 'troublesome', …(2) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) dangerous: the stat is the rank, worth +2 | AssertionError: expected { …(27) } to match object { statUsed: 'dangerous', …(2) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) formidable: the stat is the rank, worth +3 | AssertionError: expected { …(27) } to match object { statUsed: 'formidable', …(2) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) extreme: the stat is the rank, worth +4 | AssertionError: expected { …(27) } to match object { statUsed: 'extreme', …(2) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) epic: the stat is the rank, worth +5 | AssertionError: expected { …(27) } to match object { Object (statUsed, statValue, ...) } |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) parity with `!bond`: the same dice score the same, and both pay 2 ticks | AssertionError: expected { …(27) } to match object { actionScore: 8, …(1) } |
| (new) tests/unit/developRelationship.test.js › constants BOND_ROLL_ADDS is +1 … +5 up the ladder (play kit p. 3) | AssertionError: expected undefined to deeply equal { troublesome: 1, dangerous: 2, …(3) } |
| (new) tests/unit/developRelationship.test.js › bondedDevelopRoll a bonded connection rolls its rank, worth its adds, at every rank | TypeError: Cannot convert undefined or null to object |
| (new) (API) tests/unit/developRelationship.test.js › bondedDevelopRoll an un-bonded connection is no roll | TypeError: (0 , bondedDevelopRoll) is not a function |
| (new) (API) tests/unit/developRelationship.test.js › bondedDevelopRoll an unknown rank is no roll | TypeError: (0 , bondedDevelopRoll) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichBondedDevelop a picker's host id resolves the bonded connection: the rank is the stat, worth its adds | TypeError: (0 , enrichBondedDevelop) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichBondedDevelop a typed name resolves it too, and stamps the host id for the branch after the roll | TypeError: (0 , enrichBondedDevelop) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichBondedDevelop an un-bonded connection leaves the stat alone — its development is no roll | TypeError: (0 , enrichBondedDevelop) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichBondedDevelop no connection resolves (an unknown name, two bonded to fall back on): nothing changes | TypeError: (0 , enrichBondedDevelop) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichBondedDevelop an unknown name with one bonded connection falls back to it, as selectConnection always has | TypeError: (0 , enrichBondedDevelop) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichBondedDevelop a stat the interpreter guessed gives way to the rank | TypeError: (0 , enrichBondedDevelop) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichBondedDevelop every other move is left as it is | TypeError: (0 , enrichBondedDevelop) is not a function |

- New test passing with and without the fix (a control?): tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) an un-bonded pick is still no roll's worth: +0, its own track marked

### 6879144 — fix: an earlier move's finally never releases a later move's lock (issue #315 S01)

Test files: `tests/unit/assetEffects.test.js`, `tests/unit/pipeline.test.js`. Source restored: 1 file(s).

- With the fix: 9 passed, 0 failed.
- Without it: 5 failed (2 new; 0 only for a missing export); 4 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/assetEffects.test.js › S01 — a move's finally never releases a later move's lock A's prompt is open, B holds the lock, A finishes: B keeps it, so C is refused until B is done | AssertionError: expected false to be true // Object.is equality |
| tests/unit/pipeline.test.js › releasePendingMoveLock clears a held lock | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/pipeline.test.js › releasePendingMoveLock reports a refused release as not released, and leaves the lock held | AssertionError: expected undefined to be false // Object.is equality |
| tests/unit/pipeline.test.js › releasePendingMoveLock is idempotent — a second call when already released is a no-op | AssertionError: expected undefined to be true // Object.is equality |
| tests/unit/pipeline.test.js › releasePendingMoveLock tolerates a missing campaignState without throwing | AssertionError: expected undefined to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S01 — a move's finally never releases a later move's lock an early release that is refused holds the lock through the prompt; the finally then releases it

### d9f8933 — fix: an asset effect is reported applied only once its write lands (issue #315 S08)

Test files: `tests/unit/assetEffects.test.js`, `tests/unit/consequenceRiders.test.js`. Source restored: 3 file(s).

- With the fix: 23 passed, 0 failed.
- Without it: 6 failed (5 new; 0 only for a missing export); 17 still pass (1 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/assetEffects.test.js › S08 — an asset effect is applied only once its write lands a refused integrity write: the ship is unchanged, the card says why, and the GMs' Retry applies it once | AssertionError: expected '&lt;div class="sf-rider-summary">&lt;strong…' not to match /Asset effects applied/ |
| (new) tests/unit/assetEffects.test.js › S08 — an asset effect is applied only once its write lands a refused progress save: nothing is marked, in the world or this client's cache, and the Retry marks it once | AssertionError: expected [ 8 ] to deeply equal [ +0 ] |
| (new) tests/unit/assetEffects.test.js › S08 — an asset effect is applied only once its write lands one effect lands and one is refused: the card splits them, and the Retry replays the refused one only | AssertionError: expected '&lt;div class="sf-rider-summary">&lt;strong…' to match /…/strong>&lt;ul>&lt;li>\+1 momentum[\s\S]*Not applied:[\s\S]*\+1 integrity |
| tests/unit/consequenceRiders.test.js › applyMeterRiders applies summed character-meter deltas to the actor | AssertionError: expected { label: '+1 momentum', …(1) } to match object { ok: true, rider: { …(2) } } |
| (new) tests/unit/consequenceRiders.test.js › applyMeterRiders a refused meter write is not applied — each rider in it says so | Error: refused |
| (new) tests/unit/consequenceRiders.test.js › applyMeterRiders with no character or no ship to change, those riders are not applied | AssertionError: expected [ [ undefined, undefined ], …(1) ] to deeply equal [ [ false, 'no-pc' ], …(1) ] |

- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S08 — an asset effect is applied only once its write lands control: every write lands — the summary lists them, and the GMs get no card

### a9f238a — fix: an optional or "choose one" progress mark stays a choice with one track open (issue #315 S02)

Test files: `tests/unit/assetEffects.test.js`, `tests/unit/consequenceRiders.test.js`. Source restored: 2 file(s).

- With the fix: 30 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 27 still pass (4 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/assetEffects.test.js › S02 — an optional or exclusive progress mark stays a choice with one track open a 'you may mark progress' is offered, the lone track preselected — Skip all leaves it at 0 | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/assetEffects.test.js › S02 — an optional or exclusive progress mark stays a choice with one track open 'mark progress or +2 momentum': both are options of one choice, and choosing momentum leaves the track alone | AssertionError: expected '&lt;p>Apply these asset effects from the…' to match /name="choice-0" value="0" checked> Ma…/ |
| (new) tests/unit/consequenceRiders.test.js › groupPromptedRiders (riderDialog) a progress rider in a choice group stays one of its options | AssertionError: expected [ { resource: 'progress', …(3) } ] to have a length of +0 but got 1 |

- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S02 — an optional or exclusive progress mark stays a choice with one track open …and Apply marks the preselected track
- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S02 — an optional or exclusive progress mark stays a choice with one track open …and choosing the mark marks its preselected track, with no momentum
- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S02 — an optional or exclusive progress mark stays a choice with one track open control: a mark that is the outcome's own still marks the lone track, unasked
- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S02 — an optional or exclusive progress mark stays a choice with one track open control: with two tracks, skipping an optional mark leaves both at 0

### 4e33ed1 — fix: a progress effect marks its amount, either sign (issue #315 S03)

Test files: `tests/unit/assetEffects.test.js`. Source restored: 2 file(s).

- With the fix: 18 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 14 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/assetEffects.test.js › S03 — a progress effect marks its amount, either sign, within 0–40 ticks +2 marks at 0 ticks: 16 | AssertionError: expected [ 8 ] to deeply equal [ 16 ] |
| (new) tests/unit/assetEffects.test.js › S03 — a progress effect marks its amount, either sign, within 0–40 ticks -1 mark at 16 ticks: 8 | AssertionError: expected [ 24 ] to deeply equal [ 8 ] |
| (new) tests/unit/assetEffects.test.js › S03 — a progress effect marks its amount, either sign, within 0–40 ticks -2 marks at 8 ticks: 0 | AssertionError: expected [ 16 ] to deeply equal [ +0 ] |
| (new) tests/unit/assetEffects.test.js › S03 — a progress effect marks its amount, either sign, within 0–40 ticks through the picker too: +2 on the track chosen of two | AssertionError: expected [ +0, 8 ] to deeply equal [ +0, 16 ] |

- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S03 — a progress effect marks its amount, either sign, within 0–40 ticks +1 mark at 0 ticks: 8
- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S03 — a progress effect marks its amount, either sign, within 0–40 ticks +2 marks at 32 ticks: 40

### 7d5083b — fix: a finished track is never an asset effect's progress target (issue #315 S06)

Test files: `tests/unit/assetEffects.test.js`. Source restored: 1 file(s).

- With the fix: 22 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 18 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/assetEffects.test.js › S06 — a finished track is never a progress effect's target only a finished expedition: it is left at 16, nothing is asked, and the card says there is no open track | AssertionError: expected [ 24 ] to deeply equal [ 16 ] |
| (new) tests/unit/assetEffects.test.js › S06 — a finished track is never a progress effect's target one open beside a finished one: the open one is the sole target, marked unasked | AssertionError: expected [ SimDialog{ client: 'gm-1', …(6) } ] to have a length of +0 but got 1 |
| (new) tests/unit/assetEffects.test.js › S06 — a finished track is never a progress effect's target the picker offers open tracks only | AssertionError: expected '&lt;p>Apply these asset effects from the…' not to match /Old Survey/ |
| (new) tests/unit/assetEffects.test.js › S06 — a finished track is never a progress effect's target a track finished while the prompt is open is not marked, and the card says so | AssertionError: expected [ +0, 8 ] to deeply equal [ +0, +0 ] |

### 29511e3 — fix: an asset effect cannot raise a battered ship's integrity (issue #315 S05)

Test files: `tests/unit/assetEffects.test.js`, `tests/unit/shipBatteredCanonical.test.js`. Source restored: 4 file(s).

- With the fix: 42 passed, 0 failed.
- Without it: 8 failed (8 new; 5 only for a missing export); 34 still pass (3 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/assetEffects.test.js › S05 — an integrity effect cannot raise a battered ship's integrity +1 integrity on a battered ship at 0: not applied, still battered, and the card says why | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) (API) tests/unit/shipBatteredCanonical.test.js › changeIntegrity — the one integrity writer for a consequence or an asset effect refuses a rise while the sheet says battered, and changes nothing | TypeError: (0 , changeIntegrity) is not a function |
| (new) (API) tests/unit/shipBatteredCanonical.test.js › changeIntegrity — the one integrity writer for a consequence or an asset effect the native field decides when the stores disagree: sheet battered, flag not — refused | TypeError: (0 , changeIntegrity) is not a function |
| (new) (API) tests/unit/shipBatteredCanonical.test.js › changeIntegrity — the one integrity writer for a consequence or an asset effect …sheet un-ticked, flag still battered — the rise lands | TypeError: (0 , changeIntegrity) is not a function |
| (new) (API) tests/unit/shipBatteredCanonical.test.js › changeIntegrity — the one integrity writer for a consequence or an asset effect a loss lands on a battered ship, within 0 | TypeError: (0 , changeIntegrity) is not a function |
| (new) (API) tests/unit/shipBatteredCanonical.test.js › changeIntegrity — the one integrity writer for a consequence or an asset effect no such ship: not applied | TypeError: (0 , changeIntegrity) is not a function |
| (new) tests/unit/shipBatteredCanonical.test.js › an asset effect's integrity (applyMeterRiders) on a battered ship — issue #315 S05 +1 integrity on a sheet-battered ship at 0 is not applied: integrity stays 0, still battered | AssertionError: expected { rider: { …(3) }, ok: true } to match object { ok: false, reason: 'battered' } |
| (new) tests/unit/shipBatteredCanonical.test.js › an asset effect's integrity (applyMeterRiders) on a battered ship — issue #315 S05 the sheet alone battered is enough to refuse it | AssertionError: expected { rider: { …(3) }, ok: true } to match object { ok: false, reason: 'battered' } |

- New test passing with and without the fix (a control?): tests/unit/assetEffects.test.js › S05 — an integrity effect cannot raise a battered ship's integrity control: once Repair clears battered, the effect lands
- New test passing with and without the fix (a control?): tests/unit/shipBatteredCanonical.test.js › an asset effect's integrity (applyMeterRiders) on a battered ship — issue #315 S05 control: a ship that is not battered takes it
- New test passing with and without the fix (a control?): tests/unit/shipBatteredCanonical.test.js › an asset effect's integrity (applyMeterRiders) on a battered ship — issue #315 S05 a -1 integrity effect lands on a battered ship

### 403ea27 — fix: Repair's trade of the last supply marks unprepared (issue #315 S04)

Test files: `tests/unit/repair.test.js`. Source restored: 2 file(s).

- With the fix: 33 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 31 still pass (3 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/repair.test.js › applyRepairSpends the trade's last supply marks unprepared (issue #315 S04) supply 1, one traded: supply 0, unprepared, the repair lands, and the card says both | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/repair.test.js › applyRepairSpends the trade's last supply marks unprepared (issue #315 S04) the impact's write is refused: the payment and the repair stand, and the card says to mark it | AssertionError: expected '&lt;div class="sf-repair-card">&lt;strong>R…' to match /Out of supply, but unprepared could n…/ |

- New test passing with and without the fix (a control?): tests/unit/repair.test.js › applyRepairSpends the trade's last supply marks unprepared (issue #315 S04) control: supply left over marks nothing
- New test passing with and without the fix (a control?): tests/unit/repair.test.js › applyRepairSpends the trade's last supply marks unprepared (issue #315 S04) already unprepared: it stays marked, and the card does not claim a new mark
- New test passing with and without the fix (a control?): tests/unit/repair.test.js › applyRepairSpends the trade's last supply marks unprepared (issue #315 S04) too little supply: nothing is spent, nothing is marked, nothing is repaired

### 9666fa6 — fix: the crew sharing supply is marked unprepared together (issue #315 S07)

Test files: `tests/unit/repair.test.js`, `tests/unit/sharedSupply.test.js`, `tests/unit/sufferExecutor.test.js`. Source restored: 4 file(s).

- With the fix: 88 passed, 0 failed.
- Without it: 7 failed (7 new; 1 only for a missing export); 81 still pass (2 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/repair.test.js › applyRepairSpends the trade's last supply marks unprepared (issue #315 S04) the ally sharing the supply is marked with the payer, and both PCs' momentum bounds follow | AssertionError: expected [ true, false ] to deeply equal [ true, true ] |
| (new) (API) tests/unit/sharedSupply.test.js › the crew shares the zero-supply impact (issue #315 S07) supplyAllies: every other PC, no NPC card, none for a non-PC | TypeError: (0 , supplyAllies) is not a function |
| (new) tests/unit/sharedSupply.test.js › the crew shares the zero-supply impact (issue #315 S07) two PCs at supply 1: A sacrifices 1 — supply [0, 0] once synced, both unprepared, both momentum bounds lowered | AssertionError: expected [ true, false ] to deeply equal [ true, true ] |
| (new) tests/unit/sharedSupply.test.js › the crew shares the zero-supply impact (issue #315 S07) control: raising the supply by a sheet edit mirrors the value and clears no one — a recovery move clears it | AssertionError: expected [ true, false ] to deeply equal [ true, true ] |
| (new) tests/unit/sufferExecutor.test.js › sacrificeResources the crew sharing the supply is marked unprepared together two PCs at supply 1: A's sacrifice to 0 marks A and B, and the card names B | AssertionError: expected [ true, false ] to deeply equal [ true, true ] |
| (new) tests/unit/sufferExecutor.test.js › sacrificeResources the crew sharing the supply is marked unprepared together the roller already unprepared: the allies are still marked | AssertionError: expected [] to deeply equal [ 'pc-b:unprepared' ] |
| (new) tests/unit/sufferExecutor.test.js › sacrificeResources the crew sharing the supply is marked unprepared together an ally's refused write: the others stand, nothing throws, and the card says to mark it | AssertionError: expected [ true, false, false ] to deeply equal [ true, false, true ] |

- New test passing with and without the fix (a control?): tests/unit/sufferExecutor.test.js › sacrificeResources the crew sharing the supply is marked unprepared together an ally already unprepared is not marked again or named
- New test passing with and without the fix (a control?): tests/unit/sufferExecutor.test.js › sacrificeResources the crew sharing the supply is marked unprepared together an NPC card is no crew, and a sacrifice short of 0 marks no one

### e6c6500 — fix: momentum writes leave the sheet's base max and reset alone (issue #316 T01)

Test files: `tests/unit/actorBridge.test.js`, `tests/unit/momentumBounds.test.js`, `tests/unit/repair.test.js`, `tests/unit/sharedSupply.test.js`. Source restored: 1 file(s).

- With the fix: 155 passed, 0 failed.
- Without it: 13 failed (10 new; 0 only for a missing export); 142 still pass (2 new).
- Verdict: **sensitive** — 13 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/actorBridge.test.js › applyMeterChanges clamps momentum to −6–momentumMax (reset is the burn target, not a floor) | AssertionError: expected { 'system.momentum.value': 8, …(2) } to not have property "system.momentum.resetValue" |
| (new) tests/unit/actorBridge.test.js › applyMeterChanges reduces the effective momentum maximum by 1 per active impact (all categories count) | AssertionError: expected { 'system.momentum.value': 7, …(2) } to not have property "system.momentum.max" |
| (new) tests/unit/actorBridge.test.js › applyMeterChanges counts vehicle and burden impacts toward the effective maximum too | AssertionError: expected { 'system.momentum.value': 8, …(2) } to not have property "system.momentum.max" |
| (new) tests/unit/actorBridge.test.js › setDebility clamps momentum to the new effective maximum when an impact is marked | AssertionError: expected { 'system.momentum.max': 9, …(2) } to deeply equal { 'system.momentum.value': 9 } |
| (new) tests/unit/actorBridge.test.js › setDebility writes nothing more when the momentum is already within the new maximum | AssertionError: expected [ { …(1) }, …(1) ] to have a length of 1 but got 2 |
| (new) tests/unit/actorBridge.test.js › momentum writes leave the sheet's base max and reset alone (issue #316 T01) three gains with one impact keep the effective maximum at 9 and the reset at +1 | AssertionError: expected [ { max: 8, reset: +0 }, …(2) ] to deeply equal [ { max: 9, reset: 1 }, …(2) ] |
| (new) tests/unit/actorBridge.test.js › momentum writes leave the sheet's base max and reset alone (issue #316 T01) clamps a gain to the effective maximum the getters report | AssertionError: expected 9 to be 10 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › momentum writes leave the sheet's base max and reset alone (issue #316 T01) clearing the impact restores the full bounds: 10 and +2, with nothing written | AssertionError: expected 9 to be 10 // Object.is equality |
| (new) tests/unit/actorBridge.test.js › momentum writes leave the sheet's base max and reset alone (issue #316 T01) without the getters, the bounds come from the sheet's bases — an edited base is kept | AssertionError: expected { value: 2, min: -6, max: 9, …(2) } to match object { max: 9, reset: 2 } |
| (new) tests/unit/momentumBounds.test.js › T01 — the pipeline's momentum writes leave the sheet's bases alone one impact: three strong hits keep the maximum at 9 and the reset at +1; clearing it restores 10 / +2 | AssertionError: expected [ { max: 9, reset: 1 }, …(3) ] to deeply equal [ { max: 9, reset: 1 }, …(3) ] |
| (new) tests/unit/momentumBounds.test.js › T01 — the pipeline's momentum writes leave the sheet's bases alone a gain is clamped to the impact-reduced maximum, not the base | AssertionError: expected 9 to be 10 // Object.is equality |
| tests/unit/repair.test.js › applyRepairSpends the trade's last supply marks unprepared (issue #315 S04) the ally sharing the supply is marked with the payer, and both PCs' momentum bounds follow | AssertionError: expected [ [ 9, 1 ], [ 9, 1 ] ] to deeply equal [ [ 10, 2 ], [ 10, 2 ] ] |
| tests/unit/sharedSupply.test.js › the crew shares the zero-supply impact (issue #315 S07) two PCs at supply 1: A sacrifices 1 — supply [0, 0] once synced, both unprepared, both momentum bounds lowered | AssertionError: expected [ [ 9, 1 ], [ 9, 1 ] ] to deeply equal [ [ 10, 2 ], [ 10, 2 ] ] |

- New test passing with and without the fix (a control?): tests/unit/actorBridge.test.js › momentum writes leave the sheet's base max and reset alone (issue #316 T01) readMomentumState reads the effective bounds without touching the sheet
- New test passing with and without the fix (a control?): tests/unit/momentumBounds.test.js › T01 — the pipeline's momentum writes leave the sheet's bases alone control: no impacts — three strong hits leave the bounds at 10 / +2

### eca4344 — fix: a legacy track clears at its tenth box and carries on (issue #316 T02)

Test files: `tests/unit/flowDefectFixes.test.js`, `tests/unit/legacyRollover.test.js`, `tests/unit/legacyTracks.test.js`, `tests/unit/persistResolutionMerge.test.js`. Source restored: 3 file(s).

- With the fix: 43 passed, 0 failed.
- Without it: 11 failed (6 new; 0 only for a missing export), 1 file(s) failed to load; 19 still pass (0 new).
- Verdict: **sensitive** — 11 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) awards 2 XP per newly filled box to every PC and posts the earned-XP note | AssertionError: expected undefined to be 2 // Object.is equality |
| tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) awards a box's XP past 30, and never lowers XP already above it | AssertionError: expected 1 to match object { boxes: 1, xp: 2 } |
| tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) awards nothing when no box fills | AssertionError: expected undefined to be +0 // Object.is equality |
| tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) pays 1 XP per box once the track has been cleared (rule 1.12) | AssertionError: expected 1 to deeply equal { boxes: 1, xp: 1, cleared: false } |
| (new) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) the tenth box clears the track: the overflow carries on from the first box at 1 XP a box | AssertionError: expected 1 to deeply equal { boxes: 3, xp: 4, cleared: true } |
| (new) tests/unit/legacyRollover.test.js › T02 — a legacy track clears at its tenth box and carries on from 38: three discoveries clear the track, keep marking it, and pay 2 then 1 XP | AssertionError: expected [ { ticks: 40, …(2) }, …(2) ] to deeply equal [ …(3) ] |
| (new) tests/unit/legacyRollover.test.js › T02 — a legacy track clears at its tenth box and carries on a track the old cap froze at 40 clears on the next discovery and marks the overflow | AssertionError: expected { ticks: 40, cleared: false } to deeply equal { ticks: 2, cleared: true, cycles: 1 } |
| (new) tests/unit/legacyRollover.test.js › T02 — a legacy track clears at its tenth box and carries on control: short of the tenth box, a discovery marks its ticks and clears nothing | AssertionError: expected { ticks: 36, cleared: false } to deeply equal { ticks: 36, cleared: false, …(1) } |
| tests/unit/persistResolutionMerge.test.js › persistResolution — concurrent writes survive the stale working copy legacy ticks from a concurrent `!bond` are not reverted | AssertionError: expected { bonds: { ticks: 3, …(1) }, …(1) } to deeply equal { bonds: { ticks: 3, …(2) }, …(1) } |
| (new) tests/unit/persistResolutionMerge.test.js › persistResolution — concurrent writes survive the stale working copy a legacy track the pipeline cleared is not reverted by the store's higher pre-clear count | AssertionError: expected { ticks: 38, cleared: true, cycles: 1 } to deeply equal { ticks: 2, cleared: true, cycles: 1 } |
| (new) tests/unit/persistResolutionMerge.test.js › persistResolution — concurrent writes survive the stale working copy a store record further along than the pipeline's keeps its marks — a clear included | AssertionError: expected { ticks: 39, cleared: true, cycles: 1 } to deeply equal { ticks: 1, cleared: true, cycles: 1 } |

- Failed to load: `tests/unit/legacyTracks.test.js` — Cannot find module '../../src/moves/legacyTracks.js' imported from '/tmp/claude-0/-home-user-starforged-companion/0fbd7979-57ee-525d-8cab-6002bc35f026/scratchpad/fs-tmp/fix-sensitivity-eca4344-G2PzSG/

### bb52b2b — fix: a finished scene challenge's danger clock stops advancing (issue #316 T03)

Test files: `tests/unit/clocks.test.js`, `tests/unit/sceneChallengeClock.test.js`. Source restored: 2 file(s).

- With the fix: 29 passed, 0 failed.
- Without it: 9 failed (9 new; 4 only for a missing export); 20 still pass (2 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/clocks.test.js › retireClock / removeClock retireClock marks the clock inactive and keeps it; automatic advances then skip it | TypeError: retireClock is not a function |
| (new) (API) tests/unit/clocks.test.js › retireClock / removeClock retireClock is idempotent — a clock already retired is left as it is, with no write | TypeError: retireClock is not a function |
| (new) (API) tests/unit/clocks.test.js › retireClock / removeClock retireClock writes on a copy: a refused write leaves the cached state as it was | TypeError: retireClock is not a function |
| (new) (API) tests/unit/clocks.test.js › retireClock / removeClock removeClock takes the clock off the list and returns it; an unknown id is null | TypeError: removeClock is not a function |
| (new) tests/unit/clocks.test.js › retireClock / removeClock `!clock remove` and `!clock list` go through the same list: a retired clock is listed as retired | AssertionError: expected '&lt;div class="sf-clock-card">&lt;strong>Cl…' to match /Flooding chamber —…/4 &lt;em>\(retired\)&lt;\ |
| (new) tests/unit/sceneChallengeClock.test.js › T03 — a completed scene challenge's danger clock stops advancing the panel's ✓ retires the paired clock: Pay the Price leaves it at 0/4 and names it on no card; another tension clock still advances | AssertionError: expected { _id: 'wqx3eUQhw6Rqnai4', …(10) } to match object { active: false, filled: +0 } |
| (new) tests/unit/sceneChallengeClock.test.js › T03 — a completed scene challenge's danger clock stops advancing completeProgressTrack (a programmatic completion) retires the clock the same way | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/sceneChallengeClock.test.js › T03 — a completed scene challenge's danger clock stops advancing the panel's ✕ removes the paired clock with the challenge, once the GM confirms | AssertionError: expected '&lt;p>Permanently remove &lt;strong>Escape …' to match /Its danger clock goes with it/ |
| (new) tests/unit/sceneChallengeClock.test.js › T03 — a completed scene challenge's danger clock stops advancing a refused clock write leaves the challenge open and warns; the next press completes and retires it | AssertionError: expected false to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/sceneChallengeClock.test.js › T03 — a completed scene challenge's danger clock stops advancing control: a cancelled removal changes nothing
- New test passing with and without the fix (a control?): tests/unit/sceneChallengeClock.test.js › T03 — a completed scene challenge's danger clock stops advancing control: a combat track's completion touches no clock

### 775fd77 — fix: a refused session-start clock advance is saved by the GMs' Retry (issue #316 T04)

Test files: `tests/unit/clocksSessionStart.test.js`, `tests/unit/sessionStartClocks.test.js`. Source restored: 3 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 9 failed (9 new; 3 only for a missing export); 10 still pass (1 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/clocksSessionStart.test.js › a refused session-start write keeps the rolls (issue #316 T04) every result names its clock and says it was saved | AssertionError: expected { name: 'Hostile expansion', …(7) } to match object { _id: 'c1', advanced: true, …(2) } |
| (new) tests/unit/clocksSessionStart.test.js › a refused session-start write keeps the rolls (issue #316 T04) the write refused: the advanced entry carries saved:false and the error, the stored clock and the cache are unchanged | Error: refused by the test |
| (new) (API) tests/unit/clocksSessionStart.test.js › a refused session-start write keeps the rolls (issue #316 T04) applyClockAdvances saves the recorded fills, once: a second call changes nothing and writes nothing | TypeError: applyClockAdvances is not a function |
| (new) (API) tests/unit/clocksSessionStart.test.js › a refused session-start write keeps the rolls (issue #316 T04) a clock a GM advanced past the recorded fill is left; the fill is clamped to the segments; a missing clock is named | TypeError: applyClockAdvances is not a function |
| (new) (API) tests/unit/clocksSessionStart.test.js › a refused session-start write keeps the rolls (issue #316 T04) a refused Retry write reports refused and leaves the cache as it was | TypeError: applyClockAdvances is not a function |
| (new) tests/unit/sessionStartClocks.test.js › T04 — a refused session-start clock advance is saved by the GMs' Retry, not lost the write refused: the session is begun, the clock card says the advance was not saved, and the GMs get a Retry naming the rolled fill | TypeError: .toMatch() expects to receive a string, but got undefined |
| (new) tests/unit/sessionStartClocks.test.js › T04 — a refused session-start clock advance is saved by the GMs' Retry, not lost a second Begin repeats nothing, and its note names the clock still owed; the Retry saves the rolled fill once, without rolling again | AssertionError: expected '&lt;div class="sf-session-card">&lt;strong>…' to match /already begun.*advance of Hostile exp…/ |
| (new) tests/unit/sessionStartClocks.test.js › T04 — a refused session-start clock advance is saved by the GMs' Retry, not lost a Retry after a GM advanced the clock by hand meanwhile does not advance it twice | TypeError: Cannot read properties of undefined (reading '_id') |
| (new) tests/unit/sessionStartClocks.test.js › T04 — a refused session-start clock advance is saved by the GMs' Retry, not lost only a GM may Retry: a player's press saves nothing | TypeError: Cannot read properties of undefined (reading '_id') |

- New test passing with and without the fix (a control?): tests/unit/sessionStartClocks.test.js › T04 — a refused session-start clock advance is saved by the GMs' Retry, not lost control: Begin advances the clock once; a second Begin repeats nothing and owes nothing

### 96043f2 — fix: a move with no action roll rolls nothing and offers no burn (issue #316 T05)

Test files: `tests/unit/burnMomentum.test.js`, `tests/unit/improveResult.test.js`, `tests/unit/noRollMoves.test.js`, `tests/unit/resolver.test.js`, `tests/unit/schemas.test.js`. Source restored: 7 file(s).

- With the fix: 353 passed, 0 failed.
- Without it: 12 failed (12 new; 3 only for a missing export); 341 still pass (2 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/improveResult.test.js › buildImproveState — a no-roll move returns null for a rollKind "none" resolution even with an applicable ability | AssertionError: expected { canImprove: true, …(18) } to be null |
| (new) tests/unit/noRollMoves.test.js › T05 — Make a Discovery from a waypoint match rolls nothing and offers no burn the follow-up card has no dice, no outcome and no Burn Momentum; momentum stays 9; the legacy is marked | AssertionError: expected { …(27) } to match object { moveId: 'explore_a_waypoint', …(3) } |
| (new) tests/unit/noRollMoves.test.js › T05 — Make a Discovery from a waypoint match rolls nothing and offers no burn a typed Make a Discovery rolls nothing even when the interpreter names a stat | AssertionError: expected { …(27) } to match object { rollKind: 'none', …(3) } |
| (new) tests/unit/noRollMoves.test.js › T05 — Make a Discovery from a waypoint match rolls nothing and offers no burn control: an action move still rolls its dice and offers a burn on a miss | AssertionError: expected { …(27) } to match object { rollKind: 'action', …(3) } |
| (new) tests/unit/resolver.test.js › resolveMove — no-roll moves Make a Discovery draws no dice: no outcome, no match, its consequences as written | AssertionError: expected "random" to not be called at all, but actually been called 3 times |
| (new) tests/unit/resolver.test.js › resolveMove — no-roll moves the move's data decides: a stat the interpreter named on a no-roll move is not rolled, and a negative momentum cancels nothing | AssertionError: expected "random" to not be called at all, but actually been called 3 times |
| (new) tests/unit/resolver.test.js › resolveMove — no-roll moves every no-roll move in the table resolves without dice | AssertionError: confront_chaos: expected undefined to be 'none' // Object.is equality |
| (new) tests/unit/resolver.test.js › resolveMove — no-roll moves a bonded Develop Your Relationship — rollKind "action" from its enrichment — rolls +rank | AssertionError: expected undefined to be 'action' // Object.is equality |
| (new) tests/unit/resolver.test.js › resolveMove — no-roll moves control: a progress move and an action move keep their kinds | AssertionError: expected undefined to be 'action' // Object.is equality |
| (new) (API) tests/unit/schemas.test.js › moveRollKind classifies every move as action, progress or none | TypeError: moveRollKind is not a function |
| (new) (API) tests/unit/schemas.test.js › moveRollKind a stat list is an action roll; progressMove a progress roll; neither, no roll | TypeError: moveRollKind is not a function |
| (new) (API) tests/unit/schemas.test.js › moveRollKind an unknown id rolls nothing | TypeError: moveRollKind is not a function |

- New test passing with and without the fix (a control?): tests/unit/burnMomentum.test.js › buildBurnState — a move that rolled nothing cannot be burned returns null for a rollKind "none" resolution, whatever its momentum
- New test passing with and without the fix (a control?): tests/unit/burnMomentum.test.js › buildBurnState — a move that rolled nothing cannot be burned control: an action-roll miss with the same momentum is eligible

### 300fb37 — fix: a matched waypoint has one reward, claimed once on its card (issue #316 T06)

Test files: `tests/unit/cardActions.test.js`, `tests/unit/cardButtonWiring.test.js`, `tests/unit/waypointRewardClaim.test.js`. Source restored: 4 file(s).

- With the fix: 78 passed, 0 failed.
- Without it: 17 failed (17 new; 9 only for a missing export); 61 still pass (0 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick the owner takes it: the forced move is posted once, as the roller, the card claimed, the ordinary choice retired | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick a second press — by anyone — posts nothing more | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick two near-simultaneous presses post exactly one move | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick refuses a requester who does not own the roller; a GM may take it for them | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick a card from before the roller was stamped is a GM's to take, posted without a speaker override | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick the ordinary reward already chosen: refused, and the alternative is closed on the card | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick a pick in progress on a multi-select choice counts as chosen too | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick a refused claim posts nothing; a failed post releases the claim so the press can be made again | TypeError: applyWaypointOraclePick is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyWaypointOraclePick warns when the card is gone, is not a waypoint card, or names no player character | TypeError: applyWaypointOraclePick is not a function |
| (new) tests/unit/cardButtonWiring.test.js › wireWaypointOracleButton — relays waypoint.oracle a player click relays the card id to the canonical GM — no local chat post, the button disabled | AssertionError: expected [ { …(11) } ] to have a length of +0 but got 1 |
| (new) tests/unit/cardButtonWiring.test.js › wireWaypointOracleButton — relays waypoint.oracle on the canonical GM the click claims the card and posts the forced move once, speaking as the roller | AssertionError: expected undefined to match object { actor: 'pc-b' } |
| (new) tests/unit/cardButtonWiring.test.js › wireWaypointOracleButton — relays waypoint.oracle a claimed card renders its button disabled — by either reward | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/cardButtonWiring.test.js › wireWaypointOracleButton — relays waypoint.oracle re-arms the button when no GM is connected | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/waypointRewardClaim.test.js › T06 — a matched waypoint has one reward the ordinary +2 momentum taken, the discovery is refused and its button closed — on a re-render too | AssertionError: expected { moveResolution: true, …(2) } to match object { …(2) } |
| (new) tests/unit/waypointRewardClaim.test.js › T06 — a matched waypoint has one reward the discovery taken first: 2 ticks once, the ordinary choice retired and its pick refused, a re-render finds the claim | AssertionError: expected undefined to be 'alternative' // Object.is equality |
| (new) tests/unit/waypointRewardClaim.test.js › T06 — a matched waypoint has one reward another player's click is refused; a GM's takes it as the roller | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) tests/unit/waypointRewardClaim.test.js › T06 — a matched waypoint has one reward a miss with a match: Confront Chaos is taken once | AssertionError: expected 2 to be 1 // Object.is equality |

### 6d8b29a — fix: a sidecar fenced without the json tag is parsed, never shown (issue #321 U41)

Test files: `tests/unit/factContinuity.test.js`. Source restored: 1 file(s).

- With the fix: 55 passed, 0 failed.
- Without it: 8 failed (8 new; 0 only for a missing export); 47 still pass (1 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag a bare ``` fence: parses the sidecar and keeps the JSON out of the prose | TypeError: Cannot read properties of null (reading 'newTruths') |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag a "``` json" fence: parses the sidecar and keeps the JSON out of the prose | TypeError: Cannot read properties of null (reading 'newTruths') |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag a single-line bare fence: parses the sidecar and keeps the JSON out of the prose | TypeError: Cannot read properties of null (reading 'newTruths') |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag strips a bare fence whose object body is malformed and reports the parse error | AssertionError: expected 'Vance limps in.\n\n```\n{ "newTruths"…' to be 'Vance limps in.' // Object.is equality |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag parses an unclosed fence whose object is complete (the closing fence never came) | AssertionError: ```json: expected Error: Sidecar opening fence found but no… to be null |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag parses an unclosed fence whose closing fence was cut off after one or two backticks | AssertionError: expected Error: Sidecar opening fence found but no… to be null |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag strips a truncated unclosed bare fence and surfaces the truncation | AssertionError: expected 'Vance limps in.\n\n```\n{ "newTruths"…' to be 'Vance limps in.' // Object.is equality |
| (new) tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag strips a truncated fence that follows a complete one, so no JSON reaches the prose | AssertionError: expected 'Prose chunk one.\n\nProse chunk two.\…' not to match /```\|newTruths/ |

- New test passing with and without the fix (a control?): tests/unit/factContinuity.test.js › extractSidecar — a sidecar fenced without the json tag leaves a bare fence that holds no JSON object in the prose (control)

### c4cba83 — fix: a strike retracts only its own subject's lore, and two subjects' strikes stay apart (issue #321 U39)

Test files: `tests/unit/retractions.test.js`. Source restored: 1 file(s).

- With the fix: 14 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 9 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/retractions.test.js › factsOverlap matches containment only as whole words | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/retractions.test.js › propagateRetraction leaves other subjects' lore that merely shares the struck phrase in canon | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) tests/unit/retractions.test.js › propagateRetraction takes the struck subject's own lore out of canon — archived or detected | AssertionError: expected 3 to be 2 // Object.is equality |
| (new) tests/unit/retractions.test.js › propagateRetraction matches an entity subject's lore by the record's name | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/retractions.test.js › session retractions keep two subjects' strikes of the same phrase apart — in the scene and past it | AssertionError: expected [ { label: 'Vance', fact: 'Is dead' } ] to deeply equal [ { label: 'Vance', …(1) }, …(1) ] |

- New test passing with and without the fix (a control?): tests/unit/retractions.test.js › session retractions still list one subject's same strike once when two scenes made it

### e7d7629 — fix: restoring struck lore puts it back in canon with its text (issue #321 U40)

Test files: `tests/unit/loreRestore.test.js`, `tests/unit/worldJournal.test.js`. Source restored: 1 file(s).

- With the fix: 73 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 67 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/loreRestore.test.js › restoring struck lore with `!journal lore "&lt;title>" confirmed` puts the entry back in confirmed canon, with its text | AssertionError: expected [] to include 'Kael\'s debt' |
| (new) tests/unit/loreRestore.test.js › restoring struck lore with `!journal lore "&lt;title>" confirmed` keeps the entry's category and provenance, even in a later session | AssertionError: expected { title: 'Kael\'s debt', …(15) } to match object { category: 'debt', …(6) } |
| (new) tests/unit/loreRestore.test.js › restoring struck lore with `!journal lore "&lt;title>" confirmed` takes the command's text when it gives one | AssertionError: expected undefined to be 'Kael owes the Syndicate 500 credits' // Object.is equality |
| (new) tests/unit/loreRestore.test.js › restoring struck lore with `!journal lore "&lt;title>" confirmed` a rumour ruling clears the strike but keeps the entry out of canon and out of the review queue | AssertionError: expected { title: 'Kael\'s debt', …(15) } to match object { confirmed: false, …(3) } |
| (new) tests/unit/worldJournal.test.js › recordLoreDiscovery keeps an entry's text and category when an update gives none | AssertionError: expected { title: 'Same Title', …(15) } to match object { text: 'first', …(2) } |
| (new) tests/unit/worldJournal.test.js › recordLoreDiscovery keeps a struck entry struck when the detection pass records it again | AssertionError: expected { title: 'The hatch', …(15) } to match object { retracted: true, retractedAt: 't1' } |

### 5c78275 — fix: picking a connection in the clarification dialog hands the narrator that NPC (issue #321 U37)

Test files: `tests/unit/clarificationDialog.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/clarificationDialog.test.js › ClarificationDialog — picking a recorded connection offers the connection under its host (Actor) id, and the pick puts that id in relevance.entityIds | AssertionError: expected { journalId: null, …(3) } to match object { Object (journalId, type, ...) } |
| (new) tests/unit/clarificationDialog.test.js › ClarificationDialog — picking a recorded connection offers every connection under its own host id, in campaign order | AssertionError: expected [ [ 'Sable', null ], …(1) ] to deeply equal [ …(2) ] |
| (new) tests/unit/clarificationDialog.test.js › ClarificationDialog — picking a recorded connection offers no lost or unresolvable connection | AssertionError: expected [ null ] to deeply equal [ 'actor-conn-q738s6' ] |

### b0cdc45 — fix: the pacing classifier knows the campaign's connections by name (issue #321 U44)

Test files: `tests/unit/pacing.test.js`. Source restored: 1 file(s).

- With the fix: 66 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 64 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/pacing.test.js › buildClassifierContext — connection names names each Actor-hosted connection with its relationship | AssertionError: expected 'Connections: 2 active (names unavaila…' to be 'Connections: Kael Dros (ally), Sable …' // Object.is equality |
| (new) tests/unit/pacing.test.js › buildClassifierContext — connection names says the names are unavailable only when no id resolves | AssertionError: expected 'Connections: 2 active (names unavaila…' to be 'Connections: Kael Dros (ally)' // Object.is equality |

### 2bbfd48 — fix: a move the pacing classifier names is always a real move id (issue #321 U45)

Test files: `tests/unit/narratorMoveHint.test.js`, `tests/unit/pacing.test.js`, `tests/unit/schemas.test.js`. Source restored: 3 file(s).

- With the fix: 136 passed, 0 failed.
- Without it: 12 failed (12 new; 2 only for a missing export); 124 still pass (1 new).
- Verdict: **sensitive** — 10 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narratorMoveHint.test.js › suppressPcDirectedSocialMove() suppresses a social move aimed at a fellow PC whatever its case or form | AssertionError: expected 'Compel' to be null |
| (new) tests/unit/narratorMoveHint.test.js › suppressPcDirectedSocialMove() hands back the nominated move's id, and nothing for a phrase that names no move | AssertionError: expected 'Compel' to be 'compel' // Object.is equality |
| (new) tests/unit/pacing.test.js › classifyInput() maps the suggestion "Gather Information" to the move id "gather_information" | AssertionError: expected 'Gather Information' to be 'gather_information' // Object.is equality |
| (new) tests/unit/pacing.test.js › classifyInput() maps the suggestion "gather information" to the move id "gather_information" | AssertionError: expected 'gather information' to be 'gather_information' // Object.is equality |
| (new) tests/unit/pacing.test.js › classifyInput() maps the suggestion "Face-Danger" to the move id "face_danger" | AssertionError: expected 'Face-Danger' to be 'face_danger' // Object.is equality |
| (new) tests/unit/pacing.test.js › classifyInput() maps the suggestion "  Compel  " to the move id "compel" | AssertionError: expected 'Compel' to be 'compel' // Object.is equality |
| (new) tests/unit/pacing.test.js › classifyInput() maps the suggestion "Swear an Iron Vow" to the move id "swear_an_iron_vow" | AssertionError: expected 'Swear an Iron Vow' to be 'swear_an_iron_vow' // Object.is equality |
| (new) tests/unit/pacing.test.js › classifyInput() drops a suggestion that is a phrase that names no move | AssertionError: expected 'Dance Wildly' to be null |
| (new) tests/unit/pacing.test.js › classifyInput() drops a suggestion that is an inherited property name | AssertionError: expected 'constructor' to be null |
| (new) tests/unit/pacing.test.js › classifyInput() asks the model for a catalog move id, not a move name | AssertionError: expected 'You are the pacing pre-classifier for…' to contain '"suggestedMove": "&lt;move id from the M…' |
| (new) (API) tests/unit/schemas.test.js › toMoveId maps every move's key, and its display name in any case or separator, to the key | TypeError: toMoveId is not a function |
| (new) (API) tests/unit/schemas.test.js › toMoveId returns null for anything that names no move | TypeError: toMoveId is not a function |

- New test passing with and without the fix (a control?): tests/unit/pacing.test.js › classifyInput() drops a suggestion that is a non-string

### b817cca — fix: an @scene answer is mined for world detail on the canonical GM only (issue #321 U36)

Test files: `tests/unit/sceneQueryCaptureGate.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sceneQueryCaptureGate.test.js › @scene capture runs on the canonical GM only a keyed player's client (no keyed GM online) runs neither the detection pass nor the tier pass | AssertionError: expected { detection: 1, tierPass: 1 } to deeply equal { detection: +0, tierPass: +0 } |
| (new) tests/unit/sceneQueryCaptureGate.test.js › @scene capture runs on the canonical GM only there the answer's ledger facts still go to the GM through the sidecar relay | AssertionError: expected { detection: 1, tierPass: 1 } to deeply equal { detection: +0, tierPass: +0 } |

- New test passing with and without the fix (a control?): tests/unit/sceneQueryCaptureGate.test.js › @scene capture runs on the canonical GM only the canonical GM mines the answer with both passes (control)

### 0d25bb8 — fix: the ship's narrated position matches place names, not common nouns (issue #321 U43)

Test files: `tests/unit/shipPosition.test.js`. Source restored: 1 file(s).

- With the fix: 42 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 39 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/shipPosition.test.js › inferShipPosition — the word scan resolves names, not common nouns a common noun in an unrecorded destination does not dock the ship at a recorded place | AssertionError: expected 's-bleak' to be null |
| (new) tests/unit/shipPosition.test.js › inferShipPosition — the word scan resolves names, not common nouns a phrase whose only name-like word is lowercase stays free text | AssertionError: expected 's-bleak' to be null |
| (new) tests/unit/shipPosition.test.js › inferShipPosition — the word scan resolves names, not common nouns keeps the narrated phrase when the only match is not a place | AssertionError: expected 'The Covenant' to be 'alongside the Covenant flagship Iron …' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/shipPosition.test.js › inferShipPosition — the word scan resolves names, not common nouns a capitalised name part in a phrase still resolves (control)
- New test passing with and without the fix (a control?): tests/unit/shipPosition.test.js › inferShipPosition — the word scan resolves names, not common nouns a whole seed that is a deliberate short name resolves in any case (control)

### 66319f9 — fix: players can use the Progress Tracks and Entities panels (issue #321 U05)

Test files: `tests/unit/entityPanelRelay.test.js`, `tests/unit/progressTracksPanelRelay.test.js`. Source restored: 3 file(s).

- With the fix: 24 passed, 0 failed.
- Without it: 23 failed (23 new; 7 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 16 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edit is relayed to the GM, not refused (issue #321 U05) the canonical-lock toggle is relayed — no permission error on the player's client | AssertionError: expected Error: User test-user-player lacks permis… to be null |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edit is relayed to the GM, not refused (issue #321 U05) Pin, Promote and Remove are relayed with the detail they act on | Error: User test-user-player lacks permission to update Actor [npc-vex] — needs OWNER permission on "Vex" (ownership {"default":0}) (permission-faithful test st |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edits land on the NPC card (issue #321 U05) the canonical-lock toggle locks, and a second click unlocks | Error: User Pat lacks permission to update Actor [npc-vex] — needs OWNER permission on "Vex" (ownership {"default":0}) (permission-faithful test stub, tests/hel |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edits land on the NPC card (issue #321 U05) Pin pins the detail (and a second click unpins it) | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edits land on the NPC card (issue #321 U05) Promote, once the player confirms on their own screen, appends the detail to the notes | Error: User Pat lacks permission to update Actor [npc-vex] — needs OWNER permission on "Vex" (ownership {"default":0}) (permission-faithful test stub, tests/hel |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edits land on the NPC card (issue #321 U05) Remove removes the detail and keeps the others | AssertionError: expected [ 'Has a scar over one eye', …(2) ] to deeply equal [ 'Owes the Syndicate', …(1) ] |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edits land on the NPC card (issue #321 U05) with no GM connected, Pin warns the player and changes nothing | AssertionError: expected [] to deep equally contain StringMatching /no GM is connected/ |
| (new) (API) tests/unit/entityPanelRelay.test.js › applyEntityEditFromRelay — validation (issue #321 U05) refuses an unknown op, an unknown entity, and a detail the panel does not show | TypeError: applyEntityEditFromRelay is not a function |
| (new) (API) tests/unit/entityPanelRelay.test.js › applyEntityEditFromRelay — validation (issue #321 U05) Remove leaves a promoted entry with the same text alone (the panel never showed it) | TypeError: applyEntityEditFromRelay is not a function |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a refused Pin or Remove is reported, not swallowed (issue #321 U05) pinTier: the GM's refused write shows an error notification | AssertionError: expected "error" to be called with arguments: [ StringMatching /could not be saved/ ] |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a refused Pin or Remove is reported, not swallowed (issue #321 U05) removeTier: the GM's refused write shows an error notification | AssertionError: expected "error" to be called with arguments: [ StringMatching /could not be saved/ ] |
| (new) tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) a player's Mark Progress (+) on a dangerous fight lands: 0 → 8 ticks | AssertionError: expected { ticks: +0, …(1) } to deeply equal { ticks: 8, error: null } |
| (new) tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) a player's position toggle (Neutral → In control) lands | AssertionError: expected null to be 'in_control' // Object.is equality |
| (new) tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) a player's − clears one box, and ✓ completes the fight | AssertionError: expected 12 to be 8 // Object.is equality |
| (new) tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) a player's ✕ asks the player to confirm — on their own screen — then the GM removes the track | AssertionError: expected [ { id: 'fight-1', …(7) } ] to deeply equal [] |
| (new) tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) a player's Add creates the track — and a scene challenge's paired danger clock — on the GM | AssertionError: expected undefined to match object { …(4) } |
| (new) tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) with no GM connected, a player's click warns and changes nothing | AssertionError: expected Error: User Pat lacks permission to updat… to be null |
| (new) (API) tests/unit/progressTracksPanelRelay.test.js › applyProgressTrackEditFromRelay — what the panel can produce, and nothing else (issue #321 U05) marks by rank and never past 40 ticks; clears one box and never below 0 | TypeError: applyProgressTrackEditFromRelay is not a function |
| (new) (API) tests/unit/progressTracksPanelRelay.test.js › applyProgressTrackEditFromRelay — what the panel can produce, and nothing else (issue #321 U05) refuses a track the panel does not list (a vow), a finished one, an unknown id, and a position on a non-fight | TypeError: applyProgressTrackEditFromRelay is not a function |
| (new) (API) tests/unit/progressTracksPanelRelay.test.js › applyProgressTrackEditFromRelay — what the panel can produce, and nothing else (issue #321 U05) ✕ removes a finished panel track too (the panel offers it on archived rows) | TypeError: applyProgressTrackEditFromRelay is not a function |
| (new) (API) tests/unit/progressTracksPanelRelay.test.js › applyProgressTrackEditFromRelay — what the panel can produce, and nothing else (issue #321 U05) an Add takes a panel type and rank only, and a name of at most 60 characters | TypeError: applyProgressTrackEditFromRelay is not a function |
| (new) (API) tests/unit/progressTracksPanelRelay.test.js › applyProgressTrackEditFromRelay — what the panel can produce, and nothing else (issue #321 U05) an unknown op is refused | TypeError: applyProgressTrackEditFromRelay is not a function |
| (new) tests/unit/progressTracksPanelRelay.test.js › the panel renders on a player's client without creating the GM's journal (issue #321 U05) no tracks journal yet: the player sees an empty panel, and nothing is created | AssertionError: expected "create" to not be called at all, but actually been called 1 times |

- New test passing with and without the fix (a control?): tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) the same click by the GM lands (control: the handler itself works)

### 83ff2f1 — fix: progress track writes no longer lose one another (issue #321 U57)

Test files: `tests/unit/progressTracksWriteQueue.test.js`. Source restored: 1 file(s).

- With the fix: 7 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/progressTracksWriteQueue.test.js › track writers on one client run one at a time, each on a fresh read (issue #321 U57) two progress marks in flight together both land | AssertionError: expected 8 to be 16 // Object.is equality |
| (new) tests/unit/progressTracksWriteQueue.test.js › track writers on one client run one at a time, each on a fresh read (issue #321 U57) a panel + racing the move pipeline's position write keeps both | AssertionError: expected { id: 'fight-1', …(6) } to match object { ticks: 8, combatState: 'bad_spot' } |
| (new) tests/unit/progressTracksWriteQueue.test.js › track writers on one client run one at a time, each on a fresh read (issue #321 U57) a new track and a mark on another track, written together, both land | AssertionError: expected [ 'fight-1', 'exp-1' ] to deeply equal [ 'fight-1', 'exp-1', …(1) ] |
| (new) tests/unit/progressTracksWriteQueue.test.js › track writers on one client run one at a time, each on a fresh read (issue #321 U57) a completion racing a mark keeps the mark (the completed track is saved with it) | AssertionError: expected { id: 'fight-1', …(7) } to match object { ticks: 8, completed: true } |

- New test passing with and without the fix (a control?): tests/unit/progressTracksWriteQueue.test.js › the Progress Tracks panel — two quick clicks keep both (issue #321 U57) two Mark Progress clicks 5 ms apart on a dangerous fight mark 16 ticks
- New test passing with and without the fix (a control?): tests/unit/progressTracksWriteQueue.test.js › the Progress Tracks panel — two quick clicks keep both (issue #321 U57) Mark Progress then the position toggle, in quick succession, keep both changes
- New test passing with and without the fix (a control?): tests/unit/progressTracksWriteQueue.test.js › track writers on one client run one at a time, each on a fresh read (issue #321 U57) a refused write does not wedge the next one, which reads what is stored

### 0d95837 — fix: a fight's position badge and panel toggle reach every store (issue #321 U19)

Test files: `tests/unit/combatPositionStores.test.js`, `tests/unit/progressTracksPanelRelay.test.js`. Source restored: 2 file(s).

- With the fix: 22 passed, 0 failed.
- Without it: 7 failed (7 new; 0 only for a missing export); 15 still pass (2 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/combatPositionStores.test.js › the combat tracker's position badge writes the fight's track (issue #321 U19) clicking the position badge writes the fight's track position too (the store every reader reads) | AssertionError: expected "spy" to be called with arguments: [ 'trk-1', 'in_control' ] |
| (new) tests/unit/combatPositionStores.test.js › the combat tracker's position badge writes the fight's track (issue #321 U19) each step of the cycle reaches the track: in control → in a bad spot → neutral | AssertionError: expected last "spy" call to have been called with [ 'trk-1', 'bad_spot' ] |
| (new) tests/unit/combatPositionStores.test.js › the combat tracker's position badge writes the fight's track (issue #321 U19) a refused track write changes neither mirror, and says so | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/combatPositionStores.test.js › applyCombatPositionToTrack — neutral, and the canonical store first (issue #321 U19) null clears the position everywhere (the toggles' neutral step) | AssertionError: expected "spy" to be called with arguments: [ 'trk-1', null ] |
| (new) tests/unit/combatPositionStores.test.js › applyCombatPositionToTrack — neutral, and the canonical store first (issue #321 U19) an unknown or missing position writes nothing | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/combatPositionStores.test.js › applyCombatPositionToTrack — neutral, and the canonical store first (issue #321 U19) a refused track write rejects before the mirrors change | Error: promise resolved "undefined" instead of rejecting |
| (new) tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) the position toggle writes every store of the fight's position (issue #321 U19) the clicker's own character's sheet and badge follow the track | AssertionError: expected { Object (track, sheet, ...) } to deeply equal { track: 'in_control', …(2) } |

- New test passing with and without the fix (a control?): tests/unit/combatPositionStores.test.js › the combat tracker's position badge writes the fight's track (issue #321 U19) control: a player's click changes nothing (the badge is the GM's)
- New test passing with and without the fix (a control?): tests/unit/progressTracksPanelRelay.test.js › Progress Tracks panel — a player's click lands through the canonical GM (issue #321 U05) the position toggle writes every store of the fight's position (issue #321 U19) a character the clicker does not own is left alone: only the track moves

### b85ed27 — fix: portraits are generated on a GM's client only, never paid for and lost (issue #321 U33)

Test files: `tests/unit/portraitGmOnly.test.js`. Source restored: 2 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/portraitGmOnly.test.js › the portrait generator runs on a GM's client only (issue #321 U33) a player's Generate pays for nothing: no image is requested, nothing is written | Error: promise rejected "Error: User test-user-player lacks permis…" instead of resolving |
| (new) tests/unit/portraitGmOnly.test.js › the portrait generator runs on a GM's client only (issue #321 U33) a player's Regenerate pays for nothing either | Error: promise rejected "Error: User test-user-player lacks permis…" instead of resolving |
| (new) tests/unit/portraitGmOnly.test.js › the Entities panel shows Generate / Regenerate portrait to GMs only (issue #321 U33) a player sees neither button | AssertionError: expected [ 'backToList', …(3) ] to not include 'generatePortrait' |
| (new) tests/unit/portraitGmOnly.test.js › the Entities panel shows Generate / Regenerate portrait to GMs only (issue #321 U33) a player's click on a button left from before generates nothing and says the GM generates portraits | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |

- New test passing with and without the fix (a control?): tests/unit/portraitGmOnly.test.js › the portrait generator runs on a GM's client only (issue #321 U33) control: the GM's Generate requests the image once, stores it and links it to the NPC
- New test passing with and without the fix (a control?): tests/unit/portraitGmOnly.test.js › the Entities panel shows Generate / Regenerate portrait to GMs only (issue #321 U33) control: a GM sees Generate on an entity with no portrait, and Regenerate on one with an unlocked portrait

### 175db78 — fix: "Set as current location" moves the ship as `!at` does (issue #321 U56)

Test files: `tests/unit/entityPanelCurrentLocation.test.js`, `tests/unit/shipPosition.test.js`. Source restored: 3 file(s).

- With the fix: 47 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 43 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityPanelCurrentLocation.test.js › Entity Panel — Set as current location moves the ship, as `!at` does (issue #321 U56) moves the command vehicle's position along with currentLocationId, as `!at Bleakhold` does | AssertionError: expected { …(5) } to match object { …(2) } |
| (new) tests/unit/entityPanelCurrentLocation.test.js › Entity Panel — Set as current location moves the ship, as `!at` does (issue #321 U56) clearing the current location (a second click) leaves the ship where it is, like a bare `!at` | AssertionError: expected 'actor-first' to be 'actor-bleak' // Object.is equality |
| (new) tests/unit/entityPanelCurrentLocation.test.js › Entity Panel — Set as current location moves the ship, as `!at` does (issue #321 U56) the place is the one clicked, by its id — not another settlement with the same name | AssertionError: expected 'actor-first' to be 'actor-bleak-2' // Object.is equality |
| (new) tests/unit/shipPosition.test.js › inferShipPosition matches entityId before the name; an unknown id falls back to the name | AssertionError: expected 's1' to be 's2' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/entityPanelCurrentLocation.test.js › Entity Panel — Set as current location moves the ship, as `!at` does (issue #321 U56) control: with ship positioning off, only the current location changes

### f2dcda2 — fix: a refused setting write leaves this client's cache as it was (issue #321 U58)

Test files: `tests/unit/cachedSettingWrites.test.js`. Source restored: 5 file(s).

- With the fix: 14 passed, 0 failed.
- Without it: 14 failed (14 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 14 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/cachedSettingWrites.test.js › Take a Break on the canonical GM, write refused (issue #321 U58) a refused Take a Break write leaves no +1 behind on the GM's client | AssertionError: expected { value: 1, …(2) } to be undefined |
| (new) tests/unit/cachedSettingWrites.test.js › Take a Break on the canonical GM, write refused (issue #321 U58) an unrelated later write from the GM does not resurrect the refused +1 into the world | AssertionError: expected { value: 1, …(2) } to be undefined |
| (new) tests/unit/cachedSettingWrites.test.js › Take a Break on the canonical GM, write refused (issue #321 U58) a refused `!at &lt;place>` or `!sector &lt;name>` leaves the GM's cached state as it was | AssertionError: expected 'actor-bleak' to be null |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) safety/sessionDialogs.js Set a Flag (applySafetyFlag) | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) safety/sessionDialogs.js Take a Break (applyTakeBreak) | AssertionError: expected { sessionActive: true, …(8) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) ui/settingsPanel.js a player's Private Lines sync on the GM (applyPrivateLinesSync) | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) ui/settingsPanel.js the GM's Lines / Veils sync into campaignState (syncSafetyToCampaignState) | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) ui/settingsPanel.js adding or removing a Line or a Veil | AssertionError: addLine: expected [ 'gore', 'spiders' ] to deeply equal [ 'gore' ] |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) ui/settingsPanel.js adding or removing a Private Line | AssertionError: addPrivateLine: expected [ 'needles', 'spiders' ] to deeply equal [ 'needles' ] |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) clocks/clocks.js creating a clock (createClock and `!clock new`) | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) clocks/clocks.js changing a clock (`!clock reset`, through mutateClock) | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) clocks/clocks.js Pay the Price's tension-clock advance, and its revert on a burn | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) ui/entityPanel.js Set as current location | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |
| (new) tests/unit/cachedSettingWrites.test.js › a refused write leaves this client's cached setting as it was (issue #321 U58) ui/entityPanel.js Undismiss | AssertionError: expected { sessionActive: true, …(7) } to deeply equal { sessionActive: true, …(7) } |

### 798bec5 — fix: !sever severs only the connection it names (issue #321 U14)

Test files: `tests/unit/developRelationship.test.js`, `tests/unit/severCommand.test.js`. Source restored: 2 file(s).

- With the fix: 48 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 43 still pass (3 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/developRelationship.test.js › selectConnection strict (!sever) a named target that matches no name resolves nothing — not the sole bonded one | AssertionError: expected { _id: 'a', name: 'Mira Kade', …(3) } to be null |
| (new) tests/unit/developRelationship.test.js › selectConnection strict (!sever) an unnamed target resolves nothing while several are active, even with one bonded | AssertionError: expected { _id: 'a', name: 'Mira Kade', …(3) } to be null |
| (new) tests/unit/developRelationship.test.js › selectConnection strict (!sever) an unnamed target resolves the sole active connection | AssertionError: expected { _id: 'a', name: 'Mira', …(3) } to be null |
| (new) tests/unit/severCommand.test.js › !sever resolves its target strictly a name that matches no connection severs nobody — not the sole bonded one | AssertionError: expected { mira: false, dex: true, …(1) } to deeply equal { mira: true, dex: true, cards: [] } |
| (new) tests/unit/severCommand.test.js › !sever resolves its target strictly a bare !sever with several connections active severs nobody | AssertionError: expected { mira: false, dex: true, …(1) } to deeply equal { mira: true, dex: true, cards: [] } |

- New test passing with and without the fix (a control?): tests/unit/developRelationship.test.js › selectConnection strict (!sever) control: keeps the exact and substring rungs
- New test passing with and without the fix (a control?): tests/unit/severCommand.test.js › !sever resolves its target strictly control: an exact or partial name severs that connection only
- New test passing with and without the fix (a control?): tests/unit/severCommand.test.js › a bare !sever with one active connection control: severs it

### 4c23f20 — fix: a cut-off entity detection reply is logged and the GM is told (issue #321 U15)

Test files: `tests/unit/detectionTruncation.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/detectionTruncation.test.js › combined detection: a reply cut off at max_tokens asks for room for a busy narration's whole reply | AssertionError: expected 600 to be greater than or equal to 1500 |
| (new) tests/unit/detectionTruncation.test.js › combined detection: a reply cut off at max_tokens is not dropped silently: the console names the cut and the GM is told | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/detectionTruncation.test.js › combined detection: a reply with no JSON object tells the GM — a malformed reply drops the narration's detection too | AssertionError: expected "warn" to be called 1 times, but got 0 times |

- New test passing with and without the fix (a control?): tests/unit/detectionTruncation.test.js › combined detection: a reply cut off at max_tokens control: a complete reply is parsed and tells nobody anything
- New test passing with and without the fix (a control?): tests/unit/detectionTruncation.test.js › combined detection: a reply with no JSON object control: an empty reply (no key on this client) is not a failure

### 8f5b3c3 — fix: rows of one draft card resolved together all keep their status (issue #321 U25)

Test files: `tests/unit/draftCardConcurrentConfirm.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/draftCardConcurrentConfirm.test.js › two rows of one draft card confirmed concurrently both stay confirmed — the slower write does not revert the other row | AssertionError: expected [ Array(2) ] to deeply equal [ Array(2) ] |
| (new) tests/unit/draftCardConcurrentConfirm.test.js › two rows of one draft card confirmed concurrently no Confirm is offered again, so the NPC is not created a second time | AssertionError: expected [ StubElement{ …(9) } ] to have a length of +0 but got 1 |
| (new) tests/unit/draftCardConcurrentConfirm.test.js › two rows of one draft card confirmed concurrently a Confirm and a Dismiss on two rows both land | AssertionError: expected [ Array(2) ] to deeply equal [ Array(2) ] |
| (new) tests/unit/draftCardConcurrentConfirm.test.js › Confirm on an entity that already exists marks the row and creates nothing — a lost card write cannot mint a duplicate NPC | AssertionError: expected [ …(2) ] to have a length of 1 but got 2 |

### 136d212 — fix: a confirmed NPC ship never displaces the players' ship (issue #321 U26)

Test files: `tests/unit/loneShipNpcDraft.test.js`. Source restored: 6 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/loneShipNpcDraft.test.js › a ship confirmed from a draft card leaves the players' ship as the command vehicle everywhere | AssertionError: expected { actorId: null, record: null, …(5) } to match object { actorId: 'ship-wayward', …(5) } |
| (new) tests/unit/loneShipNpcDraft.test.js › a ship confirmed from a draft card is marked as someone else's ship | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/loneShipNpcDraft.test.js › a ship confirmed from a draft card does not become the players' ship when theirs is not tracked | AssertionError: expected { actorId: 'sact000000000007', …(6) } to match object { actorId: null, record: null, …(3) } |

- New test passing with and without the fix (a control?): tests/unit/loneShipNpcDraft.test.js › a ship confirmed from a draft card control: the players' lone ship resolves before any ship is detected

### 88960d0 — fix: a newly named NPC is drafted when its rename has no card to land on (issue #321 U27)

Test files: `tests/unit/entityExtractor.test.js`. Source restored: 1 file(s).

- With the fix: 127 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 125 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityExtractor.test.js › parseDetectionResponse — renames keeps a rename target as a new entity when its `from` is no recorded placeholder | AssertionError: expected [] to deeply equal [ 'Vex', 'Rell' ] |
| (new) tests/unit/entityExtractor.test.js › detection → renames → drafts: a rename from a figure with no card offers the newly named NPC on the draft card | AssertionError: expected [] to deeply equal [ 'Vex' ] |

- New test passing with and without the fix (a control?): tests/unit/entityExtractor.test.js › parseDetectionResponse — renames drops an entity that is also listed as a rename target of a recorded placeholder (no dup-and-rename)

### 187af8c — fix: confirming a faction keeps its World Journal attitude (issue #321 U28)

Test files: `tests/unit/factionConfirmAttitude.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/factionConfirmAttitude.test.js › confirming a faction draft keeps the World Journal attitude the narration established | AssertionError: expected { hostId: 'jrnl000000000003', …(6) } to match object { recordStance: 'antagonistic', …(3) } |
| (new) tests/unit/factionConfirmAttitude.test.js › confirming a faction draft backlinks the World Journal entry to the faction host, not the record id | AssertionError: expected 'tfT0DdSDx8CSqs0p' to be 'jrnl000000000007' // Object.is equality |
| (new) tests/unit/factionConfirmAttitude.test.js › confirming a faction draft a faction with no World Journal entry yet is mirrored there with an unknown attitude | AssertionError: expected 'DYljLaEKEIlqfi9c' to be 'jrnl000000000011' // Object.is equality |

### cbb890a — fix: a new NPC card gets one portrait with Auto-Seed on (issue #321 U29)

Test files: `tests/unit/autoSeedPortraitOwner.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/autoSeedPortraitOwner.test.js › with Auto-Seed NPC on, the seed owns the new card's portrait confirming one NPC draft generates one portrait | AssertionError: expected [ { …(4) }, { …(4) } ] to have a length of 1 but got 2 |
| (new) tests/unit/autoSeedPortraitOwner.test.js › with Auto-Seed NPC on, the seed owns the new card's portrait a Make a Connection auto-create generates one portrait | AssertionError: expected [ { …(4) }, { …(4) } ] to have a length of 1 but got 2 |

- New test passing with and without the fix (a control?): tests/unit/autoSeedPortraitOwner.test.js › with Auto-Seed NPC on, the seed owns the new card's portrait control: the seed draws its portrait from the description the narration gave
- New test passing with and without the fix (a control?): tests/unit/autoSeedPortraitOwner.test.js › with Auto-Seed NPC off, the creator owns it control: confirming one NPC draft generates one portrait

### fb79e0a — fix: a titled NPC or PC re-detected by its bare name is not offered as new (issue #321 U30)

Test files: `tests/unit/dedupNameTitles.test.js`, `tests/unit/entityExtractor.test.js`. Source restored: 1 file(s).

- With the fix: 132 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 129 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/dedupNameTitles.test.js › the draft dedup gate strips the module's own NPC titles a PC or NPC re-detected without its title is not offered as a new connection | AssertionError: expected [ 'Dr. Chen', 'Lyssa Chen' ] to deeply equal [] |
| (new) tests/unit/dedupNameTitles.test.js › the draft dedup gate strips the module's own NPC titles a titled detection of a bare-named connection is not offered either | AssertionError: expected [ 'Overseer Kell' ] to deeply equal [] |
| (new) tests/unit/entityExtractor.test.js › normalizeEntityName strips a leading NPC title the module records as a role | AssertionError: expected 'doctor chen' to be 'chen' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/dedupNameTitles.test.js › the draft dedup gate strips the module's own NPC titles control: a genuinely new NPC is still offered
- New test passing with and without the fix (a control?): tests/unit/entityExtractor.test.js › normalizeEntityName control: strips only a whole leading title word

### 32246f3 — fix: non-command starships get a token image the system ships (issue #321 U31)

Test files: `tests/unit/ironswornAssets.test.js`. Source restored: 1 file(s).

- With the fix: 16 passed, 0 failed.
- Without it: 2 failed (0 new; 0 only for a missing export); 14 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/ironswornAssets.test.js › Phase 3 — pickStarshipIcon returns a path under IS_PATHS.STARSHIPS | AssertionError: expected 'systems/foundry-ironsworn/assets/star…' to match /\/Ship-\d{2}s\.webp$/Ship-\d{2}s\.webp$ |
| tests/unit/ironswornAssets.test.js › Phase 3 — pickStarshipIcon produces a token in the 01..15 range | TypeError: Cannot read properties of null (reading '1') |

### 100b3fd — fix: the !sfc encounter card shows the foe's rank and features (issue #321 U32)

Test files: `tests/unit/encounterSpawn.test.js`. Source restored: 1 file(s).

- With the fix: 17 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 15 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/encounterSpawn.test.js › Phase 7 — buildEncounterCard shows the rank of the progress item by name | AssertionError: expected '&lt;h3>Adept&lt;/h3>' to contain '&lt;strong>Rank:&lt;/strong> Formidable' |
| (new) tests/unit/encounterSpawn.test.js › Phase 7 — buildEncounterCard renders the progress item's Features / Drives / Tactics text | AssertionError: expected '&lt;h3>Hunter&lt;/h3>' to contain '&lt;strong>Rank:&lt;/strong> Dangerous' |

- New test passing with and without the fix (a control?): tests/unit/encounterSpawn.test.js › Phase 7 — buildEncounterCard control: a foe without a progress item is just its name

### 0686a64 — fix: a sheet edit of a PC no player owns reaches the next roll and narration (issue #321 U01)

Test files: `tests/unit/soloSheetEditSnapshot.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/soloSheetEditSnapshot.test.js › a sheet edit of the solo GM's PC (hasPlayerOwner false) drops the cached snapshot a raised stat reaches the next snapshot | AssertionError: expected 3 to be 4 // Object.is equality |
| (new) tests/unit/soloSheetEditSnapshot.test.js › a sheet edit of the solo GM's PC (hasPlayerOwner false) drops the cached snapshot meters, impacts and pronouns edited on the sheet reach the next snapshot | AssertionError: expected { health: 5, wounded: false, …(1) } to deeply equal { health: 2, wounded: true, …(1) } |
| (new) tests/unit/soloSheetEditSnapshot.test.js › a sheet edit of the solo GM's PC (hasPlayerOwner false) drops the cached snapshot the next move rolls the edited stat | AssertionError: expected '&lt;div class="sf-move-result sf-weak-hi…' to contain '+iron (4)' |

- New test passing with and without the fix (a control?): tests/unit/soloSheetEditSnapshot.test.js › a sheet edit of the solo GM's PC (hasPlayerOwner false) drops the cached snapshot control: the same edit on a player-owned PC is seen

### 5df5b43 — fix: a user whose assigned character is the ship or an NPC speaks as their own PC (issue #321 U24)

Test files: `tests/unit/speaker.test.js`. Source restored: 1 file(s).

- With the fix: 26 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 24 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/speaker.test.js › resolveSpeakerActorId — a user whose assigned character is not a PC is attributed to their PC, not the starship assigned as their character | AssertionError: expected 'ship-1' to be 'pc-pat' // Object.is equality |
| (new) tests/unit/speaker.test.js › resolveSpeakerActorId — a user whose assigned character is not a PC is attributed to their PC, not the NPC card assigned as their character | AssertionError: expected 'npc-1' to be 'pc-pat' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/speaker.test.js › resolveSpeakerActorId — a user whose assigned character is not a PC control: the same ship as a SELECTED token (speaker.actor) falls through to the PC
- New test passing with and without the fix (a control?): tests/unit/speaker.test.js › resolveSpeakerActorId — a user whose assigned character is not a PC a bound PC is still honoured before the ownership scan

### ab9f4aa — fix: a vow's and a bond's rank read as a name in prompts and cards (issue #321 U62)

Test files: `tests/unit/vowRankName.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/vowRankName.test.js › a vendor vow's numeric rank reads as its name the snapshot carries the rank name for a vow and a bond | AssertionError: expected 3 to be 'formidable' // Object.is equality |
| (new) tests/unit/vowRankName.test.js › a vendor vow's numeric rank reads as its name the narrator's CHARACTER block names the vow's rank | AssertionError: expected 'Background vow: Find the Wanderer (3,…' to be 'Background vow: Find the Wanderer (fo…' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/vowRankName.test.js › a vendor vow's numeric rank reads as its name control: a string rank passes through and a missing rank still defaults to dangerous

### 8f24c65 — fix: a sheet-rolled vow or bond is narrated once, where a Claude key lives, as the roller (issue #321 U11)

Test files: `tests/unit/nativeRollKeyedRunner.test.js`, `tests/unit/nativeRollNarration.test.js`. Source restored: 2 file(s).

- With the fix: 15 passed, 0 failed.
- Without it: 9 failed (4 new; 0 only for a missing export); 6 still pass (1 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/nativeRollKeyedRunner.test.js › a sheet-rolled vow is narrated where a key lives a keyless player's roll is narrated once by the keyed GM, with no fallback card | AssertionError: expected [] to deeply equal [ [ 'gm-1', 'sk-ant-gina' ] ] |
| (new) tests/unit/nativeRollKeyedRunner.test.js › a sheet-rolled vow is narrated where a key lives the GM's narration is the roller's: their PC is the narrator's CHARACTER | AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string |
| (new) tests/unit/nativeRollNarration.test.js › planNativeRollNarration — no silent failures stands down quietly when another client narrates the roll | AssertionError: expected { act: false, …(2) } to deeply equal { act: false, …(2) } |
| (new) tests/unit/nativeRollNarration.test.js › planNativeRollNarration — no silent failures narrates when this client parsed a classified vow/connection roll | AssertionError: expected { act: false, …(2) } to deeply equal { act: true, reason: 'narrate', …(1) } |
| tests/unit/nativeRollNarration.test.js › planNativeRollNarration — no silent failures debug-logs a progress roll that is not a vow/connection (expedition/combat) | AssertionError: expected { act: false, …(2) } to deeply equal { act: false, …(2) } |
| tests/unit/nativeRollNarration.test.js › planNativeRollNarration — no silent failures stays quiet on a normal action roll | AssertionError: expected { act: false, …(2) } to deeply equal { act: false, …(2) } |
| tests/unit/nativeRollNarration.test.js › planNativeRollNarration — no silent failures WARNS on an unparseable roll card (a possible vendor-shape change) | AssertionError: expected { act: false, …(2) } to deeply equal { act: false, …(2) } |
| tests/unit/nativeRollNarration.test.js › planNativeRollNarration — no silent failures stays quiet on an ordinary non-roll message | AssertionError: expected { act: false, …(2) } to deeply equal { act: false, …(2) } |
| tests/unit/nativeRollNarration.test.js › planNativeRollNarration — no silent failures treats missing facts as a quiet stand-down (no throw) | AssertionError: expected { act: false, …(2) } to deeply equal { act: false, …(2) } |

- New test passing with and without the fix (a control?): tests/unit/nativeRollKeyedRunner.test.js › a sheet-rolled vow is narrated where a key lives control: with no keyed GM, a keyed player narrates their own roll on their own key

### 9f81053 — fix: a Forge a Bond rolled on the sheet's Connections tab is narrated (issue #321 U21)

Test files: `tests/unit/nativeBondRollNarration.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/nativeBondRollNarration.test.js › a progress roll made on the sheet is narrated by its subtype a connection (subtype "bond") is narrated as Forge a Bond | AssertionError: expected [] to have a length of 1 but got +0 |

- New test passing with and without the fix (a control?): tests/unit/nativeBondRollNarration.test.js › a progress roll made on the sheet is narrated by its subtype control: a vow (no moveDsId) is narrated as Fulfill Your Vow

### f9f10c6 — fix: the roller or owner, not the first PC, holds a new bond, swears the oath scene, speaks in the Private Channel and opens the Chronicle (issue #321 U23)

Test files: `tests/unit/chroniclePanel.test.js`, `tests/unit/connectionBondHolder.test.js`, `tests/unit/narratorPaced.test.js`, `tests/unit/private-channel.test.js`, `tests/unit/privateChannelOwnPc.test.js`, `tests/unit/rollerAttribution.test.js`, `tests/unit/speaker.test.js`, `tests/unit/swearTargetBondCrew.test.js`. Source restored: 9 file(s).

- With the fix: 118 passed, 0 failed.
- Without it: 19 failed (19 new; 5 only for a missing export); 99 still pass (4 new).
- Verdict: **sensitive** — 14 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/chroniclePanel.test.js › the toolbar opens the viewer's own PC's Chronicle an unbound player who owns Ren opens Ren's, not the first PC's | AssertionError: expected [ 'pc-1' ] to deeply equal [ 'pc-ren' ] |
| (new) tests/unit/chroniclePanel.test.js › the toolbar opens the viewer's own PC's Chronicle a player with no PC of their own is told so, and opens no one else's | AssertionError: expected [ 'pc-1' ] to deeply equal [] |
| (new) tests/unit/connectionBondHolder.test.js › a connection the narration creates is the roller's Make a Connection: the auto-created connection's bond Item goes to the PC who rolled | AssertionError: expected { ren: [], kira: [ 'Sable Ortiz' ] } to deeply equal { ren: [ 'Sable Ortiz' ], kira: [] } |
| (new) tests/unit/connectionBondHolder.test.js › a connection the narration creates is the roller's a paced narration's draft card carries the PC it was written for, for Confirm | AssertionError: expected [ [ [ 'Sable Ortiz' ], undefined ] ] to deeply equal [ [ [ 'Sable Ortiz' ], 'pc-ren' ] ] |
| (new) tests/unit/narratorPaced.test.js › schedulePacedDetection() hands routeEntityDrafts the PC the narration was for | AssertionError: expected undefined to be 'pc-ren' // Object.is equality |
| (new) tests/unit/private-channel.test.js › buildPrivateContext speaks as the player's own PC (issue #321 U23) an unbound player who owns a PC is given theirs, not the campaign's first | AssertionError: expected "spy" to be called with arguments: [ …(2) ] |
| (new) tests/unit/private-channel.test.js › buildPrivateContext speaks as the player's own PC (issue #321 U23) a player with no PC of their own gets none — never another player's | Error: promise resolved "{ …(3) }" instead of rejecting |
| (new) tests/unit/privateChannelOwnPc.test.js › publishing a Private Channel reflection attributes it to the publisher's own PC, not the campaign's first PC | AssertionError: expected 'Kira' to be 'Dax' // Object.is equality |
| (new) tests/unit/privateChannelOwnPc.test.js › publishing a Private Channel reflection a player with no PC of their own publishes as themselves, never as another player's PC | AssertionError: expected 'Kira' to be 'You' // Object.is equality |
| (new) tests/unit/rollerAttribution.test.js › the vow-swearing scene is written for the character who swore Ren swears; the oath scene's CHARACTER block is Ren's | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to match /## CHARACTER\nName: Ren\b/ |
| (new) tests/unit/rollerAttribution.test.js › Confirm on a draft card puts the connection's bond on the PC the narration was for Ren's narration introduced them: the bond is on Ren's sheet, not Kira's | AssertionError: expected undefined to be 'pc-quinn' // Object.is equality |
| (new) (API) tests/unit/speaker.test.js › resolveUserActorId — the roller / owner first, the first PC only for a GM or solo play an unbound player who owns a PC gets theirs, not the campaign's first | TypeError: (0 , resolveUserActorId) is not a function |
| (new) (API) tests/unit/speaker.test.js › resolveUserActorId — the roller / owner first, the first PC only for a GM or solo play a bound PC wins over an owned one | TypeError: (0 , resolveUserActorId) is not a function |
| (new) (API) tests/unit/speaker.test.js › resolveUserActorId — the roller / owner first, the first PC only for a GM or solo play a player with no PC of their own is never handed another player's | TypeError: (0 , resolveUserActorId) is not a function |
| (new) (API) tests/unit/speaker.test.js › resolveUserActorId — the roller / owner first, the first PC only for a GM or solo play a GM with no PC of their own gets the campaign's first PC | TypeError: (0 , resolveUserActorId) is not a function |
| (new) (API) tests/unit/speaker.test.js › resolveUserActorId — the roller / owner first, the first PC only for a GM or solo play solo play: the one PC in the world is anyone's | TypeError: (0 , resolveUserActorId) is not a function |
| (new) tests/unit/speaker.test.js › resolveUserActorId — the roller / owner first, the first PC only for a GM or solo play a message from a player with no PC resolves to no one, not the campaign's first PC | AssertionError: expected 'pc-kira' to be null |
| (new) tests/unit/swearTargetBondCrew.test.js › swearing the shared inciting vow every PC the shared vow is sworn on also gets the vow target as a connection | AssertionError: expected [] to deeply equal [ 'conn-vance' ] |
| (new) tests/unit/swearTargetBondCrew.test.js › swearing the shared inciting vow the oath scene is written for the PC who rolled the swear | AssertionError: expected { vow: { …(3) }, …(1) } to match object { speakerActorId: 'pc-tomas' } |

- New test passing with and without the fix (a control?): tests/unit/chroniclePanel.test.js › the toolbar opens the viewer's own PC's Chronicle control: the GM with no bound PC opens the first PC's
- New test passing with and without the fix (a control?): tests/unit/privateChannelOwnPc.test.js › publishing a Private Channel reflection control: a bound player publishes as their bound PC
- New test passing with and without the fix (a control?): tests/unit/rollerAttribution.test.js › Confirm on a draft card puts the connection's bond on the PC the narration was for control: a card that names no PC falls back to the confirming GM's — the first PC
- New test passing with and without the fix (a control?): tests/unit/speaker.test.js › resolveUserActorId — the roller / owner first, the first PC only for a GM or solo play control: a message carrying only its author's id is resolved through game.users, so a GM author keeps the first-PC fallback

### ced9f5e — fix: the Private Channel stands down while the X-Card is in play (issue #321 U09)

Test files: `tests/unit/private-channel.test.js`, `tests/unit/privateChannelXCard.test.js`. Source restored: 4 file(s).

- With the fix: 60 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 57 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/privateChannelXCard.test.js › publishing a reflection while the X-Card is active puts no narrator (canon) card into main chat during the pause, and tells the player | AssertionError: expected { …(12) } to be null |
| (new) tests/unit/privateChannelXCard.test.js › the private narrator during an X-Card pause stands down on entry: no Claude call, and the window is told why | AssertionError: expected { ok: true, …(1) } to deeply equal { ok: false, reason: 'x-card' } |
| (new) tests/unit/privateChannelXCard.test.js › the private narrator during an X-Card pause discards a reply written while the card was played | AssertionError: expected { ok: true, …(1) } to deeply equal { ok: false, reason: 'x-card' } |

- New test passing with and without the fix (a control?): tests/unit/privateChannelXCard.test.js › publishing a reflection while the X-Card is active control: once a GM resumes, the reflection is published as canon
- New test passing with and without the fix (a control?): tests/unit/privateChannelXCard.test.js › the private narrator during an X-Card pause control: with no X-Card in play the private narrator answers

### 4e1d531 — fix: a default Player's Private Channel history is saved (issue #321 U10)

Test files: `tests/unit/hookGates.test.js`, `tests/unit/privateChannelPlayerJournal.test.js`. Source restored: 2 file(s).

- With the fix: 8 passed, 0 failed.
- Without it: 4 failed (3 new; 1 only for a missing export); 4 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/hookGates.test.js › document hook handlers run their shared writes on one client every LOCAL_ONLY entry still names an ungated handler | AssertionError: src/private-channel/transcript.js createJournalEntry inline#1 no longer exists — remove it from LOCAL_ONLY: expected false to be true // Object. |
| (new) tests/unit/privateChannelPlayerJournal.test.js › a default Player's Private Channel transcript is saved when the window flushes: the GM creates the journal, owned by the player | AssertionError: expected '' to contain 'about the ring' |
| (new) tests/unit/privateChannelPlayerJournal.test.js › a default Player's Private Channel transcript a later flush writes to the same journal — one journal per player | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) (API) tests/unit/privateChannelPlayerJournal.test.js › a default Player's Private Channel transcript the GM serves a repeated create with the journal it already made | TypeError: transcript.applyPrivateJournalCreate is not a function |

- New test passing with and without the fix (a control?): tests/unit/privateChannelPlayerJournal.test.js › a default Player's Private Channel transcript control: the GM creates its own transcript journal on its own client

### 79ff7a5 — fix: the Private Channel shows and sends the narrator one transcript (issue #321 U42)

Test files: `tests/unit/private-channel.test.js`, `tests/unit/privateChannelTranscript.test.js`. Source restored: 2 file(s).

- With the fix: 60 passed, 0 failed.
- Without it: 5 failed (5 new; 3 only for a missing export); 55 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/private-channel.test.js › parseTurnsHtml reads back what renderTurnsHtml wrote, escapes and all | TypeError: parseTurnsHtml is not a function |
| (new) (API) tests/unit/private-channel.test.js › parseTurnsHtml reads a paragraph the journal editor reformatted, telling the narrator by name | TypeError: parseTurnsHtml is not a function |
| (new) (API) tests/unit/private-channel.test.js › parseTurnsHtml skips empty paragraphs and reads nothing from nothing | TypeError: parseTurnsHtml is not a function |
| (new) tests/unit/privateChannelTranscript.test.js › Private Channel reopened in the same session sends the narrator the session's earlier private turns it is showing | AssertionError: expected [ Array(1) ] to deeply equal [ …(3) ] |
| (new) tests/unit/privateChannelTranscript.test.js › the session's first Private Channel conversation shows each turn once after the debounced save lands | AssertionError: expected 2 to be 1 // Object.is equality |

### 6630c3b — fix: one Pay the Price per result — the narration depicts the card's price (issue #321 U03)

Test files: `tests/unit/payThePriceOneRoll.test.js`, `tests/unit/resolver.test.js`. Source restored: 2 file(s).

- With the fix: 291 passed, 0 failed.
- Without it: 9 failed (9 new; 3 only for a missing export); 282 still pass (2 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/payThePriceOneRoll.test.js › one result, one Pay the Price (issue #321 U03) a miss: the move narration is seeded with the price the card shows and the table pays, rolled once | AssertionError: expected 'You are separated from something or s…' to be 'A trusted ally is put in harm\'s way' // Object.is equality |
| (new) tests/unit/payThePriceOneRoll.test.js › one result, one Pay the Price (issue #321 U03) Face Defeat: the narration depicts the card's price, rolled once | AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ] |
| (new) tests/unit/resolver.test.js › buildOracleSeeds play-kit consequence tables a miss the pipeline routes to Pay the Price rolls no price of its own — the card's is the one (issue #321 U03) | AssertionError: expected { …(3) } to be null |
| (new) tests/unit/resolver.test.js › buildOracleSeeds play-kit consequence tables Face Defeat rolls no seed price — it always routes Pay the Price (issue #321 U03) | AssertionError: expected { …(3) } to be null |
| (new) tests/unit/resolver.test.js › one Pay the Price per result (issue #321 U03) a miss that routes Pay the Price rolls no price for the narrator | AssertionError: expected "spy" to not be called with arguments: [ 'pay_the_price' ] |
| (new) tests/unit/resolver.test.js › one Pay the Price per result (issue #321 U03) Face Defeat rolls no price for the narrator either | AssertionError: expected "spy" to not be called with arguments: [ 'pay_the_price' ] |
| (new) (API) tests/unit/resolver.test.js › one Pay the Price per result (issue #321 U03) withPayThePriceSeed — the card's price into the narration's seeds a result with no seeds gets one: the card's price | TypeError: withPayThePriceSeed is not a function |
| (new) (API) tests/unit/resolver.test.js › one Pay the Price per result (issue #321 U03) withPayThePriceSeed — the card's price into the narration's seeds adds the price after the move's own seeds, leaving them unchanged | TypeError: withPayThePriceSeed is not a function |
| (new) (API) tests/unit/resolver.test.js › one Pay the Price per result (issue #321 U03) withPayThePriceSeed — the card's price into the narration's seeds no price (the card was not posted) leaves the seeds as they are | TypeError: withPayThePriceSeed is not a function |

- New test passing with and without the fix (a control?): tests/unit/resolver.test.js › buildOracleSeeds play-kit consequence tables seeds an advisory Pay the Price on a miss that routes none (Sojourn's, one of its choices)
- New test passing with and without the fix (a control?): tests/unit/resolver.test.js › one Pay the Price per result (issue #321 U03) control: a miss whose other seeds roll keeps them

### af10b33 — fix: a forced move rolls the stat its narration fits, not its first listed one (issue #321 U04)

Test files: `tests/unit/forcedMoveStat.test.js`, `tests/unit/interpreterExpectedMove.test.js`, `tests/unit/statEnrichment.test.js`. Source restored: 3 file(s).

- With the fix: 66 passed, 0 failed.
- Without it: 12 failed (12 new; 6 only for a missing export); 54 still pass (3 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/forcedMoveStat.test.js › a forced move rolls the stat its narration fits (issue #321 U04) the pacing "Roll ⟨move⟩" button: the GM reads the stat for the forced move, the dialog shows it, the roll uses it | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/forcedMoveStat.test.js › a forced move rolls the stat its narration fits (issue #321 U04) a way-out button: the canned exit is read for its stat too | AssertionError: expected [ { moveId: 'face_danger', …(1) } ] to deeply equal [ { moveId: 'face_danger', …(1) } ] |
| (new) tests/unit/interpreterExpectedMove.test.js › interpretMove() — a move already chosen (expectedMoveSlug) tells the model the move is fixed and which stats it lists, with no mischief and no position steer | AssertionError: expected 'No active tracks yet.\n\nINTERPRETATI…' to contain 'MOVE ALREADY CHOSEN: the player chose…' |
| (new) tests/unit/interpreterExpectedMove.test.js › interpretMove() — a move already chosen (expectedMoveSlug) keeps the chosen move when the model names another — its stat stands when the chosen move lists it | AssertionError: expected { …(18) } to match object { moveId: 'battle', …(3) } |
| (new) tests/unit/interpreterExpectedMove.test.js › interpretMove() — a move already chosen (expectedMoveSlug) a stat the chosen move does not list gives way to its first | AssertionError: expected 'wits' to be 'heart' // Object.is equality |
| (new) tests/unit/interpreterExpectedMove.test.js › interpretMove() — a move already chosen (expectedMoveSlug) an unreadable reply keeps the chosen move and its first listed stat | AssertionError: expected { …(17) } to match object { moveId: 'heal', …(3) } |
| (new) (API) tests/unit/statEnrichment.test.js › enrichForcedMoveStat a move with several stats rolls the one the stat-only reading picks, and says why | TypeError: (0 , enrichForcedMoveStat) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichForcedMoveStat every forced move whose stat is a choice is read — the examples that always rolled +edge or +iron | TypeError: (0 , enrichForcedMoveStat) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichForcedMoveStat no Claude key (no interpreter): the listed stat stays | TypeError: (0 , enrichForcedMoveStat) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichForcedMoveStat nothing to choose — one stat, a progress or no-roll move, or "whichever is higher" — makes no reading | TypeError: (0 , enrichForcedMoveStat) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichForcedMoveStat a stat the move does not list keeps the listed one | TypeError: (0 , enrichForcedMoveStat) is not a function |
| (new) (API) tests/unit/statEnrichment.test.js › enrichForcedMoveStat a failed reading keeps the listed stat and says so | TypeError: (0 , enrichForcedMoveStat) is not a function |

- New test passing with and without the fix (a control?): tests/unit/forcedMoveStat.test.js › a forced move rolls the stat its narration fits (issue #321 U04) control: a forced move with one stat to roll makes no reading
- New test passing with and without the fix (a control?): tests/unit/interpreterExpectedMove.test.js › interpretMove() — a move already chosen (expectedMoveSlug) control: a reading for the chosen move, with a stat it lists, comes back as read
- New test passing with and without the fix (a control?): tests/unit/interpreterExpectedMove.test.js › interpretMove() — a move already chosen (expectedMoveSlug) control: without a chosen move the model still picks the move, under mischief

### 481bea4 — fix: an unnamed Fulfill Your Vow scores the roller's vow, or asks which (issue #321 U02)

Test files: `tests/unit/fulfilVowWhichVow.test.js`, `tests/unit/milestone.test.js`, `tests/unit/statEnrichment.test.js`. Source restored: 6 file(s).

- With the fix: 104 passed, 0 failed.
- Without it: 22 failed (22 new; 12 only for a missing export); 82 still pass (1 new).
- Verdict: **sensitive** — 10 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/fulfilVowWhichVow.test.js › Attempt to Fulfill Vow names no vow (issue #321 U02) a shared vow held by two PCs is one vow: the button scores it, nothing asked | AssertionError: expected [ { moveTargetId: null, …(1) } ] to deeply equal [ { moveTargetId: null, …(1) } ] |
| (new) tests/unit/fulfilVowWhichVow.test.js › Attempt to Fulfill Vow names no vow (issue #321 U02) two PCs' own vows: the roller's is scored | AssertionError: expected [ { moveTargetId: null, …(1) } ] to deeply equal [ { moveTargetId: null, …(1) } ] |
| (new) tests/unit/fulfilVowWhichVow.test.js › Attempt to Fulfill Vow names no vow (issue #321 U02) a solo PC's two vows: nothing rolled — "Which vow?" asks; the pick rolls that vow, once, as the roller | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/fulfilVowWhichVow.test.js › Attempt to Fulfill Vow names no vow (issue #321 U02) only the roller's player (or a GM) may pick for them | TypeError: Cannot read properties of undefined (reading '_id') |
| (new) tests/unit/fulfilVowWhichVow.test.js › Attempt to Fulfill Vow names no vow (issue #321 U02) a picked vow fulfilled before the pick lands is not rolled — and says so | TypeError: Cannot read properties of undefined (reading '_id') |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow control: one PC, one open vow — that vow | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a shared vow's copies are one vow — the roller's copy | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a roller who holds no copy (a GM) still finds the one shared vow | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow two PCs, each with their own vow — the roller's | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a solo PC's background and inciting vows: no vow, both offered — never a 0 score | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow the roller's vows are the choices — a crewmate's own vow is not offered | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a roller who holds none: everyone's vows, a shared one offered once | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a shared vow offered among several is the roller's own copy | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a named vow: the roller's own first, then anyone's — exact, then a substring | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a picked copy by id: that open copy, else nothing — never another vow | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow a vow the module has not stamped counts as itself | TypeError: (0 , selectFulfilVow) is not a function |
| (new) (API) tests/unit/milestone.test.js › selectFulfilVow no open vow: nothing, and nothing to offer | TypeError: (0 , selectFulfilVow) is not a function |
| (new) tests/unit/statEnrichment.test.js › enrichProgressTicks — Fulfill Your Vow naming no vow (issue #321 U02) two PCs whose only vow is their shared vow — the unnamed fulfil scores that vow, not 0 | AssertionError: expected { ticks: +0, source: 'vow', …(3) } to match object { ticks: 32, trackId: 'v1' } |
| (new) tests/unit/statEnrichment.test.js › enrichProgressTicks — Fulfill Your Vow naming no vow (issue #321 U02) two PCs, each with their own single vow — the roller's vow is scored, not 0 | AssertionError: expected +0 to be 24 // Object.is equality |
| (new) tests/unit/statEnrichment.test.js › enrichProgressTicks — Fulfill Your Vow naming no vow (issue #321 U02) a "Which vow?" pick scores the copy it names, by id | AssertionError: expected { source: 'vow', ticks: 32, …(3) } to match object { ticks: 36, trackId: 'v2' } |
| (new) tests/unit/statEnrichment.test.js › enrichProgressTicks — Fulfill Your Vow naming no vow (issue #321 U02) a picked vow fulfilled meanwhile scores nothing — and no journal track stands in for it | AssertionError: expected { source: 'vow', ticks: 40, …(3) } to match object { ticks: +0, trackId: null } |
| (new) tests/unit/statEnrichment.test.js › enrichProgressTicks — Fulfill Your Vow naming no vow (issue #321 U02) several of the roller's vows open: nothing scored — the pipeline asks which vow first | AssertionError: expected { source: 'vow', ticks: 40, …(3) } to match object { ticks: +0, trackId: null } |

- New test passing with and without the fix (a control?): tests/unit/statEnrichment.test.js › enrichProgressTicks — Fulfill Your Vow naming no vow (issue #321 U02) control: one PC, one open vow — the unnamed fulfil scores it

### 6f911d9 — fix: an unnamed Strike or Undertake an Expedition asks which track instead of making one (issue #321 U16)

Test files: `tests/unit/combat.test.js`, `tests/unit/expedition.test.js`, `tests/unit/progressTrackSelection.test.js`. Source restored: 3 file(s).

- With the fix: 67 passed, 0 failed.
- Without it: 8 failed (8 new; 0 only for a missing export); 59 still pass (5 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix; 5 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/combat.test.js › applyCombatProgress a fight is created only when none is open (issue #321 U16) with two fights open and no target named, a Strike creates no new fight and marks nothing | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/combat.test.js › applyCombatProgress a fight is created only when none is open (issue #321 U16) a name matching none of the open fights creates none either | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/combat.test.js › applyCombatProgress a fight is created only when none is open (issue #321 U16) a fight named by id (a which-fight pick) is that fight — not a same-named sibling | AssertionError: expected "spy" to be called with arguments: [ 'f3' ] |
| (new) tests/unit/combat.test.js › applyCombatProgress a fight is created only when none is open (issue #321 U16) a fight named by id that is over is not re-created, and nothing is marked | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/expedition.test.js › applyExpeditionProgress an expedition is begun only when none is open or a new one is named (issue #321 U16) with two expeditions open and no destination named, nothing is begun or marked | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/expedition.test.js › applyExpeditionProgress an expedition is begun only when none is open or a new one is named (issue #321 U16) an expedition named by id (a which-expedition pick) is that one; over, nothing | AssertionError: expected { track: { id: 'new', …(5) }, …(1) } to deeply equal { track: null, created: false, …(1) } |
| (new) tests/unit/progressTrackSelection.test.js › a move that marks one track, naming none of several, asks which (issue #321 U16) two fights open: an unnamed Strike is not rolled — the pick strikes that fight, for the roller, and no phantom fight is made | AssertionError: expected [ { …(4) } ] to deeply equal [] |
| (new) tests/unit/progressTrackSelection.test.js › a move that marks one track, naming none of several, asks which (issue #321 U16) two expeditions open: an unnamed Undertake an Expedition asks which; the pick marks that one | AssertionError: expected [ { …(4) } ] to deeply equal [] |

- New test passing with and without the fix (a control?): tests/unit/combat.test.js › applyCombatProgress a fight is created only when none is open (issue #321 U16) control: with one fight open, an unnamed Strike marks that fight
- New test passing with and without the fix (a control?): tests/unit/combat.test.js › applyCombatProgress a fight is created only when none is open (issue #321 U16) control: entering the fray (beginsFight) begins a new fight beside the open ones
- New test passing with and without the fix (a control?): tests/unit/expedition.test.js › applyExpeditionProgress an expedition is begun only when none is open or a new one is named (issue #321 U16) control: a destination none of them matches is a new expedition, as before
- New test passing with and without the fix (a control?): tests/unit/progressTrackSelection.test.js › a move that marks one track, naming none of several, asks which (issue #321 U16) control: a destination none of them matches begins a new expedition, as before
- New test passing with and without the fix (a control?): tests/unit/progressTrackSelection.test.js › a move that marks one track, naming none of several, asks which (issue #321 U16) control: the Enter the Fray threshold still begins a new fight while two are open

### 413e293 — fix: an Explore a Waypoint miss pays the price (issue #321 U17)

Test files: `tests/unit/payThePriceOneRoll.test.js`, `tests/unit/resolver.test.js`. Source restored: 1 file(s).

- With the fix: 295 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 293 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/payThePriceOneRoll.test.js › an Explore a Waypoint miss pays the price (issue #321 U17) a miss without a match posts the Pay the Price card — once, the price the narration depicts | AssertionError: expected undefined to be defined |
| (new) tests/unit/resolver.test.js › routePayThePrice on miss/weak outcomes explore_a_waypoint:miss sets routePayThePrice:true | AssertionError: expected false to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/payThePriceOneRoll.test.js › an Explore a Waypoint miss pays the price (issue #321 U17) control: a miss with a match offers Confront Chaos instead — no price is routed
- New test passing with and without the fix (a control?): tests/unit/resolver.test.js › routePayThePrice on miss/weak outcomes control: explore_a_waypoint:miss with a match offers Confront Chaos instead — the price is not routed

### 4768ebd — fix: an Enter the Fray weak hit that takes the momentum begins in a bad spot (issue #321 U18)

Test files: `tests/unit/resolver.test.js`. Source restored: 1 file(s).

- With the fix: 293 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 292 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/resolver.test.js › CONSEQUENCE_MAP — sufferPrompt shape (F16 Phase B) enter_the_fray weak hit — the momentum option begins in a bad spot (issue #321 U18) taking +2 momentum (not 'You are in control') takes the momentum and begins in a bad spot | AssertionError: expected [ { kind: 'meter', …(2) } ] to deeply equal [ { kind: 'meter', …(2) }, …(1) ] |

- New test passing with and without the fix (a control?): tests/unit/resolver.test.js › CONSEQUENCE_MAP — sufferPrompt shape (F16 Phase B) enter_the_fray weak hit — the momentum option begins in a bad spot (issue #321 U18) control: 'You are in control' sets in control alone; the strong hit and the miss set theirs

### 11785cf — fix: Mark Progress on Vow and Recommit apply once per card (issue #321 U20)

Test files: `tests/unit/cardActions.test.js`, `tests/unit/gmRelay.test.js`, `tests/unit/milestoneSuggestionOnce.test.js`, `tests/unit/recommitOnce.test.js`. Source restored: 3 file(s).

- With the fix: 123 passed, 0 failed.
- Without it: 17 failed (17 new; 11 only for a missing export); 104 still pass (1 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/cardActions.test.js › applyMilestoneSuggestion (issue #321 U20) the roller's player presses: the card is claimed and the move posted once, as the roller | TypeError: applyMilestoneSuggestion is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyMilestoneSuggestion (issue #321 U20) two near-simultaneous presses post exactly one move | TypeError: applyMilestoneSuggestion is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyMilestoneSuggestion (issue #321 U20) another player may not press it for the roller; the clicker's own PC is never substituted | TypeError: applyMilestoneSuggestion is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyMilestoneSuggestion (issue #321 U20) a card from before the roller was stamped marks the clicker's own PC — one they own | TypeError: applyMilestoneSuggestion is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyMilestoneSuggestion (issue #321 U20) a refused claim posts nothing; a failed post releases the claim so the press can be made again | TypeError: applyMilestoneSuggestion is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyMilestoneSuggestion (issue #321 U20) refuses a card that offers no milestone | TypeError: applyMilestoneSuggestion is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyRecommitOffer (issue #321 U20) any user's press claims the offer and recommits once | TypeError: applyRecommitOffer is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyRecommitOffer (issue #321 U20) two near-simultaneous presses recommit exactly once | TypeError: applyRecommitOffer is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyRecommitOffer (issue #321 U20) a refused track write changed nothing: the claim is released, and the press can be made again | TypeError: applyRecommitOffer is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyRecommitOffer (issue #321 U20) an expedition already over keeps the offer closed | TypeError: applyRecommitOffer is not a function |
| (new) (API) tests/unit/cardActions.test.js › applyRecommitOffer (issue #321 U20) a refused claim recommits nothing; a card that is no offer is refused | TypeError: applyRecommitOffer is not a function |
| (new) tests/unit/milestoneSuggestionOnce.test.js › "⚑ Mark Progress on Vow" marks one milestone per card (issue #321 U20) the player and the GM both pressing "Mark Progress on Vow" mark one milestone | AssertionError: expected 16 to be 8 // Object.is equality |
| (new) tests/unit/milestoneSuggestionOnce.test.js › "⚑ Mark Progress on Vow" marks one milestone per card (issue #321 U20) after a re-render the used button stays used | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/milestoneSuggestionOnce.test.js › "⚑ Mark Progress on Vow" marks one milestone per card (issue #321 U20) the card's roller is the one marked: another player may not press it for them; the GM may, as the roller | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |
| (new) tests/unit/recommitOnce.test.js › one recommit offer recommits once (issue #321 U20) the player and the GM both pressing Recommit on one card recommits once | AssertionError: expected [ { …(7) }, { …(7) } ] to have a length of 1 but got 2 |
| (new) tests/unit/recommitOnce.test.js › one recommit offer recommits once (issue #321 U20) a player's press is applied on the canonical GM and shows used everywhere | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/recommitOnce.test.js › one recommit offer recommits once (issue #321 U20) a re-rendered offer card does not recommit a second time | AssertionError: expected [ { …(7) }, { …(7) } ] to have a length of 1 but got 2 |

- New test passing with and without the fix (a control?): tests/unit/milestoneSuggestionOnce.test.js › "⚑ Mark Progress on Vow" marks one milestone per card (issue #321 U20) control: the player and the GM both pressing "Make a Discovery" mark the legacy once

### c282a13 — fix: the command-vehicle reconcile runs when the world loads (issue #321 U22)

Test files: `tests/unit/commandVehicleLoadScan.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/commandVehicleLoadScan.test.js › the command-vehicle reconcile runs at world load (issue #321 U22) a legacy command vehicle is flagged when the world loads | AssertionError: expected 1 to be +0 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/commandVehicleLoadScan.test.js › the command-vehicle reconcile runs at world load (issue #321 U22) control: the reconcile itself works on this harness when it is called

### 08cf719 — test: the "Which vow?" pick handler's refusals and claim release (issue #321 U02)

Skipped: the commit changes nothing under src/.

### 88a72a8 — fix: a session nobody ended rolls over with its gate closed, so Begin a Session runs (issue #321 U12)

Test files: `tests/unit/sessionGateRollover.test.js`, `tests/unit/sessionManagement.test.js`, `tests/unit/sessionRelayDialogs.test.js`. Source restored: 2 file(s).

- With the fix: 63 passed, 0 failed.
- Without it: 3 failed (2 new; 0 only for a missing export); 60 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sessionGateRollover.test.js › a session nobody ended rolls over with its gate closed (issue #321 U12) the session minted at world load is not "already active" since last week, and can be begun from the panel | AssertionError: expected { …(7) } to match object { sessionActive: false, …(1) } |
| (new) tests/unit/sessionManagement.test.js › session boundaries (issue #286 C3, C4) a new session starts with its session-active gate closed, and its caller persists the gate | AssertionError: expected { …(6) } to match object { sessionNumber: 5, …(2) } |
| tests/unit/sessionRelayDialogs.test.js › Begin a Session a session that went idle is begun anew, although nobody ended it | AssertionError: expected 612000001 to be less than 60000 |

- New test passing with and without the fix (a control?): tests/unit/sessionGateRollover.test.js › a session nobody ended rolls over with its gate closed (issue #321 U12) a reload mid-session keeps the gate open — only a new session closes it

### 9cff74f — fix: End a Session's closing vignette features a bond still in play, not a severed one (issue #321 U61)

Test files: `tests/unit/endSessionVignetteSeveredBond.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/endSessionVignetteSeveredBond.test.js › selectEndSessionNPC — a severed bond is not the closing vignette's NPC skips a severed (inactive) bond and features the live one | AssertionError: expected 'Vance' to be 'Ilse' // Object.is equality |
| (new) tests/unit/endSessionVignetteSeveredBond.test.js › selectEndSessionNPC — a severed bond is not the closing vignette's NPC with only a severed bond, an active connection is featured instead | AssertionError: expected { kind: 'bonded_connection', …(2) } to match object { kind: 'connection', name: 'Doran' } |
| (new) tests/unit/endSessionVignetteSeveredBond.test.js › selectEndSessionNPC — a severed bond is not the closing vignette's NPC with only a severed bond and nothing else, the vignette falls back — never the lost NPC | AssertionError: expected 'bonded_connection' to be 'fallback' // Object.is equality |

### f6050b0 — fix: a shared vow's deadline is one clock on Pay the Price — listed once, one trigger vignette (issue #321 U55)

Test files: `tests/unit/actorBridge.test.js`, `tests/unit/sharedVowClockOnce.test.js`. Source restored: 2 file(s).

- With the fix: 109 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 104 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/actorBridge.test.js › advanceVowClocks with a lockstep map, later copies of a vowId follow the first copy instead of advancing again | AssertionError: expected [ [ 'va', 3, undefined ], …(2) ] to deeply equal [ [ 'va', 3, 'shared-1' ], …(2) ] |
| (new) tests/unit/sharedVowClockOnce.test.js › one shared vow, three PCs — Pay the Price fills its deadline once (issue #321 U55) the clock card lists the shared deadline once | AssertionError: expected 3 to be 1 // Object.is equality |
| (new) tests/unit/sharedVowClockOnce.test.js › one shared vow, three PCs — Pay the Price fills its deadline once (issue #321 U55) one trigger vignette (one Claude call, one TRIGGERED card) for the one deadline | AssertionError: expected { claudeCalls: 3, cards: 3 } to deeply equal { claudeCalls: 1, cards: 1 } |
| (new) tests/unit/sharedVowClockOnce.test.js › one shared vow, three PCs — Pay the Price fills its deadline once (issue #321 U55) every PC's copy still advances, and the result lists each copy for the Burn Momentum reversal | AssertionError: expected [ …(3) ] to deeply equal [ …(3) ] |
| (new) tests/unit/sharedVowClockOnce.test.js › one shared vow, three PCs — Pay the Price fills its deadline once (issue #321 U55) the copies move together: a sibling the sync hook already moved is not advanced a second time | AssertionError: expected [ 3, 4, 4 ] to deeply equal [ 3, 3, 3 ] |

- New test passing with and without the fix (a control?): tests/unit/sharedVowClockOnce.test.js › one shared vow, three PCs — Pay the Price fills its deadline once (issue #321 U55) two PCs' own vows of the same name are two clocks — each keeps its line

### 25c47ac — fix: !oracle yes accepts "small chance" and "almost certain" as odds (issue #321 U64)

Test files: `tests/unit/chatCommandRouting.test.js`. Source restored: 1 file(s).

- With the fix: 30 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 28 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/chatCommandRouting.test.js › !oracle yes — the rulebook's two-word odds names "almost certain" rolls at Almost Certain odds, not 50/50 | AssertionError: expected { Object (name, question, ...) } to match object { …(2) } |
| (new) tests/unit/chatCommandRouting.test.js › !oracle yes — the rulebook's two-word odds names "small chance" keeps "chance" out of the question | AssertionError: expected { …(3) } to match object { …(2) } |

- New test passing with and without the fix (a control?): tests/unit/chatCommandRouting.test.js › !oracle yes — the rulebook's two-word odds names a one-word alias still works, and a question that merely starts with an odds word is not eaten

### 96bd02c — fix: the narrator's World Truths name a truth's rolled detail, such as who the war was against (issue #321 U66)

Test files: `tests/unit/narratorPrompt.test.js`. Source restored: 1 file(s).

- With the fix: 147 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 146 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narratorPrompt.test.js › buildNarratorSystemPrompt() WORLD TRUTHS carries a truth's rolled sub-table detail, with its label | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to contain 'Cataclysm: We escaped the ravages of …' |

### 90bbb4d — fix: the Playtest Quickstart's World Truths count as established and never overwrite a GM's own "World Truths" journal (issue #321 U67)

Test files: `tests/unit/truths.test.js`. Source restored: 1 file(s).

- With the fix: 36 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 31 still pass (0 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/truths.test.js › storeWorldTruths records the truths as established: worldTruthsSet and worldTruthsJournalId alongside worldTruths | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/truths.test.js › storeWorldTruths a GM journal named "World Truths" (no module flag) keeps its content — the module writes its own | AssertionError: expected '&lt;h2>Cataclysm&lt;/h2>\n      &lt;p>&lt;strong>…' to be '&lt;p>The GM\'s own truths, written by h…' // Object.is equality |
| (new) tests/unit/truths.test.js › storeWorldTruths a second run rewrites the module's own journal — found by the recorded id, though the GM renamed it — and keeps its other pages | AssertionError: expected { id: 'j-new-2', …(4) } to be { id: 'j-new-1', …(4) } // Object.is equality |
| (new) tests/unit/truths.test.js › storeWorldTruths found by its flag when the recorded id names another journal; a lost truths page is re-created, never written over the lore page | AssertionError: expected '&lt;h2>Cataclysm&lt;/h2>\n      &lt;p>&lt;strong>…' to be '&lt;p>Lore.&lt;/p>' // Object.is equality |
| (new) tests/unit/truths.test.js › storeWorldTruths writes only the truths fields — a write that lands while the journal is created is kept | AssertionError: expected { worldTruths: { …(14) }, …(37) } to match object { xCardActive: true, …(1) } |

### 718991b — fix: after the World Truths are revised in the truths dialog, !lore summarises the revised truths (issue #321 U65)

Test files: `tests/unit/revisedTruthsLore.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/revisedTruthsLore.test.js › after the truths are revised, !lore summarises the revised truths (issue #321 U65) a second Save in the truths dialog becomes the journal !lore reads | AssertionError: expected { worldTruths: { …(14) }, …(36) } to match object { worldTruthsSet: true, …(1) } |
| (new) tests/unit/revisedTruthsLore.test.js › after the truths are revised, !lore summarises the revised truths (issue #321 U65) with the recorded journal gone, !lore falls back to the newest truths journal and records it | AssertionError: expected 'Summarise these world truths:\n\nCata…' to contain 'Interdimensional entities' |

- New test passing with and without the fix (a control?): tests/unit/revisedTruthsLore.test.js › after the truths are revised, !lore summarises the revised truths (issue #321 U65) a page with no truth selections (the dialog's empty save) does not move the record

### 68b0e11 — fix: oracle rolls resolve "Roll three times", "Ships in conflict (roll twice)" and Ultra-scale instead of returning the instruction (issue #321 U68)

Test files: `tests/unit/oracleRoller.test.js`. Source restored: 2 file(s).

- With the fix: 32 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 28 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/oracleRoller.test.js › rollOracle — directive resolution every directive wording resolves (issue #321 U68) Space Sighting 99 "Roll three times" rolls three results, in every region | AssertionError: expected 'Roll three times' to be 'Debris field: Mineral asteroids / Lar…' // Object.is equality |
| (new) tests/unit/oracleRoller.test.js › rollOracle — directive resolution every directive wording resolves (issue #321 U68) Starship Type "Ships in conflict (roll twice)" names the two ships under its heading | AssertionError: expected 'Ships in conflict (roll twice)' to be 'Ships in conflict: Corvette — Light a…' // Object.is equality |
| (new) tests/unit/oracleRoller.test.js › rollOracle — directive resolution every directive wording resolves (issue #321 U68) Creature Scale 100 "Ultra-scale" rolls on the registered Ultra-scale table | AssertionError: expected 'Ultra-scale (roll on ultra table)' to be 'Ultra-scale: Colossal (mountain-sized)' // Object.is equality |
| (new) tests/unit/oracleRoller.test.js › rollOracle — directive resolution every directive wording resolves (issue #321 U68) no registered table returns a directive's own words at any roll | AssertionError: expected [ …(13) ] to deeply equal [] |

### e0c64d2 — fix: twenty oracle tables now match the rulebook's data roll for roll (issue #321 U63)

Test files: `tests/unit/oracleTableFidelity.test.js`, `tests/unit/sectorGenerator.test.js`. Source restored: 11 file(s).

- With the fix: 84 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 83 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorGenerator.test.js › rollTableResult — directive handling FAMILY_NAMES is the rulebook's 100 single names — 81 is Duval, 100 is Volkov | AssertionError: expected 'Adler-Bai' to be 'Duval' // Object.is equality |

### 0a8b6b6 — fix: the GM synthesises each narrator clip once when its own playback and a player both ask for it (issue #321 U59)

Test files: `tests/unit/audioSynthesisOnce.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioSynthesisOnce.test.js › the canonical GM synthesises a clip once (issue #321 U59) its own playback first, then a player request for the same clip: one synthesis, one upload | AssertionError: expected "spy" to be called 1 times, but got 2 times |
| (new) tests/unit/audioSynthesisOnce.test.js › the canonical GM synthesises a clip once (issue #321 U59) a player request first, then the GM presses Play: the playback waits for that synthesis | AssertionError: expected "spy" to be called 1 times, but got 2 times |

- New test passing with and without the fix (a control?): tests/unit/audioSynthesisOnce.test.js › the canonical GM synthesises a clip once (issue #321 U59) a failed synthesis is not remembered — the next request tries again

### cc3cc68 — fix: a keyless player plays the narrator clip the GM cached for it, without needing file-browser permission (issue #321 U60)

Test files: `tests/unit/audioKeylessPlayback.test.js`, `tests/unit/nonGmClientPaths.test.js`. Source restored: 1 file(s).

- With the fix: 16 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 12 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioKeylessPlayback.test.js › a keyless player without File Browser permission (issue #321 U60) plays the clip the GM just synthesised and cached for it | AssertionError: expected [ { kind: 'audio.synth.done', …(1) } ] to deeply equal [ { kind: 'audio.synth.done', …(2) } ] |
| (new) tests/unit/nonGmClientPaths.test.js › handleSynthRequest — GM synthesises on a keyless client request synthesises + caches an uncached clip, then signals done with the path it wrote | AssertionError: expected { kind: 'audio.synth.done', …(1) } to deeply equal { kind: 'audio.synth.done', …(2) } |
| (new) tests/unit/nonGmClientPaths.test.js › handleSynthRequest — GM synthesises on a keyless client request skips synthesis when the clip is already cached, but still signals done with its path | AssertionError: expected undefined to be '/worlds/test/audio/abc.mp3' // Object.is equality |
| (new) tests/unit/nonGmClientPaths.test.js › handleSynthRequest — GM synthesises on a keyless client request signals done without synthesising when the GM has no key — no path | AssertionError: expected undefined to be null |

- New test passing with and without the fix (a control?): tests/unit/audioKeylessPlayback.test.js › a keyless player without File Browser permission (issue #321 U60) control — a Trusted Player, who may browse, plays it too
- New test passing with and without the fix (a control?): tests/unit/audioKeylessPlayback.test.js › a keyless player without File Browser permission (issue #321 U60) a done signal naming some other file is not played

### 3c092ef — fix: a refused save of the World Truths journal link leaves the GM's client agreeing with the world (issue #321, U58 shape in the U65 hooks)

Test files: `tests/unit/revisedTruthsLore.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 4 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/revisedTruthsLore.test.js › the truths-journal hooks leave the cached setting alone when the write is refused createJournalEntry | AssertionError: expected { worldTruths: { …(14) }, …(36) } to match object { worldTruthsSet: false, …(1) } |

- New test passing with and without the fix (a control?): tests/unit/revisedTruthsLore.test.js › the truths-journal hooks leave the cached setting alone when the write is refused createJournalEntryPage

### 26baf6c — fix: renaming or editing a sector settlement keeps the Sector Record's list (issue #321 U13)

Test files: `tests/unit/sectorOverview.test.js`. Source restored: 1 file(s).

- With the fix: 17 passed, 0 failed.
- Without it: 11 failed (6 new; 0 only for a missing export); 6 still pass (0 new).
- Verdict: **sensitive** — 11 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorOverview.test.js › buildSettlementsListHtml lists a stored sector record from its map data, each row from the settlement Actor | AssertionError: expected '&lt;!-- sf:settlements-list -->&lt;ul>&lt;/ul>…' to contain '&lt;li>@UUID[Actor.actor-A]{Bleakhold} —…' |
| (new) tests/unit/sectorOverview.test.js › buildSettlementsListHtml shows the Actor's current name, class, population and authority over the generated values | AssertionError: expected '&lt;!-- sf:settlements-list -->&lt;ul>&lt;li>@…' to contain '@UUID[Actor.actor-A]{Bleak Hold Stati…' |
| (new) tests/unit/sectorOverview.test.js › buildSettlementsListHtml keeps a map row whose settlement Actor is gone, as a plain name | AssertionError: expected '&lt;!-- sf:settlements-list -->&lt;ul>&lt;/ul>…' to contain '&lt;li>Lost Haven — Orbital, Pop: , Auth…' |
| tests/unit/sectorOverview.test.js › rewriteSectorOverviewSettlements — surgical replacement replaces the marker-wrapped block when present, preserving the narrator stub | AssertionError: expected '&lt;h2>Sigma Draconis&lt;/h2>\n&lt;p class="na…' to contain '@UUID[Actor.actor-A]{Bleakhold} — Pla…' |
| tests/unit/sectorOverview.test.js › rewriteSectorOverviewSettlements — surgical replacement uses the heuristic &lt;h3>Settlements&lt;/h3>&lt;ul>...&lt;/ul> when no markers exist | AssertionError: expected '&lt;h2>Pelican Reach&lt;/h2>\n&lt;p class="nar…' to contain '@UUID[Actor.actor-B]{Outpost 7}' |
| tests/unit/sectorOverview.test.js › rewriteSectorOverviewSettlements — surgical replacement follows the migrated.toActorId pointer on a legacy journal | AssertionError: expected false to be true // Object.is equality |
| tests/unit/sectorOverview.test.js › rewriteSectorOverviewSettlements — surgical replacement returns false when no rewrite is needed (idempotent) | AssertionError: expected true to be false // Object.is equality |
| tests/unit/sectorOverview.test.js › registerSectorOverviewSync — live updateActor hook rewrites the overview when a settlement actor is renamed | AssertionError: expected '&lt;h3>Settlements&lt;/h3>\n&lt;!-- sf:settlem…' to contain '@UUID[Actor.actor-L]{New Name} — Orbi…' |
| (new) tests/unit/sectorOverview.test.js › registerSectorOverviewSync — live updateActor hook a GM's edit to the Actor's class, population or authority shows in its row | AssertionError: expected '&lt;h3>Settlements&lt;/h3>\n&lt;!-- sf:settlem…' to contain '@UUID[Actor.actor-E]{Hold} — Planetsi…' |
| (new) tests/unit/sectorOverview.test.js › the overview of a sector the creator stored (real generate → store chain) a rewrite of the stored record still lists every settlement | AssertionError: expected '&lt;h2>Forgotten Juncture&lt;/h2>\n&lt;p>&lt;stro…' to contain '@UUID[Actor.9HcasbjW3d16eGCj]{Vega}' |
| (new) tests/unit/sectorOverview.test.js › the overview of a sector the creator stored (real generate → store chain) renaming a settlement Actor (the live updateActor sync) keeps the list, renamed | AssertionError: expected '&lt;h2>Kronos Pyre&lt;/h2>\n&lt;p>&lt;strong>Regi…' to contain '@UUID[Actor.UyUFd8lT4iP63kvq]{Bleak H…' |

### 87e2a28 — fix: !migrate-entities keeps the pages a GM added to a Sector Record (issue #321 U49)

Test files: `tests/unit/entityMigrator.test.js`, `tests/unit/sectorOverview.test.js`. Source restored: 1 file(s).

- With the fix: 49 passed, 0 failed.
- Without it: 5 failed (4 new; 0 only for a missing export); 44 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/entityMigrator.test.js › sector-record overview rewrite (Phase 3.5) rewrites existing overview pages to use UUID links and deletes per-settlement embedded pages | AssertionError: expected true to be undefined |
| (new) tests/unit/sectorOverview.test.js › cleanupSectorRecordPages keeps a page the GM added — its name is no settlement's, or its body is not the generated layout | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) tests/unit/sectorOverview.test.js › cleanupSectorRecordPages keeps a legacy settlement page whose Notes the GM wrote | AssertionError: expected 2 to be +0 // Object.is equality |
| (new) tests/unit/sectorOverview.test.js › cleanupSectorRecordPages deletes nothing when the sector's record is not stored (nothing identifies its settlements) | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/sectorOverview.test.js › the overview of a sector the creator stored (real generate → store chain) !migrate-entities' page cleanup keeps a page the GM added to the sector record | AssertionError: expected 1 to be +0 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/sectorOverview.test.js › cleanupSectorRecordPages deletes the legacy per-settlement pages the old sector creator wrote

### 7f6e838 — fix: a second Create Sector click while a sector is being created does nothing (issue #321 U46)

Test files: `tests/unit/sectorPanel.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorPanel.test.js › Sector Creator wizard — Create Sector runs once a second Create Sector click while the first run is in flight creates nothing more | AssertionError: expected "spy" to be called 1 times, but got 2 times |
| (new) tests/unit/sectorPanel.test.js › Sector Creator wizard — Create Sector runs once holds Create and Re-generate disabled while the creation runs; neither does anything meanwhile | AssertionError: expected '&lt;div class="sf-wizard-body sf-wizard-…' to match /data-action="finalizeSector" disabled/ |
| (new) tests/unit/sectorPanel.test.js › Sector Creator wizard — Create Sector runs once a failed creation releases the guard, so Create can be retried | AssertionError: expected undefined to be false // Object.is equality |
| (new) tests/unit/sectorPanel.test.js › runSectorCreationPipeline — idempotent per sector id a call while the same sector's creation runs joins it: one set of Actors, one Scene, one record | AssertionError: expected { id: 'W9qFHyjX3bEX7Uz7', …(16) } to be { id: 'W9qFHyjX3bEX7Uz7', …(16) } // Object.is equality |
| (new) tests/unit/sectorPanel.test.js › runSectorCreationPipeline — idempotent per sector id a call for a sector already stored returns its record and creates nothing | AssertionError: expected { id: 'EoMmZt53tyB15bkN', …(16) } to deeply equal { id: 'EoMmZt53tyB15bkN', …(16) } |

- New test passing with and without the fix (a control?): tests/unit/sectorPanel.test.js › runSectorCreationPipeline — idempotent per sector id a failed run is not stored, so the same sector can be created again

### 2b40416 — fix: a new sector zooms in on its starting settlement — first look, initial contact, trouble (issue #321 U50)

Test files: `tests/unit/sectorGenerator.test.js`, `tests/unit/sectorPanel.test.js`. Source restored: 3 file(s).

- With the fix: 96 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 90 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorGenerator.test.js › generateSector — zoom in on the starting settlement (step 8) terminus: the starting settlement gets a first look (1–2), an initial contact and a trouble; the others none | AssertionError: expected 0 to be greater than or equal to 1 |
| (new) tests/unit/sectorGenerator.test.js › generateSector — zoom in on the starting settlement (step 8) outlands: the starting settlement gets a first look (1–2), an initial contact and a trouble; the others none | AssertionError: expected 0 to be greater than or equal to 1 |
| (new) tests/unit/sectorGenerator.test.js › generateSector — zoom in on the starting settlement (step 8) expanse: the starting settlement gets a first look (1–2), an initial contact and a trouble; the others none | AssertionError: expected 0 to be greater than or equal to 1 |
| (new) tests/unit/sectorGenerator.test.js › generateSector — zoom in on the starting settlement (step 8) rides onto the starting settlement's Actor and reaches the narrator's settlement card | AssertionError: expected '' to be undefined // Object.is equality |
| (new) tests/unit/sectorGenerator.test.js › generateSector — zoom in on the starting settlement (step 8) the narrator stub prompt for the starting settlement carries its first look and initial contact | AssertionError: expected 'You are the narrator for an Ironsworn…' to contain 'First look: ' |
| (new) tests/unit/sectorPanel.test.js › Sector Creator wizard — the starting settlement's zoom-in (issue #321 U50) previews the starting settlement's first look, initial contact and trouble, on its entry only | AssertionError: expected '&lt;div class="sf-wizard-body sf-wizard-…' to contain '🔍 Starting settlement — First look: …' |

### 5ff101f — fix: the narrator knows the planet and star beside each sector settlement (issue #321 U51)

Test files: `tests/unit/narratorPrompt.test.js`, `tests/unit/sectorContext.test.js`, `tests/unit/sectorPlanetsNarrator.test.js`. Source restored: 2 file(s).

- With the fix: 168 passed, 0 failed.
- Without it: 6 failed (6 new; 1 only for a missing export); 162 still pass (0 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narratorPrompt.test.js › formatEntityCard — a sector settlement's planet and star shows the rolled planet as "Name (Type)" and the stellar object | AssertionError: expected '## BLEAKHOLD — Settlement\n\nESTABLIS…' to contain '  Planet: Vorn Prime (Desert World)' |
| (new) tests/unit/narratorPrompt.test.js › formatEntityCard — a sector settlement's planet and star omits the Planet line for a deep-space settlement (no planet rolled) | AssertionError: expected '## BLEAKHOLD — Settlement\n\nESTABLIS…' to contain '  Stellar object: Red star' |
| (new) (API) tests/unit/narratorPrompt.test.js › formatSettlementPlanet renders a rolled planet record, a bare string, and nothing | TypeError: (0 , formatSettlementPlanet) is not a function |
| (new) tests/unit/sectorContext.test.js › formatActiveSector — sector cast & attributes (PLAYTEST-1712 T) names each settlement's rolled planet and stellar object — the world and star pinned beside it on the map (issue #321 U51) | AssertionError: expected 'Active sector: Igneous Maze\nRegion: …' to contain '- Hypatia (Authority: Corrupt; Troubl…' |
| (new) tests/unit/sectorPlanetsNarrator.test.js › a generated sector's planets and stars reach the narrator the active sector roster and the settlement's card name its rolled planet and stellar object | AssertionError: expected '- Glimmer (Authority: Tolerant; Troub…' to contain 'Planet: Ulven Alpha (Furnace World)' |
| (new) tests/unit/sectorPlanetsNarrator.test.js › a generated sector's planets and stars reach the narrator a deep-space settlement names its stellar object and no planet | AssertionError: expected '- Solitude (Authority: None / lawless…' to contain 'Stellar object: Blazing blue star' |

### 5f74fcb — fix: a site named exactly is that site or none, the active sector's first (issue #321 U48)

Test files: `tests/unit/precursorSites.test.js`, `tests/unit/siteDiscovery.test.js`. Source restored: 1 file(s).

- With the fix: 52 passed, 0 failed.
- Without it: 8 failed (8 new; 0 only for a missing export); 44 still pass (1 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/precursorSites.test.js › selectSectorSite — generated names (issue #321 U48) an exact name in the active sector beats a same-named site in an older sector | AssertionError: expected 'sector-A' to be 'sector-B' // Object.is equality |
| (new) tests/unit/precursorSites.test.js › selectSectorSite — generated names (issue #321 U48) a generic type label is settled by the active sector, not the oldest sector | AssertionError: expected 'sector-A' to be 'sector-B' // Object.is equality |
| (new) tests/unit/precursorSites.test.js › selectSectorSite — generated names (issue #321 U48) an exact name for an already-charted site never falls through to its numbered sibling | AssertionError: expected { …(2) } to be null |
| (new) tests/unit/precursorSites.test.js › selectSectorSite — generated names (issue #321 U48) an expedition to an already-charted vault is not linked to a different undiscovered vault | AssertionError: expected { …(2) } to be null |
| (new) tests/unit/precursorSites.test.js › selectSectorSite — generated names (issue #321 U48) an active-sector namesake that no longer qualifies settles the name — nothing, not another sector's | AssertionError: expected { …(2) } to be null |
| (new) tests/unit/precursorSites.test.js › selectSectorSite — generated names (issue #321 U48) a site link to a site that no longer qualifies returns nothing — no guess by name | AssertionError: expected { id: 'v2', …(3) } to be null |
| (new) tests/unit/precursorSites.test.js › selectSectorSite — generated names (issue #321 U48) clearing by the exact name of a site not yet discovered clears nothing | AssertionError: expected { id: 'v2', …(4) } to be null |
| (new) tests/unit/siteDiscovery.test.js › revealSectorSite — stored siteId link (expedition→site FK) reveals nothing when the linked site is already discovered — not another site by label | AssertionError: expected { sector: { id: 'sec', …(2) }, …(1) } to be null |

- New test passing with and without the fix (a control?): tests/unit/siteDiscovery.test.js › revealSectorSite — stored siteId link (expedition→site FK) falls back to the label when the link names no stored site

### ec8fe0a — fix: creating another sector no longer moves the ship onto its map (issue #321 U47)

Test files: `tests/unit/sectorSceneBuilder.test.js`. Source restored: 1 file(s).

- With the fix: 21 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 20 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorSceneBuilder.test.js › placeCommandVehicleTokenIfPresent — a ship already somewhere is not moved (issue #321 U47) creating a second sector leaves the ship where it is; the new map still gets its token | AssertionError: expected undefined to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/sectorSceneBuilder.test.js › placeCommandVehicleTokenIfPresent — a ship already somewhere is not moved (issue #321 U47) a ship with no position yet is placed as a position statement — the new map grounds where it is

### 804d44f — fix: dropping the ship on a settlement pin arrives at that settlement, renamed or not (issue #321 U52)

Test files: `tests/unit/sectorSceneHooks.test.js`, `tests/unit/shipPosition.test.js`, `tests/unit/tokenDragArrival.test.js`. Source restored: 4 file(s).

- With the fix: 93 passed, 0 failed.
- Without it: 11 failed (10 new; 6 only for a missing export); 82 still pass (0 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/sectorSceneHooks.test.js › handleCommandVehicleTokenDrag returns false (cancels drag) and dispatches set_a_course when drop is near a settlement | AssertionError: expected { sceneId: 'scene1', …(6) } to deeply equal { sceneId: 'scene1', …(3) } |
| (new) tests/unit/sectorSceneHooks.test.js › handleCommandVehicleTokenDrag names the pin's settlement Actor — its current name, and its id for the arrival (issue #321 U52) | AssertionError: expected 'I set a course for Bleakhold.' to be 'I set a course for Bleak Hold Station.' // Object.is equality |
| (new) tests/unit/sectorSceneHooks.test.js › dropping the ship on a renamed settlement pin sets a course for the settlement the pin links, by its current name | TypeError: Cannot read properties of undefined (reading 'flags') |
| (new) (API) tests/unit/sectorSceneHooks.test.js › handleSettlementPinRename — a pin label follows its settlement Actor (issue #321 U52) renames the settlement's own pins on every sector scene — not its planet, star or site pins | TypeError: (0 , handleSettlementPinRename) is not a function |
| (new) (API) tests/unit/sectorSceneHooks.test.js › handleSettlementPinRename — a pin label follows its settlement Actor (issue #321 U52) ignores updates without a rename, non-location actors and non-sector scenes | TypeError: (0 , handleSettlementPinRename) is not a function |
| (new) (API) tests/unit/sectorSceneHooks.test.js › handleSettlementPinRename — a pin label follows its settlement Actor (issue #321 U52) leaves the shared Notes to the canonical GM — a player's client does not write them | TypeError: (0 , handleSettlementPinRename) is not a function |
| (new) tests/unit/sectorSceneHooks.test.js › handleSettlementPinRename — a pin label follows its settlement Actor (issue #321 U52) is registered on updateActor | AssertionError: the given combination of arguments (undefined and undefined) is invalid for this assertion. You can use an array, a map, an object, a set, a str |
| (new) (API) tests/unit/shipPosition.test.js › inferShipPositionFromEntityId — arrival by the destination's id records the settlement the id names, in its own sector — not a namesake the name finds first | TypeError: (0 , inferShipPositionFromEntityId) is not a function |
| (new) (API) tests/unit/shipPosition.test.js › inferShipPositionFromEntityId — arrival by the destination's id resolves the planet a settlement belongs to, as the name path does | TypeError: (0 , inferShipPositionFromEntityId) is not a function |
| (new) (API) tests/unit/shipPosition.test.js › inferShipPositionFromEntityId — arrival by the destination's id a planet or a location id records that place; anything else is null (the name decides) | TypeError: (0 , inferShipPositionFromEntityId) is not a function |
| (new) tests/unit/tokenDragArrival.test.js › a Set a Course started by dropping the ship on a sector pin arrives at the pin's settlement — the ship's position and the current location — not a namesake | AssertionError: expected 'actor-old-bleak' to be 'actor-new-bleak' // Object.is equality |

### eb22041 — fix: a ship token parked near a settlement, or auto-placed, reads "near" it, not "docked at" (issue #321 U53)

Test files: `tests/unit/sectorSceneHooks.test.js`, `tests/unit/shipPosition.test.js`. Source restored: 3 file(s).

- With the fix: 95 passed, 0 failed.
- Without it: 5 failed (2 new; 0 only for a missing export); 90 still pass (2 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/sectorSceneHooks.test.js › computeTokenPositionRecord associates with the nearest settlement pin and prefers its actorId | AssertionError: expected 'scene_token' to be 'token_placement' // Object.is equality |
| tests/unit/sectorSceneHooks.test.js › computeTokenPositionRecord records honest deep space when no pin is within the near radius | AssertionError: expected 'scene_token' to be 'token_placement' // Object.is equality |
| (new) tests/unit/sectorSceneHooks.test.js › a token parked off a settlement pin reads 'near' it two cells off the pin — outside the snap radius, inside the near radius | AssertionError: expected 'SHIP POSITION: Wayfarer docked at Ble…' to be 'SHIP POSITION: Wayfarer near Bleakhol…' // Object.is equality |
| (new) tests/unit/sectorSceneHooks.test.js › a token parked off a settlement pin reads 'near' it auto-placed on the map (a new ship, no position yet) — the placement is recorded as near | AssertionError: expected 'SHIP POSITION: Wayfarer docked at Ble…' to contain 'near Bleakhold' |
| tests/unit/sectorSceneHooks.test.js › token placement / reposition → position record write placement on a sector scene writes the position from the token coords | AssertionError: expected 'scene_token' to be 'token_placement' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/shipPosition.test.js › formatShipPositionLine — mobility status (Finding L) scene_token source (the Set a Course a token dropped ON a pin starts — an arrival) → "docked at" phrasing
- New test passing with and without the fix (a control?): tests/unit/shipPosition.test.js › formatShipPositionLine — mobility status (Finding L) token_placement source (the token's own place on the map) → "near" phrasing

### 568964e — fix: with Ship Positioning or Auto-Move off, dragging the ship onto a pin just moves it (issue #321 U54)

Test files: `tests/unit/sectorSceneHooks.test.js`. Source restored: 2 file(s).

- With the fix: 52 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 49 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorSceneHooks.test.js › handleCommandVehicleTokenDrag with Ship Positioning off, a drop on a pin is a plain token move — nothing is cancelled or rolled | AssertionError: expected false to be undefined |
| (new) tests/unit/sectorSceneHooks.test.js › handleCommandVehicleTokenDrag with Auto-Move Ship on Set a Course off, a drop on a pin is a plain token move — nothing is cancelled or rolled | AssertionError: expected false to be undefined |
| (new) tests/unit/sectorSceneHooks.test.js › token placement / reposition → position record write with Auto-Move off, a drop onto a pin lands as a position note — near it, no roll (issue #321 U54) | AssertionError: expected false to be undefined |

### 7f48b53 — fix: !lore keeps what lands during its Claude call, and a move keeps the new recap (issue #321 U06a, U06g)

Test files: `tests/unit/loreRecapMoveMerge.test.js`, `tests/unit/loreRecapStaleWrite.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/loreRecapMoveMerge.test.js › persistResolution keeps a lore recap written while the move resolved !lore during a move: the recap survives the move's persist | AssertionError: expected '' to match /Forge forgives nothing/ |
| (new) tests/unit/loreRecapStaleWrite.test.js › !lore does not revert writes that land during its Claude call a player's X-Card played while the GM's !lore recap generates stays in force | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/loreRecapStaleWrite.test.js › !lore does not revert writes that land during its Claude call !lore typed while a player's move holds the lock does not resurrect the lock after the move releases it | AssertionError: expected true to be false // Object.is equality |

### 71182f0 — fix: !truth and !state write only what they changed, onto the store as it is then (issue #321 U06b)

Test files: `tests/unit/factCommandStaleWrite.test.js`. Source restored: 3 file(s).

- With the fix: 10 passed, 0 failed.
- Without it: 8 failed (8 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/factCommandStaleWrite.test.js › !truth strike on the canonical GM does not revert an X-Card that lands while the strike propagates | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/factCommandStaleWrite.test.js › !truth strike on the canonical GM does not re-take a move lock released while the strike propagates | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/factCommandStaleWrite.test.js › !truth strike on the canonical GM keeps a narration's truth that lands while the strike propagates | AssertionError: expected [ [ 'tr-dock0001', true ] ] to deeply equal [ [ 'tr-dock0001', true ], …(1) ] |
| (new) tests/unit/factCommandStaleWrite.test.js › !truth strike on the canonical GM marks the stored rolling summary for a regen — a summary regenerated meanwhile keeps its text | AssertionError: expected { text: 'Old summary.', …(3) } to match object { text: 'Newer summary.', …(1) } |
| (new) tests/unit/factCommandStaleWrite.test.js › !truth strike on the canonical GM writes nothing when the strike matches no truth | AssertionError: expected [ [ 'starforged-companion', …(2) ] ] to deeply equal [] |
| (new) tests/unit/factCommandStaleWrite.test.js › !truth strike on the canonical GM does not change the cached setting value before its own write | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/factCommandStaleWrite.test.js › persistSceneLedgerFields — a further owned change (opts.onto) makes the change on the latest store, in the same write as the merged ledgers | AssertionError: expected { currentSceneId: 'sc-1', …(3) } to match object { premise: 'new', xCardActive: true } |
| (new) tests/unit/factCommandStaleWrite.test.js › persistSceneLedgerFields — a further owned change (opts.onto) still writes the change when the scene changed meanwhile, but not the ledgers | AssertionError: expected { currentSceneId: 'sc-2', …(2) } to match object { currentSceneId: 'sc-2', …(2) } |

- New test passing with and without the fix (a control?): tests/unit/factCommandStaleWrite.test.js › !state set on the canonical GM writes the state ledger onto the latest store and nothing it did not change
- New test passing with and without the fix (a control?): tests/unit/factCommandStaleWrite.test.js › persistSceneLedgerFields — a further owned change (opts.onto) writes nothing when the scene changed and there is no further change

### 88c55a1 — fix: !reveal-site and !clear-site keep what lands while they await (issue #321 U06c)

Test files: `tests/unit/siteDiscoveryStaleWrite.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/siteDiscoveryStaleWrite.test.js › !reveal-site / !clear-site write onto the state as it is after their awaits !reveal-site keeps an X-Card that lands while it awaits the location write | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/siteDiscoveryStaleWrite.test.js › !reveal-site / !clear-site write onto the state as it is after their awaits !clear-site keeps an X-Card that lands while it awaits the location write | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/siteDiscoveryStaleWrite.test.js › !reveal-site / !clear-site write onto the state as it is after their awaits finds the site by id when the stored state was replaced meanwhile, keeping the other writer's change | AssertionError: expected undefined to match object { value: 1 } |
| (new) tests/unit/siteDiscoveryStaleWrite.test.js › !reveal-site / !clear-site write onto the state as it is after their awaits writes nothing when the site is no longer stored | AssertionError: expected [ { id: 's1', name: 'Sector', …(2) } ] to deeply equal [] |

- New test passing with and without the fix (a control?): tests/unit/siteDiscoveryStaleWrite.test.js › !reveal-site / !clear-site write onto the state as it is after their awaits control: the expedition path's working copy still carries the flag

### 3974061 — fix: the inciting premise no longer reverts writes relayed during its narration (issue #321 U06d)

Test files: `tests/unit/incitingPremiseStaleWrite.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/incitingPremiseStaleWrite.test.js › the inciting premise persist keeps a Private Lines sync and a safety flag relayed during the inciting narration | AssertionError: expected [] to deeply equal [ { playerId: 'pl-1', …(1) } ] |
| (new) tests/unit/incitingPremiseStaleWrite.test.js › the inciting premise persist carries the narration's scene ledgers when the sidecar's own persist has not landed yet | AssertionError: expected [] to deeply equal [ 'body horror' ] |

### 97a2b8f — fix: the correction dialog corrects the store as it is at each click (issue #321 U06e)

Test files: `tests/unit/correctionDialogStaleWrite.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog a Strike clicked after other writes landed does not revert them | AssertionError: X-Card played while the dialog was open: expected false to be true // Object.is equality |
| (new) tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog a Replace reads the store after its prompt closes, keeping what landed while it was open | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog a cancelled Replace writes nothing | AssertionError: expected [ [ 'starforged-companion', …(2) ] ] to deeply equal [] |
| (new) tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog a state Strike after a released move lock does not re-take it | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog re-renders from the store after an action, listing a truth recorded since it opened | AssertionError: expected '&lt;h4>State&lt;/h4>&lt;ul class="sf-correct-l…' to contain 'Carries a Covenant signet' |

### 2d15c73 — fix: a narration from an older snapshot continues the scene in progress (issue #321 U06f)

Test files: `tests/unit/startSceneAdoption.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/startSceneAdoption.test.js › startScene from a snapshot older than the live scene does not wipe the scene another narration started meanwhile | AssertionError: expected 'sc-5c2a2c73' to be 'sc-live' // Object.is equality |
| (new) tests/unit/startSceneAdoption.test.js › startScene from a snapshot older than the live scene adopts the live scene into the caller's copy, as a copy, and writes nothing | AssertionError: expected "set" to not be called at all, but actually been called 1 times |
| (new) tests/unit/startSceneAdoption.test.js › startScene from a snapshot older than the live scene a paced narration from a stale snapshot records its facts in the live scene | AssertionError: expected 'sc-36d5d62b' to be 'sc-live' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/startSceneAdoption.test.js › startScene from a snapshot older than the live scene control: a caller holding the active scene still ends it and starts a new one

### 632b047 — fix: a move's narration honours safety settings and oracle results added while it waited (issue #321 U08)

Test files: `tests/unit/moveNarrationStaleSnapshot.test.js`, `tests/unit/narratorLiveSafety.test.js`. Source restored: 2 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/moveNarrationStaleSnapshot.test.js › move narration reads safety and oracle results live, not from its pre-dialog snapshot a Private Line that lands while the move sits at its confirm dialog is a hard stop in that narration | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to match /### PRIVATE LINES[^\n]*\n- spiders/ |
| (new) tests/unit/moveNarrationStaleSnapshot.test.js › move narration reads safety and oracle results live, not from its pre-dialog snapshot an !oracle answer a table-mate gets while the move sits at its confirm dialog is in that narration | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to contain '## RECENT ORACLE RESULTS' |
| (new) tests/unit/narratorLiveSafety.test.js › buildNarratorExtras reads safety and recent oracles live takes Lines, Veils and Private Lines from the store, not the snapshot | AssertionError: expected undefined to deeply equal { …(3) } |
| (new) tests/unit/narratorLiveSafety.test.js › buildNarratorExtras reads safety and recent oracles live takes the session's recent oracle results from the store | AssertionError: expected [] to deeply equal [ { name: 'Ask the Oracle', …(2) } ] |
| (new) tests/unit/narratorLiveSafety.test.js › buildNarratorExtras reads safety and recent oracles live falls back to the caller's copy when nothing is stored | AssertionError: expected undefined to deeply equal { lines: [ 'old line' ], …(2) } |
| (new) tests/unit/narratorLiveSafety.test.js › buildNarratorSystemPrompt renders the live safety block prefers extras.safety over the snapshot's | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to match /### LINES[^\n]*\n- new line/ |

### b8c6cd9 — fix: a "narration unavailable" card is no longer fed back to the narrator (issue #321 U35)

Test files: `tests/unit/narratorFallback.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 3 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narratorFallback.test.js › a fallback card is not narrator memory (issue #321 U35) the "narration unavailable" line never reaches the recent-narration ring | AssertionError: expected 'Face Danger: Strong Hit — narration u…' not to contain 'narration unavailable' |
| (new) tests/unit/narratorFallback.test.js › a fallback card is not narrator memory (issue #321 U35) a failed first narration does not cost the session its campaign recap | AssertionError: expected '' to contain 'beacon at Bleakhold' |

### e2c62f4 — fix: oracle follow-ups, vignettes and vow scenes record their facts in a scene (issue #321 U34)

Test files: `tests/unit/sidecarScenePaths.test.js`, `tests/unit/sidecarWithoutScene.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sidecarScenePaths.test.js › sidecar-writing narrations open a scene first a session vignette | AssertionError: expected 'object' to be 'string' // Object.is equality |
| (new) tests/unit/sidecarScenePaths.test.js › sidecar-writing narrations open a scene first a clock vignette | AssertionError: expected 'object' to be 'string' // Object.is equality |
| (new) tests/unit/sidecarScenePaths.test.js › sidecar-writing narrations open a scene first a vow-swearing scene | AssertionError: expected 'object' to be 'string' // Object.is equality |
| (new) tests/unit/sidecarScenePaths.test.js › sidecar-writing narrations open a scene first continues a scene that is already open instead of starting another | AssertionError: expected [] to deeply equal [ [ …(2) ] ] |
| (new) tests/unit/sidecarWithoutScene.test.js › an oracle follow-up narrated with no scene open keeps what it established the first move after it still sees the frame and Teo's whereabouts | AssertionError: expected 'object' to be 'string' // Object.is equality |
| (new) tests/unit/sidecarWithoutScene.test.js › the move continues the scene the follow-up started | AssertionError: expected 'sc-65d98b89' to be null // Object.is equality |

### b80b4ec — fix: an X-Carded narration leaves narrator memory, and the next narration redirects (issue #321 U07)

Test files: `tests/unit/narrationIdCards.test.js`, `tests/unit/xcardNarratorMemory.test.js`, `tests/unit/xcardNarratorMemoryTable.test.js`. Source restored: 15 file(s).

- With the fix: 22 passed, 0 failed.
- Without it: 21 failed (21 new; 4 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 17 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narrationIdCards.test.js › a narrator card posted by its caller carries its narration id the Begin a Session galley vignette | AssertionError: expected 'undefined' to be 'string' // Object.is equality |
| (new) tests/unit/narrationIdCards.test.js › a narrator card posted by its caller carries its narration id a `!clock advance` vignette | AssertionError: expected 'undefined' to be 'string' // Object.is equality |
| (new) tests/unit/narrationIdCards.test.js › a narrator card posted by its caller carries its narration id Pay the Price's trigger vignette | AssertionError: expected 'undefined' to be 'string' // Object.is equality |
| (new) tests/unit/narrationIdCards.test.js › a narrator card posted by its caller carries its narration id the inciting incident | AssertionError: expected 'undefined' to be 'string' // Object.is equality |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory after the X-Card is played and resumed, the X-carded narration is not in the next narration's RECENT SCENE | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory retracts what its sidecar wrote — and only that: an earlier narration's facts stay | AssertionError: expected { id: 'tr-e607828c', …(14) } to match object { retracted: true, …(1) } |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory names a removed fact nowhere — not even as a correction — and still blocks its re-assertion | AssertionError: expected '## ACTIVE SCENE — BINDING TRUTHS AND …' not to match /cutting torch\|burned hand\|interrogati…/ |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory a move resolving from a snapshot read before the X-Card does not bring its state or frame back | AssertionError: expected [ { attribute: 'condition', …(2) } ] to be undefined |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory a relayed sidecar of the removed narration that arrives late is dropped | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory drops the rolling summary's text when it covered the narration | AssertionError: expected { …(3) } to match object { text: '', coveredCount: +0 } |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory the session recap counts the move but does not quote the removed narration | AssertionError: expected '&lt;div class="sf-recap-session-card">\n…' not to contain 'cutting torch' |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory a removed narration shows no audio Play button | AssertionError: expected false to be true // Object.is equality |
| (new) (API) tests/unit/xcardNarratorMemory.test.js › the X-Card's redirect the first narration after a GM resumes carries it; once a narration has posted it is cleared | TypeError: registerXCardRedirectHook is not a function |
| (new) (API) tests/unit/xcardNarratorMemory.test.js › the X-Card's redirect is not cleared while the X-Card is still active | TypeError: registerXCardRedirectHook is not a function |
| (new) tests/unit/xcardNarratorMemory.test.js › the X-Card's redirect is never rendered in a recap | AssertionError: expected undefined to be false // Object.is equality |
| (new) tests/unit/xcardNarratorMemory.test.js › which cards an X-Card removes the newest narration and the cards posted with it, back to the last message someone sent | AssertionError: expected [] to deeply equal [ 'The torch flares.', …(1) ] |
| (new) (API) tests/unit/xcardNarratorMemory.test.js › which cards an X-Card removes a card more than two minutes older than the newest is not in its beat | TypeError: xCardedNarrationCards is not a function |
| (new) tests/unit/xcardNarratorMemory.test.js › which cards an X-Card removes played again before anything new is narrated, it removes nothing more | AssertionError: expected [] to deeply equal [ 'The torch flares.' ] |
| (new) tests/unit/xcardNarratorMemory.test.js › which cards an X-Card removes after a GM resumes, the next X-Card removes the new narration and does not reach past the resume | AssertionError: expected [] to deeply equal [ 'The torch flares.', …(1) ] |
| (new) (API) tests/unit/xcardNarratorMemory.test.js › which cards an X-Card removes never chooses a fallback or a whispered card | TypeError: xCardedNarrationCards is not a function |
| (new) tests/unit/xcardNarratorMemoryTable.test.js › an X-Card on a move narration, end to end removes the beat from what the next narration reads, redirects it once, and the beat stays out | AssertionError: expected [ undefined ] to deeply equal [ true ] |

- New test passing with and without the fix (a control?): tests/unit/xcardNarratorMemory.test.js › the X-carded narration leaves narrator memory control: keeps a rolling summary made before the narration it removes

### 160fd80 — fix: the correction dialog's Strike and Replace buttons are wired the way Foundry v13 offers (issue #321 U38)

Test files: `tests/unit/correctionDialogStaleWrite.test.js`, `tests/unit/correctionDialogWiring.test.js`. Source restored: 1 file(s).

- With the fix: 9 passed, 0 failed.
- Without it: 8 failed (4 new; 0 only for a missing export); 1 still pass (0 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog a Strike clicked after other writes landed does not revert them | AssertionError: expected false to be true // Object.is equality |
| tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog a Replace reads the store after its prompt closes, keeping what landed while it was open | AssertionError: expected { id: 'tr-aaaa0001', …(14) } to match object { retracted: true } |
| tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog a state Strike after a released move lock does not re-take it | AssertionError: expected [ { attribute: 'location', …(2) } ] to be undefined |
| tests/unit/correctionDialogStaleWrite.test.js › Correct Active Scene Facts dialog re-renders from the store after an action, listing a truth recorded since it opened | AssertionError: expected '&lt;h4>Truths&lt;/h4>&lt;ul class="sf-correct-…' to contain 'Carries a Covenant signet' |
| (new) tests/unit/correctionDialogWiring.test.js › the correction dialog wiring a Strike clicked in a dialog that only fires its "render" event strikes the truth | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/correctionDialogWiring.test.js › the correction dialog wiring does not rely on a `render` constructor option, which only DialogV2.wait() reads | AssertionError: expected { …(6) } to not have property "render" |
| (new) tests/unit/correctionDialogWiring.test.js › the correction dialog wiring the row buttons do not submit the dialog's form | AssertionError: strike-truth: expected 'submit' to be 'button' // Object.is equality |
| (new) tests/unit/correctionDialogWiring.test.js › the correction dialog wiring stays wired after a correction re-renders the list | AssertionError: expected [ { attribute: 'location', …(2) } ] to be undefined |

### aba6885 — fix: a bonded Develop Your Relationship pays its weak hit +2 momentum on both paths (issue #322 V01)

Test files: `tests/unit/bondCommand.test.js`, `tests/unit/connectionPickerTarget.test.js`, `tests/unit/developRelationship.test.js`, `tests/unit/resolver.test.js`. Source restored: 4 file(s).

- With the fix: 385 passed, 0 failed.
- Without it: 31 failed (22 new; 3 only for a missing export); 354 still pass (3 new).
- Verdict: **sensitive** — 28 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/bondCommand.test.js › handleBondCommand — author client posts the card and relays a strong hit's legacy ticks to the GM (player client) | AssertionError: expected { ticksOnBonds: 2, …(5) } to match object { outcome: 'strong_hit', …(3) } |
| tests/unit/bondCommand.test.js › handleBondCommand — author client credits a weak hit's momentum to the speaking PC, not the first PC | AssertionError: expected { ticksOnBonds: +0, …(5) } to match object { Object (outcome, actorId) } |
| tests/unit/bondCommand.test.js › handleBondCommand — author client the roller's negative momentum cancels a matching action die | AssertionError: expected { ticksOnBonds: +0, …(5) } to match object { Object (outcome, actorId) } |
| (new) tests/unit/bondCommand.test.js › handleBondCommand — author client a strong hit with a match relays the rank raise with the target host id | AssertionError: expected { ticksOnBonds: 2, …(5) } to match object { outcome: 'strong_hit', …(3) } |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler pays a strong hit's bonds legacy ticks from the shared table | TypeError: Cannot read properties of undefined (reading 'ticks') |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler gives a weak hit's +2 momentum to the relayed roller, and no ticks | AssertionError: expected false to be true // Object.is equality |
| tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler falls back to the first PC when the roller is unknown (GM requester) | AssertionError: expected false to be true // Object.is equality |
| tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler refuses momentum for a PC the requester does not own | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler effects named in the payload are ignored: the outcome is paid from the table | TypeError: Cannot read properties of undefined (reading 'ticks') |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler refuses a payload whose outcome is not a roll result: {"ticksOnBonds":2} | AssertionError: expected { applied: true } to deeply equal { applied: false, reason: 'invalid' } |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler refuses a payload whose outcome is not a roll result: {"outcome":"great_hit"} | AssertionError: expected { applied: false } to deeply equal { applied: false, reason: 'invalid' } |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler refuses a payload whose outcome is not a roll result: {"outcome":"toString"} | AssertionError: expected { applied: false } to deeply equal { applied: false, reason: 'invalid' } |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler refuses a payload whose outcome is not a roll result: {"outcome":null,"momentumChange":2,"actorId":"pc-a"} | AssertionError: expected { applied: true } to deeply equal { applied: false, reason: 'invalid' } |
| tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler refuses a rank raise that skips a rank (not the connection's next rank) | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler a non-boolean match is not a match: no raise | TypeError: Cannot read properties of undefined (reading 'ticks') |
| (new) tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler raises the connection rank on a strong hit with a match | AssertionError: expected "spy" to be called with arguments: [ 'conn-1', { rank: 'formidable' } ] |
| tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler mirrors the rank onto the Item keyed by the record's _id — renamed or not — and leaves a same-named sibling's Item alone | AssertionError: expected 'dangerous' to be 'formidable' // Object.is equality |
| tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler refuses a malformed rank raise with a warning | AssertionError: expected false to be true // Object.is equality |
| tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) typed: the named bonded connection is resolved before the dice and rolled +rank | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) Test Your Relationship's weak hit with a bonded connection: +2 momentum to the roller, no tick | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/connectionPickerTarget.test.js › Develop Your Relationship with a bonded connection rolls +rank (issue #314 Q06) parity with `!bond` on a weak hit: both pay +2 momentum to the roller, and no tick | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/developRelationship.test.js › planDevelopRelationship bonded → bond-legacy: strong 2 ticks, weak +2 momentum, miss nothing | AssertionError: expected { action: 'bond-legacy', …(4) } to match object { action: 'bond-legacy', …(2) } |
| (new) tests/unit/developRelationship.test.js › planDevelopRelationship bonded + match on a WEAK hit → no rank raise, the +2 momentum alone | AssertionError: expected { action: 'bond-legacy', …(4) } to match object { raiseRank: false, …(3) } |
| (new) tests/unit/developRelationship.test.js › planDevelopRelationship an epic bond's strong hit with a match raises nothing — already epic | AssertionError: expected { action: 'bond-legacy', …(4) } to match object { ticks: 2, raiseRank: false, …(1) } |
| (new) tests/unit/developRelationship.test.js › constants BONDED_DEVELOP_OUTCOMES is the move's text: strong 2 ticks / weak +2 momentum / miss nothing | AssertionError: expected undefined to deeply equal { Object (strong_hit, weak_hit, ...) } |
| (new) (API) tests/unit/developRelationship.test.js › bondedDevelopOutcome pays each roll result its row, and raises the rank on a strong hit with a match only | TypeError: (0 , bondedDevelopOutcome) is not a function |
| (new) (API) tests/unit/developRelationship.test.js › bondedDevelopOutcome anything that is not a roll result is null — no row to pay | TypeError: (0 , bondedDevelopOutcome) is not a function |
| (new) (API) tests/unit/developRelationship.test.js › bondedDevelopOutcome a truthy non-boolean match is not a match | TypeError: (0 , bondedDevelopOutcome) is not a function |
| (new) tests/unit/resolver.test.js › mapConsequences — full handler coverage develop_your_relationship:weak_hit returns a complete consequences object | AssertionError: expected 'Develop the relationship: mark connec…' to match /\+2 momentum/i |
| (new) tests/unit/resolver.test.js › mapConsequences — full handler coverage develop_your_relationship:miss returns a complete consequences object | AssertionError: expected 'Develop the relationship: mark connec…' to match /no lasting benefit/i |
| (new) tests/unit/resolver.test.js › CONSEQUENCE_MAP — sufferPrompt shape (F16 Phase B) develop_your_relationship: a bonded weak hit takes +2 momentum; no other result does | AssertionError: expected +0 to be 2 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler a miss pays nothing
- New test passing with and without the fix (a control?): tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler a weak hit raises no rank, whatever the payload says
- New test passing with and without the fix (a control?): tests/unit/developRelationship.test.js › planDevelopRelationship bonded + match on a strong hit → raiseRank with newRank one step up

### 5c3e769 — fix: "+1 on your next move" is added to the roller's next action roll (issue #322 V02)

Test files: `tests/unit/moveRules.test.js`, `tests/unit/nextMoveBonus.test.js`. Source restored: 5 file(s).

- With the fix: 23 passed, 0 failed.
- Without it: 12 failed (12 new; 6 only for a missing export); 11 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/moveRules.test.js › Secure an Advantage's weak hit — the choice carries the momentum (SAA-WEAK-DOUBLE-MOMENTUM) +1 on your next move: the momentum stays at 2, and the +1 is the roller's for their next roll | AssertionError: expected undefined to be 1 // Object.is equality |
| (new) (API) tests/unit/nextMoveBonus.test.js › grantNextMoveBonus / consumeNextMoveBonus a grant is the character's own: their next action roll takes it, once | TypeError: grantNextMoveBonus is not a function |
| (new) (API) tests/unit/nextMoveBonus.test.js › grantNextMoveBonus / consumeNextMoveBonus a progress or no-roll move leaves it pending | TypeError: grantNextMoveBonus is not a function |
| (new) (API) tests/unit/nextMoveBonus.test.js › grantNextMoveBonus / consumeNextMoveBonus two pending grants add up | TypeError: grantNextMoveBonus is not a function |
| (new) (API) tests/unit/nextMoveBonus.test.js › grantNextMoveBonus / consumeNextMoveBonus no character or no amount grants nothing | TypeError: grantNextMoveBonus is not a function |
| (new) (API) tests/unit/nextMoveBonus.test.js › grantNextMoveBonus / consumeNextMoveBonus a claim the world refuses adds nothing and stays pending — never added twice | TypeError: grantNextMoveBonus is not a function |
| (new) (API) tests/unit/nextMoveBonus.test.js › grantNextMoveBonus / consumeNextMoveBonus keeps what else is in the store, written meanwhile | TypeError: grantNextMoveBonus is not a function |
| (new) tests/unit/nextMoveBonus.test.js › NEXT-MOVE-BONUS-DEAD — the pick and the strong hit Secure an Advantage weak hit: picking '+1 on your next move' adds +1 to the next action roll | AssertionError: expected '&lt;div class="sf-card sf-card--suffer-d…' to match /Added to Kira&#39;s next action roll\|…/ |
| (new) tests/unit/nextMoveBonus.test.js › NEXT-MOVE-BONUS-DEAD — the pick and the strong hit Secure an Advantage strong hit ('take both') schedules the +1 as well as the +2 momentum | AssertionError: expected undefined to be 1 // Object.is equality |
| (new) tests/unit/nextMoveBonus.test.js › NEXT-MOVE-BONUS-DEAD — the pick and the strong hit a pick whose write is refused is reported, not applied — and its Retry is accepted | AssertionError: expected { kind: 'next-bonus', amount: 1 } to match object { kind: 'next-bonus', ok: false, …(1) } |
| (new) tests/unit/nextMoveBonus.test.js › the roller's +1 reaches their next action roll (booted table) a weak hit's '+1 on your next move' pick: Kira's next action roll is +1, Ren's is not | AssertionError: expected undefined to be 1 // Object.is equality |
| (new) tests/unit/nextMoveBonus.test.js › the roller's +1 reaches their next action roll (booted table) a strong hit takes both: +2 momentum now, and +1 on Kira's next action roll | AssertionError: expected undefined to match object { value: 1, …(1) } |

### 8bb08d1 — fix: combat position is per character — each roller's own drives their moves (issue #322 V03)

Test files: `tests/unit/combatPositionPerCharacter.test.js`, `tests/unit/combatPositionStores.test.js`. Source restored: 6 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 13 failed (10 new; 1 only for a missing export); 6 still pass (2 new).
- Verdict: **sensitive** — 12 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/combatPositionPerCharacter.test.js › combatPositionFor the character's own position first, the fight's as the fallback | TypeError: combatPositionFor is not a function |
| (new) tests/unit/combatPositionPerCharacter.test.js › the fight's track holds each character's own position a write names the character: their own position, and the fight's last-set one | AssertionError: expected { id: 'fight-1', …(6) } to match object { combatState: 'in_control', …(1) } |
| (new) tests/unit/combatPositionPerCharacter.test.js › the fight's track holds each character's own position getActiveCombatPosition reads the roller's own, the fight's as the fallback | AssertionError: expected 'bad_spot' to be 'in_control' // Object.is equality |
| (new) tests/unit/combatPositionPerCharacter.test.js › the fight's track holds each character's own position two fights open: the roller's own position still counts; without one, none is guessed | AssertionError: expected null to be 'in_control' // Object.is equality |
| (new) tests/unit/combatPositionPerCharacter.test.js › the fight's track holds each character's own position listProgressTracks carries each fight's positions for the scored fight's reader | AssertionError: expected undefined to deeply equal { 'pc-ren': 'in_control' } |
| (new) tests/unit/combatPositionPerCharacter.test.js › the fight's track holds each character's own position the narrator's fight line names each character's position | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to contain '- Fight: Corsair boarding party — dan…' |
| (new) tests/unit/combatPositionPerCharacter.test.js › two PCs in one fight roll by their own positions (booted table) the interpreter is given each roller's own position, not the fight's last-set one | AssertionError: expected 'bad_spot' to be 'in_control' // Object.is equality |
| (new) tests/unit/combatPositionPerCharacter.test.js › two PCs in one fight roll by their own positions (booted table) Take Decisive Action is downgraded for the PC in a bad spot only | AssertionError: expected { …(28) } to match object { Object (moveId, outcome) } |
| (new) tests/unit/combatPositionPerCharacter.test.js › two PCs in one fight roll by their own positions (booted table) a move's position is recorded as the roller's own | AssertionError: expected { 'pc-ren': 'in_control', …(1) } to deeply equal { 'pc-ren': 'bad_spot', …(1) } |
| tests/unit/combatPositionStores.test.js › the combat tracker's position badge writes the fight's track (issue #321 U19) clicking the position badge writes the fight's track position too (the store every reader reads) | AssertionError: expected "spy" to be called with arguments: [ 'trk-1', 'in_control', 'pc1' ] |
| (new) tests/unit/combatPositionStores.test.js › the combat tracker's position badge writes the fight's track (issue #321 U19) a foe's badge writes the fight's position, not a character's own | AssertionError: expected "spy" to be called with arguments: [ 'trk-1', 'in_control', null ] |
| tests/unit/combatPositionStores.test.js › the combat tracker's position badge writes the fight's track (issue #321 U19) each step of the cycle reaches the track: in control → in a bad spot → neutral | AssertionError: expected last "spy" call to have been called with [ 'trk-1', 'bad_spot', 'pc1' ] |
| tests/unit/combatPositionStores.test.js › applyCombatPositionToTrack — neutral, and the canonical store first (issue #321 U19) null clears the position everywhere (the toggles' neutral step) | AssertionError: expected "spy" to be called with arguments: [ 'trk-1', null, 'pc1' ] |

- New test passing with and without the fix (a control?): tests/unit/combatPositionPerCharacter.test.js › the fight's track holds each character's own position a write without a character sets the fight's alone
- New test passing with and without the fix (a control?): tests/unit/combatPositionPerCharacter.test.js › the fight's track holds each character's own position a finished fight's positions are gone with it

### 2da340c — fix: a burn spends the momentum from before the move, not the outcome's own (issue #322 V04)

Test files: `tests/unit/burnMomentum.test.js`, `tests/unit/moveCardRelay.test.js`, `tests/unit/renarrateAttribution.test.js`, `tests/unit/resultUpgrade.test.js`. Source restored: 1 file(s).

- With the fix: 83 passed, 0 failed.
- Without it: 5 failed (4 new; 0 only for a missing export); 78 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/burnMomentum.test.js › buildBurnState returns metadata when burn would upgrade a weak hit to a strong hit | AssertionError: expected 9 to be 8 // Object.is equality |
| (new) tests/unit/burnMomentum.test.js › buildBurnState a weak hit's own +1 momentum is not counted toward burning that weak hit away | AssertionError: expected { canBurn: true, …(13) } to be null |
| (new) tests/unit/burnMomentum.test.js › buildBurnState a miss's Pay the Price momentum loss is not counted against the burn: the momentum before it is burned | AssertionError: expected null to match object { momentum: 7, …(1) } |
| (new) tests/unit/moveCardRelay.test.js › applyBurnFromRelay burns the momentum from before the move's effects: the outcome's own +1 is taken back out | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/resultUpgrade.test.js › P06 — an upgrade is claimed before its effects at momentum 7 against a 7, the weak hit's own +1 does not make the burn: none is offered | AssertionError: expected { canBurn: true, …(13) } to be undefined |

- New test passing with and without the fix (a control?): tests/unit/moveCardRelay.test.js › applyBurnFromRelay a card from before the burn recorded its outcome's momentum takes the outcome's nominal change

### 7aae820 — fix: !recap session N recaps session N, and counts each move once (issue #322 V05)

Test files: `tests/unit/sessionRecapNumber.test.js`. Source restored: 2 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sessionRecapNumber.test.js › !recap session N recaps session N "!recap session 3" during session 4 recaps session 3 — its moves, under its number | AssertionError: expected { recapCard: true, …(3) } to match object { sessionNumber: 3, …(1) } |
| (new) tests/unit/sessionRecapNumber.test.js › !recap session N recaps session N a session whose cards carry no number is found through last session's summary | AssertionError: expected '&lt;div class="sf-recap-session-card">\n…' to contain 'The old war ended' |
| (new) tests/unit/sessionRecapNumber.test.js › !recap session N recaps session N a session with no record left says so, by its number — never another session's moves | AssertionError: expected { recapCard: true, …(3) } to match object { recapEmpty: true, sessionNumber: 9 } |
| (new) tests/unit/sessionRecapNumber.test.js › !recap session reports what happened this session a burned move counts once, at its upgraded outcome; paced prose is not a "move resolved" | AssertionError: expected '&lt;div class="sf-recap-session-card">\n…' not to contain 'Strike → Miss' |
| (new) tests/unit/sessionRecapNumber.test.js › !recap session reports what happened this session a fallback card and an X-carded narration count their moves, and none of their lines is quoted | AssertionError: expected '&lt;div class="sf-recap-session-card">\n…' not to contain 'narration unavailable' |

- New test passing with and without the fix (a control?): tests/unit/sessionRecapNumber.test.js › !recap session N recaps session N the current session's number, and a bare `!recap session`, recap the current session

### d625707 — fix: every setting the help places in the Companion Settings panel has a control there (issue #322 V06)

Test files: `tests/unit/settingsPanelDocumentedRows.test.js`. Source restored: 2 file(s).

- With the fix: 7 passed, 0 failed.
- Without it: 7 failed (7 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/settingsPanelDocumentedRows.test.js › every setting the Settings Reference places in the panel has a control there documents each, and the panel renders a control for each | AssertionError: expected [ 'Narration Max Tokens', …(17) ] to deeply equal [] |
| (new) tests/unit/settingsPanelDocumentedRows.test.js › every setting the Settings Reference places in the panel has a control there each control shows the stored value | TypeError: Cannot read properties of null (reading 'value') |
| (new) tests/unit/settingsPanelDocumentedRows.test.js › every setting the Settings Reference places in the panel has a control there a player sees them disabled | TypeError: Cannot read properties of null (reading 'disabled') |
| (new) tests/unit/settingsPanelDocumentedRows.test.js › the save buttons write them Save Narrator Settings writes the narrator tab's new rows, in range | TypeError: Cannot set properties of null (setting 'value') |
| (new) tests/unit/settingsPanelDocumentedRows.test.js › the save buttons write them Save Fact Continuity Settings writes the four ship-positioning rows | TypeError: Cannot set properties of null (setting 'checked') |
| (new) tests/unit/settingsPanelDocumentedRows.test.js › the help states the registered defaults Narration Max Tokens defaults to 16000, not 300 | AssertionError: expected '&lt;h2>Configure Settings → Starforged C…' to match /Narration Max Tokens&lt;\/stron…/strong>&lt;\ |
| (new) tests/unit/settingsPanelDocumentedRows.test.js › the help states the registered defaults both audio switches are documented on by default, as registered | AssertionError: expected '&lt;h2>Configure Settings → Starforged C…' to match /Enable Audio \(world\)&lt;\/str…/strong>&lt;\ |

### aece676 — fix: the help's ticks per mark, where vows live, and where the panel buttons are (issue #322 V07)

Test files: `tests/unit/helpJournal.test.js`. Source restored: 1 file(s).

- With the fix: 10 passed, 0 failed.
- Without it: 7 failed (7 new; 0 only for a missing export); 3 still pass (0 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/helpJournal.test.js › help journal — Progress Tracks copy troublesome: the documented ticks per mark equal one Mark Progress | AssertionError: expected 3 to be 12 // Object.is equality |
| (new) tests/unit/helpJournal.test.js › help journal — Progress Tracks copy dangerous: the documented ticks per mark equal one Mark Progress | AssertionError: expected 2 to be 8 // Object.is equality |
| (new) tests/unit/helpJournal.test.js › help journal — Progress Tracks copy formidable: the documented ticks per mark equal one Mark Progress | AssertionError: expected 1 to be 4 // Object.is equality |
| (new) tests/unit/helpJournal.test.js › help journal — Progress Tracks copy extreme: the documented ticks per mark equal one Mark Progress | AssertionError: expected NaN to be 2 // Object.is equality |
| (new) tests/unit/helpJournal.test.js › help journal — Progress Tracks copy epic: the documented ticks per mark equal one Mark Progress | AssertionError: expected NaN to be 1 // Object.is equality |
| (new) tests/unit/helpJournal.test.js › help journal — Progress Tracks copy no page sends a player to make a vow in the Progress Tracks panel | AssertionError: expected '&lt;h2>First Session — Setup Walkthrough…' not to match /…/strong> panel and create a &lt;strong>vow |
| (new) tests/unit/helpJournal.test.js › help journal — Progress Tracks copy no page places a button in Token Controls | AssertionError: Progress Tracks: expected '&lt;h2>Progress Tracks&lt;/h2>&lt;p>Open the P…' not to contain 'Token Controls' |

### 4684788 — fix: the move interpreter's numbers are the module's, never the model's (issue #322 V08)

Test files: `tests/unit/interpreterNumbers.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/interpreterNumbers.test.js › the interpreter's numbers are the module's (INTERP-NUMBERS-TRUSTED) a model-supplied string `adds` does not turn the roll into an automatic 10 | AssertionError: expected '1' to be +0 // Object.is equality |
| (new) tests/unit/interpreterNumbers.test.js › the interpreter's numbers are the module's (INTERP-NUMBERS-TRUSTED) a number the model puts in adds, statValue or progressTicks is not kept | AssertionError: expected { …(18) } to match object { moveId: 'fulfill_your_vow', …(3) } |
| (new) tests/unit/interpreterNumbers.test.js › the interpreter's numbers are the module's (INTERP-NUMBERS-TRUSTED) the prompt's response format no longer offers an adds field | AssertionError: expected '["https://api.anthropic.com/v1/messag…' not to contain '\"adds\": 0' |
| (new) tests/unit/interpreterNumbers.test.js › the interpreter's numbers are the module's (INTERP-NUMBERS-TRUSTED) a progress move that resolves no track scores 0, not the number it carried | AssertionError: expected 28 to be +0 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/interpreterNumbers.test.js › the interpreter's numbers are the module's (INTERP-NUMBERS-TRUSTED) control: a resolved track's ticks are the score

### 7eadfb4 — fix: a move whose narration cannot be posted still applies its result (issue #322 V09)

Test files: `tests/unit/narrationRefusedPersist.test.js`. Source restored: 1 file(s).

- With the fix: 1 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narrationRefusedPersist.test.js › a narration that cannot be posted leaves the result applied (NARRATION-THROW-SKIPS-PERSIST) the narrator card cannot be posted: the strong hit still lands (+1 momentum, recorded) | AssertionError: expected 2 to be 3 // Object.is equality |

### af143fc — fix: !sector New Hope switches to New Hope (issue #322 V10)

Test files: `tests/unit/sectorSwitchKeywordName.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorSwitchKeywordName.test.js › !sector &lt;name> switches to a sector whose name starts with a subcommand (SECTOR-SWITCH-KEYWORD-PREFIX) !sector New Hope switches the active sector to "New Hope" | AssertionError: expected 's1' to be 's2' // Object.is equality |
| (new) tests/unit/sectorSwitchKeywordName.test.js › !sector &lt;name> switches to a sector whose name starts with a subcommand (SECTOR-SWITCH-KEYWORD-PREFIX) !sector List of Stars switches to "List of Stars", not the list | AssertionError: expected 's1' to be 's3' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/sectorSwitchKeywordName.test.js › !sector &lt;name> switches to a sector whose name starts with a subcommand (SECTOR-SWITCH-KEYWORD-PREFIX) control: `!sector list` alone lists the sectors and switches nothing

### 528eef1 — fix: the Entities panel shows a connection's relationship progress (issue #322 V11)

Test files: `tests/unit/entityPanelConnectionProgress.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityPanelConnectionProgress.test.js › Entity Panel — connection detail shows its relationship track (PANEL-CONN-PROGRESS-DEAD) shows the connection's relationship progress (16 ticks → 4 / 10 boxes) | AssertionError: expected ' ← All Entities ⬡ Vex Connection 🔓 U…' to match /Progress\s*4 \…/ 10 boxes \(dangerous\) |
| (new) tests/unit/entityPanelConnectionProgress.test.js › Entity Panel — connection detail shows its relationship track (PANEL-CONN-PROGRESS-DEAD) a bonded connection at a full track says so | AssertionError: expected ' ← All Entities ⬡ Vex Connection 🔓 U…' to match /Progre…/ 10 boxes \(dangerous, bonded\) |

### edd05b7 — fix: an open Clocks panel and a scene challenge's tension line follow clocks changed elsewhere (issue #322 V12)

Test files: `tests/unit/clocksPanelRefresh.test.js`, `tests/unit/hookGates.test.js`. Source restored: 3 file(s).

- With the fix: 11 passed, 0 failed.
- Without it: 8 failed (7 new; 7 only for a missing export); 3 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/clocksPanelRefresh.test.js › the Clocks panel follows clocks changed elsewhere re-renders when a clock it shows advanced | TypeError: hook is not a function |
| (new) (API) tests/unit/clocksPanelRefresh.test.js › the Clocks panel follows clocks changed elsewhere re-renders when a clock was added or removed | TypeError: hook is not a function |
| (new) (API) tests/unit/clocksPanelRefresh.test.js › the Clocks panel follows clocks changed elsewhere leaves itself alone when campaignState changed but its clocks did not | TypeError: clocks.onClocksSettingChanged is not a function |
| (new) (API) tests/unit/clocksPanelRefresh.test.js › the Clocks panel follows clocks changed elsewhere ignores another setting, and a closed panel | TypeError: clocks.onClocksSettingChanged is not a function |
| (new) (API) tests/unit/clocksPanelRefresh.test.js › the Clocks panel follows clocks changed elsewhere the hook is registered for both setting events | TypeError: clocks.registerClocksPanelHooks is not a function |
| (new) (API) tests/unit/clocksPanelRefresh.test.js › the Progress Tracks panel's tension line follows its clock re-renders when the paired clock advanced elsewhere | TypeError: hook is not a function |
| (new) (API) tests/unit/clocksPanelRefresh.test.js › the Progress Tracks panel's tension line follows its clock leaves itself alone when the clocks did not change | TypeError: progress.ProgressTrackApp.onSettingChanged is not a function |
| tests/unit/hookGates.test.js › document hook handlers run their shared writes on one client every LOCAL_ONLY entry still names an ungated handler | AssertionError: src/ui/progressTracks.js updateSetting ProgressTrackApp.onSettingChanged no longer exists — remove it from LOCAL_ONLY: expected false to be true |

### 6d6044b — fix: narrator audio's Play button can be retried after a failure (issue #322 V13)

Test files: `tests/unit/audioErrorRetry.test.js`. Source restored: 2 file(s).

- With the fix: 1 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioErrorRetry.test.js › "try again" after a failed first attempt (AUDIO-ERROR-NO-RETRY) Play works on the second click once the clip is available | AssertionError: expected true to be false // Object.is equality |

### 8c761cf — fix: Stop while a narrator card loads, or Pause between its segments, holds (issue #322 V14)

Test files: `tests/unit/audioPauseBetweenSegments.test.js`, `tests/unit/audioStopWhileLoading.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioPauseBetweenSegments.test.js › Pause between two segments (AUDIO-PAUSE-GAP-IGNORED) a Pause while the next segment is loading is not undone when it loads | AssertionError: expected 'playing' to be 'paused' // Object.is equality |
| (new) tests/unit/audioPauseBetweenSegments.test.js › Pause between two segments (AUDIO-PAUSE-GAP-IGNORED) a Resume before the next segment loads plays it when it lands, without replaying the ended one | AssertionError: expected 'playing' to be 'ended' // Object.is equality |
| (new) tests/unit/audioStopWhileLoading.test.js › Stop during synthesis keeps the card silent (AUDIO-STOP-WHILE-LOADING) a Stop pressed while the card is still loading keeps the narration silent | AssertionError: expected [ FoundrySoundStub{ …(4) } ] to have a length of +0 but got 1 |

- New test passing with and without the fix (a control?): tests/unit/audioPauseBetweenSegments.test.js › Pause between two segments (AUDIO-PAUSE-GAP-IGNORED) a Stop while a loaded segment waits out a pause ends the session silently
- New test passing with and without the fix (a control?): tests/unit/audioStopWhileLoading.test.js › Stop during synthesis keeps the card silent (AUDIO-STOP-WHILE-LOADING) a Play after the Stop plays — the Stop cancelled only the load in flight

### b7bc7f8 — fix: narrator audio auto-plays only cards created since this client started (issue #322 V15)

Test files: `tests/unit/audioAutoplayHistoricalCard.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 1 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioAutoplayHistoricalCard.test.js › chat-log render on page load (AUDIO-AUTOPLAY-OLD-CARD) a narrator card posted hours before this page loaded does not autoplay on the first click | AssertionError: expected [ FoundrySoundStub{ …(4) } ] to have a length of +0 but got 1 |
| (new) (API) tests/unit/audioAutoplayHistoricalCard.test.js › chat-log render on page load (AUDIO-AUTOPLAY-OLD-CARD) control: a card created after this client started auto-plays on the first click | TypeError: markAudioClientReady is not a function |

- New test passing with and without the fix (a control?): tests/unit/audioAutoplayHistoricalCard.test.js › chat-log render on page load (AUDIO-AUTOPLAY-OLD-CARD) an old card still plays when its Play button is clicked

### 33dd07f — fix: remove the audio cache's size-cap sweep, which could never evict (issue #322 V16)

Test files: `tests/unit/audio.test.js`, `tests/unit/audioAutoplayHistoricalCard.test.js`, `tests/unit/audioCacheNoSweep.test.js`, `tests/unit/audioCardButton.test.js`, `tests/unit/audioErrorRetry.test.js`, `tests/unit/audioKeylessPlayback.test.js`, `tests/unit/audioStopWhileLoading.test.js`, `tests/unit/audioSynthesisOnce.test.js`, `tests/unit/nonGmClientPaths.test.js`, `tests/unit/playtestFixesV1728.test.js`. Source restored: 5 file(s).

- With the fix: 114 passed, 0 failed.
- Without it: 3 failed (2 new; 0 only for a missing export); 111 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioCacheNoSweep.test.js › the audio cache has no size-cap sweep the module exports no eviction sweep (Foundry v13's client cannot delete a file) | AssertionError: expected [AsyncFunction evictIfOverflow] to be undefined |
| (new) tests/unit/audioCacheNoSweep.test.js › the audio cache has no size-cap sweep no production code registers or reads the cap's setting, and the help no longer documents it | AssertionError: expected [ 'src/audio/cache.js', …(2) ] to deeply equal [] |
| tests/unit/nonGmClientPaths.test.js › handleSynthRequest — GM synthesises on a keyless client request synthesises + caches an uncached clip, then signals done with the path it wrote | AssertionError: expected { kind: 'audio.synth.done', …(2) } to deeply equal { kind: 'audio.synth.done', …(2) } |

- New test passing with and without the fix (a control?): tests/unit/audioCacheNoSweep.test.js › the audio cache has no size-cap sweep caching a clip scans nothing: no browse of the cache tree, no HEAD per file
- New test passing with and without the fix (a control?): tests/unit/playtestFixesV1728.test.js › #3 audio cache memo memoises a positive lookup so the second call does not browse again

### 68d6a3f — fix: half an <npc> tag pair is neither shown on the card nor read aloud (issue #322 V17)

Test files: `tests/unit/segmentsUnclosedTag.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/segmentsUnclosedTag.test.js › half a tag pair (NPC-TAG-UNCLOSED-LEAKS) stripMarkup removes an unclosed opening tag, keeping the line | AssertionError: expected 'Vance leans in. &lt;npc>"There is someth…' to be 'Vance leans in. "There is something y…' // Object.is equality |
| (new) tests/unit/segmentsUnclosedTag.test.js › half a tag pair (NPC-TAG-UNCLOSED-LEAKS) stripMarkup removes a stray closing tag | AssertionError: expected 'Kira looks up. "We leave at dawn."&lt;/n…' to be 'Kira looks up. "We leave at dawn." Th…' // Object.is equality |
| (new) tests/unit/segmentsUnclosedTag.test.js › half a tag pair (NPC-TAG-UNCLOSED-LEAKS) splitSegments sends no tag text to the TTS engine | AssertionError: expected 'Vance leans in. &lt;npc>"There is someth…' not to match /&lt;\/?npc\s*>/?npc\s*> |
| (new) tests/unit/segmentsUnclosedTag.test.js › half a tag pair (NPC-TAG-UNCLOSED-LEAKS) the text after an unclosed opening tag is the NPC's | AssertionError: expected [ { voice: 'narrator', …(1) } ] to deeply equal [ { voice: 'narrator', …(1) }, …(1) ] |
| (new) tests/unit/segmentsUnclosedTag.test.js › half a tag pair (NPC-TAG-UNCLOSED-LEAKS) a stray tag inside a pair, or around one, is dropped | AssertionError: expected 'He turns. "Wait. &lt;npc>Listen." She do…' not to match /&lt;\/?npc\s*>/?npc\s*> |

- New test passing with and without the fix (a control?): tests/unit/segmentsUnclosedTag.test.js › half a tag pair (NPC-TAG-UNCLOSED-LEAKS) control: matched pairs split and strip as before

### b932b16 — fix: narration and @scene cards show angle-bracketed text instead of swallowing it (issue #322 V18)

Test files: `tests/unit/narrationCardHtml.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narrationCardHtml.test.js › narration card HTML keeps the prose the narrator wrote (NARR-CARD-UNESCAPED) angle-bracketed comm text is escaped, not parsed as markup | AssertionError: expected '&lt;div class="sf-narration-card">\n    …' to contain '&lt;signal lost&gt;' |
| (new) tests/unit/narrationCardHtml.test.js › narration card HTML keeps the prose the narrator wrote (NARR-CARD-UNESCAPED) an NPC tag is still stripped, and its line kept, before the escape | AssertionError: expected '&lt;div class="sf-narration-card">\n    …' to contain 'Vance smiles. &quot;Not &lt;yet&gt;.&…' |
| (new) tests/unit/narrationCardHtml.test.js › the @scene card escapes the question and the answer a player's &lt;b> and a reply's &lt;ACCESS DENIED> show as text | AssertionError: expected '&lt;div class="sf-scene-card">\n        …' to contain '&lt;ACCESS DENIED&gt;' |

### 2f65466 — fix: names that start or end with a non-ASCII letter are recognised in narration (issue #322 V19)

Test files: `tests/unit/relevanceUnicodeNames.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 4 failed (4 new; 1 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/relevanceUnicodeNames.test.js › relevance — names that start or end with a non-ASCII letter matches a one-word name ending in ë ("Zoë") | AssertionError: expected [] to include 'a-zoe' |
| (new) tests/unit/relevanceUnicodeNames.test.js › relevance — names that start or end with a non-ASCII letter matches a first name ending in é ("José") and a name starting with É ("Élise") | AssertionError: expected [] to include 'a-jose' |
| (new) tests/unit/relevanceUnicodeNames.test.js › relevance — names that start or end with a non-ASCII letter the lexical (paced / @scene) relevance path finds the NPC the player named | AssertionError: expected [] to include 'a-zoe' |
| (new) (API) tests/unit/relevanceUnicodeNames.test.js › relevance — names that start or end with a non-ASCII letter the pattern is still a whole word: a name inside a longer word is no match | TypeError: wholeWordPattern is not a function |

- New test passing with and without the fix (a control?): tests/unit/relevanceUnicodeNames.test.js › relevance — names that start or end with a non-ASCII letter a player's line naming another PC is seen when that PC's name ends in a non-ASCII letter

### c7bd107 — fix: the spotlight rotates PCs the scene frame names by first or last name (issue #322 V20)

Test files: `tests/unit/spotlightFrameNames.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/spotlightFrameNames.test.js › spotlight — PCs the frame lists by first or last name are in the scene rotates between two present PCs the frame names by first name | AssertionError: expected undefined to be 'b-ren' // Object.is equality |
| (new) tests/unit/spotlightFrameNames.test.js › spotlight — PCs the frame lists by first or last name are in the scene a last name counts too, whatever the case and spacing | AssertionError: expected undefined to be 'a-kira' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/spotlightFrameNames.test.js › spotlight — PCs the frame lists by first or last name are in the scene a name two PCs share names neither
- New test passing with and without the fix (a control?): tests/unit/spotlightFrameNames.test.js › spotlight — PCs the frame lists by first or last name are in the scene control: full names still match, and a PC the frame does not name is left out

### 2a8beb3 — fix: a !pace hot / quiet override ends with its scene (issue #322 V21)

Test files: `tests/unit/paceOverrideSceneEnd.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/paceOverrideSceneEnd.test.js › a pacing scene override lasts for its scene `!pace hot`, then the scene ends: the override is gone, and `!roll`'s flag is kept | AssertionError: expected { sceneOverride: { …(2) }, …(1) } to deeply equal { sceneOverride: null, …(1) } |
| (new) tests/unit/paceOverrideSceneEnd.test.js › a pacing scene override lasts for its scene a new scene started over the old one ends it — and its override | AssertionError: expected { modifier: -3, label: 'quiet' } to be null |

- New test passing with and without the fix (a control?): tests/unit/paceOverrideSceneEnd.test.js › a pacing scene override lasts for its scene control: a scene ending with no override leaves the pacing block alone

### 4f497f9 — fix: paced narration cards carry the scene's matched NPCs, for their voices (issue #322 V22)

Test files: `tests/unit/pacedCardVoice.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/pacedCardVoice.test.js › a paced narration card carries the scene's matched entities (V22) names the connection the player named, so its pronoun-keyed voice is picked | AssertionError: expected [] to include 'npc-sable' |

- New test passing with and without the fix (a control?): tests/unit/pacedCardVoice.test.js › a paced narration card carries the scene's matched entities (V22) control: a paced beat that names nobody keeps the generic NPC voice

### d0c438b — fix: a clock's beat has its own narrator role, and the oath scene its latitude (issue #322 V23)

Test files: `tests/unit/narratorModeRoles.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narratorModeRoles.test.js › each narrator mode has its role and latitude clock_advance: the threat's own role, and the interaction block — not the vignette's calm | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to contain 'a tracked threat moving closer' |
| (new) tests/unit/narratorModeRoles.test.js › each narrator mode has its role and latitude vow_swearing carries the embellishment block | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to contain '## NARRATOR PERMISSIONS — EMBELLISHME…' |
| (new) tests/unit/narratorModeRoles.test.js › narrateClockAdvancement narrates in the clock_advance mode a filled clock's beat is narrated with the threat's role | AssertionError: expected '[{"type":"text","text":"## NARRATOR R…' to contain 'a tracked threat moving closer' |

- New test passing with and without the fix (a control?): tests/unit/narratorModeRoles.test.js › each narrator mode has its role and latitude control: the session vignette keeps its own role

### b7d37f5 — fix: !sfc encounter places the foe at the scene's centre (issue #322 V24)

Test files: `tests/unit/encounterSpawn.test.js`, `tests/unit/encounterTokenCentre.test.js`. Source restored: 1 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 3 failed (2 new; 0 only for a missing export); 16 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/encounterSpawn.test.js › spawnEncounter places a token backed by a world Actor (issue #306 R12) imports the foe on first use, and the token names the world Actor | AssertionError: expected { x: 500, y: 500, hidden: false, …(2) } to match object { actorId: 'world-foe', x: 450, …(2) } |
| (new) tests/unit/encounterTokenCentre.test.js › PROBE ENCOUNTER-TOKEN-OFF-CENTRE — foe token at the scene centre places the token inside the centre grid cell of the scene rectangle | AssertionError: expected 896 to be greater than or equal to 996 |
| (new) tests/unit/encounterTokenCentre.test.js › PROBE ENCOUNTER-TOKEN-OFF-CENTRE — foe token at the scene centre a 2×2 foe is centred by its own size | AssertionError: expected { x: 896, y: 512, hidden: false, …(3) } to match object { x: 996, y: 612 } |

### 1d74f12 — fix: a portrait is found after its Art Cache entry is renamed (issue #322 V25)

Test files: `tests/unit/artAssetLookupByName.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/artAssetLookupByName.test.js › a portrait after its journal entry is renamed (ART-ASSET-NAME-LOOKUP) the fast path the Entities panel uses still finds it | AssertionError: expected undefined to be 'asset-1' // Object.is equality |
| (new) tests/unit/artAssetLookupByName.test.js › a portrait after its journal entry is renamed (ART-ASSET-NAME-LOOKUP) an entry the index names that holds another asset is not this one's | AssertionError: expected 'asset-9' to be 'asset-1' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/artAssetLookupByName.test.js › a portrait after its journal entry is renamed (ART-ASSET-NAME-LOOKUP) control — the slow path (no campaignState) still finds it by its flags
- New test passing with and without the fix (a control?): tests/unit/artAssetLookupByName.test.js › a portrait after its journal entry is renamed (ART-ASSET-NAME-LOOKUP) an asset with no entry left is null

### 21ccdd3 — fix: the sector connection keeps its rolled disposition and first look (issue #322 V27)

Test files: `tests/unit/sectorNpcRolls.test.js`. Source restored: 1 file(s).

- With the fix: 1 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorNpcRolls.test.js › the sector connection keeps the rolls the generator made (SECTOR-NPC-ROLLS-DROPPED) the sector connection record carries the disposition and first look the generator rolled | AssertionError: expected undefined to be 'Suspicious' // Object.is equality |

### d74ca56 — fix: a custom oracle line that does not read is never dropped silently (issue #322 V28)

Test files: `tests/unit/customOracleParse.test.js`. Source restored: 2 file(s).

- With the fix: 9 passed, 0 failed.
- Without it: 9 failed (9 new; 3 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/customOracleParse.test.js › custom-oracle entry parsing never silently loses the top of a table an en-dash range on the last line ("5–6 Hostile") is kept: a d6 | AssertionError: expected { min: 3, max: 4, result: 'Wary' } to deeply equal { min: 5, max: 6, result: 'Hostile' } |
| (new) tests/unit/customOracleParse.test.js › custom-oracle entry parsing never silently loses the top of a table a percentile "00" top row ("96-00 Roll twice") is 96–100: a d100 | AssertionError: expected { min: 51, max: 95, result: 'Wary' } to deeply equal { min: 96, max: 100, …(1) } |
| (new) tests/unit/customOracleParse.test.js › custom-oracle entry parsing never silently loses the top of a table a range written with — reads as one | AssertionError: expected [] to deeply equal [ Array(1) ] |
| (new) tests/unit/customOracleParse.test.js › custom-oracle entry parsing never silently loses the top of a table a range written with ‒ reads as one | AssertionError: expected [] to deeply equal [ Array(1) ] |
| (new) tests/unit/customOracleParse.test.js › custom-oracle entry parsing never silently loses the top of a table a range written with − reads as one | AssertionError: expected [] to deeply equal [ Array(1) ] |
| (new) tests/unit/customOracleParse.test.js › custom-oracle entry parsing never silently loses the top of a table a range written with ‐ reads as one | AssertionError: expected [] to deeply equal [ Array(1) ] |
| (new) (API) tests/unit/customOracleParse.test.js › custom-oracle entry parsing never silently loses the top of a table a line that still does not read is named; comments and blank lines are not | TypeError: (0 , unparsedEntryLines) is not a function |
| (new) (API) tests/unit/customOracleParse.test.js › saving a table with a line that did not read is refused, naming it refused: nothing registered or stored, and the card lists the line | TypeError: (0 , unparsedEntryLines) is not a function |
| (new) (API) tests/unit/customOracleParse.test.js › saving a table with a line that did not read is refused, naming it control: a table whose every line reads is saved with its whole die | TypeError: (0 , unparsedEntryLines) is not a function |

### 7c3f8d5 — fix: the connection migration keeps the old journals until its id swap is saved (issue #322 V29)

Test files: `tests/unit/connectionMigrationOrder.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/connectionMigrationOrder.test.js › the connection migration saves its swap before deleting (CONN-MIGRATION-DELETES-BEFORE-PERSIST) keeps the legacy journal when the id swap could not be saved | AssertionError: expected null not to be null |
| (new) tests/unit/connectionMigrationOrder.test.js › the connection migration saves its swap before deleting (CONN-MIGRATION-DELETES-BEFORE-PERSIST) the next load, with the save landing: the same card, no second one, and the journal goes | AssertionError: expected +0 to be 1 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/connectionMigrationOrder.test.js › the connection migration saves its swap before deleting (CONN-MIGRATION-DELETES-BEFORE-PERSIST) control: a save that lands the first time swaps the id, then deletes the journal

### ff289b7 — fix: a faction's or creature's journal page shows its record as it is now (issue #322 V31)

Test files: `tests/unit/entityPageBodyRerender.test.js`. Source restored: 2 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityPageBodyRerender.test.js › a journal-hosted entity page shows its record as it is (FACTION-PAGE-BODY-STALE) the faction's journal page shows its seeded type and current stance | AssertionError: expected { Object (showsType, showsStance) } to deeply equal { showsType: true, showsStance: true } |
| (new) tests/unit/entityPageBodyRerender.test.js › a journal-hosted entity page shows its record as it is (FACTION-PAGE-BODY-STALE) a creature's page follows its record's edits too | AssertionError: expected '&lt;p>&lt;strong>Environment:&lt;/strong> Spac…' to contain 'Swarms toward heat' |

### 08f13f0 — fix: an edit to a shared vow copy made during a sync pass is kept (issue #322 V32)

Test files: `tests/unit/sharedVowSyncLostUpdate.test.js`, `tests/unit/swearVow.test.js`. Source restored: 1 file(s).

- With the fix: 30 passed, 0 failed.
- Without it: 4 failed (3 new; 0 only for a missing export); 26 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sharedVowSyncLostUpdate.test.js › a shared vow keeps both of two edits made within one round trip (SHARED-VOW-SYNC-LOST-UPDATE) the pass's write to Tomas still in flight: the tick is reverted on Tomas and never reaches the others | AssertionError: expected [ …(3) ] to deeply equal [ Array(3) ] |
| (new) tests/unit/sharedVowSyncLostUpdate.test.js › a shared vow keeps both of two edits made within one round trip (SHARED-VOW-SYNC-LOST-UPDATE) the pass's write to Ilse in flight: the tick is dropped by the in-flight guard — the copies diverge | AssertionError: expected [ …(3) ] to deeply equal [ Array(3) ] |
| tests/unit/swearVow.test.js › computeSharedVowSyncUpdates syncs the attached clock ticks alongside progress | AssertionError: expected { 'system.current': 8, …(1) } to deeply equal { 'system.clockTicks': 3 } |
| (new) tests/unit/swearVow.test.js › computeSharedVowSyncUpdates limited to a change's own fields, it writes only those | AssertionError: expected { 'system.current': 12, …(1) } to deeply equal { 'system.current': 12 } |

### 512458c — fix: the Chronicle's type select shows discovery and moment entries as themselves (issue #322 V33)

Test files: `tests/unit/chroniclePanel.test.js`, `tests/unit/chronicleWriter.test.js`. Source restored: 4 file(s).

- With the fix: 34 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 30 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/chroniclePanel.test.js › the GM's type select offers every type an entry can have (issue #322 V33) a scribe's 'moment' and 'discovery' entries show as themselves, not as Revelation | AssertionError: expected 'revelation' to be 'moment' // Object.is equality |
| (new) tests/unit/chroniclePanel.test.js › the GM's type select offers every type an entry can have (issue #322 V33) a GM can re-type a moment to a scar and set it back | AssertionError: moment: expected 'scar' to be 'moment' // Object.is equality |
| (new) tests/unit/chroniclePanel.test.js › the GM's type select offers every type an entry can have (issue #322 V33) every type the automatic scribe writes is offered, with a label | TypeError: CHRONICLE_AUTO_TYPES is not iterable |
| (new) tests/unit/chroniclePanel.test.js › the GM's type select offers every type an entry can have (issue #322 V33) a stored type outside the list is shown as itself, never as the first option | AssertionError: expected 'revelation' to be 'omen' // Object.is equality |

### e1b67c0 — fix: truths saved in the World Truths dialog reach the narrator (issue #322 V34)

Test files: `tests/unit/narrateVowSwearing.test.js`, `tests/unit/worldTruthsDialogNarrator.test.js`. Source restored: 4 file(s).

- With the fix: 17 passed, 0 failed.
- Without it: 8 failed (8 new; 0 only for a missing export); 9 still pass (2 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narrateVowSwearing.test.js › buildVowSwearingUserMessage grounds the scene in a custom Iron truth, which has a title and no description | AssertionError: expected 'A character is swearing "Find the bea…' to contain 'bind their oaths thus — We swear on t…' |
| (new) tests/unit/worldTruthsDialogNarrator.test.js › truths chosen in the World Truths dialog reach the narrator a world set up in the dialog: the WORLD TRUTHS block carries each chosen truth, with its sub-table detail | AssertionError: expected [ 'cataclysm', 'exodus', …(12) ] to deeply equal [ Array(4) ] |
| (new) tests/unit/worldTruthsDialogNarrator.test.js › truths chosen in the World Truths dialog reach the narrator a revision in the dialog replaces the Quickstart's truths, and !lore reads the same save | AssertionError: expected 'Cataclysm: The Sun Plague extinguishe…' to contain 'set upon by: Religious zealots' |
| (new) tests/unit/worldTruthsDialogNarrator.test.js › truths chosen in the World Truths dialog reach the narrator an empty save (no truth selected) moves nothing — the narrator keeps the truths it had | AssertionError: expected '' to be 'Artificial intelligence' // Object.is equality |
| (new) tests/unit/worldTruthsDialogNarrator.test.js › truths chosen in the World Truths dialog reach the narrator with the linked journal gone, !lore's repair links the newest save together with its truths | TypeError: Cannot read properties of undefined (reading 'subResult') |
| (new) tests/unit/worldTruthsDialogNarrator.test.js › a world whose truths were saved in the dialog gets them at its next load the linked dialog save is parsed into worldTruths | AssertionError: expected undefined to match object { …(3) } |
| (new) tests/unit/worldTruthsDialogNarrator.test.js › a world whose truths were saved in the dialog gets them at its next load a world linked to its first of two saves (before #321 U65) moves to the newest | AssertionError: expected 'j-first' to be 'j-revised' // Object.is equality |
| (new) tests/unit/worldTruthsDialogNarrator.test.js › a world whose truths were saved in the dialog gets them at its next load a world never linked links its newest save, and is not asked to set World Truths | AssertionError: expected [ { …(7) } ] to deeply equal [] |

- New test passing with and without the fix (a control?): tests/unit/worldTruthsDialogNarrator.test.js › a world whose truths were saved in the dialog gets them at its next load control: the Quickstart's truths, linked to its own journal, are left as they are
- New test passing with and without the fix (a control?): tests/unit/worldTruthsDialogNarrator.test.js › a world whose truths were saved in the dialog gets them at its next load control: a world with no truths anywhere still gets the setup card

### `scripts/defects/v16-audio-cache-sweep.patch` — V16 (issue #322) — the canonical GM sweeps the whole audio cache tree after every clip it caches (the size-cap sweep, which could never evict on v13)

Test files: `tests/unit/audioCacheNoSweep.test.js`.

- On HEAD: 3 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 2 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/audioCacheNoSweep.test.js › the audio cache has no size-cap sweep the GM caching a clip, synthesised or relayed, scans nothing: no browse of the cache tree, no HEAD per file | AssertionError: expected [ [ 'data', …(1) ] ] to have a length of +0 but got 1 |

### `scripts/defects/v19-pc-name-ascii-boundary.patch` — V19 (issue #322) — another PC's name in a player's line is matched with an ASCII word boundary, so a name ending in a non-ASCII letter ("Zoë") is never seen

Test files: `tests/unit/relevanceUnicodeNames.test.js`.

- On HEAD: 5 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 4 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/relevanceUnicodeNames.test.js › relevance — names that start or end with a non-ASCII letter a player's line naming another PC is seen when that PC's name ends in a non-ASCII letter | AssertionError: expected false to be true // Object.is equality |

### `scripts/defects/v26-upload-built-path-fallback.patch` — V26 (issue #322) — a failed upload falls back to the path the caller built, so a sector map, deck plan or audio clip that was never written is recorded as stored

Test files: `tests/unit/uploadResult.test.js`.

- On HEAD: 16 passed, 0 failed.
- With the defect: 12 failed (0 only for a missing export); 4 still pass.
- Verdict: **sensitive** — 12 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/uploadResult.test.js › uploadedPath a failed upload — false (the server reported an error) — stored nothing | AssertionError: expected 'worlds/w/x.png' to be null |
| tests/unit/uploadResult.test.js › uploadedPath a failed upload — undefined (no path / a 413) — stored nothing | AssertionError: expected 'worlds/w/x.png' to be null |
| tests/unit/uploadResult.test.js › uploadedPath a failed upload — {} (the request failed) — stored nothing | AssertionError: expected 'worlds/w/x.png' to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file sector art: an upload that returns false (the server reported an error) yields no background, and says so | AssertionError: expected 'worlds/test-world/scenes/sector-sec-1…' to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file sector art: an upload that returns undefined (no path / a 413) yields no background, and says so | AssertionError: expected 'worlds/test-world/scenes/sector-sec-1…' to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file sector art: an upload that returns {} (the request failed) yields no background, and says so | AssertionError: expected 'worlds/test-world/scenes/sector-sec-1…' to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file the audio cache: an upload that returns false (the server reported an error) caches no clip | AssertionError: expected 'worlds/test-world/audio/dd/dddddddddd…' to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file the audio cache: an upload that returns undefined (no path / a 413) caches no clip | AssertionError: expected 'worlds/test-world/audio/dd/dddddddddd…' to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file the audio cache: an upload that returns {} (the request failed) caches no clip | AssertionError: expected 'worlds/test-world/audio/dd/dddddddddd…' to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file the deck plan: an upload that returns false (the server reported an error) yields no art (the schematic backdrop stands) | AssertionError: expected { …(2) } to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file the deck plan: an upload that returns undefined (no path / a 413) yields no art (the schematic backdrop stands) | AssertionError: expected { …(2) } to be null |
| tests/unit/uploadResult.test.js › every upload site reports a failed upload as no file the deck plan: an upload that returns {} (the request failed) yields no art (the schematic backdrop stands) | AssertionError: expected { …(2) } to be null |

### `scripts/defects/v30-regenerate-drops-portrait.patch` — V30 (issue #322) — the re-seed's new Notes drop the old Notes' portrait block, which generate-once never attaches again

Test files: `tests/unit/regenerateKeepsNotesPortrait.test.js`.

- On HEAD: 4 passed, 0 failed.
- With the defect: 3 failed (0 only for a missing export); 1 still pass.
- Verdict: **sensitive** — 3 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/regenerateKeepsNotesPortrait.test.js › Regenerate flavour keeps the embedded portrait (REGENERATE-STRIPS-NOTES-PORTRAIT) Regenerate flavour keeps the NPC card's embedded portrait | AssertionError: expected '&lt;p>&lt;em>Oracle-seeded character detail…' to contain 'npc-1-art-1.png' |
| tests/unit/regenerateKeepsNotesPortrait.test.js › Regenerate flavour keeps the embedded portrait (REGENERATE-STRIPS-NOTES-PORTRAIT) the new Notes replace the old prose under the kept portrait — one block, not two | AssertionError: expected false to be true // Object.is equality |
| tests/unit/regenerateKeepsNotesPortrait.test.js › keepNotesPortrait carries the old block onto new Notes, once | AssertionError: expected '&lt;p>new&lt;/p>' to be '&lt;div class="sf-ship-portrait">&lt;img sr…' // Object.is equality |

### `scripts/defects/v12-clock-panels-stale.patch` — V12 (issue #322) — an open Clocks panel, and a scene challenge's tension line in the Progress Tracks panel, re-render only after their own buttons: a clock changed elsewhere stays stale on screen

Test files: `tests/unit/clocksPanelRefresh.test.js`.

- On HEAD: 7 passed, 0 failed.
- With the defect: 3 failed (0 only for a missing export); 4 still pass.
- Verdict: **sensitive** — 3 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/clocksPanelRefresh.test.js › the Clocks panel follows clocks changed elsewhere re-renders when a clock it shows advanced | AssertionError: expected "spy" to be called 1 times, but got 0 times |
| tests/unit/clocksPanelRefresh.test.js › the Clocks panel follows clocks changed elsewhere re-renders when a clock was added or removed | AssertionError: expected "spy" to be called 1 times, but got 0 times |
| tests/unit/clocksPanelRefresh.test.js › the Progress Tracks panel's tension line follows its clock re-renders when the paired clock advanced elsewhere | AssertionError: expected "spy" to be called 1 times, but got 0 times |

### c1dcddb — fix: a vow pays and names its own rank — the system's numeric rank read as its name (issue #325 W01)

Test files: `tests/unit/vowRankNumeric.test.js`, `tests/unit/vowRankNumericPipeline.test.js`. Source restored: 3 file(s).

- With the fix: 14 passed, 0 failed.
- Without it: 10 failed (10 new; 0 only for a missing export); 4 still pass (4 new).
- Verdict: **sensitive** — 10 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/vowRankNumeric.test.js › legacyRewardTicks reads the vendor's numeric rank the numeric epic rank (5) pays 3 boxes too | AssertionError: expected 2 to be 12 // Object.is equality |
| (new) tests/unit/vowRankNumeric.test.js › legacyRewardTicks reads the vendor's numeric rank a weak hit on a numeric extreme vow (4) pays one rank lower: formidable, 1 box | AssertionError: expected 1 to be 4 // Object.is equality |
| (new) tests/unit/vowRankNumeric.test.js › legacyRewardTicks reads the vendor's numeric rank a numeric troublesome vow (1) pays 1 tick; a numeric string reads the same | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/vowRankNumeric.test.js › a vow fulfilled on the sheet pays its rank's quests legacy an epic vow as the system stores it (rank 5) pays 12 ticks | AssertionError: expected 2 to be 12 // Object.is equality |
| (new) tests/unit/vowRankNumeric.test.js › a vow fulfilled on the sheet pays its rank's quests legacy a troublesome vow (rank 1) pays 1 tick, not 2 | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/vowRankNumeric.test.js › a vow fulfilled on the sheet pays its rank's quests legacy a weak hit on a formidable vow (rank 3) pays one rank lower — 2 ticks | AssertionError: expected 1 to be 2 // Object.is equality |
| (new) tests/unit/vowRankNumeric.test.js › the "New vow recorded" card names the vow's rank builder: the numeric rank prints as its name | AssertionError: expected '&lt;div class="sf-card sf-player-vow">&lt;d…' to contain '&lt;em>(formidable)&lt;/em>' |
| (new) tests/unit/vowRankNumeric.test.js › the "New vow recorded" card names the vow's rank a sheet-made Formidable vow (rank 3) is posted as "(formidable)", not "(3)" | AssertionError: expected '&lt;div class="sf-card sf-player-vow">&lt;d…' to contain '&lt;em>(formidable)&lt;/em>' |
| (new) tests/unit/vowRankNumericPipeline.test.js › a vow Item's numeric rank through the pipeline's fulfil an Epic vow (rank 5) fulfilled with a strong hit marks 12 Quests ticks and posts the "⚑ Vow Fulfilled" card naming the rank | AssertionError: expected 2 to be 12 // Object.is equality |
| (new) tests/unit/vowRankNumericPipeline.test.js › a vow Item's numeric rank through the pipeline's fulfil an Extreme vow (rank 4) pays 2 boxes (8 ticks), not a dangerous vow's 2 ticks | AssertionError: expected 2 to be 8 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/vowRankNumeric.test.js › legacyRewardTicks reads the vendor's numeric rank control: the rank name "epic" pays 3 boxes (12 ticks)
- New test passing with and without the fix (a control?): tests/unit/vowRankNumeric.test.js › legacyRewardTicks reads the vendor's numeric rank a number outside 1–5, or none, keeps the dangerous fallback
- New test passing with and without the fix (a control?): tests/unit/vowRankNumeric.test.js › a vow fulfilled on the sheet pays its rank's quests legacy control: an epic vow written with the rank name pays 12 ticks
- New test passing with and without the fix (a control?): tests/unit/vowRankNumericPipeline.test.js › a vow Item's numeric rank through the pipeline's fulfil control: the same vow with the rank NAME "epic" pays 12 and posts the card

### a7b2fee — fix: a card button pressed while a move is resolved is rolled when it finishes (issue #325 W02)

Test files: `tests/unit/cardActions.test.js`, `tests/unit/deferredForcedMove.test.js`. Source restored: 2 file(s).

- With the fix: 59 passed, 0 failed.
- Without it: 6 failed (2 new; 0 only for a missing export); 53 still pass (2 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/cardActions.test.js › applyConnectionPick posts the forced move once, speaking as the clicker's PC, and resolves the card | AssertionError: expected { bypassPacing: true, …(3) } to deeply equal { bypassPacing: true, …(4) } |
| tests/unit/cardActions.test.js › applyWaypointOraclePick the owner takes it: the forced move is posted once, as the roller, the card claimed, the ordinary choice retired | AssertionError: expected { bypassPacing: true, …(1) } to deeply equal { bypassPacing: true, …(2) } |
| tests/unit/cardActions.test.js › applyFulfilVowPick (issue #321 U02) the roller's player picks: the card is claimed and the move posted once, with that copy, as the roller | AssertionError: expected { bypassPacing: true, …(3) } to deeply equal { bypassPacing: true, …(4) } |
| tests/unit/cardActions.test.js › applyMilestoneSuggestion (issue #321 U20) the roller's player presses: the card is claimed and the move posted once, as the roller | AssertionError: expected { bypassPacing: true, …(1) } to deeply equal { bypassPacing: true, …(2) } |
| (new) tests/unit/deferredForcedMove.test.js › a claimed card's forced move meets the move lock "⚑ Mark Progress on Vow" pressed while its own move is still being narrated marks the vow | AssertionError: expected { ticks: +0, claimed: true } to deeply equal { ticks: 8, claimed: true } |
| (new) tests/unit/deferredForcedMove.test.js › a claimed card's forced move meets the move lock a "Which vow?" pick made while another player's move holds the lock still rolls the fulfil | AssertionError: expected { resolved: true, rolled: +0 } to deeply equal { resolved: true, rolled: 1 } |

- New test passing with and without the fix (a control?): tests/unit/deferredForcedMove.test.js › a claimed card's forced move meets the move lock control: the same press after the narration has landed marks 8 ticks
- New test passing with and without the fix (a control?): tests/unit/deferredForcedMove.test.js › a claimed card's forced move meets the move lock control: a typed line that meets the lock is still dropped, not held

### c5cfa95 — fix: a miss's Pay the Price is narrated once, under the move that paid it (issue #325 W03)

Test files: `tests/unit/payThePriceOneRoll.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 4 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/payThePriceOneRoll.test.js › a routed price is narrated once, under the move that paid it (issue #325 W03) a Face Danger miss: no second narration, and the price is recorded under Face Danger | AssertionError: expected 'Face Defeat' to be 'Face Danger' // Object.is equality |
| (new) tests/unit/payThePriceOneRoll.test.js › a routed price is narrated once, under the move that paid it (issue #325 W03) Face Defeat's own price is recorded under Face Defeat, and narrated once | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |

### 7513677 — fix: Heal's care lands on the ally or companion it is for, not the healer (issue #325 W04)

Test files: `tests/unit/healPatient.test.js`. Source restored: 5 file(s).

- With the fix: 12 passed, 0 failed.
- Without it: 11 failed (11 new; 4 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/healPatient.test.js › Heal on an ally heals the ally (issue #325 W04) control: Ash's strong-hit Heal posts the recovery choice, carrying the patient | AssertionError: expected undefined to be 'pc-kira' // Object.is equality |
| (new) tests/unit/healPatient.test.js › Heal on an ally heals the ally (issue #325 W04) the card checks the patient's wound: 'Clear wounded' is offered for wounded Kira, '+3' is not | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/healPatient.test.js › Heal on an ally heals the ally (issue #325 W04) the care reaches Kira, not the healer: her wound is cleared and her health rises by 2 | AssertionError: expected 1 to be 3 // Object.is equality |
| (new) tests/unit/healPatient.test.js › Heal on an ally heals the ally (issue #325 W04) an unwounded ally takes the +3; the healer's own wound is untouched | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/healPatient.test.js › Heal on an ally heals the ally (issue #325 W04) with no target named, the narration's one other PC is the patient of a +wits care | AssertionError: expected undefined to be 'pc-kira' // Object.is equality |
| (new) tests/unit/healPatient.test.js › Heal on an ally heals the ally (issue #325 W04) a weak hit: the recovery is Kira's, its cost (Lose Momentum) is the healer's | AssertionError: expected 1 to be 3 // Object.is equality |
| (new) (API) tests/unit/healPatient.test.js › resolveHealPatient — who the care is for returns null for any other move | TypeError: resolveHealPatient is not a function |
| (new) (API) tests/unit/healPatient.test.js › resolveHealPatient — who the care is for +heart: the companion the narration names, else the only one, else the most hurt | TypeError: resolveHealPatient is not a function |
| (new) (API) tests/unit/healPatient.test.js › resolveHealPatient — who the care is for an ally named as the target by full name, or by a first name no other PC shares | TypeError: resolveHealPatient is not a function |
| (new) (API) tests/unit/healPatient.test.js › resolveHealPatient — who the care is for the narration's PC counts only for a +wits care with no target, and never the roller | TypeError: resolveHealPatient is not a function |
| (new) tests/unit/healPatient.test.js › resolveHealPatient — who the care is for a companion patient has no wound: '+3' is offered, 'Clear wounded' is not | AssertionError: expected true to be false // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/healPatient.test.js › Heal on an ally heals the ally (issue #325 W04) control: tending your own wounds names no patient — the card is the roller's

### cd30f1d — fix: a narration after an X-Card leaves out the removed beat's truths, state and frame (issue #325 W05)

Test files: `tests/unit/xcardLiveLedger.test.js`. Source restored: 2 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/xcardLiveLedger.test.js › a move held at its confirm dialog is narrated from the ledger as it stands then the ledger block does not hand back the X-carded beat's truths, state or frame | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' not to match /cutting torch\|burned hand\|interrogati…/ |
| (new) tests/unit/xcardLiveLedger.test.js › a move held at its confirm dialog is narrated from the ledger as it stands then a `!truth strike` made while the move waits is rendered as struck, not binding | AssertionError: expected ' — BINDING TRUTHS AND CURRENT STATE\n…' not to match /cutting torch/ |

### 338c7dd — fix: the rolling summary cannot bring back a beat the X-Card removed (issue #325 W06)

Test files: `tests/unit/xcardSummaryDrop.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/xcardSummaryDrop.test.js › the X-Card's summary drop survives a move resolved across it persistResolution does not write back the summary the X-Card emptied | AssertionError: expected 'Kira watched the interrogator burn th…' not to contain 'cutting torch' |
| (new) tests/unit/xcardSummaryDrop.test.js › a summary regen in flight when the X-Card is played does not store a summary of the narration the X-Card removed | AssertionError: expected 'Kira reached the docks, then watched …' not to contain 'cutting torch' |

- New test passing with and without the fix (a control?): tests/unit/xcardSummaryDrop.test.js › control: a regen with no X-Card played meanwhile is stored stores the summary

### 0e0b87a — fix: the X-Card puts the ship back where it was before the removed narration (issue #325 W07)

Test files: `tests/unit/xcardShipPosition.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/xcardShipPosition.test.js › the X-Card undoes the ship move its narration made after the X-Card on that narration, the ship is no longer at the removed destination | AssertionError: expected 'act-krell' not to be 'act-krell' // Object.is equality |
| (new) tests/unit/xcardShipPosition.test.js › the X-Card undoes the ship move its narration made after the X-Card, the next prompt's SHIP POSITION line does not name the removed destination | AssertionError: expected 'COMMAND VEHICLE: Wayfinder\nSHIP POSI…' not to match /Krell/ |
| (new) tests/unit/xcardShipPosition.test.js › the X-Card undoes the ship move its narration made a ship the removed narration moved from nowhere recorded is left with no position, not the removed one | AssertionError: expected 'act-krell' to be null |

- New test passing with and without the fix (a control?): tests/unit/xcardShipPosition.test.js › the X-Card undoes the ship move its narration made control: the narration moves the ship (the REQUIRED ship/position emission lands on the ship record)
- New test passing with and without the fix (a control?): tests/unit/xcardShipPosition.test.js › the X-Card undoes the ship move its narration made control: an X-Card on a later narration leaves the ship where an earlier one moved it

### dd955f0 — fix: the system's "Send to chat" move card is not read as player narration (issue #325 W08)

Test files: `tests/unit/vendorMoveCardNotNarration.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/vendorMoveCardNotNarration.test.js › isPlayerNarration and a system chat card the system's 'Send to chat' move card is not player narration | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/vendorMoveCardNotNarration.test.js › isPlayerNarration and a system chat card a system card's class in double quotes, or on a div (ironsworn-roll), is rejected too | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/vendorMoveCardNotNarration.test.js › a system move card on a table a player's 'Send to chat' on Face Danger rolls nothing | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |

- New test passing with and without the fix (a control?): tests/unit/vendorMoveCardNotNarration.test.js › isPlayerNarration and a system chat card control: narration a rich-text chat editor wraps in a paragraph is still narration
- New test passing with and without the fix (a control?): tests/unit/vendorMoveCardNotNarration.test.js › isPlayerNarration and a system chat card control: typed narration still is
- New test passing with and without the fix (a control?): tests/unit/vendorMoveCardNotNarration.test.js › a system move card on a table control: the same player typing narration does run the pipeline

### ea753af — fix: the paced card's Roll button rolls the move as the player who narrated it (issue #325 W09)

Test files: `tests/unit/pacedRollButtonRoller.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/pacedRollButtonRoller.test.js › the paced Roll button credits the narrating PC the GM pressing Roll on Pat's paced card rolls Kira's move | AssertionError: expected [ 'pc-quinn' ] to deeply equal [ 'pc-pat' ] |
| (new) tests/unit/pacedRollButtonRoller.test.js › the paced Roll button credits the narrating PC another player pressing it rolls Kira's move too, and the card records her | AssertionError: expected undefined to be 'pc-pat' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/pacedRollButtonRoller.test.js › the paced Roll button credits the narrating PC control: Pat pressing it rolls Kira

### 512e5e1 — fix: a player's !ptp marks the whole crew unprepared, as the move pipeline does (issue #325 W10)

Test files: `tests/unit/creditTheRoller.test.js`, `tests/unit/ptpCrewUnprepared.test.js`. Source restored: 2 file(s).

- With the fix: 16 passed, 0 failed.
- Without it: 5 failed (5 new; 3 only for a missing export); 11 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/creditTheRoller.test.js › across a booted table !pay-the-price: the routed suffer lands on the typist's PC — once, on the canonical GM | AssertionError: expected [ { on: 'pl-1', …(2) } ] to deeply equal [ { on: 'gm-1', …(2) } ] |
| (new) tests/unit/ptpCrewUnprepared.test.js › a player's !ptp and the crew's shared supply a player's !ptp that takes the shared supply to 0 marks the whole crew unprepared | AssertionError: expected [ true, false ] to deeply equal [ true, true ] |
| (new) (API) tests/unit/ptpCrewUnprepared.test.js › the payThePrice.suffer relay handler refuses a requester who does not own the PC | TypeError: applyPayThePriceSufferFromRelay is not a function |
| (new) (API) tests/unit/ptpCrewUnprepared.test.js › the payThePrice.suffer relay handler drops a route that names no suffer move, or an amount out of range | TypeError: applyPayThePriceSufferFromRelay is not a function |
| (new) (API) tests/unit/ptpCrewUnprepared.test.js › the payThePrice.suffer relay handler control: the owner's route lands on their PC | TypeError: applyPayThePriceSufferFromRelay is not a function |

- New test passing with and without the fix (a control?): tests/unit/ptpCrewUnprepared.test.js › a player's !ptp and the crew's shared supply control: the GM typing the same !ptp for that PC marks both
- New test passing with and without the fix (a control?): tests/unit/ptpCrewUnprepared.test.js › a player's !ptp and the crew's shared supply a player with no PC of their own pays nothing onto another player's PC

### 97fef76 — fix: Battle, a way-out pick, a Develop / Forge suggestion, a reward pick and a vow link each act once, everywhere (issue #325 W11)

Test files: `tests/unit/battleButtonOnce.test.js`, `tests/unit/combatCardButtonsOnce.test.js`, `tests/unit/connectionSuggestionOnce.test.js`, `tests/unit/rewardAndLinkOnce.test.js`. Source restored: 5 file(s).

- With the fix: 12 passed, 0 failed.
- Without it: 12 failed (12 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 12 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/battleButtonOnce.test.js › the ⚔ Battle instead button the player's Battle ends the fight; the GM pressing the same card's Battle afterwards rolls nothing | AssertionError: expected { battles: 2, payThePrice: 1 } to deeply equal { battles: 1, payThePrice: +0 } |
| (new) tests/unit/battleButtonOnce.test.js › the ⚔ Battle instead button the clicker's own Battle button is live again after a re-render | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/battleButtonOnce.test.js › the ⚔ Battle instead button a forced Battle naming a finished fight by id is not rolled | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/combatCardButtonsOnce.test.js › one forced move per combat card after a re-render, a second click does not roll Battle again on the closed fight | AssertionError: expected [ { …(7) }, { …(7) } ] to have a length of 1 but got 2 |
| (new) tests/unit/combatCardButtonsOnce.test.js › one forced move per combat card the way-out card (threshold card → Find another way) rolls its off-ramp move again after a re-render | AssertionError: expected [ { …(7) }, { …(7) } ] to have a length of 1 but got 2 |
| (new) tests/unit/combatCardButtonsOnce.test.js › one forced move per combat card another player's client still shows Battle armed after the fight was resolved | AssertionError: expected [ { …(7) }, { …(7) } ] to have a length of 1 but got 2 |
| (new) tests/unit/connectionSuggestionOnce.test.js › the connection suggestion buttons the player and the GM each pressing "🤝 Develop Relationship" on one move card develop Sable once | AssertionError: expected 16 to be 8 // Object.is equality |
| (new) tests/unit/connectionSuggestionOnce.test.js › the connection suggestion buttons the player's own button is live again after the card re-renders | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/rewardAndLinkOnce.test.js › the reward-choice card a pick promises the reward once; the card is claimed and a second pick changes nothing | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/rewardAndLinkOnce.test.js › the reward-choice card a pick on an old card after the reward was granted does not promise it again | AssertionError: expected { status: 'promised', …(2) } to match object { status: 'granted', …(2) } |
| (new) tests/unit/rewardAndLinkOnce.test.js › the reward-choice card a forsaken vow's lost reward stays lost | AssertionError: expected 'promised' to be 'lost' // Object.is equality |
| (new) tests/unit/rewardAndLinkOnce.test.js › the player-vow card's 🤝 Link links once; the card is claimed and the button stays disabled on re-render | AssertionError: expected undefined to be 'Sable' // Object.is equality |

### ba8f4ad — fix: an asset ability adds what its clause for the move gives, not every add in its text (issue #325 W12)

Test files: `tests/unit/abilityAddsPerClause.test.js`, `tests/unit/abilityScanner.test.js`. Source restored: 1 file(s).

- With the fix: 41 passed, 0 failed.
- Without it: 8 failed (8 new; 0 only for a missing export); 33 still pass (1 new).
- Verdict: **sensitive** — 8 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/abilityAddsPerClause.test.js › extractAdds — the clause for the move being made Gunner: a Clash is +1, not +2; Enter the Fray +1; a Strike, which it does not name, nothing | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/abilityAddsPerClause.test.js › extractAdds — the clause for the move being made Gunslinger: Gain Ground into cover is +1, not +2 | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/abilityAddsPerClause.test.js › extractAdds — the clause for the move being made Infiltrator: Face Danger for a false identity is +1, not +2 | AssertionError: expected 2 to be 1 // Object.is equality |
| (new) tests/unit/abilityAddsPerClause.test.js › extractAdds — the clause for the move being made Stealth Tech: a Strike from hiding gets nothing — the +1 is for the NEXT Strike | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/abilityAddsPerClause.test.js › extractAdds — the clause for the move being made Diplomat and Tech (no move named — the Haiku pass): +1, not +3 | AssertionError: expected 3 to be 1 // Object.is equality |
| (new) tests/unit/abilityAddsPerClause.test.js › scanForApplicableAbilities carries the move's own add a structured Gunner match on Clash offers +1 | AssertionError: expected [ 2 ] to deeply equal [ 1 ] |
| (new) tests/unit/abilityScanner.test.js › extractAdds takes the first add clause, never the sum | AssertionError: expected 3 to be 1 // Object.is equality |
| (new) tests/unit/abilityScanner.test.js › extractAdds an add on the next move is not this roll's | AssertionError: expected 1 to be +0 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/abilityAddsPerClause.test.js › extractAdds — the clause for the move being made control: Ace's single clause gives Face Danger +1

### b702879 — fix: a "count a weak hit as a strong hit" ability never improves a miss (issue #325 W13)

Test files: `tests/unit/improveCountWeakOnly.test.js`, `tests/unit/improveResult.test.js`. Source restored: 2 file(s).

- With the fix: 18 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 14 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/improveCountWeakOnly.test.js › count a weak hit as a strong hit Rockhorn: a weak hit on Companion Takes a Hit is offered the improvement; a miss is not | AssertionError: expected { canImprove: true, …(18) } to be null |
| (new) tests/unit/improveCountWeakOnly.test.js › count a weak hit as a strong hit Heavy Cannons and Brawler: a Clash miss is not improved | AssertionError: expected { canImprove: true, …(18) } to be null |
| (new) tests/unit/improveResult.test.js › extractResultImprovement detects Fugitive's 'improve the result to a strong hit' — from any lower result | AssertionError: expected { improveTo: 'strong_hit' } to deeply equal { improveTo: 'strong_hit', from: null } |
| (new) tests/unit/improveResult.test.js › extractResultImprovement detects 'count as a strong hit' / 'treat as a strong hit' — from a weak hit | AssertionError: expected { improveTo: 'strong_hit' } to deeply equal { improveTo: 'strong_hit', …(1) } |

- New test passing with and without the fix (a control?): tests/unit/improveCountWeakOnly.test.js › count a weak hit as a strong hit control: Fugitive's 'improve the result to a strong hit' is offered on a miss

### beefce0 — fix: an Endure Harm or Endure Stress miss's -1 at 0 is taken as momentum (issue #325 W14)

Test files: `tests/unit/resistMissLossAtZero.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/resistMissLossAtZero.test.js › a resist miss's -1 at 0 Endure Harm miss at 0 health, '-1 health': the harm past 0 is taken as momentum (5 → 4) | AssertionError: expected 5 to be 4 // Object.is equality |
| (new) tests/unit/resistMissLossAtZero.test.js › a resist miss's -1 at 0 the card does not claim a -1 health that nothing took | AssertionError: expected '&lt;div class="sf-card sf-suffer-choice-…' not to match /Applied: Health -1/ |
| (new) tests/unit/resistMissLossAtZero.test.js › a resist miss's -1 at 0 Endure Stress miss at 0 spirit, '-1 spirit': the stress past 0 is taken as momentum (5 → 4) | AssertionError: expected 5 to be 4 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/resistMissLossAtZero.test.js › a resist miss's -1 at 0 control: an Endure Harm miss posts '-1 health' / 'Lose Momentum (-2)'
- New test passing with and without the fix (a control?): tests/unit/resistMissLossAtZero.test.js › a resist miss's -1 at 0 control: above 0, '-1 health' takes the health and leaves momentum

### ef2f120 — fix: "two suffer moves (-1 each)" takes two picks, one suffer move each (issue #325 W15)

Test files: `tests/unit/sufferDialog.test.js`, `tests/unit/twoSufferMoves.test.js`. Source restored: 2 file(s).

- With the fix: 44 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 41 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sufferDialog.test.js › resolveSufferSelection — B1 'any' prompts one suffer move per selection, whatever the count (set_a_course 'two suffer moves -1') | AssertionError: expected [ { kind: 'suffer', …(3) }, …(1) ] to deeply equal [ { kind: 'suffer', …(3) } ] |
| (new) tests/unit/sufferDialog.test.js › resolveSufferSelection — B2 enumerated prompts a nested 'any' sub-prompt of several moves asks for them on a follow-up, even with an anyChoice | AssertionError: expected [ { kind: 'suffer', …(3) }, …(1) ] to deeply equal [ { kind: 'needs-any', …(2) } ] |
| (new) tests/unit/twoSufferMoves.test.js › two suffer moves (-1 each) 'Two suffer moves (-1 each)': one tap applies ONE suffer move at -1, and the card waits for the second | AssertionError: expected 3 to be 4 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/twoSufferMoves.test.js › two suffer moves (-1 each) control: a weak-hit Set a Course posts the three-way choice card

### ffc073e — fix: Sacrifice Resources while unprepared at 0 supply sends the loss to another suffer move (issue #325 W16)

Test files: `tests/unit/sacrificeWhileUnprepared.test.js`. Source restored: 3 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sacrificeWhileUnprepared.test.js › Sacrifice Resources while unprepared at 0 Sacrifice Resources at 0 supply while unprepared does not settle the cost for nothing | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/sacrificeWhileUnprepared.test.js › Sacrifice Resources while unprepared at 0 the picker offers it as unavailable, and the cost is paid by another suffer move | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/sacrificeWhileUnprepared.test.js › Sacrifice Resources while unprepared at 0 a routed loss (no choice offered) posts a picker of the other suffer moves and changes nothing yet | AssertionError: expected { before: +0, after: +0, …(2) } to match object { before: +0, after: +0, …(1) } |

- New test passing with and without the fix (a control?): tests/unit/sacrificeWhileUnprepared.test.js › Sacrifice Resources while unprepared at 0 control: the weak hit posts the 'make a suffer move (-1)' picker
- New test passing with and without the fix (a control?): tests/unit/sacrificeWhileUnprepared.test.js › Sacrifice Resources while unprepared at 0 control: with supply left, Sacrifice Resources is offered and paid

### 1d8613e — fix: Compel, Resupply, Aid Your Ally and Companion Takes a Hit resolve as their move text says (issue #325 W17)

Test files: `tests/unit/aidYourAllyBenefits.test.js`, `tests/unit/moveTextConsequences.test.js`. Source restored: 6 file(s).

- With the fix: 13 passed, 0 failed.
- Without it: 10 failed (10 new; 1 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/aidYourAllyBenefits.test.js › Aid Your Ally — the ally takes the benefits a strong hit: Kira takes +2 momentum and +1 on her next move; Ash takes nothing | AssertionError: expected 2 to be 4 // Object.is equality |
| (new) tests/unit/aidYourAllyBenefits.test.js › Aid Your Ally — the ally takes the benefits a weak hit: the choice card's +2 momentum goes to Kira | TypeError: Cannot read properties of undefined (reading 'flags') |
| (new) tests/unit/moveTextConsequences.test.js › Compel the weak hit takes +1 momentum, as the strong hit does | AssertionError: expected +0 to be 1 // Object.is equality |
| (new) tests/unit/moveTextConsequences.test.js › Resupply the weak hit offers it too | AssertionError: expected undefined to be truthy |
| (new) tests/unit/moveTextConsequences.test.js › Aid Your Ally a miss routes Pay the Price | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/moveTextConsequences.test.js › Aid Your Ally a strong hit is Secure an Advantage's +2 momentum and +1 on the next move — for the ally | AssertionError: expected { momentumChange: +0, …(22) } to match object { momentumChange: 2, …(2) } |
| (new) tests/unit/moveTextConsequences.test.js › Aid Your Ally a weak hit is Secure an Advantage's choice, for the ally | AssertionError: expected undefined to be 'ally' // Object.is equality |
| (new) (API) tests/unit/moveTextConsequences.test.js › Aid Your Ally in a fight: Gain Ground's — a strong hit puts you both in control, a weak hit your ally in control and you in a bad spot | TypeError: (0 , aidYourAllyConsequences) is not a function |
| (new) tests/unit/moveTextConsequences.test.js › Aid Your Ally resolveMove resolves it as Gain Ground only while a fight is open | AssertionError: expected undefined to be 'in_control' // Object.is equality |
| (new) tests/unit/moveTextConsequences.test.js › Companion Takes a Hit a miss with a match makes the death conditional on 0 health | AssertionError: expected 'Miss with a match — companion is dead…' to match /health is 0[^.]*dead or destroyed/i |

- New test passing with and without the fix (a control?): tests/unit/moveTextConsequences.test.js › Compel control: the strong hit takes +1 momentum
- New test passing with and without the fix (a control?): tests/unit/moveTextConsequences.test.js › Resupply control: the strong hit offers the specific item with +1 momentum
- New test passing with and without the fix (a control?): tests/unit/moveTextConsequences.test.js › Companion Takes a Hit control: the miss still offers -1 companion health or Lose Momentum (-2)

### e9118b0 — fix: a bonded Test Your Relationship adds +1, and a vow sworn to a connection +1 (+2 bonded) (issue #325 W18)

Test files: `tests/unit/bondAddsRolled.test.js`, `tests/unit/swearToConnectionAdd.test.js`. Source restored: 3 file(s).

- With the fix: 7 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/bondAddsRolled.test.js › Test Your Relationship Test Your Relationship with the bonded Kira adds +1 | AssertionError: expected +0 to be 1 // Object.is equality |
| (new) tests/unit/swearToConnectionAdd.test.js › Swear an Iron Vow to a connection a vow sworn to a connection adds +1 | AssertionError: expected +0 to be 1 // Object.is equality |
| (new) tests/unit/swearToConnectionAdd.test.js › Swear an Iron Vow to a connection a vow sworn to a bonded connection adds +2 | AssertionError: expected +0 to be 2 // Object.is equality |
| (new) tests/unit/swearToConnectionAdd.test.js › Swear an Iron Vow to a connection a sheet-made vow linked to a connection is sworn to them: its post carries the connection, +1 | AssertionError: expected undefined to be 'Dani Okoro' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/bondAddsRolled.test.js › Test Your Relationship control: Develop Your Relationship with the bonded Kira rolls +rank (+2, dangerous)
- New test passing with and without the fix (a control?): tests/unit/bondAddsRolled.test.js › Test Your Relationship an un-bonded connection adds nothing
- New test passing with and without the fix (a control?): tests/unit/swearToConnectionAdd.test.js › Swear an Iron Vow to a connection control: a swear whose target is nobody the crew knows rolls +heart with no add

### aa93f89 — fix: a typed move rolls a stat it lists, under the Lawful and Balanced dials (issue #325 W19)

Test files: `tests/unit/interpreterStatOnList.test.js`. Source restored: 1 file(s).

- With the fix: 10 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 4 still pass (4 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/interpreterStatOnList.test.js › the lawful dial holds a typed move to its listed stats Gather Information named with +iron rolls +wits (the only stat it lists) | AssertionError: expected 'iron' to be 'wits' // Object.is equality |
| (new) tests/unit/interpreterStatOnList.test.js › the lawful dial holds a typed move to its listed stats Check Your Gear named with +wits rolls +supply | AssertionError: expected 'wits' to be 'supply' // Object.is equality |
| (new) tests/unit/interpreterStatOnList.test.js › the lawful dial holds a typed move to its listed stats Strike named with +heart rolls a stat Strike lists | AssertionError: expected [ 'iron', 'edge' ] to include 'heart' |
| (new) tests/unit/interpreterStatOnList.test.js › the balanced dial holds a typed move to its listed stats Gather Information named with +iron rolls +wits (the only stat it lists) | AssertionError: expected 'iron' to be 'wits' // Object.is equality |
| (new) tests/unit/interpreterStatOnList.test.js › the balanced dial holds a typed move to its listed stats Check Your Gear named with +wits rolls +supply | AssertionError: expected 'wits' to be 'supply' // Object.is equality |
| (new) tests/unit/interpreterStatOnList.test.js › the balanced dial holds a typed move to its listed stats Strike named with +heart rolls a stat Strike lists | AssertionError: expected [ 'iron', 'edge' ] to include 'heart' |

- New test passing with and without the fix (a control?): tests/unit/interpreterStatOnList.test.js › the lawful dial holds a typed move to its listed stats control: Gather Information +wits comes back as read
- New test passing with and without the fix (a control?): tests/unit/interpreterStatOnList.test.js › the balanced dial holds a typed move to its listed stats control: Gather Information +wits comes back as read
- New test passing with and without the fix (a control?): tests/unit/interpreterStatOnList.test.js › the Chaotic dial (maintainer decision: the Trickster may argue for an unusual stat) keeps an unlisted stat the model chose
- New test passing with and without the fix (a control?): tests/unit/interpreterStatOnList.test.js › the Chaotic dial (maintainer decision: the Trickster may argue for an unusual stat) control: the framing asks the model for unusual stats

### 996ce8d — fix: an upgraded result's re-narration and a sheet roll's narration are told the move and its outcome (issue #325 W20)

Test files: `tests/unit/nativeRollMoveOutcome.test.js`, `tests/unit/renarrationMoveOutcome.test.js`. Source restored: 4 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/nativeRollMoveOutcome.test.js › a sheet-rolled vow is narrated knowing how the roll came out the narrator's request names the move and the outcome the sheet rolled | AssertionError: expected '## PLAYER NARRATION — spoken by Kira\…' to match /fulfill your vow/i |
| (new) tests/unit/renarrationMoveOutcome.test.js › an upgraded result is narrated knowing what it upgraded to Burn Momentum: the re-narration names the move and its upgraded outcome | AssertionError: expected '## PLAYER NARRATION — spoken by Kira\…' to match /heal/i |
| (new) tests/unit/renarrationMoveOutcome.test.js › an upgraded result is narrated knowing what it upgraded to Improve Result: the re-narration names the move and its upgraded outcome | AssertionError: expected '## PLAYER NARRATION — spoken by Kira\…' to match /heal/i |

- New test passing with and without the fix (a control?): tests/unit/renarrationMoveOutcome.test.js › an upgraded result is narrated knowing what it upgraded to control: a pipeline resolution (resolveMove) carries its move and outcome into the request

### ec200ff — fix: "Auto" narration perspective counts the players, not the GM (issue #325 W21)

Test files: `tests/unit/narratorPrompt.test.js`, `tests/unit/perspectiveAutoPlayers.test.js`. Source restored: 1 file(s).

- With the fix: 154 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 151 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narratorPrompt.test.js › resolveNarrationPerspective() returns "second_person" for "auto" with a GM and one player — the GM does not count | AssertionError: expected 'third_person' to be 'second_person' // Object.is equality |
| (new) tests/unit/narratorPrompt.test.js › resolveNarrationPerspective() returns "second_person" for "auto" with a solo GM alone, or an inactive second player | AssertionError: expected 'third_person' to be 'second_person' // Object.is equality |
| (new) tests/unit/perspectiveAutoPlayers.test.js › Auto perspective follows the player characters, not the logged-in users a GM and one player with one PC: second person | AssertionError: expected 'third_person' to be 'second_person' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/narratorPrompt.test.js › resolveNarrationPerspective() returns "third_person" for "auto" with 2+ active players
- New test passing with and without the fix (a control?): tests/unit/perspectiveAutoPlayers.test.js › Auto perspective follows the player characters, not the logged-in users control: a solo GM alone is second person

### 75d3777 — fix: an NPC's entity card tells the narrator its real disposition, not "neutral" (issue #325 W22)

Test files: `tests/unit/connectionDisposition.test.js`, `tests/unit/narratorPrompt.test.js`, `tests/unit/pacing.test.js`. Source restored: 4 file(s).

- With the fix: 230 passed, 0 failed.
- Without it: 5 failed (3 new; 0 only for a missing export); 225 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/connectionDisposition.test.js › an NPC card's disposition the sector connection’s rolled disposition is the one its entity card shows | AssertionError: expected { hostile: false, neutral: true } to deeply equal { hostile: true, neutral: false } |
| (new) tests/unit/connectionDisposition.test.js › an NPC card's disposition a seeded NPC’s rolled disposition reaches its entity card | AssertionError: expected '## MIRA KADE — Connection\n\nESTABLIS…' to contain 'Disposition: Suspicious' |
| tests/unit/narratorPrompt.test.js › formatEntityCard includes canonical fields | AssertionError: expected '## SABLE — Connection\n\nESTABLISHED …' to contain 'Disposition: Neutral-wary' |
| (new) tests/unit/pacing.test.js › buildClassifierContext — connection names names each Actor-hosted connection with its disposition | AssertionError: expected 'Connections: Kael Dros, Sable' to be 'Connections: Kael Dros (Helpful), Sab…' // Object.is equality |
| tests/unit/pacing.test.js › buildClassifierContext — connection names says the names are unavailable only when no id resolves | AssertionError: expected 'Connections: Kael Dros' to be 'Connections: Kael Dros (Helpful)' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/connectionDisposition.test.js › an NPC card's disposition a record with no disposition shows no Disposition row — never a default

### c27a789 — fix: a Make a Connection hit on an NPC whose draft card is pending makes the connection for the roller (issue #325 W23)

Test files: `tests/unit/makeConnectionPendingDraft.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/makeConnectionPendingDraft.test.js › Make a Connection and a pending draft a Make a Connection hit on an NPC whose draft card is still pending creates the connection, bonded to the roller | AssertionError: expected { created: false, ren: [], kira: [] } to deeply equal { created: true, …(2) } |
| (new) tests/unit/makeConnectionPendingDraft.test.js › Make a Connection and a pending draft the pending row is marked confirmed on its card | AssertionError: expected 'pending' to be 'confirmed' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/makeConnectionPendingDraft.test.js › Make a Connection and a pending draft control: with no pending draft, a Make a Connection hit creates Sable with the bond on the roller
- New test passing with and without the fix (a control?): tests/unit/makeConnectionPendingDraft.test.js › Make a Connection and a pending draft control: a pending draft the narration does not name is left for the GM

### b68c83d — fix: a fact that reaches a scene while it is being ended is migrated, not cleared (issue #325 W24)

Test files: `tests/unit/endSceneLateFacts.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/endSceneLateFacts.test.js › a fact that reaches the scene while it is being closed is not lost a fact the narration persists while endScene is migrating is archived, migrated or kept — not cleared | AssertionError: expected [ 'Owes the crew a favour' ] to include 'Must reach Ironway before the gate se…' |
| (new) tests/unit/endSceneLateFacts.test.js › a fact that reaches the scene while it is being closed is not lost the late fact is archived exactly once, and the scene still closes | AssertionError: expected [] to have a length of 1 but got +0 |

- New test passing with and without the fix (a control?): tests/unit/endSceneLateFacts.test.js › a fact that reaches the scene while it is being closed is not lost control: a fact that landed before `!scene end` started is archived with the rest
- New test passing with and without the fix (a control?): tests/unit/endSceneLateFacts.test.js › a fact that reaches the scene while it is being closed is not lost control: a fact persisted into a new scene after the store moved on is left to that scene

### a28f53f — fix: a move lock held by a GM who disconnects is released by the next canonical GM (issue #325 W25)

Test files: `tests/unit/moveLockGmHandover.test.js`. Source restored: 3 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/moveLockGmHandover.test.js › a move lock whose GM left after the canonical GM disconnects mid-move, the new canonical GM resolves the next move | AssertionError: expected { moveCards: 1, refusedNotice: true } to deeply equal { moveCards: 2, refusedNotice: false } |
| (new) tests/unit/moveLockGmHandover.test.js › a move lock whose GM left the lock records its claimant, the GMs are told when it is released, and a player leaving releases nothing | AssertionError: expected { worldTruths: { …(14) }, …(36) } to match object { pendingMove: true, …(1) } |

### f28ff0d — fix: entity names, safety lines and track labels are shown as text in the panels (issue #325 W26)

Test files: `tests/unit/panelTextEscaping.test.js`, `tests/unit/trackLabelEscaping.test.js`. Source restored: 3 file(s).

- With the fix: 7 passed, 0 failed.
- Without it: 7 failed (7 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/panelTextEscaping.test.js › entity and safety text renders as text the Entities list row shows the NPC's name and subtitle whole | AssertionError: expected { name: 'Kade ', …(1) } to deeply equal { name: 'Kade &lt;the Ghost>', …(1) } |
| (new) tests/unit/panelTextEscaping.test.js › entity and safety text renders as text the Entities list row injects no element from a name | AssertionError: expected 1 to be +0 // Object.is equality |
| (new) tests/unit/panelTextEscaping.test.js › entity and safety text renders as text the detail view's field values show whole (the header beside them already escapes) | AssertionError: expected 'Fixer ' to be 'Fixer &lt;retired>' // Object.is equality |
| (new) tests/unit/panelTextEscaping.test.js › entity and safety text renders as text the Safety tab lists a GM Line whole | AssertionError: expected 'No graphic  on screen' to be 'No graphic &lt;gore> on screen' // Object.is equality |
| (new) tests/unit/trackLabelEscaping.test.js › a track's name is text wherever it is shown a player's Add with markup in the name: the GM's panel shows the name, and no element is injected | AssertionError: expected { injected: 1, …(1) } to deeply equal { injected: +0, …(1) } |
| (new) tests/unit/trackLabelEscaping.test.js › a track's name is text wherever it is shown an ordinary name with angle brackets is shown whole | AssertionError: expected 'Escape ' to be 'Escape &lt;the Vault>' // Object.is equality |
| (new) tests/unit/trackLabelEscaping.test.js › a track's name is text wherever it is shown the display Progress Roll card (pre-session / scene challenge) escapes the name too | AssertionError: expected '&lt;div class="starforged-move-card prog…' to contain 'Outrun &lt;the storm&gt;' |

### 7a9426c — fix: a vow fulfilled on the sheet and then through the pipeline pays its Quests legacy once (issue #325 W28)

Test files: `tests/unit/fulfilLegacyOnce.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/fulfilLegacyOnce.test.js › a vow fulfilled on the sheet, then through the pipeline a vow fulfilled on the sheet, then through the pipeline, pays its Quests legacy once | AssertionError: expected 4 to be 2 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/fulfilLegacyOnce.test.js › a vow fulfilled on the sheet, then through the pipeline control: a vow fulfilled only through the pipeline pays its legacy

### 79a2b8e — fix: a victory card's buttons never act on another vow once theirs is fulfilled (issue #325 W29)

Test files: `tests/unit/milestone.test.js`, `tests/unit/wonFightCardAfterFulfil.test.js`. Source restored: 3 file(s).

- With the fix: 43 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 37 still pass (2 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/milestone.test.js › selectMilestoneVow resolves nothing when the named vow is completed — never the sole open vow | AssertionError: expected { id: 'b', name: 'Beta', …(2) } to be null |
| (new) tests/unit/wonFightCardAfterFulfil.test.js › a victory card whose vow is fulfilled "⚑ Mark milestone" on the fulfilled vow's victory card marks no other vow | AssertionError: expected 40 to be 24 // Object.is equality |
| (new) tests/unit/wonFightCardAfterFulfil.test.js › a victory card whose vow is fulfilled "🏁 Attempt to Fulfill" on the fulfilled vow's victory card neither rolls nor fulfils another vow | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/wonFightCardAfterFulfil.test.js › a victory card whose vow is fulfilled a Fulfill Your Vow naming the fulfilled vow (typed, or an old 🏁) is not rolled, and scores no other vow | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/wonFightCardAfterFulfil.test.js › a victory card whose vow is fulfilled the victory card's 🏁 is live again after any re-render, on every client | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/wonFightCardAfterFulfil.test.js › a victory card whose vow is fulfilled a card for a fulfilled vow renders its milestone and 🏁 disabled, on every client | AssertionError: expected false to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/milestone.test.js › selectMilestoneVow control: a name that matches nothing still falls back to the sole open vow
- New test passing with and without the fix (a control?): tests/unit/wonFightCardAfterFulfil.test.js › a victory card whose vow is fulfilled control: with "Rescue Vex" still open, the same two presses mark and fulfil "Rescue Vex" only

### cca0c79 — fix: a name inside another word no longer selects a connection, vow, fight or site; !sever needs one fit (issue #325 W30)

Test files: `tests/unit/selectorWholeWords.test.js`, `tests/unit/severFragment.test.js`. Source restored: 8 file(s).

- With the fix: 18 passed, 0 failed.
- Without it: 13 failed (13 new; 2 only for a missing export); 5 still pass (5 new).
- Verdict: **sensitive** — 11 assertion(s) fail without the fix; 5 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/selectorWholeWords.test.js › wholeWordsFit fits one name inside the other as whole words, either way | TypeError: (0 , wholeWordsFit) is not a function |
| (new) (API) tests/unit/selectorWholeWords.test.js › wholeWordsFit never fits a name inside another word | TypeError: (0 , wholeWordsFit) is not a function |
| (new) tests/unit/selectorWholeWords.test.js › selectConnection — a name inside another word is not that name "Lorenzo" does not select Ren | AssertionError: expected { _id: 'c-ren', name: 'Ren', …(4) } to be null |
| (new) tests/unit/selectorWholeWords.test.js › the vow ladders a Fulfill Your Vow naming "Kade is avenged" does not score the vow "Ade" — the roller picks | AssertionError: expected 'Ade' to be null |
| (new) tests/unit/selectorWholeWords.test.js › the vow ladders a Reach a Milestone naming "Kade is avenged" marks neither vow | AssertionError: expected { id: 'v1', name: 'Ade', …(5) } to be null |
| (new) tests/unit/selectorWholeWords.test.js › the vow ladders selectVowTrack: "Kade is avenged" is not the vow track "Ade" | AssertionError: expected { id: 't1', label: 'Ade', …(2) } to be null |
| (new) tests/unit/selectorWholeWords.test.js › the track and site ladders selectCombatTrack: "Hornet swarm" is not the fight with "Orne" | AssertionError: expected { id: 'c1', label: 'Orne', …(2) } to be null |
| (new) tests/unit/selectorWholeWords.test.js › the track and site ladders selectExpeditionTrack: "Ironhold" is not the expedition to "Iron" | AssertionError: expected { id: 'e1', label: 'Iron', …(2) } to be null |
| (new) tests/unit/selectorWholeWords.test.js › the track and site ladders selectSectorSite: "Archway" is not the site "Arch"; "Sunken" still finds the Sunken Vault | AssertionError: expected 's1' to be null |
| (new) tests/unit/severFragment.test.js › !sever — the typed name is a fragment of one connection's name `!sever Lyssa Chen` severs Dr. Lyssa Chen — not the connection named "Chen" | AssertionError: expected { chen: false, lyssa: true, …(1) } to deeply equal { chen: true, lyssa: false, …(1) } |
| (new) tests/unit/severFragment.test.js › !sever — the typed name is a fragment of one connection's name a fragment that fits two connections severs nobody, and says which it fits | AssertionError: expected { l1: false, l2: true, …(1) } to deeply equal { l1: true, l2: true, cards: [] } |
| (new) tests/unit/severFragment.test.js › !sever — the typed name is a fragment of one connection's name a fragment inside another word severs nobody | AssertionError: expected { ren: false, cards: [ 'Ren' ] } to deeply equal { ren: true, cards: [] } |
| (new) tests/unit/severFragment.test.js › resolveVowItemCopies — a vow named inside another word is not that vow "Kade is avenged" resolves neither of two open vows | AssertionError: expected { actor: { id: 'pc-a', …(13) }, …(1) } to be null |

- New test passing with and without the fix (a control?): tests/unit/selectorWholeWords.test.js › selectConnection — a name inside another word is not that name "Captain Ren" selects Ren (a whole-word substring)
- New test passing with and without the fix (a control?): tests/unit/selectorWholeWords.test.js › selectConnection — a name inside another word is not that name a name matching no one, with two bonded connections, is ambiguous (null)
- New test passing with and without the fix (a control?): tests/unit/selectorWholeWords.test.js › the vow ladders a vow named in a longer phrase is still found
- New test passing with and without the fix (a control?): tests/unit/severFragment.test.js › !sever — the typed name is a fragment of one connection's name control: a unique fragment, or the exact name, severs that connection
- New test passing with and without the fix (a control?): tests/unit/severFragment.test.js › resolveVowItemCopies — a vow named inside another word is not that vow control: a phrase naming the vow in whole words resolves it

### 141bf63 — fix: the NPC seed keeps the goal and look the narration gave them (issue #325 W31)

Test files: `tests/unit/entityExtractor.test.js`, `tests/unit/narratorDetailPersistence.test.js`, `tests/unit/seedKeepsNarratedIdentity.test.js`, `tests/unit/vignettePronouns.test.js`. Source restored: 5 file(s).

- With the fix: 161 passed, 0 failed.
- Without it: 7 failed (4 new; 0 only for a missing export); 154 still pass (1 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/entityExtractor.test.js › buildConnectionSeedData combines detector description with oracle first-look for journal description | AssertionError: expected undefined to be 'Settle a debt' // Object.is equality |
| tests/unit/entityExtractor.test.js › buildConnectionSeedData uses safe defaults when seed is null | AssertionError: expected undefined to be '' // Object.is equality |
| (new) tests/unit/entityExtractor.test.js › routeEntityDrafts — connection seed backfill on auto-create seeds the auto-created connection journal with role, goal, and oracle first-look | AssertionError: expected '' to be 'Settle a debt' // Object.is equality |
| tests/unit/narratorDetailPersistence.test.js › Confirm on a draft card keeps what the narration said about them (D3) the role and goal the detection pass read from the prose win over the oracle; no rolled first look over a narrated one | AssertionError: expected { _id: 'p1iuls5SBhwYjxqW', …(25) } to match object { role: 'quartermaster', …(3) } |
| (new) tests/unit/seedKeepsNarratedIdentity.test.js › Make a Connection, then ✦ Finalise Finalise keeps the goal and first look the Make a Connection narration was written from | AssertionError: expected { …(4) } to deeply equal { …(4) } |
| (new) tests/unit/seedKeepsNarratedIdentity.test.js › a draft Confirm with Auto-Seed on (booted table) the seeded card keeps the narrated goal and rolls no first look for a described NPC | AssertionError: expected { …(3) } to deeply equal { …(3) } |
| (new) tests/unit/vignettePronouns.test.js › selectEndSessionNPC — connection hint carries pronouns (finding R) carries the connection's goal — a detected NPC's narrated goal is on `goal` (issue #325 W31) | AssertionError: expected 'Pronouns: she/her · Role: courier' to contain 'Goal: pay off her debt' |

- New test passing with and without the fix (a control?): tests/unit/seedKeepsNarratedIdentity.test.js › the seed rolls only what nobody established control: an NPC created with no description and no goal still gets a rolled goal and first look

### 817b0f6 — fix: the galley vignette puts a solo GM's own PC in the galley (issue #325 W32)

Test files: `tests/unit/galleyParticipants.test.js`, `tests/unit/galleySoloGm.test.js`. Source restored: 2 file(s).

- With the fix: 10 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 6 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/galleySoloGm.test.js › the galley vignette counts the PCs of the users at the table solo GM without a User.character: the lone PC is in the galley, not absent | AssertionError: expected { active: [], absent: [ 'pc-kira' ] } to deeply equal { active: [ 'pc-kira' ], absent: [] } |
| (new) tests/unit/galleySoloGm.test.js › the galley vignette counts the PCs of the users at the table solo GM running two PCs: both are in the galley | AssertionError: expected [] to deeply equal [ 'pc-bex', 'pc-kira' ] |
| (new) tests/unit/galleySoloGm.test.js › the galley vignette counts the PCs of the users at the table a mixed table: a connected player's own PC is present, an offline player's absent, a GM-run PC present | AssertionError: expected { active: [], absent: [ …(3) ] } to deeply equal { …(2) } |
| (new) tests/unit/galleySoloGm.test.js › the galley vignette counts the PCs of the users at the table with no GM connected, a GM-run PC is absent | AssertionError: expected { active: [], absent: [ …(2) ] } to deeply equal { active: [ 'pc-pat' ], …(1) } |

- New test passing with and without the fix (a control?): tests/unit/galleySoloGm.test.js › the galley vignette counts the PCs of the users at the table control: a GM who set User.character has their PC in the galley

### f96221a — fix: a Markdown-bold label in the inciting proposal is read as a label (issue #325 W33)

Test files: `tests/unit/incitingBoldLabels.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/incitingBoldLabels.test.js › splitIncitingMeta — a Markdown-bold label is a label reads every proposal line without the label's Markdown, and cuts them all from the prose | AssertionError: expected { Object (vow, clock, ...) } to deeply equal { Object (vow, clock, ...) } |
| (new) tests/unit/incitingBoldLabels.test.js › splitIncitingMeta — a Markdown-bold label is a label the other Markdown shapes of a labelled line | AssertionError: expected null to match object { statement: 'Find the Archive', …(1) } |
| (new) tests/unit/incitingBoldLabels.test.js › the inciting card and the swear the card's proposal carries the vow, clock and target without the label's Markdown | AssertionError: expected '** I will find Dani before the Covena…' to be 'I will find Dani before the Covenant …' // Object.is equality |
| (new) tests/unit/incitingBoldLabels.test.js › the inciting card and the swear swearing it creates no second connection for the established Dani Okoro | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |

- New test passing with and without the fix (a control?): tests/unit/incitingBoldLabels.test.js › splitIncitingMeta — a Markdown-bold label is a label control: plain labels read as before

### 016e54e — fix: the World Journal panel's Override no longer deletes a fact-continuity catch (issue #325 W34)

Test files: `tests/unit/wjPanelFactCatch.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/wjPanelFactCatch.test.js › the World Journal panel and a fact-continuity catch the catch gets Correct… and Dismiss, never the lore actions; a lore contradiction keeps them | AssertionError: expected [ 'reviewContradiction', …(2) ] to deeply equal [ 'correctContradiction', …(1) ] |
| (new) tests/unit/wjPanelFactCatch.test.js › the World Journal panel and a fact-continuity catch Override refuses the catch: the card and its Retract button stay, and nothing is promoted | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/wjPanelFactCatch.test.js › the World Journal panel and a fact-continuity catch Correct… opens the card's correction dialog and keeps the card | TypeError: Cannot read properties of undefined (reading 'call') |

- New test passing with and without the fix (a control?): tests/unit/wjPanelFactCatch.test.js › the World Journal panel and a fact-continuity catch control: the catch is posted with the Retract button and listed in the panel
- New test passing with and without the fix (a control?): tests/unit/wjPanelFactCatch.test.js › the World Journal panel and a fact-continuity catch control: Override on a lore contradiction still promotes the lore and clears the card

### 1894d71 — fix: a World Truths save of one category is recorded and reaches the narrator (issue #325 W35)

Test files: `tests/unit/creditTheRoller.test.js`, `tests/unit/truthsSingleCategorySave.test.js`. Source restored: 2 file(s).

- With the fix: 15 passed, 0 failed.
- Without it: 3 failed (3 new; 1 only for a missing export); 12 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/truthsSingleCategorySave.test.js › holdsTruths — one category with a truth under it is a save one category, two categories: truths; an empty page or a bare heading: none | TypeError: (0 , holdsTruths) is not a function |
| (new) tests/unit/truthsSingleCategorySave.test.js › a one-truth save of the World Truths dialog is recorded (booted table) the GM saves only the Iron truth: it becomes the campaign's truths | AssertionError: expected { linked: 'j-iron', set: false, …(1) } to deeply equal { linked: 'j-iron', set: true, …(1) } |
| (new) tests/unit/truthsSingleCategorySave.test.js › a one-truth save of the World Truths dialog is recorded (booted table) a one-truth save made before the fix is recorded when the world loads | AssertionError: expected { wrote: false, linked: null, …(2) } to deeply equal { wrote: true, linked: 'j-old', …(2) } |

- New test passing with and without the fix (a control?): tests/unit/truthsSingleCategorySave.test.js › a one-truth save of the World Truths dialog is recorded (booted table) an empty page (the dialog's timing gap) is not a save
- New test passing with and without the fix (a control?): tests/unit/truthsSingleCategorySave.test.js › a one-truth save of the World Truths dialog is recorded (booted table) control: a two-truth save is recorded

### 5e5bca0 — fix: the paced card's Roll button is the move its hint invites, never a social move against a PC (issue #325 W36)

Test files: `tests/unit/pacedHintMove.test.js`. Source restored: 1 file(s).

- With the fix: 8 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/pacedHintMove.test.js › the Roll button is the move the hint invites "…before the battle could be a Heal." is Heal, not Battle | AssertionError: expected 'battle' to be 'heal' // Object.is equality |
| (new) tests/unit/pacedHintMove.test.js › the Roll button is the move the hint invites "…before the next battle would be a Repair." is Repair, not Battle | AssertionError: expected 'battle' to be 'repair' // Object.is equality |
| (new) tests/unit/pacedHintMove.test.js › the Roll button is the move the hint invites a capital that only opens the sentence is not "written as a move" | AssertionError: expected 'battle' to be 'clash' // Object.is equality |
| (new) tests/unit/pacedHintMove.test.js › no Roll button offers a social move against a fellow PC the narrator's Compel hint does not reach the button when the input names another PC — the nomination stands | AssertionError: expected 'compel' to be 'gather_information' // Object.is equality |
| (new) tests/unit/pacedHintMove.test.js › no Roll button offers a social move against a fellow PC reconcileSuggestedMove guards the hint when told the input | AssertionError: expected 'compel' to be 'gather_information' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/pacedHintMove.test.js › the Roll button is the move the hint invites a move written as a move wins over a lowercase noun named after it
- New test passing with and without the fix (a control?): tests/unit/pacedHintMove.test.js › the Roll button is the move the hint invites control: a hint that names only the move reads correctly
- New test passing with and without the fix (a control?): tests/unit/pacedHintMove.test.js › no Roll button offers a social move against a fellow PC control: addressing an NPC, the hint still wins (finding J)

### 5d02b19 — fix: the sector roster lists a lost connection apart, saying how it was lost (issue #325 W37)

Test files: `tests/unit/sectorRosterLostConnection.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorRosterLostConnection.test.js › a lost connection is not offered as friendly cast after a severance, the ACTIVE SECTOR line for Vex says the connection was lost, and how | AssertionError: expected '- Vex Marrow — Smuggler (Goal: Clear …' to match /connection lost: betrayed the crew to…/ |
| (new) tests/unit/sectorRosterLostConnection.test.js › a lost connection is not offered as friendly cast the lost connection is listed apart from the reuse-first cast | AssertionError: expected -1 to be greater than 26 |
| (new) tests/unit/sectorRosterLostConnection.test.js › a lost connection is not offered as friendly cast a record lost with no recorded reason still says "connection lost" | AssertionError: expected 'Kade — Fixer' to be 'Kade — Fixer (connection lost)' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/sectorRosterLostConnection.test.js › a lost connection is not offered as friendly cast control: an active connection is listed with its profile

### `scripts/defects/w27-short-calls-thinking-on.patch` — W27 (issue #325) — the chronicle scribe and the other short structured calls on the narration model send no `thinking` field, so Sonnet 5 runs adaptive thinking inside their small max_tokens cap

Test files: `tests/unit/shortCallsThinkingOff.test.js`.

- On HEAD: 5 passed, 0 failed.
- With the defect: 3 failed (0 only for a missing export); 2 still pass.
- Verdict: **sensitive** — 3 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/shortCallsThinkingOff.test.js › the rule Sonnet 5 turns thinking off; Sonnet 4.5 is left alone; Sonnet 5.5 is never sent "disabled" | AssertionError: expected {} to deeply equal { thinking: { type: 'disabled' } } |
| tests/unit/shortCallsThinkingOff.test.js › the calls on the Sonnet 5 narration model the chronicle scribe turns thinking off for its 200-token JSON reply | AssertionError: expected { model: 'claude-sonnet-5', …(3) } to match object { model: 'claude-sonnet-5', …(2) } |
| tests/unit/shortCallsThinkingOff.test.js › the calls on the Sonnet 5 narration model an NPC seed's introduction turns thinking off | AssertionError: expected undefined to deeply equal { type: 'disabled' } |

### 6799371 — fix: a move the model names by its display name is read as that move (issue #326 W38)

Test files: `tests/unit/interpreterMoveDisplayName.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/interpreterMoveDisplayName.test.js › interpretMove() — a move named by its display name (issue #326 W38) "Gather Information" is read as gather_information, not the Face Danger fallback | AssertionError: expected { …(17) } to match object { moveId: 'gather_information', …(2) } |
| (new) tests/unit/interpreterMoveDisplayName.test.js › interpretMove() — a move named by its display name (issue #326 W38) a hyphenated or differently-cased name is read too | AssertionError: expected 'face_danger' to be 'gather_information' // Object.is equality |
| (new) tests/unit/interpreterMoveDisplayName.test.js › interpretMove() — a move named by its display name (issue #326 W38) an unknown id with a known moveName is read by the name | AssertionError: expected 'face_danger' to be 'gather_information' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/interpreterMoveDisplayName.test.js › interpretMove() — a move named by its display name (issue #326 W38) control: toMoveId maps the display name to the key
- New test passing with and without the fix (a control?): tests/unit/interpreterMoveDisplayName.test.js › interpretMove() — a move named by its display name (issue #326 W38) control: a name that is no move still falls back to Face Danger

### e7b3550 — fix: an entity card carries an NPC's or a ship's Notes as text (issue #326 W39)

Test files: `tests/unit/entityCardNotesText.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityCardNotesText.test.js › a ship's entity card is text, not its Notes HTML (issue #326 W39) after !ship envision, ENTITIES IN SCENE carries no HTML markup or image path | AssertionError: expected '## WAYFARER — Ship\n\nESTABLISHED FAC…' not to match /&lt;\/?(?:div\|img\|…/?(?:div\|img\|p\|hr\|h4)\b |
| (new) tests/unit/entityCardNotesText.test.js › formatEntityCard — Notes as text (issue #326 W39) an NPC's Notes drop the portrait block and markup, decode entities, keep the prose on one line | AssertionError: expected '  Notes: &lt;div class="sf-ship-portrait…' to be '  Notes: Smuggler & fixer. History Ow…' // Object.is equality |
| (new) tests/unit/entityCardNotesText.test.js › formatEntityCard — Notes as text (issue #326 W39) prose in angle brackets is kept as text — only HTML tags are dropped | AssertionError: expected '## RELAY NINE — Location\n\nESTABLISH…' to contain 'Notes: Its last log reads &lt;signal los…' |
| (new) tests/unit/entityCardNotesText.test.js › formatEntityCard — Notes as text (issue #326 W39) control: plain-text notes are shown as written; notes that are only a portrait are left out | AssertionError: expected '## KESTREL — Ship\n\nESTABLISHED FACT…' not to contain 'Notes:' |

### 0967769 — fix: each narrator mode is told one length — its own (issue #326 W40)

Test files: `tests/unit/narratorModeLength.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narratorModeLength.test.js › each narrator mode is told one length — its own (issue #326 W40) @scene: the request carries the Scene Response Length, not the move-narration Length | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' not to contain 'Length: 6 sentences' |
| (new) tests/unit/narratorModeLength.test.js › each narrator mode is told one length — its own (issue #326 W40) campaign recap: the system prompt does not say "Length: 3 sentences" beside "3–5 paragraphs" | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' not to contain 'Length: 3 sentences' |
| (new) tests/unit/narratorModeLength.test.js › each narrator mode is told one length — its own (issue #326 W40) the vignette, inciting, vow, clock and oracle modes carry no Length line | AssertionError: session_vignette: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' not to match /Length: \d+ sentence/ |

- New test passing with and without the fix (a control?): tests/unit/narratorModeLength.test.js › each narrator mode is told one length — its own (issue #326 W40) control: move and paced narration keep the Length setting in STYLE

### 78e2c81 — fix: the X-Card restores the state an earlier, kept narration recorded (issue #326 W41)

Test files: `tests/unit/xcardRestoresEarlierState.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/xcardRestoresEarlierState.test.js › the X-Card on narration B leaves narration A's state in place (issue #326 W41) the dockmaster's location is A's again, not erased | AssertionError: expected undefined to deeply equal [ ObjectContaining{…} ] |
| (new) tests/unit/xcardRestoresEarlierState.test.js › the X-Card on narration B leaves narration A's state in place (issue #326 W41) a later value can never fall back to one the X-Card removed | AssertionError: expected undefined to deeply equal [ ObjectContaining{…} ] |
| (new) tests/unit/xcardRestoresEarlierState.test.js › the X-Card on narration B leaves narration A's state in place (issue #326 W41) a beat of two narrations restores what stood before both | AssertionError: expected undefined to deeply equal [ ObjectContaining{…} ] |
| (new) tests/unit/xcardRestoresEarlierState.test.js › the X-Card on narration B leaves narration A's state in place (issue #326 W41) an entry keeps a bounded chain of the values it superseded | AssertionError: expected { attribute: 'location', …(3) } to match object { value: 'deck 11', …(1) } |

- New test passing with and without the fix (a control?): tests/unit/xcardRestoresEarlierState.test.js › the X-Card on narration B leaves narration A's state in place (issue #326 W41) control: B's own values are gone after the X-Card
- New test passing with and without the fix (a control?): tests/unit/xcardRestoresEarlierState.test.js › the X-Card on narration B leaves narration A's state in place (issue #326 W41) control: a value no earlier narration set is removed outright

### 563fbf9 — fix: an X-Card on a move started from a button removes only that move's narration (issue #326 W42)

Test files: `tests/unit/xcardBeatForcedMove.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/xcardBeatForcedMove.test.js › the X-Card removes the narration it answers, not the beat before the player acted (issue #326 W42) a move started from the Roll button: only the move narration is X-carded | AssertionError: expected [ 'nar-paced', 'nar-move' ] to deeply equal [ 'nar-move' ] |
| (new) tests/unit/xcardBeatForcedMove.test.js › the X-Card removes the narration it answers, not the beat before the player acted (issue #326 W42) a move started from a milestone / way-out button post: the paced narration before it is not removed | AssertionError: expected [ 'nar-paced', 'nar-move' ] to deeply equal [ 'nar-move' ] |

- New test passing with and without the fix (a control?): tests/unit/xcardBeatForcedMove.test.js › the X-Card removes the narration it answers, not the beat before the player acted (issue #326 W42) control: the same move typed by hand — only the move narration is X-carded
- New test passing with and without the fix (a control?): tests/unit/xcardBeatForcedMove.test.js › the X-Card removes the narration it answers, not the beat before the player acted (issue #326 W42) control: a narration with no player act between it and the paced card is in the same beat

### 96648ac — fix: a won fight's ×2 milestone that falls to the vow picker marks the picked vow twice (issue #326 W43)

Test files: `tests/unit/milestonePicker.test.js`, `tests/unit/wonFightMilestonePickerMarks.test.js`. Source restored: 2 file(s).

- With the fix: 19 passed, 0 failed.
- Without it: 3 failed (2 new; 0 only for a missing export); 16 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/milestonePicker.test.js › across a booted table the GM's pipeline posts the picker, offering exactly the open vows | AssertionError: expected [ …(2) ] to deeply equal [ { vowId: 'v-b1', …(2) }, …(1) ] |
| (new) tests/unit/wonFightMilestonePickerMarks.test.js › a won fight's milestone count rides the vow picker (issue #326 W43) a ×2 milestone that falls to the picker marks the picked vow twice | AssertionError: expected 8 to be 16 // Object.is equality |
| (new) tests/unit/wonFightMilestonePickerMarks.test.js › a won fight's milestone count rides the vow picker (issue #326 W43) the ×2 picker says so and stamps the marks on every choice | AssertionError: expected '&lt;div class="sf-ptp-card">&lt;strong>⚑ Re…' to contain 'Reach a Milestone (×2)' |

- New test passing with and without the fix (a control?): tests/unit/wonFightMilestonePickerMarks.test.js › a won fight's milestone count rides the vow picker (issue #326 W43) control: a Reach a Milestone with two open vows and none named marks the picked vow once

### 46ccad0 — fix: fulfilling one vow never completes another vow's journal twin (issue #326 W44)

Test files: `tests/unit/finishVowByName.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/finishVowByName.test.js › vow.js finishVow — a named vow closes only a track of that name (issue #326 W44) a name no journal vow carries completes no journal vow | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/finishVowByName.test.js › fulfilling one vow leaves another vow's journal twin open (pipeline) Fulfill Your Vow on "Avenge Kade" does not complete Find the Archive's journal track | AssertionError: expected true to be false // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/finishVowByName.test.js › vow.js finishVow — a named vow closes only a track of that name (issue #326 W44) control: the named vow's own journal track is the one completed
- New test passing with and without the fix (a control?): tests/unit/finishVowByName.test.js › vow.js finishVow — a named vow closes only a track of that name (issue #326 W44) control: a name inside a longer label still matches as whole words
- New test passing with and without the fix (a control?): tests/unit/finishVowByName.test.js › vow.js finishVow — a named vow closes only a track of that name (issue #326 W44) control: with no name, the sole open journal vow is still the one finished

### 099e7d9 — fix: a combat move's position with two fights open lands on the roller's own fight (issue #326 W45)

Test files: `tests/unit/positionRollerFight.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/positionRollerFight.test.js › a combat move's position with two fights open and no foe named (issue #326 W45) React Under Fire's "in control" lands on the roller's own fight, and steers her next move | AssertionError: expected 'bad_spot' to be 'in_control' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/positionRollerFight.test.js › a combat move's position with two fights open and no foe named (issue #326 W45) Ren's fight is left alone
- New test passing with and without the fix (a control?): tests/unit/positionRollerFight.test.js › a combat move's position with two fights open and no foe named (issue #326 W45) control: a roller who has no position in either fight is still not guessed into one
- New test passing with and without the fix (a control?): tests/unit/positionRollerFight.test.js › a combat move's position with two fights open and no foe named (issue #326 W45) control: with one fight open the same move writes the roller's position

### 94c5f91 — fix: a Finish an Expedition hit posts no Set a Course card (issue #326 W46)

Test files: `tests/unit/finishExpeditionNoCourseCard.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/finishExpeditionNoCourseCard.test.js › A Finish an Expedition arrival posts no Set a Course card (issue #326 W46) a Finish an Expedition strong hit posts no "Set a Course resolved (+1 momentum)" card | AssertionError: expected [ Array(1) ] to deeply equal [] |

- New test passing with and without the fix (a control?): tests/unit/finishExpeditionNoCourseCard.test.js › A Finish an Expedition arrival posts no Set a Course card (issue #326 W46) control: the finish reveals the expedition's linked site, and the working-copy reveal rides the persist
- New test passing with and without the fix (a control?): tests/unit/finishExpeditionNoCourseCard.test.js › A Finish an Expedition arrival posts no Set a Course card (issue #326 W46) control: a Set a Course strong hit posts its feedback card

### 76edf21 — fix: a matched waypoint's discovery is rolled once, by the move the player chooses (issue #326 W47)

Test files: `tests/unit/resolver.test.js`, `tests/unit/waypointDiscoveryOnce.test.js`. Source restored: 1 file(s).

- With the fix: 299 passed, 0 failed.
- Without it: 6 failed (4 new; 0 only for a missing export); 293 still pass (1 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/resolver.test.js › buildOracleSeeds play-kit consequence tables seeds the notable-aspect prompt, not the Make a Discovery table, on explore_a_waypoint strong-with-match | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/resolver.test.js › buildOracleSeeds play-kit consequence tables seeds no Confront Chaos table result on explore_a_waypoint miss-with-match | AssertionError: expected true to be false // Object.is equality |
| tests/unit/resolver.test.js › one Pay the Price per result (issue #321 U03) control: a miss whose other seeds roll keeps them | AssertionError: expected [ …(2) ] to not include 'Confront Chaos: roll:confront_chaos' |
| tests/unit/resolver.test.js › explore_a_waypoint — site-aware seeds (SITE-WAYPOINT-BLIND fix, 2026-07) seeds vault peril on a miss and opportunity on a strong-hit match | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/waypointDiscoveryOnce.test.js › the discovery a matched waypoint offers is rolled once — by Make a Discovery (issue #326 W47) strong hit with a match → Make a Discovery: one discovery, not two | AssertionError: expected 'Make a Discovery: make_a_discovery en…' to be null |
| (new) tests/unit/waypointDiscoveryOnce.test.js › the discovery a matched waypoint offers is rolled once — by Make a Discovery (issue #326 W47) miss with a match → Confront Chaos: one chaos result, not two | AssertionError: expected 'Confront Chaos: confront_chaos entry …' to be null |

- New test passing with and without the fix (a control?): tests/unit/waypointDiscoveryOnce.test.js › the discovery a matched waypoint offers is rolled once — by Make a Discovery (issue #326 W47) control: the forced Make a Discovery move seeds its narration with a table result

### 06fa150 — fix: a bonded Develop Your Relationship takes Take a Break's +1 and the next-move bonus (issue #326 W48)

Test files: `tests/unit/bondedDevelopTakesNextMoveAdd.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/bondedDevelopTakesNextMoveAdd.test.js › Take a Break's +1 and the bonded Develop Your Relationship roll (issue #326 W48) the bonded development (+rank, an action roll) takes the +1 too | AssertionError: expected +0 to be 1 // Object.is equality |
| (new) tests/unit/bondedDevelopTakesNextMoveAdd.test.js › Take a Break's +1 and the bonded Develop Your Relationship roll (issue #326 W48) the roller's own "+1 on your next move" is taken by a bonded development too | AssertionError: expected +0 to be 1 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/bondedDevelopTakesNextMoveAdd.test.js › Take a Break's +1 and the bonded Develop Your Relationship roll (issue #326 W48) control: an ordinary action roll (Face Danger) takes the +1
- New test passing with and without the fix (a control?): tests/unit/bondedDevelopTakesNextMoveAdd.test.js › Take a Break's +1 and the bonded Develop Your Relationship roll (issue #326 W48) control: an un-bonded development (no roll) leaves the +1 pending

### 91b2113 — fix: a stat substitution chosen for Endure Harm or Endure Stress is the stat rolled (issue #326 W49)

Test files: `tests/unit/endureStatSubstitution.test.js`. Source restored: 1 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/endureStatSubstitution.test.js › Endure Harm / Endure Stress with a stat substitution (issue #326 W49) the +wits the player chose (Vanguard) is rolled: +3 | AssertionError: expected { moveId: 'endure_stress', …(4) } to match object { statUsed: 'wits', statValue: 3 } |
| (new) tests/unit/endureStatSubstitution.test.js › Endure Harm / Endure Stress with a stat substitution (issue #326 W49) Endure Harm keeps a chosen substitution too | AssertionError: expected { moveId: 'endure_harm', …(4) } to match object { statUsed: 'wits', statValue: 3 } |

- New test passing with and without the fix (a control?): tests/unit/endureStatSubstitution.test.js › Endure Harm / Endure Stress with a stat substitution (issue #326 W49) control: without a substitution it rolls the higher of spirit and heart
- New test passing with and without the fix (a control?): tests/unit/endureStatSubstitution.test.js › Endure Harm / Endure Stress with a stat substitution (issue #326 W49) control: the sheet reads wits 3 (a move that lists wits)
- New test passing with and without the fix (a control?): tests/unit/endureStatSubstitution.test.js › Endure Harm / Endure Stress with a stat substitution (issue #326 W49) control: Endure Harm without a substitution rolls the higher of health and iron

### 6e790b3 — fix: the Mischief dial's aside plays on what the player said, not the model's rationale (issue #326 W50)

Test files: `tests/unit/mischiefAsideNarration.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/mischiefAsideNarration.test.js › the Mischief aside reads the player's narration (issue #326 W50) the pipeline's aside for a punch reframed as Gather Information is a fight-reframe line | AssertionError: expected [ …(4) ] to include 'Information is the resource you actua…' |

- New test passing with and without the fix (a control?): tests/unit/mischiefAsideNarration.test.js › the Mischief aside reads the player's narration (issue #326 W50) control: given the player's narration, the chaotic aside is a fight-reframe line

### c62c1d5 — fix: nine writers change the cached setting only once the world has taken the write (issue #326 W51)

Test files: `tests/unit/bondApplyCachedState.test.js`, `tests/unit/cachedStateRefusedWrites.test.js`, `tests/unit/cachedStateRefusedWritesTable.test.js`, `tests/unit/siteDiscovery.test.js`, `tests/unit/siteDiscoveryStaleWrite.test.js`. Source restored: 7 file(s).

- With the fix: 43 passed, 0 failed.
- Without it: 19 failed (17 new; 0 only for a missing export); 24 still pass (6 new).
- Verdict: **sensitive** — 19 assertion(s) fail without the fix; 6 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/bondApplyCachedState.test.js › bond.apply's legacy ticks are marked on a copy (issue #326 W51) a refused save leaves the GM's cached setting as the world has it | AssertionError: expected 4 to be 2 // Object.is equality |
| (new) tests/unit/cachedStateRefusedWrites.test.js › !pace / !roll: a refused write changes nothing and says so (issue #326 W51) `!pace hot` refused: the cached state keeps no override, and it is not reported set | AssertionError: expected { modifier: 3, label: 'hot' } to be null |
| (new) tests/unit/cachedStateRefusedWrites.test.js › !pace / !roll: a refused write changes nothing and says so (issue #326 W51) `!pace clear` refused: the override stays, in the cache as in the world | AssertionError: expected null to deeply equal { modifier: 3, label: 'hot' } |
| (new) tests/unit/cachedStateRefusedWrites.test.js › !pace / !roll: a refused write changes nothing and says so (issue #326 W51) `!roll` refused: the cached state does not force the next input | AssertionError: expected undefined to be false // Object.is equality |
| (new) tests/unit/cachedStateRefusedWrites.test.js › !pace / !roll: a refused write changes nothing and says so (issue #326 W51) control: an accepted write sets the override and the force flag | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/cachedStateRefusedWrites.test.js › Take a Break's clear and the custom oracles: a refused write leaves the cache as the world (issue #326 W51) Take a Break +1: a refused clear leaves the grant pending in the cache | AssertionError: expected undefined to deeply equal { value: 1, source: 'take_a_break' } |
| (new) tests/unit/cachedStateRefusedWrites.test.js › Take a Break's clear and the custom oracles: a refused write leaves the cache as the world (issue #326 W51) custom oracle save refused: no table in the cache, none registered, and the card says it was not saved | Error: Setting [campaignState] could not be saved: the server refused the write |
| (new) tests/unit/cachedStateRefusedWrites.test.js › Take a Break's clear and the custom oracles: a refused write leaves the cache as the world (issue #326 W51) custom oracle remove refused: the table stays in the cache and stays registered | AssertionError: expected undefined to deeply equal { name: 'Keep', entries: [ { …(3) } ] } |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !pace / !roll / the oracle-memory capture refused (issue #326 W51) !pace hot: a refused write leaves no override in the GM's cache, and the card does not claim one | AssertionError: expected { modifier: 3, label: 'hot' } to be null |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !pace / !roll / the oracle-memory capture refused (issue #326 W51) !roll: a refused write leaves no force flag in the GM's cache, and the card does not claim one | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !pace / !roll / the oracle-memory capture refused (issue #326 W51) oracle memory: a refused capture leaves the GM's cached recentOracles equal to the world's | AssertionError: expected [ { …(5) } ] to deeply equal [] |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51) !reveal-site refused: the site is not revealed on the GM's client either | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51) !reveal-site refused: the GM's retry reveals the site | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51) !clear-site refused: the site is not cleared on the GM's client either, and the retry clears it | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51) !oracle-add refused: the unsaved table is in neither the world nor the GM's cache, and the card says so | AssertionError: expected { name: 'Wariness', …(1) } to be undefined |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51) !oracle-add refused: the GM's next unrelated write does not carry the unsaved table into the world | AssertionError: expected { name: 'Wariness', …(1) } to be undefined |
| (new) tests/unit/cachedStateRefusedWritesTable.test.js › !reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51) !lore refused: the recap the world refused stays out of the GM's cache | AssertionError: expected 'Black iron remembers every oath.' to be '' // Object.is equality |
| tests/unit/siteDiscovery.test.js › revealSectorSite flips the matched site, marks the location visited, restyles, and persists | AssertionError: expected true to be false // Object.is equality |
| tests/unit/siteDiscovery.test.js › clearSectorSite marks the keyword-matched discovered site cleared and sets its status | AssertionError: expected true to be false // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/bondApplyCachedState.test.js › bond.apply's legacy ticks are marked on a copy (issue #326 W51) control: a save that lands marks the two ticks
- New test passing with and without the fix (a control?): tests/unit/cachedStateRefusedWrites.test.js › Take a Break's clear and the custom oracles: a refused write leaves the cache as the world (issue #326 W51) control: a landed clear removes it from the store
- New test passing with and without the fix (a control?): tests/unit/cachedStateRefusedWrites.test.js › Take a Break's clear and the custom oracles: a refused write leaves the cache as the world (issue #326 W51) control: a landed save stores and registers the table
- New test passing with and without the fix (a control?): tests/unit/cachedStateRefusedWrites.test.js › Take a Break's clear and the custom oracles: a refused write leaves the cache as the world (issue #326 W51) a built-in id is still refused before anything is written
- New test passing with and without the fix (a control?): tests/unit/cachedStateRefusedWritesTable.test.js › !pace / !roll / the oracle-memory capture refused (issue #326 W51) control: without a refusal each lands in the world
- New test passing with and without the fix (a control?): tests/unit/cachedStateRefusedWritesTable.test.js › !reveal-site / !clear-site / !oracle-add / !lore refused (issue #326 W51) control: !reveal-site and !lore land when the world takes the write

### 70d363e — fix: legacy-box XP is paid once the write that saves the ticks has landed (issue #326 W52)

Test files: `tests/unit/bondApplyXpAfterSave.test.js`, `tests/unit/flowDefectFixes.test.js`, `tests/unit/legacyXpAfterPersist.test.js`, `tests/unit/payoffFailure.test.js`. Source restored: 4 file(s).

- With the fix: 36 passed, 0 failed.
- Without it: 9 failed (3 new; 5 only for a missing export); 27 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/bondApplyXpAfterSave.test.js › bond.apply pays its box XP once the ticks are saved (issue #326 W52) a refused save pays no XP | AssertionError: expected [ 2, 2 ] to deeply equal [ +0, +0 ] |
| (new) tests/unit/bondApplyXpAfterSave.test.js › bond.apply pays its box XP once the ticks are saved (issue #326 W52) a refused tick save does not skip the match's rank raise | AssertionError: expected "spy" to be called with arguments: [ 'conn-1', { rank: 'formidable' } ] |
| tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) awards 2 XP per newly filled box to every PC and posts the earned-XP note | AssertionError: expected 4 to be +0 // Object.is equality |
| (API) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) awards a box's XP past 30, and never lowers XP already above it | TypeError: (0 , awardSavedLegacyXp) is not a function |
| (API) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) awards nothing when no box fills | TypeError: (0 , awardSavedLegacyXp) is not a function |
| (API) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) pays 1 XP per box once the track has been cleared (rule 1.12) | TypeError: (0 , awardSavedLegacyXp) is not a function |
| (API) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes award XP (LEGACY-XP-DEAD) the tenth box clears the track: the overflow carries on from the first box at 1 XP a box | TypeError: (0 , awardSavedLegacyXp) is not a function |
| (new) tests/unit/legacyXpAfterPersist.test.js › legacy box XP waits for the move's persist (issue #326 W52) a refused write awards no XP for the box it did not save | AssertionError: expected 2 to be +0 // Object.is equality |
| (API) tests/unit/payoffFailure.test.js › a legacy box filled in the move pipeline: a refused XP award goes to the GMs Retry gives that PC's XP once | TypeError: awardSavedLegacyXp is not a function |

- New test passing with and without the fix (a control?): tests/unit/bondApplyXpAfterSave.test.js › bond.apply pays its box XP once the ticks are saved (issue #326 W52) control: a strong hit whose save lands marks the box and pays each PC 2 XP
- New test passing with and without the fix (a control?): tests/unit/legacyXpAfterPersist.test.js › legacy box XP waits for the move's persist (issue #326 W52) control: when the write lands, the box is saved and its 2 XP awarded

### a3369da — fix: two clock actions within one world round trip both land (issue #326 W53)

Test files: `tests/unit/clockWritesSerialised.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/clockWritesSerialised.test.js › clock writes on one client are serialised (issue #326 W53) two clock resets issued within one round trip both land | AssertionError: expected { Alpha: 3, Beta: +0 } to deeply equal { Alpha: +0, Beta: +0 } |
| (new) tests/unit/clockWritesSerialised.test.js › clock writes on one client are serialised (issue #326 W53) a Pay the Price advance racing a reset keeps both | AssertionError: expected 3 to be 4 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/clockWritesSerialised.test.js › clock writes on one client are serialised (issue #326 W53) control: the same two resets one after the other both land
- New test passing with and without the fix (a control?): tests/unit/clockWritesSerialised.test.js › clock writes on one client are serialised (issue #326 W53) a write that fails does not hold up the next

### 142116f — fix: the ready-time document creators run on the canonical GM only (issue #326 W54)

Test files: `tests/unit/readyCreatorsCanonicalGm.test.js`. Source restored: 5 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/readyCreatorsCanonicalGm.test.js › the ready-time creators run on the canonical GM only (issue #326 W54) the non-canonical GM's ready creates no help journal, macro or World Journal | AssertionError: expected { id: 'm-1', …(5) } to be null |

- New test passing with and without the fix (a control?): tests/unit/readyCreatorsCanonicalGm.test.js › the ready-time creators run on the canonical GM only (issue #326 W54) control: with two GMs online, the second is not the canonical one
- New test passing with and without the fix (a control?): tests/unit/readyCreatorsCanonicalGm.test.js › the ready-time creators run on the canonical GM only (issue #326 W54) control: the canonical GM creates them

### 3d5297a — fix: the combat tracker decorates the combat it shows, and only a Starforged fight (issue #326 W55)

Test files: `tests/unit/combatPositionStores.test.js`, `tests/unit/combatTrackerViewedCombat.test.js`. Source restored: 1 file(s).

- With the fix: 12 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 9 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/combatTrackerViewedCombat.test.js › the combat tracker decorates the combat it shows (issue #326 W55) with two fights open, the fight the tracker shows gets its badges | AssertionError: expected [] to have a length of 2 but got +0 |
| (new) tests/unit/combatTrackerViewedCombat.test.js › the combat tracker decorates the combat it shows (issue #326 W55) a GM's own (non-Starforged) combat keeps its initiative and turn controls | AssertionError: expected true to be false // Object.is equality |
| (new) tests/unit/combatTrackerViewedCombat.test.js › the combat tracker decorates the combat it shows (issue #326 W55) with no app.viewed, the tracker reads game.combat — the viewed combat | AssertionError: expected [] to have a length of 2 but got +0 |

- New test passing with and without the fix (a control?): tests/unit/combatTrackerViewedCombat.test.js › the combat tracker decorates the combat it shows (issue #326 W55) control: with one fight open, its rows get the position and range badges

### 599ede7 — fix: the panel's position badge cycles the clicker's own PC's position (issue #326 W56)

Test files: `tests/unit/combatPositionToggleClicker.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/combatPositionToggleClicker.test.js › the panel's position toggle cycles the clicker's own PC (issue #326 W56) a solo GM (no User#character) cycles the badge to 'In control' — Kira's next move should read 'in_control' | AssertionError: expected { interpreterReads: 'bad_spot', …(1) } to deeply equal { Object (interpreterReads, tdaReads) } |

- New test passing with and without the fix (a control?): tests/unit/combatPositionToggleClicker.test.js › the panel's position toggle cycles the clicker's own PC (issue #326 W56) control: a clicker whose User#character is the PC does change that PC's own position

### 726f908 — fix: a burned card shows its new outcome below the struck one; an improved result's narration says it was improved (issue #326 W57)

Test files: `tests/unit/upgradeCardText.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 3 still pass (3 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/upgradeCardText.test.js › a burned card shows the burned outcome below the struck one (issue #326 W57) after a burn, the burned-result block is not inside the move-name header | AssertionError: expected 'gather_information🔥 Burned → Strong …' not to match /Burned/ |
| (new) tests/unit/upgradeCardText.test.js › an improved result's struck narration says it was improved (issue #326 W57) the struck narration does not say momentum was burned when the result was improved | AssertionError: expected '&lt;div class="sf-narration-card">\n    …' not to match /momentum was burned/ |

- New test passing with and without the fix (a control?): tests/unit/upgradeCardText.test.js › a burned card shows the burned outcome below the struck one (issue #326 W57) control: the move card's header holds the move name alone before the burn
- New test passing with and without the fix (a control?): tests/unit/upgradeCardText.test.js › an improved result's struck narration says it was improved (issue #326 W57) control: the improvement strikes the pre-improvement narration
- New test passing with and without the fix (a control?): tests/unit/upgradeCardText.test.js › an improved result's struck narration says it was improved (issue #326 W57) control: a burn's struck narration still says momentum was burned

### 4abc3b3 — fix: persistResolution's dead session move log and impact step are retired (issue #326 W58)

Test files: `tests/unit/consequenceTargets.test.js`, `tests/unit/faultMatrix.test.js`, `tests/unit/legacyXpAfterPersist.test.js`, `tests/unit/loreRecapMoveMerge.test.js`, `tests/unit/moveCardRelay.test.js`, `tests/unit/moveRules.test.js`, `tests/unit/multiplayerConcurrency.test.js`, `tests/unit/narrationRefusedPersist.test.js`, `tests/unit/noRollMoves.test.js`, `tests/unit/payThePriceRoutes.test.js`, `tests/unit/persistResolution.test.js`, `tests/unit/persistResolutionMerge.test.js`, `tests/unit/persistResolutionRetiredSteps.test.js`, `tests/unit/progressTrackSelection.test.js`, `tests/unit/renarrateAttribution.test.js`, `tests/unit/renarrationMoveOutcome.test.js`, `tests/unit/resolver.test.js`, `tests/unit/resultUpgrade.test.js`, `tests/unit/upgradeEffects.test.js`. Source restored: 7 file(s).

- With the fix: 469 passed, 0 failed.
- Without it: 5 failed (4 new; 0 only for a missing export); 464 still pass (1 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/persistResolution.test.js › persistResolution — actor attribution writes the campaign state, stamped, with no session move log | AssertionError: expected { currentSessionId: 'sess-1', …(2) } to not have property "sessionLogs" |
| (new) tests/unit/persistResolutionMerge.test.js › persistResolution — concurrent writes survive the stale working copy keeps the live session id when it changed meanwhile | AssertionError: expected { currentSessionId: 'sess-2', …(9) } to not have property "sessionLogs" |
| (new) tests/unit/persistResolutionRetiredSteps.test.js › persistResolution's retired steps (issue #326 W58) no production code writes or reads a session move log | AssertionError: expected [ …(11) ] to deeply equal [] |
| (new) tests/unit/persistResolutionRetiredSteps.test.js › persistResolution's retired steps (issue #326 W58) no production code carries the impact step or the deprecated sufferMoveTriggered alias | AssertionError: expected [ …(8) ] to deeply equal [] |
| tests/unit/resolver.test.js › mapConsequences face_danger weak hit triggers a suffer move | AssertionError: expected { momentumChange: +0, …(22) } to not have property "sufferMoveTriggered" |

- New test passing with and without the fix (a control?): tests/unit/persistResolutionRetiredSteps.test.js › persistResolution's retired steps (issue #326 W58) control: every move and outcome still maps to consequences, with the suffer prompt where a choice is owed

### 8f76745 — fix: a !truth set / !state set typed between scenes reaches the next scene (issue #326 W59)

Test files: `tests/unit/ledgerCommandStartsScene.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/ledgerCommandStartsScene.test.js › a `!truth set` / `!state set` typed between scenes reaches the next scene (issue #326 W59) typed with no scene open, the GM's truth and state are still binding in the scene the next narration starts | AssertionError: expected null to be truthy |
| (new) tests/unit/ledgerCommandStartsScene.test.js › a `!truth set` / `!state set` typed between scenes reaches the next scene (issue #326 W59) a truth set while a move was already in flight (its snapshot predates the command) is not erased by that move's scene start | AssertionError: expected '' to match /The reactor is leaking/ |

- New test passing with and without the fix (a control?): tests/unit/ledgerCommandStartsScene.test.js › a `!truth set` / `!state set` typed between scenes reaches the next scene (issue #326 W59) control: typed inside a scene, both stay in the ledger the narrator reads
- New test passing with and without the fix (a control?): tests/unit/ledgerCommandStartsScene.test.js › a `!truth set` / `!state set` typed between scenes reaches the next scene (issue #326 W59) control: a strike with no scene open starts none

### f5b7b23 — fix: re-establishing a struck fact with !truth set lifts the strike (issue #326 W60)

Test files: `tests/unit/truthSetLiftsStrike.test.js`. Source restored: 3 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/truthSetLiftsStrike.test.js › `!truth set` of a struck fact (issue #326 W60) the GM re-establishing it leaves one instruction, not "binding" and "do NOT re-assert" together | AssertionError: expected { binding: true, struck: true } to deeply equal { binding: true, struck: false } |
| (new) tests/unit/truthSetLiftsStrike.test.js › `!truth set` of a struck fact (issue #326 W60) a player's `!truth set` does not overturn the GM's strike | AssertionError: expected 'TRUTHS:\n  Vance — is dead' not to match /Vance — is dead/ |
| (new) tests/unit/truthSetLiftsStrike.test.js › `!truth set` of a struck fact (issue #326 W60) the lifted strike survives the ledger merge onto the stored scene | AssertionError: expected null to be truthy |
| (new) tests/unit/truthSetLiftsStrike.test.js › `!truth set` of a struck fact (issue #326 W60) a player's set over a player's strike lifts it | AssertionError: expected 'CORRECTED (retracted by the table — d…' not to match /Vance — is dead/ |

- New test passing with and without the fix (a control?): tests/unit/truthSetLiftsStrike.test.js › `!truth set` of a struck fact (issue #326 W60) control: the GM's strike is named under CORRECTED
- New test passing with and without the fix (a control?): tests/unit/truthSetLiftsStrike.test.js › `!truth set` of a struck fact (issue #326 W60) control: a set of a different fact leaves the strike in place

### 49e3ae5 — fix: a state attribute supersedes the stored one whatever its case (issue #326 W61)

Test files: `tests/unit/stateAttributeCaseBlind.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/stateAttributeCaseBlind.test.js › a state change supersedes the same attribute whatever its case (issue #326 W61) "Location" supersedes "location" — CURRENT STATE holds one location for the dockmaster | AssertionError: expected [ …(2) ] to have a length of 1 but got 2 |
| (new) tests/unit/stateAttributeCaseBlind.test.js › a state change supersedes the same attribute whatever its case (issue #326 W61) `!state set` and `!state strike` find the attribute whatever its case | AssertionError: expected [ …(2) ] to deeply equal [ ObjectContaining{…} ] |

- New test passing with and without the fix (a control?): tests/unit/stateAttributeCaseBlind.test.js › a state change supersedes the same attribute whatever its case (issue #326 W61) control: the same spelling supersedes
- New test passing with and without the fix (a control?): tests/unit/stateAttributeCaseBlind.test.js › a state change supersedes the same attribute whatever its case (issue #326 W61) control: different attributes stay apart

### c82c3fe — fix: !journal refuses a qualifier outside its type's vocabulary (issue #326 W62)

Test files: `tests/unit/journalQualifierVocabulary.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/journalQualifierVocabulary.test.js › !journal refuses a qualifier outside its vocabulary (issue #326 W62) "resolve" is refused, not stored as an unknown severity that keeps the threat active | AssertionError: expected { name: 'Iron Raiders', …(10) } to be null |
| (new) tests/unit/journalQualifierVocabulary.test.js › !journal refuses a qualifier outside its vocabulary (issue #326 W62) a faction attitude outside hostile / neutral / allied / unknown is refused | AssertionError: expected { …(9) } to be null |
| (new) tests/unit/journalQualifierVocabulary.test.js › !journal refuses a qualifier outside its vocabulary (issue #326 W62) a lore qualifier other than confirmed / rumour is refused, not filed as a rumour | AssertionError: expected { title: 'The Gate', …(17) } to be null |

- New test passing with and without the fix (a control?): tests/unit/journalQualifierVocabulary.test.js › !journal refuses a qualifier outside its vocabulary (issue #326 W62) control: "resolved" resolves the threat
- New test passing with and without the fix (a control?): tests/unit/journalQualifierVocabulary.test.js › !journal refuses a qualifier outside its vocabulary (issue #326 W62) control: each vocabulary word is accepted — and a location type is free text

### 55db420 — fix: a Narrative Review card names the truth it caught, and its Retract dialog points at it (issue #326 W63)

Test files: `tests/unit/contradictedTruthId.test.js`. Source restored: 2 file(s).

- With the fix: 7 passed, 0 failed.
- Without it: 5 failed (5 new; 3 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/contradictedTruthId.test.js › the review card knows which truth was contradicted (issue #326 W63) a high-confidence catch posts a card whose contradictedTruthId names the truth | AssertionError: expected null to be 'tr-limp0001' // Object.is equality |
| (new) (API) tests/unit/contradictedTruthId.test.js › the review card knows which truth was contradicted (issue #326 W63) the violated text is matched as the fact or as its whole ledger line | TypeError: resolveContradictedTruthId is not a function |
| (new) (API) tests/unit/contradictedTruthId.test.js › the review card knows which truth was contradicted (issue #326 W63) two subjects with the same fact: the catch's subject decides; still ambiguous, none is named | TypeError: resolveContradictedTruthId is not a function |
| (new) (API) tests/unit/contradictedTruthId.test.js › the review card knows which truth was contradicted (issue #326 W63) control: a retracted truth, another kind, or no match names none | TypeError: resolveContradictedTruthId is not a function |
| (new) tests/unit/contradictedTruthId.test.js › the Retract dialog lists the truth the review caught first (issue #326 W63) the flagged truth is listed first and marked, even outside the card's subjects | AssertionError: expected '\n      \n        tr-limp0\n        V…' to contain 'owes the guild' |

- New test passing with and without the fix (a control?): tests/unit/contradictedTruthId.test.js › the review card knows which truth was contradicted (issue #326 W63) control: the audit prompt carries the truth (as a line with no id)
- New test passing with and without the fix (a control?): tests/unit/contradictedTruthId.test.js › the Retract dialog lists the truth the review caught first (issue #326 W63) control: a card that names no truth lists the in-scope truths, none marked

### b3d36e8 — fix: the Session Log's lore this session leaves struck lore out (issue #326 W64)

Test files: `tests/unit/sessionLogLoreRetracted.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sessionLogLoreRetracted.test.js › the End-Session log's lore list leaves struck lore out (issue #326 W64) a lore entry the table struck this session is not listed under "Lore this session" | AssertionError: expected [ 'The Iron Gate', 'Vance is dead' ] to deeply equal [ 'The Iron Gate' ] |

- New test passing with and without the fix (a control?): tests/unit/sessionLogLoreRetracted.test.js › the End-Session log's lore list leaves struck lore out (issue #326 W64) control: a rumour recorded this session is listed; another session's lore is not

### 28b05ae — fix: a ship at a recorded derelict, vault or station is "docked at" or "near" it (issue #326 W65)

Test files: `tests/unit/shipPositionRecordedLocation.test.js`. Source restored: 3 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/shipPositionRecordedLocation.test.js › SHIP POSITION for a recorded location says where the ship is (issue #326 W65) `!at Derelict Kovash` reads "docked at Derelict Kovash", not "Wayfinder Derelict Kovash" | AssertionError: expected 'SHIP POSITION: Wayfinder Derelict Kov…' to be 'SHIP POSITION: Wayfinder docked at De…' // Object.is equality |
| (new) tests/unit/shipPositionRecordedLocation.test.js › SHIP POSITION for a recorded location says where the ship is (issue #326 W65) a narrated approach to the location reads "near Derelict Kovash" | AssertionError: expected 'SHIP POSITION: Wayfinder Derelict Kov…' to be 'SHIP POSITION: Wayfinder near Derelic…' // Object.is equality |
| (new) tests/unit/shipPositionRecordedLocation.test.js › SHIP POSITION for a recorded location says where the ship is (issue #326 W65) the location is named as it is now — a renamed location reads its new name | AssertionError: expected 'SHIP POSITION: Wayfinder Derelict Kov…' to be 'SHIP POSITION: Wayfinder docked at Th…' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/shipPositionRecordedLocation.test.js › SHIP POSITION for a recorded location says where the ship is (issue #326 W65) control: a settlement arrival reads "docked at"
- New test passing with and without the fix (a control?): tests/unit/shipPositionRecordedLocation.test.js › SHIP POSITION for a recorded location says where the ship is (issue #326 W65) control: an unrecorded place stays free text, as narrated

### 853af87 — fix: the Narrative Review card's ship remedy names !at, the command that sets the position (issue #326 W66)

Test files: `tests/unit/reviewCardShipHint.test.js`, `tests/unit/worldJournal.test.js`. Source restored: 1 file(s).

- With the fix: 71 passed, 0 failed.
- Without it: 2 failed (1 new; 0 only for a missing export); 69 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/reviewCardShipHint.test.js › the ship-kind review card names a command that corrects the ship position (issue #326 W66) every `!command` the ship remedy names is routed | AssertionError: expected [ '!ship' ] to deeply equal [ '!at' ] |
| tests/unit/worldJournal.test.js › postContradictionNotification — kind-aware remedies (NARRCHK-REMEDY-MISMATCH) replaces the button with a targeted hint for identity/ship/frame/retraction kinds | AssertionError: expected '&lt;div class="sf-wj-contradiction">&lt;div…' to match /!at &lt;place&gt;/ |

- New test passing with and without the fix (a control?): tests/unit/reviewCardShipHint.test.js › the ship-kind review card names a command that corrects the ship position (issue #326 W66) control: `!at &lt;place>` is a routed command

### b5b0cfd — fix: a truth's id is shown where !truth strike needs it, and the help describes the correction tools that exist (issue #326 W67)

Test files: `tests/unit/truthIdsShown.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/truthIdsShown.test.js › the help describes the correction affordances that exist (issue #326 W67) narrator cards carry no Correct a fact button, and the help no longer says they do | AssertionError: expected '&lt;h2>Fact Continuity — Binding Scene T…' not to match /Every narrator card carries…/em> button |
| (new) tests/unit/truthIdsShown.test.js › a truth's id is shown where `!truth strike` needs it (issue #326 W67) the `!truth set` card shows the recorded truth's id | AssertionError: expected '&lt;div class="sf-fc-command-card">\n   …' to contain 'tr-08512' |
| (new) tests/unit/truthIdsShown.test.js › a truth's id is shown where `!truth strike` needs it (issue #326 W67) `!truth list` whispers the typist the scene's live truths with their ids | TypeError: Cannot read properties of undefined (reading 'content') |
| (new) tests/unit/truthIdsShown.test.js › a truth's id is shown where `!truth strike` needs it (issue #326 W67) `!truth list` parses, and the usage line names it | AssertionError: expected { ok: false, …(1) } to match object { ok: true, verb: 'list' } |

### 58f7f71 — fix: a placeholder renamed by the narration takes the facts recorded under its new name (issue #326 W68)

Test files: `tests/unit/renamePromotesLedgerSubjects.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/renamePromotesLedgerSubjects.test.js › a placeholder renamed by the narration takes the facts recorded under its new name (issue #326 W68) the revealing narration’s facts about the new name join the renamed card | AssertionError: expected { truthSubject: { …(2) }, …(1) } to deeply equal { truthSubject: { …(3) }, …(1) } |

- New test passing with and without the fix (a control?): tests/unit/renamePromotesLedgerSubjects.test.js › a placeholder renamed by the narration takes the facts recorded under its new name (issue #326 W68) control: facts about another text subject are left as they were

### c9b414b — fix: the Auto-Seed writes its fields onto the connection record as it is then (issue #326 W69)

Test files: `tests/unit/autoSeedFieldWrites.test.js`. Source restored: 1 file(s).

- With the fix: 1 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/autoSeedFieldWrites.test.js › the Auto-Seed writes its fields onto the connection record as it is then (issue #326 W69) the sector connection keeps its canonical lock after the Auto-Seed write lands | AssertionError: expected false to be true // Object.is equality |

### acf5361 — fix: a vow target that is a faction, creature or vessel is not made a connection (issue #326 W70)

Test files: `tests/unit/incitingBoldLabels.test.js`, `tests/unit/incitingIncident.test.js`, `tests/unit/vowTargetKind.test.js`. Source restored: 3 file(s).

- With the fix: 62 passed, 0 failed.
- Without it: 11 failed (3 new; 1 only for a missing export); 51 still pass (2 new).
- Verdict: **sensitive** — 10 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/incitingBoldLabels.test.js › splitIncitingMeta — a Markdown-bold label is a label reads every proposal line without the label's Markdown, and cuts them all from the prose | AssertionError: expected { Object (vow, clock, ...) } to deeply equal { Object (vow, clock, ...) } |
| tests/unit/incitingBoldLabels.test.js › splitIncitingMeta — a Markdown-bold label is a label the other Markdown shapes of a labelled line | AssertionError: expected { name: 'Ren Ito', pronouns: '', …(1) } to deeply equal { name: 'Ren Ito', pronouns: '', …(2) } |
| tests/unit/incitingIncident.test.js › splitVowTarget (F3) accepts a spaced hyphen and a colon as dividers | AssertionError: expected { name: 'Kira', pronouns: '', …(1) } to deeply equal { name: 'Kira', pronouns: '', …(2) } |
| tests/unit/incitingIncident.test.js › splitVowTarget (F3) treats a bare name as a target with empty description | AssertionError: expected { name: 'Vance', pronouns: '', …(1) } to deeply equal { name: 'Vance', pronouns: '', …(2) } |
| tests/unit/incitingIncident.test.js › postIncitingIncidentCard — incitingMeta flags (Cluster B) stores the parsed vow/clock/target for the click handler | AssertionError: expected { name: 'Vance', pronouns: '', …(1) } to deeply equal { name: 'Vance', pronouns: '', …(2) } |
| tests/unit/incitingIncident.test.js › splitVowTarget — pronoun capture captures a pronoun-shaped parenthetical off the name | AssertionError: expected { name: 'Captain Vessa', …(2) } to deeply equal { name: 'Captain Vessa', …(3) } |
| tests/unit/incitingIncident.test.js › splitVowTarget — pronoun capture returns empty pronouns when no parenthetical is present | AssertionError: expected { name: 'Vance', pronouns: '', …(1) } to deeply equal { name: 'Vance', pronouns: '', …(2) } |
| tests/unit/incitingIncident.test.js › splitVowTarget — pronoun capture handles a bare name with pronouns and no description | AssertionError: expected { name: 'Vance', …(2) } to deeply equal { name: 'Vance', …(3) } |
| (new) tests/unit/vowTargetKind.test.js › only a person the vow concerns is made a connection (issue #326 W70) swearing a vow against a faction does not make the faction a connection with a bond on every PC | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/vowTargetKind.test.js › only a person the vow concerns is made a connection (issue #326 W70) the proposal line carries the kind, and the prompt asks for it | AssertionError: expected '## NARRATOR ROLE AND VOICE\n\nYou are…' to match /\[&lt;kind — exactly one of: person, cre…/ |
| (new) (API) tests/unit/vowTargetKind.test.js › only a person the vow concerns is made a connection (issue #326 W70) with no kind given, it is read from the description's head | TypeError: vowTargetKind is not a function |

- New test passing with and without the fix (a control?): tests/unit/vowTargetKind.test.js › only a person the vow concerns is made a connection (issue #326 W70) control: the inciting prompt asks for a vow target that is a faction or a vessel
- New test passing with and without the fix (a control?): tests/unit/vowTargetKind.test.js › only a person the vow concerns is made a connection (issue #326 W70) control: a person target is still made a connection, the vow linked to it

### bfae239 — fix: the !lore card and "The Story So Far" show the narrator's prose as text (issue #326 W71)

Test files: `tests/unit/loreRecapEscaped.test.js`. Source restored: 1 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/loreRecapEscaped.test.js › the !lore card escapes the narrator's prose (issue #326 W71) the World Lore card shows "&lt;signal lost>" as text, and the recap stored keeps it as written | AssertionError: expected '&lt;div class="sf-lore-card">\n        &lt;…' to contain '&lt;signal lost&gt;' |
| (new) tests/unit/loreRecapEscaped.test.js › the !lore card escapes the narrator's prose (issue #326 W71) an &lt;npc> voice marker is stripped, its words kept | AssertionError: expected '&lt;div class="sf-lore-card">\n        &lt;…' not to match /&lt;\/?npc&gt;\|&lt;\/?npc>/?npc&gt;\|&lt;\ |

### 848bbf5 — fix: each region's settlement population table has its own !oracle id (issue #326 W72)

Test files: `tests/unit/oracleTableFidelity.test.js`, `tests/unit/populationTablesPerRegion.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/populationTablesPerRegion.test.js › every region's settlement population table has an !oracle id (issue #326 W72) the Outlands and Expanse population tables can be rolled with !oracle | AssertionError: expected [] to deeply equal [ 'settlement_population_outlands' ] |

- New test passing with and without the fix (a control?): tests/unit/populationTablesPerRegion.test.js › every region's settlement population table has an !oracle id (issue #326 W72) control: the starship missions register one id per region
- New test passing with and without the fix (a control?): tests/unit/populationTablesPerRegion.test.js › every region's settlement population table has an !oracle id (issue #326 W72) control: settlement_population is still the Terminus table

### d2ae1b9 — fix: the Sector Creator's narrator stubs follow the narration perspective (issue #326 W73)

Test files: `tests/unit/sectorStubPerspective.test.js`. Source restored: 2 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorStubPerspective.test.js › sector narrator stubs follow the narration perspective (issue #326 W73) a third-person campaign's stubs are not written in second person | AssertionError: expected 'You are the narrator for an Ironsworn…' not to match /second person/i |
| (new) tests/unit/sectorStubPerspective.test.js › sector narrator stubs follow the narration perspective (issue #326 W73) "auto" is resolved as the narrator resolves it — two players at the table: third person | AssertionError: expected 'You are the narrator for an Ironsworn…' to match /third person/i |

- New test passing with and without the fix (a control?): tests/unit/sectorStubPerspective.test.js › sector narrator stubs follow the narration perspective (issue #326 W73) control: a second-person campaign's stubs are written in second person

### e798d69 — fix: a generated vault's or derelict's location Actor carries its rolled class (issue #326 W74)

Test files: `tests/unit/siteLocationKlass.test.js`. Source restored: 2 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/siteLocationKlass.test.js › a sector site's location Actor carries its rolled class (issue #326 W74) an orbital derelict's location Actor has system.klass "orbital" | AssertionError: expected null to be 'orbital' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/siteLocationKlass.test.js › a sector site's location Actor carries its rolled class (issue #326 W74) control: a location created with no class keeps a blank one

### a890747 — fix: a site the GM renamed is known by its new name in the narrator's sites and !clear-site (issue #326 W75)

Test files: `tests/unit/siteRenamedName.test.js`. Source restored: 3 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/siteRenamedName.test.js › a renamed site is known by its Actor's name (issue #326 W75) the narrator's Charted sites block names the site as its Actor does | AssertionError: expected 'Active sector: Devil\'s Maw\nRegion: …' to contain '- The Harrow (derelict' |
| (new) tests/unit/siteRenamedName.test.js › a renamed site is known by its Actor's name (issue #326 W75) !clear-site The Harrow clears that site | AssertionError: expected undefined to be 'site-1' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/siteRenamedName.test.js › a renamed site is known by its Actor's name (issue #326 W75) control: the record's generated name still finds the site, and an unrenamed site is named as generated

### aa07659 — fix: every world-truth quest starter is the rulebook's (issue #326 W76)

Test files: `tests/unit/truthQuestStarterFidelity.test.js`. Source restored: 1 file(s).

- With the fix: 0 passed, 0 failed.
- Without it: 0 failed (0 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **NOT sensitive** — no test fails without the fix.

### 04f8ede — fix: a player's API calls after ready are not buffered for the life of the page (issue #326 W77)

Test files: `tests/unit/apiLogPlayerBuffer.test.js`. Source restored: 1 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/apiLogPlayerBuffer.test.js › a player's API calls after ready are not buffered (issue #326 W77) a player's calls after ready are not kept in the buffer for the life of the page | AssertionError: expected 50 to be +0 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/apiLogPlayerBuffer.test.js › a player's API calls after ready are not buffered (issue #326 W77) control: before ready a GM buffers, and the ready flush drains it
- New test passing with and without the fix (a control?): tests/unit/apiLogPlayerBuffer.test.js › a player's API calls after ready are not buffered (issue #326 W77) control: a GM after ready writes, not buffers

### 4ba3f9d — fix: the API transaction log can be switched off from Companion Settings (issue #326 W78)

Test files: `tests/unit/apiLogSettingReachable.test.js`. Source restored: 2 file(s).

- With the fix: 2 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/apiLogSettingReachable.test.js › the API transaction log switch is reachable (issue #326 W78) a GM can switch the API log off — a panel control or Configure Settings | AssertionError: expected { inConfigure: false, inPanel: false } to deeply equal { inConfigure: false, inPanel: true } |

- New test passing with and without the fix (a control?): tests/unit/apiLogSettingReachable.test.js › the API transaction log switch is reachable (issue #326 W78) control: the logger honours the setting

### e313d2c — fix: the GM synthesises only a request whose hash is its clip key (issue #326 W81)

Test files: `tests/unit/audioSynthRequestValidation.test.js`, `tests/unit/audioSynthesisOnce.test.js`, `tests/unit/nonGmClientPaths.test.js`. Source restored: 1 file(s).

- With the fix: 21 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 17 still pass (1 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioSynthRequestValidation.test.js › the GM checks a synthesis request against its clip key (issue #326 W81) a request pairing a narration's hash with other text is refused — nothing billed, nothing filed | AssertionError: expected { billed: 1, …(1) } to deeply equal { billed: +0, filed: [] } |
| (new) tests/unit/audioSynthRequestValidation.test.js › the GM checks a synthesis request against its clip key (issue #326 W81) a hand-made hash for arbitrary text is refused | AssertionError: expected { billed: 1, …(1) } to deeply equal { billed: +0, filed: [] } |
| (new) tests/unit/audioSynthRequestValidation.test.js › the GM checks a synthesis request against its clip key (issue #326 W81) a refused request sends no done signal, so a waiter for the real clip is not told it failed | AssertionError: expected [ { kind: 'audio.synth.done', …(2) } ] to deeply equal [] |
| (new) tests/unit/audioSynthRequestValidation.test.js › the GM checks a synthesis request against its clip key (issue #326 W81) control: the real clip's request after a refused one is still served | AssertionError: expected 'A forgery.' to be 'The hull groans and holds.' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/audioSynthRequestValidation.test.js › the GM checks a synthesis request against its clip key (issue #326 W81) control: a request whose hash is its spec's clip key is synthesised and cached once

### b12b35e — fix: a keyless canonical GM's Play fails at once and names the About tab (issue #326 W80)

Test files: `tests/unit/audioKeylessCanonicalGm.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioKeylessCanonicalGm.test.js › a keyless canonical GM presses Play (issue #326 W80) sends itself no synthesis request and fails at once | AssertionError: expected { selfRequests: 1, state: 'loading' } to deeply equal { selfRequests: +0, state: 'error' } |
| (new) tests/unit/audioKeylessCanonicalGm.test.js › a keyless canonical GM presses Play (issue #326 W80) says the ElevenLabs key is missing and where it goes | TypeError: .toMatch() expects to receive a string, but got object |

- New test passing with and without the fix (a control?): tests/unit/audioKeylessCanonicalGm.test.js › a keyless canonical GM presses Play (issue #326 W80) control: a clip another GM already cached still plays for the keyless GM
- New test passing with and without the fix (a control?): tests/unit/audioKeylessCanonicalGm.test.js › a keyless canonical GM presses Play (issue #326 W80) control: a keyless player still asks the canonical GM for the clip

### ee89103 — fix: a keyed Player plays a cached clip without synthesising it again (issue #326 W79)

Test files: `tests/unit/audioAutoplayHistoricalCard.test.js`, `tests/unit/audioCardButton.test.js`, `tests/unit/audioErrorRetry.test.js`, `tests/unit/audioKeyedPlayerCache.test.js`, `tests/unit/audioKeylessCanonicalGm.test.js`, `tests/unit/audioStopWhileLoading.test.js`, `tests/unit/nonGmClientPaths.test.js`. Source restored: 3 file(s).

- With the fix: 36 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 31 still pass (3 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/audioKeyedPlayerCache.test.js › a keyed Player's Play of a clip the GM cached (issue #326 W79) a default Player plays the cached clip: no new ElevenLabs call, no re-upload | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/audioKeyedPlayerCache.test.js › a keyed Player's Play of a clip the GM cached (issue #326 W79) replaying it asks again and still bills nothing | AssertionError: expected "spy" to not be called at all, but actually been called 2 times |
| (new) tests/unit/audioKeyedPlayerCache.test.js › a keyed Player's Play of a clip the GM cached (issue #326 W79) control: a clip that is not cached is synthesised once on the player's key and relayed | AssertionError: expected [ 'audio.cache.write' ] to deeply equal [ 'audio.cache.ask', …(2) ] |
| (new) tests/unit/audioKeyedPlayerCache.test.js › a keyed Player's Play of a clip the GM cached (issue #326 W79) an unanswered ask times out and the player synthesises the clip | AssertionError: expected [ 'audio.cache.write' ] to include 'audio.cache.ask' |
| (new) tests/unit/audioKeyedPlayerCache.test.js › the GM's answer to a cache ask (issue #326 W79) never synthesises: an uncached clip is answered with no path | AssertionError: expected [] to deeply equal [ { kind: 'audio.cache.found', …(2) } ] |

- New test passing with and without the fix (a control?): tests/unit/audioKeyedPlayerCache.test.js › a keyed Player's Play of a clip the GM cached (issue #326 W79) control: a Trusted Player (may browse) plays the cached file and asks nobody
- New test passing with and without the fix (a control?): tests/unit/audioKeyedPlayerCache.test.js › a keyed Player's Play of a clip the GM cached (issue #326 W79) control: with no GM online the player synthesises at once, without asking
- New test passing with and without the fix (a control?): tests/unit/audioKeyedPlayerCache.test.js › the GM's answer to a cache ask (issue #326 W79) is not a done signal: a keyless player's synthesis wait is not released by it

### b2a9762 — fix: deadscan does not count a function's own log line as its consumer (issue #326 W82)

Test files: `tests/unit/deadscan.test.js`. Source restored: 1 file(s).

- With the fix: 33 passed, 0 failed.
- Without it: 0 failed (0 new; 0 only for a missing export); 33 still pass (8 new).
- Verdict: **NOT sensitive** — no test fails without the fix.

- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › scan — a mention inside a string is not a consumer (issue #326 W82) an export mentioned only in its own console.warn is DEAD
- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › scan — a mention inside a string is not a consumer (issue #326 W82) …and one named only inside a longer quoted string
- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › scan — a mention inside a string is not a consumer (issue #326 W82) control: a whole-literal string dispatch still counts (GM_ACTIONS `fn: "…"`)
- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › scan — a mention inside a string is not a consumer (issue #326 W82) control: a call inside a template expression still counts
- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › scan — a mention inside a string is not a consumer (issue #326 W82) an export used only by Quench, and named in its own log line, is QUENCH-ONLY
- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › scan — a mention inside a string is not a consumer (issue #326 W82) control: a settings key is still found in its string
- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › consumerText blanks string and template text, keeps whole-identifier strings and template code
- New test passing with and without the fix (a control?): tests/unit/deadscan.test.js › consumerText keeps a template that is one whole identifier

### 546a7b6 — fix: six help-journal claims now match the code (issue #326 W83)

Test files: `tests/unit/helpDocDrift.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/helpDocDrift.test.js › the help journal against the code (issue #326 W83) a. Troubleshooting: GM narration is not excluded; a session not begun is named | AssertionError: expected ' The message may have been filtered. …' not to match /GM messages are excluded/ |
| (new) tests/unit/helpDocDrift.test.js › the help journal against the code (issue #326 W83) b. Toolbar Buttons: Companion Settings is shown to everyone | AssertionError: expected 'GM' to be 'Everyone' // Object.is equality |
| (new) tests/unit/helpDocDrift.test.js › the help journal against the code (issue #326 W83) c. Chat Commands: !truth / !state are not GM-only; !scene is | AssertionError: expected ' Chat Commands Type these directly in…' not to match /Fact Continuity Commands \(GM only\)/ |
| (new) tests/unit/helpDocDrift.test.js › the help journal against the code (issue #326 W83) d. Chat Commands: the run-on exception list names every command that runs on the GM's client | AssertionError: expected '@scene , !recap , !ship envision and …' to contain '!incite' |
| (new) tests/unit/helpDocDrift.test.js › the help journal against the code (issue #326 W83) e. Chat Commands: !clock advance / fill / reset / remove say they are GM-only | AssertionError: expected [ true, false, false, false, false ] to deeply equal [ true, true, true, true, true ] |
| (new) tests/unit/helpDocDrift.test.js › the help journal against the code (issue #326 W83) f. Entities & Portraits: entities are Actors or Journal Entries by type | AssertionError: expected ' Each entity is stored in its own Fou…' not to match /Each entity is stored in its own Foun…/ |

### ced7270 — fix: lang/en.json holds no strings that nothing reads (issue #326 W84)

Skipped: the commit changes nothing under src/.

### 70dc332 — fix: a player can press Begin / End Session in the Session panel (issue #326 W85)

Test files: `tests/unit/sessionPanelPlayerBegin.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 4 still pass (4 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sessionPanelPlayerBegin.test.js › a player's Begin / End Session in the Session panel (issue #326 W85) before a session, a player's Begin Session is enabled and End is disabled by the state | AssertionError: expected { disabled: true, title: 'GM only' } to deeply equal { disabled: false, title: null } |
| (new) tests/unit/sessionPanelPlayerBegin.test.js › a player's Begin / End Session in the Session panel (issue #326 W85) during a session, a player's End Session is enabled and Begin is disabled by the state | AssertionError: expected { disabled: true, title: 'GM only' } to deeply equal { disabled: false, title: null } |

- New test passing with and without the fix (a control?): tests/unit/sessionPanelPlayerBegin.test.js › a player's Begin / End Session in the Session panel (issue #326 W85) control: a player's !begin-session / !end-session run on the player's own client
- New test passing with and without the fix (a control?): tests/unit/sessionPanelPlayerBegin.test.js › a player's Begin / End Session in the Session panel (issue #326 W85) a player's press opens the same dialogs their commands open
- New test passing with and without the fix (a control?): tests/unit/sessionPanelPlayerBegin.test.js › a player's Begin / End Session in the Session panel (issue #326 W85) control: Envision Inciting Incident stays the GM's
- New test passing with and without the fix (a control?): tests/unit/sessionPanelPlayerBegin.test.js › a player's Begin / End Session in the Session panel (issue #326 W85) control: a GM's buttons follow the same state

### d5655f6 — fix: the toolbar follows the Private Channel switch without a reload (issue #326 W86)

Test files: `tests/unit/toolbarPrivateChannelToggle.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 1 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/toolbarPrivateChannelToggle.test.js › the toolbar follows the Private Channel switch (issue #326 W86) switching it off re-renders the open toolbar, which drops the ✦ button | AssertionError: expected "render" to be called 1 times, but got 0 times |
| (new) tests/unit/toolbarPrivateChannelToggle.test.js › the toolbar follows the Private Channel switch (issue #326 W86) switching it on re-renders it too, which brings the button back | AssertionError: expected "render" to be called 1 times, but got 0 times |
| (new) (API) tests/unit/toolbarPrivateChannelToggle.test.js › the toolbar follows the Private Channel switch (issue #326 W86) a failing listener does not stop the others, and an unsubscribed one is not called | TypeError: onPrivateChannelToggled is not a function |

- New test passing with and without the fix (a control?): tests/unit/toolbarPrivateChannelToggle.test.js › the toolbar follows the Private Channel switch (issue #326 W86) control: a toolbar that is not rendered is left alone

### 96d320e — fix: a changed Speech Input Language takes effect at once (issue #326 W87)

Test files: `tests/unit/speechInputSetting.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 3 still pass (1 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/speechInputSetting.test.js › the Speech Input Language setting takes effect at once the next capture uses the new language | AssertionError: expected 'en-US' to be 'de-DE' // Object.is equality |
| (new) tests/unit/speechInputSetting.test.js › the Speech Input Language setting takes effect at once one controller: the old one is torn down, and a capture in progress stops | AssertionError: expected [ 'start' ] to deeply equal [ 'start', 'abort' ] |

- New test passing with and without the fix (a control?): tests/unit/speechInputSetting.test.js › the Speech Input Language setting takes effect at once control: with push-to-talk off, a language change leaves it off

### 7049b10 — fix: a vow deepens its connection once (issue #326 D1)

Test files: `tests/unit/cardActions.test.js`, `tests/unit/vowDeepenOnce.test.js`. Source restored: 3 file(s).

- With the fix: 60 passed, 0 failed.
- Without it: 4 failed (2 new; 0 only for a missing export); 56 still pass (3 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/cardActions.test.js › won-fight card actions Deepen bond deepens the card's connection by the vow rank's marks, once — independent of Mark milestone | AssertionError: expected "spy" to be called 1 times, but got 0 times |
| tests/unit/cardActions.test.js › won-fight card actions a deepen that does not land (the connection gone) stays unapplied and is reported | AssertionError: expected { applied: true } to deeply equal { applied: false, reason: 'not-found' } |
| (new) tests/unit/vowDeepenOnce.test.js › a vow deepens its connection once (issue #326 D1) the victory card's deepen, then the fulfilment: Sable deepens once | AssertionError: expected { fightVowCard: true, …(5) } to match object { connectionName: 'Sable', …(1) } |
| (new) tests/unit/vowDeepenOnce.test.js › a vow deepens its connection once (issue #326 D1) the fulfilment first, then the card's press: deepened once, and the card says so | AssertionError: expected 32 to be 16 // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/vowDeepenOnce.test.js › a vow deepens its connection once (issue #326 D1) control: a fulfilment with no press deepens once
- New test passing with and without the fix (a control?): tests/unit/vowDeepenOnce.test.js › a vow deepens its connection once (issue #326 D1) control: a second press of the same card deepens nothing more
- New test passing with and without the fix (a control?): tests/unit/vowDeepenOnce.test.js › a vow deepens its connection once (issue #326 D1) control: another vow sworn for the same connection deepens it on its own

### b17542d — fix: a scene truth is filed on the place it was asserted at (issue #326 D2)

Test files: `tests/unit/scenePlacePerTruth.test.js`. Source restored: 3 file(s).

- With the fix: 7 passed, 0 failed.
- Without it: 5 failed (5 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/scenePlacePerTruth.test.js › a scene truth is filed on the place it was asserted at (issue #326 D2) a truth asserted at Bleakhold stays Bleakhold's when the scene ends at Ironway | AssertionError: expected [ undefined, undefined ] to deeply equal [ 'Bleakhold', 'Ironway' ] |
| (new) tests/unit/scenePlacePerTruth.test.js › a scene truth is filed on the place it was asserted at (issue #326 D2) a narration that moves the scene stamps its truths with its own frame | AssertionError: expected undefined to be 'Ironway' // Object.is equality |
| (new) tests/unit/scenePlacePerTruth.test.js › a scene truth is filed on the place it was asserted at (issue #326 D2) a caller that applies the truths before the frame still stamps them with that narration's frame | AssertionError: expected undefined to be null |
| (new) tests/unit/scenePlacePerTruth.test.js › a scene truth is filed on the place it was asserted at (issue #326 D2) a truth asserted at an unrecorded place is lore titled with that place — not filed where the scene ended | AssertionError: expected [ [ 'act-iron', 'settlement', …(1) ] ] to have a length of +0 but got 1 |
| (new) tests/unit/scenePlacePerTruth.test.js › a scene truth is filed on the place it was asserted at (issue #326 D2) !truth set stamps the frame in place; a Replace keeps its original's place | AssertionError: expected undefined to be 'Bleakhold' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/scenePlacePerTruth.test.js › a scene truth is filed on the place it was asserted at (issue #326 D2) control: a scene that stays at Bleakhold files the truth on Bleakhold
- New test passing with and without the fix (a control?): tests/unit/scenePlacePerTruth.test.js › a scene truth is filed on the place it was asserted at (issue #326 D2) an older truth with no stamp falls back to the place the scene ended at

### e157be0 — fix: the shared legacy tracks are mirrored to every character sheet (issue #326 D3)

Test files: `tests/unit/actorBridge.test.js`, `tests/unit/bondApplyXpAfterSave.test.js`, `tests/unit/bondCommand.test.js`, `tests/unit/flowDefectFixes.test.js`, `tests/unit/legacyRollover.test.js`, `tests/unit/legacySheetMirror.test.js`, `tests/unit/legacyXpAfterPersist.test.js`, `tests/unit/payoffFailure.test.js`. Source restored: 6 file(s).

- With the fix: 174 passed, 0 failed.
- Without it: 22 failed (9 new; 3 only for a missing export), 1 file(s) failed to load; 143 still pass (0 new).
- Verdict: **sensitive** — 19 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/actorBridge.test.js › the sheet's legacy tracks reads a legacy as ticks ever marked, 0 when unset or unreadable | TypeError: (0 , readSheetLegacy) is not a function |
| (new) (API) tests/unit/actorBridge.test.js › the sheet's legacy tracks writes system.legacies.&lt;track>, and nothing when it already holds the value | TypeError: (0 , writeSheetLegacy) is not a function |
| (new) (API) tests/unit/actorBridge.test.js › the sheet's legacy tracks writes no track the sheet does not have, and never system.xp | TypeError: (0 , writeSheetLegacy) is not a function |
| (new) tests/unit/actorBridge.test.js › the sheet's legacy tracks the snapshot reads the XP the sheet shows: 2 a box, 1 a box past 40 ticks, less the XP spent | AssertionError: expected { value: +0, max: 30 } to deeply equal { value: 22, earned: 25, spent: 3 } |
| tests/unit/bondApplyXpAfterSave.test.js › bond.apply pays its box XP once the ticks are saved (issue #326 W52) control: a strong hit whose save lands marks the box and pays each PC 2 XP | AssertionError: expected [ +0, +0 ] to deeply equal [ 4, 4 ] |
| tests/unit/bondCommand.test.js › applyBondEffects — canonical GM handler effects named in the payload are ignored: the outcome is paid from the table | AssertionError: expected [] to deeply equal [ { 'system.legacies.bonds': 2 } ] |
| (new) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes earn XP on the sheet (LEGACY-XP-DEAD, issue #326 D3) a saved mark reaches every PC's sheet, whose two filled boxes earn 4 XP, and posts the earned-XP note | AssertionError: expected +0 to be 8 // Object.is equality |
| (new) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes earn XP on the sheet (LEGACY-XP-DEAD, issue #326 D3) no longer writes system.xp, the classic sheet's field | AssertionError: expected +0 to be 4 // Object.is equality |
| (new) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes earn XP on the sheet (LEGACY-XP-DEAD, issue #326 D3) a mark that fills no box still reaches the sheets, with no earned-XP note | AssertionError: expected +0 to be 3 // Object.is equality |
| (new) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes earn XP on the sheet (LEGACY-XP-DEAD, issue #326 D3) a cleared track reaches the sheet as ticks ever marked, where a box earns 1 XP (rule 1.12) | AssertionError: expected +0 to be 44 // Object.is equality |
| (new) tests/unit/flowDefectFixes.test.js › addLegacyTicks — legacy boxes earn XP on the sheet (LEGACY-XP-DEAD, issue #326 D3) the tenth box clears the track: the overflow carries on from the first box at 1 XP a box | AssertionError: expected +0 to be 49 // Object.is equality |
| tests/unit/legacyRollover.test.js › T02 — a legacy track clears at its tenth box and carries on from 38: three discoveries clear the track, keep marking it, and pay 2 then 1 XP | AssertionError: expected [ …(3) ] to deeply equal [ …(3) ] |
| tests/unit/legacyRollover.test.js › T02 — a legacy track clears at its tenth box and carries on a track the old cap froze at 40 clears on the next discovery and marks the overflow | AssertionError: expected +0 to be 42 // Object.is equality |
| tests/unit/legacyRollover.test.js › T02 — a legacy track clears at its tenth box and carries on control: short of the tenth box, a discovery marks its ticks and clears nothing | AssertionError: expected +0 to be 36 // Object.is equality |
| tests/unit/legacyXpAfterPersist.test.js › legacy box XP waits for the move's persist (issue #326 W52) control: when the write lands, the box is saved and its 2 XP awarded | AssertionError: expected +0 to be 40 // Object.is equality |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused legacy write: no XP, a GM card with the legacy as it stands; Retry pays the ticks and XP once | AssertionError: expected +0 to be 2 // Object.is equality |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused paid flag applies nothing and tells the GMs; a duplicate then pays once, and the Retry nothing more | AssertionError: expected { quests: 4, deepen: 8, …(2) } to deeply equal { quests: 4, deepen: 8, …(2) } |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) after a refused paid flag, the Retry pays once and a later duplicate pays nothing | AssertionError: expected { quests: 4, deepen: 8, …(2) } to deeply equal { quests: 4, deepen: 8, …(2) } |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a PC's refused box XP goes to the GMs; Retry gives that PC's XP alone, once | AssertionError: expected { kira: +0, ren: +0 } to deeply equal { kira: +0, ren: 2 } |
| tests/unit/payoffFailure.test.js › a vow fulfilled on the sheet: a step that does not land goes to the GMs (issue #306 R04) a refused box XP with every PC refused posts no "XP earned"; a Retry refused again goes on a fresh card | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |
| tests/unit/payoffFailure.test.js › a bond forged on the sheet: a refused bonds legacy goes to the GMs (issue #306 R04) a refused box XP is reported with the bond forged and its legacy marked; Retry gives the XP once | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |
| tests/unit/payoffFailure.test.js › a legacy box filled in the move pipeline: a refused XP award goes to the GMs Retry gives that PC's XP once | AssertionError: one payoff failure card: expected [] to have a length of 1 but got +0 |

- Failed to load: `tests/unit/legacySheetMirror.test.js` — Cannot find module '../../src/multiplayer/sharedLegacies.js' imported from '/tmp/claude-0/-home-user-starforged-companion/4d7aa363-81d8-550d-8920-2abcfd43043e/scratchpad/fs-tmp/fix-sensitivity-e157be0

### e3f4ee0 — fix: a move card's upgrades close after the roller's next move (issue #326 D4)

Test files: `tests/unit/upgradeClosedByLaterMove.test.js`. Source restored: 5 file(s).

- With the fix: 7 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 4 still pass (4 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/upgradeClosedByLaterMove.test.js › a move card's upgrades close after the roller's next move (issue #326 D4) after Kira's next move, the earlier card's Burn Momentum is closed and refused | AssertionError: expected undefined to be true // Object.is equality |
| (new) tests/unit/upgradeClosedByLaterMove.test.js › a move card's upgrades close after the roller's next move (issue #326 D4) a card the closing never stamped is still refused once a later move follows it | AssertionError: expected true to be falsy |
| (new) tests/unit/upgradeClosedByLaterMove.test.js › the blocker reads the closing (issue #326 D4) a closed upgrade is refused as a later move, and the refusal reads so | AssertionError: expected null to be 'later-move' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/upgradeClosedByLaterMove.test.js › a move card's upgrades close after the roller's next move (issue #326 D4) control: burned at once, the weak Gather Information becomes a strong hit (reset 2 + 2)
- New test passing with and without the fix (a control?): tests/unit/upgradeClosedByLaterMove.test.js › a move card's upgrades close after the roller's next move (issue #326 D4) the move just made keeps its own upgrades open
- New test passing with and without the fix (a control?): tests/unit/upgradeClosedByLaterMove.test.js › a move card's upgrades close after the roller's next move (issue #326 D4) control: another character's move leaves Kira's card open
- New test passing with and without the fix (a control?): tests/unit/upgradeClosedByLaterMove.test.js › the blocker reads the closing (issue #326 D4) control: an open upgrade has no blocker

### 5004de1 — fix: a sector's passages follow the rulebook's region table (issue #326 D5)

Test files: `tests/unit/sectorGenerator.test.js`. Source restored: 3 file(s).

- With the fix: 89 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 86 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorGenerator.test.js › generateSector('terminus') produces 3 passages for terminus — two links and one off the map edge | AssertionError: expected [ { …(3) }, { …(3) }, { …(3) }, …(1) ] to deeply equal [ { …(3) }, { …(3) }, { …(4) } ] |
| (new) tests/unit/sectorGenerator.test.js › generateSector('outlands') produces 2 passages for outlands — the last off the map edge | AssertionError: expected [ { …(3) }, { …(3) }, { …(4) } ] to have a length of 2 but got 3 |
| (new) tests/unit/sectorGenerator.test.js › generateSector('expanse') produces 1 passage for expanse, off the map edge | AssertionError: expected [ { …(3) }, { …(4) } ] to have a length of 1 but got 2 |

### a85398d — feat: a scene challenge's Progress Roll is Finish the Scene (issue #326 D6)

Test files: `tests/unit/finishTheScene.test.js`, `tests/unit/progressRollBridge.test.js`. Source restored: 9 file(s).

- With the fix: 14 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export), 1 file(s) failed to load; 5 still pass (0 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/progressRollBridge.test.js › TRACK_TYPE_TO_MOVE maps each track type to its progress move | AssertionError: expected undefined to be 'finish_the_scene' // Object.is equality |
| (new) tests/unit/progressRollBridge.test.js › rollProgress — pipeline bridge posts a forced Finish the Scene bridge for a scene challenge mid-session | AssertionError: expected '&lt;div class="starforged-move-card prog…' to be 'Finish the scene — Debate the council.' // Object.is equality |

- Failed to load: `tests/unit/finishTheScene.test.js` — Cannot find module '../../src/moves/sceneChallenge.js' imported from '/tmp/claude-0/-home-user-starforged-companion/4d7aa363-81d8-550d-8920-2abcfd43043e/scratchpad/fs-tmp/fix-sensitivity-a85398d-ndV3i

### cf27461 — fix: delete the closeWorld handler and its mentions (issue #326 D7)

Test files: `tests/unit/endSceneLateFacts.test.js`, `tests/unit/noCloseWorldHook.test.js`, `tests/unit/scenePlacePerTruth.test.js`. Source restored: 3 file(s).

- With the fix: 13 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 12 still pass (1 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/noCloseWorldHook.test.js › no closeWorld hook (issue #326 D7) no production module registers one | AssertionError: expected [ 'src/index.js' ] to deeply equal [] |

- New test passing with and without the fix (a control?): tests/unit/noCloseWorldHook.test.js › no closeWorld hook (issue #326 D7) control: the scan sees the hooks the module does register

### 676aeb3 — fix: a player with no character of their own is not rolled as another's (issue #326 D8)

Test files: `tests/unit/pclessPlayerNotRolled.test.js`. Source restored: 2 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 1 failed (1 new; 0 only for a missing export); 4 still pass (4 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/pclessPlayerNotRolled.test.js › a PC-less player is not rolled as another player's character (issue #326 D8) Quinn (no PC) types a move: nothing is rolled, Kira is not changed, and Quinn is told | AssertionError: expected [ { …(7) } ] to have a length of +0 but got 1 |

- New test passing with and without the fix (a control?): tests/unit/pclessPlayerNotRolled.test.js › a PC-less player is not rolled as another player's character (issue #326 D8) control: Pat (Kira's player) types the same move and Kira is credited
- New test passing with and without the fix (a control?): tests/unit/pclessPlayerNotRolled.test.js › a PC-less player is not rolled as another player's character (issue #326 D8) control: a GM's narration still falls back to the first PC
- New test passing with and without the fix (a control?): tests/unit/pclessPlayerNotRolled.test.js › a PC-less player is not rolled as another player's character (issue #326 D8) control: narration that is not a move is not refused
- New test passing with and without the fix (a control?): tests/unit/pclessPlayerNotRolled.test.js › in a one-PC world the sole PC is the roller (issue #326 D8) a PC-less player's move rolls the one PC, as solo play does

### c1c3791 — fix: the X-Card undoes what an X-carded narration's capture recorded (issue #329 X01)

Test files: `tests/unit/captureNarrationIdThreading.test.js`, `tests/unit/incitingIncident.test.js`, `tests/unit/xcardCaptureNarrationId.test.js`. Source restored: 6 file(s).

- With the fix: 63 passed, 0 failed.
- Without it: 11 failed (10 new; 0 only for a missing export); 52 still pass (1 new).
- Verdict: **sensitive** — 11 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/captureNarrationIdThreading.test.js › issue #329 X01 — the capture is handed the narration id the paced / @scene detection pass routes its World Journal results with the id | AssertionError: expected "spy" to be called with arguments: [ { lore: [ { …(2) } ], …(4) }, …(2) ] |
| (new) tests/unit/captureNarrationIdThreading.test.js › issue #329 X01 — the capture is handed the narration id the paced / @scene tier pass stamps the id on its details | AssertionError: expected "spy" to be called with arguments: [ 'Vex smiles.', …(4) ] |
| (new) tests/unit/captureNarrationIdThreading.test.js › issue #329 X01 — the capture is handed the narration id runPacedDetection (the oracle / inciting capture) passes the id it was given | AssertionError: expected "spy" to be called with arguments: [ { lore: [ { …(2) } ], …(4) }, …(2) ] |
| (new) tests/unit/captureNarrationIdThreading.test.js › issue #329 X01 — the capture is handed the narration id a move narration's interaction passes stamp the id on its lore and tier details | AssertionError: expected "spy" to be called with arguments: [ { lore: [ { …(2) } ], …(4) }, …(2) ] |
| (new) tests/unit/captureNarrationIdThreading.test.js › issue #329 X01 — the capture is handed the narration id a Make a Connection hit's synchronous detection routes with the id | AssertionError: expected "spy" to be called with arguments: [ { lore: [ { …(2) } ], …(4) }, …(2) ] |
| tests/unit/incitingIncident.test.js › runIncitingIncident — durable premise storage (PLAYTEST-1712 S) runs BOTH entity detection and the tier update on the opening prose (GM) | AssertionError: expected "spy" to be called with arguments: [ …(3) ] |
| (new) tests/unit/xcardCaptureNarrationId.test.js › issue #329 X01 — what the capture wrote from an X-carded narration leaves canon with it after the X-Card on the narration, its captured lore is out of ESTABLISHED LORE and its beat off the Session Log | AssertionError: expected [ 'The interrogation rig' ] to not include 'The interrogation rig' |
| (new) tests/unit/xcardCaptureNarrationId.test.js › issue #329 X01 — the X-Card undoes the capture by narration id a lore entry the X-carded capture rewrote is put back as it was, still canon | AssertionError: expected { …(16) } to match object { …(2) } |
| (new) tests/unit/xcardCaptureNarrationId.test.js › issue #329 X01 — the X-Card undoes the capture by narration id a threat the X-carded capture made leaves the journal; one it rewrote is put back | AssertionError: expected [ 'The torturer', 'The warden' ] to deeply equal [ 'The warden' ] |
| (new) tests/unit/xcardCaptureNarrationId.test.js › issue #329 X01 — the X-Card undoes the capture by narration id a tier detail the X-carded narration added leaves the card; another narration's stays | AssertionError: expected [ …(2) ] to deeply equal [ 'Owes the dockmaster a favour.' ] |
| (new) tests/unit/xcardCaptureNarrationId.test.js › issue #329 X01 — the X-Card undoes the capture by narration id nothing an earlier narration captured is touched | AssertionError: expected [ 'The interrogation rig', …(1) ] to not include 'The interrogation rig' |

- New test passing with and without the fix (a control?): tests/unit/xcardCaptureNarrationId.test.js › issue #329 X01 — what the capture wrote from an X-carded narration leaves canon with it control: before the X-Card the capture's lore is confirmed canon and its beat is on the Session Log

### e488234 — fix: the consistency check audits the ledger as it stands, not the pre-dialog snapshot (issue #329 X02)

Test files: `tests/unit/consistencyCheckLiveLedger.test.js`, `tests/unit/consistencyCheckLiveLedgerPipeline.test.js`. Source restored: 1 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/consistencyCheckLiveLedger.test.js › issue #329 X02 — the consistency check audits the ledger as it stands, not the pre-dialog snapshot after the X-Card on the torch beat (played while the next move waited), the audit is not handed the removed beat | AssertionError: expected '\nTRUTHS:\n  the guard — Carries the …' not to match /cutting torch/ |
| (new) tests/unit/consistencyCheckLiveLedger.test.js › issue #329 X02 — the consistency check audits the ledger as it stands, not the pre-dialog snapshot an X-Card that leaves the scene nothing to audit against sends no audit | AssertionError: expected "spy" to not be called at all, but actually been called 1 times |
| (new) tests/unit/consistencyCheckLiveLedger.test.js › issue #329 X02 — the consistency check audits the ledger as it stands, not the pre-dialog snapshot a `!truth strike` made while the next move waited is audited as RETRACTED, not as a binding truth | AssertionError: expected '\nTRUTHS:\n  the guard — Carries the …' not to match /cutting torch/ |
| (new) tests/unit/consistencyCheckLiveLedgerPipeline.test.js › issue #329 X02 (pipeline) — a move held at its confirm dialog is audited against the ledger as it stands then the audit of the post-resume narration is not handed the X-carded beat's truth, state or frame | AssertionError: expected '\nTRUTHS:\n  the guard — Carries the …' not to match /cutting torch/ |

- New test passing with and without the fix (a control?): tests/unit/consistencyCheckLiveLedger.test.js › issue #329 X02 — the consistency check audits the ledger as it stands, not the pre-dialog snapshot control: the audit of the torch narration lists its truth under ACTIVE SCENE TRUTHS
- New test passing with and without the fix (a control?): tests/unit/consistencyCheckLiveLedger.test.js › issue #329 X02 — the consistency check audits the ledger as it stands, not the pre-dialog snapshot the narration's own new truth is audited beside the live ledger

### dc4d2bd — fix: at 0 health or spirit on a miss the player chooses the impact or the table, not both (issue #329 X03)

Test files: `tests/unit/endureAtZeroChoice.test.js`, `tests/unit/payThePriceRoutes.test.js`, `tests/unit/resultUpgrade.test.js`, `tests/unit/sufferExecutor.test.js`. Source restored: 4 file(s).

- With the fix: 81 passed, 0 failed.
- Without it: 13 failed (11 new; 0 only for a missing export); 68 still pass (1 new).
- Verdict: **sensitive** — 13 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both Endure Harm's miss at 1 health marks nothing and rolls nothing — the choice card offers the three | AssertionError: expected { before: 1, after: +0, …(4) } to match object { woundedMarked: false, …(2) } |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both Endure Stress's miss at 1 spirit marks nothing and rolls nothing — the choice card offers the three | AssertionError: expected { before: 1, after: +0, …(4) } to match object { shakenMarked: false, …(2) } |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both picking 'Mark wounded' marks wounded — and rolls no table | TypeError: Cannot read properties of null (reading 'id') |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both picking 'Mark permanently harmed' marks it — not wounded | TypeError: Cannot read properties of null (reading 'id') |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both picking the table rolls it — and marks no impact | TypeError: Cannot read properties of null (reading 'id') |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both Endure Stress: the desolation table, picked, marks neither shaken nor traumatized | TypeError: Cannot read properties of null (reading 'id') |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both an impact already marked is not offered (marking it again would cost nothing) | TypeError: Cannot read properties of null (reading 'content') |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both a Pay the Price 'You are harmed' at 1 health offers the choice — never both | AssertionError: expected { before: 1, after: +0, …(6) } to match object { after: +0, …(3) } |
| (new) tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both control: harm that leaves health above 0 marks nothing, rolls nothing and offers no choice | AssertionError: expected { before: 3, after: 2, …(4) } to match object { woundedMarked: false, …(2) } |
| tests/unit/payThePriceRoutes.test.js › Q02 — harm past 0 health is momentum, through the move pipeline a burn refunds no momentum — its reset replaces it — and no health the loss never took | AssertionError: expected 3 to be 4 // Object.is equality |
| tests/unit/resultUpgrade.test.js › P04 — a burn refunds the Pay the Price loss that landed a loss at 0 health is momentum (issue #314 Q02): no health is refunded, and a burn's reset replaces the momentum | AssertionError: expected 3 to be 4 // Object.is equality |
| (new) tests/unit/sufferExecutor.test.js › endureHarm on a miss at 0 health offers the choice — marks nothing, rolls nothing | AssertionError: expected { before: 1, after: +0, …(4) } to match object { atZero: true, …(3) } |
| (new) tests/unit/sufferExecutor.test.js › endureStress on a miss at 0 spirit offers the choice — marks nothing, rolls nothing (issue #329 X03) | AssertionError: expected { before: 1, after: +0, …(4) } to match object { atZero: true, …(3) } |

- New test passing with and without the fix (a control?): tests/unit/endureAtZeroChoice.test.js › issue #329 X03 — at 0 on a miss: mark the impact OR roll the table, never both control (issue #314 Q02): harm past 0 overflows to momentum

### d6c2de4 — fix: an asset ability adds nothing to a move it names only as a cost (issue #329 X04)

Test files: `tests/unit/assetAddsCostMention.test.js`. Source restored: 1 file(s).

- With the fix: 0 passed, 0 failed.
- Without it: 0 failed (0 new; 0 only for a missing export), 1 file(s) failed to load; 0 still pass (0 new).
- Verdict: **NOT sensitive** here — the file read the vendored assets, which the worktree lacks. Shown by hand above: with the data present and the source restored, 4 assertions fail; 6026775 makes the file skip without the data.

- Failed to load: `tests/unit/assetAddsCostMention.test.js` — ENOENT: no such file or directory, scandir '/tmp/claude-0/-home-user-starforged-companion/db3399d5-e8b0-5f7f-a50a-2eebf0f770d1/scratchpad/fix-sensitivity-d6c2de4-GTba40/vendor/foundry-ironsworn/json-p

### 0726854 — fix: a card's forced follow-up is rolled as the card's PC, whoever presses it (issue #329 X05)

Test files: `tests/unit/cardButtonsRollerPipeline.test.js`, `tests/unit/cardRepostAsRoller.test.js`, `tests/unit/milestone.test.js`. Source restored: 3 file(s).

- With the fix: 49 passed, 0 failed.
- Without it: 9 failed (9 new; 0 only for a missing export); 40 still pass (4 new).
- Verdict: **sensitive** — 9 assertion(s) fail without the fix; 4 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/cardButtonsRollerPipeline.test.js › issue #329 X05 (pipeline) — a move card's follow-up button pressed by the GM is the card's roller's move "🏁 Attempt to Fulfill Vow" on Kira's card fulfils Kira's vow, not the first PC's | AssertionError: expected null to be 'pc-kira' // Object.is equality |
| (new) tests/unit/cardButtonsRollerPipeline.test.js › issue #329 X05 (pipeline) — a move card's follow-up button pressed by the GM is the card's roller's move "⚔ Attempt to Finish the Fight" on Kira's Strike card rolls Kira's Take Decisive Action | AssertionError: expected null to be 'pc-kira' // Object.is equality |
| (new) tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC "⚔ Attempt to Finish the Fight" on Bex's Strike card rolls Take Decisive Action as Bex | AssertionError: expected null to be 'pc-b' // Object.is equality |
| (new) tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC "🏁 Attempt to Fulfill Vow" on Bex's move card rolls Fulfill Your Vow as Bex | AssertionError: expected null to be 'pc-b' // Object.is equality |
| (new) tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC the victory card's "🏁 Attempt to Fulfill" rolls as the PC who won the fight | AssertionError: expected null to be 'pc-b' // Object.is equality |
| (new) tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC "🗺 Finish the Expedition" on the card for Bex's expedition progress finishes it as Bex | AssertionError: expected null to be 'pc-b' // Object.is equality |
| (new) tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC "⚔ Swear it (roll)" on the card for Bex's sheet-made vow swears it as Bex | AssertionError: expected null to be 'pc-b' // Object.is equality |
| (new) tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC "⚔ Swear it (roll)" on a card that names the vow's holder speaks as them | AssertionError: expected null to be 'pc-a' // Object.is equality |
| (new) tests/unit/milestone.test.js › buildMilestoneSuggestion is eligible on a quest-advancing hit with an open vow — the sole vow's Item id rides it (issue #329 X05) | AssertionError: expected { eligible: true, vowCount: 1 } to deeply equal { eligible: true, vowCount: 1, …(1) } |

- New test passing with and without the fix (a control?): tests/unit/cardButtonsRollerPipeline.test.js › issue #329 X05 (pipeline) — a move card's follow-up button pressed by the GM is the card's roller's move control: "⚑ Mark Progress on Vow" pressed by the GM on Kira's card marks Kira's vow (issue #321 U20)
- New test passing with and without the fix (a control?): tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC a card that names no roller (an older card) posts as its author, as before
- New test passing with and without the fix (a control?): tests/unit/cardRepostAsRoller.test.js › issue #329 X05 — a forced-move button pressed by someone else speaks as the card's PC control: the relayed "⚑ Mark Progress on Vow" posts its forced move as the card's roller
- New test passing with and without the fix (a control?): tests/unit/milestone.test.js › buildMilestoneSuggestion names no vow when several are open — the roller is asked which

### 5e38a44 — fix: the fight-threshold card takes one choice, claimed on the GM (issue #329 X06)

Test files: `tests/unit/thresholdCardClaim.test.js`. Source restored: 3 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 4 failed (4 new; 2 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/thresholdCardClaim.test.js › issue #329 X06 — the threshold card's buttons act once per card "Find another way" pressed by the player, then by the GM on a re-render, posts one way-out card | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/thresholdCardClaim.test.js › issue #329 X06 — the threshold card's buttons act once per card "Enter the Fray" pressed again on the old card after the fight ended begins no new fight | AssertionError: expected false to be true // Object.is equality |
| (new) (API) tests/unit/thresholdCardClaim.test.js › issue #329 X06 — the threshold card's buttons act once per card a vow the card does not offer is not linked to the fight; one it offers is | TypeError: (0 , applyCombatThresholdChoice) is not a function |
| (new) (API) tests/unit/thresholdCardClaim.test.js › issue #329 X06 — the threshold card's buttons act once per card an Enter the Fray whose fight could not be saved releases the claim — the card can be pressed again | TypeError: (0 , applyCombatThresholdChoice) is not a function |

- New test passing with and without the fix (a control?): tests/unit/thresholdCardClaim.test.js › issue #329 X06 — the threshold card's buttons act once per card control: the first "Find another way" posts one way-out card with its three off-ramps
- New test passing with and without the fix (a control?): tests/unit/thresholdCardClaim.test.js › issue #329 X06 — the threshold card's buttons act once per card control: the first "Enter the Fray" creates the fight the card names, once

### 9badb9b — fix: a reward pick or vow link the vow did not take is not reported as set (issue #329 X07)

Test files: `tests/unit/rewardLinkRefusedWrite.test.js`. Source restored: 2 file(s).

- With the fix: 6 passed, 0 failed.
- Without it: 4 failed (4 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 4 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/rewardLinkRefusedWrite.test.js › issue #329 X07 — a reward pick whose vow write is refused does not say "Reward set", and the pick is not silently spent | AssertionError: expected [ { …(11) } ] to have a length of +0 but got 1 |
| (new) tests/unit/rewardLinkRefusedWrite.test.js › issue #329 X07 — a reward pick whose vow write is refused a pick for a vow no character holds any more is not reported as set | AssertionError: expected { applied: true } to deeply equal { applied: false, …(1) } |
| (new) tests/unit/rewardLinkRefusedWrite.test.js › issue #329 X07 — a reward pick whose vow write is refused a player's pick that is refused is whispered to them and the GMs | TypeError: Cannot read properties of undefined (reading 'whisper') |
| (new) tests/unit/rewardLinkRefusedWrite.test.js › issue #329 X07 — a 🤝 Link whose vow write is refused does not say "Linked", and the link is not silently spent | AssertionError: expected [ { …(11) } ] to have a length of +0 but got 1 |

- New test passing with and without the fix (a control?): tests/unit/rewardLinkRefusedWrite.test.js › issue #329 X07 — a reward pick whose vow write is refused control: an accepted write promises the reward once and says so
- New test passing with and without the fix (a control?): tests/unit/rewardLinkRefusedWrite.test.js › issue #329 X07 — a 🤝 Link whose vow write is refused control: an accepted write links the vow once and says so

### ae7e50e — fix: a move's pipeline releases only its own claim of the move lock (issue #329 X08)

Test files: `tests/unit/moveLockClaimToken.test.js`. Source restored: 3 file(s).

- With the fix: 3 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 0 still pass (0 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/moveLockClaimToken.test.js › issue #329 X08 — a pipeline whose lock was released while its GM was away control (W25): the GM who drops mid-move has their lock released by the other GM, who whispers the GMs | AssertionError: expected undefined to deeply equal Any&lt;String> |
| (new) tests/unit/moveLockClaimToken.test.js › issue #329 X08 — a pipeline whose lock was released while its GM was away does not release the lock a later move holds when its narration finally returns | AssertionError: expected { worldTruths: { …(14) }, …(38) } to match object { pendingMove: true, …(1) } |
| (new) tests/unit/moveLockClaimToken.test.js › issue #329 X08 — a pipeline whose lock was released while its GM was away a pipeline releases its own claim; a lock from before claims carried a token is released as before | AssertionError: expected { worldTruths: { …(14) }, …(38) } to match object { pendingMove: true, …(1) } |

### 91cae82 — fix: a narration never applies its facts onto the cached campaignState (issue #329 X09)

Test files: `tests/unit/narrationCachedStoreWrites.test.js`, `tests/unit/narrationWorkingCopy.test.js`. Source restored: 6 file(s).

- With the fix: 9 passed, 0 failed.
- Without it: 7 failed (7 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 7 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/narrationCachedStoreWrites.test.js › issue #329 X09 — a narration never applies its facts onto the cached setting oracle follow-up on the keyed GM: a refused ledger write leaves the GM's cache equal to the world | AssertionError: expected [ { id: 'tr-d9c1b32c', …(16) } ] to deeply equal [] |
| (new) tests/unit/narrationCachedStoreWrites.test.js › issue #329 X09 — a narration never applies its facts onto the cached setting @scene on the GM with no scene open: a refused scene start leaves no scene in the GM's cache | AssertionError: expected 'sc-1e13fa8e' to be null |
| (new) tests/unit/narrationWorkingCopy.test.js › issue #329 X09 — the narrator is handed a working copy, not the cached setting a `!clock advance` vignette | AssertionError: expected { currentSessionId: 's-1', …(1) } not to be { currentSessionId: 's-1', …(1) } // Object.is equality |
| (new) tests/unit/narrationWorkingCopy.test.js › issue #329 X09 — the narrator is handed a working copy, not the cached setting Pay the Price's trigger vignette | AssertionError: expected { currentSessionId: 's-1', …(1) } not to be { currentSessionId: 's-1', …(1) } // Object.is equality |
| (new) tests/unit/narrationWorkingCopy.test.js › issue #329 X09 — the narrator is handed a working copy, not the cached setting Begin a Session's clock vignette | AssertionError: expected { …(10) } not to be { …(10) } // Object.is equality |
| (new) tests/unit/narrationWorkingCopy.test.js › issue #329 X09 — the narrator is handed a working copy, not the cached setting the oracle follow-up on the GM | AssertionError: expected { currentSessionId: 's-1' } not to be { currentSessionId: 's-1' } // Object.is equality |
| (new) tests/unit/narrationWorkingCopy.test.js › issue #329 X09 — the narrator is handed a working copy, not the cached setting a relayed sidecar whose write the world refused leaves the cache untouched | AssertionError: expected [ { id: 'tr-9c579580', …(16) } ] to deeply equal [] |

- New test passing with and without the fix (a control?): tests/unit/narrationCachedStoreWrites.test.js › issue #329 X09 — a narration never applies its facts onto the cached setting control: without a refusal the oracle follow-up's facts land in the world
- New test passing with and without the fix (a control?): tests/unit/narrationCachedStoreWrites.test.js › issue #329 X09 — a narration never applies its facts onto the cached setting control: @scene with no scene open mints one in the world and files its facts under it

### 9136c7b — fix: !scene start / end work on a copy and say when the world did not take the change (issue #329 X10)

Test files: `tests/unit/sceneCommandCachedWrite.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 1 still pass (1 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sceneCommandCachedWrite.test.js › issue #329 X10 — `!scene` on a refused write leaves the GM's cache equal to the world `!scene start`: no scene opens on the GM alone, and the card does not claim one | AssertionError: expected 'sc-54b07805' to be null |
| (new) tests/unit/sceneCommandCachedWrite.test.js › issue #329 X10 — `!scene` on a refused write leaves the GM's cache equal to the world `!scene end`: the live scene stays open on the GM, its truths kept, and the card does not claim it ended | AssertionError: expected null to be 'sc-1' // Object.is equality |
| (new) tests/unit/sceneCommandCachedWrite.test.js › issue #329 X10 — `!scene` on a refused write leaves the GM's cache equal to the world `!scene start` over a live scene that the world refused to replace keeps the live scene everywhere | AssertionError: expected 'sc-c44149db' to be 'sc-1' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/sceneCommandCachedWrite.test.js › issue #329 X10 — `!scene` on a refused write leaves the GM's cache equal to the world control: without a refusal `!scene start` opens a scene in the world and `!scene end` closes it

### 77ed8bd — fix: a refused Create Sector write leaves the GM's cache as the world has it (issue #329 X11)

Test files: `tests/unit/sectorStoreCachedMutation.test.js`. Source restored: 2 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/sectorStoreCachedMutation.test.js › issue #329 X11 — a refused sector write leaves the GM's cache as it was storeSector: after a refused write the cached state holds neither the record nor the active sector | AssertionError: expected { sectorId: 'sector-refused', …(5) } to be undefined |
| (new) tests/unit/sectorStoreCachedMutation.test.js › issue #329 X11 — a refused sector write leaves the GM's cache as it was the retry after a refused write stores the sector (it is not found 'already stored' in the mutated cache) | AssertionError: expected [ { id: 'oT0ze6PbKzeJW1jv', …(16) } ] to deeply equal [] |

- New test passing with and without the fix (a control?): tests/unit/sectorStoreCachedMutation.test.js › issue #329 X11 — a refused sector write leaves the GM's cache as it was control: with the write accepted, storeSector lands the record and the active sector
- New test passing with and without the fix (a control?): tests/unit/sectorStoreCachedMutation.test.js › issue #329 X11 — a refused sector write leaves the GM's cache as it was control: a second pipeline run for a stored sector is idempotent (issue #321 U46)

### f16e093 — fix: an NPC card's or ship's notes are its sheet's Notes tab — what the narrator reads (issue #329 X12)

Test files: `tests/unit/entityPanelRelay.test.js`, `tests/unit/notesSheetCanonical.test.js`. Source restored: 5 file(s).

- With the fix: 17 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 11 still pass (1 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix; 1 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/entityPanelRelay.test.js › Entities panel — a player's edits land on the NPC card (issue #321 U05) Promote, once the player confirms on their own screen, appends the detail to the NPC card's Notes tab | AssertionError: expected '' to be '&lt;p>Owes the Syndicate&lt;/p>' // Object.is equality |
| (new) tests/unit/notesSheetCanonical.test.js › issue #329 X12 — the sheet's Notes tab reaches the narrator's Notes row a ship: the seed's introduction and a GM's Notes-tab edit reach ENTITIES IN SCENE | AssertionError: expected '' to contain 'hull plates scarred' |
| (new) tests/unit/notesSheetCanonical.test.js › issue #329 X12 — the sheet's Notes tab reaches the narrator's Notes row an NPC card: the seed's introduction and a GM's Notes-tab edit reach ENTITIES IN SCENE | AssertionError: expected '' to contain 'does not look away' |
| (new) tests/unit/notesSheetCanonical.test.js › issue #329 X12 — the sheet's Notes tab reaches the narrator's Notes row notes the GM cleared from the sheet are gone from the card, whatever the record still holds | AssertionError: expected 'Notes: An old note the record kept.' to be '' // Object.is equality |
| (new) tests/unit/notesSheetCanonical.test.js › issue #329 X12 — the sheet's Notes tab reaches the narrator's Notes row ⤴ Promote appends the detail to the NPC card's Notes tab, where the narrator reads it | AssertionError: expected '&lt;p>Keeps her own counsel.&lt;/p>' to be '&lt;p>Keeps her own counsel.&lt;/p>&lt;p>Owes …' // Object.is equality |
| (new) tests/unit/notesSheetCanonical.test.js › issue #329 X12 — the Entities panel shows an NPC card's Notes tab as text, from the sheet — not the record's own notes | AssertionError: expected 'An old note the record kept.' to be 'She is secretly on the Syndicate payr…' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/notesSheetCanonical.test.js › issue #329 X12 — the sheet's Notes tab reaches the narrator's Notes row control: an `!ship envision` append reaches the row (it writes both stores)

### 2310da9 — fix: a Begin a Session the world did not save says the session was not started (issue #329 X13)

Test files: `tests/unit/beginSessionRefusedWrite.test.js`. Source restored: 1 file(s).

- With the fix: 4 passed, 0 failed.
- Without it: 2 failed (2 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 2 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/beginSessionRefusedWrite.test.js › issue #329 X13 — a Begin a Session whose session-start write the world refused a player's Begin: the session did not start, and nothing tells the table — their card promises a session and +1 momentum | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/beginSessionRefusedWrite.test.js › issue #329 X13 — a Begin a Session whose session-start write the world refused the GM's own Begin: the same silence on the local path | AssertionError: expected false to be true // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/beginSessionRefusedWrite.test.js › issue #329 X13 — a Begin a Session whose session-start write the world refused a retry after the refusal begins the session and pays the momentum once
- New test passing with and without the fix (a control?): tests/unit/beginSessionRefusedWrite.test.js › issue #329 X13 — a Begin a Session whose session-start write the world refused control: without the refusal the session begins, the card promises the momentum and the GM pays it

### a8deb17 — fix: the session gate tells the author why nothing was narrated or rolled (issue #329 X14)

Test files: `tests/unit/helpDocDrift.test.js`, `tests/unit/sessionGateNotice.test.js`. Source restored: 2 file(s).

- With the fix: 12 passed, 0 failed.
- Without it: 5 failed (4 new; 0 only for a missing export); 7 still pass (2 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/helpDocDrift.test.js › the help journal against the code (issue #326 W83) a. Troubleshooting: GM narration is not excluded; a session not begun is named | AssertionError: expected '/**\n * STARFORGED COMPANION\n * src/…' to match /sessionActive = isSessionActive\(game…/ |
| (new) tests/unit/sessionGateNotice.test.js › issue #329 X14 — the session gate tells the author why nothing ran (a) a player's typed narration before Begin a Session: nothing runs, and nothing tells the player why | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/sessionGateNotice.test.js › issue #329 X14 — the session gate tells the author why nothing ran a typed line's author is told once, not once per line — and again after a session has run | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/sessionGateNotice.test.js › issue #329 X14 — the session gate tells the author why nothing ran (b) the inciting card's ⚔ Swear this vow before Begin a Session: the forced move is dropped and nobody is told | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/sessionGateNotice.test.js › issue #329 X14 — the session gate tells the author why nothing ran a claimed card's forced move is held until Begin a Session starts one, then rolled | TypeError: Cannot read properties of undefined (reading 'content') |

- New test passing with and without the fix (a control?): tests/unit/sessionGateNotice.test.js › issue #329 X14 — the session gate tells the author why nothing ran control: with the session active the typed line reaches the pipeline and posts a move card
- New test passing with and without the fix (a control?): tests/unit/sessionGateNotice.test.js › issue #329 X14 — the session gate tells the author why nothing ran control: with the session active the ⚔ press reaches the pipeline and rolls Swear an Iron Vow

### 9ef6fde — fix: a card's 🏁 Attempt to Fulfill rolls the vow once, claimed on the GM

Test files: `tests/unit/cardButtonWiring.test.js`, `tests/unit/cardRepostAsRoller.test.js`, `tests/unit/fulfilButtonOnce.test.js`. Source restored: 3 file(s).

- With the fix: 49 passed, 0 failed.
- Without it: 6 failed (6 new; 0 only for a missing export); 43 still pass (0 new).
- Verdict: **sensitive** — 6 assertion(s) fail without the fix.

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/cardButtonWiring.test.js › wireFightVowButtons — one-shot Mark milestone / Deepen bond Attempt to Fulfill relays to the GM too — the player's client posts nothing | AssertionError: expected [ { …(12) } ] to have a length of +0 but got 1 |
| (new) tests/unit/cardButtonWiring.test.js › wireFightVowButtons — one-shot Mark milestone / Deepen bond on the canonical GM Attempt to Fulfill posts the forced fulfil move once, as the roller | AssertionError: expected [ { …(12) }, { …(12) } ] to have a length of 1 but got 2 |
| (new) tests/unit/fulfilButtonOnce.test.js › FULFIL-BUTTON-LOCAL-DISABLE — a card's "🏁 Attempt to Fulfill" rolls once the player and the GM both pressing a move card's 🏁 roll Fulfill Your Vow once, as Kira | AssertionError: expected [ { …(8) }, { …(8) } ] to have a length of 1 but got 2 |
| (new) tests/unit/fulfilButtonOnce.test.js › FULFIL-BUTTON-LOCAL-DISABLE — a card's "🏁 Attempt to Fulfill" rolls once after a re-render the pressed 🏁 stays pressed | AssertionError: expected false to be true // Object.is equality |
| (new) tests/unit/fulfilButtonOnce.test.js › FULFIL-BUTTON-LOCAL-DISABLE — a card's "🏁 Attempt to Fulfill" rolls once the player and the GM both pressing a won-fight card's 🏁 roll it once, Kira's vow by name and Item id | AssertionError: expected [ { …(8) }, { …(8) } ] to have a length of 1 but got 2 |
| (new) tests/unit/fulfilButtonOnce.test.js › FULFIL-BUTTON-LOCAL-DISABLE — a card's "🏁 Attempt to Fulfill" rolls once another player may not roll Kira's vow from her card; the GM may, as Kira | AssertionError: expected [ { …(8) } ] to have a length of +0 but got 1 |

### a93ba76 — fix: an Endure Harm / Stress miss at 0 offers the at-0 choice after Lose Momentum too

Test files: `tests/unit/endureZeroOnMomentumPick.test.js`. Source restored: 3 file(s).

- With the fix: 5 passed, 0 failed.
- Without it: 3 failed (3 new; 0 only for a missing export); 2 still pass (2 new).
- Verdict: **sensitive** — 3 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) tests/unit/endureZeroOnMomentumPick.test.js › ENDURE-ZERO-ON-OTHER-OPTION — the at-0 choice follows either miss option Endure Harm miss at 0 health, 'Lose Momentum (-2)': momentum 5 → 3, then the at-0 choice | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/endureZeroOnMomentumPick.test.js › ENDURE-ZERO-ON-OTHER-OPTION — the at-0 choice follows either miss option Endure Stress miss at 0 spirit, 'Lose Momentum (-2)': the desolation choice follows | AssertionError: expected [] to have a length of 1 but got +0 |
| (new) tests/unit/endureZeroOnMomentumPick.test.js › ENDURE-ZERO-ON-OTHER-OPTION — the at-0 choice follows either miss option …and a pick on it applies that one: 'Mark permanently harmed' | TypeError: Cannot read properties of undefined (reading '_id') |

- New test passing with and without the fix (a control?): tests/unit/endureZeroOnMomentumPick.test.js › ENDURE-ZERO-ON-OTHER-OPTION — the at-0 choice follows either miss option control: above 0 health, 'Lose Momentum (-2)' offers no at-0 choice
- New test passing with and without the fix (a control?): tests/unit/endureZeroOnMomentumPick.test.js › ENDURE-ZERO-ON-OTHER-OPTION — the at-0 choice follows either miss option control: '-1 health' at 0 offers the at-0 choice once (the executor's)

### f43d0bb — fix: the X-Card undoes the state transitions an X-carded narration's capture applied

Test files: `tests/unit/entityExtractor.test.js`, `tests/unit/xcardCaptureTransitions.test.js`. Source restored: 2 file(s).

- With the fix: 135 passed, 0 failed.
- Without it: 5 failed (3 new; 0 only for a missing export); 130 still pass (3 new).
- Verdict: **sensitive** — 5 assertion(s) fail without the fix; 3 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| tests/unit/entityExtractor.test.js › routeWorldJournalResults delegates state transitions through applyStateTransition | AssertionError: expected "applyStateTransition" to be called with arguments: [ ObjectContaining{…}, …(2) ] |
| (new) tests/unit/entityExtractor.test.js › routeWorldJournalResults a narration's transitions carry its id, for the X-Card (XCARD-CAPTURE-TRANSITIONS) | AssertionError: expected "applyStateTransition" to be called with arguments: [ ObjectContaining{…}, …(2) ] |
| tests/unit/entityExtractor.test.js › routeWorldJournalResults 'lore confirmed' transition delegates to promoteLoreToConfirmed | AssertionError: expected "promoteLoreToConfirmed" to be called with arguments: [ 'Soft fact', …(2) ] |
| (new) tests/unit/xcardCaptureTransitions.test.js › XCARD-CAPTURE-TRANSITIONS — the X-Card undoes the transitions its narration's capture applied after the X-Card the threat is looming again, the lore unconfirmed, the Syndicate neutral — entry and record | AssertionError: expected null to match object { severity: 'looming', …(1) } |
| (new) tests/unit/xcardCaptureTransitions.test.js › XCARD-CAPTURE-TRANSITIONS — the X-Card undoes the transitions its narration's capture applied two X-carded narrations that each moved the stance put back the one before both | AssertionError: expected 'open_alliance' to be 'apathetic' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/xcardCaptureTransitions.test.js › XCARD-CAPTURE-TRANSITIONS — the X-Card undoes the transitions its narration's capture applied control: the capture resolves the threat, confirms the lore and turns the Syndicate hostile
- New test passing with and without the fix (a control?): tests/unit/xcardCaptureTransitions.test.js › XCARD-CAPTURE-TRANSITIONS — the X-Card undoes the transitions its narration's capture applied a stance changed on the record since the narration stands
- New test passing with and without the fix (a control?): tests/unit/xcardCaptureTransitions.test.js › XCARD-CAPTURE-TRANSITIONS — the X-Card undoes the transitions its narration's capture applied control: an earlier narration's transitions are untouched; a GM's own change owns the entry

### 082196a — fix: details promoted to an NPC's or ship's record notes before X12 reach the Notes tab

Test files: `tests/unit/entityCardNotesText.test.js`, `tests/unit/notesPromotedBefore.test.js`, `tests/unit/notesSheetCanonical.test.js`. Source restored: 3 file(s).

- With the fix: 18 passed, 0 failed.
- Without it: 7 failed (7 new; 6 only for a missing export); 11 still pass (2 new).
- Verdict: **sensitive** — 1 assertion(s) fail without the fix; 2 new test(s) pass both ways (controls — check each is meant to).

| Fails without the fix | First failure line |
| --- | --- |
| (new) (API) tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab an NPC card's promoted details join its Notes tab — the narrator's Notes row shows them again | TypeError: (0 , moveRecordNotesToSheets) is not a function |
| (new) (API) tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a detail the tab already holds is not added twice — the copy is only cleared | TypeError: (0 , moveRecordNotesToSheets) is not a function |
| (new) (API) tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a ship: its envision section (already in the tab) stays once; the promoted detail joins it | TypeError: (0 , moveRecordNotesToSheets) is not a function |
| (new) (API) tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a GM's trim of the envision section in the tab stands — the record's whole-notes copy is not put back | TypeError: (0 , moveRecordNotesToSheets) is not a function |
| (new) (API) tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a second world load moves nothing | TypeError: (0 , moveRecordNotesToSheets) is not a function |
| (new) (API) tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab control: a player's client moves nothing — not even on a card the player owns | TypeError: (0 , moveRecordNotesToSheets) is not a function |
| (new) tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — updateShip writes a ship's notes to its Notes tab alone the tab takes the notes; the record keeps no copy | AssertionError: expected '&lt;p>A battered hauler.&lt;/p>&lt;hr>&lt;h4>✦ En…' to be '' // Object.is equality |

- New test passing with and without the fix (a control?): tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — updateShip writes a ship's notes to its Notes tab alone control: an update that leaves the notes alone leaves the record as it was
- New test passing with and without the fix (a control?): tests/unit/notesSheetCanonical.test.js › issue #329 X12 — the sheet's Notes tab reaches the narrator's Notes row control: an `!ship envision` append reaches the row (it writes the Notes tab)

### `scripts/defects/notes-promoted-not-moved.patch` — NOTES-PROMOTED-BEFORE (issue #329 follow-up) — the world-load move clears the record's copy of a promoted detail without appending it to the Notes tab

Test files: `tests/unit/notesPromotedBefore.test.js`.

- On HEAD: 8 passed, 0 failed.
- With the defect: 3 failed (0 only for a missing export); 5 still pass.
- Verdict: **sensitive** — 3 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab an NPC card's promoted details join its Notes tab — the narrator's Notes row shows them again | AssertionError: expected '&lt;p>Keeps her own counsel.&lt;/p>' to be '&lt;p>Keeps her own counsel.&lt;/p>&lt;p>Owes …' // Object.is equality |
| tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a ship: its envision section (already in the tab) stays once; the promoted detail joins it | AssertionError: expected '&lt;p>A battered hauler.&lt;/p>&lt;hr>&lt;h4>✦ En…' to be '&lt;p>A battered hauler.&lt;/p>&lt;hr>&lt;h4>✦ En…' // Object.is equality |
| tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a GM's trim of the envision section in the tab stands — the record's whole-notes copy is not put back | AssertionError: expected '&lt;p>A battered hauler.&lt;/p>' to be '&lt;p>A battered hauler.&lt;/p>&lt;p>A stowawa…' // Object.is equality |

### `scripts/defects/notes-promoted-moved-twice.patch` — NOTES-PROMOTED-BEFORE (issue #329 follow-up) — the world-load move appends a promoted detail the Notes tab already holds, so it shows twice

Test files: `tests/unit/notesPromotedBefore.test.js`.

- On HEAD: 8 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 7 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a detail the tab already holds is not added twice — the copy is only cleared | AssertionError: expected { moved: 1, cleared: +0 } to deeply equal { moved: +0, cleared: 1 } |

### `scripts/defects/notes-promoted-html-resurrected.patch` — NOTES-PROMOTED-BEFORE (issue #329 follow-up) — the world-load move treats updateShip's whole-notes HTML copy as a promoted detail, putting back an envision section the GM trimmed from the tab

Test files: `tests/unit/notesPromotedBefore.test.js`.

- On HEAD: 8 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 7 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab a GM's trim of the envision section in the tab stands — the record's whole-notes copy is not put back | AssertionError: expected '&lt;p>A battered hauler.&lt;/p>&lt;p>&lt;hr&gt…' to be '&lt;p>A battered hauler.&lt;/p>&lt;p>A stowawa…' // Object.is equality |

### `scripts/defects/notes-promoted-any-client.patch` — NOTES-PROMOTED-BEFORE (issue #329 follow-up) — the world-load move runs on a player's client too, writing world documents there

Test files: `tests/unit/notesPromotedBefore.test.js`.

- On HEAD: 8 passed, 0 failed.
- With the defect: 1 failed (0 only for a missing export); 7 still pass.
- Verdict: **sensitive** — 1 assertion(s) fail with the defect.

| Fails with the defect | First failure line |
| --- | --- |
| tests/unit/notesPromotedBefore.test.js › NOTES-PROMOTED-BEFORE — details promoted to the record before X12 reach the Notes tab control: a player's client moves nothing — not even on a card the player owns | AssertionError: expected { moved: 1, cleared: +0 } to deeply equal { moved: +0, cleared: +0 } |
