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

import { uploadedPath } from "../net/uploadResult.js";

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

async function ensureDir(dir) {
  try {
    await foundry.applications.apps.FilePicker.implementation.createDirectory("data", dir, {});
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
  if (typeof hash !== "string" || hash.length !== 64) return null;
  // Skip the browse for a clip we already resolved this session.
  const memoed = _lookupMemo.get(hash);
  if (memoed) return memoed;
  const { dir, filename } = pathFor(hash);
  try {
    const browse = await foundry.applications.apps.FilePicker.implementation.browse("data", dir);
    const files  = Array.isArray(browse?.files) ? browse.files : [];
    // Return the listing's path directly. On native Foundry this is the
    // local relative path; on The Forge it's the absolute assets.forge-vtt.com
    // URL where the file actually lives. Either way, the string here is the
    // one foundry.audio.Sound can load.
    const hit = files.find(f => typeof f === "string" && f.endsWith(`/${filename}`)) ?? null;
    if (hit) _lookupMemo.set(hash, hit);   // memoise positives only
    return hit;
  } catch {
    // Directory doesn't exist yet, or permissions error — both are misses.
    return null;
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
  const response = await foundry.applications.apps.FilePicker.implementation.upload(
    "data", dir, file, {}, { notify: false },
  );
  // On The Forge, FilePicker.upload stores the file in the user's Assets
  // Library and returns the absolute https://assets.forge-vtt.com/... URL
  // in response.path — the constructed local `full` path does not exist
  // server-side and would 404 on playback. Prefer the response path when
  // present; fall back to the local path on native Foundry (where upload
  // may return { path: full } or an undefined value depending on version).
  // A failed upload (false / undefined / {}) stored nothing: no path (issue #322 V26).
  return uploadedPath(response, full);
}

