/**
 * PROBE — CORRECTION-DIALOG-STALE-WRITE (src/factContinuity/correctionDialog.js)
 *
 * openCorrectionDialog reads campaignState ONCE, when the GM opens the dialog
 * from a ◈ Narrative Review card, and every row action afterwards mutates that
 * object and writes it WHOLE (persistCampaignState). The dialog is
 * non-blocking and stays open while play goes on, so each click writes the
 * snapshot taken at open time — reverting everything stored since: an X-Card a
 * player played, the next narration's truths, a move's state. (It writes even
 * when the action changed nothing, e.g. a cancelled Replace….)
 *
 * The DialogV2 double below honours the `render` callback the module passes —
 * the wiring the code relies on — so the row handlers run as written.
 *
 * Asserts the CORRECT behaviour (writes made after the dialog opened survive
 * a Strike); fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openCorrectionDialog } from '../../../src/factContinuity/correctionDialog.js';
import { suppressScene } from '../../../src/context/safety.js';
import { parseHTML, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

class FakeDialogV2 {
  static last = null;
  constructor(options) { this.options = options; this.element = null; FakeDialogV2.last = this; }
  async render() {
    this.element = parseHTML(`<div class="window-content">${this.options.content}</div>`);
    this.options.render?.(null, this);
    return this;
  }
  static async prompt() { return ''; }
}

const truth = (id, text, fact) => ({
  id, subject: { kind: 'text', text }, fact,
  sessionId: 'sess-1', sessionNum: 2, sceneId: 'sc-1', moveId: null,
  source: 'narrator_sidecar', asserter: 'narrator', createdAt: 1,
  retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
});

let pending;
beforeEach(() => {
  pending = [];
  setListenerResultSink((p) => pending.push(p));
  global.foundry.applications.api.DialogV2 = FakeDialogV2;
});
afterEach(() => {
  setListenerResultSink(null);
  delete global.foundry.applications.api.DialogV2;
  game.settings._store.delete(KEY);
});

describe('Correct Active Scene Facts dialog', () => {
  it('a Strike clicked after other writes landed does not revert them', async () => {
    game.settings._store.set(KEY, {
      currentSessionId: 'sess-1', sessionNumber: 2, currentSceneId: 'sc-1',
      sceneTruths: [truth('tr-aaaa0001', 'the dockmaster', 'Is hiding a stolen data core')],
      sceneState: { bySubject: {}, sceneId: 'sc-1' },
      xCardActive: false,
      pendingMove: true,            // another player's move is resolving when the GM opens it
    });

    // GM opens the dialog from the review card.
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    const dlg = FakeDialogV2.last;
    expect(dlg.element.querySelector('[data-action="strike-truth"]')).toBeTruthy();

    // While it is open: the move finishes and releases its lock, a player
    // plays the X-Card, and the next narration records a new truth (each
    // writes a fresh object, as its writer does).
    await game.settings.set(MODULE_ID, 'campaignState', { ...game.settings.get(MODULE_ID, 'campaignState'), pendingMove: false });
    await suppressScene({}, { local: true });
    const latest = game.settings.get(MODULE_ID, 'campaignState');
    await game.settings.set(MODULE_ID, 'campaignState', {
      ...latest,
      sceneTruths: [...latest.sceneTruths, truth('tr-bbbb0002', 'Vance', 'Carries a Covenant signet')],
    });

    // GM strikes the original truth.
    dlg.element.querySelector('[data-action="strike-truth"]').click();
    await Promise.all(pending);

    const stored = game.settings.get(MODULE_ID, 'campaignState');
    expect(stored.sceneTruths.find(t => t.id === 'tr-aaaa0001')?.retracted).toBe(true);
    expect.soft(stored.xCardActive, 'X-Card played while the dialog was open').toBe(true);
    expect.soft(stored.sceneTruths.some(t => t.id === 'tr-bbbb0002'), "the next narration's truth").toBe(true);
    expect.soft(stored.pendingMove, 'move lock released while the dialog was open').toBe(false);
  });
});
