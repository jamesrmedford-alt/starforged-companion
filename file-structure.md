# Starforged Companion — File Structure

Post-session-3 / deployment-hardening complete. All backend logic, UI panels,
localisation, unit tests, and proxy infrastructure are done.
Integration tests (Quench, live Foundry) are the only remaining work before
first session use.

---

```
starforged-companion/
│
├── module.json                         Foundry v12/v13 manifest. version field updated
│                                       automatically by CI release job to match git tag.
├── README.md                           Installation, setup, proxy startup, Loremaster dependency
├── package.json                        vitest, eslint. Scripts: test, lint, proxy
├── vitest.config.js                    Vitest config (replaced Jest). globals:true, coverage
│                                       excludes UI/API/Foundry-dependent files
├── eslint.config.js                    ESLint 9 flat config. Globals: browser, Node, Foundry,
│                                       ForgeVTT, ForgeAPI
├── file-structure.md                   This file
│
├── .github/
│   └── workflows/
│       └── ci.yml                      Three jobs: lint+test, manifest validation, release.
│                                       Release job updates module.json version+URLs BEFORE
│                                       building zip (v/v was built first — fixed).
│
├── proxy/
│   ├── claude-proxy.mjs                Zero-dependency Node.js reverse proxy. Routes:
│   │                                     /v1/*        → api.anthropic.com  (Claude)
│   │                                     /openai/v1/* → api.openai.com     (DALL-E)
│   │                                     /health      → 200 OK (health check)
│   │                                   Required for Foundry desktop — Electron renderer
│   │                                   enforces CORS; proxy runs in Node where it doesn't.
│   │                                   Not needed on The Forge (server-side proxy available).
│   ├── start.sh                        Mac/Linux: starts proxy in background, traps Ctrl+C
│   └── start.bat                       Windows: opens proxy in separate window
│
├── lang/
│   └── en.json                         Complete localisation strings for all UI and pipeline
│
├── styles/
│   └── starforged-companion.css        All CSS in one file — PTT, move cards, progress tracks,
│                                       entity panel, settings panel, confirmation dialog,
│                                       X-Card chat card.
│
├── src/
│   ├── index.js                        Entry point — settings, hooks, pipeline wiring.
│   │                                   Registers: claudeProxyUrl setting.
│   │                                   Ready hook: proxy health check (warns if not running),
│   │                                   Loremaster check, chat hook, UI hooks, X-Card hook.
│   │                                   getSceneControlButtons: v13-compatible (handles both
│   │                                   Array and Object forms of the controls argument).
│   │                                   injectPushToTalkButton: DOM API only (jQuery removed).
│   │                                   isPlayerNarration: string literal type checks (v13).
│   │
│   ├── schemas.js                      All 12 data schemas + enumerations.
│   │                                   CharacterSchema, ProgressTrackSchema,
│   │                                   ConnectionSchema, CampaignStateSchema, etc.
│   │
│   ├── api-proxy.js                    NEW — Unified external API routing.
│   │                                   Detects environment and routes accordingly:
│   │                                     • The Forge → ForgeAPI.call("proxy", ...)
│   │                                     • Desktop   → local proxy (claudeProxyUrl setting)
│   │                                   Exports: apiPost(), isLocalProxyReachable(),
│   │                                   proxyModeDescription()
│   │                                   Imported by interpreter.js and art/generator.js.
│   │
│   ├── loremaster.js                   Loremaster integration.
│   │                                   Surfaces module ID and flag path as world-scoped
│   │                                   game.settings (GM enters once in Module Settings).
│   │                                   Exports: registerLoremasterSettings(),
│   │                                   checkLoremaster(), attachLoremasterContext(),
│   │                                   getLoremasterModuleId(), getLoremasterFlagPath(),
│   │                                   isLoremasterActive()
│   │
│   ├── context/
│   │   ├── assembler.js                7-section Loremaster context packet builder.
│   │   │                               Token-budget-aware; safety always first.
│   │   │                               Fixed: world truths reads v.title ?? v.result;
│   │   │                               progress tracks loads dedicated journal directly;
│   │   │                               X-Card checks campaignState.xCardActive.
│   │   └── safety.js                  Lines/Veils formatting, X-Card suppression.
│   │                                   Exports: formatSafetyContext(), estimateSafetyTokens(),
│   │                                   isSceneSuppressed(), suppressScene(), clearXCard()
│   │
│   ├── moves/
│   │   ├── interpreter.js             Claude API call (Haiku 4.5, system prompt cached).
│   │   │                               Narration → {moveId, statUsed, rationale,
│   │   │                               mischiefApplied}. API call routed via api-proxy.js.
│   │   ├── resolver.js                Dice rolling, outcome calculation,
│   │   │                               all 40 CONSEQUENCE_MAP entries.
│   │   │                               Exports: resolveMove(), mapConsequences(),
│   │   │                               countMarkedImpacts()
│   │   ├── mischief.js                Mischief dial — wry aside generator.
│   │   │                               Deterministic (no API call). Dial positions:
│   │   │                               lawful / balanced / chaotic (normalised from
│   │   │                               settingsPanel "lawful" via normalizeDial()).
│   │   │                               Exports: buildMischiefAside(), shouldApplyMischief(),
│   │   │                               buildMischiefFraming(), normalizeDial() (internal)
│   │   └── persistResolution.js       Appends move to session log; applies meter changes
│   │                                   (momentum, health, spirit, supply) with rules clamping;
│   │                                   auto-marks impacts on mandatory suffer move outcomes;
│   │                                   recalculates momentumMax / momentumReset from impacts;
│   │                                   marks progress on journal and legacy tracks;
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
│   │   │                               updateConnection(), markRelationshipProgress(),
│   │   │                               addHistoryEntry(), setPortraitId(),
│   │   │                               formatForContext(), listAllyConnections()
│   │   ├── settlement.js              Settlement records
│   │   ├── ship.js                    Ship records (command vehicle + support vehicles)
│   │   ├── faction.js                 Faction records
│   │   └── planet.js                  Planet records
│   │
│   ├── art/
│   │   ├── generator.js               DALL-E 3 generation interface. b64_json format.
│   │   │                               API call routed via api-proxy.js.
│   │   │                               Policy: generate once, one permitted regeneration,
│   │   │                               then permanently locked.
│   │   │                               Exports: generatePortrait(), regeneratePortrait()
│   │   ├── promptBuilder.js           Entity data → structured DALL-E prompt.
│   │   │                               Accepts { alternativeComposition: true } for regen.
│   │   └── storage.js                 base64 in JournalEntryPage flags.
│   │                                   Exports: loadArtAsset(), storeArtAsset(),
│   │                                   getDataUri(), getPortraitDataUri()
│   │
│   ├── truths/
│   │   ├── generator.js               Roll/choose across all 14 World Truth categories.
│   │   │                               Resolves nested sub-tables automatically.
│   │   │                               Exports: rollCategory(), applyRoll(),
│   │   │                               buildSessionZeroTruths(), storeWorldTruths(),
│   │   │                               loadWorldTruths(), formatForContext(),
│   │   │                               formatSingleTruth(), hasTruths()
│   │   └── tables.js                  All 14 truth categories with sub-table references
│   │                                   (5 sub-tables). Exports: TRUTH_CATEGORIES
│   │
│   ├── ui/
│   │   ├── progressTracks.js          ApplicationV2 panel. 10-box × 4-tick SVG rendering.
│   │   │                               Mark/Clear/Roll/Complete/Remove. Singleton.
│   │   │                               Storage: dedicated JournalEntry "Starforged Progress
│   │   │                               Tracks", flag key "tracks" (array of track records).
│   │   │                               Connection tracks write-through to entity journals.
│   │   │                               Public API: openProgressTracks(), addProgressTrack(),
│   │   │                               markProgressById(), registerProgressTrackHooks()
│   │   │
│   │   ├── entityPanel.js             ApplicationV2 sidebar.
│   │   │                               List view (all 5 entity types, thumbnails) →
│   │   │                               detail view (portrait, fields, progress, history).
│   │   │                               Portrait states: none / unlocked / locked.
│   │   │                               Generate + Regenerate via generator.js real API.
│   │   │                               Public API: openEntityPanel(journalId?),
│   │   │                               registerEntityPanelHooks()
│   │   │
│   │   └── settingsPanel.js           ApplicationV2 tabbed panel.
│   │                                   Three tabs: Safety | Mischief | About.
│   │                                   Safety: Global Lines, Global Veils (GM),
│   │                                   Private Lines (client-scoped).
│   │                                   Each write syncs to campaignState.safety via
│   │                                   syncSafetyToCampaignState() — bridges game.settings
│   │                                   to the shape assembler.js / safety.js reads.
│   │                                   Mischief: Lawful / Balanced / Chaotic dial (GM).
│   │                                   MoveConfirmDialog: Promise-resolving ApplicationV2.
│   │                                   X-Card: /x chat hook wired via registerXCardHook().
│   │                                   Public API: openSettingsPanel(), confirmInterpretation(),
│   │                                   getSafetyConfig(), getMischiefDial(),
│   │                                   registerSettings(), registerSettingsHooks()
│   │
│   └── input/
│       └── speechInput.js             Push-to-talk via Web Speech API.
│                                       Chromium only; graceful no-op elsewhere.
│                                       DOM API only (jQuery removed for v13 compat).
│
└── tests/
    ├── setup.js                        Vitest shared setup. Stubs: game.* (including
    │                                   game.journal.getName), Hooks, foundry.utils,
    │                                   CONST, Dialog, ChatMessage, JournalEntry
    │                                   (with createEmbeddedDocuments and pages),
    │                                   ui.notifications.
    │
    ├── unit/
    │   ├── resolver.test.js            57 tests — dice math, outcomes, consequences
    │   ├── assembler.test.js           28 tests — safety, X-Card, packet structure
    │   ├── mischief.test.js            28 tests — buildMischiefAside, shouldApplyMischief,
    │   │                               buildMischiefFraming, normalizeDial, lawful alias
    │   └── truths.test.js              52 tests — rollCategory, applyRoll, sub-tables,
    │                                   buildSessionZeroTruths, persistence, formatting
    │
    ├── integration/                    Requires live Foundry + Quench. Not yet written.
    │   ├── pipeline.test.js            Full narration → move → context → chat flow
    │   └── entities.test.js            Connection and entity CRUD with Foundry documents
    │
    └── fixtures/
        ├── truths.json                 All 14 Session Zero truths, full text, quest starters,
        │                               sub-table data. Authoritative campaign truth record.
        ├── entities.json               Courier connection, player ship, iron panel artifact,
        │                               Sable NPC. Open threads flagged.
        └── packet.json                 Complete 7-section Loremaster context packet for the
                                        autodoc scene. Ground-truth for integration tests.
```

---

## Session startup procedure (desktop)

```bash
# From the module repo folder — run once before launching Foundry
./proxy/start.sh          # Mac/Linux
proxy\start.bat           # Windows

# Or manually:
npm run proxy
```

On **The Forge**: no proxy needed. `ForgeAPI.call("proxy", ...)` handles it server-side.

---

## One-time GM setup (in Foundry)

1. **Configure Settings → Starforged Companion:**
   - Claude API Key — your Anthropic API key (client-scoped, browser only)
   - Art Generation API Key — your OpenAI key (client-scoped, browser only)
   - Loremaster Module ID — run `[...game.modules.keys()].filter(k => k.includes('lore'))`
     in the Foundry console; paste the result here
   - Claude Proxy URL — leave as `http://127.0.0.1:3001` unless using a custom port

2. **Verify:** the console should show:
   - `starforged-companion | Proxy reachable: Local proxy (http://127.0.0.1:3001)`
   - `starforged-companion | Loremaster active: loremaster`

---

## Architecture notes

**ApplicationV2** — All UI panels use Foundry v13's `ApplicationV2`. Singletons via
static `open()`. Live refresh via Foundry hooks. `_prepareContext` / `_renderHTML` /
`_replaceHTML` lifecycle. Unused parameters prefixed `_` to satisfy ESLint.

**Storage — three distinct stores:**
- `game.settings` (world): campaign state, safety config, Loremaster settings, mischief dial,
  proxy URL
- `game.settings` (client): private Lines, API keys — browser only, never sent to server
- `JournalEntry + JournalEntryPage flags`: entity records, progress tracks (dedicated journal),
  world truths, art assets

**Safety sync** — `settingsPanel.js` stores Lines/Veils in `game.settings`. `assembler.js`
reads from `campaignState.safety`. `syncSafetyToCampaignState()` in `settingsPanel.js` bridges
these on every write and on the `ready` hook. Private Lines are stored keyed by player ID.

**Progress tracks storage** — ALL tracks live in ONE dedicated JournalEntry named
"Starforged Progress Tracks", under `page.flags["starforged-companion"].tracks` as an array.
There are no per-track journal entries. `assembler.js` loads this journal by name directly.

**World truths storage** — `campaignState.worldTruths` keyed by categoryId. Each value is a
`TruthResult` with `title`, `description`, `questStarter`, `subResult`. `assembler.js` reads
`v.title ?? v.result` for backward compat with test fixtures.

**API routing** — All external API calls go through `src/api-proxy.js`. Never call external
APIs directly. Forge users get server-side proxy; desktop users get local Node proxy.

**CORS** — Foundry Electron renderer enforces browser CORS. Module JS runs in renderer only.
No Electron Node API access (context isolation enabled). Solution: local proxy in Node.js.

**Mischief dial** — `settingsPanel.js` stores `"lawful"/"balanced"/"chaotic"`.
`mischief.js` uses `"serious"/"balanced"/"chaotic"` internally. `normalizeDial()` maps
`"lawful"` → `"serious"` at all three consumption points.

**Portrait lock** — Generate once → `{ locked: false }`. One regeneration →
`{ locked: true }` immediately. Old asset → `{ superseded: true }`.

**Foundry v13 compatibility** — ApplicationV2 (not Application), string literal chat message
types (not CONST.CHAT_MESSAGE_TYPES), DOM API in PTT button (not jQuery), dual-format
getSceneControlButtons hook handler.

**Testing framework** — Vitest. Unit tests: `npm test` — no Foundry required. Integration
tests: Quench inside live Foundry — run separately. Coverage thresholds: lines 80%,
functions 50% (resolver.js data-shaped consequence handlers drag this down), branches 75%.
UI panels and API-calling modules excluded from unit coverage.

**CI release** — module.json `version` field updated to match git tag BEFORE zip is built.
This ensures both the loose manifest attachment and the zip contents have consistent version
and manifest URLs. Foundry update detection requires the version to change between releases.
