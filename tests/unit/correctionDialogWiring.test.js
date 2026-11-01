/**
 * STARFORGED COMPANION
 * tests/unit/correctionDialogWiring.test.js
 *
 * The Correct Active Scene Facts dialog's row controls are wired the way
 * Foundry v13 offers it on a constructed dialog (issue #321 U38).
 *
 * openCorrectionDialog built `new DialogV2({ …, render })`. `render` is a
 * DialogV2.wait() option — wait() attaches it with
 * dialog.addEventListener("render", …) — not something the constructor
 * reads, so on the dialog the module builds the Strike / Replace handlers
 * likely never attached, and the rows' untyped buttons submitted (closed)
 * the dialog's form instead. (Traced; Foundry-dependent.) The dialog now
 * attaches the handlers from its "render" event, and the row buttons are
 * `type="button"`.
 *
 * The double below is an ApplicationV2 as v13 behaves: an event emitter whose
 * render() fires "render", ignoring options it does not know — so it never
 * calls a `render` option — and whose content sits inside a <form>.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { parseHTML, setListenerResultSink } from '../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;

class DialogV2Double extends EventTarget {
  static last = null;
  constructor(options) { super(); this.options = options; this.element = null; DialogV2Double.last = this; }
  async render() {
    this.element = parseHTML(`<form class="dialog-form"><div class="window-content">${this.options.content}</div></form>`).firstElementChild;
    this.dispatchEvent(new Event('render'));
    return this;
  }
  static async prompt() { return ''; }
}

let pending;
beforeEach(() => {
  pending = [];
  setListenerResultSink((p) => pending.push(p));
  global.foundry.applications.api.DialogV2 = DialogV2Double;
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-1', currentSceneId: 'sc-1',
    sceneTruths: [{
      id: 'tr-aaaa0001', subject: { kind: 'text', text: 'the dockmaster' }, fact: 'Is hiding a stolen data core',
      sessionId: 'sess-1', sceneId: 'sc-1', source: 'narrator_sidecar', asserter: 'narrator', createdAt: 1,
      retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
    }],
    sceneState: { bySubject: { 'the dockmaster': [{ attribute: 'location', value: 'the cargo bay', updatedAt: 1 }] }, sceneId: 'sc-1' },
  });
});
afterEach(() => {
  setListenerResultSink(null);
  delete global.foundry.applications.api.DialogV2;
  game.settings._store.delete(KEY);
});

describe('the correction dialog wiring', () => {
  it('a Strike clicked in a dialog that only fires its "render" event strikes the truth', async () => {
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    const dlg = DialogV2Double.last;

    dlg.element.querySelector('[data-action="strike-truth"]').click();
    await Promise.all(pending);

    expect(game.settings.get(MODULE_ID, 'campaignState').sceneTruths[0].retracted).toBe(true);
  });

  it("does not rely on a `render` constructor option, which only DialogV2.wait() reads", async () => {
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    expect(DialogV2Double.last.options).not.toHaveProperty('render');
  });

  it("the row buttons do not submit the dialog's form", async () => {
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    const buttons = DialogV2Double.last.element.querySelectorAll('.sf-correct-btn');
    expect(buttons.length).toBe(4);   // Strike / Replace for the truth and the state value
    for (const b of buttons) expect(b.type, b.dataset.action).toBe('button');
  });

  it('stays wired after a correction re-renders the list', async () => {
    await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [] } } });
    const dlg = DialogV2Double.last;
    dlg.element.querySelector('[data-action="strike-truth"]').click();
    await Promise.all(pending);

    dlg.element.querySelector('[data-action="strike-state"]').click();
    await Promise.all(pending);

    expect(game.settings.get(MODULE_ID, 'campaignState').sceneState.bySubject['the dockmaster']).toBeUndefined();
  });
});
