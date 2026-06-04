/**
 * STARFORGED COMPANION
 * src/multiplayer/speaker.js — resolve "whose PC is this message for?"
 *
 * Before this helper, getActiveCharacterForPacing and the narrator's
 * _resolveCharacterIds both took campaignState.characterIds[0] — the
 * first PC in the campaign, regardless of who actually typed. In a
 * 2-player session that meant the narrator always described Player A's
 * character no matter who spoke. The user worked around it by selecting
 * their token; we now resolve the speaker properly from the chat
 * message author.
 *
 * Resolution order:
 *   1. message.author.character.id  — User.character (the explicitly
 *                                     bound PC for this Foundry user)
 *   2. first Actor type === "character" that the author OWNS via
 *      Foundry's permission system
 *   3. campaignState.characterIds[0] — solo-GM-play fallback
 *
 * Returns null only when there is literally no PC in the world.
 */

const OWNERSHIP_OWNER = 3;

/**
 * @param {ChatMessage|null} message
 * @param {Object|null}      campaignState
 * @returns {string|null} Actor id or null
 */
export function resolveSpeakerActorId(message, campaignState) {
  // 1. User.character — the bound PC. Works for any player who set
  //    "character" on their User document (the standard Foundry pattern).
  const author = message?.author ?? null;
  if (author?.character?.id) {
    return author.character.id;
  }

  // 2. Ownership scan. A player can own a PC without setting it as their
  //    User#character. Foundry's testUserPermission is the canonical
  //    check; we fall back to direct ownership-map inspection when
  //    testUserPermission isn't available (e.g. test mocks).
  if (author?.id && globalThis.game?.actors) {
    const owned = filterPlayerOwnedCharacters(author);
    if (owned.length) return owned[0].id;
  }

  // 3. Solo-GM / unbound fallback — campaignState's first PC.
  return campaignState?.characterIds?.[0] ?? null;
}

function filterPlayerOwnedCharacters(user) {
  const all = Array.from(globalThis.game.actors ?? []);
  return all.filter(a => {
    if (a?.type !== "character") return false;
    // NPC/connection cards are `character` actors too (FOLDER-002) — never
    // attribute a chat message to one.
    if (a?.flags?.["starforged-companion"]?.entityType) return false;
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
