/**
 * STARFORGED COMPANION
 * src/entities/finalize.js — entity finalize lifecycle (T1)
 *
 * A "finalize" step generates a richer, Actor-grounded narrator description for
 * an entity and (first-time only) a portrait, then marks the record finalized.
 * It is invoked explicitly — from the entity panel's Finalize button, or its
 * Regenerate-flavour button (force) — never automatically (decisions.md → entity
 * finalize lifecycle: D1 hybrid trigger, D2 leave-and-manual-regen).
 *
 * Scope: the four Actor-backed types (ship / settlement / planet / location).
 * connection / faction / creature are seeded richly at creation and stay out of
 * this affordance.
 *
 * Generation is grounded ONLY in the entity's stored fields (the migration's
 * flag payload). Art respects the generate-once / locked rule: a portrait is
 * triggered only when the entity has none, so a flavour regeneration never
 * clobbers or re-bills an existing portrait (art has its own one-time regen).
 *
 * All Anthropic traffic goes through src/api-proxy.js per the CLAUDE.md
 * architecture constraint; image generation goes through generatePortrait,
 * which routes to src/art/openRouterImage.js.
 */

import { apiPost } from "../api-proxy.js";
import { generatePortrait } from "../art/generator.js";
import { getShip,       updateShip }       from "./ship.js";
import { getSettlement, updateSettlement } from "./settlement.js";
import { getPlanet,     updatePlanet }     from "./planet.js";
import { getLocation,   updateLocation }   from "./location.js";

const MODULE_ID     = "starforged-companion";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
const MAX_TOKENS    = 240;

const GETTERS = {
  ship:       getShip,
  settlement: getSettlement,
  planet:     getPlanet,
  location:   getLocation,
};

const UPDATERS = {
  ship:       updateShip,
  settlement: updateSettlement,
  planet:     updatePlanet,
  location:   updateLocation,
};

const TYPE_LABELS = {
  ship:       "starship",
  settlement: "settlement",
  planet:     "planet",
  location:   "location",
};

// Salient, grounded fields per type — fed to the narrator so the description
// stays anchored to what the oracles / detector already established.
const FLAVOR_FIELDS = {
  ship:       ["type", "firstLook", "mission"],
  settlement: ["location", "population", "authority", "trouble", "projects"],
  planet:     ["type", "atmosphere", "life", "observedFromSpace"],
  location:   ["type", "region", "status", "firstLook", "feature", "peril", "opportunity"],
};

/** @returns {boolean} whether a typeKey is eligible for the finalize affordance. */
export function supportsFinalize(typeKey) {
  return Object.prototype.hasOwnProperty.call(GETTERS, typeKey);
}

/**
 * Build the grounded flavour prompt. Pure — no Foundry/IO — so it's unit
 * testable. Returns `{ system, user }`.
 *
 * @param {string} typeKey
 * @param {Object} record   the entity flag payload
 * @param {string} [tone]
 */
export function buildEntityFlavorPrompt(typeKey, record, tone = "wry") {
  const label = TYPE_LABELS[typeKey] ?? "location";
  const system =
    `You are the narrator for an Ironsworn: Starforged solo campaign. ` +
    `Tone: ${tone}. Write a vivid but spare ${label} description in 2-4 ` +
    `sentences of plain prose — no headings, lists, or markdown. Ground it ` +
    `ONLY in the details provided; do not invent proper nouns, characters, ` +
    `factions, or plot beyond what those details imply.`;

  const fieldLines = (FLAVOR_FIELDS[typeKey] ?? [])
    .map(k => [k, record?.[k]])
    .filter(([, v]) => v !== undefined && v !== null && v !== "" &&
                       !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(", ") : v}`);

  const titleLabel = label.charAt(0).toUpperCase() + label.slice(1);
  const user = [
    `${titleLabel}: ${record?.name ?? "Unknown"}`,
    fieldLines.length ? `Known details:\n${fieldLines.join("\n")}` : null,
    record?.description ? `Current notes: ${stripTags(record.description)}` : null,
  ].filter(Boolean).join("\n\n");

  return { system, user };
}

/**
 * Finalize an entity: generate grounded flavour, write it to the record
 * (description + portraitSourceDescription + finalizedAt), and trigger a
 * first-time portrait when the entity has none.
 *
 * Idempotent: a finalized record is left untouched unless `force` is set (the
 * Regenerate-flavour path). Returns a result object — never throws.
 *
 * @param {string} typeKey
 * @param {string} hostId        the host document id (Actor id for these types)
 * @param {Object} campaignState
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<{ ok: boolean, reason: string, record?: Object, artTriggered?: boolean }>}
 */
export async function finalizeEntity(typeKey, hostId, campaignState, { force = false } = {}) {
  const getter  = GETTERS[typeKey];
  const updater = UPDATERS[typeKey];
  if (!getter || !updater) return { ok: false, reason: "unsupported-type" };

  let record;
  try { record = getter(hostId); }
  catch { record = null; }
  if (!record) return { ok: false, reason: "not-found" };

  if (record.finalizedAt && !force) {
    return { ok: true, reason: "already-finalized", record };
  }

  const flavor = await generateEntityFlavor(typeKey, record).catch(err => {
    console.warn(`${MODULE_ID} | finalizeEntity: flavour generation failed:`, err?.message ?? err);
    return null;
  });
  if (!flavor) return { ok: false, reason: "no-flavor" };

  let updated;
  try {
    updated = await updater(hostId, {
      description:               flavor,
      portraitSourceDescription: record.portraitSourceDescription || flavor,
      finalizedAt:               new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | finalizeEntity: write failed:`, err?.message ?? err);
    return { ok: false, reason: "write-failed" };
  }

  // First-time portrait only — never clobber or re-bill an existing/locked
  // portrait (decisions.md: art is generate-once/locked; flavour regen leaves
  // art alone — the panel has a separate one-time portrait regen).
  let artTriggered = false;
  if (!record.portraitId) {
    try {
      const asset = await generatePortrait(hostId, typeKey, updated ?? record, campaignState);
      artTriggered = !!asset;
    } catch (err) {
      console.warn(`${MODULE_ID} | finalizeEntity: portrait generation failed:`, err?.message ?? err);
    }
  }

  return { ok: true, reason: force ? "regenerated" : "finalized", record: updated, artTriggered };
}

/**
 * Stamp an entity as finalized and trigger a first-time portrait, using the
 * entity's existing description (or a caller-provided source) as the portrait
 * prompt source. Unlike `finalizeEntity`, this skips the Claude flavour call —
 * for callers that have already produced rich entity prose (e.g. the sector
 * creator's narrator stubs) and just need the portrait + finalize stamp without
 * paying for a second LLM round-trip or clobbering the existing description.
 *
 * Resolves `portraitSourceDescription` in this order:
 *   1. explicit `opts.portraitSourceDescription`
 *   2. existing `record.portraitSourceDescription`
 *   3. plain-text strip of `record.description`
 * If all three are empty, returns `no-source` without writing or billing art.
 *
 * Idempotent on `finalizedAt`: a record already stamped is a no-op.
 *
 * @param {string} typeKey
 * @param {string} hostId
 * @param {Object} campaignState
 * @param {{ portraitSourceDescription?: string|null }} [opts]
 * @returns {Promise<{ ok: boolean, reason: string, record?: Object, artTriggered?: boolean }>}
 */
export async function finalizeEntityArtOnly(typeKey, hostId, campaignState, opts = {}) {
  const { portraitSourceDescription = null } = opts;
  const getter  = GETTERS[typeKey];
  const updater = UPDATERS[typeKey];
  if (!getter || !updater) return { ok: false, reason: "unsupported-type" };

  let record;
  try { record = getter(hostId); }
  catch { record = null; }
  if (!record) return { ok: false, reason: "not-found" };

  if (record.finalizedAt) {
    return { ok: true, reason: "already-finalized", record };
  }

  const source = portraitSourceDescription
              || record.portraitSourceDescription
              || stripTags(record.description ?? "")
              || null;
  if (!source) return { ok: false, reason: "no-source" };

  let updated;
  try {
    updated = await updater(hostId, {
      portraitSourceDescription: source,
      finalizedAt:               new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | finalizeEntityArtOnly: write failed:`, err?.message ?? err);
    return { ok: false, reason: "write-failed" };
  }

  let artTriggered = false;
  if (!record.portraitId) {
    try {
      const asset = await generatePortrait(hostId, typeKey, updated ?? record, campaignState);
      artTriggered = !!asset;
    } catch (err) {
      console.warn(`${MODULE_ID} | finalizeEntityArtOnly: portrait generation failed:`, err?.message ?? err);
    }
  }

  return { ok: true, reason: "finalized", record: updated, artTriggered };
}


// ─────────────────────────────────────────────────────────────────────────────
// Internal
// ─────────────────────────────────────────────────────────────────────────────

async function generateEntityFlavor(typeKey, record) {
  const apiKey = readSetting("claudeApiKey");
  if (!apiKey) return null;

  const model = readSetting("narrationModel") || DEFAULT_MODEL;
  const tone  = readSetting("narrationTone")  || "wry";
  const { system, user } = buildEntityFlavorPrompt(typeKey, record, tone);

  const body = {
    model,
    max_tokens: MAX_TOKENS,
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

function readSetting(key) {
  try { return globalThis.game?.settings?.get?.(MODULE_ID, key); }
  catch { return undefined; }
}

function stripTags(s) {
  return String(s ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
