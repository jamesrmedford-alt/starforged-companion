# Suffer-routing audit (F16 Phase A)

Per-move audit of every entry in `src/schemas.js MOVES` against the
play-kit's outcome text (`docs/rules-reference/playkit-rules-and-coverage.md`
§1.3) and the current `CONSEQUENCE_MAP` in `src/moves/resolver.js:233`.

**Columns:**

- **Move / outcome** — moveId + strong / weak / miss.
- **Rulebook says** — verbatim outcome summary from the play kit.
- **Current map** — what `CONSEQUENCE_MAP[moveId](outcome, …)` returns today.
- **Phase B target** — required new payload. Three shapes:
  - **A** (auto-apply) — explicit `*Change` fields, no dialog.
  - **B1** (generic suffer pick) — `sufferPrompt: { kind: "any", amount, count }` → player picks any of the 6 suffer moves.
  - **B2** (enumerated) — `sufferPrompt: { kind: "enumerated", options: [...], allowComplication? }` → player picks from listed options.
  - **PtP** (Pay the Price routing) — no direct suffer; `pay_the_price` resolver branch handles via §3.5 of the scope doc.
  - **TEXT** (narrative only) — `otherEffect` only, no mechanical write.
  - **PROGRESS** — `progressMarked` already set, no suffer routing.

When an outcome has both an explicit delta (e.g. "+1 momentum") AND a
suffer choice (e.g. "and choose a suffer move"), both fire.

---

## Session moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `begin_a_session` (—) | Adjust flags, recap; optional vignette +1 momentum to all | `momentumChange:+1`, text | **A** (unchanged) |
| `set_a_flag` (—) | Declare content to approach mindfully | text only | **TEXT** (unchanged) |
| `change_your_fate` (—) | Choose ≥1 of five options | text only | **TEXT** (unchanged) |
| `take_a_break` (—) | *Move on* (+1 next non-progress) or *Stop for now* | text only | **TEXT** (unchanged) — +1 next-move bonus is per-roll, not a meter delta |
| `end_a_session` (—) | Mark milestones; +1 momentum if you note a focus | `momentumChange:+1`, text | **A** (unchanged) |

## Adventure moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `face_danger` strong | +1 momentum | `momentumChange:+1` | **A** (unchanged) |
| `face_danger` weak | succeed at a cost (suffer −1) | `sufferMoveTriggered: {move:"suffer", amount:1}`, text | **B1** `{ kind: "any", amount: 1, count: 1 }` |
| `face_danger` miss | Pay the Price | text only | **PtP** |
| `secure_an_advantage` strong | both — +2 momentum AND +1 next | `momentumChange:+2`, text | **A** (unchanged) — +1-next bonus is per-roll |
| `secure_an_advantage` weak | choose +2 momentum OR +1 next | `momentumChange:+2`, text | **B2** `{ kind: "enumerated", options: [+2 momentum, +1 next] }` |
| `secure_an_advantage` miss | Pay the Price | text | **PtP** |
| `gather_information` strong | +2 momentum | `momentumChange:+2` | **A** (unchanged) |
| `gather_information` weak | +1 momentum w/ complication | `momentumChange:+1` | **A** (unchanged) |
| `gather_information` miss | Pay the Price | text | **PtP** |
| `compel` strong | yes, +1 momentum | `momentumChange:+1` | **A** (unchanged) |
| `compel` weak | yes with demand | text | **TEXT** (narrative-only branch — demand is fictional) |
| `compel` miss | Pay the Price | text | **PtP** |
| `aid_your_ally` (—) | Make Secure an Advantage or Gain Ground | text | **TEXT** (routes via sub-move, no direct write) |
| `check_your_gear` strong | have it, +1 momentum | `momentumChange:+1` | **A** (unchanged) |
| `check_your_gear` weak | have it, but Sacrifice Resources (−1) OR Lose Momentum (−2) | text | **B2** `{ kind: "enumerated", options: [{label:"Sacrifice Resources", suffer:"sacrifice_resources", amount:1}, {label:"Lose Momentum", suffer:"lose_momentum", amount:2}] }` |
| `check_your_gear` miss | don't have it, Pay the Price | text | **PtP** |

## Quest moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `swear_an_iron_vow` strong | +2 momentum, path clear | `momentumChange:+2` | **A** (unchanged) |
| `swear_an_iron_vow` weak | +1 momentum, find path | `momentumChange:+1` | **A** (unchanged) |
| `swear_an_iron_vow` miss | significant obstacle (no PtP per play kit) | text | **TEXT** (rulebook explicit — no PtP) |
| `reach_a_milestone` (—) | Mark progress per vow rank | `progressMarked:1` | **PROGRESS** (unchanged) |
| `fulfill_your_vow` strong / weak / miss | progress vs challenge; legacy reward / undone | text only | **TEXT** + progress-reward writes are existing legacy-tick logic, not suffer |
| `forsake_your_vow` (—) | Choose costs (Endure Stress, Test Relationship, discard asset…) | text | **B2** `{ kind: "enumerated", options: [{label:"Endure Stress (-2)", suffer:"endure_stress", amount:2}, {label:"Test Your Relationship", route:"test_your_relationship"}, {label:"Discard an asset", route:"asset_discard"}, {label:"Narrative cost", complication:true}] }` — note routes that aren't suffer-direct |

## Connection moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `make_a_connection` strong | connection made (role + rank) | text | **TEXT** (downstream connection creation) |
| `make_a_connection` weak | as strong + complication | text | **TEXT** |
| `make_a_connection` miss | Pay the Price | text | **PtP** |
| `develop_your_relationship` (—) | Mark progress per rank | `progressMarked:1` | **PROGRESS** (unchanged) |
| `test_your_relationship` strong | Develop Your Relationship | text | **TEXT** (routes to sub-move) |
| `test_your_relationship` weak | Develop + demand | text | **TEXT** |
| `test_your_relationship` miss | Lose connection (PtP) OR Swear Iron Vow | text | **B2** `{ kind: "enumerated", options: [{label:"Lose the connection (Pay the Price)", route:"pay_the_price"}, {label:"Swear an Iron Vow", route:"swear_an_iron_vow"}] }` |
| `forge_a_bond` strong / weak / miss | progress; bond + reward / ask first / recommit | text | **TEXT** (all narrative + progress-side) |

## Exploration moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `undertake_an_expedition` strong | reach waypoint, mark progress | `progressMarked:0`, text | **PROGRESS** (the "0" is a known quirk — see B audit) |
| `undertake_an_expedition` weak | progress + cost — suffer −2 OR two suffer −1 OR peril at waypoint | `progressMarked:0`, text | **B2** `{ kind: "enumerated", options: [{label:"One suffer (-2)", kind:"any", amount:2, count:1}, {label:"Two suffers (-1 each)", kind:"any", amount:1, count:2}, {label:"Peril at the waypoint", complication:true}] }` |
| `undertake_an_expedition` miss | no progress, Pay the Price | text | **PtP** |
| `explore_a_waypoint` strong | opportunity or progress; +match → may Make a Discovery | `momentumChange:+2` or 0 (match), text | **A** (unchanged — Make a Discovery is operator-driven) |
| `explore_a_waypoint` weak | peril/ominous; +1 momentum | `momentumChange:+1` | **A** (unchanged) |
| `explore_a_waypoint` miss | hardship; +match → may Confront Chaos | text | **PtP** |
| `make_a_discovery` (—) | Mark 2 ticks on discoveries legacy; d100 table | text | **TEXT** (table roll is separate) |
| `confront_chaos` (—) | Decide 1/2/3 aspects, roll d100 | text | **TEXT** |
| `finish_an_expedition` strong / weak / miss | progress vs challenge; legacy reward / complication / lost | text | **TEXT** + progress-reward logic |
| `set_a_course` strong | arrive, +1 momentum | `momentumChange:+1` | **A** (unchanged — F15 feedback card fires here) |
| `set_a_course` weak | suffer −2 OR two suffer −1 OR complication at destination | text only | **B2** `{ kind: "enumerated", options: [{label:"One suffer (-2)", kind:"any", amount:2, count:1}, {label:"Two suffers (-1 each)", kind:"any", amount:1, count:2}, {label:"Complication at destination", complication:true, scope:"destination"}] }` |
| `set_a_course` miss | significant threat, Pay the Price | text | **PtP** |

## Combat moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `enter_the_fray` strong | +2 momentum AND in control | `momentumChange:+2`, `combatPosition:"in_control"` | **A** (unchanged) |
| `enter_the_fray` weak | choose +2 momentum OR in control | text | **B2** `{ kind: "enumerated", options: [{label:"+2 momentum", momentum:2}, {label:"In control", combatPosition:"in_control"}] }` |
| `enter_the_fray` miss | in bad spot | `combatPosition:"bad_spot"` | **A** (unchanged) |
| `gain_ground` strong | in control, choose 2 of {progress, +2 momentum, +1 next} | `momentumChange:+2`, `progressMarked:0`, `combatPosition:"in_control"` | **B2** `{ kind: "enumerated", multi:2, options: [{label:"Mark progress", progress:1}, {label:"+2 momentum", momentum:2}, {label:"+1 next move", nextBonus:1}] }` |
| `gain_ground` weak | in control, choose 1 of same | `combatPosition:"in_control"` | **B2** `{ kind: "enumerated", multi:1, options: [...same...] }` |
| `gain_ground` miss | bad spot, Pay the Price | `combatPosition:"bad_spot"` | **A** (position) + **PtP** |
| `strike` strong | progress×2, stay in control | `progressMarked:2`, `combatPosition:"in_control"` | **A** (unchanged) |
| `strike` weak | progress×2, exposed (bad spot) | `progressMarked:2`, `combatPosition:"bad_spot"` | **A** (unchanged) — "exposed" is narrative, no extra suffer |
| `strike` miss | bad spot, Pay the Price | `combatPosition:"bad_spot"` | **A** (position) + **PtP** |
| `clash` strong | progress×2, in control | `progressMarked:2`, `combatPosition:"in_control"` | **A** (unchanged) |
| `clash` weak | progress×1, counterblow, bad spot, Pay the Price | `progressMarked:1`, `combatPosition:"bad_spot"` | **A** (position+progress) + **PtP** |
| `clash` miss | bad spot, Pay the Price | `combatPosition:"bad_spot"` | **A** (position) + **PtP** |
| `react_under_fire` strong | +1 momentum, in control | `momentumChange:+1`, `combatPosition:"in_control"` | **A** (unchanged) |
| `react_under_fire` weak | succeed at suffer −1, stay bad spot | `sufferMoveTriggered: {move:"suffer", amount:1}`, `combatPosition:"bad_spot"` | **B1** `{ kind: "any", amount: 1, count: 1 }` + position |
| `react_under_fire` miss | Pay the Price | `combatPosition:"bad_spot"` | **A** (position) + **PtP** |
| `take_decisive_action` strong | prevail, +1 momentum, in control | `momentumChange:+1`, `combatPosition:"in_control"` | **A** (unchanged) |
| `take_decisive_action` weak | prevail at cost (d100 mini-table) | `combatPosition:"bad_spot"` | **TEXT** + auto-roll the weak-hit cost d100 (separate Phase) |
| `take_decisive_action` miss | defeated, Pay the Price | text | **PtP** |
| `face_defeat` (—) | abandon objective, Pay the Price | `combatPosition:"bad_spot"`, text | **A** (position) + **PtP** |
| `battle` strong | unconditional, +2 momentum | `momentumChange:+2` | **A** (unchanged) |
| `battle` weak | succeed, Pay the Price | text | **PtP** |
| `battle` miss | defeated, Pay the Price | text | **PtP** |

## Suffer moves (the executors fire from these)

These are the moves the SufferChoiceDialog routes INTO. They also have
their own action-roll outcomes that the rulebook calls "resist
rolls". Their consequences are where the actual meter writes happen.

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `lose_momentum` (—) | suffer −1/−2/−3 momentum; at min, apply to another suffer or clear progress | text | **A** but **amount comes from the caller** (suffer executor) — see §5.4 of scope. The map's job is to surface the at-min branch when the caller signals it. |
| `endure_harm` strong | Choose: +1 health (if not wounded) OR +1 momentum | text | **B2** `{ kind: "enumerated", options: [{label:"+1 health", health:1, requires:"!wounded"}, {label:"+1 momentum", momentum:1}] }` |
| `endure_harm` weak | If not wounded, may Lose Momentum (−1) for +1 health. Else press on. | text | **B2** `{ kind: "enumerated", options: [{label:"Trade momentum for health", chain:[{suffer:"lose_momentum", amount:1}, {health:1}], requires:"!wounded"}, {label:"Press on", noop:true}] }` |
| `endure_harm` miss | Suffer −1 health OR Lose Momentum (−2). At 0 health → mark wounded/permanently harmed or mortal-wound d100 | text | **B2** `{ kind: "enumerated", options: [{label:"-1 health", health:-1}, {label:"Lose Momentum (-2)", suffer:"lose_momentum", amount:2}] }` + executor handles at-0 (mortal-wound d100 already in `src/oracles/tables/sufferAndCombat.js`) |
| `endure_stress` (strong/weak/miss) | Symmetric to Endure Harm against spirit; desolation d100 at 0 | text | Same shape as endure_harm with spirit + shaken instead of health + wounded; desolation d100 |
| `companion_takes_a_hit` strong | Companion +1 health | text | **A** companion health +1 |
| `companion_takes_a_hit` weak | If companion health > 0, Lose Momentum (−1) for +1 companion health. Else press on. | text | **B2** `{ kind: "enumerated", options: [{label:"Trade momentum", chain:[{suffer:"lose_momentum", amount:1}, {companionHealth:1}], requires:"companionHealth>0"}, {label:"Press on", noop:true}] }` |
| `companion_takes_a_hit` miss | −1 companion health OR Lose Momentum (−2). At 0 + match → companion dies/destroyed; discard asset (Q2: manual). | text | **B2** `{ kind: "enumerated", options: [{label:"-1 companion health", companionHealth:-1}, {label:"Lose Momentum (-2)", suffer:"lose_momentum", amount:2}] }` + executor handles at-0+match → destruction card (Q2 — manual asset discard, surface a card with link to assets tab) |
| `sacrifice_resources` (—) | suffer −1/−2/−3 supply; at 0 mark unprepared; further losses redirect | text | **A** but **amount from caller** like lose_momentum. Executor handles the at-0 redirect (recursive sub-dialog: pick another suffer). |
| `withstand_damage` strong | Choose: +1 integrity (if not battered) OR +1 momentum | text | **B2** `{ kind: "enumerated", options: [{label:"+1 integrity", integrity:1, requires:"!battered"}, {label:"+1 momentum", momentum:1}] }` |
| `withstand_damage` weak | If not battered, may Lose Momentum (−1) for +1 integrity. Else press on. | text | **B2** same shape as endure_harm weak |
| `withstand_damage` miss | −1 integrity OR Lose Momentum (−2). At 0 → vehicle-damage d100 by vehicle type | text | **B2** + executor handles at-0 (vehicle-damage d100 in `src/oracles/tables/sufferAndCombat.js`). Command vehicle 0 → surface Overcome Destruction prompt (Q2-style card, not auto-fire). |

## Threshold moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `face_death` strong | Cast back into mortal world | text | **TEXT** |
| `face_death` weak | Noble sacrifice (die) OR Swear extreme vow + mark doomed | text | **B2** `{ kind: "enumerated", options: [{label:"Noble sacrifice (PC dies)", route:"character_death"}, {label:"Swear extreme vow + mark doomed", chain:[{route:"swear_an_iron_vow", rank:"extreme"}, {mark:"doomed"}]}] }` — Q2 family: prompt, don't auto-execute (PC death is permanent) |
| `face_death` miss | Dead | text | **TEXT** + prompt card (PC death is GM affordance, not auto) |
| `face_desolation` (strong/weak/miss) | Symmetric to Face Death against spirit; tormented instead of doomed | text | Same shape as face_death |
| `overcome_destruction` strong | Favor called in unconditional | text | **A** + XP grant per discarded-asset abilities (existing legacy logic) |
| `overcome_destruction` weak | Mark indebted + Swear extreme vow in their service | text | **A** mark indebted + prompt for Swear vow |
| `overcome_destruction` miss | As weak, but against your nature / for an enemy | text | **A** + prompt |

## Recover moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `sojourn` strong | community option: 2 recover moves auto-strong | text | **TEXT** (routes through sub-moves) |
| `sojourn` weak | 1 each; max 3 group | text | **TEXT** |
| `sojourn` miss | community demand OR Pay the Price | text | **B2** `{ kind: "enumerated", options: [{label:"Community demand (Swear an Iron Vow)", route:"swear_an_iron_vow"}, {label:"Pay the Price", route:"pay_the_price"}] }` |
| `heal` strong | clear wounded + +2 health (or +3 if not wounded) | text | **A** — explicit meter writes per branch |
| `heal` weak | as strong, Lose Momentum (−2) OR Sacrifice Resources (−2) | text | **B2** `{ kind: "enumerated", options: [{label:"Lose Momentum (-2)", suffer:"lose_momentum", amount:2}, {label:"Sacrifice Resources (-2)", suffer:"sacrifice_resources", amount:2}], chain:[/* + the heal write */] }` |
| `heal` miss | Pay the Price | text | **PtP** |
| `hearten` strong | clear shaken + +1 spirit (or +2 if not shaken) | text | **A** |
| `hearten` weak | as strong, Lose Momentum (−1) | `momentumChange:-1` | **A** (unchanged) |
| `hearten` miss | Pay the Price | text | **PtP** |
| `resupply` strong | clear unprepared + +1 supply (or +2 if not unprepared); may acquire item + +1 momentum | text | **B2** `{ kind: "enumerated", options: [{label:"Clear unprepared + supply", chain:[clear, supply]}, {label:"Acquire specific item + momentum", chain:[item, momentum]}] }` |
| `resupply` weak | as strong with cost/complication | text | **TEXT** (narrative cost — no specific meter delta) |
| `resupply` miss | Pay the Price | text | **PtP** |
| `repair` (strong/weak/miss) | Repair-point economy; spend rules | text | **TEXT** (separate Repair-Point feature already in `src/moves/repair.js`) |

## Legacy moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `earn_experience` (—) | +2 XP per filled legacy box (+1 once cleared) | text | **TEXT** + XP grant (existing logic) |
| `advance` (—) | Spend XP for new/upgrade asset | text | **TEXT** |
| `continue_a_legacy` (per-track) | inherit / see-it-through / aftermath options | text | **TEXT** + per-track choice (narrative + asset-import) |

## Fate moves

| Move / outcome | Rulebook says | Current map | Phase B target |
|---|---|---|---|
| `ask_the_oracle` (—) | yes/no with odds OR table | text | **TEXT** (handled by `rollYesNo` / `rollOracle`) |
| `pay_the_price` (—) | Choose obvious / Ask the Oracle / roll d100 | text | **PtP-EXECUTE** — Phase E: PtP resolver branch dispatches into the suffer executors based on the rolled entry's `sufferRoute` annotation. Narrative entries stay narrative. |

---

## Summary counts

- **A** (auto-apply, unchanged or new explicit deltas): 22 outcomes.
- **B1** (generic suffer pick): 2 outcomes (face_danger weak, react_under_fire weak).
- **B2** (enumerated): 19 outcomes.
- **PtP** (Pay the Price routing): 22 outcomes — all of these become resolvable in Phase E when PtP gets its `sufferRoute` annotations.
- **PROGRESS / TEXT** (no suffer-pipeline work): the remainder, ~50 outcomes.

## Phase-B audit-driven refactor task list

For each row marked **B1**, **B2**, or **A-with-new-delta** above:

1. Update the corresponding `CONSEQUENCE_MAP` entry in
   `src/moves/resolver.js` to emit the documented `sufferPrompt` /
   delta payload.
2. Keep `sufferMoveTriggered` for one release as a deprecated alias
   for `sufferPrompt.kind === "any"` (face_danger weak / react_under_fire
   weak — both currently emit it).
3. Update any unit test that asserts on the entry's current shape
   (most live in `tests/unit/resolver.test.js` and the various
   per-category Quench batches).

For each row marked **PtP**:

- No `CONSEQUENCE_MAP` change in Phase B. Phase E annotates the
  `PAY_THE_PRICE` d100 entries with `sufferRoute` and updates the
  `pay_the_price` resolver branch to dispatch.

## Tests likely to need updates (Phase B work list)

Based on grep against `tests/`:

- `tests/unit/resolver.test.js` — likely asserts on `mapConsequences`
  return shapes per move. Most assertions remain valid (explicit deltas
  unchanged); the ones that check `sufferMoveTriggered` need to also
  accept `sufferPrompt`.
- `tests/unit/persistResolution.test.js` — exercises the write path.
  No expected breaks (the new `sufferPrompt` is processed downstream
  by the dialog/executor pair in Phases C and D, not by the existing
  meter-write code).
- `src/integration/quench.js` — `coreResolverMatrix`,
  `moveOutcomeMatrix`, `momentumImpactMath`, and the per-move Quench
  batches assert on resolver output. Spot-check during Phase B; update
  to assert the new `sufferPrompt` field where applicable.

---

## Catalog

Phase A of F16 (suffer-move pipeline). Drives Phase B (resolver
refactor) and Phase C (executors). Closes the per-move documentation
gap that the prior `CONSEQUENCE_MAP` had — every cell now traces
back to a rulebook line.
