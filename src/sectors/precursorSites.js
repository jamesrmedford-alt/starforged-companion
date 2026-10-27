/**
 * STARFORGED COMPANION
 * src/sectors/precursorSites.js — Precursor vaults & derelicts as sector sites.
 *
 * The sector generator builds settlements, planets, and a local connection but
 * never the *sites* a sector's trouble so often points at (precursor vaults,
 * derelicts). This module generates those sites from the canonical Starforged
 * oracle arrays (rulebook "Derelicts" / "Precursor Vaults") and shapes them for
 * createLocation() so they become real `location`-type Actors that sit on the
 * sector map.
 *
 * Sites are placed "unexplored": the player can see something is out there
 * (a dim pin behind an undiscovered passage) but the type, name, and interior
 * stay hidden until the site is discovered — by finishing an expedition toward
 * it, or a manual GM reveal (see src/sectors/siteDiscovery.js). Discovery state
 * lives on the dormant `mapData.discoveries[]` array the original sector scope
 * reserved for exactly this.
 *
 * This module is PURE (no Foundry globals) so the generation, theming, and
 * reveal-selection logic unit-test without a live game. The roll source is
 * injected (defaults to the real oracle roller) the same way the rest of the
 * sector pipeline injects rollD100 / rollTableResult.
 *
 * Source: docs/rules-reference/rulebook-summary.md (Derelicts; Precursor vaults)
 *         docs/rules-reference/playkit-rules-and-coverage.md (oracle arrays)
 */

import { rollOracle as defaultRollOracle } from "../oracles/roller.js";

// Region base site count — lawless frontier carries more wrecks and ruins than
// the settled core (rulebook: the Expanse is the wild edge, the Terminus the
// developed hub). A themed sector trouble adds one of its kind on top.
const SITE_COUNT_BY_REGION = { terminus: 1, outlands: 2, expanse: 3 };

/**
 * Classify a sector trouble as precursor-themed (→ a bonus vault) or
 * derelict-themed (→ a bonus derelict). Returns "vault" | "derelict" | null.
 * Keyword-matched against the SECTOR_TROUBLE table wording; conservative so
 * unrelated trouble adds no themed site.
 *
 * @param {string} trouble
 * @returns {"vault"|"derelict"|null}
 */
export function troubleSiteTheme(trouble) {
  const t = String(trouble ?? "").toLowerCase();
  if (/precursor|ancient|awakening|prophec|dreadful power/.test(t)) return "vault";
  if (/derelict|missing|ghost|abandoned|wreck/.test(t)) return "derelict";
  return null;
}

/**
 * Base site count for a region (no theme boost).
 * @param {string} region
 * @returns {number}
 */
export function siteCountForRegion(region) {
  return SITE_COUNT_BY_REGION[region] ?? 1;
}

/**
 * Plan how many vaults and derelicts a sector gets: a region-scaled base split
 * between the two types, plus one extra of whichever type the trouble implies.
 *
 * @param {string} region
 * @param {string} trouble
 * @returns {{ vault:number, derelict:number }}
 */
export function planSectorSites(region, trouble) {
  const base = siteCountForRegion(region);
  let vault = 0;
  let derelict = 0;
  // Alternate the base allocation starting with derelicts (more common than
  // intact precursor vaults), so a 1-site region leans derelict and a 2-site
  // region gets one of each.
  for (let i = 0; i < base; i++) {
    if (i % 2 === 0) derelict++;
    else vault++;
  }
  const theme = troubleSiteTheme(trouble);
  if (theme === "vault") vault++;
  else if (theme === "derelict") derelict++;
  return { vault, derelict };
}

/** Map an oracle Location result ("Planetside"/"Orbital"/"Deep Space") to a klass. */
function normalizeKlass(location) {
  const l = String(location ?? "").toLowerCase();
  if (l.includes("planet")) return "planetside";
  if (l.includes("orbit")) return "orbital";
  return "deep space";
}

/**
 * Roll a single precursor vault from the canonical exterior + interior oracles.
 * Exterior detail composes the player-facing first look; interior detail is GM
 * prep surfaced on discovery.
 *
 * @param {Function} rollOracle — (tableId) => { result }
 * @returns {Object} site descriptor (no id/status yet)
 */
export function generateVaultSite(rollOracle) {
  const location = rollOracle("vault_location").result;
  const scale    = rollOracle("vault_scale").result;
  const form     = rollOracle("vault_form").result;
  const shape    = rollOracle("vault_shape").result;
  const material = rollOracle("vault_material").result;
  const outer    = rollOracle("vault_outer_look").result;
  const inner    = rollOracle("vault_inner_look").result;
  const purpose  = rollOracle("vault_purpose").result;
  const feature  = rollOracle("vault_feature").result;
  const peril    = rollOracle("vault_peril").result;
  const opp      = rollOracle("vault_opportunity").result;

  const firstLook = `${scale}; ${String(form).toLowerCase()} form, ${String(shape).toLowerCase()}, ${String(material).toLowerCase()}. Outer look: ${outer}.`;
  const description = [
    `A precursor vault in ${String(location).toLowerCase()} space.`,
    `Scale: ${scale}. Form: ${form}. Shape: ${shape}. Material: ${material}.`,
    `Outer first look: ${outer}.`,
    `Interior first look: ${inner}. Apparent purpose: ${purpose}.`,
  ].join(" ");

  return {
    type: "vault",
    name: `Precursor Vault — ${form}`,
    klass: normalizeKlass(location),
    firstLook,
    feature,
    peril,
    opportunity: opp,
    description,
    details: { location, scale, form, shape, material, outer, inner, purpose },
  };
}

/**
 * Pick the location-appropriate derelict type table (SITE-TYPE-TABLE-MISMATCH
 * fix, 2026-07): canonically the type weights vary by where the derelict sits
 * — planetside wrecks skew settlement, deep-space ones skew starship. Pure —
 * exported for unit testing.
 *
 * @param {string} location — rolled "Planetside" | "Orbital" | "Deep Space"
 * @returns {string} oracle table id
 */
export function derelictTypeTableFor(location) {
  const l = String(location ?? "").toLowerCase();
  if (l.includes("planet")) return "derelict_type_planetside";
  if (l.includes("orbit"))  return "derelict_type_orbital";
  return "derelict_type";
}

/**
 * Roll a single derelict from the canonical oracles.
 *
 * @param {Function} rollOracle — (tableId) => { result }
 * @returns {Object} site descriptor (no id/status yet)
 */
export function generateDerelictSite(rollOracle) {
  const location  = rollOracle("derelict_location").result;
  const type      = rollOracle(derelictTypeTableFor(location)).result;  // "Derelict starship" | "Derelict settlement"
  const condition = rollOracle("derelict_condition").result;
  const outer     = rollOracle("derelict_outer_look").result;
  const inner     = rollOracle("derelict_inner_look").result;
  const zoneTable = String(type).toLowerCase().includes("settlement")
    ? "derelict_zone_settlement"
    : "derelict_zone_starship";
  const zone = rollOracle(zoneTable).result;

  const firstLook = `${condition}. Outer look: ${outer}.`;
  const description = [
    `A ${String(type).toLowerCase()} in ${String(location).toLowerCase()} space.`,
    `Condition: ${condition}.`,
    `Outer first look: ${outer}. Inner first look: ${inner}.`,
    `Notable zone: ${zone}.`,
  ].join(" ");

  // Title-case the oracle "Derelict starship/settlement" wording for the name.
  const name = String(type).replace(/\b\w/g, c => c.toUpperCase());

  return {
    type: "derelict",
    name,
    klass: normalizeKlass(location),
    firstLook,
    feature: inner,
    peril: "",
    opportunity: "",
    description,
    details: { location, type, condition, outer, inner, zone },
  };
}

/** Disambiguate repeated names within one sector ("Derelict Starship", "… II"). */
function dedupeNames(sites) {
  const counts = {};
  const seen = {};
  for (const s of sites) counts[s.name] = (counts[s.name] ?? 0) + 1;
  return sites.map(s => {
    if (counts[s.name] <= 1) return s;
    seen[s.name] = (seen[s.name] ?? 0) + 1;
    const numeral = ["I", "II", "III", "IV", "V", "VI"][seen[s.name] - 1] ?? String(seen[s.name]);
    return { ...s, name: `${s.name} ${numeral}` };
  });
}

/**
 * Generate the full set of sites for a sector: region-scaled, trouble-boosted,
 * each rolled from the canonical oracles and stamped unexplored.
 *
 * @param {string} region
 * @param {string} trouble
 * @param {Object} [opts]
 * @param {Function} [opts.rollOracle] — injected roll source (defaults to real roller)
 * @returns {Array<Object>} site descriptors with id/status/discovered set
 */
export function generateSectorSites(region, trouble, { rollOracle = defaultRollOracle } = {}) {
  const plan = planSectorSites(region, trouble);
  const raw = [];
  for (let i = 0; i < plan.derelict; i++) raw.push(generateDerelictSite(rollOracle));
  for (let i = 0; i < plan.vault; i++)    raw.push(generateVaultSite(rollOracle));

  return dedupeNames(raw).map(s => ({
    id: generateId(),
    ...s,
    status: "unexplored",
    discovered: false,
  }));
}

/**
 * Shape a site descriptor for createLocation(). Sites are canonical (like
 * sector settlements) so narrator entity-discovery never overwrites them.
 *
 * @param {Object} site   — a generateSectorSites() descriptor
 * @param {Object} sector — the SectorResult (for region label + sectorId)
 * @returns {Object} createLocation data payload
 */
export function buildSiteLocationData(site, sector) {
  return {
    name:            site.name,
    type:            site.type,                 // → system.subtype ("vault" | "derelict")
    region:          sector?.regionLabel ?? sector?.region ?? "",
    status:          site.status ?? "unexplored",
    firstLook:       site.firstLook ?? "",
    feature:         site.feature ?? "",
    peril:           site.peril ?? "",
    opportunity:     site.opportunity ?? "",
    description:     site.description ?? "",
    sectorId:        sector?.id ?? null,
    canonicalLocked: true,
  };
}

/** Normalise a destination/site label for matching ("The Vault" ≈ "vault"). */
function normalizeLabel(s) {
  return String(s ?? "").trim().toLowerCase().replace(/^the\s+/, "");
}

/**
 * Choose the site a reveal, a clear or an expedition link targets, across
 * every stored sector. Mirrors selectExpeditionTrack's matching ladder —
 * exact name → substring (either direction) → type keyword (vault/derelict)
 * when one eligible site of that type remains → the sole eligible site — but
 * runs each rung over ALL sectors before the next, weaker one, so a guess in
 * an earlier sector can never preempt an exact match in a later one (issue
 * #300 F07). An explicit site id (the expedition→site link) beats every rung.
 * The two guessing rungs try the active sector first, then every sector, and
 * fire only when unambiguous.
 *
 * @param {Array<{id, mapData?: {discoveries?: Array}}>} sectors — campaignState.sectors
 * @param {string|null} label — the expedition destination / command target
 * @param {Object} [opts]
 * @param {(site: Object) => boolean} [opts.eligible] — which sites qualify
 *   (default: undiscovered; clearing passes discovered-and-not-cleared)
 * @param {string|null} [opts.siteId] — an exact link, tried first
 * @param {string|null} [opts.activeSectorId] — scopes the guessing rungs first
 * @param {boolean} [opts.requireLabelMatch] — true skips the sole-site guess,
 *   so only a name/type-confident match returns. Used when STAMPING an
 *   expedition→site link at creation (a guess there would tie unrelated
 *   expeditions to the one remaining site); reveal and clear keep the guess.
 * @returns {{ sector: Object, site: Object }|null}
 */
export function selectSectorSite(sectors, label, {
  eligible = (site) => !site.discovered,
  siteId = null,
  activeSectorId = null,
  requireLabelMatch = false,
} = {}) {
  const candidates = [];
  for (const sector of sectors ?? []) {
    for (const site of sector?.mapData?.discoveries ?? []) {
      if (site && eligible(site)) candidates.push({ sector, site });
    }
  }
  if (!candidates.length) return null;

  if (siteId) {
    const linked = candidates.find(c => c.site.id === siteId);
    if (linked) return linked;
  }

  const want = normalizeLabel(label);
  if (want) {
    const exact = candidates.find(c => normalizeLabel(c.site.name) === want);
    if (exact) return exact;

    const sub = candidates.find(c => {
      const n = normalizeLabel(c.site.name);
      return n && (n.includes(want) || want.includes(n));
    });
    if (sub) return sub;
  }

  const kinds = [
    ...(/vault|precursor/.test(want)     ? ["vault"]    : []),
    ...(/derelict|wreck|ghost/.test(want) ? ["derelict"] : []),
  ];
  const active = candidates.filter(c => activeSectorId && c.sector?.id === activeSectorId);
  for (const scope of [active, candidates]) {
    if (!scope.length) continue;
    for (const kind of kinds) {
      const ofKind = scope.filter(c => c.site.type === kind);
      if (ofKind.length === 1) return ofKind[0];
    }
    if (!requireLabelMatch && scope.length === 1) return scope[0];
  }
  return null;
}

function generateId() {
  try { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}
