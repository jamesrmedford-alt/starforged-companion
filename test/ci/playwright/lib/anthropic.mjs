// The exploration runner's own model calls — the AI player's and the narrative
// reviewer's (issue #302 slice D). The module's calls do not come through
// here: they are made by the module in the GM's page and answered by the
// Claude harness (lib/claude.mjs).
//
// Plain fetch against the Messages API, like the harness: the Playwright
// suites carry no SDK, and a dependency is not added for two call sites
// (CLAUDE.md → "Never do without explicit instruction").
//
// Every call — a retry too — is reserved against the run's budget before it is
// sent and settled when it returns (lib/budget.mjs). The key goes in a header
// and nowhere else: the request log this module keeps holds the prompt, the
// reply and the usage, never a header.
//
// Refusals. A classifier decline arrives as HTTP 200 with `stop_reason:
// "refusal"`; it is reported as such. Server-side fallbacks are not used: a
// rescued call bills at the fallback model's own rates, which the reservation
// made before dispatch did not cover.

const API_URL     = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2026-10-21";
const RETRYABLE   = new Set([408, 409, 429, 500, 502, 503, 504, 529]);
const TIMEOUT_MS  = 180_000;

/** The request body of one call. Pure. */
export function buildRequest({ model, effort, maxTokens, system, user, tool = null }) {
  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    // The current models think adaptively and take no sampling parameters;
    // effort is the one control, set explicitly.
    output_config: { effort },
  };
  if (tool) {
    body.tools = [tool];
    // These models reject a forced tool choice. `auto` does not guarantee a
    // call, so the caller checks for one and asks again.
    body.tool_choice = { type: "auto", disable_parallel_tool_use: true };
  }
  return body;
}

/**
 * What a Messages API reply holds, read in the order that matters: why it
 * stopped, then its content. Pure.
 *
 * @returns {{ ok: boolean, problem?: string, stopReason: string|null, text: string, toolInput: object|null }}
 */
export function readReply(data, { toolName = null } = {}) {
  const stopReason = data?.stop_reason ?? null;
  const content = Array.isArray(data?.content) ? data.content : [];
  const text = content.filter(c => c?.type === "text").map(c => c.text ?? "").join("").trim();
  if (stopReason === "refusal") {
    const category = data?.stop_details?.category ?? data?.stop_details?.type ?? "unspecified";
    return { ok: false, problem: `the model declined the request (refusal: ${category})`, stopReason, text: "", toolInput: null };
  }
  const call = toolName ? content.find(c => c?.type === "tool_use" && c.name === toolName) : null;
  const toolInput = call && call.input && typeof call.input === "object" ? call.input : null;
  if (toolName && !toolInput && stopReason === "max_tokens") {
    return { ok: false, problem: "the reply ran out of max_tokens before it called the tool", stopReason, text, toolInput: null };
  }
  return { ok: true, stopReason, text, toolInput };
}

/**
 * One model call, budgeted.
 *
 * @param {object} o
 * @param {string} o.role — "player" | "reviewer": the budget's tally and the request log's label
 * @param {{ reserve: Function, settle: Function }} o.budget
 * @param {object[]} [o.requestLog] — each attempt is appended: prompt, reply, usage (no headers)
 * @returns {Promise<{ ok: boolean, problem?: string, kind?: "budget"|"api"|"refusal"|"reply",
 *   stopReason?: string|null, text?: string, toolInput?: object|null, usage?: object|null }>}
 */
export async function callClaude({
  apiKey, model, effort = "medium", maxTokens, system, user, tool = null, role, budget,
  requestLog = null, fetchImpl = fetch, retries = 2, pause = (ms) => new Promise(r => setTimeout(r, ms)),
}) {
  const body = JSON.stringify(buildRequest({ model, effort, maxTokens, system, user, tool }));
  let last = { ok: false, kind: "api", problem: "the call was never sent" };
  for (let attempt = 0; attempt <= retries; attempt++) {
    const held = budget.reserve({ model, maxTokens, promptChars: body.length, role });
    if (!held.ok) return { ok: false, kind: "budget", problem: `not sent — the run's budget is spent (${held.reason})` };
    const started = Date.now();
    const entry = { role, model, attempt: attempt + 1, system, user, status: null, reply: null, usage: null, ms: null };
    requestLog?.push(entry);
    let usage = null;
    try {
      const res = await fetchImpl(API_URL, {
        method:  "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": API_VERSION },
        body,
        signal:  AbortSignal.timeout(TIMEOUT_MS),
      });
      entry.status = res.status;
      const raw = await res.text();
      if (!res.ok) {
        last = { ok: false, kind: "api", problem: `HTTP ${res.status}: ${raw.slice(0, 300)}` };
        entry.reply = { error: raw.slice(0, 600) };
        if (!RETRYABLE.has(res.status)) return last;
      } else {
        const data = JSON.parse(raw);
        usage = data.usage ?? null;
        const read = readReply(data, { toolName: tool?.name ?? null });
        entry.reply = { stop_reason: read.stopReason, text: read.text, toolInput: read.toolInput };
        entry.usage = usage;
        if (!read.ok) return { ...read, kind: read.stopReason === "refusal" ? "refusal" : "reply", usage };
        return { ...read, usage };
      }
    } catch (err) {
      last = { ok: false, kind: "api", problem: `the request failed: ${err?.message ?? err}` };
      entry.reply = { error: String(err?.message ?? err).slice(0, 300) };
    } finally {
      entry.ms = Date.now() - started;
      budget.settle(held.id, { usage });
    }
    if (attempt < retries) await pause(2000 * (attempt + 1));
  }
  return last;
}
