# Regression-test sensitivity — issues #300, #301 and #302

A regression test is evidence only if it fails while its defect is present
(issue #302, slice A). This file records that, for every fix from the issue
#300 and #301 audits and from issue #302's disturbance matrix (slice B): the
tests that fail with the fix taken out. It was produced by
`scripts/fix-sensitivity.mjs` on 2026-10-27; the patch was applied to
`ec08eb4`. To reproduce:

```bash
node scripts/fix-sensitivity.mjs \
  632a180 c8e4268 c925f10 3749058 23ee366 ea69ddf ed8d688 f068664 19c5ef0 c958eb0 45b7350 \
  ca5bf5d cdb8c80 e572ebd ec08eb4 \
  --inject scripts/defects/b04-recap-cache-count-only.patch --md details.md
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
