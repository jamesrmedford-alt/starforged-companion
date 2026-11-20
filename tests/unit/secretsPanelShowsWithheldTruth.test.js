/**
 * STARFORGED COMPANION
 * tests/unit/secretsPanelShowsWithheldTruth.test.js
 *
 * Issue #364 SECRETS-PANEL-NO-WITHHELD-MARKER (out of
 * XCARD-REVEAL-REREVEAL-NO-LORE). After the X-Card takes back a narration that
 * revealed a hidden plan's truth, the truth is withheld from the narrator
 * (`truthWithheldBy`) until a GM edits it or uses Reveal now. The GM's
 * Secrets panel showed nothing of it — the whispered note was the only
 * signal, and once it scrolled away the GM could not tell why the narrator
 * never came back to that truth.
 *
 * The panel now marks a withheld plan: its state reads "withheld", and a
 * label beside its truth says the X-Card took back its reveal and how to
 * bring it back. Read from the plan's own mark — no new store — and, as the
 * whole section is, on a GM's client only. The mark is made here by the
 * X-Card's own undo (worldJournal.js undoNarrationEntries `withholdTruths`).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { WorldJournalPanelApp } from '../../src/world/worldJournalPanel.js';
import { createSkeleton, updateSkeleton, getSkeleton, editSkeleton } from '../../src/world/secrets.js';
import { applyRevealToSkeleton } from '../../src/world/skeletons.js';
import { undoNarrationEntries } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const TRUTH = 'A Keeper drone that collects names.';
const NARRATION = 'narr-escort-reveal';

let journals;
beforeEach(() => {
  journals = installJournalMock();
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's-1', sessionNumber: 1, currentSceneId: 'sc-1' });
});
afterEach(() => {
  journals.restore();
  delete globalThis.document;
  global.game.user.isGM = true;
});

const plan = () => createSkeleton({
  kind: 'threat', subject: { type: 'name', name: 'the escort' }, truth: TRUTH, wants: 'The crew\'s name.',
  escalation: ['It asks again'], clues: ['A pulse that counts down'], oracleSeeds: ['Character Role: Scout'], sceneId: 'sc-1',
});

/** A narration reveals the plan's truth, and the X-Card's undo takes that narration back. */
async function revealThenXCard(id) {
  await updateSkeleton(id, r => applyRevealToSkeleton(r, { id, revealed: ['truth'] }, { narrationId: NARRATION }), { narrationId: NARRATION });
  expect(getSkeleton(id), 'revealed (setup)').toMatchObject({ truthRevealed: true, truthRevealedBy: NARRATION });
  const undone = await undoNarrationEntries([NARRATION], { withholdTruths: true });
  expect(undone.truthsWithheld.map(p => p.id), 'withheld (setup)').toEqual([id]);
  expect(getSkeleton(id)).toMatchObject({ truthRevealed: false, truthWithheldBy: NARRATION });
}

/** The plan's row in the panel as the GM's client renders it. */
async function secretRow(id) {
  const app = new WorldJournalPanelApp();
  const el = await app._renderHTML(await app._prepareContext({}), {});
  const html = el.outerHTML ?? el.innerHTML;
  const start = html.indexOf(`<details class="sf-wj-entry sf-wj-secret" data-id="${id}"`);
  return start < 0 ? '' : html.slice(start, html.indexOf('</details>', start));
}

describe('issue #364 SECRETS-PANEL-NO-WITHHELD-MARKER — the Secrets panel marks a truth the X-Card withheld', () => {
  it('a withheld truth reads "withheld", with a label beside it saying why and how to bring it back', async () => {
    const filed = await plan();
    await revealThenXCard(filed.id);

    const row = await secretRow(filed.id);
    expect(row).toMatch(/<summary[^>]*>[\s\S]*the escort[\s\S]*withheld[\s\S]*<\/summary>/);
    const truthAt = row.indexOf(TRUTH);
    const label = /<div class="sf-wj-entry-text sf-wj-secret-withheld">([\s\S]*?)<\/div>/.exec(row);
    expect(truthAt, 'the truth is still shown to the GM').toBeGreaterThan(-1);
    expect(label, 'the label is there').toBeTruthy();
    expect(label.index, 'beside its truth').toBeGreaterThan(truthAt);
    expect(label[1]).toMatch(/X-Card took back its reveal/);
    expect(label[1]).toMatch(/Edit/);
    expect(label[1]).toMatch(/Reveal now/);
  });

  it('control: a plan whose truth is not withheld carries no label and reads "hidden"', async () => {
    const filed = await plan();
    const row = await secretRow(filed.id);
    expect(row).toMatch(/<summary[^>]*>[\s\S]*hidden[\s\S]*<\/summary>/);
    expect(row).not.toContain('sf-wj-secret-withheld');
    expect(row).not.toMatch(/withheld/i);
  });

  it('a GM\'s edit of the truth lifts the withholding, and the label goes with it', async () => {
    const filed = await plan();
    await revealThenXCard(filed.id);
    await editSkeleton(filed.id, { truth: 'A Keeper drone that hunts one name.' });

    const row = await secretRow(filed.id);
    expect(row).not.toContain('sf-wj-secret-withheld');
    expect(row).toMatch(/<summary[^>]*>[\s\S]*hidden[\s\S]*<\/summary>/);
  });

  it('a player\'s client builds no Secrets section, so no label', async () => {
    const filed = await plan();
    await revealThenXCard(filed.id);
    global.game.user.isGM = false;
    expect(await secretRow(filed.id)).toBe('');
    const app = new WorldJournalPanelApp();
    vi.spyOn(app, 'render').mockImplementation(async () => {});
    expect((await app._prepareContext({})).secrets).toEqual([]);
  });
});
