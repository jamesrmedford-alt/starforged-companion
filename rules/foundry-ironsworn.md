# External system reference — foundry-ironsworn

The foundry-ironsworn system source is public and attached to this project
as a git submodule at `vendor/foundry-ironsworn/`, pinned to the currently
installed system version. Before writing ANY code that reads or writes
Actor documents, Item documents, or any `actor.system.*` field, you MUST
read the relevant source file first. Never guess at schema paths — they
have changed between versions and cost significant debugging time when
wrong.

**Repository:** https://github.com/ben/foundry-ironsworn  
**Confirmed schema doc:** `docs/character/ironsworn-api-scope.md` — read this first,
then verify against live source if the version may have changed.

**Submodule mechanics.** If the vendor folder is empty (submodule not
initialised), run:
```bash
git submodule update --init --recursive
```

When the ironsworn system is updated in Foundry, update the submodule:
```bash
cd vendor/foundry-ironsworn && git pull origin main && cd ../..
git add vendor/foundry-ironsworn
git commit -m "chore: update ironsworn vendor to v{new version}"
```

**Key source files — read from vendor submodule (preferred) or fetch:**

```bash
# If vendor submodule is initialised (preferred — no network required):
cat vendor/foundry-ironsworn/src/module/actor/subtypes/character.ts
cat vendor/foundry-ironsworn/src/module/fields/MeterField.ts
cat vendor/foundry-ironsworn/src/module/actor/subtypes/starship.ts
cat vendor/foundry-ironsworn/src/module/actor/config.ts

# If vendor submodule is not initialised, fetch from GitHub:
# Character schema — all stat, meter, debility, legacy field paths
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/actor/subtypes/character.ts

# Momentum field — MAX, MIN, INITIAL, RESET_MIN constants, burnMomentum()
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/fields/MeterField.ts

# Starship schema — debility.battered, debility.cursed
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/actor/subtypes/starship.ts

# All actor types — character, shared, treasury, foe, site, starship, location
curl https://raw.githubusercontent.com/ben/foundry-ironsworn/main/src/module/actor/config.ts
```

The DataModel definitions for Actor / Item documents also live at:
```
vendor/foundry-ironsworn/src/module/model/actor/
vendor/foundry-ironsworn/src/module/model/item/
```

**Rules for ironsworn actor work — non-negotiable:**

1. Read `docs/character/ironsworn-api-scope.md` before touching `actorBridge.js`
2. If the system version may have changed, fetch the source files above
3. Never assume field paths from memory or documentation — verify from source
4. Use computed getters on the system model when available:
   - `actor.system.momentumMax` — not manual calculation
   - `actor.system.momentumReset` — not manual calculation
   - `actor.system.burnMomentum()` — not `actor.update({ momentum.value: x })`
5. All debilities are under `system.debility` (singular) — never `system.debilities`
6. Stats are flat on system: `system.edge`, not `system.stats.edge`
7. XP is a flat number: `system.xp`, not `system.xp.value`
8. Starship is a separate Actor (`type: "starship"`), not an embedded item
9. The system **does** ship `character` / `npc` / `foe` / `starship` /
   `location` / `shared` / `site` actor types — never assert an actor type
   doesn't exist without checking `vendor/.../system/template.json`. (A stale
   "no native NPC actor type" note once deferred connection migration for
   multiple releases.)
10. The Companion uses `character` for **both** PCs and NPC/connection cards,
    distinguished by `flags[MODULE].entityType` (present = NPC card, absent =
    PC). Sheet-label field mapping: the "Characteristics" header field is
    `system.biography`; the "Notes" tab is `system.notes` (verified against
    `sf-characterheader.vue` / `sf-notes.vue`).

**When updating `tests/setup.js` actor mock:**
The `makeTestActor` factory must match the real schema exactly.
After any schema correction, run `npm test` and confirm the mock
produces the same paths that live Foundry does.
