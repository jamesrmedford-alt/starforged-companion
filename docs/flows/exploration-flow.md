# Exploration flow — as implemented

A stage-by-stage map of the travel/exploration lifecycle as the code actually
implements it, verified against source (post-PR #257). File references name
the owning function; line numbers drift, so search by symbol. Sibling docs:
`combat-flow.md`, `vow-flow.md`, `connection-flow.md`.

Cross-cutting: consequence writes are GM-gated per branch; expedition state
lives in the Starforged Progress Tracks journal flag (`type:"expedition"`).
The move interpreter learns the open tracks from the same live stores
(`buildContextSummary`, `src/moves/interpreter.js`): the roller's open vows in
their SITUATION block (`moves/situation.js`, with rank and progress — the
other characters' by name, owner-tagged, at a table of several) and the open
non-vow tracks in the Progress Tracks journal, so an open expedition is named
to it for `finish_an_expedition` targeting. (It once read
`campaignState.progressTrackIds`, which nothing wrote, so it was never told
about any track; that field and the dead `consequences.progressTrackId`
mark-progress route in `persistResolution` were deleted in the 2026-10
audit.)

> **Since the switch (issue #384, slice 2):** one call reads a typed line — the line reader (`src/moves/reader.js`), told the speaker's sheet, the party, the fights with the speaker's position, the scene challenges, expeditions, the place and the frame (`src/moves/readerSituation.js`) and what can be made now (`src/moves/availability.js`, the move contracts after slice 4), and routed by code (`src/pacing/readAndRoute.js`). The pacing classifier and the move interpreter this paragraph names are retired; `interpretMove` is the reader's roll and chosen modes, and `constrainMoveToPosition` stays in `interpreter.js`.

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
on the active sector's `mapData.discoveries` (the first periphery cell no
site of the sector holds, `sectorGenerator.layoutDiscovery` — the next slot by
count wrapped the seventh site onto the first one's pin, issue #362 AC51; on
the pipeline's working copy, which its
persist saves — an upgrade saves the record onto its stored sector at once (`saveUnchartedSite`), and a refused save is a step on the upgrade's payoff card, whose Retry saves it (issue #362 AC49); when the world refuses
the persist, the record is a step on the GMs' payoff failure card, whose
Retry saves it — `siteDiscovery.saveUnchartedSite`: it was lost, and the
expedition's link named no stored site, issue #362 AC49; with no stored
sector by its id that Retry settles it once, and the site's reveal Retry
waits on it while it is live — `vow-flow.md`, "A payoff step that does not
land", issue #364 PAYOFF-RETRY-SITE-SECTOR-GONE) and its pin
(`sceneBuilder.addSiteToScene`) — and links the track's `siteId` to it. From
there it is a site like any other: §3's finish arrives there and §4's reveal
charts it, under the location's name (the GM may rename it; the Site
Discovered card says so). With no active sector nothing is recorded, nor for
a label that names a site already on the map — charted or not, by its
location's name or the working label its record keeps
(`siteDiscovery.siteNamedBy`): the expedition is linked to that site, so its
finish arrives there (issue #362 AC50 — after the GM renamed a charted
destination, a course by its old working label minted a second location,
record and pin for it). Whether a label names a tracked place is asked by
§0.5's rule for a destination — the place's name and little else
(`resolveCurrentLocationName(…, { asDestination: true })`) — and for an
expedition typed as one the journey's own words are little else too
(`journeyWords`; `nameMatch.placeNameAndLittleElse`'s `journey`: expedition,
journey and their plurals; to, toward, towards, for, into): "the expedition
to Bleakhold", "the Bleakhold expedition" and "a journey toward Bleakhold
Station" are for Bleakhold and record nothing; "the wreck beyond Bleakhold",
or "Archer's rendezvous — the gap" with a settlement Archer on the map, is a
new uncharted site — a preposition that places the destination beside the
known place (beyond, near, past, outside, off …) is what makes it another
place. It was asked the looser way — any label holding the name as whole
words — so nothing was recorded or linked for those, and the finish docked
at the settlement (issue #364 EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT). The
journey words at the label's edges, with the article that leads them, are
also taken off before the rungs that compare a label whole — a name it
begins, a fragment of a name (`nameMatch.withoutJourneyWords`), after the
whole label's exact rung: "the expedition to Bleak" is for Bleakhold, as
"Bleak" is, and "expedition to the gap" for a charted "Archer's Rendezvous —
The Gap". Compared whole, the first recorded a new uncharted site and the
second a second one (issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT). The
unexplored site a typed expedition is linked to is asked the same way
(`selectExpeditionSite`'s `journeyWords`): when the whole label names no
site, it is asked again without those words — "the expedition to the
Sunken" is for the unexplored "The Sunken Vaults", as "the Sunken" is;
compared whole it linked none, so its finish charted nothing (issue #364
EXPEDITION-JOURNEY-WORDS-SITE-LINK). The expedition a course is read as asks
as the course did. The site ladder also takes a name the label begins, as the
place resolver's start rung does — after the exact and whole-word rungs, the
label whole then without its journey words, and only when it begins one
unexplored site's name (two name neither; the active sector's asked first;
`selectSectorSite`'s `requireLabelMatch`, so the finish's arrival and reveal
ask it too): "the Sunk", "Sunk" and "the expedition to the Sunk" are for "The
Sunken Vaults". The ladder took no word cut short, so "the Sunk" — a place to
the resolver — linked nothing and recorded nothing, and its finish docked at
the vault and charted nothing; "Sunk" recorded a second destination for it
(issue #364 EXPEDITION-PREFIX-SITE-LADDER-MISMATCH). A label that begins
several unexplored sites' names is for the one at the place the resolver
reads it as — its start rung's pick, the active sector's first location, else
storage order: the one the finish docks at (`selectExpeditionSite`'s
`placeId`). The ladder named neither while the resolver picked one of their
locations, so "the Sunk", with "The Sunken Vaults" and "The Sunken Spire"
unexplored, linked nothing and recorded nothing, and its finish docked at one
and charted neither (issue #364 RESOLVER-AMBIGUOUS-PREFIX). A place that is
neither site's location — a settlement "The Sunken Hold" — names neither: the
finish docks there and charts nothing.

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
  reads it, its stat and its stakes from the line and the recent scene
  (`readForcedTravelDestination` — the stakes since issue #362 D11, as every
  forced move's stat reading; an Undertake an Expedition only with none
  open — with one open it continues it). A Set a Course naming none takes the
  scene's destination — the uncharted destination recorded last
  (`sceneDestination`). A Set a Course whose destination is not a charted,
  known place (`chartedPlaceFor`: the arrival's own name resolver, never an
  unexplored site) is **read as Undertake an Expedition on every Mischief
  setting** (`rerouteUnchartedCourse`; maintainer decision): the confirm
  dialog's rationale and the move card (`resolution.courseRerouted`) say why,
  and the dialog's Cancel lets the player re-word. A course named by its pin's
  Actor (the token drag) is to a charted place and stays; so is one named by
  the working label a charted destination's record keeps, its location
  renamed since — its `moveTargetId` the site's location Actor, which the
  arrival docks at by id (issue #362 AC50; the GM's `!at` by that label finds
  the site the same way — issue #364 AT-COMMAND-OLD-LABEL, § Location
  tracking). The course asks in `!at`'s order: a place called exactly what
  the destination says, then the charted site whose record keeps exactly that
  name, only then the resolver's looser rungs (a name it begins, one name
  inside the other as whole words) — they ran first, so with a settlement
  "Archer" on the map a course for the renamed site's "Archer's rendezvous —
  the gap" carried no `moveTargetId` and arrived at Archer (issue #364
  COURSE-OLD-LABEL-LOOSER-RUNG-FIRST). The same label while the site is still
  uncharted is the expedition either way: its location Actor carries the
  label, so the resolver's exact rung finds the unexplored site.
  **A known place's name inside the destination names that place only when
  the destination is the name and little else** — an article, a word for what
  kind of place it is ("Bleakhold Station", "the Bleakhold settlement"; the
  module's own words for a settlement, a location and a planet,
  `nameMatch.placeNameAndLittleElse`). A longer label is a new, uncharted
  destination: with Archer on the map and nothing recorded for the gap, a
  first course for "Archer's rendezvous — the gap" — or "the wreck beyond
  Bleakhold" — was a course to the settlement (issue #364
  COURSE-NEW-LABEL-CONTAINS-SETTLEMENT; a rule, the maintainer's decision).
  The course asks the resolver as for a destination
  (`resolveCurrentLocationName(…, { asDestination: true })`), and the
  expedition it is read as asks the same way before it records its uncharted
  destination (`resolution.courseRerouted`) — asked the looser way it
  recorded none, and its finish docked at the settlement. A fragment of a
  place's name ("Bleak", "the gap") still names it. An Undertake an
  Expedition typed as one asks by the same rule before it records its
  destination (§0), the journey's own words little else too
  (`{ asDestination: true, journeyWords: true }`): "the expedition to
  Bleakhold" is for Bleakhold, "the wreck beyond Bleakhold" a new site —
  asked the looser way, it was for Bleakhold (issue #364
  EXPEDITION-NEW-LABEL-CONTAINS-SETTLEMENT) — and taken off the label's
  edges before the start and fragment rungs: "the expedition to Bleak" is for
  Bleakhold (issue #364 EXPEDITION-JOURNEY-WORDS-FRAGMENT). The journey's
  words are not a course's: the course's question, and the expedition it is
  read as, ask without them. Not narrowed: the arrival by name (a place in
  the words around it, §3 — a finish's names lose their journey words as at
  the start) and the GM's `!at`.

> **Since the switch (issue #384, slice 2):** one call reads a typed line — the line reader (`src/moves/reader.js`), told the speaker's sheet, the party, the fights with the speaker's position, the scene challenges, expeditions, the place and the frame (`src/moves/readerSituation.js`) and what can be made now (`src/moves/availability.js`, the move contracts after slice 4), and routed by code (`src/pacing/readAndRoute.js`). The pacing classifier and the move interpreter this paragraph names are retired; `interpretMove` is the reader's roll and chosen modes, and `constrainMoveToPosition` stays in `interpreter.js`.

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
  Expedition's arrival too. A hit burned or improved to a strong hit arrived
  at the roll: its narration — the move's only one while the result was held
  — is told the ship ARRIVED at the place the roll did, in the strong hit's
  words, with no second docking (the card's `move.arrivalPlace`; issue #362
  AC06 — it was told "Arrived" with no place, PT08's prompt). The **Set a Course resolved** card names the
  place (the arrival's, else the destination's words) and says "Token moved"
  only when the token moved; a token that did not move says why — no pin
  marks the place, no ship token on the map, the ship token setting off, no
  map scene (the token sync's `tokenStayed`; it blamed a missing pin for all of
  them, issue #362 AC53) — and no position written (none named, no command
  vehicle) points to `!at` (PT09). It is
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
  AB23). A Batch Mode round reads it the same way when the drop is its
  roller's entry (`batch/driver.js` `forcedFromFlags` — the round copied it
  raw, issue #362 AC62). On a non-miss the arrival
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
  not (issue #354 P2-14). The button follows its track: the canonical GM
  redraws it on every Expedition card still to be pressed, from the track by
  its id, whenever the Progress Tracks journal's tracks change — a waypoint's
  mark (§2), a later Undertake, the panel's + and −, a cleared mark, a
  recommit, a GM's Retry — and at its load (`index.js`
  `redrawExpeditionFinishButtons` / `registerExpeditionCardSync`, the
  journal's `updateJournalEntry` hook, gated `isCanonicalGM()`). It was drawn
  once, at the post, so after a waypoint's mark the one Finish on the table
  read "(2/10)", muted as early, while the track held 4/10 (known-issues
  EXPEDITION-FINISH-COUNT-STALE); the card's content changes, so every client
  and a reload show the count. A card whose track is over or gone, or whose
  Finish was pressed, is left as it is, and its line about the mark it
  reported stays as written — its forced move names the track by
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
  plan's next danger when one is planned (issue #353 Phase 3) — the
  expedition the move marked, which its choice card names
  (`executorOpts.expeditionTrackId`, `movePipeline` `waypointExpedition`) and
  the peril's card carries (`oracleNarration.trackId` → `narrateOracleFollowup`
  `trackId` → `complicationStep`), else the most recently changed open one;
  never a finished or removed expedition's leftover plan, which the journal's
  page order handed it (issue #362 AC11). An expedition
  the move begins asks its narration to plan it — `expeditionPlanRequest`
  (resolver.js) on `resolution.skeletonRequests`, from `applyOutcomeEffects`'
  `result.created`: its waypoints (clues), the danger along the way
  (escalation) and what waits at the end (truth), about the track by id, in
  play while the track is open. The request's rolls — two waypoint sightings
  and an Action + Theme — are hidden: a held result's card and a Batch Mode
  round keep the request without them (`withoutHiddenRolls`), and the
  narration rolls them on the GM that narrates it (`withHiddenRolls`, issue
  #362 AC15); the Finish an Expedition that completes it
  narrates with it (`resolution.endingTrackIds`) and is told to reveal the end.
  The plan closes with the track (issue #362 D4): resolved when it completes
  (`completeProgressTrack`, the panel's Complete), retired when it is removed
  (`progressTracks.js` `closeTrackPlans` → `secrets.closePlansAbout`) — the
  finishing narration still has it in play (`skeletons.planInPlay`).
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
  mark; no persistResolution follows — a refused location write (or
  uncharted record) is a step on the upgrade's payoff card ("Upgraded result
  not fully applied"), whose Retry saves it: it was a console line (issue
  #362 AC49). The upgraded result is narrated in
  the roll's place, so it is asked for the plan the roll's narration was —
  an expedition the weak hit began (the card's `move.planRequests`, without
  their hidden rolls; issue #362 AC04): held, the burned result's narration
  is the move's only one; with holding off the plan the struck narration
  filed is taken back with it and asked for again; a round's upgraded entry
  carries it to the round's narration. A plan already filed about the track
  (the struck narration's fallback filed it unstamped) is not asked twice.
- **`!reveal-site <name>`** (GM): manual site discovery — same reveal flow as
  §4.

## 2. En route

- **`explore_a_waypoint`**: strong hit → a one-pick choice between "mark
  expedition progress" and "+2 momentum" (executed by the suffer executor on
  the expedition the move explored, resolved at the roll — the open one its
  target names, else the sole open one — and carried on the choice card as
  `expeditionTrackId` (`movePipeline` `waypointExpedition`): that one, or
  nothing once it is over or gone, never the sole open one at click time
  (DELAYED-CHOICE-IDENTITY); a card that names none reads the open ones at
  click time: the sole one is marked; with none open nothing is marked and
  none begun (`reason: "no-expedition"`, said on the card — overhaul 4, D6:
  it began a default dangerous "Expedition" whose name and rank nothing asked,
  WAYPOINT-PROGRESS-NOOP's fix); several open → visible warn). The move
  itself is made from an expedition, or at a site (a vault, a derelict): the
  move gate refuses an Explore a Waypoint with neither (`EXPEDITION_OR_SITE`,
  Undertake an Expedition offered — "When you divert from an expedition…"),
  and at a site with no expedition under way its strong hit's choice offers
  no expedition progress, only the +2 momentum (`movePipeline.js`
  `withoutExpeditionProgressWithNoExpedition` — still a pick, which a match's
  Make a Discovery can be taken instead of). Make a Discovery and Confront
  Chaos are made from a waypoint's match — the card's 🔭 / 🌀 alternative,
  whose forced move carries `fromWaypoint` (`FROM_A_WAYPOINT`, soft: typed
  alone, the line is narrated and told why; a GM may roll it anyway). The
  mark posts no card of its own: the expedition's card's 🗺 Finish is redrawn
  with the track's new count (§1, EXPEDITION-FINISH-COUNT-STALE) — a track
  with no card (made in the panel) has the panel's Roll.
  Weak hit +1 momentum; miss routes Pay the Price
  (`routePayThePrice` — the card, its suffer route, the tension clocks; it
  said so in text only until issue #321 U17, WAYPOINT-MISS-NO-PTP) — except
  a miss with a match, where the player may instead Confront Chaos, so the
  price is their choice and is not routed: the miss posts a choice card
  (issue #364 EXPLORE-WAYPOINT-MATCH-MISS-ADVISORY, decided — the choice
  card), **"Pay the Price: ‹the price›"** or **"Confront Chaos instead"**.
  The price is the one the narration is seeded with, rolled or read once at
  the roll (`resolver.rollChoicePrice` — the miss stated before the roll,
  else the one table roll; Sojourn's mechanism) and carried on the option
  (`withChoicePrice`, `priceInLabel`), so its pick pays exactly that one
  (`index.js` `payChosenPrice` — its card, its suffer move on the roller,
  the clocks). "Confront Chaos instead" is the move card's 🌀 pressed from
  the choice card (`sufferCard.js` `takeWaypointAlternative` →
  `cardActions.applyWaypointOraclePick`, nothing claimed on the choice card
  first). The narration used to be seeded "Pay the Price: …" by an advisory
  roll in `buildOracleSeeds` and told "it is what this miss costs" while
  nothing charged it short of a typed `!ptp`, which rolled another; that
  roll is gone — no miss is seeded a price that is neither routed nor
  offered. The resolution carries the choice (`priceChoice`: the price, and
  what may replace it), and its narration is told where it stands **when it
  is written** (`narrator.js` → `resultUpgrade.priceChoiceStatus` →
  `resolver.settlePriceChoice`; the obligations block's [price] line,
  `moves/contracts/obligations.js` — it replaced `stakes.js`
  `formatPriceChoiceBlock`, its words kept): a
  free-flow miss is narrated before its card is picked — *pending*: the
  price is offered, shown arriving, never "what this miss costs"; a held
  result's (and a Batch Mode round's) card posts before its narration —
  *paid* (the price picked: seeded and delivered as before) or *declined*
  (Confront Chaos taken: the price's seed lines go, and the narrator is
  told no price is paid).
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
  The ordinary choice is a strong hit's reward or a miss's price. The
  button is live as soon as the move card posts — before the move is
  narrated and recorded — so a choice card posted after the alternative was
  taken is posted retired (`persistResolution.resolveSufferPrompt` →
  `resultUpgrade.waypointAlternativeTaken`; issue #364): it was posted live,
  the reward or the price takeable on top of the alternative.
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
  Kovash Hulk, or one with no capital to write, "734" for Relay 734: issue
  #364 SHIP-SEED-NUMERIC-PART — and reads past a name that is not a place's,
  a person's, a ship's, a faction's or a creature's, to the first place
  named, the record that place's as when it is named first: "alongside
  Kael's tug at Bleakhold" is Bleakhold's, where the connection Kael Dros was
  the hit and the position named no place — issue #364
  SHIP-SEED-NONSPATIAL-HIT-FIRST; a seed that names no place, "alongside the
  Covenant flagship", stays free text, issue #321 U43 — and it reads a name
  of two or more words the seed holds whole before its words: a ship's or a
  person's words are no place's, a place's name is that place — "alongside
  the Bleakhold Runner" names no place, and "orbiting Kaan Deep" is Kaan
  Deep's: word by word they were Bleakhold and the planet Kaan, issue #364
  SHIP-SEED-PLACE-NAME-PREFIX-OF-SHIP). A record that names no place (free text) leaves it. The Entities panel's "Set as
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
  a Set a Course or `!at` "home" docked the ship there — issue #345 AA23).
  `!at` alone asks one more exact rung, after the exact name and before the
  looser ones (`resolveCurrentLocationName`'s `siteRecordNames`): the name a
  site's discovery record keeps — a charted destination's old working label,
  its location renamed since — resolved to the site's location by its id
  (`precursorSites.siteNamedExactly`); `!at ‹old working label›` found
  nothing while a Set a Course by it arrived (issue #364
  AT-COMMAND-OLD-LABEL; the course takes that step in
  `rerouteUnchartedCourse`, issue #362 AC50 — in the same place on the
  ladder, issue #364 COURSE-OLD-LABEL-LOOSER-RUNG-FIRST) —
  and every resolver by name
  (`resolveCurrentLocationName`; `inferShipPosition`'s index, for the
  narrator's ship / position too; and since issue #345 AA06 the narrator's
  roster, `collectAllEntities` — its sidecar subjects, relevance and a scene
  fact's place) takes the active sector's namesake first,
  as the site ladder does (U48): generated site names repeat across sectors,
  and the older sector's derelict became the current location, the ship's
  position and its token's place on that sector's map (issue #342 Z15).
  Since overhaul 2 (§6.4) a narration of play is a current-location writer
  too, the current location alone: a beat whose frame names exactly one
  recorded settlement, planet or location and whose player words name it
  ("I take the lift down to Hollow Spire") moves it there with the frame
  (`sceneLifecycle.js placeWalkedTo`; `place.arrived`, `how: "line"`) — the
  ship stays where its record says (D17). A Set a Course's beat walks
  nowhere: its arrival is the move's own (above). And only a beat of play's
  ship/position moves the ship (§6.3).
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
rolls nothing — the move gate's `OPEN_TRACK("expedition")` by id, the
not-rolled notice; with no expedition open at all it is refused the same way,
Undertake an Expedition offered. Strong hit → `finishExpedition` completes the
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
(`siteDiscovery.selectExpeditionSite`, never the sole-site guess; the link is
read off `listProgressTracks`, whose projection dropped it, so the arrival
followed the label while the reveal charted the linked site — the ship stayed
where it set out when the GM had charted the site first or a second unexplored
site had been recorded since, or docked at another sector's namesake: issue
#362 AC24) — by the site's location Actor (`maybeUpdateShipPositionFromName`'s `{ entityId }` and
`currentLocationForEntityId`), so the ship record, its token (onto the site's
pin, §1) and `currentLocationId` follow the site the same move charts; the
crew names an unexplored site in their own words (its pin reads "Unexplored
Site"), so the label alone resolved to no place and all three stayed on the
settlement they had left (issue #342 Z14). A label that begins several
unexplored sites' names is for the one at the place the resolver reads it as
(§0; `placeId`), which §4's reveal charts: a track with no link — begun before
that fix, or in the Progress Tracks panel — docked at one and charted neither
(issue #364 RESOLVER-AMBIGUOUS-PREFIX). The arrival and the reveal ask a label
that names no site whole again without its journey words (`journeyWords`), as
the start does and the arrival by name reads it: compared whole, a track with
no link for "the expedition to the Sunken" docked at "The Sunken Vaults" and
charted nothing (issue #364 EXPEDITION-FINISH-JOURNEY-WORDS-SITE). An
expedition for no site arrives
at the place its label names — the label of the expedition the move
completes, the track ladder's pick (`expeditionArrival`), then the line's own
words when the label names no tracked place (an expedition begun with no
destination named, `UNNAMED_EXPEDITION_LABEL`, names none) — both asked as an
expedition's own label, the journey words at their edges taken off before the
start and fragment rungs (`{ journeyWords }`): "the expedition to Bleak", read
at its start as one for Bleakhold, docked nowhere (issue #364
EXPEDITION-JOURNEY-WORDS-FRAGMENT): a typed finish
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
`!reveal-site` keeps the guess; with it a name the label begins names the
one site it begins, after the whole-word rung, as at the expedition's start —
§0, issue #364 EXPEDITION-PREFIX-SITE-LADDER-MISMATCH; of several, the one at
the place the resolver reads the label as, where the arrival docked —
`placeId`, issue #364 RESOLVER-AMBIGUOUS-PREFIX; the finish's reveal asks a
label that names no site whole again without its journey words, `journeyWords`
— issue #364 EXPEDITION-FINISH-JOURNEY-WORDS-SITE),
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
   *Fixed, then retired (overhaul 4, D6):* the fix began a default
   expedition; now the gate makes the move only on an expedition or at a
   site, the strong hit at a site offers no progress pick, and a pick with
   none open says so (`no-expedition`) and begins nothing.
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
