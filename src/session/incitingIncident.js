/**
 * STARFORGED COMPANION
 * src/session/incitingIncident.js — Envision an Inciting Incident.
 *
 * Rulebook "Begin your adventure", step 1: the inciting incident is the
 * dramatic opening event that launches the campaign and sets up the first vow.
 * The play kit envisions it via oracles; this module rolls an Action + Theme
 * spark ("Ask the Oracle — Spark an Idea") and routes it through the narrator,
 * grounded in the established World Truths / starting sector / local connection
 * / character, to compose the opening fiction plus a suggested starting vow.
 *
 * Surfaced as the ✦ Envision Inciting Incident button on the Session panel and
 * the `!incite` chat command (see src/ui/sessionPanel.js, src/index.js). Falls
 * back to an oracle-spark-only card when no Claude key is set or narration is
 * disabled, mirroring the Spotlight Vignette's oracle-only path.
 */

import { rollOracle } from "../oracles/roller.js";

const MODULE_ID = "starforged-companion";

/**
 * Roll the Action + Theme spark (the play-kit "Spark an Idea" pair).
 * @returns {{ action: string, theme: string }}
 */
export function rollIncitingSpark() {
  const safe = (id) => {
    try { return rollOracle(id)?.result ?? ""; }
    catch { return ""; }
  };
  return { action: safe("action"), theme: safe("theme") };
}

/**
 * Build the narrator user message. Pure (no Foundry/IO) so it's unit-testable.
 * The World Truths / sector / connection / character are injected by the
 * narrator system prompt (inciting_incident mode); the user message carries the
 * task framing + the oracle spark.
 *
 * @param {{ action: string, theme: string }} spark
 * @returns {string}
 */
export function buildIncitingIncidentUserMessage(spark) {
  return [
    `Envision the campaign's inciting incident — the dramatic opening event that`,
    `launches the campaign and sets up the character's first vow.`,
    ``,
    `Oracle spark (Ask the Oracle — Action + Theme), interpret loosely as inspiration:`,
    `- Action: ${spark?.action || "—"}`,
    `- Theme: ${spark?.theme || "—"}`,
  ].join("\n");
}

/**
 * Split a trailing `Suggested vow: <statement> (<rank>)` line off the narrator
 * prose. Returns `{ prose, vow }` where `vow` is null when no line is present.
 * Pure — used by the card renderer and unit-tested.
 *
 * @param {string} text
 * @returns {{ prose: string, vow: { statement: string, rank: string|null, raw: string } | null }}
 */
export function splitSuggestedVow(text) {
  const full = String(text ?? "");
  const m = full.match(/^[ \t>*_-]*Suggested vow:\s*(.+?)\s*$/im);
  if (!m) return { prose: full.trim(), vow: null };

  const vowLine = m[1].trim();
  const prose   = full.replace(m[0], "").trim();
  const rankMatch = vowLine.match(/\(([^)]+)\)\s*$/);
  const rank      = rankMatch ? rankMatch[1].trim().toLowerCase() : null;
  const statement = (rankMatch ? vowLine.replace(rankMatch[0], "") : vowLine).trim();
  return { prose, vow: { statement, rank, raw: vowLine } };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Render the inciting-incident chat-card HTML. Pure — separated from the
 * ChatMessage.create call so it can be unit-tested.
 *
 * @param {{ spark: {action,theme}, text: string|null, fallback?: boolean }} args
 * @returns {string}
 */
export function renderIncitingIncidentCard({ spark, text, fallback = false }) {
  const sparkLine =
    `<p class="sf-incite-spark"><strong>Spark (Action + Theme):</strong> ` +
    `${escapeHtml(spark?.action)} / ${escapeHtml(spark?.theme)}</p>`;

  let body;
  if (fallback || !text) {
    body = `${sparkLine}<p class="sf-incite-prompt"><em>Envision an inciting incident ` +
      `from this spark — the dramatic event that opens your campaign and sets up your ` +
      `first vow — then Swear an Iron Vow.</em></p>`;
  } else {
    const { prose, vow } = splitSuggestedVow(text);
    const proseHtml = prose
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p).replace(/\n+/g, " ")}</p>`)
      .join("");
    const vowHtml = vow
      ? `<p class="sf-incite-vow"><strong>Suggested vow:</strong> ${escapeHtml(vow.statement)}` +
        `${vow.rank ? ` <em>(${escapeHtml(vow.rank)})</em>` : ""}</p>`
      : "";
    body = `${sparkLine}${proseHtml}${vowHtml}`;
  }

  return `<div class="sf-incite-card"><strong>✦ Inciting Incident</strong>${body}</div>`;
}

/**
 * Post the inciting-incident chat card.
 *
 * When narrator prose is present, the card also carries the narrator-card
 * flag family (`narratorCard` / `narrationText` / `sessionId`) so the
 * opening fiction feeds the recent-narration ring and session recaps —
 * without these the campaign premise is invisible to every subsequent
 * narrator call (v1.7.8 playtest F7). `narrationText` is the prose only;
 * the suggested-vow line is mechanical, not fiction. Audited consumers:
 * correction/audio render hooks no-op (no button markup here);
 * burn-supersede requires a resolutionId.
 *
 * @param {{ spark, text, fallback, sessionId }} args
 */
export async function postIncitingIncidentCard(args) {
  const { text, fallback = false, sessionId = null } = args ?? {};
  const narratorFlags = (!fallback && text)
    ? {
        narratorCard:  true,
        narrationText: splitSuggestedVow(text).prose,
        sessionId,
      }
    : {};
  await globalThis.ChatMessage?.create?.({
    content: renderIncitingIncidentCard(args),
    flags:   { [MODULE_ID]: { incitingIncidentCard: true, ...narratorFlags } },
  });
}

/**
 * Orchestrate the full flow: roll the spark, ask the narrator to compose the
 * inciting incident (grounded in campaign context), and post the card. Falls
 * back to a spark-only card when the narrator returns nothing. Never throws.
 *
 * @param {Object} campaignState
 * @returns {Promise<{ spark: {action,theme}, text: string|null }>}
 */
export async function runIncitingIncident(campaignState) {
  const spark = rollIncitingSpark();

  let text = null;
  try {
    const { narrateIncitingIncident } = await import("../narration/narrator.js");
    const userMessage = buildIncitingIncidentUserMessage(spark);
    text = await narrateIncitingIncident({ userMessage, campaignState: campaignState ?? {} });
  } catch (err) {
    console.warn(`${MODULE_ID} | runIncitingIncident: narration failed:`, err?.message ?? err);
  }

  await postIncitingIncidentCard({
    spark,
    text,
    fallback:  !text,
    sessionId: campaignState?.currentSessionId ?? null,
  });
  return { spark, text };
}
