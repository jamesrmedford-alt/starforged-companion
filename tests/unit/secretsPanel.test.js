/**
 * STARFORGED COMPANION
 * tests/unit/secretsPanel.test.js
 *
 * Issue #353 Phase 1 — the World Journal panel's Secrets section (decided:
 * a plan is collapsed until clicked — in solo play the GM is also the player)
 * and its actions: Edit, Reveal now, Retire.
 *   - The section lists the active plans, each a closed <details> showing only
 *     its kind and name; it is not built for a player.
 *   - Reveal now tells the table — a card with the truth and the oracle rolls
 *     behind it ("the oracle said") — and files the truth as confirmed lore.
 *     A plan with nothing decided cannot be revealed.
 *   - Edit replaces what the GM changed, and keeps what was shown or played.
 *   - Retire takes the plan out of play: the narrator no longer sees it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StubElement } from '../helpers/cardDom.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';
import { WorldJournalPanelApp } from '../../src/world/worldJournalPanel.js';
import { createSkeleton, listSkeletons, getSkeleton, editSkeleton } from '../../src/world/secrets.js';
import { getConfirmedLore } from '../../src/world/worldJournal.js';

const MODULE_ID = 'starforged-companion';
const actions = WorldJournalPanelApp.DEFAULT_OPTIONS.actions;

let journals;
let savedDialog;
beforeEach(() => {
  savedDialog = globalThis.foundry.applications?.api?.DialogV2;
  journals = installJournalMock();
  globalThis.document = { createElement: (tag) => new StubElement(tag) };
  ChatMessage._reset();
  global.game.messages = { contents: [], get: () => null };
  game.settings._store.set(`${MODULE_ID}.campaignState`, { currentSessionId: 's-1', sessionNumber: 1, currentSceneId: 'sc-1' });
  globalThis.foundry.applications.api.DialogV2 = { confirm: vi.fn(async () => true) };
});
afterEach(() => {
  journals.restore();
  delete globalThis.document;
  global.game.user.isGM = true;
  globalThis.foundry.applications.api.DialogV2 = savedDialog;
});

const plan = (over = {}) => createSkeleton({
  kind: 'threat', subject: { type: 'name', name: 'the escort' },
  truth: 'A Keeper drone that collects names.', wants: 'The crew\'s name.',
  escalation: ['It asks again'], clues: ['A pulse that counts down'], resolutions: ['Give it a false name'],
  oracleSeeds: ['Character Role: Scout', 'Character Disposition: Hostile'], sceneId: 'sc-1', ...over,
});

async function render() {
  const app = new WorldJournalPanelApp();
  const ctx = await app._prepareContext({});
  return { app, ctx };
}

describe('issue #353 — the Secrets section', () => {
  it('lists each active plan collapsed, its kind and name only until opened, with its actions', async () => {
    const filed = await plan();
    expect(filed).toBeTruthy();
    const { ctx } = await render();
    expect(ctx.secrets.map(r => r.id)).toEqual([filed.id]);
    const app = new WorldJournalPanelApp();
    const el = await app._renderHTML(await app._prepareContext({}), {});
    const html = el.outerHTML ?? el.innerHTML;
    expect(html).toContain('<h3 class="sf-wj-section-heading">Secrets</h3>');
    const details = /<details class="sf-wj-entry sf-wj-secret"[^>]*>/.exec(html)?.[0];
    expect(details).toBeTruthy();
    expect(details).not.toMatch(/\bopen\b/);   // collapsed
    expect(html).toMatch(/<summary[^>]*>[\s\S]*THREAT[\s\S]*the escort[\s\S]*hidden[\s\S]*<\/summary>/);
    for (const action of ['openSecret', 'editSecret', 'revealSecret', 'retireSecret']) {
      expect(html).toContain(`data-action="${action}" data-id="${filed.id}"`);
    }
  });

  it('is not built for a player', async () => {
    await plan();
    global.game.user.isGM = false;
    const { ctx } = await render();
    expect(ctx.secrets).toEqual([]);
  });

  it('Reveal now tells the table the truth and the oracle rolls, and files it as lore', async () => {
    const filed = await plan();
    const app = new WorldJournalPanelApp();
    app.render = vi.fn(async () => {});
    await actions.revealSecret.call(app, {}, { dataset: { id: filed.id } });

    const card = ChatMessage._created.find(m => m.flags?.[MODULE_ID]?.secretRevealCard);
    expect(card.content).toContain('Revealed: the escort');
    expect(card.content).toContain('A Keeper drone that collects names.');
    expect(card.content).toContain('The oracle said: Character Role: Scout; Character Disposition: Hostile');
    expect(getSkeleton(filed.id)).toMatchObject({ truthRevealed: true, rollsShown: true });
    expect(getConfirmedLore().map(e => e.text)).toContain('A Keeper drone that collects names.');
  });

  it('a plan with nothing decided cannot be revealed', async () => {
    const filed = await plan({ truth: '' });
    const app = new WorldJournalPanelApp();
    app.render = vi.fn(async () => {});
    await actions.revealSecret.call(app, {}, { dataset: { id: filed.id } });
    expect(ChatMessage._created.some(m => m.flags?.[MODULE_ID]?.secretRevealCard)).toBe(false);
  });

  it('Edit replaces what the GM changed, keeping what was already played or shown; the GM owns it after', async () => {
    const filed = await plan();
    await editSkeleton(filed.id, { truth: 'A Keeper drone that hunts one name.', clues: ['A pulse that counts down', 'A Choir sigil'] });
    const edited = getSkeleton(filed.id);
    expect(edited.truth).toBe('A Keeper drone that hunts one name.');
    expect(edited.clues.map(c => c.text)).toEqual(['A pulse that counts down', 'A Choir sigil']);
    expect(edited.wants).toBe('The crew\'s name.');
  });

  it('Retire takes the plan out of play', async () => {
    const filed = await plan();
    const app = new WorldJournalPanelApp();
    app.render = vi.fn(async () => {});
    await actions.retireSecret.call(app, {}, { dataset: { id: filed.id } });
    expect(listSkeletons()).toEqual([]);
    expect(listSkeletons({ includeInactive: true })[0].status).toBe('retired');
  });
});
