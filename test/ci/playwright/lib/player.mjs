// The AI player of an exploration run (issue #302 slice D; #290 part 3).
//
// It is given a persona, a goal, and what its logged-in player can see: the
// chat as rendered on that page, the buttons on its cards, any open dialog,
// and its own character's meters. It acts only as a player can — a line typed
// in chat, a click on a card's button, a dialog filled and submitted, a wait.
// It never reads world state, never calls a module function, and never
// decides whether its goal was met: the observer does (lib/observer.mjs).

import { chat } from "./foundry.mjs";
import { callClaude } from "./anthropic.mjs";

export const MAX_WAIT_SECONDS = 20;
export const PLAYER_ACTIONS = ["say", "click", "dialog", "wait", "stop"];

/** The one tool the player model is given. Every field is always present: the unused ones are empty. */
export const ACTION_TOOL = {
  name: "take_action",
  description: "Take your next action at the table. Exactly one action per turn.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["action", "text", "message", "button", "window", "fields", "seconds", "reason"],
    properties: {
      action: { type: "string", enum: PLAYER_ACTIONS,
        description: "say: type `text` into chat (in-character play, or a chat command). click: press button number `button` on chat message `message`. dialog: in open window number `window`, set `fields`, then press the button whose label is `text`. wait: do nothing for `seconds`. stop: you are finished, or stuck — say which in `reason`." },
      text: { type: "string", description: "For say: the line to type. For dialog: the label of the button to press. Otherwise empty." },
      message: { type: "string", description: "For click: the message's reference as shown, e.g. m7. Otherwise empty." },
      button: { type: "integer", description: "For click: the button's number as shown. Otherwise 0." },
      window: { type: "integer", description: "For dialog: the window's number as shown. Otherwise 0." },
      fields: { type: "array", description: "For dialog: fields to set first, by name. Otherwise empty.",
        items: { type: "object", additionalProperties: false, required: ["name", "value"],
          properties: { name: { type: "string" }, value: { type: "string", description: "The text to enter; for a checkbox, true or false." } } } },
      seconds: { type: "integer", description: "For wait: 1 to 20. Otherwise 0." },
      reason: { type: "string", description: "One sentence: why this action. For stop: whether you are done or what blocks you." },
    },
  },
};

/**
 * What the player's page shows, as data. Runs in the page.
 * @returns {Promise<object>} { character, windows, messages }
 */
export function snapshotScreen(client, { chatTail = 12, ignoreWindows = [] } = {}) {
  return client.page.evaluate(({ chatTail, ignoreWindows }) => {
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

    const messages = game.messages.contents.filter(m => m.visible !== false).slice(-chatTail).map((m, i) => {
      const el = document.querySelector(`#chat [data-message-id="${m.id}"], .chat-log [data-message-id="${m.id}"]`);
      const body = el?.querySelector(".message-content") ?? null;
      const text = body ? read(body) : clean(String(m.content ?? "").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
      const buttons = el ? [...el.querySelectorAll(".message-content button, .message-content a[data-action]")]
        .map((b, n) => ({ n: n + 1, label: clean(b.textContent).slice(0, 70), disabled: !!b.disabled })) : [];
      return { ref: `m${i + 1}`, id: m.id, speaker: clean(m.alias ?? m.author?.name ?? "?"), text: text.slice(0, 1400), buttons };
    });
    return { character, windows, messages };
  }, { chatTail, ignoreWindows });
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
  lines.push(snapshot.messages.length ? "CHAT (oldest first; the last is the newest):" : "CHAT: empty");
  for (const m of snapshot.messages) {
    lines.push(`[${m.ref}] ${m.speaker}: ${m.text}`);
    const live = m.buttons.filter(b => !b.disabled);
    if (live.length) lines.push(`     buttons: ${live.map(b => `(${b.n}) "${b.label}"`).join("  ")}`);
  }
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
  switch (a.action) {
    case "say": {
      const text = String(a.text ?? "").trim();
      if (!text) return { ok: false, problem: "say needs text" };
      return { ok: true, action: { action: "say", text: text.slice(0, 600), reason } };
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

/**
 * A taken action in the form a replay takes it again: no document ids — they
 * differ in every world. A click is kept as its button's label and which of
 * the messages offering that label it was, counted from the newest. Pure.
 */
export function scriptedForm(action, snapshot) {
  if (action.action !== "click") return { ...action };
  const offering = snapshot.messages.filter(m => m.buttons.some(b => !b.disabled && b.label === action.label));
  const at = offering.findIndex(m => m.id === action.messageId);
  return { action: "click", label: action.label, fromNewest: at < 0 ? 0 : offering.length - 1 - at, reason: action.reason ?? "" };
}

/**
 * A replay's scripted action against the screen as it is now. Pure.
 * @returns {{ ok: true, action: object } | { ok: false, problem: string }}
 */
export function resolveScripted(scripted, snapshot) {
  if (scripted.action === "click") {
    const offering = snapshot.messages.filter(m => m.buttons.some(b => !b.disabled && b.label === scripted.label));
    const message = offering[offering.length - 1 - (scripted.fromNewest ?? 0)];
    if (!message) return { ok: false, problem: `no message on screen offers "${scripted.label}"` };
    const button = message.buttons.find(b => !b.disabled && b.label === scripted.label);
    return { ok: true, action: { action: "click", messageId: message.id, message: message.ref, button: button.n, label: button.label, reason: scripted.reason ?? "" } };
  }
  if (scripted.action === "dialog") {
    const window = snapshot.windows.find(w => w.title === scripted.title);
    if (!window) return { ok: false, problem: `the window "${scripted.title}" is not open` };
    if (!window.buttons.includes(scripted.press)) return { ok: false, problem: `the window "${scripted.title}" has no button "${scripted.press}" (it has: ${window.buttons.join(", ")})` };
    return { ok: true, action: { action: "dialog", title: scripted.title, fields: scripted.fields ?? [], press: scripted.press, reason: scripted.reason ?? "" } };
  }
  if (!PLAYER_ACTIONS.includes(scripted.action)) return { ok: false, problem: `unknown action ${JSON.stringify(scripted.action)}` };
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

/** The player's standing instructions: who it is, what it wants, and the rules of the table. */
export function playerSystemPrompt(charter) {
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
    `- Chat commands exist: !begin-session opens the session, !end-session closes it. Each opens a window you fill in and submit.`,
    `- After you act, the table needs time: if the narrator has not answered yet, wait rather than repeat yourself.`,
    `- A card that asks you to choose — "Resolve consequence", a cost to pick, with its choices as buttons — is waiting on you. Answer it with a click before you type anything else: a cost you owe stays owed until you do, and the table will not stop you from typing past it.`,
    `- You know only what your screen shows. Do not invent what the narrator said.`,
    `- When you have done everything your goal asks, or you cannot go on, use stop and say which. Someone else judges whether the goal was met.`,
    ...(charter.playerNotes ?? []).map(n => `- ${n}`),
  ].join("\n");
}

/**
 * Ask the player model for its next action. One retry if it answers without
 * the tool or with an action the screen does not allow.
 *
 * @returns {Promise<{ action: object|null, problem?: string, kind?: "budget"|"api"|"refusal"|"reply", attempts: number }>}
 */
export async function chooseAction({ apiKey, model, effort, maxTokens, charter, history, snapshot, budget, requestLog, fetchImpl }) {
  const screen = describeScreen(snapshot);
  const past = history.length
    ? `YOUR ACTIONS SO FAR:\n${history.map((h, i) => `${i + 1}. ${summariseAction(h.action)}${h.outcome?.ok === false ? ` — FAILED: ${h.outcome.detail}` : ""}`).join("\n")}`
    : "YOUR ACTIONS SO FAR: none";
  let nudge = "";
  let last = { action: null, problem: "no answer", kind: "reply", attempts: 0 };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const reply = await callClaude({
      apiKey, model, effort, maxTokens, role: "player", budget, requestLog, fetchImpl,
      system: playerSystemPrompt(charter),
      user: `${past}\n\nYOUR SCREEN NOW:\n${screen}${nudge}\n\nChoose your next action with take_action.`,
      tool: ACTION_TOOL,
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
    case "dialog": return `in "${a.title}"${a.fields?.length ? ` set ${a.fields.map(f => `${f.name}=${f.value}`).join(", ")} and` : ""} press "${a.press}"`;
    case "wait":   return `wait ${a.seconds}s`;
    case "stop":   return `stop: ${a.reason}`;
    case "gmAccept": return `(GM) accept the move confirmation`;
    default:       return String(a?.action ?? "?");
  }
}
