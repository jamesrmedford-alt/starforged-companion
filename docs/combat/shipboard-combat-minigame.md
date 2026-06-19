# Shipboard Combat — Battle Stations Mini-Game (IN PROGRESS)

**Status:** 🔄 IN PROGRESS — Phase A shipped (v1.7.17); Phases B–D planned.
**Theme:** Combat / Shipboard.
**Depends on:** Entity → Actor Migration (starship actors), Sector Creator
Enhanced (Scene + Note-pin + Drawing pipeline), Progress Tracks (combat
tracks), Narrator memory (scene frame).

---

## Why this exists

"Battle Stations!" is the rulebook's framework for shipboard/starship combat
(Ironsworn: Starforged, Chapter 3, pp. 184–187). It is **not a move** — it
resolves through the standard combat / suffer / recover moves — but it reframes
a fight as a **crew working a ship**: each character holds their own position
(in control / in a bad spot), takes a **station** (one of 11 example roles), and
**Aid Your Ally** hands control between crew. See `docs/decisions.md` →
"Battle Stations!" and `docs/rules-reference/rulebook-summary.md` (Combat Moves).

Today the module surfaces this two ways (both shipped):

1. **Narrator awareness** — a conditional `## SHIPBOARD COMBAT — BATTLE STATIONS`
   guidance block injected when a combat track is open and the campaign has a
   command vehicle (`src/moves/battleStations.js` +
   `src/narration/narrator.js` + `narratorPrompt.js`).
2. **Player reference** — the `!stations` chat command posts a play-aid card
   listing the 11 roles (`src/moves/battleStations.js`, dispatched in
   `src/index.js`).

This doc captures the **fourth, larger** piece the maintainer asked to develop:
turn shipboard combat into a **visual mini-game on a map of the ship**, then
integrate that mini-game into ordinary play.

---

## The vision

When a starship is created, generate a **Foundry Scene that is a deck-plan / map
of that ship**, with the shipboard-combat **stations marked on it** as Note pins
(Gunnery at the turrets, Piloting at the cockpit, Engineering at the drive,
Damage Control amidships, Medical at the bay, etc.). During a shipboard fight the
crew "mans the stations": each PC / companion / ally is placed at a station on
the map, the map shows who holds control vs. who's in a bad spot, and the
station a character occupies suggests which move and stat fit (Gunnery → Strike
+iron/edge; Piloting → React Under Fire/Gain Ground +edge; Damage Control →
Withstand Damage / Repair). Moving a token between stations is the fictional
"drop out of the gun turret to fight the engine-room fire" beat from the
rulebook's worked example (p. 187).

The point is to make shipboard combat **legible and tactile** without making it
*tactical* — Starforged is explicit that range/position are fictional, there is
no grid, and there are "no strict shipboard combat roles." The map is a
play-aid and a narrator-grounding device, not a wargame board.

---

## Proposed phases

### Phase A — Ship-map scene on ship creation ✅ SHIPPED (v1.7.17)
- ✅ On command-vehicle creation, generate a deck-plan Scene for the ship.
  Hooked inside `seedStarshipActor` (`src/entities/ship.js`) — the single
  convergence point for quickstart, ✦ Finalise, and sidebar auto-seed —
  gated to the command vehicle and idempotent.
- ✅ Background art: reuses the OpenRouter image pipeline
  (`src/moves/shipMapArt.js` → `src/art/openRouterImage.js`) with a top-down
  deck-plan prompt seeded from `type` / `firstLook`; falls back to a schematic
  hull-outline Drawing when art is disabled/unavailable.
- ✅ Places the 11 stations as Note pins (`src/moves/shipMapScene.js`,
  mirroring `src/sectors/sceneBuilder.js` incl. the PLAYTEST-1712 A scene-rect
  inset). `STATION_LAYOUT` gives fixed deterministic coordinates; a unit test
  asserts layout↔`SHIPBOARD_ROLES` parity.
- ✅ Also pins the **galley** (crew mess, `AMENITY_LAYOUT`) and the ship's
  **installed modules** (the `asset`/Module Items on the starship Actor —
  Medbay, Heavy Cannons, …, via `buildModuleFeatures`), so the map reflects the
  real vessel. Modules sit at a per-slug deck hint near their related station,
  with a fallback module-bay band. Galley and modules are deck features, not
  combat stations (kept out of `SHIPBOARD_ROLES`). The art prompt names the
  galley + installed modules so the generated deck plan tends to include them,
  and the vision pass locates them too (optional — fixed fallback per feature).
- ✅ **Vision placement (added on the maintainer's request):** when deck-plan
  art is generated, `src/moves/shipMapVision.js` asks a Claude vision model
  (via `api-proxy.js`) for normalized per-station coordinates so the pins land
  on the compartments the art drew. Validated (all 11, in range, not collapsed)
  with a per-station fallback to the fixed layout. This is the "read the image"
  answer to the Phase A "Map authoring" open question below — vision is layered
  over the guaranteed fixed baseline, not a replacement.
- ✅ Gated behind `shipMapEnabled` (default off; the fast quickstart loop is
  never slowed), plus `shipMapArtEnabled` (art vs schematic) and
  `shipMapVisionEnabled` (vision vs fixed). Manual `!shipmap` (`!shipmap
  rebuild`) works regardless of the master gate.
- Station-pin clicks surface the role description; the Scene is never
  auto-activated (GM navigates manually). NB: stations the ship can't man
  (no support vehicle → Escort) are still pinned for now — greying/omission is
  deferred to Phase B when crew can be placed.

### Phase B — Man the stations (token placement)
- During an open **combat track** with the command vehicle present, expose an
  affordance ("Battle stations") that opens the ship Scene and lets the GM place
  each PC / companion / ally token at a station.
- Persist each crew member's **station** and **position** (in control / bad
  spot) — per-character, mirroring the rulebook. NB: today the combat track
  carries a *single* `combatState`; per-character position is a new data shape
  (see Open questions).

### Phase C — Station-aware move suggestions
- When a character at a station triggers a combat move, bias the move
  interpreter / classifier toward the station's natural move + stat (Gunnery →
  Strike; Piloting → React Under Fire / Gain Ground; Damage Control → Withstand
  Damage / Repair; Medical → Heal / Companion Takes a Hit; Sensors → Secure an
  Advantage / Gather Information). Always overridable — the station is a hint,
  not a constraint.
- Feed the live station layout into the narrator's shipboard-combat block so the
  prose names the right consoles and crew positions.

### Phase D — Integrate into overall play
- Tie the mini-game to the existing combat lifecycle: Enter the Fray opens the
  ship Scene + mans stations; Strike/Clash/Gain Ground mark the shared combat
  track and update the actor's per-station position; Take Decisive Action /
  Face Defeat / Battle close it and return to the prior scene.
- Hook Aid Your Ally to a visible control hand-off on the map (the supporting
  character's "in control" passes to the ally's token).
- Damage Control / Repair stations interact with the ship's `integrity` and
  `battered` impact (`src/entities/ship.js`).

---

## Open questions / risks

- **Per-character position data shape.** The current combat track has one
  `combatState`. Shipboard play needs position *per crew member*. Decide whether
  to extend the combat track with a `crewPositions: { actorId → state }` map or
  to store it on each actor. (Leans: a map on the track, so it clears when the
  fight ends.)
- **Map authoring.** ✅ RESOLVED (Phase A). Both halves are implemented: a fixed
  schematic layout (`STATION_LAYOUT`, stations at known coordinates) is the
  guaranteed baseline, AND a vision pass (`shipMapVision.js`) places pins onto
  the AI-drawn compartments when art is present, validated with a fallback to
  the fixed layout. The scene-rect inset mirrors the sector-map padding lesson
  (PLAYTEST-1712 A). Caveat: vision coordinates are approximate and
  non-deterministic — acceptable for a play-aid, and the fixed layout always
  backstops a bad result.
- **Solo play.** One PC jumps between stations; the mini-game must not imply a
  full crew. Single-token, multi-station movement is the solo path.
- **Scope creep vs. the rules.** Keep it a play-aid. Resist grid/range/turn
  mechanics — Starforged combat is narrative. The map shows *who is where and
  who has control*, nothing more.
- **Cost.** Per-ship deck-plan art is another image generation. Gate it and
  cache it (content-addressed, like portraits/sector art).

---

## Not in scope (yet)

- Boarding actions as a sub-scene, fleet/mass-combat scaling, multiple
  simultaneous enemy ships as tracks. Revisit after Phases A–D land.

---

## Document maintenance

Created 2026-06-18 alongside the Battle Stations! correction and the
narrator-awareness + `!stations` shipped pieces. Update the phase checklist as
work lands; promote to a full scope doc (and a `scope-index.md` row flip to
🔄 IN PROGRESS) when Phase A starts.
