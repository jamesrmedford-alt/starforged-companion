/* global makeTestActor, structuredClone */
/**
 * PROBE — CARDS-03 NATIVE-FORGE-SOLE-ACTIVE-FALLBACK (ninth audit, area cards)
 *
 * What the user does: on the Starforged sheet's Connections tab the player
 * added a connection by hand with the sheet's own "+ Connection" ("Old
 * Mentor" — no module record exists for it: nothing recognises a hand-made
 * bond Item the way registerPlayerVowHook recognises a hand-made vow), marked
 * its track there, and rolls Forge a Bond on it from the sheet. The crew's
 * one module connection is Sable, un-bonded.
 *
 * What happens: the native consequence hook classifies the roll by the
 * speaker's Item of that name (nativeProgressSubtypeLookup → "connection")
 * and calls payForgedBondNative("Old Mentor") (src/index.js:5033-5037 →
 * :5050-5091), which resolves the name with findOpenConnection → the
 * develop ladder's full fallback (src/moves/developRelationship.js:492-525:
 * exact → whole words → the sole bonded connection → the sole active one).
 * "Old Mentor" matches nothing, so the sole active connection — Sable — is
 * forged: `bonded: true` on her record, "Bond forged" in her history, the
 * rank-scaled Bonds legacy paid, and "⚑ Bond Forged: Sable" posted for a
 * roll that was about someone else.
 *
 * What should happen: the sheet roll names its Item exactly, so a name that
 * matches no module connection is not a module connection — nothing is
 * forged and nothing is paid (rules/reachability.md §6: a name match "must
 * never … silently hit the wrong target"; the pipeline's own forge already
 * refuses a bonded fallback — FORGE-BONDED-FALLBACK — and `!sever` resolves
 * strictly for the same reason, issue #321 U14).
 *
 * Control: a sheet Forge a Bond on "Sable" forges Sable and pays the legacy.
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/cards/nativeForgeWrongConnection.probe.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { payForgedBondNative } from '../../../src/index.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
const legacy = (track) => game.settings.get(MODULE_ID, 'campaignState').legacyTracks?.[track]?.ticks ?? 0;
let sable;

beforeEach(() => {
  ChatMessage._reset();
  game.actors._reset();
  game.user = { id: 'gm-1', isGM: true, active: true };
  game.users = Object.assign([game.user], { get: (id) => (id === 'gm-1' ? game.user : null) });
  game.settings._store.clear();
  sable = makeTestActor({ id: 'npc-sable', name: 'Sable', type: 'character' });
  const flags = { [MODULE_ID]: { entityType: 'connection', connection: {
    _id: 'npc-sable', name: 'Sable', rank: 'dangerous', relationshipTicks: 8, bonded: false, active: true, history: [],
  } } };
  sable.flags = flags;
  sable.getFlag = (mod, key) => flags[mod]?.[key];
  sable.setFlag = async (mod, key, value) => { (flags[mod] ??= {})[key] = value; };
  game.actors._set(sable.id, sable);
  game.settings._store.set(`${MODULE_ID}.campaignState`, structuredClone({ ...CampaignStateSchema, currentSessionId: 's1', connectionIds: ['npc-sable'] }));
});

describe('CARDS-03 a sheet Forge a Bond on a hand-made connection the module does not know', () => {
  it('forges nobody — not the crew\'s one module connection', async () => {
    await payForgedBondNative('Old Mentor');

    // Today: Sable is bonded, her history says "Bond forged.", the Bonds legacy took 2 ticks.
    expect.soft(sable.flags[MODULE_ID].connection.bonded).toBe(false);
    expect.soft(legacy('bonds')).toBe(0);
    expect.soft(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.forgeABondCard)).toHaveLength(0);
  });

  it('control: a sheet Forge a Bond on Sable forges Sable and pays the Bonds legacy', async () => {
    await payForgedBondNative('Sable');
    expect(sable.flags[MODULE_ID].connection.bonded).toBe(true);
    expect(legacy('bonds')).toBe(2);
    expect(ChatMessage._created.filter(m => m.flags?.[MODULE_ID]?.forgeABondCard)).toHaveLength(1);
  });
});
