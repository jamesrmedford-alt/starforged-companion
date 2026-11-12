/**
 * STARFORGED COMPANION
 * src/private-channel/narrate.js — the private-channel narrator call
 *
 * Wraps buildPrivateContext + the Anthropic call so the send flow is testable
 * apart from the window DOM. Always Haiku (issue #226 (Private Channel) §4: short,
 * frequent exchanges — throughput/cost over peak quality), with the cacheable
 * system prefix marked for prompt caching. All Anthropic traffic goes through
 * src/api-proxy.js per the CLAUDE.md architecture constraint.
 *
 * Returns a result object — never throws — so the window can show a precise
 * error banner: { ok:true, text } | { ok:false, reason: "x-card"|"no-key"|
 * "no-character"|"empty"|"error"|"stale", error? } — "stale": this page lost
 * its connection to the server and has not reloaded (STALE-PLAYER-PAGE).
 *
 * While the X-Card is in play the private narrator stands down like every
 * narrator entry point (decisions.md "X-Card: anyone plays it, a GM resumes
 * it"; issue #321 U09): on entry, and again when the reply returns — a reply
 * written while the card was played is discarded unshown.
 */

import { apiPost } from "../api-proxy.js";
import { buildPrivateContext } from "./context.js";
import { isXCardActive, watchXCard } from "../narration/narrator.js";
import { pageIsStale } from "../multiplayer/connectionWatch.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL   = "claude-haiku-5-5";
const MAX_TOKENS    = 800;   // was 600 — Haiku 5.5 counts the same text as about 30% more tokens than Haiku 4.5

function readApiKey() {
  try { return game.settings?.get?.(MODULE_ID, "claudeApiKey") || null; }
  catch { return null; }
}

/**
 * Run one private-channel turn.
 *
 * @param {object} args — forwarded to buildPrivateContext
 * @returns {Promise<{ok:boolean, text?:string, reason?:string, error?:unknown}>}
 */
export async function requestPrivateNarration(args) {
  if (isXCardActive(args?.campaignState)) return { ok: false, reason: "x-card" };
  // A page whose connection dropped may lack an X-Card played meanwhile: no
  // turn until it reloads (STALE-PLAYER-PAGE) — refused before the call,
  // which the X-Card watch would discard anyway.
  if (pageIsStale()) return { ok: false, reason: "stale" };
  const xCard = watchXCard(args?.campaignState);

  const apiKey = readApiKey();
  if (!apiKey) return { ok: false, reason: "no-key" };

  let packet;
  try {
    packet = await buildPrivateContext(args);
  } catch (err) {
    // buildPrivateContext throws only when no active character resolves.
    console.warn(`${MODULE_ID} | privateChannel: context build failed:`, err?.message ?? err);
    return { ok: false, reason: "no-character", error: err };
  }

  const body = {
    model:      HAIKU_MODEL,
    max_tokens: MAX_TOKENS,
    system:     [{ type: "text", text: packet.system, cache_control: { type: "ephemeral" } }],
    messages:   [{ role: "user", content: packet.user }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-beta":    "prompt-caching-2024-07-31",
  };

  let data;
  try {
    data = await apiPost(ANTHROPIC_URL, headers, body);
  } catch (err) {
    console.warn(`${MODULE_ID} | privateChannel: narrator call failed:`, err?.message ?? err);
    return { ok: false, reason: "error", error: err };
  }
  if (xCard.interrupted("requestPrivateNarration")) return { ok: false, reason: "x-card" };

  const text = (data?.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
  if (!text) return { ok: false, reason: "empty" };
  return { ok: true, text };
}
