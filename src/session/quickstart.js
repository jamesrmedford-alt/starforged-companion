/**
 * STARFORGED COMPANION
 * src/session/quickstart.js — ✦ Playtest Quickstart (one-click fresh world)
 *
 * For rapid playtesting: a single hotbar Macro that takes a fresh world to
 * "ready to play" — rolled World Truths, a generated sector, a PC with two
 * random Path assets and the standard stat array, and a command-vehicle
 * starship with two flavour-matched Modules. Mirrors the rulebook's
 * character-creation steps (choose two paths / board a starship / set
 * stats, values 1–3) and reuses the same pipelines the wizard and the
 * auto-seed use, so quickstart worlds behave identically to hand-built
 * ones. Each run creates NEW content — re-running gives a fresh random
 * slate, which is the point.
 *
 * Speed note: the sector pipeline honours the existing gates
 * (`sectorArtEnabled`, `sectorNarratorStubsEnabled`,
 * `sectorEntityPortraitsEnabled`) — switch those off in Companion
 * Settings for the fastest possible reset loop.
 *
 * Exposed as `game.modules.get("starforged-companion").api
 * .runPlaytestQuickstart()`; `ensureQuickstartMacro()` creates the
 * hotbar-ready Macro document on first GM load (same ensure-once pattern
 * as the help journal).
 */

import { rollWorldTruths, storeWorldTruths } from "../truths/generator.js";
import { generateSector, rollTableResult }    from "../sectors/sectorGenerator.js";
import { runSectorCreationPipeline }          from "../sectors/sectorPanel.js";
import * as CHARACTERS                        from "../oracles/tables/characters.js";
import { getOrCreateActorFolder }             from "../entities/folder.js";
import { getCanonicalAsset, listCanonicalAssetsByCategory } from "../system/ironswornPacks.js";
import { seedStarshipActor }                  from "../entities/ship.js";
import { STARFORGED_CHARACTER_SHEET }         from "../entities/connection.js";
import { placeCommandVehicleTokenIfPresent }  from "../sectors/sceneBuilder.js";

const MODULE_ID = "starforged-companion";
const REGIONS   = ["terminus", "outlands", "expanse"];
const STATS     = ["edge", "heart", "iron", "shadow", "wits"];
/** Starforged character creation: stats valued 1–3 — the 3/2/2/1/1 array. */
const STAT_ARRAY = [3, 2, 2, 1, 1];

// ─────────────────────────────────────────────────────────────────────────────
// PURE HELPERS (unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shuffle the standard 3/2/2/1/1 array across the five stats.
 * @param {() => number} [rng] — injectable for tests; defaults Math.random
 * @returns {{edge:number, heart:number, iron:number, shadow:number, wits:number}}
 */
export function assignStatArray(rng = Math.random) {
  const pool = [...STAT_ARRAY];
  const out  = {};
  for (const stat of STATS) {
    const idx = Math.floor(rng() * pool.length);
    out[stat] = pool.splice(idx, 1)[0];
  }
  return out;
}

/**
 * Pick `n` distinct random entries from a list.
 * @param {Array} list
 * @param {number} n
 * @param {() => number} [rng]
 * @returns {Array}
 */
export function pickRandomDistinct(list, n, rng = Math.random) {
  const pool = [...(list ?? [])];
  const out  = [];
  while (pool.length && out.length < n) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

/** Roll a PC name from the canonical character oracles (given + family). */
export function rollPcName() {
  const given  = rollTableResult(CHARACTERS.GIVEN_NAMES)  || "Venri";
  const family = rollTableResult(CHARACTERS.FAMILY_NAMES) || "Quint";
  return `${given} ${family}`;
}

/** Roll a starship name — "ISV <family name>" from the canon name oracle. */
export function rollShipName() {
  const family = rollTableResult(CHARACTERS.FAMILY_NAMES) || "Vesta";
  return `ISV ${family}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full quickstart. GM-only; confirms before creating anything.
 * Never throws — each phase reports into the summary card and failures
 * don't abort later phases (a half-built world is still more useful for
 * a playtest than an aborted one).
 *
 * @param {{ skipConfirm?: boolean }} [opts] — skipConfirm for programmatic
 *   callers (Quench, custom macros); the hotbar Macro always confirms.
 * @returns {Promise<{ phases: Array<{phase:string, ok:boolean, detail:string}> }|null>}
 */
export async function runPlaytestQuickstart(opts = {}) {
  if (!game.user?.isGM) {
    ui?.notifications?.warn("Starforged Companion: Playtest Quickstart is GM-only.");
    return null;
  }

  const confirmed = opts.skipConfirm === true || await foundry.applications.api.DialogV2.confirm({
    window:  { title: "✦ Playtest Quickstart" },
    content:
      `<p>Create a fresh random playtest setup in this world?</p>` +
      `<ul><li>Roll and store all 14 <strong>World Truths</strong></li>` +
      `<li>Generate a random <strong>sector</strong> (full pipeline — art/stubs/portraits per your settings)</li>` +
      `<li>Create <strong>two PCs</strong>, each with the 3/2/2/1/1 stat array and two random Path assets</li>` +
      `<li>Create a command-vehicle <strong>starship</strong> with two flavour-matched Modules</li></ul>` +
      `<p>Each run adds new content — run on a fresh world for a clean slate.</p>`,
  }).catch(() => false);
  if (!confirmed) return null;

  const phases = [];
  const report = (phase, ok, detail) => phases.push({ phase, ok, detail });

  // 1 — World Truths
  try {
    const campaignState = game.settings.get(MODULE_ID, "campaignState");
    const truthSet = rollWorldTruths();
    await storeWorldTruths(truthSet, campaignState);
    report("World Truths", true, "14 categories rolled and stored");
  } catch (err) {
    console.error(`${MODULE_ID} | quickstart: truths failed:`, err);
    report("World Truths", false, err?.message ?? "failed");
  }

  // 2 — Sector (re-read state: storeWorldTruths persisted a new revision)
  let sectorName   = null;
  let sector       = null;   // hoisted: phase 4b places the ship token on its scene
  let storedSector = null;
  try {
    const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
    sector = generateSector(region);
    storedSector = await runSectorCreationPipeline(sector);
    sectorName = storedSector?.name ?? sector.name;
    report("Sector", true, `${sectorName} (${sector.regionLabel}, ${sector.settlements?.length ?? 0} settlements)`);
  } catch (err) {
    console.error(`${MODULE_ID} | quickstart: sector failed:`, err);
    report("Sector", false, err?.message ?? "failed");
  }

  // 3 — Player characters (two PCs; first is registered as the active character)
  for (const [label, setActive] of [["Character 1", true], ["Character 2", false]]) {
    try {
      const pc = await createQuickstartPc({ setActive });
      const paths = (pc.items?.contents ?? [])
        .filter(i => i.type === "asset")
        .map(i => i.name)
        .join(" + ");
      report(label, true, `${pc.name} (paths: ${paths || "none found in pack"})`);
    } catch (err) {
      console.error(`${MODULE_ID} | quickstart: ${label} failed:`, err);
      report(label, false, err?.message ?? "failed");
    }
  }

  // 4 — Starship
  try {
    const ship = await createQuickstartStarship();
    const modules = (ship.items?.contents ?? [])
      .filter(i => i.type === "asset" && i.system?.category === "Module")
      .map(i => i.name)
      .join(" + ");
    report("Starship", true, `${ship.name} (command vehicle; modules: ${modules || "none matched"})`);
  } catch (err) {
    console.error(`${MODULE_ID} | quickstart: starship failed:`, err);
    report("Starship", false, err?.message ?? "failed");
  }

  // 4b — Place the command-vehicle token on the sector map. The sector (phase
  // 2) was built before the ship (phase 4) existed, so scene-build-time
  // auto-placement found no command vehicle and placed nothing. Place it now
  // so the world comes up with the ship on the map — and the createToken hook
  // records its position, so "where am I" is grounded from the start (finding C).
  try {
    const scene = storedSector?.sceneId ? game.scenes?.get?.(storedSector.sceneId) : null;
    if (sector && scene) {
      const token = await placeCommandVehicleTokenIfPresent(scene, sector);
      report("Ship token", !!token, token ? "placed on the sector map" : "not placed (no command vehicle / token affordance off)");
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | quickstart: command-vehicle token placement failed:`, err);
    report("Ship token", false, err?.message ?? "failed");
  }

  await postQuickstartSummary(phases, sectorName);
  return { phases };
}

/**
 * Create the PC: character Actor in PCs/, 3/2/2/1/1 stats, two random
 * Path assets from the canonical pack, registered as the active character.
 */
async function createQuickstartPc({ setActive = false } = {}) {
  const folder = await getOrCreateActorFolder("PCs").catch(() => null);
  // Pin the Starforged sheet — the system defaults `character` actors to the
  // classic Ironsworn sheet, and quickstart bypasses the create-dialog that
  // would otherwise pin it (v1.7.11 finding A).
  const actor  = await Actor.create({
    name:   rollPcName(),
    type:   "character",
    folder: folder ?? null,
    flags:  { core: { sheetClass: STARFORGED_CHARACTER_SHEET } },
  });
  if (!actor) throw new Error("Actor.create returned nothing for the PC");

  // Stats are flat on system (rules/foundry-ironsworn.md #6).
  const stats = assignStatArray();
  await actor.update({
    "system.edge":   stats.edge,
    "system.heart":  stats.heart,
    "system.iron":   stats.iron,
    "system.shadow": stats.shadow,
    "system.wits":   stats.wits,
  });

  // Two random Path assets — full canonical documents so abilities and
  // fields survive (same rationale as the module install on starships).
  const allPaths = await listCanonicalAssetsByCategory("Path");
  const picks    = pickRandomDistinct(allPaths, 2);
  if (picks.length) {
    const itemsData = picks.map(doc => {
      const data = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
      delete data._id;
      return data;
    });
    await actor.createEmbeddedDocuments("Item", itemsData);
  } else {
    console.warn(`${MODULE_ID} | quickstart: no Path assets found in the canonical pack`);
  }

  // Backfill connection bonds: the quickstart sector (phase 2) is generated
  // before the PCs (phase 3), so its connection NPC(s) have no bond Item on the
  // sheet yet. Mirror every tracked connection onto this PC's Connections tab
  // (createCharacterBondItem is idempotent, so this is safe alongside the
  // sector-path linking).
  try {
    const { listConnections }          = await import("../entities/connection.js");
    const { createCharacterBondItem }  = await import("../character/actorBridge.js");
    const cs = game.settings.get(MODULE_ID, "campaignState") ?? {};
    for (const conn of listConnections(cs)) {
      await createCharacterBondItem(actor, { name: conn.name, rank: conn.rank, connectionId: conn._id });
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | quickstart: connection backfill failed:`, err?.message ?? err);
  }

  if (setActive) {
    await game.settings.set(MODULE_ID, "activeCharacterId", actor.id).catch(err =>
      console.warn(`${MODULE_ID} | quickstart: activeCharacterId set failed:`, err));
  }
  return actor;
}

/**
 * Create the starship: starship Actor in Starships/, the canonical
 * STARSHIP command-vehicle asset, then the standard seed (oracle
 * identity + notes + portrait when keyed) capped at two Modules.
 */
async function createQuickstartStarship() {
  const folder = await getOrCreateActorFolder("Starships").catch(() => null);
  const actor  = await Actor.create({
    name:   rollShipName(),
    type:   "starship",
    folder: folder ?? null,
  });
  if (!actor) throw new Error("Actor.create returned nothing for the starship");

  // Command vehicle asset FIRST so the seed's isCommandVehicle detection
  // (actorHasCommandVehicleAsset) flags the ship record correctly.
  const cv = await getCanonicalAsset("starship");
  if (cv) {
    const data = typeof cv.toObject === "function" ? cv.toObject() : { ...cv };
    delete data._id;
    await actor.createEmbeddedDocuments("Item", [data]);
  } else {
    console.warn(`${MODULE_ID} | quickstart: canonical STARSHIP asset not found`);
  }

  const campaignState = game.settings.get(MODULE_ID, "campaignState");
  await seedStarshipActor(actor, campaignState, { moduleLimit: 2 });
  return actor;
}

/** Post the per-phase summary card with next steps. */
async function postQuickstartSummary(phases, sectorName) {
  const rows = phases
    .map(p => `<li>${p.ok ? "✅" : "❌"} <strong>${p.phase}:</strong> ${escapeHtml(p.detail)}</li>`)
    .join("");
  const next =
    `<p><em>Next:</em> ▶ Begin Session, then ✦ Envision Inciting Incident ` +
    `(or <code>!incite</code>) — and ⚔ swear the suggested vow.` +
    `${sectorName ? ` Anchor the scene with <code>!at &lt;settlement&gt;</code> in ${escapeHtml(sectorName)}.` : ""}</p>`;
  try {
    await ChatMessage.create({
      content: `<div class="sf-quickstart-card"><strong>✦ Playtest Quickstart</strong><ul>${rows}</ul>${next}</div>`,
      flags:   { [MODULE_ID]: { quickstartCard: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | quickstart: summary card failed:`, err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MACRO (hotbar affordance)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ensure the ✦ Starforged Quickstart hotbar Macro exists (GM, ready hook —
 * same ensure-once pattern as the help journal). The Macro body is a
 * one-liner into the module API so its logic stays in tested module code.
 */
export async function ensureQuickstartMacro() {
  if (!game.user?.isGM) return null;
  try {
    const existing = (game.macros?.contents ?? []).find(
      m => m.flags?.[MODULE_ID]?.quickstartMacro === true,
    );
    if (existing) return existing;

    return await Macro.create({
      name:    "✦ Starforged Quickstart",
      type:    "script",
      img:     "icons/svg/dice-target.svg",
      command: `game.modules.get("${MODULE_ID}")?.api?.runPlaytestQuickstart?.();`,
      flags:   { [MODULE_ID]: { quickstartMacro: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | quickstart: macro creation failed:`, err?.message ?? err);
    return null;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
