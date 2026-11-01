/**
 * STARFORGED COMPANION
 * tests/unit/correctionDialogStaleWrite.test.js
 *
 * The Correct Active Scene Facts dialog corrects the store as it is at each
 * click (issue #321 U06e).
 *
 * openCorrectionDialog read campaignState ONCE, when the GM opened the dialog
 * from a ◈ Narrative Review card, and every row action afterwards mutated
 * that object and wrote it WHOLE. The dialog is non-blocking and stays open
 * while play goes on, so each click wrote the snapshot taken at open time —
 * reverting everything stored since: an X-Card a player played, the next
 * narration's truths, a released move lock. (It wrote even when the action
 * changed nothing, e.g. a cancelled Replace.) Each action now works on a copy
 * of the store read at the click (a Replace: after its prompt closes) and
 * persists only the ledger field it changed, merged onto the latest store.
 *
 * The DialogV2 double runs the dialog's render wiring both ways a test may
 * see it — the `render` option and the "render" event — so these tests are
 * about the writes, not the wiring (correctionDialogWiring.test.js).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { suppressScene } from '../../src/context/safety.js';
import { parseHTML, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

class FakeDialogV2 extends EventTarget {
  static last = null;
  static promptAnswer = async () => '';
  constructor(options) { super(); this.options = options; this.element = null; FakeDialogV2.last = this; }
  async render() {
    this.element = parseHTML(`<div class="window-content">${this.options.content}</div>`);
    this.options.render?.(null, this);
    this.dispatchEvent(new Event('render'));
    return this;
  }
  static async prompt() { return FakeDialogV2.promptAnswer(); }
}

const truth = (id, text, fact) => ({
  id, subject: { kind: 'text', text }, fact,
  sessionId: 'sess-1', sessionNum: 2, sceneId: 'sc-1', moveId: null,
  source: 'narrator_sidecar', asserter: 'narrator', createdAt: 1,
  retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
});

const stored = () => game.settings.get(MODULE_ID, 'campaignState');

/** Another writer stores a fresh copy with `changes` applied. */
async function storeMeanwhile(changes) {
  const latest = stored();
  await game.settings.set(MODULE_ID, 'campaignState', { ...latest, ...changes(latest) });
}

let pending;
beforeEach(() => {
  pending = [];
  setListenerResultSink((p) => pending.push(p));
  FakeDialogV2.promptAnswer = async () => '';
  global.foundry.applications.api.DialogV2 = FakeDialogV2;
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [truth('tr-aaaa0001', 'the dockmaster', 'Is hiding a stolen data core')],
    sceneState: { bySubject: { 'the dockmaster': [{ attribute: 'location', value: 'the cargo bay', updatedAt: 1 }] }, sceneId: 'sc-1' },
    xCardActive: false,
    pendingMove: true,            // another player's move is resolving when the GM opens it
  });
});
afterEach(() => {
  setListenerResultSink(null);
  delete global.foundry.applications.api.DialogV2;
  game.settings._store.delete(KEY);
});

async function openDialog() {
  await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
  return FakeDialogV2.last;
}

async function click(dlg, selector) {
  dlg.element.querySelector(selector).click();
  await Promise.all(pending);
}

describe('Correct Active Scene Facts dialog', () => {
  it('a Strike clicked after other writes landed does not revert them', async () => {
    const dlg = await openDialog();
    expect(dlg.element.querySelector('[data-action="strike-truth"]')).toBeTruthy();

    // While it is open: the move finishes and releases its lock, a player
    // plays the X-Card, and the next narration records a new truth.
    await storeMeanwhile(() => ({ pendingMove: false }));
    await suppressScene({}, { local: true });
    await storeMeanwhile((latest) => ({ sceneTruths: [...latest.sceneTruths, truth('tr-bbbb0002', 'Vance', 'Carries a Covenant signet')] }));

    await click(dlg, '[data-action="strike-truth"]');

    expect(stored().sceneTruths.find(t => t.id === 'tr-aaaa0001')?.retracted).toBe(true);
    expect(stored().xCardActive, 'X-Card played while the dialog was open').toBe(true);
    expect(stored().sceneTruths.some(t => t.id === 'tr-bbbb0002'), "the next narration's truth").toBe(true);
    expect(stored().pendingMove, 'move lock released while the dialog was open').toBe(false);
  });

  it('a Replace reads the store after its prompt closes, keeping what landed while it was open', async () => {
    const dlg = await openDialog();
    FakeDialogV2.promptAnswer = async () => {
      await suppressScene({}, { local: true });
      await storeMeanwhile((latest) => ({ sceneTruths: [...latest.sceneTruths, truth('tr-bbbb0002', 'Vance', 'Carries a Covenant signet')] }));
      return 'Is hiding a forged manifest';
    };

    await click(dlg, '[data-action="replace-truth"]');

    const truths = stored().sceneTruths;
    expect(truths.find(t => t.id === 'tr-aaaa0001')).toMatchObject({ retracted: true });
    expect(truths.some(t => t.fact === 'Is hiding a forged manifest' && !t.retracted)).toBe(true);
    expect(truths.some(t => t.id === 'tr-bbbb0002')).toBe(true);
    expect(stored().xCardActive).toBe(true);
  });

  it('a cancelled Replace writes nothing', async () => {
    const dlg = await openDialog();
    const set = vi.spyOn(game.settings, 'set');
    try {
      await click(dlg, '[data-action="replace-truth"]');
      expect(set.mock.calls.filter(([, key]) => key === 'campaignState')).toEqual([]);
    } finally {
      set.mockRestore();
    }
  });

  it('a state Strike after a released move lock does not re-take it', async () => {
    const dlg = await openDialog();
    await storeMeanwhile(() => ({ pendingMove: false }));

    await click(dlg, '[data-action="strike-state"]');

    expect(stored().sceneState.bySubject['the dockmaster']).toBeUndefined();
    expect(stored().pendingMove).toBe(false);
  });

  it('re-renders from the store after an action, listing a truth recorded since it opened', async () => {
    const dlg = await openDialog();
    await storeMeanwhile((latest) => ({ sceneTruths: [...latest.sceneTruths, truth('tr-bbbb0002', 'Vance', 'Carries a Covenant signet')] }));

    await click(dlg, '[data-action="strike-truth"]');

    const body = dlg.element.querySelector('.sf-correct-body').innerHTML;
    expect(body).toContain('Carries a Covenant signet');
    expect(body).not.toContain('Is hiding a stolen data core');   // struck
  });
});
