/**
 * STARFORGED COMPANION
 * src/art/promptBuilder.js — Build DALL-E prompts from entity descriptions
 *
 * Responsibilities:
 * - Translate Loremaster narration excerpts into DALL-E-appropriate prompts
 * - Apply a consistent visual style anchor across all generated images
 * - Sanitise content that DALL-E will refuse — redirect toward implication
 *   rather than depiction (scars not wounds, aftermath not violence)
 * - Produce negative-space guidance via the style anchor (no photorealism,
 *   no contemporary settings) without requiring a separate negative prompt
 *   field (DALL-E 3 doesn't support negative prompts)
 *
 * Style anchor:
 *   All images share: dark science fiction concept art, painted illustration,
 *   muted desaturated palette with selective warm highlights, high contrast,
 *   cinematic composition. This is prepended to every prompt and produces a
 *   recognisable visual identity across portraits, locations, and ships.
 *
 * DALL-E 3 characteristics to design around:
 * - No negative prompts: exclusions must be phrased as positive instructions
 * - Strict moderation: gore, explicit violence, death imagery → redirect to
 *   environmental storytelling (damage to setting, not body)
 * - House style pull: the style anchor counteracts this somewhat
 * - 1024×1024 default: suitable for portraits and location thumbnails
 * - 1792×1024 landscape: suitable for ships and wide establishing shots
 *
 * Entity types and their prompt strategies:
 *   connection  — portrait orientation (1024×1024), character focus
 *   settlement  — landscape or square, architectural/environmental
 *   ship        — landscape (1792×1024), vessel profile against space
 *   faction     — symbolic/emblematic, can be abstract
 *   planet      — landscape, orbital or surface view
 */

// ─────────────────────────────────────────────────────────────────────────────
// STYLE ANCHOR
// ─────────────────────────────────────────────────────────────────────────────

const STYLE_ANCHOR = [
  "dark science fiction concept art",
  "painted digital illustration",
  "muted desaturated palette with selective warm amber highlights",
  "high contrast cinematic lighting",
  "detailed but not photorealistic",
  "gritty lived-in aesthetic",
  "no contemporary or Earth settings",
  "no bright saturated colours",
].join(", ");

// Entity-type-specific style additions
const TYPE_STYLE = {
  connection:  "character portrait, half-body composition, face clearly visible, expressive",
  settlement:  "establishing shot, architectural detail, sense of scale and habitation",
  ship:        "vessel profile, dramatic space backdrop, sense of weight and purpose",
  faction:     "symbolic or emblematic composition, faction insignia or representative figures",
  planet:      "orbital or surface view, planetary scale, atmospheric detail",
  location:    "establishing shot, environmental detail, sense of place and atmosphere",
  creature:    "creature profile, full form visible, alien biology, dark science fiction concept art",
};


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a DALL-E 3 prompt for a given entity type and source description.
 *
 * The source description is the Loremaster narration excerpt that triggered
 * art generation — it contains the raw descriptive language that should be
 * translated into visual prompt terms.
 *
 * @param {string} entityType  — "connection" | "settlement" | "ship" | "faction" | "planet"
 * @param {string} sourceDescription — Loremaster narration excerpt
 * @param {Object} [entity]    — The entity record for additional context
 * @returns {{ prompt: string, size: string }}
 */
export function buildPrompt(entityType, sourceDescription, entity = {}) {
  const extracted = extractVisualElements(sourceDescription, entityType);
  const sanitised = sanitiseForPolicy(extracted, entityType);
  const typeStyle  = TYPE_STYLE[entityType] ?? TYPE_STYLE.connection;

  const prompt = [
    STYLE_ANCHOR,
    typeStyle,
    sanitised,
    buildEntityContext(entityType, entity),
  ].filter(Boolean).join(". ");

  const size = entityType === "ship" || entityType === "planet"
    ? "1792x1024"
    : "1024x1024";

  return { prompt, size };
}

/**
 * Build a prompt for a regeneration request.
 * Same logic as buildPrompt but with a variation instruction appended
 * so DALL-E produces a meaningfully different result rather than a
 * slight reshuffle.
 *
 * @param {string} entityType
 * @param {string} sourceDescription
 * @param {Object} [entity]
 * @returns {{ prompt: string, size: string }}
 */
export function buildRegenerationPrompt(entityType, sourceDescription, entity = {}) {
  const base = buildPrompt(entityType, sourceDescription, entity);
  return {
    ...base,
    prompt: base.prompt + ". Alternative composition and lighting angle from the first version.",
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract visual elements from a Loremaster narration excerpt.
 * Filters prose for the parts that translate directly to image description:
 * physical appearance, clothing, setting details, lighting, mood.
 * Drops dialogue, internal thoughts, and mechanical commentary.
 *
 * This is heuristic — the source description is already filtered by the
 * caller to be the first descriptive paragraph from Loremaster, but it
 * may still contain non-visual content.
 *
 * @param {string} text
 * @param {string} entityType
 * @returns {string}
 */
function extractVisualElements(text, entityType) {
  if (!text) return "";

  // Strip quoted dialogue — not visual
  let cleaned = text.replace(/"[^"]*"/g, "").replace(/\u201C[^\u201D]*\u201D/g, "");

  // Strip parenthetical module commentary
  cleaned = cleaned.replace(/\([^)]*\)/g, "");

  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Truncate to a reasonable length — DALL-E prompts over ~400 words lose coherence
  const words = cleaned.split(" ");
  if (words.length > 120) {
    cleaned = words.slice(0, 120).join(" ") + "…";
  }

  return cleaned;
}


// ─────────────────────────────────────────────────────────────────────────────
// POLICY SANITISATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redirect content that DALL-E moderation will refuse toward implication.
 *
 * Strategy: replace the direct depiction with environmental or contextual
 * storytelling. Scars instead of wounds. Damage to setting not body.
 * The aesthetic of aftermath rather than the moment of violence.
 *
 * This is not censorship — it's a translation to what DALL-E can render well.
 * The Loremaster narration already exists as the authoritative description;
 * the image is an accompaniment, not a literal reproduction.
 *
 * @param {string} text
 * @param {string} entityType
 * @returns {string}
 */
function sanitiseForPolicy(text, entityType) {
  if (!text) return "";

  let s = text;

  // Injury / medical → visible but not graphic
  s = s.replace(/\b(wound|wounds|wounded|bleeding|blood|gore|injury|injuries|injured)\b/gi,
    "bearing the marks of hardship");

  // Death imagery → environmental aftermath
  s = s.replace(/\b(dead|corpse|corpses|body|bodies|killed|killing|dying|died)\b/gi,
    "abandoned");
  s = s.replace(/\b(undead|woken dead|risen dead|reanimated)\b/gi,
    "spectral figures");
  s = s.replace(/\b(skeleton|skeletal|skulls?)\b/gi,
    "ancient remains");

  // Horror creatures → implied menace not graphic form
  s = s.replace(/\b(forgespawn)\b/gi, "alien creature");
  s = s.replace(/\b(horror|horrors)\b/gi, "ominous presence");
  s = s.replace(/\b(monstrous|grotesque|hideous)\b/gi, "unsettling");

  // Weapons in action → carried or holstered
  s = s.replace(/\b(firing|shot|shooting|shooting|stabbing|stabbed|slashing)\b/gi,
    "armed");

  // Radiation / sickness → haggard appearance
  s = s.replace(/\b(radiation|radioactive|contaminated|contamination|irradiated)\b/gi,
    "weathered and haggard");
  s = s.replace(/\b(sickness|sick|disease|diseased|plague)\b/gi,
    "visibly worn");

  return s;
}


// ─────────────────────────────────────────────────────────────────────────────
// ENTITY CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build supplementary prompt context from entity record fields.
 * Adds structured details the narration excerpt may not have captured —
 * role, location type, ship class, etc.
 *
 * @param {string} entityType
 * @param {Object} entity
 * @returns {string}
 */
function buildEntityContext(entityType, entity) {
  switch (entityType) {

    case "connection": {
      const parts = [];
      if (entity.role)   parts.push(`role: ${entity.role}`);
      if (entity.bonded) parts.push("trusted ally");
      return parts.length ? parts.join(", ") : "";
    }

    case "settlement": {
      const parts = [];
      if (entity.location)   parts.push(locationAdjective(entity.location));
      if (entity.population) parts.push(`${entity.population.toLowerCase()} inhabitants`);
      if (entity.authority)  parts.push(`${entity.authority.toLowerCase()} governance`);
      return parts.length ? parts.join(", ") : "";
    }

    case "ship": {
      const parts = [];
      if (entity.type)    parts.push(entity.type.split("—")[0].trim());
      if (entity.battered) parts.push("showing significant damage");
      if (entity.cursed)   parts.push("bearing signs of permanent corruption");
      return parts.length ? parts.join(", ") : "";
    }

    case "faction": {
      const parts = [];
      if (entity.type)      parts.push(entity.type.split("—")[0].trim());
      if (entity.influence) parts.push(`${entity.influence.toLowerCase()} reach`);
      return parts.length ? parts.join(", ") : "";
    }

    case "planet": {
      const parts = [];
      if (entity.type)        parts.push(entity.type);
      if (entity.atmosphere)  parts.push(`${entity.atmosphere.toLowerCase()} atmosphere`);
      if (entity.life && entity.life !== "None") parts.push(`${entity.life.toLowerCase()} life`);
      return parts.length ? parts.join(", ") : "";
    }

    default:
      return "";
  }
}

function locationAdjective(location) {
  return {
    "Planetside": "surface settlement",
    "Orbital":    "orbital station",
    "Deep Space": "deep space facility",
  }[location] ?? location;
}
