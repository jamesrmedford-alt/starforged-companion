# Faction lifecycle flow — as implemented

How factions are born, where their state lives, what updates it, and what the
narrator actually sees — verified against source (v1.7.30 cycle). Sibling
docs: `narrator-context-flow.md`, `character-detail-flow.md`,
`connection-flow.md`.

Prompted by: "I'd like the same treatment applied to faction lifecycle".
Findings are tagged **WRONG-DETAIL** / **LOSE-PLOT** / **INVENT-RISK** as in
the sibling audits. §3 is the open defect ledger (fixes await direction).

## 1. The two faction stores (and a half)

**World Journal faction entries** (`src/world/worldJournal.js`): pages on
"World Journal — Factions", flag `factionEntry`, shape
`{ factionName, attitude, summary, … }` with `attitude ∈ hostile | neutral |
allied | unknown` (`FACTION_ATTITUDES`). Written by
`recordFactionIntelligence` — from the detection pass (new narrator-named
factions are WJ-surfaced immediately, gated on `entityExistsForName`) and
from `attitudeShift` state transitions. Read by `getFactionLandscape` (up to
3, most recently updated) and `!journal faction` commands.

**Faction entity records** (`src/entities/faction.js`): journal-entry-backed
records with the full Starforged shape — type/subtype, influence,
dominion/leadership, `projects[]`, `rumors[]`, quirk, and
`relationship ∈ antagonistic | apathetic | distrustful | does_business |
open_alliance | temporary_alliance | warring | unknown`. Created by the
sector generator and by draft-card confirmation (`ENTITY_CREATORS.faction →
createFaction` with name + description only — no oracles rolled, unlike
connections). Read by the relevance resolver → ENTITIES IN SCENE cards
(`formatEntityCard` has a faction field table including `relationship`) and
the entity panel (which can edit `relationship` manually).

**The half-store:** `sector.faction` — a bare control-faction name string on
the active sector, rendered in the ACTIVE SECTOR block. Static, name-only.

## 2. What the narrator actually sees

- **Matched entity cards only.** A faction reaches the narrator system
  prompt solely when the relevance resolver matches its name (or the frame
  union carries it) — rendering the *entity record*: type, influence,
  `relationship` stance, latest project, quirk, description, generative-tier
  details.
- **The WJ faction landscape reaches the narrator nowhere.** Its only
  consumers are the assembler's FACTION LANDSCAPE packet section — see §3
  defect 1 — and `describeWorldJournalState`, which feeds current attitudes
  to the *detection Haiku* so it can classify transitions. The detector
  knows the political landscape; the narrator does not.
- **Generative tier works.** The paced/move tier-update pass is
  type-agnostic (`runNarrationTierUpdate` maps matched ids + types), so a
  matched faction accrues salience-gated development details like any other
  entity — the one narrative write the record receives.

## 3. Verified defects (open — awaiting direction; see `known-issues.md`)

1. **FACTION-PACKET-DEAD** (LOSE-PLOT — root cause, wider than factions):
   `assembleContextPacket` builds a 17-section packet — FACTION LANDSCAPE,
   immediate/looming threats, confirmed + asserted WJ lore, recent
   discoveries, session notes, lore recap, RECENT ORACLES, progress tracks,
   character state — and every callsite (move pipeline `index.js:1666`,
   burn-momentum re-narration, improve-result re-narration) passes it to
   `narrateResolution(resolution, contextPacket, …)` whose `contextPacket`
   parameter is **never read**. The interpreter doesn't take it either
   (`interpretMove` assembles its own inputs). The packet subsystem is dead
   on every live path — a Loremaster-era conduit orphaned when narration
   moved to `buildNarratorSystemPrompt`, surviving because unit tests
   exercise the builder but nothing tests the composition (the exact
   CHAR-PC-BLOCK-STARVED failure shape). Consequence for factions: **the
   living political state (WJ attitudes) is invisible to the narrator**, as
   are WJ threats and non-migrated lore.
2. **FACTION-DUAL-STORE** (WRONG-DETAIL): a narrator-named faction is
   WJ-surfaced immediately (good — durable home) *and* queued as a draft;
   confirming the draft creates the entity record with
   `relationship: "unknown"` — and nothing merges or retires the WJ entry.
   Two records for the same faction, two vocabularies (`attitude` 4-value vs
   `relationship` 8-value), no reconciliation, free to diverge.
3. **FACTION-ATTITUDE-SPLIT-BRAIN** (WRONG-DETAIL): `attitudeShift`
   transitions write the WJ store unconditionally — the transitions loop in
   `routeWorldJournalResults` has no `entityExistsForName` gate (the
   new-faction loop does) — while **no narrative path ever updates
   `record.relationship`** (`updateFaction` has zero callers outside the
   file). Net: the story's attitude changes land in the store the narrator
   can't see (defect 1), and the store the narrator *can* see (the entity
   card) shows a stance frozen at confirm time. The narrator can court a
   faction the fiction says is now `warring`.
4. **FACTION-RECORD-WRITE-ONCE** (LOSE-PLOT): `updateFaction`, `addRumor`,
   `setProject`, and `setSceneRelevant` are exported and never called;
   `active` is never flipped and `listFactions` doesn't filter on it
   anyway; draft-confirmed factions skip oracle seeding entirely (name +
   description only — no type/influence/quirk, unlike connections'
   `seedConnectionActor`). Beyond the generative tier and manual panel
   edits, a faction record is frozen at creation: projects and rumors are
   dead fields the narrator sees as eternally current.
5. **FACTION-DETECTOR-ONLY-CONTEXT** (INVENT-RISK): the detection Haiku
   receives the WJ attitude landscape (`describeWorldJournalState`) but the
   narrator generating the prose does not — so transitions are *classified*
   against a political map the *author* of the prose never saw. The
   narrator can invent a faction stance that contradicts the recorded
   attitude, and the pipeline's answer is to record the contradiction as a
   new shift rather than prevent it.

## 4. Design-level exposure

- **Faction stance has no single source of truth by design history**, not
  decision: WJ `attitude` (narrative intelligence) and record
  `relationship` (Starforged stance) genuinely mean different things, but
  nothing documents which wins, maps one to the other, or updates either
  from play. Any fix should pick a canonical home and mirror (the
  connection record ↔ bond Item pattern).
- **`sector.faction` is a third, name-only mention** — fine as flavor, but
  if the control faction gains a record/WJ entry the three are never
  linked.
- **No faction lifecycle end**: no dissolution/absorption affordance
  (`active` dormant). Low urgency; recorded for completeness.

## 5. What held up under audit

New narrator-named factions get an immediate durable WJ home (auto-surface,
2026-06) instead of dying in an unconfirmed draft; the new-faction WJ loop
correctly skips names that already have entity records; matched faction
entity cards render the full record including stance and latest project;
the generative tier accrues narrative development for matched factions;
`!journal faction` gives the GM a manual attitude-correction path; and the
entity panel can edit the record's stance directly.
