# Starforged Companion — Architecture Decisions

Key decisions made during development. Read this before making changes to understand
why things are the way they are. Each decision includes the reason and what was
rejected.

---

## The Roll button reflects the narrator's prose, not the classifier's nomination

**Decision:** On a paced-narrative card, the move wired to the Roll button (its
label *and* the `suggestedMove` flag the click forces) is reconciled against the
move the narrator names in its closing italic hint —
`reconcileSuggestedMove(text, classifierMove)` in `src/narration/narrator.js`.
When the hint names a recognised move, it wins; the pacing classifier's
nomination is only the fallback (no hint, or the hint names no recognised move).

**Reason:** The two were computed independently and could diverge (finding J).
The classifier picks `suggestedMove` at pipeline entry, *before* the narrator
runs; the narrator is then asked to write a hint about it but has explicit
creative latitude to invite a different move. The player acts on the prose they
read, so the prose is the source of truth — and because the button re-posts with
`forcedMoveId: suggestedMove`, reconciling the flag (not just the label) means
the *rolled* move matches too. Only the final italic span is scanned, so
single-word move names in the prose body cannot false-match.

**Rejected:**
- *Make the classifier authoritative and forbid the narrator from deviating* —
  rejected; the narrator sees the assembled scene the classifier never did, so
  its choice is usually the better one. Constraining it would trade a cosmetic
  mismatch for worse move suggestions.
- *Suppress the button whenever the prose names no recognised move* — rejected
  as scope creep beyond finding J; the narrator may invite a move via paraphrase
  we don't lexically match, and dropping the button there would lose a valid
  affordance. Keeping the classifier fallback is the safe default.

---

## A title in an NPC name is its role; don't roll a contradictory one

**Decision (finding D):** `seedConnectionActor` resolves an NPC's Role with the
precedence *explicit role → title parsed from the name
(`roleTitleFromName`) → Character Role oracle*. A leading honorific that doubles
as a role (Administrator, Captain, Doctor/Dr, Councilor, Governor, …) is used
verbatim; the oracle only rolls when the name carries no such title.

**Reason:** a vow target created as "Administrator Lyssa Chen" then rolled
ROLE = "Shipwright", so the card contradicted its own name. The name is the
authored, load-bearing fact; the oracle is the fallback for when we have nothing.

**Rejected:** *blank the role on conflict* — leaves an obviously-incomplete
card; using the title is strictly more informative. *Strip the title from the
name instead* — the title is part of how the players refer to the NPC; keep it.

---

## The narrator and entity detector are player-character aware

**Decision:** Two narrator-adjacent paths now consult the player-character
roster (`getPlayerActors()`, which excludes entityType-flagged NPC cards):

- **Entity detection (finding F):** `collectEstablishedEntityNames`
  (`src/entities/entityExtractor.js`) lists PC names as ESTABLISHED in the
  detection prompt, so the model never proposes a fellow PC as a new
  Connection. This is *in addition to* the routing gate `entityExistsAnyType`,
  which already checked PC names but only by **exact** normalized match — and so
  missed first-name mentions ("Kylar" vs the actor "Kylar Nazari"). Telling the
  model upfront resolves the variant the exact gate cannot.
- **Move suggestion (finding G):** `narratePacedInput` drops a *social* move
  nomination (`compel`, `develop_your_relationship`, `test_your_relationship`)
  when the player's input names a fellow PC. Inter-PC tension is roleplay, not
  a roll. Combat moves are deliberately **not** suppressed — PvP via
  Clash/Strike is rules-valid.

**Reason:** in multiplayer with two PCs, both paths misfired — the detector
re-proposed the co-op partner as an NPC, and the narrator offered "Roll Compel"
against a fellow player. Both stem from the same root: narrator-side logic that
didn't distinguish a player character from an NPC.

**Rejected:**
- *Strengthen the exact gate to fuzzy/substring-match PC names* (for F) —
  rejected as the primary fix: substring matching risks suppressing a
  legitimate NPC who happens to share a first name with a PC. Listing PCs in the
  prompt lets the model disambiguate from context instead.
- *Suppress all interaction-class moves against a PC* (for G) — rejected;
  combat between PCs is permitted by the rules, so only the social/relationship
  moves are gated.

---

## Narrator context is assembled in one place; every mode gets the same packet

**Decision:** All narrator calls build their system-prompt context through a
single function, `buildNarratorExtras(mode, campaignState, opts)`
(`src/narration/narrator.js`). The seven call sites (move resolution, paced,
`@scene`, oracle follow-up, session vignette, inciting incident, campaign recap)
no longer hand-assemble their own `extras`. The context packet is **uniform
across modes**; the only per-mode variation is (a) the role description (the
mode's job) and (b) data that physically only exists after a move — the oracle
seeds and the dynamically-classified permission class.

The **creative-latitude permission block is uniform too**: `move_resolution`'s
class is resolved dynamically from the move outcome and passed in; every other
mode falls back to a per-mode default (`DEFAULT_PERMISSION_CLASS_BY_MODE` in
`narratorPrompt.js` — paced→interaction, scene/oracle/vignette→embellishment,
inciting→discovery). The permission-block opening lines were reworded to stop
assuming a move happened ("This turn…" not "This move…") since they now render
outside the move path.

**Reason:** Before this, context reached modes inconsistently — campaign truths
were move-only, entity cards reached three paths, the party roster three, and
the recap call passed *no* extras (so it silently used the move-resolution role
and got no sector/location/character). Adding any new context meant editing up
to seven call sites and risking another asymmetry. One assembly point makes "add
context to the narrator" a one-line change that reaches every path.

**Rejected:**
- *Keep latitude in role descriptions for non-move modes* (no permission block
  off the move path) — considered, but it leaves "what may the narrator invent"
  living in two mechanisms that can drift. A single uniform permission class is
  the one source of truth; role descriptions were trimmed of the now-duplicated
  latitude language (and the inciting role's "do not invent proper nouns" was
  reconciled with the discovery block's reuse-first rule).
- *Make `campaign_recap` a full prose mode* — it is a meta mode: its output is
  used verbatim and never parsed, so it must NOT receive the sidecar instruction
  (a stray JSON block would leak into the recap) nor audio markup nor a latitude
  block. `META_MODES` gates all three.

**Trade-off accepted:** non-move modes now run a (cheap, API-free) lexical
relevance pass and carry a permission block + campaign-truths digest they did
not before — a few hundred input tokens per call, far below any context-window
concern, in exchange for uniformity and the recap/oracle/vignette gaining
context they were missing.

## Reuse before you invent — no throwaway characters

**Decision:** When the fiction needs a character to fill a functional role (an
official, a vendor, a pilot, a witness, a voice on the comm), the narrator must
first try an established character — the active-sector NPC roster, a player
character, or an entity already in the scene — and introduce a brand-new named
character **only when none can plausibly fill the role**. Any genuinely new
character is scoped to the **current sector**, consistent with its authority and
troubles, with enough substance to recur. This is enforced two ways: a CAST
DISCIPLINE directive in the active-sector block (`formatActiveSector`, every
prose path, even when the roster is empty) and a reuse-first rule in the
DISCOVERY permission block (`narratorPrompt.js`).

**Reason:** v1.7.12 playtest drift (findings D/F and the general O case): the
narrator minted one-off named NPCs to fill momentary roles — and, worse,
invented officials for settlements whose Authority is "lawless" — accumulating
contradictory throwaways that never recurred and had no entity home. Anchoring
new cast to the established roster and the current sector keeps the world small,
consistent, and recurring.

**Rejected:** *Forbid new named NPCs off the discovery path entirely* — too
strict; the discovery move (e.g. `make_a_connection`) legitimately introduces
people. The rule is reuse-*first*, not reuse-only.

## Move-concurrency lock covers narration + persistence, not post-roll prompts

**Decision:** The `campaignState.pendingMove` lock (the one-move-at-a-time guard
in the `createChatMessage` pipeline, `src/index.js`) is released on the success
path **before** the interactive consequence-rider prompt (`promptRiders`,
`src/moves/riderDialog.js`), through the `releasePendingMoveLock()` helper. The
pipeline's `finally` re-releases idempotently for the throw / cancelled-confirm
paths.

**Reason:** The lock exists to stop two pipelines racing on `campaignState`
writes and posting duplicate narration. Both of those — `persistResolution` and
the narration call — are finished before the rider step runs. v1.7.12 added
`applyMoveConsequenceRiders` *inside* the locked region; its GM dialog held the
world-scoped lock open while waiting for input, so a missed or unanswered popup
blocked every other player with "a move is already being resolved", recoverable
only by a reload (which fires the `ready`-hook stale-lock reset). This bricked
the v1.7.12 multiplayer playtest (known-issues PLAYTEST-1712 M/N); v1.7.11 had
no post-roll dialog and never wedged.

**Rejected:**
- *Timeout / auto-dismiss the rider dialog* — silently skipping a GM decision
  contradicts the consequence-riders scope doc's "never apply a guess, surface
  what you can't resolve" intent, and is poor UX.
- *Keep the lock across the prompt with a watchdog* — papers over the real
  issue: an interactive prompt must never hold a cross-client concurrency lock.

**Trade-off accepted:** after the early release a second move can begin while the
GM is still resolving the previous move's rider prompt. The rider application
writes actor meters / progress (not the narration path the lock guards) and
re-reads fresh state, so the residual race is narrow and strictly better than
wedging the session. Pre-roll dialogs (`confirmInterpretation`,
`ClarificationDialog`) still hold the lock by design — they are the move's own
expected confirm step, at the start, where a cancel releases the lock immediately.

**Files:** `src/index.js` (`releasePendingMoveLock`, the release sites in the
pipeline), `src/moves/riderDialog.js`. Tests: `tests/unit/pipeline.test.js`.

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
- *Haiku-based scene summarisation **per turn*** — rejected at Cluster A for
  cost/latency per narration. The §8.6 escalation has since been **taken** as a
  *debounced* rolling session summary (regenerated once per ~1.5×N cards, not
  per turn), which answers the original cost objection. See "Rolling session
  summary: a debounced trailing memory tier" below.
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

---

## Rolling session summary: a debounced trailing memory tier (2026-06-15)

**Decision:** the narrator gains a fifth memory surface — a **rolling,
session-scoped prose "story so far"** that complements the verbatim
recent-narration ring rather than replacing it (the §8.6 escalation, promoted
to a build). Mechanics:

- **Summarised from source, never from itself.** Each regeneration reads the
  full feed of the session's narrator cards (`sessionNarratorCards`) and
  produces a fresh summary via one cheap Haiku call. No incremental
  summary-of-summary, so it cannot drift by compounding.
- **Debounced at K = round(1.5 × N)** where N is `narratorContextCards`. The
  summary regenerates only once K new cards have accrued since the last regen;
  every other turn is a free cached read. Because 1.5 × N > N, a summary only
  ever appears once there is a tail of cards beyond the verbatim ring.
- **Runs the whole session** (not scene-scoped). Stored on
  `campaignState.sessionSummary = { text, coveredCount, sessionId, updatedAt }`,
  keyed by `sessionId` so a new session ignores the stale prior summary.
- **Written to the Session Log at End Session.** The End Session flow does a
  final `forceRefresh` regen, then `writeSessionLog` records the prose under
  the page's "Session summary → Story so far" heading for subsequent use.
- **GM-gated, fail-open.** Non-GM clients use the cached text but leave the
  durable write to the GM; any generation error returns the previous text, so
  a summary hiccup never blocks a narration. Gated by the world setting
  `narratorSessionSummary` (default on).
- **Rendered** as system-prompt section `[4c] STORY SO FAR (THIS SESSION)`,
  between the campaign premise `[4b]` and the current location `[5]`; never
  rendered for meta modes (`campaign_recap`).

**Drop priority (the explicit ordering — lowest = shed first under budget
pressure, highest = never dropped):**

1. Scene state (existing — sheds first inside the §6.5 ledger)
2. Recent-narration ring depth (trim toward fewer verbatim cards)
3. **Rolling session summary** ← this tier sheds here
4. Entity cards · current location · active sector · world/campaign truths ·
   inciting premise
5. **Never dropped:** scene frame · binding truths · ship position

**Hard invariant:** the session summary is a *droppable continuity
convenience, not a fact store*. It must never be retained at the expense of any
§6.5 ledger tier or the never-dropped facts. This is satisfied structurally
today — it is a single, bounded (~≤320-token Haiku-capped), self-contained
prose block that is appended only when present and is always safe to omit; it
does not participate in or compete with the §6.5 `maxLedgerTokens` budget.
Load-bearing facts still live in the ledger / entity tiers / WJ Lore, which
defend them; the summary only carries narrative *texture* the ring would
otherwise drop.

**Reason:** after the first card of a session the ring shows only the last N
cards, so the narrative arc of everything older survived solely as discrete
ledger facts — tone, dramatic through-line, and unresolved tension were lost
mid-session, and the campaign recap (the cross-session summariser) is injected
only at session start. The rolling summary fills that middle band cheaply.

**Rejected / deferred:**
- *Scene-scoped instead of session-scoped* — the felt gap spans scene
  boundaries within a sitting; the §6.5 ledger already covers the current scene.
- *Replacing the ring (per §8.6's original sketch)* — the verbatim ring carries
  phrasing the summary necessarily flattens; they are complementary.
- *A ledger-duplication guard* — the summary may restate facts already in the
  ledger. Deliberately **waived** until it demonstrably causes a problem
  (contradiction or token bloat); revisit by biasing the summariser prompt away
  from facts if a playtest shows it.

**Where:** `getRollingSessionSummary` / `getRollingSummaryText` /
`rollingSummaryThreshold` in `src/narration/narrator.js`; rendering in
`buildNarratorSystemPrompt` (`src/narration/narratorPrompt.js`); End Session
persistence in `src/safety/sessionLifecycleDialogs.js` + `writeSessionLog`
(`src/world/worldJournal.js`). Architecture doc §8.6.

---

## Named-NPC continuity: paced-path generative tier, salience-gated, + cast hygiene (2026-06-15)

**Decision:** strengthen per-entity memory along three axes, all keyed on the
existing named/unnamed split (a confirmed record = named; no record = ephemeral):

1. **The generative tier now updates on the paced/free-narration path**, not
   only on interaction-class move resolution. `narratePacedInput` schedules
   `appendGenerativeTierUpdates` for the in-scene matched entities
   (`schedulePacedTierUpdate`), mirroring the move path's post-narration pass.
   Conversation/roleplay scenes are where an NPC's character is most
   established, and they were previously writing nothing to the card.
2. **Tier capture is salience-gated and biased toward actions/developments.**
   The tier-update prompt now asks for *significant* developments — what the
   character did, decided, revealed; shifts in disposition/allegiance/relationship
   to the PC — and rates each with a salience. `appendGenerativeTierUpdates`
   drops anything below a fixed `TIER_SALIENCE_FLOOR = "notable"` (more
   permissive than the chronicle/lore floors, because an NPC's card should hold
   character-relevant beats even if they aren't campaign-defining). Fail-open:
   an unrated update still lands, so model drift degrades to the prior
   capture-all behaviour rather than emptying the tier.
3. **The narrator is nudged away from naming minor characters.** A "name
   sparingly" rule sits in the discovery permission block *and*, paired with the
   Finding-O anchor, in `appendSidecarInstruction` (universal, non-meta): leave
   one-off functionaries generic ("a guard", "the comms officer"); spend a
   proper name only on a character meant to recur. This is the chosen
   alternative to a graded-importance data model — instead of grading named
   NPCs, reduce the population of named-but-minor ones, so the cast that gets
   tracked is the cast that matters.

**Reason:** the narrator's structured memory of an NPC (motivation, disposition,
faction relationship) exists only as entity-card fields surfaced when the entity
is confirmed AND matched. For invented/unmatched figures it improvises, and
un-homed facts drift. (1)+(2) give in-scene named NPCs a durable, low-noise
behavioural record on every narration path; (3) keeps the un-homed population
small so improvisation drift is confined to genuinely disposable figures.

**Rejected / deferred:**
- *Graded importance flag on named NPCs (minor vs central)* — replaced by the
  prose nudge in (3); revisit only if naming discipline proves insufficient.
- *Appending to the user-facing `notes` field* (the original sketch) — the
  generative tier is the right home: capped at 5 on the card, deduped, pinned,
  and auto-promoted to WJ Lore at scene end. `notes` would bloat unboundedly.
- *A scene-end per-NPC rollup* (one summary entry per scene instead of per-turn
  details) — a clean follow-up, not built yet.
- *A new salience setting for the tier* — used a fixed floor instead, per the
  "don't add knobs before using the existing ones" rule.

**Where:** `schedulePacedTierUpdate` (`src/narration/narrator.js`);
`TIER_SALIENCE_FLOOR` + `buildTierUpdatePrompt` + salience gate in
`appendGenerativeTierUpdates` (`src/entities/entityExtractor.js`); cast nudge in
`NARRATOR_PERMISSIONS.discovery` + `appendSidecarInstruction`
(`src/narration/narratorPrompt.js`). Architecture doc §5.

---

## Exploration lifecycle: expedition + waypoint moves wired to the live track (2026-06-15)

**Decision:** the exploration cluster now applies its mechanical effects instead
of leaving them as instructional text (closes audit 3.18–3.21):

- **Undertake an Expedition** and **Explore a Waypoint** mark progress on a
  shared **expedition** progress track via `expedition.applyExpeditionProgress`
  + a GM-gated pipeline handler. The track is resolved by destination
  (`moveTarget`), else the single open expedition, else **auto-created** at an
  **interpreter-inferred rank** (`expeditionRank`; validated, `dangerous`
  default, re-rankable in the panel — the inference is a best guess, kept cheap
  to correct).
- **Make a Discovery / Confront Chaos** mark the **discoveries** legacy track
  (2 ticks / 1 tick-per-aspect) via a `legacyMark` consequence.
- **Finish an Expedition** completes the open expedition track and pays its
  rank's **legacy reward** onto discoveries (`legacyRewardTicks`, the play-kit
  1-tick→3-box table; weak hit one rank lower, troublesome→none; a miss leaves
  the track open).

**Integrate via the live track store.** The canonical progress-track store is
the flag-array model behind the panel (`ui/progressTracks.js`). The
`persistResolution.progressTrackId` path (and `campaignState.progressTrackIds`)
is **vestigial — never written from a resolution** (combat's `progress` suffer
option is dormant for the same reason), so the move→track wiring lives in
`src/moves/expedition.js` (dependency-injected, Foundry-free, unit-tested) and a
GM-gated handler in `index.js`. Legacy/finish writes mutate `campaignState` in
place; the GM's `persistResolution` deep-clones and persists it (no race).

**Rejected / deferred:**
- *Activating the `progressMarked + progressTrackId` persist path* — it targets
  the vestigial store; the panel store is the real one.
- *A true in-dialog momentum-vs-progress choice for Explore a Waypoint* — the
  strong hit auto-marks progress (dropping the contradictory baked-in
  `momentumChange:2`), with +2 momentum offered in the card text. A real toggle
  shares the **dormant combat `progress` suffer option**, so wiring it properly
  is a cross-cutting suffer-dialog change beyond this cluster.
- *Populating `currentWaypoint`* — redundant with the progress-track context the
  assembler already injects (the track's label is the destination); the field's
  semantics are underspecified, so it stays unused until a concrete consumer
  defines them.
- *One-click "Make a Discovery / Confront Chaos" buttons on the Explore result*
  — the chained moves already work when typed/suggested; a button needs a
  programmatic move-dispatch path (its own piece of work).
- *XP-on-box-completion for the legacy marks* — mirrors the existing `!bond`
  handler (raw tick add, capped 40); the Earn Experience box accounting is a
  pre-existing gap shared with bonds, not introduced here.

**Where:** `src/moves/expedition.js` (`applyExpeditionProgress`,
`finishExpedition`, `selectExpeditionTrack`, `legacyRewardTicks`); resolver
consequence flags (`expeditionProgress` / `legacyMark` / `finishExpedition`);
`interpreter.expeditionRank`; pipeline handlers + feedback cards in `index.js`;
`progressTracks.completeProgressTrack`. Tests: `tests/unit/expedition.test.js`.

---

## Speaker resolution: token selection first, PC-validated (2026-06-10)

**Decision:** `resolveSpeakerActorId` honours Foundry's native "speaking as"
mechanism as the top-priority signal — `message.speaker.actor` (v13
`ChatSpeakerData`, stamped from the user's controlled token by
`ChatMessage.getSpeaker`) wins **when it resolves to a player character** —
before the author's bound `User.character`, the ownership scan, and the
campaignState fallback. Non-PC speakers (a selected starship, an NPC card —
`character` actors carrying the module `entityType` flag, FOLDER-002) fall
through to author-based resolution rather than being attributed.

The resolved speaker reaches every narrator path (move, paced, `@scene` —
which previously discarded its options entirely), the user message labels
the input with the speaker's name plus an attribution rule, and a PARTY
section (rendered only with 2+ PCs) lists the roster with the current
speaker marked.

**Reason:** first multiplayer playtest — the narrator couldn't tell who was
speaking. Token selection is the explicit, per-message statement of intent
Foundry players already use, and the maintainer requested it as the signal.
The original `speaker.js` docstring framed token-selection as a player
workaround and went author-based only; this supersedes that framing.

**Rejected:**
- *Trusting `message.speaker` unconditionally* — live playtest showed chat
  attributed to "Ship" when the ship token was selected; unvalidated
  speakers would attribute narration to vessels and NPC cards.
- *Alias-based matching* (`speaker.alias` → name lookup) — the actor id is
  authoritative and already present; alias is display-only.
- *Per-user setting* — Foundry's existing token/character binding already
  expresses the preference; no new configuration surface.

**Verification:** v13 `speaker` shape documented in
`docs/foundry-reference/foundry-api-reference.md` (ChatMessage section) with
provenance from the pinned foundry-ironsworn source; live Quench assertions
pin `getSpeaker({actor})` round-tripping the id and the non-PC fall-through.

---

## Ship position: a sector-map token is authoritative when present (2026-06-12)

**Decision (maintainer, v1.7.10 playtest):** when a command-vehicle token
sits on a sector Scene, the map IS the position statement — placement and
off-pin repositions write the §20 position record from the token's actual
coordinates (`createToken`/`updateToken` hooks in `sectorSceneHooks.js`:
nearest settlement pin within 3× snap radius → "near <settlement>", else
"deep space"). When no token exists, fiction-side fallbacks apply: the
inciting incident must emit a starting `ship/position` sidecar change, and
an empty record injects an explicit "not yet established — do not invent"
guard line into the narrator prompt rather than silence.

**Reporter's framing (verbatim):** *"The token was positioned on the sector.
In that instance, it's position should be known. It sounds like there is a
missing hook for placing it on the sector, that then populates the value. If
it isn't on the sector, then the above fallbacks sound great."*

**This refines (does not reverse) Cluster C's "the map follows the fiction":**
both directions now write, disambiguated by provenance — fiction-side writes
sync the token (existing), token-side writes record position
(`updatedBy: "scene_token"`), and every programmatic token move carries the
`POSITION_SYNC_OPTION` update option so the hooks never mistake the module's
own syncs for player statements (without it, the sync's own update would
re-enter the drag handler and dispatch a duplicate set_a_course).

**Boundary kept deliberately:** dropping the token ON a pin (snap radius)
still routes through the Set a Course move — travel under stakes costs a
roll; an off-pin drop is a position note with no move mechanics. The radius
split is the predictable rule for which is which.

**Rejected:**
- *Snap-back on off-pin drags* — punishes the common "park the ship near X"
  gesture and leaves the record empty.
- *Treating the token as a pure mirror (status quo)* — guaranteed the
  narrator and the map could both be confidently wrong in different
  directions, which is exactly the playtest failure.

---

## NPC cards pin the Starforged character sheet (2026-06-12)

**Decision:** every NPC-card Actor the module creates carries
`flags.core.sheetClass = 'ironsworn.StarforgedCharacterSheet'`
(`STARFORGED_CHARACTER_SHEET` in `connection.js`), and a ready-time repair
pins existing cards that have no explicit override. foundry-ironsworn's
default sheet for `character` actors is the **classic Ironsworn** sheet
(`makeDefault: true` in vendor `src/index.ts`); the system's own Starforged
create-dialog pins the override per actor, and we must do the same. This is
not cosmetic: the classic sheet's Notes tab binds `system.biography`, so the
seeded portrait + narrator intro (written to `system.notes`) render nowhere
on an unpinned card (v1.7.10 findings F1/F4). Cards a GM deliberately
re-sheeted are left alone; PCs are never touched (entityType flag gate).

---

## NPC identity is established once and propagated (pronouns) (2026-06-13)

**Decision (v1.7.11 playtest E/F):** an NPC card establishes its **pronouns**
once, at seed time (`pickConnectionPronouns` → record `pronouns` + the sheet's
`system.pronouns`), and that single value drives every downstream surface: the
portrait prompt (`pronounsToPortraitDescriptor` → "a woman/man/person" leads the
art description), the seeded Notes prose, the narrator entity card
(`CANONICAL_FIELDS_BY_TYPE.connection` now lists `Pronouns`), and the audio NPC
voice (`pronounsToVoiceKey` → the feminine/masculine/neutral voice settings).

**Reason:** without an established gender, the art model, the narrator, and the
audio layer each invented one independently and disagreed (male-presenting
portrait, "her" in prose, a male voice). The fix is one source of truth, not
three coincidentally-aligned guesses — the same "facts with homes get defended"
principle as the narrator-memory work.

**v1.7.13 follow-up (playtest I/R — two propagation gaps closed):**
- *Art (I):* leading the portrait *source description* with the descriptor was
  not enough — a single mid-prompt mention was diluted by strongly-gendered
  "first look" oracle text. `buildEntityContext` (`src/art/promptBuilder.js`)
  now **reinforces** the descriptor at the end of the prompt for connections,
  reusing the same `pronounsToPortraitDescriptor` so both mentions stay in sync.
- *Vignettes (R + sibling):* the `session_vignette` narrator mode injects no
  entity cards, so pronouns must ride in the user-message hint. The end-session
  NPC hint (`composeConnectionHint`) and the begin-session absent-crew summary
  (`summariseAbsent`) now lead with `Pronouns: …`. Leading guarantees survival
  of the hint's length truncation.

**Rejected:**
- *Per-segment speaker identity in audio* — the `<npc>` markup carries no
  identity, and audio is applied per-card. The focal-connection heuristic
  (single matched connection → its voice; ambiguous → default) covers the
  common case without a narrator-prompt change; multi-NPC-per-card remains a
  documented limitation.
- *Forcing androgynous art for they/them* — "a person" lets the model choose;
  only she/he bias the render.

---

## Post-roll "improve the result" affordance (2026-06-13)

**Decision (v1.7.11 playtest G):** assets that improve a result *after* the roll
at a cost (Fugitive: "improve the result to a strong hit, then fill a clock")
get a post-roll button on the move-result card, modelled exactly on Burn
Momentum (`src/moves/improveResult.js`). The pre-roll ability scanner stays
pre-roll (it folds `+N` adds before the dice); this is its post-roll
counterpart. The cost is the ability's own per-ability clock
(foundry-ironsworn `AssetAbilityField` `hasClock`/`clockTicks`/`clockMax`),
advanced one segment on use.

**Reason:** the scanner correctly *highlighted* Fugitive pre-roll but there was
no way to act on the dice afterward — the reporter could see the ability but not
adjust the result. Burn Momentum already proved the post-roll pattern
(re-resolve → re-narrate → supersede → re-persist); reusing it keeps one mental
model for "change the result after the roll."

**Scope (kept bounded, matching burn):** non-progress moves only; only an
explicit "improve … to a strong hit" phrasing triggers it (never adds/reroll
abilities); offered only when the rolled outcome is below a strong hit. The
asset clock is advanced mechanically when present; a non-clock cost is surfaced
as a card note for the player to apply.

---

## Sector scene padding: never zero (2026-06-13)

**Decision (v1.7.11 playtest D):** sector scenes set `padding: 0.1`, never `0`.
Padding is the camera's pan/zoom slack; `0` traps the camera at the image edge
(zoom in works, but no pan and no zoom-back-out to the full map). The scene also
captures an `initial` view (centred, fit-scale ≤ 1) so loading or resetting
returns to the whole-map overview. The black padding buffer is invisible
against the starfield background, so the "edge to edge" aesthetic the `0` was
chosen for costs nothing to drop.

**Refinement — placeables MUST be offset by the scene-rect inset (2026-06-15,
v1.7.14, PLAYTEST-1712 A):** turning padding on has a non-obvious consequence
that bit two releases. With `padding > 0` Foundry centres the background (the
"scene rectangle") inside a *larger* canvas at `(sceneX, sceneY)`, but
embedded-document coordinates (Notes, Drawings, Tokens) are absolute from the
**padded-canvas top-left** — so a pin placed at raw `gridX*size` lands
`(sceneX, sceneY)` px up-and-left of the background, out in the black void.
`createSectorScene` therefore reads `scene.dimensions` (Foundry's authoritative
`BaseGrid#calculateDimensions` result, via the `sceneRectOffset` helper) and
adds `(sceneX, sceneY)` to **every** placeable coordinate. The initial-view
centre is then set **explicitly** to `(sceneX + sceneWidth/2, sceneY +
sceneHeight/2)` from the same offset — we do **not** rely on Foundry's default
centring (the camera-geometry note flags it as unverifiable, and a stale API
doc describes the default as the scene *top-left*, not its centre).

This is the correct fix for finding A. The v1.7.13 attempt mis-diagnosed it as
a pure camera bug: padding was never the regression, and the placeables were
never offset — v1.7.13 only moved the camera to the true scene-rect centre,
which *de-aligned* the view from the still-cornered content and made it look
**worse** ("completely off the map"). When changing padding or any sector-scene
geometry, keep the placeable offset and the camera centre derived from the same
`sceneRectOffset(scene, …)` so they cannot drift apart again.

---

## Asset consequence riders are auto-applied (LLM-extracted) (2026-06-13)

**Decision (v1.7.11 playtest follow-up):** asset effects that change a player's
resources as a result of a move's outcome — "take +1 momentum on a strong hit",
"suffer -1 supply", "mark progress on a hit", "choose one: +1 health or +1
momentum" — are applied automatically so the player never manipulates meters by
hand. The effects are read out of the free-text ability descriptions by a
single Haiku extraction pass (the Foundry asset model has no structured effect
data, and the phrasings are too compound/conditional for regex). Optional
("you may"), "choose one", and ambiguous-progress riders prompt first;
everything else applies silently. Full design: `docs/moves/consequence-riders-scope.md`.

**Reason:** the maintainer's directive — "the user shouldn't have to manipulate
stats or resources." The module already auto-applied the unambiguous hooks
(pre-roll adds, stat substitution, post-roll improve); riders were the
remaining manual surface. ~146 of the 93 assets' ability blocks carry a rider
phrase, so manual application was a constant tax.

**Safety stance (load-bearing):** a wrong auto-apply silently corrupts game
state, which is worse than the manual status quo. Extraction is conservative
and every rider is validated (known resource, small integer amount, known
condition); on a missing key, parse failure, or transport error the pass yields
nothing and the ability text is surfaced as before — the module never applies a
guess. Writes are GM-gated (PERSIST-001); a `riders.autoApply` world setting
(default on) disables the feature.

**Rejected:**
- *Regex extraction* — the phrasings ("on a strong hit with a match", "you
  may", "choose one", compound "add +1 and take +1 momentum on a hit") are an
  NLP problem; regex would misparse and silently misapply. The user chose LLM
  extraction.
- *Auto-marking progress without a picker* — which track is genuinely
  ambiguous for most moves, so progress auto-marks only the single-track case
  and prompts otherwise (the user's choice).
- *A full per-asset rules engine for every effect (rerolls, ammo, roll-adds)* —
  out of scope; those stay surfaced or handled by the existing pre-roll
  scanner. The module assists; it isn't a complete automation engine.
