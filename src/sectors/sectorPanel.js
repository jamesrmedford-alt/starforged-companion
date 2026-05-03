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
    classes: ["starforged-companion", "sf-sector-creator"],
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
              <span>4 settlements · 3 passages · Dense, well-charted</span>
            </button>
            <button class="sf-region-btn" data-action="chooseRegion" data-region="outlands">
              <strong>Outlands</strong>
              <span>3 settlements · 2 passages · Frontier, scattered</span>
            </button>
            <button class="sf-region-btn" data-action="chooseRegion" data-region="expanse">
              <strong>Expanse</strong>
              <span>2 settlements · 1 passage · Remote, uncharted</span>
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
            <button class="sf-btn sf-btn-secondary" data-action="rerollSector">
              🎲 Re-generate Sector
            </button>
            <button class="sf-btn sf-btn-primary" data-action="finalizeSector">
              ✓ Create Sector
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
    if (!this.#region) return;
    this.#sector = generateSector(this.#region);
    this.render();
  }

  static async #onFinalizeSector(_event, _target) {
    if (!this.#sector) return;

    const campaignState = game.settings.get(MODULE_ID, "campaignState");

    try {
      const artEnabled   = getSetting("sectorArtEnabled",            true);
      const stubsEnabled = getSetting("sectorNarratorStubsEnabled",  true);
      const narratorSettings = getNarratorSettings();

      await postProgressCard(`◈ Sector Creator — Generating ${this.#sector.name}…`);

      // Run entity creation + art + narrator stubs in parallel
      const [entityData, backgroundPath, stubs] = await Promise.all([
        createEntityJournals(this.#sector, campaignState),
        artEnabled
          ? generateSectorBackground(this.#sector, campaignState).catch(() => null)
          : Promise.resolve(null),
        stubsEnabled
          ? generateNarratorStubs(this.#sector, narratorSettings).catch(() => ({ sector: null, settlements: {} }))
          : Promise.resolve({ sector: null, settlements: {} }),
      ]);

      // Sector journal (needs stubs); scene (needs background + entity journals)
      const [sectorJournal, scene] = await Promise.all([
        createSectorJournal(this.#sector, stubs),
        createSectorScene(this.#sector, backgroundPath, entityData.settlements),
      ]);

      const stored = await storeSector(this.#sector, {
        settlements:         entityData.settlements,
        connectionJournalId: entityData.connectionJournalId,
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
      this.close();
    } catch (err) {
      console.error(`${MODULE_ID} | Sector creation failed:`, err);
      ui.notifications.error("Sector Creator: Failed to save sector. See console for details.");
    }
  }

  static #onCancel(_event, _target) {
    this.close();
  }
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

function labelLocationType(t) {
  switch (t) {
    case "orbital":    return "Orbital";
    case "planetside": return "Planetside";
    default:           return "Deep Space";
  }
}

function getSetting(key, fallback) {
  try { return game.settings.get(MODULE_ID, key) ?? fallback; }
  catch { return fallback; }
}

function getNarratorSettings() {
  return {
    perspective: getSetting("narrationPerspective", "second"),
    tone:        getSetting("narrationTone",        "wry"),
  };
}

async function postProgressCard(text) {
  try {
    await ChatMessage.create({
      content: `<div class="sf-sector-progress-card"><span>◈</span> ${text}</div>`,
      flags: { [MODULE_ID]: { sectorProgress: true } },
    });
  } catch {
    // Non-critical
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
