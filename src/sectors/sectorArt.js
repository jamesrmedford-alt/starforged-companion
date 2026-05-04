/**
 * STARFORGED COMPANION
 * src/sectors/sectorArt.js — DALL-E 3 background art for sector scenes
 *
 * Generates a 1792×1024 landscape image matching the sector's region character.
 * Unlike entity portraits, sector backgrounds:
 *   - Use landscape format (1792×1024)
 *   - Have no lock policy — can be regenerated freely
 *   - Are uploaded to Foundry's data folder (required for Scene backgrounds)
 *   - Are referenced by file path, not stored as base64 flags
 *
 * FilePicker.createDirectory() is always called before upload to ensure the
 * destination directory exists. The "already exists" error is silently ignored.
 */

import { apiPost } from "../api-proxy.js";

const MODULE_ID  = "starforged-companion";
const UPLOAD_DIR = "modules/starforged-companion/art";

// ─────────────────────────────────────────────────────────────────────────────
// REGION VISUAL PROFILES
// ─────────────────────────────────────────────────────────────────────────────

const REGION_PROMPTS = {
  terminus: "Dense star field, warm amber and gold hues, colorful nebulae in the background, " +
    "distant station and settlement lights visible, active space lanes, inhabited and settled " +
    "feeling, cinematic science fiction space art, 1792x1024 wide landscape orientation, " +
    "no text or labels",

  outlands: "Sparse star field, cool blue and white tones, one or two distant nebulae, " +
    "scattered isolated settlement lights, frontier space feeling, recent expansion into the " +
    "unknown, cinematic science fiction space art, 1792x1024 wide landscape orientation, " +
    "no text or labels",

  expanse:  "Very sparse star field, deep cold blues and blacks, vast emptiness, a single " +
    "distant galaxy smear or lone nebula as the only color, almost no settlement lights, " +
    "desolate and beautiful, pioneer space at the edge of the known, cinematic science " +
    "fiction space art, 1792x1024 wide landscape orientation, no text or labels",

  void:     "Near-total darkness, isolated stars barely visible, vast empty void, no " +
    "settlements, hostile and forbidding, the space beyond the Forge where travel is " +
    "impossible, cinematic science fiction space art, 1792x1024 wide landscape orientation, " +
    "no text or labels",
};

const TROUBLE_VISUAL_MODIFIERS = {
  "Energy storms are rampant":
    "with visible crackling energy storms and lightning",
  "Magnetic disturbances disrupt communication":
    "with aurora-like magnetic disturbances visible",
  "Supernova is imminent":
    "with a bright dying star dominating the background",
  "Chaotic breaches in spacetime spread like wildfire":
    "with strange spatial distortions and rifts visible",
  "Dense nebula cloud":
    "with a vast colorful nebula filling the background",
  "Fiery energy storm":
    "with billowing plasma storms and solar flares",
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
  const region  = sector.region ?? "outlands";
  const base    = REGION_PROMPTS[region] ?? REGION_PROMPTS.outlands;

  const modifier = TROUBLE_VISUAL_MODIFIERS[sector.trouble] ?? null;
  const prompt   = modifier ? `${base}, ${modifier}` : base;

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
  } catch {
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
  const filename = `sector-${sectorId}.png`;

  // Ensure the upload directory exists before uploading.
  // FilePicker.createDirectory() throws if the directory already exists — ignore that error.
  try {
    await FilePicker.createDirectory("data", UPLOAD_DIR, {});
  } catch {
    // Directory already exists — not an error
  }

  // Convert base64 to Blob
  const byteString = atob(b64);
  const bytes      = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/png" });
  const file = new File([blob], filename, { type: "image/png" });

  const result = await FilePicker.upload("data", UPLOAD_DIR, file, {}, { notify: false });
  return result?.path ?? null;
}
