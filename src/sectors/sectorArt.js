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
  const artApiKey = readApiKey();

  if (!artApiKey) {
    console.warn(`${MODULE_ID} | sectorArt: no OpenAI art API key configured — scene will have no background`);
    return null;
  }

  const { prompt, size } = buildSectorBackgroundPrompt(sector);

  let b64;
  try {
    b64 = await requestDalleImage(prompt, size, artApiKey);
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorArt: DALL-E API call failed:`, err?.message ?? err);
    return null;
  }

  if (!b64) {
    console.warn(`${MODULE_ID} | sectorArt: DALL-E returned no image data`);
    return null;
  }

  let uploadedPath;
  try {
    uploadedPath = await uploadSectorImage(b64, sector.id);
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorArt: FilePicker.upload failed:`, err?.message ?? err);
    return null;
  }

  if (!uploadedPath) {
    console.warn(`${MODULE_ID} | sectorArt: upload returned no path`);
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
