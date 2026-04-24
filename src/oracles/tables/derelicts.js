/**
 * src/oracles/tables/derelicts.js
 * Source: Starforged Reference Guide pp.80-91
 */

export const LOCATION = [
  { min: 1,  max: 40,  result: "Planetside" },
  { min: 41, max: 60,  result: "Orbital" },
  { min: 61, max: 100, result: "Deep Space" },
];

export const TYPE_PLANETSIDE = [
  { min: 1,  max: 25,  result: "Derelict starship" },
  { min: 26, max: 100, result: "Derelict settlement" },
];

export const TYPE_ORBITAL = [
  { min: 1,  max: 40,  result: "Derelict starship" },
  { min: 41, max: 100, result: "Derelict settlement" },
];

export const TYPE_DEEP_SPACE = [
  { min: 1,  max: 75,  result: "Derelict starship" },
  { min: 76, max: 100, result: "Derelict settlement" },
];

export const CONDITION = [
  { min: 1,  max: 10,  result: "Functional" },
  { min: 11, max: 30,  result: "Limited power" },
  { min: 31, max: 60,  result: "Cold and dark" },
  { min: 61, max: 90,  result: "Damaged or breached" },
  { min: 91, max: 98,  result: "Heavily damaged" },
  { min: 99, max: 100, result: "Impending destruction" },
];

export const OUTER_FIRST_LOOK = [
  { min: 1,  max: 15,  result: "Blocked access" },
  { min: 16, max: 30,  result: "Corpses" },
  { min: 31, max: 45,  result: "Hazardous readings" },
  { min: 46, max: 50,  result: "Mutated structure" },
  { min: 51, max: 60,  result: "Odd orientation" },
  { min: 61, max: 65,  result: "Overgrown or entangled" },
  { min: 66, max: 80,  result: "Sending a signal or message" },
  { min: 81, max: 85,  result: "Signs that others are here" },
  { min: 86, max: 95,  result: "Stripped exterior" },
  { min: 96, max: 100, result: "Time or reality distortions" },
];

export const INNER_FIRST_LOOK = [
  { min: 1,  max: 3,   result: "Abnormal gravity" },
  { min: 4,  max: 6,   result: "Active bots" },
  { min: 7,  max: 9,   result: "Archaic equipment" },
  { min: 10, max: 12,  result: "Automated announcements" },
  { min: 13, max: 15,  result: "Biological infestation" },
  { min: 16, max: 18,  result: "Charred surfaces" },
  { min: 19, max: 21,  result: "Claw marks" },
  { min: 22, max: 24,  result: "Cluttered with debris" },
  { min: 25, max: 27,  result: "Corroded surfaces" },
  { min: 28, max: 30,  result: "Cramped spaces" },
  { min: 31, max: 33,  result: "Creaking hull" },
  { min: 34, max: 36,  result: "Esoteric writing or symbols" },
  { min: 37, max: 39,  result: "Evidence of new inhabitants" },
  { min: 40, max: 42,  result: "Exposed wiring or conduits" },
  { min: 43, max: 45,  result: "Flashing strobe lights" },
  { min: 46, max: 48,  result: "Fluctuating power" },
  { min: 49, max: 51,  result: "Haunting visions of the dead" },
  { min: 52, max: 54,  result: "Hazardous temperature" },
  { min: 55, max: 57,  result: "Heavy steam or moisture" },
  { min: 58, max: 60,  result: "Littered with corpses" },
  { min: 61, max: 63,  result: "Nesting or feeding creatures" },
  { min: 64, max: 66,  result: "Ornate furnishings" },
  { min: 67, max: 69,  result: "Scarred by gunfire" },
  { min: 70, max: 72,  result: "Sealed against intruders" },
  { min: 73, max: 75,  result: "Signs of looting or scavenging" },
  { min: 76, max: 78,  result: "Smell of decay" },
  { min: 79, max: 81,  result: "Splattered with blood" },
  { min: 82, max: 84,  result: "Temporal distortions" },
  { min: 85, max: 87,  result: "Thick haze or smoke" },
  { min: 88, max: 90,  result: "Unstable energy surges" },
  { min: 91, max: 93,  result: "Watchful AI" },
  { min: 94, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

// Zone map for starships
export const ZONE_STARSHIP = [
  { min: 1,  max: 5,   result: "Access" },
  { min: 6,  max: 30,  result: "Community" },
  { min: 31, max: 55,  result: "Engineering" },
  { min: 56, max: 65,  result: "Living" },
  { min: 66, max: 85,  result: "Medical" },
  { min: 86, max: 90,  result: "Operations" },
  { min: 91, max: 100, result: "Research" },
];

// Zone map for settlements
export const ZONE_SETTLEMENT = [
  { min: 1,  max: 20,  result: "Access" },
  { min: 21, max: 30,  result: "Community" },
  { min: 31, max: 55,  result: "Engineering" },
  { min: 56, max: 65,  result: "Living" },
  { min: 66, max: 75,  result: "Medical" },
  { min: 76, max: 90,  result: "Operations" },
  { min: 91, max: 100, result: "Production" },
];

// ── Zone: Access ─────────────────────────────────────────────────────────────
export const ACCESS_AREA = [
  { min: 1,  max: 50,  result: "Corridor" },
  { min: 51, max: 60,  result: "Stairs" },
  { min: 61, max: 70,  result: "Lift or elevator" },
  { min: 71, max: 80,  result: "Catwalk or bridge" },
  { min: 81, max: 85,  result: "Vertical shaft or ladder" },
  { min: 86, max: 90,  result: "Hub or intersection" },
  { min: 91, max: 95,  result: "Crawl space or duct" },
  { min: 96, max: 100, result: "Airlock or external" },
];

export const ACCESS_FEATURE = [
  { min: 1,  max: 5,   result: "Abandoned gear" },
  { min: 6,  max: 10,  result: "Blood trail" },
  { min: 11, max: 15,  result: "Breached door or hatch" },
  { min: 16, max: 20,  result: "Control or terminal station" },
  { min: 21, max: 25,  result: "Corpse" },
  { min: 26, max: 30,  result: "Dismantled equipment" },
  { min: 31, max: 35,  result: "Flashing strobes" },
  { min: 36, max: 40,  result: "Leaking pipes" },
  { min: 41, max: 45,  result: "Makeshift barricade" },
  { min: 46, max: 50,  result: "Opened or missing panels" },
  { min: 51, max: 55,  result: "Organic growths" },
  { min: 56, max: 60,  result: "Ruined bot" },
  { min: 61, max: 65,  result: "Scrawled warning" },
  { min: 66, max: 70,  result: "Sealed breach" },
  { min: 71, max: 75,  result: "Sounds of movement" },
  { min: 76, max: 80,  result: "Steam or smoke" },
  { min: 81, max: 85,  result: "Wandering bot" },
  { min: 86, max: 90,  result: "Windows or viewports" },
  { min: 91, max: 95,  result: "Wrecked passage or debris" },
  { min: 96, max: 100, result: "Descriptor + Focus", ref: "descriptor_focus" },
];

export const ACCESS_PERIL = [
  { min: 1,  max: 10,  result: "Alarm / failsafe is triggered" },
  { min: 11, max: 20,  result: "Automated defenses" },
  { min: 21, max: 30,  result: "Blocked / sealed path" },
  { min: 31, max: 40,  result: "Dreadful scene of death / violence" },
  { min: 41, max: 50,  result: "Foe closes in" },
  { min: 51, max: 60,  result: "Gear is failing / broken" },
  { min: 61, max: 70,  result: "Hazardous environmental change" },
  { min: 71, max: 80,  result: "Path is trapped" },
  { min: 81, max: 90,  result: "Unsettling sound / disturbance" },
  { min: 91, max: 98,  result: "Action + Theme", ref: "action_theme" },
  { min: 99, max: 100, result: "Roll twice" },
];

export const ACCESS_OPPORTUNITY = [
  { min: 1,  max: 20,  result: "Directions, shortcut or alternate path" },
  { min: 21, max: 40,  result: "Encounter with a friendly survivor, explorer, or denizen" },
  { min: 41, max: 60,  result: "Hopeful signs of life" },
  { min: 61, max: 80,  result: "Opening to outmaneuver or escape a threat or foe" },
  { min: 81, max: 100, result: "Useful equipment" },
];

// ── Zone: Community ───────────────────────────────────────────────────────────
export const COMMUNITY_AREA = [
  { min: 1,  max: 8,   result: "Bar or club" },
  { min: 9,  max: 16,  result: "Temple or chapel" },
  { min: 17, max: 24,  result: "Classroom or education" },
  { min: 25, max: 32,  result: "Concourse or hub" },
  { min: 33, max: 40,  result: "Entertainment" },
  { min: 41, max: 48,  result: "Park or garden" },
  { min: 49, max: 56,  result: "Gym or fitness" },
  { min: 57, max: 64,  result: "Market or trade" },
  { min: 65, max: 72,  result: "Promenade or overlook" },
  { min: 73, max: 80,  result: "Restaurant or dining" },
  { min: 81, max: 85,  result: "New zone" },
  { min: 86, max: 100, result: "New zone via Access" },
];

// ── Zone: Engineering ─────────────────────────────────────────────────────────
export const ENGINEERING_AREA = [
  { min: 1,  max: 8,   result: "Control room" },
  { min: 9,  max: 16,  result: "Engine room or power core" },
  { min: 17, max: 24,  result: "Engineering offices" },
  { min: 25, max: 32,  result: "Equipment storage" },
  { min: 33, max: 40,  result: "Fuel or coolant tanks" },
  { min: 41, max: 48,  result: "Life support" },
  { min: 49, max: 56,  result: "Maintenance tube" },
  { min: 57, max: 64,  result: "Vehicle bay or garage" },
  { min: 65, max: 72,  result: "Water processing" },
  { min: 73, max: 80,  result: "Workshop" },
  { min: 81, max: 85,  result: "New zone" },
  { min: 86, max: 100, result: "New zone via Access" },
];

// ── Zone: Living ──────────────────────────────────────────────────────────────
export const LIVING_AREA = [
  { min: 1,  max: 8,   result: "Food storage" },
  { min: 9,  max: 16,  result: "Galley or kitchen" },
  { min: 17, max: 24,  result: "Laundry" },
  { min: 25, max: 32,  result: "Locker room or storage" },
  { min: 33, max: 40,  result: "Mess hall or dining" },
  { min: 41, max: 48,  result: "Observation lounge" },
  { min: 49, max: 56,  result: "Quarters (individual)" },
  { min: 57, max: 64,  result: "Quarters (communal)" },
  { min: 65, max: 72,  result: "Restroom or showers" },
  { min: 73, max: 80,  result: "Sleeping pods" },
  { min: 81, max: 85,  result: "New zone" },
  { min: 86, max: 100, result: "New zone via Access" },
];

// ── Zone: Medical ─────────────────────────────────────────────────────────────
export const MEDICAL_AREA = [
  { min: 1,  max: 8,   result: "Crematorium" },
  { min: 9,  max: 16,  result: "Emergency or triage" },
  { min: 17, max: 24,  result: "Isolation or containment" },
  { min: 25, max: 32,  result: "Medical lab" },
  { min: 33, max: 40,  result: "Medical offices" },
  { min: 41, max: 48,  result: "Morgue" },
  { min: 49, max: 56,  result: "Operating room" },
  { min: 57, max: 64,  result: "Pharmacy or drug locker" },
  { min: 65, max: 72,  result: "Prosthetics workshop" },
  { min: 73, max: 80,  result: "Ward or clinic" },
  { min: 81, max: 85,  result: "New zone" },
  { min: 86, max: 100, result: "New zone via Access" },
];

// ── Zone: Operations ──────────────────────────────────────────────────────────
export const OPERATIONS_AREA = [
  { min: 1,  max: 8,   result: "Admin or command offices" },
  { min: 9,  max: 16,  result: "Armory" },
  { min: 17, max: 24,  result: "Bridge or command center" },
  { min: 25, max: 32,  result: "Brig or cells" },
  { min: 33, max: 40,  result: "Comms center" },
  { min: 41, max: 48,  result: "Computer core" },
  { min: 49, max: 56,  result: "Conference or briefing room" },
  { min: 57, max: 64,  result: "Landing bay or hangar" },
  { min: 65, max: 72,  result: "Lounge" },
  { min: 73, max: 80,  result: "Security" },
  { min: 81, max: 85,  result: "New zone" },
  { min: 86, max: 100, result: "New zone via Access" },
];

// ── Zone: Production ──────────────────────────────────────────────────────────
export const PRODUCTION_AREA = [
  { min: 1,  max: 8,   result: "Airlock or staging area" },
  { min: 9,  max: 16,  result: "Assembly or processing" },
  { min: 17, max: 24,  result: "Cargo bay" },
  { min: 25, max: 32,  result: "Equipment storage" },
  { min: 33, max: 40,  result: "Exosuit bay" },
  { min: 41, max: 48,  result: "Harvesting or mining platform" },
  { min: 49, max: 56,  result: "Monitoring or control room" },
  { min: 57, max: 64,  result: "Processed goods storage" },
  { min: 65, max: 72,  result: "Raw materials storage" },
  { min: 73, max: 80,  result: "Scrapyard" },
  { min: 81, max: 85,  result: "New zone" },
  { min: 86, max: 100, result: "New zone via Access" },
];

// ── Zone: Research ────────────────────────────────────────────────────────────
export const RESEARCH_AREA = [
  { min: 1,  max: 8,   result: "Clean room" },
  { min: 9,  max: 16,  result: "Cold storage" },
  { min: 17, max: 24,  result: "Creature or animal pens" },
  { min: 25, max: 32,  result: "Decontamination room" },
  { min: 33, max: 40,  result: "Hazardous material storage" },
  { min: 41, max: 48,  result: "Hydroponics or agriculture" },
  { min: 49, max: 56,  result: "Isolation or containment" },
  { min: 57, max: 64,  result: "Lab" },
  { min: 65, max: 72,  result: "Library or records" },
  { min: 73, max: 80,  result: "Secure vault" },
  { min: 81, max: 85,  result: "New zone" },
  { min: 86, max: 100, result: "New zone via Access" },
];
