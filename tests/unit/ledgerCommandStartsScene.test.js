// tests/unit/ledgerCommandStartsScene.test.js
// A `!truth set` / `!state set` typed with no scene open reaches the scene
// the next narration plays in (issue #326 W59). applyFactContinuityCommand
// wrote the ledger with no scene: the next narration's startScene ended that
// phantom scene first — the GM's state discarded, the truth migrated out —
// and a move already in flight (its snapshot read before the command) wrote
// its empty ledgers over them. The command now starts the scene, as a
// narration does (ensureSceneStarted, the issue #321 U34 rule).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyFactContinuityCommand } from '../../src/factContinuity/chatCommands.js';
import { startScene } from '../../src/factContinuity/sceneLifecycle.js';
import { buildLedgerBlock } from '../../src/narration/narratorPrompt.js';
import { installJournalMock } from '../helpers/fullStateFixture.js';

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

/**
 * The next narration on the canonical GM: ensureSceneStarted on the
 * pipeline's copy — startScene only when the copy holds no scene.
 */
async function nextNarration() {
  const copy = foundry.utils.deepClone(stored());
  if (!copy.currentSceneId) await startScene(copy, { reason: 'first_narration_move_resolution' });
  return copy.currentSceneId;
}

describe('a `!truth set` / `!state set` typed between scenes reaches the next scene (issue #326 W59)', () => {
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

    // The command started the scene; the next narration continues it.
    const commandScene = stored().currentSceneId;
    expect(commandScene).toBeTruthy();
    expect(await nextNarration()).toBe(commandScene);

    // The phantom scene used to be ended — sceneTruths [] and sceneState.bySubject {}.
    const block = buildLedgerBlock(stored(), {}).combined;
    expect(block).toMatch(/The station is under lockdown/);
    expect(block).toMatch(/lighting: red emergency lights/);
  });

  it('a truth set while a move was already in flight (its snapshot predates the command) is not erased by that move\'s scene start', async () => {
    const pipelineSnapshot = foundry.utils.deepClone(stored());   // read before the confirm dialog
    await applyFactContinuityCommand({ text: '!truth set scene The reactor is leaking' }, { requesterIsGM: true });

    await startScene(pipelineSnapshot, { reason: 'first_narration_move_resolution' });

    // startScene wrote the snapshot's empty sceneTruths over the store — the truth was
    // neither in the new scene nor archived anywhere.
    expect(buildLedgerBlock(stored(), {}).combined).toMatch(/The reactor is leaking/);
  });
  it('control: a strike with no scene open starts none', async () => {
    await applyFactContinuityCommand({ text: '!truth strike abcd' }, { requesterIsGM: true });
    expect(stored().currentSceneId).toBeNull();
  });
});
