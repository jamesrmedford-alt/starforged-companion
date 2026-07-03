# Character-detail flow — as implemented

How character identity details — pronouns, callsign, biography, impacts,
assets, appearance — reach (or fail to reach) the narrator, for player
characters and NPCs. Verified against source (v1.7.30 cycle). Sibling docs:
`narrator-context-flow.md` (the memory surfaces these details ride on),
`docs/narrator/narrator-memory-architecture.md`.

Prompted by: "How about character detail drift with the narrator, e.g.
pronouns, etc". Findings are tagged **WRONG-DETAIL** (stale/wrong data
injected), **LOSE-PLOT** (details fall out of context), **INVENT-RISK**
(nothing stops the narrator inventing/flipping a detail).

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
| CHARACTER block [8] (`buildCharacterBlock`) | **supported but starved** — see CHAR-PC-BLOCK-STARVED | n/a | renderer supports pronouns/callsign/bio/stats/impacts/assets/vows; the live pipeline feeds it 4 fields |
| PARTY roster [8b] (`buildPartyBlock`) | **names only** | n/a | multiplayer third-person narration gets no pronouns for anyone |
| ENTITIES IN SCENE [6] (`formatEntityCard`) | n/a | ✅ `Pronouns:` row when the record has them | |
| NPC-profile guidance (interaction class + tier pass) | n/a | ✅ "keep pronouns, never reassign" | prompt-level defense exists |
| Galley / end-session vignette user messages | ✅ `[she/her]` per participant | ✅ end-session NPC leads with pronouns | the finding-R fix — these are the only paths that pass full snapshots |
| Audio NPC voice | n/a | ✅ `pronounsToVoiceKey` from the record | mixed/unset → default voice |
| Perspective instruction (`PERSPECTIVE_DESCRIPTIONS`) | **no pronoun rule** | — | third person says only "Refer to characters by name" |
| Chronicle / campaign recap | prose-anchored | prose-anchored | scribe re-summarises narrator prose; recap told "third person for multiplayer" with no pronoun data beyond entry text |

## 3. Verified defects (open — awaiting direction; see `known-issues.md`)

1. **CHAR-PC-BLOCK-STARVED** (WRONG-DETAIL/INVENT-RISK — systemic): every
   narrator path sources its `character` from `getActiveCharacter`
   (`narrator.js`), which returns only `{ name, description, narratorNotes,
   meters }` — and `description` reads `actor.system.description`, a field
   that **does not exist** on the vendor character schema (always `''`).
   The full snapshot (pronouns, callsign, biography, notes, stats, impacts,
   assets, vows, connections) is read by `readCharacterSnapshot` and
   rendered by `buildCharacterBlock` — but the narrowing between them
   starves the block on all nine call sites (move, paced, @scene, oracle
   follow-up, both vignette modes, vow swearing, inciting, recap). In
   production the CHARACTER block is `Name:` (no pronouns, no callsign) +
   `Notes for narrator:` (flag, else biography) + `Current state:` meters.
   **The player's pronouns never reach the narrator** despite the sheet
   field, the snapshot reader, and the block renderer all supporting them —
   the narrator guesses from the character's name. Impacts, assets, and
   stats are equally invisible (the narrator can describe a wounded
   character as hale, or invent gear). Why unnoticed: unit tests pass
   hand-built full character objects straight to `buildCharacterBlock`;
   nothing exercises the `getActiveCharacter → buildCharacterBlock`
   composition.
2. **CHAR-PARTY-NAMES-ONLY** (WRONG-DETAIL — multiplayer):
   `buildPartyContext` sends bare actor names to the PARTY roster. In
   multiplayer, narration is third person for every PC, but the prompt
   carries pronouns for no one (the speaker's would come from [8] — see
   defect 1 — and the other party members' are fetched from nowhere at
   all). Misgendering a fellow player's character is the most user-visible
   pronoun drift there is, and nothing in the prompt guards it.
3. **CHAR-PERSPECTIVE-NO-PRONOUN-RULE** (INVENT-RISK): the third-person
   perspective instruction is one line — *"Refer to characters by name"* —
   with no rule to use recorded pronouns or to avoid inferring gender from
   names. Even with defects 1–2 fixed, nothing tells the model the pronouns
   in context are binding.
4. **CHAR-NPC-PRONOUN-ROLL-BLIND** (WRONG-DETAIL): the entity-detection
   schema (`buildCombinedDetectionPrompt`) captures `{ type, name,
   description, confidence }` — no pronouns — and `buildConnectionSeedData`
   carries none, so when a narrator-introduced NPC is confirmed,
   `seedConnectionActor` **rolls pronouns at random** (finding E's
   `pickConnectionPronouns`). Prose that established "she" has a 2/3 chance
   of getting a record that says otherwise — and that record then "anchors
   all surfaces" (portrait, seeded Notes, entity card, audio voice) *against*
   the established fiction. Applies to the inciting incident's vow-target
   NPC too — the campaign's central character. Finding E solved
   portrait/prose divergence for oracle-born NPCs; it is gender-blind for
   fiction-born ones.
5. **CHAR-SIDECAR-NO-PRONOUN-ANCHOR** (LOSE-PLOT): the sidecar's required
   identity-anchor rule asks for who/role/agenda/relationship — not
   pronouns. An unconfirmed NPC's gender lives only in the recent-narration
   ring; once the ring rolls past the introduction (and until someone
   confirms the entity), the narrator is free to flip it. This is also the
   capture point defect 4 needs: if the anchor recorded pronouns, the draft
   could carry them to the seed.

## 4. Design-level exposure

- **Entity cards are outside the consistency check.** NPC pronouns live on
  the card ([6]), and the broadened check (2026-07) audits frame / truths /
  retractions / state / ship — not cards. Prose misgendering a carded NPC
  is exactly the contradiction a GM would want flagged; extending the audit
  to card pronouns (or emitting pronouns as a state entry) is the natural
  next step if drift persists after the injection fixes.
- **Recap / chronicle person handling is prose-anchored only.** The scribe
  re-summarises narrator prose (pronouns ride along where the prose used
  them); the campaign recap is told "third person for multiplayer" with no
  roster or pronoun data. Low risk while entries carry names, worth a
  roster line if recap misgendering is observed.
- **PC appearance has no home.** The vendor sheet has no description field;
  biography is player-authored free text. If the player never writes one,
  the narrator invents appearance details each time with nothing to anchor
  them (they land in the ring/summary like any prose, then age out). This
  is inherent to the data model, not a code defect.

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
