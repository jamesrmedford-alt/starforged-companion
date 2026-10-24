# Starforged Companion — Known Issues

Open bugs, workarounds, and items pending resolution. Update this file as
issues are resolved or discovered.

_Last audited against the code at the v1.7.31 cycle (2026-10 repo audit, PR
#281, and its post-merge review fixes); the flow audits below were verified
against source — full traces in `docs/flows/*.md`._

---

## Active issues

### Phone play on The Forge (issue #293) — fixed in the v1.7.34 cycle

| Code | Class | Defect → fix |
|---|---|---|
| FORGE-ART-UPLOAD | WRONG-DETAIL | `uploadSectorImage` (`sectorArt.js`) and `uploadShipMapImage` (`shipMapArt.js`) discarded the `FilePicker.upload` response and returned the path they built. On The Forge the file lands in the Assets Library at an absolute `assets.forge-vtt.com` URL, so the scene pointed at a file that didn't exist (the AUDIO-002 bug). The scene builders also prefixed `/` onto any path → both return `response.path` (falling back to the built path), and `sceneBuilder.js` / `shipMapScene.js` leave absolute URLs as they are. `tests/unit/forgeArtUploads.test.js` and the two scene-builder tests fail with the fix reverted |

### ASSET-ABILITY-TEXT — the narrator never saw what a character's assets do — fixed in the v1.7.34 cycle

Found while scoping collaborative character creation (#291).

| Code | Class | Defect → fix |
|---|---|---|
| ASSET-ABILITY-TEXT | LOSE-PLOT | `readAssets` (`actorBridge.js`) read ability text from `abilities[].text`, a field the vendor `AssetAbilityField` doesn't have (the text is `description`, which `abilityScanner.js` already read). So the CHARACTER block listed assets by name only, on every narrator path. The unit and Quench fixtures used `text`, and the Quench test asserted only the asset name, so both passed → `readAssets` reads `description` and reduces `@Compendium[…]{Move}` links to their labels; the fixtures use the vendor field, and the Quench test asserts the ability text reaches the prompt |

### Narrator continuity & detail persistence (issue #286) — fixed in the v1.7.34 cycle; follow-ups in #287

The audit traced how small details (a scar, a bar's name, an object handed
over, a promise) are stored, sent and kept. Harness composition tests in
`tests/unit/narratorDetailPersistence.test.js` fail with each fix reverted.

| Code | Class | Finding | Fix |
|---|---|---|---|
| A1 | PRODUCED-BUT-DEAD | Sidecar subjects resolved against `entityId`, a field the roster never has: recorded entities' truths had no id, and every entity's state shared the key `""` | One roster shape end to end; `subjectKey` → `entity:<id>` |
| A2 | LOSE-PLOT | The live tier pass looked records up in `game.journal`: nothing saved for Actor-hosted entities | `persistGenerativeTier` writes through the registry |
| A3 | LOSE-PLOT | Draft confirm re-keyed earlier truths to the record's internal id | `promoteNewEntityLedgerSubjects` uses the host document id (also the inciting vow target) |
| A4 | LOSE-PLOT | `@scene` ended the scene it was asked about | It continues the scene (decision recorded) |
| A5 | WRONG-DETAIL | Name index matched articles, titles and shared name parts | Noise-word filter, shared parts dropped, bounded `resolveEntityName` ladder |
| A6 / A7 | LOSE-PLOT | All state dropped at once at the ledger cap; cards kept the oldest five details | State sheds by priority; cards show ten, newest first, with trait slots |
| B1–B5, B7 | LOSE-PLOT | Moves saw no recent prose; no concrete-specifics rule; frame cast lost on moves; text subjects needed the exact phrase; player lines never stored; summary regen in the critical path | See decisions.md → "What every narration is told about the turn before" |
| B6 | MIRROR-DRIFT | A strike stayed in the scene ledger | `propagateRetraction`: tier, lore, summary and session list |
| C1 / C2 | LOSE-PLOT | Scene state had no afterlife; place details became place-less lore; lore picked by recency | `lastKnown` on cards; scene facts to the place's card; `selectLoreForContext` |
| C3 / C4 | LOSE-PLOT | Session boundary = any reload 4 h after the mint; only the recap crossed sessions | End Session or four idle hours; `previousSessionSummary` as LAST SESSION; recap on any mode's first narration |
| C5 | LOSE-PLOT | Clocks, vow progress, rewards, connection standing, End-Session foci in no prompt | All rendered; snapshot dropped on Item changes |
| D2 | LOSE-PLOT | Narration on a player's key discarded its side-data | Relayed to the GM (`narrator.sidecar`) |
| D3 | WRONG-DETAIL | Draft confirm rolled role / goal / look against the narration | Detected role and goal win; no rolled look over a narrated one |
| D4 | LOSE-PLOT | Detection skipped interaction moves and oracle follow-ups; lore floor ran before entity routing | Wider capture; entity lore at the tier floor |
| E | DOC-DRIFT | Help and docs described old defaults and behaviour | Corrected |
| F7 | LATENT | Thinking-off matched the `claude-sonnet-5` prefix (would 400 on Sonnet 5.5) | Exact ids |

**D1 — fixed in the v1.7.34 cycle** (decided in #287): the Private Channel
reads the shared story, and a published reflection is canon (decisions.md →
"The Private Channel reads the shared story; a published reflection is
canon").

**Open — moved to #287** (issue #286 is closed):
- **§F steps 2–6** — the tiered, cached request layout and larger budgets
  wait on the Narrator Usage numbers and a playtest.
- **SUMMARY-KEYLESS-GM** — the rolling summary regenerates on the canonical
  GM (B7); at a table whose GM has no Claude key it is never generated.
- **STRIKE-CHRONICLE** — a strike does not reach the chronicle (or the
  campaign recap built from it).
- **CHRONICLE-FIRST-PC** — chronicle entries are all written to the first PC
  (`resolveActorId`, `chronicleWriter.js`).
- **CONN-BACKGROUND-UNWRITTEN** — a connection's `background` and `secrets`
  have no production writer, so neither renders.
- **CREATE-PERSIST-WHOLE** — entity creators (e.g. `createConnection`'s
  `persistCampaignState`) write the caller's campaignState whole, so the
  make_a_connection auto-create writes the move pipeline's snapshot.
- **TEXT-SUBJECT-LOWERCASE** — a text subject's CURRENT STATE label renders
  lowercased.

### Multiplayer test infrastructure (issue #282) — fixed in the v1.7.34 cycle

Issue #282 gave the unit suite the means to see the 2026-10 audit's bug
classes: permission-faithful stubs (`tests/setup.js`,
`tests/helpers/foundryPermissions.js`), a multi-client table harness
(`tests/helpers/multiClient.js`), concurrency tests of the move pipeline and
the GM relay queue, and producer → consumer composition tests
(`rules/reachability.md` §3 and "The through-line"). With each fix reverted
locally, the harness fails on XCARD-PLAYER-NOOP (7 tests), CMD-PER-CLIENT
(one `!oracle` card per client — four), BURN-IMPROVE-DOUBLE (4) and
STALE-SNAPSHOT-CLOBBER (3). Without the permission stubs, the reverted X-Card
passes. Re-pointing hand-set fixtures at their real producers found one dead
consumer:

| Code | Class | Finding | Fix |
|---|---|---|---|
| RECAP-MATCH-DEAD | PRODUCED-BUT-DEAD | `!recap session`'s "A match was rolled" line read an `isMatch` flag on narrator cards that `postNarrationCard` never wrote, so the line never appeared. Its unit test hand-set the flag | `postNarrationCard` stores `isMatch` from the resolution. The recap tests create cards through it, and `multiplayerComposition.test.js` covers move pipeline → `!recap session` |

`campaignState.characterIds` is still never written (documented in
`schemas.js`; every reader falls back). The new harness suites no longer seed
it.

Items 5–7 (approved 2026-10-19):

- **Static checks (item 5).** CI runs `deadscan --strict`.
  `tests/unit/campaignStateFields.test.js` requires a writer and a reader
  for every campaignState field. `tests/unit/hookGates.test.js` requires an
  author or canonical-GM gate on every document-hook handler.
- **Coverage (item 7).** `src/index.js` is measured (62% lines). The
  chat-command run-on policy moved to `src/multiplayer/commandRouting.js`,
  which is on the core bar.
- **Second-client E2E (item 6).** `test/ci/playwright/multiplayer.mjs` runs a
  GM and a player browser after Quench (`rules/ci-e2e.md` → "Second
  client").

The two new checks' first run found the first three of these; the panel copy was found while verifying the Private Lines E2E scenario:

| Code | Class | Finding | Fix |
|---|---|---|---|
| SECTOR-OVERVIEW-EVERY-CLIENT | DUPLICATE-EMIT | `registerSectorOverviewSync`'s `updateActor` handler rewrote the sector-record overview page on every connected client. A player's client had its update refused; two GMs both wrote | Gated on `isCanonicalGM()` |
| PRIVCHAN-LOCATION-DEAD | PRODUCED-BUT-DEAD | The Private Channel's scene context read `campaignState.currentLocationName ?? currentLocation.name`, which nothing writes. `!at` writes `currentLocationId` / `currentLocationType`, so the "Location:" line never appeared | Resolved through the narrator's `currentLocationName` (the same lookup as the location card). A harness test runs the GM's `!at`, then the player's Private Channel context |
| PRIVATE-LINES-PANEL-COPY | SAFETY | The Companion Settings panel told players their Private Lines were "Stored on this client. Never shared with GM or other players." That has been untrue since SAFETY-PRIVATE-LINES-PLAYER / -SHARED: the lines are relayed to the canonical GM and stored in `campaignState` (decisions.md → "Private Lines in shared narration"). The copy misstated where a safety tool's data goes. The help journal's Settings Reference and `lang/en.json` carried the same claim | The panel, `lang/en.json` and the Settings Reference now say the lines go to the GM's client so all narration respects them, are not shown to other players, and are never mentioned by the narrator |
| CAMPAIGNSTATE-DEAD-FIELDS | DEAD-CODE | Eleven `CampaignStateSchema` fields nothing read or wrote: `_id`, `title`, `version`, `art`, `speechInput`, `sessionCount`, `clockIds`, `oracleResultIds`, `worldTruthsPageId`, `createdAt`, `updatedAt`. `updatedAt` was written only by a `clocks.js` stamp. `persistResolution`'s merge lists still named four dead fields, including `progressTrackIds` | Removed |

Open follow-ups:

- **CAMPAIGN-TRUTHS-UNWIRED.** `buildCampaignTruthsBlock` (narrator and
  Private Channel) reads `campaignState.canonicalTruthSlugs`, but nothing
  writes it: no UI selects canonical truth slugs. So the `<campaign_truths>`
  block never renders. It is marked `UNWIRED`. Wire a selection UI or retire
  the block.
- **INDEX-EXTRACTION** (the rest of item 7). The move pipeline (the inline
  `createChatMessage` handler, about 1,000 lines) and the chat-card button
  wiring still live in `src/index.js`. Both lean on many index-local helpers.
  Measuring `index.js` already counts them toward the floor; moving them into
  modules would let them carry a bar of their own.

### 2026-10 repo audit — all fixed in the v1.7.31 cycle

A whole-repo audit (PR #281, commits 87cb96d + d5d434e) traced **where each
thing executes in multiplayer** — which client runs every chat command, hook
and card button, and where its world write lands — plus credit-the-roller,
mirror stores, and dead surface. Headline: Foundry fires `createChatMessage`
on every connected client and almost no command checked its author, so every
`!command` ran once per browser — and several player features only "worked"
because the GM's client re-ran the player's command with GM authority. The fix
is two pieces of architecture: chat-command routing (`CHAT_COMMAND_ROUTES`,
decisions.md → "Chat commands run once: author / canonical-GM / keyed-runner
routing") and the canonical-GM relay (`src/multiplayer/gmRelay.js`,
decisions.md → "Player-invoked world writes go through the GM relay"). An
adversarial review of the merged PR (findings #0–#20) found a second layer of
defects in that new architecture; every one was fixed in the follow-up commits
ba3d69d + 6e2b532 (second table). Accepted limitations and the open
follow-ups found along the way are listed after the tables. Post-fix behaviour
lives in the matching `docs/flows/*-flow.md` maps.

**Audit findings (PR #281):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| XCARD-PLAYER-NOOP | SAFETY | A player's `!x` posted "Scene paused" but never recorded `campaignState.xCardActive` (a GM-only write) — the narrator kept going; the programmatic `!x` path's "author fallback" comment described code that didn't exist | `playXCard` relays `xcard.activate` to the canonical GM; the card says when no GM could record the pause; GM-only **Resume narration** button, `!x clear`, `module.api.clearXCard()` (decisions.md → "X-Card: anyone plays it, a GM resumes it") |
| CMD-PER-CLIENT | DUPLICATE-EMIT | Only `!incite` / `!reveal-site` / `!clear-site` checked the author; every other command ran on every client — `!oracle`, `!ptp`, `!bond`, `!stations`, `!clock list` posted one card per browser with independent dice, `@scene` / `!ship envision` made one Claude call per keyed client | `CHAT_COMMAND_ROUTES` (`src/index.js`): each command declares `RUN_ON.AUTHOR` / `CANONICAL_GM` / `CLAUDE`; every client recognises it, one runs it, the rest log `console.debug` |
| CMD-GM-ONLY-LEAK | GM-GATE | `!at`, `!journal`, `!pace`, `!scene`, `!sever`, `!truths`, `!lore`, `!migrate-entities`, `!sector <name>`, `!clock new` warned a player "GM only" — then executed anyway on the GM's client | AUTHOR routing: only the typist's client runs the command, so its own `game.user.isGM` check decides |
| DIALOG-EVERY-SCREEN | DUPLICATE-EMIT | `!flag`, `!fate`, `!break`, `!begin-session`, `!end-session` opened their dialog on every connected screen | AUTHOR routing — the typist's screen only |
| CREDIT-ROLLER-SWEEP | ATTRIBUTION | "Credit the roller" violations: the pipeline's ability scan used `getPlayerActors()[0]` and Reach a Milestone the first PC with the speaker in scope; `markLinkedVowMilestone`, the won-fight reward, `!ptp` harm and `!bond` momentum (`game.user.character ?? first PC`) all credited a GM-local default | One `rollerActor` (speaker; first PC only as fallback) drives the ability scan, stat enrichment, Reach a Milestone, companion health, burn/improve and the decisive-action / Face Defeat suffer routes; `dispatchPayThePriceSufferRoute(route, actorId)`; `resolveVowHolderActor`; the fight card stores `actorId`; `!bond` momentum → the speaker's PC |
| FULFIL-REWARD-NEVER | PRODUCED-BUT-DEAD | Fulfill Your Vow completed every copy, then looked the promised reward up among *open* vows — the reward was never granted | `grantLinkedVowReward` takes the copies the payoff already resolved (completed ones included) and prefers the roller's copy (refined by FULFIL-REWARD-FIRST-PC) |
| REPAIR-BYPASS-SHIP | MIRROR-DRIFT | `!repair` wrote `flags.ship.integrity` raw (no `integrityMax` cap, raised while battered), cleared battered on the native field only, took supply from the GM's own bound character, and on a player's client only "allocated" the spends | GM_ACTIONS `repair.apply` → `applyRepairSpends`: battered cleared first, then `repairIntegrity` (capped, refused while battered) through `src/entities/ship.js`; supply from the repairing player's PC (owner or GM only); the card says what actually happened |
| BURN-IMPROVE-DOUBLE | DOUBLE-APPLY | Burn Momentum / Improve Result could be clicked again (another client, a re-render) and applied twice | `move.burnMomentum` / `move.improveResult` relays: consumed + in-flight check on the GM, owner-or-GM only; the button re-arms on no GM, failure, or no confirmation within 15 s |
| CUSTOM-ORACLE-D100 | RULES-FIDELITY | Custom tables always rolled a d100 (a 1–6 table missed 94% of rolls), entries were never validated, and new tables reached other clients only after a reload (deletes never) | Custom tables roll 1..max (`dieSizeForTable`), entries must tile it from 1; `campaignState.customOracles` canonical, mirrored on every client by `syncCustomOraclesFromState` (`updateSetting` hook); custom ids overwrite, built-ins can't be redefined; new `!oracle <table-id> [question]` (decisions.md → "Custom oracle tables roll their own die") |
| CLOCK-RETRIGGER | DUPLICATE-EMIT | Advancing or filling a full clock re-announced TRIGGERED and paid for another vignette; `!clock fill` never got one; the panel's ↻ / + changed state silently | `advanceClock` / `fillClock`, shared by the commands and the panel: a full clock posts "already triggered" (no write, no vignette); fill vignettes on the filling step only |
| TAKE-BREAK-NEXTMOVEADD | PRODUCED-BUT-DEAD | Take a Break "Move on" wrote `campaignState.nextMoveAdd`; nothing read it | `src/moves/nextMoveAdd.js`: added to the next action roll (not progress / no-roll moves), then cleared on the store (decisions.md → "Take a Break's +1 applies to the next action roll") |
| ENDSESSION-FOCI-UNREAD | PRODUCED-BUT-DEAD | End a Session saved `questFocus` / `connectionFocus` "for the next Begin a Session" — no reader | Begin a Session shows "Focus from last session" (dialog + card), then clears both |
| SESSION-WRITES-DROPPED | MULTIPLAYER-WRITE | A player's Set a Flag, Take a Break, Begin / End a Session posted their cards while `if (isGM)` skipped every world write; the Reach a Milestone and connection pickers did nothing for players | GM_ACTIONS `safety.setFlag`, `session.takeBreak`, `session.begin`, `session.end`, `milestone.pick` (the connection picker: CONNECTION-PICK-REFIRE); cards say when no GM was connected; the Begin / End vignettes run on the canonical GM |
| SAFETY-PRIVATE-LINES-PLAYER | SAFETY | `syncSafetyToCampaignState` returned early on player clients, so a player's Private Lines never reached `campaignState.safety.privateLines` | GM_ACTIONS `safety.syncPrivateLines` → `applyPrivateLinesSync`, keyed on the relay requester; re-pulled when a GM becomes ready (RELAY-LOAD-WINDOW). Shared narration reads them too — SAFETY-PRIVATE-LINES-SHARED (below) |
| PTP-CLOCKS-PLAYER | MULTIPLAYER-WRITE | A player's `!ptp` advanced tension / vow clocks only because the GM's client re-ran the whole command with its own dice; AUTHOR routing removed that (caught before merge) | GM_ACTIONS `payThePrice.advanceClocks` (`src/clocks/payThePriceClocks.js`) — once, on the canonical GM |
| RECAP-DENIED-SILENT | SILENT-FAILURE | With "Recap GM-only" on (the default) a player's `!recap` matched no route and vanished | `isDeniedRecapCommand` route warns the player |
| HOOK-ISGM-EMITTER | DUPLICATE-EMIT | Single-emitter hooks gated on plain `isGM` (a two-GM table double-emits): starship / connection `createActor` seeding, command-vehicle `createItem` / `deleteItem` + their ready scan, both world-truths journal hooks, the `updateActor` momentum-bounds recalc, the ready-hook session-ID / auto-recap block | `isCanonicalGM()`; idempotent ready-time work (help journal, world journals, migrations, macros, `closeWorld`) stays on `isGM` |
| SECTOR-SWITCH-001 | UX | A player's `!sector <name>` silently did nothing (moved to Resolved) | Bare `!sector` posts a usage card to the typist; a player's switch warns GM-only |
| INTERP-TRACKS-BLIND | WRONG-DETAIL | `buildContextSummary` read `campaignState.progressTrackIds`, which nothing wrote — the move interpreter was never told about open vows or tracks | Reads open vow Items (owner-tagged with several PCs) + open non-vow tracks from the Progress Tracks journal, each capped at 8 |
| I18N-UNWIRED | PRODUCED-BUT-DEAD | `src/system/i18n.js` had no production consumer — the move-confirm dialog showed raw move / stat slugs (model text unescaped), the suffer card raw meter keys | `localizeMove` / `localizeStat` / `localizeMeter` in the confirm dialog (escaped), `localizeMeter` / `localizeDebility` in the suffer-card summary |
| AUDIT-DEAD-SURFACE | DEAD-CODE | `persistResolution` steps 4–6 (`markProgress`, `markLegacyProgress`, `applyCombatPosition`, `markProgressOnJournalTrack` — `consequences.progressTrackId` was never set) and the `progressMarked` / `progressTrackId` consequence fields; the `campaignState.activeCharacterId` fallback (never written — really `getActor(null)`, the GM's own PC); write-only `pendingClarification` / `loreRecapSessionId` / `progressTrackIds`; five never-read settings (`worldJournalEnabled`, `worldJournalAutoDetect`, `characterContextEnabled`, `chronicleContextCount`, `activeCharacterId`); `getSafetyConfig`; 11 unused `index.js` imports; the entity art-path exports, `updateCreature`, `getChronicleForContext`, `annotateEntry` (+ its `annotations` writes), `shouldApplyMischief`, nine unused schema exports | Deleted with their readers and tests; with no speaker, `persistResolution` credits the first PC; `MoveResolutionSchema` survives as a doc-only `@typedef`; `CampaignStateSchema` gains `questFocus` / `connectionFocus` |
| DEADSCAN-BLIND | TOOLING | `scripts/deadscan.mjs` reported the tree clean while it wasn't: constant-keyed settings were invisible (31 of 82 checked), Quench usage and comment mentions counted as consumers, module reachability unchecked | Rewritten around an exported `scan()`: constant keys resolved, comments stripped, `src/integration/` treated as test code (QUENCH-ONLY buckets), an UNREACHABLE-modules section; unit-tested (`tests/unit/deadscan.test.js`) |
| UNTESTED-CAMPAIGNSTART | TEST-GAP | `src/session/campaignStart.js` had no unit or Quench coverage — and reported the inciting incident / ship envision as success when the narrator returned nothing, and swallowed confirm / read errors | 27 unit tests; an empty-prose phase reports ⚠️ degraded; errors warn |

**Post-merge review findings (fixed in ba3d69d + 6e2b532):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| ORACLE-SIDECAR-OFF-GM | LOSE-PLOT | (#0, #14) The oracle follow-up narrated on the author's client whenever it held a key, but the narrator sidecar is applied only on the canonical GM — a keyed player's (or second GM's) `!oracle` / `!ptp` follow-up silently dropped its truths, state changes and scene frame | `requestOracleNarration` relays `oracle.narrate` whenever a keyed GM is active (`hasKeyedActiveGM`); a keyed author narrates locally only as the no-keyed-GM fallback (debug-logged); `applyNarratorSidecar` logs its non-canonical skip (decisions.md → "Claude calls run where a key lives, exactly once") |
| RELAY-LOAD-WINDOW | RACE | (#1, #11, #17) Relays are fire-and-forget: one emitted while the GM's client was still loading (its listener installs in `ready`) was dropped while `requestGmAction` reported success — the Private Lines re-send on `userConnected` always fell in that window; concurrent handlers' campaignState read-modify-writes could interleave | The canonical GM broadcasts `gmRelay.ready` once its listener exists (`announceGmRelayReady`); players re-send on it (`onGmRelayReady` — pull, not push); every GM action runs through one serialised queue (released in `finally`, 60 s wait cap) |
| STALE-SNAPSHOT-CLOBBER | LOSE-STATE | (#16) The move pipeline reads campaignState before its confirm dialog and Claude calls; `persistResolution`, the narrator-sidecar persist and scene start / end wrote that whole snapshot back — undoing an X-Card, Take a Break, flag, Private Lines, `!bond` ticks … relayed meanwhile | `persistResolution` re-reads and merges (`mergeWithLatestState`); scene lifecycle and the sidecar write only their own fields onto the latest state (`persistCampaignStateFields`) (decisions.md → "Long-running pipeline writes merge relay-owned fields") |
| XCARD-MOVE-NARRATION | SAFETY | (found fixing #16) `narrateResolution` had no X-Card gate — move narration's only gate lived in the context assembler (ASSEMBLER-003), whose packet narration stopped reading and which is now deleted — so moves narrated straight through an active X-Card; every other narrator entry point had its own gate, but read only the caller's (stale) snapshot | `narrateResolution` posts a "narration paused" notice (outside the narrator flag family); every narrator X-Card check also reads the live setting |
| CONNECTION-PICK-REFIRE | DOUBLE-APPLY | (#2, #8) With the picker's `isGM` gate dropped, a player's click posted the forced move but couldn't stamp the GM-authored card resolved — the buttons re-armed and a second click rolled Forge a Bond / Develop again | GM_ACTIONS `connection.pick` → `applyConnectionPick` (`src/moves/cardActions.js`): in-flight + resolved check, choice validated against the card, forced move posted as the clicker's PC, then stamped |
| FIGHT-VOW-BUTTONS-REFIRE | DOUBLE-APPLY | (#5) Won-fight **Mark milestone** / **Deepen your bond** used raw socket emits with no resolved flag (each click applied again) and vanished silently with no GM | GM_ACTIONS `fightVow.markMilestone` / `fightVow.deepenBond`: values from the GM-authored card, one-shot via `flags.resolvedActions`; the raw `vow.markMilestone` / `connection.deepen` relays deleted |
| RELAY-PAYLOAD-UNCHECKED | VALIDATION | (#4) `bond.apply` and `milestone.pick` applied whatever the payload said — unbounded ticks / momentum to any actor, any rank, any vow | `!bond` effects clamp to {0, 2} (both together refused), a rank raise only to the connection's next rank, momentum only to a PC the requester owns; picks must match a button on the card (`flags.choices`, or the button HTML on older cards) and an owned PC |
| REPAIR-BATTERED-FLAG | MIRROR-DRIFT | (#7, #13) The new `!repair` read battered from the ship flag, which nothing sets true — the starship sheet's toggle writes only `system.debility.battered` — so a sheet-battered vehicle couldn't be cleared and still gained integrity; the entity panel and the narrator's COMMAND VEHICLE line read the same mirror | `isShipBattered` (native field canonical, flag a write-through mirror via `updateShip`) read by `repairIntegrity`, `!repair`, the entity panel and the narrator (decisions.md → "Starship battered: the native sheet field is canonical") |
| RENARRATE-ATTRIBUTION | ATTRIBUTION | (#6) Burn / Improve re-narration called `narrate(res, null, campaignState, {})` — the slot of the `contextPacket` parameter #271 removed, so `narrateResolution` got `campaignState = null` and no speaker; the roller's character never reached the prompt | `narrate(res, campaignState, { speakerActorId })` from the card's `actorId`; persist likewise |
| FULFIL-REWARD-FIRST-PC | ATTRIBUTION | (#9) Once every copy was completed, the fulfil fallback collected only the first PC's copy, so a shared vow's reward missed the roller; with one other open vow the sole-open rung could pay *that* vow | `payFulfilledVowNative` collects every PC's copy and prefers the roller's; the sole-open-vow rung never fires when the name matches an already-completed vow |
| MOMENTUM-BOUNDS-GM-EDIT | GM-GATE | (#10) With the recalc moved to `isCanonicalGM()`, a GM ticking an impact on a player's sheet ran it nowhere (own write skipped; the owner isn't canonical) — momentum max / reset went stale | `momentumRecalcRunsHere`: a player's edit → the canonical GM; a GM's edit → the PC's lowest-id active owner; no owner online → the canonical GM, unless it made the edit |
| INCITE-ROUTING | SILENT-FAILURE | (#15) `!incite` was AUTHOR-routed with no GM check; on a player's client the premise persist, detection, tier and lore writes all skipped silently | `RUN_ON.CLAUDE`; `runIncitingIncident` debug-logs both skipped GM-only branches |
| CLAUDE-CMD-KEYLESS-GM | WRONG-RUNNER | (#12) Moving `@scene`, `!recap`, `!ship envision` / `history` to the canonical GM broke them at a keyless-GM table where a player held the key ("Claude API key not configured") | `RUN_ON.CLAUDE`: the keyed canonical GM when one is active, else the author with their own key — every client computes the same runner |
| DEADSCAN-CONST-MASK | TOOLING | (#19) A bare constant setting key (`SETTING_KEY`) counted by identifier across every file, so an unrelated same-named constant (`combatTracker.js` vs `apiTransactionLog.js`) masked a dead setting | References count only in the defining file and files importing that constant (named / aliased / namespace / dynamic / re-export); a key the file neither defines nor imports is reported unresolved, not guessed |
| DOC-DRIFT-2026-10 | DOC-DRIFT | (#18, #20) Flow maps, file-structure, decisions, known-issues, the `MoveResolution` JSDoc, the narrator-sidecar comment and the gmRelay "every relayable action" header still described pre-audit behaviour | Docs updated this cycle; comments corrected; the gmRelay header lists the remaining legacy relays |

**Found while verifying this write-up (fixed in the v1.7.31 cycle):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| SAFETY-PRIVATE-LINES-SHARED | SAFETY | Shared narration (moves, paced turns, `@scene`, oracle follow-ups, vignettes, the inciting incident) carried no Private Line at all — not even the GM's: `buildNarratorSystemPrompt` called `formatSafetyContext(campaignState)` with no user id, and `resolvePrivateLines` returns `[]` without one. A player's personal hard limit constrained only their Private Channel. Pre-existing; the relay fix (SAFETY-PRIVATE-LINES-PLAYER) only got the lines stored | `formatNarratorSafetyContext` (`src/context/safety.js`): a GM's client carries every player's lines (deduplicated); a player's client — narrating only with no keyed GM online — carries that player's own, read from their client setting, never another player's. The heading tells the narrator never to mention or hint at them (decisions.md → "Private Lines in shared narration") |

**Second review round (fixed in the v1.7.31 cycle):**

| Code | Class | Finding | Fix |
|---|---|---|---|
| SIDECAR-LEDGER-CLOBBER | LOSE-STATE | The narrator-sidecar persist merged only its own fields onto the latest store, but wrote those ledgers whole from the move pipeline's snapshot: a `!truth` strike or an oracle follow-up's truth that landed during the narration was dropped (`persistResolution`'s union then had nothing left to keep), and a scene End a Session closed mid-move came back — and was archived a second time at the next scene start | `persistSceneLedgerFields` (`sceneLifecycle.js`): nothing written when the store moved to another scene; otherwise `sceneTruths` unioned by id via `mergeSceneLedgers`, now shared with `persistResolution` |
| XCARD-QUEUED | SAFETY | The serialised GM queue held `xcard.activate` behind Claude-calling handlers (oracle follow-up, Burn / Improve re-narration, End a Session's summary) for up to 60 s while the unqueued move pipeline narrated through it; the GM's own `!x` card waited too, and a resume clicked meanwhile was undone when the activation landed | `xcard.activate` runs unqueued (`gmRelay.js` `UNQUEUED_ACTIONS`) — safe once no handler writes back a snapshot held across an await (END-SESSION-CLOBBER) |
| END-SESSION-CLOBBER | LOSE-STATE | `applyEndSession` wrote back the campaignState it read before `endScene` and the summary's Claude call, reverting a move persisted meanwhile (its session-log entry, legacy ticks, entity ids) and resurrecting its released `pendingMove` lock — every later move was then refused until a reload. Pre-existing | Merges only End's fields (`questFocus`, `connectionFocus`, `sessionActive`, `sessionActiveStartedAt`) onto the latest store (`mergeOwnedFields`); the Session Log gets that merged object; a failed write still fails the card honestly |
| SCENE-START-OFF-GM | GM-GATE | With no keyed GM online, `RUN_ON.CLAUDE` runs `@scene` / `!incite` on the author: a player's client ran `startScene` / `endScene` — campaignState, WJ Lore and entity-tier writes a player can't make (permission errors; the scene never started) | `@scene` and `ensureSceneStarted` start a scene on the canonical GM only (debug-logged elsewhere); the author's client just narrates |
| FULFIL-SUBSTRING-RUNG | ATTRIBUTION | The FULFIL-REWARD-FIRST-PC fix blocked only the sole-open-vow rung: once "Find the ship" was completed, the substring rung still resolved the open "Find the ship's captain", which got the payoff (and its own later fulfilment was skipped as already paid) | An exact name for a completed vow skips the substring rung too; `payFulfilledVowNative`'s all-copies fallback then finds the completed vow |

**Accepted limitations** (recorded, not defects):

- **Relay requester ids are client-asserted** (review #3). Foundry's module
  socket does not identify the sender — the listener receives only the
  payload — so `ctx.requesterId` is whatever the emitting client wrote.
  Permission checks (`ctx.requesterIsGM`, `requesterOwnsActor`, "a client
  writes only its own Private Lines") protect **honest clients only**; a
  hand-crafted emit from a console or macro can claim any user. Mitigation:
  handlers clamp and validate values and take effect values from GM-authored
  cards, so a forged request can only do what the UI could have done.
- **No ack channel.** A relay that lands while the GM's client is loading is
  still dropped; only Private Lines are re-pulled on `gmRelay.ready`. An X-Card
  played in that window says "Scene paused" without being recorded. Relayed
  card buttons re-arm after 15 s if the card isn't marked used.
- **One serialised GM queue.** A long handler (an oracle follow-up's Claude
  call, End a Session's summary) delays later relays until it settles or 60 s
  pass. The X-Card is exempt — it runs the moment it reaches the GM.
- **Session vignettes need a keyed GM.** The Begin / End a Session galley and
  closing vignettes run inside the canonical-GM relay handlers, so at a
  keyless-GM table they are skipped (a player's key isn't used).
- **Momentum recalc gap:** a canonical GM's own sheet edit of a PC whose owner
  is offline is not recalculated (own-write skip; debug-logged).
- **Fight-vow stamps are optimistic:** `fightVow.*` marks the card applied
  even when `markLinkedVowMilestone` / `deepenLinkedConnection` logged and
  swallowed an internal failure, so a failed mark can't be retried from the
  card.
- **The persist merge has no baseline:** two concurrent adds to the same
  legacy track keep the larger; `sceneState` / `sceneFrame` / `spotlight` /
  `currentLocation*` / `sectors` changed by a relay mid-pipeline are overwritten
  by the pipeline's copy; an entity id removed mid-pipeline can come back via
  the id-list union (readers filter missing documents).
- **AUTHOR routing changes:** a player's `!sfc encounter` posts the stat card
  only (token placement is GM-only); a command message with no resolvable
  author (a programmatic / legacy shape) still runs on every client that
  receives it.
- **Private Lines are private by convention, not by storage.** They are never
  shown in another player's UI or sent in another player's narrator request,
  but the canonical GM stores them in the world-scoped `campaignState`, which
  every client receives — a player's console can read them.

**Open follow-ups** (found during the audit or while verifying this write-up):

- **RELAY-LEGACY-KINDS** — four older world-writing socket relays predate
  gmRelay and have no requester context, serialisation or no-GM warning:
  `expedition.recommit`, `combat.enterFray` (`src/index.js`), `vow.setReward`,
  `vow.linkConnection` (`src/session/swearVow.js`). Fold them into
  `GM_ACTIONS` when next touched (listed in the gmRelay header).
- **CARD-STAMP-NONOWNER** (from source; not reproduced live) — two more
  GM-authored cards are stamped "used" from the clicker's client, which a
  player can't do (Foundry lets only a message's author or a GM update it):
  the pipeline's suffer-choice card (`finalizeResolved`,
  `src/moves/sufferCard.js` — warned) and the narrator card's Roll button
  (`rolled` flag, `src/index.js` — debug-logged, see PLAYTEST-1712 K). After a
  player's click the card stays live on every other client, so a second click
  (the GM's, or after a re-render) applies the suffer or rolls the move again.
  Same class as CONNECTION-PICK-REFIRE; the fix is a `GM_ACTIONS` kind that
  checks and stamps the card on the canonical GM.

`node scripts/deadscan.mjs` after the follow-up: **0 dead exports, 0 dead
settings, 0 unreachable modules** (82 settings checked); QUENCH-ONLY
`getLastJournalCommandPromise` (a Quench seam); TEST-ONLY `NARRATOR_CLASSES`
(the documented contract anchor) and `sufferDamage`
(SHIP-INTEGRITY-API-UNWIRED). Unit suite: 145 files / 3,295 tests, coverage
85.1 lines / 73.3 branches / 83.2 functions.

### Unreachable-code audit (2026-07) — all resolved in the v1.7.30 cycle (issues #269–#277)

A whole-tree sweep for produced-but-unconsumed code. **Every finding is now
fixed** (issues #269–#277, "Please address the remaining recent issues"):
the lore-recap injection re-homed to the live seam, the assembler retired
(global token budget declared obsolete), the 14 theme oracles registered,
the dead entity API torn down bidirectionally (allyFlag/sceneRelevant fields
retired with their readers), planets/locations wired into the sector roster,
windowPosition wired, and the Tier-3/Tier-4 surface deleted — plus the
assembler-deletion collaterals swept per the new bidirectional-teardown rule.
Post-fix proof at the time: `node scripts/deadscan.mjs` reported **0 dead
exports, 0 dead settings** — but that scan could not see settings registered
through constants, counted Quench and comment-only mentions as consumers, and
never checked module reachability, so the "clean" tree still held dead
surface. The 2026-10 audit rewrote the scan and removed what it found
(DEADSCAN-BLIND / AUDIT-DEAD-SURFACE, above). Dispositions per finding:
`docs/flows/unreachable-code-audit.md`.
Original headline items (issue in the first column):

| Issue | Code | Class | Finding |
|---|---|---|---|
| #271 | ASSEMBLER-DEAD-IN-PROD | DEAD-IN-PROD | `src/context/assembler.js` (1175 lines) — sole export `assembleContextPacket` has zero production callers (tests only); superseded by `buildNarratorExtras`. Blocked by #269/#270 |
| #269 | LORERECAP-INJECT-ORPHANED | PRODUCED-BUT-DEAD | `!lore` persists `campaignState.loreRecap` "for context injection" but its only injector (the dead assembler) was retired in 2026-07 — the narrator silently stopped receiving the world-lore recap. A real regression: re-home into `buildNarratorExtras`, or drop the field |
| #270 | SESSION-NOTES-STUB | DEAD-STUB | `buildSessionNotesSection` reads `sessionState.notes`, which has no writer anywhere — always rendered empty. Wire the feature or remove the stub |
| #272 | THEME-PERIL-OPP-DEAD | DEAD-CONTENT | 14 theme `*_PERIL`/`*_OPPORTUNITY` oracle tables authored in `tables/themes.js`, never registered in `roller.js` (SITE-ZONE-TABLES-DEAD repeating) |
| #273 | FORMATFORCONTEXT-DEAD | DEAD-EXPORT | `formatForContext(entity)` defined in 7 entity modules, zero consumers (masked by a same-named live truths fn) |
| #274 | SCENERELEVANT-DEAD | INCOMPLETE-TEARDOWN | `setSceneRelevant` left dead in 5 entity modules after the 2026-07 cleanup removed only connection.js's copy (+ addRumor/setProject/addFeature/listAlly/Scene) |
| #271 | CONTEXTPACKET-PARAM-DEAD | DEAD-PARAM | `narrateResolution`'s `contextPacket` param unread; every caller passes `null`/`{}`; JSDoc still points at the dead assembler (retired with the module) |
| #276 | SETTING-DEAD | DEAD-SETTING | `locationArtSource`, `privateChannel.windowPosition` — registered, never read/written |

Plus #275 (`listLocations`/`listPlanets` dead producers) and #277 (Tier-4 dead
singletons — telemetry readers, roller helpers, unused schema/enum exports); a
Tier-5 test-only-in-prod set is documented, no issue. Checked clean:
`CONSEQUENCE_MAP` (all 52 keys live), chat-command dispatch. Not swept:
statement-level dead branches inside the four largest files (parallel reader
agents hit the session rate-limit) — see the doc's §8.

### Vault & derelict (site) audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the site creation/exploration audit; all six defects were fixed
in the same cycle ("Please address all items"). Post-fix behaviour:
`docs/flows/site-flow.md`. Creation and discovery were already solid; the
fixes are all on the exploration side.

| Code | Class | Defect → fix |
|---|---|---|
| SITE-ZONE-TABLES-DEAD | LOSE-CONTENT | 13 dead derelict tables registered (type-by-location + Access suite + seven zone AREA tables) — reachable via `!oracle` and the site-aware waypoint seeds |
| SITE-WAYPOINT-BLIND | WRONG-DETAIL | `buildOracleSeeds(currentSite)` rolls the vault interior / derelict Access tables when the current location is a site; the pipeline passes `getCurrentSiteKind(campaignState)` |
| SITE-ANCHOR-ABSENT | LOSE-PLOT | Discovered sites render a "Charted sites" block in the ACTIVE SECTOR anchor (type + status) |
| SITE-TYPE-TABLE-MISMATCH | canon fidelity | `derelictTypeTableFor(location)` routes the type roll to the planetside/orbital/deep-space table |
| SITE-DISCOVERY-CARD-GENERIC | LOSE-PAYOFF | The Site Discovered card now surfaces the location record's first look |
| SITE-NO-COMPLETION | minor | `clearSectorSite` + `!clear-site` close the unexplored → visited → cleared lifecycle |

Dispositions: interior-in-one-field and no-zone-position both reaffirmed;
zone AREA tables reachable by `!oracle` — see the flow doc §4.

### Narrator-consistency audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the consistency-check pipeline audit; all three defects and the
actionable exposures were fixed in the same cycle ("Please address all
identified issues"). Post-fix behaviour: `docs/flows/narrator-consistency-flow.md`.

| Code | Class | Defect → fix |
|---|---|---|
| NARRCHK-TRUNC-SILENT | LOSE-DETECTION | 250-token silent truncation → `max_tokens: 1000` + a `stop_reason` warning |
| NARRCHK-CTX-DROPPED | WRONG-DETAIL | Oracle follow-ups dropped matched entities → all twelve apply sites pass `extras.matchedEntityIds` uniformly |
| NARRCHK-REMEDY-MISMATCH | design defect | One-size retract button → kind-aware review card (dialog button for truth/state; targeted remedy hints for frame/ship/identity/retraction) |

Exposures: standing contradictions now post once per scene (in-memory dedup);
medium-confidence stays telemetry-only (recorded in decisions.md); pre-burn
cards lingering accepted; the "check on, notifications off" silent mode is
labelled in the setting hint.

### Faction lifecycle audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the faction lifecycle audit; all five defects were fixed in the
same cycle ("Please address all identified issues"). Post-fix behaviour:
`docs/flows/faction-flow.md`. Headline: the dead assembler packet was
retired and its load-bearing sections (threats, faction landscape,
confirmed lore) now flow through `buildNarratorExtras`.

| Code | Class | Defect → fix |
|---|---|---|
| FACTION-PACKET-DEAD | LOSE-PLOT | The 17-section packet was never read → retired from all three live callsites; threats / faction landscape / confirmed lore now render as narrator sections [4d]-[4f] via `buildNarratorExtras` (existing WJ toggles apply); the assembler module is retained for reference/tests |
| FACTION-DUAL-STORE | WRONG-DETAIL | Two unreconciled stores → draft-confirm inherits the WJ attitude and backlinks `entityId`; the record is canonical, the WJ entry is the intelligence log |
| FACTION-ATTITUDE-SPLIT-BRAIN | WRONG-DETAIL | Attitude shifts never reached the record → every `recordFactionIntelligence` write syncs `record.relationship` via `ATTITUDE_TO_RELATIONSHIP` |
| FACTION-RECORD-WRITE-ONCE | LOSE-PLOT | Frozen records → `seedFactionRecord` rolls the faction oracles on confirm (idempotent `seeded` flag) and the attitude sync is the narrative write path |
| FACTION-DETECTOR-ONLY-CONTEXT | INVENT-RISK | Narrator blind to the landscape → [4e] FACTION LANDSCAPE on every call with a stances-are-established guard |

Dispositions: faction stance's canonical home is the entity record
(decisions.md); no dissolution lifecycle reaffirmed.

### Character-detail drift audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the character-detail drift audit; every defect and the
actionable exposure were fixed in the same cycle ("Please address all
findings"). Post-fix behaviour: `docs/flows/character-detail-flow.md`
(§3 resolved ledger, §4 dispositions). The theme was completing the
pronoun-propagation cluster (v1.7.10/11 findings E/R): vignettes, entity
cards, portraits, and audio were covered — the core CHARACTER pipeline and
the NPC-confirmation flow were not.

| Code | Class | Defect → fix |
|---|---|---|
| CHAR-PC-BLOCK-STARVED | WRONG-DETAIL | `getActiveCharacter` narrowed the snapshot to 4 fields on all nine narrator paths → now returns the full snapshot (pronouns, callsign, biography, stats, impacts, assets, vows reach every prompt); a composition test locks the live path |
| CHAR-PARTY-NAMES-ONLY | WRONG-DETAIL | PARTY roster was bare names → carries `{name, pronouns, callsign}` per member with a binding-pronouns rule |
| CHAR-PERSPECTIVE-NO-PRONOUN-RULE | INVENT-RISK | No pronoun rule in either perspective → recorded pronouns are binding; third person forbids inferring gender from names |
| CHAR-NPC-PRONOUN-ROLL-BLIND | WRONG-DETAIL | Confirming a detected NPC rolled pronouns randomly → the detection pass, draft card, auto-create, and the inciting `Vow target:` line all capture the prose-established set; the finding-E roll is fallback-only |
| CHAR-SIDECAR-NO-PRONOUN-ANCHOR | LOSE-PLOT | Identity anchor omitted pronouns → the required anchor (and example) includes the pronouns the prose used |

Exposures: the consistency check now audits RECORDED IDENTITIES (PC + matched
NPC pronouns, kind `identity`); recap/chronicle inherit the fixed CHARACTER +
PARTY blocks; PC appearance stays biography-anchored (reaffirmed — no vendor
field).

### Narrator-context audit findings (2026-07) — all fixed in the v1.7.30 cycle

Surfaced by the narrator context/memory audit; every defect and the
actionable design exposures were fixed in the same cycle ("Fix all gaps").
Post-fix behaviour is documented in `docs/flows/narrator-context-flow.md`
(§3 resolved ledger, §4 design decisions); design reference:
`docs/narrator/narrator-memory-architecture.md`.

| Code | Class | Defect → fix |
|---|---|---|
| NARR-RING-VOWSCENE | LOSE-PLOT | Vow-swearing scene card lacked the flag family → carries `narratorCard`/`narrationText`/`sessionId`; the oath scene now feeds the ring, rolling summary, and recap |
| NARR-RING-CLOCKVIG | LOSE-PLOT | Clock vignettes (Pay the Price, Begin Session, manual advance — all three post sites) lacked the family → all carry it now |
| NARR-SIDECAR-SILENT | LOSE-PLOT | Fence-less responses and pre-fence maxTokens truncation were invisible → `applyNarratorSidecar` warns on a missing fence; `callNarratorAPI` warns on `stop_reason: "max_tokens"` |
| NARR-INCITING-SCENE | LOSE-PLOT | Premise wrote under `currentSceneId: null`, first turn's implicit endScene discarded opening state/frame → `narrateIncitingIncident` starts the scene first; the first move continues it |
| NARR-SESSION-SCENE | LOSE-PLOT | End Session / 4h re-mint left the scene open across sessions → End Session ends the scene (`session_close`); the ready-hook closes a stale scene before re-minting (`session_gap_remint`) |
| NARR-TRUTH-DUP | WRONG-DETAIL | Required identity anchors accreted duplicates unboundedly → `applySidecar` dedups on subject + normalised fact; the sidecar instruction says anchors are recorded once |
| NARR-RETRACT-PASSIVE | INVENT-RISK | A bare Strike only hid the truth → renders as a CORRECTED do-not-re-assert block (never dropped, capped at 5); the write layer blocks narrator re-assertion of a retracted fact; the consistency check audits retractions |
| NARR-CMD-SUBJECT | WRONG-DETAIL | Commands resolved subjects without the roster → `!truth` / `!state` pass `collectAllEntities`, so entity-keyed entries are addressable by name |
| NARR-BOND-RANK-STALE | WRONG-DETAIL | Bond-Item rank never updated on record rank raises → `setBondItemRank` mirrors at both raise sites (develop-match, `!bond`-match) |

Design exposures addressed in the same cycle: the consistency check now
defaults ON and audits the full ledger block (frame, truths, retracted
facts, state, ship position); the rolling summary carries a ledger-wins
caveat; raw oracle results gained a memory home (`recentOracles` ring →
prompt section [3b] + the assembler's RECENT ORACLES section); scene-end
tier migration dedups; the summary persist is canonical-GM gated.
Reaffirmed as deliberate (decisions.md): frame full-replacement without
validation, lexical non-move relevance, WJ Haiku transitions.

### Flow-audit findings (2026-07) — all fixed in the v1.7.30 cycle

The combat/vow/connection/exploration flow audits surfaced eleven verified
defects; every one was fixed in the same cycle (combat pair in PR #257, the
remaining eleven in the follow-up fix commit). Kept here as a resolved ledger —
full context and post-fix behaviour live in the matching `docs/flows/*-flow.md`.

| Code | Was | Fix |
|---|---|---|
| VOW-FULFIL-SIBLINGS | Native-sheet fulfil left shared-vow copies open on other PCs | `completed` joined `SHARED_VOW_SYNC_FIELDS`; pipeline fulfil already closes all copies |
| VOW-RENAME-PAYOFF | Renamed vows rolled hits but completed/paid nothing (exact-name matching) | `resolveVowItemCopies`: name ladder (exact → substring → sole-open), copies collected by `vowId`; used by completion + both payoff paths |
| VOW-FORSAKE-COSMETIC | Forsake presented costs but never cleared the vow | New `forsakeVow` consequence + pipeline branch: all copies completed + `forsaken` flag, journal twin closed, promised reward → lost, forsake card |
| BOND-WEAK-FORGE | Weak-hit Forge a Bond changed nothing mechanically | Resolver weak hit now sets `forgeABond`; the bond forms (with their request in the fiction) |
| BOND-NATIVE-FORGE | Sheet-rolled Forge a Bond never updated the record | Native consequence hook gains a forge branch (`shouldForgeBond` → `payForgedBondNative`: bonded + rank legacy + card, idempotent) |
| LEGACY-XP-DEAD | Legacy ticks never converted to XP anywhere | `addLegacyTicks` awards 2 XP per newly filled box (1 once cleared) to every PC + an earned-XP card; `!bond` rerouted through it |
| BOND-ITEM-MIRROR | The sheet's Connections-tab track never advanced | `markRelationshipProgress` mirrors `relationshipTicks` onto each PC's bond Item (`setBondItemTicks`, keyed by connectionId → name) |
| WAYPOINT-PROGRESS-NOOP | Waypoint "mark progress" pick silently skipped with no open expedition | Executor resolve-or-creates a default expedition (0 open); ambiguous (>1) now warns |
| EXPEDITION-FINISH-TARGET | The card's Finish button lost the destination | The progress card carries `trackLabel`; the button forwards it as `forcedMoveTarget` |
| SHIP-TRANSIT-LINE | Narrator said "in transit to X" after arriving | `set_a_course` (written only on non-miss = arrival) now reads as docked/in-orbit |
| LOCATION-DUAL-STORE | Travel-by-move never updated `currentLocationId` | The arrival block resolves the destination with the `!at` resolver and updates `currentLocationId/Type` |

---

### VENDOR-BONDSET — non-GM "lacks permission to create Item" on character-actor creation

**Status:** Known / upstream (foundry-ironsworn). Harmless log noise; not fixed
in-module (the `vendor/foundry-ironsworn` submodule is not patched without
explicit instruction — see CLAUDE.md "Never do").

**Symptom:** In a multiplayer session, whenever a `character` actor is created
(a connection/NPC card, or a player character), the Foundry **server** log
shows, for each connected non-GM player:
`User <name> lacks permission to create Item [...] in parent Actor [...]`, each
paired with a Foundry-internal `Cannot read properties of undefined (reading
'length')`.

**Root cause:** The foundry-ironsworn **system** registers a `createActor` hook
(`vendor/foundry-ironsworn/src/module/actor/actor.ts:73`) that adds a `bondset`
Item to every new `character`/`shared` actor with **no GM gate**. The hook fires
on every connected client: the GM's write succeeds (the actor gets its
bondset), and each non-GM client's redundant attempt is rejected by the server.

**Impact:** Cosmetic. The bondset *is* created (by the GM), so functionality is
correct — these are redundant-attempt errors that only spam the server log.
Distinct from the Companion's own multiplayer write paths, which are GM-gated
(see the v1.7.27 write-gate hardening) and, since 2026-10, relayed to the
canonical GM when a player triggers them (`src/multiplayer/gmRelay.js`).

**Workaround:** None needed for correctness. A real fix belongs in the system's
hook (GM-gate it); options if the noise matters are (a) a vendor patch to
GM-gate that hook, or (b) report upstream.

---

### PLAYTEST-1717 — v1.7.17 playtest findings

**Status:** In progress (2026-06-21). **A fixed** (`<npc>` strip). **B
hardened** — detection failures now surface to the GM + retry; the underlying
live API-throw cause still needs one console line to name (the model/prompt are
confirmed working — see the Haiku replay below). **C fixed** — the inciting
narrator now receives the sector NPC's full recorded identity and is bound to
stay consistent with it (consistency approach).

---

#### Finding A — `<npc>` tags leak into the inciting incident card ✓ FIXED

**Status:** Fixed (next release). `renderIncitingIncidentCard` now runs
`escapeHtml(stripMarkup(p))`; unit test added asserting the rendered card
carries no raw or escaped `<npc>` markup and preserves the inner dialogue.

**Symptom:** Literal `<npc>…</npc>` markup appears in the inciting incident
chat card text when the audio-narration setting is on. The tags are visible to
the player.

**Root cause:** `renderIncitingIncidentCard` in
`src/session/incitingIncident.js` (line 190) runs `escapeHtml(p)` on each
prose paragraph but never calls `stripMarkup()` first. The narrator prompt
inserts `<npc>` tags around NPC dialogue for the TTS voice-splitting pipeline
(`src/audio/segments.js`). The narrator card's `ready` hook in
`src/audio/index.js` strips these tags from `.sf-narration-prose` elements,
but the inciting incident card renders plain `<p>` tags without that class, so
the hook never fires.

The correct pattern is used in both vignette renderers:
- `src/session/galleyVignette.js:170` — `escapeHtml(stripMarkup(text))`
- `src/session/endSessionVignette.js:177` — same

**Files to fix:**
- `src/session/incitingIncident.js:190` — add `stripMarkup` before `escapeHtml`
  (also import `stripMarkup` from `../audio/segments.js` at the top of the file)
- `tests/unit/incitingIncident.test.js` — add a test for `<npc>`-free output

---

#### Finding B — The inciting incident captures nothing durable (no faction, lore, threat, or entity)

**Symptom:** *Nothing* the inciting-incident fiction invents is captured. The
faction(s) named in the opening prose (e.g. "Shroud Company", "The Ascendancy")
are the most visible loss, but it is broader than factions.

Confirmed by screenshots (2026-06-21):
- "World Journal — Factions" journal is **empty**.
- "World Journal — Session Log" journal is **empty** (no pages / no beats).
- World Journal panel: "PENDING LORE: No entries awaiting review".
- The **only** Active Threat is "Energy storms are rampant" — and that is a
  **Sector Trouble** rolled at sector-generation time (`src/sectors/sectorGenerator.js`
  Step 10, `recordThreat`), **not** from the inciting incident. So it is *not*
  evidence the inciting detection worked; it predates the inciting incident.

Net: the inciting-incident detection pass produced **zero** durable
captures — no lore, no threat, no faction, no entity record, no pending review,
**and no session-log beat**.

**Root cause (narrowed to two console-distinguishable causes).** The inciting
path runs `runIncitingIncident` → `runPacedDetection`
(`src/narration/narrator.js:1527`) → `runCombinedDetectionPass`. There are
**three** nested try/catch layers, all swallowing to console, so a total
failure is invisible in-game:
- `incitingIncident.js:321-328` → `console.warn("runIncitingIncident: entity detection failed")`
- `narrator.js:1541` → `console.error("runPacedDetection failed")`
- `entityExtractor.js:142-143` → `console.warn("entityExtractor: detection API failed")`, then returns `emptyDetection()`

The empty Session Log is the decisive new evidence. Below-`significant`
lore/threats reroute to the session log (`appendSessionLogBeat`,
`worldJournal.js:634`), so if detection had returned *anything* in the
lore/threat channels it would show there. Empty session log **+** empty
Factions WJ (which has **no** salience gate — `factionUpdates` writes
unconditionally) means the pass produced zero output across *every* channel,
not output that was filtered. This **eliminates** two earlier candidates:

- ~~Salience reroute~~ — ruled out: nothing reached the session log.
- ~~Empty `prose`~~ — ruled out: the inciting card *rendered visible prose*
  (that is how Finding A's `<npc>` tags were visible), and the card and the
  detector consume the same `splitIncitingMeta(text).prose`.

Two causes remain, distinguishable only by the browser console:

1. **API call threw** (`runCombinedDetectionPass` → `defaultCallDetectionAPI`)
   — console line `entityExtractor: detection API failed:`. **Most likely**: a
   single failure zeroes every channel at once, which matches exactly what is
   observed.
2. **Model returned / parsed to empty** — *no* error line, clean run, all-empty
   arrays. Possible but requires the model to independently return empty for all
   five channels.

Note the inciting detection runs **unconditionally** — `runIncitingIncident`
calls `runPacedDetection` directly with no "Auto-Detect Entries" setting gate,
so a disabled setting is not a factor.

For factions specifically, even when detection works there are two fragile
routes — `worldJournal.factionUpdates[]` → `recordFactionIntelligence` (durable
WJ write, `worldJournal.js:265`) and `entities[]` type `faction` → a transient
chat draft card (`routeEntityDrafts`/`postDraftEntityCard`,
`entityExtractor.js:427`) that is lost if the GM never confirms it.

**Haiku replay (2026-06-21) — rules out cause 2.** The exact
`buildCombinedDetectionPrompt` text (fresh-quickstart context) was replayed
against a Haiku model with representative entity-rich inciting prose (a
connection + two factions + two locations, `<npc>` tags intact). Haiku returned
a full, well-formed result: 5 entities, **2 `factionUpdates`** (the two
factions, `isNew: true`), 2 significant lore items, 1 threat, 1 location
update, 1 state transition. The `<npc>` tags did **not** confuse it. So the
prompt + model are capable; the empty live result is **not** the model
returning nothing. That leaves **cause 1 (the API call is throwing in the live
environment)** as the overwhelming likelihood. (Caveat: representative prose
via an agent wrapper, not a raw API call — but Haiku 4.5 underlies both.)

**Diagnostic next step:** one more repro with the browser console open —
search for `detection API failed`. Present → confirms cause 1 (API throw) and
tells us *why* (auth / rate-limit / model-id / proxy). Absent but still no
captures → re-open cause 2.

**Hardening shipped (next release).** `runCombinedDetectionPass` now (a) retries
the detection API call once with backoff (recovers transient failures) and
(b) on persistent failure raises to `console.error` **and surfaces a GM-only
`ui.notifications.warn`** so the silent loss of the opening fiction's entities
is no longer invisible. Unit tests cover the surface, the retry, retry-recovery,
and GM-gating; a Quench test (`runPacedDetection — World Journal wiring`)
locks the detected-faction → Factions WJ end-to-end write. This does **not**
fix the underlying live API throw — that still needs the console line above —
but it converts a silent failure into an actionable one and self-heals blips.

**Files to check:**
- `src/session/incitingIncident.js` — `runIncitingIncident` detection call
  (lines 321-328), `splitIncitingMeta` (does prose survive meta-splitting?)
- `src/narration/narrator.js` — `runPacedDetection` (line 1527) and its
  error swallow (line 1541)
- `src/entities/entityExtractor.js` — `runCombinedDetectionPass`,
  `routeWorldJournalResults` (salience reroute 616-637; factionUpdates 639),
  `routeEntityDrafts` (faction-as-draft path)
- `src/world/worldJournal.js` — `recordFactionIntelligence` (line 265)
- `src/sectors/sectorGenerator.js` — Step 10 `recordThreat` (source of the one
  threat that *is* present; rules out a dead `recordThreat`)

---

#### Finding C — Inciting fiction contradicts the canonical sector NPC ✓ FIXED

**Symptom:** The sector NPC (e.g. Doran Sterling) carries oracle-rolled
Role/Goal (e.g. "Prophet / Spread faith"), but the inciting incident invents a
contradicting characterisation for that same NPC (researcher, met in a hab,
saved your life). The invented detail is never written back to the connection
record, so the record keeps the contradicting oracle values and the richer
fiction is lost.

**Correction to the first-pass entry.** The connection is **not** a vow target
created via `swearVow` / `seedConnectionActor` — that earlier root cause was
wrong. It is the **sector NPC generated during quickstart** (user-confirmed,
2026-06-21). `generateConnection` (`sectorGenerator.js:195-200`) rolls
name / role / goal / disposition / first-look from the Character oracle tables;
`sectorGenerator.js:288` then creates it via
`createConnection({ name, role, goal, … })` and **canonical-locks** it
(`canonicalLocked: true`, lines 300-315). Role/goal are therefore already set,
so `seedConnectionActor`'s oracle fallback never runs for this NPC.

**Root cause — two gaps plus the deeper design tension:**

1. *The prompt actively instructs the invention.* The `inciting_incident`
   system prompt (`narratorPrompt.js:827-854`) binds only the **name**
   (`"use their established name"`, 851-852) and then explicitly asks the model
   to author the rest — the `Vow target` line is
   `"<Name> — <2-3 sentences … who they are, their history with the character,
   and their current situation>"` (844-845). It is never told to honor the
   connection's established role/goal. So even though the narrator's context
   surfaces the role (`formatConnection`, `assembler.js:1041`, renders
   `Role: <role>`), the prompt gives it no binding force and the model invents
   "researcher" to suit the opening. (Secondary gap: `formatConnection` renders
   `c.motivation` (1046), **not** `c.goal`, so a sector NPC's oracle *goal* —
   "Spread faith" — is never even surfaced to the narrator.)
2. *No write-back.* Nothing reconciles the inciting fiction with the connection
   record. Whatever the narrator invents about a referenced NPC stays in the
   prose; the canonical record is untouched and keeps the oracle role/goal.
3. *Design tension (the deeper cause).* The sector generator
   **canonical-locks** an oracle-rolled NPC *before* the inciting incident gives
   them narrative purpose — so a random Role/Goal draw is treated as
   authoritative over the more meaningful opening fiction, exactly backwards.
   The lock exists so narrator entity-discovery can't overwrite sector NPCs; it
   also freezes them against the inciting fiction.

**✅ FIXED (next release) — consistency approach.** The narrator now receives
the NPC's full recorded identity and is bound to honor it:

1. The active-sector roster (`formatActiveSector`, `narrator.js`) — the cast
   source for the inciting incident (which uses a spark-only user message, so
   the assembler's `formatConnection` packet never reaches it) — previously
   rendered only `Name — Role`. It now renders the **full profile** via the new
   `formatSectorNpcProfile`: role, goal, motivation, pronouns, disposition,
   first look, rank, description (present fields only). The roster header is now
   a consistency directive: "when you feature one, keep them consistent with
   their recorded profile … do not reassign their role or goal, change their
   pronouns or disposition, or invent a history that contradicts it."
2. The `inciting_incident` prompt's `Vow target` line (`narratorPrompt.js`) now
   instructs that for an already-established NPC the description must be
   "consistent with their recorded role, goal, and pronouns, never reassigning
   or contradicting them."

This is the consistency route, not the write-back route — the established
oracle identity is now authoritative and *surfaced in full* to the narrator,
so the opening fiction builds on Doran-the-Prophet instead of recasting him.
Tests: `sectorContext.test.js` (full profile + directive present),
`narratorPrompt.test.js` (the inciting binding caveat). **Not changed:** the
sector generator still canonical-locks the oracle draw; we did not move to
fiction-authoritative write-back (a larger change), since surfacing + binding
resolves the contradiction the playtest hit.

**Files changed:**
- `src/narration/narrator.js` — `formatSectorNpcProfile` (new) +
  `formatActiveSector` roster enrichment & consistency directive
- `src/narration/narratorPrompt.js` — `inciting_incident` `Vow target` caveat

---

### PLAYTEST-1712 — v1.7.12 playtest findings

**Status:** Largely resolved — playthrough complete (2026-06-14). 19 findings
(A–T; **Q withdrawn** — confirmed correct behaviour). **All fixed in v1.7.13**
except **E** (config/discoverability — setting hint clarified; not a code bug)
and **H** (diagnostics added; root cause needs the Tier-3 audio smoke to confirm
live). **K** was resolved by the M/N move-lock fix. Finding **A**'s camera fix
was **confirmed fine in a live session (2026-06-18) — closed.** See the
cluster notes and individual entries. Two-player session (GM + one non-GM
player); PCs Kylar Nazari and Mave Takara in the Igneous Maze sector.

**Version timeline (important — the session spanned a rollback):**

- Findings **A–O** were observed on **v1.7.12**.
- Mid-session the move pipeline **locked up** (findings **M / N**): a
  move-in-progress lock set by the first Roll-button click never cleared, and a
  blue "a move is being resolved" toast then suppressed all further narration.
- To recover, the GM **logged out, rolled the module back v1.7.12 → v1.7.11, and
  logged back in — which fixed it** (finding **P**). On v1.7.11 the Roll button
  then triggered a roll **correctly both times it was offered**. This pins
  M/N as a **v1.7.12 regression**: v1.7.11 does not exhibit the stuck lock.
  (The recovery combined a relog and a rollback, so we can't isolate which
  cleared the lock — no conclusion that the lock is stored durably.)
- Findings **P** and **R** were observed on **v1.7.11** (post-rollback),
  continuing the same campaign/world. (**Q**, also v1.7.11, was withdrawn —
  it turned out to be correct behaviour.)
- Findings **S** (recap fact-drift) and **T** (inciting-incident design) span the
  boundary: the inciting incident was generated on **v1.7.12**, but the
  end-of-session recap that crystallised the drifted "three weeks ago" fact was
  produced on **v1.7.11**.

**Root-cause clusters (several findings share one underlying bug):**

- **Move-lock lifecycle (v1.7.12 regression)** — M, N: a move-in-progress lock
  set on the first Roll click never released, then suppressed all narration.
  Highest-priority fix; it bricked the v1.7.12 session. Finding **P** is the
  diagnostic that narrows it: rolling back to **v1.7.11 fixed it** (the button
  works correctly there), so the fix target is the `v1.7.11..v1.7.12` diff in
  the move pipeline / Roll-button path.
  **✅ FIXED in v1.7.13.** Root cause confirmed via the diff: v1.7.12 added
  `applyMoveConsequenceRiders` (consequence-riders feature) *inside* the
  `pendingMove` lock's critical section. It can open an interactive GM dialog
  (`src/moves/riderDialog.js`, `promptRiders`) for optional / "choose one" /
  progress riders; while that dialog was open the world-scoped
  `campaignState.pendingMove` stayed `true`, so every later player input hit the
  "a move is already being resolved" guard (N) and Roll buttons looked dead (M).
  The relog+rollback recovered it only because the `ready`-hook stale-lock reset
  (`src/index.js`, "Reset stale pendingMove lock on ready") cleared it — and
  v1.7.11 never re-wedged because it has no post-roll dialog. **Fix:** release
  the lock on the success path *before* the rider prompt (the lock guards
  narration + campaignState persistence, which are already done by then); the
  `finally` re-releases idempotently via the new `releasePendingMoveLock()`
  helper. Tests: `tests/unit/pipeline.test.js`. **K** should now be re-tested —
  it was almost certainly this lockup, not a permission gate.
- **Roll-button wiring** — J (wrong move on button), M (one-shot on v1.7.12).
  **J fixed in v1.7.13** — the button move and the move named in the narrator's
  closing italic hint were computed independently (the pacing classifier nominates
  before the narrator runs; the narrator may invite a different move). The button
  now reconciles to the move the prose actually names (`reconcileSuggestedMove` in
  `narrator.js`), so label, rolled move, and prose agree. **K resolved by the M/N
  fix** — K was verified to have no GM gate; the "can't roll" symptom was the
  stuck move-lock (M/N), now released. M one-shot fixed in v1.7.13 (see M).
- **Pronoun propagation (PLAYTEST-1711 E/F regression/gap)** — I (art),
  R (vignette text). **Both fixed in v1.7.13.** I: `buildEntityContext`
  (`src/art/promptBuilder.js`) reinforces the pronoun-derived gender descriptor
  at the end of the portrait prompt, so strongly-gendered "first look" text can
  no longer dilute the single leading mention. R: the `session_vignette` mode
  injects no entity cards, so pronouns now ride in the user-message hint —
  `composeConnectionHint` (end-session) and `summariseAbsent` (begin-session
  absent crew) lead with `Pronouns: …`.
- **Narrator memory / fact anchoring** — O (symptom), S (structural cause),
  L (ship position), T (sector context unused). **S/T fixed in v1.7.13.
  L fixed in v1.7.13** — `formatShipPositionLine` now derives a mobility
  status from the position source (`updatedBy`): `scene_token`/`at_command`/
  `expedition` → "docked at {place}"; `set_a_course` → "in transit to
  {destination}"; ambiguous sources keep neutral "near" phrasing. The narrator
  can no longer improvise an underway framing when the ship is stationary, and
  cannot write the ship as docked when a course has been set.
  **O (general case) fixed in v1.7.13** — a new REQUIRED rule in
  `appendSidecarInstruction` instructs the narrator to emit a `newTruth`
  anchoring the identity of any named character who does not appear in the
  ENTITIES IN SCENE cards (name, role, relationship to PC) on first mention.
  Without this anchor, mid-scene characters accumulated contradictory details
  turn by turn; now their key facts are captured into `sceneTruths` the moment
  they are introduced.
- **Multiplayer / non-GM "parity" — RE-CHARACTERISED after reading source.**
  The code already supports players on all three; none is a simple `isGM`
  render gate. **E** (PTT): client-scoped opt-in the player never enabled —
  config/discoverability; **v1.7.13 clarified the setting hint** that it is
  per-player/per-device (each player enables it themselves). **H** (audio):
  player playback is supported (own key + blob URL); silence is downstream
  config or a player-path bug — **v1.7.13 now surfaces the real failure reason**
  to the player on a manual Play click (was a silent no-op / disabled button),
  so the next playtest reports *why* instead of "no sound"; the Tier 3 audio
  smoke remains the live pinpoint. **K** (rolling): no gate — resolved by the
  M/N fix. Lesson: the GM-only test pipeline didn't *gate* these — it just
  never exercised a player's *settings state* (client-scoped toggles/keys) or
  the v1.7.12 pipeline.
- **Vignette entity coverage** — B (second PC missing), R (NPC pronouns).
  **Both fixed in v1.7.13.**
- **PC-aware narrator/detector** — F (PCs proposed as Connections),
  G (Compel suggested against a fellow PC). **Both fixed in v1.7.13.**

---

#### A — Sector map placeables off the background / initial camera shifted off-canvas
*(observed v1.7.12; the v1.7.13 fix attempt made it worse — reported "completely
off the map on v1.7.13")*

**Symptom:** The sector map canvas extends into the black "no-scene" void on
the left; tokens and connections are visible but the initial view is
mis-centred, with a large portion of the scene area falling outside the
padded region. Pan/zoom-out behaviour is unpredictable. **On v1.7.13 the
content appears completely off the map.**

**❌ v1.7.13 attempt was incomplete and regressed.** It mis-diagnosed finding A
as a pure *camera* bug. The captured initial view had set `initial.x =
sceneWidth/2, y = sceneHeight/2`; v1.7.13 dropped them so Foundry would centre
on the scene-rect midpoint. But that left the **real** bug untouched and made the
result worse: see the root cause below.

**✅ FIXED PROPERLY in v1.7.14.** Root cause: every placeable (settlement /
planet / stellar **Notes**, passage **Drawings**, the command-vehicle **Token**)
is placed at raw `gridX * gridCellSize` — coordinates with their origin at the
**padded-canvas** top-left. With `padding: 0.1` Foundry insets the background
("scene rectangle") inside a larger canvas at `(sceneX, sceneY) ≈ (200, 200)`,
so every placeable lands ~200 px up-and-left of the background — out in the black
void. (Confirmed empirically: the misalignment appeared exactly when finding D
turned padding `0 → 0.1`; at `padding: 0` `sceneX = 0` and the offset is nil.)
The old camera `x: sceneWidth/2` happened to *also* ignore the inset, so it
accidentally framed the (cornered) content; v1.7.13's "correct" re-centre on the
scene-rect midpoint **de-aligned** the camera from the still-cornered content,
pushing it fully off-view. **Fix:** read `scene.dimensions` (Foundry's
authoritative `BaseGrid#calculateDimensions` result, via a `sceneRectOffset`
helper) and add `(sceneX, sceneY)` to **every** placeable coordinate, then set
the initial-view centre **explicitly** to `(sceneX + sceneWidth/2, sceneY +
sceneHeight/2)` from the same offset (not relying on Foundry's default centring,
which is unverifiable here). Content and camera now derive from one offset and
cannot drift apart. Tests: `tests/unit/sectorSceneBuilder.test.js` (offset +
centred-camera + dimensions-fallback). Camera geometry can't be
unit-verified, but the load view was **confirmed centred with the pins on the
background in a live session (2026-06-18) — finding A closed.** See
`decisions.md` → "Sector scene padding: never zero" → the 2026-06-15
placeable-offset refinement.

**Files:** `src/sectors/sceneBuilder.js` (`sceneRectOffset`, note/drawing/token
placement, `initial` centre).

---

#### B — Begin a Session spotlight vignette omits second player character

**Symptom:** With two player characters (Kylar and Mave), the Begin a Session
spotlight vignette only features one character (Kylar). Mave is absent from
the generated opening scene entirely.

**✅ FIXED in v1.7.13.** Root cause: `collectGalleyParticipants`
(`src/session/galleyVignette.js`) enumerated PCs from `game.users[].character`
— the per-user character assignment — not the actor roster. A PC actor that no
*connected* user had selected as their `User.character` was never added to
either the active or absent list, so it vanished from the prompt entirely. **Fix:**
enumerate the canonical PC roster (`getPlayerActors()`, which excludes NPC cards)
and use the user list only to decide present (assigned user is active) vs absent
(assigned user offline, or no assigned user). Every PC now appears — present ones
in the galley, the rest named in the banter. Falls back to the old enumeration if
the roster is somehow empty. Tests: `tests/unit/galleyParticipants.test.js`.

---

#### C — Vow card connection prompt doesn't create a draft entity for the GM

**Symptom:** When a non-GM player swears a vow that involves a named NPC
(here: "Administrator Lyssa Chen"), the vow result card correctly displays
*"Ask your GM to add Administrator Lyssa Chen as a connection (GM-only write)"*
— but no draft entity for that connection appears in the Entities panel. The GM
has no actionable prompt; the connection must be created entirely manually.

**Expected behaviour:** The vow resolution should emit a pending-connection
draft card (same mechanism as entity detection from narration), or at minimum
add a draft row to the Entities panel so the GM can confirm → create the
connection in one click.

**✅ FIXED in v1.7.13.** The non-GM branch of `buildSwearVowPlan`
(`src/session/swearVow.js`) previously set only an advisory string and returned.
It now sets `queueTargetDraft`, and `executeSwearVow` routes the named target
through `routeEntityDrafts([{ name, type: 'connection', description }], …)` —
the exact pipeline narration-detected entities use — so a GM-actionable draft
card appears with a one-click Confirm. The confirmation notice changed from
"Ask your GM to add …" to "… has been queued as a connection for your GM to
confirm." The world-write itself stays GM-only (PERSIST-001 family); only the
*draft* is emitted by the player. Tests: `tests/unit/swearVow.test.js`.

---

#### D — Auto-seeded connection gets a contradictory oracle-rolled role when the name already encodes one

**Symptom:** "Administrator Lyssa Chen" was created as a connection whose name
already carries a narrative role ("Administrator" — established by the vow
context). The oracle seeder independently rolled ROLE = "Shipwright", which
contradicts the established narrative. The Entities panel shows both: name
says Administrator, ROLE field says Shipwright.

**Expected behaviour:** When a connection name contains a recognised title or
role token (e.g. "Administrator", "Captain", "Doctor", "Councilor"), the
oracle ROLE roll should either be suppressed and the title used instead, or
the seeder should detect the conflict and leave ROLE blank/set it to the
title derived from the name.

**✅ FIXED in v1.7.13.** `seedConnectionActor` (`src/entities/connection.js`)
rolled the Character Role oracle whenever the record carried no explicit role.
It now consults `roleTitleFromName(actor.name)` first: a recognised leading
title (Administrator, Captain, Doctor/Dr, Councilor/Councillor, Governor, …) is
used as the Role verbatim, so "Administrator Lyssa Chen" gets Role =
"Administrator" rather than a contradictory oracle roll. Precedence: explicit
role → title-from-name → oracle roll. Whole-word matched (no "Drake" → Captain
false-positives). Tests: `tests/unit/connectionSeed.test.js`.

---

#### E — Push-to-talk button absent for non-GM players

**Symptom:** The push-to-talk microphone button renders in the chat input area
for the GM but is invisible to the second (non-GM) player. Both players are in
the same world; the GM's chat input shows the mic icon between the message
field and the toolbar, while the player's chat input shows only "Enter message"
with no mic button.

**VERIFIED cause (not a GM gate):** Read the source — there is **no
`game.user.isGM` gate**. `injectPushToTalkButton` (`src/index.js:2690`) runs
from the `renderChatLog`/`renderChatPanel`/`renderChatTab` hooks
(`src/index.js:2972-2977`), gated only on
`game.settings.get(MODULE_ID, "speechInputEnabled")`. That setting is
**`scope: "client"`, default off** (`src/index.js:308-313`). So PTT is a
per-client opt-in: the GM had enabled it in *their* client settings; the
non-GM player never enabled it in *theirs*, so the button never injected for
them. (Secondary possibility: the `PTT_HOST_SELECTORS` didn't match a
container in the player's chat DOM — that path logs a `console.warn`.)

**This is config/discoverability, not a gating bug.** Options: (a) surface the
client-scoped Push-to-Talk toggle more prominently for players, (b) document
that each player enables it on their own client, or (c) reconsider whether it
should be world-scoped with a per-client capability/feature-detect.

**Partial fix (v1.7.13 — option b):** the setting **hint** now states plainly
that Push-to-Talk is per-player/per-device — "each player turns it on in their
own client; the GM enabling it does not enable it for anyone else." The
injection code was already robust (multi-selector fallback + a `console.warn`
when no container matches), so no code-path change was needed; the gap was that
nothing told a player they had to opt in themselves. Options (a)/(c) remain
available if discoverability is still a problem in a future playtest.

**Files:** `src/index.js:308-318` (setting scope + hint), `:2690-2729`
(`injectPushToTalkButton`), `:2971-2978` (hooks).

---

#### F — Entity detector proposes player characters as new Connections

**Symptom:** After the Begin a Session opening narration (which featured both
PCs by name), the "New Entities Detected" card proposed creating Mave and
Kylar as Connection entities. Both are existing player characters, not NPCs.

**Expected behaviour:** PC names should be excluded from entity detection —
they are already tracked as player-owned Actors and must not be re-proposed
as Connections.

**✅ FIXED in v1.7.13.** The routing gate `entityExistsAnyType` *did* check PC
names (`isPlayerCharacterName`, added for F14, present in v1.7.12) — but it
**exact-matches** the normalized name, so a detection of "Kylar" never matched
the actor "Kylar Nazari" and slipped through into a draft. **Fix:**
`collectEstablishedEntityNames` (`src/entities/entityExtractor.js`) now adds the
PC roster (`getPlayerActors()`) to the ESTABLISHED ENTITIES list in the
detection prompt, so the model is told not to propose them at all — and an LLM
resolves the first-name variant ("Kylar" → "Kylar Nazari") that the exact gate
could not. NPC/connection cards (entityType-flagged `character` actors) are
excluded via `getPlayerActors`. Tests: `tests/unit/entityExtractorPCDedup.test.js`.

---

#### G — Narrator suggested Compel against a fellow player character

**Symptom:** Mave's player typed "Kylar, let him go, this is getting out of
hand" — an in-character appeal to the other PC. The narrator responded with a
narration ending "*If you want Kylar to stand down, that's going to take more
than asking nicely—this could be a Compel.*" and offered a **Roll Compel**
button targeting Kylar.

**Problem:** Compel is a move for influencing NPCs and difficult situations;
it is not appropriate to suggest one player character roll Compel against
another PC. In multiplayer, inter-PC tension is resolved through roleplay, not
move rolls.

**✅ FIXED in v1.7.13.** `narratePacedInput` (`src/narration/narrator.js`) now
runs `suppressPcDirectedSocialMove` on the classifier's nomination before it
reaches the narrator or the card: when the nominated move is a social move that
acts on another character (`compel`, `develop_your_relationship`,
`test_your_relationship`) **and** the player's input names a fellow PC (full
name or first-name token, whole-word, speaker excluded — via `getPlayerActors`),
the suggestion is dropped to `null`. The narrator is then never instructed to
write the move hint, and no Roll button is rendered — inter-PC tension stays
roleplay. Combat moves are intentionally **not** suppressed (PvP via Clash/Strike
is rules-valid). Tests: `tests/unit/narratorMoveHint.test.js`.

---

#### H — Narrator audio produces no sound for non-GM players (Play button present but silent)

**Symptom:** When a narrator card is posted, the GM hears the audio
automatically. The second (non-GM) player gets no audio. **The ▶ Play button
*is* present on the player's card** (so the button itself is not GM-gated), but
clicking it produces no sound — no autoplay, and the manual click is silent.

**VERIFIED — playback is NOT GM-gated (earlier hypothesis withdrawn):** Read
the source. The play path explicitly supports non-GM clients:
- The button un-hides only when `audioEnabledForThisClient()` is true
  (`src/audio/index.js:81-86, 291`), which requires **three** settings:
  `audio.enabled` (world, GM sets), `audio.clientEnabled` (**client**,
  `src/index.js:391-394`), and a non-empty `elevenLabsApiKey` (**client**,
  `src/index.js:386-390`, "Stored locally in your browser").
- Synthesis is **lazy-on-click for every client**, using *that client's own*
  ElevenLabs key (`src/audio/index.js:179`). `commitToCache`
  (`src/audio/index.js:199-233`) has an explicit non-GM branch: it emits the
  bytes to the canonical GM over a socket **and returns a local blob URL** so
  the player can play immediately. Playback is never gated to the GM.

**So because the player's button was *visible*, the player passed all three
gates — including having their own ElevenLabs key.** The silence is therefore
downstream, in the player's own synth→play path. Live-investigation candidates:
1. The player's key is present-but-invalid (passes the length check, fails the
   ElevenLabs fetch) → caught at `togglePlayback`'s `catch`
   (`src/audio/index.js:387-392`) → button flips to **"error"/disabled**.
   (cf. ENTITY-002: a config artifact, not a code defect.)
2. `buildPlayableSegments` returns 0 segments for the player → silent no-op
   (`src/audio/index.js:374-376`).
3. A real bug in the non-GM blob-URL playback (`PlaybackSession.play()` on the
   blob from `commitToCache`).

**This needs the audio smoke test (Tier 3) to pinpoint** — it's the exact case
that test should drive: a player client posting a card, clicking Play, and
either producing a `Sound` or surfacing the real error. Note the architectural
contrast with AUDIO-002: the design already returns a client-fetchable URL, so
this is likely (1) config or (2)/(3) a player-path bug, not a path-scope issue.

**Diagnostics improved (v1.7.13).** Source review confirmed the non-GM blob
path is sound (no playback gate; `commitToCache` returns a local blob URL for
non-GM clients), so the remaining cause is config (1) or a player-path bug
(2)/(3) — all of which were previously **silent**. `togglePlayback`
(`src/audio/index.js`) now surfaces the real failure to the player on a
*deliberate* Play click (autoplay stays quiet): the catch path shows
`Narrator audio unavailable: <reason>` (bad key, unconfigured voice id, synth
failure), and the 0-segments case — previously a silent reset to idle — now
warns and tells the player there was nothing to read. This converts the next
playtest report from "no sound" into the actual reason, which is what's needed
to close (1) vs (2)/(3). The Tier 3 smoke test remains the live pinpoint.

**Files:** `src/audio/index.js:81-86` (gate), `:179` (per-client key),
`:199-233` (`commitToCache` non-GM blob branch), `togglePlayback` +
`notifyAudioFailure`, `src/multiplayer/gmGate.js` (`isCanonicalGM`).

---

#### I — NPC portrait gender doesn't match rolled pronouns

**Symptom:** Administrator Lyssa Chen has pronouns "she/her" (rolled and
written to the actor), but the generated portrait is a clearly
masculine-presenting person. The pronoun is not informing the art prompt.

**✅ FIXED in v1.7.13.** Diagnosis corrected the original hypothesis: the
pronoun *was* reaching the prompt — `seedConnectionActor` leads
`portraitSourceDescription` with `pronounsToPortraitDescriptor(pronouns)` ("a
woman/man/person"), and `generatePortrait` passes that as the source
description. But that descriptor appears **once, mid-prompt**, sandwiched
between the style anchor and the rolled "first look" oracle text — and a
strongly-gendered first look (e.g. "a broad-shouldered figure with a heavy
beard") easily out-weighs a single neutral "a woman". **Fix:**
`buildEntityContext` (`src/art/promptBuilder.js`) now **reinforces** the
gender descriptor at the end of the prompt for connections (a high-weight slot
for image models), reusing the same `pronounsToPortraitDescriptor` so the two
mentions cannot drift. Only fires when the card actually has pronouns. Tests:
`tests/unit/promptBuilder.test.js`.

---

#### R — Session vignettes use wrong pronouns for NPCs
*(observed v1.7.11, post-rollback)*

**Symptom:** The closing vignette for Nova Petrov used pronouns that don't
match those stored on the actor card. Same issue class as finding I (portrait
gender mismatch) but in vignette *text* rather than art.

**✅ FIXED in v1.7.13.** Root cause confirmed: the vignettes run in the
`session_vignette` narrator mode, which (correctly) matches no entity cards —
there is no player narration to resolve relevance against — so the narrator
never sees an entity card listing the NPC's `Pronouns:` field that the move/paced
paths rely on. The NPC's only description reached the narrator through the
user-message hint, and `composeConnectionHint`
(`src/session/endSessionVignette.js`) read role/motivation/description but **not
pronouns**. **Fix:** the hint now leads with `Pronouns: …` (leading guarantees it
survives the 220-char truncation). The begin-session galley vignette had the
same gap for *absent* crewmates (the subjects of the banter) — `summariseAbsent`
(`src/session/galleyVignette.js`) now includes their pronouns too; active PCs
already had them. Tests: `tests/unit/vignettePronouns.test.js`.

---

#### S — Inciting incident facts age out of narrator context too quickly; recap adopts drifted version
*(spans rollback: inciting incident on v1.7.12, end-of-session recap on v1.7.11)*

**✅ FIXED in v1.7.13.** Root cause confirmed: there was **no campaign-level
home** for the premise. `runIncitingIncident` posted the opening fiction as a
chat card but never wrote it to `campaignState`; it survived only in the
recent-narration ring (last 3 cards — scrolls out fast) and, if the model
emitted them, scene-scoped `sceneTruths` (cleared/migrated at scene end). So the
premise aged out within a session and the narrator drifted on its load-bearing
facts ("three cycles" → "three weeks"); the recap then aggregated the drifted
beats. **Fix:** `runIncitingIncident` now captures the premise to a durable
`campaignState.incitingIncident` record (prose + vow/clock/target), and
`buildNarratorSystemPrompt` injects a `## CAMPAIGN PREMISE` section as canon on
**every** narrator call — campaign-level, never dropped, never scene-scoped
(unlike the §6.5 ledger). Because the narrator no longer drifts, the recap no
longer crystallises drift (fixed at the source, not after the fact). Tests:
`tests/unit/incitingIncident.test.js`, `tests/unit/narratorPrompt.test.js`.
Partially addresses **O** for the inciting case (the dead character's facts ride
in the premise prose); the general referenced-but-absent-character case is still
open.

**Symptom:** The inciting incident established "murdered Councilor Vex **three
cycles ago**". Within the same session the narrator drifted to "**three weeks
ago**" (finding O), and by end-of-session the campaign recap had fully adopted
the drifted version — the recap says "murdered on Paradox three weeks ago",
overwriting the inciting incident's ground truth.

**Root cause:** The inciting incident's key facts (time, location, method,
parties) are not being written to the narrator sidecar with sufficient
permanence. They should be tier-0 immutable truths — always injected into
every narrator call for the life of the campaign. Instead they appear to be
stored as ordinary recent-narration entries that scroll out of the ring buffer
as the session progresses, leaving the narrator with no anchor and free to
reinvent details. The Narrative Review catches the drift (finding O) but only
after the fact, and the recap then crystallises the wrong version into campaign
history.

**Expected behaviour:** The inciting incident's extracted facts should be
written to the sidecar's permanent/never-dropped tier (see
`rules/narrator-memory.md` invariants) on creation and re-injected on every
narrator call, regardless of session length.

**Files to check:** `src/narration/narrator.js` or `src/context/assembler.js`
(where inciting incident data is assembled for the narrator context);
`rules/narrator-memory.md` (never-dropped tier contract);
`docs/narrator/narrator-memory-architecture.md` (sidecar write path for
inciting incident).

---

#### T — Inciting incident ignores existing sector NPCs and settlement attributes; consistently invents new ones
*(inciting incident generated v1.7.12; reported after rollback)*

**✅ FIXED in v1.7.13.** Root cause: the narrator's ACTIVE SECTOR anchor
(`formatActiveSector`, `src/narration/narrator.js`) passed only settlement
*names* — the rolled Authority/Population/Trouble live on the Settlement Actor
records, and the existing NPC roster was surfaced only as a bare count
(`buildConnectionsSummary`). So the inciting-incident narrator had no idea
Hypatia was lawless or that Nova Petrov already existed, and freely invented an
"Administrator". **Fix:** `formatActiveSector` now reads `listSettlements` /
`listConnections` and surfaces, for the active sector, each settlement with its
**Authority** and **Trouble** (plus a directive not to introduce an official /
administrator / governing figure where Authority is none/lawless) and the
established **NPC roster** with roles (plus a prefer-build-on-these directive,
capped at 12). The `inciting_incident` sidecar addendum gains a matching
"ground it in the established sector; reuse an existing NPC or settlement trouble
before inventing" instruction. Tests: `tests/unit/sectorContext.test.js`. Note
this enriches the anchor for **all** narrator paths (paced/move/scene/inciting),
so authority contradictions are discouraged everywhere, not just at campaign
start.

**Symptom:** The inciting incident created "Administrator Lyssa Chen" as the
authority figure at Hypatia — but Hypatia's own sheet says **Authority: None
/ lawless**. An administrator cannot exist for a lawless settlement. Across
multiple recent sessions the inciting incident has always invented a new NPC
and attached a new clock, never leveraging the sector's existing cast or
world details.

**Expected behaviour:** Before generating an inciting incident NPC, the
generator should:
1. Read the hub settlement's **Authority** field — if lawless, do not create
   a governing/official role for the inciting NPC.
2. Check whether the sector already has registered NPCs (e.g. Nova Petrov in
   Igneous Maze) and prefer one of them as the inciting actor when the
   scenario permits, rather than always cold-creating a new connection. NPCs
   that were sector-seeded likely have more world context already attached.
3. At minimum, constrain the inciting NPC's role to something consistent with
   the hub settlement's populated attributes (Authority, Population, Projects,
   Trouble).

**Files to check:** Wherever the inciting incident is generated — likely
`src/moves/resolver.js` (the `begin_a_session` / inciting incident
consequence) or a dedicated inciting-incident builder; confirm it reads
`campaignState` settlement attributes and the sector's existing NPC list
before creating a new actor.

---

#### J — Roll button move doesn't match the move named in narrator text

**Symptom:** The narrator text reads "*If you want to draw out what he's
running from, this could be a Gather Information.*" — correctly identifying
the move. The button rendered below says **Roll Compel**, not Roll Gather
Information. The move identified in prose and the move wired to the button
are different.

**✅ FIXED in v1.7.13.** The original hypothesis (a move-extraction regex failing
to match) was **wrong** — no such regex existed. The button label was set
**entirely from the pacing classifier's `suggestedMove`**, computed at pipeline
entry *before* the narrator runs. The narrator is then merely *asked* to write a
closing italic hint about that move, but has explicit creative latitude to invite
a different move instead (e.g. the classifier picks Compel; the narrator decides
Gather Information fits the scene better and writes that). Label and prose then
diverge — and because the button re-posts with `forcedMoveId: suggestedMove`, the
*rolled* move was the classifier's, not the one the player read.

**Fix:** after the narration is generated, `reconcileSuggestedMove(text,
classifierMove)` (`src/narration/narrator.js`) reads the move named in the
narrator's final italic span and, when it names a recognised move, uses *that*
for the button (label + `suggestedMove` flag). The prose the player reads is the
source of truth; the classifier's nomination is the fallback when the hint names
no recognised move or the narrator wrote none. Only the last italic span is
scanned, so single-word move names ("Strike", "Compel") in the prose body cannot
false-match. Tests: `tests/unit/narratorMoveHint.test.js`.

---

#### K — Non-GM players cannot use the Roll move button *(observed v1.7.12)*

**✅ RESOLVED by the M/N fix in v1.7.13.** Source review confirmed there is **no
GM gate** on the button or its handler (see "VERIFIED" below); K was observed
only on v1.7.12, which the M/N move-lock regression bricked. The non-GM player's
re-posted move hit the stuck `pendingMove` lock, so the click appeared to do
nothing / surfaced the caught permission debug-log. With the lock now released
before the rider prompt (M/N), the canonical-GM pipeline runs the player's
re-posted move as designed. No independent permission defect remained.

**Symptom:** The Roll [move] button on narrator cards is non-functional for
the second (non-GM) player — they reported a permission error / nothing
happening on click.

**VERIFIED — no GM gate on the button or handler (earlier hypothesis
withdrawn):** Read the source. The handler (`src/index.js:3074-3113`) has **no
`game.user.isGM` gate**. On click it (a) best-effort sets a `rolled` flag via
`message.update` — which *does* fail for a non-owner player and is explicitly
caught and logged to `console.debug` only (`src/index.js:3095-3100`), and (b)
posts a fresh `ChatMessage` carrying `forcedMoveId` (`:3101-3108`). The move
pipeline then runs on the **canonical GM** client (`isCanonicalGM()` at the
pipeline entry) — correct multiplayer design (world writes belong to the GM).

**Revised cause:** K was observed on **v1.7.12**, which finding P proved is a
regression (v1.7.11's Roll button works). So "lacks permission to roll" is most
likely a manifestation of the **move-lock lockup (M/N)** rather than a real
permission gate — the player's re-posted move hit the stuck pipeline. The only
genuine "permission" event in the path is the *caught* `message.update` for the
`rolled` flag, which is non-fatal and not user-visible by design.

**Re-test on v1.7.11** before treating K as independent of the M/N regression.

**Files:** `src/index.js:3074-3113` (handler — no gate), the pipeline entry
`isCanonicalGM()` gate (`src/index.js` ~`:758`, the `bypassPacing` branch).

---

#### M — Roll button works only on the first narrator card; dead on all subsequent cards

**✅ FIXED in v1.7.13** — see the Move-lock cluster note above. The button was
never the problem: after the first move whose outcome opened a consequence-rider
prompt, the held `pendingMove` lock made every subsequent move's re-posted input
short-circuit at the concurrency guard. Releasing the lock before the rider
prompt restores repeated Roll-button use. The original analysis (handler
registered `{ once: true }` / consumed reference) was **not** the cause —
verified against `src/index.js:3074-3113`, which re-binds per render.

**Symptom:** The Roll [move] button in narrator chat cards fires correctly the
first time it is clicked in a session. All subsequent Roll buttons on later
cards do nothing — no roll, no error.

**Likely cause:** The click handler is registered once (e.g. via a
`renderChatMessageHTML` hook with an internal guard that prevents
re-registration, or an `addEventListener` with `{ once: true }`) and is
consumed on the first click. Later cards render new button elements that never
get a handler attached, or the handler lookup finds a stale/already-consumed
reference.

May interact with finding K (non-GM permission block) — if the handler exits
early on the first non-GM attempt, the GM's handler may also be considered
consumed.

**Files to check:** `src/index.js` or `src/narration/narrator.js` (Roll
button `addEventListener` / hook registration — check for `{ once: true }` or
a WeakSet/Set guard that marks the element as handled); `src/system/chatHooks.js`
(`onChatMessageRender` dedup logic — the WeakSet dedup added for V13-002 may
be marking cards handled without attaching the Roll listener).

---

#### N — Narrator card stops appearing for paced inputs mid-session

**✅ FIXED in v1.7.13** — same root cause as M (see the Move-lock cluster note
above). The "move in flight" guard the inputs hit was the held `pendingMove`
lock, kept `true` by the consequence-rider dialog open on the GM's screen. The
diagnosis below ("lock set on the first roll never released") was correct in
shape; the specific never-releasing await was the post-roll rider prompt, fixed
by releasing the lock before it.

**Symptom:** Pacing telemetry continues to log decisions (`NARRATIVE`,
`NARRATIVE_WITH_MOVE_AVAILABLE`) for player inputs, but no narrator chat card
is posted. Instead, a **blue toast appears saying "a move is being resolved"**
each time. The pacing classifier is working; the narrator call is being
intercepted by a move-in-progress guard that never cleared.

**Likely cause:** Strongly suggests the move-in-progress lock (set when the
first Roll button was clicked in finding M) was never released — possibly
because the move roll didn't complete cleanly (finding M: button went dead
after first click). Every subsequent narrator call hits the "move in flight"
guard, posts the toast, and returns early without generating a card. The
pacing telemetry runs before this guard and is unaffected.

**Files to check:** `src/index.js` or `src/moves/pipeline.js` — the
move-in-progress flag / lock variable and where it is cleared; confirm it is
reset on both success AND failure/cancellation of a move roll. This is likely
the root cause behind both M and N: a lock set on the first roll is never
released.

---

#### O — Referenced dead character accumulates contradictory details across turns

**Symptom:** Councilor Vex (murdered before the session, never an active
entity) is described inconsistently within a single scene: the narrator said
"three weeks ago" in one turn; the Narrative Review flagged an earlier
statement of "three cycles ago" for the same event. The Narrative Review is
working correctly — it caught the contradiction — but there is nothing to
prevent the contradiction from occurring in the first place.

**Root cause:** Vex has no entity record in the Entities panel. Without a
persistent fact sheet, each narrator call can freely invent or misremember
details (time of death, location, method, relationship to other characters).
The Narrative Review catches deviations after the fact but cannot enforce
consistency at generation time.

**Desired behaviour:** When the narrator introduces a referenced character
with a name (Councilor Vex, Silas Kade, etc.), their key facts should be
captured in a scene-truths / lore entry the first time they appear and
included in the narrator context for all subsequent turns, so the model has
a ground-truth anchor to write against.

**Files to check:** `src/narration/narratorPrompt.js` (how referenced
third-party names are handled); `docs/narrator/narrator-memory-architecture.md`
(scene truths / entity-card injection) — determine whether referenced-but-absent
characters can be added to the narrator's working lore set mid-scene.

**Partial mitigation (v1.7.13 — earlier):** Two changes reduced the rate. (1) Finding
S records the inciting incident as durable canon, so a character named only in
the opening premise (Vex) now rides in the CAMPAIGN PREMISE block every turn.
(2) The CAST DISCIPLINE rule steers the narrator away from minting parallel
throwaways.

**✅ FIXED (general case) in v1.7.13.** A new REQUIRED emission rule added to
`appendSidecarInstruction` (`src/narration/narratorPrompt.js`) now instructs the
narrator to emit a `newTruth` for any named character or faction on their FIRST
mention in the scene, when they do not appear in the ENTITIES IN SCENE cards.
The truth must anchor their identity — name, role/profession or agenda, and
relationship to the player character. Once captured into `sceneTruths`, the fact
rides in subsequent turns' ACTIVE SCENE block, giving the model a stable
ground-truth anchor to write against for the rest of the scene. The Narrative
Review continues to catch post-generation drift; this prevents it at generation
time.

---

#### P — Rolling back to v1.7.11 cleared the stuck move-lock; Roll button works correctly on v1.7.11
*(this finding IS the rollback boundary: v1.7.12 → v1.7.11)*

**Observation (this is a diagnostic, not a defect on v1.7.11):** After the
v1.7.12 session locked up (findings M/N — the move-in-progress lock stuck, blue
"a move is being resolved" toast suppressing narration), the GM **logged out,
rolled the module back to v1.7.11, and logged back in. That recovered the
module.** On v1.7.11 the Roll button then **triggered a roll correctly both
times it was offered** — the stuck-lock behaviour was gone.

**What this tells us:**
- The move-lock lockup (M/N) is a **v1.7.12 regression**. v1.7.11 does **not**
  exhibit it — the Roll button fires a roll correctly there. The fix target is
  whatever changed in the move pipeline / Roll-button path between v1.7.11 and
  v1.7.12.
- The recovery combined a relog **and** a version rollback, so we cannot isolate
  which cleared the lock. We therefore **cannot conclude** the lock is stored
  durably (world settings / `campaignState` / flag) — the earlier "persists
  across reload" theory is **withdrawn**; there is no evidence for it. An
  in-memory module-state lock cleared by the reload is equally consistent.

**Fix direction:** Diff `v1.7.11..v1.7.12` around the move pipeline and the
Roll-button click handler to find the regression that leaves the lock set
(findings M/N). A `ready`-hook reset of the lock is still worth adding as
cheap defence-in-depth, but it is not established that the lock is persisted.

**✅ RESOLVED in v1.7.13.** The diff confirmed the regression (consequence-rider
dialog inside the lock — see the Move-lock cluster note and M/N). Notes now
verified: the lock **is** persisted (it lives in `campaignState.pendingMove`, a
world setting), and the `ready`-hook stale-lock reset already existed
(`src/index.js`, "Reset stale pendingMove lock on ready") — that reset is
exactly why the relog/rollback recovered the session, and why we couldn't
isolate relog-vs-rollback (either path fires the same `ready` reset).

**Files to check:** the move-in-progress flag / lock in `src/index.js` or
`src/moves/pipeline.js`; the Roll-button handler in `src/index.js` /
`src/narration/narrator.js`. Start from the v1.7.11→v1.7.12 diff.

---

#### Q — WITHDRAWN (not a bug — confirmed correct behaviour on v1.7.11)

**Originally logged as:** "Roll button consumed an asset trait instead of
rolling the move."

**Resolution:** Confirmed with the playtester — this was **working as
intended**. On v1.7.11 the Roll button rolled correctly both times it was
offered (finding P). The "pulled the Courier trait off my card" behaviour was
the move correctly **identifying the player's Courier asset as relevant and
offering the option to use it** — a feature, not a side effect. No move roll was
lost. The letter Q is retained as a withdrawn placeholder so the A–T sequence
and existing cross-references stay stable.

---

#### L — Narrator invented ship-in-motion context when docked at a station

**Symptom:** The party is docked at a station waiting to hand over a fugitive.
The narrator wrote "if you turn this ship around — the Khatri syndicate
doesn't leave witnesses when they collect bounties" — implying the ship is
currently underway and could change course. The ship is stationary; no
turn-around is possible.

**Root cause:** The narrator prompt lacks the ship's current position/status
(docked vs. in transit), so the model defaults to generic "ship in space"
framing and invents movement context. PLAYTEST-1710 F5 established that the
command-vehicle token on the sector scene is authoritative for position, but
that position data may not be flowing into the paced-narration context here.

**✅ FIXED in v1.7.13.** `formatShipPositionLine` (`src/factContinuity/shipPosition.js`)
now derives a mobility signal from the `updatedBy` source field on the position
record: `scene_token` / `at_command` / `expedition` → "docked at {settlement}";
`set_a_course` → "in transit to {destination}"; ambiguous sources (`narrator_sidecar`,
`manual`, `null`) keep neutral "near" / "in orbit of" phrasing (no false certainty).
The SHIP POSITION line in the narrator system prompt now explicitly names the
ship's mobility state, preventing the model from improvising underway framing
when docked or vice versa.

---

### SAFETY-001 — Safety config sync is client-initiated

**Status:** Mitigated in the v1.7.31 cycle (2026-10) — one residual limit,
below. See also SAFETY-PRIVATE-LINES-SHARED (open).

**Was:** `syncSafetyToCampaignState()` (`src/ui/settingsPanel.js`) bridges
`game.settings` (world-scoped global Lines / Veils, client-scoped Private
Lines) into `campaignState.safety`, but returned early on every player client,
so a player's Private Lines never reached `campaignState.safety.privateLines`
(SAFETY-PRIVATE-LINES-PLAYER).

**Now:** It still runs on every client's `ready` hook and after every Lines /
Veils / Private Lines write. A GM's client writes the global Lines / Veils and
its own Private Lines directly. A player's client relays its Private Lines to
the canonical GM (gmRelay `safety.syncPrivateLines` → `applyPrivateLinesSync`,
keyed on the relay requester; an empty list removes the entry). With no GM
connected the relay is deferred (debug-logged), and every player re-sends when
the canonical GM broadcasts that its relay listener is ready
(`gmRelay.ready` → `onGmRelayReady`, registered by `registerPrivateLinesGmPull`)
— a pull, because the old `userConnected` re-send fired before the GM's
listener existed and was always dropped. The GM runs relay handlers one at a
time, so simultaneous re-sends don't race.

**Residual:** a player's Private Lines reach `campaignState` only once their
client and a GM have been online together; after that they persist there.

---

### COVERAGE-001 — Function coverage below the historical 65% threshold

**Status:** Superseded (2026-07-07) by the two-tier coverage gate — decisions.md
→ "Coverage gate: ratchet + core bar, not a flat 95%". Kept here because the
floor is a ratchet, not a target.

**Gate today (`vitest.config.js`):** a **floor** over everything the unit suite
can structurally reach — **70 lines / 68 branches / 60 functions** — and a
**95-class core bar** (95 lines / 95 functions / 80 branches) over the
pure-logic spine (`schemas.js`, `moves/resolver.js`, `moves/mischief.js`,
`narration/narratorPrompt.js`, `character/chronicle.js`, `context/safety.js`,
`truths/tables.js`). `src/index.js`, `src/ui/**`, `src/safety/**`, the other
ApplicationV2 / DialogV2 render layers, `src/input/**` and the help content are
excluded — Quench and the Cypress e2e stack cover them. Measured at the 2026-10
follow-up: 85.1 lines / 73.3 branches / 83.2 functions.

**History:** the original cause — `resolver.js`'s per-move `CONSEQUENCE_MAP`
arrow functions reported as uncovered, so `functions` was dropped to 50% — no
longer applies; `resolver.js` sits under the core bar. The 2026-10 audit added
unit coverage for the previously untested `src/session/campaignStart.js`
(UNTESTED-CAMPAIGNSTART).

**Recalibration protocol:** raise the floor toward measured actuals (keep ~2 pts
of headroom) in a dedicated commit; never lower a threshold to make a feature
land.

---

## Resolved issues

### PERSIST-001 — persistResolution gated to GM only ✓

**Resolved in:** the v1.7.31 cycle (2026-10 repo audit) — by the single-emitter
design plus roller attribution; the remaining player writes now relay.

**Was:** reported as "player-triggered moves do not persist meter changes"
because `persistResolution()` writes world-scoped state and is gated to
`game.user.isGM` at the pipeline site, with "a player→GM persistence relay" as
the outstanding fix.

**Verified against source:** the move pipeline never runs on a player's
client. The `createChatMessage` hook returns early unless `isCanonicalGM()`
(`src/index.js`), so every player's typed move is interpreted, narrated and
persisted on the canonical GM — the `isGM` check at the persist site is always
true there. Attribution follows the roller: the pipeline resolves
`speakerActorId` (`resolveSpeakerActorId`) and passes it to
`persistResolution(resolution, campaignState, speakerActorId)`, which falls
back to the first PC only when no speaker resolves (the never-written
`campaignState.activeCharacterId` fallback is deleted). The other
player-initiated writes PERSIST-001's family covered — session dialogs, the
X-Card, `!bond`, `!truth` / `!state`, `!repair`, Burn / Improve, the milestone /
connection pickers, the won-fight buttons — go through the canonical-GM relay
(`src/multiplayer/gmRelay.js`). The pipeline's persist also merges onto the
latest stored state, so relayed writes that land mid-move survive
(STALE-SNAPSHOT-CLOBBER).

**Still true (by design):** a GM must be connected for world writes; player
paths warn when none is (`requestGmAction` → "no GM is connected"). A few
source comments still cite PERSIST-001 as the reason a write is GM-gated —
that gating is intended; the relay is how players reach it.

---

### SECTOR-SWITCH-001 — `!sector <name>` silently no-ops for non-GM players ✓

**Resolved in:** the v1.7.31 cycle (2026-10 repo audit).

**Was:** the switch branch in `handleSectorCommand` was gated
`if (sub && game.user.isGM)` with no `else`, so a player's `!sector <name>`
did nothing and said nothing — and because every client ran every command,
the GM's client then executed the switch on the player's behalf.

**Fix:** `!sector` is AUTHOR-routed (only the typist's client runs it). A
player's `!sector <name>` warns that switching is GM-only; a bare `!sector`
posts a usage card whispered to the typist. `!sector list` stays open to all.
Tests: `tests/unit/chatCommandRouting.test.js`.

---

### PLAYTEST-1711 — v1.7.11 playtest follow-ups (quickstart sheet, HTML characteristics, ship token, camera, pronouns, voices, post-roll improve) ✓

**Status:** Resolved on `claude/admiring-carson-qlzr7h` (v1.7.12). Seven
findings, full write-up in `docs/testing/v1.7.11-playtest-findings.md`:

- **A** — quickstart PC opened with the classic Ironsworn sheet (same class as
  v1.7.10 NPC finding, new call site). Quickstart pins the Starforged sheet;
  the ready-time backfill now repairs PCs too.
- **B** — NPC Characteristics rendered raw HTML (the Starforged sheet's
  Characteristics is a plain `<textarea>`). Now written as plain text; Notes
  (rich-text) keeps HTML.
- **C** — a ship token dragged from the sidebar was invisible to positioning
  (all logic gated on a flag only the module's auto-placement set).
  `isCommandVehicleToken` now recognises by actor identity; quickstart places
  the ship after creating it.
- **D** — sector map camera trapped by `padding: 0` (no pan/zoom-out). Restored
  `0.1` padding + a captured initial view.
- **E** — NPCs had no established gender, so art/narrator/audio guessed
  independently. Pronouns are now rolled once and propagated to all surfaces.
- **F** — audio used one NPC voice for everyone. Optional pronoun-keyed voices;
  the focal NPC selects the matching voice (depends on E).
- **G** — assets like Fugitive that improve a result post-roll had no way to be
  applied. New post-roll **✦ Improve to Strong Hit** affordance modelled on Burn
  Momentum, advancing the asset's clock as the cost.

---

### PLAYTEST-1710 — v1.7.10 playtest follow-ups (NPC sheet, name drift, stellar variety, ship position) ✓

**Status:** Resolved on `claude/admiring-carson-qlzr7h` (v1.7.11). Five
findings, full write-up in `docs/testing/v1.7.10-playtest-findings.md`:

- **NPC cards opened with the classic Ironsworn sheet** (F1, causing F4's
  invisible portrait/intro — the classic sheet's Notes tab binds
  `system.biography`, not `system.notes`). NPC-card creation now pins
  `core.sheetClass` to the Starforged sheet; ready-time backfill repairs
  existing cards.
- **Actor renames didn't propagate to entity records** (F2) — panel and
  narrator context kept the registration-time name snapshot. Live
  `updateActor` sync + ready-time reconciliation; panel prefers the host
  document name.
- **Every star in a sector was identical** (F3) — the v1.7.1 F7 fix rolled
  STELLAR_OBJECT once per sector. Restored per-settlement rolls.
- **`@scene where am I` invented a location** (F5) — no initial position was
  ever seeded AND the entire §20 write/resolve chain was dormant-broken
  (record-GUID-vs-actor-id updateShip calls, phantom
  `campaignState.settlements` reads, journal-only `!at` resolution, a latent
  sync→drag-handler loop). A command-vehicle token on a sector scene is now
  authoritative for position; inciting incident seeds the start; empty
  records inject a "not yet established" guard line.

---

### PLAYTEST-176 — v1.7.6 playtest follow-ups (NPC-as-character ripple + finalize-first) ✓

**Status:** Resolved in v1.7.7 (unreleased). Four issues found playtesting v1.7.6,
all stemming from FOLDER-002's "NPCs are `character` actors" + auto-seed firing at
creation:

- **NPC got a PC-only momentum grant** (Begin-a-Session "+1 momentum to all
  players"). `getPlayerActors()` filtered `type === 'character'`, which now
  matches NPC cards; in solo play the player-owned fallback returned all
  characters. Added `isPlayerCharacterActor()` (character **and** no module
  `entityType` flag) and excluded NPC cards from `getPlayerActors`, the
  chat-speaker resolver, the PC-find in `index.js`, and `isPlayerCharacterName`.
  The assembler was likewise rendering the NPC as the PC in CHARACTER STATE.
- **Settlements moved to `Sectors / Unsorted` on reload.** `flattenSectorActorFolders`
  relocated a correctly-foldered settlement into Unsorted whenever its sectorId
  didn't resolve. It now leaves an actor that's already settled in a real
  `Sectors / <Name>` folder where it is.
- **Ship auto-populated at creation (modules + flavour + art), no setup window,
  no finalize.** Auto-seed (`autoSeedStarship` / `autoSeedConnection`) now defaults
  **off**; ships are light-registered blank (so they appear in the Entities panel)
  and NPCs are created blank. Population runs on the **✦ Finalise** affordance,
  which delegates to `seedStarshipActor` / `seedConnectionActor`. Connection added
  to the panel's finalize types.
- **NPC portrait not embedded at full size in Notes.** A creation-time ordering
  race between the seed's Notes write and the portrait attach; running the seed
  once on Finalise (not at creation) removes it.

(commits `7426743`, `b04aa6d`, `8cf07ae`)

### FOLDER-001 — Empty duplicate sector subfolders spawned on every world load ✓

**Status:** Resolved in v1.7.6 (unreleased).

**Symptom (historical):** A new **empty** `Sectors / <Name>` Actor folder was
created on every world load, accumulating identically-named duplicates (playtest:
four "Outer Threshold" folders, settlements in only one).

**Cause:** `ensureFolderPath` compared `f.folder` directly to a parent id string,
but Foundry v13's `Folder#folder` getter returns the parent Folder **document** —
so nested-folder lookups never matched and a duplicate was minted each load. The
unit-test folder mock stored `folder` as an id string, which hid the bug.

**Fix:** `folder.js` adds `folderParentId()` to normalise the parent ref (document
| id | null) before comparison; `flattenSectorActorFolders` (on ready) now also
removes empty **duplicate** per-sector folders already accumulated in live worlds,
keeping one populated folder per name. Regression test seeds a v13
document-getter parent. (commit `13dbcd4`)

### FOLDER-002 — PC / Ship / per-sector-NPC folders + NPC card population ✓

**Status:** Resolved in v1.7.6 (unreleased). Design was settled all along
(`issue #228 (Entity → Actor Migration)` §3.4, finding **F8**); the gap was
pre-population. See `decisions.md` → "NPCs and connections: native ironsworn
`character` Actors".

**Delivered:**
- **Activation-time Actor folders** — `PCs/`, `Starships/`, and per-sector
  `Sectors / <Name> / NPCs/`. Loose PCs/ships are filed into them on ready
  (`scaffoldPcShipFolders`); module-managed NPC cards are skipped.
- **Connections are ironsworn `character` Actors** (NPC cards), not journals —
  `registry.js` routes `connection → actor`; `connection.js` create/read/update
  go through the actor host; the sector wizard places its connection in the
  sector NPC folder.
- **NPC card auto-population** (`createActor` hook + `autoSeedConnection`
  setting): rolls the Character oracles (First Look, Initial Disposition, Role,
  Goal) into the **Characteristics** field (`system.biography`), composes a
  narrator intro for the **Notes** tab (`system.notes`), and fires a silent
  portrait that attaches to the card + prototype token and embeds a large copy
  in Notes.
- **Migration** of pre-existing journal-backed connections to NPC cards on ready
  (`migrateJournalConnectionsToActors`).

(commits `4c849b2`, `914bb33`, `5bec6c5`, `717e11f`)

### ENTITY-002 — Settlements arrived blank without API keys (config, not a defect) ✓

**Status:** Resolved — config artifact, not a code defect. Confirmed in the
v1.7.5 playtest (2026-06-03).

**Symptom (historical):** With no API keys configured, newly created settlements
(e.g. "Pinnacle", "Legacy", "Vega") showed the default hooded silhouette and no
flavor/description prose — only the empty oracle-roll buttons.

**Resolution:** With both keys configured, settlements populate correctly:
generated portrait + token art and full descriptive prose (e.g. "Lastport" in
Kronos Vigil shows a portrait thumbnail and a paragraph of narrator prose plus
the stat line; sibling settlements Forsaken/Hyperion/Osseus likewise show
generated art). Description prose is written by Claude (`src/api-proxy.js`) and
portrait art via OpenRouter (`src/art/openRouterImage.js`); both correctly no-op
without their keys, so the entities arrived blank. Generation is properly gated
on key presence — no code fix required.

### TOOLBAR-001 — Companion launcher dead whenever no scene was active ✓

**Status:** Resolved in v1.7.5

**Symptom (historical):** Clicking the Starforged Companion buttons in the
scene-controls toolbar (the meteor group, F16) did nothing — no panel opened,
no console error. Reported across v1.7.0–v1.7.2 playtests.

**Cause:** The launcher was a scene-control group backed by a canvas
`InteractionLayer`. Foundry can only *activate* a control group when
`canvas.ready === true`; with no active scene (mapless / theater-of-the-mind
play, or a Forge launch setting with no default scene) the **entire**
scene-controls bar is inert — clicking any group icon, Foundry's own (Walls,
Lighting) included, fails to switch. Confirmed by live tracing
(`canvas.ready`/`hasScene` both `false`; Walls also froze on `tokens`). Two
earlier attempts misread it as a problem with *our* group — the v1.7.1
`activeTool` band-aid and a v1.7.4 `primary`→`interface` canvas-group change
(both released without fixing mapless play) — but no group-config fix can help
when the surface itself needs a canvas.

**Fix:** Moved the launcher off scene-controls onto a floating, draggable,
frameless `ApplicationV2` pinned to the viewport (`src/ui/companionToolbar.js`),
opened at `ready`, working with or without a scene. Removed the scene-controls
group, its two hooks, `buildCompanionTools`, and the fake `StarforgedCompanionLayer`.
See `decisions.md` → "Companion launcher: floating toolbar, NOT scene-controls".

**Note:** `foundry-ironsworn`'s own `ironsworn` control group has the same defect
in v13 (it never activates without a scene) — an upstream issue, independent of
this module.

---

### NARRATOR-001 — Loremaster removed; direct narrator now implemented ✓

**Status:** Resolved

**Symptom (historical):** No narration after move resolution — the pipeline
posted a result card but no narrative continuation followed, because the
Loremaster dependency had been removed before its replacement existed.

**Fix:** Direct Claude narration implemented in `src/narration/narrator.js` +
`src/narration/narratorPrompt.js`, wired into the move and paced pipelines. See
`decisions.md` → "Narration: direct Claude API (not Loremaster)". The Narrator
scope is ✅ COMPLETE in `scope-index.md`.

---

### DIALOG-001 — `Dialog.confirm()` deprecated in v13 ✓

**Status:** Resolved

**Fix:** Replaced `Dialog.confirm(...)` with `DialogV2.confirm(...)` (option shape
`{ window: { title }, content }`). No `Dialog.confirm` remains in `src/`; call
sites use `DialogV2.confirm` in `entityPanel.js`, `progressTracks.js`, and
`customOracles.js`.

---

### V13-002 — `renderChatMessage` hook deprecated; all chat-button handlers silently dead in v13 ✓

**Status:** Resolved

**Symptom:** In Foundry v13, every button wired by a chat-render hook did
nothing on click — recap card Refresh, audio narration ▶ Play, NWMA Roll
<move>, draft entity Confirm/Dismiss, burn momentum, Correct a fact, and
Set World Truths. No console errors. Cards rendered correctly.

**Cause:** Foundry v13 deprecated the v12-era `renderChatMessage` hook in
favor of `renderChatMessageHTML` (HTMLElement, not jQuery). Late-v13
builds stopped firing the legacy name. All seven handlers in the module
listened on `renderChatMessage` and were silently bypassed.

**Surfaced by:** First-ever Quench run inside a Docker-hosted v13 — the
recapCard Refresh test reported "handler may be unwired"; the Audio
Narration button test timed out waiting for the button to unhide.

**Fix:** Added `src/system/chatHooks.js` exporting
`onChatMessageRender(handler)` which subscribes to both hook names and
dedupes by rendered-element identity (WeakSet) to handle transitional
v13 builds that fire both names. Module.json's `minimum: "12"` keeps the
legacy name necessary.

---

### QUENCH-004 — Test-document leakage across batches polluted fresh worlds ✓

**Status:** Resolved

**Symptom:** A brand-new world that had only ever run Quench accumulated:
settlement Actors named "Glimmer" / "Selena", pending-lore pages named
"Drifter Movement Investigation" / "Hegemony Patrol Pattern" /
"Syndicate Freighter Activity", a "Sulaco Arch" sector folder, art-cache
journal entries, connection records, threat entries, etc. Each batch
made the next one slower (entity panel rescans every JournalEntry on
each create), eventually pushing test bodies past their timeouts.

**Cause:** Quench tests created real Foundry documents but cleanup was
ad-hoc — some batches tracked and deleted, some didn't, several used
plain in-world names indistinguishable from real campaign content (so
even a name-pattern reaper couldn't safely sweep them).

**Fix:** Replaced `installAutoChatCleanup` with
`installAutoDocumentCleanup` in `src/integration/quench.js`. Snapshots
every world collection (actors, items, journal, scenes, macros,
playlists, tables, cards, folders, messages) plus every existing
JournalEntry's page IDs at batch start; reaps anything net-new at batch
end. Children-first, folders-last reap order; GM-only. Per-batch
explicit cleanup remains in place as the precise layer.

---

### AUDIO-001 — Narrator-card play button errored on every click ✓

**Resolved on:** branch `claude/debug-audio-errors-U5CJK`

**Symptom:** Console warning `starforged-companion | playback failed: Error: "error" is not a supported event of the Sound class` from `playback.js:225` (the `_fail` log) on every click of a narrator card's ▶ Play button. The button flipped to "Unavailable" before any audio request was made.

**Root cause:** `_playOneSound` in `src/audio/playback.js` attached three `Sound.addEventListener` listeners — `end`, `stop`, and `error`. Foundry v13's `foundry.audio.Sound#addEventListener` validates `event` against a fixed allow-list (`pause` / `start` / `stop` / `end` / `load`) and throws synchronously for anything else. The `error` registration threw inside `_playOneSound`, the throw bubbled to `_playFromCurrent`, was caught by `_fail`, and the session went straight to ERROR. `sound.play()` was never called.

**Why unit tests missed it:** the `FoundrySoundStub` in `tests/setup.js` accepted any event name without validation, so the no-op `error` listener registration never threw in tests.

**Fixes:**

- `src/audio/playback.js` — `_playOneSound` no longer attaches an `"error"` listener. Failures during load or decode already surface via `Sound.play()`'s promise rejection (wired into the `fail` branch of `.then(_, fail)`) and `Sound.load()`'s throw from `_createSound`.
- `tests/setup.js` — `FoundrySoundStub.addEventListener` now mirrors Foundry v13 and throws on unsupported event names. Two new unit tests in `tests/unit/audio.test.js` pin the contract: `_playOneSound` does not attach an `"error"` listener, and a `play()` rejection routes through the ERROR state without throwing synchronously.

---

### AUDIO-002 — 404 on every just-uploaded narrator MP3 on The Forge ✓

**Resolved on:** branch `claude/debug-audio-errors-U5CJK`

**Symptom:** Pattern visible on the Forge browser console — `File Uploaded to your Assets Library successfully` immediately followed by `Failed to load resource: the server responded with a status of 404 ()` on `https://assets.forge…<hash>.mp3`. Every ▶ Play click ran a fresh ElevenLabs synthesis even when the same prose had been played seconds earlier; nothing actually played back.

**Root cause:** `ForgeVTTFilePickerCore` intercepts `FilePicker.upload()` and stores the file in the user's Forge Assets Library (`https://assets.forge-vtt.com/...`) rather than on disk under `worlds/<id>/audio/...`. The upload response carries the absolute Forge URL in its `.path` field.

`src/audio/cache.js` was discarding the upload response and returning the constructed local path. On Forge, that local path does not exist server-side, so `foundry.audio.Sound(src).load()` 404s. The browse-based cache lookup matched correctly against the Forge listing (Forge returns the same files as absolute URLs in `browse().files`) but then returned the constructed `full` path again, so every cache hit also 404'd. Net effect: zero successful playback on Forge and zero cache reuse.

**Fixes:**

- `src/audio/cache.js` `write()` — captures the upload response and returns `response.path` when present, falling back to the constructed local path on native Foundry installs (where the upload return value is undefined or already matches `full`).
- `src/audio/cache.js` `lookup()` — returns the matched listing path verbatim from `browse().files` instead of returning the constructed local path. On native Foundry this is the local relative path; on Forge it's the absolute `assets.forge-vtt.com` URL — both load correctly via `foundry.audio.Sound`.
- Two new unit tests in `tests/unit/audio.test.js` pin both halves against a Forge-shaped upload/browse response.

---

### RECAP-003 — `!recap` and Chronicle auto-entry silently no-op'd from v1.2.4 → v1.2.10 ✓

**Resolved in:** v1.2.12 (branch `claude/fix-recap-command-cPT8F`)

**Symptom:** `!recap` (and `!recap campaign`) always rendered the empty-state
card — *"No campaign history available yet. Play some sessions first!"* —
even after dozens of narrated turns. The Chronicle journal stayed empty
even with `chronicleAutoEntry: true`. The v1.2.4 fix (cross-PC chronicle
aggregation) and v1.2.7 fix (automatic chronicle writes) both shipped
code that ran in unit tests but never actually fired in a live world.

**Root cause — two compounding defects:**

1. **Missing storage hop.** Both halves of the recap pipeline read
   `campaignState.characterIds` to identify the player character(s):
   - `src/character/chronicleWriter.js:228` — `resolveActorId()` returned
     `characterIds[0] ?? null`. Empty array → `null` → writer short-circuited
     before `addChronicleEntry` was ever called.
   - `src/narration/narrator.js:1173` — `_collectAllChronicleEntries()`
     returned `[]` for empty `characterIds`. Reader had nothing to summarise.

   `campaignState.characterIds` is declared in `src/schemas.js:634` with
   a default of `[]` and **was never written to by anything in the module**.
   The assembler computes a `characterIds` array in its return value
   (`src/context/assembler.js:740`) but only as part of the in-memory
   context packet — it never persists it onto `campaignState`. Existing
   unit tests passed because every fixture explicitly populated
   `characterIds`; no test exercised the real-world condition of an
   empty stored value.

2. **`hasPlayerOwner` is always false in solo-GM play.** Surfaced only
   after the first Forge Quench run of the Recap End-to-End batch failed
   three assertions in v1.2.11 (writer never wrote, reader never reached
   the API, posted card was the empty-state). `getPlayerActors()` in
   `src/character/actorBridge.js:23` filtered on `a.type === 'character'
   && a.hasPlayerOwner`. `Actor#hasPlayerOwner` returns `true` only when
   at least one **non-GM** User has LIMITED+ ownership. In Ironsworn
   solo play — the module's primary use case — the GM is also the
   player; there are no non-GM users; `hasPlayerOwner` is `false` on
   every character. `getPlayerActors()` silently returned `[]` for
   every solo-GM session — so the Defect 1 fallback also returned `[]`,
   and the assembler's CHARACTER STATE section (also gated on
   `getPlayerActors`, `src/context/assembler.js:717`) was empty on every
   paced narration too. Character name and meter values never reached
   the narrator prompt for solo GMs.

**Fixes:**

- `src/character/actorBridge.js` — `getPlayerActors()` falls back to all
  `character`-type Actors when no player-owned ones exist. Safe because
  foundry-ironsworn reserves the `character` type for PCs (NPCs / foes /
  connections / starships use distinct types). Multi-user behaviour
  unchanged: when any character is player-owned, the filter still wins.
- `src/character/chronicleWriter.js` — `resolveActorId()` falls back to
  `getPlayerActors()[0]?.id` when `characterIds` is empty.
- `src/narration/narrator.js` — new `_resolveCharacterIds()` helper falls
  back to `getPlayerActors().map(a => a.id)`. Used by
  `_collectAllChronicleEntries()` (recap reader) and `getActiveCharacter()`
  (paced-narration character context) so all three readers share one source.

**Coverage:**

- 6 new unit tests:
  - `tests/unit/actorBridge.test.js` — `getPlayerActors()` falls back to
    all character-type actors in solo-GM mode; never includes non-character
    types; prefers player-owned characters when any exist.
  - `tests/unit/chronicleWriter.test.js` — writer falls back to
    `getPlayerActors()[0]` when `characterIds` is empty; non-character /
    non-player-owned Actors are excluded.
  - `tests/unit/recap.test.js` — reader falls back through the API call
    with a stubbed fetch; seeded chronicle entries reach the user message.
- New Quench batch `starforged-companion.recapEndToEnd`
  (STARFORGED: Recap End-to-End) — three live tests against a real Actor +
  real Chronicle journal with `characterIds=[]` forced: writer fallback,
  reader fallback through `getCampaignRecap`, and `postCampaignRecap`
  posting a non-empty card. This live coverage exists specifically
  because the v1.2.4 and v1.2.7 fixes both passed unit tests but were
  silently disabled in production — the existing fixtures couldn't
  surface that, and Defect 2 above wasn't visible until the live Forge
  Quench run actually exercised the path.

---

### SECTOR-001 — Narrator invented new settlements for places already in the active sector ✓

**Resolved in:** v1.2.7 (branch `claude/fix-entity-panel-display-0kjF5`)

**Symptom:** During paced narration and scene queries, the narrator would
sometimes set a scene in a settlement name that had nothing to do with the
active sector — even when the active sector's hub was an obviously
established location. The detector would then post a draft entity card
proposing the invented name as a "new" Settlement, pushing the GM toward
forking the world.

**Root cause — two layers:**

1. **Prompt-side blindness.** The paced-narrative narrator
   (`narratePacedInput`, `src/narration/narrator.js:686`) and the scene-
   interrogation narrator (`interrogateScene`, ibid `:596`) did not call
   the assembler at all. The move-pipeline narrator's `## ACTIVE SECTOR`
   block — and the `## CURRENT LOCATION` card — only flowed through
   `narrateResolution`. Both other paths had zero sector or current-
   location context, so the model had no signal to keep the scene
   anchored to an established place.
2. **Detector cross-type gap.** `entityExistsForName(name, type, …)` in
   `src/entities/entityExtractor.js:470` only walks the ID list for the
   *one* type passed in. If the narrator wrote "Oxidized Kettle" and the
   detector classified it as a Location, an existing Settlement of the
   same name did not block the draft — the type-scoped check returned
   false, and the same physical place got proposed as a new entity under
   a different type.

**Fixes:**

- New helper `formatActiveSector(campaignState)` in
  `src/narration/narrator.js` builds a directive anchor block:
  *"Active sector: X / Region: Y / Trouble: Z / Established settlements
  in this sector: A, B, C. When the scene is set in a settlement, reuse
  one of the established names above. Do not invent a new settlement
  name for the same place."* This and `formatCurrentLocation(...)` are
  now threaded into all three narrator call sites
  (`narrateResolution`, `narratePacedInput`, `interrogateScene`) via a
  new `extras.activeSectorBlock` parameter on
  `buildNarratorSystemPrompt`.
- New `entityExistsAnyType(name, campaignState)` export in
  `entityExtractor.js` does a cross-type name match against every entity
  ID list. `routeEntityDrafts` now uses it as the primary dedup gate.
  The type-scoped `entityExistsForName` is preserved for the WJ routing
  rules in `routeWorldJournalResults` (faction / location WJ entries
  remain type-scoped on purpose — a WJ faction note about "Blue Star
  Compact" should not be blocked by an unrelated settlement entity that
  happens to share a name).

**Coverage:** 9 new unit tests across `tests/unit/entityExtractor.test.js`
and `tests/unit/narratorPrompt.test.js`. Pins the cross-type dedup at
the routing gate (Location, Connection, and Settlement variants), the
`## ACTIVE SECTOR` header presence/absence in the system prompt, and
the directive text the model receives.

---

### RECAP-002 — Campaign recap card "↻ Refresh" button did nothing ✓

**Resolved in:** v1.2.7 (branch `claude/fix-entity-panel-display-0kjF5`)

**Symptom:** Every campaign recap card the GM saw rendered a "↻ Refresh"
button — but clicking it did nothing. No console error, no toast, no API call.

**Root cause:** The button was added to the recap card HTML in
`src/narration/narrator.js:547` but no `Hooks.on("renderChatMessage")` was
ever registered to wire it. Same defect class as ENTITY-001 (the chat-card
hint that pointed at a non-existent panel flow); same fix pattern as the
existing `setupCard` "Set World Truths" handler at `src/index.js:1379`.

**Fix:** Added a second `renderChatMessage` hook in `src/index.js` that
matches `recapCard` + `recapType: "campaign"`, finds the `[data-action=
"refreshCampaignRecap"]` button, gates on `game.user.isGM`, disables the
button while in flight, and calls `postCampaignRecap(state, { forceRefresh:
true })` (the same regen path `!recap` uses). Errors surface as a warn
toast.

**Coverage:** New Quench batch `starforged-companion.chatCardActions`
includes a regression test that posts a recap card, clicks the Refresh
button, and asserts a fresh recap card lands in chat.

---

### ENTITY-001 — Entity panel always empty; draft cards had no Confirm UI ✓

**Resolved in:** v1.2.6 (branch `claude/fix-entity-panel-display-0kjF5`)

**Symptom:** Two compounding issues:
1. The Entities panel always showed "No entities tracked yet" even after entities
   had been created (manually, via `make_a_connection`, or via the sector creator).
2. The "New Entities Detected" chat card told the GM to "Open the Entities panel
   to confirm or dismiss" — but the panel had no UI to confirm a draft. Drafts
   could only be implicitly dismissed by deleting the chat card; ship/settlement/
   planet/location/creature drafts had no way to be promoted to entities at all.

**Root cause (panel):** `loadAllEntities()` and `findEntity()` in
`src/ui/entityPanel.js` read the entity flag via
`journal.getFlag(MODULE_ID, config.flag)` — i.e. the JournalEntry's own flags.
But all seven entity types (`connection.js`, `ship.js`, …, `creature.js`) store
their data on the embedded `JournalEntryPage` flag. The entry itself only carries
`{ entityType, entityId }` routing crumbs. Every iteration fell through the
`if (!data) continue;` guard and the panel rendered the empty state.

**Root cause (draft UX):** The card's hint text claimed the panel had a confirm
flow, but no such code existed. Only `make_a_connection` auto-created the first
connection draft; everything else lived on the chat card forever.

**Fixes:**
- `src/ui/entityPanel.js` — read entity data from `journal.pages.contents[0].getFlag(...)` in both `loadAllEntities()` and `findEntity()`. Added `updateJournalEntryPage` and `createJournalEntryPage` hooks so the panel re-renders when page flags change (entry-level hooks don't fire for embedded page edits).
- `src/entities/entityExtractor.js` — draft chat cards now render Confirm and Dismiss buttons per row. Confirm calls the appropriate `createXxx()` from the entity modules; Dismiss appends the name to `campaignState.dismissedEntities`. Card content updates in place to show resolved status.
- `collectPendingDraftNames()` — only "pending" drafts suppress re-detection; resolved drafts are now established (caught by `collectEstablishedEntityNames`) or dismissed (caught by `dismissedEntities`).
- `src/integration/quench.js` — `entityPanelActions` batch hardened to assert the seeded Connection actually renders a row instead of silently calling `this.skip()`. The skip-on-miss guards were what hid this bug for months.

**Why it wasn't caught:** the existing Quench batch (`registerEntityPanelActionsTests`) skipped every assertion when no row appeared. A code comment in `src/integration/quench.js` even acknowledged "the known journal-vs-page flag read quirk in loadAllEntities() (tracked as a latent issue in known-issues.md)" — but it was never actually tracked here. Bug present since `entityPanel.js` was first created (commit `102a9a3`).

---

### CONTROLS-001 — Toolbar buttons appeared but did nothing ✓

**Resolved in:** v0.1.34

**Root cause:** Three compounding issues:
1. `getSceneControlButtons` fires with `controls.tokens.tools` empty — Foundry
   populates tools AFTER the hook, so our additions were overwritten
2. `onChange` is never called for `button: true` tools in v13 — only toggle
   tools have working `onChange`
3. `onClick` is not a valid v13 `SceneControlTool` property

**Fix:** Two-hook pattern. `getSceneControlButtons` registers metadata only.
`renderSceneControls` attaches click handlers via DOM after render.

**Pattern now in:** `docs/foundry-reference/foundry-api-reference.md` (SceneControls section)
and `CLAUDE.md` (two-hook pattern section).

---

### CHAT-001 — `!recap` and `/x` commands rejected by Foundry ✓

**Resolved in:** v0.1.31

**Root cause:** Foundry v13 `MESSAGE_PATTERNS.invalid = /^(\/\S+)/` intercepts
all unrecognised `/word` commands before `createChatMessage` fires. `/recap`,
`/journal`, `/sector` were all blocked. `/x` was also blocked (matched invalid)
but appeared to work in some contexts.

**Fix:** Changed all module commands to `!` prefix. Foundry has no `!` pattern
in `MESSAGE_PATTERNS`. `/x` also changed to `!x` for consistency.

---

### SCENE-001 — `@scene` triggered move pipeline after scene card posted ✓

**Resolved in:** v0.1.31

**Root cause:** The scene card HTML (with `sceneResponse` flag) was passing
through `isPlayerNarration()` because no check excluded it. The card content
was long enough, not from GM, no `@` prefix — so it fell through to the
interpreter which returned `moveId: none`.

**Fix:** Added `sceneResponse`, `xcardCard`, and `recapCard` exclusions to
`isPlayerNarration()`.

---

### PROXY-001 — Compressed API responses returned binary garbage ✓

**Resolved in:** Post-session-3 hardening

**Root cause:** Proxy forwarded `accept-encoding` header. Anthropic returned
gzip/brotli compressed response. Proxy passed bytes through undecompressed.

**Fix:** Proxy strips `accept-encoding` and sets `accept-encoding: identity`
explicitly. In `proxy/claude-proxy.mjs`.

**Note:** the local proxy was later removed entirely (see CORS-001) —
`proxy/claude-proxy.mjs` no longer exists. This entry is retained for history.

---

### QUENCH-001 — Quench loaded but showed no tests ✓

**Resolved in:** v0.1.22

**Root cause:** Integration test file was at `tests/integration/quench.js`
but module.json `esmodules` pointed there. CI zip doesn't include `tests/`
directory. File absent from zip → Foundry metadata validation failure.

**Fix:** Moved to `src/integration/quench.js`. `src/` is included in the zip.

---

### QUENCH-002 — Dynamic imports in quench.js returned 404 ✓

**Resolved in:** v0.1.24

**Root cause:** `await import("./context/safety.js")` resolves from document
root (`http://localhost:30000/context/safety.js`) not from the file's location.

**Fix:** `const MODULE_PATH = "/modules/starforged-companion/src"` and all
dynamic imports use `` `${MODULE_PATH}/context/safety.js` ``.

---

### QUENCH-003 — Quench tests registered but not running ✓

**Resolved in:** v0.1.22

**Root cause:** Guard `if (!game.modules.get("quench")?.active) return` at
module load time — `quench` module not yet marked active when ES module executes.

**Fix:** Removed guard. `Hooks.on("quenchReady", ...)` only fires when Quench
is active — no guard needed.

---

### PACKS-001 — `packs/help.json: Not a directory` on module install ✓

**Resolved in:** v0.1.27

**Root cause:** Foundry v13 requires compendium packs to be LevelDB directories.
JSON files were valid in older versions. `packs/help.json` declared in
module.json caused IO error on install.

**Fix:** Removed `packs` array from module.json. Created `src/help/helpJournal.js`
which programmatically creates the help journal on first GM world load.
`packs/help.json` retained as source content but not declared as a compendium.

---

### CORS-001 — Electron renderer blocks external API calls ✓

**Resolved.** Multi-phase: initial post-session-3 hardening added a local Node
proxy; Phase 1 of the API-key-errors fix introduced direct browser fetch on
The Forge (Anthropic via the `anthropic-dangerous-direct-browser-access`
header, image generation via OpenRouter); Phase 2 removed the local proxy
entirely and unified desktop and Forge on direct browser fetch.

**Final transport:**
- Anthropic — direct browser fetch from `src/api-proxy.js` with
  `anthropic-dangerous-direct-browser-access: true`. Works on desktop and
  Forge identically.
- Image generation — direct browser fetch to OpenRouter
  (`openrouter.ai/api/v1/chat/completions`) via `src/art/openRouterImage.js`.
  Default model `black-forest-labs/flux.2-pro`, configurable via the
  `openRouterImageModel` setting.

No local proxy, no environment branching. See `docs/decisions.md` for the
rationale (including the previously rescinded `ForgeAPI.call("proxy", ...)`
claim) and reference precedent (`loremaster-foundry` uses the same
direct-fetch approach in production).

---

### SHIM-001 — `foundry-shim.js` 404 on module load ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `foundry-shim.js` deleted. `scripts/remove-shim-imports.js` run to
remove import statements from all entity files.

---

### MISCHIEF-001 — Dial naming mismatch between settingsPanel and mischief.js ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `normalizeDial()` added to `mischief.js` maps `"lawful"` → `"serious"`.

---

### V13-001 — Multiple Foundry v12 APIs in use ✓

**Resolved in:** Post-session-3 hardening

**Fixes applied:**
- `message.author` (was `message.user`)
- String literal chat message types (was `CONST.CHAT_MESSAGE_TYPES`)
- DOM API in PTT button (was jQuery)
- `getSceneControlButtons` hook handles both Array (v12) and Object (v13) forms
- `type: "other"` removed from `ChatMessage.create()` (not valid in v13)

---

### CI-001 — module.json not updated before zip build ✓

**Resolved in:** Post-session-3 hardening

**Fix:** CI release job reordered — `module.json` updated (version + URLs)
before zip is built. Both the zip contents and the loose manifest attachment
now have consistent version and manifest URLs.

---

### SHIP-INTEGRITY-API-UNWIRED — pre-built ship damage/repair API awaits #216 Phase D

**Status:** OPEN (deliberate) — narrowed to `sufferDamage` in the 2026-10
audit. `sufferDamage` (`src/entities/ship.js`) has no live caller — it is the
pre-built damage half of the API for Battle Stations Phase D (station play →
ship integrity/battered, issue #216), marked `// UNWIRED` in-code per
`rules/reachability.md`; its unit tests lock the semantics until Phase D wires
it (deadscan lists it TEST-ONLY). `repairIntegrity` and `clearBattered` are
**live** since 2026-10: `!repair`'s `applyRepairSpends` (`src/moves/repair.js`)
calls them, and both read battered through `isShipBattered` (native
`system.debility.battered` canonical — REPAIR-BATTERED-FLAG). Recorded
2026-07-07 (test-suite review).

### ASSEMBLER-001 — World truths section always empty in production ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `buildWorldTruthsSection` changed to read `v.title ?? v.result`.
`TruthResult` shape uses `title`; old test fixtures use `result`. Both now
work correctly.

---

### ASSEMBLER-002 — Progress tracks section always empty ✓

**Resolved in:** Post-session-3 hardening; **flag-location follow-up:** v1.7.16

**Fix:** `buildProgressTracksSection` now loads the dedicated "Starforged
Progress Tracks" journal directly by name instead of scanning
`campaignState.progressTrackIds`.

**Follow-up (v1.7.16):** the original fix loaded the right journal but read
the tracks from `journal.pages.contents[0].flags` (page-level) while
`progressTracks.js` writes them with `journal.setFlag(...)` (document-level) —
so the section was *still* always empty in live play, including for an open
combat track. This surfaced as playtest finding #9 ("it claims there is a
combat progress, but I don't know where"): the narrator never saw the track
in context. `buildProgressTracksSection` now reads `journal.getFlag(MODULE_ID,
"tracks")` (document-level), matching the writer. The unit test previously
mocked the page-level shape, masking the bug; it now mocks `getFlag`.

---

### ASSEMBLER-003 — X-Card suppression never fired ✓

**Resolved in:** Post-session-3 hardening

**Fix:** Assembler now checks `campaignState?.xCardActive` in addition to
`isSceneSuppressed(sessionState)`. The `/x` chat command writes to
`campaignState.xCardActive`; `sessionState` was always null in the pipeline.

**2026-10:** this gate only ever suppressed the assembler's packet, which
narration stopped reading (FACTION-PACKET-DEAD) and #271 then deleted — so
move narration ran through an active X-Card until a gate was added to
`narrateResolution` itself (XCARD-MOVE-NARRATION, 2026-10 audit section).

---

### SAFETY-002 — Safety settings not reaching assembler ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `syncSafetyToCampaignState()` added to `settingsPanel.js`. Runs
on every write to Lines/Veils/Private Lines and on the `ready` hook. Bridges
`game.settings` storage to `campaignState.safety` which the assembler reads.
