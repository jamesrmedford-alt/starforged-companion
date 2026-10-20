# Connection flow — as implemented

A stage-by-stage map of the connection (NPC bond) lifecycle as the code
actually implements it, verified against source (post-PR #257; `!bond`, the
connection picker and the won-fight Deepen button updated for the 2026-10
audit's GM relay). File references name the owning function; line numbers
drift, so search by symbol. Sibling docs: `combat-flow.md`, `vow-flow.md`,
`exploration-flow.md`.

The authoritative record is a `character`-type **Actor** (NPC card) tagged
`flags[MODULE].entityType:'connection'` (FOLDER-002 — never match bare
`type==='character'`), with the connection record on
`flags[MODULE].connection` (`relationshipTicks`, `bonded`, `rank`, `active`)
and the Actor id listed in `campaignState.connectionIds[]`
(`src/entities/connection.js`). **Two mirrors exist**: the entity record
(authoritative — scores Forge a Bond, feeds entity cards) and a PC `progress`
Item with `system.subtype:"bond"` (the vendor sheet's Connections tab and
CHARACTER STATE). Since the BOND-ITEM-MIRROR fix, `markRelationshipProgress`
mirrors `relationshipTicks` onto the bond Items (`setBondItemTicks`, keyed by
connectionId, then name), so the two stay in step.

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
- **`!bond [rank] [name]`** — the bonded develop roll
  (`src/moves/bondCommand.js`). `handleBondCommand` runs once, on the
  typist's client (chat routing `RUN_ON.AUTHOR`): it resolves the **named**
  bonded connection (`selectConnection` over active bonded records), else the
  **sole** bonded one, and that connection's rank drives the adds (a bare
  rank arg is the untargeted fallback; a name that matches nothing warns).
  It rolls, posts the card, and relays the lasting effect to the canonical
  GM (`requestGmAction("bond.apply")` → `applyBondEffects`): strong → 2
  bonds-legacy ticks (`addLegacyTicks`, so filled boxes pay XP), weak → +2
  momentum to the **roller's** PC (`resolveSpeakerActorId`), and a hit with a
  match on a targeted connection raises its rank one step for real
  (`updateConnection` + the bond-Item mirror via `setBondItemRank`). The
  handler validates the client-supplied payload: ticks / momentum clamp to
  the legal {0, 2} (a request carrying both is refused), the raise must be
  exactly `nextRank` of the bonded connection's current rank, and momentum
  goes only to a PC the requester owns (or a GM's request). With no GM
  connected the card still posts and `requestGmAction` warns that nothing was
  saved.
- **`deepenLinkedConnection`** — the vow/fight payoff path: marks the
  connection's own `relationshipTicks` (not bonds legacy), scaled by the
  source's rank.
- **Suggestion buttons** on connection-category move cards
  (`wireConnectionSuggestionButtons`) post a **connection picker** card
  (`postConnectionPickerCard` — `flags.choices` lists the offered
  connections; forge offers only un-bonded ones). Any user's pick relays
  `connection.pick` to the canonical GM (`wireConnectionPickerButtons` →
  `relayCardAction` → `applyConnectionPick`, `src/moves/cardActions.js`),
  which checks the pick is one of the card's choices (its buttons' data
  attributes for an older card) and that the clicker's PC is one the
  requester owns, posts the forced Develop Your Relationship / Forge a Bond
  move **once** — speaking as the clicker's PC, so the pipeline credits the
  roller although the GM authors the message — and stamps the card
  `resolved` (in-flight guarded; a failed post leaves it open). A click with
  no GM connected, a refusal, or a card still unresolved after
  `RELAY_RECOVERY_MS` (15 s) re-arms the buttons. (The picker used to be
  GM-only; the first 2026-10 fix let any click post the move but only the
  card's owner could stamp it resolved, so it could fire repeatedly.)

## 3. Forge the bond

`forge_a_bond` is a progress move scored from the record's
`relationshipTicks` via `enrichProgressTicks` (see `decisions.md`). On a
**hit — strong or weak** (BOND-WEAK-FORGE fix; the weak hit forges too, with
their request in the fiction) the pipeline branch flips the record
(`forgeBond`: `bonded`, `allyFlag`, optional second role, history entry),
marks rank-scaled bonds-legacy ticks (`legacyRewardTicks`), and posts the
forge card; a sheet-rolled forge pays the same way via the native consequence
hook (`shouldForgeBond` into `payForgedBondNative`, idempotent —
BOND-NATIVE-FORGE fix). The Bolster (+2) / Expand (second role, +1) influence
choice is card text, tracked manually. Once
`bonded`: always context-injected (`allyFlag`), develop switches to the
bond-legacy branch, `selectConnection` prefers it as the sole-bonded
fallback, and forge affordances exclude it.

## 4. Payoffs and interplay

Vow↔connection linkage lives on the vow item (`linkedConnectionName`, set at
inciting swear or via the vow card's picker). Fulfilment and won-linked-fight
paths deepen the bond (`deepenLinkedConnection`) and grant the vow's promised
reward; the victory card's 🤝 Deepen button relays `fightVow.deepenBond` to
the canonical GM (`applyFightVowDeepenBond`, one-shot via
`resolvedActions.deepenBond`, values from the GM-authored card — see
`combat-flow.md` §4; it replaced the raw `connection.deepen` socket emit).
Bonds-legacy ticks accrue on
`campaignState.legacyTracks.bonds`, and every newly filled box now awards XP
to each PC with an earned-XP card (LEGACY-XP-DEAD fix — `addLegacyTicks`
pays 2 XP/box, 1 once the track is cleared; `!bond` routes through it too).

## 5. Narrator awareness

Live surfaces: **entity cards** ("ENTITIES IN SCENE" — the record via
`getConnection`, matched by the relevance resolver) and **CHARACTER STATE**
(the PC's bond *Items* via `readConnections` — the mirror). Since issue #286
(C5) the card shows the rolled `goal` beside the `motivation`, a lost
(`active:false`) or forged (`bonded`) bond, and the last three `history`
events (`forgeBond`, `loseConnection`); CHARACTER STATE shows each bond's
progress. `background` and `secrets` have no production writer, so neither
renders. The legacy
"ACTIVE CONNECTIONS" assembler section still reads `game.journal.get(id)` and
finds nothing for actor-hosted connections (kept for backwards
compatibility); `buildConnectionsSummary` emits only a count.

## Verified defects (all FIXED in the v1.7.30 cycle — resolved ledger in `known-issues.md`)

Each entry below describes the pre-fix behaviour the audit verified; the fix
summary lives in the `known-issues.md` table and the code.

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
   comments say so). Applies to bonds, quests, and discoveries alike. (Fixed
   by moving the XP award into `addLegacyTicks`; the dead
   `progressTrackId` / `progressMarked` route and `persistResolution`'s
   mark-progress steps, `markLegacyProgress` included, were deleted in the
   2026-10 audit.)
4. **The sheet's bond-Item track never advances** (BOND-ITEM-MIRROR):
   `markRelationshipProgress`/`forgeBond` update the record only; the PC's
   `subtype:"bond"` Item stays at 0 forever, so the vendor Connections tab
   (and CHARACTER STATE ticks) disagree with the record.

## Softer gaps — resolved in the 2026-07 cleanup

- ~~`#syncConnectionEntity` doubly stale~~ — **removed** (connection progress
  lives on `relationshipTicks`, mirrored to bond Items).
- ~~No severance flow / dead flag togglers~~ — **addressed**: new GM
  **`!sever <name>`** command routes through `loseConnection` (record kept
  inactive, history entry, table card); the uncalled `setAllyFlag` /
  `setSceneRelevant` / `clearAllSceneFlags` were removed (superseded by the
  relevance resolver).
- ~~`relationshipTicks` undeclared~~ — **declared** in `ConnectionSchema`.
- ~~`!bond` disconnected~~ — **addressed**: `!bond [rank] [name]` resolves a
  bonded connection (sole-bonded default), uses its rank, and a hit-with-match
  now actually raises the connection's rank.
