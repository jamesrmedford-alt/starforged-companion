// Claude replay and record for the scripted playthroughs (issue #290 part 2).
//
// Every Anthropic call the module makes goes through window.fetch (apiPost,
// src/api-proxy.js). An init script wraps fetch in each page: a request to
// api.anthropic.com is handed — with the JS stack at the call — to a function
// exposed from this Node process, which answers it:
//
//   replay — from the scenario's recording (CI: no key, no network);
//   record — from Anthropic, with the key in ANTHROPIC_API_KEY, and the
//            exchange is saved for later replays.
//
// The page never reaches the network for Claude, so there is no CORS to
// satisfy, and the key a recording run uses never enters the world: the page
// sends a placeholder key and this process swaps the real one in.
//
// Which call is which. The stack names the module function that made the call:
// the two named frames above apiPost, e.g. `callNarratorAPI>narrateResolution`
// or `callHaiku>defaultCallDetectionAPI`. That is the call's `kind`. A request
// is answered by the unused recording of its kind whose user message it
// shares the most words with (ties go to the earliest), so a reordered
// background call still gets its own reply. A call with no recording left gets
// a neutral stub reply (narrator prose with an empty fact block, "{}" for a
// JSON helper) and is reported as UNRECORDED. A recording whose system prompt
// sections no longer match the live request is reported as STALE: the prompt
// changed since it was recorded, and it should be re-recorded.
//
// Recorded replies are stored with the entity ids the model echoed back
// (`(id: …)` record headers in the prompt) replaced by the entity's name: ids
// differ in every fresh world, and the readers that take an id also accept the
// name (appendGenerativeTierUpdates).

const ANTHROPIC_HOST = "api.anthropic.com";
const SIDECAR_SECTION = "## RESPONSE FORMAT — MANDATORY SIDECAR";
const NARRATOR_ROLE   = "## NARRATOR ROLE AND VOICE";
const PRIVATE_ROLE    = "You are the narrator running a private channel session.";
const STUB_PROSE      = "The narrator pauses (no recorded reply for this call).";

/** The placeholder key the page holds; record mode swaps in the real one. */
export const PAGE_KEY = "sk-ant-playthrough-placeholder";

/**
 * Runs in the page before any of its scripts (page.addInitScript). Kept free
 * of closures: Playwright serialises the function's source.
 */
function installClaudeBridge() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async function sfcPlaythroughFetch(input, init = {}) {
    const url = typeof input === "string" ? input : (input && input.url) || String(input);
    if (!url.includes("api.anthropic.com") || typeof window.__sfcClaude !== "function") {
      return realFetch(input, init);
    }
    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 60;
    const stack = new Error().stack || "";
    Error.stackTraceLimit = limit;
    let headers = {};
    try { headers = Object.fromEntries(new Headers(init.headers || {}).entries()); } catch { headers = {}; }
    const body = typeof init.body === "string" ? init.body : "";
    const answer = await window.__sfcClaude({ url, headers, body, stack });
    return new Response(answer.body, { status: answer.status, headers: { "Content-Type": "application/json" } });
  };
}

// ── request parsing ──────────────────────────────────────────────────────────

function blockText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(c => (typeof c === "string" ? c : c?.text ?? "")).join("");
  return "";
}

/** { model, system, user } of an Anthropic messages request body. */
export function parseRequest(bodyText) {
  let body = {};
  try { body = JSON.parse(bodyText || "{}"); } catch { body = {}; }
  const system = typeof body.system === "string"
    ? body.system
    : (Array.isArray(body.system) ? body.system.map(b => b?.text ?? "").join("\n\n") : "");
  const user = (Array.isArray(body.messages) ? body.messages : [])
    .filter(m => m?.role === "user")
    .map(m => blockText(m.content))
    .join("\n\n");
  return { model: body.model ?? null, maxTokens: body.max_tokens ?? null, system, user };
}

/** The headings of a prompt's `## ` sections, in order (the !narrator debug split). */
export function sectionHeadings(text) {
  return String(text ?? "")
    .split("\n")
    .filter(line => /^##\s+\S/.test(line))
    .map(line => line.replace(/^#+\s*/, "").trim());
}

/** A prompt's section with this heading (or one that starts with it and a space). */
export function findSection(text, heading) {
  const lines = String(text ?? "").split("\n");
  const start = lines.findIndex(l => {
    if (!/^##\s+\S/.test(l)) return false;
    const h = l.replace(/^#+\s*/, "").trim();
    return h === heading || h.startsWith(`${heading} `);
  });
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i]) || /^-{3,}\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

function parseFrame(line) {
  const m = line.match(/^\s*at (?:async )?(?:(.+?) \()?(\S+?):(\d+):(\d+)\)?\s*$/);
  if (!m) return null;
  const url  = m[2];
  let name = (m[1] ?? "").replace(/\s*\[as [^\]]+\]$/, "").trim();
  if (!/^[A-Za-z_$#][\w$.#]*$/.test(name) || /^(?:Array|Promise|Object|Function)\./.test(name)) name = "";
  return { name, file: url.split("?")[0].split("/").pop(), module: url.includes("/modules/starforged-companion/") };
}

/** The call's kind: the first two named module frames above apiPost. */
export function callerKind(stack) {
  const frames = String(stack ?? "").split("\n").slice(1).map(parseFrame).filter(Boolean);
  const proxy  = frames.findIndex(f => f.file === "api-proxy.js");
  const above  = (proxy >= 0 ? frames.slice(proxy + 1) : frames).filter(f => f.module && f.name);
  return above.slice(0, 2).map(f => f.name).join(">") || "unknown";
}

// ── matching ─────────────────────────────────────────────────────────────────

function words(text) {
  return new Set(String(text ?? "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
}

/** How much of `recorded` the live text contains: shared words / recorded words. */
function containment(recorded, live) {
  if (!recorded.size) return 0;
  let shared = 0;
  for (const w of recorded) if (live.has(w)) shared += 1;
  return shared / recorded.size;
}

/** Entity ids in `(id: …)` record headers → the record's name. */
function idNames(text) {
  const out = new Map();
  for (const m of String(text ?? "").matchAll(/^##\s+(.+?)\s+—\s+[\w ]+?\s+\(id:\s*([^)\s]+)\)/gm)) out.set(m[2], m[1].trim());
  return out;
}

function replaceIds(text, ids) {
  let out = String(text ?? "");
  for (const [id, name] of ids) out = out.split(id).join(name);
  return out;
}

/** The neutral reply for a call nothing was recorded for. */
function stubText({ system, user }) {
  if (system.includes(SIDECAR_SECTION)) {
    return `${STUB_PROSE}\n\n\`\`\`json\n${JSON.stringify({ newTruths: [], stateChanges: [] })}\n\`\`\``;
  }
  if (system.startsWith(NARRATOR_ROLE) || system.includes(PRIVATE_ROLE)) return STUB_PROSE;
  return /json/i.test(system) || /json/i.test(user) ? "{}" : STUB_PROSE;
}

function messageJson(text, model, n) {
  return JSON.stringify({
    id: `msg_playthrough_${n}`, type: "message", role: "assistant", model: model ?? "playthrough-stub",
    content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null,
    usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 40 },
  });
}

// ── the harness ──────────────────────────────────────────────────────────────

/**
 * @param {{ mode: "replay"|"record", recording?: object, apiKey?: string, log?: Function }} options
 */
export function createClaudeHarness({ mode, recording = null, apiKey = null, log = console.log }) {
  if (mode === "record" && !apiKey) throw new Error("record mode needs ANTHROPIC_API_KEY");
  const exchanges = Array.isArray(recording?.exchanges) ? recording.exchanges : [];
  const used      = new Set();
  const recorded  = [];
  const requests  = [];
  const warnings  = [];
  let pending      = 0;
  let lastActivity = Date.now();

  function match(kind, live) {
    const liveWords = words(live.user);
    let best = null;
    exchanges.forEach((x, i) => {
      if (used.has(i) || x.kind !== kind) return;
      const score = containment(words(x.user), liveWords);
      if (!best || score > best.score) best = { i, score };
    });
    if (!best) return null;
    used.add(best.i);
    const x = exchanges[best.i];
    if (Array.isArray(x.sections)) {
      const now = sectionHeadings(live.system);
      const added   = now.filter(h => !x.sections.includes(h));
      const removed = x.sections.filter(h => !now.includes(h));
      if (added.length || removed.length) {
        const note = `STALE ${kind} (recording #${best.i + 1}): sections +[${added.join(" | ")}] -[${removed.join(" | ")}] — re-record`;
        warnings.push(note);
        log(note);
      }
    }
    return { index: best.i, exchange: x };
  }

  async function forward({ url, headers, body }, live, kind) {
    const res = await fetch(url, {
      method:  "POST",
      headers: { ...headers, "x-api-key": apiKey },
      body,
    });
    const text = await res.text();
    if (res.ok) {
      let data = null;
      try { data = JSON.parse(text); } catch { data = null; }
      if (data) {
        const ids = idNames(`${live.system}\n${live.user}`);
        recorded.push({
          kind,
          model:    live.model,
          sections: sectionHeadings(live.system),
          user:     live.user,
          response: {
            model:       data.model ?? live.model,
            content:     (data.content ?? []).map(c => (c?.type === "text" ? { ...c, text: replaceIds(c.text, ids) } : c)),
            stop_reason: data.stop_reason ?? "end_turn",
            usage:       data.usage ?? null,
          },
        });
      }
    } else {
      log(`record: ${kind} → HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return { status: res.status, body: text };
  }

  async function answer(payload, client) {
    pending += 1;
    lastActivity = Date.now();
    const live = parseRequest(payload.body);
    const kind = callerKind(payload.stack);
    const entry = { n: requests.length + 1, client, kind, model: live.model, system: live.system, user: live.user, source: null };
    requests.push(entry);
    try {
      if (!String(payload.url ?? "").includes(ANTHROPIC_HOST)) return { status: 400, body: "{}" };
      if (mode === "record") {
        entry.source = "live";
        return await forward(payload, live, kind);
      }
      const hit = match(kind, live);
      if (hit) {
        entry.source = `recording #${hit.index + 1}`;
        const r = hit.exchange.response ?? {};
        return {
          status: 200,
          body: JSON.stringify({
            id: `msg_playthrough_${entry.n}`, type: "message", role: "assistant",
            model: r.model ?? live.model, content: r.content ?? [], stop_reason: r.stop_reason ?? "end_turn",
            stop_sequence: null,
            usage: r.usage ?? { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 40 },
          }),
        };
      }
      entry.source = "stub";
      log(`UNRECORDED ${kind} (${client}) — answered with the neutral stub`);
      return { status: 200, body: messageJson(stubText(live), live.model, entry.n) };
    } finally {
      pending -= 1;
      lastActivity = Date.now();
    }
  }

  return {
    mode,
    requests,
    warnings,

    /** Hook a page before its first navigation. */
    async attach(page, client) {
      await page.exposeFunction("__sfcClaude", (payload) => answer(payload, client));
      await page.addInitScript(installClaudeBridge);
    },

    /** Wait until no call is in flight and none started for `quietMs`. */
    async idle({ quietMs = 2500, timeoutMs = 60_000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (pending === 0 && Date.now() - lastActivity >= quietMs) return true;
        await new Promise(r => setTimeout(r, 200));
      }
      return false;
    },

    /** Calls per kind and where their replies came from. */
    summary() {
      const byKind = {};
      for (const r of requests) {
        const k = (byKind[r.kind] ??= { calls: 0, recorded: 0, stub: 0, live: 0 });
        k.calls += 1;
        if (r.source === "stub") k.stub += 1;
        else if (r.source === "live") k.live += 1;
        else k.recorded += 1;
      }
      const unused = exchanges
        .map((x, i) => ({ i, kind: x.kind }))
        .filter(({ i }) => !used.has(i))
        .map(({ i, kind }) => `#${i + 1} ${kind}`);
      return { mode, calls: requests.length, byKind, unusedRecordings: mode === "replay" ? unused : [], warnings };
    },

    /** The recording a record run produced. */
    recordingOut(meta = {}) {
      return {
        ...meta,
        source:     "recorded",
        recordedAt: new Date().toISOString(),
        exchanges:  recorded,
      };
    },
  };
}
