/**
 * STARFORGED COMPANION
 * tests/helpers/narrateLine.js — a line of play, narrated on a simulated table
 *
 * A narration that records its fact block: a line of free narration, run on
 * the keyed GM as the pacing router hands one in (narratePacedInput), from the
 * stored campaignState. Tests that need "a narration recorded this" used an
 * `@scene` question for it; an `@scene` answer is no longer written back
 * (known-issues SCENE-ANSWER-NOT-A-CAMERA), so they narrate a line instead.
 * `@scene` is still the cheap way to read what the next prompt holds.
 */

const MODULE_ID = 'starforged-companion';

/**
 * @param {Object} table — simulateTable's
 * @param {string} line — what the player wrote
 * @param {{ actorId?: string|null, client?: string }} [opts] — the speaking
 *   PC, and the client that narrates (the keyed GM)
 * @returns {Promise<string|null>} the narration's text
 */
export async function narrateLineOn(table, line, { actorId = null, client = 'gm-1' } = {}) {
  const runner = table.client(client);
  const { narratePacedInput } = await runner.import('../../src/narration/narrator.js');
  const text = await runner.run(() => narratePacedInput(line,
    foundry.utils.deepClone(game.settings.get(MODULE_ID, 'campaignState')), { speakerActorId: actorId }));
  await table.settle();
  return text;
}
