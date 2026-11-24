/* global silenceConsoleErrors -- tests/setup.js */
/**
 * STARFORGED COMPANION
 * tests/unit/spotlightVignetteNarrated.test.js
 *
 * Issue #381, slice 3 — the real Begin a Session on the multi-client table,
 * the Spotlight Vignette ticked. A player presses Begin; their client rolls
 * the table's d100 for the Begin card and sends the number alone; the
 * canonical GM reads the result off the table, narrates a short cutaway of
 * its own — before the opening — and posts it as a `spotlight_begin` card
 * whose first seed is the Begin card's own roll (count 7's check). Its scene
 * is its own and is ended with its card. With no narration to follow, the
 * Begin card says the result is the table's to envision; a narration that
 * was due and was not written leaves a line saying so. In the session's
 * memory the card is headed as a cutaway the characters did not see.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { installSceneDice, uniformFor } from '../helpers/scriptedDice.js';
import { CampaignStateSchema } from '../../src/schemas.js';
import { rollOracle } from '../../src/oracles/roller.js';

const MODULE_ID = 'starforged-companion';
const NARRATION_MODEL = 'claude-sonnet-5-5';
const RESULT_46 = rollOracle('spotlight_vignette', { roll: 46 }).result;

const SPOTLIGHT = 'Far off, a courier ship drops out of the lane with its beacon dark.\n```json\n' + JSON.stringify({
  newTruths: [], stateChanges: [],
  sceneFrame: { location: 'The Cinder lanes', present: ['a courier pilot'], situation: 'A beacon goes dark' },
  builtFrom: [{ n: 1, words: 'drops out of the lane with its beacon dark' }],
}) + '\n```';
const OPENING = 'Mira counts the debts on her fingers.\n```json\n{"newTruths":[],"stateChanges":[]}\n```';

/** Serve the Begin card's d100 to the spotlight roll on the pressing client (roller.js rollDie), once. */
function installSpotlightRoll(face) {
  const before = Math.random;
  let left = 1;
  const dice = () => {
    if (left > 0 && /\brollDie\b[^\n]*[\\/]src[\\/]oracles[\\/]roller\.js/.test(new Error('who rolls').stack ?? '')) {
      left -= 1;
      return uniformFor(face, 100);
    }
    return before();
  };
  Math.random = dice;
  return { restore() { if (Math.random === dice) Math.random = before; } };
}

let table;
let sceneDice;
let spotlightDie;

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());
afterEach(() => { sceneDice?.restore(); spotlightDie?.restore(); });

beforeEach(async () => {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, sessionLogAutoWrite: false,
    campaignState: {
      ...CampaignStateSchema, sessionActive: false, sessionStartedId: null, currentSessionId: 'sp-s2',
      sessionNumber: 2, lastSessionTimestamp: new Date().toISOString(), safetyFlags: [], clocks: [],
      currentSceneId: null, sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
      previousSessionSummary: { text: 'The Ashen Wake is grappled alongside off Bleakhold Station.', sessionId: 'sp-s1', sessionNumber: 1 },
    },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-mira', name: 'Mira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: (call) => {
    if (call.model !== NARRATION_MODEL) return '{}';
    return /^SPOTLIGHT VIGNETTE/.test(call.userText ?? '') ? SPOTLIGHT : OPENING;
  } });
  silenceConsoleErrors();
});

async function begin(client = 'pl-1', fields = {}) {
  table.client(client).answerDialogs(d => d.submit({ 'input[name="vignette"]': true, 'input[name="galleyVignette"]': true, ...fields }));
  await table.client(client).chat('!begin-session');
  await table.settle(); await table.drain();
}

const narrations = () => table.claude.calls.filter(c => c.model === NARRATION_MODEL);
const spotlightCall = () => narrations().find(c => /^SPOTLIGHT VIGNETTE/.test(c.userText ?? ''));
const card = (kind) => table.world.messages().find(m => m.flags?.[MODULE_ID]?.vignetteKind === kind);
const beginCard = () => table.world.messages().find(m => m.flags?.[MODULE_ID]?.sessionLifecycleCard && /Begin a Session/.test(m.content ?? ''));

describe('Begin a Session — the Spotlight Vignette is narrated, from the card\'s own roll', () => {
  it('the player\'s d100 reaches the GM as a number; the GM reads the table and narrates the result', async () => {
    spotlightDie = installSpotlightRoll(46);
    sceneDice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
    await begin('pl-1');

    expect(beginCard().content).toContain(`<strong>Spotlight vignette:</strong> ${RESULT_46}</p>`);
    expect(beginCard().content).not.toMatch(/yours to envision/);
    const call = spotlightCall();
    expect(call, 'the spotlight was narrated').toBeTruthy();
    expect(call.client).toBe('gm-1');
    expect(call.userText).toContain(`1. What the vignette shows — Spotlight Vignette (46): ${RESULT_46}`);
    // A quest with nobody's vow on record: the two pairs carry it.
    expect(call.userText).toContain('2. What happens — Action + Theme (14, 20): Bolster Debt');
    expect(call.userText).toContain('3. What it looks like — Descriptor + Focus (63, 18): Makeshift Container');
    // Its latitude is a cutaway's: it may bring the danger into play.
    expect(String(call.system)).toContain('## NARRATOR PERMISSIONS — INTERACTION MODE');
  }, 30_000);

  it('its card is its own kind, and its first seed is the Begin card\'s roll — before the opening', async () => {
    spotlightDie = installSpotlightRoll(46);
    sceneDice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
    await begin('pl-1');

    const spot = card('spotlight_begin');
    expect(spot, 'the spotlight card was posted').toBeTruthy();
    const f = spot.flags[MODULE_ID];
    expect(f).toMatchObject({ sessionVignetteCard: true, narratorCard: true, sessionId: 'sp-s2' });
    expect(f.builtFrom[0]).toMatchObject({ slot: 'spotlight', result: RESULT_46, tables: [{ id: 'spotlight_vignette', roll: 46 }] });
    expect(f.builtFrom[0].used).toBe('drops out of the lane with its beacon dark');
    // Spotlight, then the opening: the narrations and their cards in that order.
    const order = narrations().map(c => (/^SPOTLIGHT/.test(c.userText) ? 'spotlight' : /^OPENING/.test(c.userText) ? 'opening' : 'other'));
    expect(order.filter(k => k !== 'other')).toEqual(['spotlight', 'opening']);
    const messages = table.world.messages();
    const at = (kind) => messages.findIndex(m => m.flags?.[MODULE_ID]?.vignetteKind === kind);
    expect(at('spotlight_begin')).toBeGreaterThanOrEqual(0);
    expect(at('spotlight_begin')).toBeLessThan(at('galley_begin'));
    // The opening is not told the cutaway as where the last session stopped.
    const opening = narrations().find(c => /^OPENING/.test(c.userText));
    expect(opening.userText).not.toMatch(/beacon dark/);
  }, 30_000);

  it('its scene is its own: ended with its card, so the opening starts the session\'s scene clean', async () => {
    spotlightDie = installSpotlightRoll(46);
    sceneDice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
    await begin('pl-1');
    const opening = narrations().find(c => /^OPENING/.test(c.userText));
    // The cutaway's frame is not the scene the opening is told.
    expect(String(opening.system)).not.toMatch(/The Cinder lanes/);
  }, 30_000);

  it('in the session\'s memory its card is a cutaway the characters did not see', async () => {
    spotlightDie = installSpotlightRoll(46);
    sceneDice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
    await begin('pl-1');
    const gm = table.client('gm-1');
    const { getRecentNarrationContext } = await gm.import('../../src/narration/narrator.js');
    const ring = await gm.run(() => getRecentNarrationContext('sp-s2', 4));
    expect(ring).toMatch(/CUTAWAY — the table saw this; the characters did not, and know nothing of it:\nFar off, a courier ship/);
  }, 30_000);

  it('no narration to follow: the Begin card says the result is the table\'s to envision, and nothing is narrated', async () => {
    await table.client('gm-1').setSetting('narrationEnabled', false);
    spotlightDie = installSpotlightRoll(46);
    sceneDice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('pl-1');
    expect(beginCard().content).toContain(`${RESULT_46} — yours to envision.`);
    expect(spotlightCall()).toBeFalsy();
    expect(card('spotlight_begin')).toBeFalsy();
    expect(sceneDice.drawn).toHaveLength(0);
  }, 30_000);

  it('a narration due and not written: one line says so — no narrator card', async () => {
    scriptClaude(table, { fallback: (call) => {
      if (call.model !== NARRATION_MODEL) return '{}';
      return /^SPOTLIGHT VIGNETTE/.test(call.userText ?? '') ? '' : OPENING;
    } });
    spotlightDie = installSpotlightRoll(46);
    sceneDice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8, 1, 2, 3, 4, 5, 6, 7, 8]);
    await begin('pl-1');
    expect(card('spotlight_begin')).toBeFalsy();
    const line = table.world.messages().find(m => /the narrator did not write it: yours to envision/.test(m.content ?? ''));
    expect(line, 'the line was posted').toBeTruthy();
    expect(line.content).toContain(RESULT_46);
    expect(line.flags?.[MODULE_ID]?.narratorCard).toBeFalsy();
  }, 30_000);

  it('control: not ticked, no spotlight is rolled or narrated', async () => {
    sceneDice = installSceneDice([14, 20, 5, 6, 63, 18, 7, 8]);
    await begin('pl-1', { 'input[name="vignette"]': false });
    expect(spotlightCall()).toBeFalsy();
    expect(beginCard().content).not.toMatch(/Spotlight vignette/);
    expect(narrations().filter(c => /^OPENING/.test(c.userText))).toHaveLength(1);
  }, 30_000);
});
