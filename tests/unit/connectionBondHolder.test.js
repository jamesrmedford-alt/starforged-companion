/**
 * A connection the narration creates goes on the sheet of the PC the
 * narration was for — the roller — not the first PC (issue #321 U23).
 *
 * A hit on Make a Connection auto-creates the NPC from the post-narration
 * detection pass: narrateResolution(resolution, campaignState,
 * { speakerActorId }) → runPostNarrationPasses → runDiscoveryDetection →
 * routeEntityDrafts({ autoCreateConnection: true }) →
 * registerConnectionOnActiveCharacter(record), which put the connection's
 * bond Item on `getPlayerActors()[0]` whoever rolled: Ren's new connection
 * showed on Kira's sheet. The narration's PC now rides every hop, and a
 * draft card a narration posts carries it so Confirm puts the bond there too.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const DETECTION = JSON.stringify({
  entities: [{ type: 'connection', name: 'Sable Ortiz', description: 'A scarred salvage broker.',
    pronouns: 'she/her', role: 'salvage broker', goal: null, confidence: 'high' }],
  renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});
const NARRATION = 'Sable Ortiz looks you over and names her price.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async (_url, _headers, body) => {
    const user = JSON.stringify(body?.messages ?? []);
    const text = user.includes('ENTITY TYPES TO DETECT') ? DETECTION
      : String(body?.model ?? '').includes('haiku') ? '{}'
      : NARRATION;
    return { content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } };
  }),
}));

import { narrateResolution, narratePacedInput } from '../../src/narration/narrator.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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
afterEach(() => { vi.useRealTimers(); });

describe("a connection the narration creates is the roller's", () => {
  it("Make a Connection: the auto-created connection's bond Item goes to the PC who rolled", async () => {
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

  it("a paced narration's draft card carries the PC it was written for, for Confirm", async () => {
    silenceConsoleErrors();
    pc('pc-kira', 'Kira');
    pc('pc-ren',  'Ren');
    vi.useFakeTimers();

    await narratePacedInput('I look around the salvage market.', global.game.settings.get(MODULE, 'campaignState'),
      { speakerActorId: 'pc-ren' });
    await vi.runAllTimersAsync();   // the detection pass runs after its short delay

    const drafts = global.ChatMessage._created.filter(m => m.flags?.[MODULE]?.draftEntityCard);
    expect(drafts.map(m => [m.flags[MODULE].drafts.map(d => d.name), m.flags[MODULE].actorId]))
      .toEqual([[['Sable Ortiz'], 'pc-ren']]);
  });
});
