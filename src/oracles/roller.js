/**
 * STARFORGED COMPANION
 * src/oracles/roller.js — Roll on any oracle table; inject result into context
 *
 * Responsibilities:
 * - Roll d100 and find the matching entry in a table
 * - Handle chained rolls (Action + Theme, Descriptor + Focus)
 * - Handle "roll twice" results
 * - Format results for chat injection and context packets
 * - Store results in campaign state for context injection
 *
 * Table format:
 *   Each table is an array of entries: { min, max, result, ref? }
 *   ref indicates a cross-reference to another table (e.g. "action_theme")
 *
 * Source: Starforged Reference Guide Section 2
 */

import * as CORE        from "./tables/core.js";
import * as SPACE       from "./tables/space.js";
import * as PLANETS     from "./tables/planets.js";
import * as SETTLEMENTS from "./tables/settlements.js";
import * as STARSHIPS   from "./tables/starships.js";
import * as CHARACTERS  from "./tables/characters.js";
import * as CREATURES   from "./tables/creatures.js";
import * as FACTIONS    from "./tables/factions.js";
import * as DERELICTS   from "./tables/derelicts.js";
import * as VAULTS      from "./tables/vaults.js";
import * as THEMES      from "./tables/themes.js";
import * as MISC        from "./tables/misc.js";


// ─────────────────────────────────────────────────────────────────────────────
// TABLE REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * All oracle tables keyed by ID.
 * IDs are used in chat commands, API calls, and cross-references.
 */
export const ORACLE_TABLES = {
  // Core
  action:         { name: "Action",       table: CORE.ACTION,       category: "core" },
  theme:          { name: "Theme",        table: CORE.THEME,        category: "core" },
  descriptor:     { name: "Descriptor",   table: CORE.DESCRIPTOR,   category: "core" },
  focus:          { name: "Focus",        table: CORE.FOCUS,        category: "core" },

  // Space encounters
  space_sighting_terminus:  { name: "Space Sighting (Terminus)",  table: SPACE.SPACE_SIGHTING_TERMINUS,  category: "space" },
  space_sighting_outlands:  { name: "Space Sighting (Outlands)",  table: SPACE.SPACE_SIGHTING_OUTLANDS,  category: "space" },
  space_sighting_expanse:   { name: "Space Sighting (Expanse)",   table: SPACE.SPACE_SIGHTING_EXPANSE,   category: "space" },
  sector_name_prefix:       { name: "Sector Name (Prefix)",       table: SPACE.SECTOR_NAME_PREFIX,       category: "space" },
  sector_name_suffix:       { name: "Sector Name (Suffix)",       table: SPACE.SECTOR_NAME_SUFFIX,       category: "space" },
  stellar_object:           { name: "Stellar Object",             table: SPACE.STELLAR_OBJECT,           category: "space" },
  spaceborne_peril:         { name: "Spaceborne Peril",           table: SPACE.SPACEBORNE_PERIL,         category: "space" },
  spaceborne_opportunity:   { name: "Spaceborne Opportunity",     table: SPACE.SPACEBORNE_OPPORTUNITY,   category: "space" },

  // Planets
  planet_type:              { name: "Planet Type",    table: PLANETS.PLANET_TYPE,       category: "planets" },
  planetside_peril_bearing: { name: "Planetside Peril (Lifebearing)",  table: PLANETS.PLANETSIDE_PERIL_LIFEBEARING,  category: "planets" },
  planetside_peril_less:    { name: "Planetside Peril (Lifeless)",     table: PLANETS.PLANETSIDE_PERIL_LIFELESS,     category: "planets" },
  planetside_opportunity_bearing: { name: "Planetside Opportunity (Lifebearing)", table: PLANETS.PLANETSIDE_OPPORTUNITY_LIFEBEARING, category: "planets" },
  planetside_opportunity_less:    { name: "Planetside Opportunity (Lifeless)",    table: PLANETS.PLANETSIDE_OPPORTUNITY_LIFELESS,    category: "planets" },

  // Settlements
  settlement_location:    { name: "Settlement Location",     table: SETTLEMENTS.LOCATION,      category: "settlements" },
  settlement_population:  { name: "Settlement Population",   table: SETTLEMENTS.POPULATION_TERMINUS, category: "settlements" },
  settlement_first_look:  { name: "Settlement First Look",   table: SETTLEMENTS.FIRST_LOOK,    category: "settlements" },
  settlement_contact:     { name: "Settlement Initial Contact", table: SETTLEMENTS.INITIAL_CONTACT, category: "settlements" },
  settlement_authority:   { name: "Settlement Authority",    table: SETTLEMENTS.AUTHORITY,     category: "settlements" },
  settlement_projects:    { name: "Settlement Projects",     table: SETTLEMENTS.PROJECTS,      category: "settlements" },
  settlement_trouble:     { name: "Settlement Trouble",      table: SETTLEMENTS.TROUBLE,       category: "settlements" },
  settlement_name:        { name: "Settlement Name",         table: SETTLEMENTS.NAMES,         category: "settlements" },

  // Starships
  starship_type:      { name: "Starship Type",          table: STARSHIPS.TYPE,          category: "starships" },
  starship_first_look:{ name: "Starship First Look",    table: STARSHIPS.FIRST_LOOK,    category: "starships" },
  starship_contact:   { name: "Starship Initial Contact", table: STARSHIPS.INITIAL_CONTACT, category: "starships" },
  starship_mission_terminus: { name: "Starship Mission (Terminus)", table: STARSHIPS.MISSION_TERMINUS, category: "starships" },
  starship_mission_outlands: { name: "Starship Mission (Outlands)", table: STARSHIPS.MISSION_OUTLANDS, category: "starships" },
  starship_mission_expanse:  { name: "Starship Mission (Expanse)",  table: STARSHIPS.MISSION_EXPANSE,  category: "starships" },
  starship_name:      { name: "Starship Name",           table: STARSHIPS.NAMES,         category: "starships" },
  fleet:              { name: "Fleet",                   table: STARSHIPS.FLEET,         category: "starships" },

  // Characters
  character_role:        { name: "Character Role",         table: CHARACTERS.ROLE,        category: "characters" },
  character_goal:        { name: "Character Goal",         table: CHARACTERS.GOAL,        category: "characters" },
  character_first_look:  { name: "Character First Look",   table: CHARACTERS.FIRST_LOOK,  category: "characters" },
  character_disposition: { name: "Character Disposition",  table: CHARACTERS.DISPOSITION, category: "characters" },
  given_name:            { name: "Given Name",             table: CHARACTERS.GIVEN_NAMES, category: "characters" },
  family_name:           { name: "Family Name",            table: CHARACTERS.FAMILY_NAMES, category: "characters" },
  callsign:              { name: "Callsign",               table: CHARACTERS.CALLSIGNS,   category: "characters" },

  // Creatures
  creature_environment:  { name: "Creature Environment",   table: CREATURES.ENVIRONMENT,  category: "creatures" },
  creature_scale:        { name: "Creature Scale",         table: CREATURES.SCALE,        category: "creatures" },
  creature_basic_form_space:    { name: "Creature Form (Space)",    table: CREATURES.BASIC_FORM_SPACE,    category: "creatures" },
  creature_basic_form_interior: { name: "Creature Form (Interior)", table: CREATURES.BASIC_FORM_INTERIOR, category: "creatures" },
  creature_basic_form_land:     { name: "Creature Form (Land)",     table: CREATURES.BASIC_FORM_LAND,     category: "creatures" },
  creature_basic_form_liquid:   { name: "Creature Form (Liquid)",   table: CREATURES.BASIC_FORM_LIQUID,   category: "creatures" },
  creature_basic_form_air:      { name: "Creature Form (Air)",      table: CREATURES.BASIC_FORM_AIR,      category: "creatures" },
  creature_first_look:   { name: "Creature First Look",    table: CREATURES.FIRST_LOOK,   category: "creatures" },
  creature_behavior:     { name: "Creature Behavior",      table: CREATURES.BEHAVIOR,     category: "creatures" },
  creature_aspect:       { name: "Revealed Creature Aspect", table: CREATURES.REVEALED_ASPECT, category: "creatures" },

  // Factions
  faction_type:          { name: "Faction Type",           table: FACTIONS.TYPE,          category: "factions" },
  faction_influence:     { name: "Faction Influence",      table: FACTIONS.INFLUENCE,     category: "factions" },
  faction_dominion:      { name: "Faction Dominion",       table: FACTIONS.DOMINION,      category: "factions" },
  faction_dominion_leadership: { name: "Dominion Leadership", table: FACTIONS.DOMINION_LEADERSHIP, category: "factions" },
  faction_guild:         { name: "Faction Guild",          table: FACTIONS.GUILD,         category: "factions" },
  faction_fringe:        { name: "Faction Fringe Group",   table: FACTIONS.FRINGE_GROUP,  category: "factions" },
  faction_projects:      { name: "Faction Projects",       table: FACTIONS.PROJECTS,      category: "factions" },
  faction_relationships: { name: "Faction Relationships",  table: FACTIONS.RELATIONSHIPS, category: "factions" },
  faction_quirks:        { name: "Faction Quirks",         table: FACTIONS.QUIRKS,        category: "factions" },
  faction_rumors:        { name: "Faction Rumors",         table: FACTIONS.RUMORS,        category: "factions" },
  faction_name_template: { name: "Faction Name Template",  table: FACTIONS.NAME_TEMPLATE, category: "factions" },
  faction_name_legacy:   { name: "Faction Name Legacy",    table: FACTIONS.NAME_LEGACY,   category: "factions" },
  faction_name_affiliation: { name: "Faction Name Affiliation", table: FACTIONS.NAME_AFFILIATION, category: "factions" },
  faction_name_identity: { name: "Faction Name Identity",  table: FACTIONS.NAME_IDENTITY, category: "factions" },

  // Derelicts
  derelict_location:     { name: "Derelict Location",      table: DERELICTS.LOCATION,     category: "derelicts" },
  derelict_type:         { name: "Derelict Type",          table: DERELICTS.TYPE_DEEP_SPACE, category: "derelicts" },
  derelict_condition:    { name: "Derelict Condition",     table: DERELICTS.CONDITION,    category: "derelicts" },
  derelict_outer_look:   { name: "Derelict Outer First Look", table: DERELICTS.OUTER_FIRST_LOOK, category: "derelicts" },
  derelict_inner_look:   { name: "Derelict Inner First Look", table: DERELICTS.INNER_FIRST_LOOK, category: "derelicts" },
  derelict_zone_starship:   { name: "Derelict Zone (Starship)",   table: DERELICTS.ZONE_STARSHIP,   category: "derelicts" },
  derelict_zone_settlement: { name: "Derelict Zone (Settlement)", table: DERELICTS.ZONE_SETTLEMENT, category: "derelicts" },

  // Precursor Vaults
  vault_location:    { name: "Vault Location",       table: VAULTS.LOCATION,       category: "vaults" },
  vault_scale:       { name: "Vault Scale",          table: VAULTS.SCALE,          category: "vaults" },
  vault_form:        { name: "Vault Form",           table: VAULTS.FORM,           category: "vaults" },
  vault_shape:       { name: "Vault Shape",          table: VAULTS.SHAPE,          category: "vaults" },
  vault_material:    { name: "Vault Material",       table: VAULTS.MATERIAL,       category: "vaults" },
  vault_outer_look:  { name: "Vault Outer First Look", table: VAULTS.OUTER_FIRST_LOOK, category: "vaults" },
  vault_inner_look:  { name: "Vault Inner First Look", table: VAULTS.INNER_FIRST_LOOK, category: "vaults" },
  vault_purpose:     { name: "Vault Purpose",        table: VAULTS.PURPOSE,        category: "vaults" },
  vault_feature:     { name: "Vault Interior Feature", table: VAULTS.INTERIOR_FEATURE, category: "vaults" },
  vault_peril:       { name: "Vault Interior Peril",  table: VAULTS.INTERIOR_PERIL,   category: "vaults" },
  vault_opportunity: { name: "Vault Interior Opportunity", table: VAULTS.INTERIOR_OPPORTUNITY, category: "vaults" },

  // Location Themes
  theme_chaotic:     { name: "Theme: Chaotic",    table: THEMES.CHAOTIC_FEATURE,   category: "themes" },
  theme_haunted:     { name: "Theme: Haunted",    table: THEMES.HAUNTED_FEATURE,   category: "themes" },
  theme_infested:    { name: "Theme: Infested",   table: THEMES.INFESTED_FEATURE,  category: "themes" },
  theme_inhabited:   { name: "Theme: Inhabited",  table: THEMES.INHABITED_FEATURE, category: "themes" },
  theme_mechanical:  { name: "Theme: Mechanical", table: THEMES.MECHANICAL_FEATURE, category: "themes" },
  theme_ruined:      { name: "Theme: Ruined",     table: THEMES.RUINED_FEATURE,    category: "themes" },
  theme_sacred:      { name: "Theme: Sacred",     table: THEMES.SACRED_FEATURE,    category: "themes" },

  // Miscellaneous
  story_complication: { name: "Story Complication", table: MISC.STORY_COMPLICATION, category: "misc" },
  story_clue:         { name: "Story Clue",         table: MISC.STORY_CLUE,         category: "misc" },
  anomaly_effect:     { name: "Anomaly Effect",     table: MISC.ANOMALY_EFFECT,     category: "misc" },
  combat_action:      { name: "Combat Action",      table: MISC.COMBAT_ACTION,      category: "misc" },
  sector_trouble:     { name: "Sector Trouble",     table: MISC.SECTOR_TROUBLE,     category: "sectors" },
};


// ─────────────────────────────────────────────────────────────────────────────
// ROLLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roll on an oracle table by ID.
 *
 * @param {string} tableId   — key from ORACLE_TABLES
 * @param {Object} [options]
 * @param {number} [options.roll]   — override the roll (for testing)
 * @returns {{ tableId, tableName, roll, result, isRef, refTableId }}
 */
export function rollOracle(tableId, options = {}) {
  const entry = ORACLE_TABLES[tableId];
  if (!entry) throw new Error(`Unknown oracle table: ${tableId}`);

  const roll   = options.roll ?? rollD100();
  const result = findResult(entry.table, roll);

  if (!result) {
    console.warn(`Oracle | No result for roll ${roll} on table ${tableId}`);
    return { tableId, tableName: entry.name, roll, result: "—", isRef: false };
  }

  return {
    tableId,
    tableName: entry.name,
    roll,
    result:     result.result,
    isRef:      !!result.ref,
    refTableId: result.ref ?? null,
  };
}

/**
 * Roll on a paired oracle (Action + Theme, Descriptor + Focus).
 * Returns two rolls formatted as a single result.
 *
 * @param {string} tableId1
 * @param {string} tableId2
 * @returns {{ tableId1, tableId2, result1, result2, combined }}
 */
export function rollPaired(tableId1, tableId2) {
  const r1 = rollOracle(tableId1);
  const r2 = rollOracle(tableId2);
  return {
    tableId1,
    tableId2,
    roll1:    r1.roll,
    roll2:    r2.roll,
    result1:  r1.result,
    result2:  r2.result,
    combined: `${r1.result} / ${r2.result}`,
  };
}

/**
 * Roll Action + Theme.
 */
export function rollActionTheme() {
  return rollPaired("action", "theme");
}

/**
 * Roll Descriptor + Focus.
 */
export function rollDescriptorFocus() {
  return rollPaired("descriptor", "focus");
}

/**
 * Format an oracle result for chat injection.
 * Returns a short HTML string suitable for a Foundry chat message.
 */
export function formatOracleResult(result) {
  if (result.combined) {
    // Paired roll
    return `<strong>${result.tableId1} / ${result.tableId2}:</strong> ${result.combined}`;
  }
  return `<strong>${result.tableName}:</strong> ${result.result}`;
}

/**
 * Format an oracle result for Loremaster context injection.
 * Returns a bracketed string matching the move context format.
 */
export function formatOracleContext(result) {
  if (result.combined) {
    return `[ORACLE: ${result.combined}]`;
  }
  return `[ORACLE: ${result.tableName} → ${result.result}]`;
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Roll a d100 (1-100). */
function rollD100() {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * Find the matching entry in a table for a given roll.
 * Table entries: { min, max, result, ref? }
 *
 * @param {Array} table
 * @param {number} roll
 * @returns {Object|null}
 */
function findResult(table, roll) {
  return table.find(entry => roll >= entry.min && roll <= entry.max) ?? null;
}
