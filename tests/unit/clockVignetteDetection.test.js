/**
 * CLOCK-VIGNETTE-NO-DETECTION (known-issues; issue #345 AA33's residual — the
 * maintainer's call, applied as proposed). A clock vignette ran the tier pass
 * for the recorded NPCs it names (AA33) but never the detection pass: a new
 * figure, lore or a threat its prose introduced went nowhere. Issue #286 D4
 * rejected detection after vignettes because they ran at embellishment
 * latitude — and V23 gave `clock_advance` interaction latitude. The clock
 * vignette's capture now detects (`detect: true`), as an oracle follow-up's
 * does: a new figure is queued on the GMs' review card, stamped with the
 * vignette's narration id (for the X-Card).
 *
 * Harness: clockVignetteTierPass.test.js's (a booted GM / player table, the
 * GM's typed `!clock advance`, scripted Claude replies, fake timers for the
 * 2 s capture delay).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-5-5';
const CLOCK = 'The Syndicate closes in';
const PROSE = 'A masked courier named Ilsa Marr slips a sealed writ under the hatch: the Syndicate has bought the docks.';
const ILSA = { type: 'connection', name: 'Ilsa Marr', description: 'A masked courier carrying Syndicate writs.',
  pronouns: 'she/her', role: 'courier', goal: null, confidence: 'high' };
const DETECTION = (entities) => JSON.stringify({
  entities, renames: [],
  worldJournal: { lore: [], threats: [], factionUpdates: [], locationUpdates: [], stateTransitions: [] },
});

let table;
const gm = () => table.client('gm-1');

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false, autoSeedConnection: false,
    campaignState: {
      ...CampaignStateSchema,
      sessionActive: true, currentSessionId: 'cv-s1', sessionNumber: 4, currentSceneId: 'cv-scene', sceneTruths: [],
      lastSessionTimestamp: new Date().toISOString(), connectionIds: [],
      clocks: [{ _id: 'clk-syn', name: CLOCK, type: 'tension', segments: 4, filled: 3, active: true, advanceOdds: 'likely' }],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    const user = call.userText ?? '';
    if (/ENTITY TYPES TO DETECT/.test(user)) return DETECTION(user.includes('Ilsa Marr') ? [ILSA] : []);
    if (/established entity records/.test(user)) return JSON.stringify({ updates: [] });
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) {
      return `${PROSE}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
    }
    return '{}';
  } });
});

/** Run fn, then let every timer it scheduled — the vignette's (0 ms) and the capture's (2 s) — fire. */
async function withTimers(fn) {
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    await fn();
    await table.settle();
    for (let i = 0; i < 3; i++) { await vi.advanceTimersByTimeAsync(1_100); await table.settle(); }
  } finally {
    vi.useRealTimers();
  }
  await table.drain();
}

const vignetteCards = () => table.cards(f => f.clockVignetteCard === true);
const draftRows = () => table.cards(f => f.draftEntityCard).flatMap(m => (m.flags[MODULE_ID].drafts ?? []).map(d => ({ name: d.name, narrationId: m.flags[MODULE_ID].narrationId })));

describe('CLOCK-VIGNETTE-NO-DETECTION — a clock vignette\'s new figure reaches the GMs\' review card', () => {
  it('the trigger vignette introduces Ilsa Marr: she is queued on a draft card stamped with the vignette\'s narration id', async () => {
    await withTimers(() => gm().chat(`!clock advance "${CLOCK}"`));

    expect(vignetteCards().map(m => m.flags[MODULE_ID].narrationText), 'the vignette posted (setup)').toEqual([PROSE]);
    const narrationId = vignetteCards()[0].flags[MODULE_ID].narrationId;
    expect(draftRows()).toEqual([{ name: 'Ilsa Marr', narrationId }]);   // was: no detection, no card
  }, 60_000);

  it('control: never auto-created — a vignette is no Make a Connection', async () => {
    await withTimers(() => gm().chat(`!clock advance "${CLOCK}"`));
    expect(table.actors.filter(a => a?.flags?.[MODULE_ID]?.entityType === 'connection')).toEqual([]);
  }, 60_000);
});
