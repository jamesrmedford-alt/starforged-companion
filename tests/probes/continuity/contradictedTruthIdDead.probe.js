/**
 * PROBE — FC-13 CONTRADICTED-TRUTHID-DEAD
 * (src/factContinuity/consistencyCheck.js buildAuditPrompt / parseAuditResponse;
 *  src/world/worldJournal.js postContradictionNotification `contradictedTruthId`)
 *
 * What the user does: plays with the consistency check on (the default); it
 * catches the narrator contradicting a binding truth with high confidence.
 *
 * What happens: parseAuditResponse reads a `truthId` from each contradiction
 * and the review card stores it as `flags.contradictedTruthId` (the flow doc:
 * "The card carries contradictedTruthId + matchedEntityIds flags"). But the
 * audit prompt's return schema has no truthId, and the ledger block it audits
 * against carries no ids ("  Vance — walks with a limp"), so the model can
 * never give one: the flag is always null. Nothing reads it either — the
 * "Retract the offending fact" dialog is scoped by matchedEntityIds alone
 * (openCorrectionDialog), so it lists every scene / free-text truth, not "the
 * relevant entries" the help promises. A consumer reading a field no producer
 * writes, and a card flag nothing consumes (rules/reachability.md §1).
 *
 * What should happen: the id is produced (the prompt lists truth ids and asks
 * for the violated one) and used to scope the dialog — or the field and the
 * flag are removed.
 *
 * Asserts the CORRECT behaviour (the card names the contradicted truth);
 * fails today.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../../src/pacing/telemetry.js', () => ({ logConsistencyDecision: vi.fn(async () => {}) }));

import { apiPost } from '../../../src/api-proxy.js';
import { runConsistencyCheck, buildAuditPrompt } from '../../../src/factContinuity/consistencyCheck.js';

const MODULE_ID = 'starforged-companion';
const TRUTH = {
  id: 'tr-limp0001', subject: { kind: 'text', text: 'Vance' }, fact: 'walks with a limp',
  sessionId: 'sess-1', sceneId: 'sc-9', asserter: 'narrator', retracted: false, correctedTo: null,
};

beforeEach(() => {
  ChatMessage._reset();
  game.settings._store.clear();
  game.settings._store.set(`${MODULE_ID}.factContinuity.consistencyCheck`, true);
  game.settings._store.set(`${MODULE_ID}.claudeApiKey`, 'sk-ant-test');
  apiPost.mockReset();
});

describe('the review card knows which truth was contradicted', () => {
  it('control: the audit prompt carries the truth (as a line with no id)', () => {
    const prompt = buildAuditPrompt('TRUTHS:\n  Vance — walks with a limp', '', 'Vance sprints.', {});
    expect(prompt).toMatch(/Vance — walks with a limp/);
    expect(prompt).not.toMatch(/truthId|tr-limp0001/);   // the schema never asks for one
  });

  it('a high-confidence catch posts a card whose contradictedTruthId names the truth', async () => {
    apiPost.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify({ contradictions: [
      { subject: 'Vance', violated: 'walks with a limp', evidence: 'Vance sprints across the hangar', kind: 'truth', confidence: 'high' },
    ] }) }] });
    const cs = { currentSessionId: 'sess-1', currentSceneId: 'sc-9', sceneTruths: [TRUTH], sceneState: { bySubject: {} } };

    const { dispatched } = await runConsistencyCheck('Vance sprints across the hangar.', cs, { matchedEntityIds: [] });
    expect(dispatched).toBe(true);

    const card = ChatMessage._created.at(-1);
    // Today: null — no producer can ever fill it.
    expect(card.flags[MODULE_ID].contradictedTruthId).toBe('tr-limp0001');
  });
});
