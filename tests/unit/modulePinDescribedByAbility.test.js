/**
 * STARFORGED COMPANION
 * tests/unit/modulePinDescribedByAbility.test.js
 *
 * Issue #345 AA56 (MODULE-PIN-DESCRIPTION-EMPTY, the audit's R2I probe) —
 * the sibling of the fixed ASSET-ABILITY-TEXT on the deck plan's module
 * reader. The deck plan pins each installed Module asset and "click any pin
 * to see what it is" (help: Battle Stations → Deck-plan map).
 * shipMapScene.moduleDescription read `item.system.description ??
 * item.system.requirement`, but every canonical Starforged module ships both
 * as "" (vendor starforged-assets, category "Module" — 15 of 15; asset.ts
 * marks `description` deprecated): what a module does is its enabled
 * ability's text (`system.abilities[i].description`). "" is not nullish, so
 * the `??` never reached the next field, and every module pin — and the
 * vision pass's target list, built from the same descriptor — read
 * "Installed ship module.".
 *
 * Now a module is described by a non-empty `description`, else its enabled
 * abilities' text (actorBridge.readAssetAbilityTexts — HTML stripped,
 * @Compendium links reduced to their labels, as readAssets does), else a
 * non-empty `requirement`, else the generic line.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildModuleFeatures, buildDeckFeatureNoteData } from '../../src/moves/shipMapScene.js';
import { readAssets } from '../../src/character/actorBridge.js';

const ASSETS_DIR = path.resolve(__dirname, '../../vendor/foundry-ironsworn/json-packs/starforged-assets');
const vendored = fs.readdirSync(ASSETS_DIR)
  .map(f => JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, f), 'utf8')))
  .filter(d => d.system?.category === 'Module');
const medbay = vendored.find(d => d.name === 'Medbay');

const shipWith = (...items) => ({ id: 'ship-1', name: 'Wayward', items });
const describeModule = (item) => buildModuleFeatures(shipWith(item))[0]?.description;

describe('issue #345 AA56 — a module pin says what the module does', () => {
  it('the vendored Medbay (as installed from the compendium) is described by its ability', () => {
    expect(medbay).toBeTruthy();
    const [feature] = buildModuleFeatures(shipWith(structuredClone(medbay)));
    const [note] = buildDeckFeatureNoteData([feature], 'ship-1', { x: 0, y: 0 });
    expect(note.flags['starforged-companion'].deckFeatureDescription).toMatch(/medbay to Heal/i);
    // HTML-free, the move link reduced to its label.
    expect(feature.description).toMatch(/^When you use your medbay to Heal yourself or another patient/);
    expect(feature.description).not.toMatch(/[<>]|@Compendium|\{|\}/);
  });

  it('no canonical module pin falls back to the generic line', () => {
    expect(vendored).toHaveLength(15);
    const generic = vendored
      .map(d => buildModuleFeatures(shipWith(structuredClone(d)))[0])
      .filter(f => f.description === 'Installed ship module.')
      .map(f => f.label);
    expect(generic).toEqual([]);
  });

  it('every canonical module pin is its enabled ability\'s text, short and HTML-free — the line the narrator\'s asset reader gives', () => {
    for (const d of vendored) {
      const description = describeModule(structuredClone(d));
      expect(description.length, d.name).toBeLessThanOrEqual(160);
      expect(description, d.name).not.toMatch(/[<>]|@Compendium/);
      const [asset] = readAssets({ items: [{ ...structuredClone(d), type: 'asset' }] });
      const text = asset.abilities.join(' ');
      expect(text.startsWith(description.replace(/…$/, '')), d.name).toBe(true);
    }
  });

  it('a disabled ability is not what the module does; a module with no text keeps the generic line', () => {
    const item = structuredClone(medbay);
    item.system.abilities = item.system.abilities.map(a => ({ ...a, enabled: false }));
    expect(describeModule(item)).toBe('Installed ship module.');
  });

  it('a module with only a requirement is described by it', () => {
    const item = { ...structuredClone(medbay), system: { ...medbay.system, abilities: [], requirement: '<p>If your ship has room…</p>' } };
    expect(describeModule(item)).toBe('If your ship has room…');
  });

  it('control: a module whose text sits in system.description is described by it', () => {
    const item = { ...structuredClone(medbay), system: { ...medbay.system, description: '<p>Patch up the crew.</p>' } };
    const [feature] = buildModuleFeatures(shipWith(item));
    expect(feature.description).toBe('Patch up the crew.');
  });
});
