/**
 * STARFORGED COMPANION
 * tests/unit/roundWindowXCardedNarration.test.js
 *
 * Issue #342 Z32 (ROUND-WINDOW-XCARDED-NARRATION-SHOWN; the ui auditor's
 * probe). The Batch Mode Round window shows "Latest narration" — the newest
 * narrator card of the session — and its own filter leaves out a card the
 * X-Card removed (`xCarded`). But the X-Card writes the pause first
 * (campaignState: `xCardActive`, the narration's id on
 * `xCardedNarrationIds`) and flags the card after it; the window re-rendered
 * on the campaignState write, read the card before its flag landed, and
 * nothing re-rendered it when the flag did — every participant's window kept
 * showing the narration the X-Card removed. The filter now also leaves out a
 * narration the stored `xCardedNarrationIds` names (isNarrationXCarded), and
 * refresh() compares the latest narration as well as the view.
 *
 * Set-up from tests/unit/batchModeTable.test.js.
 */

/* global silenceConsoleErrors */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

const control = vi.hoisted(() => ({ dice: [] }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
  decidePacing: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async () => ({ moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', adds: 0, rationale: 'risky', mischiefApplied: false })),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async () => true),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/entities/entityExtractor.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runCombinedDetectionPass: vi.fn(async () => ({ worldJournal: [], entities: [], renames: [] })),
  appendGenerativeTierUpdates: vi.fn(async () => {}),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice.shift() ?? []) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const PROSE = 'The airlock seal splits and the corridor fills with the screaming of the dead crew.';
const ROUND_REPLY = `${PROSE}\n\`\`\`json\n{"newTruths":[],"stateChanges":[]}\n\`\`\``;
// challenge 3 and 4, action die 6 (+edge 2 = 8): a strong hit (no upgrade step).
const STRONG = [0.25, 0.35, 0.9];

let table;
let savedDocument;
const round = () => table.world.getSetting('batchMode.round');
let seq = 0;

beforeAll(async () => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  table = await simulateTable({ users: [USERS.GM, USERS.P1, USERS.P2] });
}, 30_000);
afterAll(() => { table?.teardown(); globalThis.document = savedDocument; });

beforeEach(async () => {
  control.dice = [];
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false, narratorSessionSummary: false, combatTrackerEnabled: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [] } });
  table.addActor({ id: 'pc-ren',  name: 'Ren',  ownership: { 'pl-2': 3 }, items: { contents: [] } });
  scriptClaude(table, { fallback: () => ROUND_REPLY });
  silenceConsoleErrors();
});

async function relay(userId, kind, payload) {
  const c = table.client(userId);
  const gmRelay = await c.import('../../src/multiplayer/gmRelay.js');
  const res = await c.run(() => gmRelay.requestGmAction(kind, payload));
  await table.settle();
  return res;
}

/** Ren's player's Round window renders as ApplicationV2 does: prepare → render → replace. */
async function rendersLikeFoundry(userId) {
  const c = table.client(userId);
  const mod = await c.import('../../src/ui/roundWindow.js');
  mod.RoundWindowApp.prototype.render = async function renderLikeFoundry() {
    const context = await this._prepareContext({});
    const result = await this._renderHTML(context, {});
    if (!this.element) this.element = new StubElement('div');
    this._replaceHTML(result, this.element, {});
    this.rendered = true;
    return this;
  };
  return () => mod.RoundWindowApp.instance;
}

describe('the Round window and a narration the X-Card removed (issue #342 Z32)', () => {
  it('after the X-Card, the window no longer shows the narration it removed', async () => {
    const renWindow = await rendersLikeFoundry('pl-2');
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();

    // Round 1: Kira acts, Ren passes; one narration posts and round 2 opens.
    control.dice = [STRONG];
    await relay('pl-1', 'batch.submit', { roundId: round().id, text: 'I slip through the airlock.', submissionId: `s-${++seq}` });
    const r = round();
    await relay('pl-1', 'batch.confirm', { roundId: r.id, submissionId: r.entries['pl-1'].submissionId, choices: {} });
    await relay('pl-2', 'batch.pass', { roundId: round().id });
    await table.drain();
    expect(round()).toMatchObject({ number: 2, phase: 'collecting' });

    // Control: Ren's window shows the round's narration. (In Foundry the round
    // card reaches Ren's client before the round's close and the next round's
    // open — one socket, in order — so the window opened for round 2 shows it.
    // The harness's settings read the server's latest value on a cache miss,
    // ahead of message deliveries, so the window is rendered once more here.)
    const app = renWindow();
    expect(app?.rendered).toBe(true);
    await table.client('pl-2').run(() => app.render());
    expect(app.element.textContent).toContain(PROSE);

    // Ren's player plays the X-Card on it.
    await table.client('pl-2').chat('!x');
    await table.settle();
    await table.drain();
    // Control: the X-Card took it — paused, and the card flagged removed on every client.
    expect(table.world.campaignState().xCardActive).toBe(true);
    const card = table.cards(f => f.narratorCard && f.roundId)[0];
    expect(card.flags['starforged-companion'].xCarded).toBe(true);
    expect(app.element.textContent).toContain('The X-Card is in play');      // the window re-rendered for it
    // Control: the window's own filter leaves it out now that the flag has landed — nothing re-ran it.
    expect((await table.client('pl-2').run(() => app._prepareContext({}))).recent).toBe('');

    // The removed narration is off Ren's screen.
    expect(app.element.textContent).not.toContain(PROSE);
  }, 30_000);

  it('a narration posted while the window is open shows on its next refresh — the view alone has not changed', async () => {
    const renWindow = await rendersLikeFoundry('pl-2');
    await table.client('gm-1').setSetting('batchMode.enabled', true);
    await table.settle();
    const app = renWindow();
    await table.client('pl-2').run(() => app.render());
    expect(app.element.textContent).not.toContain('The relay tower sparks');
    // A narration from outside the round (a non-participant's move, @scene) posts.
    await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: '<div class="sf-narration-card">The relay tower sparks.</div>',
      flags: { 'starforged-companion': { narratorCard: true, narrationText: 'The relay tower sparks and dies.', sessionId: 'sess-1', narrationId: 'nar-out' } },
    }));
    await table.settle();
    await table.client('pl-2').run(() => app.refresh());
    expect(app.element.textContent).toContain('The relay tower sparks and dies.');
  }, 30_000);
});
