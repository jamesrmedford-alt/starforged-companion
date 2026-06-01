/**
 * STARFORGED COMPANION
 * src/entities/starshipModules.js — roll → starship Module mapping
 *
 * The Sector Creator and the starship-seed hook roll three identity fields for
 * every new starship:
 *
 *   - type       (e.g. "Hunter — Stealthy attack ship")
 *   - firstLook  (e.g. "Bristling with weapons")
 *   - mission    (e.g. "Provide medical aid")
 *
 * Until v1.7.2 those rolls only fed the Notes blurb; the starship's installed
 * Modules (foundry-ironsworn `asset` Items with `system.category: "Module"`)
 * stayed at whatever default was on the sheet, which the v1.7.0 playtest
 * surfaced as F18 — a Hunter that was bristling with weapons and providing
 * medical aid arrived with Engine Upgrade and Stealth Tech installed and no
 * Heavy Cannons or Medbay in sight.
 *
 * This module exports a pure scoring function that pools keyword matches across
 * all three rolled fields and returns the top N canonical module slugs. The
 * caller hands the slugs to `getCanonicalAsset()` and installs the resulting
 * documents on the actor.
 *
 * The 15 canonical Module slugs (matching the foundry-ironsworn starforgedassets
 * compendium): engine_upgrade, expanded_hold, grappler, heavy_cannons,
 * internal_refit, medbay, missile_array, overseer, reinforced_hull,
 * research_lab, sensor_array, shields, stealth_tech, vehicle_bay, workshop.
 */

const DEFAULT_LIMIT = 3;

/**
 * Each rule contributes its module slugs to the aggregate score when ANY of
 * its keywords appears (case-insensitive substring match) in the concatenated
 * rolled identity text. Rules are matched independently and the same slug can
 * accumulate score from multiple rules — that's how a "Hunter, dark or
 * stealthy, smuggle cargo" rolls deeply on `stealth_tech` (three matches).
 *
 * Keywords lean on the distinctive nouns in the oracle table entries
 * (`src/oracles/tables/starships.js`) so the mapping is readable next to the
 * source data.
 */
const RULES = Object.freeze([
  // ─── TYPE keywords (from STARSHIP_TYPE table) ─────────────────────────
  { keywords: ["carrier", "launches fighters"],                          modules: ["vehicle_bay", "sensor_array"] },
  { keywords: ["corvette", "light attack"],                              modules: ["heavy_cannons", "engine_upgrade"] },
  { keywords: ["courier", "fast transport"],                             modules: ["engine_upgrade", "sensor_array"] },
  { keywords: ["cruiser", "medium attack"],                              modules: ["heavy_cannons", "shields"] },
  { keywords: ["dreadnought", "heavy attack"],                           modules: ["heavy_cannons", "reinforced_hull", "shields"] },
  { keywords: ["foundry", "mobile construction"],                        modules: ["workshop", "expanded_hold"] },
  { keywords: ["harvester", "fuel or energy excavator"],                 modules: ["expanded_hold", "workshop"] },
  { keywords: ["hauler", "heavy transport"],                             modules: ["expanded_hold", "reinforced_hull"] },
  { keywords: ["hunter", "stealthy attack"],                             modules: ["stealth_tech", "missile_array"] },
  { keywords: ["ironhome", "habitat"],                                   modules: ["medbay", "expanded_hold", "internal_refit"] },
  { keywords: ["mender", "utility or repair"],                           modules: ["workshop", "medbay"] },
  { keywords: ["outbounder", "remote survey", "remote research"],        modules: ["research_lab", "sensor_array", "engine_upgrade"] },
  { keywords: ["pennant", "command ship"],                               modules: ["overseer", "sensor_array"] },
  { keywords: ["prospector", "mineral excavator"],                       modules: ["expanded_hold", "workshop"] },
  { keywords: ["reclaimer", "salvage", "rescue"],                        modules: ["grappler", "workshop", "medbay"] },
  { keywords: ["shuttle", "short-range transport"],                      modules: ["expanded_hold"] },
  { keywords: ["snub fighter", "small attack craft"],                    modules: ["engine_upgrade", "missile_array"] },

  // ─── FIRST-LOOK keywords (from STARSHIP_FIRST_LOOK table) ─────────────
  { keywords: ["abnormal sensor readings", "large sensor arrays"],       modules: ["sensor_array"] },
  { keywords: ["bristling with weapons"],                                modules: ["heavy_cannons", "missile_array"] },
  { keywords: ["intimidating profile"],                                  modules: ["heavy_cannons"] },
  { keywords: ["dark or stealthy", "low-profile", "disguised"],          modules: ["stealth_tech"] },
  { keywords: ["heavy armor"],                                           modules: ["reinforced_hull", "shields"] },
  { keywords: ["modern or advanced"],                                    modules: ["overseer"] },
  { keywords: ["oversized engines"],                                     modules: ["engine_upgrade"] },
  { keywords: ["refitted or repurposed hull"],                           modules: ["internal_refit"] },
  { keywords: ["towing or linked"],                                      modules: ["grappler"] },

  // ─── MISSION keywords (from STARSHIP_MISSION_* tables) ────────────────
  { keywords: ["blockade"],                                              modules: ["sensor_array", "heavy_cannons"] },
  { keywords: ["collect a resource"],                                    modules: ["expanded_hold"] },
  { keywords: ["command others"],                                        modules: ["overseer"] },
  { keywords: ["conduct espionage"],                                     modules: ["stealth_tech", "sensor_array"] },
  { keywords: ["conduct piracy", "raid a settlement"],                   modules: ["heavy_cannons", "stealth_tech"] },
  { keywords: ["conduct research", "survey a site", "test a technology"], modules: ["research_lab"] },
  { keywords: ["defend against an attack", "patrol an area"],            modules: ["shields", "sensor_array"] },
  { keywords: ["deliver messages or data"],                              modules: ["engine_upgrade"] },
  { keywords: ["establish a settlement"],                                modules: ["expanded_hold", "workshop"] },
  { keywords: ["evacuate a location", "provide shelter"],                modules: ["expanded_hold", "medbay"] },
  { keywords: ["explore a region"],                                      modules: ["sensor_array", "engine_upgrade"] },
  { keywords: ["hunt down another ship"],                                modules: ["sensor_array", "heavy_cannons"] },
  { keywords: ["launch an attack"],                                      modules: ["heavy_cannons", "missile_array"] },
  { keywords: ["provide medical aid", "quarantine a danger", "search and rescue"], modules: ["medbay"] },
  { keywords: ["provide repairs"],                                       modules: ["workshop"] },
  { keywords: ["resupply a settlement"],                                 modules: ["expanded_hold"] },
  { keywords: ["retrieve salvage"],                                      modules: ["grappler", "expanded_hold"] },
  { keywords: ["smuggle cargo"],                                         modules: ["stealth_tech", "expanded_hold"] },
  { keywords: ["transport cargo"],                                       modules: ["expanded_hold"] },
  { keywords: ["transport passengers"],                                  modules: ["expanded_hold", "medbay"] },
]);

/** The 15 canonical Module asset slugs the starforgedassets compendium ships. */
export const CANONICAL_MODULE_SLUGS = Object.freeze([
  "engine_upgrade", "expanded_hold",  "grappler",       "heavy_cannons",
  "internal_refit", "medbay",         "missile_array",  "overseer",
  "reinforced_hull","research_lab",   "sensor_array",   "shields",
  "stealth_tech",   "vehicle_bay",    "workshop",
]);

/**
 * Pick up to `limit` canonical Module slugs that best match a rolled starship
 * identity. Pure — no Foundry / IO. Returns an empty array when nothing
 * matches (e.g. a "Fleet" or "Ships in conflict" identity with no module-
 * specific keywords; the caller then installs nothing, which is the
 * intentional behaviour for those meta-types).
 *
 * Scoring:
 *   - Each rule whose keyword appears in the concatenated rolled text
 *     contributes its modules at +1 weight each.
 *   - The same slug accumulates score across multiple rule matches
 *     (e.g. "Hunter, low-profile, smuggle cargo" lands stealth_tech at 3).
 *   - Ties break by the slug's index in `CANONICAL_MODULE_SLUGS` (stable,
 *     unit-testable order rather than insertion order which depends on
 *     rule arrangement).
 *
 * @param {{ type?: string, firstLook?: string, mission?: string }} rolls
 * @param {{ limit?: number }} [opts]
 * @returns {string[]}  canonical Module asset slugs, length ≤ limit
 */
export function pickModulesForRolledIdentity(rolls = {}, opts = {}) {
  const { type = "", firstLook = "", mission = "" } = rolls;
  const limit = Math.max(0, opts.limit ?? DEFAULT_LIMIT);
  if (limit === 0) return [];

  const text = `${type} ${firstLook} ${mission}`.toLowerCase().trim();
  if (!text) return [];

  const scores = new Map();
  for (const { keywords, modules } of RULES) {
    if (keywords.some(kw => text.includes(kw.toLowerCase()))) {
      for (const slug of modules) {
        scores.set(slug, (scores.get(slug) ?? 0) + 1);
      }
    }
  }

  if (scores.size === 0) return [];

  const canonicalIndex = new Map(CANONICAL_MODULE_SLUGS.map((s, i) => [s, i]));
  return [...scores.entries()]
    .sort(([slugA, scoreA], [slugB, scoreB]) => {
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (canonicalIndex.get(slugA) ?? Infinity) - (canonicalIndex.get(slugB) ?? Infinity);
    })
    .slice(0, limit)
    .map(([slug]) => slug);
}
