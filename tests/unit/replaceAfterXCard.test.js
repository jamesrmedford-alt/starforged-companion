/**
 * STARFORGED COMPANION
 * tests/unit/replaceAfterXCard.test.js
 *
 * Issue #336 Y30 (REPLACE-AFTER-XCARD-REFILES-REMOVED-FACT). A ◈ Narrative
 * Review card flags "the prisoner — His hand was burned with a cutting
 * torch"; the GM opens Correct Active Scene Facts and clicks Replace…, and
 * while the prompt is open a player plays the X-Card on that narration (the
 * truth becomes `retractedBy: "xcard"` in the store). The GM saves "…burned
 * with a welding torch". handleRowAction read the store after the prompt
 * (issue #321 U06e) but replaceTruth looked the entry up by id with no live
 * check: it overwrote the X-Card's mark with `retractedBy: "gm"`, linked
 * `correctedTo` and pushed the replacement live, and mergeSceneLedgers then
 * preferred the working copy because it carried `correctedTo`. The removed
 * beat's fact was back in the ledger as binding under the GM's wording.
 *
 * The dialog's contract: "a row that no longer matches writes nothing"
 * (U06e); U07: an X-Card retraction is never lifted. replaceTruth and
 * strikeTruth now refuse an entry already retracted — the dialog writes
 * nothing, `!truth strike` on one says "already retracted" — and the merge
 * keeps a store entry the X-Card retracted over a stale copy's correction of
 * it (the X-Card played after the copy was read), filing no replacement.
 *
 * (From the tenth audit's probe tests/probes/continuity/replaceAfterXCard.probe.js.)
 */

/* global makeTestMessage, EventTarget */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openCorrectionDialog } from '../../src/factContinuity/correctionDialog.js';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { replaceTruth, strikeTruth } from '../../src/factContinuity/ledgers.js';
import { persistSceneLedgerFields, mergeSceneLedgers } from '../../src/factContinuity/sceneLifecycle.js';
import { suppressScene } from '../../src/context/safety.js';
import { parseHTML, setListenerResultSink } from '../helpers/cardDom.js';

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
const WELDING = 'His hand was burned with a welding torch';

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
    sceneTruths: [{ ...TRUTH }], sceneState: { bySubject: {}, sceneId: 'sc-1' }, sceneFrame: null,
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
/** The X-Card, played on the narration on screen. */
async function playXCard() {
  expect(await suppressScene({}, { local: true })).toBe(true);
  expect(torch()).toMatchObject({ retracted: true, retractedBy: 'xcard' });   // control: the beat was removed
}

describe('issue #336 Y30 — a correction never re-files a fact the X-Card removed', () => {
  it("control: with no X-Card meanwhile, Replace strikes the original and files the GM's wording", async () => {
    const dlg = await openDialog();
    FakeDialogV2.promptAnswer = async () => WELDING;
    await click(dlg, '[data-action="replace-truth"]');
    expect(torch()).toMatchObject({ retracted: true, retractedBy: 'gm' });
    expect(torch().correctedTo).toBeTruthy();
    expect(live(WELDING)).toHaveLength(1);
  });

  it("a Replace saved after the X-Card writes nothing: the X-Card's retraction stands, no replacement is filed", async () => {
    const dlg = await openDialog();
    FakeDialogV2.promptAnswer = async () => { await playXCard(); return WELDING; };   // played while the prompt was open

    await click(dlg, '[data-action="replace-truth"]');

    expect(torch().retractedBy).toBe('xcard');
    expect(torch().correctedTo).toBeNull();
    expect(live(WELDING)).toHaveLength(0);
    expect(stored().sceneTruths).toHaveLength(1);
  });

  it("a Strike clicked on the dialog's row after the X-Card writes nothing either", async () => {
    const dlg = await openDialog();
    await playXCard();
    const before = { ...torch() };
    const realSet = game.settings.set;
    let writes = 0;
    game.settings.set = async (...args) => { if (args[1] === 'campaignState') writes += 1; return realSet.apply(game.settings, args); };
    try {
      await click(dlg, '[data-action="strike-truth"]');
    } finally {
      game.settings.set = realSet;
    }

    expect(writes).toBe(0);                                 // it relabelled a copy and wrote it (the store's mark won the merge)
    expect(torch()).toEqual(before);                        // still the X-Card's: retractedBy, retractedAt
  });

  it('replaceTruth and strikeTruth refuse an entry already retracted (a bare strike too)', () => {
    const struck = { sceneTruths: [{ ...TRUTH, retracted: true, retractedBy: 'gm', retractedAt: 5 }] };
    expect(replaceTruth(TRUTH.id, { fact: WELDING }, struck)).toBeNull();
    expect(strikeTruth(TRUTH.id, struck)).toBeNull();
    expect(struck.sceneTruths).toEqual([{ ...TRUTH, retracted: true, retractedBy: 'gm', retractedAt: 5 }]);
    // control: a live one is struck
    expect(strikeTruth(TRUTH.id, { sceneTruths: [{ ...TRUTH }] })).toMatchObject({ retracted: true, retractedBy: 'gm' });
  });

  it('`!truth strike` on a retracted truth says it is already retracted, and writes nothing', async () => {
    await playXCard();
    const before = JSON.stringify(stored());
    const line = await applyFactContinuityCommand({ text: `!truth strike ${TRUTH.id.slice(0, 8)}` }, { requesterIsGM: true });
    expect(line).toMatch(/already retracted/i);
    expect(line).not.toMatch(/cutting torch/);              // the removed fact is not named
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("a Replace whose copy predates the X-Card (played during its awaits) is not merged over the X-Card's mark", async () => {
    // The working copy was read, and the Replace made on it, before the X-Card landed in the store.
    const working = foundry.utils.deepClone(stored());
    const replaced = replaceTruth(TRUTH.id, { fact: WELDING }, working, { isGM: true, actor: 'gm' });
    expect(replaced).not.toBeNull();
    await playXCard();

    await persistSceneLedgerFields(working, ['sceneTruths'], 'correction dialog');

    expect(torch()).toMatchObject({ retracted: true, retractedBy: 'xcard', correctedTo: null });
    expect(live(WELDING)).toHaveLength(0);
  });

  it("control: the merge still keeps a stale copy's correction over a live store entry, and its replacement", () => {
    const latest  = { currentSceneId: 'sc-1', sceneTruths: [{ ...TRUTH }] };
    const working = foundry.utils.deepClone(latest);
    const { replacement } = replaceTruth(TRUTH.id, { fact: WELDING }, working, { isGM: true, actor: 'gm' });
    expect(mergeSceneLedgers(working, latest)).toBe(true);
    expect(working.sceneTruths.find(t => t.id === TRUTH.id)).toMatchObject({ retractedBy: 'gm', correctedTo: replacement.id });
    expect(working.sceneTruths.map(t => t.id)).toEqual([TRUTH.id, replacement.id]);
  });
});
