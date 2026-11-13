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
 * is active and (when active) for how many minutes, and the table's
 * "What's open" list (issue #353 R4): the open vows and their progress,
 * the open fights / expeditions / scene challenges, the running clocks, and
 * the narrative skeleton's standing demands and unanswered questions that
 * the table has been shown — never a plan's secrets (revealedPlanRows). It is
 * read from the stores that hold them, with no model call, on every render;
 * the panel re-renders when a vow, a track or a plan changes.
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
import { isSessionActive, sessionMinutesActive, sessionNeedsMint, sessionLastSeenAt, SESSION_IDLE_HOURS } from "../session/lifecycle.js";
import { tableVows, openThreadRows } from "../session/openThreads.js";
import { listOpenProgressTracks } from "./progressTracks.js";
import { listSkeletons, skeletonsEnabled } from "../world/secrets.js";

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
      // What's open (issue #353 R4) follows what it lists: a vow on a sheet
      // (an Item), the Progress Tracks journal's flag, a plan's page.
      Hooks.on("createItem", SessionPanelApp.onOpenThreadsChanged);
      Hooks.on("updateItem", SessionPanelApp.onOpenThreadsChanged);
      Hooks.on("deleteItem", SessionPanelApp.onOpenThreadsChanged);
      Hooks.on("updateJournalEntry", SessionPanelApp.onOpenThreadsChanged);
      Hooks.on("createJournalEntryPage", SessionPanelApp.onOpenThreadsChanged);
      Hooks.on("updateJournalEntryPage", SessionPanelApp.onOpenThreadsChanged);
      Hooks.on("deleteJournalEntryPage", SessionPanelApp.onOpenThreadsChanged);
    }
    SessionPanelApp.#instance.render({ force: true });
    return SessionPanelApp.#instance;
  }

  /**
   * Document hook → re-render the open panel's "What's open" list: a vow, a
   * track or a plan may have changed. This client's panel only.
   */
  static onOpenThreadsChanged() {
    SessionPanelApp.rerenderIfOpen();
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
    this.#scheduleIdleRerender(active && !over ? campaignState : null);
    // What's open (issue #353 R4): the vows, tracks and clocks as their
    // stores hold them, and what the table has been shown of the plans.
    // Fail-open: the panel's buttons render whatever it can read.
    let open = null;
    try {
      open = {
        ...openThreadRows({ vows: tableVows(), tracks: listOpenProgressTracks(), clocks: campaignState?.clocks ?? [] }),
        ...revealedPlanRows(),
      };
    } catch (err) {
      console.warn(`${MODULE_ID} | session panel: what is open could not be read:`, err?.message ?? err);
    }
    return { active, over, minutes, sessionNumber, open };
  }

  // The re-render due when the open session reaches its four idle hours.
  #idleTimer = null;

  /**
   * An open panel re-renders on campaignState writes and on open, not when
   * the four-hour mark passes: it kept "Active" (and Begin disabled) for a
   * session that went over while it stayed open (SESSION-PANEL-OVER-STALE).
   * Re-render at the mark — the later of the session's mint and its last
   * chat-activity stamp, plus SESSION_IDLE_HOURS (sessionLastSeenAt). A
   * render before it schedules afresh; chat since then moves the mark, and
   * the re-render it brings schedules the next one.
   *
   * @param {Object|null} campaignState — a live session's, or null for none
   */
  #scheduleIdleRerender(campaignState) {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = null;
    if (!campaignState) return;
    const seen = Date.parse(sessionLastSeenAt(campaignState) ?? "");
    if (!Number.isFinite(seen)) return;
    const wait = Math.max(0, seen + SESSION_IDLE_HOURS * 3_600_000 - Date.now()) + 1_000;
    this.#idleTimer = setTimeout(() => {
      this.#idleTimer = null;
      SessionPanelApp.rerenderIfOpen();
    }, wait);
  }

  /** @override */
  _onClose(options) {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = null;
    super._onClose?.(options);
  }

  /** @override */
  async _renderHTML(context, _options) {
    const { active, over, minutes, sessionNumber, open } = context;

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

        ${renderOpenThreads(open)}

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

/**
 * What the "What's open" list shows of the narrative skeleton (issue #353
 * R4) — only what the table has been shown, never a plan's secrets:
 *   - an unanswered question: an active mystery whose truth is not revealed —
 *     its question alone (the fiction posed it to the characters);
 *   - a standing demand: an active threat or NPC agenda whose truth is
 *     revealed — its subject and what it wants, no longer secret.
 * No other field of a plan is read here — its truth, what it knows, its
 * clues, escalation, endings and oracle rolls stay in the GM-only Secrets
 * journal — and every client reads alike: a player's list and a GM's are the
 * same. Nothing while the narrative skeleton is off; fail-open
 * (listSkeletons gives none on any failure).
 *
 * @returns {{ questions: Array<{ question: string }>, demands: Array<{ name: string, wants: string }> }}
 */
function revealedPlanRows() {
  const out = { questions: [], demands: [] };
  if (!skeletonsEnabled()) return out;
  for (const plan of listSkeletons()) {
    if (plan?.status !== "active") continue;
    if (plan.kind === "mystery" && plan.truthRevealed !== true && plan.question) {
      out.questions.push({ question: plan.question });
    } else if ((plan.kind === "threat" || plan.kind === "npcAgenda") && plan.truthRevealed === true && plan.wants) {
      out.demands.push({ name: plan.subject?.name ?? "", wants: plan.wants });
    }
  }
  return out;
}

/** "formidable · 3/10" — a vow's or a track's rank and filled boxes. */
const rankAndBoxes = (rank, progress) => [rank, `${progress}/10`].filter(Boolean).join(" · ");

/**
 * The "What's open" section (issue #353 R4): open vows, open tracks, running
 * clocks, standing demands and unanswered questions — each part only when it
 * has rows, and a line saying so when no character has a vow besides a
 * background vow (issue #353 R3).
 *
 * @param {Object|null} open — _prepareContext's `open`
 * @returns {string}
 */
function renderOpenThreads(open) {
  if (!open) return "";
  const parts = [];
  const list = (items) => `<ul class="open-thread-list">${items.join("")}</ul>`;
  const meta = (text) => (text ? ` <span class="muted">${escapeHtml(text)}</span>` : "");

  const vows = (open.vows ?? []).map(v => `<li><span class="thread-name">${escapeHtml(v.name)}</span>${meta([
    rankAndBoxes(v.rank, v.progress),
    v.clock ? `clock ${v.clock.filled}/${v.clock.segments}` : "",
    (v.holders ?? []).join(", "),
  ].filter(Boolean).join(" · "))}</li>`);
  const noQuest = open.questInPlay === false
    ? `<p class="muted sf-no-vow">No character has a vow in play besides a background vow — swear an iron vow to give the session a quest.</p>`
    : "";
  parts.push(`<h4>Vows</h4>${vows.length ? list(vows) : ""}${noQuest}`);

  const tracks = (open.tracks ?? []).map(t => `<li><span class="thread-name">${escapeHtml(`${t.kind}: ${t.label}`)}</span>${meta([
    rankAndBoxes(t.rank, t.progress),
    t.clock ? `danger ${t.clock.filled}/${t.clock.segments}` : "",
    t.vowName ? `serves “${t.vowName}”` : "",
  ].filter(Boolean).join(" · "))}</li>`);
  if (tracks.length) parts.push(`<h4>Progress tracks</h4>${list(tracks)}`);

  const clocks = (open.clocks ?? []).map(c => `<li><span class="thread-name">${escapeHtml(c.name)}</span>${meta(`${c.type === "campaign" ? "campaign" : "tension"} · ${c.filled}/${c.segments}`)}</li>`);
  if (clocks.length) parts.push(`<h4>Clocks</h4>${list(clocks)}`);

  const demands = (open.demands ?? []).map(d => `<li><span class="thread-name">${escapeHtml(d.name)}</span> wants: ${escapeHtml(d.wants)}</li>`);
  if (demands.length) parts.push(`<h4>Standing demands</h4>${list(demands)}`);

  const questions = (open.questions ?? []).map(q => `<li>${escapeHtml(q.question)}</li>`);
  if (questions.length) parts.push(`<h4>Unanswered questions</h4>${list(questions)}`);

  return `<section class="open-threads"><h3>What's open</h3>${parts.join("")}</section>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
