/**
 * STARFORGED COMPANION
 * src/private-channel/app.js — PrivateChannelApp (floating ApplicationV2 window)
 *
 * A side conversation between one player and the narrator (private-channel-scope.md
 * §2/§3). Built with a `mode` config from day one so !thread / !character new can
 * reuse the primitive later; v1 ships PRIVATE only. ApplicationV2 is accessed via
 * the global namespace (matches every other panel — no ES import).
 */

import { requestPrivateNarration } from "./narrate.js";
import { publishToMainChat } from "./publish.js";
import {
  appendToBuffer,
  scheduleDebouncedWrite,
  flushNow,
  renderTurnsHtml,
  loadCurrentSessionTranscript,
} from "./transcript.js";

const MODULE_ID = "starforged-companion";

export const CHANNEL_MODE = Object.freeze({
  PRIVATE: "private",   // single player + narrator (v1)
  THREAD:  "thread",    // multiple players + narrator (future)
  CHARGEN: "chargen",   // guided character creation (future)
});

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export class PrivateChannelApp extends foundry.applications.api.ApplicationV2 {
  // One window per user. open() brings an existing one to front rather than
  // spawning a duplicate.
  static #instances = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["sf-private-channel"],
    tag:     "div",
    window:  { title: "Private Channel", resizable: true, minimizable: true },
    position:{ width: 480, height: 640 },
    actions: {
      send:    PrivateChannelApp.#onSend,
      publish: PrivateChannelApp.#onPublish,
    },
  };

  constructor({ userId, mode = CHANNEL_MODE.PRIVATE, initialMessage = "" } = {}) {
    super({ id: `sf-private-channel-${userId}` });
    this.userId         = userId;
    this.mode           = mode;
    this.initialMessage = initialMessage;
    this.turns          = [];   // { who, name, text } since this window opened
    this.resumedHtml    = "";   // prior-session HTML loaded on first render
    this.errorBanner    = "";
    this.busy           = false;
  }

  /**
   * Open (or focus) the private channel window for a user.
   *
   * @param {object} args
   * @param {string} args.userId
   * @param {string} [args.mode]            — CHANNEL_MODE value
   * @param {string} [args.initialMessage]  — pre-fills the input
   * @returns {Promise<PrivateChannelApp>}
   */
  static async open({ userId, mode = CHANNEL_MODE.PRIVATE, initialMessage } = {}) {
    if (!Object.values(CHANNEL_MODE).includes(mode)) {
      throw new Error(`PrivateChannelApp: unknown mode "${mode}"`);
    }
    let app = PrivateChannelApp.#instances.get(userId);
    if (!app) {
      app = new PrivateChannelApp({ userId, mode, initialMessage });
      PrivateChannelApp.#instances.set(userId, app);
    } else if (initialMessage) {
      app.initialMessage = initialMessage;
    }
    await app.render({ force: true });
    return app;
  }

  // ── lifecycle ──────────────────────────────────────────────────────────────

  async _prepareContext(_options) {
    const sessionId = game.settings?.get?.(MODULE_ID, "campaignState")?.currentSessionId ?? "";
    if (!this.resumedHtml) {
      this.resumedHtml = await loadCurrentSessionTranscript(this.userId, sessionId).catch(() => "");
    }
    return {
      transcriptHtml: this.resumedHtml + renderTurnsHtml(this.turns),
      initialMessage: this.initialMessage,
      errorBanner:    this.errorBanner,
      busy:           this.busy,
    };
  }

  async _renderHTML(context, _options) {
    const el = document.createElement("div");
    el.className = "sf-private-channel-body";
    el.innerHTML = `
      <div class="pc-error-banner"${context.errorBanner ? "" : " hidden"}>${escapeHtml(context.errorBanner)}</div>
      <div class="pc-transcript" data-pc-transcript>${context.transcriptHtml || '<p class="pc-empty">A private aside. Nothing here reaches the table until you publish it.</p>'}</div>
      <div class="pc-input-row">
        <textarea class="pc-input" data-pc-input rows="3" placeholder="Speak to the narrator privately… (Enter to send, Shift+Enter for a newline)"${context.busy ? " disabled" : ""}>${escapeHtml(context.initialMessage)}</textarea>
        <div class="pc-actions">
          <button type="button" class="pc-send" data-action="send"${context.busy ? " disabled" : ""}>Send</button>
          <button type="button" class="pc-publish" data-action="publish">Publish…</button>
        </div>
      </div>`;
    // Enter-to-send (Shift+Enter keeps the textarea's newline default).
    const input = el.querySelector("[data-pc-input]");
    input?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) {
        ev.preventDefault();
        PrivateChannelApp.#onSend.call(this, ev, el.querySelector(".pc-send"));
      }
    });
    return el;
  }

  _onClose(_options) {
    PrivateChannelApp.#instances.delete(this.userId);
    flushNow(this.userId).catch(() => {});   // persist any pending turns
  }

  // ── actions ──────────────────────────────────────────────────────────────

  #inputValue() {
    return this.element?.querySelector("[data-pc-input]")?.value ?? "";
  }

  #resolveActorId() {
    return game.users?.get?.(this.userId)?.character?.id ?? null;
  }

  static async #onSend(_event, _target) {
    if (this.busy) return;
    const message = this.#inputValue().trim();
    if (!message) return;

    const characterName = game.users?.get?.(this.userId)?.character?.name ?? "You";
    this.initialMessage = "";
    this.errorBanner    = "";

    // Show the player's turn immediately + buffer it.
    const playerTurn = { who: "player", name: characterName, text: message };
    this.turns.push(playerTurn);
    appendToBuffer(this.userId, playerTurn);
    this.busy = true;
    await this.render();

    const campaignState  = game.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    const result = await requestPrivateNarration({
      campaignState,
      userId:          this.userId,
      actorId:         this.#resolveActorId(),
      transcriptTurns: this.turns.map(t => `${t.name}: ${t.text}`),
      playerMessage:   message,
    });

    this.busy = false;
    if (result.ok) {
      const narratorTurn = { who: "narrator", name: "Narrator", text: result.text };
      this.turns.push(narratorTurn);
      appendToBuffer(this.userId, narratorTurn);
      scheduleDebouncedWrite(this.userId);
    } else {
      this.errorBanner = {
        "no-key":       "Add your Claude API key in Companion Settings → About.",
        "no-character": "Set up your character first.",
        "empty":        "The narrator had nothing to say — try rephrasing.",
        "error":        "The narrator call failed. Your message is preserved; try again.",
      }[result.reason] ?? "Something went wrong. Try again.";
    }
    await this.render();
  }

  static async #onPublish(_event, _target) {
    // Publish the most recent narrator turn (v1 — a selection UI is a §17 follow-on).
    const lastNarrator = [...this.turns].reverse().find(t => t.who === "narrator");
    if (!lastNarrator) {
      this.errorBanner = "Nothing to publish yet.";
      await this.render();
      return;
    }
    const DialogV2 = foundry.applications.api.DialogV2;
    const confirmed = DialogV2?.confirm
      ? await DialogV2.confirm({
          window:  { title: "Publish to main chat" },
          content: `<p>Publish this reflection to the main chat for everyone to see?</p>
                    <blockquote>${escapeHtml(lastNarrator.text)}</blockquote>`,
        })
      : true;
    if (!confirmed) return;
    await publishToMainChat({ userId: this.userId, content: lastNarrator.text });
  }

  /** Test seam — clear tracked instances. */
  static _resetInstances() { PrivateChannelApp.#instances.clear(); }

  /** Test seam — is a window open for this user? */
  static _hasInstance(userId) { return PrivateChannelApp.#instances.has(userId); }
}
