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

/** Clock sizes the foundry-ironsworn progress sheet supports. */
const VALID_CLOCK_SEGMENTS = [4, 6, 8, 10, 12];

/**
 * Split a trailing `Suggested clock: <label> (<N> segments)` line off the
 * narrator prose (Cluster B / F4). Returns `{ prose, clock }` where `clock`
 * is `{ label, segments }` or null when no line is present. Segment counts
 * are snapped to the nearest sheet-supported size (4/6/8/10/12); a line
 * without a parseable count yields null (no clock is better than a wrong
 * one). Pure — unit-tested.
 *
 * @param {string} text
 * @returns {{ prose: string, clock: { label: string, segments: number } | null }}
 */
export function splitSuggestedClock(text) {
  const full = String(text ?? "");
  const m = full.match(/^[ \t>*_-]*Suggested clock:\s*(.+?)\s*$/im);
  if (!m) return { prose: full.trim(), clock: null };

  const prose     = full.replace(m[0], "").trim();
  const line      = m[1].trim();
  const segsMatch = line.match(/\((\d+)\s*segments?\)\s*$/i);
  if (!segsMatch) return { prose, clock: null };

  const requested = Number(segsMatch[1]);
  if (!Number.isFinite(requested) || requested <= 0) return { prose, clock: null };
  const segments = VALID_CLOCK_SEGMENTS.reduce((best, s) =>
    Math.abs(s - requested) < Math.abs(best - requested) ? s : best,
  VALID_CLOCK_SEGMENTS[0]);

  const label = line.replace(segsMatch[0], "").trim();
  if (!label) return { prose, clock: null };
  return { prose, clock: { label, segments } };
}

/**
 * Split a trailing `Vow target: <Name> — <description>` line off the
 * narrator prose (Cluster B / F3). Returns `{ prose, target }` where
 * `target` is `{ name, description }` or null. The name/description divider
 * accepts an em dash, en dash, or spaced hyphen; a line with no divider is
 * treated as a bare name. Pure — unit-tested.
 *
 * @param {string} text
 * @returns {{ prose: string, target: { name: string, description: string } | null }}
 */
export function splitVowTarget(text) {
  const full = String(text ?? "");
  const m = full.match(/^[ \t>*_-]*Vow target:\s*(.+?)\s*$/im);
  if (!m) return { prose: full.trim(), target: null };

  const prose = full.replace(m[0], "").trim();
  const line  = m[1].trim();
  const div   = line.match(/\s*(?:—|–|:|\s-\s)\s*/);
  if (!div) {
    return { prose, target: line ? { name: line, description: "" } : null };
  }
  const name        = line.slice(0, div.index).trim();
  const description = line.slice(div.index + div[0].length).trim();
  if (!name) return { prose, target: null };
  return { prose, target: { name, description } };
}

/**
 * Run all three trailing-line parsers (target, clock, vow — order-agnostic
 * since each is line-anchored) and return the cleaned prose plus the full
 * structured proposal. This is what the card renderer and the swear-vow
 * click handler consume.
 *
 * @param {string} text
 * @returns {{ prose: string,
 *             vow:    { statement, rank, raw } | null,
 *             clock:  { label, segments }      | null,
 *             target: { name, description }    | null }}
 */
export function splitIncitingMeta(text) {
  const t = splitVowTarget(text);
  const c = splitSuggestedClock(t.prose);
  const v = splitSuggestedVow(c.prose);
  return { prose: v.prose, vow: v.vow, clock: c.clock, target: t.target };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Render the inciting-incident chat-card HTML. Pure — separated from the
 * ChatMessage.create call so it can be unit-tested.
 *
 * When narrator prose is present the structured proposal (vow / clock /
 * target) renders beneath it with a ⚔ Swear this vow button (Cluster B:
 * F2 + F3 + F4). `sworn: true` renders the post-click state instead of the
 * button — used by the click handler's in-place card rewrite.
 *
 * @param {{ spark: {action,theme}, text: string|null, fallback?: boolean,
 *           sworn?: boolean }} args
 * @returns {string}
 */
export function renderIncitingIncidentCard({ spark, text, fallback = false, sworn = false }) {
  const sparkLine =
    `<p class="sf-incite-spark"><strong>Spark (Action + Theme):</strong> ` +
    `${escapeHtml(spark?.action)} / ${escapeHtml(spark?.theme)}</p>`;

  let body;
  if (fallback || !text) {
    body = `${sparkLine}<p class="sf-incite-prompt"><em>Envision an inciting incident ` +
      `from this spark — the dramatic event that opens your campaign and sets up your ` +
      `first vow — then Swear an Iron Vow.</em></p>`;
  } else {
    const { prose, vow, clock, target } = splitIncitingMeta(text);
    const proseHtml = prose
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(p).replace(/\n+/g, " ")}</p>`)
      .join("");
    const vowHtml = vow
      ? `<p class="sf-incite-vow"><strong>Suggested vow:</strong> ${escapeHtml(vow.statement)}` +
        `${vow.rank ? ` <em>(${escapeHtml(vow.rank)})</em>` : ""}` +
        `${clock ? `<br><span class="sf-incite-clock">⏱ ${escapeHtml(clock.label)} — ` +
          `${clock.segments}-segment clock</span>` : ""}</p>`
      : "";

    let actionHtml = "";
    if (vow) {
      const creates = [
        "the vow on your character sheet",
        ...(clock  ? [`a ${clock.segments}-segment clock on it`] : []),
        ...(target ? [`<strong>${escapeHtml(target.name)}</strong> as a connection`] : []),
      ].join(" · ");
      actionHtml = sworn
        ? `<p class="sf-incite-sworn">✓ <em>Vow sworn.</em></p>`
        : `<div class="sf-incite-actions">` +
          `<button type="button" class="sf-swear-vow-btn" data-action="sf-swear-vow">` +
          `⚔ Swear this vow</button>` +
          `<span class="sf-incite-hint">Creates ${creates}.</span>` +
          `</div>`;
    }
    // Audio controls — the card already carries narratorCard + narrationText
    // (set in postIncitingIncidentCard), so the audio render hook plays the
    // prose once these buttons are present.
    const audioFooter =
      `<div class="sf-narration-footer">` +
      `<button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden><i class="fas fa-play"></i> Play</button>` +
      `<button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden><i class="fas fa-stop"></i> Stop</button>` +
      `</div>`;
    body = `${sparkLine}${proseHtml}${audioFooter}${vowHtml}${actionHtml}`;
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
  let narratorFlags = {};
  if (!fallback && text) {
    const meta = splitIncitingMeta(text);
    narratorFlags = {
      narratorCard:  true,
      narrationText: meta.prose,
      sessionId,
      // Structured proposal for the ⚔ Swear this vow click handler — the
      // handler reads flags, never re-parses card HTML (Cluster B).
      incitingMeta: { vow: meta.vow, clock: meta.clock, target: meta.target },
    };
  }
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

  // Capture the premise as campaign-level canon (PLAYTEST-1712 S). Without a
  // durable home the opening fiction lived only in the recent-narration ring
  // (last 3 cards) and scene-scoped sceneTruths (cleared at scene end), so it
  // aged out within a session and the narrator drifted on its load-bearing
  // facts. narratorPrompt injects this record into EVERY call as canon.
  // campaignState flows here by reference from narrateIncitingIncident →
  // applyNarratorSidecar, which already persisted the sidecar writes onto this
  // same object; we add the premise and persist the superset. GM-gated.
  if (text && campaignState && globalThis.game?.user?.isGM) {
    try {
      const meta = splitIncitingMeta(text);
      campaignState.incitingIncident = {
        prose:         meta.prose,
        spark,
        vow:           meta.vow,
        clock:         meta.clock,
        target:        meta.target,
        sessionId:     campaignState?.currentSessionId ?? null,
        establishedAt: new Date().toISOString(),
      };
      await globalThis.game?.settings?.set?.(MODULE_ID, "campaignState", campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | runIncitingIncident: premise persist failed:`, err?.message ?? err);
    }
  }

  await postIncitingIncidentCard({
    spark,
    text,
    fallback:  !text,
    sessionId: campaignState?.currentSessionId ?? null,
  });

  // Capture entities the opening fiction invented (e.g. a new faction) into the
  // World Journal / Entities review. The inciting path does NOT go through the
  // move pipeline's post-narration detection, so run the same detection the
  // paced-narrative path uses. GM-gated; fail-open. (Playtest: the "Velvet
  // Knife" faction was invented in the inciting prose but never recorded until
  // it happened to recur in a later move.)
  if (text && globalThis.game?.user?.isGM) {
    try {
      const { runPacedDetection } = await import("../narration/narrator.js");
      const { prose } = splitIncitingMeta(text);
      await runPacedDetection(prose, campaignState ?? {});
    } catch (err) {
      console.warn(`${MODULE_ID} | runIncitingIncident: entity detection failed:`, err?.message ?? err);
    }
  }

  return { spark, text };
}
