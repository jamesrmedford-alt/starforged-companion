/**
 * STARFORGED COMPANION
 * tests/unit/roundWindow.test.js
 *
 * Issue #340 — the Batch Mode Round window (src/ui/roundWindow.js) renders
 * the view model and relays what the player does. Rendered on the stub DOM:
 * the action box (Enter submits; the draft kept), a reading to confirm with
 * the confirm dialog's own ability form and the target pick, the no-roll
 * offers, the upgrade decision, and a GM's controls. Its Confirm reads the
 * shared form as the dialog does; a submit with no GM connected says it
 * wasn't saved and keeps the draft.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';

const relayed = vi.hoisted(() => ({ calls: [], answer: { ok: true, relayed: true } }));
vi.mock('../../src/multiplayer/gmRelay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  requestGmAction: vi.fn(async (kind, payload) => { relayed.calls.push({ kind, payload }); return relayed.answer; }),
}));

const MODULE_ID = 'starforged-companion';
let RoundWindowApp, registerBatchModeSettings, R;
let savedDocument;

beforeAll(async () => {
  ({ RoundWindowApp } = await import('../../src/ui/roundWindow.js'));
  ({ registerBatchModeSettings } = await import('../../src/batch/driver.js'));
  R = await import('../../src/batch/round.js');
}, 60_000);

const NOW = '2026-11-06T10:00:00.000Z';
const ME = () => game.user.id;
const READING = {
  kind: 'move', moveId: 'strike', moveName: 'Strike', statUsed: 'iron', rationale: 'You attack.', mischiefAside: '',
  abilities: [
    { key: 'a1', assetName: 'Ace', abilityName: 'Gunslinger', adds: 1, statReplacement: '', category: 'Path', detection: 'structured' },
    { key: 'a2', assetName: 'Empath', abilityName: 'Read', adds: 0, statReplacement: 'heart', category: 'Path', detection: 'inferred' },
  ],
  statOptions: ['heart'],
  targetChoices: { kind: 'track', trackType: 'combat', prompt: 'Which fight?', options: [{ id: 'f1', label: 'Archive guards', detail: 'Dangerous, 2/10 boxes' }, { id: 'f2', label: 'Hull wraiths', detail: 'Formidable, 0/10 boxes' }] },
  interpretation: { moveId: 'strike' },
};

function roundWith(fn) {
  let r = R.createRound({ id: 'r1', number: 2, sessionId: 's1', now: NOW, participants: [
    { userId: ME(), userName: 'Me', actorId: 'pc-me', actorName: 'Kira' },
    { userId: 'pl-2', userName: 'Quinn', actorId: 'pc-ren', actorName: 'Ren' },
  ] });
  r = fn ? fn(r) : r;
  game.settings._store.set(`${MODULE_ID}.batchMode.round`, r);
  return r;
}

async function render() {
  const app = new RoundWindowApp();
  const context = await app._prepareContext({});
  const root = await app._renderHTML(context, {});
  app.element = root;
  return { app, root, context };
}

beforeEach(() => {
  relayed.calls.length = 0;
  relayed.answer = { ok: true, relayed: true };
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

describe('the action box', () => {
  it('waiting: the draft in the box, Submit and Pass', async () => {
    roundWith();
    game.settings._store.set(`${MODULE_ID}.batchMode.draft`, 'I slip through the vent.');
    const { root } = await render();
    expect(root.querySelector('textarea[name="sf-round-text"]').value ?? root.querySelector('textarea[name="sf-round-text"]').textContent).toBe('I slip through the vent.');
    expect(root.querySelector('[data-action="submit"]')).toBeTruthy();
    expect(root.querySelector('[data-action="pass"]')).toBeTruthy();
    expect(root.querySelector('.sf-round-header').textContent).toContain('Round 2');
  });

  it('Submit relays the text with a new submission id, and keeps the draft until the round shows it', async () => {
    const round = roundWith();
    const { app } = await render();
    await app.draftFromOutside('I slip through the vent.');
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    expect(relayed.calls).toEqual([{ kind: 'batch.submit', payload: { roundId: round.id, text: 'I slip through the vent.', submissionId: expect.any(String) } }]);
    expect(app.draft).toBe('I slip through the vent.');
    // The round shows it: Sent — the draft goes.
    const { submissionId } = relayed.calls[0].payload;
    const shown = R.submitEntry(round, { userId: ME(), text: 'I slip through the vent.', submissionId, now: NOW });
    game.settings._store.set(`${MODULE_ID}.batchMode.round`, shown);
    await app.onRoundUpdate(shown);
    expect(app.draft).toBe('');
  });

  it('with no GM connected: says it wasn\'t saved, and the draft is kept', async () => {
    roundWith();
    relayed.answer = { ok: false, reason: 'no-gm' };
    const { app } = await render();
    await app.draftFromOutside('I slip through the vent.');
    await RoundWindowApp.DEFAULT_OPTIONS.actions.submit.call(app, null, null);
    const context = await app._prepareContext({});
    expect(context.failure).toMatch(/No GM is connected, so this wasn't saved/);
    expect(app.draft).toBe('I slip through the vent.');
  });
});

describe('a reading to confirm', () => {
  const readRound = () => roundWith(r => R.recordReading(
    R.submitEntry(r, { userId: ME(), text: 'I strike at the nearest one.', submissionId: 'sub1', now: NOW }),
    { userId: ME(), submissionId: 'sub1', reading: READING }));

  it('shows the move, stat and rationale, the confirm dialog\'s ability form and the target pick', async () => {
    readRound();
    const { root } = await render();
    expect(root.querySelector('.sf-round-reading').textContent).toContain('Strike');
    expect(root.querySelectorAll('.sf-applicable-ability-cb')).toHaveLength(2);   // the dialog's own form
    expect(root.querySelectorAll('input[name="sf-stat-sub"]').length).toBe(2);
    expect(root.querySelectorAll('input[name="sf-round-target"]').map(i => i.getAttribute('value'))).toEqual(['f1', 'f2']);
    expect(root.querySelector('[data-action="confirm"]').textContent).toBe('Confirm');
    expect(root.querySelector('[data-action="edit"]')).toBeTruthy();
  });

  it('Confirm reads the form as the dialog does: checked abilities, a stat a checked ability offers, the picked target', async () => {
    const round = readRound();
    const { app, root } = await render();
    for (const cb of root.querySelectorAll('.sf-applicable-ability-cb')) cb.checked = cb.dataset.key === 'a1';
    root.querySelector('input[name="sf-stat-sub"][value="heart"]').checked = true;   // a2 unchecked: dropped
    root.querySelector('input[name="sf-round-target"][value="f2"]').checked = true;
    await RoundWindowApp.DEFAULT_OPTIONS.actions.confirm.call(app, null, null);
    expect(relayed.calls).toEqual([{ kind: 'batch.confirm', payload: {
      roundId: round.id, submissionId: 'sub1', choices: { abilityIds: ['a1'], statReplacement: null, targetId: 'f2' },
    } }]);
  });

  it('Confirm with no target picked says so, and relays nothing', async () => {
    readRound();
    const { app } = await render();
    await RoundWindowApp.DEFAULT_OPTIONS.actions.confirm.call(app, null, null);
    expect(relayed.calls).toEqual([]);
    expect((await app._prepareContext({})).failure).toMatch(/Which fight\? — pick one first/);
  });
});

describe('a reading with no roll', () => {
  it('offers Just narrate, and Roll ⟨move⟩ when the classifier suggested one', async () => {
    roundWith(r => R.recordReading(
      R.submitEntry(r, { userId: ME(), text: 'I lean in close.', submissionId: 'n1', now: NOW }),
      { userId: ME(), submissionId: 'n1', reading: { kind: 'narrative', suggestedMove: 'compel' } }));
    const { app, root } = await render();
    expect(root.querySelector('[data-action="confirm"]').textContent).toBe('Just narrate');
    const roll = root.querySelector('[data-action="rollInstead"]');
    expect(roll.textContent).toBe('Roll Compel');
    await RoundWindowApp.DEFAULT_OPTIONS.actions.rollInstead.call(app, null, roll);
    expect(relayed.calls[0]).toMatchObject({ kind: 'batch.reread', payload: { submissionId: 'n1', moveId: 'compel' } });
  });
});

describe('the upgrade decision', () => {
  it('offers Burn, Improve and Keep before the round is narrated', async () => {
    roundWith(r => {
      let x = R.confirmEntry(R.recordReading(R.submitEntry(r, { userId: ME(), text: 'x', submissionId: 'u', now: NOW }),
        { userId: ME(), submissionId: 'u', reading: { ...READING, targetChoices: null } }), { userId: ME(), submissionId: 'u', choices: {}, now: NOW });
      x = R.fixActing(R.beginResolution(x, { resolverId: 'gm', resolverClaim: 'c', now: NOW }));
      x = R.markRecorded(R.markRolled(x, { userId: ME(), rolled: { cardId: 'card-9', moveId: 'strike', outcome: 'weak_hit' } }), { userId: ME(), recordedAt: NOW });
      return R.beginUpgrades(x, { offers: { [ME()]: { burn: { momentum: 9, previewOutcome: 'strong_hit' }, improve: { previewOutcome: 'strong_hit', label: 'Fugitive' }, cardId: 'card-9' } } });
    });
    const { root } = await render();
    expect(root.querySelector('[data-action="burn"]').getAttribute('data-card-id')).toBe('card-9');
    expect(root.querySelector('[data-action="improve"]').textContent).toContain('Fugitive');
    expect(root.querySelector('[data-action="keep"]')).toBeTruthy();
  });
});

describe('a GM\'s controls', () => {
  it('Send now and Discard; Send now disabled under the X-Card, with the reason', async () => {
    roundWith();
    let { root } = await render();
    expect(root.querySelector('[data-action="sendNow"]').hasAttribute('disabled')).toBe(false);
    expect(root.querySelector('[data-action="discard"]')).toBeTruthy();
    game.settings._store.set(`${MODULE_ID}.campaignState`, { sessionActive: true, currentSessionId: 's1', xCardActive: true });
    ({ root } = await render());
    const send = root.querySelector('[data-action="sendNow"]');
    expect(send.hasAttribute('disabled')).toBe(true);
    expect(send.getAttribute('title')).toMatch(/X-Card is in play/);
  });
});
