/**
 * R2I — MODULE-PIN-DESCRIPTION-EMPTY (WRONG-DETAIL, low) — sibling family of
 * CANONICAL-MOVE-TEXT-UNREAD: a foundry-ironsworn field read where the
 * system's documents keep nothing.
 *
 * The deck plan pins each installed Module asset and "click any pin to see
 * what it is" (help: Battle Stations → Deck-plan map). moduleDescription
 * (src/moves/shipMapScene.js:675-679 at 22bdbeb) reads
 * `item.system.description ?? item.system.requirement`, but every canonical
 * Starforged module ships both as "" (vendor/foundry-ironsworn/json-packs/
 * starforged-assets/*.json, category "Module" — 15 of 15; asset.ts marks
 * `description` "deprecated") — what a module does is its enabled ability's
 * text (`system.abilities[i].description`). "" is not nullish, so the `??`
 * never reaches the next field, and every module pin — and the vision pass's
 * target list built from the same descriptor — reads "Installed ship module.".
 *
 * Expected: the Medbay pin's description is the Medbay's ability text
 * ("When you use your medbay to Heal …"), HTML-free. Actual: "Installed ship
 * module.". Control: a module carrying its text in `system.description` is
 * described by it (the reader works; only the field is wrong for real data).
 *
 * Sibling of the fixed ASSET-ABILITY-TEXT (known-issues.md:1772 — readAssets
 * read a field the vendor asset lacks; actorBridge.readAssets now reads
 * `abilities[].description` and reduces @Compendium links to their labels):
 * the deck plan's module reader was not moved with it.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildModuleFeatures, buildDeckFeatureNoteData } from '../../../src/moves/shipMapScene.js';

const ASSETS_DIR = path.resolve(__dirname, '../../../vendor/foundry-ironsworn/json-packs/starforged-assets');
const vendored = fs.readdirSync(ASSETS_DIR)
  .map(f => JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, f), 'utf8')))
  .filter(d => d.system?.category === 'Module');
const medbay = vendored.find(d => d.name === 'Medbay');

const shipWith = (...items) => ({ id: 'ship-1', name: 'Wayward', items });

describe('R2I MODULE-PIN-DESCRIPTION-EMPTY — a module pin says what the module does', () => {
  it('the vendored Medbay (as installed from the compendium) is described by its ability', () => {
    expect(medbay).toBeTruthy();
    const [feature] = buildModuleFeatures(shipWith(structuredClone(medbay)));
    const [note] = buildDeckFeatureNoteData([feature], 'ship-1', { x: 0, y: 0 });
    expect(note.flags['starforged-companion'].deckFeatureDescription).toMatch(/medbay to Heal/i);
  });

  it('no canonical module pin falls back to the generic line', () => {
    const generic = vendored
      .map(d => buildModuleFeatures(shipWith(structuredClone(d)))[0])
      .filter(f => f.description === 'Installed ship module.')
      .map(f => f.label);
    expect(generic).toEqual([]);
  });

  it('control: a module whose text sits in system.description is described by it', () => {
    const item = { ...structuredClone(medbay), system: { ...medbay.system, description: '<p>Patch up the crew.</p>' } };
    const [feature] = buildModuleFeatures(shipWith(item));
    expect(feature.description).toBe('Patch up the crew.');
  });
});
