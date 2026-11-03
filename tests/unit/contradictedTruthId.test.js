// tests/unit/contradictedTruthId.test.js
// A Narrative Review card names the truth the consistency check caught
// (issue #326 W63). The audit's return schema has no truth id and the
// audited ledger lines carry none, so parseAuditResponse's `truthId` was
// always null, the card's `contradictedTruthId` always null, and the
// Retract dialog could not point at the fact. The id is now resolved from
// the catch against the active scene's truths (resolveContradictedTruthId),
// and the dialog lists that truth first, marked.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api-proxy.js', () => ({ apiPost: vi.fn() }));
vi.mock('../../src/pacing/telemetry.js', () => ({ logConsistencyDecision: vi.fn(async () => {}) }));

import { apiPost } from '../../src/api-proxy.js';
import { runConsistencyCheck, buildAuditPrompt, resolveContradictedTruthId } from '../../src/factContinuity/consistencyCheck.js';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { parseHTML } from '../helpers/cardDom.js';

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

describe('the review card knows which truth was contradicted (issue #326 W63)', () => {
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
    // It was null — no producer could ever fill it.
    expect(card.flags[MODULE_ID].contradictedTruthId).toBe('tr-limp0001');
  });
  it('the violated text is matched as the fact or as its whole ledger line', () => {
    const cs = { sceneTruths: [TRUTH, { ...TRUTH, id: 'tr-scar0002', fact: 'has a scar across one eye' }] };
    expect(resolveContradictedTruthId({ kind: 'truth', subject: 'Vance', violated: 'walks with a limp' }, cs)).toBe('tr-limp0001');
    expect(resolveContradictedTruthId({ kind: 'truth', subject: 'Vance', violated: 'Vance — walks with a limp.' }, cs)).toBe('tr-limp0001');
    expect(resolveContradictedTruthId({ kind: 'truth', subject: 'Vance', violated: 'Vance has a scar across one eye' }, cs)).toBe('tr-scar0002');
  });

  it('two subjects with the same fact: the catch\'s subject decides; still ambiguous, none is named', () => {
    const kira = { ...TRUTH, id: 'tr-kira0003', subject: { kind: 'text', text: 'Kira' } };
    const cs = { sceneTruths: [TRUTH, kira] };
    expect(resolveContradictedTruthId({ kind: 'truth', subject: 'Kira', violated: 'walks with a limp' }, cs)).toBe('tr-kira0003');
    expect(resolveContradictedTruthId({ kind: 'truth', subject: 'Someone', violated: 'walks with a limp' }, cs)).toBeNull();
  });

  it('control: a retracted truth, another kind, or no match names none', () => {
    expect(resolveContradictedTruthId({ kind: 'truth', subject: 'Vance', violated: 'walks with a limp' },
      { sceneTruths: [{ ...TRUTH, retracted: true }] })).toBeNull();
    expect(resolveContradictedTruthId({ kind: 'frame', subject: 'scene', violated: 'walks with a limp' }, { sceneTruths: [TRUTH] })).toBeNull();
    expect(resolveContradictedTruthId({ kind: 'truth', subject: 'Vance', violated: 'is a pilot' }, { sceneTruths: [TRUTH] })).toBeNull();
  });
});

// ── The Retract dialog points at the flagged truth ──────────────────────────

class FakeDialogV2 extends EventTarget {
  static last = null;
  constructor(options) { super(); this.options = options; this.element = null; FakeDialogV2.last = this; }
  async render() {
    this.element = parseHTML(`<div class="window-content">${this.options.content}</div>`);
    this.dispatchEvent(new Event('render'));
    return this;
  }
}

describe('the Retract dialog lists the truth the review caught first (issue #326 W63)', () => {
  const other = { ...TRUTH, id: 'tr-other0009', subject: { kind: 'entity', entityId: 'npc-elsewhere' }, fact: 'owes the guild' };
  beforeEach(() => {
    global.foundry.applications.api.DialogV2 = FakeDialogV2;
    game.settings._store.set(`${MODULE_ID}.campaignState`, {
      currentSessionId: 'sess-1', currentSceneId: 'sc-9',
      sceneTruths: [{ ...TRUTH }, other], sceneState: { bySubject: {}, sceneId: 'sc-9' },
    });
  });

  it('the flagged truth is listed first and marked, even outside the card\'s subjects', async () => {
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [], contradictedTruthId: 'tr-other0009' } } });
    const rows = [...FakeDialogV2.last.element.querySelectorAll('.sf-correct-row')];
    expect(rows[0].textContent).toContain('owes the guild');
    expect(rows[0].classList.contains('sf-correct-row--flagged')).toBe(true);
    expect(rows[0].textContent).toContain('flagged by the review');
  });

  it('control: a card that names no truth lists the in-scope truths, none marked', async () => {
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    const rows = [...FakeDialogV2.last.element.querySelectorAll('.sf-correct-row')];
    expect(rows.map(r => r.textContent).join(' ')).toContain('walks with a limp');
    expect(rows.some(r => r.classList.contains('sf-correct-row--flagged'))).toBe(false);
  });
});
