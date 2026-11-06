/**
 * UI-11 ENTITY-PANEL-SHEET-NOTES-STALE (eleventh audit, ui).
 *
 * The Entities panel shows an NPC card's or ship's Notes from its sheet's
 * Notes tab (issue #329 X12; an NPC's pronouns too, issue #335 Y13) — but its
 * updateActor hook re-renders only for a record flag, the name or a ship's
 * impacts (`actorUpdateShowsInPanel`), never for `system.notes` or
 * `system.pronouns`. So the panel does not follow the sheet it reads.
 *
 * The sharp case is the X-Card (issue #338 D7): it takes a promoted detail out
 * of an NPC's Notes tab — after it drops the tier entry from the record
 * (retractNarrationCapture: writeEntityFlag first, then the sheet's
 * `system.notes`). The record write re-renders the open panel while the
 * Notes tab still holds the paragraph; the Notes write that removes it
 * re-renders nothing. The panel keeps showing the detail the X-Card removed.
 *
 * Correct: the panel re-renders when what it shows from the sheet changes.
 */

/* global makeTestActor */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { StubElement } from '../../helpers/cardDom.js';

const MODULE_ID = 'starforged-companion';
const DETAIL = 'She once flew escort for the Hegemony.';
let EntityPanelApp, registerEntityPanelHooks, retractNarrationCapture;
let savedDocument;

beforeAll(async () => {
  foundry.applications.api.DialogV2 = { confirm: async () => true };
  ({ EntityPanelApp, registerEntityPanelHooks } = await import('../../../src/ui/entityPanel.js'));
  ({ retractNarrationCapture } = await import('../../../src/factContinuity/retractions.js'));
  registerEntityPanelHooks();
}, 60_000);

/** `a.b.c` keys → nested objects: the diff Foundry's updateActor hook carries. */
function expand(changes) {
  const out = {};
  for (const [path, val] of Object.entries(changes)) {
    const parts = path.split('.');
    let t = out;
    for (const p of parts.slice(0, -1)) t = (t[p] ??= {});
    t[parts.at(-1)] = val;
  }
  return out;
}

/** An NPC card whose updates fire updateActor, as every client hears them. */
function npcCard() {
  const actor = makeTestActor({
    id: 'npc-vex', type: 'character', name: 'Vex',
    system: { notes: `<p class="sf-seed-intro">Vex meets your eye.</p><p>${DETAIL}</p>` },
    flags: { [MODULE_ID]: { entityType: 'connection', entityId: 'rec-vex', connection: {
      _id: 'rec-vex', name: 'Vex', role: 'Pilot', rank: 'dangerous', relationshipTicks: 0, active: true, history: [],
      generativeTier: [{ detail: DETAIL, narrationId: 'nar-x', promoted: true, promotedAt: '2026-11-06T10:00:00Z', promotedText: DETAIL }],
    } } },
  });
  const { update, setFlag } = actor;
  actor.update = async (changes) => { await update(changes); Hooks.call('updateActor', actor, expand(changes), {}, 'gm-1'); };
  actor.setFlag = async (mod, key, val) => { await setFlag(mod, key, val); Hooks.call('updateActor', actor, { flags: { [mod]: { [key]: val } } }, {}, 'gm-1'); };
  game.actors._set(actor.id, actor);
  return actor;
}

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new StubElement(tag), activeElement: null };
  game.actors._reset();
  game.settings._store.set(`${MODULE_ID}.campaignState`, { connectionIds: ['npc-vex'], currentSessionId: 's1' });
});

afterEach(() => {
  globalThis.document = savedDocument;
  game.actors._reset();
  game.settings._store.delete(`${MODULE_ID}.campaignState`);
});

describe('UI-11: the Entities panel and the sheet it reads', () => {
  it('after the X-Card takes a promoted detail off the Notes tab, the open panel no longer shows it', async () => {
    const actor = npcCard();
    const panel = EntityPanelApp.open();
    let renders = 0;
    panel.render = async function renderLikeFoundry() {
      renders += 1;
      const context = await this._prepareContext({});
      const result = await this._renderHTML(context, {});
      if (!this.element) this.element = new StubElement('div');
      this._replaceHTML(result, this.element, {});
      this.rendered = true;
      return this;
    };
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: 'npc-vex' } });
    await panel.render();
    const shown = () => panel.element.textContent.replace(/\s+/g, ' ');
    expect(shown()).toContain(DETAIL);                                  // control: the Notes row shows it

    const before = renders;
    await retractNarrationCapture(['nar-x']);                           // the X-Card's finish step
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));

    // Control: the X-Card took it out of the record and off the Notes tab, and the panel re-rendered.
    expect(actor.flags[MODULE_ID].connection.generativeTier).toEqual([]);
    expect(actor.system.notes).not.toContain(DETAIL);
    expect(renders).toBeGreaterThan(before);

    // The finding: the panel still shows it.
    expect(shown()).not.toContain(DETAIL);
  });

  it('a GM\'s edit of the Notes tab reaches the open panel', async () => {
    const actor = npcCard();
    const panel = EntityPanelApp.open();
    let renders = 0;
    panel.render = async () => { renders += 1; };
    panel.rendered = true;
    await EntityPanelApp.DEFAULT_OPTIONS.actions.selectEntity.call(panel, {}, { dataset: { journalId: 'npc-vex' } });
    const before = renders;
    // Control: a name change re-renders it.
    await actor.update({ name: 'Vex Arden' });
    expect(renders).toBe(before + 1);
    await actor.update({ 'system.notes': '<p>Vex owes the Iron Choir a favour.</p>' });
    expect(renders).toBe(before + 2);
  });
});
