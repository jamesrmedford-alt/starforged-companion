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
 *                                     bound PC for this Foundry user),
 *                                     honoured only when it is a player
 *                                     character — a user whose assigned
 *                                     character is the crew's starship or
 *                                     an NPC card falls through (issue
 *                                     #321 U24)
 *   3. first Actor type === "character" that the author OWNS via
 *      Foundry's permission system
 *   4. the campaign's first PC — only for a GM author or in solo play
 *      (a single PC in the world). A player with no PC of their own is
 *      never handed another player's character (issue #321 U23).
 *
 * Steps 2–4 are resolveUserActorId — "whose PC is this user?" — the one
 * resolver every path that acts for a user rather than a message (the
 * Private Channel, the Chronicle toolbar, a connection's bond Item) shares.
 */

import { getPlayerActors, isPlayerCharacterActor } from "../character/actorBridge.js";

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
    if (isPlayerCharacterActor(actor)) return actor.id;
  }

  // 2–4. The author's own PC.
  return resolveUserActorId(messageAuthor(message), campaignState);
}

/**
 * "Whose PC is this user?" — the user's own player character, roller / owner
 * first (issue #321 U23). The one resolver for every path that acts for a
 * user: a chat message's author (resolveSpeakerActorId), the Private
 * Channel's player, the Chronicle toolbar's viewer, the PC a narration — and
 * so a new connection's bond Item — belongs to.
 *
 *   1. User#character — honoured only when it is a player character: a user
 *      can assign the starship or an NPC card as their character, and
 *      attributing to it rolls the ship's (absent) stats and writes the
 *      move's effects onto it (issue #321 U24).
 *   2. The first PC the user OWNS. A player can own a PC without setting it
 *      as their User#character. Foundry's testUserPermission is the
 *      canonical check (a GM owns every actor); the raw ownership map is
 *      read when testUserPermission isn't available (e.g. test mocks).
 *   3. The campaign's first PC — only for a GM (who plays the GM-run PCs and
 *      solo games) or in solo play (a single PC in the world). Otherwise
 *      null: a player with no PC of their own is never handed another
 *      player's character.
 *
 * @param {User|Object|null} user
 * @param {Object|null}      campaignState
 * @returns {string|null} Actor id or null
 */
export function resolveUserActorId(user, campaignState) {
  const bound = user?.character ?? null;
  if (bound?.id) {
    const actor = globalThis.game?.actors?.get?.(bound.id) ?? bound;
    if (isPlayerCharacterActor(actor)) return actor.id;
  }

  if (user?.id && globalThis.game?.actors) {
    const owned = filterPlayerOwnedCharacters(user);
    if (owned.length) return owned[0].id;
  }

  const pcs = getPlayerActors();
  if (!user?.isGM && pcs.length > 1) return null;
  return campaignState?.characterIds?.[0] ?? pcs[0]?.id ?? null;
}

/**
 * The User who wrote a message. Foundry v13 exposes it as `message.author`;
 * a shape that carries only the id (legacy / programmatic) is looked up, so
 * the GM check in resolveUserActorId still sees the author's role.
 */
function messageAuthor(message) {
  const author = message?.author ?? null;
  if (author && typeof author === "object") return author;
  const id = messageAuthorId(message);
  return id ? (globalThis.game?.users?.get?.(id) ?? null) : null;
}

function filterPlayerOwnedCharacters(user) {
  const all = Array.from(globalThis.game.actors ?? []);
  return all.filter(a => {
    if (!isPlayerCharacterActor(a)) return false;
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
