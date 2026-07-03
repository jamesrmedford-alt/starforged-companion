# Faction lifecycle flow — as implemented

How factions are born, where their state lives, what updates it, and what the
narrator actually sees — verified against source (v1.7.30 cycle). Sibling
docs: `narrator-context-flow.md`, `character-detail-flow.md`,
`connection-flow.md`.

Prompted by: "I'd like the same treatment applied to faction lifecycle".
All five audit defects were **fixed in the same cycle** ("Please address all
identified issues") — §3 is the resolved ledger, §4 the dispositions.

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
sector generator (pre-populated) and by draft-card confirmation, which since
2026-07 reconciles any WJ intelligence and rolls the faction oracles
(`seedFactionRecord`). Read by the relevance resolver → ENTITIES IN SCENE cards
(`formatEntityCard` has a faction field table including `relationship`) and
the entity panel (which can edit `relationship` manually).

**The half-store:** `sector.faction` — a bare control-faction name string on
the active sector, rendered in the ACTIVE SECTOR block. Static, name-only.

## 2. What the narrator actually sees

- **Matched entity cards** render the full record (type, influence,
  `relationship` stance, latest project, quirk, description, generative-tier
  details) when the relevance resolver matches the faction's name — and
  since 2026-07 the [4e] landscape carries every faction's stance line on
  every call regardless of matching.
- **The faction landscape reaches every narrator call** ([4e], 2026-07):
  `mergeFactionLandscape` renders entity records first (canonical stance +
  type + latest project) with WJ-only factions appended (attitude + known
  goal), deduped by name and capped. ACTIVE THREATS [4d] and ESTABLISHED
  LORE [4f] ride the same seam. `describeWorldJournalState` still feeds the
  detection Haiku, which now classifies against the same map the narrator
  writes with.
- **Generative tier works.** The paced/move tier-update pass is
  type-agnostic (`runNarrationTierUpdate` maps matched ids + types), so a
  matched faction accrues salience-gated development details like any other
  entity — the one narrative write the record receives.

## 3. Audit defects — all resolved (v1.7.30 cycle)

| Code | Class | Defect → fix |
|---|---|---|
| FACTION-PACKET-DEAD | LOSE-PLOT | The assembler packet was built at three callsites and never read → **retired from all live paths** (index Step 8, burn-momentum, improve-result — whose `if (!packet) return` guard had silently aborted re-narration on assembly failure). The load-bearing sections now flow through `buildNarratorExtras`: **[4d] ACTIVE THREATS** (top 4), **[4e] FACTION LANDSCAPE** (`mergeFactionLandscape` — records canonical, WJ-only appended), **[4f] ESTABLISHED LORE** (recent 5, clipped), gated on the existing `threatsInContext` / `factionLandscapeInContext` / `loreInContext` settings. The assembler module is retained for reference/tests (header marked; deletion needs explicit approval) |
| FACTION-DUAL-STORE | WRONG-DETAIL | Two unreconciled records per faction → draft-confirm now reconciles: the new entity record inherits the WJ entry's attitude (mapped) and the WJ entry backlinks the record via `entityId`; the WJ entry remains the intelligence log under the record's canon |
| FACTION-ATTITUDE-SPLIT-BRAIN | WRONG-DETAIL | Attitude shifts wrote only the WJ store → `recordFactionIntelligence` itself syncs every attitude write (detection transitions, `!journal faction`, auto-surface) onto `record.relationship` via `ATTITUDE_TO_RELATIONSHIP` (hostile→antagonistic, neutral→apathetic, allied→open_alliance; unknown never overwrites). The record is the canonical stance home — decisions.md |
| FACTION-RECORD-WRITE-ONCE | LOSE-PLOT | Records frozen at creation → `seedFactionRecord` rolls the Starforged faction oracles (type + per-type subtype, influence, quirk, first project) on draft-confirm, idempotent via the new `seeded` flag; the attitude sync above gives the record its narrative write path; generative-tier accrual unchanged. `addRumor`/`setProject` remain panel/API affordances |
| FACTION-DETECTOR-ONLY-CONTEXT | INVENT-RISK | The narrator never saw the landscape the detector classified against → resolved by [4e]: the narrator now reads the same political map, with a stances-are-established guard sentence |

## 4. Design-level exposure — dispositions (2026-07)

- **Faction stance now has a canonical home**: the entity record's
  `relationship`, with the WJ `attitude` as the coarse intelligence layer
  that maps onto it on every write (decisions.md → "Faction stance: the
  entity record is canonical"). `sector.faction` stays a name-only flavor
  mention (unchanged).
- **No dissolution lifecycle — reaffirmed.** `active` stays dormant until a
  real need appears; the landscape block naturally rotates to recently
  updated factions.

## 5. What held up under audit

New narrator-named factions get an immediate durable WJ home (auto-surface,
2026-06) instead of dying in an unconfirmed draft; the new-faction WJ loop
correctly skips names that already have entity records; matched faction
entity cards render the full record including stance and latest project;
the generative tier accrues narrative development for matched factions;
`!journal faction` gives the GM a manual attitude-correction path; and the
entity panel can edit the record's stance directly.
