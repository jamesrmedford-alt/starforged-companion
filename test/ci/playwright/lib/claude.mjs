// Claude replay and record for the scripted playthroughs (issue #290 part 2;
// strict replay, issue #302 slice A).
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
// or `callHaiku>defaultCallDetectionAPI`. That is the call's `kind`. The runner
// tells the harness which scenario step is running (setStep), and each call is
// filed under the step during which it started; a recording run stores that
// step on every exchange. A request is answered, in order of preference, by
//   1. an unused recording of its kind made in the same step — the step and the
//      kind pin the call, so its prompt may drift without losing its reply;
//   2. an unused recording with no step (written before steps were stored),
//      only when the request holds at least half of its words (MATCH_FLOOR);
//   3. outside strict mode, an unused recording of another step, on the same
//      floor (a background call that started late);
// and among several, the one whose user message the request shares the most
// words with (ties: the earliest — reported as AMBIGUOUS). The floor exists so
// a call nothing was recorded for can't take the reply meant for a later call
// of its kind. A call with no recording gets a neutral stub reply (narrator
// prose with an empty fact block, "{}" for a JSON helper) and is reported as
// UNRECORDED. A recording whose system-prompt sections (normalised: entity
// ids and numbers ignored) no longer match the live request is reported as
// STALE: the prompt changed since it was recorded.
//
// Strict scenarios declare, per step, the calls the step must make (`calls`,
// each with an optional prompt contract) and the ones it may make
// (`optionalCalls`, plus the scenario's own list). checkStep() then fails a
// required call that never happened (MISSING), was answered by the stub
// (UNRECORDED), or lacks what its contract requires (CONTRACT), and a call
// nothing declared (UNEXPECTED). Drift that is not declared fails; drift that
// is declared is reported.
//
// Recorded replies are stored with the entity ids the model echoed back
// (`(id: …)` record headers in the prompt) replaced by the entity's name: ids
// differ in every fresh world, and the readers that take an id also accept the
// name (appendGenerativeTierUpdates).

import { createHash } from "node:crypto";

const ANTHROPIC_HOST = "api.anthropic.com";
const SIDECAR_SECTION = "## RESPONSE FORMAT — MANDATORY SIDECAR";
const NARRATOR_ROLE   = "## NARRATOR ROLE AND VOICE";
const PRIVATE_ROLE    = "You are the narrator running a private channel session.";
const STUB_PROSE      = "The narrator pauses (no recorded reply for this call).";
const MATCH_FLOOR     = 0.5;

/** The placeholder key the page holds; record mode swaps in the real one. */
export const PAGE_KEY = "sk-ant-playthrough-placeholder";

/** Calls made before the first step, and after the last. */
export const SETUP_STEP = "(setup)";
export const AFTER_STEP = "(after)";

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

/**
 * A heading as fingerprints compare it: entity ids and numbers differ between
 * worlds and sessions ("LAST SESSION (SESSION 3)", "… (id: Xy12…)"), so they
 * don't count as prompt changes.
 */
export function normalizeHeading(heading) {
  return String(heading ?? "").replace(/\(id:\s*[^)]*\)/gi, "(id)").replace(/\d+/g, "#").trim();
}

/** A short, stable fingerprint of a prompt's normalised section headings. */
export function promptFingerprint(headings) {
  return createHash("sha256").update(headings.map(normalizeHeading).join("\n")).digest("hex").slice(0, 12);
}

/**
 * What a recording's replies depend on — the seed, the pinned settings and
 * what each step does — hashed. Checks, call declarations and step ids are
 * left out: editing a check doesn't make a recording stale.
 */
export function scenarioRevision(scenario) {
  const steps = (scenario?.steps ?? []).map(({ then: _t, calls: _c, optionalCalls: _o, id: _i, ...rest }) => rest);
  const canonical = JSON.stringify({ seed: scenario?.seed ?? null, settings: scenario?.settings ?? null, steps }, sortedKeys);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

function sortedKeys(_key, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]]));
}

/** A step's id: its declared `id`, else its 1-based position. */
export const stepId = (step, index) => (typeof step?.id === "string" && step.id ? step.id : `step ${index + 1}`);

/** Problems with a scenario's strict declarations (empty when it can run). */
export function validateScenario(scenario) {
  const problems = [];
  if (scenario?.strict !== true) return problems;
  const ids = new Set();
  for (const [i, step] of (scenario.steps ?? []).entries()) {
    if (typeof step.id !== "string" || !step.id) problems.push(`step ${i + 1} (${step.do}) has no id — a strict scenario names every step`);
    else if (ids.has(step.id)) problems.push(`step id "${step.id}" is used twice`);
    else ids.add(step.id);
    for (const call of step.calls ?? []) {
      if (typeof call?.kind !== "string" || !call.kind.includes(">")) problems.push(`step "${step.id ?? i + 1}" declares a call without a kind like "caller>function"`);
    }
  }
  return problems;
}

/** Why a recording can't be replayed, or null. */
export function recordingProblem(recording, { strict = false } = {}) {
  if (!recording) return null;
  if (recording.passed === false) return "it was captured from a run that FAILED (passed: false) — re-record it";
  const exchanges = Array.isArray(recording.exchanges) ? recording.exchanges : [];
  if (strict && exchanges.some(x => typeof x.step !== "string")) {
    return "a strict scenario needs every exchange tagged with its step — re-record it";
  }
  return null;
}

/**
 * What a request's prompt must hold. `carries` / `lacks` name sections;
 * `section` maps a heading to text it must contain, `sectionLacks` to text it
 * must not; `contains` is text anywhere in the request. Returns the failures.
 */
export function requestContract(request, contract = {}) {
  const failures = [];
  const sectionOf = (heading) => findSection(request.system, heading) ?? findSection(request.user, heading);
  for (const heading of contract.carries ?? []) if (!sectionOf(heading)) failures.push(`lacks ${heading}`);
  for (const heading of contract.lacks ?? []) if (sectionOf(heading)) failures.push(`carries ${heading}`);
  for (const [heading, texts] of Object.entries(contract.section ?? {})) {
    const s = sectionOf(heading);
    if (!s) { failures.push(`lacks ${heading}`); continue; }
    for (const t of [].concat(texts)) if (!s.includes(t)) failures.push(`${heading} should say "${t}"`);
  }
  for (const text of contract.contains ?? []) {
    if (!`${request.system}\n${request.user}`.includes(text)) failures.push(`doesn't say "${text}"`);
  }
  for (const [heading, texts] of Object.entries(contract.sectionLacks ?? {})) {
    const s = sectionOf(heading) ?? "";
    for (const t of [].concat(texts)) if (s.includes(t)) failures.push(`${heading} should not say "${t}"`);
  }
  return failures;
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
 * @param {{ mode: "replay"|"record", recording?: object, apiKey?: string, strict?: boolean, log?: Function }} options
 */
export function createClaudeHarness({ mode, recording = null, apiKey = null, strict = false, log = console.log }) {
  if (mode === "record" && !apiKey) throw new Error("record mode needs ANTHROPIC_API_KEY");
  const exchanges = Array.isArray(recording?.exchanges) ? recording.exchanges : [];
  const used      = new Set();
  const recorded  = [];
  const requests  = [];
  const warnings  = [];
  let step         = SETUP_STEP;
  let pending      = 0;
  let lastActivity = Date.now();

  /** The best unused recording among `list` ({ x, i }), or null below `floor`. */
  function best(list, liveWords, floor) {
    let top = null;
    let tie = null;
    for (const c of list) {
      const score = containment(words(c.x.user), liveWords);
      if (!top || score > top.score) { top = { ...c, score }; tie = null; }
      else if (score === top.score && !tie) tie = c;
    }
    if (!top || top.score < floor) return null;
    return { ...top, ambiguous: tie ? `recordings #${top.i + 1} and #${tie.i + 1} match equally — took #${top.i + 1}` : null };
  }

  function match(kind, live, callStep) {
    const liveWords = words(live.user);
    const unused = exchanges.map((x, i) => ({ x, i })).filter(({ x, i }) => !used.has(i) && x.kind === kind);
    const hit = best(unused.filter(({ x }) => x.step === callStep), liveWords, 0)
      ?? best(unused.filter(({ x }) => typeof x.step !== "string"), liveWords, MATCH_FLOOR)
      ?? (strict ? null : best(unused.filter(({ x }) => typeof x.step === "string" && x.step !== callStep), liveWords, MATCH_FLOOR));
    if (!hit) return null;
    used.add(hit.i);
    const x = hit.x;
    if (Array.isArray(x.sections)) {
      const now     = sectionHeadings(live.system);
      const nowNorm = now.map(normalizeHeading);
      const wasNorm = x.sections.map(normalizeHeading);
      const added   = now.filter((_h, j) => !wasNorm.includes(nowNorm[j]));
      const removed = x.sections.filter((_h, j) => !nowNorm.includes(wasNorm[j]));
      if (added.length || removed.length) {
        const note = `STALE ${kind} (recording #${hit.i + 1}): sections +[${added.join(" | ")}] -[${removed.join(" | ")}] — re-record`;
        warnings.push(note);
        log(note);
      }
    }
    return { index: hit.i, exchange: x, ambiguous: hit.ambiguous };
  }

  async function forward({ url, headers, body }, live, entry) {
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
        const sections = sectionHeadings(live.system);
        recorded.push({
          step:        entry.step,
          kind:        entry.kind,
          model:       live.model,
          sections,
          fingerprint: promptFingerprint(sections),
          user:        live.user,
          response: {
            model:       data.model ?? live.model,
            content:     (data.content ?? []).map(c => (c?.type === "text" ? { ...c, text: replaceIds(c.text, ids) } : c)),
            stop_reason: data.stop_reason ?? "end_turn",
            usage:       data.usage ?? null,
          },
        });
      }
    } else {
      log(`record: ${entry.kind} → HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return { status: res.status, body: text };
  }

  async function answer(payload, client) {
    pending += 1;
    lastActivity = Date.now();
    const live = parseRequest(payload.body);
    const kind = callerKind(payload.stack);
    const entry = {
      n: requests.length + 1, client, step, kind, model: live.model, system: live.system, user: live.user,
      source: null, recordedStep: null, ambiguous: null,
    };
    requests.push(entry);
    try {
      if (!String(payload.url ?? "").includes(ANTHROPIC_HOST)) return { status: 400, body: "{}" };
      if (mode === "record") {
        entry.source = "live";
        return await forward(payload, live, entry);
      }
      const hit = match(kind, live, entry.step);
      if (hit) {
        entry.source = `recording #${hit.index + 1}`;
        entry.recordedStep = hit.exchange.step ?? null;
        entry.ambiguous = hit.ambiguous;
        if (hit.ambiguous) log(`AMBIGUOUS ${kind} in step "${entry.step}": ${hit.ambiguous}`);
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
      log(`UNRECORDED ${kind} (${client}, step "${entry.step}") — answered with the neutral stub`);
      return { status: 200, body: messageJson(stubText(live), live.model, entry.n) };
    } finally {
      pending -= 1;
      lastActivity = Date.now();
    }
  }

  return {
    mode,
    strict,
    requests,
    warnings,

    /** Hook a page before its first navigation. */
    async attach(page, client) {
      await page.exposeFunction("__sfcClaude", (payload) => answer(payload, client));
      await page.addInitScript(installClaudeBridge);
    },

    /** The step the calls starting from now belong to. */
    setStep(id) { step = id; },

    /** Wait until no call is in flight and none started for `quietMs`. */
    async idle({ quietMs = 2500, timeoutMs = 60_000 } = {}) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (pending === 0 && Date.now() - lastActivity >= quietMs) return true;
        await new Promise(r => setTimeout(r, 200));
      }
      return false;
    },

    /**
     * A step's calls against its declarations: `calls` (each required once,
     * with an optional contract), `optionalCalls`, and `alsoOptional` (the
     * scenario's list). Returns { failures, variations, calls }.
     */
    checkStep(id, { calls = [], optionalCalls = [] } = {}, alsoOptional = []) {
      const made = requests.filter(r => r.step === id);
      const left = [...made];
      const failures = [];
      const variations = [];
      for (const want of calls) {
        const j = left.findIndex(r => r.kind === want.kind);
        if (j < 0) {
          failures.push(`MISSING ${want.kind} — step "${id}" never made this call`);
          continue;
        }
        const r = left.splice(j, 1)[0];
        if (r.source === "stub") failures.push(`UNRECORDED ${want.kind} (call #${r.n}) — required by step "${id}", answered by the neutral stub`);
        for (const f of requestContract(r, want)) failures.push(`CONTRACT ${want.kind} (call #${r.n}) in step "${id}": ${f}`);
      }
      const optional = new Set([...optionalCalls, ...alsoOptional]);
      for (const r of left) {
        if (optional.has(r.kind)) variations.push(`OPTIONAL ${r.kind} (call #${r.n}) in step "${id}" — ${r.source}`);
        else failures.push(`UNEXPECTED ${r.kind} (call #${r.n}) in step "${id}" — not declared; answered by ${r.source}`);
      }
      for (const r of made) if (r.ambiguous) variations.push(`AMBIGUOUS ${r.kind} (call #${r.n}) in step "${id}": ${r.ambiguous}`);
      return { failures, variations, calls: made.map(r => `${r.kind}←${r.source}`) };
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
        .map((x, i) => ({ i, kind: x.kind, step: x.step }))
        .filter(({ i }) => !used.has(i))
        .map(({ i, kind, step: s }) => `#${i + 1} ${kind}${s ? ` (step "${s}")` : ""}`);
      return { mode, strict, calls: requests.length, byKind, unusedRecordings: mode === "replay" ? unused : [], warnings };
    },

    /** The recording a record run produced, with where it came from. */
    recordingOut({ scenario, scenarioFile, revision, passed, commit = null } = {}) {
      return {
        scenario,
        scenarioFile,
        scenarioRevision: revision ?? null,
        source:     "recorded",
        passed:     !!passed,
        strict,
        provenance: {
          recordedAt: new Date().toISOString(),
          commit,
          models:     [...new Set(recorded.map(x => x.response?.model ?? x.model).filter(Boolean))],
          runner:     "test/ci/playwright/playthrough.mjs",
        },
        exchanges:  recorded,
      };
    },
  };
}
