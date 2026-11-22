/**
 * STARFORGED COMPANION
 * tests/helpers/sequence/pipelineMocks.js — the move pipeline's dice, chosen by the command
 *
 * Issue #302 slice C. A booted table's pipeline is real; three things on it
 * cannot be: the move confirmation dialog (an ApplicationV2 the harness's
 * `answerDialogs` cannot answer), the asset-ability scan (a Claude call per
 * move the sequences do not need), and the dice. A test file that runs
 * sequences mocks those three at its top, as every booted-table test does:
 *
 *   const control = vi.hoisted(() => ({ dice: [], recommitDice: null, unread: [] }));
 *   vi.mock('../../src/ui/settingsPanel.js', async (o) => ({ ...(await o()), confirmInterpretation: async () => true }));
 *   vi.mock('../../src/moves/abilityScanner.js', async (o) => ({ ...(await o()), scanForApplicableAbilities: async () => [] }));
 *   vi.mock('../../src/moves/resolver.js', async (o) =>
 *     (await import('../helpers/sequence/pipelineMocks.js')).scriptedResolver(await o(), control));
 *
 * `control` must be the test file's own vi.hoisted object: a mock factory is
 * evaluated once and shared by every simulated client, but a module it
 * imports is loaded in whichever client's module graph first asked — a
 * control object exported from here would be a different object on each.
 */

import { withScriptedDice } from "../scriptedDice.js";

/** Empty the control between sequences. */
export function resetControl(control) {
  control.dice = [];
  control.recommitDice = null;
  control.unread = [];
}

/**
 * src/moves/resolver.js with the dice scripted:
 *   - `resolveMove` reads `control.dice` first (Math.random values — see
 *     scriptedDice.js `actionDice` / `progressDice`), taking them all; reads
 *     the script does not cover fall through. Values nothing read are kept in
 *     `control.unread`, so a command can tell its dice were never rolled.
 *   - `rollChallengeDice`, as index.js calls it for a recommit, returns
 *     `control.recommitDice` (two faces) once.
 */
export function scriptedResolver(original, control) {
  return {
    ...original,
    resolveMove: (...args) => withScriptedDice(
      control.dice.splice(0),
      () => original.resolveMove(...args),
      { leftover: (rest) => control.unread.push(...rest) },
    ),
    rollChallengeDice: () => {
      const scripted = control.recommitDice;
      if (Array.isArray(scripted) && scripted.length === 2) {
        control.recommitDice = null;
        return [...scripted];
      }
      return original.rollChallengeDice();
    },
  };
}
