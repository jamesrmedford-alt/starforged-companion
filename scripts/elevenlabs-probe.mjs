#!/usr/bin/env node
/**
 * elevenlabs-probe.mjs — what ElevenLabs' live API accepts for Eleven v4.
 *
 * Issue #358, phase 0. ElevenLabs documents `eleven_v4_turbo` only on the
 * Text to Dialogue WebSocket, and `eleven_v4` on the HTTP speech endpoint
 * the module calls today (`src/audio/elevenlabs.js`). The docs do not say
 * whether v4 Turbo also works over HTTP, nor what a v4 model does with
 * `voice_settings.speed`. This asks the API itself:
 *
 *   models     GET  /v1/models                       what each model reports
 *   speech     POST /v1/text-to-speech/{voice_id}    the module's request
 *   dialogue   POST /v1/text-to-dialogue             the documented v4 route
 *   preflight  OPTIONS on both                       may a browser call them
 *   websocket  /v1/text-to-dialogue/stream-input     the documented Turbo route
 *
 * The Flash v2.5 request is the control: it is the module's request exactly.
 * When it fails, the key or the voice is at fault and nothing else is tried.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=… node scripts/elevenlabs-probe.mjs [--out <dir>]
 *
 * Environment:
 *   ELEVENLABS_API_KEY   required. Never printed.
 *   ELEVENLABS_VOICE_ID  the voice to speak with (default: the module's
 *                        default NPC voice).
 *   ELEVENLABS_API_BASE  another origin to ask — a local stand-in, when
 *                        working on this script.
 *
 * Writes <dir>/report.md (default dir: elevenlabs-probe-out) and each clip
 * it was sent, prints the report, and appends it to $GITHUB_STEP_SUMMARY
 * when that is set (.github/workflows/elevenlabs-probe.yml).
 *
 * Cost: eight short clips, about 700 characters of credit a run.
 * Needs Node 22 (global fetch and WebSocket). No dependencies.
 *
 * Exit status: 0 when the control passed and the report was written —
 * whatever the answers were; 1 when the key is missing or the control failed.
 */

import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";   // src/audio/elevenlabs.js DEFAULT_NPC_FEMININE_VOICE_ID
const OUTPUT_FORMAT    = "mp3_44100_128";
const MP3_BYTES_PER_S  = 128_000 / 8;
const REQUEST_TIMEOUT  = 60_000;
// Foundry's default address: the origin a self-hosted world's page has.
const PAGE_ORIGIN      = "http://localhost:30000";

const PLAIN_TEXT  = "They are already aboard. You did lock the airlock, did you not?";
const TAGGED_TEXT = "[whispers] They are already aboard. [dry amusement] You did lock the airlock, did you not?";

const MODELS_OF_INTEREST = ["eleven_flash_v2_5", "eleven_v3", "eleven_v4", "eleven_v4_turbo"];

// ---------------------------------------------------------------------------
// Arguments and environment
// ---------------------------------------------------------------------------

const args   = process.argv.slice(2);
const outArg = args.indexOf("--out");
const OUT    = outArg >= 0 && args[outArg + 1] ? args[outArg + 1] : "elevenlabs-probe-out";

const KEY     = (process.env.ELEVENLABS_API_KEY ?? "").trim();
const VOICE   = (process.env.ELEVENLABS_VOICE_ID ?? "").trim() || DEFAULT_VOICE_ID;
const BASE    = (process.env.ELEVENLABS_API_BASE ?? "").trim().replace(/\/+$/, "") || "https://api.elevenlabs.io";
const WS_BASE = BASE.replace(/^http/, "ws");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Text from the API, safe to print: the key (should it ever be echoed) removed, cut to length. */
function printable(text, max = 400) {
  let s = String(text ?? "");
  if (KEY) s = s.split(KEY).join("***");
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** An API error body as one line — its `detail.status: detail.message` when it has them. */
function errorLine(bodyText) {
  try {
    const json   = JSON.parse(bodyText);
    const detail = json?.detail ?? json;
    if (typeof detail === "string") return printable(detail);
    const status  = detail?.status ?? detail?.error ?? detail?.code ?? "";
    const message = detail?.message ?? detail?.msg ?? "";
    if (status || message) return printable([status, message].filter(Boolean).join(": "));
    return printable(JSON.stringify(json));
  } catch {
    return printable(bodyText);
  }
}

const ms      = n => `${Math.round(n)} ms`;
const seconds = bytes => `${(bytes / MP3_BYTES_PER_S).toFixed(1)} s`;
const cell    = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(r => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The requests
// ---------------------------------------------------------------------------

/**
 * One synthesis request over HTTP. Never throws: a network failure is a result.
 *
 * @returns {Promise<{ id, label, ok, status, contentType, bytes, headersMs, totalMs, allowOrigin, error, file }>}
 */
async function synth({ id, label, path, body }) {
  const result = { id, label, ok: false, status: 0, contentType: "", bytes: 0,
    headersMs: 0, totalMs: 0, allowOrigin: "", error: "", file: "" };
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}${path}?output_format=${OUTPUT_FORMAT}`, {
      method:  "POST",
      headers: {
        "xi-api-key":   KEY,
        "Content-Type": "application/json",
        "Accept":       "audio/mpeg",
        "Origin":       PAGE_ORIGIN,
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    result.headersMs   = performance.now() - started;
    result.status      = res.status;
    result.contentType = (res.headers.get("content-type") ?? "").split(";")[0];
    result.allowOrigin = res.headers.get("access-control-allow-origin") ?? "";
    const bytes = Buffer.from(await res.arrayBuffer());
    result.totalMs = performance.now() - started;
    if (res.ok && result.contentType.startsWith("audio/")) {
      result.ok    = true;
      result.bytes = bytes.length;
      result.file  = `${id}.mp3`;
      writeFileSync(join(OUT, result.file), bytes);
    } else {
      result.error = errorLine(bytes.toString("utf8")) || `HTTP ${res.status}`;
    }
  } catch (err) {
    result.totalMs = performance.now() - started;
    result.error   = printable(`${err?.name ?? "Error"}: ${err?.message ?? err}`);
  }
  return result;
}

/** What each model of interest reports about itself. */
async function listModels() {
  try {
    const res = await fetch(`${BASE}/v1/models`, {
      headers: { "xi-api-key": KEY },
      signal:  AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `HTTP ${res.status} — ${errorLine(text)}`, models: [] };
    const all    = JSON.parse(text);
    const wanted = (Array.isArray(all) ? all : []).filter(m =>
      MODELS_OF_INTEREST.includes(m?.model_id) || String(m?.model_id ?? "").startsWith("eleven_v4"));
    return { ok: true, error: "", models: wanted, total: Array.isArray(all) ? all.length : 0 };
  } catch (err) {
    return { ok: false, error: printable(`${err?.name ?? "Error"}: ${err?.message ?? err}`), models: [] };
  }
}

/** A browser's preflight for a POST with the module's headers. Sends no key and spends nothing. */
async function preflight(path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method:  "OPTIONS",
      headers: {
        "Origin":                         PAGE_ORIGIN,
        "Access-Control-Request-Method":  "POST",
        "Access-Control-Request-Headers": "content-type,xi-api-key",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
    await res.arrayBuffer().catch(() => null);
    return {
      path,
      status:       res.status,
      allowOrigin:  res.headers.get("access-control-allow-origin")  ?? "",
      allowMethods: res.headers.get("access-control-allow-methods") ?? "",
      allowHeaders: res.headers.get("access-control-allow-headers") ?? "",
      error:        "",
    };
  } catch (err) {
    return { path, status: 0, allowOrigin: "", allowMethods: "", allowHeaders: "",
      error: printable(`${err?.name ?? "Error"}: ${err?.message ?? err}`) };
  }
}

/**
 * One clip over the Text to Dialogue WebSocket, as a browser would have to
 * ask for it: no request headers, the key in the first message.
 */
function dialogueSocket({ id, modelId, text }) {
  return new Promise(resolve => {
    const result = { id, modelId, ok: false, opened: false, chunks: 0, bytes: 0,
      firstAudioMs: 0, totalMs: 0, final: false, error: "", file: "" };
    const started = performance.now();
    const parts   = [];
    let settled   = false;
    let socket;

    const finish = (error = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      result.totalMs = performance.now() - started;
      if (error && !result.error) result.error = error;
      result.ok = result.bytes > 0 && result.final && !result.error;
      if (result.bytes > 0) {
        result.file = `${id}.mp3`;
        writeFileSync(join(OUT, result.file), Buffer.concat(parts));
      }
      try { socket?.close(); } catch (err) { console.warn(`probe: closing the socket failed: ${err?.message ?? err}`); }
      resolve(result);
    };
    const deadline = setTimeout(() => finish(`no final message within ${REQUEST_TIMEOUT / 1000} s`), REQUEST_TIMEOUT);

    try {
      socket = new WebSocket(`${WS_BASE}/v1/text-to-dialogue/stream-input?model_id=${modelId}&output_format=${OUTPUT_FORMAT}`);
    } catch (err) {
      finish(printable(`${err?.name ?? "Error"}: ${err?.message ?? err}`));
      return;
    }

    socket.addEventListener("open", () => {
      result.opened = true;
      socket.send(JSON.stringify({ voices: [VOICE], xi_api_key: KEY }));
      socket.send(JSON.stringify({ inputs: [{ text, voice_id: VOICE, new_turn: false }] }));
      socket.send(JSON.stringify({ close_socket: true }));
    });
    socket.addEventListener("message", event => {
      let msg;
      try { msg = JSON.parse(typeof event.data === "string" ? event.data : Buffer.from(event.data).toString("utf8")); }
      catch { result.error = result.error || "a message that is not JSON"; return; }
      if (msg?.error || (msg?.message && msg?.code)) {
        result.error = printable([msg.error, msg.message, msg.code && `close code ${msg.code}`].filter(Boolean).join(" — "));
        return;
      }
      if (typeof msg?.audio === "string" && msg.audio.length) {
        const bytes = Buffer.from(msg.audio, "base64");
        if (!result.chunks) result.firstAudioMs = performance.now() - started;
        result.chunks += 1;
        result.bytes  += bytes.length;
        parts.push(bytes);
      }
      if (msg?.is_final === true) { result.final = true; finish(); }
    });
    socket.addEventListener("error", () => { result.error = result.error || "the connection failed"; });
    socket.addEventListener("close", event => {
      finish(result.final ? "" : `closed before the final message (code ${event?.code ?? "?"}${event?.reason ? `, ${printable(event.reason, 120)}` : ""})`);
    });
  });
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

function synthRow(r) {
  return [
    r.label,
    r.ok ? `**${r.status}** ${r.contentType}` : (r.status ? `**${r.status}**` : "no response"),
    r.ok ? `${r.bytes.toLocaleString("en-US")} bytes, about ${seconds(r.bytes)}` : "—",
    r.status ? `${ms(r.headersMs)} / ${ms(r.totalMs)}` : "—",
    r.status ? (r.allowOrigin || "none") : "—",
    r.ok ? "" : r.error,
  ];
}

function verdicts({ speech, dialogue, socket, flights }) {
  const by = id => [...speech, ...dialogue].find(r => r.id === id);
  const lines = [];

  const turboSpeech   = by("speech-v4-turbo");
  const turboDialogue = by("dialogue-v4-turbo");
  if (turboSpeech?.ok) {
    lines.push("**Transport: case A.** The speech endpoint the module already calls accepts `eleven_v4_turbo`. No new transport is needed.");
  } else if (turboDialogue?.ok) {
    const flight  = flights.find(f => f.path === "/v1/text-to-dialogue");
    const browser = flight?.allowOrigin ? "its preflight answers a browser" : "its preflight does **not** answer a browser — check before relying on it";
    lines.push(`**Transport: case B.** The speech endpoint refuses \`eleven_v4_turbo\`; the dialogue endpoint accepts it (${browser}).`);
  } else if (socket?.ok) {
    lines.push("**Transport: case C.** Neither HTTP endpoint accepts `eleven_v4_turbo`; the Text to Dialogue WebSocket does, with the key in the first message.");
  } else {
    lines.push("**Transport: none.** No route produced a v4 Turbo clip on this key. The errors are in the tables.");
  }
  if (turboSpeech?.ok || turboDialogue?.ok) {
    lines.push(socket?.ok
      ? "The WebSocket works as well."
      : `The WebSocket did not produce a clip: ${socket?.error || "no audio"}.`);
  }

  const v4 = by("speech-v4");
  lines.push(v4?.ok
    ? "**Plain v4:** the speech endpoint accepts `eleven_v4`, as documented."
    : `**Plain v4:** the speech endpoint refused \`eleven_v4\`: ${v4?.error || "no response"}.`);

  for (const [plainId, fastId, name] of [["speech-v4-turbo", "speech-v4-turbo-speed", "v4 Turbo"], ["speech-v4", "speech-v4-speed", "v4"]]) {
    const plain = by(plainId);
    const fast  = by(fastId);
    if (!plain?.ok) continue;
    if (fast?.ok) {
      lines.push(`**Speed on ${name}:** a request with \`speed: 1.2\` is accepted. Its clip runs about ${seconds(fast.bytes)} against ${seconds(plain.bytes)} without it — two takes of one line differ anyway, so only a clear gap means the setting is applied.`);
    } else {
      lines.push(`**Speed on ${name}:** a request with \`speed: 1.2\` is refused: ${fast?.error || "no response"}.`);
    }
  }
  return lines;
}

function buildReport({ header, models, control, speech, dialogue, flights, socket }) {
  const out = ["## ElevenLabs probe — Eleven v4 (issue #358, phase 0)", "", ...header, ""];

  if (!control) return out.join("\n");

  if (!control.ok) {
    out.push(
      "### The control failed",
      "",
      `The module's own request (Flash v2.5, the voice \`${VOICE}\`) did not return a clip: ${control.status ? `HTTP ${control.status} — ` : ""}${control.error}`,
      "",
      "So the key or the voice is at fault, and nothing was asked about v4. Check that the key may use Text to Speech and that the voice is in the account's library (the workflow takes another voice ID).",
    );
    return out.join("\n");
  }

  out.push("### Findings", "", ...verdicts({ speech, dialogue, socket, flights }).map(l => `- ${l}`), "");

  out.push("### What the models report", "");
  if (models.ok && models.models.length) {
    out.push(table(
      ["Model", "Text to speech", "Characters per request", "Cost multiplier", "Concurrency group", "Style", "Speaker boost", "Alpha access"],
      models.models.map(m => [
        `\`${m.model_id}\``,
        m.can_do_text_to_speech ?? "—",
        m.maximum_text_length_per_request ?? "—",
        m.model_rates?.character_cost_multiplier ?? "—",
        m.concurrency_group ?? "—",
        m.can_use_style ?? "—",
        m.can_use_speaker_boost ?? "—",
        m.requires_alpha_access ?? "—",
      ]),
    ));
    const missing = MODELS_OF_INTEREST.filter(id => !models.models.some(m => m.model_id === id));
    if (missing.length) out.push("", `Not in the list of ${models.total}: ${missing.map(id => `\`${id}\``).join(", ")}.`);
  } else {
    out.push(models.ok ? `None of the models asked about is in the list of ${models.total}.` : `The model list could not be read: ${models.error}`);
  }

  const synthHeaders = ["Request", "Answer", "Clip", "Headers / whole clip", "`Access-Control-Allow-Origin`", "Error"];
  out.push("", "### The speech endpoint — `POST /v1/text-to-speech/{voice_id}`", "",
    table(synthHeaders, [control, ...speech].map(synthRow)));
  out.push("", "### The dialogue endpoint — `POST /v1/text-to-dialogue`", "",
    table(synthHeaders, dialogue.map(synthRow)));

  out.push("", `### May a browser call them — preflight from \`${PAGE_ORIGIN}\``, "",
    table(["Endpoint", "Answer", "Allow-Origin", "Allow-Methods", "Allow-Headers"],
      flights.map(f => [`\`${f.path}\``, f.status ? `**${f.status}**` : f.error, f.allowOrigin || "none", f.allowMethods || "none", f.allowHeaders || "none"])));

  out.push("", "### The Text to Dialogue WebSocket — `eleven_v4_turbo`, the key in the first message", "",
    table(["Opened", "Clip", "First audio / closed", "Chunks", "Final message", "Error"], [[
      socket.opened ? "yes" : "no",
      socket.bytes ? `${socket.bytes.toLocaleString("en-US")} bytes, about ${seconds(socket.bytes)}` : "—",
      socket.bytes ? `${ms(socket.firstAudioMs)} / ${ms(socket.totalMs)}` : `— / ${ms(socket.totalMs)}`,
      socket.chunks,
      socket.final ? "yes" : "no",
      socket.error,
    ]]));

  out.push("",
    "### How to read this",
    "",
    `- Every request spoke the same line in the voice \`${VOICE}\`. The v4 requests carry two audio tags (\`[whispers]\`, \`[dry amusement]\`); the Flash request carries none.`,
    "- Times are from the machine that ran the probe, one request each. They compare the routes with one another; they are not what a player's browser will see.",
    "- A clip's length is worked out from its size at 128 kbps.",
    "- The clips are in the run's `elevenlabs-probe` artifact. Listen for whether a tag is followed, read aloud, or turned into a sound.",
  );
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function publish(report) {
  writeFileSync(join(OUT, "report.md"), `${report}\n`);
  console.log(report);
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    try { appendFileSync(summary, `${report}\n`); }
    catch (err) { console.warn(`probe: could not write the step summary: ${err?.message ?? err}`); }
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const header = [`Asked \`${new URL(BASE).host}\` on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`];

  if (!KEY) {
    publish(buildReport({ header: [...header, "",
      "**No key.** `ELEVENLABS_API_KEY` is empty, so nothing was asked. In GitHub Actions it is a repository secret (Settings → Secrets and variables → Actions); a pull request from a fork is given no secrets."] }));
    return 1;
  }
  if (typeof WebSocket !== "function") {
    publish(buildReport({ header: [...header, "", "**Node 22 is needed** — this Node has no global `WebSocket`."] }));
    return 1;
  }

  const speechPath   = `/v1/text-to-speech/${encodeURIComponent(VOICE)}`;
  const dialoguePath = "/v1/text-to-dialogue";

  // The control first: the module's request, byte for byte (src/audio/elevenlabs.js synthesise).
  const control = await synth({
    id: "speech-flash", label: "`eleven_flash_v2_5`, no tags, `speed: 1` — the module's request today",
    path: speechPath,
    body: { text: PLAIN_TEXT, model_id: "eleven_flash_v2_5", voice_settings: { speed: 1 } },
  });
  if (!control.ok) {
    publish(buildReport({ header, control }));
    return 1;
  }

  const models = await listModels();

  // One after another: the timings are compared, and a free plan allows few requests at once.
  const speech = [];
  for (const spec of [
    { id: "speech-v4-turbo",       label: "`eleven_v4_turbo`, tags, no voice settings",
      body: { text: TAGGED_TEXT, model_id: "eleven_v4_turbo" } },
    { id: "speech-v4-turbo-speed", label: "`eleven_v4_turbo`, tags, `speed: 1.2`",
      body: { text: TAGGED_TEXT, model_id: "eleven_v4_turbo", voice_settings: { speed: 1.2 } } },
    { id: "speech-v4",             label: "`eleven_v4`, tags, no voice settings",
      body: { text: TAGGED_TEXT, model_id: "eleven_v4" } },
    { id: "speech-v4-speed",       label: "`eleven_v4`, tags, `speed: 1.2`",
      body: { text: TAGGED_TEXT, model_id: "eleven_v4", voice_settings: { speed: 1.2 } } },
  ]) speech.push(await synth({ ...spec, path: speechPath }));

  const dialogue = [];
  for (const modelId of ["eleven_v4_turbo", "eleven_v4"]) {
    dialogue.push(await synth({
      id: `dialogue-${modelId === "eleven_v4" ? "v4" : "v4-turbo"}`, label: `\`${modelId}\`, tags, one input`,
      path: dialoguePath,
      body: { model_id: modelId, inputs: [{ text: TAGGED_TEXT, voice_id: VOICE }] },
    }));
  }

  const flights = [await preflight(speechPath), await preflight(dialoguePath)];
  const socket  = await dialogueSocket({ id: "websocket-v4-turbo", modelId: "eleven_v4_turbo", text: TAGGED_TEXT });

  publish(buildReport({ header, models, control, speech, dialogue, flights, socket }));
  return 0;
}

main().then(
  code => { process.exitCode = code; },
  err  => { console.error(`probe: ${printable(err?.stack ?? err, 2000)}`); process.exitCode = 1; },
);
