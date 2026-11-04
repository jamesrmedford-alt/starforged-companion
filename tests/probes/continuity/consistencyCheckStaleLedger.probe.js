/**
 * PROBE — CONTINUITY-01 CONSISTENCY-CHECK-STALE-LEDGER
 * (src/narration/narrator.js applyNarratorSidecar → runConsistencyCheck, line 3499;
 *  src/factContinuity/consistencyCheck.js runConsistencyCheck → buildLedgerBlock,
 *  lines 65–69 and 89–94)
 *
 * What the user does: Pat's move is narrated — the interrogator lifts a cutting
 * torch; the sidecar ledgers the torch truth, the prisoner's "burned hand" state
 * and the interrogation-cell frame. Ren types the next move; while it waits at
 * its confirm dialog, Pat plays the X-Card on the torch beat and the GM resumes.
 * Ren confirms and the move is narrated. (Second case: instead of the X-Card the
 * GM types `!truth strike <id>` on the torch truth while the move waits.)
 *
 * What happens: narrateResolution narrates from the pipeline's pre-dialog
 * snapshot. Issue #325 W05 made the narration PROMPT read the scene ledgers
 * from the live store (buildNarratorExtras → liveSceneLedger), but
 * applyNarratorSidecar still hands that same snapshot to runConsistencyCheck
 * (narrator.js:3499), whose audit prompt is built by buildLedgerBlock over the
 * snapshot's sceneTruths / sceneState / sceneFrame and by
 * sessionRetractedFacts(snapshot) (consistencyCheck.js:65–69). So the Haiku
 * audit is told the X-carded torch truth, the burned-hand state and the cell
 * frame are the scene's BINDING facts: the removed beat is handed back as the
 * audit's ground truth, a narration that honours the X-Card is reported to the
 * GMs as contradicting it (a ◈ Narrative Review card naming the removed
 * content), and a struck fact sits under ACTIVE SCENE TRUTHS instead of
 * RETRACTED FACTS, so the narrator re-asserting it is exactly what the audit
 * does not catch.
 *
 * What should happen: the audit compares the prose against the ledger as it
 * stands in the store when the narration is built — rules/narrator-memory.md
 * 6b ("a narration is built from the ledgers as they stand in the store, never
 * a pre-dialog snapshot", W05) and docs/flows/narrator-consistency-flow.md §1
 * ("RETRACTED FACTS … never a truth the X-Card retracted … so the removed
 * content is not handed back", U07).
 *
 * Controls: before any X-Card or strike the audit lists the torch truth under
 * ACTIVE SCENE TRUTHS (the audit reads the ledger at all).
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({
  apiPost: vi.fn(async () => ({ content: [{ type: 'text', text: '{"contradictions":[]}' }], stop_reason: 'end_turn' })),
}));
vi.mock('../../../src/pacing/telemetry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  logConsistencyDecision: vi.fn(async () => {}),
}));

import { apiPost } from '../../../src/api-proxy.js';
import { applyNarratorSidecar, postNarrationCard } from '../../../src/narration/narrator.js';
import { suppressScene, clearXCard } from '../../../src/context/safety.js';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';

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
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, dismissedEntities: [],
  });
});

describe('CONTINUITY-01 the consistency check audits the ledger as it stands, not the pre-dialog snapshot', () => {
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

    // Today: the X-carded truth is the audit's BINDING truth, the removed state
    // and frame its scene — the removed beat, handed back.
    expect(section(prompt, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).not.toMatch(/cutting torch/);
    expect.soft(prompt).not.toMatch(/cutting torch/);           // nor under RETRACTED FACTS (U07: never named)
    expect.soft(section(prompt, 'ACTIVE SCENE STATE:', 'SHIP POSITION:')).not.toMatch(/burned hand/);
    expect.soft(section(prompt, 'SCENE FRAME', 'RECORDED IDENTITIES')).not.toMatch(/interrogation cell/);
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

    // Today: still under ACTIVE SCENE TRUTHS; RETRACTED FACTS says "(none)".
    expect(section(prompt, 'ACTIVE SCENE TRUTHS:', 'RETRACTED FACTS')).not.toMatch(/cutting torch/);
    expect.soft(section(prompt, 'RETRACTED FACTS', 'ACTIVE SCENE STATE:')).toMatch(/cutting torch/);
  });
});
