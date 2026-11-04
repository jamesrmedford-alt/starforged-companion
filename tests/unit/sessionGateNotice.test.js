/**
 * STARFORGED COMPANION
 * tests/unit/sessionGateNotice.test.js
 *
 * Issue #329 X14 (SESSION-GATE-SILENT-DROP) — the session gate tells the
 * author why nothing happened.
 *
 * Before Begin a Session, a player's typed narration and a card button's
 * forced move (the inciting card's ⚔ Swear this vow) hit the session gate,
 * which returned with no whisper, no notification and not even a console
 * line: the line sat in chat, the press greyed its button and vanished. Now
 * the author and the GMs are whispered "No session has begun" — once per
 * author for typed lines, every time for a button's move — and a claimed
 * card's forced move is held until a session begins, as the move lock holds
 * it (issue #325 W02).
 *
 * (Converted from the ninth audit's probe
 * tests/probes/session/sessionGateSilentDrop.probe.js.)
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.25, 0.35, 0.9] }));   // challenge 3, 4; action 6 — a strong hit
vi.mock('../../src/pacing/router.js', async (orig) => ({
  ...(await orig()), routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (orig) => ({
  ...(await orig()), interpretMove: vi.fn(async (text) => ({
    moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'iron', adds: 0, rationale: 'test',
    mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
  })),
}));
vi.mock('../../src/moves/abilityScanner.js', async (orig) => ({
  ...(await orig()), scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (orig) => ({
  ...(await orig()), confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/resolver.js', async (orig) => {
  const real = await orig();
  return { ...real, resolveMove: vi.fn((...args) => {
    const rng = vi.spyOn(Math, 'random');
    for (const d of control.dice) rng.mockReturnValueOnce(d);
    try { return real.resolveMove(...args); } finally { rng.mockRestore(); }
  }) };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

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

describe('issue #329 X14 — the session gate tells the author why nothing ran', () => {
  it("(a) a player's typed narration before Begin a Session: nothing runs, and nothing tells the player why", async () => {
    await reset(false);
    await typeLine();
    expect(moveCards()).toHaveLength(0);                 // the gate held (correct)
    // The player is told (no whisper, no notification before — the line just sat there).
    expect(told('pl-1')).toBe(true);
    const notice = table.cards(f => f.sessionGateNotice).at(-1);
    expect(notice.whisper).toContain('pl-1');
  }, 30_000);

  it('a typed line\'s author is told once, not once per line — and again after a session has run', async () => {
    await reset(true);
    silenceConsoleErrors();
    await typeLine();                                    // passes the gate: the told set starts afresh
    await table.client('gm-1').setSetting('campaignState', { ...table.world.campaignState(), sessionActive: false });
    await table.settle();
    await typeLine();
    await typeLine();
    await typeLine();
    expect(table.cards(f => f.sessionGateNotice)).toHaveLength(1);
  }, 30_000);

  it('(b) the inciting card\'s ⚔ Swear this vow before Begin a Session: the forced move is dropped and nobody is told', async () => {
    await reset(false);
    await postIncitingCardAndSwear();
    expect(moveCards()).toHaveLength(0);                 // nothing rolled (the gate held)
    expect(table.world.messages().some(m => m.flags?.['starforged-companion']?.forcedMoveId === 'swear_an_iron_vow')).toBe(true);
    // The GM who pressed it is told (the press vanished).
    expect(told('gm-1')).toBe(true);
    expect(table.cards(f => f.sessionGateNotice).at(-1).content).toMatch(/press the button again/);
  }, 30_000);

  it('a claimed card\'s forced move is held until Begin a Session starts one, then rolled', async () => {
    await reset(false);
    silenceConsoleErrors();
    await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: LINE, speaker: { actor: 'pc-kira' },
      flags: { 'starforged-companion': { bypassPacing: true, forcedMoveId: 'face_danger', deferWhileBusy: true } },
    }));
    await table.settle(); await table.drain();
    expect(moveCards()).toHaveLength(0);
    expect(table.cards(f => f.sessionGateNotice).at(-1).content).toMatch(/will be rolled once/);

    // The session begins: the held move is rolled.
    await table.client('gm-1').setSetting('campaignState', { ...table.world.campaignState(), sessionActive: true });
    await table.settle(); await table.drain();
    expect(moveCards()).toHaveLength(1);
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
