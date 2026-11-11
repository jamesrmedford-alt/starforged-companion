/**
 * STARFORGED COMPANION
 * src/ui/sessionPanel.js — Session moves panel (ApplicationV2).
 *
 * Single button-driven surface covering all five session moves:
 *
 *   - Begin Session — flips the session-active gate ON, posts the play-
 *     kit Begin a Session card (optionally with Spotlight Vignette
 *     roll → +1 momentum), and schedules a narrator-rendered galley
 *     vignette describing the active PCs together.
 *   - End Session — flips the gate OFF, posts the play-kit End a
 *     Session card (with focus capture → +1 momentum), and schedules a
 *     closing vignette featuring a currently-important NPC.
 *   - Set a Flag — opens the existing flag-content dialog.
 *   - Change Your Fate — opens the existing 5-option chooser.
 *   - Take a Break — opens the existing pacing prompt.
 *
 * The panel renders a small status badge showing whether the session
 * is active and (when active) for how many minutes.
 *
 * State writes are done by the dialogs' GM-relay handlers in
 * `src/safety/sessionLifecycleDialogs.js` (run on the canonical GM),
 * not in this panel — the panel is intentionally state-display-only.
 * The session-active gate read happens at the top of every render so
 * the badge stays in sync.
 */

import {
  openSetFlagDialog,
  openChangeYourFateDialog,
  openTakeABreakDialog,
} from "../safety/sessionDialogs.js";
import {
  openBeginSessionDialog,
  openEndSessionDialog,
} from "../safety/sessionLifecycleDialogs.js";
import { isSessionActive, sessionMinutesActive, sessionNeedsMint } from "../session/lifecycle.js";

const MODULE_ID = "starforged-companion";

const { ApplicationV2 } = foundry.applications.api;

export class SessionPanelApp extends ApplicationV2 {

  static #instance = null;

  static DEFAULT_OPTIONS = {
    id:      `${MODULE_ID}-session-panel`,
    classes: [MODULE_ID, "session-panel", "sf-window"],
    tag:     "div",
    window: {
      title:       "Session",
      resizable:   false,
      minimizable: true,
    },
    position: {
      width:  360,
      height: "auto",
    },
    actions: {
      beginSession:     SessionPanelApp.#onBeginSession,
      endSession:       SessionPanelApp.#onEndSession,
      setFlag:          SessionPanelApp.#onSetFlag,
      changeFate:       SessionPanelApp.#onChangeFate,
      takeBreak:        SessionPanelApp.#onTakeBreak,
      envisionIncite:   SessionPanelApp.#onEnvisionIncite,
    },
  };

  /**
   * Open the singleton panel, or bring it to front if already open. The
   * first call installs Foundry hook listeners so external state flips
   * (e.g. `!begin-session` typed in chat while the panel is open) keep
   * the panel's badge in sync:
   *   - `sessionStateChanged` fires on the client that ran Begin / End —
   *     the canonical GM (applyBeginSession / applyEndSession).
   *   - `updateSetting` / `createSetting` on campaignState fire on every
   *     client when that write lands, so a player (or non-canonical GM)
   *     whose Begin / End was relayed to the canonical GM refreshes too.
   *
   * @returns {SessionPanelApp}
   */
  static open() {
    if (!SessionPanelApp.#instance) {
      SessionPanelApp.#instance = new SessionPanelApp();
      Hooks.on(`${MODULE_ID}.sessionStateChanged`, SessionPanelApp.rerenderIfOpen);
      Hooks.on("updateSetting", SessionPanelApp.onSettingChanged);
      Hooks.on("createSetting", SessionPanelApp.onSettingChanged);
    }
    SessionPanelApp.#instance.render({ force: true });
    return SessionPanelApp.#instance;
  }

  /**
   * World-setting document hook → re-render when campaignState changed.
   * @param {{ key?: string }} setting — the Setting document
   */
  static onSettingChanged(setting) {
    if (setting?.key !== `${MODULE_ID}.campaignState`) return;
    SessionPanelApp.rerenderIfOpen();
  }

  /** Refresh the panel — invoked from the campaignState hook on Begin/End. */
  static rerenderIfOpen() {
    if (SessionPanelApp.#instance?.rendered) {
      SessionPanelApp.#instance.render({ force: false });
    }
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** @override */
  async _prepareContext(_options) {
    const campaignState = globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {};
    const active        = isSessionActive(campaignState);
    // A session whose gate is still open is over after four hours without
    // chat (sessionNeedsMint): the next Begin a Session starts the new one, as
    // its dialog agrees. With the GM's game left loaded nothing mints, and the
    // panel read "Active · 1800 min" with Begin disabled (issue #345 AA59).
    const over          = active && sessionNeedsMint(campaignState);
    const minutes       = sessionMinutesActive(campaignState);
    const sessionNumber = Number(campaignState?.sessionNumber ?? 0);
    return { active, over, minutes, sessionNumber };
  }

  /** @override */
  async _renderHTML(context, _options) {
    const { active, over, minutes, sessionNumber } = context;

    const stateBadge = over
      ? `<span class="badge over" title="No chat for four hours: this session is over. Begin Session starts the next one.">Over — four hours without chat</span>`
      : active
        ? `<span class="badge active">Active${minutes ? ` · ${minutes} min` : ""}</span>`
        : `<span class="badge inactive">Inactive — narration is gated</span>`;

    const sessionLine = sessionNumber > 0
      ? `<p class="muted">Session #${sessionNumber}</p>`
      : `<p class="muted">No session begun yet</p>`;

    // Begin / End are anyone's: a player's press opens the same dialog as
    // their !begin-session / !end-session, whose writes relay to the
    // canonical GM (session.begin / session.end). They are disabled by the
    // session state only — the "GM only" gate here predated that relay
    // (issue #326 W85). Envision Inciting Incident is anyone's too: a
    // player's press posts their `!incite` (issue #330 D15).
    const html = `
      <div class="sf-session-panel">
        <header class="panel-header">
          ${stateBadge}
          ${sessionLine}
        </header>

        <section class="lifecycle-row">
          <button class="session-btn primary" data-action="beginSession"
                  ${active && !over ? "disabled title=\"Session already active — end it first\"" : ""}>
            Begin Session
          </button>
          <button class="session-btn primary" data-action="endSession"
                  ${!active ? "disabled title=\"Session not active\"" : ""}>
            End Session
          </button>
        </section>

        <section class="moves-row">
          <button class="session-btn" data-action="setFlag" title="Open Set a Flag dialog">
            Set a Flag
          </button>
          <button class="session-btn" data-action="changeFate" title="Open Change Your Fate dialog">
            Change Your Fate
          </button>
          <button class="session-btn" data-action="takeBreak" title="Open Take a Break dialog">
            Take a Break
          </button>
        </section>

        <section class="launch-row">
          <button class="session-btn" data-action="envisionIncite"
                  title="Roll an Action+Theme spark and envision the campaign's inciting incident">
            ✦ Envision Inciting Incident
          </button>
        </section>

        <p class="hint">
          Pre-session, typed narration does NOT trigger the narrator or move pipeline.
          Chat cards (X-Card, draft Confirm/Dismiss) and explicit commands
          (<code>@scene</code>, <code>!oracle</code>, <code>!pay-the-price</code>)
          continue to work.
        </p>
      </div>
    `;

    const tmp = document.createElement("div");
    tmp.innerHTML = html.trim();
    return tmp.firstElementChild;
  }

  /** @override */
  _replaceHTML(result, content, _options) {
    content.innerHTML = "";
    content.append(result);
  }

  // -----------------------------------------------------------------------
  // Action handlers — all are thin wrappers around the existing dialogs
  // so the play-kit mechanical bits (Spotlight Vignette + momentum,
  // focus capture + momentum, content review) stay in one place.
  // -----------------------------------------------------------------------

  static async #onBeginSession() {
    await openBeginSessionDialog();
    // On the canonical GM the flip has landed by now; elsewhere it lands
    // when the relayed write arrives (updateSetting re-renders then).
    SessionPanelApp.rerenderIfOpen();
  }

  static async #onEndSession() {
    await openEndSessionDialog();
    SessionPanelApp.rerenderIfOpen();
  }

  static async #onSetFlag()    { await openSetFlagDialog(); }
  static async #onChangeFate() { await openChangeYourFateDialog(); }
  static async #onTakeBreak()  { await openTakeABreakDialog(); }

  /**
   * Envision Inciting Incident is `!incite` on a button, anyone's (issue #330
   * D15). Every press — a player's or a GM's — is the presser's `!incite`
   * line: the chat-command router runs it where a Claude key lives
   * (RUN_ON.CLAUDE — the keyed canonical GM, else the presser's own key),
   * exactly as when they type it. A GM's press ran it on the GM's own client,
   * so a keyless co-GM's press posted the spark-only card while their typed
   * `!incite` reached the keyed GM's narration (issue #345 D6 — the
   * maintainer's option A). The panel used to disable the button for every
   * non-GM while the typed command worked.
   */
  static async #onEnvisionIncite() {
    try {
      await ChatMessage.create({ content: "!incite" });
    } catch (err) {
      console.warn("starforged-companion | session panel: the !incite line could not be posted:", err?.message ?? err);
      ui.notifications?.warn?.("Envision Inciting Incident could not be sent. Check the console.");
    }
  }
}

/** Convenience for the toolbar wiring. */
export function openSessionPanel() {
  SessionPanelApp.open();
}
