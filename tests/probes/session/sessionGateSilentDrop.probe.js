/**
 * PROBE — SESSION-03 SESSION-GATE-SILENT-DROP (ninth audit, area session)
 *
 * What the user does: nobody has pressed Begin a Session yet (a fresh world,
 * or the last session was ended). (a) A player types a line of narration.
 * (b) The GM ran `!incite` (or the Session panel's ✦ Envision Inciting
 * Incident, enabled whatever the session state) and presses the card's
 * "⚔ Swear this vow" — the quickstart card suggests Begin first, but nothing
 * enforces or mentions it.
 *
 * What happens: the session gate (src/index.js:780-791) `return`s before the
 * pipeline — with no notice, no whisper, not even the `console.debug`
 * breadcrumb the "No silent failures" decision requires of a deliberate no-op.
 * (a) The player's line just sits in chat. The help's Troubleshooting page
 * says the commonest cause of "no move card" is that no session has begun —
 * the player has to go and read it. (b) `executeSwearVow`
 * (src/session/swearVow.js:151-165, :380-389) disables the button locally and
 * posts the forced `swear_an_iron_vow` message; the gate drops it: no roll,
 * no vow, no connection, no card, the button greyed until a re-render. The
 * Progress Tracks panel already knows this gate exists and falls back
 * (`movePipelineAvailable`, src/ui/progressTracks.js:260) — the chat gate
 * and the card buttons do not.
 *
 * What should happen: the typist / presser is told the session has not begun
 * (a whisper to the author, or a notification on their client), as the
 * no-character case is (`postNoCharacterNotice`, issue #326 D8) — "any path
 * that was supposed to act and didn't must log on the client that made that
 * decision", and the player's view must not be indistinguishable from "it
 * worked".
 *
 * Controls: with the session active the same line and the same press reach
 * the pipeline and post a move card (today: passes).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/session/sessionGateSilentDrop.probe.js
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));   // challenge 3, 4; action 6 — a strong hit
vi.mock('../../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../../helpers/multiClient.js';
import { scriptClaude } from '../../helpers/faults.js';
import { CampaignStateSchema } from '../../../src/schemas.js';

const INCITING_TEXT = [
  'The relay at Paradox Station goes dark; a distress code older than the Forge repeats on every band.',
  '',
  'Suggested vow: Find who silenced the relay (dangerous)',
].join('\n');

let table;
const moveCards = () => table.cards(f => f.moveResolution);
const LINE = 'Kira slips past the sentry and forces the hatch open.';

beforeAll(async () => { table = await simulateTable({ users: [USERS.GM, USERS.P1] }); }, 30_000);
afterAll(() => table?.teardown());

async function reset(sessionActive) {
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false,
    campaignState: { ...CampaignStateSchema, sessionActive, currentSessionId: 'gs-s1', sessionNumber: 1,
      lastSessionTimestamp: new Date().toISOString(), currentSceneId: 'gs-scene', sceneTruths: [], clocks: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-test');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 } });
  scriptClaude(table, { fallback: () => 'Steel rings.\n```json\n{"newTruths":[],"stateChanges":[]}\n```' });
}

async function typeLine() {
  await table.client('pl-1').chat(LINE, { speaker: { actor: 'pc-kira' } });
  await table.settle(); await table.drain();
}

async function postIncitingCardAndSwear() {
  const { postIncitingIncidentCard } = await table.client('gm-1').import('../../src/session/incitingIncident.js');
  await table.client('gm-1').run(() => postIncitingIncidentCard({
    spark: { action: 'Seize', theme: 'Power' }, text: INCITING_TEXT, fallback: false, sessionId: 'gs-s1', narrationId: 'nar-incite',
  }));
  await table.settle();
  const card = table.cards(f => f.incitingIncidentCard)[0];
  table.client('gm-1').click(card._id, '[data-action="sf-swear-vow"]');
  await table.settle(); await table.drain();
  return card;
}

/** A whisper / card addressed to the user, or a notification on their client, about the session not having begun. */
function told(userId) {
  const said = /session (has not|hasn't|has not yet) begun|begin a session|no session/i;
  const card = table.world.messages().some(m =>
    said.test(m.content ?? '') && (!Array.isArray(m.whisper) || !m.whisper.length || m.whisper.includes(userId)));
  const notice = table.client(userId).notifications.some(n => said.test(n.message));
  return card || notice;
}

describe('SESSION-03 the session gate drops narration and card-button moves with no word to the table', () => {
  it("(a) a player's typed narration before Begin a Session: nothing runs, and nothing tells the player why", async () => {
    await reset(false);
    await typeLine();
    expect(moveCards()).toHaveLength(0);                 // the gate held (correct)
    // FAILS today: no whisper, no notification — the line just sits there.
    expect(told('pl-1')).toBe(true);
  }, 30_000);

  it('(b) the inciting card\'s ⚔ Swear this vow before Begin a Session: the forced move is dropped and nobody is told', async () => {
    await reset(false);
    await postIncitingCardAndSwear();
    expect(moveCards()).toHaveLength(0);                 // nothing rolled (the gate held)
    expect(table.world.messages().some(m => m.flags?.['starforged-companion']?.forcedMoveId === 'swear_an_iron_vow')).toBe(true);
    // FAILS today: the press vanishes — no notice to the GM who pressed it.
    expect(told('gm-1')).toBe(true);
  }, 30_000);

  it('control: with the session active the typed line reaches the pipeline and posts a move card', async () => {
    await reset(true);
    silenceConsoleErrors();
    await typeLine();
    expect(moveCards()).toHaveLength(1);
  }, 30_000);

  it('control: with the session active the ⚔ press reaches the pipeline and rolls Swear an Iron Vow', async () => {
    await reset(true);
    silenceConsoleErrors();
    await postIncitingCardAndSwear();
    expect(moveCards()).toHaveLength(1);
    expect(moveCards()[0].content).toMatch(/Swear an Iron Vow/i);
  }, 30_000);
});
