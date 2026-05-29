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
 * State writes are done inside the existing dialog handlers in
 * `src/safety/sessionLifecycleDialogs.js`, not in this panel — the
 * panel is intentionally state-display-only. The session-active gate
 * read happens at the top of every render so the badge stays in sync.
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
import { isSessionActive, sessionMinutesActive } from "../session/lifecycle.js";

const MODULE_ID = "starforged-companion";

const { ApplicationV2 } = foundry.applications.api;

export class SessionPanelApp extends ApplicationV2 {

  static #instance = null;

  static DEFAULT_OPTIONS = {
    id:      `${MODULE_ID}-session-panel`,
    classes: [MODULE_ID, "session-panel"],
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
    },
  };

  /**
   * Open the singleton panel, or bring it to front if already open. The
   * first call installs a Foundry hook listener so external state flips
   * (e.g. `!begin-session` typed in chat while the panel is open) keep
   * the panel's badge in sync — internal-only re-renders happen via the
   * action-handler awaits.
   *
   * @returns {SessionPanelApp}
   */
  static open() {
    if (!SessionPanelApp.#instance) {
      SessionPanelApp.#instance = new SessionPanelApp();
      Hooks.on(`${MODULE_ID}.sessionStateChanged`, SessionPanelApp.rerenderIfOpen);
    }
    SessionPanelApp.#instance.render({ force: true });
    return SessionPanelApp.#instance;
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
    const minutes       = sessionMinutesActive(campaignState);
    const sessionNumber = Number(campaignState?.sessionNumber ?? 0);
    return { active, minutes, sessionNumber, isGM: !!globalThis.game?.user?.isGM };
  }

  /** @override */
  async _renderHTML(context, _options) {
    const { active, minutes, sessionNumber, isGM } = context;

    const stateBadge = active
      ? `<span class="badge active">Active${minutes ? ` · ${minutes} min` : ""}</span>`
      : `<span class="badge inactive">Inactive — narration is gated</span>`;

    const sessionLine = sessionNumber > 0
      ? `<p class="muted">Session #${sessionNumber}</p>`
      : `<p class="muted">No session begun yet</p>`;

    const html = `
      <div class="sf-session-panel">
        <header class="panel-header">
          ${stateBadge}
          ${sessionLine}
        </header>

        <section class="lifecycle-row">
          <button class="session-btn primary" data-action="beginSession"
                  ${!isGM ? "disabled title=\"GM only\"" : ""}
                  ${active ? "disabled title=\"Session already active — end it first\"" : ""}>
            Begin Session
          </button>
          <button class="session-btn primary" data-action="endSession"
                  ${!isGM ? "disabled title=\"GM only\"" : ""}
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
    // The dialog flips the session-active gate on success; re-render to
    // update the state badge.
    SessionPanelApp.rerenderIfOpen();
  }

  static async #onEndSession() {
    await openEndSessionDialog();
    SessionPanelApp.rerenderIfOpen();
  }

  static async #onSetFlag()    { await openSetFlagDialog(); }
  static async #onChangeFate() { await openChangeYourFateDialog(); }
  static async #onTakeBreak()  { await openTakeABreakDialog(); }
}

/** Convenience for the toolbar wiring. */
export function openSessionPanel() {
  SessionPanelApp.open();
}
