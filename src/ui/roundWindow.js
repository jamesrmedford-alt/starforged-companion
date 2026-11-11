/**
 * STARFORGED COMPANION
 * src/ui/roundWindow.js — the Batch Mode Round window (issue #340)
 *
 * One window per user (ApplicationV2, `sf-window` — the compact layout spans
 * a phone's screen, and its buttons are 44–48 px tap targets). It opens, or
 * comes to the front, on every participant's client — and every GM's — when a
 * round opens; a player who closes it reopens it from the toolbar's Round
 * tool; it closes on every client when Batch Mode turns off.
 *
 * The window renders src/batch/roundView.js's view model and nothing else, so
 * who sees what is decided there. Its actions relay to the canonical GM
 * (src/batch/relay.js); Burn and Improve use the result card's own relays.
 *
 *   - The unsent draft stays in this browser across a reload (the client
 *     setting `batchMode.draft`). Nothing a player hasn't submitted leaves it.
 *   - A submission shows Sent only once the round shows it: the round state is
 *     the acknowledgement relays don't have. Not there after
 *     RELAY_RECOVERY_MS, the window says it wasn't received and offers Send
 *     again (the same submission — it lands once). Its text stays the draft
 *     until the round takes it: a failed reading, a round that resolves or
 *     closes without it, gives it back (draftAfterRound).
 *   - With no GM connected, requestGmAction warns and the window says the
 *     action wasn't saved; the draft is kept.
 *
 * Also here: the GM's Batch Mode switch (toggleBatchMode), which asks what to
 * do with a round that has actions submitted.
 */

import { buildRoundView } from "../batch/roundView.js";
import { ROUND_PHASE, ENTRY_STATUS, READING_KIND, ROUND_TEXT_MAX, isResolving, entryFor, roundIsOpen, cleanSubmissionText } from "../batch/round.js";
import {
  BATCH_ENABLED_SETTING,
  getStoredRound,
  isBatchModeEnabled,
  getRoundDraft,
  setRoundDraft,
  onRoundChanged,
  onBatchModeToggled,
  onRoundDraftChanged,
  batchModeKeyedGm,
} from "../batch/driver.js";
import { requestGmAction } from "../multiplayer/gmRelay.js";
import { relayCardButtonClick, RELAY_RECOVERY_MS } from "../moves/burnMomentum.js";
import { renderMoveAbilitiesForm, readMoveAbilitiesForm } from "./settingsPanel.js";
import { isXCardActive } from "../narration/narrator.js";
import { sanitizePlayerText } from "../narration/narratorPrompt.js";
import { isNarrationXCarded } from "../context/safety.js";
import { isSessionActive } from "../session/lifecycle.js";
import { moveDisplayName, localizeStat } from "../system/i18n.js";

const MODULE_ID = "starforged-companion";

/** How long a typed draft waits before it is kept in the client setting. */
const DRAFT_SAVE_MS = 400;

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Why a relayed action changed nothing, said in the window. */
const RELAY_FAILURES = {
  "no-gm": "No GM is connected, so this wasn't saved. Your action is kept here — try again once a GM has joined.",
};

/**
 * The newest narration of this session (the window shows it, collapsible) —
 * never one the X-Card removed: its card's `xCarded` flag lands after the
 * pause's own write, which already names it (`xCardedNarrationIds`,
 * isNarrationXCarded), and the window re-renders on that write (issue #342
 * Z32; decisions.md "The X-Card forgets what it answered").
 */
function newestNarration() {
  let sessionId = null;
  try { sessionId = game.settings.get(MODULE_ID, "campaignState")?.currentSessionId ?? null; }
  catch { sessionId = null; }
  const cards = (game.messages?.contents ?? []).filter(m => {
    const f = m?.flags?.[MODULE_ID];
    return f?.narratorCard && !f.narrationFallback && !f.xCarded && !isNarrationXCarded(f.narrationId) && !f.burnSuperseded
      && (!sessionId || f.sessionId === sessionId) && typeof f.narrationText === "string" && f.narrationText.trim()
      && !(Array.isArray(m.whisper) && m.whisper.length);
  });
  const last = cards[cards.length - 1];
  return last ? String(last.flags[MODULE_ID].narrationText).replace(/<\/?npc>/g, "").trim() : "";
}

export class RoundWindowApp extends foundry.applications.api.ApplicationV2 {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id:       `${MODULE_ID}-round-window`,
    classes:  [MODULE_ID, "sf-round-window", "sf-window"],
    tag:      "div",
    window:   { title: "Round", resizable: true, minimizable: true },
    position: { width: 480, height: "auto" },
    actions: {
      submit:        RoundWindowApp.#onSubmit,
      sendAgain:     RoundWindowApp.#onSendAgain,
      pass:          RoundWindowApp.#onPass,
      withdraw:      RoundWindowApp.#onWithdraw,
      edit:          RoundWindowApp.#onEdit,
      confirm:       RoundWindowApp.#onConfirm,
      rollInstead:   RoundWindowApp.#onRollInstead,
      useOffer:      RoundWindowApp.#onUseOffer,
      keepMine:      RoundWindowApp.#onKeepMine,
      burn:          RoundWindowApp.#onBurn,
      improve:       RoundWindowApp.#onImprove,
      keep:          RoundWindowApp.#onKeep,
      sendNow:       RoundWindowApp.#onSendNow,
      discard:       RoundWindowApp.#onDiscard,
      toggleRecent:  RoundWindowApp.#onToggleRecent,
    },
  };

  /** This client's window, or null. */
  static get instance() { return RoundWindowApp.#instance; }

  /**
   * Open the window, or bring it to the front.
   * @returns {Promise<RoundWindowApp>}
   */
  static async open() {
    if (!RoundWindowApp.#instance) RoundWindowApp.#instance = new RoundWindowApp();
    const app = RoundWindowApp.#instance;
    await app.render({ force: true });
    try { app.bringToFront?.(); }
    catch (err) { console.debug?.(`${MODULE_ID} | Round window: bring to front failed:`, err?.message ?? err); }
    return app;
  }

  /** Close the window if it is open (Batch Mode turned off). */
  static async closeIfOpen() {
    const app = RoundWindowApp.#instance;
    if (app?.rendered) await app.close();
  }

  // The submission this window sent and is waiting to see in the round.
  #pending = null;
  #notReceived = false;
  #failure = "";
  // Why #failure was set — "no-gm" clears itself once a GM is connected again.
  #failureReason = null;
  #busy = false;
  #recentOpen = true;
  #draft = null;
  #draftTimer = null;
  #lastViewJson = null;

  /** The draft as typed (kept in the client setting after a pause). */
  get draft() {
    if (this.#draft === null) this.#draft = getRoundDraft();
    return this.#draft;
  }

  async _prepareContext(_options) {
    const round = getStoredRound();
    let campaignState = null;
    try { campaignState = game.settings.get(MODULE_ID, "campaignState") ?? null; }
    catch { campaignState = null; }
    const users = Array.from(game.users ?? []);
    const view = buildRoundView(round, { userId: game.user?.id, isGM: !!game.user?.isGM }, {
      enabled:          isBatchModeEnabled(),
      sessionActive:    isSessionActive(campaignState),
      xCardActive:      isXCardActive(campaignState),
      gmConnected:      users.some(u => u?.isGM && u?.active),
      keyedGm:          batchModeKeyedGm(),
      connectedUserIds: users.filter(u => u?.active).map(u => u.id),
      moveLabel:        moveDisplayName,
      statLabel:        localizeStat,
      notReceived:      this.#notReceived,
    });
    return {
      view,
      draft:     this.draft,
      failure:   this.#failure,
      busy:      this.#busy,
      recent:    newestNarration(),
      recentOpen: this.#recentOpen,
    };
  }

  async _renderHTML(context, _options) {
    const { view } = context;
    const root = document.createElement("div");
    root.className = "sf-round-body";
    this.#lastViewJson = renderKey(context);

    const parts = [];
    parts.push(`<header class="sf-round-header"><strong>${view.number ? `Round ${escapeHtml(String(view.number))}` : "Round"}</strong>`
      + (view.phase ? ` <span class="sf-round-phase">${escapeHtml(phaseLabel(view.phase))}</span>` : "") + `</header>`);
    for (const b of view.banners ?? []) {
      parts.push(`<div class="sf-round-banner sf-round-banner--${escapeHtml(b.level)}" role="status">${escapeHtml(b.text)}</div>`);
    }
    if (context.failure) parts.push(`<div class="sf-round-banner sf-round-banner--warn" role="alert">${escapeHtml(context.failure)}</div>`);

    if (context.recent) {
      parts.push(`<section class="sf-round-recent${context.recentOpen ? "" : " is-collapsed"}">`
        + `<button type="button" class="sf-round-recent-toggle" data-action="toggleRecent" aria-expanded="${context.recentOpen}">Latest narration</button>`
        + (context.recentOpen ? `<div class="sf-round-recent-text">${escapeHtml(context.recent)}</div>` : "")
        + `</section>`);
    }

    if (view.mode === "off") {
      parts.push(`<p class="sf-round-empty">Batch Mode is off.</p>`);
    } else if (view.mode === "waiting" || view.mode === "no-session") {
      parts.push(`<p class="sf-round-empty">No round is open yet.</p>`);
    } else {
      if (view.own) parts.push(this.#ownHtml(view, context));
      else if (!view.gm) parts.push(`<p class="sf-round-empty">You have no character in this round.</p>`);
      if (view.table?.length) {
        parts.push(`<section class="sf-round-table"><h3>Ready</h3><ul>${view.table.map(t =>
          `<li><strong>${escapeHtml(t.actorName)}</strong>${t.moveName ? ` <span class="sf-round-move">${escapeHtml(t.moveName)}</span>` : ""}`
          + `<div class="sf-round-line">${escapeHtml(t.text)}</div></li>`).join("")}</ul></section>`);
      }
      if (view.progress?.length) {
        parts.push(`<section class="sf-round-progress"><h3>Resolving</h3><ul>${view.progress.map(p =>
          `<li><strong>${escapeHtml(p.actorName)}</strong> — ${escapeHtml(p.label)}</li>`).join("")}</ul></section>`);
      }
      if (view.gm) parts.push(this.#gmHtml(view));
    }

    root.innerHTML = parts.join("");
    const input = root.querySelector("textarea[name='sf-round-text']");
    if (input) {
      input.addEventListener("input", () => this.#keepDraft(input.value));
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          RoundWindowApp.#onSubmit.call(this, ev, input);
        }
      });
    }
    return root;
  }

  _replaceHTML(result, content, _options) {
    const active = document.activeElement;
    const typing = active?.name === "sf-round-text" && content.contains(active);
    const caret = typing ? [active.selectionStart, active.selectionEnd] : null;
    // What the player chose in the reading's form — its abilities, stat swap
    // and target — survives any re-render of the same reading: another
    // player's confirm, "pick one first", the narration toggle (issue #342
    // Z06; decisions.md "A panel's re-render keeps what the user is typing").
    const picks = readingPicks(content);
    content.innerHTML = "";
    content.append(result);
    if (picks) restoreReadingPicks(content, picks);
    if (typing) {
      const input = content.querySelector("textarea[name='sf-round-text']");
      if (input) {
        input.focus();
        try { input.setSelectionRange(caret[0], caret[1]); }
        catch (err) { console.debug?.(`${MODULE_ID} | Round window: caret restore failed:`, err?.message ?? err); }
      }
    }
  }

  async _onClose(options) {
    await this.#flushDraft();
    clearTimeout(this.#pending?.timer);
    RoundWindowApp.#instance = null;
    return super._onClose?.(options);
  }

  // ── rendering helpers ────────────────────────────────────────────────────

  #ownHtml(view, context) {
    const own = view.own;
    const out = [`<section class="sf-round-own"><h3>${escapeHtml(own.actorName || "Your action")}`
      + (own.statusLabel ? ` <span class="sf-round-status sf-round-status--${escapeHtml(own.status)}">${escapeHtml(own.statusLabel)}</span>` : "")
      + `</h3>`];
    if (own.notReceived) {
      out.push(`<div class="sf-round-banner sf-round-banner--warn">Your action wasn't received.`
        + ` <button type="button" data-action="sendAgain">Send again</button></div>`);
    }
    if (own.error) out.push(`<div class="sf-round-banner sf-round-banner--warn">${escapeHtml(own.error)}</div>`);

    const writing = own.canEdit && (own.status === ENTRY_STATUS.WAITING || own.status === ENTRY_STATUS.PASSED || own.error);
    if (own.status === ENTRY_STATUS.PASSED && own.canEdit) {
      out.push(`<p class="sf-round-hint">You're sitting this round out. Write an action to join it after all.</p>`);
    }
    if (!writing && own.text) out.push(`<blockquote class="sf-round-line">${escapeHtml(own.text)}</blockquote>`);
    // A roll the card owes: the player's next move — confirmed, never withdrawn, passed or edited (issue #342 D2).
    if (own.owed) {
      out.push(`<p class="sf-round-hint">This roll is owed — resisting is your next move, so it can't be withdrawn, passed or changed.</p>`);
      if (own.setAside) out.push(`<p class="sf-round-hint">The action you wrote — <em>${escapeHtml(own.setAside)}</em> — is kept as your draft for the next round.</p>`);
    }
    // A move rolled on the character sheet: the round narrates it as rolled (issue #345 D1).
    if (own.sheetRoll) {
      out.push(`<p class="sf-round-hint">This roll was made on your character sheet — it is your action this round, so it can't be withdrawn, passed or changed.</p>`);
      if (own.setAside) out.push(`<p class="sf-round-hint">The action you wrote — <em>${escapeHtml(own.setAside)}</em> — is kept as your draft for the next round.</p>`);
    }

    if (own.offer) {
      out.push(`<div class="sf-round-offer"><p>A card offers ${escapeHtml(own.offer.moveName ?? "a move")} for you: <em>${escapeHtml(own.offer.text)}</em></p>`
        + (own.offer.canUse || own.offer.canKeep
          ? `<div class="sf-round-actions">`
            + (own.offer.canUse ? `<button type="button" data-action="useOffer">Use the card's move</button>` : "")
            + (own.offer.canKeep ? `<button type="button" data-action="keepMine">Keep mine</button>` : "")
            + `</div>`
          : "")
        + `<p class="sf-round-hint">Not chosen before the round resolves, the card's move joins the next round.</p></div>`);
    }

    if (own.status === ENTRY_STATUS.SUBMITTED && !own.error) out.push(`<p class="sf-round-hint">Reading your action…</p>`);
    if (own.reading && (own.status === ENTRY_STATUS.READ || own.status === ENTRY_STATUS.READY)) out.push(this.#readingHtml(own));
    if (own.upgrade) out.push(this.#upgradeHtml(own.upgrade));

    if (writing) {
      // A reading that failed gives the action back to try again — the
      // draft, else the text the round holds (issue #342 Z31).
      const boxText = own.error && !String(context.draft ?? "").trim() ? own.text : context.draft;
      out.push(`<textarea name="sf-round-text" class="sf-round-input" rows="3" maxlength="2000"`
        + ` placeholder="What does ${escapeHtml(own.actorName || "your character")} do? (Enter to submit, Shift+Enter for a new line)"`
        + `${context.busy ? " disabled" : ""}>${escapeHtml(boxText)}</textarea>`);
      out.push(`<div class="sf-round-actions"><button type="button" class="sf-round-primary" data-action="submit"${context.busy ? " disabled" : ""}>Submit</button>`
        + (own.canPass ? `<button type="button" data-action="pass"${context.busy ? " disabled" : ""}>Pass</button>` : "")
        + `</div>`);
    } else if (own.canEdit) {
      out.push(`<div class="sf-round-actions">`
        + (own.canConfirm ? `<button type="button" class="sf-round-primary" data-action="confirm">${own.reading?.kind === READING_KIND.NARRATIVE && own.reading?.suggestedMove ? "Just narrate" : "Confirm"}</button>` : "")
        + (own.canReread ? (own.reading?.suggestedMove
          ? `<button type="button" data-action="rollInstead" data-move-id="${escapeHtml(own.reading.suggestedMove)}">Roll ${escapeHtml(own.reading.suggestedMoveName ?? own.reading.suggestedMove)}</button>`
          : `<button type="button" data-action="rollInstead">Roll a move instead</button>`) : "")
        + `<button type="button" data-action="edit">Edit</button>`
        + (own.canWithdraw ? `<button type="button" data-action="withdraw">Withdraw</button>` : "")
        + (own.canPass ? `<button type="button" data-action="pass">Pass</button>` : "")
        + `</div>`);
    } else if (own.owed && own.canConfirm) {
      out.push(`<div class="sf-round-actions"><button type="button" class="sf-round-primary" data-action="confirm">Confirm</button></div>`);
    }
    out.push(`</section>`);
    return out.join("");
  }

  #readingHtml(own) {
    const r = own.reading;
    if (r.kind === READING_KIND.SHEET_ROLL) {
      return `<div class="sf-round-reading"><p><strong>${escapeHtml(r.moveName)}</strong> — rolled on your character sheet`
        + (r.outcome ? `: ${escapeHtml(r.outcome)}` : "") + `. The round narrates it with the others' actions.</p></div>`;
    }
    if (r.kind === READING_KIND.NARRATIVE) {
      return `<div class="sf-round-reading"><p><strong>No roll needed.</strong>`
        + (r.suggestedMoveName ? ` ${escapeHtml(r.suggestedMoveName)} is available if you want to push it.` : " It is narrated as you wrote it.")
        + `</p></div>`;
    }
    const ready = own.status === ENTRY_STATUS.READY;
    // Keyed by its submission, so a re-render carries the picks of this reading only (readingPicks).
    const parts = [`<div class="sf-round-reading" data-submission-id="${escapeHtml(own.submissionId ?? "")}">`,
      `<div class="sf-round-row"><span class="sf-round-label">Move</span> <strong>${escapeHtml(r.moveName)}</strong></div>`];
    if (r.statName) parts.push(`<div class="sf-round-row"><span class="sf-round-label">Stat</span> ${escapeHtml(r.statName)}</div>`);
    if (r.rationale) parts.push(`<p class="sf-round-rationale">${escapeHtml(r.rationale)}</p>`);
    if (r.mischiefAside) parts.push(`<div class="sf-round-mischief"><span class="sf-round-label">Mischief</span> ${escapeHtml(r.mischiefAside)}</div>`);
    if (r.blocked) parts.push(`<p class="sf-round-hint">This can't be rolled as read — the vow it names is already fulfilled. Edit your action, or pass.</p>`);
    if (!ready && r.targetChoices?.options?.length) {
      const chosen = own.choices?.targetId ?? null;
      parts.push(`<fieldset class="sf-round-targets"><legend>${escapeHtml(r.targetChoices.prompt)}</legend>`
        + r.targetChoices.options.map(o => `<label class="sf-round-target"><input type="radio" name="sf-round-target" value="${escapeHtml(o.id)}"${chosen === o.id ? " checked" : ""}>`
          + ` ${escapeHtml(o.label)}${o.detail ? ` <span class="sf-round-detail">${escapeHtml(o.detail)}</span>` : ""}</label>`).join("")
        + `</fieldset>`);
    }
    if (!ready && r.abilities?.length) parts.push(renderMoveAbilitiesForm(r.abilities, r.statUsed));
    if (ready && own.choices) {
      const picked = r.targetChoices?.options?.find(o => o.id === own.choices.targetId);
      if (picked) parts.push(`<div class="sf-round-row"><span class="sf-round-label">Target</span> ${escapeHtml(picked.label)}</div>`);
      const names = (own.choices.abilityIds ?? []).map(k => r.abilities.find(a => a.key === k)?.assetName).filter(Boolean);
      if (names.length) parts.push(`<div class="sf-round-row"><span class="sf-round-label">Abilities</span> ${names.map(escapeHtml).join(", ")}</div>`);
    }
    parts.push(`</div>`);
    return parts.join("");
  }

  #upgradeHtml(u) {
    return `<div class="sf-round-upgrade"><p><strong>${escapeHtml(u.moveName ?? "Your move")}: ${escapeHtml(u.outcome ?? "")}.</strong> Decide before the round is narrated.</p>`
      + `<div class="sf-round-actions">`
      + (u.burn ? `<button type="button" data-action="burn" data-card-id="${escapeHtml(u.cardId)}">Burn momentum (${escapeHtml(String(u.burn.momentum ?? ""))}) → ${escapeHtml(u.burn.outcome ?? "")}</button>` : "")
      + (u.improve ? `<button type="button" data-action="improve" data-card-id="${escapeHtml(u.cardId)}">Improve → ${escapeHtml(u.improve.outcome ?? "Strong Hit")}${u.improve.label ? ` (${escapeHtml(u.improve.label)})` : ""}</button>` : "")
      + `<button type="button" data-action="keep">Keep</button></div></div>`;
  }

  #gmHtml(view) {
    const gm = view.gm;
    const out = [`<section class="sf-round-gm"><h3>GM</h3>`];
    if (gm.entries.length) {
      out.push(`<ul class="sf-round-readings">${gm.entries.map(e => `<li><strong>${escapeHtml(e.actorName)}</strong>`
        + ` <span class="sf-round-status sf-round-status--${escapeHtml(e.status)}">${escapeHtml(e.status)}</span>`
        + `<div class="sf-round-line">${escapeHtml(e.text)}</div>`
        + (e.error ? `<div class="sf-round-hint">${escapeHtml(e.error)}</div>` : "")
        + (e.reading ? `<div class="sf-round-hint">${escapeHtml(e.reading.kind === READING_KIND.MOVE
          ? `${e.reading.moveName}${e.reading.statName ? ` +${e.reading.statName}` : ""}`
          : e.reading.kind === READING_KIND.SHEET_ROLL
            ? `${e.reading.moveName}${e.reading.outcome ? `: ${e.reading.outcome}` : ""} (rolled on the sheet)`
            : (e.reading.suggestedMoveName ? `No roll (${e.reading.suggestedMoveName} available)` : "No roll"))}</div>` : "")
        + `</li>`).join("")}</ul>`);
    }
    if (gm.waitingFor.length) out.push(`<p class="sf-round-hint">Waiting for: ${gm.waitingFor.map(escapeHtml).join(", ")}</p>`);
    out.push(`<div class="sf-round-actions">`
      + `<button type="button" class="sf-round-primary" data-action="sendNow"${gm.sendNow.enabled ? "" : " disabled"}${gm.sendNow.reason ? ` title="${escapeHtml(gm.sendNow.reason)}"` : ""}>${escapeHtml(gm.sendNow.label)}</button>`
      + (gm.discard.enabled ? `<button type="button" data-action="discard">Discard round</button>` : "")
      + `</div>`);
    out.push(`</section>`);
    return out.join("");
  }

  // ── the round changed ────────────────────────────────────────────────────

  /**
   * The stored round changed: a pending submission the round now shows is
   * Sent; then re-render when the view changed. The draft stays until the
   * round takes the action (registerRoundWindowHooks, draftAfterRound): the
   * round entry is not the only copy of an action it may never roll (issue
   * #342 Z31).
   *
   * @param {Object|null} round
   */
  async onRoundUpdate(round) {
    const entry = entryFor(round, game.user?.id);
    // Sent — or, its round no longer the one collecting (resolved, ended,
    // replaced: the GM refused it and said why), it can never land: Send
    // again would re-send it there forever. Its text is still the draft, for
    // the round collecting now (issue #342 Z34).
    const moved = this.#pending && (round?.id !== this.#pending.roundId || round?.phase !== ROUND_PHASE.COLLECTING);
    if (this.#pending && (moved || entry?.submissionId === this.#pending.submissionId)) {
      clearTimeout(this.#pending.timer);
      this.#pending = null;
      this.#notReceived = false;
    }
    await this.refresh();
  }

  /**
   * Re-render when what the window shows has changed — the view, and the
   * latest narration (a card posted, or removed by the X-Card, while the
   * window is open).
   */
  async refresh() {
    if (!this.rendered) return;
    const context = await this._prepareContext({});
    if (renderKey(context) === this.#lastViewJson) return;
    await this.render();
  }

  /** A typed chat line became the draft (table talk). */
  async draftFromOutside(text) {
    this.#draft = String(text ?? "");
    // The box is what Submit sends: write through to it, rendered or not.
    const input = this.element?.querySelector?.("textarea[name='sf-round-text']");
    if (input) input.value = this.#draft;
    if (this.rendered) await this.render();
  }

  // ── the draft ────────────────────────────────────────────────────────────

  #keepDraft(value) {
    this.#draft = String(value ?? "");
    clearTimeout(this.#draftTimer);
    this.#draftTimer = setTimeout(() => { this.#flushDraft(); }, DRAFT_SAVE_MS);
  }

  async #flushDraft() {
    clearTimeout(this.#draftTimer);
    this.#draftTimer = null;
    if (this.#draft !== null && this.#draft !== getRoundDraft()) await setRoundDraft(this.#draft);
  }

  async #setDraft(text) {
    this.#draft = String(text ?? "");
    await setRoundDraft(this.#draft);
  }

  #inputText() {
    return this.element?.querySelector?.("textarea[name='sf-round-text']")?.value ?? this.draft;
  }

  // ── relaying ─────────────────────────────────────────────────────────────

  /**
   * Relay one action, saying in the window when it wasn't saved.
   * @returns {Promise<Object|null>}
   */
  async #relay(kind, payload) {
    this.#failure = "";
    this.#failureReason = null;
    let res = null;
    try { res = await requestGmAction(kind, payload); }
    catch (err) {
      console.error(`${MODULE_ID} | Round window: ${kind} failed:`, err);
      res = { ok: false, reason: "error" };
    }
    if (!res?.ok) {
      this.#failure = RELAY_FAILURES[res?.reason] ?? "That wasn't saved — try again.";
      this.#failureReason = res?.reason ?? null;
    }
    return res;
  }

  /**
   * A user connected or left, or the keyed-GM registry changed: the banners
   * say whether a GM — and a GM with a Claude key — is connected, so follow
   * it. A "no GM is connected" refusal is stale once one is (issue #342 Z33).
   */
  async onConnectionChange() {
    if (this.#failureReason === "no-gm" && Array.from(game.users ?? []).some(u => u?.isGM && u?.active)) {
      this.#failure = "";
      this.#failureReason = null;
    }
    await this.refresh();
  }

  /** Send a submission and wait to see it in the round. */
  async #send(submission) {
    clearTimeout(this.#pending?.timer);
    this.#pending = { ...submission, timer: null };
    this.#notReceived = false;
    this.#busy = true;
    let res = null;
    try {
      await this.#flushDraft();
      res = await this.#relay("batch.submit", { roundId: submission.roundId, text: submission.text, submissionId: submission.submissionId });
    } finally {
      this.#busy = false;
    }
    if (!res?.ok) {
      this.#pending = null;
      await this.render();
      return;
    }
    if (this.#pending && res.relayed) {
      this.#pending.timer = setTimeout(() => {
        if (!this.#pending || this.#pending.submissionId !== submission.submissionId) return;
        const entry = entryFor(getStoredRound(), game.user?.id);
        if (entry?.submissionId === submission.submissionId) return;
        this.#notReceived = true;
        this.render();
      }, RELAY_RECOVERY_MS);
    }
    await this.onRoundUpdate(getStoredRound());
    await this.render();
  }

  static async #onSubmit(_event, _target) {
    if (this.#busy) return;
    const text = this.#inputText().trim();
    const round = getStoredRound();
    if (!text || !roundIsOpen(round)) return;
    // Bounded as the round bounds it — said here: a refusal comes back only
    // as a whisper, and the window would wait for it as "not received" (a
    // table-talk line longer than the box allows can become the draft).
    if (!cleanSubmissionText(text)) {
      this.#failure = `An action must be 1–${ROUND_TEXT_MAX} characters — shorten it and submit again.`;
      this.#failureReason = "bad-text";
      await this.render();
      return;
    }
    await this.#send({ roundId: round.id, text, submissionId: foundry.utils.randomID() });
  }

  static async #onSendAgain(_event, _target) {
    if (!this.#pending || this.#busy) return;
    const { roundId, text, submissionId } = this.#pending;
    await this.#send({ roundId, text, submissionId });
  }

  static async #onPass(_event, _target) {
    const round = getStoredRound();
    if (!round) return;
    await this.#relay("batch.pass", { roundId: round.id });
    await this.render();
  }

  static async #onWithdraw(_event, _target) {
    const round = getStoredRound();
    const entry = entryFor(round, game.user?.id);
    if (!round || !entry) return;
    if (entry.text && !this.draft.trim()) await this.#setDraft(entry.text);
    await this.#relay("batch.withdraw", { roundId: round.id });
    await this.render();
  }

  /** Edit: the submitted text back into the box, to rewrite and submit again. */
  static async #onEdit(_event, _target) {
    const round = getStoredRound();
    const entry = entryFor(round, game.user?.id);
    if (!round || !entry) return;
    await this.#setDraft(entry.text ?? this.draft);
    await this.#relay("batch.withdraw", { roundId: round.id });
    await this.render();
  }

  static async #onConfirm(_event, _target) {
    const round = getStoredRound();
    const entry = entryFor(round, game.user?.id);
    if (!round || !entry?.reading) return;
    const root = this.element;
    const choices = { abilityIds: [], statReplacement: null, targetId: null };
    if (entry.reading.kind === READING_KIND.MOVE) {
      const form = readMoveAbilitiesForm(root);
      choices.abilityIds = form.applied;
      choices.statReplacement = form.pickedStat || null;
      choices.targetId = root?.querySelector?.("input[name='sf-round-target']:checked")?.value ?? null;
      if (entry.reading.targetChoices?.options?.length && !choices.targetId) {
        this.#failure = `${entry.reading.targetChoices.prompt ?? "Choose one"} — pick one first.`;
        this.#failureReason = "no-target";
        await this.render();
        return;
      }
    }
    await this.#relay("batch.confirm", { roundId: round.id, submissionId: entry.submissionId, choices });
    await this.render();
  }

  static async #onRollInstead(_event, target) {
    const round = getStoredRound();
    const entry = entryFor(round, game.user?.id);
    if (!round || !entry) return;
    await this.#relay("batch.reread", {
      roundId: round.id, submissionId: entry.submissionId, newSubmissionId: foundry.utils.randomID(),
      moveId: target?.dataset?.moveId || null,
    });
    await this.render();
  }

  static async #onUseOffer(_event, _target) {
    const round = getStoredRound();
    const entry = entryFor(round, game.user?.id);
    if (!round || !entry?.offer) return;
    await this.#relay("batch.reread", {
      roundId: round.id, submissionId: entry.submissionId, newSubmissionId: foundry.utils.randomID(), useOffer: true,
    });
    await this.render();
  }

  /**
   * Keep mine: confirm the player's own reading, which drops the card's offer.
   * An entry already Ready keeps the choices it was confirmed with (its form
   * is not shown) — the confirm only drops the offer.
   */
  static async #onKeepMine(event, target) {
    const round = getStoredRound();
    const entry = entryFor(round, game.user?.id);
    if (round && entry?.status === ENTRY_STATUS.READY) {
      await this.#relay("batch.confirm", { roundId: round.id, submissionId: entry.submissionId, choices: entry.choices ?? {} });
      await this.render();
      return;
    }
    return RoundWindowApp.#onConfirm.call(this, event, target);
  }

  /** Burn or Improve from the window — the card's own relay: one action, claimed once on the card. */
  async #upgrade(kind, target) {
    const messageId = target?.dataset?.cardId ?? null;
    if (!messageId) return;
    target.disabled = true;
    await relayCardButtonClick({
      kind, messageId,
      isConsumed: () => {
        const f = game.messages?.get?.(messageId)?.flags?.[MODULE_ID];
        return !!(f?.burn?.consumed || f?.improve?.consumed);
      },
      restore: () => { target.disabled = false; },
    });
  }

  static async #onBurn(_event, target) { await this.#upgrade("move.burnMomentum", target); }
  static async #onImprove(_event, target) { await this.#upgrade("move.improveResult", target); }

  static async #onKeep(_event, _target) {
    const round = getStoredRound();
    if (!round) return;
    await this.#relay("batch.keep", { roundId: round.id });
    await this.render();
  }

  static async #onSendNow(_event, _target) {
    const round = getStoredRound();
    if (!round) return;
    await this.#relay("batch.sendNow", { roundId: round.id });
    await this.render();
  }

  static async #onDiscard(_event, _target) {
    const round = getStoredRound();
    if (!round) return;
    await this.#relay("batch.discard", { roundId: round.id });
    await this.render();
  }

  static async #onToggleRecent(_event, _target) {
    this.#recentOpen = !this.#recentOpen;
    await this.render();
  }
}

/** What a render shows that can change under it: the view model, the latest narration, a failure said. */
function renderKey(context) {
  return JSON.stringify({ view: context?.view ?? null, recent: context?.recent ?? "", failure: context?.failure ?? "" });
}

/**
 * The picks in a rendered reading's form, by its submission: each ability
 * checkbox's state (by its key), the checked stat-swap and target radios.
 * Null when the window shows no move reading's form.
 *
 * @param {ParentNode} content
 * @returns {{ submissionId: string, abilities: Map<string, boolean>, stat: string|null, target: string|null,
 *   hasStat: boolean, hasTarget: boolean }|null}
 */
function readingPicks(content) {
  const form = content?.querySelector?.(".sf-round-reading[data-submission-id]");
  const submissionId = form?.dataset?.submissionId;
  if (!submissionId) return null;
  const abilities = new Map();
  for (const cb of form.querySelectorAll(".sf-applicable-ability-cb")) {
    if (cb.dataset?.key) abilities.set(cb.dataset.key, !!cb.checked);
  }
  const radio = (name) => {
    const all = form.querySelectorAll(`input[name="${name}"]`);
    const on = [...all].find(r => r.checked);
    return { has: all.length > 0, value: on ? String(on.value ?? "") : null };
  };
  const stat = radio("sf-stat-sub");
  const target = radio("sf-round-target");
  return { submissionId, abilities, stat: stat.value, target: target.value, hasStat: stat.has, hasTarget: target.has };
}

/** Put the picks back on the new tree — only on the same reading (its submission id). */
function restoreReadingPicks(content, picks) {
  const form = content?.querySelector?.(".sf-round-reading[data-submission-id]");
  if (!form || form.dataset?.submissionId !== picks.submissionId) return;
  for (const cb of form.querySelectorAll(".sf-applicable-ability-cb")) {
    const key = cb.dataset?.key;
    if (key && picks.abilities.has(key)) cb.checked = picks.abilities.get(key);
  }
  const set = (name, value) => {
    for (const r of form.querySelectorAll(`input[name="${name}"]`)) r.checked = String(r.value ?? "") === value;
  };
  if (picks.hasStat && picks.stat !== null) set("sf-stat-sub", picks.stat);
  if (picks.hasTarget && picks.target !== null) set("sf-round-target", picks.target);
}

function phaseLabel(phase) {
  return ({
    [ROUND_PHASE.COLLECTING]: "collecting",
    [ROUND_PHASE.ROLLING]:    "rolling",
    [ROUND_PHASE.UPGRADING]:  "deciding upgrades",
    [ROUND_PHASE.NARRATING]:  "narrating",
    [ROUND_PHASE.CLOSED]:     "closed",
  })[phase] ?? phase;
}

/** The toolbar's Round tool. @returns {Promise<RoundWindowApp>|null} */
export function openRoundWindow() {
  if (!isBatchModeEnabled()) {
    globalThis.ui?.notifications?.info?.("Starforged Companion: Batch Mode is off.");
    return null;
  }
  return RoundWindowApp.open();
}

/**
 * The toolbar's Batch Mode switch (GMs only). On: the canonical GM opens a
 * round. Off while a round collects with actions submitted: the GM chooses —
 * send it now (then the mode turns off), discard it, or cancel. Off while a
 * round resolves — or a Discard answered once the round began resolving —
 * it finishes, then the mode turns off.
 *
 * @returns {Promise<void>}
 */
export async function toggleBatchMode() {
  if (!game.user?.isGM) {
    globalThis.ui?.notifications?.warn?.("Starforged Companion: only a GM can switch Batch Mode.");
    return;
  }
  if (!isBatchModeEnabled()) {
    await game.settings.set(MODULE_ID, BATCH_ENABLED_SETTING, true).catch(err => {
      console.warn(`${MODULE_ID} | Batch Mode could not be turned on:`, err?.message ?? err);
      globalThis.ui?.notifications?.error?.("Starforged Companion: Batch Mode could not be turned on — the world did not save it.");
    });
    return;
  }
  const round = getStoredRound();
  if (isResolving(round)) {
    await turnOffAfterRound(round);
    return;
  }
  const submitted = round?.phase === ROUND_PHASE.COLLECTING
    && Object.values(round.entries ?? {}).some(e => [ENTRY_STATUS.SUBMITTED, ENTRY_STATUS.READ, ENTRY_STATUS.READY].includes(e.status));
  if (submitted) {
    const choice = await foundry.applications.api.DialogV2.wait({
      window:  { title: "Turn Batch Mode off" },
      content: "<p>Actions have been submitted for this round. Send the round now, then turn Batch Mode off — or discard the round?</p>",
      buttons: [
        { action: "send",    label: "Send now, then turn off" },
        { action: "discard", label: "Discard the round" },
        { action: "cancel",  label: "Cancel", default: true },
      ],
      // Closed with × or Escape: resolve null — Cancel (rules/foundry-api.md).
      rejectClose: false,
    });
    if (choice === "send") {
      await requestGmAction("batch.sendNow", { roundId: round.id, modeOffAfter: true });
      return;
    }
    if (choice !== "discard") return;
    // The players kept playing while the dialog was open: a round the last
    // confirm started resolving meanwhile is not discarded — switched off
    // under it, every Round window closed and its upgrade step was stranded
    // (issue #345 AA36). It finishes, then the mode turns off (Z04).
    const now = getStoredRound();
    if (isResolving(now)) {
      await turnOffAfterRound(now);
      return;
    }
  }
  // Off: the canonical GM closes a collecting round (its authors keep their drafts).
  await game.settings.set(MODULE_ID, BATCH_ENABLED_SETTING, false).catch(err => {
    console.warn(`${MODULE_ID} | Batch Mode could not be turned off:`, err?.message ?? err);
    globalThis.ui?.notifications?.error?.("Starforged Companion: Batch Mode could not be turned off — the world did not save it.");
  });
}

/**
 * The switch pressed (or its Discard answered) while a round resolves: the
 * round finishes as it would — a roller deciding Burn / Improve / Keep still
 * decides — then Batch Mode turns off (driver.js requestSendNow; issue #342
 * Z04). The GM is told.
 *
 * @param {Object} round — the stored round, resolving
 */
async function turnOffAfterRound(round) {
  await requestGmAction("batch.sendNow", { roundId: round.id, modeOffAfter: true });
  globalThis.ui?.notifications?.info?.("Starforged Companion: the round is being resolved — Batch Mode turns off when it finishes.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Every client's hooks
// ─────────────────────────────────────────────────────────────────────────────

let _lastOpenedRoundId = null;

/** True when this user has a character in the round, or is a GM (the controls). */
function roundIsMine(round) {
  return !!game.user?.isGM || !!entryFor(round, game.user?.id);
}

/**
 * The window follows the round on every client: it opens (or comes to the
 * front) for a participant and every GM when a round opens; a round closed
 * before it was resolved (End a Session, Discard, the mode off) leaves the
 * player's submitted text in their draft; it closes when Batch Mode turns
 * off. Call from `ready`.
 */
export function registerRoundWindowHooks() {
  onRoundChanged((round) => {
    const work = (async () => {
      if (round?.phase === ROUND_PHASE.COLLECTING && round.id !== _lastOpenedRoundId && isBatchModeEnabled() && roundIsMine(round)) {
        _lastOpenedRoundId = round.id;
        await RoundWindowApp.open();
      }
      await keepDraftWithRound(round);
      await RoundWindowApp.instance?.onRoundUpdate(round);
    })();
    work.catch(err => console.warn(`${MODULE_ID} | Round window: the round's change:`, err?.message ?? err));
  });
  onBatchModeToggled((enabled) => {
    if (!enabled) {
      RoundWindowApp.closeIfOpen().catch(err => console.warn(`${MODULE_ID} | Round window: close failed:`, err?.message ?? err));
      return;
    }
    const round = getStoredRound();
    if (round?.phase === ROUND_PHASE.COLLECTING && roundIsMine(round)) {
      _lastOpenedRoundId = round.id;
      RoundWindowApp.open().catch(err => console.warn(`${MODULE_ID} | Round window: open failed:`, err?.message ?? err));
    }
  });
  onRoundDraftChanged((draft) => {
    RoundWindowApp.instance?.draftFromOutside(draft)
      .catch(err => console.warn(`${MODULE_ID} | Round window: the draft:`, err?.message ?? err));
  });
  // The session, the X-Card and the keyed GMs the window's banners show — a
  // setting's first write is a createSetting (the keyed-GM registry's is).
  Hooks.on("updateSetting", onSettingForWindow);
  Hooks.on("createSetting", onSettingForWindow);
  // Whether a GM is connected (issue #342 Z33).
  Hooks.on("userConnected", () => {
    RoundWindowApp.instance?.onConnectionChange()
      .catch(err => console.debug?.(`${MODULE_ID} | Round window refresh failed:`, err?.message ?? err));
  });
  // The round's card says the round took this player's line (draftAfterRound's
  // signal for a client that missed the round's changes).
  Hooks.on("createChatMessage", (message) => {
    onRoundCardForDraft(message).catch(err => console.warn(`${MODULE_ID} | Round window: the round card's draft:`, err?.message ?? err));
  });
  // At load, the stored round as it stands — an action a round closed without
  // rolling while this player was away is their draft again — and the newest
  // round card: one that names the draft took it while they were away.
  keepDraftWithRound(getStoredRound())
    .then(() => {
      const cards = (game.messages?.contents ?? []).filter(m => Array.isArray(m?.flags?.[MODULE_ID]?.roundEntries));
      return cards.length ? onRoundCardForDraft(cards[cards.length - 1]) : null;
    })
    .catch(err => console.warn(`${MODULE_ID} | Round window: the draft at load:`, err?.message ?? err));
  // A round open at load — a reload mid-round gets its window back.
  if (isBatchModeEnabled()) {
    const round = getStoredRound();
    if (round?.phase === ROUND_PHASE.COLLECTING && roundIsMine(round)) {
      _lastOpenedRoundId = round.id;
      RoundWindowApp.open().catch(err => console.warn(`${MODULE_ID} | Round window: open on ready failed:`, err?.message ?? err));
    }
  }
}

/**
 * What this player's draft becomes as the round changes: "" once the round
 * took their action (their entry acts — rolled, or narrated with no roll);
 * the action's text when the draft is empty and the round did not take it —
 * a round closed without rolling it (End a Session, Discard, the mode off; or
 * resolved while it was unconfirmed, its reading failed, its author away), or
 * the action an owed roll set aside; else null — leave the draft. A card's
 * move is no draft: it is held for the next round (driver takeCardMoves).
 * The submitted text stays the draft until then, so a round entry is never
 * an unrolled action's only copy (issue #342 Z31).
 *
 * @param {Object|null} round
 * @param {string} draft — the draft as it stands
 * @returns {string|null}
 */
function draftAfterRound(round, draft) {
  const mine = entryFor(round, game.user?.id);
  if (!mine) return null;
  const typed = String(draft ?? "").trim();
  if (typed) {
    const taken = Array.isArray(round.acting) && round.acting.includes(mine.userId);
    return taken && typed === String(mine.text ?? "").trim() ? "" : null;
  }
  if (mine.setAside?.text) return mine.setAside.text;
  const unrolled = round.phase === ROUND_PHASE.CLOSED && !mine.readAs?.messageId
    && [ENTRY_STATUS.SUBMITTED, ENTRY_STATUS.READ, ENTRY_STATUS.READY].includes(mine.status);
  return unrolled && mine.text ? mine.text : null;
}

/** Keep this client's draft with the round (draftAfterRound) — the window's copy too. */
async function keepDraftWithRound(round) {
  const draft = getRoundDraft();
  const next = draftAfterRound(round, draft);
  if (next === null || next === draft) return;
  await setRoundDraft(next);
  await RoundWindowApp.instance?.draftFromOutside(next);
}

/**
 * True when a round's card names this player's line as their draft holds it
 * (`roundEntries`, the players who acted): the round took the action — said
 * by the card even to a client that missed the round's own changes (its
 * author away while it resolved).
 *
 * @param {ChatMessage|null} message
 * @param {string} draft
 * @returns {boolean}
 */
function roundCardTookDraft(message, draft) {
  const entries = message?.flags?.[MODULE_ID]?.roundEntries;
  if (!Array.isArray(entries) || !String(draft ?? "").trim()) return false;
  const line = sanitizePlayerText(draft);
  return entries.some(e => e?.userId === game.user?.id && e.playerText === line);
}

/** createChatMessage (local only): the round's card names this player's draft — it was taken. */
async function onRoundCardForDraft(message) {
  if (!roundCardTookDraft(message, getRoundDraft())) return;
  await setRoundDraft("");
  await RoundWindowApp.instance?.draftFromOutside("");
}

/**
 * Re-render this client's window when what its banners show changed (local
 * only): the campaign state (the session, the X-Card) or the keyed-GM
 * registry (whether a GM with a Claude key is connected).
 */
function onSettingForWindow(setting) {
  const key = setting?.key;
  if (key === `${MODULE_ID}.keyedGmUserIds`) {
    RoundWindowApp.instance?.onConnectionChange()
      .catch(err => console.debug?.(`${MODULE_ID} | Round window refresh failed:`, err?.message ?? err));
    return;
  }
  if (key !== `${MODULE_ID}.campaignState`) return;
  RoundWindowApp.instance?.refresh()
    .catch(err => console.debug?.(`${MODULE_ID} | Round window refresh failed:`, err?.message ?? err));
}
