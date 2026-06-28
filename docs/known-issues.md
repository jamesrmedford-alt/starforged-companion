# Starforged Companion — Known Issues

Open bugs, workarounds, and items pending resolution. Update this file as
issues are resolved or discovered.

_Last audited against the code at v1.6.0 (2026-05)._

---

## Active issues

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
(see the v1.7.27 write-gate hardening).

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

---

### SAFETY-002 — Safety settings not reaching assembler ✓

**Resolved in:** Post-session-3 hardening

**Fix:** `syncSafetyToCampaignState()` added to `settingsPanel.js`. Runs
on every write to Lines/Veils/Private Lines and on the `ready` hook. Bridges
`game.settings` storage to `campaignState.safety` which the assembler reads.
