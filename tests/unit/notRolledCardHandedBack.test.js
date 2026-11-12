/**
 * A move the pipeline does not roll is not lost in silence (alpha 23 playtest:
 * "Re-interpret" on a roll did nothing; issue #347 AB06).
 *
 * The confirm dialog's cancel (it read "Re-interpret") and its ✕ settle it
 * false, and the pipeline returned: a typed line went nowhere and nobody was
 * told, and a card button's forced move left its card claimed — the button
 * read taken for good for a move never made. Now the card is handed back
 * (cardActions.releaseSourceCard), and a "Not rolled" notice is whispered to
 * the line's author, the roller's players and the GMs; a typed line goes back
 * in its author's chat box.
 *
 * (The first case is converted from the thirteenth audit's probe
 * tests/probes/movesa/claimedCardConfirmClosed.probe.js.)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

const control = vi.hoisted(() => ({ dice: [0.0, 0.15, 0.99], confirm: () => true, interpretFails: false }));
vi.mock('../../src/pacing/router.js', async (importOriginal) => ({
  ...(await importOriginal()),
  routePacedInput: vi.fn(async () => ({ runMove: true, decision: 'MOVE', suggestedMove: null })),
}));
vi.mock('../../src/moves/interpreter.js', async (importOriginal) => ({
  ...(await importOriginal()),
  interpretMove: vi.fn(async (text, { expectedMoveSlug } = {}) => {
    if (control.interpretFails) throw new Error('Claude API 529 overloaded');
    return {
      moveId: expectedMoveSlug ?? 'set_a_course', moveName: 'Set a Course', statUsed: expectedMoveSlug ? 'wits' : 'supply', adds: 0,
      rationale: 'test', mischiefApplied: false, playerNarration: text, inputMethod: 'chat',
    };
  }),
}));
vi.mock('../../src/moves/abilityScanner.js', async (importOriginal) => ({
  ...(await importOriginal()),
  scanForApplicableAbilities: vi.fn(async () => []),
}));
vi.mock('../../src/ui/settingsPanel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  confirmInterpretation: vi.fn(async (interpretation) => control.confirm(interpretation)),
}));
vi.mock('../../src/moves/resolver.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    resolveMove: vi.fn((...args) => {
      const dice = vi.spyOn(Math, 'random');
      for (const d of control.dice) dice.mockReturnValueOnce(d);
      try { return original.resolveMove(...args); } finally { dice.mockRestore(); }
    }),
  };
});

import { simulateTable, USERS, MODULE_ID } from '../helpers/multiClient.js';
import { scriptClaude } from '../helpers/faults.js';
import { CampaignStateSchema } from '../../src/schemas.js';

let table, vow;

function makeVow() {
  const item = {
    id: 'vow-1', type: 'progress', name: 'Find Chen', flags: { [MODULE_ID]: { vowId: 'vid-chen' } },
    system: { subtype: 'vow', rank: 'dangerous', current: 0, completed: false },
    async update(changes) { for (const [k, v] of Object.entries(changes)) if (k === 'system.current') item.system.current = v; return item; },
    async setFlag(scope, key, value) { (item.flags[scope] ??= {})[key] = value; return item; },
  };
  return item;
}

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  control.dice = [0.0, 0.15, 0.99];
  control.confirm = () => true;
  control.interpretFails = false;
  await table.reset({ world: { settings: {
    chronicleAutoEntry: false,
    campaignState: { ...CampaignStateSchema, sessionActive: true, currentSessionId: 'sess-1', sessionNumber: 1, currentSceneId: 'sc-1', sceneTruths: [] },
  } } });
  vow = makeVow();
  table.addActor({ id: 'pc-1', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [vow] } });
  await table.setClaudeKey('gm-1', 'sk-ant-gina');
  scriptClaude(table);
  silenceConsoleErrors();
});

/** Kira's Gather Information strong hit: its move card offers "⚑ Mark Progress on Vow". */
async function postMoveCardWithMilestoneButton() {
  table.client('pl-1').chat('I comb the archive for word of Chen.', {
    speaker: { actor: 'pc-1', alias: 'Kira' },
    flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'gather_information' } },
  });
  await table.settle(); await table.drain();
  const [card] = table.cards(f => f.moveResolution && f.milestoneSuggestion?.eligible);
  expect(card, 'the strong hit posted a move card with the milestone suggestion').toBeTruthy();
  return card;
}

describe('a claimed card button whose forced move the GM does not confirm', () => {
  it('the GM closes the confirm dialog of the button\'s Reach a Milestone: the card is pressable again', async () => {
    const card = await postMoveCardWithMilestoneButton();

    // The GM closes (or cancels) the confirm dialog of the forced Reach a Milestone.
    control.confirm = (interpretation) => interpretation?.moveId !== 'reach_a_milestone';
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();

    // The forced move was posted and went nowhere: nothing marked, the lock free.
    expect(table.cards(f => f.forcedMoveId === 'reach_a_milestone')).toHaveLength(1);
    expect(vow.system.current, 'no milestone was marked').toBe(0);
    expect(table.world.campaignState().pendingMove, 'the move lock is free').toBe(false);

    // FAILS today: the claim stands — the button is dead on every client and nothing hands it back.
    const claimed = table.world.message(card._id).flags[MODULE_ID].milestoneMarked === true;
    expect(claimed, 'the card\'s claim is released when its forced move is not rolled').toBe(false);

    // …so the press can be made again and marks the vow.
    control.confirm = () => true;
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    expect(vow.system.current).toBe(8);
  }, 30_000);

  it('control: the same press with the dialog accepted marks the vow once and keeps the claim', async () => {
    const card = await postMoveCardWithMilestoneButton();
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    const claimed = table.world.message(card._id).flags[MODULE_ID].milestoneMarked === true;
    expect({ ticks: vow.system.current, claimed }).toEqual({ ticks: 8, claimed: true });
  }, 30_000);
});

/** The "Not rolled" notices posted since `before`, as { whisper, text, flags }. */
function notRolledNotices(before = new Set()) {
  return table.cards(f => !!f.moveNotRolledNotice)
    .filter(c => !before.has(c._id))
    .map(c => ({ whisper: table.world.message(c._id).whisper ?? [], text: String(table.world.message(c._id).content ?? ''), flags: c.flags?.[MODULE_ID] ?? table.world.message(c._id).flags[MODULE_ID] }));
}
const cardIds = () => new Set(table.cards(() => true).map(c => c._id));

describe('the "Not rolled" notice', () => {
  it('a card button\'s move cancelled: its player is told the button is live again', async () => {
    const card = await postMoveCardWithMilestoneButton();
    const before = cardIds();
    control.confirm = (interpretation) => interpretation?.moveId !== 'reach_a_milestone';
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();

    const [notice, ...more] = notRolledNotices(before);
    expect(more).toHaveLength(0);
    expect(notice.flags.moveNotRolledNotice).toBe('cancelled');
    expect(notice.whisper).toEqual(expect.arrayContaining(['pl-1', 'gm-1']));
    expect(notice.text).toMatch(/Reach a Milestone/);
    expect(notice.text).toMatch(/button is live again/);
    expect(notice.flags.restoreLine, 'a card\'s move has no line to give back').toBeUndefined();
  }, 30_000);

  it('a typed line cancelled: its author is told to re-word it, and it goes back in their chat box', async () => {
    const box = { value: '', focused: false, dispatchEvent() {}, focus() { this.focused = true; } };
    const realDocument = globalThis.document;
    globalThis.document = {
      querySelector: (sel) => (sel === '#chat-message' ? box : null),
      createElement: () => {
        let html = '';
        return { set innerHTML(v) { html = String(v); }, get innerHTML() { return html; },
          get textContent() { return html.replace(/<[^>]*>/g, ''); } };
      },
    };
    try {
      const before = cardIds();
      control.confirm = () => false;   // "Cancel — re-word"
      await table.client('pl-1').chat('please set a course', { speaker: { actor: 'pc-1', alias: 'Kira' } });
      await table.settle(); await table.drain();

      expect(table.cards(f => f.moveResolution)).toHaveLength(0);
      expect(table.world.campaignState().pendingMove).toBe(false);
      const [notice] = notRolledNotices(before);
      expect(notice.whisper).toEqual(expect.arrayContaining(['pl-1', 'gm-1']));
      expect(notice.text).toMatch(/Set a Course/);
      expect(notice.text).toMatch(/Re-word your line and send it again/);
      expect(notice.flags).toMatchObject({ restoreLineFor: 'pl-1', restoreLine: 'please set a course' });
      // Only the author's client writes its chat box — the GM's client ran the same hook.
      expect(box.value).toBe('please set a course');
      expect(box.focused).toBe(true);
    } finally {
      globalThis.document = realDocument;
    }
  }, 30_000);

  it('a draft already in the author\'s chat box is left alone', async () => {
    const box = { value: 'half a thought', dispatchEvent() {}, focus() {} };
    const realDocument = globalThis.document;
    globalThis.document = { querySelector: () => box, createElement: () => ({ innerHTML: '', textContent: '' }) };
    try {
      control.confirm = () => false;
      await table.client('pl-1').chat('please set a course', { speaker: { actor: 'pc-1', alias: 'Kira' } });
      await table.settle(); await table.drain();
      expect(box.value).toBe('half a thought');
    } finally {
      globalThis.document = realDocument;
    }
  }, 30_000);

  it('a paced card\'s Roll cancelled: the card no longer reads "Rolled"', async () => {
    const msg = await table.client('gm-1').run(() => globalThis.ChatMessage.create({
      content: '<div class="sf-narration-card sf-narration-card--paced"><div class="sf-narration-prose">The corridor bends.</div>'
        + '<div class="sf-paced-actions"><button type="button" class="sf-paced-roll-btn" data-action="sf-paced-roll">Roll Set a Course</button></div></div>',
      flags: { [MODULE_ID]: {
        narratorCard: true, narrationCard: true, pacedNarrative: true, narrationText: 'The corridor bends.',
        playerText: 'please set a course', playerName: 'Kira', actorId: 'pc-1', suggestedMove: 'set_a_course', sessionId: 'sess-1',
      } },
    }));
    await table.settle();
    control.confirm = () => false;
    table.client('pl-1').click(msg.id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();

    expect(table.world.message(msg.id).flags[MODULE_ID].rolled).toBe(false);
    const btn = table.client('pl-1').render(msg.id).querySelector('[data-action="sf-paced-roll"]');
    expect(btn?.disabled).not.toBe(true);

    control.confirm = () => true;   // pressed again, it rolls
    table.client('pl-1').click(msg.id, '[data-action="sf-paced-roll"]');
    await table.settle(); await table.drain();
    expect(table.cards(f => f.moveResolution)).toHaveLength(1);
  }, 30_000);

  it('the reading of a typed line fails: its author is told, not only the GM\'s screen', async () => {
    const before = cardIds();
    control.interpretFails = true;
    await table.client('pl-1').chat('please set a course', { speaker: { actor: 'pc-1', alias: 'Kira' } });
    await table.settle(); await table.drain();

    expect(table.client('gm-1').notifications.map(n => n.message).join(' ')).toMatch(/interpretation failed/i);
    const [notice] = notRolledNotices(before);
    expect(notice.flags.moveNotRolledNotice).toBe('failed');
    expect(notice.whisper).toContain('pl-1');
    expect(notice.text).toMatch(/failed, so nothing was rolled/);
    expect(table.world.campaignState().pendingMove).toBe(false);
  }, 30_000);

  it('a player\'s own line naming a card to hand back is not trusted', async () => {
    const card = await postMoveCardWithMilestoneButton();
    control.confirm = () => true;
    table.client('pl-1').click(card._id, '[data-action="sf-reach-milestone"]');
    await table.settle(); await table.drain();
    expect(table.world.message(card._id).flags[MODULE_ID].milestoneMarked).toBe(true);

    control.confirm = () => false;
    await table.client('pl-1').chat('Mark it again.', {
      speaker: { actor: 'pc-1', alias: 'Kira' },
      flags: { [MODULE_ID]: { bypassPacing: true, forcedMoveId: 'reach_a_milestone',
        sourceCard: { messageId: card._id, claim: 'milestoneMarked', release: false } } },
    });
    await table.settle(); await table.drain();
    expect(table.world.message(card._id).flags[MODULE_ID].milestoneMarked).toBe(true);
  }, 30_000);
});
