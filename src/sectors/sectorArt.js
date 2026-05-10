/**
 * STARFORGED COMPANION
 * src/sectors/sectorArt.js — DALL-E 3 background art for sector scenes
 *
 * Generates a 1792×1024 landscape image matching the sector's region character.
 * Unlike entity portraits, sector backgrounds:
 *   - Use landscape format (1792×1024)
 *   - Have no lock policy — can be regenerated freely
 *   - Are uploaded to worlds/{worldId}/scenes/ (persists across module updates)
 *   - Are referenced by file path, not stored as base64 flags
 *
 * FilePicker.createDirectory() is always called before upload to ensure the
 * destination directory exists. The "already exists" error is silently ignored.
 */

import { apiPost } from "../api-proxy.js";
import { generateOpenRouterImage } from "../art/openRouterImage.js";

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// REGION VISUAL PROFILES
// ─────────────────────────────────────────────────────────────────────────────

// Each profile describes what fills the image — affirmative framing so
// DALL-E has a clear subject rather than a list of things to avoid.
const REGION_PROMPTS = {
  terminus:
    "The image is filled with a warm dense starfield — amber, gold, and copper " +
    "tones dominate. Rich coloured nebulae billow across the frame. Distant star " +
    "clusters suggest habitation and activity.",

  outlands:
    "The image is filled with a cool sparse starfield — blue-white tones, widely " +
    "spaced stars. One or two thin nebula wisps. Emptiness dominates but is not " +
    "absolute.",

  expanse:
    "The image is filled with deep cold darkness — only a sparse scatter of white " +
    "stars and a single faint nebula smear. Vast, lonely, and beautiful.",

  void:
    "The image is near-total darkness — barely any stars visible, an oppressive " +
    "empty void with only the faintest distant light.",
};

const TROUBLE_VISUAL_MODIFIERS = {
  "Energy storms are rampant":
    "Crackling energy storms and lightning arc through the void.",
  "Magnetic disturbances disrupt communication":
    "Aurora-like magnetic disturbances shimmer across the starfield.",
  "Supernova is imminent":
    "A bright dying star dominates the background, its light flooding the void.",
  "Chaotic breaches in spacetime spread like wildfire":
    "Strange spatial distortions and rifts tear through the fabric of space.",
  "Dense nebula cloud":
    "A vast colourful nebula fills the background, its gas clouds billowing across the frame.",
  "Fiery energy storm":
    "Billowing plasma storms and solar flares illuminate the deep space.",
};


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a DALL-E 3 background image for a sector and upload it to Foundry.
 *
 * @param {SectorResult} sector
 * @param {Object} campaignState
 * @returns {Promise<string|null>} — Foundry data file path, or null on failure
 */
export async function generateSectorBackground(sector, _campaignState) {
  const backend = readBackend();
  const { prompt, size } = buildSectorBackgroundPrompt(sector);

  // Trace line — useful when console access is available; cheap to keep.
  console.log(`${MODULE_ID} | sectorArt: starting (backend=${backend}, ` +
    `openRouterKey=${readOpenRouterKey() ? "set" : "unset"}, ` +
    `artApiKey=${readApiKey() ? "set" : "unset"})`);

  let b64;
  try {
    if (backend === "openrouter") {
      const apiKey = readOpenRouterKey();
      if (!apiKey) {
        const msg = "Sector art skipped — no OpenRouter API key. Add one in Companion Settings → About.";
        console.warn(`${MODULE_ID} | sectorArt: ${msg}`);
        notify("warn", msg, { permanent: true });
        return null;
      }
      b64 = await generateOpenRouterImage({
        apiKey,
        prompt,
        model: readOpenRouterModel(),
        title: "Starforged Companion — sector background",
      });
    } else {
      const artApiKey = readApiKey();
      if (!artApiKey) {
        const msg = "Sector art skipped — no OpenAI API key. Add one in Companion Settings → About, or switch the Art Backend to OpenRouter.";
        console.warn(`${MODULE_ID} | sectorArt: ${msg}`);
        notify("warn", msg, { permanent: true });
        return null;
      }
      b64 = await requestDalleImage(prompt, size, artApiKey);
    }
  } catch (err) {
    const reason = err?.message ?? String(err);
    console.warn(`${MODULE_ID} | sectorArt: image API call failed:`, reason);
    notify("error", `Sector art failed — image API error: ${truncate(reason, 200)}`, { permanent: true });
    return null;
  }

  if (!b64) {
    const msg = backend === "openrouter"
      ? "Sector art failed — OpenRouter returned no image bytes. Check the browser console for the raw response shape; the parser may need an update for this model."
      : "Sector art failed — DALL-E returned no image data.";
    console.warn(`${MODULE_ID} | sectorArt: ${msg}`);
    notify("error", msg, { permanent: true });
    return null;
  }

  let uploadedPath;
  try {
    uploadedPath = await uploadSectorImage(b64, sector.id);
  } catch (err) {
    const reason = err?.message ?? String(err);
    console.warn(`${MODULE_ID} | sectorArt: FilePicker.upload failed:`, reason);
    notify("error", `Sector art generated but upload failed: ${truncate(reason, 200)}`, { permanent: true });
    return null;
  }

  if (!uploadedPath) {
    const msg = "Sector art generated but upload returned no path.";
    console.warn(`${MODULE_ID} | sectorArt: ${msg}`);
    notify("error", msg, { permanent: true });
    return null;
  }

  console.log(`${MODULE_ID} | sectorArt: uploaded background to ${uploadedPath}`);
  return uploadedPath;
}

/**
 * Build the DALL-E prompt for a sector.
 *
 * @param {SectorResult} sector
 * @returns {{ prompt: string, size: string }}
 */
export function buildSectorBackgroundPrompt(sector) {
  const region   = sector.region ?? "outlands";
  const profile  = REGION_PROMPTS[region] ?? REGION_PROMPTS.outlands;
  const modifier = TROUBLE_VISUAL_MODIFIERS[sector.trouble] ?? null;

  const body = modifier ? `${profile} ${modifier}` : profile;

  const prompt =
    `${body} The entire image is deep space as seen from open space — stars, ` +
    `nebulae, gas clouds, and distant galaxies only. The camera is floating in ` +
    `the void with nothing in the foreground, middleground, or near field. No ` +
    `celestial bodies closer than a distant star. No planets, moons, asteroids, ` +
    `ships, structures, ground, terrain, or atmosphere visible at any scale. ` +
    `The image shows only the interstellar medium — the space between star ` +
    `systems. There is no nearby object of any kind. No planet, moon, asteroid, ` +
    `comet, debris field, ship, station, or structure exists at any distance ` +
    `that would be visible to the naked eye or any instrument. The only visible ` +
    `objects are stars (as points of light), nebulae (as diffuse gas clouds), ` +
    `and distant galaxies (as smears of light). Nothing has a disc, surface, ` +
    `atmosphere, rings, or any resolved shape. Every light source is a point ` +
    `or a diffuse cloud. ` +
    `Wide cinematic panorama, 1792x1024 landscape orientation, no text, no labels, no borders.`;

  return { prompt, size: "1792x1024" };
}


// ─────────────────────────────────────────────────────────────────────────────
// INTERNALS
// ─────────────────────────────────────────────────────────────────────────────

// Mirror of readApiKey() in src/art/generator.js — keep these in sync so both
// sector backgrounds and entity portraits resolve the OpenAI key the same way.
function readApiKey() {
  try {
    return game.settings.get(MODULE_ID, "artApiKey") ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorArt: artApiKey settings read failed:`, err);
    return null;
  }
}

function readOpenRouterKey() {
  try {
    return game.settings.get(MODULE_ID, "openRouterApiKey") ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorArt: openRouterApiKey settings read failed:`, err);
    return null;
  }
}

function readOpenRouterModel() {
  try {
    return game.settings.get(MODULE_ID, "openRouterImageModel") || "black-forest-labs/flux.2-pro";
  } catch {
    return "black-forest-labs/flux.2-pro";
  }
}

function readBackend() {
  try {
    return game.settings.get(MODULE_ID, "artBackend") || "dalle";
  } catch {
    return "dalle";
  }
}

function notify(level, message, opts = {}) {
  if (typeof ui === "undefined") return;
  const fn = ui.notifications?.[level];
  if (typeof fn === "function") fn.call(ui.notifications, `Starforged Companion: ${message}`, opts);
}

function truncate(s, n) {
  return typeof s === "string" && s.length > n ? `${s.slice(0, n)}…` : s;
}

async function requestDalleImage(prompt, size, apiKey) {
  const headers = {
    "Content-Type":  "application/json",
    "Authorization": `Bearer ${apiKey}`,
  };
  const body = {
    model:           "dall-e-3",
    prompt,
    n:               1,
    size,
    response_format: "b64_json",
  };
  const data = await apiPost("https://api.openai.com/v1/images/generations", headers, body);
  return data?.data?.[0]?.b64_json ?? null;
}

async function uploadSectorImage(b64, sectorId) {
  const filename  = `sector-${sectorId}.png`;
  const worldId   = game.world.id;
  const uploadDir = `worlds/${worldId}/scenes`;

  // Ensure the upload directory exists. createDirectory() throws when the
  // directory already exists — that is the common case and can be ignored.
  try {
    await foundry.applications.apps.FilePicker.implementation
      .createDirectory("data", uploadDir, {});
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (!/exists/i.test(msg)) {
      console.warn(`${MODULE_ID} | sectorArt: createDirectory(${uploadDir}) failed:`, err);
    }
  }

  // Convert base64 to Blob
  const byteString = atob(b64);
  const bytes      = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/png" });
  const file = new File([blob], filename, { type: "image/png" });

  await foundry.applications.apps.FilePicker.implementation
    .upload("data", uploadDir, file, {}, { notify: false });

  return `${uploadDir}/${filename}`;
}
