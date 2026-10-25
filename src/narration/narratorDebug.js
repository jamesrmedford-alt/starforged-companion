// src/narration/narratorDebug.js
// What the narrator was last sent (issue #290 part 1).
//
// callNarratorAPI (narrator.js) records every narrator request here — the
// system prompt, the user message, the model, the token cap and the narrator
// function that made it — with its response; applyNarratorSidecar adds the
// parsed fact block (the sidecar's new truths, state changes and scene frame).
// `!narrator debug` (GM only) whispers the GM a card of the last narration's
// request, split into its sections, and the fact block, for playtest reports.
//
// Kept in memory, in this browser only. A narration runs on one client (the
// canonical GM's, or a keyed player's when no keyed GM is connected), so the
// capture lives where the call was made, and a reload clears it. The Private
// Channel is not captured: it is one player's private conversation, and it
// calls the API itself.
//
// splitPromptSections is also what the Quench prompt-contract batch reads a
// captured request with.

const MODULE_ID = 'starforged-companion';

/** Requests kept, oldest first. */
const CAPTURE_LIMIT = 10;

/**
 * Narrator functions that run in the background after a card posts, not a
 * narration anyone read. `!narrator debug` details the last request that
 * isn't one of these, and lists them with the rest.
 */
const BACKGROUND_LABELS = new Set(['getRollingSessionSummary']);

/** Lines that split a prompt into sections: the `---` rule the system prompt joins its sections with, and a `## ` heading. */
const SECTION_RULE    = /^-{3,}\s*$/;
const SECTION_HEADING = /^##\s+\S/;

/** formatSafetyContext's heading for the Private Lines block (src/context/safety.js). */
const PRIVATE_LINES_HEADING = /^### PRIVATE LINES\b/;

const captures = [];
let nextCaptureId = 1;

/**
 * Record a narrator request as it is sent. Returns the capture, for
 * recordNarratorResponse.
 *
 * @param {{ label?: string|null, model?: string|null, maxTokens?: number|null, system?: string, user?: string }} request
 * @returns {Object}
 */
export function recordNarratorRequest({ label = null, model = null, maxTokens = null, system = '', user = '' } = {}) {
  const capture = {
    id:           nextCaptureId++,
    label:        label || 'narrator',
    model:        model ?? null,
    maxTokens:    maxTokens ?? null,
    at:           new Date().toISOString(),
    system:       String(system ?? ''),
    user:         String(user ?? ''),
    status:       'pending',
    error:        null,
    stopReason:   null,
    usage:        null,
    elapsedMs:    null,
    responseText: null,
    factBlock:    null,
  };
  captures.push(capture);
  if (captures.length > CAPTURE_LIMIT) captures.splice(0, captures.length - CAPTURE_LIMIT);
  return capture;
}

/**
 * Record what came back for a captured request: the response's text, stop
 * reason and token usage, or the error the call threw.
 *
 * @param {Object|null} capture — from recordNarratorRequest
 * @param {{ data?: Object|null, text?: string, elapsedMs?: number|null, error?: unknown }} [result]
 */
export function recordNarratorResponse(capture, { data = null, text = '', elapsedMs = null, error = null } = {}) {
  if (!capture) return;
  capture.elapsedMs = elapsedMs;
  if (error) {
    capture.status = 'error';
    capture.error  = String(error?.message ?? error);
    return;
  }
  capture.status       = text ? 'ok' : 'empty';
  capture.stopReason   = data?.stop_reason ?? null;
  capture.usage        = data?.usage ?? null;
  capture.responseText = text;
}

/**
 * Record the fact block parsed out of a narrator response, on the capture
 * whose response it was (matched by its text). A text no capture holds is
 * ignored.
 *
 * @param {string} rawText — the response text, as callNarratorAPI returned it
 * @param {{ sidecar?: Object|null, parseError?: unknown, skipped?: string|null }} [parsed]
 */
export function recordNarratorFactBlock(rawText, { sidecar = null, parseError = null, skipped = null } = {}) {
  if (typeof rawText !== 'string' || !rawText) return;
  const capture = [...captures].reverse().find(c => c.responseText === rawText);
  if (!capture) return;
  capture.factBlock = skipped
    ? { skipped }
    : { sidecar: sidecar ?? null, parseError: parseError ? String(parseError?.message ?? parseError) : null };
}

/**
 * Split a prompt into its sections: at each `---` rule (the system prompt's
 * section separator) and before each `## ` heading (the user messages and
 * the Private Channel's prompt). A section's heading is its first line,
 * without the `#`s; an entity card is a section of its own.
 *
 * @param {string} text
 * @returns {Array<{ heading: string, text: string }>}
 */
export function splitPromptSections(text) {
  const sections = [];
  let lines = [];
  const flush = () => {
    const body = lines.join('\n').trim();
    lines = [];
    if (!body) return;
    sections.push({ heading: body.split('\n', 1)[0].replace(/^#+\s*/, '').trim(), text: body });
  };
  for (const line of String(text ?? '').split('\n')) {
    if (SECTION_RULE.test(line)) { flush(); continue; }
    if (SECTION_HEADING.test(line)) flush();
    lines.push(line);
  }
  flush();
  return sections;
}

/**
 * True for a `!narrator` command (the card it posts carries
 * narratorDebugCard and never matches).
 *
 * @param {ChatMessage} message
 * @returns {boolean}
 */
export function isNarratorCommand(message) {
  if (message?.flags?.[MODULE_ID]?.narratorDebugCard) return false;
  return /^!narrator(\s|$)/i.test(message?.content?.trim() ?? '');
}

/**
 * `!narrator debug` — whisper this GM a card of the last narrator request
 * made from this browser. GM only. Runs on the typist's client
 * (RUN_ON.AUTHOR): the capture it shows is that client's.
 *
 * @param {ChatMessage} message
 * @returns {Promise<void>}
 */
export async function handleNarratorCommand(message) {
  if (!game.user?.isGM) {
    ui.notifications?.warn('Starforged Companion: !narrator debug is GM-only.');
    return;
  }
  const subcommand = String(message?.content ?? '').trim().replace(/^!narrator\s*/i, '').trim().toLowerCase();
  if (subcommand !== 'debug') {
    console.debug?.(`${MODULE_ID} | !narrator: unknown subcommand "${subcommand}" — showing the usage.`);
    ui.notifications?.info('Starforged Companion: usage — !narrator debug');
    return;
  }
  await ChatMessage.create({
    content: renderNarratorDebugCard(),
    whisper: game.user?.id ? [game.user.id] : [],
    flags:   { [MODULE_ID]: { narratorDebugCard: true } },
  });
}

/** The last capture that is a narration, not a background request; null when there is none. */
function latestNarration() {
  return [...captures].reverse().find(c => !BACKGROUND_LABELS.has(c.label)) ?? null;
}

function renderNarratorDebugCard() {
  const shown = latestNarration();
  const parts = ['<div class="sf-narrator-debug-card">', '<div class="sf-narrator-debug-label">◈ Narrator debug</div>'];
  if (!shown) {
    parts.push(
      '<p>This browser hasn&rsquo;t sent the narrator anything since it loaded. Narration runs in the browser of ' +
      'the GM who has a Claude key (or, when none is connected, of the player who typed) &mdash; run ' +
      '<code>!narrator debug</code> there, after the narration you want to see.</p>',
    );
  } else {
    parts.push(renderCapture(shown));
  }
  const earlier = [...captures].reverse().filter(c => c !== shown);
  if (earlier.length) {
    parts.push(
      '<h4>Earlier in this browser</h4>',
      `<ul class="sf-narrator-debug-earlier">${earlier.map(renderEarlier).join('')}</ul>`,
    );
  }
  parts.push(
    '<p class="sf-narrator-debug-note">Captured in this browser since it loaded &mdash; a narration that ran in ' +
    'another browser isn&rsquo;t shown. Private Lines are counted, not shown.</p>',
    '</div>',
  );
  return parts.join('');
}

function renderCapture(c) {
  const meta = [
    `<strong>${escapeHtml(c.label)}</strong>`,
    c.model ? escapeHtml(c.model) : null,
    escapeHtml(timeOf(c.at)),
    c.maxTokens ? `cap ${formatNumber(c.maxTokens)} tokens` : null,
    statusText(c),
    Number.isFinite(c.elapsedMs) ? `${formatNumber(c.elapsedMs)} ms` : null,
  ].filter(Boolean).join(' · ');
  const usage = formatUsage(c.usage);
  return [
    `<p class="sf-narrator-debug-meta">${meta}</p>`,
    usage ? `<p class="sf-narrator-debug-meta">${escapeHtml(usage)}</p>` : '',
    renderSections('System prompt', c.system),
    renderSections('User message', c.user),
    '<h4>Fact block</h4>',
    renderFactBlock(c),
    c.responseText
      ? `<details><summary>Response, as received</summary><pre>${escapeHtml(c.responseText)}</pre></details>`
      : '',
  ].join('');
}

function renderSections(title, text) {
  const sections = splitPromptSections(redactPrivateLines(text));
  const total = estimateTokens(text);
  const items = sections.map(s =>
    `<li><details><summary>${escapeHtml(clip(s.heading, 80))} ` +
    `<span class="sf-narrator-debug-size">~${formatNumber(estimateTokens(s.text))}</span></summary>` +
    `<pre>${escapeHtml(s.text)}</pre></details></li>`).join('');
  return `<h4>${escapeHtml(title)} — ${sections.length} section${sections.length === 1 ? '' : 's'}, ` +
    `~${formatNumber(total)} tokens</h4><ol class="sf-narrator-debug-sections">${items}</ol>`;
}

function renderFactBlock(c) {
  const fb = c.factBlock;
  if (c.status === 'pending') return '<p>Waiting for the response.</p>';
  if (c.status === 'error')   return `<p>No response: ${escapeHtml(c.error ?? 'the call failed')}.</p>`;
  if (!fb)                    return '<p>None &mdash; this request doesn&rsquo;t ask for one.</p>';
  if (fb.skipped)             return `<p>Not read &mdash; ${escapeHtml(fb.skipped)}.</p>`;
  if (fb.parseError)          return `<p>Could not be read: ${escapeHtml(fb.parseError)}</p>`;
  if (!fb.sidecar)            return '<p>The response carried no fact block.</p>';
  return `<pre>${escapeHtml(JSON.stringify(fb.sidecar, null, 2))}</pre>`;
}

function renderEarlier(c) {
  const bits = [
    escapeHtml(timeOf(c.at)),
    `<strong>${escapeHtml(c.label)}</strong>${BACKGROUND_LABELS.has(c.label) ? ' (background)' : ''}`,
    `~${formatNumber(estimateTokens(c.system) + estimateTokens(c.user))} tokens`,
    statusText(c),
  ];
  return `<li>${bits.join(' · ')}</li>`;
}

function statusText(c) {
  if (c.status === 'pending') return 'waiting';
  if (c.status === 'error')   return 'failed';
  if (c.status === 'empty')   return 'empty response';
  return c.stopReason ? `stop: ${escapeHtml(c.stopReason)}` : 'answered';
}

function formatUsage(usage) {
  if (!usage || typeof usage !== 'object') return '';
  const n = (v) => formatNumber(Number(v) || 0);
  return `Tokens: ${n(usage.input_tokens)} in · ${n(usage.cache_read_input_tokens)} from cache · ` +
    `${n(usage.cache_creation_input_tokens)} cached · ${n(usage.output_tokens)} out`;
}

/**
 * Replace the Private Lines in a safety section with their count. The GM's
 * client sends every player's lines (decisions.md → "Private Lines in shared
 * narration"); the card is not a place to read them.
 */
function redactPrivateLines(text) {
  const out = [];
  let hiding = false;
  let hidden = 0;
  const closeHidden = () => {
    out.push(`(${hidden} private line${hidden === 1 ? '' : 's'} — not shown)`);
    hiding = false;
  };
  for (const line of String(text ?? '').split('\n')) {
    if (PRIVATE_LINES_HEADING.test(line)) {
      if (hiding) closeHidden();
      out.push(line);
      hiding = true;
      hidden = 0;
      continue;
    }
    if (hiding && /^\s*-\s/.test(line)) { hidden += 1; continue; }
    if (hiding) closeHidden();
    out.push(line);
  }
  if (hiding) closeHidden();
  return out.join('\n');
}

/** Cheap ~4-characters-per-token estimate, as narratorPrompt.js budgets the ledger. */
function estimateTokens(s) {
  return s ? Math.ceil(String(s).length / 4) : 0;
}

function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

function timeOf(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString();
}

function clip(s, max) {
  const str = String(s ?? '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Test seam: forget every capture. */
export function _resetNarratorDebugForTests() {
  captures.length = 0;
  nextCaptureId = 1;
}
