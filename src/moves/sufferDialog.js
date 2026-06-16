/**
 * STARFORGED COMPANION
 * src/moves/sufferDialog.js — Suffer-choice dialog (F16 Phase D)
 *
 * Blocking ApplicationV2 dialog that surfaces a `sufferPrompt` (emitted
 * by Phase B's CONSEQUENCE_MAP) to the player and turns their
 * selection into one or more `executeSuffer` calls (Phase C).
 *
 * Per F16 scope-doc Q1: blocking. The move resolution pipeline awaits
 * the player's selection before posting the narrator card or firing
 * downstream side effects. AFK-player mitigation:
 *
 *   - **GM override** button — visible only on the GM client; lets
 *     the GM resolve on the player's behalf.
 *   - **Cancel** button — closes the dialog without writes; the
 *     resolution stops there with a "no meter changes" chat card.
 *
 * No auto-timeout default. Silent picks would erode trust worse than
 * the original silent-meter bug we're fixing.
 *
 * The pure logic for "selection → executor call sequence" is exported
 * separately (`resolveSufferSelection`) so unit tests can pin it
 * without spinning up a real ApplicationV2.
 *
 * Source: docs/moves/suffer-pipeline-scope.md §5.3.
 */

import { executeSuffer } from "./sufferExecutor.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// Pure selection → executor-call resolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a `sufferPrompt` plus the player's chosen options into the
 * list of executor calls needed to apply the consequence.
 *
 * Pure function — no I/O, no Foundry deps. Tests pin this without
 * needing the dialog.
 *
 * @param {Object} sufferPrompt  — the consequences.sufferPrompt object.
 * @param {Object} selection
 * @param {number[]} [selection.optionIndices]   — for enumerated prompts
 * @param {string|null} [selection.anyChoice]    — for "any" prompts (suffer id)
 * @param {string|null} [selection.itemId]       — for companion/withstand
 * @returns {Array<Object>} list of `{ kind, ...payload }` describing the
 *   write operations needed. Each entry is one of:
 *     { kind: "suffer",       sufferId, amount, itemId? }
 *     { kind: "meter",        meterKey, delta }
 *     { kind: "noop" }
 *     { kind: "complication", scope }
 *     { kind: "route",        route, rank?, mark? }
 *     { kind: "mark",         debility }
 */
export function resolveSufferSelection(sufferPrompt, selection = {}) {
  if (!sufferPrompt) return [];

  // B1 — "any": player picks any of the six suffer moves, possibly
  // multiple times (count > 1 means "two suffer moves at -N each").
  if (sufferPrompt.kind === "any") {
    const sufferId = selection.anyChoice;
    if (!sufferId) return [];
    const count = sufferPrompt.count ?? 1;
    const amount = sufferPrompt.amount ?? 1;
    const calls = [];
    for (let i = 0; i < count; i++) {
      calls.push({ kind: "suffer", sufferId, amount, itemId: selection.itemId ?? null });
    }
    return calls;
  }

  // B2 — "enumerated": player picks one or more from a listed set.
  // Each picked option may carry a suffer route, an explicit meter
  // delta, a chain of writes, a complication scope, or a route to
  // another move.
  if (sufferPrompt.kind === "enumerated") {
    const indices = selection.optionIndices ?? [];
    const calls = [];
    for (const idx of indices) {
      const opt = sufferPrompt.options?.[idx];
      if (!opt) continue;
      calls.push(...optionToCalls(opt, selection));
    }
    return calls;
  }

  return [];
}

/**
 * Turn a single sufferPrompt option (one entry in `options[]`) into the
 * sequence of write operations it represents.
 */
function optionToCalls(opt, selection) {
  // Option may bundle multiple writes via `chain: [...]`.
  if (Array.isArray(opt.chain)) {
    const calls = [];
    for (const step of opt.chain) {
      calls.push(...optionToCalls(step, selection));
    }
    return calls;
  }

  // No-op option (e.g. "Press on").
  if (opt.noop) return [{ kind: "noop" }];

  // Complication branch (e.g. set_a_course "complication at destination").
  if (opt.complication) {
    return [{ kind: "complication", scope: opt.scope ?? "scene" }];
  }

  // Route to another move (e.g. "Pay the Price", "Swear an Iron Vow").
  if (opt.route) {
    return [{ kind: "route", route: opt.route, ...(opt.rank ? { rank: opt.rank } : {}) }];
  }

  // Combat progress mark — marks the active combat track N times.
  if (typeof opt.combatProgress === 'number') {
    return [{ kind: "combat-progress", count: opt.combatProgress }];
  }

  // Expedition progress mark — marks the active expedition track N times.
  if (typeof opt.expeditionProgress === 'number') {
    return [{ kind: "expedition-progress", count: opt.expeditionProgress }];
  }

  // "+1 on next move" situational bonus — surfaced as a reminder card;
  // the player applies it manually to the next action die roll.
  if (typeof opt.nextBonus === 'number') {
    return [{ kind: "next-bonus", amount: opt.nextBonus }];
  }

  // Suffer route via id (e.g. "Sacrifice Resources (-1)") OR generic
  // "any" sub-prompt (e.g. set_a_course's "One suffer move (-2)" option
  // which carries `kind: "any", amount, count`).
  if (opt.suffer) {
    return [{ kind: "suffer", sufferId: opt.suffer, amount: opt.amount ?? 1, itemId: selection.itemId ?? null }];
  }
  if (opt.kind === "any") {
    const sufferId = selection.anyChoice;
    if (!sufferId) {
      // Caller didn't pre-select which suffer move — surface a follow-up
      // prompt by emitting a "needs-suffer-pick" marker. The dialog will
      // recurse with the chosen sub-id.
      return [{ kind: "needs-any", amount: opt.amount ?? 1, count: opt.count ?? 1 }];
    }
    const calls = [];
    for (let i = 0; i < (opt.count ?? 1); i++) {
      calls.push({ kind: "suffer", sufferId, amount: opt.amount ?? 1, itemId: selection.itemId ?? null });
    }
    return calls;
  }

  // Explicit meter delta options (e.g. "+1 momentum", "-1 health").
  const meterCalls = [];
  for (const [field, delta] of Object.entries(opt)) {
    if (["label", "requires", "noop", "route", "complication", "scope", "suffer", "amount", "chain", "kind", "count", "rank", "mark"].includes(field)) continue;
    if (typeof delta !== "number") continue;
    meterCalls.push({ kind: "meter", meterKey: field, delta });
  }
  // Optional debility mark on the same option (face_death "mark doomed",
  // face_desolation "mark tormented").
  if (opt.mark) meterCalls.push({ kind: "mark", debility: opt.mark });
  return meterCalls;
}


// ─────────────────────────────────────────────────────────────────────────────
// Async runner — turns a resolved selection into actual writes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute the calls returned by `resolveSufferSelection`. Calls each
 * executor in order; for `complication` and `route` calls, surfaces a
 * chat card describing the deferred action (v1 doesn't auto-execute
 * route follow-ups like Swear an Iron Vow — that's the GM's call).
 *
 * @param {Array<Object>} calls    — output of resolveSufferSelection
 * @param {Actor} actor
 * @param {Object} [opts]          — forwarded to executors (isMiss,
 *                                   isMissWithMatch, isCommandVehicle,
 *                                   fixedRoll for tests, …)
 * @returns {Promise<Array<Object>>} list of per-call results
 */
export async function runSufferResolution(calls, actor, opts = {}) {
  const { applyMeterChanges, setDebility } = await import("../character/actorBridge.js");
  const results = [];
  for (const call of calls) {
    switch (call.kind) {
      case "suffer": {
        const r = await executeSuffer(call.sufferId, actor, {
          amount: call.amount,
          itemId: call.itemId,
          ...opts,
        });
        results.push({ kind: "suffer", sufferId: call.sufferId, ...r });
        break;
      }
      case "meter": {
        await applyMeterChanges(actor, { [call.meterKey]: call.delta });
        results.push({ kind: "meter", meterKey: call.meterKey, delta: call.delta });
        break;
      }
      case "mark": {
        await setDebility(actor, call.debility, true);
        results.push({ kind: "mark", debility: call.debility });
        break;
      }
      case "noop":
        results.push({ kind: "noop" });
        break;
      case "combat-progress": {
        const { listProgressTracks, markProgressById } = await import("../ui/progressTracks.js");
        const allTracks = await listProgressTracks();
        const open = allTracks.filter(t => t.type === 'combat' && !t.completed);
        if (open.length === 1) {
          for (let i = 0; i < (call.count ?? 1); i++) {
            await markProgressById(open[0].id).catch(err =>
              console.warn("starforged-companion | combat-progress executor:", err));
          }
          results.push({ kind: "combat-progress", count: call.count, trackId: open[0].id });
        } else {
          results.push({ kind: "combat-progress", count: call.count, skipped: true });
        }
        break;
      }
      case "expedition-progress": {
        const { listProgressTracks, markProgressById } = await import("../ui/progressTracks.js");
        const allTracks = await listProgressTracks();
        const open = allTracks.filter(t => t.type === 'expedition' && !t.completed);
        if (open.length === 1) {
          for (let i = 0; i < (call.count ?? 1); i++) {
            await markProgressById(open[0].id).catch(err =>
              console.warn("starforged-companion | expedition-progress executor:", err));
          }
          results.push({ kind: "expedition-progress", count: call.count, trackId: open[0].id });
        } else {
          results.push({ kind: "expedition-progress", count: call.count, skipped: true });
        }
        break;
      }
      case "next-bonus":
        await postDeferredCard(
          `+${call.amount} on your next move`,
          `Remember to add +${call.amount} to your action die result on the next roll.`,
          { nextBonus: true, amount: call.amount },
        );
        results.push({ kind: "next-bonus", amount: call.amount });
        break;
      case "complication":
        // Surface a chat card; the narrator picks it up on next scene
        // transition. The actual `pendingComplication` flag write is
        // the narrator's responsibility (Phase F for set_a_course; the
        // rest is GM adjudication).
        await postDeferredCard(
          `Pending complication (${call.scope})`,
          `Narrator will surface this complication on the next scene transition or appropriate beat.`,
          { complication: true, scope: call.scope },
        );
        results.push({ kind: "complication", scope: call.scope });
        break;
      case "route":
        // Surface a chat card prompting the player/GM to trigger the
        // follow-up move themselves. Auto-firing Swear an Iron Vow /
        // Pay the Price from here would lose the player's narration.
        await postDeferredCard(
          `Trigger: ${call.route}`,
          `Resolve this by typing the move's chat command or using its panel.${call.rank ? ` (rank: ${call.rank})` : ""}`,
          { route: call.route, rank: call.rank ?? null },
        );
        results.push({ kind: "route", route: call.route, rank: call.rank });
        break;
      case "needs-any":
        // Caller didn't pre-supply an `anyChoice` for a B2 option that
        // embeds a B1-style sub-prompt. Defer to a recursive prompt —
        // the dialog handles this by re-opening with the sub-prompt.
        results.push({ kind: "needs-any", amount: call.amount, count: call.count });
        break;
      default:
        results.push({ kind: "unknown", call });
    }
  }
  return results;
}

async function postDeferredCard(title, body, flags = {}) {
  try {
    return await globalThis.ChatMessage?.create?.({
      content: `<div class="sf-card sf-card--suffer-deferred"><div class="sf-card-header">${title}</div><div class="sf-card-body">${body}</div></div>`,
      flags: { [MODULE_ID]: { sufferDeferred: true, ...flags } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sufferDialog: deferred-card post failed:`, err);
    return null;
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Filter / preview helpers (used by the dialog UI; pure)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate an option's `requires` predicate against the actor's
 * current state. Supports the small DSL the audit table uses:
 *
 *   "!wounded"            → actor.system.debility.wounded === false
 *   "!shaken"             → actor.system.debility.shaken === false
 *   "!battered"           → actor.system.debility.battered === false
 *   "companionHealth>0"   → companion health > 0 (caller passes context)
 *
 * Returns `true` if the option is selectable, `false` if greyed out.
 *
 * @param {Object} opt           — sufferPrompt option entry
 * @param {Object} ctx           — { actor, companionHealth?, … }
 */
export function isOptionAvailable(opt, ctx = {}) {
  if (!opt?.requires) return true;
  const req = String(opt.requires);
  const actor = ctx.actor;
  const debility = actor?.system?.debility ?? {};

  if (req === "!wounded")  return !debility.wounded;
  if (req === "!shaken")   return !debility.shaken;
  if (req === "!battered") return !debility.battered;

  if (req === "companionHealth>0") {
    return (ctx.companionHealth ?? 0) > 0;
  }

  // Unrecognised requires → allow (fail-open; safer than dropping a
  // rulebook-named option silently).
  return true;
}


// ─────────────────────────────────────────────────────────────────────────────
// ApplicationV2 dialog
// ─────────────────────────────────────────────────────────────────────────────

let _dialogClass = null;

/**
 * Lazy-load the ApplicationV2 subclass so the module loads in unit-test
 * envs where `foundry.applications.api.ApplicationV2` is unavailable.
 */
function getDialogClass() {
  if (_dialogClass) return _dialogClass;
  const api = globalThis.foundry?.applications?.api;
  if (!api?.ApplicationV2) return null;
  const { ApplicationV2, HandlebarsApplicationMixin } = api;
  // HandlebarsApplicationMixin is only available in live Foundry; the
  // unit-test setup stubs ApplicationV2 alone. Fall back to plain
  // ApplicationV2 when the mixin is missing — the dialog renders its
  // own HTML inline so the mixin's template-loading isn't required.
  const Base = typeof HandlebarsApplicationMixin === "function"
    ? HandlebarsApplicationMixin(ApplicationV2)
    : ApplicationV2;

  _dialogClass = class SufferChoiceDialogApp extends Base {
    static DEFAULT_OPTIONS = {
      id: "sf-suffer-choice-dialog",
      tag: "form",
      window: { title: "Resolve consequence" },
      position: { width: 520, height: "auto" },
      classes: ["sf-suffer-dialog"],
      actions: {
        pickOption:   SufferChoiceDialogApp.#onPickOption,
        confirmMulti: SufferChoiceDialogApp.#onConfirmMulti,
        gmOverride:   SufferChoiceDialogApp.#onGMOverride,
        cancel:       SufferChoiceDialogApp.#onCancel,
        pickAnySub:   SufferChoiceDialogApp.#onPickAnySub,
      },
    };

    static PARTS = {
      body: { template: null /* rendered inline; see _renderHTML */ },
    };

    constructor({ sufferPrompt, actor, resolveResult, rejectResult, opts = {} }) {
      super();
      this._sufferPrompt    = sufferPrompt;
      this._actor           = actor;
      this._resolveResult   = resolveResult;
      this._rejectResult    = rejectResult;
      this._opts            = opts;
      this._selectedIndices = new Set();
      this._anyChoice       = null;
    }

    /** Render the HTML body inline (no template file needed). */
    async _renderHTML(_context, _options) {
      const p = this._sufferPrompt;
      const actor = this._actor;
      const isGM = !!globalThis.game?.user?.isGM;
      const meters = readMeterPreview(actor);

      let body = "";
      if (p.kind === "any" || this._anySubPrompt) {
        body = renderAnyPicker(this._anySubPrompt ?? p, meters);
      } else {
        body = renderEnumeratedPicker(p, this._selectedIndices, { actor });
      }

      return `
        <section class="sf-suffer-dialog-body">
          ${body}
          <hr/>
          <div class="sf-suffer-dialog-footer">
            ${isGM ? `<button type="button" data-action="gmOverride">GM resolve on behalf</button>` : ""}
            <button type="button" data-action="cancel">Cancel resolution</button>
          </div>
        </section>
      `;
    }

    async _replaceHTML(html, content) {
      content.innerHTML = html;
    }

    /** Player clicks a single-option button (B2 single, or B1 any). */
    static #onPickOption(event, target) {
      const idx = Number(target.dataset.optionIndex);
      const calls = resolveSufferSelection(this._sufferPrompt, {
        optionIndices: [idx],
      });
      this._finish({ selection: { optionIndices: [idx] }, calls });
    }

    /** B2 multi: player checks boxes then clicks Confirm. */
    static #onConfirmMulti(_event, _target) {
      const indices = [...this._selectedIndices];
      const calls = resolveSufferSelection(this._sufferPrompt, { optionIndices: indices });
      this._finish({ selection: { optionIndices: indices }, calls });
    }

    /** B1 any: player clicked one of the six suffer-move buttons. */
    static #onPickAnySub(event, target) {
      const sufferId = target.dataset.sufferId;
      const calls = resolveSufferSelection(this._sufferPrompt, { anyChoice: sufferId });
      this._finish({ selection: { anyChoice: sufferId }, calls });
    }

    static #onGMOverride(_event, _target) {
      // GM picks on player's behalf — same flow as the player's pick.
      // The card postSufferCard emits will include a `gmOverride: true`
      // marker so the chat record reflects who picked.
      this._opts.gmOverride = true;
    }

    static #onCancel(_event, _target) {
      this._finish({ cancelled: true });
    }

    async _finish({ selection = {}, calls = [], cancelled = false }) {
      try { await this.close(); } catch (err) {
        console.warn(`${MODULE_ID} | sufferDialog: close failed:`, err?.message ?? err);
      }
      this._resolveResult({ cancelled, selection, calls });
    }
  };

  return _dialogClass;
}

/**
 * Open the SufferChoiceDialog for the given prompt and await the
 * player's selection. Returns { cancelled, selection, calls }.
 *
 * In test envs where ApplicationV2 isn't available, returns a no-op
 * resolution synchronously — callers should always check `cancelled`
 * before applying writes.
 *
 * @param {Object} sufferPrompt
 * @param {Actor} actor
 * @param {Object} [opts]
 */
export async function promptSufferChoice(sufferPrompt, actor, opts = {}) {
  if (!sufferPrompt) return { cancelled: false, selection: {}, calls: [] };

  const Cls = getDialogClass();
  if (!Cls) {
    // No ApplicationV2 — return an indicator so the caller can fall
    // back to a noop (test env, or pre-init).
    return { cancelled: true, selection: {}, calls: [], reason: "no-app-v2" };
  }

  return new Promise((resolve, reject) => {
    const app = new Cls({ sufferPrompt, actor, resolveResult: resolve, rejectResult: reject, opts });
    app.render(true);
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// HTML helpers (pure-ish; readers test these via snapshot)
// ─────────────────────────────────────────────────────────────────────────────

function readMeterPreview(actor) {
  if (!actor?.system) return {};
  const m = actor.system;
  const read = (key) => {
    const v = m[key];
    return v == null ? null : (typeof v === "object" ? v.value : v);
  };
  return {
    health:   read("health"),
    spirit:   read("spirit"),
    supply:   read("supply"),
    momentum: read("momentum"),
  };
}

function renderEnumeratedPicker(prompt, selectedIndices, ctx) {
  const multi = prompt.multi;
  const multiHeader = multi === true
    ? "Choose any combination:"
    : multi
      ? `Choose ${multi}:`
      : "Choose one:";

  const items = (prompt.options ?? []).map((opt, i) => {
    const avail = isOptionAvailable(opt, ctx);
    const sel   = selectedIndices.has(i);
    if (multi) {
      return `<li><label><input type="checkbox" data-option-index="${i}" ${sel ? "checked" : ""} ${avail ? "" : "disabled"}/> ${escape(opt.label)}${avail ? "" : " <em>(unavailable)</em>"}</label></li>`;
    }
    return `<li><button type="button" data-action="pickOption" data-option-index="${i}" ${avail ? "" : "disabled"}>${escape(opt.label)}</button></li>`;
  }).join("");

  const confirmBtn = multi
    ? `<button type="button" data-action="confirmMulti">Confirm</button>`
    : "";

  return `<p>${multiHeader}</p><ul class="sf-suffer-options">${items}</ul>${confirmBtn}`;
}

function renderAnyPicker(prompt, _meters) {
  const sufferMoves = [
    { id: "endure_harm",         label: "Endure Harm" },
    { id: "endure_stress",       label: "Endure Stress" },
    { id: "lose_momentum",       label: "Lose Momentum" },
    { id: "sacrifice_resources", label: "Sacrifice Resources" },
    { id: "withstand_damage",    label: "Withstand Damage" },
    { id: "companion_takes_a_hit", label: "Companion Takes a Hit" },
  ];
  const items = sufferMoves
    .map(s => `<li><button type="button" data-action="pickAnySub" data-suffer-id="${s.id}">${escape(s.label)} (-${prompt.amount ?? 1})${prompt.count > 1 ? ` × ${prompt.count}` : ""}</button></li>`)
    .join("");
  return `<p>Make a suffer move (${prompt.count > 1 ? `${prompt.count} × ` : ""}-${prompt.amount ?? 1}):</p><ul class="sf-suffer-any">${items}</ul>`;
}

function escape(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
