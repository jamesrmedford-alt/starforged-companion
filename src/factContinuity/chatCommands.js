/**
 * STARFORGED COMPANION
 * src/factContinuity/chatCommands.js — `!truth` / `!state` correction commands
 *
 * fact-continuity scope §10.3 (issue #227). Grammar:
 *   !truth strike <id-prefix>
 *   !truth set <subject> <fact-text>
 *   !state strike <subject> <attribute>
 *   !state set <subject> <attribute>=<value>
 *
 * Subjects accepted as bare words ("Vance", "scene") or as quoted strings
 * for multi-word subjects ("\"Covenant officer\"", "\"cargo bay\""). For
 * !state set, the attribute and value are separated by an unquoted `=`.
 *
 * Multiplayer split (2026-10 audit)
 * ---------------------------------
 * The ledgers live in campaignState (world-scoped — GM-only writes). The
 * command used to run on every connected client; a player's correction only
 * landed because the GM's client re-ran it — with the GM's permissions, so a
 * player could strike a GM-authored truth. Now:
 *   - handleFactContinuityCommand() runs on the AUTHORING client only: it
 *     checks the master toggle and the syntax locally (usage warnings stay on
 *     the typist's screen), then relays the raw text to the canonical GM via
 *     requestGmAction("factContinuity.command", { text }).
 *   - applyFactContinuityCommand() runs on the canonical GM and builds the
 *     permission context from the REQUESTER (ctx.requesterIsGM), never from
 *     game.user — on the relay path that is the GM's own user.
 */

import { collectAllEntities } from "../context/relevanceResolver.js";
import {
  strikeTruth,
  setTruth,
  strikeStateValue,
  setStateValue,
  resolveSubject,
  subjectKey,
} from "./ledgers.js";
import { requestGmAction } from "../multiplayer/gmRelay.js";
import { propagateRetraction } from "./retractions.js";

const MODULE_ID = "starforged-companion";

const USAGE_ALL = 'Usage: !truth strike <id> | !truth set <subject> <fact> | !state strike <subject> <attribute> | !state set <subject> <attribute>=<value>';

/**
 * Pure parser — validates the command's shape without touching state.
 *
 * @param {string} text
 * @returns {{ ok: true, domain: "truth"|"state", verb: "strike"|"set",
 *             rest: string, subject?: string, fact?: string,
 *             attribute?: string, value?: string }
 *          | { ok: false, usage: string }}
 */
export function parseFactContinuityCommand(text) {
  const verbMatch = /^!(truth|state)\s+(strike|set)\s+(.*)$/i.exec(String(text ?? "").trim());
  if (!verbMatch) return { ok: false, usage: USAGE_ALL };
  const domain = verbMatch[1].toLowerCase();
  const verb   = verbMatch[2].toLowerCase();
  const rest   = verbMatch[3].trim();

  if (domain === "truth" && verb === "strike") {
    return { ok: true, domain, verb, rest };
  }
  if (domain === "truth" && verb === "set") {
    const parsed = parseSubjectAndRest(rest);
    if (!parsed) return { ok: false, usage: "Usage: !truth set <subject> <fact-text>" };
    return { ok: true, domain, verb, rest, subject: parsed.subject, fact: parsed.rest };
  }
  if (domain === "state" && verb === "strike") {
    const parsed = parseSubjectAndRest(rest);
    if (!parsed?.rest) return { ok: false, usage: "Usage: !state strike <subject> <attribute>" };
    return { ok: true, domain, verb, rest, subject: parsed.subject, attribute: parsed.rest.trim() };
  }
  // state set
  const parsed = parseSubjectAndRest(rest);
  const eqIdx  = parsed?.rest?.indexOf("=") ?? -1;
  if (!parsed || eqIdx < 1) return { ok: false, usage: "Usage: !state set <subject> <attribute>=<value>" };
  return {
    ok: true, domain, verb, rest,
    subject:   parsed.subject,
    attribute: parsed.rest.slice(0, eqIdx).trim(),
    value:     parsed.rest.slice(eqIdx + 1).trim(),
  };
}

/**
 * Authoring-client half: validate locally, then relay to the canonical GM.
 *
 * @param {ChatMessage} message
 */
export async function handleFactContinuityCommand(message) {
  const text = (message?.content ?? "").trim();

  if (!factContinuityEnabled()) {
    ui.notifications?.warn("Fact Continuity is disabled in Companion Settings.");
    return;
  }

  const parsed = parseFactContinuityCommand(text);
  if (!parsed.ok) {
    ui.notifications?.warn(parsed.usage);
    return;
  }

  await requestGmAction("factContinuity.command", { text });
}

/**
 * gmRelay handler for "factContinuity.command" — runs on the canonical GM.
 * Applies the correction, persists campaignState, and posts the result card.
 *
 * @param {{ text?: string }} payload
 * @param {{ requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<string|null>} the result line posted, or null when nothing ran
 */
export async function applyFactContinuityCommand(payload = {}, ctx = {}) {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  if (!factContinuityEnabled()) {
    console.warn(`${MODULE_ID} | !truth/!state: Fact Continuity is disabled — relayed command ignored.`);
    return null;
  }
  const parsed = parseFactContinuityCommand(text);
  if (!parsed.ok) {
    // The author validated before relaying, so a malformed relay is a bug or a
    // hand-crafted socket message — log it, post nothing.
    console.warn(`${MODULE_ID} | !truth/!state: malformed relayed command ignored: "${text}"`);
    return null;
  }

  const isGM = !!ctx.requesterIsGM;
  const permCtx = { isGM, actor: isGM ? "gm" : "player" };
  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};

  // NARR-CMD-SUBJECT (narrator-context audit 2026-07): resolve command
  // subjects against the full entity roster, exactly like the sidecar apply
  // path does. Without it, entity-keyed ledger entries could never be
  // addressed by name from `!truth` / `!state` ("No matching state entry"),
  // and command-set truths landed text-keyed. Tolerant: an empty roster
  // degrades to text subjects, same as before.
  let entities = [];
  try {
    entities = collectAllEntities(campaignState);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | !truth/!state: entity roster collect failed:`, err?.message ?? err);
  }

  let resultLine = "";
  try {
    if (parsed.domain === "truth" && parsed.verb === "strike") {
      const struck = strikeTruth(parsed.rest, campaignState, permCtx);
      // The strike reaches the tier details, lore and summary that copied
      // the fact (issue #286 B6).
      if (struck) await propagateRetraction(struck, campaignState);
      resultLine = struck
        ? `Truth <code>${struck.id.slice(0, 8)}</code> struck.`
        : `No matching truth (id or unique 4+ char prefix required, and you must have permission).`;
    } else if (parsed.domain === "truth") {
      const subject = resolveSubject(parsed.subject, campaignState, entities);
      const truth   = setTruth(subject, parsed.fact, campaignState, permCtx);
      resultLine = truth
        ? `Truth recorded: <em>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.fact)}</em>.`
        : `Truth not recorded — empty subject or fact.`;
    } else if (parsed.verb === "strike") {
      const subject = resolveSubject(parsed.subject, campaignState, entities);
      const ok      = strikeStateValue(subjectKey(subject), parsed.attribute, campaignState);
      resultLine = ok
        ? `State <code>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.attribute)}</code> struck.`
        : `No matching state entry.`;
    } else {
      const subject = resolveSubject(parsed.subject, campaignState, entities);
      const result  = setStateValue(subjectKey(subject), parsed.attribute, parsed.value, campaignState);
      resultLine = result
        ? `State recorded: <em>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.attribute)}: ${escapeHtml(parsed.value)}</em>.`
        : `State not recorded — empty attribute or value.`;
    }

    // Persist after the command ran (a no-match leaves the ledgers unchanged,
    // so the write is a harmless no-op then).
    try {
      await game.settings.set(MODULE_ID, "campaignState", campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | !truth/!state: persist failed:`, err);
    }
  } catch (err) {
    console.error(`${MODULE_ID} | !truth/!state command failed:`, err);
    resultLine = "Command failed — see the browser console.";
  }

  await ChatMessage.create({
    content: `
      <div class="sf-fc-command-card">
        <div class="sf-fc-command-label">◈ Fact Continuity</div>
        <div class="sf-fc-command-body">${resultLine}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        factContinuityCommand: true,
        domain: parsed.domain,
        verb:   parsed.verb,
      },
    },
  });
  return resultLine;
}

/**
 * Parse "<subject> <rest>" with subject either a quoted string or a single
 * bare word. Returns { subject, rest } or null on malformed input.
 */
function parseSubjectAndRest(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('"')) {
    const close = trimmed.indexOf('"', 1);
    if (close < 0) return null;
    const subject = trimmed.slice(1, close).trim();
    const rest    = trimmed.slice(close + 1).trim();
    return subject ? { subject, rest } : null;
  }
  const space = trimmed.search(/\s/);
  if (space < 0) return { subject: trimmed, rest: '' };
  const subject = trimmed.slice(0, space).trim();
  const rest    = trimmed.slice(space + 1).trim();
  return subject ? { subject, rest } : null;
}

/**
 * Read the fact-continuity master toggle. Defaults to enabled when the
 * setting hasn't been registered (early init, unit-test contexts).
 */
function factContinuityEnabled() {
  try {
    return game.settings?.get(MODULE_ID, "factContinuity.enabled") !== false;
  } catch {
    return true;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
