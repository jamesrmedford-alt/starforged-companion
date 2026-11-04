/**
 * STARFORGED COMPANION
 * tests/unit/consistencyCheckLiveLedger.test.js
 *
 * Issue #329 X02 (CONSISTENCY-CHECK-STALE-LEDGER) — the consistency check
 * audits the ledger as it stands, not the pre-dialog snapshot.
 *
 * A move held at its confirm dialog is narrated from the pipeline's
 * pre-dialog snapshot. Issue #325 W05 made the narration PROMPT read the
 * scene ledgers from the live store, but applyNarratorSidecar handed the
 * snapshot to runConsistencyCheck, whose Haiku audit prompt is built over it:
 * an X-Card played (and resumed) while the move waited was invisible — the
 * X-carded truth, state and frame were listed as the scene's BINDING facts —
 * and a `!truth strike` typed then sat under ACTIVE SCENE TRUTHS, not
 * RETRACTED FACTS. Now the audit is built over the ledger the sidecar persist
 * leaves in the store (auditCampaignState: the live ledgers with this
 * narration's own entries merged in by mergeSceneLedgers).
 *
 * The scene opens with an unrelated truth (the guard's keys) so the audit
 * still has something to run against once the X-carded beat is gone; with
 * nothing left, no audit is sent at all.
 *
 * (Converted from the ninth audit's probe
 * tests/probes/continuity/consistencyCheckStaleLedger.probe.js.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }], stop_reason: 'end_turn' })),
}));
vi.mock('../../src/pacing/telemetry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logConsistencyDecision: vi.fn(async () => {}),
}));

import { apiPost } from '../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard } from '../../src/narration/narrator.js';
import { suppressScene, clearXCard } from '../../src/context/safety.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-7';

const stored   = () => game.settings.get(MODULE_ID, 'campaignState');
const syncChat = () => { global.game.messages = { contents: ChatMessage._created.slice() }; };

/** A move narration as the narrator makes one: the sidecar applied with its id, then its card. */
async function narrate(narrationId, prose, sidecar, campaignState = stored()) {
  const raw = `${prose}\n\`\`\`json\n${JSON.stringify(sidecar)}\n\`\`\``;
  const text = applyNarratorSidecar(raw, campaignState, { narrationId, matchedEntityIds: [] });
  await postNarrationCard(text, { moveId: 'compel', outcome: 'weak_hit', _id: `res-${narrationId}` },
    stored(), { playerText: 'I press the prisoner for the code.', playerName: 'Kira', narrationId });
  return text;
}

/** The last audit the consistency check sent (apiPost(url, headers, body) — the body's system prompt). */
async function lastAuditPrompt() {
  await vi.waitFor(() => expect(apiPost).toHaveBeenCalled());
  return apiPost.mock.calls.at(-1)[2].system;
}

const section = (prompt, from, to) => (prompt.split(from)[1] ?? '').split(to)[0];

const TORCH = {
  newTruths:    [{ subject: 'the prisoner', fact: 'His hand was burned with a cutting torch' }],
  stateChanges: [{ subject: 'the prisoner', attribute: 'condition', value: 'burned hand' }],
  sceneFrame:   { location: 'the interrogation cell', present: ['the prisoner'], situation: 'The torch hovers over his hand' },
};
const NEXT = { newTruths: [], stateChanges: [] };

/** An earlier narration's truth, still standing: the audit runs against it after the torch beat is gone. */
const GUARD_TRUTH = {
  id: 'truth-guard-0001', subject: { kind: 'text', text: 'the guard' }, fact: 'Carries the cell keys on his belt',
  asserter: 'narrator', sessionId: SESSION, sceneId: 'sc-1', narrationId: 'nar-guard', createdAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  ChatMessage._reset();
  game.settings._store.clear();
  game.actors._reset();
  global.game.messages = { contents: [] };
  global.game.users = Object.assign([{ id: 'gm-1', isGM: true, active: true }], {
    get: (id) => (id === 'gm-1' ? { id: 'gm-1', isGM: true, active: true } : null),
  });
  global.game.user = global.game.users[0];
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 7, currentSceneId: 'sc-1',
    sceneTruths: [GUARD_TRUTH], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
  });
});

describe('issue #329 X02 — the consistency check audits the ledger as it stands, not the pre-dialog snapshot', () => {
  it('control: the audit of the torch narration lists its truth under ACTIVE SCENE TRUTHS', async () => {
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    const prompt = await lastAuditPrompt();
    expect(section(prompt, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).toMatch(/cutting torch/);
  });

  it('after the X-Card on the torch beat (played while the next move waited), the audit is not handed the removed beat', async () => {
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await vi.waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    expect(stored().sceneTruths.map(t => t.fact)).toContain('His hand was burned with a cutting torch');

    // Ren's move: the pipeline reads campaignState before its confirm dialog.
    const snapshot = foundry.utils.deepClone(stored());

    // Pat plays the X-Card on the torch beat; the GM resumes.
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    expect(stored().sceneTruths.find(t => /cutting torch/.test(t.fact))).toMatchObject({ retracted: true, retractedBy: 'xcard' });
    expect(stored().sceneFrame).toBeNull();
    await clearXCard();
    expect(stored().xCardActive).toBe(false);

    // Ren confirms: the move is narrated from the snapshot, and its prose audited.
    apiPost.mockClear();
    await narrate('nar-next', 'The corridor lights flicker as you walk out of the cell.', NEXT, snapshot);
    const prompt = await lastAuditPrompt();

    // The audit is not handed the removed beat — not as a binding truth, not
    // under RETRACTED FACTS (U07: never named), not as state or frame — and
    // still audits against what stands.
    expect(section(prompt, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).toMatch(/cell keys/);
    expect(section(prompt, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).not.toMatch(/cutting torch/);
    expect(prompt).not.toMatch(/cutting torch/);
    expect(prompt).not.toMatch(/burned hand/);
    expect(prompt).not.toMatch(/interrogation cell/);
  });

  it('the narration\'s own new truth is audited beside the live ledger', async () => {
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await vi.waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const snapshot = foundry.utils.deepClone(stored());

    apiPost.mockClear();
    await narrate('nar-next', 'Ren pockets the guard\'s keycard as you walk out.', {
      newTruths: [{ subject: 'Ren', fact: 'Pocketed the guard\'s keycard' }], stateChanges: [],
    }, snapshot);
    const truths = section(await lastAuditPrompt(), 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS');
    expect(truths).toMatch(/Pocketed the guard's keycard/);
    expect(truths).toMatch(/cutting torch/);
  });

  it('an X-Card that leaves the scene nothing to audit against sends no audit', async () => {
    game.settings._store.set(KEY, { ...stored(), sceneTruths: [] });
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await vi.waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const snapshot = foundry.utils.deepClone(stored());
    syncChat();
    expect(await suppressScene({}, { local: true })).toBe(true);
    await clearXCard();

    apiPost.mockClear();
    await narrate('nar-next', 'The corridor lights flicker as you walk out of the cell.', NEXT, snapshot);
    await new Promise(r => setTimeout(r, 20));
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('a `!truth strike` made while the next move waited is audited as RETRACTED, not as a binding truth', async () => {
    await narrate('nar-torch', "The interrogator lifts the cutting torch toward the prisoner's hand.", TORCH);
    await vi.waitFor(() => expect(apiPost).toHaveBeenCalledTimes(1));
    const torch = stored().sceneTruths.find(t => /cutting torch/.test(t.fact));
    expect(torch).toBeDefined();

    const snapshot = foundry.utils.deepClone(stored());

    // The GM strikes the torch truth while the move waits at its dialog.
    await applyFactContinuityCommand({ text: `!truth strike ${torch.id.slice(0, 8)}` }, { requesterIsGM: true });
    expect(stored().sceneTruths.find(t => t.id === torch.id)).toMatchObject({ retracted: true, retractedBy: 'gm' });

    apiPost.mockClear();
    await narrate('nar-next', 'The corridor lights flicker as you walk out of the cell.', NEXT, snapshot);
    const prompt = await lastAuditPrompt();

    // Under RETRACTED FACTS — what the audit catches the narrator re-asserting
    // — and not under ACTIVE SCENE TRUTHS.
    expect(section(prompt, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).not.toMatch(/cutting torch/);
    expect(section(prompt, 'RETRACTED FACTS', 'ACTIVE SCENE STATE:')).toMatch(/cutting torch/);
  });
});
