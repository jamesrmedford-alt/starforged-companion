# Exploration flow — as implemented

A stage-by-stage map of the travel/exploration lifecycle as the code actually
implements it, verified against source (post-PR #257). File references name
the owning function; line numbers drift, so search by symbol. Sibling docs:
`combat-flow.md`, `vow-flow.md`, `connection-flow.md`.

Cross-cutting: consequence writes are GM-gated per branch; expedition state
lives in the Starforged Progress Tracks journal flag (`type:"expedition"`) —
`campaignState.progressTrackIds` is vestigial and never written by
resolutions.

## 0. World seeding — sites exist before any travel

Sector generation (`generateSectorSites`, `src/sectors/precursorSites.js`)
rolls precursor vaults + derelicts (region-scaled count + one trouble-themed
bonus), stamps them `status:"unexplored", discovered:false`, lays them out in
`sector.mapData.discoveries[]` anchored to a frontier settlement, and creates
each as a `canonicalLocked` `location` Actor. On the sector scene they render
as a dim **"Unexplored Site"** pin behind a faint dashed "undiscovered
passage" drawing.

## 1. Setting out

- **`set_a_course`** (safe/familiar route): strong hit +1 momentum
  ("Arrived, situation favors you"), weak hit arrives with a suffer choice,
  miss routes Pay the Price. On a non-miss the pipeline treats it as
  **arrival**: `maybeUpdateShipPositionFromName` writes the ship-position
  flag on the command vehicle and the sector-scene token syncs.
- **Token-drag affordance**: dragging the command-vehicle token onto a
  settlement pin cancels the drag and posts a forced `set_a_course`
  (`tokenDragSetCourse` payload); on a non-miss the token snaps to the pin
  (gated by `factContinuity.shipTokenEnabled`).
- **`undertake_an_expedition`** (perilous/unknown): strong/weak hit →
  `applyExpeditionProgress` resolve-or-creates the expedition track (label =
  destination, rank = interpreter's `expeditionRank`, default dangerous) and
  marks one rank-step. The progress card shows boxes filled and carries a
  **"🗺 Finish the Expedition"** button. Deliberately **not** an arrival move
  — no position write mid-journey.
- **`!reveal-site <name>`** (GM): manual site discovery — same reveal flow as
  §4.

## 2. En route

- **`explore_a_waypoint`**: strong hit → a one-pick choice between "mark
  expedition progress" and "+2 momentum" (executed by the suffer executor);
  weak hit +1 momentum; miss routes Pay the Price. Strong-hit-with-match
  seeds a "notable aspect" + Make-a-Discovery oracle roll into the narrator
  prompt; miss-with-match seeds Confront Chaos — **advisory prose only**, no
  mechanical affordance.
- **Location tracking**: `!at <name>` is the only path that writes BOTH
  `campaignState.currentLocationId/Type` and the ship position; bare `!at`
  clears both.
- **Narrator awareness**: the §6.5 ship block renders `COMMAND VEHICLE` +
  `SHIP POSITION` lines — phrasing derives from `position.updatedBy`
  (`set_a_course` → "in transit to"; token/`!at`/expedition → "docked at");
  with no position it explicitly instructs the narrator not to invent one.
  Active expeditions appear only in the generic Progress Tracks context
  section (up to 4 active tracks) — no dedicated journey block.

## 3. Arrival and completion

`finish_an_expedition` is a progress move scored from the expedition track's
live ticks (`enrichProgressTicks`, see `decisions.md`). Three entry points:
typed narration, the Progress Tracks panel's Roll button (bridges with
`forcedMoveTarget = track.label`), and the progress card's Finish button
(**no target** — see defects). Strong hit → `finishExpedition` completes the
track and pays `legacyRewardTicks(rank)` (weak hit one rank down) onto the
**discoveries** legacy; the finish card reports both. `finish_an_expedition`
is also an arrival move: the ship position writes with source `"expedition"`
("docked at …"). Miss leaves the track open with recommit text (advisory
only).

## 4. Site discovery

`revealSectorSite` (shared by expedition-finish and `!reveal-site`):
`selectSiteForReveal` picks the target (exact → substring → type-keyword
vault/derelict → sole-undiscovered), flips `discovered:true`, marks the
location Actor `visited`, and restyles the scene — pin renamed to the site's
real name with the discovered icon, dashed passage → solid brightened route —
then posts the "◈ Site Discovered" card.

## Verified defects (open as of this audit — see `known-issues.md`)

1. **`set_a_course` tells the narrator "in transit" after arriving**
   (SHIP-TRANSIT-LINE): the pipeline, resolver text, and token sync all treat
   a non-miss as arrival, but `formatShipPositionLine` renders the
   `set_a_course` source as "in transit to" — the narrator asserts the ship
   hasn't arrived when it has.
2. **Arrival never updates the campaign's current location**
   (LOCATION-DUAL-STORE): moves write only the ship-position flag;
   `currentLocationId` (read by narrator options and the entity panel) is
   written only by `!at` / the entity panel — two "where are we" stores that
   drift the moment you travel by move.
3. **`explore_a_waypoint`'s progress pick can silently no-op**
   (WAYPOINT-PROGRESS-NOOP): the suffer executor marks progress only when
   exactly one open expedition exists and never creates one — pick "mark
   progress" with zero (or several) open expeditions and nothing happens.
4. **The Finish-the-Expedition card button loses the destination**
   (EXPEDITION-FINISH-TARGET): it posts no `forcedMoveTarget`, so with more
   than one open expedition the selector returns null → tick enrichment warns
   and the roll scores 0, nothing completes, no arrival write. The panel Roll
   bridge (which passes the row label) behaves correctly in the same
   situation.

## Softer gaps (recorded, not yet bugs-with-consequences)

- **Expedition→site linkage is name-fuzzy**: no stored key ties a track to a
  discovery; reveal-on-finish usually resolves via the type keyword or
  sole-undiscovered fallback, so with several undiscovered mixed-type sites
  the "wrong" site can reveal (or none).
- **Rank is first-write-wins**: inferred only at track creation; forced
  interpretations carry no `expeditionRank`, so a wrong initial guess governs
  mark size and the finish legacy until manually re-ranked in the panel.
- **Arrival inference degrades to free text** for narrator-invented
  destinations not yet in the entity index — the position line renders but
  loses planet/sector scoping and token sync.
- Advisory-only branches: waypoint Make-a-Discovery / Confront Chaos seeds,
  and the finish-miss "recommit" instruction — GM adjudicates by hand.
- The discoveries legacy accrues ticks but never converts to XP — see
  LEGACY-XP-DEAD in `known-issues.md` (module-wide).
