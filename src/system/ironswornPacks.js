/**
 * STARFORGED COMPANION
 * src/system/ironswornPacks.js — Canonical compendium lookup
 *
 * Foundry-ironsworn ships ~1,700 documents across compendium packs. Phases 6–8
 * read from these packs to ground the move interpreter, spawn canonical
 * encounters, and inject campaign truths into narrator context.
 *
 * Behaviour:
 *   - Lookups never throw — null is returned when the pack, document, or
 *     index is unavailable.
 *   - Documents are cached in-memory per session: packs do not change at
 *     runtime, and re-resolving a slug or name across multiple narrator
 *     calls is wasteful.
 *   - All callers MUST handle the null return path.
 */

export const IS_PACKS = Object.freeze({
  STARFORGED_MOVES:      "foundry-ironsworn.starforged-moves",
  STARFORGED_ORACLES:    "foundry-ironsworn.starforged-oracles",
  STARFORGED_TRUTHS:     "foundry-ironsworn.starforged-truths",
  STARFORGED_ENCOUNTERS: "foundry-ironsworn.starforged-encounters",
  STARFORGED_ASSETS:     "foundry-ironsworn.starforged-assets",
  FOE_ACTORS_SF:         "foundry-ironsworn.foe-actors-sf",
  IRONSWORN_MOVES:       "foundry-ironsworn.ironsworn-moves",
  IRONSWORN_ORACLES:     "foundry-ironsworn.ironsworn-oracles",
});

const ALL_MOVE_PACKS = [
  IS_PACKS.STARFORGED_MOVES,
  IS_PACKS.IRONSWORN_MOVES,
];

const ALL_ORACLE_PACKS = [
  IS_PACKS.STARFORGED_ORACLES,
  IS_PACKS.IRONSWORN_ORACLES,
];

// ─────────────────────────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────────────────────────

const _docCache = new Map(); // cacheKey → resolved Document (or explicit null)

function cacheKey(kind, slug, packs) {
  return `${kind}::${slug}::${(packs ?? []).join(",")}`;
}

/** Test-only — drop the in-memory document cache. */
export function _clearPackCache() { _docCache.clear(); }

// ─────────────────────────────────────────────────────────────────────────────
// PACK ACCESS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getPack(packId) {
  try {
    return globalThis.game?.packs?.get?.(packId) ?? null;
  } catch (err) {
    console.warn(`starforged-companion | ironswornPacks: getPack(${packId}) failed:`, err);
    return null;
  }
}

async function getIndex(pack) {
  if (!pack) return null;
  try {
    if (pack.index?.size) return pack.index;
    if (typeof pack.getIndex === "function") return await pack.getIndex();
    return pack.index ?? null;
  } catch (err) {
    console.warn(`starforged-companion | ironswornPacks: index load failed:`, err);
    return null;
  }
}

function nameToSlug(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function slugMatchesEntry(slug, entry) {
  if (!entry) return false;
  const target = nameToSlug(slug);
  if (!target) return false;
  if (entry.flags?.["foundry-ironsworn"]?.dfid) {
    const dfid = String(entry.flags["foundry-ironsworn"].dfid);
    if (dfid.toLowerCase().endsWith(`/${target}`) || dfid.toLowerCase() === target) return true;
  }
  if (entry.system?.dfid) {
    const dfid = String(entry.system.dfid).toLowerCase();
    if (dfid.endsWith(`/${target}`) || dfid === target) return true;
  }
  return nameToSlug(entry.name) === target;
}

async function findInPacks(slug, packIds, kind) {
  const key = cacheKey(kind, slug, packIds);
  if (_docCache.has(key)) return _docCache.get(key);

  for (const packId of packIds) {
    const pack = getPack(packId);
    if (!pack) continue;
    const index = await getIndex(pack);
    if (!index) continue;
    let match = null;
    try {
      // index may be a Collection (Map-like) or array — both expose .find
      match = (typeof index.find === "function")
        ? index.find(e => slugMatchesEntry(slug, e))
        : Array.from(index).find(e => slugMatchesEntry(slug, e));
    } catch (err) {
      console.warn(`starforged-companion | ironswornPacks: index search failed in ${packId}:`, err);
      continue;
    }
    if (!match) continue;
    try {
      const doc = await pack.getDocument(match._id ?? match.id);
      if (doc) {
        _docCache.set(key, doc);
        return doc;
      }
    } catch (err) {
      console.warn(`starforged-companion | ironswornPacks: getDocument failed for ${match._id}:`, err);
    }
  }

  _docCache.set(key, null);
  return null;
}

async function findByNameInPack(name, packId, kind) {
  const key = cacheKey(`${kind}-name`, name, [packId]);
  if (_docCache.has(key)) return _docCache.get(key);

  const pack = getPack(packId);
  if (!pack) { _docCache.set(key, null); return null; }
  const index = await getIndex(pack);
  if (!index) { _docCache.set(key, null); return null; }

  const target = String(name ?? "").trim().toLowerCase();
  let match = null;
  try {
    const finder = (e) => String(e?.name ?? "").trim().toLowerCase() === target;
    match = (typeof index.find === "function")
      ? index.find(finder)
      : Array.from(index).find(finder);
  } catch (err) {
    console.warn(`starforged-companion | ironswornPacks: name search failed in ${packId}:`, err);
    _docCache.set(key, null);
    return null;
  }

  if (!match) { _docCache.set(key, null); return null; }

  try {
    const doc = await pack.getDocument(match._id ?? match.id);
    _docCache.set(key, doc ?? null);
    return doc ?? null;
  } catch (err) {
    console.warn(`starforged-companion | ironswornPacks: getDocument failed for ${match._id}:`, err);
    _docCache.set(key, null);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find a Move Item by slug across the configured move packs (Starforged first).
 * @param {string} slug — e.g. "pay_the_price" or "pay-the-price"
 * @param {string[]} [packIds]
 * @returns {Promise<Object|null>}
 */
export async function getCanonicalMove(slug, packIds = ALL_MOVE_PACKS) {
  if (!slug) return null;
  return findInPacks(slug, packIds, "move");
}

/**
 * Find a RollTable / oracle by slug across the configured oracle packs.
 * @param {string} slug
 * @param {string[]} [packIds]
 * @returns {Promise<Object|null>}
 */
export async function getCanonicalOracle(slug, packIds = ALL_ORACLE_PACKS) {
  if (!slug) return null;
  return findInPacks(slug, packIds, "oracle");
}

/**
 * Find an encounter Actor by name in the Starforged foe pack.
 * Encounters are best searched by name since slugs vary across editions.
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
export async function getCanonicalEncounterActor(name) {
  if (!name) return null;
  return findByNameInPack(name, IS_PACKS.FOE_ACTORS_SF, "encounter");
}

/**
 * Return a list of {id, name} for every encounter in the Starforged foe pack.
 * Does NOT load the full Actor documents — only the index. Use this to
 * power suggest / autocomplete UIs in chat commands.
 *
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function listCanonicalEncounters() {
  const pack = getPack(IS_PACKS.FOE_ACTORS_SF);
  if (!pack) return [];
  const index = await getIndex(pack);
  if (!index) return [];
  try {
    const arr = Array.from(index).map(e => ({ id: e._id ?? e.id, name: e.name }));
    arr.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
    return arr;
  } catch (err) {
    console.warn(`starforged-companion | ironswornPacks: listCanonicalEncounters failed:`, err);
    return [];
  }
}

/**
 * Return every JournalEntry document in the starforged-truths pack.
 * Used by Phase 8 to digest selected campaign truths into narrator context.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function listCanonicalTruths() {
  const pack = getPack(IS_PACKS.STARFORGED_TRUTHS);
  if (!pack) return [];
  const index = await getIndex(pack);
  if (!index) return [];
  const docs = [];
  for (const entry of Array.from(index)) {
    try {
      const doc = await pack.getDocument(entry._id ?? entry.id);
      if (doc) docs.push(doc);
    } catch (err) {
      console.warn(`starforged-companion | ironswornPacks: truth load failed for ${entry._id}:`, err);
    }
  }
  return docs;
}
