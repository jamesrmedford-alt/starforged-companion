/**
 * STARFORGED COMPANION
 * tests/unit/clockVignetteTierPass.test.js
 *
 * Issue #345 AA33 (CLOCK-VIGNETTE-NO-TIER-PASS) — a clock vignette that
 * develops a recorded NPC never reached the NPC's card. Issue #286 D4 has
 * session vignettes and vow scenes run the tier pass for the recorded
 * entities they name (scheduleNarrationCapture), and every other narration
 * path runs one too; narrateClockAdvancement applied its sidecar and returned,
 * and none of its three post sites (fireClockVignette for `!clock advance` /
 * fill and the panel, advanceClocksOnPayThePrice, the Begin a Session roll)
 * ran anything after the card. So when a clock named for an NPC's plot
 * triggered and its vignette had that NPC do the thing ("Vance himself takes
 * the harbourmaster hostage"), the narrator's next card for Vance said
 * nothing of it, while the same words in a session vignette landed on it.
 *
 * narrateClockAdvancement now schedules the capture's tier pass with its
 * narration's id once its sidecar is applied — after the "still triggered"
 * check, so a trigger taken back before the reply records nothing — and every
 * post site goes through it. Detection (new figures) is not run, as for the
 * session vignettes (D4's "Rejected").
 *
 * Driven on a booted GM / player table: the trigger through the GM's typed
 * `!clock advance` and through a Pay the Price advance; the vignette and the
 * tier pass answered by scripted Claude replies; the 2 s capture delay
 * advanced with fake timers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

const vanceTier = () => table.actors.get(vanceId)?.flags?.[MODULE_ID]?.connection?.generativeTier ?? [];
const vanceDetails = () => vanceTier().map(e => e.detail);
const vignetteCards = () => table.cards(f => f.clockVignetteCard === true);
const tierCalls = () => table.claude.calls.filter(c => /established entity records/.test(c.userText ?? ''));

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

describe('issue #345 AA33 — a clock vignette\'s development of a recorded NPC reaches their card', () => {
  it('the trigger vignette of a typed !clock advance puts Vance\'s development on his card, as a session vignette\'s does', async () => {
    await withTimers(() => gm().chat(`!clock advance "${CLOCK}"`));

    expect(vignetteCards().map(m => m.flags[MODULE_ID].narrationText),
      'the trigger vignette posted (setup)').toEqual([PROSE]);
    expect(vanceDetails()).toEqual([DETAIL]);
    // Stamped with the vignette card's narration id — what an X-Card on it takes back (issue #329 X01).
    const narrationId = vignetteCards()[0].flags[MODULE_ID].narrationId;
    expect(narrationId, 'the card carries its narration id (setup)').toBeTruthy();
    expect(vanceTier()[0]?.narrationId).toBe(narrationId);
  }, 60_000);

  it('a Pay the Price that fills the clock: its trigger vignette\'s development reaches his card too', async () => {
    const { advanceClocksOnPayThePrice } = await gm().import('../../src/clocks/payThePriceClocks.js');
    await withTimers(() => gm().run(() => advanceClocksOnPayThePrice()));

    expect(vignetteCards().map(m => m.flags[MODULE_ID].narrationText),
      'the TRIGGERED vignette posted (setup)').toEqual([PROSE]);
    expect(vanceDetails()).toEqual([DETAIL]);
    expect(vanceTier()[0]?.narrationId).toBe(vignetteCards()[0].flags[MODULE_ID].narrationId);
  }, 60_000);

  it('an X-Card on the trigger vignette takes the development back off his card', async () => {
    await withTimers(() => gm().chat(`!clock advance "${CLOCK}"`));
    expect(vanceDetails(), 'the development landed (setup)').toEqual([DETAIL]);

    await table.client('pl-1').chat('!x');
    await table.settle();
    await table.drain();

    expect(vanceDetails()).toEqual([]);
  }, 60_000);

  it('control: a trigger taken back before the reply comes in records nothing on his card', async () => {
    const { narrateClockAdvancement } = await gm().import('../../src/narration/narrator.js');
    let text;
    await withTimers(async () => {
      text = await gm().run(() => narrateClockAdvancement({
        clock: { _id: 'clk-hunt', name: CLOCK, type: 'tension', filled: 4, segments: 4, triggered: true },
        campaignState: foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')),
        stillTriggered: () => false,
      }));
    });

    expect(text, 'not narrated (setup)').toBeNull();
    expect(tierCalls()).toHaveLength(0);
    expect(vanceDetails()).toEqual([]);
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
