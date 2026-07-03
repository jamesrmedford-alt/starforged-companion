# Character-detail flow — as implemented

How character identity details — pronouns, callsign, biography, impacts,
assets, appearance — reach (or fail to reach) the narrator, for player
characters and NPCs. Verified against source (v1.7.30 cycle). Sibling docs:
`narrator-context-flow.md` (the memory surfaces these details ride on),
`docs/narrator/narrator-memory-architecture.md`.

Prompted by: "How about character detail drift with the narrator, e.g.
pronouns, etc". The audit's five verified defects and the actionable
exposure were **all fixed in the same cycle** ("Please address all
findings") — §3 is the resolved ledger, §4 the dispositions. Failure-class
tags: **WRONG-DETAIL** (stale/wrong data injected), **LOSE-PLOT** (details
fall out of context), **INVENT-RISK** (nothing stops the narrator
inventing/flipping a detail).

## 1. Where character details live

**Player characters** (vendor `foundry-ironsworn` character Actors):
`system.pronouns`, `system.callsign` (plain strings, filled on the sheet),
`system.biography` / `system.notes` (HTML), stats, meters, impacts, asset /
progress Items. There is **no** `system.description` field on the vendor
character schema. `readCharacterSnapshot` (`src/character/actorBridge.js`)
reads all of it — pronouns and callsign included — into the snapshot.

**NPCs** (connection records + `character`-type NPC cards, FOLDER-002):
`record.pronouns` established once at seed time (v1.7.10/11 finding E —
rolled from she/her · he/him · they/them, mirrored to `system.pronouns`,
and used to anchor the portrait prompt, the seeded Notes prose, the entity
card, and the audio voice). Role / goal / firstLook / disposition ride the
same record.

## 2. Injection surfaces — who carries what

| Surface | PC pronouns | NPC pronouns | Notes |
|---|---|---|---|
| CHARACTER block [8] (`buildCharacterBlock`) | ✅ full snapshot since 2026-07 (`getActiveCharacter` passes everything the sheet holds: pronouns, callsign, biography, stats, impacts, assets, vows) | n/a | the starving narrowing was CHAR-PC-BLOCK-STARVED; a composition test now locks the live path |
| PARTY roster [8b] (`buildPartyBlock`) | ✅ per-member pronouns + callsigns since 2026-07, with a binding-pronouns rule | n/a | legacy names-only shape still renders |
| ENTITIES IN SCENE [6] (`formatEntityCard`) | n/a | ✅ `Pronouns:` row when the record has them | |
| NPC-profile guidance (interaction class + tier pass) | n/a | ✅ "keep pronouns, never reassign" | prompt-level defense exists |
| Galley / end-session vignette user messages | ✅ `[she/her]` per participant | ✅ end-session NPC leads with pronouns | the finding-R fix — these are the only paths that pass full snapshots |
| Audio NPC voice | n/a | ✅ `pronounsToVoiceKey` from the record | mixed/unset → default voice |
| Perspective instruction (`PERSPECTIVE_DESCRIPTIONS`) | ✅ binding since 2026-07 | — | third person: use recorded pronouns exactly, never infer from a name; second person: recorded pronouns govern NPC dialogue about the PC |
| Chronicle / campaign recap | prose-anchored | prose-anchored | scribe re-summarises narrator prose; recap told "third person for multiplayer" with no pronoun data beyond entry text |

## 3. Audit defects — all resolved (v1.7.30 cycle)

| Code | Class | Defect → fix |
|---|---|---|
| CHAR-PC-BLOCK-STARVED | WRONG-DETAIL/INVENT-RISK | `getActiveCharacter` narrowed the snapshot to `{name, description(nonexistent field → ''), narratorNotes, meters}` on all nine narrator paths — the CHARACTER block never carried pronouns, callsign, biography, stats, impacts, assets, or vows, and the narrator guessed gender from the name → it now returns the **full snapshot** (+ flag-only `narratorNotes`; the old biography fallback would have double-rendered). `tests/unit/characterDetail.test.js` exercises the live `getActiveCharacter → buildNarratorSystemPrompt` composition so the seam cannot silently starve again |
| CHAR-PARTY-NAMES-ONLY | WRONG-DETAIL | The PARTY roster carried bare names → `buildPartyContext` now sends `{name, pronouns, callsign}` per member (cached snapshot reads) and `buildPartyBlock` renders them with a binding rule; legacy names-only shape unchanged |
| CHAR-PERSPECTIVE-NO-PRONOUN-RULE | INVENT-RISK | "Refer to characters by name" was the whole third-person instruction → both perspectives now make recorded pronouns binding; third person forbids inferring gender from names (write around it or use they/them) |
| CHAR-NPC-PRONOUN-ROLL-BLIND | WRONG-DETAIL | Confirming a narrator-introduced NPC rolled pronouns randomly against the fiction → the detection pass captures the pronouns the prose used (sanitised by `normalisePronounSet`), they ride the draft card / auto-create / seed into `createConnection`, the inciting `Vow target:` line carries a `(she/her)`-style parenthetical parsed by `splitVowTarget`, and `seedConnectionActor`'s finding-E roll is now **fallback-only** (fires only when nothing established a set). `ConnectionSchema.pronouns` documents the field |
| CHAR-SIDECAR-NO-PRONOUN-ANCHOR | LOSE-PLOT | The required identity anchor omitted pronouns → the anchor rule and its example now include the pronouns the prose used, so an unconfirmed NPC's gender lives in the truth ledger (and gives the detection pass text to read) instead of only in the ring |

## 4. Design-level exposure — dispositions (2026-07)

- **Entity cards outside the consistency check — addressed.** The check's
  audit prompt gains a RECORDED IDENTITIES section
  (`buildRecordedIdentitiesBlock`): every PC's recorded pronouns plus the
  matched in-scene connections', with kind `"identity"` in the response
  schema — prose that misgenders a character on record is now flagged on
  the GM review card like any other contradiction.
- **Recap / chronicle person handling — resolved by composition.** The
  recap and chronicle prompts are unchanged, but the recap call's system
  prompt now carries the full CHARACTER block and the pronoun-bearing PARTY
  roster (fixes 1–2 apply to all nine paths, recap included), so
  third-person recaps have the same identity data as live narration.
- **PC appearance has no data-model home — reaffirmed.** The vendor sheet
  has no description field; the player-authored biography (which now
  actually reaches the narrator) is the appearance anchor. Inherent to the
  data model, not a code defect.

## 5. What held up under audit

Entity cards render a `Pronouns:` row for any record that has them; the
interaction-class NPC guidance explicitly forbids reassigning pronouns;
connection seeding anchors one pronoun set across portrait / notes / card /
audio voice (finding E) and preserves an already-set value; the galley and
end-session vignette user messages lead with pronouns for every participant
(finding R); the audio voice map keys off the record with a safe default;
the chronicle scribe stays anchored to source prose; and speaker resolution
prefers the actual chat speaker before falling back (the
first-PC-in-campaign misattribution was already fixed).
