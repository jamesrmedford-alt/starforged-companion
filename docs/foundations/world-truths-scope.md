# World Truths — Scope

**Status:** ✅ COMPLETE

Full oracle tables for all 14 *Ironsworn: Starforged* truth categories, with
sub-table resolution, campaign-state + journal storage, and narrator-context
formatting. Implemented in `src/truths/generator.js` and `src/truths/tables.js`.

---

## Overview

World Truths are campaign-level constants established at Session Zero. They are
injected into the narrator context as background lore and recorded
authoritatively in a **World Truths** journal entry. They do not change
mid-campaign.

The 14 categories: Cataclysm, Exodus, Communities, Iron, Laws, Religion, Magic,
Communication, Medicine, Artificial Intelligence, War, Lifeforms, Precursors,
Horrors.

---

## How it works

### Tables — `src/truths/tables.js`

`TRUTH_CATEGORIES`, `TRUTH_TABLES`, and `SUB_TABLES` hold all 14 category tables
plus the sub-tables that certain options resolve into (e.g. a chosen Cataclysm
foe rolls a sub-table for *which* foe).

### Generator — `src/truths/generator.js`

| Export | Behaviour |
|--------|-----------|
| `rollWorldTruths()` | Roll all 14 categories, returns a truth set keyed by category ID. |
| `rollCategory(categoryId)` | Roll a single category and resolve any sub-table. |
| (storage) | Persists the set to campaign state and to the **World Truths** journal entry (the authoritative record). |
| (context) | Two formatters — a **compact** form for ongoing narrator packets and a **full descriptive** form for the journal entry. |

---

## Chat commands

| Command | Effect | GM-only |
|---------|--------|---------|
| `!truths` | Open the foundry-ironsworn World Truths dialog | yes |
| `!lore` | Post a narrator-generated World Truths recap card (needs a Claude key) | yes |

---

## Relationship to System Asset Integration

This feature is the module's **own** truth roller/tables. It is distinct from the
foundry-ironsworn *canonical-truths digest* injected by
`src/system/campaignTruths.js` (see `system-asset-integration-scope.md`), which
surfaces the truths configured on the foundry-ironsworn world rather than rolling
new ones.

## Tests

Covered indirectly through the assembler and narrator-prompt suites
(`tests/unit/assembler.test.js`, `tests/unit/narratorPrompt.test.js`) and the
Quench narration batches.
