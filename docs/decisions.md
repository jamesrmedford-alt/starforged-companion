# Starforged Companion — Architecture Decisions

Key decisions made during development. Read this before making changes to understand
why things are the way they are. Each decision includes the reason and what was
rejected.

---

## Chat command prefix: `!` not `/`

**Decision:** All module commands use `!` prefix (`!x`, `!recap`, `!journal`, `!sector`).

**Reason:** Foundry v13 validates all `/`-prefixed chat messages against `MESSAGE_PATTERNS`
before `createChatMessage` fires. Any unrecognised `/word` matches the invalid pattern
`/^(\/\S+)/` and is rejected with an error — the message is never created and the
module hook never sees it. Native Foundry commands (`/roll`, `/ooc`, `/whisper`, etc.)
still use `/`; module commands must not conflict with this validation.

**What changed:** `registerXCardHook()` checks for `!x`. `isRecapCommand()` checks for
`!recap`. Regexes in `registerChatHook()` updated to `!recap`. `isPlayerNarration()`
excludes messages starting with `!`. All user-facing help text updated.

---

## Testing framework: Vitest (not Jest)

**Decision:** Replace Jest with Vitest.

**Reason:** Jest requires CommonJS-compatible transforms for ESM modules. The module
uses native ES modules throughout (`type: "module"` in package.json). Vitest handles
ESM natively without babel or transform configuration.

**What changed:** `jest.config.js` deleted, `vitest.config.js` added, `tests/setup.js`
rewritten with `global.*` assignments (no Jest globals shim), all test files updated
to import `describe, it, expect, vi` from `vitest` explicitly. `globals: true` in
vitest config makes Jest-style implicit globals available for older test files.

---

## Foundry version: v13 target (not v12)

**Decision:** Write for Foundry v13 with v12 backward compat where trivial.

**What this affects:**

- **ApplicationV2** — all UI panels use `foundry.applications.api.ApplicationV2`.
  v1 Application is deprecated in v13, removed in v16.
- **jQuery removed** — Foundry v13 no longer provides jQuery globally. All DOM
  manipulation uses the standard DOM API (`querySelector`, `createElement`, etc.).
- **`getSceneControlButtons` hook** — in v12, `controls` is an Array. In v13 it is
  an Object keyed by group name. Handler uses `Array.isArray(controls)` check.
- **`ChatMessage.type`** — v13 removed `"other"` as a valid type. Use no type field
  (defaults to `"base"`) or string literals `"ooc"`, `"roll"`, `"whisper"`.
- **`message.author`** — the correct property in both v12 and v13. `message.user`
  was the old name; accessing it in v13 logs a deprecation warning.
- **`CONST.CHAT_MESSAGE_TYPES`** — restructured in v13. All type checks use string
  literals instead.

---

## CORS strategy: direct browser fetch for everything

**Decision:** All external API calls go directly from the Foundry renderer
to the upstream provider. There is no proxy, no relay, and no environment
branching. The same code runs on Foundry desktop and on The Forge.

**Anthropic — direct browser fetch.** Anthropic supports browser CORS when
the request carries `anthropic-dangerous-direct-browser-access: true`. The
Foundry renderer (Electron on desktop, browser on The Forge) is just a
browser, so direct `fetch` to `api.anthropic.com` works on every platform.
`apiPost()` in `src/api-proxy.js` injects the header centrally so every
Anthropic caller gets it automatically.

**Image generation — direct browser fetch via OpenRouter.** OpenAI does not
allow browser CORS for `images/generations`, but OpenRouter does — its
`chat/completions` endpoint sends `Access-Control-Allow-Origin` and accepts
`modalities: ["image"]` for image generation. The user supplies their own
OpenRouter API key (`openRouterApiKey`) and the model id is configurable
via `openRouterImageModel` (default `black-forest-labs/flux.2-pro`). The
helper `src/art/openRouterImage.js` handles the request and decodes the
inline base64 response; both `src/art/generator.js` (entity portraits) and
`src/sectors/sectorArt.js` (sector backgrounds) call it directly.

**No local proxy.** Earlier versions of this module shipped a Node proxy at
`proxy/claude-proxy.mjs` (started with `npm run proxy`) to bypass desktop
Foundry's CORS enforcement before Anthropic's browser opt-in existed. That
proxy has been removed; the same direct-fetch transport now works on both
desktop and Forge.

**Earlier rescinded claim.** A very early version of this doc claimed The
Forge exposed a server-side HTTP relay via `ForgeAPI.call("proxy", …)`.
Inspecting the public Forge module source (`ForgeVTT/fvtt-module-forge-vtt`,
`ForgeAPI.mjs`) showed `ForgeAPI.call(verb, …)` simply appends `verb` to
`https://forge-vtt.com/api/`; `/api/proxy` is not a real Forge endpoint.
The Forge branch in `api-proxy.js` was therefore non-functional and surfaced
as failing Quench live-API tests, which led to the direct-CORS architecture
in use today.

**Reference precedent:** The `loremaster-foundry` module makes Anthropic
requests with the same direct-CORS header from the same Foundry renderer
context (`scripts/api-client.mjs`, lines 41–50).

**Rejected:** Foundry socket relay (player → GM client → API). Unreliable in
single-browser sessions where accounts share a socket connection. Also adds
account-dependency (GM must be connected) which breaks headless/automated use.

---

## Narration: direct Claude API (not Loremaster)

**Decision:** Remove Loremaster dependency. Implement narration directly via Claude.

**Reason:** Loremaster only responds to messages sent by the GM account. Player
clients cannot trigger narration without a socket relay, which is unreliable in
single-browser sessions and adds account-dependency for multiplayer. Additionally:
no control over narrative style, voice, or prompt; Loremaster uses v1 Application
framework (deprecated in v13); dependency on Patreon-gated external service.

**What replaced it:** `src/narration/narrator.js` + `src/narration/narratorPrompt.js`.
Direct Claude API call via `api-proxy.js`. Configurable model (Haiku/Sonnet),
perspective, tone, length, and custom instructions per campaign. Narration runs
on whichever client triggered the move — no GM dependency.

**Files removed:** `src/loremaster.js`. Loremaster settings removed from
`settingsPanel.js`. Socket relay removed from `index.js`.

---

## Mischief dial naming: `normalizeDial()` bridge

**Decision:** `settingsPanel.js` stores `"lawful"/"balanced"/"chaotic"`.
`mischief.js` uses `"serious"/"balanced"/"chaotic"` internally. `normalizeDial()`
maps `"lawful"` → `"serious"` at all three consumption points.

**Reason:** The two files were written independently with different assumptions about
the dial value names. Rather than changing one file's naming convention (which would
require touching all tests and UI labels), a bridge function was added.

**Where it lives:** Top of `src/moves/mischief.js`. Called at the start of
`buildMischiefFraming()`, `shouldApplyMischief()`, and `buildMischiefAside()`.

---

## Safety config storage: sync bridge

**Decision:** `settingsPanel.js` writes Lines/Veils to `game.settings`. The assembler
reads from `campaignState.safety`. `syncSafetyToCampaignState()` bridges them.

**Reason:** The two systems were written independently. `game.settings` is the natural
storage for UI-managed configuration. `campaignState` is the natural source of truth
for the context assembler. Rather than refactor one to use the other's storage,
a sync function runs on every write and on the `ready` hook.

**Private Lines:** Stored client-scoped in `game.settings`. In `campaignState.safety.
privateLines`, they are stored as `[{ playerId, lines }]` objects so each player's
Lines are preserved when any one player's client syncs.

---

## Progress tracks: single dedicated journal

**Decision:** All progress tracks stored in ONE JournalEntry named "Starforged
Progress Tracks", as a flag directly on the JournalEntry (not on a page).

**Confirmed storage (from live testing and progressTracks.js source):**
```js
// Write
await journal.setFlag("starforged-companion", "tracks", tracksArray);

// Read
const tracks = journal.getFlag("starforged-companion", "tracks") ?? [];
```

**Not:** `journal.pages.contents[0].getFlag(...)` — the journal has no pages.
This distinction matters: JournalEntry flags and JournalEntryPage flags are
completely separate. The tracks journal creates no pages.

**Reason:** Initially designed with per-track journal entries. Changed because
individual journal entries created UI clutter and made bulk operations require
scanning the entire journal collection. Single journal with a flag array is
simpler and faster.

**Impact:** `assembler.js` `buildProgressTracksSection()` must call
`journal.getFlag(MODULE_ID, "tracks")` directly — NOT read from a page.
`campaignState.progressTrackIds` is unused for this purpose.

---

## Portrait generation: generate once, one regeneration, then locked

**Decision:** Portraits follow a three-state lifecycle: none → unlocked → locked.
One regeneration is permitted. After that the portrait is permanently locked.

**Reason:** Art generation is expensive and the campaign wants visual consistency.
Locking after regeneration prevents iterating endlessly on a portrait and ensures
entities have a stable visual identity across sessions.

**State stored on:** `ArtAsset.regenerationUsed` (boolean) and `ArtAsset.locked`
(boolean). The superseded asset gets `ArtAsset.superseded = true` and is retained
for the session log.

---

## `foundry-shim.js`: deleted

**Decision:** `src/foundry-shim.js` was deleted. Entity files had their import
statements removed via `scripts/remove-shim-imports.js`.

**Reason:** The shim was created to make Foundry globals available in Jest tests.
Switching to Vitest with `tests/setup.js` providing stubs via `global.*` assignments
made the shim unnecessary. The shim also caused 404 errors in the Foundry renderer
when module files tried to import it at runtime.

---

## CI release: update `module.json` before building zip

**Decision:** The CI release job updates `module.json` (version, download URL,
manifest URL) BEFORE building the zip.

**Reason:** The zip was originally built first, then `module.json` was updated as a
separate step. This meant the zip contained an old `module.json` with empty download
and manifest URLs. Foundry reads the manifest from inside the installed zip to check
for updates — an empty manifest URL means Foundry can never find an update. Swapping
the order fixed both the update detection and the version display.

---

## Claude API model selection

**Interpretation (move identification):** `claude-haiku-4-5-20251001` — fast, cheap,
structured JSON output. System prompt cached with `cache_control: ephemeral`.
Prompt caching makes interpretation nearly free per call.

**Narration:** `claude-sonnet-4-5-20250929` default, `claude-haiku-4-5-20251001`
available. Sonnet produces noticeably richer prose. System prompt cached. Cost per
session at Sonnet: ~$0.05. Configurable per campaign in module settings.

**Why not Opus:** Overkill for both tasks. Haiku handles structured output well.
Sonnet handles atmospheric prose well. Opus is for complex reasoning tasks neither
of these require.

---

## Sector background art storage: worlds/{worldId}/scenes/

**Decision:** Sector background images are uploaded to `worlds/{worldId}/scenes/`
using `foundry.applications.apps.FilePicker.implementation.upload()`. The path
is constructed at upload time from `game.world.id`.

**Reason:** The previous path (`modules/starforged-companion/art/`) lives inside
the module folder. Foundry's module installer wipes that folder on every module
update or reinstall, destroying all generated backgrounds. The world's own
`worlds/{worldId}/scenes/` directory is created by Foundry when the world is
created, persists across module updates and reinstalls, and is included in
Foundry's world export/backup. No custom folder needs to be created.

**Side-effects:**
- Foundry no longer shows the "unsafe module folder" warning for uploaded art.
- Sector backgrounds are backed up with the world via Foundry's world export.
- Entity portraits are unaffected — they continue to use base64 flag storage.

**FilePicker namespace:** `foundry.applications.apps.FilePicker.implementation`
(the v13 non-deprecated form). The bare global `FilePicker` is deprecated in v13.

---

## Narrator tone and perspective

**Tone: wry** — knowing and slightly sardonic, aware of consequence without
wallowing in it. The narrator has seen this before. It notices the irony. It
does not editorialize, but it does not pretend not to notice. This is the
default and the recommended setting for Ironsworn: Starforged, which has an
existing tradition of spare, consequential prose with occasional dark wit.

**Perspective: auto** — second person ("you") for solo campaigns, third person
(character names) for multiplayer. Resolved at narration time from the count of
active non-GM users. Can be overridden to a fixed value per campaign.

**Why auto rather than a fixed default:** Second person creates intimacy in solo
play — the narrator is addressing the player directly, which suits the journaling
nature of Ironsworn solo. Third person is more natural for multiplayer where
multiple characters are present and "you" becomes ambiguous.

**Both are configurable** in the Narrator tab of module settings. The auto
logic lives in `resolveNarrationPerspective()` in `src/narration/narrator.js`.

---

## Auto-capture salience gate

**Decision:** The combined detection pass and the chronicle writer rate every
candidate beat on a five-tier salience scale (`trivial` < `scene` < `notable` <
`significant` < `defining`), and each capture channel — World Journal Lore,
World Journal Threats, and the character Chronicle — drops anything below its
own configurable floor. Floors default conservatively to `significant`. The
shared logic lives in `src/world/salience.js`; the gate sits in
`routeWorldJournalResults` (lore/threats) and `writeChronicleEntry` (chronicle).

**Reason:** v1.6.1 playtest (findings F15 / F17 / F20 / F21) showed auto-capture
was over-eager — transient scene beats (a sensor blip, scorch marks, an airlock
cycling) became permanent Lore pages, scene-level complications became world
Threats, and the Chronicle filled with moment-to-moment minutiae. Salience is
distinct from the existing detector `confidence` field (how sure the model is a
thing exists) — it measures how *durable* the thing is — so it is a new field,
not an overload of `confidence`.

**Per-channel, not a single dial (D4):** each channel owns its floor so the GM
can, e.g., keep Threats strict while loosening the Chronicle. Matches the
existing per-feature world-settings style.

**Conservative default (D5):** the floor is `significant`, so only durable
world/character facts are recorded and the GM promotes scene texture up. Under-
capturing is cheap to correct (the WJ panel has a Confirm step; the Chronicle
has manual + Add Note); over-capturing creates cleanup. Findings explicitly
flagged over-capture, so the default errs toward recording less.

**Fail-open — the load-bearing safety choice:** `passesSalience` treats an
absent or unrecognised item salience as a *pass*. If the model stops emitting
the field (format drift), capture degrades to the pre-salience "record
everything" baseline rather than a silent blackout where nothing is captured.
This is the RECAP-003 lesson — never let a parse miss silently disable a whole
subsystem. The salience path is also kept free of `console.warn` so the
fail-open route does not trip the test-harness warn guard.

**What was rejected:**
- *A numeric 1–5 score.* An ordered enum is more self-documenting in the JSON
  and the per-channel setting becomes a meaningful choice list rather than an
  opaque number; it also mirrors the `SEVERITY_ORDER` idiom already in
  `worldJournal.js`.
- *Fail-closed (drop unrated items).* Safer-looking but it risks the exact
  silent-disable failure mode RECAP-003 warned about.
- *Retroactive sweep of existing over-captured entries (D6).* Out of scope —
  go-forward behaviour only.

**Running session log (D7, append-during-play):** below-threshold lore/threat
beats are not dropped — they append to one running session-log page per session
(`appendSessionLogBeat`), a live scene-by-scene log. `writeSessionLog` was
refactored to fill the End-Session summary as a section on that *same* page
(matched by `sessionId`, one page per session) rather than spawning a new page
each End Session, so the F18 wrap-up and the live log coexist. Reserve Lore and
Threats for durable facts; the Session Log holds the session's texture (F18).
The chronicle is **not** rerouted — it is the PC's personal record, not a scene
log, so below-floor chronicle beats are skipped. The empty-body defect (T3) is a
separate confirm/persist concern, not a salience question.

**Settings surface:** the three thresholds are registered `config: false` like
the rest of the World Journal / Chronicle capture family (none of which the
custom panel renders yet) and are documented in the in-game Settings Reference.
Surfacing the whole capture family as panel rows is a clean later improvement.

---

## Entity finalize lifecycle (T1)

**Decision:** Entity flavour (a grounded narrator description) and a first-time
portrait are generated by an explicit **finalize** step, not at creation.
`finalizeEntity(typeKey, hostId, campaignState, { force })` in
`src/entities/finalize.js` reads the entity's stored Actor record, generates a
2–4 sentence description grounded only in its fields, writes it
(`system.description` + flag + `portraitSourceDescription`), stamps
`finalizedAt`, and triggers a portrait only when the entity has none. The Entity
Panel exposes it as **✦ Finalise** → **↻ Regenerate flavour**.

**Why an explicit step, not auto-at-creation (D1):** the v1.6.1 playtest framed
T1 as "defer generation out of creation," but the code already deferred it — the
creators (`createShip`/`createSettlement`/…) are pure. The real gaps were a
silently-dropped sector stub (fixed separately) and the absence of a
*grounded, on-demand* generation a GM can invoke once the entity's details are
settled. An explicit trigger also avoids spending image-generation budget
automatically on every detected entity.

**Idempotent + manual regen (D2):** a finalized record is left untouched unless
`force` is set, so a later narrator pass or re-finalize never clobbers GM-facing
flavour. The regenerate path passes `force`. Art is **generate-once/locked** per
the art pipeline: finalize triggers a portrait only when there is none, and a
flavour regen never re-bills or replaces an existing portrait — the panel's
separate one-time portrait regen owns that.

**Scope:** the four Actor-backed types (ship / settlement / planet / location).
`connection` is seeded richly at creation (oracle role/goal/first-look) and
`faction`/`creature` are journal-backed and sparse; none are in the affordance.
Extending to them later is just adding entries to the `GETTERS`/`UPDATERS` maps.

**Fail-safe:** with no Claude key, `finalizeEntity` returns `{ ok:false,
reason:"no-flavor" }` and writes nothing; the panel surfaces a notification.
Generation is grounded strictly in stored fields with an explicit "do not invent
proper nouns" instruction, so finalize can't fabricate new entities/factions.

## Companion launcher: floating toolbar, NOT scene-controls (v1.7.5)

**Decision:** The Companion's panel launcher is a **floating, draggable,
frameless `ApplicationV2`** (`src/ui/companionToolbar.js`), opened at `ready` and
pinned to the viewport — independent of the canvas. It is **not** a Foundry
scene-control group.

**Why (the bug that forced it):** F16 (v1.7.0) gave the Companion its own
top-level scene-control group, backed by an empty `InteractionLayer`. A
scene-control group can only be *activated* when the canvas is ready, because
selecting a group activates its canvas layer. With **no active scene**
(`canvas.ready === false` — the normal state for theater-of-the-mind play, and
what a Forge "no default scene" launch setting produces) the entire
scene-controls bar is inert: clicking **any** group icon, Foundry's own included
(Walls, Lighting), fails to switch, with no error. The Companion buttons were one
casualty among all groups. This was misdiagnosed twice as a problem with *our*
group's config — first the v1.7.1 `activeTool` band-aid, then a v1.7.4
`primary`→`interface` canvas-group change (released, but still broken for
mapless play) — but neither could work, because the
surface itself is dead without a canvas. Live tracing (clicking Walls also froze
on `tokens`; `canvas.ready`/`hasScene` both `false`) confirmed it was global, not
ours.

**Consequence:** scene-controls is the wrong home for a launcher that must work
during mapless play. The floating toolbar works with or without a scene. The
old `getSceneControlButtons`/`renderSceneControls` hooks, `buildCompanionTools`,
and the fake `StarforgedCompanionLayer` / `CONFIG.Canvas.layers.starforgedCompanion`
registration are removed. Per-user position persists via a client-scoped
`companionToolbarPosition` setting. Visibility (GM-gating, Private Channel gate)
is a pure function in `companionToolbarTools.js`, unit-tested.

**Note on foundry-ironsworn:** the vendor system registers its `ironsworn`
control group the same way (`group: "primary"`, a 2022 value) and its group is
broken identically with no scene — confirmed with our module disabled. That is
an upstream bug, not ours; do not treat ironsworn's `sceneButtons.ts` as a
template here.

## NPCs and connections: native ironsworn `character` Actors, per-sector NPC folder

**Decision (2026-06-03):** NPCs are represented as foundry-ironsworn
**`character`-type Actors** (the full "character card", same sheet PCs use).
**Connections** — the bond NPCs, including the local connection the sector
wizard generates — are **also** created as `character` Actors, converting off
their legacy `JournalEntry` storage. NPCs and connections for a sector live in a
**per-sector NPC Actor folder** (`Sectors / <Sector Name> / NPCs/` in the
**Actor** sidebar), alongside the top-level `PCs/` and `Starships/` Actor folders
that are created on Companion module activation.

**Why:** the Actor sidebar is the right home for entities with sheets, and the
ironsworn system **does** ship native `character` / `npc` / `foe` actor types —
so there is no reason to keep relationship NPCs as journal pages. The
`character` card is the richest and matches how PCs are already handled by
`actorBridge.js`.

**Corrects a stale premise:** `entity-actor-migration-scope.md` §8 previously
deferred connection migration claiming *"No native NPC actor type."* That was
factually wrong (the system exposes `character`/`npc`/`foe`), and the error is
why this structure repeatedly got lost between sessions. This decision
supersedes that out-of-scope note.

**Consequence (implementation, tracked under FOLDER-002 — not yet built):**
- `src/entities/registry.js` — `connection` routes to `'actor'` (`type:
  'character'`), no longer `'journal'`.
- `src/entities/connection.js` — create path builds a `character` Actor instead
  of a `JournalEntry` + page; readers/updaters follow the actor host.
- `src/sectors/sectorGenerator.js` — the local connection is created into the
  sector's NPC Actor folder.
- `src/entities/folder.js` — add a per-sector NPC Actor-folder helper and
  activation-time scaffolding for `PCs/` (adopt-or-create) and `Starships/`.
- A migration for any existing journal-backed connections in live worlds.

**NPC/connection card population (decided 2026-06-03):** when an NPC/connection
`character` card is created, roll the Character oracles — **First Look**,
**Initial Disposition**, **Character Role**, **Character Goal** (name handled
separately) — and:
- write the oracle results into the card's **Characteristics** field;
- route them through the **narrator** (initial flavor text) and through **art
  generation** (portrait → token image);
- place the initial flavor text **and a large version of the token image** in the
  card's **Notes** tab.

This mirrors the existing **starship auto-envision** behaviour (the `index.js`
setting that rolls a new starship's oracles into its Notes and fires a silent
portrait generation) and reuses the oracle rolls `generateConnection()` in
`sectorGenerator.js` already performs (role / goal / disposition / first look /
name). The missing work is persisting those onto the ironsworn `character` actor
(map to the Characteristics and Notes sheet fields via `actorBridge.js`) and
wiring the narrator + art passes for NPCs the way settlements/ships already do.

---

## Narrator memory: unified prose feed + deterministic sidecar + scene frame (2026-06-10)

**Decision:** narrator continuity is owned by a four-surface memory
architecture — (1) a unified recent-narration ring fed by the
`narratorCard`/`narrationText`/`sessionId` flag family on **every**
narrator-prose card (move, paced, @scene, inciting incident); (2) the
active-scene ledger with **required** sidecar emission for NPC
location/vessel/condition (stateChanges) and intent/stakes (newTruths),
subjects resolved against the full entity roster; (3) a narrator-maintained
**scene frame** (`sceneFrame` sidecar key: location / present / situation,
full-replacement snapshot every response, scene-scoped, never dropped from
the prompt) whose `present` list extends ledger scoping and paced/@scene
relevance matching; (4) entity records injected via the **lexical** relevance
resolver on the paced and @scene paths (zero API cost — `moveId: null` never
reaches the Haiku classifier).

**Reason:** v1.7.8 playtest (findings F6/F7/F8) — the campaign premise
drifted across location, motivation, and stakes within ~30 minutes because
the inciting incident and @scene answers were invisible to every subsequent
narrator call (wrong flags), sidecar emission was discretionary (it kept the
backstory, dropped the stakes), and the non-move paths injected no entity
records at all. The one ledgered fact held firm all session: facts with homes
get defended; facts without homes get rewritten.

**Rejected:**
- *A separate feed flag* instead of extending `narratorCard` — would have
  left session recaps still missing the opening fiction and split the flag
  vocabulary; consumers were audited instead (correction/audio hooks no-op
  without their button markup; burn-supersede requires `resolutionId`).
- *Haiku-based scene summarisation per turn* — cost/latency per narration;
  the same generation that writes the prose already knows the frame. The
  rolling compressed summary remains the documented escalation path
  (architecture doc §8.6) if frame+ledger+ring prove insufficient.
- *Code-side inference of NPC state from prose* — emission is prompt-enforced
  (REQUIRED rules in `appendSidecarInstruction`); inference machinery only if
  the model demonstrably ignores the contract.
- *Frame-unioning the move path's relevance call* — deferred; it would change
  hybrid-move permission classification (architecture doc §8.2).

**Where:** invariants in `rules/narrator-memory.md`; full architecture,
tuning guide (symptom → knob), and refinement backlog in
`docs/narrator/narrator-memory-architecture.md`. Settings:
`narratorContextCards` (ring depth 1–10, default 3) and
`factContinuity.sceneFrame` (default on).
