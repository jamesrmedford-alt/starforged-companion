/**
 * STARFORGED COMPANION
 * src/system/i18n.js — Localisation wrapper for foundry-ironsworn strings
 *
 * Maps our internal slugs (edge, heart, health, supply, momentum, ...) to
 * the foundry-ironsworn `IRONSWORN.*` localisation keys. This keeps our
 * UI labels consistent with the system and gives us free localisation in
 * cs/de/es/fr/pl whenever Foundry's language is switched.
 *
 * Behaviour:
 *   - When `game.i18n` is available and the key resolves to non-key text,
 *     return the localised string.
 *   - When the key is missing OR `game.i18n` is unavailable (unit tests),
 *     log a warning ONCE per slug and return the hardcoded English fallback.
 *
 * Never throws. Missing translations degrade to readable English.
 */

// ─────────────────────────────────────────────────────────────────────────────
// KEY MAPS (verified against vendor/foundry-ironsworn/system/lang/en.json
// keys when the submodule is initialised; English fallbacks always present)
// ─────────────────────────────────────────────────────────────────────────────

const STAT_KEYS = {
  edge:   { key: "IRONSWORN.Edge",   en: "Edge"   },
  heart:  { key: "IRONSWORN.Heart",  en: "Heart"  },
  iron:   { key: "IRONSWORN.Iron",   en: "Iron"   },
  shadow: { key: "IRONSWORN.Shadow", en: "Shadow" },
  wits:   { key: "IRONSWORN.Wits",   en: "Wits"   },
};

const METER_KEYS = {
  health:   { key: "IRONSWORN.Health",   en: "Health"   },
  spirit:   { key: "IRONSWORN.Spirit",   en: "Spirit"   },
  supply:   { key: "IRONSWORN.Supply",   en: "Supply"   },
  momentum: { key: "IRONSWORN.Momentum", en: "Momentum" },
};

const DEBILITY_KEYS = {
  // Character debilities
  wounded:           { key: "IRONSWORN.Wounded",          en: "Wounded"          },
  shaken:            { key: "IRONSWORN.Shaken",           en: "Shaken"           },
  unprepared:        { key: "IRONSWORN.Unprepared",       en: "Unprepared"       },
  encumbered:        { key: "IRONSWORN.Encumbered",       en: "Encumbered"       },
  maimed:            { key: "IRONSWORN.Maimed",           en: "Maimed"           },
  corrupted:         { key: "IRONSWORN.Corrupted",        en: "Corrupted"        },
  cursed:            { key: "IRONSWORN.Cursed",           en: "Cursed"           },
  tormented:         { key: "IRONSWORN.Tormented",        en: "Tormented"        },
  permanentlyharmed: { key: "IRONSWORN.PermanentlyHarmed", en: "Permanently Harmed" },
  traumatized:       { key: "IRONSWORN.Traumatized",      en: "Traumatized"      },
  doomed:            { key: "IRONSWORN.Doomed",           en: "Doomed"           },
  indebted:          { key: "IRONSWORN.Indebted",         en: "Indebted"         },
  // Starship debilities
  battered:          { key: "IRONSWORN.Battered",         en: "Battered"         },
};

// Move slug → English fallback. Localisation keys for move titles vary across
// foundry-ironsworn versions; we keep a hardcoded English table so the helper
// never returns the slug verbatim. When a key exists and resolves at runtime,
// the localised string is preferred.
const MOVE_KEYS = {
  face_danger:             { key: "IRONSWORN.MoveTitle.FaceDanger",            en: "Face Danger"             },
  secure_an_advantage:     { key: "IRONSWORN.MoveTitle.SecureAnAdvantage",     en: "Secure an Advantage"     },
  gather_information:      { key: "IRONSWORN.MoveTitle.GatherInformation",     en: "Gather Information"      },
  compel:                  { key: "IRONSWORN.MoveTitle.Compel",                en: "Compel"                  },
  aid_your_ally:           { key: "IRONSWORN.MoveTitle.AidYourAlly",           en: "Aid Your Ally"           },
  check_your_gear:         { key: "IRONSWORN.MoveTitle.CheckYourGear",         en: "Check Your Gear"         },
  swear_an_iron_vow:       { key: "IRONSWORN.MoveTitle.SwearAnIronVow",        en: "Swear an Iron Vow"       },
  reach_a_milestone:       { key: "IRONSWORN.MoveTitle.ReachAMilestone",       en: "Reach a Milestone"       },
  fulfill_your_vow:        { key: "IRONSWORN.MoveTitle.FulfillYourVow",        en: "Fulfill Your Vow"        },
  forsake_your_vow:        { key: "IRONSWORN.MoveTitle.ForsakeYourVow",        en: "Forsake Your Vow"        },
  make_a_connection:       { key: "IRONSWORN.MoveTitle.MakeAConnection",       en: "Make a Connection"       },
  develop_your_relationship:{ key:"IRONSWORN.MoveTitle.DevelopYourRelationship", en: "Develop Your Relationship" },
  test_your_relationship:  { key: "IRONSWORN.MoveTitle.TestYourRelationship",  en: "Test Your Relationship"  },
  forge_a_bond:            { key: "IRONSWORN.MoveTitle.ForgeABond",            en: "Forge a Bond"            },
  undertake_an_expedition: { key: "IRONSWORN.MoveTitle.UndertakeAnExpedition", en: "Undertake an Expedition" },
  explore_a_waypoint:      { key: "IRONSWORN.MoveTitle.ExploreAWaypoint",      en: "Explore a Waypoint"      },
  finish_an_expedition:    { key: "IRONSWORN.MoveTitle.FinishAnExpedition",    en: "Finish an Expedition"    },
  set_a_course:            { key: "IRONSWORN.MoveTitle.SetACourse",            en: "Set a Course"            },
  make_a_discovery:        { key: "IRONSWORN.MoveTitle.MakeADiscovery",        en: "Make a Discovery"        },
  confront_chaos:          { key: "IRONSWORN.MoveTitle.ConfrontChaos",         en: "Confront Chaos"          },
  enter_the_fray:          { key: "IRONSWORN.MoveTitle.EnterTheFray",          en: "Enter the Fray"          },
  gain_ground:             { key: "IRONSWORN.MoveTitle.GainGround",            en: "Gain Ground"             },
  strike:                  { key: "IRONSWORN.MoveTitle.Strike",                en: "Strike"                  },
  clash:                   { key: "IRONSWORN.MoveTitle.Clash",                 en: "Clash"                   },
  react_under_fire:        { key: "IRONSWORN.MoveTitle.ReactUnderFire",        en: "React Under Fire"        },
  take_decisive_action:    { key: "IRONSWORN.MoveTitle.TakeDecisiveAction",    en: "Take Decisive Action"    },
  face_defeat:             { key: "IRONSWORN.MoveTitle.FaceDefeat",            en: "Face Defeat"             },
  battle:                  { key: "IRONSWORN.MoveTitle.Battle",                en: "Battle"                  },
  endure_harm:             { key: "IRONSWORN.MoveTitle.EndureHarm",            en: "Endure Harm"             },
  endure_stress:           { key: "IRONSWORN.MoveTitle.EndureStress",          en: "Endure Stress"           },
  withstand_damage:        { key: "IRONSWORN.MoveTitle.WithstandDamage",       en: "Withstand Damage"        },
  companion_takes_a_hit:   { key: "IRONSWORN.MoveTitle.CompanionTakesAHit",    en: "Companion Takes a Hit"   },
  sacrifice_resources:     { key: "IRONSWORN.MoveTitle.SacrificeResources",    en: "Sacrifice Resources"     },
  lose_momentum:           { key: "IRONSWORN.MoveTitle.LoseMomentum",          en: "Lose Momentum"           },
  sojourn:                 { key: "IRONSWORN.MoveTitle.Sojourn",               en: "Sojourn"                 },
  heal:                    { key: "IRONSWORN.MoveTitle.Heal",                  en: "Heal"                    },
  hearten:                 { key: "IRONSWORN.MoveTitle.Hearten",               en: "Hearten"                 },
  resupply:                { key: "IRONSWORN.MoveTitle.Resupply",              en: "Resupply"                },
  repair:                  { key: "IRONSWORN.MoveTitle.Repair",                en: "Repair"                  },
  face_death:              { key: "IRONSWORN.MoveTitle.FaceDeath",             en: "Face Death"              },
  face_desolation:         { key: "IRONSWORN.MoveTitle.FaceDesolation",        en: "Face Desolation"         },
  overcome_destruction:    { key: "IRONSWORN.MoveTitle.OvercomeDestruction",   en: "Overcome Destruction"    },
  earn_experience:         { key: "IRONSWORN.MoveTitle.EarnExperience",        en: "Earn Experience"         },
  advance:                 { key: "IRONSWORN.MoveTitle.Advance",               en: "Advance"                 },
  continue_a_legacy:       { key: "IRONSWORN.MoveTitle.ContinueALegacy",       en: "Continue a Legacy"       },
  ask_the_oracle:          { key: "IRONSWORN.MoveTitle.AskTheOracle",          en: "Ask the Oracle"          },
  pay_the_price:           { key: "IRONSWORN.MoveTitle.PayThePrice",           en: "Pay the Price"           },
};

// ─────────────────────────────────────────────────────────────────────────────
// LOCALIZE — internal helper
// ─────────────────────────────────────────────────────────────────────────────

const _warnedSlugs = new Set();

/**
 * Resolve a slug → entry from one of the key tables. When game.i18n is
 * available and the key resolves to non-key text, return the localised
 * string. Otherwise return the entry's English fallback (with a one-time
 * warning when a slug is missing entirely).
 */
function localize(table, slug, kindLabel) {
  const entry = table[slug];
  if (!entry) {
    const slugStr = String(slug ?? "");
    const guard = `${kindLabel}:${slugStr}`;
    if (!_warnedSlugs.has(guard)) {
      _warnedSlugs.add(guard);
      console.warn(`starforged-companion | i18n: unknown ${kindLabel} slug "${slugStr}"`);
    }
    return slugStr;
  }
  try {
    const i18n = globalThis.game?.i18n;
    if (i18n?.localize) {
      const out = i18n.localize(entry.key);
      // Foundry returns the key verbatim when the translation is missing.
      // Treat that as a miss and fall back to English.
      if (out && out !== entry.key) return out;
    }
  } catch (err) {
    console.warn(`starforged-companion | i18n: localize(${entry.key}) failed:`, err);
  }
  return entry.en;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** @param {"edge"|"heart"|"iron"|"shadow"|"wits"} slug */
export function localizeStat(slug) { return localize(STAT_KEYS, slug, "stat"); }

/** @param {"health"|"spirit"|"supply"|"momentum"} slug */
export function localizeMeter(slug) { return localize(METER_KEYS, slug, "meter"); }

/** @param {string} slug — wounded, shaken, battered, ... */
export function localizeDebility(slug) { return localize(DEBILITY_KEYS, slug, "debility"); }

/** @param {string} slug — face_danger, pay_the_price, ... */
export function localizeMove(slug) { return localize(MOVE_KEYS, slug, "move"); }

/** Test-only — clears the per-slug warn-once guard. */
export function _resetI18nWarnGuard() { _warnedSlugs.clear(); }
