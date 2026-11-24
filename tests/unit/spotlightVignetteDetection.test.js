/**
 * STARFORGED COMPANION
 * tests/unit/spotlightVignetteDetection.test.js
 *
 * Issue #381 D3 — the spotlight vignette may do what an opening may not: a
 * new danger is a new plot element, so it runs at the interaction latitude,
 * and its capture runs the detection pass, as a clock vignette's does
 * (decisions.md: detection follows the latitude). A figure its prose
 * introduces is queued on the GMs' review card, stamped with the spotlight's
 * narration id (for the X-Card); the opening, at embellishment, queues none.
 *
 * Harness: clockVignetteDetection.test.js's (a booted GM / player table,
 * scripted Claude replies, fake timers for the 2 s capture delay), driven
 * through the player's Begin a Session with the Spotlight Vignette ticked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { uniformFor } from '../helpers/scriptedDice.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const SPOTLIGHT = 'Far off, a masked courier named Ilsa Marr burns a Syndicate writ before the beacon can read it.';
const OPENING = 'Mira counts the debts on her fingers.';
const ILSA = { type: 'connection', name: 'Ilsa Marr', description: 'A masked courier carrying Syndicate writs.',
  pronouns: 'she/her', role: 'courier', goal: null, confidence: 'high' };
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});

let table;
let restoreDie = null;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { restoreDie?.(); restoreDie = null; });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoSeedConnection: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'sd-s2',
      sessionNumber: 2, lastSessionTimestamp: new Date().toISOString(), safetyFlags: [], clocks: [], connectionIds: [],
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
      previousSessionSummary: { text: 'The crew docked at Bleakhold.', sessionId: 'sd-s1', sessionNumber: 1 },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-mira', name: 'Mira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    const user = call.userText ?? '';
    if (/ENTITY TYPES TO DETECT/.test(user)) return DETECTION(user.includes('Ilsa Marr') ? [ILSA] : []);
    if (/established entity records/.test(user)) return JSON.stringify({ updates: [] });
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) {
      const prose = /^SPOTLIGHT VIGNETTE/.test(user) ? SPOTLIGHT : OPENING;
      return `${prose}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
    }
    return '{}';
  } });
  // The Begin card's d100: 85, "Peril lies ahead or lurks just out of view".
  const before = Math.random;
  let left = 1;
  const dice = () => {
    if (left > 0 && /\brollDie\b[^\n]*[\\/]src[\\/]oracles[\\/]roller\.js/.test(new Error('who rolls').stack ?? '')) {
      left -= 1;
      return uniformFor(85, 100);
    }
    return before();
  };
  Math.random = dice;
  restoreDie = () => { if (Math.random === dice) Math.random = before; };
});

/** Begin a Session on the player's client, then let every timer it scheduled fire. */
async function begin() {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    table.client('pl-1').answerDialogs(d => d.submit({ 'input[name="vignette"]': true, 'input[name="galleyVignette"]': true }));
    await table.client('pl-1').chat('!begin-session');
    await table.settle();
    for (let i = 0; i < 6; i++) { await vi.advanceTimersByTimeAsync(1_100); await table.settle(); }
  } finally {
    vi.useRealTimers();
  }
  await table.drain();
}

const spotlightCards = () => table.cards(f => f.vignetteKind === 'spotlight_begin');
const draftRows = () => table.cards(f => f.draftEntityCard).flatMap(m => (m.flags[MODULE_ID].drafts ?? []).map(d => ({ name: d.name, narrationId: m.flags[MODULE_ID].narrationId })));

describe('the spotlight vignette\'s capture runs detection (issue #381 D3)', () => {
  it('the figure its prose introduces is queued on the GMs\' review card, stamped with its narration id', async () => {
    await begin();
    expect(spotlightCards().map(m => m.flags[MODULE_ID].narrationText), 'the spotlight posted (setup)').toEqual([SPOTLIGHT]);
    const narrationId = spotlightCards()[0].flags[MODULE_ID].narrationId;
    expect(draftRows()).toEqual([{ name: 'Ilsa Marr', narrationId }]);
  }, 60_000);

  it('control: never auto-created — a spotlight is no Make a Connection', async () => {
    await begin();
    expect(table.actors.filter(a => a?.flags?.[MODULE_ID]?.entityType === 'connection')).toEqual([]);
  }, 60_000);
});
