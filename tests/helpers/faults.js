/**
 * STARFORGED COMPANION
 * tests/helpers/faults.js — controllable fault boundaries for a simulated table
 *
 * Issue #302 slice B. A test pauses the table's work at a defined boundary,
 * triggers a competing action, then releases or fails the original — and
 * asserts only once the deferred work has settled, so a negative assertion
 * cannot pass before a late side effect lands. The boundaries are the two the
 * module crosses for everything it persists or asks for:
 *
 *   Claude      scriptClaude(table) answers the table's Claude calls by rule:
 *               a reply, a fault (claudeFault: an HTTP error, a malformed
 *               body, a body that stalls, a network error, no answer at all),
 *               or a hold the test releases or fails later.
 *   writes      failWrites / holdWrites reject or hold world-setting, Actor
 *               and ChatMessage writes that match (multiClient's
 *               interceptWrites).
 *
 * traceTable(table) records the order things actually happened in — Claude
 * calls and replies, writes applied or refused, cards, notifications,
 * dialogs, socket emits, and the test's own marks — and prints it when the
 * test fails. A seed does not reproduce timing; the recorded order does.
 *
 *   const trace  = traceTable(table);
 *   const claude = scriptClaude(table);
 *   const held   = claude.hold(call => call.model === NARRATION_MODEL);
 *   await table.client("pl-1").chat("I push through the breach.");
 *   await held.arrived;                       // the narration is in flight
 *   …competing action…
 *   held.fail(claudeFault.overloaded());      // or held.release(reply)
 *   await table.drain();                      // everything settled
 *   expect(…);
 */

import { onTestFailed } from "vitest";
import { CLAUDE_FAULT, MODULE_ID } from "./multiClient.js";

/** A promise with its resolve / reject exposed. */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude faults
// ─────────────────────────────────────────────────────────────────────────────

function fault(label, respond) {
  return { label, [CLAUDE_FAULT]: respond };
}

/** A Response-like object (what apiPost reads: ok, status, json(), text()). */
function response(status, text) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => JSON.parse(text),
    text: async () => text,
  };
}

const errorBody = (type, message) => JSON.stringify({ type: "error", error: { type, message } });

/**
 * Replies that fail the way the Anthropic API and the network do. Each is
 * labelled for the event order.
 */
export const claudeFault = {
  /** A non-2xx reply with Anthropic's error body. */
  http: (status, type = "api_error", message = `HTTP ${status}`) =>
    fault(`HTTP ${status} ${type}`, () => response(status, errorBody(type, message))),
  /** 429 — the narrator retries this one once. */
  rateLimited: () => claudeFault.http(429, "rate_limit_error", "rate limit exceeded"),
  /** 529 — Anthropic overloaded. */
  overloaded: () => claudeFault.http(529, "overloaded_error", "Overloaded"),
  /** 500. */
  serverError: () => claudeFault.http(500, "api_error", "Internal server error"),
  /** 200 with a body that is not JSON (a reply cut off in transit). */
  malformed: (text = '{"id":"msg_cut","type":"message","content":[{"type":"text","text":"The hull gro') =>
    fault("malformed body", () => response(200, text)),
  /** 200 headers, then a body that never finishes (issue #300 F06). */
  stalledBody: () => fault("stalled body", () => ({
    ok: true, status: 200, statusText: "OK",
    json: () => new Promise(() => {}),
    text: () => new Promise(() => {}),
  })),
  /** The request fails before any response (offline, DNS, CORS). */
  networkError: (message = "Failed to fetch") => fault(`network error (${message})`, () => Promise.reject(new TypeError(message))),
  /** The request is accepted and never answered. */
  hang: () => fault("no response", () => new Promise(() => {})),
};

/**
 * Answer the table's Claude calls by rule, first match wins; anything no rule
 * takes gets `fallback(call)`. Replaces any responder the test set before.
 *
 * @param {import("./multiClient.js").SimTable} table
 * @param {{ fallback?: (call: Object) => any }} [opts]
 */
export function scriptClaude(table, { fallback = defaultReply } = {}) {
  const rules = [];
  table.claude.respond((call) => {
    const rule = rules.find(r => r.remaining !== 0 && r.match(call));
    if (!rule) return fallback(call);
    if (rule.remaining > 0) rule.remaining -= 1;
    return rule.answer(call);
  });
  return {
    /** The next `times` calls matching `match` get `reply` — prose, a raw response object, or a claudeFault. */
    when(match, reply, { times = 1 } = {}) {
      rules.push({ match, remaining: times, answer: (call) => (typeof reply === "function" ? reply(call) : reply) });
      return this;
    },
    /**
     * Hold the next call matching `match`. `arrived` resolves with the call
     * once it is in flight; release(reply?) answers it (the fallback reply by
     * default), fail(fault) answers it with a claudeFault.
     */
    hold(match) {
      const gate = deferred();
      const arrived = deferred();
      let held = null;
      rules.push({ match, remaining: 1, answer: (call) => { held = call; arrived.resolve(call); return gate.promise; } });
      return {
        arrived: arrived.promise,
        release: (reply) => gate.resolve(reply ?? fallback(held ?? {})),
        fail: (claudeFaultReply) => gate.resolve(claudeFaultReply),
      };
    },
  };
}

function defaultReply(call) {
  // Narration needs its fact-block fence; the JSON helpers take "{}".
  return /SIDECAR|NARRATOR ROLE/.test(call?.system ?? "")
    ? 'The station hums. Nothing moves.\n```json\n{"newTruths":[],"stateChanges":[]}\n```'
    : "{}";
}

// ─────────────────────────────────────────────────────────────────────────────
// Write faults
// ─────────────────────────────────────────────────────────────────────────────

/** A write the server refused. */
export function refusedWrite(what = "the write") {
  return new Error(`The server refused ${what} (test fault)`);
}

/**
 * Refuse the next `times` writes matching `match` (see multiClient
 * interceptWrites for the write shape). The caller's promise rejects; nothing
 * of the write applies.
 *
 * @returns {{ readonly refused: number, off: () => void }}
 */
export function failWrites(table, match, { times = 1, error = null } = {}) {
  let refused = 0;
  const off = table.interceptWrites((write) => {
    if (refused >= times || !match(write)) return undefined;
    refused += 1;
    return error ?? refusedWrite(`${write.kind} ${write.key ?? write.name ?? write.id ?? ""}`.trim());
  });
  return { get refused() { return refused; }, off };
}

/**
 * Hold the next write matching `match`. `arrived` resolves with the write;
 * release() lets it apply, fail(error?) refuses it.
 */
export function holdWrites(table, match) {
  const gate = deferred();
  const arrived = deferred();
  let taken = false;
  table.interceptWrites(async (write) => {
    if (taken || !match(write)) return undefined;
    taken = true;
    arrived.resolve(write);
    return gate.promise;
  });
  return {
    arrived: arrived.promise,
    release: () => gate.resolve(undefined),
    fail: (error) => gate.resolve(error ?? refusedWrite("the held write")),
  };
}

/** Match the campaignState world setting (optionally from one client). */
export const campaignStateWrite = (client = null) =>
  (w) => w.kind === "setting" && w.key === `${MODULE_ID}.campaignState` && (!client || w.client === client);

// ─────────────────────────────────────────────────────────────────────────────
// The event order
// ─────────────────────────────────────────────────────────────────────────────

const clip = (text, n = 48) => {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

function describe(e) {
  switch (e.type) {
    case "claude.call":  return `claude #${e.n} → ${e.client} ${e.model ?? "?"} "${clip(e.userText)}"`;
    case "claude.reply": return `claude #${e.n} ← ${e.outcome}`;
    case "write": {
      const what = e.kind === "setting" ? `setting ${e.key.split(".").pop()}`
        : e.kind === "message.create" ? `card ${e.id ?? ""} [${(e.flags ?? []).join(", ")}]`
        : e.kind === "message.update" ? `card update ${e.id} {${(e.changes ?? []).map(c => c.split(".").pop()).join(", ")}}`
        : e.kind === "actor.create" ? `actor create "${e.name}"`
        : `actor update "${e.name}" {${(e.changes ?? []).map(c => c.split(".").pop()).join(", ")}}`;
      return `${e.outcome === "rejected" ? "✗ REFUSED " : ""}${what} by ${e.client ?? "?"}${e.error ? ` — ${e.error}` : ""}`;
    }
    case "notify": return `notify ${e.client} ${e.level}: "${clip(e.message, 90)}"`;
    case "dialog": return `dialog on ${e.client}: "${clip(e.title)}"`;
    case "socket": return `socket ${e.client} → ${e.kind ?? e.event} (to ${e.to?.length ? e.to.join(", ") : "nobody"})`;
    default:       return JSON.stringify(e);
  }
}

/**
 * Record the table's events in order (plus the test's own marks) and print
 * them if the current test fails. Call inside a test (or its beforeEach).
 *
 * @returns {{ entries: string[], mark(label: string): void, toString(): string }}
 */
export function traceTable(table) {
  const entries = [];
  table.onEvent((e) => entries.push(describe(e)));
  const trace = {
    entries,
    mark(label) { entries.push(`── ${label}`); },
    toString() { return entries.map((e, i) => `${String(i + 1).padStart(3)}. ${e}`).join("\n"); },
  };
  onTestFailed(() => {
    console.log(`Event order (issue #302 — the run as it happened):\n${trace}`);
  });
  return trace;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known issues
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A defect that is known and still open, kept visible (issue #302: a known
 * failure is keyed to its exact check). `check` asserts the CORRECT
 * behaviour; this passes while it fails with an error matching `signature`,
 * logs the issue id, and fails on any other error — and on a pass, which means
 * the issue looks fixed: make the check an ordinary regression test then.
 *
 * @param {string}   id         the known-issues.md entry
 * @param {RegExp}   signature  what the failing check's error says
 * @param {Function} check      async () => void — asserts the correct behaviour
 */
export async function expectKnownIssue(id, signature, check) {
  try {
    await check();
  } catch (err) {
    const message = String(err?.message ?? err);
    if (signature.test(message)) {
      console.info(`KNOWN ISSUE ${id}: ${message.split("\n")[0]}`);
      return;
    }
    throw err;
  }
  throw new Error(`KNOWN ISSUE ${id} no longer reproduces — it looks fixed: turn this check into a regression test and close the entry in known-issues.md`);
}

