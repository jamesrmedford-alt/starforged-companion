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

const MODULE_ID = "starforged-companion";

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
  const { dir, filename } = pathFor(hash);
  try {
    const browse = await foundry.applications.apps.FilePicker.implementation.browse("data", dir);
    const files  = Array.isArray(browse?.files) ? browse.files : [];
    // Return the listing's path directly. On native Foundry this is the
    // local relative path; on The Forge it's the absolute assets.forge-vtt.com
    // URL where the file actually lives. Either way, the string here is the
    // one foundry.audio.Sound can load.
    const hit = files.find(f => typeof f === "string" && f.endsWith(`/${filename}`));
    return hit ?? null;
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
  const uploadedPath = typeof response?.path === "string" ? response.path : null;
  return uploadedPath ?? full;
}

/**
 * Evict oldest cache entries until cumulative size is <= maxBytes.
 * Returns the count of entries evicted.
 *
 * Iterates the two-level fanout directories. Each file's modification
 * time is the eviction sort key (oldest first). Soft-fails on any
 * per-file error; the cache is best-effort and a failed eviction is
 * preferable to a thrown sweep.
 *
 * @param {number} maxBytes
 * @returns {Promise<number>}
 */
export async function evictIfOverflow(maxBytes) {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) return 0;
  const worldId = globalThis.game?.world?.id;
  if (!worldId) return 0;
  const rootDir = `worlds/${worldId}/audio`;

  let topLevel;
  try {
    topLevel = await foundry.applications.apps.FilePicker.implementation.browse("data", rootDir);
  } catch {
    return 0;
  }

  const subdirs = Array.isArray(topLevel?.dirs) ? topLevel.dirs : [];
  const entries = [];
  for (const sub of subdirs) {
    let listing;
    try {
      listing = await foundry.applications.apps.FilePicker.implementation.browse("data", sub);
    } catch {
      continue;
    }
    const files = Array.isArray(listing?.files) ? listing.files : [];
    for (const f of files) {
      if (typeof f !== "string" || !f.endsWith(".mp3")) continue;
      // Foundry FilePicker.browse does not expose mtime or size directly.
      // We fall back to HEAD against the file URL to read the size and
      // Last-Modified header. Errors fall back to size 0 + epoch.
      let size = 0;
      let mtime = 0;
      try {
        const head = await fetch(`/${f}`, { method: "HEAD" });
        const len = head.headers.get("content-length");
        if (len) size = Number(len) || 0;
        const last = head.headers.get("last-modified");
        if (last) mtime = Date.parse(last) || 0;
      } catch (err) {
        // Head request unavailable — eviction sort treats the entry as
        // oldest with size 0. Best-effort cache; log at debug rather
        // than warn to avoid noise on every entry of a clean cache.
        if (typeof console.debug === "function") {
          console.debug(`${MODULE_ID} | audio cache: HEAD ${f} failed (skipping size):`, err?.message ?? err);
        }
      }
      entries.push({ path: f, size, mtime });
    }
  }

  let total = entries.reduce((a, e) => a + e.size, 0);
  if (total <= maxBytes) return 0;

  entries.sort((a, b) => a.mtime - b.mtime);

  let evicted = 0;
  for (const e of entries) {
    if (total <= maxBytes) break;
    // Foundry V13 does not expose FilePicker.delete on the client; on a
    // hosted instance, file deletion typically requires a server-side
    // route. As a v1 fallback, we just stop counting once we'd exceed
    // the cap — the cache will grow past maxBytes until the GM manually
    // empties the directory. A follow-on socket handler to a GM-side
    // delete can address this when it becomes a real problem.
    try {
      if (typeof foundry.applications.apps.FilePicker.implementation.delete === "function") {
        await foundry.applications.apps.FilePicker.implementation.delete("data", e.path);
        total -= e.size;
        evicted++;
      } else {
        break;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | audio cache: evict ${e.path} failed:`, err);
    }
  }
  return evicted;
}
