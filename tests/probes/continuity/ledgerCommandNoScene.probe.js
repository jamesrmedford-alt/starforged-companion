/**
 * PROBE — FC-03 LEDGER-COMMAND-NO-SCENE
 * (src/factContinuity/chatCommands.js applyFactContinuityCommand;
 *  src/factContinuity/sceneLifecycle.js startScene → endScene)
 *
 * What the user does: between scenes — after `!scene end`, after End a
 * Session, or at the start of a session before anyone has narrated — the GM
 * sets up what comes next: `!state set scene lighting=red emergency lights`
 * and `!truth set scene The station is under lockdown`. Then a player moves.
 *
 * What happens: the commands write the ledger with no scene open
 * (currentSceneId null — the relay handler never starts one), so the result
 * cards say "State recorded" / "Truth recorded". The next narration's
 * ensureSceneStarted → startScene sees a store with no scene but non-empty
 * ledgers and ends that phantom scene first ("implicit_due_to_new_scene"):
 * the state the GM set is discarded and the truth is migrated out of the
 * ledger to lore / a card. The new scene's TRUTHS and CURRENT STATE — the
 * binding block the narrator reads — hold neither. (When the pipeline's
 * snapshot predates the command, startScene writes its empty ledgers over
 * them instead and they are not even archived.)
 *
 * What should happen: a correction typed while no scene is active lands in
 * the scene the next narration plays in — the U34 fix (every sidecar-writing
 * narration starts a scene when none is active, ensureSceneStarted) applied
 * to the other ledger writer.
 *
 * Asserts the CORRECT behaviour; fails today.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyFactContinuityCommand } from '../../../src/factContinuity/chatCommands.js';
import { startScene } from '../../../src/factContinuity/sceneLifecycle.js';
import { buildLedgerBlock } from '../../../src/narration/narratorPrompt.js';
import { installJournalMock } from '../../helpers/fullStateFixture.js';

const MODULE_ID = 'starforged-companion';
const KEY = `${MODULE_ID}.campaignState`;
const stored = () => game.settings.get(MODULE_ID, 'campaignState');

let journals;
beforeEach(() => {
  journals = installJournalMock();
  ChatMessage._reset();
  game.settings._store.set(KEY, {
    currentSessionId: 'sess-4', sessionNumber: 4,
    currentSceneId: null,                                 // `!scene end` / End a Session closed the last one
    sceneTruths: [], sceneState: { bySubject: {}, sceneId: null }, sceneFrame: null,
  });
});
afterEach(() => {
  journals.restore();
  game.settings._store.delete(KEY);
});

/** The next narration on the canonical GM: ensureSceneStarted → startScene on the pipeline's copy. */
const nextNarrationStartsScene = () =>
  startScene(foundry.utils.deepClone(stored()), { reason: 'first_narration_move_resolution' });

describe('a `!truth set` / `!state set` typed between scenes reaches the next scene', () => {
  it('control: typed inside a scene, both stay in the ledger the narrator reads', async () => {
    game.settings._store.set(KEY, { ...stored(), currentSceneId: 'sc-live', sceneState: { bySubject: {}, sceneId: 'sc-live' } });
    await applyFactContinuityCommand({ text: '!state set scene lighting=red emergency lights' }, { requesterIsGM: true });
    await applyFactContinuityCommand({ text: '!truth set scene The station is under lockdown' }, { requesterIsGM: true });
    const block = buildLedgerBlock(stored(), {}).combined;
    expect(block).toMatch(/The station is under lockdown/);
    expect(block).toMatch(/lighting: red emergency lights/);
  });

  it('typed with no scene open, the GM\'s truth and state are still binding in the scene the next narration starts', async () => {
    expect(await applyFactContinuityCommand({ text: '!state set scene lighting=red emergency lights' }, { requesterIsGM: true }))
      .toMatch(/State recorded/);
    expect(await applyFactContinuityCommand({ text: '!truth set scene The station is under lockdown' }, { requesterIsGM: true }))
      .toMatch(/Truth recorded/);

    const sceneId = await nextNarrationStartsScene();
    expect(stored().currentSceneId).toBe(sceneId);

    // Today: the phantom scene was ended — sceneTruths [] and sceneState.bySubject {}.
    const block = buildLedgerBlock(stored(), {}).combined;
    expect(block).toMatch(/The station is under lockdown/);
    expect(block).toMatch(/lighting: red emergency lights/);
  });

  it('a truth set while a move was already in flight (its snapshot predates the command) is not erased by that move\'s scene start', async () => {
    const pipelineSnapshot = foundry.utils.deepClone(stored());   // read before the confirm dialog
    await applyFactContinuityCommand({ text: '!truth set scene The reactor is leaking' }, { requesterIsGM: true });

    await startScene(pipelineSnapshot, { reason: 'first_narration_move_resolution' });

    // Today: startScene writes the snapshot's empty sceneTruths over the store — the truth is
    // neither in the new scene nor archived anywhere.
    expect(buildLedgerBlock(stored(), {}).combined).toMatch(/The reactor is leaking/);
  });
});
