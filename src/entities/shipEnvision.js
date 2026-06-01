/**
 * STARFORGED COMPANION
 * src/entities/shipEnvision.js — On-demand Envision / History for ships
 *
 * Two on-demand surfaces beyond the boot-up seed (`seedStarshipActor`):
 *
 *   • Envision — roll the supplementary oracles the seed skips
 *     (Initial Contact, captain Role + Goal + First Look + Name,
 *     a fresh Action + Theme for crew flavour) and ask the narrator
 *     to weave a 2-3 sentence paragraph from them.
 *
 *   • History — roll N Action + Theme beats (default 3) plus a
 *     Story Clue, then ask the narrator for a 2-3 paragraph backstory
 *     grounded in the ship's existing identity (type / first look /
 *     mission / name).
 *
 * Both surfaces:
 *   - post a narrator card to chat
 *   - append a dated <h4>-labelled section to system.notes (via updateShip),
 *     so subsequent @scene / narrator calls see the new detail
 *
 * Exposed entry points:
 *   - envisionShip(actor, opts)        — pure-ish; returns { rolls, prose, html }
 *   - composeShipHistory(actor, opts)  — pure-ish; returns { beats, prose, html }
 *   - appendNotesSection(actor, heading, html) — write helper, dual-sync via updateShip
 *   - isShipEnvisionCommand / handleShipEnvisionCommand
 *   - isShipHistoryCommand  / handleShipHistoryCommand
 *
 * All Anthropic traffic routes through src/api-proxy.js per CLAUDE.md.
 * Rulebook references (rules-reference/rulebook-summary.md):
 *   - "envision" as on-going practice, not one-time event
 *   - on-demand oracle layering (Initial Contact, character role, action+theme)
 *   - history is generative: roll seeds, narrator fleshes out
 */

import { apiPost } from "../api-proxy.js";
import {
  updateShip,
} from "./ship.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

const VALID_FACETS = ["captain", "crew", "agenda", "contact", "all"];

const FACET_TABLES = {
  captain: [
    { id: "character_role",        label: "Captain — Role"        },
    { id: "character_goal",        label: "Captain — Goal"        },
    { id: "character_first_look",  label: "Captain — First look"  },
    { id: "given_name",            label: "Captain — Given name"  },
  ],
  crew: [
    { id: "action",               label: "Crew — Action"          },
    { id: "theme",                label: "Crew — Theme"           },
  ],
  agenda: [
    { id: "action",               label: "Agenda — Action"        },
    { id: "theme",                label: "Agenda — Theme"         },
  ],
  contact: [
    { id: "starship_contact",     label: "Initial contact"        },
  ],
};


// ─────────────────────────────────────────────────────────────────────────────
// PURE LOGIC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a user-supplied facet string. Falls back to "all".
 * @param {string} [raw]
 * @returns {string}  one of VALID_FACETS
 */
export function normaliseFacet(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return VALID_FACETS.includes(v) ? v : "all";
}

/**
 * Roll the oracle bundle for the requested facet (or all four facets when
 * facet === "all"). Pure aside from the d100 rolls themselves — accepts an
 * injected roll function so tests can pin the outputs.
 *
 * @param {string} facet                  one of VALID_FACETS
 * @param {(id: string) => { result: string } | null} roll
 * @returns {Array<{ facet: string, tableId: string, label: string, result: string }>}
 */
export function rollEnvisionBundle(facet, roll) {
  const facets = facet === "all" ? ["captain", "crew", "agenda", "contact"] : [facet];
  const out = [];
  for (const f of facets) {
    for (const entry of FACET_TABLES[f] ?? []) {
      let result = "";
      try {
        const r = roll(entry.id);
        result = (r?.result && r.result !== "—") ? String(r.result) : "";
      } catch {
        result = "";
      }
      out.push({ facet: f, tableId: entry.id, label: entry.label, result });
    }
  }
  return out;
}

/**
 * Roll the oracle bundle for a ship's History — N Action + Theme beat pairs
 * plus one Story Clue. Pure aside from the d100 rolls (injected roll fn).
 *
 * @param {number} beats        how many Action + Theme beats to roll (1..6)
 * @param {(id: string) => { result: string } | null} roll
 * @returns {{ beats: Array<{action: string, theme: string}>, clue: string }}
 */
export function rollHistoryBundle(beats, roll) {
  const num = Number(beats);
  const n = Number.isFinite(num)
    ? Math.max(1, Math.min(6, Math.floor(num)))
    : 3;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = roll("action");
    const t = roll("theme");
    out.push({
      action: (a?.result && a.result !== "—") ? String(a.result) : "",
      theme:  (t?.result && t.result !== "—") ? String(t.result) : "",
    });
  }
  const c = roll("story_clue");
  return {
    beats: out,
    clue: (c?.result && c.result !== "—") ? String(c.result) : "",
  };
}

/**
 * Build the narrator prompt for an Envision call. Pure — no Foundry/IO — so
 * the prompt shape is unit-testable.
 *
 * @param {Object} args
 * @param {string} args.facet       one of VALID_FACETS
 * @param {string} args.tone        narrator tone (e.g. "wry")
 * @param {{ name?: string, type?: string, firstLook?: string, mission?: string }} args.identity
 * @param {Array<{ facet: string, label: string, result: string }>} args.rolls
 * @returns {{ system: string, user: string }}
 */
export function buildEnvisionPrompt({ facet, tone = "wry", identity, rolls }) {
  const facetLabel = facet === "all" ? "the ship" : facet;
  const system =
    `You are the narrator for an Ironsworn: Starforged solo campaign. ` +
    `Tone: ${tone}. The player wants to envision more detail about ${facetLabel} ` +
    `aboard their starship. Weave the oracle seeds below into 2-3 sentences ` +
    `of plain prose — no headings, lists, or markdown. Address the player in ` +
    `second person ("your ship", "you"). Ground the prose ONLY in the ship's ` +
    `existing identity and the new oracle seeds; do not invent proper nouns, ` +
    `factions, or plot beyond what those seeds imply.`;

  const idLines = [
    identity?.name      ? `Ship name: ${identity.name}`           : null,
    identity?.type      ? `Type: ${identity.type}`                : null,
    identity?.firstLook ? `First look: ${identity.firstLook}`     : null,
    identity?.mission   ? `Mission: ${identity.mission}`          : null,
  ].filter(Boolean);

  const rollLines = (rolls ?? [])
    .filter(r => r?.result)
    .map(r => `- ${r.label}: ${r.result}`);

  const user = [
    idLines.length  ? `Ship identity:\n${idLines.join("\n")}`     : null,
    rollLines.length ? `New oracle seeds (envision ${facetLabel}):\n${rollLines.join("\n")}`
                     : `No oracle seeds rolled — improvise sparely from identity alone.`,
  ].filter(Boolean).join("\n\n");

  return { system, user };
}

/**
 * Build the narrator prompt for a History call. Pure.
 *
 * @param {Object} args
 * @param {string} args.tone
 * @param {{ name?: string, type?: string, firstLook?: string, mission?: string }} args.identity
 * @param {{ beats: Array<{action: string, theme: string}>, clue: string }} args.history
 * @returns {{ system: string, user: string }}
 */
export function buildHistoryPrompt({ tone = "wry", identity, history }) {
  const system =
    `You are the narrator for an Ironsworn: Starforged solo campaign. ` +
    `Tone: ${tone}. The player wants a short backstory for their starship. ` +
    `Use the Action + Theme oracle pairs below as backstory beats (one per ` +
    `paragraph), and the Story Clue as a hook that ties one of the beats ` +
    `into the present mission. Write 2-3 short paragraphs of plain prose — ` +
    `no headings, lists, or markdown. Address the player in second person ` +
    `("your ship", "you"). Ground the prose ONLY in the ship's existing ` +
    `identity and the oracle seeds; do not invent proper nouns, factions, ` +
    `crew names, or plot beyond what those seeds imply.`;

  const idLines = [
    identity?.name      ? `Ship name: ${identity.name}`        : null,
    identity?.type      ? `Type: ${identity.type}`             : null,
    identity?.firstLook ? `First look: ${identity.firstLook}`  : null,
    identity?.mission   ? `Mission: ${identity.mission}`       : null,
  ].filter(Boolean);

  const beatLines = (history?.beats ?? [])
    .map((b, i) => `- Beat ${i + 1}: ${[b.action, b.theme].filter(Boolean).join(" ")}`)
    .filter(line => /Beat \d+: \S/.test(line));

  const user = [
    idLines.length  ? `Ship identity:\n${idLines.join("\n")}`        : null,
    beatLines.length ? `Backstory seeds (Action + Theme):\n${beatLines.join("\n")}` : null,
    history?.clue   ? `Story Clue (tie into present mission): ${history.clue}` : null,
  ].filter(Boolean).join("\n\n");

  return { system, user };
}


// ─────────────────────────────────────────────────────────────────────────────
// IO ENTRY POINTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Envision a facet of a ship. Rolls supplementary oracles, asks the narrator
 * for a 2-3 sentence prose paragraph, returns the structured result. Does NOT
 * write to the actor — the caller decides whether to chat-post or append to
 * notes.
 *
 * @param {Actor} actor
 * @param {{ facet?: string, identityOverride?: Object }} [opts]
 * @returns {Promise<{
 *   facet: string,
 *   rolls: Array<{ facet, label, result, tableId }>,
 *   prose: string|null,
 *   identity: { name, type, firstLook, mission }
 * }>}
 */
export async function envisionShip(actor, opts = {}) {
  const facet = normaliseFacet(opts.facet);
  const identity = readShipIdentity(actor, opts.identityOverride);

  const { rollOracle } = await import("../oracles/roller.js");
  const rolls = rollEnvisionBundle(facet, (id) => rollOracle(id));

  const prose = await generateProse({
    builder: () => buildEnvisionPrompt({
      facet,
      tone: readSetting("narrationTone") || "wry",
      identity,
      rolls,
    }),
    maxTokens: 260,
  }).catch(() => null);

  return { facet, rolls, prose, identity };
}

/**
 * Compose a ship's history. Rolls Action + Theme beats + a Story Clue, asks
 * the narrator for a 2-3 paragraph backstory, returns the structured result.
 * Does NOT write to the actor — the caller decides whether to chat-post or
 * append to notes.
 *
 * @param {Actor} actor
 * @param {{ beats?: number, identityOverride?: Object }} [opts]
 * @returns {Promise<{
 *   history: { beats, clue },
 *   prose: string|null,
 *   identity: { name, type, firstLook, mission }
 * }>}
 */
export async function composeShipHistory(actor, opts = {}) {
  const identity = readShipIdentity(actor, opts.identityOverride);

  const { rollOracle } = await import("../oracles/roller.js");
  const history = rollHistoryBundle(opts.beats ?? 3, (id) => rollOracle(id));

  const prose = await generateProse({
    builder: () => buildHistoryPrompt({
      tone: readSetting("narrationTone") || "wry",
      identity,
      history,
    }),
    maxTokens: 420,
  }).catch(() => null);

  return { history, prose, identity };
}

/**
 * Append a labeled HTML section to a ship Actor's notes. Idempotent re-runs
 * append a new dated subsection — existing content is left untouched. Routes
 * through updateShip so flag.ship.notes and system.notes stay in sync.
 *
 * @param {Actor} actor
 * @param {string} heading     e.g. "Envisioned details" / "History"
 * @param {string} html        the new section's body HTML (paragraphs)
 * @returns {Promise<Object|null>}  the updated ship payload, or null on no-op
 */
export async function appendNotesSection(actor, heading, html) {
  if (!actor || actor.type !== "starship") return null;
  const safeHeading = escapeHtml(String(heading ?? ""));
  const body = String(html ?? "").trim();
  if (!safeHeading || !body) return null;

  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10);
  const section =
    `<hr><h4>✦ ${safeHeading} — ${dateStamp}</h4>${body}`;

  const existing = String(actor.system?.notes ?? "");
  const combined = existing
    ? `${existing}${section}`
    : section;

  try {
    return await updateShip(actor.id, { notes: combined });
  } catch (err) {
    console.warn(`${MODULE_ID} | appendNotesSection: write failed:`, err?.message ?? err);
    return null;
  }
}

/**
 * Render Envision rolls as a compact HTML block (paragraphs + fact line)
 * suitable for both the chat card and the Notes append. Falls back to just
 * the fact line when narrator prose is unavailable.
 *
 * @param {{ rolls: Array<{ label, result }>, prose: string|null }} result
 * @returns {string}
 */
export function renderEnvisionHtml(result) {
  const paras = proseToParagraphs(result?.prose);
  const facts = (result?.rolls ?? [])
    .filter(r => r?.result)
    .map(r => `${escapeHtml(r.label)}: ${escapeHtml(r.result)}`)
    .join(" &middot; ");
  const factLine = facts ? `<p><em>${facts}</em></p>` : "";
  return `${paras}${factLine}`;
}

/**
 * Render History rolls as a compact HTML block. Same fallback rule as
 * renderEnvisionHtml.
 *
 * @param {{ history: { beats, clue }, prose: string|null }} result
 * @returns {string}
 */
export function renderHistoryHtml(result) {
  const paras = proseToParagraphs(result?.prose);
  const beatLines = (result?.history?.beats ?? [])
    .map((b, i) => {
      const text = [b.action, b.theme].filter(Boolean).join(" ");
      return text ? `Beat ${i + 1}: ${escapeHtml(text)}` : null;
    })
    .filter(Boolean);
  if (result?.history?.clue) beatLines.push(`Story Clue: ${escapeHtml(result.history.clue)}`);
  const factLine = beatLines.length
    ? `<p><em>${beatLines.join(" &middot; ")}</em></p>`
    : "";
  return `${paras}${factLine}`;
}


// ─────────────────────────────────────────────────────────────────────────────
// CHAT COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Match `!ship envision [id|name] [facet]`. Predicate-only — handler parses
 * arguments via parseShipEnvisionCommand.
 */
export function isShipEnvisionCommand(message) {
  const text = String(message?.content ?? "").trim();
  if (message?.flags?.[MODULE_ID]?.shipEnvisionCard) return false;
  return /^!ship\s+envision(\s|$)/i.test(text);
}

/** Match `!ship history [id|name] [beats]`. */
export function isShipHistoryCommand(message) {
  const text = String(message?.content ?? "").trim();
  if (message?.flags?.[MODULE_ID]?.shipHistoryCard) return false;
  return /^!ship\s+history(\s|$)/i.test(text);
}

/**
 * Parse `!ship envision [target] [facet]`. The target is everything between
 * the `envision` keyword and the trailing facet token (when one matches a
 * known facet), so multi-word ship names work. Returns the resolved ship
 * Actor + facet, or { error } when nothing resolves.
 *
 * Resolution order:
 *   1. exact actor id
 *   2. exact actor.name (case-insensitive)
 *   3. command vehicle (when no target provided)
 *   4. lone ship (only one tracked) when no target
 *
 * @param {string} text
 * @param {Object} campaignState
 * @returns {{ actor: Actor|null, facet: string, target: string, error?: string }}
 */
export function parseShipEnvisionCommand(text, campaignState) {
  return parseShipCommand(text, "envision", campaignState, { trailingFacet: true });
}

/** Parse `!ship history [target] [beats]`. */
export function parseShipHistoryCommand(text, campaignState) {
  const parsed = parseShipCommand(text, "history", campaignState, { trailingNumber: true });
  return parsed;
}

/**
 * Handle `!ship envision`. Rolls oracles, generates prose, posts a chat card,
 * appends a labeled section to system.notes. Any player may invoke; only the
 * notes-write step requires GM permissions (a non-GM invoker still gets the
 * chat card).
 */
export async function handleShipEnvisionCommand(message) {
  const text = String(message?.content ?? "").trim();
  const campaignState = readCampaignState();
  const { actor, facet, error, target } = parseShipEnvisionCommand(text, campaignState);

  if (error || !actor) {
    await ChatMessage.create({
      content: `<div class="sf-ship-envision-card"><strong>!ship envision</strong>` +
               `<p>${escapeHtml(error || "Could not resolve a ship.")}</p>` +
               `<p>Usage: <code>!ship envision [id|name] [captain|crew|agenda|contact|all]</code></p></div>`,
      flags: { [MODULE_ID]: { shipEnvisionCard: true } },
    });
    return;
  }

  const result = await envisionShip(actor, { facet });
  const sectionHtml = renderEnvisionHtml(result);
  const facetLabel = facet === "all" ? "all facets" : facet;

  await ChatMessage.create({
    content:
      `<div class="sf-ship-envision-card">` +
      `<strong>✦ Envision — ${escapeHtml(actor.name)} (${escapeHtml(facetLabel)})</strong>` +
      sectionHtml +
      `</div>`,
    flags: { [MODULE_ID]: { shipEnvisionCard: true, actorId: actor.id, facet } },
  });

  if (canWriteNotes()) {
    await appendNotesSection(actor, `Envisioned ${facetLabel}`, sectionHtml)
      .catch(err => console.warn(`${MODULE_ID} | !ship envision: notes write failed:`, err?.message ?? err));
  }
  // target arg surfaces only for logging; intentionally unused otherwise
  void target;
}

/**
 * Handle `!ship history`. Same shape as envision but with the history bundle.
 */
export async function handleShipHistoryCommand(message) {
  const text = String(message?.content ?? "").trim();
  const campaignState = readCampaignState();
  const { actor, beats, error, target } = parseShipHistoryCommand(text, campaignState);

  if (error || !actor) {
    await ChatMessage.create({
      content: `<div class="sf-ship-history-card"><strong>!ship history</strong>` +
               `<p>${escapeHtml(error || "Could not resolve a ship.")}</p>` +
               `<p>Usage: <code>!ship history [id|name] [beats]</code></p></div>`,
      flags: { [MODULE_ID]: { shipHistoryCard: true } },
    });
    return;
  }

  const result = await composeShipHistory(actor, { beats });
  const sectionHtml = renderHistoryHtml(result);

  await ChatMessage.create({
    content:
      `<div class="sf-ship-history-card">` +
      `<strong>📜 History — ${escapeHtml(actor.name)}</strong>` +
      sectionHtml +
      `</div>`,
    flags: { [MODULE_ID]: { shipHistoryCard: true, actorId: actor.id } },
  });

  if (canWriteNotes()) {
    await appendNotesSection(actor, `History`, sectionHtml)
      .catch(err => console.warn(`${MODULE_ID} | !ship history: notes write failed:`, err?.message ?? err));
  }
  void target;
}


// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL
// ─────────────────────────────────────────────────────────────────────────────

function parseShipCommand(text, verb, campaignState, { trailingFacet = false, trailingNumber = false } = {}) {
  const headRe = new RegExp(`^!ship\\s+${verb}\\s*`, "i");
  const tail = String(text ?? "").replace(headRe, "").trim();

  let facet = "all";
  let beats = 3;
  let targetText = tail;

  // Trailing facet token wins when present (must be exact match).
  if (trailingFacet && tail) {
    const m = tail.match(/(.*?)\s+(captain|crew|agenda|contact|all)\s*$/i);
    if (m) {
      targetText = m[1].trim();
      facet = m[2].toLowerCase();
    } else if (VALID_FACETS.includes(tail.toLowerCase())) {
      targetText = "";
      facet = tail.toLowerCase();
    }
  }

  // Trailing number token wins when present.
  if (trailingNumber && tail) {
    const m = tail.match(/(.*?)\s+(\d+)\s*$/);
    if (m) {
      targetText = m[1].trim();
      beats = Number(m[2]);
    } else if (/^\d+$/.test(tail)) {
      targetText = "";
      beats = Number(tail);
    }
  }

  const { actor, error } = resolveShipActor(targetText, campaignState);
  return { actor, facet, beats, target: targetText, error };
}

function resolveShipActor(targetText, campaignState) {
  const ids = (campaignState?.shipIds ?? []);
  const trackedActors = ids
    .map(id => {
      try { return globalThis.game?.actors?.get?.(id) ?? null; }
      catch { return null; }
    })
    .filter(a => a && a.type === "starship");

  const trimmed = String(targetText ?? "").trim();

  // No target: prefer command vehicle, else lone ship.
  if (!trimmed) {
    const cv = trackedActors.find(a => !!a.flags?.[MODULE_ID]?.ship?.isCommandVehicle);
    if (cv) return { actor: cv };
    if (trackedActors.length === 1) return { actor: trackedActors[0] };
    return { actor: null, error: "No ship specified; no command vehicle or lone ship found." };
  }

  // Exact actor id.
  try {
    const byId = globalThis.game?.actors?.get?.(trimmed);
    if (byId && byId.type === "starship") return { actor: byId };
  } catch (err) {
    console.warn(`${MODULE_ID} | resolveShipActor: id lookup failed:`, err?.message ?? err);
  }

  // Case-insensitive actor name across registered ships.
  const lower = trimmed.toLowerCase();
  const match = trackedActors.find(a => String(a.name ?? "").toLowerCase() === lower);
  if (match) return { actor: match };

  return { actor: null, error: `No ship matches "${trimmed}".` };
}

function readShipIdentity(actor, override) {
  if (override) return { ...override };
  const ship = actor?.flags?.[MODULE_ID]?.ship ?? {};
  return {
    name:      actor?.name ?? ship.name ?? "",
    type:      ship.type      ?? "",
    firstLook: ship.firstLook ?? "",
    mission:   ship.mission   ?? "",
  };
}

async function generateProse({ builder, maxTokens }) {
  const apiKey = readSetting("claudeApiKey");
  if (!apiKey) return null;

  const { system, user } = builder();
  const model = readSetting("narrationModel") || DEFAULT_MODEL;

  const body = {
    model,
    max_tokens: maxTokens,
    system:   [{ type: "text", text: system }],
    messages: [{ role: "user", content: user }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };

  const data = await apiPost(ANTHROPIC_URL, headers, body);
  const text = (data?.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
  return text || null;
}

function proseToParagraphs(prose) {
  if (!prose || typeof prose !== "string") return "";
  return prose
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p).replace(/\n+/g, " ")}</p>`)
    .join("");
}

function readSetting(key) {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, key); }
  catch { return undefined; }
}

function readCampaignState() {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, "campaignState") ?? {}; }
  catch { return {}; }
}

function canWriteNotes() {
  try { return !!globalThis.game?.user?.isGM; } catch { return false; }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
