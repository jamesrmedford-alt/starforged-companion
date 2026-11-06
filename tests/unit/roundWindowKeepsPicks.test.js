/**
 * STARFORGED COMPANION
 * tests/unit/roundWindowKeepsPicks.test.js
 *
 * Issue #342 Z06 (ROUND-WINDOW-RERENDER-WIPES-PICKS; the ui auditor's
 * probe). The Batch Mode Round window (src/ui/roundWindow.js) shows a
 * player's reading with the confirm dialog's own ability form — checkboxes,
 * the stat substitution radio — and the "Which fight?" target radio. While
 * the player decides, the round changes under them (another player confirms,
 * the GM's reading of someone else lands) and the window re-renders — and its
 * own "pick one first" refusal re-renders it too. Its `_replaceHTML` used to
 * empty the content and keep only the action box's focus: the player's
 * unchecked add came back checked, the stat swap and the target went back to
 * the defaults, and Confirm relayed the defaults. A re-render keeps what the
 * player chose in the reading's form, for the same reading (decisions.md "A
 * panel's re-render keeps what the user is typing" [Y45]).
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

const relayed = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../src/multiplayer/gmRelay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async (kind, payload) => { relayed.calls.push({ kind, payload }); return { ok: true, relayed: true }; }),
}));

const MODULE_ID = 'starforged-companion';
const NOW = '2026-11-06T10:00:00.000Z';
let RoundWindowApp, registerRoundWindowHooks, registerBatchModeSettings, R;
let savedDocument;

beforeAll(async () => {
  ({ RoundWindowApp, registerRoundWindowHooks } = await import('../../src/ui/roundWindow.js'));
  ({ registerBatchModeSettings } = await import('../../src/batch/driver.js'));
  R = await import('../../src/batch/round.js');
  // What ApplicationV2.render does: prepare → render → replace the window's content.
  RoundWindowApp.prototype.render = async function renderLikeFoundry() {
    const context = await this._prepareContext({});
    const result = await this._renderHTML(context, {});
    if (!this.element) this.element = new StubElement('div');
    this._replaceHTML(result, this.element, {});
    this.rendered = true;
    return this;
  };
}, 60_000);

// A Strike reading: the Hoverbike's add costs a weak hit (pre-checked), an
// Empath ability offers +heart instead of +iron, and two fights to choose from.
const READING = {
  kind: 'move', moveId: 'strike', moveName: 'Strike', statUsed: 'iron', rationale: 'You attack.', mischiefAside: '',
  abilities: [
    { key: 'hb', assetName: 'Hoverbike', abilityName: 'Afterburner', adds: 2, addsFrom: 'integrity', weakHitAsMiss: true, statReplacement: '', category: 'Module', detection: 'structured' },
    { key: 'em', assetName: 'Empath', abilityName: 'Read', adds: 0, statReplacement: 'heart', category: 'Path', detection: 'inferred' },
  ],
  statOptions: ['heart'],
  targetChoices: { kind: 'track', trackType: 'combat', prompt: 'Which fight?', options: [
    { id: 'f1', label: 'Archive guards', detail: 'Dangerous, 2/10 boxes' },
    { id: 'f2', label: 'Hull wraiths', detail: 'Formidable, 0/10 boxes' },
  ] },
  interpretation: { moveId: 'strike' },
};
const REN_READING = { kind: 'move', moveId: 'face_danger', moveName: 'Face Danger', statUsed: 'edge', rationale: 'r', abilities: [], statOptions: [], targetChoices: null };

const tick = () => new Promise(r => setTimeout(r, 0));
const ME = () => game.user.id;

function storeRound(round) {
  game.settings._store.set(`${MODULE_ID}.batchMode.round`, round);
}
/** The canonical GM's round write, as every client hears it: the setting's onChange. */
async function roundWrittenElsewhere(round) {
  storeRound(round);
  game.settings._registry.get(`${MODULE_ID}.batchMode.round`).onChange(round);
  for (let i = 0; i < 5; i++) await tick();
}

function bothRead() {
  let r = R.createRound({ id: 'r1', number: 2, sessionId: 's1', now: NOW, participants: [
    { userId: ME(), userName: 'Me', actorId: 'pc-me', actorName: 'Kira' },
    { userId: 'pl-2', userName: 'Quinn', actorId: 'pc-ren', actorName: 'Ren' },
  ] });
  r = R.recordReading(R.submitEntry(r, { userId: ME(), text: 'I gun the bike at the wraiths.', submissionId: 'sub1', now: NOW }),
    { userId: ME(), submissionId: 'sub1', reading: READING });
  r = R.recordReading(R.submitEntry(r, { userId: 'pl-2', text: 'I cover the hatch.', submissionId: 'sub2', now: NOW }),
    { userId: 'pl-2', submissionId: 'sub2', reading: REN_READING });
  return r;
}

/** The player's choices in the reading's form, as a browser leaves them. */
function choose(root) {
  root.querySelector('.sf-applicable-ability-cb[data-key="hb"]').checked = false;       // not this time: no weak-hit cost
  root.querySelector('input[name="sf-stat-sub"][value=""]').checked = false;             // a radio group: one checked
  root.querySelector('input[name="sf-stat-sub"][value="heart"]').checked = true;         // +heart instead of +iron
  root.querySelector('input[name="sf-round-target"][value="f2"]').checked = true;        // the wraiths
}
const picks = (root) => ({
  hoverbike: root.querySelector('.sf-applicable-ability-cb[data-key="hb"]').checked,
  empath:    root.querySelector('.sf-applicable-ability-cb[data-key="em"]').checked,
  stat:      root.querySelector('input[name="sf-stat-sub"]:checked')?.getAttribute('value') ?? null,
  target:    root.querySelector('input[name="sf-round-target"]:checked')?.getAttribute('value') ?? null,
});
const CHOSEN = { hoverbike: false, empath: true, stat: 'heart', target: 'f2' };

beforeEach(() => {
  relayed.calls.length = 0;
  registerBatchModeSettings();
  game.settings._store.set(`${MODULE_ID}.batchMode.enabled`, true);
  game.settings._store.set(`${MODULE_ID}.batchMode.draft`, '');
  game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, currentSessionId: 's1' });
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
});

afterEach(() => {
  globalThis.document = savedDocument;
  for (const k of ['batchMode.enabled', 'batchMode.round', 'batchMode.draft', 'campaignState']) game.settings._store.delete(`${MODULE_ID}.${k}`);
});

describe('the Round window keeps the reading\'s picks across a re-render (issue #342 Z06)', () => {
  it('control: with no re-render, Confirm relays what the player chose', async () => {
    const round = bothRead();
    storeRound(round);
    const app = await RoundWindowApp.open();
    choose(app.element);
    expect(picks(app.element)).toEqual(CHOSEN);
    await RoundWindowApp.DEFAULT_OPTIONS.actions.confirm.call(app, null, null);
    expect(relayed.calls).toEqual([{ kind: 'batch.confirm', payload: {
      roundId: 'r1', submissionId: 'sub1', choices: { abilityIds: ['em'], statReplacement: 'heart', targetId: 'f2' },
    } }]);
    await app._onClose({});
  });

  it('another player confirming re-renders the window — and the player\'s picks survive it', async () => {
    const round = bothRead();
    storeRound(round);
    registerRoundWindowHooks();                       // production wiring: the round's onChange → the window
    for (let i = 0; i < 5; i++) await tick();         // a round open at load opens the window
    const app = RoundWindowApp.instance;
    expect(app?.rendered).toBe(true);
    choose(app.element);
    const before = app.element.querySelector('.sf-applicable-ability-cb[data-key="hb"]');

    // Ren confirms on their own client; the canonical GM writes the round.
    await roundWrittenElsewhere(R.confirmEntry(round, { userId: 'pl-2', submissionId: 'sub2', choices: {}, now: NOW }));

    // Control: it re-rendered — Ren's line is in the Ready list, the form is a new one.
    expect(app.element.querySelector('.sf-round-table')?.textContent ?? '').toContain('I cover the hatch.');
    expect(app.element.querySelector('.sf-applicable-ability-cb[data-key="hb"]')).not.toBe(before);

    // The finding: the player's choices are what they left them.
    expect(picks(app.element)).toEqual(CHOSEN);

    await RoundWindowApp.DEFAULT_OPTIONS.actions.confirm.call(app, null, null);
    expect(relayed.calls.at(-1)).toEqual({ kind: 'batch.confirm', payload: {
      roundId: 'r1', submissionId: 'sub1', choices: { abilityIds: ['em'], statReplacement: 'heart', targetId: 'f2' },
    } });
    await app._onClose({});
  });

  it('the window\'s own "pick one first" re-render keeps the ability picks — no other player needed', async () => {
    storeRound(bothRead());
    const app = await RoundWindowApp.open();
    // The player unchecks the Hoverbike's add and takes +heart — but forgets the fight.
    app.element.querySelector('.sf-applicable-ability-cb[data-key="hb"]').checked = false;
    app.element.querySelector('input[name="sf-stat-sub"][value=""]').checked = false;
    app.element.querySelector('input[name="sf-stat-sub"][value="heart"]').checked = true;
    await RoundWindowApp.DEFAULT_OPTIONS.actions.confirm.call(app, null, null);
    // Control: refused and said so, nothing relayed.
    expect(relayed.calls).toEqual([]);
    expect(app.element.textContent).toContain('Which fight? — pick one first.');

    // The player picks the fight and confirms again.
    app.element.querySelector('input[name="sf-round-target"][value="f2"]').checked = true;
    await RoundWindowApp.DEFAULT_OPTIONS.actions.confirm.call(app, null, null);
    expect(relayed.calls).toEqual([{ kind: 'batch.confirm', payload: {
      roundId: 'r1', submissionId: 'sub1', choices: { abilityIds: ['em'], statReplacement: 'heart', targetId: 'f2' },
    } }]);
    await app._onClose({});
  });

  it('a new reading of the action (Edit, submitted again) starts from its own defaults', async () => {
    const round = bothRead();
    storeRound(round);
    const app = await RoundWindowApp.open();
    choose(app.element);
    // The action is edited and read again: another submission, the same reading's shape.
    const reread = R.recordReading(R.submitEntry(round, { userId: ME(), text: 'I gun the bike at the guards.', submissionId: 'sub3', now: NOW }),
      { userId: ME(), submissionId: 'sub3', reading: READING });
    storeRound(reread);
    await app.render();
    expect(picks(app.element)).toEqual({ hoverbike: true, empath: true, stat: '', target: null });
    await app._onClose({});
  });
});
