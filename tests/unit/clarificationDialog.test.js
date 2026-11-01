/**
 * STARFORGED COMPANION
 * tests/unit/clarificationDialog.test.js
 *
 * The move pipeline pauses on ClarificationDialog when relevance finds an
 * implicit reference ("I ask her about the cargo"). Picking a known
 * connection must hand the narrator that connection: the relevance result's
 * entityIds drive the entity cards (narrator.js collectEntityCards), the
 * consistency audit scope and the post-narration tier update.
 *
 * Connections are NPC-card Actors since FOLDER-002 — campaignState.connectionIds
 * holds Actor ids. The options used to resolve each id through game.journal,
 * which never holds an Actor-hosted connection, so every option carried a
 * null id and every pick yielded entityIds [] (issue #321 U37).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { ClarificationDialog, applyClarificationSelection } from '../../src/world/clarificationDialog.js';
import { addConnectionEntity } from '../helpers/fullStateFixture.js';

afterEach(() => { global.game.actors._reset(); });

const pendingRelevance = () => ({
  resolvedClass: 'interaction', entityIds: [], entityTypes: [], matchedNames: [],
  needsClarification: true, referenceType: 'pronoun',
});

/** Open the dialog and read the options it would render. */
async function openDialog(campaignState, relevance = pendingRelevance()) {
  const pending = ClarificationDialog.prompt(campaignState, relevance);
  const dialog  = ClarificationDialog.pending;
  const ctx     = await dialog._prepareContext({});
  return { pending, dialog, options: ctx.options, relevance };
}

describe('ClarificationDialog — picking a recorded connection', () => {
  it('offers the connection under its host (Actor) id, and the pick puts that id in relevance.entityIds', async () => {
    const sable = addConnectionEntity(null, { name: 'Sable', role: 'AI navigator' });
    const { pending, dialog, options, relevance } = await openDialog({ connectionIds: [sable.journalId] });

    const option = options.find(o => o.name === 'Sable');
    expect(option).toMatchObject({ journalId: sable.journalId, type: 'connection', role: 'AI navigator' });

    // Click the option exactly as the rendered button delivers it
    // (data-id="${escapeHtml(o.journalId)}").
    const target = { dataset: { id: String(option.journalId ?? ''), type: option.type, name: option.name } };
    ClarificationDialog.DEFAULT_OPTIONS.actions.pick.call(dialog, {}, target);
    const updated = applyClarificationSelection(relevance, await pending);

    expect(updated).toMatchObject({
      resolvedClass: 'interaction',
      entityIds:     [sable.journalId],
      entityTypes:   ['connection'],
      matchedNames:  ['Sable'],
      needsClarification: false,
    });
  });

  it('offers every connection under its own host id, in campaign order', async () => {
    const sable = addConnectionEntity(null, { name: 'Sable' });
    const kael  = addConnectionEntity(null, { name: 'Kael Dros' });
    const { dialog, options } = await openDialog({ connectionIds: [sable.journalId, kael.journalId] });

    expect(options.map(o => [o.name, o.journalId])).toEqual([
      ['Sable', sable.journalId],
      ['Kael Dros', kael.journalId],
    ]);
    dialog.close();
  });

  it('offers no lost or unresolvable connection', async () => {
    const sable = addConnectionEntity(null, { name: 'Sable' });
    const gone  = addConnectionEntity(null, { name: 'Orrin' });
    global.game.actors.get(gone.journalId).flags['starforged-companion'].connection.active = false;
    const { dialog, options } = await openDialog({ connectionIds: [sable.journalId, gone.journalId, 'actor-missing'] });

    expect(options.map(o => o.journalId)).toEqual([sable.journalId]);
    dialog.close();
  });
});
