# Starforged Companion — Known Issues

Open bugs, workarounds, and items pending resolution. Update this file as
issues are resolved or discovered.

_Last audited against the code at v1.6.0 (2026-05)._

---

## Active issues

### PLAYTEST-1712 — v1.7.12 playtest findings (in progress)

**Status:** Open — capturing findings during v1.7.12 playtesting

---

#### A — Sector map padding / initial camera shifted off-canvas

**Symptom:** The sector map canvas extends into the black "no-scene" void on
the left; tokens and connections are visible but the initial view is
mis-centred, with a large portion of the scene area falling outside the
padded region. Pan/zoom-out behaviour is unpredictable.

**Likely cause:** PLAYTEST-1711 D restored `padding: 0.1` and a captured
initial view for the sector map. Something in the v1.7.12 work has either
reset padding to `0` again or the captured initial-view coordinates are being
applied relative to a different origin, shifting the visible area into the
black region.

**Files to check:** `src/sector/sectorScene.js` (padding + `initialViewPosition`
write), `src/sector/sectorMap.js`.

---

#### B — Begin a Session spotlight vignette omits second player character

**Symptom:** With two player characters (Kylar and Mave), the Begin a Session
spotlight vignette only features one character (Kylar). Mave is absent from
the generated opening scene entirely.

**Likely cause:** The vignette prompt either only resolves the first entry from
`getPlayerActors()` / `characterIds`, or the assembler's CHARACTER STATE block
is only injecting one character into the narrator context that generates the
opening scene. The "+1 momentum to all players" line on the move card suggests
both PCs are known to the consequence layer — the gap is in the vignette
narration prompt specifically.

**Files to check:** wherever the Begin a Session opening vignette is generated
(likely `src/moves/resolver.js` CONSEQUENCE_MAP entry for `begin_a_session`,
or `src/narration/narratorPrompt.js`); confirm the CHARACTER STATE block passed
to that call includes all player actors.

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

**Likely cause:** The "GM-only write" fallback path in the vow consequence
handler only posts the advisory text and returns — it doesn't call the entity
extractor / draft pipeline that narration-detected entities go through. The
connection name is available at that point but is never forwarded to
`routeEntityDrafts` or `createConnection`.

**Files to check:** `src/moves/resolver.js` (vow consequence, the branch that
emits the advisory string), `src/entities/entityExtractor.js`
(`routeEntityDrafts` / draft card emission).

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

**Likely cause:** `seedConnectionActor` (or `autoSeedConnection`) always rolls
the Character Role oracle unconditionally — there is no pre-check for a title
already present in the actor name.

**Files to check:** `src/entities/connection.js` (`seedConnectionActor` /
oracle roll for ROLE), `src/narration/narratorPrompt.js` or wherever the
Characteristics oracle block is assembled.

---

#### E — Push-to-talk button absent for non-GM players

**Symptom:** The push-to-talk microphone button renders in the chat input area
for the GM but is invisible to the second (non-GM) player. Both players are in
the same world; the GM's chat input shows the mic icon between the message
field and the toolbar, while the player's chat input shows only "Enter message"
with no mic button.

**Likely cause:** The PTT button is injected into the chat DOM on a hook that
is gated `if (game.user.isGM)`, or the button's CSS/visibility is conditioned
on GM status when it should be available to all connected users.

**Files to check:** `src/audio/playback.js` or wherever the PTT button is
injected into the chat input (search for the mic icon render / PTT hook
registration); confirm the GM gate is not applied to button insertion.

---

#### F — Entity detector proposes player characters as new Connections

**Symptom:** After the Begin a Session opening narration (which featured both
PCs by name), the "New Entities Detected" card proposed creating Mave and
Kylar as Connection entities. Both are existing player characters, not NPCs.

**Expected behaviour:** PC names should be excluded from entity detection —
they are already tracked as player-owned Actors and must not be re-proposed
as Connections.

**Likely cause:** `collectEstablishedEntityNames` (or the dedup gate in
`routeEntityDrafts`) does not include player character actor names in the
suppression list, so the narrator-extracted names pass the novelty check and
surface as draft entities.

**Files to check:** `src/entities/entityExtractor.js`
(`collectEstablishedEntityNames`, `entityExistsAnyType`, and the draft
routing gate); confirm that `getPlayerActors().map(a => a.name)` is included
in the known-names set before extraction runs.

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

**Likely cause:** The narrator's move-suggestion logic classifies the target of
a persuasive line as a valid Compel target without first checking whether the
target is a known player character. The fix should suppress Compel (and
similar moves with an interpersonal target) when the target name matches any
PC actor.

**Files to check:** `src/narration/narrator.js` or `src/narration/narratorPrompt.js`
(move-suggestion / Roll button injection logic); `src/character/actorBridge.js`
(`getPlayerActors`) for the PC name set to exclude.

---

#### H — Narrator audio does not autoplay for non-GM players

**Symptom:** When a narrator card is posted, the GM hears the audio
automatically. The second (non-GM) player does not — they must manually click
▶ Play on the card to hear it.

**Likely cause:** Audio synthesis and the autoplay trigger both run on the GM
client (the canonical narrator). The synthesised audio URL is stored on the
chat message, but no signal is sent to connected player clients to trigger
playback on their end. The `isCanonicalGM()` guard in the playback path that
prevents duplicate emission may also be suppressing autoplay on all non-GM
clients.

**Files to check:** `src/audio/playback.js` (autoplay trigger, `isCanonicalGM`
gate), `src/multiplayer/gmGate.js`; check whether a socket message or
flag-watch is needed to tell player clients to begin playback once the audio
URL is available on the message.

---

### PERSIST-001 — persistResolution gated to GM only

**Status:** Open — acceptable for solo play, needs a player→GM relay for multiplayer

**Symptom:** Player-triggered moves do not persist meter changes to character
or campaign state. Only GM-triggered moves persist.

**Cause:** `persistResolution()` (`src/moves/persistResolution.js`) writes
world-scoped settings, which require GM permissions. Player clients cannot write
to world-scoped settings, so the call is gated to `game.user.isGM` at the
pipeline site in `src/index.js`.

**Workaround:** Run the triggering narration from the GM account. Meter changes
persist correctly. For multiplayer, the GM client must be active.

**Note:** `src/multiplayer/gmGate.js` (`isCanonicalGM()`) was added to dedupe the
*emitter* so a move resolves only once across connected clients — it does **not**
relay persistence from a player client to the GM. A true player→GM persistence
relay is still the outstanding fix.

---

### SAFETY-001 — Safety config sync is client-initiated

**Status:** Low priority — acceptable for solo play

**Symptom:** If Lines or Veils are set while only one player is connected,
other players who connect later will not have their `campaignState.safety`
populated until `syncSafetyToCampaignState()` runs on their client (which
happens on the `ready` hook).

**Cause:** `syncSafetyToCampaignState()` (`src/ui/settingsPanel.js`) runs on each
client's `ready` hook and on every Lines/Veils write, but reads from client-local
`game.settings` — client-scoped for private Lines, world-scoped for global
Lines/Veils. It is GM-gated.

**Impact:** Near zero for solo play. For multiplayer, the GM should set global
Lines before players connect for the session.

---

### COVERAGE-001 — Function coverage below the historical 65% threshold

**Status:** Accepted — `functions` threshold set to 50% in `vitest.config.js`

**Cause:** `src/moves/resolver.js` has a ~40-entry `CONSEQUENCE_MAP` where each
entry is an **arrow function** — a move-specific consequence handler with its own
`switch`/branching — not a callable reached by unit tests. Exercising them needs
a full move-pipeline mock, so v8 reports them as uncovered functions.

**Resolution:** `functions` threshold set to 50 with an explanatory comment in
`vitest.config.js`. Raise it if `resolver.js` is refactored to separate the
consequence data from the per-move logic.

> Earlier revisions of this entry called the map entries "pure data objects with
> no logic to test" — that was inaccurate; they are functions with branching.

---

### SECTOR-SWITCH-001 — `!sector <name>` silently no-ops for non-GM players

**Status:** Low priority — minor UX gap

**Symptom:** A non-GM player typing `!sector <name>` to switch the active sector
gets no feedback — nothing happens and no message is posted.

**Cause:** The switch branch in `handleSectorCommand` (`src/index.js`) is gated
`if (sub && game.user.isGM)` with no `else`, so non-GM invocations fall through
silently. `!sector list` is unaffected (open to all); `!sector new` and the
switch are GM-only by design.

**Fix needed:** Post a "GM only" notice on the non-GM switch path.

---

## Resolved issues

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
(`entity-actor-migration-scope.md` §3.4, finding **F8**); the gap was
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

### ASSEMBLER-001 — World truths section always empty in production ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `buildWorldTruthsSection` changed to read `v.title ?? v.result`.
`TruthResult` shape uses `title`; old test fixtures use `result`. Both now
work correctly.

---

### ASSEMBLER-002 — Progress tracks section always empty ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `buildProgressTracksSection` now loads the dedicated "Starforged
Progress Tracks" journal directly by name instead of scanning
`campaignState.progressTrackIds`.

---

### ASSEMBLER-003 — X-Card suppression never fired ✓

**Resolved in:** Post-session-3 hardening

**Fix:** Assembler now checks `campaignState?.xCardActive` in addition to
`isSceneSuppressed(sessionState)`. The `/x` chat command writes to
`campaignState.xCardActive`; `sessionState` was always null in the pipeline.

---

### SAFETY-002 — Safety settings not reaching assembler ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `syncSafetyToCampaignState()` added to `settingsPanel.js`. Runs
on every write to Lines/Veils/Private Lines and on the `ready` hook. Bridges
`game.settings` storage to `campaignState.safety` which the assembler reads.
