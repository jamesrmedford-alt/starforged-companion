/**
 * STARFORGED COMPANION
 * src/clocks/clocks.js
 *
 * Chat-command Clock management (play kit p. 1 / Reference Guide pp. 122–123).
 *
 * Two clock types:
 *   campaign — slow-burn faction/world projects. Advanced at Begin a Session
 *              via Ask the Oracle with the clock's advanceOdds (default likely).
 *   tension  — scene-bound danger or deadline. Advanced when you Pay the Price
 *              or a complication is rolled.
 *
 * Clocks are stored as an array on campaignState.clocks. Each clock has an
 * _id, name, type, segments (4 / 6 / 8 / 10), filled (0..segments), active,
 * and advanceOdds. Filled === segments means the clock has triggered.
 *
 * Chat commands (anyone may invoke for list; GM-only for new / advance / fill / reset):
 *   !clock new <name> <segments> [campaign|tension] [odds]
 *   !clock advance <name>     — campaign clocks auto-roll their advanceOdds
 *   !clock fill <name>        — manually fill one segment (tension default)
 *   !clock reset <name>
 *   !clock remove <name>
 *   !clock list
 *
 * The handler exports below are wired from src/index.js.
 */

import { rollYesNo } from "../oracles/roller.js";
import { newNarrationId } from "../factContinuity/ledgers.js";
import { clockStillTriggered } from "./payThePriceClocks.js";
import { proseToHtml } from "../audio/segments.js";
import { replaceKeepingInput } from "../ui/keepTypedInput.js";
import { serialiseCampaignStateWrite } from "../multiplayer/campaignStateChain.js";
import { standingPacedBy, pacedByOneOf, unpacedClock, planInPlayFor } from "./planClockPacing.js";

const MODULE_ID = "starforged-companion";

// A campaign clock's odds when none is given — createClock, `!clock new` and
// the Clocks panel's add form all start from it (issue #345 AA67).
const DEFAULT_ADVANCE_ODDS = "likely";

// ─────────────────────────────────────────────────────────────────────────────
// Panel — ApplicationV2 singleton
// ─────────────────────────────────────────────────────────────────────────────

let _panelClass = null;
let _panelInstance = null;

function getPanelClass() {
  if (_panelClass) return _panelClass;
  const { ApplicationV2 } = foundry.applications.api;

  _panelClass = class ClocksPanelApp extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id:  "sf-clocks-panel",
      classes: ["sf-window"],
      tag: "div",
      window: { title: "Clocks", resizable: true, minimizable: true },
      position: { width: 480, height: "auto" },
      actions: {
        addClock:     ClocksPanelApp.#onAddClock,
        advanceClock: ClocksPanelApp.#onAdvanceClock,
        fillClock:    ClocksPanelApp.#onFillClock,
        resetClock:   ClocksPanelApp.#onResetClock,
        removeClock:  ClocksPanelApp.#onRemoveClock,
      },
    };

    async _prepareContext() {
      const clocks = readState().clocks ?? [];
      // What this render shows, for the campaignState hook to compare against.
      this._clocksShown = clocksFingerprint(clocks);
      return {
        clocks: clocks.map(c => ({
          ...c,
          triggered: c.filled >= c.segments,
          isCampaign: c.type === "campaign",
          retired: c.active === false,
        })),
      };
    }

    async _renderHTML({ clocks }) {
      // Drawn on the default odds createClock and `!clock new` use: with no
      // option selected a browser shows — and submits — the first, "small
      // chance" (issue #345 AA67).
      const oddsOpts = ["small_chance","unlikely","50_50","likely","almost_certain"]
        .map(o => `<option value="${o}"${o === DEFAULT_ADVANCE_ODDS ? " selected" : ""}>${o.replace(/_/g, " ")}</option>`).join("");

      const row = (c) => {
        const bar = "█".repeat(c.filled) + "░".repeat(Math.max(0, c.segments - c.filled));
        return `
          <div class="clock-row clock-${c.type}${c.triggered ? " is-triggered" : ""}${c.retired ? " is-retired" : ""}" data-clock-id="${c._id}">
            <div class="clock-name"><strong>${escapeHtml(c.name)}</strong> · ${c.type} · ${c.filled}/${c.segments}${c.isCampaign ? ` (odds: ${c.advanceOdds})` : ""}${c.triggered ? " <em>TRIGGERED</em>" : ""}${c.retired ? " <em>retired</em>" : ""}</div>
            <div class="clock-bar"><code>[${bar}]</code></div>
            <div class="clock-actions">
              <button data-action="advanceClock" data-clock-id="${c._id}" title="Advance (campaign rolls odds; tension fills 1)">↻</button>
              <button data-action="fillClock"    data-clock-id="${c._id}" title="Manually fill 1 segment">+</button>
              <button data-action="resetClock"   data-clock-id="${c._id}" title="Reset to 0">⟲</button>
              <button data-action="removeClock"  data-clock-id="${c._id}" title="Delete clock">✕</button>
            </div>
          </div>
        `;
      };

      const html = `
        <div class="sf-clocks-panel">
          <section class="add-clock-section">
            <div class="add-clock-fields">
              <input  name="newClockName"      type="text" placeholder="Clock name…" maxlength="60">
              <select name="newClockSegments">
                <option value="4" selected>4</option>
                <option value="6">6</option>
                <option value="8">8</option>
                <option value="10">10</option>
              </select>
              <select name="newClockType">
                <option value="tension" selected>Tension</option>
                <option value="campaign">Campaign</option>
              </select>
              <select name="newClockOdds">${oddsOpts}</select>
              <button data-action="addClock">Add</button>
            </div>
          </section>
          <section class="clocks-section">
            ${clocks.length ? clocks.map(row).join("") : '<p class="empty-state">No clocks yet.</p>'}
          </section>
        </div>
      `;
      const tmp = document.createElement("div");
      tmp.innerHTML = html.trim();
      return tmp.firstElementChild;
    }

    _replaceHTML(result, content) {
      // The add form keeps what was typed across a hook's re-render (issue #337 Y45).
      replaceKeepingInput(content, result, { fields: ".add-clock-fields [name]" });
    }

    static async #onAddClock(_event, target) {
      if (!gmGate("Add clock")) return;
      const root  = target.closest(".sf-clocks-panel");
      const name  = root.querySelector('[name="newClockName"]').value.trim();
      const segs  = Number(root.querySelector('[name="newClockSegments"]').value);
      const type  = root.querySelector('[name="newClockType"]').value;
      const odds  = root.querySelector('[name="newClockOdds"]').value;

      if (!name) {
        ui.notifications?.warn("Clock name required.");
        return;
      }
      try { await createClock({ name, segments: segs, type, advanceOdds: odds }); }
      catch (err) { ui.notifications?.error(`Clock creation failed: ${err.message}`); return; }
      // The live field: the write's own re-render (the campaignState hook) may
      // already have replaced the form, carrying the typed name (issue #337 Y45).
      const nameField = this.element?.querySelector?.('[name="newClockName"]');
      if (nameField) nameField.value = "";
      this.render();
    }

    // ↻ / + share the chat verbs' logic (advanceClock / fillClock) so the
    // panel posts the same cards, vignettes and already-triggered notice.
    static async #onAdvanceClock(_event, target) {
      if (!gmGate("Advance clock")) return;
      const c = (readState().clocks ?? []).find(x => x._id === target.dataset.clockId);
      if (!c) return;
      await advanceClock(c);
      this.render();
    }

    static async #onFillClock(_event, target) {
      if (!gmGate("Fill clock")) return;
      const c = (readState().clocks ?? []).find(x => x._id === target.dataset.clockId);
      if (!c) return;
      await fillClock(c);
      this.render();
    }

    static async #onResetClock(_event, target) {
      if (!gmGate("Reset clock")) return;
      const id = target.dataset.clockId;
      await mutateClock(id, x => { x.filled = 0; delete x.pacedBy; delete x.pacedFrom; });
      this.render();
    }

    static async #onRemoveClock(_event, target) {
      if (!gmGate("Remove clock")) return;
      await removeClock(target.dataset.clockId);
      this.render();
    }
  };

  return _panelClass;
}

export function openClocksPanel() {
  const Cls = getPanelClass();
  if (!_panelInstance) _panelInstance = new Cls();
  _panelInstance.render({ force: true });
  return _panelInstance;
}

/** The clocks as a string, to tell whether they changed. */
export function clocksFingerprint(clocks) {
  try { return JSON.stringify(clocks ?? []); } catch { return ""; }
}

/**
 * campaignState setting hook: an open Clocks panel re-renders when the clocks
 * it shows changed. It re-rendered only after its own buttons, so a clock a
 * Pay the Price, Begin a Session, `!clock` or another GM advanced stayed stale
 * on screen (issue #322 V12). Every client runs it for its own panel; it
 * writes nothing. Any other campaignState write leaves the panel alone (no
 * needless re-render; one keeps a clock name being typed — issue #337 Y45).
 *
 * @param {{ key?: string }} setting — the Setting document
 */
export function onClocksSettingChanged(setting) {
  if (setting?.key !== `${MODULE_ID}.campaignState`) return;
  if (!_panelInstance?.rendered) return;
  if (clocksFingerprint(readState().clocks) === _panelInstance._clocksShown) return;
  _panelInstance.render({ force: false });
}

/** Register the Clocks panel's refresh hook. Called once at init. */
export function registerClocksPanelHooks() {
  Hooks.on("updateSetting", onClocksSettingChanged);
  Hooks.on("createSetting", onClocksSettingChanged);
}


// ─────────────────────────────────────────────────────────────────────────────
// Command dispatch
// ─────────────────────────────────────────────────────────────────────────────

export function isClockCommand(message) {
  const text = message.content?.trim() ?? "";
  if (message.flags?.[MODULE_ID]?.clockCard) return false;
  return /^!clock(\s|$)/i.test(text);
}

/**
 * Programmatic clock creation — used by Scene Challenge tracks to
 * auto-create a paired tension clock at the same time the track is
 * registered. Returns the created clock object (with its _id) so the
 * caller can store a back-reference.
 *
 * Validates segments (4 / 6 / 8 / 10) and odds; throws on invalid input
 * rather than silently dropping the clock — the caller is doing this
 * inside a try/catch so the parent operation can decide to surface or
 * swallow the failure.
 *
 * A clock a narration started (a countdown the fiction introduced, a
 * threat's escalation — issue #353) carries that narration's id
 * (`narrationId`): the X-Card on it, or a Burn Momentum / Improve Result that
 * supersedes it, removes the clock with the rest of what it wrote.
 *
 * @param {{ name: string, segments?: number, type?: "campaign"|"tension", advanceOdds?: string,
 *           narrationId?: string|null, planId?: string|null }} input
 * @returns {Promise<object>} the created clock record
 */
export async function createClock(input) {
  const name = String(input?.name ?? "").trim();
  if (!name) throw new Error("createClock: name required");

  const segments = input?.segments ?? 4;
  if (![4, 6, 8, 10].includes(segments)) {
    throw new Error(`createClock: segments must be 4/6/8/10 (got ${segments})`);
  }
  const type        = input?.type === "campaign" ? "campaign" : "tension";
  const advanceOdds = ["small_chance","unlikely","50_50","likely","almost_certain"].includes(input?.advanceOdds)
                      ? input.advanceOdds : DEFAULT_ADVANCE_ODDS;

  const clock = {
    _id:       foundry.utils.randomID(),
    name,
    type,
    segments,
    filled:    0,
    active:    true,
    advanceOdds,
    description: "",
    notes:       "",
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
    ...(typeof input?.narrationId === "string" && input.narrationId ? { narrationId: input.narrationId } : {}),
    // The hidden plan whose escalation it paces (issue #353, secrets.js).
    ...(typeof input?.planId === "string" && input.planId ? { planId: input.planId } : {}),
  };
  await addClock(clock);
  return clock;
}

/** What a hidden plan's clock was named after its subject before issue #362 D3. */
const PLAN_CLOCK_SUFFIX = / — escalation$/;

/**
 * A hidden plan's clock is named by its subject alone (issue #362 D3, the
 * maintainer's answer A): "<subject> — escalation" on the clock cards,
 * `!clock list` and every player's Session panel told the table a plan stood
 * behind it, which the narrator is told never to hint at. The clocks a world
 * made before are renamed once, at load, by the canonical GM (index.js ready):
 * a clock with a `planId` whose name still carries the suffix. One write, on
 * the clock write queue; none when there is nothing to rename. Never throws.
 *
 * @returns {Promise<string[]>} the ids of the clocks renamed
 */
export async function renamePlanClocksBySubject() {
  try {
    return await serialiseClockWrite(async () => {
      const state = foundry.utils.deepClone(readState());
      const renamed = [];
      for (const clock of state.clocks ?? []) {
        if (!clock?.planId || typeof clock.name !== "string" || !PLAN_CLOCK_SUFFIX.test(clock.name)) continue;
        const name = clock.name.replace(PLAN_CLOCK_SUFFIX, "").trim();
        if (!name) continue;
        clock.name = name;
        renamed.push(clock._id);
      }
      if (renamed.length) await writeState(state);
      return renamed;
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | clocks: the hidden plans' clocks were not renamed:`, err?.message ?? err);
    return [];
  }
}

/**
 * Remove the clocks the given narrations started (`narrationId` — createClock),
 * for a narration a Burn Momentum or Improve Result superseded
 * (resultUpgrade.js retractSupersededNarrations). The X-Card's own removal
 * rides its pause write (narrator.js applyXCardToNarratorMemory). Written on a
 * copy.
 *
 * @param {string[]} narrationIds
 * @returns {Promise<string[]>} the ids of the clocks removed
 */
export async function removeClocksMadeBy(narrationIds) {
  const ids = new Set((Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === "string" && id));
  if (!ids.size) return [];
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const gone = (state.clocks ?? []).filter(c => ids.has(c.narrationId));
    if (!gone.length) return [];
    state.clocks = state.clocks.filter(c => !ids.has(c.narrationId));
    await writeState(state);
    return gone.map(c => c._id);
  });
}

/**
 * Retire a clock: `active: false`, kept on the list for the record. An
 * inactive clock is skipped by every automatic advance (Pay the Price,
 * Begin a Session) and shown as retired. A scene challenge's paired tension
 * clock is retired when the challenge is completed (ui/progressTracks.js) —
 * it used to keep advancing on every Pay the Price after the challenge was
 * archived (issue #316 T03). Idempotent: a clock already retired is left as
 * it is, with no write. Written on a copy, so a refused write leaves this
 * client's cached state as it was.
 *
 * @param {string} clockId
 * @returns {Promise<object|null>} the clock as stored, or null when there is none by that id
 */
export async function retireClock(clockId) {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const clock = (state.clocks ?? []).find(c => c._id === clockId) ?? null;
    if (!clock) return null;
    if (clock.active === false) return clock;
    clock.active    = false;
    clock.updatedAt = new Date().toISOString();
    // Retired by its own act (a challenge done, a plan retired): no later
    // undo of the narration that last paced it re-arms it (issue #362 AC33).
    delete clock.pacedBy;
    delete clock.pacedFrom;
    await writeState(state);
    return clock;
  });
}

/**
 * Remove a clock from the list — `!clock remove`, the panel's ✕, and a scene
 * challenge removed with its paired clock (ui/progressTracks.js, issue #316
 * T03). Written on a copy.
 *
 * @param {string} clockId
 * @returns {Promise<object|null>} the clock removed, or null when there was none by that id
 */
export async function removeClock(clockId) {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const clock = (state.clocks ?? []).find(c => c._id === clockId) ?? null;
    if (!clock) return null;
    state.clocks = state.clocks.filter(c => c._id !== clockId);
    await writeState(state);
    return clock;
  });
}

/**
 * Advance every active tension clock by one segment. The module's clock
 * contract (file header above; issue #203 (Clocks)) is that tension
 * clocks advance when you Pay the Price or a complication is rolled — this is
 * the programmatic hook the move pipeline calls on a Pay the Price (playtest
 * finding #10: the wiring was documented but never built). Campaign clocks are
 * left alone (they advance at Begin a Session). The caller GM-gates the call
 * (world-scoped write).
 *
 * A clock in `skipIds` is left alone: a scene challenge's clock that the
 * miss whose price this is filled itself (Face Danger / Secure an Advantage
 * within a scene challenge — "fill a clock segment and Pay the Price", one
 * fill, not two; issue #338 D2).
 *
 * @param {{ skipIds?: string[] }} [opts]
 * @returns {Promise<Array<{name:string, filled:number, segments:number, triggered:boolean}>>}
 *   one entry per clock advanced; empty when there are no active tension clocks.
 */
export async function advanceTensionClocksForPayThePrice({ skipIds = [] } = {}) {
  const skip = new Set(Array.isArray(skipIds) ? skipIds : []);
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());   // a copy (issue #321 U58)
    const eligible = (state.clocks ?? []).filter(
      c => c.active !== false && c.type === "tension" && (c.filled ?? 0) < c.segments && !skip.has(c._id),
    );
    if (!eligible.length) return [];
    const now = new Date().toISOString();
    const advanced = [];
    for (const c of eligible) {
      c.filled = Math.min((c.filled ?? 0) + 1, c.segments);
      c.updatedAt = now;
      advanced.push({ _id: c._id, name: c.name, filled: c.filled, segments: c.segments, triggered: c.filled >= c.segments });
    }
    await writeState(state);
    return advanced;
  });
}

/**
 * Fill (`delta` > 0) or rewind (`delta` < 0) one clock by whole segments,
 * within 0..its segments — a scene challenge's tension clock, by the
 * scene-challenge moves (issue #338 D2: a weak hit or a miss fills it; an
 * upgrade of the move takes back what the superseded outcome filled). A
 * retired clock — its challenge is over — is left alone. Written on a copy.
 *
 * @param {string} clockId
 * @param {number} delta
 * @returns {Promise<{ _id: string, name: string, before: number, filled: number, segments: number,
 *   triggered: boolean, changed: number }|null>} the clock as it now stands and the segments it
 *   changed by; null when there is no active clock by that id
 */
export async function adjustClockSegments(clockId, delta) {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const clock = (state.clocks ?? []).find(c => c._id === clockId) ?? null;
    if (!clock || clock.active === false) return null;
    const before = clock.filled ?? 0;
    const filled = Math.max(0, Math.min(clock.segments, before + Math.trunc(Number(delta) || 0)));
    if (filled !== before) {
      clock.filled    = filled;
      clock.updatedAt = new Date().toISOString();
      await writeState(state);
    }
    return { _id: clock._id, name: clock.name, before, filled, segments: clock.segments,
      triggered: filled >= clock.segments, changed: filled - before };
  });
}

/**
 * Pace a hidden plan's clock after a beat played its step (secrets.js
 * paceAfterReveal): back to empty for the step after, or retired when none is
 * left — stamped with the narration that paced it (`pacedBy`), so taking that
 * narration back re-arms the clock (issue #362 AC33: the X-Card or a Burn
 * Momentum / Improve Result put the step back unplayed, and the clock stayed
 * empty or retired — a last step was then never paced again). A clock no
 * longer active is left as it is. Written on a copy. Its undo:
 * planClockPacing.js.
 *
 * @param {string} clockId
 * @param {{ retire?: boolean, pacedBy?: string|null }} [opts]
 * @returns {Promise<object|null>} the clock as stored, or null when there is no active clock by that id
 */
export async function pacePlanClock(clockId, { retire = false, pacedBy = null } = {}) {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const clock = (state.clocks ?? []).find(c => c._id === clockId) ?? null;
    if (!clock || clock.active === false) return null;
    const before = clock.filled ?? 0;
    if (retire) clock.active = false;
    else clock.filled = 0;
    if (typeof pacedBy === "string" && pacedBy) {
      clock.pacedBy   = pacedBy;
      clock.pacedFrom = before;   // the fill its undo puts back (unpacedClock)
    } else {
      delete clock.pacedBy;
      delete clock.pacedFrom;
    }
    clock.updatedAt = new Date().toISOString();
    await writeState(state);
    return clock;
  });
}

/**
 * Re-arm the clocks the given narrations paced (unpacedClock): a narration a
 * Burn Momentum or Improve Result superseded — a move narration that played a
 * plan's step, a trigger vignette its price's rewind struck — took the step
 * back with it (resultUpgrade.js undoSupersededPlans), and the clock went on
 * pacing the step after. A clock is theirs by its stamp, wherever later
 * prices have turned it since (pacedByOneOf — issue #364
 * PLAN-TRIGGER-XCARD-AFTER-LATER-PRICE: matched only while it stood as paced,
 * a turned clock kept its fill with the step back unplayed). One write, on a
 * copy.
 *
 * A clock whose plan is no longer in play is left as it is (`plansInPlay`,
 * planInPlayFor): one a pacing retired after a last step keeps its stamp when
 * the plan is then retired, deleted or ended by a later narration, and the
 * supersede of the stamped narration ran it again — a clock with no plan
 * behind it (issue #364 RETIRED-PLAN-CLOCK-XCARD-REACTIVATES).
 *
 * @param {string[]} narrationIds
 * @param {{ plansInPlay?: { planIds: Set<string>, clockIds: Set<string> }|null }} [opts] — the plans in play
 *   once the narrations are taken back (worldJournal.js hiddenPlansInPlayWithout); not given, no clock is held back
 * @returns {Promise<string[]>} the ids of the clocks re-armed
 */
export async function restoreClocksPacedBy(narrationIds, { plansInPlay = null } = {}) {
  const ids = new Set((Array.isArray(narrationIds) ? narrationIds : []).filter(id => typeof id === "string" && id));
  if (!ids.size) return [];
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const theirs = (c) => pacedByOneOf(c, ids) && planInPlayFor(c, plansInPlay);
    const paced = (state.clocks ?? []).filter(theirs);
    if (!paced.length) return [];
    state.clocks = state.clocks.map(c => (theirs(c) ? unpacedClock(c) : c));
    await writeState(state);
    return paced.map(c => c._id);
  });
}

/**
 * Run a hidden plan's clock again that a pacing retired — the narration that
 * paced it played what was then the plan's last step — now that a step of the
 * plan is owed again: an earlier narration's step, taken back from under that
 * one's version (resultUpgrade.js undoSupersededPlans, by the clock the plan
 * links; issue #364 PLAN-STEP-REWRITTEN-BEFORE-BURN). Running, empty — as that pacing leaves a
 * clock with a step to come — and still stamped with it, so taking that
 * narration back as well re-arms the clock (unpacedClock). Decided inside the
 * clock write queue: a clock that is running, gone, no plan's, or retired by
 * something other than a pacing (no stamp) is left as it is. Written on a
 * copy.
 *
 * @param {string} clockId
 * @returns {Promise<object|null>} the clock as stored, or null when nothing was written
 */
export async function rerunRetiredPlanClock(clockId) {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const clock = (state.clocks ?? []).find(c => c._id === clockId) ?? null;
    if (!clock || clock.active !== false || !clock.planId || typeof clock.pacedBy !== "string" || !clock.pacedBy) return null;
    clock.active    = true;
    clock.filled    = 0;
    clock.updatedAt = new Date().toISOString();
    await writeState(state);
    return clock;
  });
}

/**
 * The narration whose pacing of a hidden plan's clock a reverted price's
 * trigger did, or null when the clock carries none of its. With the price's
 * own trigger vignette named (`vignette`), the clock's stamp is that
 * narration's or it is another trigger's — an earlier one whose stamp a
 * re-arm left on the clock, a later one's — however far later prices have
 * turned the clock since. Without it (a receipt from before issue #364), the
 * stamp is trusted only while the clock stands as the pacing left it.
 *
 * @param {object} clock — a campaignState.clocks entry
 * @param {string|null|undefined} vignette — the reverted price's trigger vignette, by narration id
 * @returns {string|null}
 */
function pacingOfTrigger(clock, vignette) {
  if (typeof vignette !== "string" || !vignette) return standingPacedBy(clock);
  return clock?.pacedBy === vignette ? vignette : null;
}

/**
 * Put a full clock back one segment short of full: the trigger it reached is
 * owed again, and the next advance fills it and fires it once more — a
 * hidden plan's clock whose trigger vignette was not written (issue #362
 * AC08; secrets.js rearmUnplayedPlanClock). Decided inside the clock write
 * queue, on the clock as that write reads it (issue #337 Y37's rule): a clock
 * that is no longer full — a rewind landed meanwhile — or retired, or gone, is
 * left as it is. Written on a copy.
 *
 * @param {string} clockId
 * @returns {Promise<object|null>} the clock as stored after the re-arm, or null when nothing was written
 */
export async function rearmClock(clockId) {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const clock = (state.clocks ?? []).find(c => c._id === clockId) ?? null;
    if (!clock || clock.active === false || !isFull(clock)) return null;
    clock.filled    = Math.max(0, clock.segments - 1);
    clock.updatedAt = new Date().toISOString();
    await writeState(state);
    return clock;
  });
}

/**
 * Revert tension-clock segments advanced by a Pay the Price that was
 * subsequently undone by burning momentum. Idempotent — clocks already at
 * zero or not found are silently skipped. GM-gated at the call site.
 *
 * Reports the clocks the rewind takes out of their triggered state — full as
 * this queued write reads them, below full after — whoever's price filled
 * them: the upgrade supersedes their trigger vignettes (issue #338 D8). It
 * was judged on the burned price's own receipt, so a clock another player's
 * price had filled since was rewound below full with its vignette left live,
 * and the next price fired a second one (issue #342 Z46; Y37's rule — a
 * queued write decides on what it reads).
 *
 * A hidden plan's clock the reverted price filled (`triggered` — the
 * price's receipt says so) goes back to one segment short of full, the
 * state before that price, whatever its trigger did meanwhile (issue #362
 * AC33): its vignette paced it — empty, or retired after a last step,
 * `pacedBy` its narration — and the rewind found it empty and skipped it,
 * leaving the step the burned price played marked and its vignette live; or
 * it was re-armed one short of full when its vignette was not written (AC08),
 * and a rewind took it a segment further. A paced one is reported with the
 * narration that paced it (`pacedBy`), whose vignette the upgrade supersedes
 * by that id — its plan step taken back with it.
 *
 * Whose pacing it is: the price's receipt names its own trigger vignette
 * (`vignettes` — payThePriceClocks.js `vignetteNarrationId`), and the clock's
 * stamp is that narration's or it is not this price's. The clock alone could
 * not say (issue #364 PLAN-CLOCK-BURN-AFTER-LATER-PRICE): it was trusted only
 * while it stood as the pacing left it (standingPacedBy), so a price paid
 * between the trigger and the burn — the emptied clock turned one segment on —
 * left the burn nothing to find: the vignette stayed live, the step played.
 * The stamp stays on a clock later prices turn, so a clock paced by this
 * price's vignette is put back one short of full wherever it stands now. A
 * receipt from before the id was kept (`vignettes` without the clock) falls
 * back to the standing stamp.
 *
 * A clock that triggered again since carries the later trigger's stamp, and
 * the burned price's own vignette — written, live on the table (`narrated`,
 * read from the chat by the caller) — was found by nothing: it stayed live
 * fiction beside the reversal (issue #364 PLAN-CLOCK-TWO-TRIGGERS-FIRST-BURN).
 * It is reported by the id the receipt names (`pacedBy`), for the upgrade to
 * strike, and the clock is left exactly as it stands: the later trigger
 * happened, its pacing — and every segment a price turned after it — is the
 * clock's present state, and the burned price's own segment went into the
 * trigger now taken back. No segment is given back, no stamp removed (a burn
 * of the later price still finds its own).
 *
 * A clock its vignette paced whose plan has left play since (`planGone`, told
 * by the caller, who reads the plans) is not run again: retired after the
 * plan's last step, it kept its stamp when a GM retired the plan or deleted
 * its page, and the burn put it back one short of full with no plan behind it
 * (issue #364 RETIRED-PLAN-CLOCK-XCARD-REACTIVATES). Its vignette is still
 * struck, by its id; the clock stays as it is.
 *
 * What it did to each clock is the caller's to say on the reversal card, so
 * it is reported clock by clock (`fates`, filled in by this write): a segment
 * taken off (`rewound`); a clock its trigger vignette had paced put back one
 * short of full, the trigger owed again (`putBack`); or left exactly as it
 * stands, only the price's own vignette to be struck (`left` — it triggered
 * again since; `closed` — its plan has left play). A clock it
 * changed nothing on — gone, already empty, already back one short of full —
 * has no entry. The card said "clock rewound" of every clock on the receipt,
 * the one deliberately left as a later trigger paced it included (issue #364
 * PLAN-CLOCK-REWOUND-WORDING).
 *
 * @param {string[]} ids  array of clock `_id` values to decrement by 1 segment
 * @param {{ triggered?: string[], vignettes?: Object<string, string>, narrated?: string[], planGone?: string[],
 *   fates?: Object<string, { fate: "rewound"|"putBack"|"left"|"closed", filled: number, segments: number, active: boolean }>|null }} [opts] —
 *   the clocks the reverted price filled; the narration of each one's trigger vignette, by clock
 *   id; those of them whose vignette stands written on the table; those of them whose plan is no
 *   longer in play once that vignette is taken back; and an object this fills in with what was
 *   done to each clock, by clock id, with the clock's fill as it now stands
 * @returns {Promise<Array<{ _id: string, name: string|null, type: "tension", pacedBy?: string, clockStands?: true }>>}
 *   the clocks taken out of their triggered state, and those whose own trigger vignette is to be
 *   struck by its id (`pacedBy`) with the clock left as it is (`clockStands`) (empty when none)
 */
export async function revertTensionClocksForBurn(ids, { triggered = [], vignettes = null, narrated = [], planGone = [], fates = null } = {}) {
  return serialiseClockWrite(async () => {
    if (!ids?.length) return [];
    const state = foundry.utils.deepClone(readState());   // a copy (issue #321 U58)
    let dirty = false;
    const untriggered = [];
    const now = new Date().toISOString();
    const filledByPrice = new Set(Array.isArray(triggered) ? triggered : []);
    const written = new Set(Array.isArray(narrated) ? narrated : []);
    const gone = new Set(Array.isArray(planGone) ? planGone : []);
    const done = {};
    const say = (c, fate) => { done[c._id] = { fate, filled: c.filled ?? 0, segments: c.segments, active: c.active !== false }; };
    for (const id of ids) {
      const c = (state.clocks ?? []).find(x => x._id === id);
      if (c?.planId && filledByPrice.has(id)) {
        const wasFull = (c.filled ?? 0) >= c.segments;
        const target  = Math.max(0, c.segments - 1);
        const named   = typeof vignettes?.[id] === "string" && vignettes[id] ? vignettes[id] : null;
        const pacedBy = pacingOfTrigger(c, named);
        if (pacedBy && gone.has(id)) {
          // Its plan has left play since: nothing is left for the clock to
          // pace. The vignette goes by its id, the clock stays as it is.
          untriggered.push({ _id: c._id, name: c.name ?? null, type: "tension", pacedBy, clockStands: true });
          say(c, "closed");
          continue;
        }
        if (pacedBy) {
          c.active    = true;
          c.filled    = target;
          c.updatedAt = now;
          delete c.pacedBy;
          delete c.pacedFrom;
          say(c, "putBack");
        } else if (named && written.has(id)) {
          // Its vignette was written and its pacing has been replaced since —
          // the clock triggered again: the vignette goes by its id, the clock
          // stands as the later trigger left it.
          // `clockStands`: its struck card's note must not say the clock was
          // rewound (issue #364 PLAN-VIGNETTE-NOTE-SAYS-REWOUND).
          untriggered.push({ _id: c._id, name: c.name ?? null, type: "tension", pacedBy: named, clockStands: true });
          say(c, "left");
          continue;
        } else if ((c.filled ?? 0) > target) {
          c.filled = target;
          c.updatedAt = now;
          say(c, "rewound");
        } else {
          continue;
        }
        dirty = true;
        if (pacedBy) untriggered.push({ _id: c._id, name: c.name ?? null, type: "tension", pacedBy });
        else if (wasFull) untriggered.push({ _id: c._id, name: c.name ?? null, type: "tension" });
        continue;
      }
      if (!c || (c.filled ?? 0) <= 0) continue;
      const wasFull = (c.filled ?? 0) >= c.segments;
      c.filled = Math.max(0, (c.filled ?? 0) - 1);
      c.updatedAt = now;
      dirty = true;
      say(c, "rewound");
      if (wasFull && c.filled < c.segments) untriggered.push({ _id: c._id, name: c.name ?? null, type: "tension" });
    }
    if (dirty) await writeState(state);
    // Said once the write has landed: a refused write did none of it.
    if (fates && typeof fates === "object") Object.assign(fates, done);
    return untriggered;
  });
}

/**
 * Roll Ask the Oracle for every active, non-triggered campaign clock.
 * Called at Begin a Session (play kit: campaign clocks advance at session
 * start by rolling the clock's configured odds). Clocks that roll YES fill
 * one segment; the rest are unchanged. Returns a result entry for every
 * clock checked — including those that did not advance — so the caller can
 * post a full session-start summary card.
 *
 * The rolls are kept when the write is refused: each advanced entry then
 * carries `saved: false` and the error, with `filled` the segment it rolled
 * to, so the caller can report it and have it saved later without rolling
 * again (applyClockAdvances; issue #316 T04 — a refused write was caught and
 * logged, and the advance was lost for the session). Written on a copy, so
 * the refused write leaves this client's cached state as it was.
 *
 * @returns {Promise<Array<{_id, name, type, filled, segments, triggered, advanced, odds, roll, saved, error?}>>}
 */
export async function advanceCampaignClocksForBeginSession() {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const eligible = (state.clocks ?? []).filter(
      c => c.active !== false && c.type === "campaign" && (c.filled ?? 0) < c.segments,
    );
    if (!eligible.length) return [];

    const now = new Date().toISOString();
    const results = [];
    let dirty = false;

    for (const c of eligible) {
      const r = rollYesNo(c.advanceOdds);
      const advanced = r.answer === "yes";
      if (advanced) {
        c.filled    = Math.min((c.filled ?? 0) + 1, c.segments);
        c.updatedAt = now;
        dirty = true;
      }
      results.push({
        _id:       c._id,
        name:      c.name,
        type:      "campaign",
        filled:    c.filled,
        segments:  c.segments,
        triggered: c.filled >= c.segments,
        advanced,
        odds:      c.advanceOdds,
        roll:      r.roll,
        saved:     true,
      });
    }

    if (dirty) {
      try {
        await writeState(state);
      } catch (err) {
        console.warn(`${MODULE_ID} | Begin a Session: the campaign clock advance was not saved:`, err?.message ?? err);
        for (const r of results) {
          if (r.advanced) { r.saved = false; r.error = String(err?.message ?? err); }
        }
      }
    }
    return results;
  });
}

/**
 * Save recorded clock advances — the GMs' Retry of a session-start advance
 * the world refused (index.js runPayoffStep "clocks", issue #316 T04). Each
 * entry names a clock and the fill it rolled to; the clock is set to at least
 * that fill, within its segments, so a Retry after a GM advanced it by hand
 * — or a second Retry — never advances it twice. A clock no longer on the list
 * is skipped and named. One write, on a copy; nothing is rolled. A clock the
 * saved fill triggers gets its trigger vignette once the write lands: the
 * trigger was owed, not taken back — Begin narrates no trigger it could not
 * save, and the Retry's fill fired none (issue #342 Z63).
 *
 * @param {Array<{ _id: string, filled: number }>} entries
 * @returns {Promise<{ ok: true, applied: Array<{_id, name, filled}>, missing: string[] }
 *   | { ok: false, reason: "refused", error: string }>}
 */
export async function applyClockAdvances(entries) {
  return serialiseClockWrite(async () => {
    const state     = foundry.utils.deepClone(readState());
    const applied   = [];
    const missing   = [];
    const triggered = [];
    for (const e of Array.isArray(entries) ? entries : []) {
      const clock = (state.clocks ?? []).find(c => c._id === e?._id) ?? null;
      if (!clock) { missing.push(String(e?._id ?? "?")); continue; }
      const target = Math.min(Math.max(0, Math.floor(Number(e.filled) || 0)), clock.segments);
      if ((clock.filled ?? 0) >= target) continue;
      clock.filled    = target;
      clock.updatedAt = new Date().toISOString();
      applied.push({ _id: clock._id, name: clock.name, filled: clock.filled });
      if (isFull(clock)) triggered.push(vignetteData(clock));
    }
    if (applied.length) {
      try {
        await writeState(state);
      } catch (err) {
        console.warn(`${MODULE_ID} | clock advances not saved:`, err?.message ?? err);
        return { ok: false, reason: "refused", error: String(err?.message ?? err) };
      }
    }
    for (const clockData of triggered) fireClockVignette(clockData);
    return { ok: true, applied, missing };
  });
}

export async function handleClockCommand(message) {
  const text  = message.content?.trim() ?? "";
  const parts = text.slice("!clock".length).trim().split(/\s+/);
  const verb  = (parts.shift() ?? "").toLowerCase();

  switch (verb) {
    case "":
    case "list":   return postClockList();
    case "new":    return cmdNew(parts);
    case "advance":return cmdAdvance(parts);
    case "fill":   return cmdFill(parts);
    case "reset":  return cmdReset(parts);
    case "remove": return cmdRemove(parts);
    default:
      return postCard(
        `<strong>Clocks</strong><p>Usage: <code>!clock list | new | advance | fill | reset | remove</code></p>`,
      );
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Sub-commands
// ─────────────────────────────────────────────────────────────────────────────

async function cmdNew(parts) {
  if (!gmGate("!clock new")) return;

  // !clock new "Name with spaces" 6 campaign likely
  // OR    new Plainname 8 tension
  const { rest, name } = peelQuotedName(parts);
  if (!name) return postCard(`<strong>Clocks</strong><p>Usage: <code>!clock new &lt;name&gt; &lt;segments&gt; [campaign|tension] [odds]</code></p>`);

  const segments = Number(rest[0]);
  if (![4, 6, 8, 10].includes(segments)) {
    return postCard(`<strong>Clocks</strong><p>Segments must be 4, 6, 8, or 10.</p>`);
  }

  const type        = rest[1]?.toLowerCase() === "campaign" ? "campaign" : "tension";
  const advanceOdds = ["small_chance","unlikely","50_50","likely","almost_certain"].includes(rest[2]?.toLowerCase())
                       ? rest[2].toLowerCase() : DEFAULT_ADVANCE_ODDS;

  const clock = {
    _id:       foundry.utils.randomID(),
    name,
    type,
    segments,
    filled:    0,
    active:    true,
    advanceOdds,
    description: "",
    notes:       "",
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };
  await addClock(clock);

  await postCard(`<strong>Clock created</strong><p>${renderClock(clock)}</p>`);
}

async function cmdAdvance(parts) {
  if (!gmGate("!clock advance")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;
  await advanceClock(clock);
}

async function cmdFill(parts) {
  if (!gmGate("!clock fill")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;
  await fillClock(clock);
}

/**
 * Advance one clock — the `!clock advance` verb and the panel's ↻ button.
 * Campaign clocks roll their advanceOdds; tension clocks fill one segment.
 * Every real advance gets a narrator vignette (narrateClockAdvancement
 * writes "grows by a notch" prose, or the trigger moment on the final
 * segment). A clock that is already full has nothing left to advance: it
 * gets a short notice and NO vignette — re-announcing "TRIGGERED" and
 * paying for a second trigger vignette was the old behaviour.
 *
 * @param {object} clock — a campaignState.clocks entry
 */
async function advanceClock(clock) {
  if (isFull(clock)) return postAlreadyTriggered(clock);

  // Campaign clocks: roll the configured odds. Tension clocks: just fill one.
  if (clock.type === "campaign") {
    const r = rollYesNo(clock.advanceOdds);
    if (r.answer !== "yes") {
      return postCard(
        `<strong>Clock did not advance</strong><p>${escapeHtml(clock.name)} — Ask the Oracle (${clock.advanceOdds}): <strong>NO</strong> (d100=${r.roll}).</p>`,
      );
    }
    const filled = await fillOneSegment(clock);
    if (!filled) return;
    if (filled.wasFull) return postAlreadyTriggered(filled.clock);
    const updated = filled.clock;
    await postCard(
      `<strong>Clock advanced</strong><p>${escapeHtml(clock.name)} — Ask the Oracle (${clock.advanceOdds}): <strong>YES</strong> (d100=${r.roll}). Filled <strong>${updated.filled}/${updated.segments}</strong>.${triggeredSuffix(updated)}</p>`,
    );
    fireClockVignette(vignetteData(updated));
    return;
  }

  const filled = await fillOneSegment(clock);
  if (!filled) return;
  if (filled.wasFull) return postAlreadyTriggered(filled.clock);
  const updated = filled.clock;
  await postCard(
    `<strong>Clock advanced</strong><p>${escapeHtml(clock.name)} — filled <strong>${updated.filled}/${updated.segments}</strong>.${triggeredSuffix(updated)}</p>`,
  );
  fireClockVignette(vignetteData(updated));
}

/**
 * Manually fill one segment — the `!clock fill` verb and the panel's +
 * button. A quiet GM bookkeeping step, so intermediate fills get no
 * vignette; the transition to full is the clock triggering, which gets the
 * same trigger vignette `advance` produces. Already full → notice only.
 *
 * @param {object} clock — a campaignState.clocks entry
 */
async function fillClock(clock) {
  if (isFull(clock)) return postAlreadyTriggered(clock);
  const filled = await fillOneSegment(clock);
  if (!filled) return;
  if (filled.wasFull) return postAlreadyTriggered(filled.clock);
  const updated = filled.clock;
  await postCard(
    `<strong>Clock filled</strong><p>${escapeHtml(clock.name)} — <strong>${updated.filled}/${updated.segments}</strong>.${triggeredSuffix(updated)}</p>`,
  );
  if (isFull(updated)) fireClockVignette(vignetteData(updated));
}

/**
 * Fill one segment. Whether the clock is already full is decided inside the
 * clock write queue, on the clock as that write reads it: a press's own read
 * is the cached clock, which two presses within one round trip both read as
 * not yet full — the second then posted a second "TRIGGERED." card and fired
 * a second trigger vignette (issue #337 Y37). A clock found full is not
 * written. The clock returned is the one this write stored — a read after
 * the queue could already hold a later press's fill.
 *
 * @returns {Promise<{ clock: object, wasFull: boolean } | null>} null if the clock vanished
 */
async function fillOneSegment(clock) {
  const res = await mutateClock(clock._id, c => {
    if (isFull(c)) return false;
    c.filled = Math.min((c.filled ?? 0) + 1, c.segments);
  });
  if (!res) {
    console.warn(`${MODULE_ID} | clock "${clock.name}" disappeared while advancing — nothing posted.`);
    return null;
  }
  return { clock: res.after, wasFull: isFull(res.before) };
}

function isFull(clock) {
  return (clock.filled ?? 0) >= clock.segments;
}

function triggeredSuffix(clock) {
  return isFull(clock) ? " <em>TRIGGERED.</em>" : "";
}

function vignetteData(clock) {
  return { _id: clock._id, name: clock.name, type: clock.type, filled: clock.filled, segments: clock.segments, triggered: isFull(clock) };
}

function postAlreadyTriggered(clock) {
  const ref = /\s/.test(clock.name) ? `"${clock.name}"` : clock.name;
  return postCard(
    `<strong>Clock already triggered</strong><p>${escapeHtml(clock.name)} is full (${clock.segments}/${clock.segments}) — nothing to advance. Use <code>!clock reset ${escapeHtml(ref)}</code> to start it again, or <code>!clock remove</code> it.</p>`,
  );
}

async function cmdReset(parts) {
  if (!gmGate("!clock reset")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;
  await mutateClock(clock._id, c => { c.filled = 0; delete c.pacedBy; delete c.pacedFrom; });
  await postCard(`<strong>Clock reset</strong><p>${escapeHtml(clock.name)} — 0/${clock.segments}.</p>`);
}

async function cmdRemove(parts) {
  if (!gmGate("!clock remove")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;
  await removeClock(clock._id);
  await postCard(`<strong>Clock removed</strong><p>${escapeHtml(clock.name)}.</p>`);
}

async function postClockList() {
  const clocks = readState().clocks ?? [];
  if (!clocks.length) return postCard(`<strong>Clocks</strong><p>None yet. Create one with <code>!clock new &lt;name&gt; &lt;segments&gt; [campaign|tension] [odds]</code>.</p>`);

  const rows = clocks.map(renderClock).join("<br>");
  await postCard(`<strong>Clocks (${clocks.length})</strong><div>${rows}</div>`);
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function gmGate(cmd) {
  if (game.user?.isGM) return true;
  ui.notifications?.warn(`${cmd} is GM-only (writes campaign state).`);
  return false;
}

function readState() {
  return game.settings.get(MODULE_ID, "campaignState") ?? {};
}

async function writeState(state) {
  await game.settings.set(MODULE_ID, "campaignState", state);
}

/**
 * Run one clock read-modify-write after the campaignState write before it on
 * this client has landed. The clocks are one array in campaignState, written
 * whole, and the cached value changes only when the server answers — so a
 * write that read during another's round trip saved the old list over it: two
 * clock actions (↻ on two clocks, two `!clock` verbs, a Pay the Price advance
 * racing a click) lost one (issue #326 W53, the issue #321 U57 shape the
 * Progress Tracks panel's writeTracks serialises). The queue is the one every
 * fire-and-forget campaignState writer on this client shares
 * (multiplayer/campaignStateChain.js): a clock queued only behind clocks
 * erased the oracle result the Pay the Price's own card had just recorded
 * (issue #342 Z17). A write that fails does not hold up the next. `task` must
 * read the state itself and must not call another chained writer: it would
 * wait for itself.
 *
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function serialiseClockWrite(task) {
  return serialiseCampaignStateWrite(task, "clock write");
}

// Every writer here works on a copy of the state: `readState` returns this
// client's cached campaignState, and a refused write must leave it as it was
// — changed in place, the cache kept the change, which the next write of any
// field then persisted (rules/foundry-api.md; issue #321 U58).

/** Append a new clock to the stored list. */
async function addClock(clock) {
  return serialiseClockWrite(async () => {
    const state = { ...readState() };
    state.clocks = [...(state.clocks ?? []), clock];
    await writeState(state);
  });
}

/**
 * Change one clock, in the clock write queue. `fn` changes the clock it is
 * given — the clock as this queued write reads it — or returns `false` to
 * leave it as it is, and nothing is written.
 *
 * @param {string} id
 * @param {(clock: object) => (void|false)} fn
 * @returns {Promise<{ before: object, after: object } | null>} the clock as
 *   the queued read found it and as stored; null when no clock has that id
 */
async function mutateClock(id, fn) {
  return serialiseClockWrite(async () => {
    const state = foundry.utils.deepClone(readState());
    const clock = (state.clocks ?? []).find(c => c._id === id);
    if (!clock) return null;
    const before = foundry.utils.deepClone(clock);
    if (fn(clock) === false) return { before, after: before };
    clock.updatedAt = new Date().toISOString();
    await writeState(state);
    return { before, after: clock };
  });
}

async function findClockByArg(parts) {
  const { name } = peelQuotedName(parts);
  if (!name) {
    await postCard(`<strong>Clocks</strong><p>Specify a clock name (use quotes if it contains spaces).</p>`);
    return null;
  }
  const clocks = readState().clocks ?? [];
  // Prefix-match case-insensitive.
  const lc = name.toLowerCase();
  const exact = clocks.find(c => c.name.toLowerCase() === lc);
  if (exact) return exact;
  const prefix = clocks.filter(c => c.name.toLowerCase().startsWith(lc));
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) {
    await postCard(`<strong>Clocks</strong><p>Ambiguous prefix "${escapeHtml(name)}": ${prefix.map(c => escapeHtml(c.name)).join(", ")}.</p>`);
    return null;
  }
  await postCard(`<strong>Clocks</strong><p>No clock matches "${escapeHtml(name)}".</p>`);
  return null;
}

/**
 * Pop a (possibly quoted) name from the front of parts and return the rest.
 *   ["\"Faction", "Project\"", "8"]  → name: "Faction Project", rest: ["8"]
 *   ["Plainname", "8"]                → name: "Plainname",       rest: ["8"]
 */
function peelQuotedName(parts) {
  if (!parts.length) return { name: "", rest: [] };
  const first = parts[0];
  if (!first.startsWith('"')) {
    return { name: first, rest: parts.slice(1) };
  }
  // Quoted name; concatenate parts until the closing quote.
  let name = first.slice(1);
  let i = 1;
  while (i < parts.length && !parts[i - 1].endsWith('"')) {
    name += " " + parts[i];
    i++;
  }
  // Strip trailing quote off the last fragment if it slipped past the loop guard.
  if (name.endsWith('"')) name = name.slice(0, -1);
  return { name: name.trim(), rest: parts.slice(i) };
}

function renderClock(c) {
  const bar = "█".repeat(c.filled) + "░".repeat(Math.max(0, c.segments - c.filled));
  const triggered = c.filled >= c.segments ? " <em>(TRIGGERED)</em>" : "";
  const retired   = c.active === false ? " <em>(retired)</em>" : "";
  return `<code>[${bar}]</code> ${escapeHtml(c.name)} — ${c.type} ${c.filled}/${c.segments}${c.type === "campaign" ? ` (odds: ${c.advanceOdds})` : ""}${triggered}${retired}`;
}

function fireClockVignette(clockData) {
  setTimeout(async () => {
    try {
      const { narrateClockAdvancement } = await import("../narration/narrator.js");
      // A working copy — the vignette applies its sidecar on it (issue #329 X09).
      const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
      const narrationId = newNarrationId();
      // A trigger is narrated only while the clock is still full when the
      // reply comes in — a fill taken back meanwhile (TRIGGER-VIGNETTE-LATE-POST).
      const text = await narrateClockAdvancement({ clock: clockData, campaignState: cs, narrationId,
        stillTriggered: () => clockStillTriggered(clockData) });
      if (text) {
        // Flag family (NARR-RING-CLOCKVIG, narrator-context audit 2026-07):
        // vignette prose must enter the recent-narration ring and rolling
        // summary like every other narrator fiction card. narrationId: what
        // an X-Card on it retracts (issue #321 U07).
        // The prose is the reader's: the narrator's NPC dialogue markup is
        // stripped, as on every fiction card — a clock card has no Play button
        // (issue #331 X27).
        await postCard(`<em>${proseToHtml(text)}</em>`, {
          clockVignetteCard: true,
          narratorCard:      true,
          narrationText:     text,
          sessionId:         cs.currentSessionId ?? null,
          narrationId,
          // A trigger vignette names its clock (issue #338 D8).
          ...(clockData.triggered && clockData._id ? { clockId: clockData._id } : {}),
        });
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | clock vignette failed:`, err?.message ?? err);
    }
  }, 0);
}

async function postCard(html, extraFlags = {}) {
  await ChatMessage.create({
    content: `<div class="sf-clock-card">${html}</div>`,
    flags:   { [MODULE_ID]: { clockCard: true, ...extraFlags } },
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
