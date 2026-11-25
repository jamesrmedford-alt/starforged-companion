// The AI player of an exploration run (issue #302 slice D; #290 part 3).
//
// It is given a persona, a goal, and what its logged-in player can see: the
// chat as rendered on that page, the buttons on its cards, any open dialog,
// and its own character's meters. It acts only as a player can — a line typed
// in chat, a click on a card's button, a dialog filled and submitted, a wait.
// It never reads world state, never calls a module function, and never
// decides whether its goal was met: the observer does (lib/observer.mjs).
//
// A long run (issue #373) adds two actions — choosing an option in a dropdown
// on a card (the vow card's Link) and closing a window — and bounds what the
// player is sent: its standing instructions are fixed for the run and cached,
// and its memory is its last fifteen actions and a short notebook it writes
// itself. The prompt does not grow with the run: sent every action so far, a
// ninety-action run's player alone would pass the cost of everything else.

import { MODULE_ID, chat } from "./foundry.mjs";
import { callClaude } from "./anthropic.mjs";
import { optionFor } from "./cast.mjs";

export const MAX_WAIT_SECONDS = 20;
export const PLAYER_ACTIONS = ["say", "click", "choose", "dialog", "close", "wait", "stop"];
/** How much of its own past the player is shown: its last actions, and its notebook's last lines. */
export const HISTORY_ACTIONS = 15;
export const NOTEBOOK_LINES  = 14;
export const NOTE_CHARS      = 220;

/** The one tool the player model is given. Every field is always present: the unused ones are empty. */
export const ACTION_TOOL = {
  name: "take_action",
  description: "Take your next action at the table. Exactly one action per turn.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["action", "text", "message", "button", "option", "window", "fields", "seconds", "note", "reason"],
    properties: {
      action: { type: "string", enum: PLAYER_ACTIONS,
        description: "say: type `text` into chat (in-character play, or a chat command). click: press button number `button` on chat message `message`. choose: on chat message `message`, set dropdown number `button` to `option` (then click the button beside it). dialog: in open window number `window`, set `fields`, then press the button whose label is `text`. close: close open window number `window` without answering it. wait: do nothing for `seconds`. stop: you are finished, or stuck — say which in `reason`." },
      text: { type: "string", description: "For say: the line to type. For dialog: the label of the button to press. Otherwise empty." },
      message: { type: "string", description: "For click and choose: the message's reference as shown, e.g. m7, or e2 for a card further up the chat. Otherwise empty." },
      button: { type: "integer", description: "For click: the button's number as shown. For choose: the dropdown's number as shown. Otherwise 0." },
      option: { type: "string", description: "For choose: the option to select, exactly as shown. Otherwise empty." },
      window: { type: "integer", description: "For dialog and close: the window's number as shown. Otherwise 0." },
      fields: { type: "array", description: "For dialog: fields to set first, by name. Otherwise empty.",
        items: { type: "object", additionalProperties: false, required: ["name", "value"],
          properties: { name: { type: "string" }, value: { type: "string", description: "The text to enter; for a checkbox, true or false." } } } },
      seconds: { type: "integer", description: "For wait: 1 to 20. Otherwise 0." },
      note: { type: "string", description: "Optional: one short line to keep in your notebook — a name, what you have established, what is done. You are shown only your last few actions; the notebook is what you remember. Otherwise empty." },
      reason: { type: "string", description: "One sentence: why this action. For stop: whether you are done or what blocks you." },
    },
  },
};

/**
 * What the player's page shows, as data.
 * @returns {Promise<object>} { character, windows, messages }
 */
export function snapshotScreen(client, { chatTail = 12, openEarlier = 6, ignoreWindows = [] } = {}) {
  return client.page.evaluate(screenOf, { chatTail, openEarlier, ignoreWindows, moduleId: MODULE_ID });
}

/**
 * The screen, read where it is shown: runs in the page (`game`, `document`),
 * and closes over nothing.
 *
 * A narration the X-Card took back is not on it. The module flags the card
 * (`flags[module].xCarded`) and leaves its prose in the chat log; the third
 * live run's player went on reading it for twenty-two turns and brought what
 * it said back as its vow's proof. What the table took back, a player at the
 * table is not shown again.
 */
export function screenOf({ chatTail, openEarlier, ignoreWindows, moduleId }) {
  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  const shown = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  // What a person reads: the rendered text (line breaks between blocks, no
  // stylesheet's source), not the markup's.
  const read = (el) => clean(el ? (shown(el) && typeof el.innerText === "string" ? el.innerText : el.textContent) : "");
  const pc = game.user?.character ?? null;
  const meter = (k) => pc?.system?.[k]?.value ?? null;
  const character = pc ? { name: pc.name, health: meter("health"), spirit: meter("spirit"), supply: meter("supply"), momentum: meter("momentum") } : null;

  const windows = [...document.querySelectorAll("dialog[open], .application.dialog, .application.window-app, .application")]
    .filter(el => shown(el) && !el.closest("#sidebar") && !el.matches("#sidebar, #ui-left, #ui-right, #hotbar, #players, #navigation, #controls, #scene-controls"))
    .map(el => ({ el, title: clean(el.querySelector(".window-title, header h1, header h4")?.textContent) }))
    .filter(w => w.title && !ignoreWindows.includes(w.title))
    .filter((w, i, all) => all.findIndex(x => x.el === w.el) === i)
    .slice(0, 4)
    .map(({ el, title }) => ({
      title,
      text: read(el.querySelector(".window-content, form, .dialog-content")).slice(0, 500),
      fields: [...el.querySelectorAll("input[name], select[name], textarea[name]")].filter(f => f.type !== "hidden").slice(0, 12).map(f => ({
        name: f.name, type: f.tagName === "SELECT" ? "select" : (f.type || "text"),
        label: clean(f.closest("label")?.textContent || document.querySelector(`label[for="${f.id}"]`)?.textContent || f.placeholder || ""),
        value: f.type === "checkbox" ? String(f.checked) : String(f.value ?? ""),
        options: f.tagName === "SELECT" ? [...f.options].map(o => clean(o.textContent)).slice(0, 12) : undefined,
      })),
      buttons: [...el.querySelectorAll("button, [data-action]")].filter(b => shown(b) && !b.disabled && clean(b.textContent)).slice(0, 8)
        .map(b => clean(b.textContent).slice(0, 60)),
    }));

  const describe = (m, ref, chars) => {
    const el = document.querySelector(`#chat [data-message-id="${m.id}"], .chat-log [data-message-id="${m.id}"]`);
    const body = el?.querySelector(".message-content") ?? null;
    const text = body ? read(body) : clean(String(m.content ?? "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
    const buttons = el ? [...el.querySelectorAll(".message-content button, .message-content a[data-action]")]
      .map((b, n) => ({ n: n + 1, label: clean(b.textContent).slice(0, 70), disabled: !!b.disabled })) : [];
    const selects = el ? [...el.querySelectorAll(".message-content select")].filter(sel => !sel.disabled)
      .map((sel, n) => ({
        n: n + 1,
        label: clean(sel.closest("label")?.textContent?.replace(sel.textContent, "") || sel.getAttribute("aria-label") || sel.name || "").slice(0, 60),
        value: clean(sel.selectedOptions?.[0]?.textContent ?? ""),
        options: [...sel.options].map(o => clean(o.textContent)).filter(Boolean).slice(0, 14),
      })) : [];
    return { ref, id: m.id, speaker: clean(m.alias ?? m.author?.name ?? "?"), text: text.slice(0, chars), buttons, selects };
  };
  const visible = game.messages.contents.filter(m => m.visible !== false && m.flags?.[moduleId]?.xCarded !== true);
  const tail = visible.slice(-chatTail).map((m, i) => describe(m, `m${i + 1}`, 1400));
  // A card further up that can still be answered — a vow's card, a choice
  // left open. A person scrolls up to it; a view of the last lines alone
  // hides it (the long haul's third rehearsal: the vow card was thirteen
  // messages up when its Link was wanted).
  const earlier = visible.slice(0, -chatTail).map(m => describe(m, "", 320))
    .filter(m => m.selects.length || m.buttons.some(b => !b.disabled))
    .slice(-openEarlier).map((m, i) => ({ ...m, ref: `e${i + 1}`, earlier: true }));
  const messages = [...earlier, ...tail];
  return { character, windows, messages };
}

/** The snapshot as the text the player model reads. Pure. */
export function describeScreen(snapshot) {
  const lines = [];
  const c = snapshot.character;
  lines.push(c ? `YOUR CHARACTER: ${c.name} — health ${c.health}, spirit ${c.spirit}, supply ${c.supply}, momentum ${c.momentum}` : "YOUR CHARACTER: none assigned");
  lines.push("");
  if (!snapshot.windows.length) lines.push("OPEN WINDOWS: none");
  snapshot.windows.forEach((w, i) => {
    lines.push(`OPEN WINDOW ${i + 1}: "${w.title}"${w.text ? ` — ${w.text}` : ""}`);
    for (const f of w.fields) {
      lines.push(`  field ${f.name} (${f.type}${f.label ? `, "${f.label}"` : ""}) = ${JSON.stringify(f.value)}${f.options ? ` options: ${f.options.join(" | ")}` : ""}`);
    }
    if (w.buttons.length) lines.push(`  buttons: ${w.buttons.map(b => `"${b}"`).join(", ")}`);
  });
  lines.push("");
  const message = (m) => {
    lines.push(`[${m.ref}] ${m.speaker}: ${m.text}`);
    const live = m.buttons.filter(b => !b.disabled);
    if (live.length) lines.push(`     buttons: ${live.map(b => `(${b.n}) "${b.label}"`).join("  ")}`);
    for (const sel of m.selects ?? []) {
      lines.push(`     dropdown (${sel.n})${sel.label ? ` "${sel.label}"` : ""} = ${JSON.stringify(sel.value)} options: ${sel.options.join(" | ")}`);
    }
  };
  const earlier = snapshot.messages.filter(m => m.earlier);
  const tail = snapshot.messages.filter(m => !m.earlier);
  if (earlier.length) {
    lines.push("FURTHER UP THE CHAT, STILL OPEN (older than the chat below; each can still be answered):");
    earlier.forEach(message);
    lines.push("");
  }
  lines.push(tail.length ? "CHAT (oldest first; the last is the newest):" : "CHAT: empty");
  tail.forEach(message);
  return lines.join("\n");
}

/**
 * Check a model's action against the screen it was chosen on. Pure.
 * @returns {{ ok: true, action: object } | { ok: false, problem: string }}
 */
export function validateAction(input, snapshot) {
  const a = input && typeof input === "object" ? input : {};
  if (!PLAYER_ACTIONS.includes(a.action)) return { ok: false, problem: `unknown action ${JSON.stringify(a.action)}` };
  const reason = String(a.reason ?? "").slice(0, 300);
  const checked = validateKind(a, snapshot, reason);
  // A line for the notebook rides on any action.
  const note = String(a.note ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_CHARS);
  return checked.ok && note ? { ok: true, action: { ...checked.action, note } } : checked;
}

function validateKind(a, snapshot, reason) {
  switch (a.action) {
    case "say": {
      const text = String(a.text ?? "").trim();
      if (!text) return { ok: false, problem: "say needs text" };
      return { ok: true, action: { action: "say", text: text.slice(0, 600), reason } };
    }
    case "choose": {
      const message = snapshot.messages.find(m => m.ref === a.message);
      if (!message) return { ok: false, problem: `no message ${JSON.stringify(a.message)} on screen` };
      const select = (message.selects ?? []).find(s => s.n === Number(a.button));
      if (!select) return { ok: false, problem: `message ${message.ref} has no dropdown ${a.button}` };
      // The option as it is written — or the one it plainly means: "Tamsin
      // Vey" asked for where her card, and so the option, is "Tamsin".
      const asked = String(a.option ?? "").replace(/\s+/g, " ").trim();
      const option = optionFor(asked, select.options);
      if (option == null) return { ok: false, problem: `dropdown ${select.n} on ${message.ref} has no option "${asked}" (it has: ${select.options.join(", ")})` };
      return { ok: true, action: { action: "choose", messageId: message.id, message: message.ref, select: select.n, option, reason } };
    }
    case "close": {
      const window = snapshot.windows[Number(a.window) - 1];
      if (!window) return { ok: false, problem: `no open window ${a.window}` };
      return { ok: true, action: { action: "close", title: window.title, reason } };
    }
    case "click": {
      const message = snapshot.messages.find(m => m.ref === a.message);
      if (!message) return { ok: false, problem: `no message ${JSON.stringify(a.message)} on screen` };
      const button = message.buttons.find(b => b.n === Number(a.button));
      if (!button) return { ok: false, problem: `message ${message.ref} has no button ${a.button}` };
      if (button.disabled) return { ok: false, problem: `button ${button.n} on ${message.ref} is disabled` };
      return { ok: true, action: { action: "click", messageId: message.id, message: message.ref, button: button.n, label: button.label, reason } };
    }
    case "dialog": {
      const index = Number(a.window) - 1;
      const window = snapshot.windows[index];
      if (!window) return { ok: false, problem: `no open window ${a.window}` };
      const label = String(a.text ?? "").trim();
      if (!window.buttons.includes(label)) return { ok: false, problem: `window "${window.title}" has no button "${label}" (it has: ${window.buttons.join(", ")})` };
      const fields = (Array.isArray(a.fields) ? a.fields : []).map(f => ({ name: String(f?.name ?? ""), value: String(f?.value ?? "") }));
      const unknown = fields.find(f => !window.fields.some(w => w.name === f.name));
      if (unknown) return { ok: false, problem: `window "${window.title}" has no field ${unknown.name}` };
      return { ok: true, action: { action: "dialog", title: window.title, fields, press: label, reason } };
    }
    case "wait":
      return { ok: true, action: { action: "wait", seconds: Math.max(1, Math.min(MAX_WAIT_SECONDS, Math.floor(Number(a.seconds)) || 5)), reason } };
    default:
      return { ok: true, action: { action: "stop", reason } };
  }
}

/** A truth's id as the table shows it ("tr-ca277"). */
const TRUTH_ID = /\btr-[a-z0-9]{4,}\b/;
/** How much of a truth's entry names it for a replay. */
const TRUTH_KEY_CHARS = 80;
const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A typed line with a truth's id in it, without the id: the id is replaced
 * by `{truth}` and the entry it stood before on the screen is kept beside it
 * ("tr-ca277 raider cutter — is named the Ashen Wake" → `truth: "raider
 * cutter — is named the Ashen Wake"`). A line with no such id, or an id the
 * screen does not show, is returned as it is. Pure.
 *
 * @param {{ action: string, text?: string }} action — a `say`
 * @param {string} screenText — the screen it was typed on, a message to a line
 */
export function sayWithoutIds(action, screenText) {
  const id = TRUTH_ID.exec(String(action.text ?? ""))?.[0];
  if (!id) return { ...action };
  const entry = new RegExp(`\\b${id}\\s+(.+?)(?=\\s+tr-[a-z0-9]{4,}\\b|$)`, "m").exec(String(screenText ?? ""))?.[1]?.trim();
  if (!entry) return { ...action };
  return { ...action, text: action.text.replace(id, "{truth}"), truth: entry.slice(0, TRUTH_KEY_CHARS).trim() };
}

/** The id a kept truth entry stands after on this screen, or null. Pure. */
export function truthIdFor(entry, screenText) {
  return new RegExp(`\\b(tr-[a-z0-9]{4,})\\s+${escapeRegExp(entry)}`).exec(String(screenText ?? ""))?.[1] ?? null;
}

/**
 * Buttons the module renamed after a kept run recorded a press of them: the
 * label it recorded → the label the module shows now. A replay looks for the
 * new one when no message offers the old (resolveScripted).
 */
export const LABEL_RENAMES = Object.freeze({
  // The fight threshold card's button (issue #377 round 2,
  // FIGHT-COMMIT-CARD-AFTER-THE-ROLL) — pressed in the first live long haul.
  "⚔ Enter the Fray": "⚔ Begin the fight",
});

/**
 * A taken action in the form a replay takes it again: no document ids — they
 * differ in every world. A click is kept as its button's label and which of
 * the messages offering that label it was, counted from the newest; a typed
 * line that names a truth by its id, by the entry the id stood before. Pure.
 */
export function scriptedForm(action, snapshot) {
  if (action.action === "say") return sayWithoutIds(action, snapshot.messages.map(m => m.text).join("\n"));
  if (action.action === "choose") {
    const offering = snapshot.messages.filter(m => (m.selects ?? []).some(s => s.options.includes(action.option)));
    const at = offering.findIndex(m => m.id === action.messageId);
    return { action: "choose", select: action.select, option: action.option, fromNewest: at < 0 ? 0 : offering.length - 1 - at, reason: action.reason ?? "", ...(action.note ? { note: action.note } : {}) };
  }
  if (action.action !== "click") return { ...action };
  const offering = snapshot.messages.filter(m => m.buttons.some(b => !b.disabled && b.label === action.label));
  const at = offering.findIndex(m => m.id === action.messageId);
  return { action: "click", label: action.label, fromNewest: at < 0 ? 0 : offering.length - 1 - at, reason: action.reason ?? "", ...(action.note ? { note: action.note } : {}) };
}

/**
 * A replay's scripted action against the screen as it is now. Pure.
 * @returns {{ ok: true, action: object } | { ok: false, problem: string }}
 */
export function resolveScripted(scripted, snapshot) {
  if (scripted.action === "click") {
    // A button the module has since renamed is found by its new label, so a
    // kept run still replays (LABEL_RENAMES).
    const offers = (label) => snapshot.messages.filter(m => m.buttons.some(b => !b.disabled && b.label === label));
    const label = offers(scripted.label).length || !LABEL_RENAMES[scripted.label] ? scripted.label : LABEL_RENAMES[scripted.label];
    const offering = offers(label);
    const message = offering[offering.length - 1 - (scripted.fromNewest ?? 0)];
    if (!message) return { ok: false, problem: `no message on screen offers "${scripted.label}"` };
    const button = message.buttons.find(b => !b.disabled && b.label === label);
    return { ok: true, action: { action: "click", messageId: message.id, message: message.ref, button: button.n, label: button.label, reason: scripted.reason ?? "" } };
  }
  if (scripted.action === "choose") {
    const offering = snapshot.messages.filter(m => (m.selects ?? []).some(s => s.options.includes(scripted.option)));
    const message = offering[offering.length - 1 - (scripted.fromNewest ?? 0)];
    if (!message) return { ok: false, problem: `no message on screen has a dropdown offering "${scripted.option}"` };
    const select = message.selects.find(s => s.n === scripted.select && s.options.includes(scripted.option)) ?? message.selects.find(s => s.options.includes(scripted.option));
    return { ok: true, action: { action: "choose", messageId: message.id, message: message.ref, select: select.n, option: scripted.option, reason: scripted.reason ?? "" } };
  }
  if (scripted.action === "close") {
    if (!snapshot.windows.some(w => w.title === scripted.title)) return { ok: false, problem: `the window "${scripted.title}" is not open` };
    return { ok: true, action: { action: "close", title: scripted.title, reason: scripted.reason ?? "" } };
  }
  if (scripted.action === "dialog") {
    const window = snapshot.windows.find(w => w.title === scripted.title);
    if (!window) return { ok: false, problem: `the window "${scripted.title}" is not open` };
    if (!window.buttons.includes(scripted.press)) return { ok: false, problem: `the window "${scripted.title}" has no button "${scripted.press}" (it has: ${window.buttons.join(", ")})` };
    return { ok: true, action: { action: "dialog", title: scripted.title, fields: scripted.fields ?? [], press: scripted.press, reason: scripted.reason ?? "" } };
  }
  if (!PLAYER_ACTIONS.includes(scripted.action)) return { ok: false, problem: `unknown action ${JSON.stringify(scripted.action)}` };
  if (scripted.action === "say" && scripted.truth) {
    const id = truthIdFor(scripted.truth, snapshot.messages.map(m => m.text).join("\n"));
    if (!id) return { ok: false, problem: `no truth on screen reads "${scripted.truth}"` };
    const { truth: _entry, ...rest } = scripted;
    return { ok: true, action: { ...rest, text: scripted.text.replace("{truth}", id) } };
  }
  return { ok: true, action: { ...scripted } };
}

/**
 * Carry out a validated action on the player's page, as a player would.
 * @returns {Promise<{ ok: boolean, detail?: string }>}
 */
export async function executeAction(client, action) {
  switch (action.action) {
    case "say":
      await chat(client, action.text);
      return { ok: true };
    case "click":
      return client.page.evaluate(({ id, n }) => {
        const el = document.querySelector(`#chat [data-message-id="${id}"], .chat-log [data-message-id="${id}"]`);
        const button = el ? [...el.querySelectorAll(".message-content button, .message-content a[data-action]")][n - 1] : null;
        if (!button) return { ok: false, detail: "the button is no longer on screen" };
        if (button.disabled) return { ok: false, detail: "the button is disabled now" };
        button.click();
        return { ok: true };
      }, { id: action.messageId, n: action.button });
    case "choose":
      return client.page.evaluate(({ id, n, option }) => {
        const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
        const el = document.querySelector(`#chat [data-message-id="${id}"], .chat-log [data-message-id="${id}"]`);
        const select = el ? [...el.querySelectorAll(".message-content select")].filter(sel => !sel.disabled)[n - 1] : null;
        if (!select) return { ok: false, detail: "the dropdown is no longer on screen" };
        const wanted = [...select.options].find(o => clean(o.textContent) === option);
        if (!wanted) return { ok: false, detail: `the dropdown no longer offers "${option}"` };
        select.value = wanted.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }, { id: action.messageId, n: action.select, option: action.option });
    case "close":
      return client.page.evaluate(async ({ title }) => {
        const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
        const el = [...document.querySelectorAll("dialog[open], .application")].find(w => clean(w.querySelector(".window-title, header h1, header h4")?.textContent) === title);
        if (!el) return { ok: false, detail: `the window "${title}" is no longer open` };
        // As its own close control does: the header's ✕, else the app's close().
        const control = el.querySelector('header [data-action="close"], header .close, .header-control.close');
        if (control) { control.click(); return { ok: true }; }
        const app = foundry.applications?.instances?.get?.(el.id) ?? Object.values(ui.windows ?? {}).find(w => w.element?.[0] === el || w.element === el);
        if (app?.close) { await app.close(); return { ok: true }; }
        return { ok: false, detail: `the window "${title}" has no close control` };
      }, { title: action.title });
    case "dialog":
      return client.page.evaluate(({ title, fields, press }) => {
        const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
        const el = [...document.querySelectorAll("dialog[open], .application")].find(w => clean(w.querySelector(".window-title, header h1, header h4")?.textContent) === title);
        if (!el) return { ok: false, detail: `the window "${title}" is no longer open` };
        for (const { name, value } of fields) {
          const f = el.querySelector(`[name="${name}"]`);
          if (!f) return { ok: false, detail: `no field ${name}` };
          if (f.type === "checkbox") f.checked = value === "true";
          else if (f.tagName === "SELECT") f.value = [...f.options].find(o => clean(o.textContent) === value || o.value === value)?.value ?? f.value;
          else f.value = value;
          f.dispatchEvent(new Event("input", { bubbles: true }));
          f.dispatchEvent(new Event("change", { bubbles: true }));
        }
        const button = [...el.querySelectorAll("button, [data-action]")].find(b => clean(b.textContent).slice(0, 60) === press);
        if (!button) return { ok: false, detail: `no button "${press}"` };
        button.click();
        return { ok: true };
      }, { title: action.title, fields: action.fields, press: action.press });
    case "wait":
      await new Promise(r => setTimeout(r, action.seconds * 1000));
      return { ok: true };
    default:
      return { ok: true };
  }
}

/**
 * The player's standing instructions: who it is, what it wants, the rules of
 * the table and — in a charter with beats — every beat in order. Fixed for
 * the run, so it is sent as a cached block: nothing that changes between two
 * actions may be written here.
 */
export function playerSystemPrompt(charter) {
  const beats = Array.isArray(charter.beats) ? charter.beats : [];
  return [
    `You are playtesting a tabletop role-playing game (Ironsworn: Starforged) run in Foundry VTT with an AI narrator. You are a player at the table, not the game master.`,
    ``,
    `WHO YOU ARE: ${charter.persona}`,
    ``,
    `WHAT YOU WANT THIS SESSION: ${charter.goal}`,
    ``,
    `HOW YOU PLAY:`,
    `- Each turn you see your screen and choose exactly one action with the take_action tool.`,
    `- You play by typing in chat as your character, in the first person, a sentence or two. The narrator answers in chat; a card may offer buttons.`,
    `- What you type is in the fiction: what your character does or says, and nothing else. Never write the name of a move, a stat or a rule in it ("Face Danger", "roll", "milestone", "+heart"), and never say what move a line is: the table reads your line and decides. Buttons and cards may name moves; pressing one is not naming it.`,
    `- Chat commands exist: !begin-session opens the session, !end-session closes it. Each opens a window you fill in and submit.`,
    `- After you act, the table needs time: if the narrator has not answered yet, wait rather than repeat yourself.`,
    ...(beats.length ? [`- A roll is not the end of a beat, and neither is an answer. Each turn the observer says what it sees of the beat. When it says the beat is NOT done, waiting will not finish it: do what the beat asks again, another way. Wait only where a beat says it is the table's and not yours.`] : []),
    `- A card that asks you to choose — "Resolve consequence", a cost to pick, with its choices as buttons — is waiting on you. Answer it with a click before you type anything else: a cost you owe stays owed until you do, and the table will not stop you from typing past it.`,
    `- You know only what your screen shows. Do not invent what the narrator said.`,
    `- You are shown your last ${HISTORY_ACTIONS} actions and your notebook, nothing older. When something will matter later — a name, a thing you established, what you have finished — put one short line in \`note\`.`,
    `- When you have done everything your goal asks, or you cannot go on, use stop and say which. Someone else judges whether the goal was met.`,
    ...(charter.playerNotes ?? []).map(n => `- ${n}`),
    ...(beats.length ? [
      ``,
      `THE BEATS, IN ORDER. Each turn you are told which beat is current. Work on that one only. You do not decide when a beat is done: an observer does, and moves you on — to the next beat when it is done, or past it when it has not been reached after several actions. Never announce that a beat is done; never skip ahead.`,
      ...beats.map(b => `${b.n}. [session ${b.session}] ${b.playerTitle ?? b.title}${b.tell ? ` — ${b.tell}` : ""}`),
    ] : []),
  ].join("\n");
}

/** The player's notebook after an action: its note added, the oldest lines dropped. Pure. */
export function keepNote(notebook, action) {
  const note = String(action?.note ?? "").trim();
  return note ? [...notebook, note].slice(-NOTEBOOK_LINES) : notebook;
}

/**
 * What changes between two actions: the current beat, the notebook, the last
 * few actions, the screen. Pure. Its size does not depend on how long the run
 * has gone on.
 *
 * @param {{ history: object[], snapshot: object, notebook?: string[], beat?: object|null, nudge?: string }} o
 */
export function playerTurnPrompt({ history, snapshot, notebook = [], beat = null, nudge = "" }) {
  const shown = history.slice(-HISTORY_ACTIONS);
  const first = history.length - shown.length;
  const past = shown.length
    ? `YOUR LAST ${shown.length === history.length ? "" : `${shown.length} `}ACTIONS${first > 0 ? ` (of ${history.length} so far)` : ""}:\n${shown.map((h, i) => `${first + i + 1}. ${h.action ? summariseAction(h.action) : `(no action: ${h.problem ?? "?"})`}${h.outcome?.ok === false ? ` — FAILED: ${h.outcome.detail}` : ""}`).join("\n")}`
    : "YOUR ACTIONS SO FAR: none";
  const parts = [];
  if (beat) {
    // What the observer has to say plainly stands on a line of its own,
    // above the count: a note in brackets was read past (the third live run).
    // So does a card on the table that waits on the player (`waiting`, lib/
    // beats.mjs cardsWaiting): the fourth live run's player typed past a held
    // result's "Keep the result" (a38) and past "Which vow advances?" (a71).
    parts.push(`CURRENT BEAT: ${beat.n} of ${beat.of} [session ${beat.session}] — ${beat.title}${beat.tell ? `\n${beat.tell}` : ""}`
      + (beat.alert ? `\nTHE OBSERVER: ${beat.alert}` : "")
      + (beat.waiting ? `\nWAITING ON YOU: ${beat.waiting}` : "")
      + `\n(${beat.actions} action${beat.actions === 1 ? "" : "s"} spent on this beat so far${beat.note ? `; ${beat.note}` : ""}.)`);
  }
  parts.push(notebook.length ? `YOUR NOTEBOOK:\n${notebook.map(n => `- ${n}`).join("\n")}` : "YOUR NOTEBOOK: empty");
  parts.push(past);
  parts.push(`YOUR SCREEN NOW:\n${describeScreen(snapshot)}${nudge}`);
  parts.push("Choose your next action with take_action.");
  return parts.join("\n\n");
}

/**
 * Ask the player model for its next action. One retry if it answers without
 * the tool or with an action the screen does not allow.
 *
 * @returns {Promise<{ action: object|null, problem?: string, kind?: "budget"|"api"|"refusal"|"reply", attempts: number }>}
 */
export async function chooseAction({ apiKey, model, effort, maxTokens, charter, history, snapshot, notebook = [], beat = null, budget, requestLog, fetchImpl }) {
  let nudge = "";
  let last = { action: null, problem: "no answer", kind: "reply", attempts: 0 };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaude({
      apiKey, model, effort, maxTokens, role: "player", budget, requestLog, fetchImpl,
      system: playerSystemPrompt(charter),
      user: playerTurnPrompt({ history, snapshot, notebook, beat, nudge }),
      tool: ACTION_TOOL,
      // The instructions and the tool are the same every turn: read from
      // cache after the first. Uncached, they were the largest cost of the
      // first reviewed run (issue #374 A7).
      cache: true,
    });
    if (!reply.ok) return { action: null, problem: reply.problem, kind: reply.kind, attempts: attempt };
    const checked = reply.toolInput ? validateAction(reply.toolInput, snapshot) : { ok: false, problem: "the reply did not use take_action" };
    if (checked.ok) return { action: checked.action, attempts: attempt };
    last = { action: null, problem: checked.problem, kind: "reply", attempts: attempt };
    nudge = `\n\nYour last answer could not be used: ${checked.problem}. Answer again with take_action.`;
  }
  return last;
}

/** One line for an action, for logs and for the player's own history. */
export function summariseAction(a) {
  switch (a?.action) {
    case "say":    return `say: ${a.text}`;
    case "click":  return `click "${a.label}" on ${a.message}`;
    case "choose": return `choose "${a.option}" in dropdown ${a.select} on ${a.message ?? "a card"}`;
    case "close":  return `close the window "${a.title}"`;
    case "dialog": return `in "${a.title}"${a.fields?.length ? ` set ${a.fields.map(f => `${f.name}=${f.value}`).join(", ")} and` : ""} press "${a.press}"`;
    case "wait":   return `wait ${a.seconds}s`;
    case "stop":   return `stop: ${a.reason}`;
    case "gmAccept": return `(GM) accept the move confirmation`;
    default:       return String(a?.action ?? "?");
  }
}
