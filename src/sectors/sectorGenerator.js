/**
 * STARFORGED COMPANION
 * src/sectors/sectorGenerator.js — 11-step sector generation
 *
 * Orchestrates oracle rolls for all steps of Starforged sector creation
 * (rulebook pp. 114–127). All generation is deterministic given fixed rolls,
 * and all functions work outside a live Foundry context for unit testing.
 *
 * Source: Starforged Rulebook pp. 114–127
 */

// rollOracle is imported for potential future use by panel overrides
import { createSettlement, updateSettlement } from "../entities/settlement.js";
import { createConnection }    from "../entities/connection.js";
import { getOrCreateSectorJournalFolder } from "../entities/folder.js";
import { finalizeEntityArtOnly } from "../entities/finalize.js";
import { buildSettlementsListHtml } from "./sectorOverview.js";
import { recordThreat }         from "../world/worldJournal.js";
import { apiPost }             from "../api-proxy.js";
import * as SETTLEMENTS        from "../oracles/tables/settlements.js";
import * as SPACE              from "../oracles/tables/space.js";
import * as PLANETS            from "../oracles/tables/planets.js";
import * as CHARACTERS         from "../oracles/tables/characters.js";
import * as MISC               from "../oracles/tables/misc.js";
import * as CORE               from "../oracles/tables/core.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const STUB_MODEL    = "claude-haiku-4-5-20251001";

const REGION_LABELS = {
  terminus: "Terminus (the settled core)",
  outlands: "Outlands (the frontier)",
  expanse:  "Expanse (the far reaches)",
  void:     "Void (beyond the Forge)",
};

const MODULE_ID = "starforged-companion";

// ─────────────────────────────────────────────────────────────────────────────
// REGION CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const REGION_CONFIG = {
  terminus: { settlements: 4, passages: 4, label: "Terminus" },
  outlands: { settlements: 3, passages: 3, label: "Outlands" },
  expanse:  { settlements: 2, passages: 2, label: "Expanse"  },
};

const POPULATION_TABLE_BY_REGION = {
  terminus: SETTLEMENTS.POPULATION_TERMINUS,
  outlands: SETTLEMENTS.POPULATION_OUTLANDS,
  expanse:  SETTLEMENTS.POPULATION_EXPANSE,
};


// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the full 11-step sector creation process.
 *
 * @param {string} region      — "terminus" | "outlands" | "expanse"
 * @param {Object} [overrides] — Optional fixed values per field (for re-rolls and manual input)
 * @returns {SectorResult}
 */
export function generateSector(region, _overrides = {}) {
  const cfg = REGION_CONFIG[region];
  if (!cfg) throw new Error(`Unknown region: ${region}`);

  // Step 1: Stellar object — rolled once per sector and shared across all
  // settlements / planets in that sector (F7). Drives the scene-map stellar
  // pin (sceneBuilder.js → iconForStellarObject) which was already wired up
  // but starved of data because nothing populated this field.
  const stellar = rollTableResult(SPACE.STELLAR_OBJECT);

  // Steps 3–5: Generate each settlement, sharing the sector's stellar object.
  const settlements = [];
  for (let i = 0; i < cfg.settlements; i++) {
    const s = generateSettlement(region);
    s.stellar = stellar;
    settlements.push(s);
  }

  // Step 10: Sector trouble
  const trouble = rollTableResult(MISC.SECTOR_TROUBLE);

  // Step 11: Sector name
  const sectorName = generateSectorName();

  // Step 9: Local connection (uses first settlement as home)
  const connection = generateConnection(settlements[0]?.name ?? "the sector");

  // Step 7: Passages (placeholder grid passages — wizard lets GM draw them)
  const passages = [];
  for (let i = 0; i < cfg.passages; i++) {
    if (settlements[i] && settlements[i + 1]) {
      passages.push({ fromId: settlements[i].id, toId: settlements[i + 1].id, toEdge: false });
    } else {
      passages.push({ fromId: settlements[i].id, toId: null, toEdge: true, edgeDirection: "right" });
    }
  }

  const id = generateId();

  return {
    id,
    name:        sectorName.full,
    namePrefix:  sectorName.prefix,
    nameSuffix:  sectorName.suffix,
    region,
    regionLabel: cfg.label,
    trouble,
    faction:     null,
    settlements,
    connection,
    passages,
    mapData: {
      sectorId:    id,
      gridWidth:   10,
      gridHeight:  8,
      settlements: settlements.map((s, idx) => ({
        id:      s.id,
        name:    s.name,
        type:    locationTypeToMarker(s.locationType),
        gridX:   autoLayoutX(idx, cfg.settlements),
        gridY:   autoLayoutY(idx, cfg.settlements),
        visited: false,
      })),
      passages,
      discoveries: [],
    },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Generate a single settlement with all required detail rolls.
 *
 * @param {string} region
 * @param {number} [projectCount] — 1 or 2 (default random: 1–2)
 * @returns {SettlementResult}
 */
export function generateSettlement(region, projectCount) {
  const popTable = POPULATION_TABLE_BY_REGION[region] ?? SETTLEMENTS.POPULATION_TERMINUS;

  const locationType = normalizeLocationType(rollTableResult(SETTLEMENTS.LOCATION));
  const population   = rollTableResult(popTable);
  const authority    = rollTableResult(SETTLEMENTS.AUTHORITY);
  const name         = rollTableResult(SETTLEMENTS.NAMES);

  const count    = projectCount ?? (rollD100() <= 50 ? 1 : 2);
  const projects = [];
  for (let i = 0; i < count; i++) {
    projects.push(rollTableResult(SETTLEMENTS.PROJECTS));
  }

  let planet = null;
  if (locationType === "orbital" || locationType === "planetside") {
    planet = generatePlanet(locationType);
  }

  return {
    id:           generateId(),
    name,
    locationType,
    population,
    authority,
    projects,
    planet,
    trouble:      null,
    firstLook:    [],
    stellar:      null,
  };
}

/**
 * Generate planet details for a settlement.
 *
 * @param {string} settlementLocationType — "orbital" | "planetside"
 * @returns {PlanetResult}
 */
export function generatePlanet(_settlementLocationType) {
  const type = rollTableResult(PLANETS.PLANET_TYPE);
  const name = generatePlanetName(type);
  return { type, name };
}

/**
 * Generate a local connection NPC.
 *
 * @param {string} homeSettlementName
 * @returns {ConnectionResult}
 */
export function generateConnection(homeSettlementName) {
  const givenName  = rollTableResult(CHARACTERS.GIVEN_NAMES);
  const familyName = rollTableResult(CHARACTERS.FAMILY_NAMES);
  const role       = rollTableResult(CHARACTERS.ROLE);
  const goal       = rollTableResult(CHARACTERS.GOAL);
  const aspect     = rollTableResult(CHARACTERS.DISPOSITION);
  const firstLook  = [rollTableResult(CHARACTERS.FIRST_LOOK)];

  return {
    id:             generateId(),
    name:           `${givenName} ${familyName}`,
    role,
    goal,
    aspect,
    firstLook,
    homeSettlement: homeSettlementName,
  };
}

/**
 * Generate the sector name from prefix + suffix rolls.
 *
 * @returns {{ prefix: string, suffix: string, full: string }}
 */
export function generateSectorName() {
  const prefix = rollTableResult(SPACE.SECTOR_NAME_PREFIX);
  const suffix = rollTableResult(SPACE.SECTOR_NAME_SUFFIX);
  return { prefix, suffix, full: `${prefix} ${suffix}` };
}

/**
 * Create entity journal records for all settlements and the connection.
 * Returns settlement JournalEntry objects (needed for Scene Note pins).
 *
 * @param {SectorResult} sector
 * @param {Object} campaignState
 * @returns {Promise<{ settlements: Object, connectionJournalId: string|null }>}
 */
export async function createEntityJournals(sector, campaignState) {
  const settlements = {};

  // Pre-register a minimal {id, name} stub for this sector in campaignState
  // before any settlement is created. The actor-folder helpers
  // (`getOrCreateSectorActorFolder` in src/entities/folder.js) resolve the
  // per-sector Actor folder by walking `campaignState.sectors[]` for a
  // matching id; without this stub, every settlement created here can't
  // resolve its sector name and falls back to the shared `Sectors / Unsorted`
  // folder (F4). storeSector() later replaces this stub with the full
  // sector record — the stub just keeps the folder lookup alive during
  // entity creation. Idempotent so re-runs don't double-register.
  campaignState.sectors ??= [];
  if (!campaignState.sectors.some(s => s?.id === sector.id)) {
    campaignState.sectors.push({ id: sector.id, name: sector.name });
  }

  // persist:false on the entity creators — storeSector (the only caller of
  // this function in production) performs a single batched game.settings.set
  // at the end. Multiple sequential writes against the same campaignState
  // reference race in Foundry v13 and lose late-stage mutations like
  // sectors.push() and activeSectorId.
  for (const s of sector.settlements) {
    const beforeLen = campaignState.settlementIds?.length ?? 0;
    await createSettlement({
      name:       s.name,
      location:   locationTypeToLabel(s.locationType),
      population: s.population,
      authority:  s.authority,
      projects:   s.projects,
      trouble:    s.trouble ?? null,
      planet:     s.planet ?? null,
      stellar:    s.stellar ?? null,
      sectorId:   sector.id,
    }, campaignState, { persist: false });
    const actorId = campaignState.settlementIds?.[beforeLen] ?? null;
    const actor   = actorId ? (game.actors?.get(actorId) ?? null) : null;
    settlements[s.id] = actor;
    if (actor) {
      // Settlements created by the sector generator are canonical — narrator
      // entity discovery must not overwrite them. Flip the lock via the
      // registry so the actor-host path stays correct.
      try {
        const existing = actor.getFlag(MODULE_ID, "settlement") ?? {};
        await actor.setFlag(MODULE_ID, "settlement", {
          ...existing,
          canonicalLocked: true,
          updatedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(`${MODULE_ID} | sectorGenerator: failed to lock settlement ${actorId}:`, err);
      }
    }
  }

  const connBeforeLen = campaignState.connectionIds?.length ?? 0;
  await createConnection({
    name:     sector.connection.name,
    role:     sector.connection.role,
    goal:     sector.connection.goal,
    rank:     "dangerous",
    location: sector.connection.homeSettlement,
    sectorId: sector.id,
  }, campaignState, { persist: false });
  // connectionJournalId now carries the NPC-card Actor id (connections converted
  // to `character` Actors under FOLDER-002); the field name is kept for the
  // storeSector/sectorPanel call chain that threads this id through.
  const connectionJournalId = campaignState.connectionIds?.[connBeforeLen] ?? null;
  if (connectionJournalId) {
    // Connections created by the sector wizard are canonical — lock via the
    // actor flag, mirroring the settlement canonical-lock above.
    try {
      const connActor = game.actors?.get(connectionJournalId) ?? null;
      if (connActor) {
        const existing = connActor.getFlag(MODULE_ID, "connection") ?? {};
        await connActor.setFlag(MODULE_ID, "connection", {
          ...existing,
          canonicalLocked: true,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error(`${MODULE_ID} | sectorGenerator: failed to lock connection ${connectionJournalId}:`, err);
    }
  }

  return { settlements, connectionJournalId };
}

/**
 * Store a completed sector to campaign state with all enhanced IDs.
 *
 * @param {SectorResult} sector
 * @param {Object} extras — { settlements, connectionJournalId, backgroundPath, sceneId, sectorJournalId, stubs }
 * @param {Object} campaignState
 * @returns {Promise<StoredSector>}
 */
export async function storeSector(sector, extras, campaignState) {
  const {
    settlements      = {},
    connectionJournalId = null,
    backgroundPath   = null,
    sceneId          = null,
    sectorJournalId  = null,
    stubs            = { sector: null, settlements: {} },
  } = extras ?? {};

  // Single source of truth: the global lists campaignState.settlementIds and
  // campaignState.connectionIds are authoritative. Each sector record below
  // holds a *reference subset* of those same JournalEntry IDs — never a copy
  // or a parallel ID space. createSettlement()/createConnection() are
  // responsible for pushing IDs to the global lists; we read the same IDs
  // back here via `settlements`/`connectionJournalId`.
  const stored = {
    id:                 sector.id,
    name:               sector.name,
    region:             sector.region,
    regionLabel:        sector.regionLabel,
    trouble:            sector.trouble,
    faction:            sector.faction,
    createdAt:          sector.createdAt,
    mapData:            sector.mapData,
    settlementIds:      Object.values(settlements).map(j => j?.id ?? null).filter(Boolean),
    connectionId:       connectionJournalId,
    // Enhanced fields
    backgroundPath,
    sceneId,
    sectorJournalId,
    entityJournalIds:   Object.fromEntries(
      Object.entries(settlements).map(([id, j]) => [id, j?.id ?? null])
    ),
    backgroundGenerated: !!backgroundPath,
    stubs,
  };

  // Save to campaign state
  // Backward-compat: the Quench test pre-dates the extras parameter and calls
  // storeSector(sector, campaignState) with two arguments. Detect that case
  // and remap so callers using the old two-arg signature still work.
  if (campaignState === undefined) {
    campaignState = extras ?? {};
  }
  // Defensive init — Quench test mock predates these fields in CampaignStateSchema.
  campaignState.sectors     ??= [];
  campaignState.locationIds ??= [];
  // createEntityJournals pre-registers a {id, name} stub so the actor-folder
  // helpers can resolve the per-sector folder before any settlement is
  // created (F4). Replace that stub in-place rather than push-and-duplicate.
  const stubIdx = campaignState.sectors.findIndex(s => s?.id === stored.id);
  if (stubIdx >= 0) campaignState.sectors[stubIdx] = stored;
  else              campaignState.sectors.push(stored);
  campaignState.activeSectorId = stored.id;

  // §3.5: saveSectorToJournal removed — no production code read the
  // "Starforged Sectors" JournalEntry flag, and campaignState.sectors[] is
  // the authoritative store. The migrator deletes any orphan journal left
  // by pre-migration runs.

  // World Journal integration — record the sector trouble as an active
  // threat so the narrator-context assembler surfaces it during play.
  // Non-blocking: a WJ write failure should not abort sector creation.
  if (sector?.trouble) {
    try {
      await recordThreat(sector.trouble, {
        type:     "environmental",
        severity: "looming",
        summary:  `Trouble in ${sector.name ?? "this sector"}: ${sector.trouble}`,
      }, campaignState);
    } catch (err) {
      console.warn(`${MODULE_ID} | sectorGenerator: recordThreat failed for ${sector.name}:`, err?.message ?? err);
    }
  }

  await persistCampaignState(campaignState);

  return stored;
}

/**
 * Generate atmospheric narrator stubs for a sector and all its settlements.
 * Uses claude-haiku — brief, fast, uncached. Returns empty stubs on failure.
 *
 * @param {SectorResult} sector
 * @param {Object} [narratorSettings] — { perspective, tone }
 * @returns {Promise<{ sector: string|null, settlements: Object }>}
 */
export async function generateNarratorStubs(sector, narratorSettings = {}) {
  const apiKey = getClaudeApiKey();
  if (!apiKey) return { sector: null, settlements: {} };

  const perspective = narratorSettings.perspective ?? "second";
  const perspectiveNote = perspective === "first"
    ? "Narrate in first person (the protagonist's voice)"
    : "Narrate in second person (address the protagonist as 'you')";

  const regionLabel   = REGION_LABELS[sector.region] ?? sector.regionLabel ?? sector.region;
  const settlementList = sector.settlements
    .map(s => `${s.name} (${locationTypeToLabel(s.locationType)})`)
    .join(", ");

  // Fire the sector stub and every settlement stub in parallel — they're
  // independent calls and serialising them stacks Anthropic round-trips,
  // which on Forge can push wall-clock past the Quench live-API timeout.
  const [sectorStubText, ...settlementResults] = await Promise.all([
    callStubApi(
      buildSectorStubPrompt(sector, regionLabel, settlementList, perspectiveNote),
      // ~110 words for a 2–3 sentence atmospheric paragraph. 150 tokens cut the
      // prose off mid-sentence (F4); 320 lets the requested length complete.
      320,
      apiKey
    ).catch(err => {
      console.warn(`${MODULE_ID} | sectorGenerator: sector stub generation failed:`, err);
      return null;
    }),
    ...sector.settlements.map(s =>
      callStubApi(
        buildSettlementStubPrompt(s, sector, regionLabel, perspectiveNote),
        // 1–2 sentences; 100 tokens risked the same mid-sentence cut-off.
        220,
        apiKey
      ).catch(err => {
        console.warn(`${MODULE_ID} | sectorGenerator: settlement stub generation failed for ${s.id}:`, err);
        return null;
      })
    ),
  ]);

  const settlements = Object.fromEntries(
    sector.settlements.map((s, i) => [s.id, settlementResults[i]])
  );

  return { sector: sectorStubText, settlements };
}

/**
 * Write each settlement narrator stub into its settlement Actor's description,
 * so the canonical entity carries the same prose as the sector journal page.
 *
 * Settlements are foundry-ironsworn `location` Actors post-migration; the stub
 * is routed through `updateSettlement`, which patches both `system.description`
 * (the sheet body) and the module flag (`flags.settlement.description`). The
 * pre-migration code wrote to a JournalEntry page that no longer exists, so the
 * stub was silently dropped and sector-born settlements rendered with an empty
 * body (finding F3). Safe to call when stubs are missing — those settlements
 * are left untouched.
 *
 * @param {Object} settlements — { sourceSettlementGenId: Actor|null }
 * @param {{ settlements?: Object }} stubs — output from generateNarratorStubs()
 * @returns {Promise<void>}
 */
export async function applyStubsToSettlementEntities(settlements, stubs) {
  if (!stubs?.settlements) return;
  for (const [sourceId, actor] of Object.entries(settlements ?? {})) {
    const stub = stubs.settlements[sourceId];
    if (!stub || !actor?.id) continue;
    try {
      // F17: combine the narrator prose with a structured rolled-detail block
      // so the sheet displays both the atmospheric description AND the
      // Population/Authority/Projects/Trouble that the wizard rolled.
      const data = actor.flags?.[MODULE_ID]?.settlement ?? {};
      const description = composeSettlementDescription(stub, data);
      await updateSettlement(actor.id, { description });
    } catch (err) {
      console.warn(`${MODULE_ID} | Sector: could not write stub to settlement Actor:`, err.message);
    }
  }
}

/**
 * Finalize sector-created settlement entities: stamp `finalizedAt` and trigger
 * a first-time portrait (which Foundry installs as both the Actor's `img` and
 * its `prototypeToken.texture.src`, so the token in scenes matches the sheet).
 * Resolves F5 from the v1.7.0 playtest — settlements landed in the world
 * without portraits or tokens, leaving the GM to click ✦ Finalise on each one
 * manually. Once the sector wizard runs (a deliberate GM-paid action), the
 * settlements get the same finalize pass that the Entity Panel button does,
 * minus the redundant Claude flavour call — the narrator stubs already
 * generated the rich prose and we use that as the portrait source.
 *
 * Per-settlement failures are logged but never abort the loop; an unset
 * OpenRouter key, a missing stub, or a write error skips the affected
 * settlement and the rest still finalize.
 *
 * @param {Object} settlementsByGenId    — { sourceSettlementGenId: Actor|null } from createEntityJournals
 * @param {{ settlements?: Object }} stubs — output from generateNarratorStubs()
 * @param {Object} campaignState
 * @returns {Promise<{ finalized: number, portraitsTriggered: number, skipped: number }>}
 */
export async function finalizeSectorEntities(settlementsByGenId, stubs, campaignState) {
  let finalized = 0, portraitsTriggered = 0, skipped = 0;
  if (!settlementsByGenId) return { finalized, portraitsTriggered, skipped };

  for (const [genId, actor] of Object.entries(settlementsByGenId)) {
    if (!actor?.id) { skipped++; continue; }
    const stub = stubs?.settlements?.[genId] ?? null;
    try {
      const result = await finalizeEntityArtOnly(
        "settlement",
        actor.id,
        campaignState,
        { portraitSourceDescription: stub }
      );
      if (result.ok && result.reason === "finalized") {
        finalized++;
        if (result.artTriggered) portraitsTriggered++;
      } else if (result.reason === "already-finalized") {
        skipped++;
      } else {
        console.warn(`${MODULE_ID} | finalizeSectorEntities: ${actor.id} → ${result.reason}`);
        skipped++;
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | finalizeSectorEntities: ${actor.id} threw:`, err?.message ?? err);
      skipped++;
    }
  }
  return { finalized, portraitsTriggered, skipped };
}

/**
 * Build the settlement-sheet description body: narrator prose first, then a
 * compact, dot-separated facts line carrying every rolled oracle result. The
 * foundry-ironsworn Location-actor schema only exposes `subtype`/`klass`/
 * `description` — there's no `system.population` / `system.authority` /
 * etc. — so the rolled details either ride in the description HTML or stay
 * invisible to the sheet (F17).
 *
 * @param {string} prose       — narrator-generated atmospheric prose, HTML or plain.
 * @param {Object} data        — settlement payload (matches SettlementSchema).
 * @returns {string} description HTML.
 */
export function composeSettlementDescription(prose, data = {}) {
  const esc = (s) => String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts = [];
  if (data.location)            parts.push(`<strong>Location:</strong> ${esc(data.location)}`);
  if (data.population)          parts.push(`<strong>Population:</strong> ${esc(data.population)}`);
  if (data.authority)           parts.push(`<strong>Authority:</strong> ${esc(data.authority)}`);
  if (data.projects?.length)    parts.push(`<strong>Projects:</strong> ${data.projects.map(esc).join(", ")}`);
  if (data.trouble)             parts.push(`<strong>Trouble:</strong> ${esc(data.trouble)}`);
  if (data.firstLook)           parts.push(`<strong>First look:</strong> ${esc(data.firstLook)}`);
  if (data.initialContact)      parts.push(`<strong>Initial contact:</strong> ${esc(data.initialContact)}`);
  if (data.stellar)             parts.push(`<strong>Stellar object:</strong> ${esc(data.stellar)}`);

  const proseHtml  = prose ? (prose.trim().startsWith("<") ? prose : `<p>${esc(prose)}</p>`) : "";
  const factsHtml  = parts.length ? `<p>${parts.join(" &middot; ")}</p>` : "";
  if (proseHtml && factsHtml) return `${proseHtml}<hr>${factsHtml}`;
  return proseHtml || factsHtml;
}

/**
 * Create a Foundry journal entry for a sector with narrator stubs as pages.
 *
 * @param {SectorResult} sector
 * @param {{ sector: string|null, settlements: Object }} stubs
 * @returns {Promise<JournalEntry|null>}
 */
export async function createSectorJournal(sector, stubs = {}, settlementsByGenId = {}) {
  try {
    const regionLabel = REGION_LABELS[sector.region] ?? sector.regionLabel ?? sector.region;

    // Per docs/entities/entity-actor-migration-scope.md §3.4: sector-record journals
    // live under per-sector subfolders, not flat under "Sectors". The campaign
    // state may not have the slim sectors[] entry yet when this is called
    // during storeSector — pass through what we know.
    const folderId = await getOrCreateSectorJournalFolder(sector.id, {
      sectors: [{ id: sector.id, name: sector.name }],
    });

    const journal = await JournalEntry.create({
      name:   `${sector.name} — Sector Record`,
      folder: folderId,
      flags: {
        [MODULE_ID]: {
          sectorRecord: true,
          sectorId:     sector.id,
        },
      },
    });

    // §3.6 — Settlement list renders as Foundry document links to the
    // settlement Actors so it stays current when the GM edits an Actor.
    // The settlements map (gen-side id → Actor) is provided by the caller
    // (storeSector / createEntityJournals); without it, the helper falls
    // back to a plain text list of names. The wrapper marker comments let
    // the live updateActor hook and the migrator's sector-rewrite step
    // replace just this section without disturbing the narrator stub.
    const settlementListHtml = buildSettlementsListHtml(sector, settlementsByGenId);

    const passageCount = sector.passages?.length ?? 0;
    const passageSummary = passageCount === 1 ? "1 passage" : `${passageCount} passages`;

    await journal.createEmbeddedDocuments("JournalEntryPage", [{
      name: sector.name,
      type: "text",
      text: {
        content: `<h2>${escapeHtml(sector.name)}</h2>
<p><strong>Region:</strong> ${escapeHtml(regionLabel)}</p>
<p><strong>Trouble:</strong> ${escapeHtml(sector.trouble)}</p>
${sector.faction ? `<p><strong>Control:</strong> ${escapeHtml(sector.faction)}</p>` : ""}
<hr>
<p class="narrator-stub">${escapeHtml(stubs.sector ?? "")||"<em>No narrator text generated.</em>"}</p>
<hr>
<h3>Settlements</h3>
${settlementListHtml}
<h3>Passages</h3>
<p>${escapeHtml(passageSummary)} charted.</p>`,
        format: 1,
      },
    }]);

    // §3.6: per-settlement embedded pages are no longer generated. Settlement
    // detail lives on the Actor; the overview's UUID links resolve there.
    return journal;
  } catch (err) {
    console.error(`${MODULE_ID} | createSectorJournal failed:`, err);
    throw err;
  }
}




// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roll on a table and return the result string.
 *
 * Resolves rulebook directive entries in-place so callers never see raw
 * `"Roll twice"`, `"Roll again (paired name)"`, or `"Action + Theme"` strings:
 *
 *   - `"Roll twice"`     → roll twice more on the same table, join with `" / "`.
 *   - `"Roll again …"`   → roll twice more on the same table, join with `"-"`
 *                          (the `(paired name)` form on FAMILY_NAMES).
 *   - `ref: "action_theme"` → roll CORE.ACTION + CORE.THEME, join with `" "`.
 *
 * Recursion is depth-capped (`MAX_DIRECTIVE_DEPTH`); at the cap we fall back
 * to whatever the directive entry's `result` string was so the chain
 * terminates with something readable rather than throwing.
 *
 * @param {Array<{min:number, max:number, result:string, ref?:string}>} table
 * @param {number} [fixedRoll]
 * @param {{ depth?: number, fixedRolls?: number[] }} [opts]
 * @returns {string}
 */
const MAX_DIRECTIVE_DEPTH = 4;

export function rollTableResult(table, fixedRoll, opts = {}) {
  const depth      = opts.depth ?? 0;
  const fixedRolls = opts.fixedRolls;
  const roll       = fixedRoll
    ?? (fixedRolls && fixedRolls.length ? fixedRolls.shift() : rollD100());
  const entry      = table.find(e => roll >= e.min && roll <= e.max);
  if (!entry) return "Unknown";

  // Cross-reference directive: "Action + Theme" rolls CORE.ACTION + CORE.THEME.
  if (entry.ref === "action_theme") {
    if (depth >= MAX_DIRECTIVE_DEPTH) return entry.result;
    const sub = { depth: depth + 1, fixedRolls };
    const action = rollTableResult(CORE.ACTION, undefined, sub);
    const theme  = rollTableResult(CORE.THEME,  undefined, sub);
    return `${action} ${theme}`;
  }

  // "Roll again …" or "Roll twice" — recurse on the same table twice and join.
  // The `(paired name)` parenthetical (FAMILY_NAMES 81-100) signals a hyphen
  // join for hyphenated surnames; everything else uses `" / "`.
  if (/^Roll (twice|again)\b/i.test(entry.result)) {
    if (depth >= MAX_DIRECTIVE_DEPTH) return entry.result;
    const sub = { depth: depth + 1, fixedRolls };
    const a = rollTableResult(table, undefined, sub);
    const b = rollTableResult(table, undefined, sub);
    const joiner = /paired name/i.test(entry.result) ? "-" : " / ";
    return `${a}${joiner}${b}`;
  }

  return entry.result;
}

function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

function normalizeLocationType(rawLocation) {
  const l = rawLocation.toLowerCase();
  if (l.includes("planetside")) return "planetside";
  if (l.includes("orbital"))    return "orbital";
  return "deep_space";
}

function locationTypeToLabel(locationType) {
  switch (locationType) {
    case "orbital":    return "Orbital";
    case "planetside": return "Planetside";
    default:           return "Deep Space";
  }
}

function locationTypeToMarker(locationType) {
  switch (locationType) {
    case "orbital":    return "orbital";
    case "planetside": return "planetside";
    default:           return "deep_space";
  }
}

function generatePlanetName(_planetType) {
  // Derive a short name from the planet type + a generated word
  const prefixes = ["Aethon", "Vorn", "Drekkis", "Caul", "Mireth", "Solian", "Thraxis", "Ulven"];
  const suffixes = ["Prime", "Major", "Secundus", "IV", "Alpha", "Drift", "Deep", "End"];
  const prefix   = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix   = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${prefix} ${suffix}`;
}

function autoLayoutX(index, _total) {
  // Spread settlements across the 10-cell-wide grid with padding
  return 1 + (index * 2) + Math.floor(Math.random() * 2);
}

function autoLayoutY(index, _total) {
  // Alternate between upper and lower halves
  return index % 2 === 0 ? 2 + Math.floor(Math.random() * 2) : 5 + Math.floor(Math.random() * 2);
}

function generateId() {
  try   { return foundry.utils.randomID(); }
  catch { return Math.random().toString(36).slice(2, 10); }
}

async function persistCampaignState(campaignState) {
  try {
    await game.settings.set(MODULE_ID, "campaignState", campaignState);
  } catch (err) {
    console.error(`${MODULE_ID} | sectorGenerator: persistCampaignState failed:`, err);
    throw err;
  }
}

function getClaudeApiKey() {
  try {
    return game.settings.get(MODULE_ID, "claudeApiKey") || null;
  } catch (err) {
    console.warn(`${MODULE_ID} | sectorGenerator: claudeApiKey settings read failed:`, err);
    return null;
  }
}

function buildSectorStubPrompt(sector, regionLabel, settlementList, perspectiveNote) {
  return `You are the narrator for an Ironsworn: Starforged campaign.
Write ONE paragraph (2–3 sentences) describing this sector of space.
Be atmospheric and evocative. ${perspectiveNote}. Wry tone.
Do not introduce plot elements not present in the description.

Sector: ${sector.name}
Region: ${regionLabel}
Current trouble: ${sector.trouble}
${sector.faction ? `Controlling power: ${sector.faction}` : ""}
Settlements: ${settlementList}

Write the paragraph now. No preamble.`;
}

export function buildSettlementStubPrompt(settlement, sector, regionLabel, perspectiveNote = "") {
  const perspective = perspectiveNote || "Narrate in second person (address the protagonist as 'you')";
  const planetLine  = settlement.planet
    ? `Planet: ${settlement.planet.type} (${settlement.planet.name})`
    : "";
  return `You are the narrator for an Ironsworn: Starforged campaign.
Write ONE paragraph (2–3 sentences) describing this settlement.
Be atmospheric. ${perspective}. Wry tone.
Do not introduce plot elements not present in the description.

Settlement: ${settlement.name}
Type: ${locationTypeToLabel(settlement.locationType)}
Population: ${settlement.population}
Authority: ${settlement.authority}
Projects: ${(settlement.projects ?? []).join(", ")}
${settlement.trouble ? `Current trouble: ${settlement.trouble}` : ""}
${planetLine}
Sector: ${sector.name} (${regionLabel})

Write the paragraph now. No preamble.`;
}

async function callStubApi(prompt, maxTokens, apiKey) {
  const body = {
    model:      STUB_MODEL,
    max_tokens: maxTokens,
    messages:   [{ role: "user", content: prompt }],
  };
  const headers = {
    "Content-Type":      "application/json",
    "x-api-key":         apiKey,
    "anthropic-version": "2023-06-01",
  };
  const data = await apiPost(ANTHROPIC_URL, headers, body);
  const stopReason = data.stop_reason;
  const text = (data.content ?? [])
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
  if (!text) throw new Error("Stub API returned no text");
  // If the model hit the token ceiling mid-sentence (F4), trim back to the last
  // complete sentence so the prose never ends on a dangling clause. Only when
  // truncated by length and a clean earlier sentence boundary exists.
  return trimToLastSentence(text.trim(), stopReason === "max_tokens");
}

/**
 * Trim text to its last complete sentence when it was cut off by the token
 * limit and doesn't already end on terminal punctuation. Leaves naturally
 * complete text untouched.
 *
 * @param {string} text
 * @param {boolean} wasTruncated  true when stop_reason was "max_tokens"
 * @returns {string}
 */
function trimToLastSentence(text, wasTruncated) {
  if (!wasTruncated) return text;
  if (/[.!?]["')\]]?\s*$/.test(text)) return text;       // already ends cleanly
  // Find the last sentence-ending punctuation, then keep any immediately
  // following closing quote/paren so dialogue like `"...end."` stays intact.
  const m = /[.!?]["')\]]?/g;
  let lastEnd = -1, match;
  while ((match = m.exec(text)) !== null) lastEnd = match.index + match[0].length;
  if (lastEnd <= 0) return text;                          // no earlier boundary — leave as-is
  return text.slice(0, lastEnd).trim();
}

export { trimToLastSentence };

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
