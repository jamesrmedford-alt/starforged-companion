# Starforged Companion — Ironsworn System API Scope

✅ **COMPLETE** — field path corrections applied to `actorBridge.js` and `tests/setup.js`

## Correct actorBridge.js based on foundry-ironsworn v1.27.0 source

**Priority:** Immediate — fixes broken character persistence  
**Source:** https://github.com/ben/foundry-ironsworn  
**Key files:**
- `src/module/actor/subtypes/character.ts` — CharacterModel and CharacterDataSourceData
- `src/module/actor/subtypes/starship.ts` — StarshipModel
- `src/module/fields/MeterField.ts` — MomentumField constants
- `system/template.json` — legacy flat schema (pre-DataModel, still used as reference)

---

## 1. Confirmed schema — all discrepancies from current actorBridge.js

The current `actorBridge.js` was written against guessed paths. Every path
is wrong. The confirmed schema from source is below.

### 1.1 Character Actor (`type: "character"`)

```
TypeScript interface: CharacterDataSourceData

STATS — flat directly on system, NOT nested under system.stats:
  actor.system.edge          number (1–4)
  actor.system.heart         number (1–4)
  actor.system.iron          number (1–4)
  actor.system.shadow        number (1–4)
  actor.system.wits          number (1–4)

METERS — nested with { value, max, min }:
  actor.system.health.value  number (0–5)
  actor.system.health.max    number (5)
  actor.system.health.min    number (0)

  actor.system.spirit.value  number (0–5)
  actor.system.spirit.max    number (5)
  actor.system.spirit.min    number (0)

  actor.system.supply.value  number (0–5)
  actor.system.supply.max    number (5)
  actor.system.supply.min    number (0)

  actor.system.hold.value    number (0–5) — Hold meter (often unused but exists)
  actor.system.hold.max      number (5)

MOMENTUM — nested with { value, max, min, resetValue }:
  actor.system.momentum.value      number (-6 to +10)
  actor.system.momentum.max        number (10)
  actor.system.momentum.min        number (-6)
  actor.system.momentum.resetValue number (stored, but use getter below)

MOMENTUM COMPUTED GETTERS (use these — they account for impacts automatically):
  actor.system.momentumReset   — computed: momentum.resetValue - impactCount, min 0
  actor.system.momentumMax     — computed: momentum.max - impactCount, min -6
  actor.system.canBurnMomentum — boolean

MOMENTUM BURN (method on CharacterModel):
  await actor.system.burnMomentum()
  — sets momentum.value to actor.system.momentumReset
  — use this instead of manually setting momentum to reset value

XP — flat number, NOT an object:
  actor.system.xp              number (0+)

DEBILITY — singular key, NOT "debilities":
  actor.system.debility.wounded          boolean
  actor.system.debility.shaken           boolean
  actor.system.debility.unprepared       boolean
  actor.system.debility.encumbered       boolean
  actor.system.debility.maimed           boolean
  actor.system.debility.corrupted        boolean
  actor.system.debility.cursed           boolean
  actor.system.debility.tormented        boolean
  actor.system.debility.permanentlyharmed boolean
  actor.system.debility.traumatized      boolean
  actor.system.debility.doomed           boolean
  actor.system.debility.indebted         boolean
  actor.system.debility.battered         boolean
  actor.system.debility.custom1          boolean
  actor.system.debility.custom1name      string
  actor.system.debility.custom2          boolean
  actor.system.debility.custom2name      string

COMBAT POSITION:
  actor.system.combatPosition  "inControl" | "inABadSpot" | "none" | undefined

LEGACIES:
  actor.system.legacies.quests            number (ticks)
  actor.system.legacies.questsXpSpent     number
  actor.system.legacies.bonds             number (ticks)
  actor.system.legacies.bondsXpSpent      number
  actor.system.legacies.discoveries       number (ticks)
  actor.system.legacies.discoveriesXpSpent number

BIOGRAPHICAL:
  actor.system.biography    string (HTML)
  actor.system.notes        string (HTML)
  actor.system.pronouns     string
  actor.system.callsign     string
```

### 1.2 Starship Actor (`type: "starship"`)

```
TypeScript interface: StarshipDataSourceData

  actor.system.notes            string (HTML)
  actor.system.debility.battered boolean
  actor.system.debility.cursed   boolean
```

Starships are standalone Actor documents (not embedded items). Find via:
```js
game.actors.filter(a => a.type === 'starship' && a.hasPlayerOwner)
```

### 1.3 Shared Actor (`type: "shared"`)

Used for shared supply pool in multiplayer:
```
  actor.system.biography  string
  actor.system.supply     ConditionMeterSource { value, max, min }
```

### 1.4 Actor types summary

Valid types: `character`, `shared`, `treasury`, `foe`, `site`, `starship`, `location`

Only `character` and `starship` are relevant to this module.

---

## 2. Actor update patterns — confirmed working

All updates use `actor.update()` with dot-notation string keys.

```js
// Stats
await actor.update({ 'system.edge': 3 });
await actor.update({ 'system.heart': 2 });

// Meters — always write to .value
await actor.update({ 'system.health.value': 4 });
await actor.update({ 'system.spirit.value': 3 });
await actor.update({ 'system.supply.value': 5 });
await actor.update({ 'system.momentum.value': 6 });

// Multiple meters in one call (more efficient — one document update)
await actor.update({
  'system.health.value':   newHealth,
  'system.spirit.value':   newSpirit,
  'system.momentum.value': newMomentum,
});

// Momentum burn (use the system method — don't set manually)
await actor.system.burnMomentum();

// Debility — singular key
await actor.update({ 'system.debility.wounded': true });
await actor.update({ 'system.debility.shaken': false });

// XP — flat number
await actor.update({ 'system.xp': currentXp + 2 });

// Legacies (ticks — 4 ticks = 1 box)
await actor.update({ 'system.legacies.quests': newTickCount });

// Combat position
await actor.update({ 'system.combatPosition': 'inControl' });
// or: 'inABadSpot', 'none'

// Starship damage
const starship = game.actors.find(a => a.type === 'starship' && a.hasPlayerOwner);
await starship.update({ 'system.debility.battered': true });
```

---

## 3. Momentum rules — from MomentumField source

```
MomentumField.MAX        = 10
MomentumField.MIN        = -6
MomentumField.INITIAL    = 2   (starting value)
MomentumField.RESET_MIN  = 0   (reset value floor — never below 0)

momentumReset (computed) = Math.clamp(
  momentum.resetValue - impactCount,
  RESET_MIN,       // 0
  momentum.max     // 10
)

momentumMax (computed) = Math.clamp(
  momentum.max - impactCount,
  MomentumField.MIN,   // -6
  MomentumField.MAX    // 10
)

impactCount = count of true values in actor.system.debility
(all debilities count, not just condition debilities — source confirms this)

Momentum burn rule (Ironsworn rules):
  If action die = current momentum → reset momentum to momentumReset
  This is the player's choice, handled by actor.system.burnMomentum()
```

**Critical correction to character-management-scope.md:**
The scope document stated only `CONDITION_DEBILITIES = ['wounded', 'shaken', 'unprepared', 'encumbered']` affect momentum. The system source shows ALL impacts reduce momentumMax and momentumReset — the `#impactCount` getter counts all true values in `system.debility`. Do not filter by category when calculating momentum bounds — use `actor.system.momentumMax` and `actor.system.momentumReset` directly.

---

## 4. Required changes to `actorBridge.js`

### 4.1 `readCharacterSnapshot()`

```js
// WRONG — current code
stats: {
  edge:   sys.stats?.edge   ?? 0,   // system.stats doesn't exist
  heart:  sys.stats?.heart  ?? 0,
  ...
},
meters: {
  health:   meterValue(sys.meters?.health),   // system.meters doesn't exist
  ...
},
debilities: readDebilities(actor),  // wrong key name used in readDebilities

// CORRECT
stats: {
  edge:   sys.edge   ?? 0,   // flat on system
  heart:  sys.heart  ?? 0,
  iron:   sys.iron   ?? 0,
  shadow: sys.shadow ?? 0,
  wits:   sys.wits   ?? 0,
},
meters: {
  health:   sys.health?.value   ?? 0,   // directly on system
  spirit:   sys.spirit?.value   ?? 0,
  supply:   sys.supply?.value   ?? 0,
  momentum: sys.momentum?.value ?? 0,
},
momentumMax:   actor.system.momentumMax   ?? 10,   // use computed getter
momentumReset: actor.system.momentumReset ?? 0,    // use computed getter
```

### 4.2 `readDebilities()`

```js
// WRONG — current code
const d = actor?.system?.debilities ?? {};   // wrong key: debilities vs debility

// CORRECT
const d = actor?.system?.debility ?? {};     // singular: debility

// Also add missing debilities from source:
return {
  corrupted:         !!d.corrupted,
  cursed:            !!d.cursed,
  tormented:         !!d.tormented,
  wounded:           !!d.wounded,
  shaken:            !!d.shaken,
  unprepared:        !!d.unprepared,
  encumbered:        !!d.encumbered,
  maimed:            !!d.maimed,
  permanentlyharmed: !!d.permanentlyharmed,   // missing from current code
  traumatized:       !!d.traumatized,         // missing from current code
  doomed:            !!d.doomed,              // missing from current code
  indebted:          !!d.indebted,            // missing from current code
  battered:          !!d.battered,            // missing from current code
};
```

### 4.3 `applyMeterChanges()`

```js
// WRONG — current code builds update object incorrectly (produces undefined)
// The exact bug: sys.meters?.health doesn't exist, so all reads return undefined,
// and the update object is built from undefined values

// CORRECT — read from the right paths, build update object explicitly
export async function applyMeterChanges(actor, meterChanges) {
  if (!actor) return;

  const sys = actor.system ?? {};

  // Read current values from correct paths
  const currentHealth   = sys.health?.value   ?? 0;
  const currentSpirit   = sys.spirit?.value   ?? 0;
  const currentSupply   = sys.supply?.value   ?? 0;
  const currentMomentum = sys.momentum?.value ?? 0;

  // Use system's computed getters for momentum bounds
  const momentumMax   = actor.system.momentumMax   ?? 10;
  const momentumReset = actor.system.momentumReset ?? 0;

  // Health max: 5, or 4 if wounded (Ironsworn rules)
  const healthMax = sys.debility?.wounded ? 4 : (sys.health?.max ?? 5);
  const spiritMax = sys.debility?.shaken  ? 4 : (sys.spirit?.max ?? 5);
  const supplyMax = sys.supply?.max ?? 5;

  // Build update object — only include changed meters
  const update = {};

  if (meterChanges.health !== undefined && meterChanges.health !== 0) {
    update['system.health.value'] = Math.clamp(
      currentHealth + meterChanges.health, 0, healthMax
    );
  }
  if (meterChanges.spirit !== undefined && meterChanges.spirit !== 0) {
    update['system.spirit.value'] = Math.clamp(
      currentSpirit + meterChanges.spirit, 0, spiritMax
    );
  }
  if (meterChanges.supply !== undefined && meterChanges.supply !== 0) {
    update['system.supply.value'] = Math.clamp(
      currentSupply + meterChanges.supply, 0, supplyMax
    );
  }
  if (meterChanges.momentum !== undefined && meterChanges.momentum !== 0) {
    update['system.momentum.value'] = Math.clamp(
      currentMomentum + meterChanges.momentum, momentumReset, momentumMax
    );
  }

  if (Object.keys(update).length === 0) return;

  console.log(`${MODULE_ID} | actorBridge: applying meter changes`, update);
  await actor.update(update);
  invalidateActorCache(actor.id);
}
```

### 4.4 `setDebility()`

```js
// WRONG
await actor.update({ [`system.debilities.${debilityKey}`]: value });

// CORRECT
await actor.update({ [`system.debility.${debilityKey}`]: value });
```

### 4.5 `awardXP()`

```js
// WRONG
const current = sys.xp?.value ?? 0;   // xp is a flat number, not an object
await actor.update({ 'system.xp.value': current + amount });

// CORRECT
const current = sys.xp ?? 0;
await actor.update({ 'system.xp': current + amount });
```

### 4.6 New: `burnMomentum()`

```js
/**
 * Burn momentum — resets momentum to actor.system.momentumReset.
 * Uses the system's built-in method which handles the rules correctly.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function burnMomentum(actor) {
  if (!actor?.system?.canBurnMomentum) return;
  await actor.system.burnMomentum();
  invalidateActorCache(actor.id);
}
```

### 4.7 New: `setCombatPosition()`

```js
/**
 * Set the character's combat position.
 * @param {Actor} actor
 * @param {"inControl"|"inABadSpot"|"none"} position
 * @returns {Promise<void>}
 */
export async function setCombatPosition(actor, position) {
  const valid = ['inControl', 'inABadSpot', 'none'];
  if (!valid.includes(position)) {
    console.warn(`${MODULE_ID} | Invalid combat position: ${position}`);
    return;
  }
  await actor.update({ 'system.combatPosition': position });
}
```

### 4.8 New: `applyStarshipDamage()`

```js
/**
 * Apply damage to the player's starship.
 * Starship is a separate Actor of type "starship".
 * @param {boolean} battered
 * @param {boolean} [cursed]
 * @returns {Promise<void>}
 */
export async function applyStarshipDamage(battered, cursed = undefined) {
  const starship = game.actors?.find(
    a => a.type === 'starship' && a.hasPlayerOwner
  );
  if (!starship) {
    console.warn(`${MODULE_ID} | No player-owned starship found`);
    return;
  }
  const update = {};
  if (battered !== undefined) update['system.debility.battered'] = battered;
  if (cursed   !== undefined) update['system.debility.cursed']   = cursed;
  await starship.update(update);
}
```

---

## 5. Required changes to `tests/setup.js` and `tests/unit/actorBridge.test.js`

### 5.1 `makeTestActor` in `setup.js`

The test factory must match the real schema. Replace the current mock:

```js
global.makeTestActor = (overrides = {}) => {
  const updateHistory = [];
  const sys = overrides.system ?? {};

  const actor = {
    id:             overrides.id ?? foundry.utils.randomID(),
    name:           overrides.name ?? 'Test Character',
    type:           overrides.type ?? 'character',
    hasPlayerOwner: overrides.hasPlayerOwner ?? true,

    system: {
      // Stats — flat on system
      edge:   sys.edge   ?? 2,
      heart:  sys.heart  ?? 2,
      iron:   sys.iron   ?? 3,
      shadow: sys.shadow ?? 1,
      wits:   sys.wits   ?? 2,

      // Meters
      health:   { value: sys.health?.value   ?? 5, max: 5, min: 0 },
      spirit:   { value: sys.spirit?.value   ?? 5, max: 5, min: 0 },
      supply:   { value: sys.supply?.value   ?? 3, max: 5, min: 0 },
      hold:     { value: sys.hold?.value     ?? 5, max: 5, min: 0 },
      momentum: {
        value:      sys.momentum?.value      ?? 2,
        max:        10,
        min:        -6,
        resetValue: sys.momentum?.resetValue ?? 2,
      },

      // XP — flat number
      xp: sys.xp ?? 0,

      // Debility — singular
      debility: {
        wounded:           false,
        shaken:            false,
        unprepared:        false,
        encumbered:        false,
        maimed:            false,
        corrupted:         false,
        cursed:            false,
        tormented:         false,
        permanentlyharmed: false,
        traumatized:       false,
        doomed:            false,
        indebted:          false,
        battered:          false,
        custom1:           false,
        custom1name:       '',
        custom2:           false,
        custom2name:       '',
        ...(sys.debility ?? {}),
      },

      // Legacies
      legacies: {
        quests:             0,
        questsXpSpent:      0,
        bonds:              0,
        bondsXpSpent:       0,
        discoveries:        0,
        discoveriesXpSpent: 0,
        ...(sys.legacies ?? {}),
      },

      // Combat position
      combatPosition: sys.combatPosition ?? 'none',

      // Computed getters (simplified for tests — not reactive)
      get momentumMax() {
        const impactCount = Object.values(this.debility)
          .filter(v => v === true).length;
        return Math.max(-6, 10 - impactCount);
      },
      get momentumReset() {
        const impactCount = Object.values(this.debility)
          .filter(v => v === true).length;
        return Math.max(0, this.momentum.resetValue - impactCount);
      },
      get canBurnMomentum() {
        return this.momentum.value > this.momentumReset;
      },
      burnMomentum: async function() {
        this.momentum.value = this.momentumReset;
      },
    },

    _updateHistory: updateHistory,

    update: async function(data) {
      updateHistory.push(data);
      // Apply the update to the mock system for subsequent reads
      for (const [key, value] of Object.entries(data)) {
        const parts = key.split('.');
        // e.g. 'system.health.value' → actor.system.health.value
        if (parts[0] === 'system') {
          let obj = this.system;
          for (let i = 1; i < parts.length - 1; i++) {
            obj = obj[parts[i]];
          }
          obj[parts[parts.length - 1]] = value;
        }
      }
    },
  };

  return actor;
};
```

### 5.2 `actorBridge.test.js` — update path references

All tests using `system.stats.edge`, `system.meters.health`, `system.debilities`,
or `system.xp.value` must be updated to use the correct paths. Run the tests
after the actorBridge.js fix and update any failing assertions to match the
corrected mock schema.

---

## 6. Impact on other files

### `src/moves/persistResolution.js`

If `persistResolution.js` constructs meter change objects, confirm the delta
keys match what `applyMeterChanges()` expects:
```js
{ health: -1, spirit: 0, supply: 0, momentum: +1 }  // deltas, not absolute values
```

### `src/context/assembler.js`

The character context section reads from `readCharacterSnapshot()`. After the
fix, snapshot paths change:
```js
// WRONG — current assembler may reference these
snap.stats.edge          // was using snapshot with wrong paths
snap.meters.health

// CORRECT after fix — snapshot shape is the same but values will now be correct
snap.stats.edge          // still the right key in the snapshot object
snap.meters.health       // still the right key in the snapshot object
```

The snapshot object shape doesn't change — only how it's populated changes.
No assembler changes needed IF snapshot keys are preserved.

---

## 7. Implementation order for Claude Code

1. Read `src/module/actor/subtypes/character.ts` from the ironsworn repo
2. Read `src/module/fields/MeterField.ts` from the ironsworn repo  
3. Fix `readCharacterSnapshot()` — correct all paths
4. Fix `readDebilities()` — `debility` not `debilities`, add missing keys
5. Fix `applyMeterChanges()` — fix path reads + fix update object construction
6. Fix `setDebility()` — `debility` not `debilities`
7. Fix `awardXP()` — flat number not object
8. Add `burnMomentum()`, `setCombatPosition()`, `applyStarshipDamage()`
9. Update `makeTestActor` in `tests/setup.js`
10. Run `npm test` — fix any test failures from schema corrections
11. Test in live Foundry — trigger a move and confirm character sheet updates

---

## 8. Verification in live Foundry

After implementing, run this in the Foundry console to confirm all paths work:

```js
const actor = game.user.character;
const sys = actor.system;

// Confirm correct paths
console.table({
  'edge (flat)':          sys.edge,
  'health.value':         sys.health?.value,
  'debility.wounded':     sys.debility?.wounded,
  'xp (flat number)':     sys.xp,
  'momentumMax (getter)': sys.momentumMax,
  'momentumReset (getter)': sys.momentumReset,
});

// Confirm update works
await actor.update({ 'system.momentum.value': sys.momentum.value - 1 });
console.log('New momentum:', actor.system.momentum.value);
```
