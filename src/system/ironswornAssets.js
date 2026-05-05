/**
 * STARFORGED COMPANION
 * src/system/ironswornAssets.js — Runtime path constants for foundry-ironsworn
 *
 * Single point of truth for every system-asset reference in the module.
 * If foundry-ironsworn relocates assets in a future version, this is the
 * one file to update.
 *
 * Vendor source layout: vendor/foundry-ironsworn/system/...
 * At install time the system/ source folder becomes the package root, so
 * runtime paths strip that segment:
 *   vendor/foundry-ironsworn/system/assets/X → systems/foundry-ironsworn/assets/X
 *
 * All consumers MUST go through this module — never inline the prefix.
 */

export const IS_SYSTEM_ID = "foundry-ironsworn";
export const IS_BASE      = `systems/${IS_SYSTEM_ID}/assets`;

export const IS_PATHS = Object.freeze({
  PLANETS:    `${IS_BASE}/planets`,
  STELLAR:    `${IS_BASE}/stellar-objects`,
  STARSHIPS:  `${IS_BASE}/starships`,
  LOCATIONS:  `${IS_BASE}/locations`,
  ASSETS:     `${IS_BASE}/assets`,
  ORACLES:    `${IS_BASE}/oracles`,
  SECTORS:    `${IS_BASE}/sectors`,
  ICONS:      `${IS_BASE}/icons`,
  DICE:       `${IS_BASE}/dice`,
  MISC:       `${IS_BASE}/misc`,
});

// ─────────────────────────────────────────────────────────────────────────────
// AVAILABILITY PROBE
// ─────────────────────────────────────────────────────────────────────────────

let _availabilityCache = null;

/**
 * Probe whether the foundry-ironsworn system is installed and active.
 * Cached after first call. Used by every consumer to decide whether to
 * use a system asset or fall back to module-bundled placeholders.
 *
 * Detection is intentionally lightweight — checks game.system.id, then
 * game.systems for the ironsworn id. We do not perform a network probe
 * because Foundry's filesystem layer rejects HEAD requests on assets
 * paths in some configurations.
 *
 * @returns {Promise<boolean>}
 */
export async function isIronswornAvailable() {
  if (_availabilityCache !== null) return _availabilityCache;

  try {
    const sysId = globalThis.game?.system?.id;
    if (sysId === IS_SYSTEM_ID) {
      _availabilityCache = true;
      return true;
    }
    const known = globalThis.game?.systems;
    if (known?.get?.(IS_SYSTEM_ID)) {
      _availabilityCache = true;
      return true;
    }
  } catch (err) {
    console.warn(`starforged-companion | isIronswornAvailable probe failed:`, err);
  }

  _availabilityCache = false;
  return false;
}

/** Reset the availability cache. Test-only. */
export function _resetIronswornAvailabilityCache() {
  _availabilityCache = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STARSHIP ICON PICKER (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

// foundry-ironsworn ships 15 numbered starship .webp tokens. The exact filenames
// follow the pattern Starforged-Starship-Token-NN.webp where NN is 01..15.
const STARSHIP_TOKEN_COUNT = 15;

/**
 * Hash a string to a non-negative integer. Stable across sessions —
 * the same input always produces the same output. djb2-style hash, kept
 * small and deterministic.
 *
 * @param {string} s
 * @returns {number}
 */
function stableHash(s) {
  let h = 5381;
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick a deterministic starship token from the available designs.
 * Same seed → same token, every time. Useful for token art on
 * narrator-introduced ships and player-created starship Actors.
 *
 * @param {string} seed — typically the ship name or actor ID
 * @returns {string}    — runtime path to the .webp under IS_PATHS.STARSHIPS
 */
export function pickStarshipIcon(seed) {
  const idx = (stableHash(seed) % STARSHIP_TOKEN_COUNT) + 1;
  const num = String(idx).padStart(2, "0");
  return `${IS_PATHS.STARSHIPS}/Starforged-Starship-Token-${num}.webp`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCATION BACKGROUND RESOLVER (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filename patterns for location backgrounds. Confirmed against the
 * foundry-ironsworn assets/locations/ tree:
 *   Kirin/{Settlement,Vault,Derelict}-{DeepSpace,Orbital,Planetside}.svg
 *   Rains/{Settlement,Vault,Derelict}-{DeepSpace,Orbital,Planetside}.webp
 *   Root/{Settlement,Vault,Derelict}-{DeepSpace,Orbital,Planetside}.webp
 */
const LOCATION_CATEGORY_LABELS = {
  settlement: "Settlement",
  vault:      "Vault",
  derelict:   "Derelict",
};

const LOCATION_ENVIRONMENT_LABELS = {
  "deep-space": "DeepSpace",
  orbital:     "Orbital",
  planetside:  "Planetside",
};

const LOCATION_SET_EXTENSIONS = {
  Kirin: "svg",
  Rains: "webp",
  Root:  "webp",
};

function buildLocationPath(set, category, environment) {
  const cat = LOCATION_CATEGORY_LABELS[category];
  const env = LOCATION_ENVIRONMENT_LABELS[environment];
  const ext = LOCATION_SET_EXTENSIONS[set];
  if (!cat || !env || !ext) return null;
  return `${IS_PATHS.LOCATIONS}/${set}/${cat}-${env}.${ext}`;
}

/**
 * Resolve a system-bundled location background for a category × environment.
 * Honours the user's preferred art set:
 *   - "kirin" — illustrated set only
 *   - "rains" — photorealistic set only
 *   - "auto"  — kirin first, fall back to rains, then root (default)
 *
 * Returns null when category or environment are unrecognised.
 *
 * @param {"settlement"|"vault"|"derelict"} category
 * @param {"deep-space"|"orbital"|"planetside"} environment
 * @param {"kirin"|"rains"|"auto"} [preference="auto"]
 * @returns {string|null}
 */
export function resolveLocationArt(category, environment, preference = "auto") {
  if (!LOCATION_CATEGORY_LABELS[category])      return null;
  if (!LOCATION_ENVIRONMENT_LABELS[environment]) return null;

  if (preference === "kirin") return buildLocationPath("Kirin", category, environment);
  if (preference === "rains") return buildLocationPath("Rains", category, environment);

  // auto — Kirin first, then Rains, then Root
  return buildLocationPath("Kirin", category, environment)
      ?? buildLocationPath("Rains", category, environment)
      ?? buildLocationPath("Root",  category, environment);
}

// ─────────────────────────────────────────────────────────────────────────────
// PLANET / STELLAR HELPERS (used by sceneBuilder.js)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a Starforged PLANET_TYPE oracle result string to its bundled token path.
 * Returns a generic icon when the type has no confirmed system asset
 * (e.g. "Tainted World").
 */
export function iconForPlanetType(type) {
  const typeMap = {
    "Desert World":    `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Desert-01.webp`,
    "Furnace World":   `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Furnace-01.webp`,
    "Grave World":     `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Grave-01.webp`,
    "Ice World":       `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Ice-01.webp`,
    "Jovian World":    `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Jovian-01.webp`,
    "Jungle World":    `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Jungle-01.webp`,
    "Ocean World":     `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Ocean-01.webp`,
    "Rocky World":     `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Rocky-01.webp`,
    "Shattered World": `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Shattered-01.webp`,
    "Vital World":     `${IS_PATHS.PLANETS}/Starforged-Planet-Token-Vital-01.webp`,
  };
  return typeMap[type] ?? "icons/svg/circle.svg";
}

/**
 * Map a Starforged STELLAR_OBJECT oracle result string to its bundled
 * stellar-token path. Falls back to a generic icon for results that have
 * no confirmed asset (e.g. the artificial-star variant).
 */
export function iconForStellarObject(oracleResult) {
  const stellarMap = {
    "Smoldering red star":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Red-Star-01.webp`,
    "Glowing orange star":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Orange-Star-01.webp`,
    "Burning yellow star":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Yellow-Star-01.webp`,
    "Blazing blue star":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Blue-Star-01.webp`,
    "Young star incubating in a molecular cloud":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Star-In-Incubating-Cloud-01.webp`,
    "White dwarf shining with spectral light":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-White-Dwarf-01.webp`,
    "Corrupted star radiating with unnatural light":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Corrupted-Star-01.webp`,
    "Neutron star surrounded by intense magnetic fields":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Neutron-Star-01.webp`,
    "Two stars in close orbit connected by fiery tendrils of energy":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Binary-Star-01.webp`,
    "Black hole allows nothing to escape—not even light":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Black-Hole-01.webp`,
    "Hypergiant star generating turbulent solar winds":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Hypergiant-01.webp`,
    "Unstable star showing signs of impending supernova":
      `${IS_PATHS.STELLAR}/Starforged-Stellar-Token-Unstable-Star-01.webp`,
  };
  const key = Object.keys(stellarMap).find(
    k => k.toLowerCase() === oracleResult?.toLowerCase()
  );
  return key ? stellarMap[key] : "icons/svg/sun.svg";
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT / METER / ICON RESOLVERS (Phase 9)
// ─────────────────────────────────────────────────────────────────────────────

const STAT_ICON_FILES = {
  edge:   "edge.svg",
  heart:  "heart.svg",
  iron:   "iron.svg",
  shadow: "shadow.svg",
  wits:   "wits.svg",
};

/**
 * Resolve a stat icon path. Returns null for unknown slugs so the caller
 * can choose whether to render a placeholder or skip the icon entirely.
 *
 * @param {"edge"|"heart"|"iron"|"shadow"|"wits"} slug
 * @returns {string|null}
 */
export function statIcon(slug) {
  const file = STAT_ICON_FILES[slug];
  return file ? `${IS_PATHS.ICONS}/${file}` : null;
}

/**
 * Resolve an asset card icon by category. Returns null for unknown categories.
 *
 * @param {"command_vehicle"|"companion"|"path"|"combat_talent"|"module"|"support_vehicle"|"deed"} category
 * @returns {string|null}
 */
export function assetIcon(category) {
  const cleaned = String(category ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (!cleaned) return null;
  return `${IS_PATHS.ASSETS}/${cleaned}.svg`;
}

/**
 * Resolve an oracle category icon. The system's oracle SVGs are filed under
 * IS_PATHS.ORACLES with kebab-case names matching oracle category slugs.
 *
 * @param {string} category — e.g. "action_oracle", "planet_type"
 * @returns {string|null}
 */
export function oracleIcon(category) {
  const cleaned = String(category ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (!cleaned) return null;
  return `${IS_PATHS.ORACLES}/${cleaned}.svg`;
}
