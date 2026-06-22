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

const MODULE_ID = "starforged-companion";


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
      return {
        clocks: clocks.map(c => ({
          ...c,
          triggered: c.filled >= c.segments,
          isCampaign: c.type === "campaign",
        })),
      };
    }

    async _renderHTML({ clocks }) {
      const oddsOpts = ["small_chance","unlikely","50_50","likely","almost_certain"]
        .map(o => `<option value="${o}">${o.replace(/_/g, " ")}</option>`).join("");

      const row = (c) => {
        const bar = "█".repeat(c.filled) + "░".repeat(Math.max(0, c.segments - c.filled));
        return `
          <div class="clock-row clock-${c.type}${c.triggered ? " is-triggered" : ""}" data-clock-id="${c._id}">
            <div class="clock-name"><strong>${escapeHtml(c.name)}</strong> · ${c.type} · ${c.filled}/${c.segments}${c.isCampaign ? ` (odds: ${c.advanceOdds})` : ""}${c.triggered ? " <em>TRIGGERED</em>" : ""}</div>
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
      content.innerHTML = "";
      content.append(result);
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
      root.querySelector('[name="newClockName"]').value = "";
      this.render();
    }

    static async #onAdvanceClock(_event, target) {
      if (!gmGate("Advance clock")) return;
      const id = target.dataset.clockId;
      const c  = (readState().clocks ?? []).find(x => x._id === id);
      if (!c) return;

      if (c.type === "campaign") {
        const r = rollYesNo(c.advanceOdds);
        if (r.answer === "yes") {
          await mutateClock(id, x => { x.filled = Math.min(x.filled + 1, x.segments); });
        }
      } else {
        await mutateClock(id, x => { x.filled = Math.min(x.filled + 1, x.segments); });
      }
      this.render();
    }

    static async #onFillClock(_event, target) {
      if (!gmGate("Fill clock")) return;
      const id = target.dataset.clockId;
      await mutateClock(id, x => { x.filled = Math.min(x.filled + 1, x.segments); });
      this.render();
    }

    static async #onResetClock(_event, target) {
      if (!gmGate("Reset clock")) return;
      const id = target.dataset.clockId;
      await mutateClock(id, x => { x.filled = 0; });
      this.render();
    }

    static async #onRemoveClock(_event, target) {
      if (!gmGate("Remove clock")) return;
      const id = target.dataset.clockId;
      const state = readState();
      state.clocks = (state.clocks ?? []).filter(c => c._id !== id);
      await writeState(state);
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
 * @param {{ name: string, segments?: number, type?: "campaign"|"tension", advanceOdds?: string }} input
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
                      ? input.advanceOdds : "likely";

  const state = readState();
  state.clocks ??= [];
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
  state.clocks.push(clock);
  await writeState(state);
  return clock;
}

/**
 * Advance every active tension clock by one segment. The module's clock
 * contract (file header above; docs/clocks/clocks-scope.md) is that tension
 * clocks advance when you Pay the Price or a complication is rolled — this is
 * the programmatic hook the move pipeline calls on a Pay the Price (playtest
 * finding #10: the wiring was documented but never built). Campaign clocks are
 * left alone (they advance at Begin a Session). The caller GM-gates the call
 * (world-scoped write).
 *
 * @returns {Promise<Array<{name:string, filled:number, segments:number, triggered:boolean}>>}
 *   one entry per clock advanced; empty when there are no active tension clocks.
 */
export async function advanceTensionClocksForPayThePrice() {
  const state = readState();
  const eligible = (state.clocks ?? []).filter(
    c => c.active !== false && c.type === "tension" && (c.filled ?? 0) < c.segments,
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
}

/**
 * Revert tension-clock segments advanced by a Pay the Price that was
 * subsequently undone by burning momentum. Idempotent — clocks already at
 * zero or not found are silently skipped. GM-gated at the call site.
 *
 * @param {string[]} ids  array of clock `_id` values to decrement by 1 segment
 */
export async function revertTensionClocksForBurn(ids) {
  if (!ids?.length) return;
  const state = readState();
  let dirty = false;
  const now = new Date().toISOString();
  for (const id of ids) {
    const c = (state.clocks ?? []).find(x => x._id === id);
    if (!c || (c.filled ?? 0) <= 0) continue;
    c.filled = Math.max(0, (c.filled ?? 0) - 1);
    c.updatedAt = now;
    dirty = true;
  }
  if (dirty) await writeState(state);
}

/**
 * Roll Ask the Oracle for every active, non-triggered campaign clock.
 * Called at Begin a Session (play kit: campaign clocks advance at session
 * start by rolling the clock's configured odds). Clocks that roll YES fill
 * one segment; the rest are unchanged. Returns a result entry for every
 * clock checked — including those that did not advance — so the caller can
 * post a full session-start summary card.
 *
 * @returns {Promise<Array<{name, type, filled, segments, triggered, advanced, odds, roll}>>}
 */
export async function advanceCampaignClocksForBeginSession() {
  const state = readState();
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
      name:      c.name,
      type:      "campaign",
      filled:    c.filled,
      segments:  c.segments,
      triggered: c.filled >= c.segments,
      advanced,
      odds:      c.advanceOdds,
      roll:      r.roll,
    });
  }

  if (dirty) await writeState(state);
  return results;
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
                       ? rest[2].toLowerCase() : "likely";

  const state = readState();
  state.clocks ??= [];
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
  state.clocks.push(clock);
  await writeState(state);

  await postCard(`<strong>Clock created</strong><p>${renderClock(clock)}</p>`);
}

async function cmdAdvance(parts) {
  if (!gmGate("!clock advance")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;

  // Campaign clocks: roll the configured odds. Tension clocks: just fill one.
  if (clock.type === "campaign") {
    const r = rollYesNo(clock.advanceOdds);
    if (r.answer === "yes") {
      await mutateClock(clock._id, c => { c.filled = Math.min(c.filled + 1, c.segments); });
      const updated = readState().clocks.find(c => c._id === clock._id);
      await postCard(
        `<strong>Clock advanced</strong><p>${escapeHtml(clock.name)} — Ask the Oracle (${clock.advanceOdds}): <strong>YES</strong> (d100=${r.roll}). Filled <strong>${updated.filled}/${updated.segments}</strong>.${updated.filled >= updated.segments ? " <em>TRIGGERED.</em>" : ""}</p>`,
      );
      fireClockVignette({ name: clock.name, type: clock.type, filled: updated.filled, segments: updated.segments, triggered: updated.filled >= updated.segments });
      return;
    }
    return postCard(
      `<strong>Clock did not advance</strong><p>${escapeHtml(clock.name)} — Ask the Oracle (${clock.advanceOdds}): <strong>NO</strong> (d100=${r.roll}).</p>`,
    );
  }

  await mutateClock(clock._id, c => { c.filled = Math.min(c.filled + 1, c.segments); });
  const updated = readState().clocks.find(c => c._id === clock._id);
  await postCard(
    `<strong>Clock advanced</strong><p>${escapeHtml(clock.name)} — filled <strong>${updated.filled}/${updated.segments}</strong>.${updated.filled >= updated.segments ? " <em>TRIGGERED.</em>" : ""}</p>`,
  );
  fireClockVignette({ name: clock.name, type: clock.type, filled: updated.filled, segments: updated.segments, triggered: updated.filled >= updated.segments });
}

async function cmdFill(parts) {
  if (!gmGate("!clock fill")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;
  await mutateClock(clock._id, c => { c.filled = Math.min(c.filled + 1, c.segments); });
  const updated = readState().clocks.find(c => c._id === clock._id);
  await postCard(
    `<strong>Clock filled</strong><p>${escapeHtml(clock.name)} — <strong>${updated.filled}/${updated.segments}</strong>.${updated.filled >= updated.segments ? " <em>TRIGGERED.</em>" : ""}</p>`,
  );
}

async function cmdReset(parts) {
  if (!gmGate("!clock reset")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;
  await mutateClock(clock._id, c => { c.filled = 0; });
  await postCard(`<strong>Clock reset</strong><p>${escapeHtml(clock.name)} — 0/${clock.segments}.</p>`);
}

async function cmdRemove(parts) {
  if (!gmGate("!clock remove")) return;
  const clock = await findClockByArg(parts);
  if (!clock) return;
  const state = readState();
  state.clocks = (state.clocks ?? []).filter(c => c._id !== clock._id);
  await writeState(state);
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
  state.updatedAt = new Date().toISOString();
  await game.settings.set(MODULE_ID, "campaignState", state);
}

async function mutateClock(id, fn) {
  const state = readState();
  const clock = (state.clocks ?? []).find(c => c._id === id);
  if (!clock) return;
  fn(clock);
  clock.updatedAt = new Date().toISOString();
  await writeState(state);
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
  return `<code>[${bar}]</code> ${escapeHtml(c.name)} — ${c.type} ${c.filled}/${c.segments}${c.type === "campaign" ? ` (odds: ${c.advanceOdds})` : ""}${triggered}`;
}

function fireClockVignette(clockData) {
  setTimeout(async () => {
    try {
      const { narrateClockAdvancement } = await import("../narration/narrator.js");
      const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const text = await narrateClockAdvancement({ clock: clockData, campaignState: cs });
      if (text) {
        await postCard(`<em>${escapeHtml(text)}</em>`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | clock vignette failed:`, err?.message ?? err);
    }
  }, 0);
}

async function postCard(html) {
  await ChatMessage.create({
    content: `<div class="sf-clock-card">${html}</div>`,
    flags:   { [MODULE_ID]: { clockCard: true } },
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
