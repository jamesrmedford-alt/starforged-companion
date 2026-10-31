/**
 * PROBE (oracles audit) — every registered built-in oracle table against the
 * official Starforged data vendored with the foundry-ironsworn system
 * (vendor/foundry-ironsworn/json-packs/starforged-oracles — Dataforged, the
 * rulebook's own tables as Foundry RollTables).
 *
 * oracleTableIntegrity.test.js proves each table tiles 1–100; it cannot see a
 * table that tiles 1–100 with the WRONG ranges or the wrong entries. This
 * probe compares, roll by roll (1..100), which entry each table returns
 * against which entry the rulebook returns. It asserts the correct
 * (rulebook) behaviour, so each mis-transcribed table fails on its own line.
 *
 * Cosmetic wording is tolerated (HTML / compendium links stripped, case and
 * punctuation ignored, "x / y" ≡ "x or y", an abridged prefix, and the
 * module's deliberate "Derelict " prefix on the derelict-type rows).
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ORACLE_TABLES } from "../../../src/oracles/roller.js";

const VENDOR_DIR = path.resolve(__dirname, "../../../vendor/foundry-ironsworn/json-packs/starforged-oracles");

const vendorByDfid = {};
for (const f of fs.readdirSync(VENDOR_DIR)) {
  const d = JSON.parse(fs.readFileSync(path.join(VENDOR_DIR, f), "utf8"));
  if (!Array.isArray(d.results)) continue;
  const fl = d.flags?.["foundry-ironsworn"] ?? {};
  vendorByDfid[String(fl.dfid ?? fl.dsid ?? "").replace(/^Starforged\/Oracles\//, "")] = d;
}

// Module table id → rulebook table (Dataforged id).
const MAP = {
  action: "Core/Action", theme: "Core/Theme", descriptor: "Core/Descriptor", focus: "Core/Focus",
  space_sighting_terminus: "Space/Sighting/Terminus", space_sighting_outlands: "Space/Sighting/Outlands",
  space_sighting_expanse: "Space/Sighting/Expanse",
  sector_name_prefix: "Space/Sector_Name/Prefix", sector_name_suffix: "Space/Sector_Name/Suffix",
  stellar_object: "Space/Stellar_Object", spaceborne_peril: "Space/Peril", spaceborne_opportunity: "Space/Opportunity",
  planet_type: "Planets/Class",
  planetside_peril_bearing: "Planets/Peril/Lifebearing", planetside_peril_less: "Planets/Peril/Lifeless",
  planetside_opportunity_bearing: "Planets/Opportunity/Lifebearing", planetside_opportunity_less: "Planets/Opportunity/Lifeless",
  settlement_location: "Settlements/Location", settlement_population: "Settlements/Population/Terminus",
  settlement_first_look: "Settlements/First_Look", settlement_contact: "Settlements/Initial_Contact",
  settlement_authority: "Settlements/Authority", settlement_projects: "Settlements/Projects",
  settlement_trouble: "Settlements/Trouble", settlement_name: "Settlements/Name",
  starship_type: "Starships/Type", starship_first_look: "Starships/First_Look", starship_contact: "Starships/Initial_Contact",
  starship_mission_terminus: "Starships/Mission/Terminus", starship_mission_outlands: "Starships/Mission/Outlands",
  starship_mission_expanse: "Starships/Mission/Expanse", starship_name: "Starships/Name", fleet: "Starships/Fleet",
  character_role: "Characters/Role", character_goal: "Characters/Goal", character_first_look: "Characters/First_Look",
  character_disposition: "Characters/Disposition", given_name: "Characters/Name/Given_Name",
  family_name: "Characters/Name/Family_Name", callsign: "Characters/Name/Callsign",
  creature_environment: "Creatures/Environment", creature_scale: "Creatures/Scale",
  creature_basic_form_space: "Creatures/Basic_Form/Space", creature_basic_form_interior: "Creatures/Basic_Form/Interior",
  creature_basic_form_land: "Creatures/Basic_Form/Land", creature_basic_form_liquid: "Creatures/Basic_Form/Liquid",
  creature_basic_form_air: "Creatures/Basic_Form/Air", creature_first_look: "Creatures/First_Look",
  creature_behavior: "Creatures/Encountered_Behavior", creature_aspect: "Creatures/Revealed_Aspect",
  faction_type: "Factions/Type", faction_influence: "Factions/Influence", faction_dominion: "Factions/Dominion",
  faction_dominion_leadership: "Factions/Leadership", faction_guild: "Factions/Guild", faction_fringe: "Factions/Fringe_Group",
  faction_projects: "Factions/Projects", faction_relationships: "Factions/Relationships", faction_quirks: "Factions/Quirks",
  faction_rumors: "Factions/Rumors", faction_name_template: "Factions/Name_Template", faction_name_legacy: "Factions/Legacy",
  faction_name_affiliation: "Factions/Affiliation", faction_name_identity: "Factions/Identity",
  derelict_location: "Derelicts/Location", derelict_type: "Derelicts/Type/Deep_Space", derelict_condition: "Derelicts/Condition",
  derelict_outer_look: "Derelicts/Outer_First_Look", derelict_inner_look: "Derelicts/Inner_First_Look",
  derelict_zone_starship: "Derelicts/Zones/Starship", derelict_zone_settlement: "Derelicts/Zones/Settlement",
  derelict_type_planetside: "Derelicts/Type/Planetside", derelict_type_orbital: "Derelicts/Type/Orbital",
  derelict_access_area: "Derelicts/Access/Area", derelict_access_feature: "Derelicts/Access/Feature",
  derelict_access_peril: "Derelicts/Access/Peril", derelict_access_opportunity: "Derelicts/Access/Opportunity",
  derelict_area_community: "Derelicts/Community/Area", derelict_area_engineering: "Derelicts/Engineering/Area",
  derelict_area_living: "Derelicts/Living/Area", derelict_area_medical: "Derelicts/Medical/Area",
  derelict_area_operations: "Derelicts/Operations/Area", derelict_area_production: "Derelicts/Production/Area",
  derelict_area_research: "Derelicts/Research/Area",
  vault_location: "Vaults/Location", vault_scale: "Vaults/Scale", vault_form: "Vaults/Form", vault_shape: "Vaults/Shape",
  vault_material: "Vaults/Material", vault_outer_look: "Vaults/Outer_First_Look", vault_inner_look: "Vaults/Interior/First_Look",
  vault_purpose: "Vaults/Sanctum/Purpose", vault_feature: "Vaults/Interior/Feature", vault_peril: "Vaults/Interior/Peril",
  vault_opportunity: "Vaults/Interior/Opportunity",
  story_complication: "Misc/Story_Complication", story_clue: "Misc/Story_Clue", anomaly_effect: "Misc/Anomaly_Effect",
  combat_action: "Misc/Combat_Action", sector_trouble: "Character_Creation/Sector_Trouble",
  pay_the_price: "Moves/Pay_the_Price", spotlight_vignette: "Moves/Begin_a_Session",
  make_a_discovery: "Moves/Make_a_Discovery", confront_chaos: "Moves/Confront_Chaos",
  decisive_action_cost: "Moves/Take_Decisive_Action", mortal_wound: "Moves/Endure_Harm",
  desolation: "Moves/Endure_Stress", vehicle_damage: "Moves/Withstand_Damage",
};
for (const t of ["chaotic", "haunted", "infested", "inhabited", "mechanical", "ruined", "sacred"]) {
  const T = t[0].toUpperCase() + t.slice(1);
  MAP[`theme_${t}`]             = `Location_Themes/${T}/Feature`;
  MAP[`theme_${t}_peril`]       = `Location_Themes/${T}/Peril`;
  MAP[`theme_${t}_opportunity`] = `Location_Themes/${T}/Opportunity`;
}

// Long rules sentences the module abridges on purpose — ranges still checked.
const TEXT_ABRIDGED = new Set(["mortal_wound"]);

const norm = (s) => String(s ?? "")
  .replace(/@Compendium\[[^\]]*\]\{([^}]*)\}/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[–—]/g, "-")
  .replace(/\s\/\s/g, " or ")
  .replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\s+/g, " ").trim()
  .replace(/^derelict (starship|settlement)$/, "$1")
  .replace(/impassable/g, "impassible");

const sameText = (a, b) => a === b || a.startsWith(b) || b.startsWith(a);

describe("PROBE: registered oracle tables match the rulebook (Dataforged) roll for roll", () => {
  it("every registered built-in table is mapped (probe coverage tripwire)", () => {
    const builtIns = Object.entries(ORACLE_TABLES).filter(([, d]) => d.category !== "custom").map(([id]) => id);
    expect(builtIns.filter(id => !MAP[id])).toEqual([]);
  });

  for (const [id, dfid] of Object.entries(MAP)) {
    it(`${id} ≡ ${dfid}`, () => {
      const ours   = ORACLE_TABLES[id]?.table;
      const theirs = vendorByDfid[dfid]?.results;
      expect(ours, `${id} is registered`).toBeTruthy();
      expect(theirs, `vendor ${dfid} exists`).toBeTruthy();

      const problems = [];
      const sorted = [...theirs].sort((a, b) => a.range[0] - b.range[0]);
      for (let roll = 1; roll <= 100; roll++) {
        const o = ours.find(r => roll >= r.min && roll <= r.max);
        const t = sorted.find(r => roll >= r.range[0] && roll <= r.range[1]);
        const oRange = o ? `${o.min}-${o.max}` : "none";
        const tRange = t ? `${t.range[0]}-${t.range[1]}` : "none";
        const textOk = TEXT_ABRIDGED.has(id) || (o && t && sameText(norm(o.result), norm(t.text)));
        if (oRange !== tRange || !textOk) {
          problems.push(`roll ${roll}: module ${oRange} "${o?.result}" — rulebook ${tRange} "${norm(t?.text)}"`);
        }
      }
      // One line per distinct module row is enough to read the defect.
      const seen = new Set();
      const summary = problems.filter(p => { const k = p.replace(/^roll \d+: /, ""); if (seen.has(k)) return false; seen.add(k); return true; });
      expect(summary, `${id}: ${summary.length} mismatching rows`).toEqual([]);
    });
  }
});
