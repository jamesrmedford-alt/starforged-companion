/**
 * STARFORGED COMPANION
 * src/moves/sufferCard.js — Non-blocking suffer-choice chat card.
 *
 * Replaces the blocking SufferChoiceDialog (sufferDialog.js) in the move
 * pipeline. The dialog was awaited INSIDE the move-concurrency lock, so if it
 * failed to render or never settled it wedged `pendingMove` and every later
 * move reported "a move is already being resolved" (playtest lock-up).
 *
 * This card is posted fire-and-forget: the pipeline continues and releases the
 * lock immediately, so a suffer choice can never hang it again. The player taps
 * a button on the card to apply the choice. The apply logic
 * (`resolveSufferSelection` + `runSufferResolution`) and the `requires`
 * filtering (`isOptionAvailable`) are reused unchanged from sufferDialog.js, so
 * meters stay exactly as correct as the dialog — nothing is auto-applied or
 * guessed.
 */

import {
  resolveSufferSelection,
  runSufferResolution,
  isOptionAvailable,
} from "./sufferDialog.js";
import { getActor, getPlayerActors } from "../character/actorBridge.js";
import { onChatMessageRender } from "../system/chatHooks.js";

const MODULE_ID = "starforged-companion";

// The six suffer moves a B1 "any" prompt ("make a suffer move (-N)") offers.
// Mirrors renderAnyPicker in sufferDialog.js.
const ANY_SUFFER_MOVES = [
  { id: "endure_harm",           label: "Endure Harm" },
  { id: "endure_stress",         label: "Endure Stress" },
  { id: "lose_momentum",         label: "Lose Momentum" },
  { id: "sacrifice_resources",   label: "Sacrifice Resources" },
  { id: "withstand_damage",      label: "Withstand Damage" },
  { id: "companion_takes_a_hit", label: "Companion Takes a Hit" },
];

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * How many options an enumerated prompt lets the player pick.
 *   multi === true   → any number (capped at the option count)
 *   multi === number → that many
 *   otherwise        → 1 (single-select)
 *
 * @param {Object} prompt
 * @returns {number}
 */
export function sufferMultiCap(prompt) {
  if (prompt?.kind !== "enumerated") return 1;
  if (prompt.multi === true) return Math.max(1, prompt.options?.length ?? 1);
  if (typeof prompt.multi === "number") return Math.max(1, prompt.multi);
  return 1;
}

/**
 * Render the choice-card HTML for the current state. Pure — `pickedIndices`
 * tracks already-applied options for a multi-select prompt so they render as
 * done/disabled.
 *
 * @param {Object} prompt
 * @param {Actor|null} actor          — for requires-filtering
 * @param {number[]} [pickedIndices]
 * @returns {string}
 */
export function renderSufferCard(prompt, actor, pickedIndices = []) {
  const picked = new Set(pickedIndices);
  let header, buttons;

  if (prompt.kind === "any") {
    const n   = prompt.count ?? 1;
    const amt = prompt.amount ?? 1;
    header  = `Make a suffer move (${n > 1 ? `${n} × ` : ""}-${amt}):`;
    buttons = ANY_SUFFER_MOVES.map(s =>
      `<button type="button" class="sf-suffer-card-btn" data-action="sf-suffer-pick" ` +
      `data-pick-kind="any" data-suffer-id="${s.id}">${escapeHtml(s.label)} (-${amt})</button>`,
    ).join("");
  } else {
    const cap = sufferMultiCap(prompt);
    header = cap > 1
      ? `Choose ${prompt.multi === true ? "any combination" : cap}:`
      : "Choose one:";
    buttons = (prompt.options ?? []).map((opt, i) => {
      const avail    = isOptionAvailable(opt, { actor });
      const isPicked = picked.has(i);
      const disabled = !avail || isPicked;
      const mark     = isPicked ? "✓ " : "";
      const tail     = avail ? "" : " (unavailable)";
      return `<button type="button" class="sf-suffer-card-btn" data-action="sf-suffer-pick" ` +
        `data-pick-kind="enum" data-option-index="${i}" ${disabled ? "disabled" : ""}>` +
        `${mark}${escapeHtml(opt.label)}${tail}</button>`;
    }).join("");
  }

  return `<div class="sf-card sf-suffer-choice-card">` +
    `<div class="sf-card-header">◈ Resolve consequence</div>` +
    `<div class="sf-card-body"><p>${escapeHtml(header)}</p>` +
    `<div class="sf-suffer-card-buttons">${buttons}</div></div></div>`;
}

function renderResolvedCard(summary) {
  return `<div class="sf-card sf-suffer-choice-card sf-suffer-resolved">` +
    `<div class="sf-card-header">◈ Consequence resolved</div>` +
    `<div class="sf-card-body"><p>${escapeHtml(summary)}</p></div></div>`;
}

/**
 * Human-readable summary of the writes a set of resolved calls performed.
 * Only the directly-applied effects (meter/suffer/mark/clear/progress) — the
 * route/complication/next-bonus calls post their own deferred cards.
 *
 * @param {Array<Object>} calls
 * @returns {string}
 */
export function summarizeSufferCalls(calls) {
  const parts = [];
  for (const c of calls ?? []) {
    switch (c.kind) {
      case "suffer":              parts.push(`${labelForSuffer(c.sufferId)} (-${c.amount})`); break;
      case "meter":               parts.push(`${c.meterKey} ${c.delta >= 0 ? "+" : ""}${c.delta}`); break;
      case "mark":                parts.push(`marked ${c.debility}`); break;
      case "clear-impact":        parts.push(`cleared ${c.debility}`); break;
      case "combat-progress":     parts.push(`combat progress ×${c.count ?? 1}`); break;
      case "expedition-progress": parts.push(`expedition progress ×${c.count ?? 1}`); break;
      case "next-bonus":          parts.push(`+${c.amount} next move`); break;
      case "route":               parts.push(`see "Trigger: ${c.route}"`); break;
      case "complication":        parts.push("complication pending"); break;
      default: break;
    }
  }
  return parts.length ? parts.join(", ") : "no change";
}

function labelForSuffer(id) {
  const m = ANY_SUFFER_MOVES.find(s => s.id === id);
  return m ? m.label : (id ?? "suffer");
}

/**
 * Post the non-blocking suffer-choice card. Returns the created message (or
 * null). Safe to call fire-and-forget from the move pipeline.
 *
 * @param {{ sufferPrompt: Object, actor: Actor, executorOpts?: Object, moveId?: string|null }} args
 */
export async function postSufferChoiceCard({ sufferPrompt, actor, executorOpts = {}, moveId = null }) {
  if (!sufferPrompt) return null;
  try {
    return await globalThis.ChatMessage?.create?.({
      content: renderSufferCard(sufferPrompt, actor, []),
      flags: {
        [MODULE_ID]: {
          sufferCard:    true,
          sufferPrompt,
          executorOpts,
          actorId:       actor?.id ?? null,
          moveId,
          pickedIndices: [],
          resolved:      false,
        },
      },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | postSufferChoiceCard: post failed:`, err?.message ?? err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Click handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wire the suffer-card buttons on render. Idempotent across re-renders (clones
 * each button to drop stale listeners, like the burn-momentum hook).
 */
export function registerSufferCardHook() {
  onChatMessageRender((message, root) => {
    const f = message?.flags?.[MODULE_ID];
    if (!f?.sufferCard || f.resolved) return;

    const stale = root.querySelectorAll('[data-action="sf-suffer-pick"]');
    stale.forEach(btn => btn.replaceWith(btn.cloneNode(true)));

    root.querySelectorAll('[data-action="sf-suffer-pick"]').forEach(btn => {
      if (btn.disabled) return;
      btn.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        btn.disabled = true;
        try {
          await handleSufferPick(message, { ...btn.dataset });
        } catch (err) {
          console.warn(`${MODULE_ID} | sufferCard: pick handler failed:`, err?.message ?? err);
          btn.disabled = false;
        }
      });
    });
  });
}

async function handleSufferPick(message, dataset) {
  const f = message?.flags?.[MODULE_ID] ?? {};
  if (!f.sufferCard || f.resolved) return;

  const prompt = f.sufferPrompt;
  if (!prompt) return;
  const actor = getActor(f.actorId) ?? getPlayerActors()[0] ?? null;
  if (!actor) {
    console.warn(`${MODULE_ID} | sufferCard: no actor to apply suffer against`);
    return;
  }
  const executorOpts = f.executorOpts ?? {};

  // Build the selection from the clicked button. anyChoice is supplied
  // defensively so an enumerated option that is itself a nested "any" sub-prompt
  // resolves rather than emitting needs-any.
  let selection, idx = null;
  if (dataset.pickKind === "any") {
    selection = { anyChoice: dataset.sufferId };
  } else {
    idx = Number(dataset.optionIndex);
    selection = { optionIndices: [idx], anyChoice: null };
  }

  const calls = resolveSufferSelection(prompt, selection);

  // A nested "any" sub-prompt (e.g. set_a_course's "One suffer move (-2)"):
  // post a fresh B1 picker card rather than applying a default.
  const needsAny = calls.find(c => c.kind === "needs-any");
  if (needsAny) {
    await postSufferChoiceCard({
      sufferPrompt: { kind: "any", amount: needsAny.amount, count: needsAny.count },
      actor, executorOpts, moveId: f.moveId,
    });
    await finalizeResolved(message, "Suffer move chosen — resolve it on the follow-up card.");
    return;
  }

  await runSufferResolution(calls, actor, executorOpts);

  // Multi-select: accumulate picks until the cap is reached, then resolve.
  const cap = sufferMultiCap(prompt);
  if (prompt.kind === "enumerated" && cap > 1 && idx != null) {
    const picked = Array.isArray(f.pickedIndices) ? [...f.pickedIndices, idx] : [idx];
    if (picked.length < cap) {
      await message.update({
        [`flags.${MODULE_ID}.pickedIndices`]: picked,
        content: renderSufferCard(prompt, actor, picked),
      }).catch(err => console.warn(`${MODULE_ID} | sufferCard: multi update failed:`, err?.message ?? err));
      return;
    }
    await finalizeResolved(message, "Applied your selections.");
    return;
  }

  await finalizeResolved(message, `Applied: ${summarizeSufferCalls(calls)}`);
}

async function finalizeResolved(message, summary) {
  await message.update({
    [`flags.${MODULE_ID}.resolved`]: true,
    content: renderResolvedCard(summary),
  }).catch(err => console.warn(`${MODULE_ID} | sufferCard: resolve update failed:`, err?.message ?? err));
}
