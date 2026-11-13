# Exploration flow — as implemented

A stage-by-stage map of the travel/exploration lifecycle as the code actually
implements it, verified against source (post-PR #257). File references name
the owning function; line numbers drift, so search by symbol. Sibling docs:
`combat-flow.md`, `vow-flow.md`, `connection-flow.md`.

Cross-cutting: consequence writes are GM-gated per branch; expedition state
lives in the Starforged Progress Tracks journal flag (`type:"expedition"`).
The move interpreter learns the open tracks from the same live stores
(`buildContextSummary`, `src/moves/interpreter.js`): the open vow Items on the
PCs (owner-tagged when there is more than one PC) and the open non-vow tracks
in the Progress Tracks journal, so an open expedition is named to it for
`finish_an_expedition` targeting. (It once read
`campaignState.progressTrackIds`, which nothing wrote, so it was never told
about any track; that field and the dead `consequences.progressTrackId`
mark-progress route in `persistResolution` were deleted in the 2026-10
audit.)

## 0. World seeding — sites exist before any travel

Sector generation (`generateSectorSites`, `src/sectors/precursorSites.js`)
rolls precursor vaults + derelicts (region-scaled count + one trouble-themed
bonus), stamps them `status:"unexplored", discovered:false`, lays them out in
`sector.mapData.discoveries[]` anchored to a frontier settlement, and creates
each as a `canonicalLocked` `location` Actor. On the sector scene they render
as a dim **"Unexplored Site"** pin behind a faint dashed "undiscovered
passage" drawing.

A destination the story names without a proper name joins them in play
(issue #348 PT07): the Undertake an Expedition that begins a track for a
label naming no site and no tracked place
(`index.js` `applyOutcomeEffects`) records it with
`siteDiscovery.recordUnchartedDestination` — a `location` Actor (status
unexplored; its name the label written as a name, `nameMatch.generatedName`:
"the corridor" → "Corridor", issue #354 P2-18), a discovery record of type
`uncharted` with `workingLabel: true`
on the active sector's `mapData.discoveries` (the next periphery slot,
`sectorGenerator.layoutDiscovery`; on the pipeline's working copy, which its
persist saves — an upgrade saves `sectors` at once) and its pin
(`sceneBuilder.addSiteToScene`) — and links the track's `siteId` to it. From
there it is a site like any other: §3's finish arrives there and §4's reveal
charts it, under the location's name (the GM may rename it; the Site
Discovered card says so). With no active sector nothing is recorded.

## 0.5 Reading travel — which move, to where (issue #348 PT05, PT06, PT08)

- **Classifier** (`src/pacing/classifier.js`): the CURRENT SCENE lists the
  charted places (tracked settlements, planets and locations, the active
  sector's first, no unexplored site). TRAVEL TO AN UNCHARTED DESTINATION:
  travel intent toward anywhere else is at least NARRATIVE_WITH_MOVE_AVAILABLE
  with `undertake_an_expedition`, hazard or not. A TIME SKIP IS NOT DOWNTIME:
  "wake me when we get there" across a journey not yet made is travel. (PR
  #350 gave it the recent scene, so "her coordinates" are read as the
  destination the scene set up.) Prompt rules only — the model decides.
- **Interpreter** (`src/moves/interpreter.js`): Set a Course is a known route
  to a charted place; Undertake an Expedition any journey toward one that is
  not. A destination without a proper name is named by a working label
  ("Archer's rendezvous — the gap").
- **Pipeline** (`movePipeline.readMove`, `src/moves/travel.js`): a forced
  travel move with no destination (a paced card's Roll — the move alone)
  reads it and its stat from the line and the recent scene
  (`readForcedTravelDestination`; an Undertake an Expedition only with none
  open — with one open it continues it). A Set a Course naming none takes the
  scene's destination — the uncharted destination recorded last
  (`sceneDestination`). A Set a Course whose destination is not a charted,
  known place (`chartedPlaceFor`: the arrival's own name resolver, never an
  unexplored site) is **read as Undertake an Expedition on every Mischief
  setting** (`rerouteUnchartedCourse`; maintainer decision): the confirm
  dialog's rationale and the move card (`resolution.courseRerouted`) say why,
  and the dialog's Cancel lets the player re-word. A course named by its pin's
  Actor (the token drag) is to a charted place and stays.

## 1. Setting out

- **`set_a_course`** (a known route to a charted place — §0.5): strong hit +1
  momentum ("Arrived, situation favors you"), weak hit arrives with a suffer
  choice, miss routes Pay the Price. On a non-miss the pipeline treats it as
  **arrival**: `maybeUpdateShipPositionFromName` writes the ship-position
  flag on the command vehicle and the sector-scene token syncs (its `report`
  says whether the token moved). Whatever Ship Positioning says, the narrator
  is told: the MOVE OUTCOME gains `[ARRIVAL: The ship has ARRIVED at <place>.
  Open the scene there …]` — a strong hit's favouring the crew, ending on
  something unresolved there (`arrivalNarratorLine`; issue #348 PT08: it got
  "Arrived" with no place and narrated a launch) — for every narration of the
  resolution (the pipeline's, a round's, an upgrade's re-narration); Finish an
  Expedition's arrival too. The **Set a Course resolved** card names the
  place (the arrival's, else the destination's words) and says "Token moved"
  only when the token moved; a place no pin marks says so, and no position
  written (none named, no command vehicle) points to `!at` (PT09). It is
  posted after the roll card it summarizes — `applyOutcomeEffects` returns it
  in `afterMoveCard`, which `rollMove` posts after `postMoveResult`; an
  upgrade's posts at once (PT10).
- **Token-drag affordance**: dragging the command-vehicle token onto a
  settlement pin cancels the drag and posts a forced `set_a_course` naming
  the pin's settlement Actor (`flags.actorId`): its current name as
  `forcedMoveTarget`, its id as `forcedMoveTargetId` (a legacy pin with no
  linked Actor uses its label; the `tokenDragSetCourse` payload now carries
  only the scene, token and pin coordinates). The pipeline reads that payload
  through `checkedTokenDragCourse`: a sector Scene, the command vehicle's
  token on it and a settlement pin's coordinates, else it is dropped and the
  move is an ordinary Set a Course — a chat flag any user can write, it made
  the GM's client move any token on any Scene to any point (issue #347
  AB23). On a non-miss the arrival
  records the ship position by that id (`inferShipPositionFromEntityId`,
  source `scene_token` → "docked at") and the current location by it, and the
  token snaps to the pin — the pin's label went stale on a rename, so the
  arrival resolved nothing by it, or a namesake in another sector (issue #321
  U52). A settlement Actor's rename renames its settlement pins on every
  sector scene (`handleSettlementPinRename`, canonical GM; not its planet or
  site pins). Gated by `factContinuity.shipTokenEnabled`, and — since the
  arrival needs both — by Ship Positioning and Auto-Move Ship on Set a Course:
  with either off the drag is a plain token move (with positioning on, a
  position note, no roll), where it used to roll Set a Course and leave the
  ship in place (issue #321 U54). A drop on a **site** pin is never a Set a
  Course — sites are reached by expedition — but a charted site's pin is a
  position anchor both ways (issue #335 Y14): the token parked on or near it
  records the site's location Actor (`nearestLocationId`, read "near" it),
  and an arrival recorded at a site moves the token onto its pin (§2). An
  undiscovered pin names no place from the token side ("deep space"); the
  sync follows a record that already names its site, since the Finish an
  Expedition that charts a site records its arrival before the reveal flips
  the pin.
- **`undertake_an_expedition`** (perilous/unknown): strong/weak hit →
  `applyExpeditionProgress` resolve-or-creates the expedition track (label =
  destination, rank = interpreter's `expeditionRank`, default dangerous) and
  marks one rank-step. A new track is begun only when no expedition is open
  or the move names a destination none of the open ones matches — by name
  alone: the one open expedition is not taken for a new destination
  (`selectExpeditionTrack`'s `soleFallback: false`; FRAY-SOLE-FIGHT-FALLBACK
  — it was marked instead); naming none
  while two or more are open, the pipeline posts a **Which expedition?** card
  before rolling (`postWhichFightCard` with `trackType: "expedition"`, whose
  pick relays `whichFight.pick` — one of the card's tracks, the roller's
  player or a GM, claimed once on the card — and posts the move again with
  that track's id as the roller; known-issues PACED-ROLL-OPEN-PRESS), and a track named by id
  that is over marks nothing (`reason: "ambiguous" | "gone"`) — an unnamed
  Undertake used to begin a phantom "Expedition" that took the progress
  (issue #321 U16). An expedition serves a vow when it is linked to one
  (issue #353 R3): in the Progress Tracks panel's add form, or on its row
  (🔗) — the only place for one this move began; the canonical GM stores the
  vow's `linkedVowId` and `linkedVowName`, and the link makes it the vow the
  narrator's scene line names (`vow-flow.md` §3) and the "serves" of the
  Session panel's What's open. Nothing else reads it: finishing a linked
  expedition marks no milestone by itself — the player's ⚑ does. The
  progress card shows boxes filled and carries a
  **"🗺 Finish the Expedition (n/10)"** button — labelled with the progress
  it rolls with, and shown muted (`sf-followup-btn--early`) under
  `EXPEDITION_FINISH_READY_BOXES` (4), where a finish misses more often than
  not (issue #354 P2-14) — its forced move names the track by
  id and speaks as the PC who marked the progress (the card's `actorId`,
  issue #329 X05). The press relays `expedition.finish`
  (`cardActions.applyFinishExpeditionAttempt`): the canonical GM claims the
  card once (`expeditionFinishAttempted`), and only that PC's player or a GM
  may press it — it posted from the presser's client, so a crewmate finished
  another player's expedition (issue #338 D1). Deliberately **not** an
  arrival move — no position write mid-journey. A hit's narration is seeded
  with the waypoint it reaches: the active sector's region's Space Sighting,
  rolled once by the resolver (`buildOracleSeeds`, issue #353 Phase 0). A weak
  hit's "Peril at the waypoint" pick rolls Spaceborne Peril, posts it, and the
  narrator plays it at once as its own beat (`sufferDialog.js`
  `postChosenComplication` → the oracle follow-up) — its card only promised
  that the narrator would "surface" it. That peril is the open expedition's
  plan's next danger when one is planned (issue #353 Phase 3). An expedition
  the move begins asks its narration to plan it — `expeditionPlanRequest`
  (resolver.js) on `resolution.skeletonRequests`, from `applyOutcomeEffects`'
  `result.created`: its waypoints (clues), the danger along the way
  (escalation) and what waits at the end (truth), about the track by id, in
  play while the track is open; the Finish an Expedition that completes it
  narrates with it (`resolution.endingTrackIds`) and is told to reveal the end.
  The Progress Tracks panel marks a planned expedition's row with the GM-only
  ◆ (`secrets.plannedSubjects`, Phase 4). Make a Discovery and Confront Chaos
  ask their narration for a `discovery` plan from their rolls (less any
  price — `skeletons.planRequestsFromSeeds`), keeping what the find means
  (Phase 4).
- **Upgrades**: a Set a Course miss burned or improved to a hit arrives (the
  ship record, `currentLocationId`, the feedback card), and an Undertake an
  Expedition miss upgraded marks the expedition as a rolled hit would — the
  pipeline's branches above are one applier (`applyOutcomeEffects`,
  `src/index.js`) that Burn Momentum and Improve Result run for what the
  upgraded outcome adds over the recorded original (issue #313,
  UPGRADE-PIPELINE-EFFECTS). An upgrade saves its own location and legacy
  mark; no persistResolution follows.
- **`!reveal-site <name>`** (GM): manual site discovery — same reveal flow as
  §4.

## 2. En route

- **`explore_a_waypoint`**: strong hit → a one-pick choice between "mark
  expedition progress" and "+2 momentum" (executed by the suffer executor on
  the expedition the move explored, resolved at the roll — the open one its
  target names, else the sole open one — and carried on the choice card as
  `expeditionTrackId` (`movePipeline` `waypointExpedition`): that one, or
  nothing once it is over or gone, never the sole open one at click time
  (DELAYED-CHOICE-IDENTITY); a card that names none resolve-or-creates at
  click time: with no open expedition it begins a default dangerous one and
  marks it, WAYPOINT-PROGRESS-NOOP fix; several open → visible warn); weak
  hit +1 momentum; miss routes Pay the Price
  (`routePayThePrice` — the card, its suffer route, the tension clocks; it
  said so in text only until issue #321 U17, WAYPOINT-MISS-NO-PTP) — except
  a miss with a match, where the player may instead Confront Chaos, so the
  price is their choice and is not routed.
  Strong-hit-with-match seeds a "notable aspect" prompt into the narrator
  prompt and offers **🔭 Make a Discovery** on the result card;
  miss-with-match offers **🌀 Confront Chaos**. Neither table is rolled for
  the waypoint's own narration — the button's forced move rolls it, once
  (issue #326 W47: the waypoint seeded its own roll, so the two narrations
  told two different discoveries). The match's alternative is *instead* of the ordinary result: one
  claim per card (`waypointRewardClaimed` on the GM-authored move card,
  written on the canonical GM by the `waypoint.oracle` relay —
  `cardActions.applyWaypointOraclePick`, which posts the forced follow-up as
  the roller (`actorId`; `deferWhileBusy`, so it is held, not dropped, while
  another move holds the lock — issue #325 W02 — or before a session has
  begun, until one does — issue #329 X14) and retires the pending
  ordinary choice card (stamped `retiredBy`; when the alternative is then
  not rolled, the card's claim is handed back and the ordinary cards come
  back live — `resultUpgrade.reopenRetiredChoiceCards`, issue #347 AB06) — or by
  the ordinary pick, `resultUpgrade.closeUpgradesForChoice`; issue #316 T06).
  The follow-up is a no-roll move (`rollKind: "none"` — no dice, no outcome,
  no Burn / Improve; T05) whose `legacyMark` marks the discoveries legacy,
  which clears at its tenth box (T02).
- **Location tracking**: `!at <name>` writes BOTH
  `campaignState.currentLocationId/Type` and the ship position (a bare `!at`
  clears the current location only; the ship stays where it is — issue #342
  Z74), and since the LOCATION-DUAL-STORE fix the arrival block does
  too — a tracked destination reached by move updates `currentLocationId`
  via the same resolver (a token-drop arrival by the pin's Actor id first,
  `currentLocationForEntityId` — issue #321 U52), and the ship docks at
  that pick by its id, as `!at` does: each store had its own resolver, so a
  fragment ("Bleak") made Bleakhold the current location by the name
  resolver's prefix rung while the ship's position, which takes a full name
  or a name part, was the free text "Bleak" and its token stayed put
  (known-issues ARRIVAL-FRAGMENT-SHIP-FREE-TEXT). When neither the id nor
  the name resolves, the current location is the place the position record
  the arrival just wrote names (`maybeUpdateShipPositionFromName`'s return —
  its location, else settlement, else planet): the position's word scan finds
  "Bleakhold" in "the expedition to Bleakhold", the name resolver then only a
  place whose name held the whole label, so the ship docked there while the
  current location stayed where the crew set out (known-issues
  ARRIVAL-LOCATION-PHRASE-SPLIT; since issue #345 AA23 the resolver's last
  rung is whole words either way, which finds a place named in words around
  it too — the position's scan still adds a name part, "Kovash" for the
  Kovash Hulk). A record that names no place (free text) leaves it. The Entities panel's "Set as
  current location" moves the ship as `!at` does — the shared
  `maybeUpdateShipPositionFromName`, source `at_command`, with the entity's
  id (`{ entityId }`) — so the narrator no longer gets two locations (issue
  #321 U56). `!at` and the panel button write a copy of the stored
  campaignState, so a refused write leaves the GM's cache as it was (U58).
  `!at` docks the ship at the place it resolved, by that place's id — it was
  re-inferred from the typed name, so a fragment ("Bleak") was free text
  (known-issues AT-PARTIAL-NAME-SHIP) — its pick is the exact name, a name
  it begins ("Bleak"), then one name inside the other as whole words, either
  way (W30's rule: the raw substring rung found "home" inside "Rockhome", and
  a Set a Course or `!at` "home" docked the ship there — issue #345 AA23) —
  and every resolver by name
  (`resolveCurrentLocationName`; `inferShipPosition`'s index, for the
  narrator's ship / position too; and since issue #345 AA06 the narrator's
  roster, `collectAllEntities` — its sidecar subjects, relevance and a scene
  fact's place) takes the active sector's namesake first,
  as the site ladder does (U48): generated site names repeat across sectors,
  and the older sector's derelict became the current location, the ship's
  position and its token's place on that sector's map (issue #342 Z15).
- **Narrator awareness**: the §6.5 ship block renders `COMMAND VEHICLE` +
  `SHIP POSITION` lines — every arrival recorder writes only after arrival,
  so those sources read as stationary ("docked at" / "in orbit of";
  SHIP-TRANSIT-LINE fix — `set_a_course` used to say "in transit to" a place
  the ship had reached); a token's own place on the map (placed, auto-placed
  or moved off a pin, source `token_placement`) reads "near" its nearest pin,
  a settlement's or a charted site's (issue #321 U53 — it was `scene_token`,
  "docked at"; the site's since issue #335 Y14; a placement recorded before
  U53 — `scene_token` with its pin's label as free text, which no arrival
  writes — reads "near" too, OLD-SCENE-TOKEN-DOCKED); with no position it explicitly instructs the
  narrator not to invent one. The token follows a recorded position onto
  the pin that anchors it — a settlement's, or a site's for a recorded
  location (`syncCommandVehicleTokenToPosition` reads `nearestLocationId`
  too: a Finish an Expedition, `!at`, Entities-panel, narrator or
  X-Card-restore arrival at a derelict left the token on the settlement it
  had left — Y14); a free-text position leaves it where it is. The X-Card's
  restore puts the token back where the removed narration's sync took it
  from (the record's `tokenBefore`), a spot no pin need anchor — deep space
  included (issue #342 Z12).
  Active expeditions appear only in the generic Progress Tracks context
  section (up to 4 active tracks) — no dedicated journey block.

## 3. Arrival and completion

`finish_an_expedition` is a progress move scored from the expedition track's
live ticks (`enrichProgressTicks`, see `decisions.md`). Three entry points:
typed narration, the Progress Tracks panel's Roll button (bridges with
`forcedMoveTarget = track.label` and `forcedMoveTargetId = track.id`), and the
progress card's Finish button — which since the EXPEDITION-FINISH-TARGET fix
forwards the card's own `trackLabel` as the target, and since issue #306 R06
its `trackId` too, so the right expedition finishes even with several open,
same-named ones included. A track deleted or finished before the roll resolves
rolls nothing (a "not rolled" card). Strong hit → `finishExpedition` completes the
track and pays `legacyRewardTicks(rank)` (weak hit one rank down) onto the
**discoveries** legacy; the finish card reports both. The legacy ticks, the
arrival's current location and the site reveal ride on the pipeline's working
copy into `persistResolution`'s write; when the world refuses it, each is a
step on the GMs' payoff failure card (`source: "persist"`) whose Retry applies
it alone (issue #331 X18). A refused meter write before it (the roller's
momentum) no longer stops that write: the arrival is saved and the meters
are the card's steps instead (issue #336 Y16). `finish_an_expedition`
is also an arrival move: the ship position writes with source `"expedition"`
("docked at …"). It arrives at the site the expedition was for — its track's
`siteId` link, else the unexplored site its label names
(`siteDiscovery.selectExpeditionSite`, never the sole-site guess) — by the
site's location Actor (`maybeUpdateShipPositionFromName`'s `{ entityId }` and
`currentLocationForEntityId`), so the ship record, its token (onto the site's
pin, §1) and `currentLocationId` follow the site the same move charts; the
crew names an unexplored site in their own words (its pin reads "Unexplored
Site"), so the label alone resolved to no place and all three stayed on the
settlement they had left (issue #342 Z14). An expedition for no site arrives
at the place its label names — the label of the expedition the move
completes, the track ladder's pick (`expeditionArrival`), then the line's own
words when the label names no tracked place (an expedition begun with no
destination named, `UNNAMED_EXPEDITION_LABEL`, names none): a typed finish
that named no destination, or named it in words of its own, completed the
expedition and left the ship, its token and `currentLocationId` where the crew
set out, read from `moveTarget` alone (issue #345 AA22); the Set a Course feedback card ("Course held cleanly (+1
momentum)") is Set a Course's alone (issue #326 W46). Miss leaves the track open and posts the recommit offer
(below, "Advisory-only branches"): its **🔁 Recommit** relays
`expedition.recommit` to the canonical GM (`cardActions.applyRecommitOffer`),
which claims the GM-authored offer card (`recommitted`) before running
`performRecommit` — once per card whoever presses (any user may), where every
press or re-render used to recommit again; a refused track write releases the
claim (issue #321 U20, which also folded the old raw `expedition.recommit`
socket relay into `GM_ACTIONS`). Either outcome is said to the presser
(`cardActions.tellRecommitOutcome`, issue #342 Z58): a refused write is
whispered to them and the GMs to press again, and an expedition finished or
deleted since gets a short card ("… is finished — nothing was recommitted").

## 4. Site discovery

`revealSectorSite` (shared by expedition-finish and `!reveal-site`):
`selectSectorSite` picks the target — the expedition's `siteId` link first,
then exact → whole-word substring → type-keyword vault/derelict → sole-undiscovered
(the finish passes `requireLabelMatch`: no sole-undiscovered rung, and the
pin's own "Unexplored Site" names the active sector's one unexplored site, so
an expedition to a settlement or a trailblaze charts nothing — issue #342 D7;
`!reveal-site` keeps the guess),
each rung over every sector before the next (the guesses only when
unambiguous: an earlier sector's sole site used to preempt a later sector's
exact match, issue #300 F07), the active sector first on every rung
(generated names repeat across sectors — issue #321 U48). A link, or an exact
name, resolves to that site or to nothing once it no longer qualifies
(already charted / cleared) — never a sibling a looser rung would find ("…II"
contains "…I"); a link to no stored site falls back to the label — flips `discovered:true`, marks the
location Actor `visited`, and restyles the scene — pin renamed to the site's
real name with the discovered icon, dashed passage → solid brightened route —
then posts the "◈ Site Discovered" card. The flag is saved onto the state as
it is after those awaits (`persistSiteFlag`, `src/sectors/siteDiscovery.js`;
to the store at its turn on the GM's campaignState write chain —
CAMPSTATE-CHAIN-REST),
never the state read before them, which reverted an X-Card or Take a Break
relayed meanwhile (issue #321 U06c); the pipeline's working copy gets it too.

## Verified defects (all FIXED in the v1.7.30 cycle — resolved ledger in `known-issues.md`)

Each entry below describes the pre-fix behaviour the audit verified; the fix
summary lives in the `known-issues.md` table and the code.

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

## Softer gaps — resolved or reaffirmed in the 2026-07 cleanup

- ~~Expedition→site linkage was name-fuzzy~~ — **addressed**: expedition
  creation stamps `siteId` when the destination confidently names an
  undiscovered site, or is the pin's own "Unexplored Site" and the active
  sector has exactly one unexplored site (issue #342 D7)
  (`selectExpeditionSite` — the finish's own ladder, `selectSectorSite` with
  `requireLabelMatch` over each site's name as the table knows it, its
  location Actor's; never the sole-undiscovered guess), and
  `revealSectorSite` reveals the linked site first. The stamp read only the
  records' generated names, so a site the GM had renamed was linked to
  nothing — or, its new name holding a type keyword ("The Ghost Spire", a
  vault), to the sector's one unexplored derelict, which the finish then
  charted and docked at (known-issues EXPEDITION-STAMP-SITE-NAME).
- ~~Advisory-only branches~~ — **addressed**: the finish-miss card offers
  **🔁 Recommit** (rolls the challenge dice, clears the lowest die's boxes,
  raises the rank — `planRecommit`; once per card since issue #321 U20, §3),
  and Explore a Waypoint match results
  carry one-click **🔭 Make a Discovery** / **🌀 Confront Chaos** buttons
  (`waypointOracleFor`); since issue #316 T06 a click relays to the
  canonical GM, which claims the card once (§2).
- **Rank is player-re-ranked — reaffirmed deliberate** (see `decisions.md` →
  "Flow-audit soft spots").
- **Arrival inference degrades to freeText — reaffirmed deliberate** (same
  decision entry).
- ~~The discoveries legacy accrued ticks without XP~~ — fixed with
  LEGACY-XP-DEAD (`addLegacyTicks` awards box XP module-wide).
