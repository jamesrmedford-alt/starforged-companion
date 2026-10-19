/**
 * STARFORGED COMPANION
 * src/multiplayer/commandRouting.js — which client runs a chat command
 *
 * Foundry fires createChatMessage on EVERY connected client, so each command
 * must say where it executes — before the 2026-10 audit every `!command` ran
 * once per client: independent dice and duplicate cards for `!oracle` / `!ptp`
 * / `!bond`, one Claude call per keyed client for `@scene` (plus "key not
 * configured" fallback cards from unkeyed ones), and GM-only commands that
 * warned the player and then executed anyway on the GM's client.
 *
 * The command table itself (CHAT_COMMAND_ROUTES) lives in src/index.js next to
 * its handlers; this module is the policy every client applies to it
 * (decisions.md → "Chat commands run once: author / canonical-GM /
 * keyed-runner routing"). Every client reads the same world setting and user
 * list, so all agree on the runner and a command runs exactly once.
 *
 *   AUTHOR        — only the client that typed the message. Dialogs open on the
 *                   typist's screen; dice roll once; GM-only commands check
 *                   game.user.isGM, which on the authoring client IS the
 *                   author's role. World writes a player needs go through the
 *                   canonical-GM relay (gmRelay.js).
 *   CANONICAL_GM  — only the canonical GM (gmGate.js isCanonicalGM): commands
 *                   that write world state on anyone's behalf and need no
 *                   Claude key. When no GM is connected the author is warned.
 *   CLAUDE        — commands whose job is a Claude call (and that may also
 *                   write world state: scene start, notes, premise canon). The
 *                   Claude key is per browser (issue #209), so:
 *                     • a keyed GM is connected (gmGate.js hasKeyedActiveGM) →
 *                       the canonical GM runs it. It is keyed by construction
 *                       (isCanonicalGM prefers keyed GMs), so the call succeeds
 *                       AND its world writes / narrator side-data apply;
 *                     • otherwise → the AUTHOR runs it with their own key (a
 *                       keyed player at a keyless-GM table), or gets the usual
 *                       "Claude API key not configured" fallback when keyless.
 *                       GM-only writes are then skipped (debug-logged).
 *
 * Tested every route × every table shape on the multi-client harness
 * (tests/unit/multiplayerRouting.test.js) and per policy in
 * tests/unit/commandRouting.test.js.
 */

import { isCanonicalGM, hasKeyedActiveGM } from "./gmGate.js";
import { hasActiveGM } from "./gmRelay.js";
import { isAuthoringClient, messageAuthorId } from "./speaker.js";

const MODULE_ID = "starforged-companion";

export const RUN_ON = Object.freeze({ AUTHOR: "author", CANONICAL_GM: "canonical-gm", CLAUDE: "claude" });

/**
 * Route a chat message to its command handler, honouring the run-on policy.
 * The first matching route wins.
 *
 * @param {ChatMessage} message
 * @param {Array<{ name: string, match: Function, runOn: string, run: Function }>} routes
 * @returns {Promise<boolean>} true when the message was a command (consumed on
 *   every client, whether or not it executed here); false for anything else.
 */
export async function dispatchChatCommand(message, routes) {
  for (const route of routes) {
    if (!route.match(message)) continue;
    if (!shouldRunCommandHere(message, route)) return true;
    try {
      await route.run(message);
    } catch (err) {
      console.error(`${MODULE_ID} | ${route.name} command failed:`, err);
    }
    return true;
  }
  return false;
}

/**
 * Decide whether THIS client executes a matched command. Non-executing clients
 * leave a debug breadcrumb (decisions.md → "No silent failures"); when a
 * canonical-GM command has no GM to run it, the author is told.
 *
 * @param {ChatMessage} message
 * @param {{ name: string, runOn: string }} route
 * @returns {boolean}
 */
function shouldRunCommandHere(message, route) {
  if (route.runOn === RUN_ON.CLAUDE) {
    if (hasKeyedActiveGM()) {
      if (isCanonicalGM()) return true;
      console.debug(`${MODULE_ID} | ${route.name}: a keyed GM is connected — runs on the canonical GM; standing down on this client.`);
      return false;
    }
    if (isAuthoringClient(message)) {
      console.debug(`${MODULE_ID} | ${route.name}: no keyed GM is connected — running on the author's client (its own Claude key, if any).`);
      return true;
    }
    console.debug(`${MODULE_ID} | ${route.name}: no keyed GM — runs on the author's client (${messageAuthorId(message)}); standing down.`);
    return false;
  }
  if (route.runOn === RUN_ON.CANONICAL_GM) {
    if (isCanonicalGM()) return true;
    if (isAuthoringClient(message) && !hasActiveGM()) {
      console.warn(`${MODULE_ID} | ${route.name}: no GM is connected — command not run.`);
      ui.notifications?.warn(
        `Starforged Companion: ${route.name} runs on the GM's client, and no GM is connected. Try again once a GM has joined.`,
      );
      return false;
    }
    console.debug(`${MODULE_ID} | ${route.name}: runs on the canonical GM — standing down on this client.`);
    return false;
  }
  if (isAuthoringClient(message)) return true;
  console.debug(`${MODULE_ID} | ${route.name}: authored on another client (${messageAuthorId(message)}) — standing down.`);
  return false;
}
