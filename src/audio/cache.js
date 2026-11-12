/**
 * STARFORGED COMPANION
 * src/audio/cache.js — content-addressed audio cache
 *
 * Mirrors the sector-art persistence pattern (`src/sectors/sectorArt.js`):
 * files live under `worlds/${world.id}/audio/` so they persist across
 * module updates and reinstalls and are included in Foundry world
 * exports. Decision: `docs/decisions.md` "Sector background art storage".
 *
 * Cache key = sha256 of (text, voiceId, modelId, speed[2dp]). Two-level
 * directory fanout keeps any single directory under a few thousand
 * entries even at large campaign scale.
 *
 * World-scoped FilePicker writes require GM permissions per CLAUDE.md
 * "Architecture constraints". `write()` does not enforce this — callers
 * decide; for v1 the player client generates audio and the GM client
 * commits to cache via socket relay (see src/audio/index.js).
 */

import { uploadedPath, withFilePickerDeadline } from "../net/uploadResult.js";

const MODULE_ID = "starforged-companion";

// In-memory positive-lookup memo (hash → resolved path). Repeated plays and
// chat re-renders of the same clip otherwise re-hit FilePicker.browse, which is
// an assets/browse API call on The Forge. Positives only. Lifetime = page load.
//
// The cache is never trimmed: Foundry v13's client FilePicker has no delete,
// so the size-cap sweep (evictIfOverflow, with its `audio.cacheMaxBytes`
// setting) could only browse every subdirectory and HEAD every clip — on The
// Forge with sizes that read 0 — and delete nothing. It was removed (issue
// #322 V16); a GM empties worlds/<world>/audio/ by hand.
const _lookupMemo = new Map();

/** Test-only — reset the in-memory lookup memo. */
export function _resetAudioCacheStateForTests() {
  _lookupMemo.clear();
}

/**
 * Compute the cache key for a single audio segment.
 *
 * @param {Object} args
 * @param {string} args.text     — segment text exactly as it will be sent to TTS
 * @param {string} args.voiceId
 * @param {string} args.modelId
 * @param {number} args.speed
 * @returns {Promise<string>} 64-char lowercase hex sha256
 */
export async function cacheKey({ text, voiceId, modelId, speed }) {
  const speedStr = Number(speed ?? 1.0).toFixed(2);
  const payload  = `${text}\x00${voiceId}\x00${modelId}\x00${speedStr}`;
  const bytes    = new TextEncoder().encode(payload);
  const digest   = await crypto.subtle.digest("SHA-256", bytes);
  const hexChars = [];
  const view     = new Uint8Array(digest);
  for (let i = 0; i < view.length; i++) {
    hexChars.push(view[i].toString(16).padStart(2, "0"));
  }
  return hexChars.join("");
}

function pathFor(hash) {
  const worldId = globalThis.game?.world?.id;
  if (!worldId) throw new Error("audio cache: game.world.id unavailable");
  const dir = `worlds/${worldId}/audio/${hash.slice(0, 2)}`;
  return { dir, filename: `${hash}.mp3`, full: `${dir}/${hash}.mp3` };
}

// The Forge's Assets Library: where its FilePicker.upload stores a file and
// the URL its browse listing names (write / lookupDetailed below).
const FORGE_ASSETS_ORIGIN = "https://assets.forge-vtt.com/";

/**
 * Is this world running on The Forge? The Forge's own client module says so
 * (`ForgeVTT.usingTheForge` — docs/foundry-reference/foundry-api-reference.md,
 * "Checking if running on The Forge"); a page served from a forge-vtt.com host
 * is one too. Only there can the GM's cache name an Assets Library URL.
 *
 * @returns {boolean}
 */
function runningOnTheForge() {
  try {
    if (globalThis.ForgeVTT?.usingTheForge === true) return true;
    const host = String(globalThis.location?.hostname ?? "").toLowerCase();
    return host === "forge-vtt.com" || host.endsWith(".forge-vtt.com");
  } catch {
    return false;
  }
}

/**
 * Whether `path` is one this cache can name for the clip `hash` — what
 * `write` returns and `lookupDetailed` finds: the world's own
 * `worlds/<world>/audio/<xx>/<hash>.mp3` (pathFor), or an Assets Library URL
 * ending in `/<hash>.mp3` (what The Forge's upload and browse answer with). A
 * path that comes back over the socket (the GM's `audio.synth.done` /
 * `audio.cache.found`) is played only when it is one: the socket does not say
 * who sent it, and a Sound loads any URL (issue #337 Y42).
 *
 * The Assets Library branch holds only in a world running on The Forge
 * (runningOnTheForge — known-issues AUDIO-FORGE-ANY-WORLD). What it cannot
 * bind there (known-issues AUDIO-FORGE-ORIGIN-SHARED): the Assets Library
 * origin is every Forge account's, so a user of the world with a Forge
 * account of their own can upload a file named `<hash>.mp3` to their library
 * and send its URL, and it passes. Nothing here tells the GM's library from
 * theirs. This module never builds a Forge URL — `write`
 * returns the upload response's and `lookupDetailed` the browse listing's,
 * whatever their layout — so it does not establish that one ends in the
 * world's `worlds/<world>/audio/<xx>/<hash>.mp3`. Requiring that ending waits
 * on a live Forge world showing the layout, and would still pass another
 * account's file kept at the same path: only the GM's own library prefix
 * would bind it.
 *
 * @param {string} hash
 * @param {*} path
 * @returns {boolean}
 */
export function isCachePathFor(hash, path) {
  if (typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash) || typeof path !== "string") return false;
  if (globalThis.game?.world?.id && path === pathFor(hash).full) return true;
  // An Assets Library URL only in a world on The Forge: a self-hosted world's
  // cache can never name one, and accepting it there let any user's own
  // Forge-hosted file stand in for a clip (known-issues AUDIO-FORGE-ANY-WORLD).
  if (!runningOnTheForge()) return false;
  return path.startsWith(FORGE_ASSETS_ORIGIN) && path.endsWith(`/${hash}.mp3`);
}

async function ensureDir(dir) {
  try {
    await withFilePickerDeadline(foundry.applications.apps.FilePicker.implementation.createDirectory("data", dir, {}),
      { label: "Audio cache: creating a clip folder" });
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (!/exists/i.test(msg)) {
      console.warn(`${MODULE_ID} | audio cache: createDirectory(${dir}) failed:`, err);
    }
  }
}

/**
 * Look up a cached audio file by hash. Returns the relative path the
 * caller can pass to foundry.audio.Sound (which accepts Foundry-relative
 * paths in addition to absolute URLs), or null when the file is absent.
 *
 * @param {string} hash
 * @returns {Promise<string|null>}
 */
export async function lookup(hash) {
  return (await lookupDetailed(hash)).path;
}

/**
 * lookup(), and whether this client could read the cache directory at all.
 * `browsed: false` means the browse threw — the directory does not exist
 * yet, or this user may not browse (FilePicker "Use File Browser" is Trusted
 * Player and above), which lookup() reads as a miss. A keyed default Player
 * then asks the canonical GM for the clip before paying for a new one (issue
 * #326 W79).
 *
 * @param {string} hash
 * @returns {Promise<{ path: string|null, browsed: boolean }>}
 */
export async function lookupDetailed(hash) {
  if (typeof hash !== "string" || hash.length !== 64) return { path: null, browsed: true };
  // Skip the browse for a clip we already resolved this session.
  const memoed = _lookupMemo.get(hash);
  if (memoed) return { path: memoed, browsed: true };
  const { dir, filename } = pathFor(hash);
  try {
    // Bounded: a browse the server never answers is a miss, never a wait for
    // good (issue #347 AB02).
    const browse = await withFilePickerDeadline(foundry.applications.apps.FilePicker.implementation.browse("data", dir),
      { label: "Audio cache lookup" });
    const files  = Array.isArray(browse?.files) ? browse.files : [];
    // Return the listing's path directly. On native Foundry this is the
    // local relative path; on The Forge it's the absolute assets.forge-vtt.com
    // URL where the file actually lives. Either way, the string here is the
    // one foundry.audio.Sound can load.
    const hit = files.find(f => typeof f === "string" && f.endsWith(`/${filename}`)) ?? null;
    if (hit) _lookupMemo.set(hash, hit);   // memoise positives only
    return { path: hit, browsed: true };
  } catch {
    // Directory doesn't exist yet, or permissions error — both are misses.
    return { path: null, browsed: false };
  }
}

/**
 * Write an audio file to the cache. Returns the relative path.
 *
 * @param {string} hash
 * @param {ArrayBuffer|Uint8Array|Blob} bytes
 * @returns {Promise<string>}
 */
export async function write(hash, bytes) {
  if (typeof hash !== "string" || hash.length !== 64) {
    throw new Error("audio cache: invalid hash");
  }
  const { dir, filename, full } = pathFor(hash);
  await ensureDir(dir);

  let blob;
  if (bytes instanceof Blob) {
    blob = bytes;
  } else if (bytes instanceof ArrayBuffer) {
    blob = new Blob([bytes], { type: "audio/mpeg" });
  } else if (bytes && typeof bytes === "object" && ArrayBuffer.isView(bytes)) {
    blob = new Blob([bytes.buffer], { type: "audio/mpeg" });
  } else {
    throw new Error("audio cache: write() requires ArrayBuffer, Uint8Array, or Blob");
  }

  const file = new File([blob], filename, { type: "audio/mpeg" });
  // Bounded: an upload the server never answers throws, as a refused one
  // fails — the audio GM's in-flight entry for the clip is cleared and its
  // bytes kept for the retry, instead of every later request and Play joining
  // a wait that never ends (issue #347 AB02).
  const response = await withFilePickerDeadline(foundry.applications.apps.FilePicker.implementation.upload(
    "data", dir, file, {}, { notify: false },
  ), { label: "Audio cache upload" });
  // On The Forge, FilePicker.upload stores the file in the user's Assets
  // Library and returns the absolute https://assets.forge-vtt.com/... URL
  // in response.path — the constructed local `full` path does not exist
  // server-side and would 404 on playback. Prefer the response path when
  // present; fall back to the local path on native Foundry (where upload
  // may return { path: full } or an undefined value depending on version).
  // A failed upload (false / undefined / {}) stored nothing: no path (issue #322 V26).
  return uploadedPath(response, full);
}

