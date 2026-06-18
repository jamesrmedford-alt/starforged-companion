/**
 * STARFORGED COMPANION
 * src/moves/shipMapArt.js — Deck-plan background art for the ship-map Scene.
 *
 * Phase A of the shipboard-combat mini-game. Generates a 1792×1024 top-down
 * deck-plan / blueprint image for the crew's ship via OpenRouter (FLUX.2 Pro by
 * default) and uploads it to worlds/{worldId}/scenes/. Mirrors
 * src/sectors/sectorArt.js (same upload helper shape, same key/disabled/failure
 * notifications). The station pins are placed at FIXED coordinates regardless of
 * the art, so an unpredictable image never breaks the layout — it is purely a
 * backdrop. createShipMapScene falls back to a schematic hull when this returns
 * null (no key, art disabled, or any failure).
 *
 * All image generation goes through src/art/openRouterImage.js per the
 * architecture constraint in CLAUDE.md.
 */

import { generateOpenRouterImage } from "../art/openRouterImage.js";

const MODULE_ID = "starforged-companion";


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a deck-plan background image for a ship and upload it to Foundry.
 *
 * @param {Object} ship — the ship flag payload (type / firstLook seed the prompt)
 * @param {Actor}  [shipActor] — used for the upload filename (actor id) and name
 * @returns {Promise<{path:string, b64:string}|null>} — uploaded path + the raw
 *   image bytes (so the vision pass can locate stations), or null on any miss
 */
export async function generateShipMapBackground(ship, shipActor) {
  const apiKey = readOpenRouterKey();
  if (!apiKey) {
    const msg = "Ship-map art skipped — no OpenRouter API key. Add one in Companion Settings → About.";
    console.warn(`${MODULE_ID} | shipMapArt: ${msg}`);
    notify("warn", msg);
    return null;
  }

  const { prompt } = buildShipMapBackgroundPrompt(ship ?? {}, moduleNamesForActor(shipActor));

  let b64;
  try {
    b64 = await generateOpenRouterImage({
      apiKey,
      prompt,
      model: readOpenRouterModel(),
      title: "Starforged Companion - ship deck plan",
    });
  } catch (err) {
    const reason = err?.message ?? String(err);
    console.warn(`${MODULE_ID} | shipMapArt: image API call failed:`, reason);
    notify("error", `Ship-map art failed — image API error: ${truncate(reason, 200)}`);
    return null;
  }

  if (!b64) {
    const msg = "Ship-map art failed — OpenRouter returned no image bytes. The deck plan will use the schematic backdrop.";
    console.warn(`${MODULE_ID} | shipMapArt: ${msg}`);
    notify("warn", msg);
    return null;
  }

  try {
    const path = await uploadShipMapImage(b64, shipActor?.id ?? "ship");
    if (path) console.log(`${MODULE_ID} | shipMapArt: uploaded deck plan to ${path}`);
    return path ? { path, b64 } : null;
  } catch (err) {
    const reason = err?.message ?? String(err);
    console.warn(`${MODULE_ID} | shipMapArt: FilePicker.upload failed:`, reason);
    notify("error", `Ship-map art generated but upload failed: ${truncate(reason, 200)}`);
    return null;
  }
}

/**
 * Build the image-model prompt for a ship deck plan. Top-down orthographic
 * schematic, seeded from the ship's type / first look so it reads like the
 * crew's actual vessel. Affirmative framing (what fills the image) so the model
 * has a clear subject. Pure.
 *
 * @param {{ type?:string, firstLook?:string, name?:string }} ship
 * @param {string[]} [moduleNames] — installed module names, drawn as compartments
 * @returns {{ prompt: string, size: string }}
 */
export function buildShipMapBackgroundPrompt(ship = {}, moduleNames = []) {
  const seedBits = [ship.type, ship.firstLook].map(s => String(s ?? "").trim()).filter(Boolean);
  const seed = seedBits.length
    ? `The vessel is: ${seedBits.join("; ")}. `
    : "";

  const mods = (Array.isArray(moduleNames) ? moduleNames : [])
    .map(m => String(m ?? "").trim())
    .filter(Boolean);
  const moduleClause = mods.length
    ? `Also include distinct compartments for the ship's installed modules: ${mods.join(", ")}. `
    : "";

  const prompt =
    `Top-down architectural deck plan of a single starship interior, drawn as a ` +
    `technical blueprint schematic. ${seed}` +
    `The whole ship is shown from directly overhead, fore (nose) to the left and ` +
    `the engine/drive section to the right, filling the frame on a dark background. ` +
    `Clearly readable internal compartments and corridors: a cockpit and bridge at ` +
    `the front, a sensor and electronic-warfare bay, a weapon turret, a central ` +
    `computer core, a boarding airlock amidships, a crew galley and mess, a medical ` +
    `bay, a damage-control / engineering section, and a drive section at the rear. ` +
    moduleClause +
    `Clean schematic line work, subtle blue-and-amber technical glow, grid and panel ` +
    `detailing, the silhouette of a starship hull enclosing every compartment. ` +
    `Orthographic top-down view, no perspective, no characters, no text, no labels, ` +
    `no callouts, no borders. 1792x1024 landscape orientation.`;

  return { prompt, size: "1792x1024" };
}


// ─────────────────────────────────────────────────────────────────────────────
// INTERNALS
// ─────────────────────────────────────────────────────────────────────────────

/** Installed Module asset names on a starship Actor (for the art prompt). Pure read. */
function moduleNamesForActor(shipActor) {
  const raw = shipActor?.items?.contents ?? shipActor?.items ?? [];
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter(it => it?.type === "asset" && /module/i.test(String(it?.system?.category ?? "")))
    .map(it => it.name)
    .filter(Boolean);
}

function readOpenRouterKey() {
  try {
    return game.settings.get(MODULE_ID, "openRouterApiKey") ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | shipMapArt: openRouterApiKey settings read failed:`, err);
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

function notify(level, message, opts = {}) {
  if (typeof ui === "undefined") return;
  const fn = ui.notifications?.[level];
  if (typeof fn === "function") fn.call(ui.notifications, `Starforged Companion: ${message}`, opts);
}

function truncate(s, n) {
  return typeof s === "string" && s.length > n ? `${s.slice(0, n)}…` : s;
}

async function uploadShipMapImage(b64, shipActorId) {
  const filename  = `ship-map-${shipActorId}.png`;
  const worldId   = game.world.id;
  const uploadDir = `worlds/${worldId}/scenes`;

  // Ensure the upload directory exists. createDirectory() throws when it
  // already exists — the common case, silently ignored (sectorArt.js).
  try {
    await foundry.applications.apps.FilePicker.implementation
      .createDirectory("data", uploadDir, {});
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (!/exists/i.test(msg)) {
      console.warn(`${MODULE_ID} | shipMapArt: createDirectory(${uploadDir}) failed:`, err);
    }
  }

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
