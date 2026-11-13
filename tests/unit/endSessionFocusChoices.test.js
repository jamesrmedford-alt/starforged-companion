/**
 * STARFORGED COMPANION
 * tests/unit/endSessionFocusChoices.test.js
 *
 * Issue #353 R4 — at End a Session, offer the open vows and connections as
 * one-click choices for the two focus fields, beside the free text. In the
 * alpha 23 playtest both blank boxes were left empty, and the +1 momentum
 * went with them.
 *
 * And the composition behind it (issue #353 R3): the quest focus a click
 * chose is kept at End (the canonical GM's handler), carried into the next
 * session at Begin (`sessionFocus`), and names the vow the scene serves in
 * the GM's narration — THE VOW THIS SCENE SERVES, read at buildNarratorExtras.
 *
 * Production entry points: openEndSessionDialog / openBeginSessionDialog on
 * Pat's client, on the multi-client harness. The harness's dialog does not
 * run DialogV2.wait's `render` callback; each test runs it, as Foundry does,
 * with the dialog (its element the parsed form).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { simulateTable, USERS } from '../helpers/multiClient.js';
import { CampaignStateSchema } from '../../src/schemas.js';

const MODULE_ID = 'starforged-companion';
let table;
let kira;

const progressItem = (subtype, id, name, { rank = 'dangerous', ticks = 0, completed = false, flags = {} } = {}) => ({
  id, type: 'progress', name, system: { subtype, rank, current: ticks, completed }, flags,
});

beforeAll(async () => {
  table = await simulateTable({ users: [USERS.GM, USERS.P1] });
}, 30_000);
afterAll(() => table?.teardown());

beforeEach(async () => {
  await table.reset({ world: { settings: {
    sessionLogAutoWrite: false, narratorSessionSummary: false,
    campaignState: {
      ...CampaignStateSchema, currentSessionId: 'efc-s1', sessionNumber: 1, sessionActive: true,
      sessionStartedId: 'efc-s1', lastSessionTimestamp: new Date().toISOString(),
    },
  } } });
  kira = table.addActor({ id: 'pc-kira', name: 'Kira', ownership: { 'pl-1': 3 }, items: { contents: [
    progressItem('vow', 'bg-kira', 'Avenge the Iron Hollow', { rank: 'epic' }),
    progressItem('vow', 'v-beacon', 'Find the lost beacon', { rank: 'formidable', ticks: 12, flags: { [MODULE_ID]: { vowId: 'v-beacon' } } }),
    progressItem('vow', 'v-debt', 'Repay the Iron Covenant', { ticks: 4, flags: { [MODULE_ID]: { vowId: 'v-debt' } } }),
    progressItem('vow', 'v-done', 'Old business', { completed: true }),
    progressItem('bond', 'b-archer', 'Vuldar Archer'),
    progressItem('bond', 'b-mara', 'Mara', { flags: { [MODULE_ID]: { lost: true } } }),
  ] } });
});

/** Open a lifecycle dialog on Pat's client; `answer(dialog)` closes or submits it. Returns its content. */
async function openOnPat(title, opener, answer = (d) => d.close()) {
  let shown = null;
  table.client('pl-1').answerDialogs((d) => {
    if (d.title !== title) return d.close();
    shown = d.content;
    return answer(d);
  });
  const mod = await table.client('pl-1').import('../../src/safety/sessionLifecycleDialogs.js');
  await table.client('pl-1').run(() => mod[opener]());
  await table.settle();
  return shown ?? '';
}

/** Run the dialog's render callback as DialogV2.wait does, then click the choice of `field` whose value is `value`. */
function clickChoice(d, field, value) {
  d.options.render?.(null, { element: d.form });
  const choice = [...d.form.querySelectorAll(`[data-focus-field="${field}"]`)].find(b => b.dataset.focusValue === value);
  if (!choice) throw new Error(`no ${field} choice "${value}" in the dialog`);
  choice.click();
}

describe('End a Session offers the open vows and connections as focus choices (issue #353 R4)', () => {
  it('one button per open vow, and per connection held — not a fulfilled vow, not a severed connection', async () => {
    const html = await openOnPat('End a Session', 'openEndSessionDialog');
    const questValues = [...html.matchAll(/data-focus-field="questFocus" data-focus-value="([^"]+)"/g)].map(m => m[1]);
    const connValues  = [...html.matchAll(/data-focus-field="connectionFocus" data-focus-value="([^"]+)"/g)].map(m => m[1]);
    expect(questValues).toEqual(['Avenge the Iron Hollow', 'Find the lost beacon', 'Repay the Iron Covenant']);
    expect(connValues).toEqual(['Vuldar Archer']);
    // The free text stays.
    expect(html).toContain('<input type="text" name="questFocus"');
    expect(html).toContain('<input type="text" name="connectionFocus"');
  });

  it('a click fills its field — no submit — and the GM keeps the focus and pays the +1 momentum', async () => {
    await openOnPat('End a Session', 'openEndSessionDialog', (d) => {
      clickChoice(d, 'questFocus', 'Find the lost beacon');
      clickChoice(d, 'connectionFocus', 'Vuldar Archer');
      expect(d.form.querySelector('input[name="questFocus"]').value).toBe('Find the lost beacon');
      expect(d.form.querySelector('input[name="connectionFocus"]').value).toBe('Vuldar Archer');
      return d.submit();
    });
    expect(table.world.campaignState()).toMatchObject({
      sessionActive: false, sessionEndedId: 'efc-s1', questFocus: 'Find the lost beacon', connectionFocus: 'Vuldar Archer',
    });
    expect(kira.system.momentum.value).toBe(3);
    const card = table.cards(f => f.sessionLifecycleCard).find(c => /End a Session/.test(c.content));
    expect(card.content).toContain('Find the lost beacon');
    expect(card.content).toMatch(/\+1 momentum/);
  });

  it('a choice then edited by hand is sent as edited — the field is still free text', async () => {
    await openOnPat('End a Session', 'openEndSessionDialog', (d) => {
      clickChoice(d, 'questFocus', 'Repay the Iron Covenant');
      return d.submit({ 'input[name="questFocus"]': 'Repay the Iron Covenant before the auction' });
    });
    expect(table.world.campaignState().questFocus).toBe('Repay the Iron Covenant before the auction');
  });

  it('with no open vow and no connection, no choices are offered', async () => {
    for (const item of kira.items.contents) {
      if (item.system.subtype === 'vow') item.system.completed = true;
    }
    kira.items.contents.splice(0, kira.items.contents.length, ...kira.items.contents.filter(i => i.system.subtype === 'vow'));
    const html = await openOnPat('End a Session', 'openEndSessionDialog');
    expect(html).not.toContain('data-focus-field');
  });
});

describe('the chosen quest focus is the vow the next session\'s scenes serve (issue #353 R3)', () => {
  it('End → Begin → the GM\'s narration names it as the table\'s focus', async () => {
    await openOnPat('End a Session', 'openEndSessionDialog', (d) => {
      clickChoice(d, 'questFocus', 'Find the lost beacon');
      return d.submit();
    });
    await openOnPat('Begin a Session', 'openBeginSessionDialog', d => d.submit({}));

    const cs = table.world.campaignState();
    expect(cs.sessionFocus).toMatchObject({ quest: 'Find the lost beacon', sessionId: cs.currentSessionId });

    const gm = table.client('gm-1');
    const { buildNarratorExtras } = await gm.import('../../src/narration/narrator.js');
    const { buildNarratorSystemPrompt } = await gm.import('../../src/narration/narratorPrompt.js');
    const prompt = await gm.run(async () => {
      const state = foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState'));
      const extras = await buildNarratorExtras('move_resolution', state, {
        playerNarration: 'We follow the signal.',
        relevance: { resolvedClass: 'interaction', entityIds: [], entityTypes: [] },
      });
      return buildNarratorSystemPrompt(state, {}, null, '', extras);
    });
    expect(prompt).toContain('## THE VOW THIS SCENE SERVES\n\n"Find the lost beacon" (formidable, progress 3/10, sworn by Kira) — the table chose it as this session\'s quest focus.');
  });
});
