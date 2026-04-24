# Starforged Companion — File Structure

```
starforged-companion/
│
├── module.json                         Foundry v12/v13 manifest
├── README.md                           Installation, setup, Loremaster dependency note
│
├── styles/
│   └── starforged-companion.css        Chat card styles, PTT button, UI panels
│
├── lang/
│   └── en.json                         Localisation strings
│
├── src/
│   ├── index.js                        Entry point — settings, hooks, pipeline wiring
│   ├── schemas.js                      All data schemas and enumerations
│   │
│   ├── context/
│   │   ├── assembler.js                Builds Loremaster context packets
│   │   │                               Token-budget-aware; safety section always first
│   │   └── safety.js                  Safety config formatting and injection
│   │
│   ├── moves/
│   │   ├── interpreter.js             Claude API call — narration → move identification
│   │   ├── resolver.js                Dice rolling, outcome calculation, consequence mapping
│   │   └── mischief.js                Mischief dial logic — controls interpretation framing
│   │
│   ├── oracles/
│   │   ├── roller.js                  Roll on any oracle table; inject result into context
│   │   └── tables/
│   │       ├── core.js                Action, Theme, Descriptor, Focus
│   │       ├── space.js               Space sightings, sector names, stellar objects, perils
│   │       ├── planets.js             All 10 planet types with atmosphere/life/feature tables
│   │       ├── settlements.js         Settlement oracles
│   │       ├── starships.js           Starship oracles
│   │       ├── characters.js          Character oracles
│   │       ├── creatures.js           Creature oracles
│   │       ├── factions.js            Faction oracles
│   │       ├── derelicts.js           Derelict oracles
│   │       ├── vaults.js              Precursor Vault oracles
│   │       ├── themes.js              Location theme oracles
│   │       └── misc.js                Story Complication, Story Clue, Anomaly, Combat Action
│   │
│   ├── entities/
│   │   ├── connection.js              Connection record CRUD and progress management
│   │   ├── settlement.js              Settlement records
│   │   ├── ship.js                    Ship records (command vehicle + support vehicles)
│   │   ├── faction.js                 Faction records
│   │   └── planet.js                  Planet records
│   │
│   ├── art/
│   │   ├── generator.js               Backend-agnostic generation interface
│   │   │                               Trigger: after Loremaster's first entity description
│   │   │                               Policy: generate once, lock after one regeneration
│   │   ├── promptBuilder.js           Loremaster description → structured image prompt
│   │   │                               Appends style tokens; player never sees prompt machinery
│   │   └── storage.js                 Asset filing under starforged-companion/{type}/{id}.webp
│   │                                   Metadata stored alongside each asset (ArtAssetSchema)
│   │
│   ├── truths/
│   │   ├── generator.js               Roll/choose across all 14 World Truth categories
│   │   │                               Resolves nested sub-tables automatically
│   │   │                               Saves result as a Foundry JournalEntryPage
│   │   └── tables.js                  All 14 truth category data with sub-table references
│   │
│   ├── ui/
│   │   ├── progressTracks.js          Visual progress tracks — ApplicationV2 (v13)
│   │   │                               Vows, expeditions, connections, fights, scene challenges
│   │   ├── entityPanel.js             Connection and entity sidebar — ApplicationV2 (v13)
│   │   └── settingsPanel.js           Safety config, mischief dial, API keys — ApplicationV2 (v13)
│   │                                   Also hosts the move confirmation dialog
│   │
│   └── input/
│       └── speechInput.js             Push-to-talk via Web Speech API
│                                       Chromium only; graceful no-op on unsupported browsers
│                                       Push-to-talk: mousedown/touchstart → start
│                                       mouseup/touchend/mouseleave → stop + auto-inject to chat
│
└── tests/
    ├── unit/                           Jest tests — pure logic, no Foundry globals
    │   ├── resolver.test.js            Dice math, outcome calculation, consequence mapping
    │   ├── mischief.test.js            Mischief dial behaviour across all three settings
    │   ├── assembler.test.js           Context packet assembly, token budget enforcement
    │   └── truths.test.js              World Truths roll/sub-roll resolution
    │
    ├── integration/                    Quench tests — run inside a live Foundry instance
    │   ├── pipeline.test.js            Full narration → move → context → chat flow
    │   └── entities.test.js            Connection and entity CRUD with Foundry documents
    │
    └── fixtures/
        ├── worldTruths.js              The Session Zero rolls from the campaign transcript
        ├── connections.js              Example Connection records at various stages
        ├── moveResolutions.js          Resolved move examples (strong hit, weak hit, miss)
        └── contextPackets.js           Assembled context packet examples for assembler tests
```

## Key design notes

**ApplicationV2** — All UI panels (`progressTracks.js`, `entityPanel.js`, `settingsPanel.js`)
must use Foundry v13's `ApplicationV2` / `HandlebarsApplicationMixin`. Do not use the legacy
`Application` class. The move confirmation dialog lives in `settingsPanel.js`.

**Journal documents** — World Truths and Connection records that surface as journal entries
use `JournalEntryPage` documents inside a parent `JournalEntry`. The parent ID is stored in
`CampaignStateSchema.worldTruthsJournalId`; the page ID in `worldTruthsPageId`.

**Oracle tables** — JSON data under `oracles/tables/` is sourced from the Starforged
Reference Guide. Re-upload the Reference Guide PDF to any session where oracle table
data needs to be extended or verified.

**API keys** — Both `claudeApiKey` and `artApiKey` are `scope: "client"` settings.
They are stored in the browser, never serialised into `campaignState`, and never
sent to Foundry's server.

**Safety injection** — `context/safety.js` is called first by `assembler.js` before
any other section. The safety section is flagged `alwaysInclude: true` in
`ContextPacketSchema` and is exempt from token budget pressure. It is never omitted,
never summarised.

**Mischief** — `moves/mischief.js` shapes the interpretation framing sent to the
Claude API. Mischief activity is recorded internally in `MoveResolutionSchema`
(`mischiefApplied`, `interpretationRationale`) but is never surfaced to the player.
The chat card and confirmation UI always read as a straightforward result.
