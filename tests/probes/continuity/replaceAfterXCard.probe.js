/**
 * PROBE — CONT-04 REPLACE-AFTER-XCARD-REFILES-REMOVED-FACT
 *
 * What the user does: a ◈ Narrative Review card flags "the prisoner — His
 * hand was burned with a cutting torch"; the GM opens Correct Active Scene
 * Facts and clicks Replace…, and the prompt waits for the new wording. While
 * it is open a player plays the X-Card on that narration (the beat is removed:
 * the truth is retracted `retractedBy: "xcard"` in the store). The GM, not
 * yet aware, saves the replacement ("…burned with a welding torch").
 *
 * What happens: handleRowAction's replace-truth reads the store after the
 * prompt closes (issue #321 U06e) but only looks the truth up by id;
 * replaceTruth (ledgers.js) does not check that the entry is still live, so
 * it overwrites the X-Card's retraction with `retractedBy: "gm"`, links it
 * `correctedTo` the replacement and pushes the replacement as a live truth.
 * persistSceneLedgerFields' merge then prefers the working copy because it
 * carries `correctedTo` (mergeSceneLedgers: "a retraction and the link a
 * correction adds to it are one-way"). The removed beat's fact is back in the
 * ledger as a binding truth under the GM's wording, and the X-Card's mark is
 * gone from the entry.
 *
 * What should happen: "a row that no longer matches writes nothing"
 * (correctionDialog.js handleRowAction's contract, U06e); the X-Card's
 * retraction is never lifted (rules/narrator-memory.md 6b, U07: "A truth the
 * X-Card removed … stays retracted"). The Replace is refused and the entry
 * keeps `retractedBy: "xcard"`, with no live replacement.
 *
 * Control: with no X-Card meanwhile, the Replace strikes the original and
 * files the replacement (the existing behaviour).
 *
 * Run: npx vitest run --config tests/probes/vitest.probes.config.js tests/probes/continuity/replaceAfterXCard.probe.js
 */

/* global makeTestMessage, EventTarget */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openCorrectionDialog } from '../../../src/factContinuity/correctionDialog.js';
import { suppressScene } from '../../../src/context/safety.js';
import { parseHTML, setListenerResultSink } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const SESSION = 'sess-1';

class FakeDialogV2 extends EventTarget {
  static last = null;
  static promptAnswer = async () => '';
  constructor(options) { super(); this.options = options; this.element = null; FakeDialogV2.last = this; }
  async render() {
    this.element = parseHTML(`<div class="window-content">${this.options.content}</div>`);
    this.dispatchEvent(new Event('render'));
    return this;
  }
  static async prompt() { return FakeDialogV2.promptAnswer(); }
}

const TRUTH = {
  id: 'tr-torch001', subject: { kind: 'text', text: 'the prisoner' }, fact: 'His hand was burned with a cutting torch',
  sessionId: SESSION, sessionNum: 2, sceneId: 'sc-1', moveId: null, source: 'narrator_sidecar', asserter: 'narrator',
  createdAt: 1, retracted: false, retractedBy: null, retractedAt: null, correctedTo: null, migratedTo: null,
  sceneLocation: 'the interrogation cell', narrationId: 'nar-torch',
};

const stored = () => game.settings.get(MODULE_ID, 'campaignState');
const torch  = () => stored().sceneTruths.find(t => t.id === TRUTH.id);
const live   = (fact) => stored().sceneTruths.filter(t => t.fact === fact && !t.retracted);

let pending;
beforeEach(() => {
  pending = [];
  setListenerResultSink((p) => pending.push(p));
  FakeDialogV2.promptAnswer = async () => '';
  global.foundry.applications.api.DialogV2 = FakeDialogV2;
  ChatMessage._reset();
  global.game.users = Object.assign([{ id: 'test-user-gm', isGM: true, active: true }], {
    get: (id) => (id === 'test-user-gm' ? { id: 'test-user-gm', isGM: true, active: true } : null),
  });
  // The narration the truth came from, on screen — the card the X-Card answers.
  const card = makeTestMessage({ content: 'The torch comes down.', flags: { [MODULE_ID]: {
    narratorCard: true, narrationText: 'The torch comes down.', sessionId: SESSION, narrationId: 'nar-torch',
  } } }, { author: 'test-user-gm' });
  global.game.messages = { contents: [card] };
  game.settings._store.set(KEY, {
    currentSessionId: SESSION, sessionNumber: 2, currentSceneId: 'sc-1',
    sceneTruths: [TRUTH], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
    xCardActive: false, xCardPlays: 0, xCardedNarrationIds: [],
  });
});
afterEach(() => {
  setListenerResultSink(null);
  delete global.foundry.applications.api.DialogV2;
  game.settings._store.delete(KEY);
});

async function openDialog() {
  await openCorrectionDialog({ flags: { [MODULE_ID]: { matchedEntityIds: [], contradictedTruthId: TRUTH.id } } });
  return FakeDialogV2.last;
}
async function click(dlg, selector) {
  dlg.element.querySelector(selector).click();
  await Promise.all(pending);
}

describe('CONT-04 — a Replace saved after the X-Card removed the fact', () => {
  it('control: with no X-Card meanwhile, Replace strikes the original and files the GM\'s wording', async () => {
    const dlg = await openDialog();
    FakeDialogV2.promptAnswer = async () => 'His hand was burned with a welding torch';
    await click(dlg, '[data-action="replace-truth"]');
    expect(torch()).toMatchObject({ retracted: true, retractedBy: 'gm' });
    expect(torch().correctedTo).toBeTruthy();
    expect(live('His hand was burned with a welding torch')).toHaveLength(1);
  });

  it('writes nothing: the X-Card\'s retraction stands and the removed fact is not re-filed under the GM\'s wording', async () => {
    const dlg = await openDialog();
    FakeDialogV2.promptAnswer = async () => {
      expect(await suppressScene({}, { local: true })).toBe(true);   // the X-Card, played while the prompt was open
      expect(torch()).toMatchObject({ retracted: true, retractedBy: 'xcard' });   // control: the beat was removed
      return 'His hand was burned with a welding torch';
    };

    await click(dlg, '[data-action="replace-truth"]');

    expect.soft(torch().retractedBy, 'the entry\'s retraction mark').toBe('xcard');
    expect.soft(torch().correctedTo, 'a Replace link on the X-carded entry').toBeNull();
    expect(live('His hand was burned with a welding torch'), 'a live truth with the removed fact under the GM\'s wording').toHaveLength(0);
  });
});
