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
mirrors `relationshipTicks` onto the bond Items (`setBondItemTicks`), so the
two stay in step. The Items are keyed by the record's `_id`
(`flags[MODULE].connectionId`, written by every creator) and matched by it
alone (`actorBridge.bondItemsFor`); the name reaches only an Item with no
key, and only the PC's one of that name — a same-named sibling's Item is
never written, and a renamed connection's Item is still found (issue #314
Q04: `byId || byName` let the name override the key, and the rank writers
passed the host Actor id, which no Item carries).

## 1. Meet (creation)

Five paths converge on `createConnection()`. It registers the NPC card's id
in `connectionIds` on the caller's copy and on the latest stored campaignState
(`registerEntityIdInStore`) — never by writing the caller's copy whole, which
reverted a relayed X-Card when the caller was the move pipeline (issue #300
F14). Sector creation passes `persist: false` and registers everything in its
final `storeSector` write.

- **`make_a_connection` move** — the resolver carries text-only outcomes; the
  actual creation rides the post-narration discovery pass (canonical GM, hits
  only): `runDiscoveryDetection` → `runCombinedDetectionPass` (Haiku) →
  `routeEntityDrafts` auto-creates the first connection draft
  (`buildConnectionSeedData` → `createConnection` → silent portrait →
  `registerConnectionOnActiveCharacter`, which also creates the PC's bond
  Item — on the roller's PC: the narration's `actorId` rides
  `runPostNarrationPasses` → `runDiscoveryDetection` → `routeEntityDrafts`).
  When it creates none, a pending draft row the move's narration names
  (`namingText`, whole words — the detection pass leaves a pending name out)
  is confirmed as the roller's connection (`confirmNamedPendingConnection` →
  `confirmDraft` with the roller's `actorId`; issue #325 W23 — the card said
  "Connection made" and nothing was made, and a later Confirm bonded the old
  narration's PC).
- **Entity-extraction drafts** — connections detected in any other narration
  queue on the GM-whispered "New Entities Detected" card; Confirm creates the
  same way (once per draft on the clicking GM — an in-flight guard, issue
  #302), Dismiss records the name in `dismissedEntities`. The card carries the
  PC its narration was for (flag `actorId`, stamped by every detection path
  that knows it — move, paced, `@scene`, oracle follow-up), and Confirm puts
  the bond Item on that PC (issue #321 U23). Each Confirm / Dismiss writes its
  own row's status, one write at a time per card, on the live card
  (`setDraftStatus`) — a whole-card copy written back reverted a row resolved
  meanwhile — and Confirm creates nothing when an entity of that name and
  type already exists (`entityExistsForName`; issue #321 U25).
  Placeholder-name reveals rename in place rather than duplicating; a reveal
  whose `from` names no recorded placeholder connection drafts the newly
  named NPC (`findPlaceholderConnection` — it used to be dropped, issue #321
  U27).
- **Sector creation** — the canonical local connection, `canonicalLocked`,
  bond Item mirrored to every PC.
- **Inciting incident** — the vow-target NPC (`swearSharedVowForAll` creates
  the connection, a bond Item on every PC who swore the vow — issue #321 U23 —
  and stamps `linkedConnectionName` on the shared vow items).
- **Manual sidebar creation** — `createActor` hook + `autoSeedConnection`
  setting → `seedConnectionActor` rolls role/goal/first-look/disposition,
  writes biography/notes/pronouns, fires a silent portrait.

`registerConnectionOnActiveCharacter(record, { actorId, actors })` puts the
bond Item on each of `actors` (the inciting vow's crew), else on `actorId`
when it is a PC, else on the acting user's own PC (`resolveUserActorId`); it
used to go to the first PC whoever rolled (issue #321 U23). One portrait per
new card: with Auto-Seed NPC on, the `createActor` seed hook owns a new
connection card's portrait (from the creator's `portraitSourceDescription`)
and the creator's `postCreationEnrichment` skips it (`seedHookOwnsPortrait`);
with it off, the creator generates it — both used to, billing OpenRouter twice
(issue #321 U29). Portraits are generated on a GM's client only (`decisions.md`
→ "Portrait generation").

## 2. Develop (relationship progress)

- **`develop_your_relationship` / `test_your_relationship`** (GM-gated
  pipeline branch): `selectConnection` (a picker's host id → exact →
  substring → sole-bonded → sole-active) + `planDevelopRelationship` —
  **un-bonded** → one rank-step of
  `relationshipTicks` on the record (`markRelationshipProgress`, cap 40);
  **bonded** → the roll is +rank: `enrichBondedDevelop` (statEnrichment.js)
  resolves the connection before the dice — the picker's host id, else the
  name — stamps `moveTargetId` / `moveTarget` so this branch marks the same
  one, and makes the rank the stat (`BOND_ROLL_ADDS`, +1 troublesome … +5
  epic; the card reads "+epic (5)" — issue #314 Q06, the pipeline rolled +0
  while `!bond` rolled +rank); the outcome pays `BONDED_DEVELOP_OUTCOMES`
  (`bondedDevelopOutcome`, shared with `!bond` — issue #322 V01: the pipeline
  paid a weak hit 1 tick): strong → 2 bonds-legacy ticks (`addLegacyTicks` on
  the working copy, persisted with the move), weak → +2 momentum (the
  resolver's `momentumChange`, credited to the roller by `persistResolution`;
  a Test Your Relationship hit's branch adds the plan's momentum to that move's
  consequences), miss → nothing; a strong hit with a match raises the
  connection's rank (`nextRank`, never past epic), mirrored onto the bond
  Items by the record's `_id` (`setBondItemRank` — Q04). Ambiguous target (several active, none named)
  silently no-ops. `selectConnection`'s `strict` option is for an
  irreversible write (`!sever`): a name that matches no connection exactly or
  by substring resolves nothing, and an unnamed target resolves only when
  exactly one connection is active — never the sole-bonded fallback (issue
  #321 U14).
- **`!bond [rank] [name]`** — the bonded develop roll
  (`src/moves/bondCommand.js`). `handleBondCommand` runs once, on the
  typist's client (chat routing `RUN_ON.AUTHOR`): it resolves the **named**
  bonded connection (`selectConnection` over active bonded records), else the
  **sole** bonded one, and that connection's rank drives the adds
  (`BOND_ROLL_ADDS`, shared with the pipeline's bonded roll; a bare rank arg
  is the untargeted fallback; a name that matches nothing warns).
  It rolls, posts the card, and relays the roll's result to the canonical
  GM (`requestGmAction("bond.apply", { outcome, isMatch, … })` →
  `applyBondEffects`), which pays it from the pipeline's table
  (`bondedDevelopOutcome` — issue #322 V01): strong → 2 bonds-legacy ticks
  (`addLegacyTicks`, so filled boxes pay XP), weak → +2 momentum to the
  **roller's** PC (`resolveSpeakerActorId`), and a strong hit with a match on
  a targeted connection raises its rank one step for real (`updateConnection`
  + the bond-Item mirror via `setBondItemRank`, keyed by the record's `_id`
  and name read on the GM — issue #314 Q04). The handler validates the
  client-supplied payload: an outcome that is not a roll result is refused
  (effects named in the payload are ignored), the raise must be exactly
  `nextRank` of the bonded connection's current rank, and momentum goes only
  to a PC the requester owns (or a GM's request). With no GM
  connected the card still posts and `requestGmAction` warns that nothing was
  saved.
- **`deepenLinkedConnection`** — the vow/fight payoff path: marks the
  connection's own `relationshipTicks` (not bonds legacy), scaled by the
  source's rank.
- **Suggestion buttons** on connection-category move cards
  (`wireConnectionSuggestionButtons`) relay `connection.suggest` to the
  canonical GM (`cardActions.applyConnectionSuggestion`), which claims the
  move card once (`connectionSuggestionTaken`) and posts a **connection
  picker** card (`postConnectionPickerCard` — `flags.choices` lists the
  offered connections; forge offers only un-bonded ones). Each press used to
  post a fresh picker from the clicker's client, so two presses developed the
  relationship twice (issue #325 W11). Any user's pick relays
  `connection.pick` to the canonical GM (`wireConnectionPickerButtons` →
  `relayCardAction` → `applyConnectionPick`, `src/moves/cardActions.js`),
  which checks the pick is one of the card's choices (its buttons' data
  attributes for an older card) and that the clicker's PC is one the
  requester owns, posts the forced Develop Your Relationship / Forge a Bond
  move **once** — speaking as the clicker's PC, so the pipeline credits the
  roller although the GM authors the message, and naming the picked
  connection as `forcedMoveTargetId` (its host Actor id) and
  `forcedMoveTarget` (its name) — and stamps the card `resolved` (in-flight
  guarded; a failed post leaves it open). The forced move carries
  `deferWhileBusy`: met by the move lock, it is held on the canonical GM and
  rolled when the lock frees (issue #325 W02 — it was dropped, the card
  already claimed). A forced move skips the
  interpreter, so those flags are the only way the pick reaches the move: the
  chat pipeline carries them as `interpretation.moveTargetId` /
  `moveTarget`, and enrichment and the develop / forge branches resolve by
  the id first (issue #301 B01 — the flags used to be missing, so forge
  scored 0 or the sole bonded connection's track, and develop marked the
  sole bonded connection). A click with
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
BOND-NATIVE-FORGE fix), and is narrated by the native progress-roll hook where
a Claude key lives (`vow-flow.md` §4, issue #321 U11). Both hooks classify the
sheet roll through one subtype lookup (`nativeProgressSubtypeLookup`,
`src/index.js`), which takes the vendor's `bond` subtype as a connection — the
narration hook accepted only `connection`, so a forge rolled on the sheet's
Connections tab was paid but never narrated (issue #321 U21). There the bonds legacy is written at once
(`writeLegacyTicks`, its box XP only after the write lands); a refused write
leaves the forge card saying the legacy is "not yet marked" and whispers the
GMs a payoff failure card with a Retry (issue #306 R04). A PC's box XP that
is refused once the ticks land goes on that card too, as an `xp` step whose
Retry gives that PC's XP alone (issue #309 N06). The Bolster (+2) / Expand (second role, +1) influence
choice is card text, tracked manually. Once
`bonded`: always context-injected (`allyFlag`), develop switches to the
bond-legacy branch, `selectConnection` prefers it as the sole-bonded
fallback, and forge affordances exclude it. Forge a Bond's own resolution —
enrichment and the forge branch alike — never falls back to a bonded
connection (`selectConnection`'s `unbonded` option): with no picker id and
no matching name it takes the sole un-bonded connection, else nothing.

## 4. Payoffs and interplay

Vow↔connection linkage lives on the vow item (`linkedConnectionName`, set at
inciting swear or via the vow card's picker). Fulfilment and won-linked-fight
paths deepen the bond (`deepenLinkedConnection`) and grant the vow's promised
reward; the victory card's 🤝 Deepen button relays `fightVow.deepenBond` to
the canonical GM (`applyFightVowDeepenBond`, one-shot via
`resolvedActions.deepenBond`, values from the GM-authored card — see
`combat-flow.md` §4; it replaced the raw `connection.deepen` socket emit).
`deepenLinkedConnection` reports `{ ok }`: a refused write, or a connection
no longer found by that name (renamed or deleted), goes to the GMs instead
of being swallowed (issue #306 R04).
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
progress and its rank by name (`readConnections` maps the vendor's numeric
rank through `rankName` — issue #321 U62). `background` and `secrets` have no production writer, so neither
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
  inactive, history entry, table card). It resolves strictly
  (`selectConnection(…, { strict: true })`: exact or substring name; bare
  only while one connection is active) — a misspelled name, or a bare
  `!sever` with several active, severed the table's sole bonded connection
  (issue #321 U14). The uncalled `setAllyFlag` /
  `setSceneRelevant` / `clearAllSceneFlags` were removed (superseded by the
  relevance resolver).
- ~~`relationshipTicks` undeclared~~ — **declared** in `ConnectionSchema`.
- ~~`!bond` disconnected~~ — **addressed**: `!bond [rank] [name]` resolves a
  bonded connection (sole-bonded default), uses its rank, and a hit-with-match
  now actually raises the connection's rank.
