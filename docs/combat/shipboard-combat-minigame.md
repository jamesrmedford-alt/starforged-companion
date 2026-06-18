# Shipboard Combat — Battle Stations Mini-Game (PLANNED)

**Status:** 📋 PLANNED — design captured, not yet started.
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

### Phase A — Ship-map scene on ship creation
- On command-vehicle creation (`src/entities/ship.js` /
  `src/session/quickstart.js`), generate a deck-plan Scene for the ship.
- Background art: reuse the OpenRouter image pipeline
  (`src/art/openRouterImage.js`) with a deck-plan prompt seeded from the ship's
  `type` / `firstLook`; fall back to a generic deck-plan background or a plain
  schematic when art is disabled (mirror the sector-map gates:
  `sectorArtEnabled` style setting → `shipMapArtEnabled`).
- Place the 11 stations as Note pins via the existing Scene/Note pipeline used
  by the Sector Creator (`src/sectors/sceneBuilder.js` is the reference). Stations
  the ship can't man (no support vehicle → Escort) may be omitted or greyed.
- Gate behind a setting (`shipMapEnabled`, default off until the mini-game is
  mature) so it never slows the fast quickstart reset loop.

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
- **Map authoring.** Generated deck-plan art is unpredictable; Note-pin
  placement needs sensible default coordinates that don't depend on the art.
  A fixed schematic layout (stations at known coordinates, art as backdrop) is
  more robust than trying to pin onto AI-generated geometry — mirror the
  sector-map padding lessons (v1.7.12 finding A).
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
