/**
 * STARFORGED COMPANION
 * src/sectors/sectorPanel.js — Sector Creator ApplicationV2 wizard
 *
 * 11-step guided sector creation following the Starforged rulebook.
 * Each step shows oracle results with re-roll and freeform override.
 * The map renders live on the right side as settlements are placed.
 *
 * Foundry v13: uses ApplicationV2, no jQuery, DOM API only.
 */

import {
  generateSector,
  storeSector,
  createEntityJournals,
  generateNarratorStubs,
  createSectorJournal,
  applyStubsToSettlementEntities,
  finalizeSectorEntities,
} from "./sectorGenerator.js";
import { renderSectorMap }         from "./sectorMap.js";
import { generateSectorBackground } from "./sectorArt.js";
import { createSectorScene }       from "./sceneBuilder.js";

const MODULE_ID = "starforged-companion";
const { ApplicationV2 } = foundry.applications.api;

// ─────────────────────────────────────────────────────────────────────────────
// PANEL CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class SectorCreatorApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:      "sf-sector-creator",
    classes: ["starforged-companion", "sf-sector-creator", "sf-window"],
    tag:     "div",
    window: {
      title:       "Sector Creator",
      resizable:   true,
      minimizable: true,
    },
    position: { width: 900, height: 700 },
    actions: {
      chooseRegion:    SectorCreatorApp.#onChooseRegion,
      rerollSector:    SectorCreatorApp.#onRerollSector,
      finalizeSector:  SectorCreatorApp.#onFinalizeSector,
      cancelCreator:   SectorCreatorApp.#onCancel,
    },
  };

  static #instance = null;

  /** Region selected by the GM: "terminus" | "outlands" | "expanse" */
  #region = null;

  /** Current sector generation result */
  #sector = null;

  /** Current step (1–11) */
  #step = 1;

  /**
   * True while "Create Sector" runs the creation pipeline — minutes with art
   * and narrator stubs on. Create and Re-generate render disabled and no-op
   * until it is released (in a finally): a second click used to start a
   * second full creation of the same sector (issue #321 U46).
   */
  #busy = false;

  static open() {
    if (!SectorCreatorApp.#instance || SectorCreatorApp.#instance.rendered === false) {
      SectorCreatorApp.#instance = new SectorCreatorApp();
    }
    SectorCreatorApp.#instance.render({ force: true });
    return SectorCreatorApp.#instance;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  async _prepareContext(_options) {
    return {
      step:   this.#step,
      region: this.#region,
      sector: this.#sector,
      busy:   this.#busy,
      mapSvg: this.#sector ? renderSectorMap(this.#sector.mapData) : null,
    };
  }

  async _renderHTML(context, _options) {
    const div = document.createElement("div");
    div.className = "sf-sector-creator-content";

    if (context.step === 1) {
      div.innerHTML = this.#renderRegionStep();
    } else if (context.sector) {
      div.innerHTML = this.#renderSectorStep(context);
    }

    return div;
  }

  _replaceHTML(result, content, _options) {
    content.innerHTML = "";
    content.append(result);
  }

  // ── Step renderers ─────────────────────────────────────────────────────────

  #renderRegionStep() {
    return `
      <div class="sf-wizard-body">
        <div class="sf-wizard-main">
          <h2>Step 1 — Choose Your Region</h2>
          <p class="sf-hint">Select the region of space where this sector lies. Each region determines
          the number of settlements, passage routes, and the general character of the sector.</p>

          <div class="sf-region-choices">
            <button class="sf-region-btn" data-action="chooseRegion" data-region="terminus">
              <strong>Terminus</strong>
              <span>4 settlements · 4 passages · Dense, well-charted</span>
            </button>
            <button class="sf-region-btn" data-action="chooseRegion" data-region="outlands">
              <strong>Outlands</strong>
              <span>3 settlements · 3 passages · Frontier, scattered</span>
            </button>
            <button class="sf-region-btn" data-action="chooseRegion" data-region="expanse">
              <strong>Expanse</strong>
              <span>2 settlements · 2 passages · Remote, uncharted</span>
            </button>
          </div>
        </div>
      </div>
    `.trim();
  }

  #renderSectorStep(context) {
    const { sector } = context;
    const settlementsHtml = sector.settlements.map((s, i) => `
      <div class="sf-settlement-entry">
        <div class="sf-settlement-header">Settlement ${i + 1}: <strong>${s.name}</strong></div>
        <div class="sf-settlement-detail">
          <span>📍 ${labelLocationType(s.locationType)}</span>
          <span>👥 ${s.population}</span>
          <span>⚖️ ${s.authority}</span>
        </div>
        <div class="sf-settlement-projects">Projects: ${s.projects.join(", ")}</div>
        ${s.planet ? `<div class="sf-settlement-planet">🪐 ${s.planet.type}: ${s.planet.name}</div>` : ""}
        ${zoomInLine(s)}
      </div>
    `).join("");

    const connectionHtml = `
      <div class="sf-connection-entry">
        <strong>${sector.connection.name}</strong> · ${sector.connection.role}
        <div class="sf-connection-detail">Goal: ${sector.connection.goal}</div>
      </div>
    `;

    return `
      <div class="sf-wizard-body sf-wizard-two-col">
        <div class="sf-wizard-main">
          <div class="sf-sector-header">
            <h2>${sector.name}</h2>
            <span class="sf-sector-region">${sector.regionLabel}</span>
          </div>

          <section class="sf-wizard-section">
            <h3>Settlements</h3>
            ${settlementsHtml}
          </section>

          <section class="sf-wizard-section">
            <h3>Sector Trouble</h3>
            <div class="sf-trouble">${sector.trouble}</div>
          </section>

          <section class="sf-wizard-section">
            <h3>Local Connection</h3>
            ${connectionHtml}
          </section>

          <div class="sf-wizard-actions">
            <button class="sf-btn sf-btn-secondary" data-action="rerollSector"${context.busy ? " disabled" : ""}>
              🎲 Re-generate Sector
            </button>
            <button class="sf-btn sf-btn-primary" data-action="finalizeSector"${context.busy ? " disabled" : ""}>
              ${context.busy ? "◈ Creating sector…" : "✓ Create Sector"}
            </button>
            <button class="sf-btn sf-btn-cancel" data-action="cancelCreator">
              Cancel
            </button>
          </div>
        </div>

        <div class="sf-wizard-map">
          <h3>Sector Map</h3>
          ${context.mapSvg ?? "<p>Generating map…</p>"}
          <p class="sf-map-hint">Settlement positions can be adjusted after creation.</p>
        </div>
      </div>
    `.trim();
  }

  // ── Action handlers ────────────────────────────────────────────────────────

  static async #onChooseRegion(event, target) {
    const region = target.dataset.region;
    if (!region) return;
    this.#region = region;
    this.#sector = generateSector(region);
    this.#step   = 2;
    this.render();
  }

  static async #onRerollSector(_event, _target) {
    // A re-roll mid-creation would show a sector that is not the one being created.
    if (!this.#region || this.#busy) return;
    this.#sector = generateSector(this.#region);
    this.render();
  }

  static async #onFinalizeSector(_event, _target) {
    if (!this.#sector || this.#busy) return;

    this.#busy = true;
    let created = false;
    try {
      if (this.rendered) await this.render();   // Create / Re-generate disabled while it runs
      await runSectorCreationPipeline(this.#sector);
      created = true;
    } catch (err) {
      console.error(`${MODULE_ID} | Sector creation failed:`, err);
      ui.notifications.error("Sector Creator: Failed to save sector. See console for details.");
    } finally {
      // Released on every path, a throw included — a guard left set would
      // refuse every later Create in this window.
      this.#busy = false;
    }
    if (created) await this.close();
    else if (this.rendered) await this.render();   // re-enabled for a retry
  }

  static #onCancel(_event, _target) {
    this.close();
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SHARED CREATION PIPELINE
// ─────────────────────────────────────────────────────────────────────────────

// Sector creations running on this client: sector id → the run's promise.
const creationsInFlight = new Map();

/**
 * Run the full sector-creation pipeline for an already-generated sector:
 * entity journals/actors, background art, narrator stubs, settlement
 * finalisation, sector journal, Scene, and campaignState persistence —
 * each step honouring its own gating setting (`sectorArtEnabled`,
 * `sectorNarratorStubsEnabled`, `sectorEntityPortraitsEnabled`).
 *
 * Extracted from the wizard's Finalize handler so the playtest quickstart
 * (`src/session/quickstart.js`) and the wizard share one pipeline — both
 * produce identical sectors, and gating tweaks apply to both. Throws on
 * pipeline failure; callers own the user-facing error surface.
 *
 * Idempotent per sector id (issue #321 U46): a call while the same sector's
 * creation is running joins that run, and a call for a sector already
 * stored returns its record — neither creates a second set of Actors, a
 * second Sector Record or a second Scene, nor pays for the art and narrator
 * calls again. A failed run is not stored, so it can be retried.
 *
 * @param {Object} sector — a SectorResult from generateSector()
 * @returns {Promise<Object>} the stored sector record
 */
export function runSectorCreationPipeline(sector) {
  const id = sector?.id ?? null;
  if (!id) return createSector(sector);
  if (creationsInFlight.has(id)) return creationsInFlight.get(id);
  const stored = findStoredSector(id);
  if (stored) return Promise.resolve(stored);
  const run = createSector(sector).finally(() => creationsInFlight.delete(id));
  creationsInFlight.set(id, run);
  return run;
}

/**
 * The stored record for a sector id once storeSector has written it — not the
 * bare {id, name} entry createEntityJournals registers while a run is
 * underway (that one carries no mapData).
 */
function findStoredSector(id) {
  const sectors = game.settings.get(MODULE_ID, "campaignState")?.sectors;
  return (Array.isArray(sectors) ? sectors : []).find(s => s?.id === id && s.mapData) ?? null;
}

async function createSector(sector) {
  const campaignState = game.settings.get(MODULE_ID, "campaignState");

  const artEnabled   = getSetting("sectorArtEnabled",            true);
  const stubsEnabled = getSetting("sectorNarratorStubsEnabled",  true);
  const narratorSettings = getNarratorSettings();

  await postProgressCard(`◈ Sector Creator — Generating ${sector.name}…`);

  // Run entity creation + art + narrator stubs in parallel
  const [entityData, backgroundPath, stubs] = await Promise.all([
    createEntityJournals(sector, campaignState),
    artEnabled
      ? generateSectorBackground(sector, campaignState).catch(err => {
          // generateSectorBackground notifies its own failure paths; this
          // catch is the safety net for anything that bubbled out.
          console.warn(`${MODULE_ID} | Sector art unhandled rejection:`, err?.message ?? err);
          ui.notifications?.error(
            `Starforged Companion: Sector art failed unexpectedly: ${err?.message ?? err}`,
            { permanent: true }
          );
          return null;
        })
      : Promise.resolve(null),
    stubsEnabled
      ? generateNarratorStubs(sector, narratorSettings).catch(err => {
          console.warn(`${MODULE_ID} | Narrator stubs unhandled rejection:`, err?.message ?? err);
          return { sector: null, settlements: {} };
        })
      : Promise.resolve({ sector: null, settlements: {} }),
  ]);

  // Mirror settlement stubs onto the entity records so the canonical
  // entity description matches what the sector journal page shows.
  await applyStubsToSettlementEntities(entityData.settlements, stubs);

  // F5: stamp each sector-created settlement as finalized and trigger a
  // first-time portrait (which also becomes the token image), so the GM
  // doesn't have to click ✦ Finalise on every settlement individually.
  // Gated on a setting so the OpenRouter cost is opt-out.
  const portraitsEnabled = getSetting("sectorEntityPortraitsEnabled", true);
  if (portraitsEnabled) {
    try {
      await finalizeSectorEntities(entityData.settlements, stubs, campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | finalizeSectorEntities unhandled rejection:`, err?.message ?? err);
    }
  }

  // Sector journal (needs stubs + the gen-id→Actor map so the overview can
  // emit @UUID document links to each settlement Actor — see scope §3.6);
  // scene sequential after background resolves.
  const sectorJournal = await createSectorJournal(sector, stubs, entityData.settlements);
  const scene         = await createSectorScene(sector, backgroundPath, entityData.settlements);

  const stored = await storeSector(sector, {
    settlements:         entityData.settlements,
    connectionJournalId: entityData.connectionJournalId,
    sites:               entityData.sites,
    backgroundPath,
    sceneId:             scene?.id     ?? null,
    sectorJournalId:     sectorJournal?.id ?? null,
    stubs,
  }, campaignState);

  await ChatMessage.create({
    content: formatSectorCard(stored),
    flags: { [MODULE_ID]: { sectorCreated: true, sectorId: stored.id } },
  });

  ui.notifications.info(`Sector "${stored.name}" created.`);
  return stored;
}


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC OPENER
// ─────────────────────────────────────────────────────────────────────────────

export function openSectorCreator() {
  if (!game.user?.isGM) {
    ui.notifications.warn("Sector Creator is available to GMs only.");
    return;
  }
  SectorCreatorApp.open();
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** The starting settlement's zoom-in (step 8), or "" for the others. */
function zoomInLine(s) {
  const firstLook = (Array.isArray(s.firstLook) ? s.firstLook : []).filter(Boolean).join(", ");
  const bits = [
    firstLook          ? `First look: ${firstLook}`            : "",
    s.initialContact   ? `Initial contact: ${s.initialContact}` : "",
    s.trouble          ? `Trouble: ${s.trouble}`                : "",
  ].filter(Boolean);
  return bits.length
    ? `<div class="sf-settlement-zoom">🔍 Starting settlement — ${bits.join(" · ")}</div>`
    : "";
}

function labelLocationType(t) {
  switch (t) {
    case "orbital":    return "Orbital";
    case "planetside": return "Planetside";
    default:           return "Deep Space";
  }
}

function getSetting(key, fallback) {
  try {
    return game.settings.get(MODULE_ID, key) ?? fallback;
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorPanel: settings.get(${key}) failed; using fallback:`, err);
    return fallback;
  }
}

function getNarratorSettings() {
  return {
    perspective: getSetting("narrationPerspective", "auto"),   // auto / second_person / third_person
    tone:        getSetting("narrationTone",        "wry"),
  };
}

async function postProgressCard(text) {
  try {
    await ChatMessage.create({
      content: `<div class="sf-sector-progress-card"><span>◈</span> ${text}</div>`,
      flags: { [MODULE_ID]: { sectorProgress: true } },
    });
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorPanel: postProgressCard failed (non-critical):`, err);
  }
}

function formatSectorCard(sector) {
  const settlementList = (sector.mapData?.settlements ?? [])
    .map(s => s.name)
    .join(", ");

  return `
    <div class="sf-sector-card">
      <div class="sf-sector-card-title">◈ Sector Created: <strong>${sector.name}</strong></div>
      <div class="sf-sector-card-region">Region: ${sector.regionLabel}</div>
      <div class="sf-sector-card-trouble">Trouble: ${sector.trouble}</div>
      ${settlementList ? `<div class="sf-sector-card-settlements">Settlements: ${settlementList}</div>` : ""}
    </div>
  `.trim();
}
