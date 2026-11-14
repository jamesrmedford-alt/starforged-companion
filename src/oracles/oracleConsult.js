/**
 * STARFORGED COMPANION
 * src/oracles/oracleConsult.js — Ask the Oracle about a planned subject
 * consults its plan (issue #353 Phase 3)
 *
 * A yes/no question about a subject the narrative skeleton holds a plan for
 * is rolled with odds set from the plan's truth, so the answer cannot
 * contradict it (decided, on every Mischief setting). One short Haiku call
 * reads the hidden truth against the question and names the odds; the d100
 * is rolled as always. Only a question whose subject a decided plan names is
 * consulted; any failure keeps the odds the player gave (fail-open).
 *
 * The yes/no is rolled on the client that typed `!oracle yes` (index.js
 * handleOracleCommand); the plans are the GM's, in a journal a player's
 * client cannot read. A GM's roll consults here directly. A player's asks the
 * canonical GM for the odds over the module socket (issue #354 P2-31:
 * requestPlanOdds → registerOracleConsultSocket → oddsFromPlan there) and gets
 * back the one word — never the plan, its truth or its id. No GM connected,
 * no answer in time, no plan: the odds the player gave stand.
 */

import { apiPost } from "../api-proxy.js";
import { listSkeletons, skeletonsEnabled } from "../world/secrets.js";
import { nameMentioned, sameQuestion } from "../world/skeletons.js";
import { isCanonicalGM } from "../multiplayer/gmGate.js";
import { hasActiveGM, GM_RELAY_SOCKET } from "../multiplayer/gmRelay.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_MODEL   = "claude-haiku-5-5";

/** The odds a consult may set, as rollYesNo names them. */
export const CONSULT_ODDS = Object.freeze(["small_chance", "unlikely", "50_50", "likely", "almost_certain"]);

const SYSTEM = [
  "You set the odds for an oracle's yes/no question in a tabletop roleplaying game.",
  "You are given what is secretly true about the question's subject, and the question.",
  "Answer with exactly one of: almost_certain, likely, 50_50, unlikely, small_chance —",
  "how likely the answer is YES given the truth. almost_certain when the truth says yes;",
  "small_chance when it says no; 50_50 when the truth does not bear on the question.",
  "Reply with the one word only.",
].join("\n");

/**
 * The decided plan a question is about: a mystery whose question it asks, or
 * a plan whose subject it names. Null for none.
 *
 * @param {string} question
 * @returns {Object|null}
 */
export function planForQuestion(question) {
  if (typeof question !== "string" || !question.trim() || !skeletonsEnabled()) return null;
  const decided = listSkeletons().filter(r => r.truth);
  return decided.find(r => r.kind === "mystery" && r.question && sameQuestion(r.question, question))
    // Under any name the subject goes by (its aliases — issue #354 P2-30).
    ?? decided.find(r => [r.subject.name, ...(r.aliases ?? [])].some(n => nameMentioned(n, question)))
    ?? null;
}

/**
 * The odds a question about a planned subject is rolled at, from its plan's
 * truth — or null to keep the player's (no plan, no key, a reply that names
 * no odds, any failure).
 *
 * @param {string} question
 * @param {{ apiKey?: string|null }} [opts] — the Claude key (the client's setting by default)
 * @returns {Promise<{ odds: string, planId: string }|null>}
 */
export async function oddsFromPlan(question, { apiKey = null } = {}) {
  const plan = planForQuestion(question);
  if (!plan) return null;
  let key = apiKey;
  if (!key) {
    try { key = globalThis.game?.settings?.get?.(MODULE_ID, "claudeApiKey") || null; } catch { key = null; }
  }
  if (!key) return null;
  try {
    const subject = plan.kind === "mystery" && plan.question ? `the answer to "${plan.question}"` : plan.subject.name;
    const data = await apiPost(ANTHROPIC_URL, {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01",
    }, {
      model:      HAIKU_MODEL,
      max_tokens: 40,
      system:     [{ type: "text", text: SYSTEM }],
      messages:   [{ role: "user", content: `What is true about ${subject}: ${plan.truth}\nQuestion: ${question}\nOdds:` }],
    }, { label: "oracleConsult" });
    const text = (data?.content ?? []).filter(b => b.type === "text").map(b => b.text).join("").toLowerCase();
    const odds = CONSULT_ODDS.find(o => text.includes(o)) ?? (/\b50\s*\/\s*50\b/.test(text) ? "50_50" : null);
    return odds ? { odds, planId: plan.id } : null;
  } catch (err) {
    console.warn(`${MODULE_ID} | oracle: consulting the plan failed — the odds given are kept:`, err?.message ?? err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A PLAYER'S QUESTION — the odds, from the canonical GM (issue #354 P2-31)
// ─────────────────────────────────────────────────────────────────────────────

/** The module-socket kinds of a player's ask and the GM's answer (not gmRelay actions: an answer comes back). */
export const CONSULT_ASK_KIND    = "oracleConsult.ask";
export const CONSULT_ANSWER_KIND = "oracleConsult.answer";

/**
 * How long a player's roll waits for the GM's odds. With no plan the GM
 * answers at once; with one, after a short Haiku call. Past this the odds the
 * player gave are rolled — the oracle is never held up by a GM who is away.
 */
export const CONSULT_WAIT_MS = 8_000;

/** The longest question taken over the socket. */
const QUESTION_MAX = 400;

const _waiting = new Map();   // ask id → resolve
let _socketInstalled = false;

function newAskId() {
  return globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 14);
}

/**
 * Install the consult listener on the module socket (idempotent; every
 * client, at ready — index.js). The canonical GM answers an ask with the
 * odds its plans set (oddsFromPlan), or none; the client that asked takes the
 * answer carrying its ask's id.
 */
export function registerOracleConsultSocket() {
  if (_socketInstalled) return;
  const socket = globalThis.game?.socket ?? null;
  if (!socket?.on) return;
  _socketInstalled = true;
  socket.on(GM_RELAY_SOCKET, async (message) => {
    if (message?.kind === CONSULT_ANSWER_KIND) {
      const resolve = typeof message.id === "string" ? _waiting.get(message.id) : null;
      if (resolve) resolve(CONSULT_ODDS.includes(message.odds) ? message.odds : null);
      return;
    }
    if (message?.kind !== CONSULT_ASK_KIND || !isCanonicalGM()) return;
    const id = typeof message.id === "string" && /^[\w-]{1,64}$/.test(message.id) ? message.id : null;
    if (!id) return;
    const question = typeof message.question === "string" ? message.question.slice(0, QUESTION_MAX) : "";
    const consulted = await oddsFromPlan(question).catch(() => null);
    // The odds only: the plan, its truth and its id stay on the GM's client.
    globalThis.game?.socket?.emit?.(GM_RELAY_SOCKET, { kind: CONSULT_ANSWER_KIND, id, odds: consulted?.odds ?? null });
  });
}

/**
 * The odds a player's yes/no is rolled at when its subject has a hidden
 * plan: asked of the canonical GM, whose client holds the plans. Null — the
 * odds the player gave stand — for no question, no GM connected, no plan, or
 * no answer within CONSULT_WAIT_MS. Never throws.
 *
 * @param {string} question
 * @param {{ waitMs?: number }} [opts]
 * @returns {Promise<string|null>} one of CONSULT_ODDS, or null
 */
export async function requestPlanOdds(question, { waitMs = CONSULT_WAIT_MS } = {}) {
  if (typeof question !== "string" || !question.trim()) return null;
  const socket = globalThis.game?.socket ?? null;
  if (!socket?.emit || !hasActiveGM()) return null;
  registerOracleConsultSocket();
  const id = newAskId();
  let timer = null;
  try {
    return await new Promise((resolve) => {
      _waiting.set(id, resolve);
      timer = setTimeout(() => resolve(null), Math.max(0, waitMs));
      socket.emit(GM_RELAY_SOCKET, { kind: CONSULT_ASK_KIND, id, question: question.slice(0, QUESTION_MAX) });
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | oracle: asking the GM for the odds failed — the odds given are kept:`, err?.message ?? err);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
    _waiting.delete(id);
  }
}

/** Test seam: forget the listener and any ask in flight. */
export function _resetOracleConsultForTests() {
  _socketInstalled = false;
  _waiting.clear();
}
