// tests/probes/infra/encounterCardVendorFoe.probe.test.js
//
// PROBE (infra audit) — ENCOUNTER-CARD-EMPTY.
//
// `buildEncounterCard` reads `actor.system.rank / description / features /
// drives`. A real foundry-ironsworn foe Actor (FoeModel: `system` = { dfid }
// only) keeps its rank and its Features / Drives / Tactics text on the
// embedded `progress` Item. Fed the REAL compendium entry from the vendored
// `foeactorssf` pack (the pack getCanonicalEncounterActor reads), the
// player's `!sfc encounter <name>` stat card is a bare name.
//
// Asserts the correct behaviour, so it FAILS today.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildEncounterCard } from '../../../src/system/encounterSpawn.js';

const PACK_DIR = path.resolve('vendor/foundry-ironsworn/json-packs/foe-actors-sf');

/** A Foundry-shaped foe Actor built from the vendored compendium JSON. */
function vendorFoe(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(PACK_DIR, file), 'utf8'));
  const items = (raw.items ?? []).map(i => ({ ...i }));
  items.contents = items;            // EmbeddedCollection-ish: .find / .contents
  return { ...raw, items };
}

describe('PROBE ENCOUNTER-CARD-EMPTY — stat card from a real foundry-ironsworn foe', () => {
  it('the vendored foe keeps rank + features on its progress item, not on system', () => {
    const chiton = vendorFoe('Chiton_95667d6a269e99a0.json');
    expect(chiton.system).toEqual({ dfid: '' });                       // FoeModel: dfid only
    const progress = chiton.items.find(i => i.type === 'progress');
    expect(progress.system.rank).toBe(2);
    expect(progress.system.description).toContain('Arachnid monsters with blade-like limbs');
  });

  it('the !sfc encounter card shows the foe rank and its features', () => {
    const card = buildEncounterCard(vendorFoe('Chiton_95667d6a269e99a0.json'));
    expect(card).toContain('Chiton');
    // Actual today: "<h3>Chiton</h3>" and nothing else.
    expect(card).toMatch(/Rank/);
    expect(card).toContain('Arachnid monsters with blade-like limbs');
  });
});
