/**
 * PROBE — CLARIFY-PICK-NO-ENTITY (src/world/clarificationDialog.js)
 *
 * The move pipeline pauses on ClarificationDialog when relevance finds an
 * implicit reference ("I ask her about the cargo"). Picking a known
 * connection must hand the narrator that connection: the relevance result's
 * entityIds drive the entity cards (narrator.js collectEntityCards), the
 * consistency audit scope and the post-narration tier update.
 *
 * Connections are NPC-card Actors since FOLDER-002 — campaignState.connectionIds
 * holds Actor ids — but collectOptions resolves each option's id through
 * resolveJournalId, which looks the id up in game.journal and reads
 * page.flags[...].connection. That never matches an Actor-hosted connection,
 * so every option carries journalId null → data-id="" → the pick yields
 * entityIds [] and the chosen NPC's card never reaches the narrator.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { ClarificationDialog, applyClarificationSelection } from '../../../src/world/clarificationDialog.js';
import { addConnectionEntity } from '../../helpers/fullStateFixture.js';

afterEach(() => { global.game.actors._reset(); });

describe('ClarificationDialog — picking a recorded connection', () => {
  it('offers the connection under its host (Actor) id, and the pick puts that id in relevance.entityIds', async () => {
    const sable = addConnectionEntity(null, { name: 'Sable', role: 'AI navigator' });
    const campaignState = { connectionIds: [sable.journalId] };
    const relevance = {
      resolvedClass: 'interaction', entityIds: [], entityTypes: [], matchedNames: [],
      needsClarification: true, referenceType: 'pronoun',
    };

    const pending = ClarificationDialog.prompt(campaignState, relevance);
    const dialog  = ClarificationDialog.pending;
    const ctx     = await dialog._prepareContext({});
    const option  = ctx.options.find(o => o.name === 'Sable');
    expect(option, 'Sable is offered').toBeTruthy();

    // The id the option carries is what the rendered button's data-id holds.
    expect.soft(option.journalId).toBe(sable.journalId);

    // Click the option exactly as the rendered button would deliver it
    // (data-id="${escapeHtml(o.journalId)}" → "" for a null id).
    const target = { dataset: { id: String(option.journalId ?? ''), type: option.type, name: option.name } };
    ClarificationDialog.DEFAULT_OPTIONS.actions.pick.call(dialog, {}, target);
    const selection = await pending;
    const updated = applyClarificationSelection(relevance, selection);

    expect(updated.resolvedClass).toBe('interaction');
    expect(updated.entityIds).toEqual([sable.journalId]);
  });
});
