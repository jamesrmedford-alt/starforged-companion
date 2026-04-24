# Starforged Companion — File Structure

Session 3 complete. All backend logic, UI panels, localisation, and unit tests are done.
Integration tests (Quench, live Foundry) are the only remaining work before first session use.

**Testing framework note:** Session 3 switched from Jest (--experimental-vm-modules) to
**Vitest**. `vitest.config.js` replaces `jest.config.js`. `tests/setup.js` replaces
`src/foundry-shim.js` as the test environment setup file. `package.json` needs updating
to replace the `jest` dependency with `vitest`.

```
starforged-companion/
│
├── module.json                         Foundry v12/v13 manifest
├── README.md                           Installation, setup, Loremaster dependency note
├── package.json                        vitest, eslint — update jest → vitest
├── vitest.config.js                    Test runner config (replaces jest.config.js)
├── eslint.config.js                    ESLint 9 flat config
├── file-structure.md                   This file
│
├── .github/
│   └── workflows/
│       └── ci.yml                      Three jobs: lint+test, manifest validation, release
│
├── lang/
│   └── en.json                         Complete localisation strings for all UI and pipeline
│
├── styles/
│   └── starforged-companion.css        All CSS — PTT, move cards, progress tracks,
│                                       entity panel, settings panel, confirmation dialog,
│                                       X-Card chat card. Single file, appended in sessions.
│
├── src/
│   ├── index.js                        Entry point — settings, hooks, pipeline wiring.
│   │                                   Wiring patch (Session 3): import persistResolution
│   │                                   from moves/persistResolution.js; import
│   │                                   registerLoremasterSettings / checkLoremaster /
│   │                                   attachLoremasterContext from loremaster.js;
│   │                                   import all three UI panel openers and hook
│   │                                   registrations; delete the old confirmInterpretation
│   │                                   stub (real implementation in ui/settingsPanel.js).
│   │
│   ├── schemas.js                      All 12 data schemas + enumerations
│   │                                   CharacterSchema, ProgressTrackSchema,
│   │                                   ConnectionSchema, CampaignStateSchema, etc.
│   │
│   ├── loremaster.js                   Loremaster integration — NEW Session 3
│   │                                   Replaces hardcoded "loremaster" placeholder.
│   │                                   Surfaces module ID and flag path as world-scoped
│   │                                   game.settings (GM enters once in Module Settings).
│   │                                   Exports: registerLoremasterSettings(),
│   │                                   checkLoremaster(), attachLoremasterContext(),
│   │                                   getLoremasterModuleId(), getLoremasterFlagPath(),
│   │                                   isLoremasterActive()
│   │
│   ├── context/
│   │   ├── assembler.js                7-section Loremaster context packet builder.
│   │   │                               Token-budget-aware; safety section always first,
│   │   │                               always included, never summarised or omitted.
│   │   └── safety.js                  Lines/Veils formatting, X-Card suppression,
│   │                                   isSceneSuppressed() check
│   │
│   ├── moves/
│   │   ├── interpreter.js             Claude API call (Haiku 4.5, system prompt cached).
│   │   │                               Narration → {moveId, statUsed, rationale,
│   │   │                               mischiefApplied}
│   │   ├── resolver.js                Dice rolling, outcome calculation,
│   │   │                               all 40 CONSEQUENCE_MAP entries.
│   │   │                               Exports: resolveMove(), mapConsequences(),
│   │   │                               countMarkedImpacts()
│   │   ├── mischief.js                Mischief dial — wry aside generator.
│   │   │                               Deterministic (no API call). Three dial positions:
│   │   │                               lawful / balanced / chaotic.
│   │   │                               Exports: buildMischiefAside(), shouldApplyMischief(),
│   │   │                               getMischiefTone()
│   │   └── persistResolution.js       NEW Session 3 — replaces stub in index.js.
│   │                                   Appends move to session log; applies meter changes
│   │                                   (momentum, health, spirit, supply) with rules clamping;
│   │                                   auto-marks impacts (wounded, shaken, unprepared) on
│   │                                   mandatory suffer move outcomes; recalculates
│   │                                   momentumMax / momentumReset from impact count;
│   │                                   marks progress on journal tracks and legacy tracks;
│   │                                   awards Earn Experience XP on legacy track box fills;
│   │                                   saves character back to journal page flags.
│   │
│   ├── oracles/
│   │   ├── roller.js                  Registry of all oracle tables, paired rolls,
│   │   │                               Ask the Oracle yes/no odds
│   │   └── tables/
│   │       ├── core.js                Action, Theme, Descriptor, Focus (400 entries)
│   │       ├── space.js               Space Sightings ×3, Sector Names, Stellar Objects,
│   │       │                           Peril/Opportunity
│   │       ├── planets.js             All 10 planet types, Peril/Opportunity ×2
│   │       ├── settlements.js         Full settlement oracles + 100 names
│   │       ├── starships.js           Full starship oracles + 100 names
│   │       ├── characters.js          Role, Goal, First Look, Disposition + name tables
│   │       ├── creatures.js           Environment, Scale, Forms ×5, Behavior, Aspect
│   │       ├── factions.js            Full faction oracles + name generator
│   │       ├── derelicts.js           Location, all 8 zone areas
│   │       ├── vaults.js              Full Precursor Vault oracle set
│   │       ├── themes.js              All 7 location themes — Feature/Peril/Opportunity each
│   │       └── misc.js                Story Complication, Story Clue, Anomaly, Combat Action
│   │
│   ├── entities/
│   │   ├── connection.js              Connection CRUD + progress management.
│   │   │                               Storage: JournalEntry + JournalEntryPage flags.
│   │   │                               Exports: createConnection(), getConnection(),
│   │   │                               updateConnection(), markProgress(), addHistoryEntry(),
│   │   │                               formatForContext(), listAllyConnections()
│   │   ├── settlement.js              Settlement records
│   │   ├── ship.js                    Ship records (command vehicle + support vehicles)
│   │   ├── faction.js                 Faction records
│   │   └── planet.js                  Planet records
│   │
│   ├── art/
│   │   ├── generator.js               DALL-E 3 generation interface. b64_json format.
│   │   │                               standard quality, natural style.
│   │   │                               Trigger: after Loremaster's first entity description.
│   │   │                               Policy: generate once, one permitted regeneration,
│   │   │                               then permanently locked.
│   │   ├── promptBuilder.js           Entity data → structured DALL-E prompt.
│   │   │                               Accepts { alternativeComposition: true } for regen.
│   │   │                               Player never sees prompt machinery.
│   │   └── storage.js                 base64 stored in JournalEntryPage flags.
│   │                                   (Not FilePicker — The Forge restricts filesystem
│   │                                   writes for non-GM users.)
│   │                                   Art state: { dataUri, locked, superseded }
│   │
│   ├── truths/
│   │   ├── generator.js               Roll/choose across all 14 World Truth categories.
│   │   │                               Resolves nested sub-tables automatically.
│   │   │                               Saves to JournalEntryPage. Exports: rollCategory(),
│   │   │                               resolveSubTable(), formatTruth(), storeTruths(),
│   │   │                               loadTruths(), loadSessionZeroPreset()
│   │   └── tables.js                  All 14 truth categories with sub-table references
│   │                                   (5 sub-tables: cataclysm foe, magic source,
│   │                                   AI resolution, + 2 others)
│   │
│   ├── ui/
│   │   ├── progressTracks.js          NEW Session 3 — ApplicationV2 panel.
│   │   │                               10-box × 4-tick visual rendering (SVG tick marks).
│   │   │                               Mark Progress, Clear Progress, Progress Roll,
│   │   │                               Complete, Remove. Singleton. Persists to JournalEntry
│   │   │                               flags (journal named "Starforged Progress Tracks").
│   │   │                               Connection tracks write-through to entity journals.
│   │   │                               Live refresh via updateJournalEntry hook.
│   │   │                               Public API: openProgressTracks(), addProgressTrack(),
│   │   │                               markProgressById(), registerProgressTrackHooks()
│   │   │
│   │   ├── entityPanel.js             NEW Session 3 — ApplicationV2 sidebar.
│   │   │                               List view (all 5 entity types, thumbnails) →
│   │   │                               detail view (portrait, fields, progress, history).
│   │   │                               Portrait states: none / unlocked / locked.
│   │   │                               Generate + Regenerate (one permitted, locks immediately).
│   │   │                               Live refresh via updateJournalEntry /
│   │   │                               createJournalEntry / deleteJournalEntry hooks.
│   │   │                               Public API: openEntityPanel(journalId?),
│   │   │                               registerEntityPanelHooks()
│   │   │
│   │   └── settingsPanel.js           NEW Session 3 — ApplicationV2 tabbed panel.
│   │                                   Three tabs: Safety | Mischief | About.
│   │                                   Safety: Global Lines, Global Veils (GM-only),
│   │                                   Private Lines (client-scoped, player-only).
│   │                                   Mischief: Lawful / Balanced / Chaotic dial (GM-only).
│   │                                   About: module status, open items list.
│   │                                   Also hosts MoveConfirmDialog — Promise-resolving
│   │                                   ApplicationV2 dialog; replaces auto-confirm stub.
│   │                                   X-Card: /x chat hook wired here.
│   │                                   Storage: game.settings (world + client scoped).
│   │                                   Public API: openSettingsPanel(), confirmInterpretation(),
│   │                                   getSafetyConfig(), getMischiefDial(),
│   │                                   registerSettings(), registerSettingsHooks()
│   │
│   └── input/
│       └── speechInput.js             Push-to-talk via Web Speech API.
│                                       Chromium only; graceful no-op on unsupported browsers.
│                                       mousedown/touchstart → start recognition.
│                                       mouseup/touchend/mouseleave → stop + auto-inject to chat.
│
└── tests/
    ├── setup.js                        NEW Session 3 — Vitest shared setup.
    │                                   Stubs: game.*, Hooks, foundry.utils,
    │                                   CONST, Dialog, ChatMessage, JournalEntry, ui.
    │                                   Does NOT mock canvas/pixi/socket (integration only).
    │
    ├── unit/
    │   ├── resolver.test.js            40 tests — dice math, outcomes, consequences
    │   ├── assembler.test.js           16 tests — safety, X-Card, packet structure
    │   ├── mischief.test.js            NEW Session 3 — buildMischiefAside coverage.
    │   │                               Dial gating, tone differentiation, determinism,
    │   │                               no-API-call guarantee, edge cases. ~30 tests.
    │   └── truths.test.js              NEW Session 3 — rollCategory + sub-table resolution.
    │                                   All 14 categories, Session Zero known-good roll values,
    │                                   boundary rolls, round-trip persistence. ~35 tests.
    │
    ├── integration/                    Requires live Foundry + Quench module. Not yet written.
    │   ├── pipeline.test.js            Full narration → move → context → chat flow
    │   └── entities.test.js            Connection and entity CRUD with Foundry documents
    │
    └── fixtures/
        ├── truths.json                 NEW Session 3 — all 14 Session Zero truths with full
        │                               text, quest starters, band ranges, sub-table data.
        │                               Authoritative campaign truth record.
        ├── entities.json               NEW Session 3 — courier connection, player ship,
        │                               iron panel artifact, Sable NPC. All open threads
        │                               flagged. Used by unit + integration tests.
        └── packet.json                 NEW Session 3 — complete assembled 7-section
                                        Loremaster context packet for the autodoc scene
                                        (Session 1, Face Danger +Wits, Weak Hit).
                                        Ground-truth shape for assembler integration tests.
```

---

## Open items — integration tests only

```
tests/integration/pipeline.test.js     Full move pipeline — requires Quench + live Foundry
tests/integration/entities.test.js     Entity CRUD — requires Quench + live Foundry
```

---

## One-time GM setup (before first session)

1. Open **Module Settings → Loremaster Module ID** and enter the value from Loremaster's
   `module.json`. To find it: run `[...game.modules.keys()].filter(k => k.includes('lore'))`
   in the Foundry console while Loremaster is installed.
2. Open **Module Settings → Loremaster Context Flag Path** and confirm it matches the path
   Loremaster actually reads from. Default (`loremasterContext`) should be correct — verify
   against Loremaster's source if context injection does not fire.

---

## Architecture notes

**ApplicationV2** — All UI panels use Foundry v13's `ApplicationV2`. Do not use the legacy
`Application` class. Singletons opened via static `open()` methods. Live refresh via Foundry
hooks rather than polling.

**Storage patterns** — Three distinct stores:
- `game.settings` (world-scoped): campaign state, safety config, Loremaster settings, mischief dial
- `game.settings` (client-scoped): private Lines, API keys (never serialised to server)
- `JournalEntry + JournalEntryPage flags`: entity records, progress tracks, world truths, art assets

**Safety injection** — `safety.js` is always called first by `assembler.js`. Safety section is
flagged `alwaysInclude: true` in `ContextPacketSchema` and is exempt from token budget pressure.
Never omitted, never summarised, always the first section Loremaster receives.

**Mischief ceiling** — Safety configuration is a hard ceiling on the mischief dial regardless
of session setting. Lines and Veils are injected before any mischief is applied.

**Portrait lock** — Generate once → `{ locked: false }`. One permitted regeneration →
`{ locked: true }` immediately on save, old asset marked `{ superseded: true }`. No further
generation after lock. Enforced in `entityPanel.js` UI and `art/storage.js`.

**Oracle table names** — Files in `src/oracles/tables/` use the exact names from this document.
Any new output file must note its intended path in the file header comment if the name could
collide in a flat output directory.

**API keys** — `claudeApiKey` and `artApiKey` are `scope: "client"` settings. Stored in the
browser only. Never serialised into `campaignState`. Never sent to Foundry's server.

**Testing framework** — Vitest (Session 3 migration from Jest).
Unit tests: `vitest run` — no Foundry required.
Integration tests: Quench inside a live Foundry instance — run separately.
Coverage thresholds: lines 80%, functions 80%, branches 75%.
UI panels are excluded from unit coverage (require live Foundry ApplicationV2).
