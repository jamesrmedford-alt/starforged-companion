# Suffer-move pipeline (F16) — scope

**Status:** 📋 PLANNED — scope doc for review before implementation.

**Catalog reference:** F16 (and F15 folded in) from the v1.7.0 / v1.7.1
playtest findings.

---

## 1. Problem

User-reported, playtest catalog F16:

> Weak hit on **Set a Course** resolved as "Arrived but with cost or
> complication. Choose: suffer move (-2) or two suffer moves (-1), OR face
> complication at destination." — the narrator wove it nicely ("fuel
> reserves tick down further than you'd like") but **no meter actually
> moved** (Supply still 5 on Faye's sheet).

Generalised: **suffer moves never fire mechanically across the move
pipeline.** Six suffer moves in Starforged
(`docs/rules-reference/playkit-rules-and-coverage.md:142-147`):

| Suffer move | Meter | Per-magnitude effect | At-meter-0 escalation |
|---|---|---|---|
| Lose Momentum | momentum | −1 / −2 / −3 | redirect to another suffer or clear progress |
| Endure Harm | health | −1 / −2 / −3 | also Lose Momentum by remainder; mortal-wound d100; wounded/maimed mark |
| Endure Stress | spirit | −1 / −2 / −3 | desolation d100; shaken/traumatized mark |
| Companion Takes a Hit | companion health | −1 / −2 / −3 | miss + match → companion destroyed (asset discard) |
| Sacrifice Resources | supply | −1 / −2 / −3 | unprepared mark; redirect to another suffer |
| Withstand Damage | integrity | −1 / −2 / −3 | vehicle-damage d100; command vehicle 0 → Overcome Destruction |

None of these write to the actor sheet during normal play. The narrator
describes consequence, the sheet sits stale, and **player trust in the
resolution pipeline erodes** — the same defect shape the player called
out for Set a Course (F16) and for `set_a_course` token movement (F15,
folded in).

## 2. Why it fails today

Two-step gap between resolver and persistResolution.

### 2.1 Resolver signals but doesn't quantify

`mapConsequences` (`src/moves/resolver.js:195`) returns a consequences
object with `momentumChange` / `healthChange` / `spiritChange` /
`supplyChange` (the four explicit meter deltas) **plus** a
`sufferMoveTriggered: { move, amount }` flag for outcomes that say
"make a suffer move (−1)". E.g.:

```js
// face_danger, weak hit (src/moves/resolver.js:259-263)
return {
  ...emptyConsequences(),
  sufferMoveTriggered: { move: "suffer", amount: 1 },
  otherEffect: "Success with a cost. Make a suffer move (-1).",
};
```

`sufferMoveTriggered.move === "suffer"` is a **generic** marker —
"the player must pick which suffer move to take and resolve it." It
doesn't pre-commit to a specific suffer.

### 2.2 persistResolution doesn't read the suffer signal

`persistResolution` (`src/moves/persistResolution.js:77-86`) writes the
four explicit meter deltas via `applyMeterChanges`. It never inspects
`sufferMoveTriggered`. So:

- Face Danger weak hit → `momentumChange=0, healthChange=0, …` plus
  `sufferMoveTriggered: {move:"suffer", amount:1}` → no meter writes.
- Set a Course weak hit → `otherEffect: "Choose: suffer move (-2) or
  two suffer moves (-1), OR face complication at destination."` →
  no meter writes.
- The downstream impact handler (`applySufferMoveDebilities`,
  `persistResolution.js:89`) only triggers when a meter hits 0 *via the
  explicit deltas* — so the wounded / shaken / unprepared marks also
  never fire from suffer-routed outcomes.

### 2.3 Pay the Price doesn't fan out either

Most miss outcomes route through Pay the Price. The PtP d100 table is
ported (`src/oracles/tables/payThePrice.js`) and the `!pay-the-price`
chat command rolls it. But the result is **chat-card text only** — no
meter writes, no debility marks, even when the rolled entry is
explicitly "Endure Harm (−2)" or "Sacrifice Resources (−1)".

## 3. Goals

1. **Every suffer move fires** when an outcome routes to it — meter
   changes land on the active character actor, debilities mark when at
   0, and the chat card reports what happened.
2. **Choice-shape outcomes prompt the player** with a focused dialog
   (Set a Course weak hit; Check Your Gear weak hit; "make a suffer
   move" pickers). Non-blocking — chat continues, narrator responds.
3. **Pay the Price routes its rolled result** through the same suffer
   pipeline. Rolling "Endure Harm (−2)" on PtP fires Endure Harm with
   −2 health.
4. **Narrator and sheet stay in sync.** The narrator's prose already
   describes the cost; this work makes the sheet describe the same
   cost.
5. **F15 folded in** — when `set_a_course` resolves to a non-miss, the
   ship-token-move card surfaces the same "what changed" footer that
   suffer dialogs use, so the user can see "Token moved to Hearth •
   Supply −2" instead of silence.

## 4. Non-goals

- **Pay the Price d100 narrative entries** (e.g. "A trusted ally is
  revealed as treacherous") stay narrative. We only auto-apply the
  d100 entries that map cleanly to a suffer move.
- **Recover-move auto-resolution.** Heal / Hearten / Resupply / Repair
  / Sojourn are user-driven and their mechanical writes already work
  via the existing `applyMeterChanges` path; they don't go through the
  suffer pipeline.
- **Suffer-cap edge cases beyond −6.** At momentum −6, the rulebook
  redirects to "another suffer move" or "clear progress per rank";
  v1 ships the redirect-to-another-suffer half and surfaces the
  clear-progress option in the dialog footer for manual GM action.
  Full automation of clear-progress is its own scope.
- **Companion asset destruction at 0 + miss + match.** v1 fires the
  meter write and the chat card reports "Companion destroyed — discard
  the asset." Actual asset-Item deletion via Foundry's Item API is its
  own scope (touches asset state and undo).
- **Vehicle destruction → Overcome Destruction.** Same shape as above
  for command-vehicle integrity at 0 — chat card prompts the move
  rather than auto-firing.
- **Multiplayer player→GM relay** (PERSIST-001). This scope inherits
  the existing GM-only write gate. Multiplayer activation is its own
  scope.

## 5. Architecture

### 5.1 Two outcome shapes

Every suffer-routing outcome falls into one of two shapes. The
classification is intrinsic to the rulebook text, not invented by us.

**Shape A — Auto-apply.** Outcome names a specific suffer move and
magnitude. No player choice required.

Examples:
- Endure Harm weak hit at health 2: −1 health, auto-applied (it's an
  Endure Harm outcome on the Endure Harm move).
- Pay the Price rolled result "Endure Stress (−2)": −2 spirit,
  auto-applied.
- Most direct suffer-move resolutions.

Wire: resolver emits explicit meter delta + suffer-routed metadata for
the chat card; persistResolution writes; debility handler fires; done.

**Shape B — Player-choice.** Outcome leaves room for the player to
pick. Two sub-shapes:

**B1 — Generic "make a suffer move (−N)".** Player picks which of the
six suffer moves to take, at magnitude N. The fictional context (am I
in combat / am I starving / is my ship under fire) governs the choice.
Examples: Face Danger weak hit (−1); React Under Fire weak hit (−1).

**B2 — Enumerated choice.** Outcome lists specific options. Examples:
- Check Your Gear weak hit → Sacrifice Resources (−1) OR Lose Momentum (−2).
- Set a Course weak hit → suffer (−2) one move OR suffer (−1) two
  moves OR narrative complication at destination.
- Forsake Your Vow → Endure Stress, Test Your Relationship, discard an
  asset, etc.

Wire: resolver emits a `choice` payload; a new `SufferChoiceDialog`
presents the options; on selection, persistResolution path fires the
chosen meter changes.

### 5.2 New consequence shape

Extend `MoveResolutionSchema.consequences` with one new field:

```js
sufferPrompt: null  // or:
  // {
  //   kind: "any" | "enumerated" | "complication",
  //   amount: 1 | 2 | 3,         // for any/enumerated
  //   count: 1 | 2,              // for "two suffer moves (-1)" style
  //   options: [{
  //     label: "Sacrifice Resources",   // display
  //     suffer: "sacrifice_resources",  // suffer-move id
  //     amount: 1,
  //   }, …],
  //   allowComplication: true,   // Set a Course third branch
  // }
```

`sufferMoveTriggered` stays for back-compat through one release; new
work uses `sufferPrompt`. The existing explicit meter delta fields are
unchanged.

### 5.3 SufferChoiceDialog

New ApplicationV2 in `src/moves/sufferDialog.js`:

- Inputs: `sufferPrompt`, the resolution, the active character (for
  meter context — "Health is at 2, Endure Harm would mark wounded").
- Renders the options as buttons. Each button has a one-line preview
  of what'll happen ("Sacrifice Resources: Supply 5 → 4").
- On selection: dispatches a write payload to the resolution-finalize
  path. Posts a chat card recording the choice ("Faye took
  Sacrifice Resources −1: Supply 5 → 4").
- "Complication at destination" option (Set a Course shape) writes a
  `pendingComplication` flag onto the active scene / sector record so
  the narrator surfaces it on next scene transition.
- **Blocking** (per Q1 resolution): the move-resolution pipeline awaits
  the dialog's selection promise before posting the narrator card or
  firing downstream side effects (entity detection, world journal
  writes, etc.). Players see the cost-and-then-prose ordering the
  rulebook envisions; narrator's "you pay a cost" prose lands grounded
  in the specific choice the player made.

**AFK-player escape hatch (required by Q1's blocking choice).** A
blocking dialog with an AFK player would stall the table indefinitely;
two mitigations:

- **GM override button.** Visible only on the GM client. Lets the GM
  pick on the player's behalf when the player is unavailable. Posts a
  chat card recording who picked (`GM resolved Faye's suffer choice
  on her behalf: Sacrifice Resources −1`).
- **Resolution-cancel button.** Closes the dialog without writing
  anything, and posts a chat card noting the resolution was abandoned
  (`Move resolution cancelled before suffer choice. No meter changes
  applied.`). Player can re-trigger the move when ready.

There is *no* auto-timeout default — silently picking a suffer on the
player's behalf without an explicit GM override would erode trust
worse than the silent-meter problem this whole pipeline exists to
fix.

Permissions:
- The player owning the active character resolves their own suffer
  choices.
- In solo-GM mode, the GM resolves.
- If a player triggers but no player is connected (multiplayer with
  AFK player), the dialog appears for the GM with a "this is X's call"
  marker, and the GM override button is the path forward.

### 5.4 Per-suffer-move executors

New module `src/moves/sufferExecutor.js` exporting six handlers, one
per suffer move. Each:

1. Reads the active character's current meter.
2. Computes the new meter value with the magnitude delta.
3. Calls `applyMeterChanges` with the right delta.
4. On at-0 conditions:
   - **Endure Harm**: Lose Momentum by remainder; if a miss-at-0
     occurred (from the calling move's outcome class), roll the
     mortal-wound d100 and surface the result on the chat card.
   - **Endure Stress**: same shape with desolation d100.
   - **Sacrifice Resources**: mark unprepared; surface the
     "redirect-to-another-suffer" option as a follow-up dialog.
   - **Withstand Damage**: roll vehicle-damage d100; command vehicle 0
     → surface Overcome Destruction prompt.
   - **Companion Takes a Hit**: if miss + match at 0, surface
     companion-destroyed card.
5. Posts a chat card describing the resolved suffer move.

The mortal-wound / desolation / vehicle-damage d100 tables are already
ported (`src/oracles/tables/sufferAndCombat.js`); the executors just
need to call into them at the at-0 branches.

### 5.5 Pay the Price routing

`pay_the_price` resolver branch (`src/moves/resolver.js:731`) currently
posts the rolled entry as `otherEffect` text. The fix:

1. PtP entries fall into two classes: **suffer-routable** (entries like
   "Endure Harm (−2)") and **narrative** (entries like "A trusted ally
   is revealed as treacherous").
2. Classify each of the 16 PtP entries at port time (already in
   `src/oracles/tables/payThePrice.js`); annotate the routable ones
   with a `sufferRoute: { move: "endure_harm", amount: 2 }` field.
3. When PtP resolves, if the rolled entry has `sufferRoute`, fire the
   matching suffer executor. Otherwise, current narrative path —
   narrator describes, GM adjudicates.

### 5.6 Data flow (Face Danger weak hit example)

```
Player input: "I sneak past the patrol"
  → interpreter classifies as face_danger
  → resolver rolls 4+3 vs [5, 7] → weak hit
  → mapConsequences("face_danger", "weak_hit", false) returns:
        {
          momentumChange: 0,
          sufferPrompt: { kind: "any", amount: 1, count: 1 },
          otherEffect: "Success with a cost. Make a suffer move (-1).",
        }
  → persistResolution writes the explicit deltas (all 0 here)
  → resolver finalize sees sufferPrompt non-null
  → SufferChoiceDialog opens for the active character's player
  → player picks "Lose Momentum"
  → sufferExecutor.lose_momentum(actor, 1) applies -1 momentum
  → chat card update: "Faye chose Lose Momentum -1 (Momentum: 3 → 2)"
  → narrator card posts next (already queued)
```

### 5.7 F15 fold-in

`src/index.js:819-834` already wires the `set_a_course` non-miss
post-resolution branch to ship-position updates. Today it's silent.
The fix:

- On `set_a_course` non-miss with a successful position update, post a
  follow-up card matching the SufferChoiceDialog footer style:
  `Set a Course resolved: Token moved to Hearth. Supply −2 (5 → 3).`
- On the weak-hit complication branch (player picks "complication at
  destination"), the card reads `Token moved to Hearth. Complication
  pending — narrator will surface on scene transition.`
- On miss (no arrival), the card reads `Course not held. Significant
  threat at the worst possible moment. Pay the Price.` followed by the
  PtP card (via the suffer pipeline above).

## 6. Audit deliverable

Before phase B code, produce a mapping table at
`docs/moves/suffer-routing-audit.md` covering all 40 moves in
`schemas.js MOVES`. For each move + outcome:

- Rulebook reference (page / play-kit row).
- Current `CONSEQUENCE_MAP` entry shape.
- Required shape: auto-apply (with explicit deltas) or sufferPrompt
  (with kind/amount/options).
- Gap (what's missing).

This is a docs-only PR. Its only job is to drive the implementation
phases without ambiguity.

## 7. Implementation phases

### Phase A — Audit (one docs PR)

Deliverable: `docs/moves/suffer-routing-audit.md` per §6. No code.

### Phase B — Resolver consequence-payload refactor (one PR)

- Add `sufferPrompt` field to `MoveResolutionSchema.consequences`.
- Refactor `CONSEQUENCE_MAP` per the audit: explicit deltas for
  Shape A, `sufferPrompt` for Shape B.
- Keep `sufferMoveTriggered` for one release as a deprecated alias.
- Unit-test every entry in the audit against the expected payload
  shape. ~40 new test cases, parametric.

### Phase C — Suffer executors + per-suffer Quench coverage (one PR)

- `src/moves/sufferExecutor.js` with the six handlers.
- Live Quench batches: one per suffer move, asserting `actor.system.*`
  values actually change after the executor runs.
- mortal-wound / desolation / vehicle-damage d100 integration at the
  at-0 branches.

### Phase D — SufferChoiceDialog (one PR)

- `src/moves/sufferDialog.js` ApplicationV2.
- Wired into `persistResolution`'s finalize path: on non-null
  `sufferPrompt`, open the dialog instead of completing silently.
- Player-vs-GM permission gate (PC's owning player picks; solo-GM mode
  resolves to GM; AFK player → GM with marker).
- Quench coverage: dialog renders with the right options; selection
  fires the corresponding executor; "complication" option writes the
  `pendingComplication` flag and skips the meter write.

### Phase E — Pay the Price routing (one PR)

- Annotate `PAY_THE_PRICE` entries with `sufferRoute` where applicable.
- `pay_the_price` resolver branch dispatches to suffer executors when
  the rolled entry has `sufferRoute`.
- Quench coverage: roll each routable entry's d100 boundary, assert
  the meter change lands; roll a narrative entry, assert silent /
  narrative-only behaviour.

### Phase F — F15 fold-in (one PR)

- Add the `set_a_course` post-resolution feedback card per §5.7.
- Quench coverage: weak hit with all three branches; miss path.

Each phase is independently shippable; user merges in order. Roughly
six PRs total. Phase A unblocks B-F; B unblocks the rest.

## 8. Test strategy

**Unit tests (every phase):**
- Resolver payload shape — every entry in the audit table.
- Executor logic — for each suffer move, every magnitude × every
  starting-meter value (deterministic ladder).
- Dialog interaction — render with each `sufferPrompt` kind.

**Quench batches (Phase C and D):**
- `suffer_endure_harm` — drives Endure Harm against a real character
  actor at health 2, asserts health drops to 1, then to 0 with the
  mortal-wound branch firing.
- `suffer_endure_stress` — symmetric for spirit + desolation.
- `suffer_lose_momentum` — momentum delta + at-min redirect.
- `suffer_sacrifice_resources` — supply + unprepared mark.
- `suffer_companion_hit` — companion health + destruction at 0 + miss
  + match (asset discard surfaced; v2 will actually delete).
- `suffer_withstand_damage` — integrity + vehicle-damage d100.
- `suffer_dialog_choice` — open the dialog, click each option, assert
  the right executor fires.

**Live-Forge verification (each PR's test plan):**
- Trigger Face Danger weak hit, pick a suffer move, confirm the sheet
  changes.
- Trigger Set a Course weak hit, pick all three branches in separate
  runs; confirm token movement card surfaces the outcome.
- Roll Pay the Price several times; confirm routable entries write to
  the sheet, narrative entries don't.

## 9. Resolved decisions

User reviewed and answered §9's open questions on 2026-06-01. The
architecture in §5 has been updated to reflect each pick; this section
records the decision and rationale for posterity.

### Q1. Dialog modality — **Blocking** (overrode the non-blocking recommendation)

The SufferChoiceDialog blocks the resolution pipeline. Narrator card
and downstream side effects (entity detection, world journal writes,
chronicle entries, audio narration, etc.) wait until the player
finishes the choice. Cost-and-then-prose ordering — narrator's "you
pay a cost" prose lands grounded in the specific suffer the player
took.

Trade-off accepted: AFK players can stall the table. Mitigation in
§5.3 — GM override + resolution-cancel buttons. No auto-timeout
default (silent default picks erode trust worse than the original
silent-meter bug).

### Q2. Companion-destroyed asset deletion — **Prompt GM, manual discard** (matched recommendation)

v1 chat card surfaces the destruction with a button that opens the
character sheet to the assets tab; GM (or asset-owning player) deletes
the Item by hand. v2 (follow-up PR after F16 ships and we learn how
often this fires in real play) automates the deletion behind an
"undo" affordance.

### Q3. Lose Momentum at −6 — **Dialog with both branches** (matched recommendation)

When Lose Momentum applies at momentum=−6, the SufferChoiceDialog
recurses into a sub-dialog presenting both options:
1. **Redirect** — sub-dialog of which of the other five suffer moves
   to take instead, at the same magnitude. Selecting recurses into
   the chosen suffer's normal execution path.
2. **Clear progress per rank** — opens a track-picker dialog with
   all of the character's active progress tracks (vow, expedition,
   connection, fight, scene challenge), GM (or track-owning player)
   picks which to clear.

Either path posts a chat card recording the choice.

### Q4. Multiplayer relay — **Ship with GM-only writes** (matched recommendation)

F16 v1 inherits PERSIST-001's GM-only write gate. The dialog renders
for the player, but the actor write only happens when a GM client is
connected. Multiplayer with no GM holds the resolution until a GM
connects (matches the rest of the meter-write pipeline; nothing new).
Player→GM relay is its own follow-up scope under PERSIST-001 and
unblocks F16's multiplayer-with-AFK-GM behaviour without further F16
work.

## 10. Risk

**Surface area.** The audit covers every move in `schemas.js`. Phase B
rewrites ~40 entries in `CONSEQUENCE_MAP`. Catch points: the existing
`coverage` Quench batches pin per-move outcome shapes against
`mapConsequences`; the rewrite has to thread the new
`sufferPrompt` field without breaking those assertions. Plan: update
the Quench batches in Phase B alongside the resolver rewrite.

**Player-vs-GM permission edge cases.** The dialog needs to appear for
the right person. Most failure modes are "wrong person sees it" or
"nobody sees it". Quench Phase D pins the happy paths; live-Forge
verification needs to cover multiplayer-with-AFK-player.

**Blocking-dialog stall.** Per Q1, the dialog blocks the pipeline.
AFK players or open-and-forgotten dialogs hold up the table. Mitigated
by §5.3's GM override and resolution-cancel buttons; live-Forge
verification needs to confirm both paths are reachable from the GM
client and produce sensible chat records. No auto-timeout — silent
defaults are worse than the original bug.

**Promise-await chain through the pipeline.** Blocking adds a real
await on the dialog's selection promise inside the resolution flow.
Existing pipeline assumes synchronous handoff between resolve → narrate
→ persist → entity-detection. The Phase B refactor needs to confirm
none of the existing post-resolution hooks rely on synchronous
execution, and that the chat-card system handles the "resolution
card posts, narrator card delayed" pattern cleanly. Phase B's audit
explicitly lists every callsite that depends on the post-resolve
timing.

**Existing tests encoding the bug.** Same defect class as the F6
klass titlecase tests — some existing Quench / unit tests may encode
the "no meter movement" current behaviour as correct. Phase A's audit
explicitly checks tests/* for any assertions that would need updating.

---

## 11. Out of scope (recap)

- Recover-move suffer-pipeline integration.
- Asset / Item deletion on companion destruction.
- Vehicle destruction → Overcome Destruction auto-fire.
- Lose-momentum-at-min clear-progress automation.
- PERSIST-001 multiplayer relay.
- Pay the Price narrative entries.
- Suffer dialogs blocking the narrator pipeline.

## 12. Catalog

Closes **F16** (suffer moves never mechanically applied — systemic).
Folds **F15** (`set_a_course` token-move feedback) into Phase F.

Tracked in `docs/scope-index.md` under Tier 3 / move-pipeline work.
