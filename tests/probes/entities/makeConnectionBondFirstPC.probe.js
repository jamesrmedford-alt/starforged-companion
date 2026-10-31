/**
 * PROBE — MAKE-CONNECTION-BOND-FIRST-PC
 *
 * A hit on Make a Connection auto-creates the NPC from the post-narration
 * detection pass: narrateResolution(resolution, campaignState,
 * { speakerActorId }) → runPostNarrationPasses(narration, resolution,
 * relevance, campaignState) — the speaker is NOT passed on — →
 * runDiscoveryDetection → routeEntityDrafts({ autoCreateConnection: true })
 * → registerConnectionOnActiveCharacter(record) (src/entities/
 * entityExtractor.js), which puts the connection's bond Item on
 * `getPlayerActors()[0]`: the first PC in the world, whoever rolled.
 * (Its own docstring says "multi-PC setups with no obvious target" are a
 * no-op; the roller IS the obvious target here.) The bond Item is what the
 * vendor sheet's Connections tab, CHARACTER STATE and the bond-Item mirrors
 * read, so Ren's new connection shows on Kira's sheet and never on Ren's.
 *
 * Correct behaviour (asserted): Ren rolls Make a Connection and gets the
 * bond Item; Kira (first PC, did not roll) does not.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const DETECTION = JSON.stringify({
  entities: [{ type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
    pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' }],
  renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const NARRATION = 'Sable Ortiz looks you over and names her price.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const user = JSON.stringify(body?.messages ?? []);
    const text = user.includes('ENTITY TYPES TO DETECT') ? DETECTION
      : String(body?.model ?? '').includes('haiku') ? '{}'
      : NARRATION;
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { narrateResolution } from '../../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const MODULE = 'starforged-companion';

function pc(id, name) {
  const a = global.makeTestActor({ id, type: 'character', name });
  global.game.actors._set(id, a);
  return a;
}
const bondItems = (actor) => (actor.items.contents ?? []).filter(i => i.type === 'progress' && i.system?.subtype === 'bond');

beforeEach(() => {
  global.game.actors._reset();
  global.game.folders._reset?.();
  global.game.user = { isGM: true, id: 'test-user-gm' };
  global.game.users._set([{ id: 'test-user-gm', isGM: true, active: true }]);
  global.ChatMessage._reset();
  const store = global.game.settings._store;
  store.clear();
  store.set(`${MODULE}.claudeApiKey`, 'sk-ant-test');
  store.set(`${MODULE}.chronicleAutoEntry`, false);
  store.set(`${MODULE}.campaignState`, {
    ...CampaignStateSchema,
    sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [],
    connectionIds: [],
  });
});

describe('PROBE MAKE-CONNECTION-BOND-FIRST-PC', () => {
  it("the auto-created connection's bond Item goes to the PC who rolled", async () => {
    silenceConsoleErrors();   // unrelated best-effort passes log in this bare unit env
    const kira = pc('pc-kira', 'Kira');   // first PC in the world
    const ren  = pc('pc-ren',  'Ren');    // the roller

    const resolution = {
      _id: 'res-1', moveId: 'make_a_connection', moveName: 'Make a Connection',
      outcome: 'strong_hit', outcomeLabel: 'Strong Hit', statUsed: 'heart', statValue: 2,
      playerNarration: 'I ask around the docks for someone who can move salvage.',
    };
    const relevance = { resolvedClass: 'discovery', entityIds: [], entityTypes: [], matchedNames: [],
      needsClarification: false, referenceType: 'none' };

    await narrateResolution(resolution, global.game.settings.get(MODULE, 'campaignState'),
      { relevance, speakerActorId: 'pc-ren' });

    const sable = global.game.actors.find(a => a.name === 'Sable Ortiz' && a.flags?.[MODULE]?.entityType === 'connection');
    expect(sable).toBeTruthy();   // the auto-create ran

    expect({ ren: bondItems(ren).map(i => i.name), kira: bondItems(kira).map(i => i.name) })
      .toEqual({ ren: ['Sable Ortiz'], kira: [] });
  });
});
