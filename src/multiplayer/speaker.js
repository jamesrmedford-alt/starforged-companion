/**
 * STARFORGED COMPANION
 * src/multiplayer/speaker.js — resolve "whose PC is this message for?"
 *
 * Before this helper, getActiveCharacterForPacing and the narrator's
 * _resolveCharacterIds both took campaignState.characterIds[0] — the
 * first PC in the campaign, regardless of who actually typed. In a
 * 2-player session that meant the narrator always described Player A's
 * character no matter who spoke.
 *
 * Resolution order:
 *   1. message.speaker.actor        — Foundry's native "speaking as"
 *                                     mechanism: selecting a token (or the
 *                                     user's assigned character fallback in
 *                                     ChatMessage.getSpeaker) stamps the
 *                                     message with that actor. Honoured
 *                                     ONLY when it resolves to a player
 *                                     character — a selected ship, NPC
 *                                     card, or other non-PC token falls
 *                                     through (observed in playtest: chat
 *                                     attributed to "Ship").
 *   2. message.author.character.id  — User.character (the explicitly
 *                                     bound PC for this Foundry user)
 *   3. first Actor type === "character" that the author OWNS via
 *      Foundry's permission system
 *   4. campaignState.characterIds[0] — solo-GM-play fallback
 *
 * Returns null only when there is literally no PC in the world.
 */

const OWNERSHIP_OWNER = 3;

/**
 * The id of the user who authored a chat message, or null when the message
 * carries none (programmatic / legacy shapes). Foundry v13 exposes the author
 * as `message.author` (a User); older shapes and test fixtures carry a bare
 * id on `author` / `user`, or only the raw `_source.author`. Only string ids
 * are accepted — an author object without an id is "unknown", not a match.
 *
 * @param {ChatMessage|Object|null} message
 * @returns {string|null}
 */
export function messageAuthorId(message) {
  const candidates = [
    message?.author?.id,
    message?.author,
    message?.user?.id,
    message?.user,
    message?._source?.author,
  ];
  return candidates.find(c => typeof c === "string" && c.length > 0) ?? null;
}

/**
 * True when THIS client authored the message — the run-on policy for chat
 * commands that must execute exactly once, on the typing player's client
 * (src/index.js registerChatHook). Foundry fires createChatMessage on every
 * connected client, so without this check a `!command` ran once per client.
 *
 * A message with no resolvable author (programmatic / legacy) counts as
 * authored here, preserving the pre-routing behaviour for those shapes.
 *
 * @param {ChatMessage|Object|null} message
 * @returns {boolean}
 */
export function isAuthoringClient(message) {
  const authorId = messageAuthorId(message);
  if (!authorId) return true;
  return authorId === globalThis.game?.user?.id;
}

/**
 * @param {ChatMessage|null} message
 * @param {Object|null}      campaignState
 * @returns {string|null} Actor id or null
 */
export function resolveSpeakerActorId(message, campaignState) {
  // 1. Token-selection signal — message.speaker.actor (v13 shape:
  //    { scene, token, actor, alias }). The strongest statement of intent
  //    a player can make ("I am speaking as this character"), but only
  //    when it actually points at a PC.
  const speakerActorId = message?.speaker?.actor ?? null;
  if (speakerActorId) {
    const actor = globalThis.game?.actors?.get?.(speakerActorId) ?? null;
    if (isPlayerCharacter(actor)) return actor.id;
  }

  // 2. User.character — the bound PC. Works for any player who set
  //    "character" on their User document (the standard Foundry pattern).
  const author = message?.author ?? null;
  if (author?.character?.id) {
    return author.character.id;
  }

  // 3. Ownership scan. A player can own a PC without setting it as their
  //    User#character. Foundry's testUserPermission is the canonical
  //    check; we fall back to direct ownership-map inspection when
  //    testUserPermission isn't available (e.g. test mocks).
  if (author?.id && globalThis.game?.actors) {
    const owned = filterPlayerOwnedCharacters(author);
    if (owned.length) return owned[0].id;
  }

  // 4. Solo-GM / unbound fallback — campaignState's first PC.
  return campaignState?.characterIds?.[0] ?? null;
}

/**
 * Player character = ironsworn `character` Actor WITHOUT the module's
 * entityType flag. NPC/connection cards are `character` actors too
 * (FOLDER-002) — never attribute a chat message to one; starships and
 * other actor types are never speakers.
 */
function isPlayerCharacter(actor) {
  if (!actor || actor.type !== "character") return false;
  if (actor.flags?.["starforged-companion"]?.entityType) return false;
  return true;
}

function filterPlayerOwnedCharacters(user) {
  const all = Array.from(globalThis.game.actors ?? []);
  return all.filter(a => {
    if (!isPlayerCharacter(a)) return false;
    if (typeof a.testUserPermission === "function") {
      return a.testUserPermission(user, "OWNER");
    }
    // Fallback: inspect the ownership map directly. Foundry stores it as
    // { userId: level } where 3 === OWNER.
    const ownership = a.ownership ?? {};
    return ownership[user.id] === OWNERSHIP_OWNER
        || ownership.default   === OWNERSHIP_OWNER;
  });
}
