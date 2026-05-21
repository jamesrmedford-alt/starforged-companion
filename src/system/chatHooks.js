/**
 * STARFORGED COMPANION
 * src/system/chatHooks.js — ChatMessage render-hook compat shim.
 *
 * Foundry v13 deprecated the v12-era `renderChatMessage` hook in favor of
 * `renderChatMessageHTML` (HTMLElement, not jQuery). Late-v13 builds may
 * stop firing the legacy name entirely. Module.json declares minimum v12
 * so we subscribe to both names and dedupe by rendered element identity
 * — a re-render produces a fresh element; a double-fire of the same
 * element from both hooks reuses the same reference.
 */

const MODULE_ID = "starforged-companion";

/**
 * Subscribe to chat-message render events across Foundry v12 + v13.
 *
 * The handler receives (message, rootElement) where rootElement is always
 * an HTMLElement — the unwrap of `html instanceof HTMLElement ? html : html[0]`
 * is done inside this shim so callers stop carrying that boilerplate.
 *
 * @param {(message: ChatMessage, root: HTMLElement) => void} handler
 */
export function onChatMessageRender(handler) {
  const seen = new WeakSet();
  const wrapped = (message, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    if (seen.has(root)) return;
    seen.add(root);
    try {
      handler(message, root);
    } catch (err) {
      console.warn(`${MODULE_ID} | chat render handler error:`, err);
    }
  };
  Hooks.on("renderChatMessage", wrapped);
  Hooks.on("renderChatMessageHTML", wrapped);
}
