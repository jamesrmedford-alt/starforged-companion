/**
 * PROBE — R2F-4 CLOCK-VIGNETTE-NO-TIER-PASS (twelfth audit, round 2 — follow-up
 * of the narration report's "Not probed: clock vignettes run no capture
 * (intent undocumented)")
 *
 * Issue #286 D4 (decisions.md "Narrator side-data, draft confirm and
 * detection: nothing the narration said is lost or contradicted"): "Session
 * vignettes and vow scenes run the tier pass for the recorded entities they
 * name" — the developments a narration gives a recorded NPC go onto their
 * card ("Narrator-added details", the narrator's entity card). Every other
 * narration path runs it: moves and paced lines (runPostNarrationPasses /
 * schedulePacedTierUpdate), @scene (scheduleSceneAnswerCapture), oracle
 * follow-ups, the inciting incident, vow scenes, the galley and closing
 * vignettes (narrator.js:2802 scheduleNarrationCapture in
 * narrateSessionVignette), published reflections.
 *
 * Clock vignettes — the one narration whose job is a threat arriving
 * ("The clock … has TRIGGERED … describing the moment this threat
 * materialises", narrator.js:2871), under interaction latitude since
 * issue #322 V23 — never do:
 *   src/narration/narrator.js:2847-2923 narrateClockAdvancement applies its
 *     sidecar and returns the prose; no scheduleNarrationCapture;
 *   its three posters (clocks.js:871-901 fireClockVignette for !clock advance
 *     / fill and the panel; payThePriceClocks.js:131-160 for a price's advance;
 *     sessionLifecycleDialogs.js:300-336 at Begin a Session) post the card and
 *     run nothing after it.
 * D4 records no rejection for them (its "Rejected" list covers DETECTION after
 * vignettes and vow scenes, not the tier pass).
 *
 * So when a clock named for an NPC's plot triggers and its vignette has that
 * NPC do the thing ("Vance Oduya takes the harbourmaster hostage"), Vance's
 * card never learns it: the narrator's next ## VANCE ODUYA card says nothing
 * of it, while the same words in a session vignette land on the card.
 *
 * Driven on a booted GM / player table: the trigger through the GM's typed
 * `!clock advance`; the vignette and the tier pass answered by scripted
 * Claude replies; the 2 s capture delay advanced with fake timers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const NARRATION_MODEL = 'claude-sonnet-4-5-20250929';
const CLOCK = 'Vance Oduya hunts the crew';
const PROSE = 'Vance Oduya\'s enforcers seal the docks at dawn, and Vance himself takes the harbourmaster hostage.';
const DETAIL = 'Took the Bleakhold harbourmaster hostage to force the crew out of hiding';

let table, vanceId;
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
      clocks: [{ _id: 'clk-hunt', name: CLOCK, type: 'tension', segments: 4, filled: 3, active: true, advanceOdds: 'likely' }],
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    const user = call.userText ?? '';
    // The tier pass: the development of the recorded NPC the prose names.
    if (/established entity records/.test(user)) {
      return user.includes('harbourmaster hostage')
        ? JSON.stringify({ updates: [{ entityId: vanceId, detail: DETAIL, salience: 'significant' }] })
        : JSON.stringify({ updates: [] });
    }
    if (call.model === NARRATION_MODEL && /SIDECAR|NARRATOR ROLE/.test(call.system ?? '')) {
      return `${PROSE}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
    }
    return '{}';
  } });
  const { createConnection } = await gm().import('../../src/entities/connection.js');
  await gm().run(() => createConnection(
    { name: 'Vance Oduya', description: 'A Syndicate enforcer with a grudge against Kira.', pronouns: 'he/him', role: 'enforcer' },
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
  ));
  await table.settle();
  vanceId = table.actors.find(a => a?.flags?.[MODULE_ID]?.connection?.name === 'Vance Oduya')?.id;
  expect(vanceId, 'Vance\'s card exists (setup)').toBeTruthy();
});

const vanceDetails = () => (table.actors.get(vanceId)?.flags?.[MODULE_ID]?.connection?.generativeTier ?? []).map(e => e.detail);

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

describe('R2F-4 — a clock vignette that develops a recorded NPC', () => {
  it('the trigger vignette\'s development of Vance reaches his card, as a session vignette\'s does', async () => {
    await withTimers(() => gm().chat(`!clock advance "${CLOCK}"`));

    expect(table.cards(f => f.clockVignetteCard === true).map(m => m.flags[MODULE_ID].narrationText),
      'the trigger vignette posted (setup)').toEqual([PROSE]);
    expect(vanceDetails()).toEqual([DETAIL]);
  }, 60_000);

  it('control: the same prose as a session vignette lands on his card', async () => {
    const { narrateSessionVignette } = await gm().import('../../src/narration/narrator.js');
    await withTimers(() => gm().run(() => narrateSessionVignette({
      userMessage: 'Write the closing vignette.',
      campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
    })));

    expect(vanceDetails()).toEqual([DETAIL]);
  }, 60_000);
});
