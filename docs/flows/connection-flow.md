# Connection flow — as implemented

A stage-by-stage map of the connection (NPC bond) lifecycle as the code
actually implements it, verified against source (post-PR #257). File
references name the owning function; line numbers drift, so search by symbol.
Sibling docs: `combat-flow.md`, `vow-flow.md`, `exploration-flow.md`.

The authoritative record is a `character`-type **Actor** (NPC card) tagged
`flags[MODULE].entityType:'connection'` (FOLDER-002 — never match bare
`type==='character'`), with the connection record on
`flags[MODULE].connection` (`relationshipTicks`, `bonded`, `rank`, `active`)
and the Actor id listed in `campaignState.connectionIds[]`
(`src/entities/connection.js`). **Two mirrors exist and drift**: the entity
record (authoritative — scores Forge a Bond, feeds entity cards) and a PC
`progress` Item with `system.subtype:"bond"` (populates the vendor sheet's
Connections tab and CHARACTER STATE) — the item's track is seeded at 0 and
never advanced afterward (see gaps).

## 1. Meet (creation)

Five paths converge on `createConnection()`:

- **`make_a_connection` move** — the resolver carries text-only outcomes; the
  actual creation rides the post-narration discovery pass (canonical GM, hits
  only): `runDiscoveryDetection` → `runCombinedDetectionPass` (Haiku) →
  `routeEntityDrafts` auto-creates the first connection draft
  (`buildConnectionSeedData` → `createConnection` → silent portrait →
  `registerConnectionOnActiveCharacter`, which also creates the PC's bond
  Item).
- **Entity-extraction drafts** — connections detected in any other narration
  queue on the GM-whispered "New Entities Detected" card; Confirm creates the
  same way, Dismiss records the name in `dismissedEntities`.
  Placeholder-name reveals rename in place rather than duplicating.
- **Sector creation** — the canonical local connection, `canonicalLocked`,
  bond Item mirrored to every PC.
- **Inciting incident** — the vow-target NPC (`swearSharedVowForAll` creates
  the connection and stamps `linkedConnectionName` on the shared vow items).
- **Manual sidebar creation** — `createActor` hook + `autoSeedConnection`
  setting → `seedConnectionActor` rolls role/goal/first-look/disposition,
  writes biography/notes/pronouns, fires a silent portrait.

## 2. Develop (relationship progress)

- **`develop_your_relationship` / `test_your_relationship`** (GM-gated
  pipeline branch): `selectConnection` (exact → substring → sole-bonded →
  sole-active) + `planDevelopRelationship` — **un-bonded** → one rank-step of
  `relationshipTicks` on the record (`markRelationshipProgress`, cap 40);
  **bonded** → bonds-legacy ticks (strong 2 / weak 1) and a match-on-hit
  raises the connection's rank (`nextRank`, clamped at epic). Ambiguous
  target (several active, none named) silently no-ops.
- **`!bond <rank>`** — a standalone bonded develop roll (+rank adds): strong
  → 2 bonds-legacy ticks, weak → +2 momentum. Not tied to a specific
  connection; its "raise rank on a match" is text only.
- **`deepenLinkedConnection`** — the vow/fight payoff path: marks the
  connection's own `relationshipTicks` (not bonds legacy), scaled by the
  source's rank.
- **Suggestion buttons** on connection-category move cards open a picker that
  posts a forced develop/forge move naming the connection (picker wiring is
  GM-only).

## 3. Forge the bond

`forge_a_bond` is a progress move scored from the record's
`relationshipTicks` via `enrichProgressTicks` (see `decisions.md`). On a
**strong hit** the pipeline branch flips the record (`forgeBond`: `bonded`,
`allyFlag`, optional second role, history entry), marks rank-scaled
bonds-legacy ticks, and posts the forge card; the Bolster (+2) / Expand
(second role, +1) influence choice is card text, tracked manually. Once
`bonded`: always context-injected (`allyFlag`), develop switches to the
bond-legacy branch, `selectConnection` prefers it as the sole-bonded
fallback, and forge affordances exclude it.

## 4. Payoffs and interplay

Vow↔connection linkage lives on the vow item (`linkedConnectionName`, set at
inciting swear or via the vow card's picker). Fulfilment and won-linked-fight
paths deepen the bond (`deepenLinkedConnection`) and grant the vow's promised
reward; the victory card's 🤝 Deepen button relays over socket
`connection.deepen` for players. Bonds-legacy ticks accrue on
`campaignState.legacyTracks.bonds` — but see LEGACY-XP-DEAD below.

## 5. Narrator awareness

Live surfaces: **entity cards** ("ENTITIES IN SCENE" — the record via
`getConnection`, matched by the relevance resolver) and **CHARACTER STATE**
(the PC's bond *Items* via `readConnections` — the stale mirror). The legacy
"ACTIVE CONNECTIONS" assembler section still reads `game.journal.get(id)` and
finds nothing for actor-hosted connections (kept for backwards
compatibility); `buildConnectionsSummary` emits only a count.

## Verified defects (open as of this audit — see `known-issues.md`)

1. **Weak-hit Forge a Bond does nothing mechanical** (BOND-WEAK-FORGE): the
   resolver's weak hit is text-only — no `forgeABond` flag, so `bonded` never
   flips and no legacy marks, contradicting the schema comment ("true after
   Forge a Bond (strong or weak hit)") and the rules (the bond forms once
   their request is met).
2. **Native-sheet Forge a Bond has no entity payoff** (BOND-NATIVE-FORGE):
   the native progress-roll hook narrates only, and the consequence hook pays
   vows only (`shouldPayFulfilledVow`) — a sheet-rolled forge never sets
   `bonded` or marks legacy on the record.
3. **Legacy ticks never convert to XP** (LEGACY-XP-DEAD, module-wide): every
   live path uses `addLegacyTicks`, which only increments
   `campaignState.legacyTracks[key].ticks`; the XP-awarding
   `markLegacyProgress` (2 XP/box) is reachable only via
   `consequences.progressTrackId`, which no resolver sets (the resolver's own
   comments say so). Applies to bonds, quests, and discoveries alike.
4. **The sheet's bond-Item track never advances** (BOND-ITEM-MIRROR):
   `markRelationshipProgress`/`forgeBond` update the record only; the PC's
   `subtype:"bond"` Item stays at 0 forever, so the vendor Connections tab
   (and CHARACTER STATE ticks) disagree with the record.

## Softer gaps (recorded, not yet bugs-with-consequences)

- `#syncConnectionEntity` in the progress-tracks panel is doubly stale: fires
  only for `type:'connection'` tracks (which nothing creates), reads the
  wrong host (`game.journal`), writes a field nothing reads.
- `loseConnection` / `setAllyFlag` / `setSceneRelevant` /
  `clearAllSceneFlags` have no callers — `active` is never set false in play
  (no severance flow) and the scene-relevant sort is inert.
- `relationshipTicks` is undeclared in `ConnectionSchema` (written ad-hoc;
  reads default to 0, functionally safe).
- `!bond` is disconnected from any specific connection and from rank raises.
