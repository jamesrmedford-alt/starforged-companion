# Foundry VTT API Reference — v13
## Compiled for Starforged Companion development

**Source:** https://foundryvtt.wiki/en/development/api (verified v13)  
**Official docs:** https://foundryvtt.com/api/v13/  
**Last updated:** April 2025 — added Scene, NoteDocument, DrawingDocument, FilePicker, CSS Layers  

This document exists because Claude Code's network access does not include
foundryvtt.com. Update this file when the Foundry version changes or when
new API surface is needed.

---

## Contents

1. [ApplicationV2](#applicationv2)
2. [Hooks](#hooks)
3. [Documents — Actor, JournalEntry, ChatMessage](#documents)
4. [Settings](#settings)
5. [Flags](#flags)
6. [Sockets](#sockets)
7. [DialogV2](#dialogv2)
8. [v12 → v13 Breaking Changes](#breaking-changes)
9. [Scene](#scene)
10. [NoteDocument (Journal Pins)](#notedocument-journal-pins)
11. [DrawingDocument (Canvas Drawings)](#drawingdocument-canvas-drawings)
12. [FilePicker.upload](#filepickerupload)
13. [CSS Layers (v13)](#css-layers-v13)

---

## ApplicationV2

**Official:** https://foundryvtt.com/api/v13/classes/foundry.applications.api.ApplicationV2.html  
**Wiki:** https://foundryvtt.wiki/en/development/api/applicationv2

### Access

```js
// Full path
foundry.applications.api.ApplicationV2

// Destructuring (preferred for readability)
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
```

### Class definition pattern

```js
class MyApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id:      "my-app",
    classes: ["my-module", "my-app"],
    tag:     "div",          // or "form" for form-handling apps
    window: {
      title:       "My Application",
      resizable:   true,
      minimizable: true,
    },
    position: { width: 400, height: "auto" },
    actions: {
      myAction: MyApp.#onMyAction,
    },
  };

  // Prepare data for rendering
  async _prepareContext(options) {
    return { /* data for template */ };
  }

  // Return an HTMLElement (not a string, not jQuery)
  async _renderHTML(context, options) {
    const div = document.createElement("div");
    div.innerHTML = `<p>${context.someData}</p>`;
    return div;
  }

  // Replace the content area with the rendered HTML
  _replaceHTML(result, content, options) {
    content.innerHTML = "";
    content.append(result);
  }

  // Static action handlers — `this` is the app instance
  static async #onMyAction(event, target) {
    // target is the element with data-action="myAction"
    this.render();
  }
}
```

### Rendering

```js
// Open / bring to front
new MyApp().render({ force: true });

// Re-render in place (call from within the class)
this.render();

// Close
this.close();
this.close({ animate: false }); // skip close animation
```

### Singleton pattern (used throughout this module)

```js
class MyApp extends ApplicationV2 {
  static #instance = null;

  static open() {
    if (!MyApp.#instance) MyApp.#instance = new MyApp();
    MyApp.#instance.render({ force: true });
    return MyApp.#instance;
  }
}
```

### Actions (click handlers)

Actions replace `activateListeners` from v1. Define static functions, reference
in `DEFAULT_OPTIONS.actions`, wire to elements with `data-action`.

```js
// In DEFAULT_OPTIONS:
actions: {
  doThing: MyApp.#onDoThing,
}

// Handler signature:
static async #onDoThing(event, target) {
  // event = PointerEvent
  // target = HTMLElement with data-action="doThing"
  // `this` = the app instance (despite being static)
}

// In HTML:
// <button data-action="doThing">Click me</button>
// <a data-action="doThing">Or a link</a>
```

### Form handling

```js
static DEFAULT_OPTIONS = {
  tag: "form",
  form: {
    handler:        MyApp.#onSubmit,
    submitOnChange: false,
    closeOnSubmit:  false,
  },
};

static async #onSubmit(event, form, formData) {
  // formData.object contains the form values as a plain object
  const values = formData.object;
}
```

### HandlebarsApplicationMixin

For Handlebars template rendering (not used in this module — we render HTML
directly in `_renderHTML`):

```js
class MyApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static PARTS = {
    main: { template: "modules/my-module/templates/my-app.hbs" }
  };
}
```

### Key differences from v1 Application

| v1 | v2 |
|----|-----|
| `getData()` | `_prepareContext()` |
| `activateListeners(html)` | `actions` in DEFAULT_OPTIONS + `data-action` attributes |
| Returns HTML string | Returns HTMLElement |
| jQuery everywhere | DOM API only (no `$` or `.find()`) |
| `html.find(...)` | `html.querySelector(...)` |
| `this.element.find(...)` | `this.element.querySelector(...)` |
| `render(true)` | `render({ force: true })` |

---

## Hooks

**Official:** https://foundryvtt.com/api/v13/classes/foundry.helpers.Hooks.html  
**Wiki:** https://foundryvtt.wiki/en/development/api/hooks

### Registration

```js
// Persistent — fires every time the event occurs
Hooks.on("hookName", (arg1, arg2) => { /* ... */ });

// One-shot — fires once then automatically unregisters
Hooks.once("hookName", (arg1, arg2) => { /* ... */ });

// Unregister by ID
const id = Hooks.on("hookName", handler);
Hooks.off("hookName", id);

// Unregister by reference
Hooks.off("hookName", handler);
```

### Important hooks for this module

```js
// Module lifecycle
Hooks.once("init",  () => { /* register settings, classes */ });
Hooks.once("ready", () => { /* access game.*, start processes */ });

// Chat — fires when a ChatMessage document is created
// message = ChatMessage instance (use message.author, not message.user)
Hooks.on("createChatMessage", (message, options, userId) => { });

// Scene controls toolbar — TWO hooks required (see SceneControls section below)
// Hook 1: register metadata (button appears but onChange never fires for button tools)
Hooks.on("getSceneControlButtons", (controls) => { });
// Hook 2: attach click handlers via DOM after render
Hooks.on("renderSceneControls", (app, html) => { });

// Actor updated (any client)
Hooks.on("updateActor", (actor, changes, options, userId) => { });

// Journal updated
Hooks.on("updateJournalEntry", (doc, change, options, userId) => { });

// Chat log rendered
// html is HTMLElement in v13 (NOT jQuery object)
Hooks.on("renderChatLog", (chatLog, html, data) => { });

// World closing
Hooks.once("closeWorld", () => { });
```

### Hook behaviour notes

- Hooks are **synchronous** — Foundry does not await Promise-returning callbacks
- Hooks are **local only** — fire on the client triggering them, not all clients
- Returning `false` from a `Hooks.call` callback stops the cycle (not `callAll`)
- `this` inside a hook callback is the `Hooks` class, not the triggering context

### Debug hooks

```js
// In Foundry console — logs every hook as it fires
CONFIG.debug.hooks = true;
```

---

## Documents

**Wiki:** https://foundryvtt.wiki/en/development/api/document

### ChatMessage

```js
// Create
await ChatMessage.create({
  content: "<p>Hello world</p>",
  speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
  flags: {
    "starforged-companion": { myFlag: true }
  },
  // DO NOT set type: "other" — not valid in v13
  // Valid types: "base", "ooc", "roll", "whisper", "emote"
  // Omitting type defaults to "base"
});

// Author (v13) — NOT .user (deprecated, logs warning)
const author = message.author;

// Type checks — use string literals, NOT CONST.CHAT_MESSAGE_TYPES
if (message.type === "ooc")     { /* ... */ }
if (message.type === "roll")    { /* ... */ }
if (message.type === "whisper") { /* ... */ }
// Do not check for "other" — removed in v13
```

### Actor

```js
// Get player's assigned character
game.user.character  // Actor | null

// Find actors
game.actors.get(id)
game.actors.find(a => a.type === "character" && a.hasPlayerOwner)
game.actors.filter(a => a.type === "starship" && a.hasPlayerOwner)

// Update (dot-notation string keys for nested paths)
await actor.update({ "system.health.value": 4 });
await actor.update({
  "system.health.value":   newHealth,
  "system.spirit.value":   newSpirit,
  "system.momentum.value": newMomentum,
});

// Flags
await actor.setFlag("starforged-companion", "myKey", value);
const val = actor.getFlag("starforged-companion", "myKey");
await actor.unsetFlag("starforged-companion", "myKey");
```

**See `docs/ironsworn-api-scope.md` for confirmed field paths in the
foundry-ironsworn system Actor schema.**

### JournalEntry

```js
// Find by name (returns first match or null)
const journal = game.journal.getName("My Journal");

// Get by ID
const journal = game.journal.get(id);

// Create
const journal = await JournalEntry.create({
  name: "My Journal",
  flags: { "starforged-companion": { myData: {} } }
});

// Pages
const page  = journal.pages.contents[0];
const pages = journal.pages.contents;  // Array

// Create embedded page
await journal.createEmbeddedDocuments("JournalEntryPage", [{
  name:  "Page Title",
  type:  "text",
  text:  { content: "<p>Page content</p>", format: 1 }
}]);

// Update page
await page.update({ "text.content": "<p>New content</p>" });

// Flags on pages
await page.setFlag("starforged-companion", "myKey", value);
const val = page.getFlag("starforged-companion", "myKey");
```

---

## Settings

**Wiki:** https://foundryvtt.wiki/en/development/api/settings

```js
// Register (call from init hook)
game.settings.register("starforged-companion", "myKey", {
  name:    "Setting Name",       // shown in UI if config: true
  hint:    "Description",
  scope:   "world",              // "world" (GM only write) or "client" (per browser)
  config:  true,                 // show in Configure Settings dialog
  type:    String,               // String, Number, Boolean, Object, Array
  default: "",
  choices: { "a": "Option A" }, // optional — makes it a select
  onChange: (value) => { },     // optional — fires when value changes
});

// Read
const val = game.settings.get("starforged-companion", "myKey");

// Write
// IMPORTANT: world-scoped settings require game.user.isGM
// Player clients calling game.settings.set on a world-scoped setting will throw
await game.settings.set("starforged-companion", "myKey", newValue);

// Safe pattern for world-scoped writes from inside hooks that run on all clients:
if (game.user.isGM) {
  await game.settings.set("starforged-companion", "campaignState", state);
}
```

---

## Flags

**Wiki:** https://foundryvtt.wiki/en/development/api/flags

Flags store arbitrary data on any Document (Actor, JournalEntry, ChatMessage, etc.).
They persist to the database and survive page reloads.

```js
// Set
await document.setFlag("starforged-companion", "key", value);

// Get
const val = document.getFlag("starforged-companion", "key");

// Unset
await document.unsetFlag("starforged-companion", "key");

// Check in update data (for hooks)
if (foundry.utils.hasProperty(changes, "flags.starforged-companion")) {
  // the flag changed
}

// Gotcha: setting an object flag replaces the entire object
// To update a nested property, read → modify → write the whole object
const existing = doc.getFlag("starforged-companion", "tracks") ?? [];
existing.push(newTrack);
await doc.setFlag("starforged-companion", "tracks", existing);
```

### JournalEntry flags vs JournalEntryPage flags — CONFIRMED DISTINCTION

**IMPORTANT:** Flags can be set on either a `JournalEntry` or a `JournalEntryPage`.
These are two different documents and their flags are completely separate.

```js
// Flag on the JOURNAL ENTRY itself (top-level document)
await journal.setFlag("starforged-companion", "tracks", tracksArray);
const tracks = journal.getFlag("starforged-companion", "tracks");

// Flag on a JOURNAL ENTRY PAGE (embedded document within the journal)
const page = journal.pages.contents[0];
await page.setFlag("starforged-companion", "entityData", data);
const data = page.getFlag("starforged-companion", "entityData");
```

**Confirmed storage locations in this module (from live testing):**

| Data | Storage | Access pattern |
|------|---------|----------------|
| Progress tracks array | JournalEntry flag | `journal.getFlag(MODULE_ID, "tracks")` |
| Entity records (connection, settlement etc) | JournalEntryPage flag | `page.getFlag(MODULE_ID, entityType)` |
| Art assets | JournalEntryPage flag | `page.getFlag(MODULE_ID, "artAssets")` |
| Sector records | JournalEntry flag | `journal.getFlag(MODULE_ID, sectorId)` |

**Do NOT assume tracks or other arrays are on a page** — `progressTracks.js`
stores the tracks array directly on the JournalEntry, confirmed by:
```js
game.journal.getName("Starforged Progress Tracks")
  .getFlag("starforged-companion", "tracks")  // → array of track objects
// NOT: journal.pages.contents[0].getFlag(...)
```

---

## Sockets

**Wiki:** https://foundryvtt.wiki/en/development/api/sockets

Sockets allow modules to send messages between clients. Requires `"socket": true`
in `module.json`.

```js
// Emit (send to all other connected clients)
game.socket.emit("module.starforged-companion", {
  type: "myEvent",
  data: { /* payload */ }
});

// Listen (register in ready hook)
game.socket.on("module.starforged-companion", (data) => {
  if (data.type !== "myEvent") return;
  // handle the event
});
```

**Important:** Sockets emit to OTHER clients, not the sending client. The sending
client must handle its own state update separately if needed.

---

## DialogV2

**Wiki:** https://foundryvtt.wiki/en/development/api/dialogv2  
**Official:** https://foundryvtt.com/api/v13/classes/foundry.applications.api.DialogV2.html

Use `DialogV2` not `Dialog` — `Dialog` is deprecated in v13 (removed in v16).

```js
const { DialogV2 } = foundry.applications.api;

// Confirm dialog — returns true (confirmed) or false (cancelled)
const confirmed = await DialogV2.confirm({
  window: { title: "Confirm Action" },
  content: "<p>Are you sure?</p>",
});

// Prompt dialog — returns the submitted value or null
const value = await DialogV2.prompt({
  window: { title: "Enter Value" },
  content: `<label>Name: <input type="text" name="name"></label>`,
  ok: {
    label:    "Submit",
    callback: (event, button, dialog) => {
      return button.form.elements.name.value;
    }
  }
});

// Custom dialog
const result = await DialogV2.wait({
  window: { title: "Choose" },
  content: "<p>Make a choice.</p>",
  buttons: [
    { action: "yes", label: "Yes", default: true },
    { action: "no",  label: "No" },
  ],
});
// result = "yes" | "no" | null (if closed)
```

---

## Breaking Changes — v12 → v13

Confirmed changes that have already caused bugs in this codebase.

| API | v12 behaviour | v13 behaviour | Status |
|-----|--------------|---------------|--------|
| `message.user` | Returns the user | **Deprecated** — logs warning. Use `message.author` | ✅ Fixed |
| `message.type = "other"` | Valid chat type | **Removed** — throws validation error. Use no type or `"base"` | ✅ Fixed |
| `CONST.CHAT_MESSAGE_TYPES` | Enum with OOC, ROLL etc | **Restructured** — use string literals `"ooc"`, `"roll"`, `"whisper"` | ✅ Fixed |
| `getSceneControlButtons` hook | `controls` is an Array | `controls` is an Object keyed by group name | ✅ Fixed |
| jQuery in render hooks | `html` is jQuery object | `html` is plain HTMLElement | ✅ Fixed |
| `Dialog.confirm()` | Valid | **Deprecated** — use `DialogV2.confirm()`. Works until v16 | ⚠️ Open |
| `Application` class | Valid | **Deprecated** — use `ApplicationV2`. Works until v16 | ✅ Fixed in our code |
| `renderChatLog` hook | `html` is jQuery | `html` is HTMLElement | ✅ Fixed |
| `Hooks.on("getSceneControlButtons")` | Array argument | Object argument | ✅ Fixed |
| `SceneControlTool.onClick` | Valid | **Removed** — use `onChange` for registration, `renderSceneControls` for click handling | ✅ Fixed |
| `button: true` tool `onChange` | Called on click | **Never called** — attach handlers via `renderSceneControls` DOM | ✅ Fixed |
| `Hooks._hooks` | Object of registered hooks | **Undefined** — does not exist in v13 | ⚠️ Do not use |
| `SceneControls.initialize()` | Valid | **Deprecated** — use `render({ controls, tool })` | Non-blocking |

### Things NOT changed (common misconceptions)

- `game.settings.get/set` — unchanged
- `actor.update({ "system.field": value })` — unchanged (dot notation always worked)
- `JournalEntry.create()` — unchanged
- `ChatMessage.create()` — unchanged except valid `type` values
- `Hooks.on/once/off` — unchanged
- `game.socket.on/emit` — unchanged
- `document.setFlag/getFlag/unsetFlag` — unchanged
- `foundry.utils.randomID()` — unchanged

---

## Useful patterns for this module

### Checking if running on The Forge

```js
const isForge = typeof ForgeVTT !== "undefined" && ForgeVTT.usingTheForge === true;
```

### Safe world-scoped settings write

```js
async function saveToWorld(key, value) {
  if (!game.user?.isGM) return;
  await game.settings.set("starforged-companion", key, value);
}
```

### Read-all-pages from a journal

```js
function getJournalPages(journalName) {
  const journal = game.journal?.getName(journalName);
  if (!journal) return [];
  return journal.pages.contents;
}
```

### Create journal if missing

```js
async function getOrCreateJournal(name) {
  let journal = game.journal?.getName(name);
  if (!journal) {
    journal = await JournalEntry.create({ name });
  }
  return journal;
}
```

### Post a chat card as the current user

```js
async function postCard(content, flags = {}) {
  return ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor: game.user.character }),
    flags: { "starforged-companion": { ...flags } },
  });
}
```

---

## Scene

**Official:** https://foundryvtt.com/api/v13/classes/foundry.documents.Scene.html  
**Article:** https://foundryvtt.com/article/scenes/

### Create a scene

```js
const scene = await Scene.create({
  name:            "Devil's Maw",
  background:      { src: "modules/starforged-companion/art/sector-abc123.png" },  // v13: background.src not img
  width:           1400,   // scene pixel width — should match image dimensions
  height:          1000,   // scene pixel height
  backgroundColor: "#000000",

  // Grid configuration
  grid: {
    type:  1,       // 1 = square, 0 = gridless, 2–5 = hex variants
    size:  100,     // pixels per grid cell (default 100; minimum 50)
    color: "#333333",
    alpha: 0.1,     // grid line opacity (0–1)
  },

  // Disable features not needed for a sector map
  tokenVision:    false,
  fogExploration: false,
  globalLight:    false,
  padding:        0.1,    // border padding as fraction of scene size

  flags: {
    "starforged-companion": {
      sectorScene: true,
      sectorId:    sector.id,
    },
  },
});
```

### Activate (make it the current scene)

```js
await scene.activate();
// or from scene ID:
await game.scenes.get(sceneId).activate();
```

### Embedded documents on a scene

```js
// Notes (journal pins)
await scene.createEmbeddedDocuments("Note", [ noteData, ... ]);

// Drawings (lines, shapes)
await scene.createEmbeddedDocuments("Drawing", [ drawingData, ... ]);

// Tiles (images placed on the canvas)
await scene.createEmbeddedDocuments("Tile", [ tileData, ... ]);
```

### Find a scene

```js
game.scenes.getName("Devil's Maw")
game.scenes.get(sceneId)
game.scenes.active   // currently active scene
```

### Notes from Foundry docs

- `width` and `height` are auto-detected from the background image when set
  via the UI, but must be set explicitly via the API
- `grid.size` defaults to 100 — changing it after placing notes will shift them
- Set `tokenVision: false` and `fogExploration: false` for maps where exploration
  tracking is not needed (sector maps, world maps)

---

## NoteDocument (Journal Pins)

**Official:** https://foundryvtt.com/api/v13/classes/foundry.documents.NoteDocument.html

Journal Notes are pins placed on a scene canvas that link to a JournalEntry.

### Create notes on a scene

```js
await scene.createEmbeddedDocuments("Note", [
  {
    entryId:    journalEntry.id,   // links to the JournalEntry
    pageId:     page?.id ?? null,  // optional: link to a specific page within the entry
    x:          500,               // canvas pixel x position
    y:          300,               // canvas pixel y position

    // Icon — v13: moved to texture object
    texture: {
      src:  "icons/svg/circle.svg",   // path to icon image
      tint: "#ffffff",                // CSS color or null for no tint
    },
    iconSize:   40,                   // icon size in pixels (default 40)

    // Label text shown below/above the pin
    text:       "Bleakhold Station",
    fontSize:   18,
    fontFamily: "Signika",
    textColor:  "#ffffff",
    textAnchor: CONST.TEXT_ANCHOR_POINTS.BOTTOM,  // or integer 1 (BOTTOM)

    // Visibility
    global:     true,   // visible to all players regardless of fog (true for sector maps)

    flags: {
      "starforged-companion": {
        settlementId: settlement.id,
        type:         "orbital",
      },
    },
  },
]);
```

### `CONST.TEXT_ANCHOR_POINTS` values

```js
CONST.TEXT_ANCHOR_POINTS = {
  CENTER: 0,
  BOTTOM: 1,
  TOP:    2,
  LEFT:   3,
  RIGHT:  4,
}
// Use integer 1 for BOTTOM to be safe if CONST is unavailable
```

### Notes

- `entryId` must be the ID of a JournalEntry that exists in `game.journal`
- If `entryId` is null, the note renders as an unlinked pin (still shows icon and label)
- `global: true` makes the note visible even in unexplored fog — use for sector maps
- `x` and `y` are canvas pixel coordinates, not grid coordinates:
  `gridX * gridSize` = canvas pixel position

---

## DrawingDocument (Canvas Drawings)

**Official:** https://foundryvtt.com/api/v13/classes/foundry.documents.DrawingDocument.html  
**Article:** https://foundryvtt.com/article/drawings/

Drawings are shapes placed on a scene canvas. For sector passage lines, use
polygon type with two points.

### Create drawings on a scene

```js
await scene.createEmbeddedDocuments("Drawing", [
  {
    // Position — top-left corner of the drawing's bounding box
    x: 200,
    y: 150,

    // Shape — determines the visual form
    shape: {
      type:   "p",                  // "r" rectangle, "e" ellipse, "p" polygon, "f" freehand, "t" text
      width:  0,                    // bounding box width (0 for polygon — computed from points)
      height: 0,                    // bounding box height (0 for polygon)
      points: [0, 0, 300, 200],    // polygon/freehand: flat [x1,y1, x2,y2, ...] relative to x,y
      // For a line from (x,y) to (x+300, y+200): points: [0, 0, 300, 200]
    },

    // Stroke (line)
    strokeWidth: 3,
    strokeColor: "#88aacc",
    strokeAlpha: 0.7,

    // Fill
    fillType:  0,         // 0 = none, 1 = solid, 2 = pattern
    fillColor: "#000000",
    fillAlpha: 0,

    // Visibility
    hidden: false,

    flags: {
      "starforged-companion": {
        passage: true,
        fromId:  settlement1.id,
        toId:    settlement2.id,
      },
    },
  },
]);
```

### Shape type values

```js
// shape.type values (confirmed for v13):
"r"  // rectangle
"e"  // ellipse
"p"  // polygon (use for lines — supply flat points array)
"f"  // freehand
"t"  // text
```

### Drawing a line between two points

```js
// Line from canvas position (x1,y1) to (x2,y2):
{
  x: x1,           // drawing origin
  y: y1,
  shape: {
    type:   "p",
    points: [0, 0, x2 - x1, y2 - y1],   // relative offsets from origin
  },
  strokeWidth: 3,
  strokeColor: "#88aacc",
  strokeAlpha: 0.8,
  fillType:    0,   // no fill
}
```

### Notes

- `points` are relative to the drawing's `x, y` position, not absolute canvas coords
- Polygon drawings auto-close if the first and last points are the same; for a line,
  leave them different
- `fillType: 0` (no fill) is important for line drawings — otherwise a filled polygon
  is drawn between the points
- `hidden: false` makes the drawing visible to all players
- **v13 quirk — shape.width/shape.height must be non-zero for polygons.** Despite
  the field comments above suggesting `width: 0, height: 0` is acceptable for
  polygon shapes "computed from points," v13's `BaseDrawing` joint visibility
  validation rejects drawings whose bounding box is zero-by-zero with the error
  `"Drawings must have visible text, a visible fill, or a visible line."` —
  even when `strokeWidth` and `strokeAlpha` are both > 0. Always set
  `shape.width = Math.abs(dx)` and `shape.height = Math.abs(dy)` (with a
  `Math.max(..., 1)` guard for degenerate same-point segments). See
  `src/sectors/sceneBuilder.js` `makePassageLine` for the working pattern.

---

## foundry-ironsworn system asset directories

Confirmed static asset paths available from any module via server root. These
files are part of the installed foundry-ironsworn system and do not require
uploading — reference them directly in `texture.src`.

### Planet globe tokens

**Base path:** `systems/foundry-ironsworn/assets/planets/`  
**Pattern:** `Starforged-Planet-Token-{Type}-01.webp`  
**Do NOT apply `texture.tint`** — tokens are pre-coloured globe images.

| Oracle result (`planet.type`) | Token filename |
|-------------------------------|----------------|
| `"Desert World"` | `Starforged-Planet-Token-Desert-01.webp` |
| `"Furnace World"` | `Starforged-Planet-Token-Furnace-01.webp` |
| `"Grave World"` | `Starforged-Planet-Token-Grave-01.webp` |
| `"Ice World"` | `Starforged-Planet-Token-Ice-01.webp` |
| `"Jovian World"` | `Starforged-Planet-Token-Jovian-01.webp` |
| `"Jungle World"` | `Starforged-Planet-Token-Jungle-01.webp` |
| `"Ocean World"` | `Starforged-Planet-Token-Ocean-01.webp` |
| `"Rocky World"` | `Starforged-Planet-Token-Rocky-01.webp` |
| `"Shattered World"` | `Starforged-Planet-Token-Shattered-01.webp` |
| `"Vital World"` | `Starforged-Planet-Token-Vital-01.webp` |
| `"Tainted World"` | no token — falls back to `icons/svg/circle.svg` |

### Stellar object tokens

**Base path:** `systems/foundry-ironsworn/assets/stellar-objects/`  
**Pattern:** `Starforged-Stellar-Token-{Name}-01.webp`  
**Do NOT apply `texture.tint`** — tokens are pre-coloured.

| Oracle result (full string from `STELLAR_OBJECT` table) | Token filename |
|---------------------------------------------------------|----------------|
| `"Smoldering red star"` | `Starforged-Stellar-Token-Red-Star-01.webp` |
| `"Glowing orange star"` | `Starforged-Stellar-Token-Orange-Star-01.webp` |
| `"Burning yellow star"` | `Starforged-Stellar-Token-Yellow-Star-01.webp` |
| `"Blazing blue star"` | `Starforged-Stellar-Token-Blue-Star-01.webp` |
| `"Young star incubating in a molecular cloud"` | `Starforged-Stellar-Token-Star-In-Incubating-Cloud-01.webp` |
| `"White dwarf shining with spectral light"` | `Starforged-Stellar-Token-White-Dwarf-01.webp` |
| `"Corrupted star radiating with unnatural light"` | `Starforged-Stellar-Token-Corrupted-Star-01.webp` |
| `"Neutron star surrounded by intense magnetic fields"` | `Starforged-Stellar-Token-Neutron-Star-01.webp` |
| `"Two stars in close orbit connected by fiery tendrils of energy"` | `Starforged-Stellar-Token-Binary-Star-01.webp` |
| `"Black hole allows nothing to escape—not even light"` | `Starforged-Stellar-Token-Black-Hole-01.webp` |
| `"Hypergiant star generating turbulent solar winds"` | `Starforged-Stellar-Token-Hypergiant-01.webp` |
| `"Unstable star showing signs of impending supernova"` | `Starforged-Stellar-Token-Unstable-Star-01.webp` |
| `"Artificial star constructed by a long-dead civilization"` | no token — falls back to `icons/svg/sun.svg` |

```js
// Usage example — planet note icon (no tint)
texture: { src: "systems/foundry-ironsworn/assets/planets/Starforged-Planet-Token-Jovian-01.webp" }

// Usage example — stellar object note icon (no tint)
texture: { src: "systems/foundry-ironsworn/assets/stellar-objects/Starforged-Stellar-Token-Black-Hole-01.webp" }
```

---

## FilePicker.upload

**Official:** https://foundryvtt.com/api/classes/foundry.applications.apps.FilePicker.html  
**Confirmed signature (stable across v9–v13):**

```js
FilePicker.upload(
  source,    // string: "data" | "public" | "s3"
  path,      // string: directory path to upload into
  file,      // File object
  body,      // object: additional request body (optional, usually {})
  options    // object: { notify: boolean } (optional)
): Promise<{ path: string }>
```

### Upload a base64 image to Foundry data

```js
async function uploadBase64Image(b64Data, filename, targetDir) {
  // Convert base64 string to Blob
  const byteString = atob(b64Data);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "image/png" });
  const file  = new File([blob], filename, { type: "image/png" });

  // Ensure target directory exists
  try {
    await FilePicker.createDirectory("data", targetDir, {});
  } catch {
    // Directory already exists — not an error
  }

  // Upload and return the resulting file path
  const result = await FilePicker.upload("data", targetDir, file, {});
  return result.path;  // e.g. "modules/starforged-companion/art/sector-abc123.png"
}

// Usage:
const path = await uploadBase64Image(
  b64Data,
  `sector-${sectorId}.png`,
  "modules/starforged-companion/art"
);
```

### Notes

- `source: "data"` uploads to the Foundry user data folder — correct for module assets
- `source: "public"` uploads to the public folder — not needed for module assets
- `FilePicker.createDirectory()` throws if the directory already exists — always wrap in try/catch
- The returned `result.path` is what goes into `scene.background.src` or `actor.img`
- **Requires GM permissions** — only call from contexts where `game.user.isGM` is true
- The upload is a server-side operation; the Electron renderer makes an HTTP POST to
  the local Foundry server (not an external API — no proxy needed)
- On The Forge, `source: "data"` still works but paths may differ — test on Forge
  if Forge support is needed

### Error handling

```js
try {
  const result = await FilePicker.upload("data", dir, file, {}, { notify: false });
  return result.path;
} catch (err) {
  // Common causes:
  // - Insufficient permissions (player attempting upload)
  // - Invalid file type
  // - Storage quota exceeded (on hosted services)
  console.error("Upload failed:", err);
  return null;
}
```

---

## SceneControls and toolbar buttons

**Confirmed behaviour from live testing (v0.1.33–v0.1.34):**

### Two-hook pattern — required for working toolbar buttons in v13

`getSceneControlButtons` and `renderSceneControls` must be used together.
Using only `getSceneControlButtons` produces buttons that appear but do nothing.

```js
// HOOK 1 — Register tool metadata (makes button appear in toolbar)
// controls.tokens.tools is EMPTY when this hook fires — Foundry fills it after.
// onChange is registered here but is NEVER called for button:true tools.
Hooks.on("getSceneControlButtons", (controls) => {
  // v13: controls is an Object keyed by group name
  // Access tokens group directly — never use Object.values() or find()
  controls.tokens.tools ??= {};
  controls.tokens.tools.myTool = {
    name:     "myTool",
    title:    "My Tool Title",
    icon:     "fas fa-wrench",
    button:   true,
    visible:  game.user.isGM,   // optional visibility
    order:    Object.keys(controls.tokens.tools).length,
    onChange: () => {},   // must exist but is never called for button tools
  };
});

// HOOK 2 — Attach click handlers after render (makes button work)
// html is HTMLElement in v13
Hooks.on("renderSceneControls", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  // Use replaceWith(cloneNode) to prevent duplicate listeners on re-renders
  const btn = root.querySelector('[data-tool="myTool"]');
  if (!btn) return;
  btn.replaceWith(btn.cloneNode(true));

  const freshBtn = root.querySelector('[data-tool="myTool"]');
  freshBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    myHandler();
  });
});
```

### Why onChange doesn't work for button tools

Foundry's SceneControls ApplicationV2 calls `onChange` only for **toggle tools**
(tools that track an active/inactive state). Button tools (`button: true`) are
rendered with `data-action="tool"` but Foundry's action handler does not
call `onChange` for them — confirmed by monkey-patching `onChange` and
observing no call on click.

### Confirmed tool HTML structure (v13)

```html
<!-- button: true tool — rendered by Foundry -->
<button type="button"
  class="control ui-control tool icon button fas fa-tasks"
  data-action="tool"
  data-tool="progressTracks"
  aria-label="Progress Tracks"
  aria-pressed="false">
</button>

<!-- toggle tool with onChange (e.g. unconstrainedMovement) -->
<button type="button"
  class="control ui-control tool icon toggle fa-solid fa-ghost"
  data-action="tool"
  data-tool="unconstrainedMovement"
  aria-pressed="false">
</button>
```

### `Hooks._hooks` is undefined in v13

Cannot introspect registered hooks via `Hooks._hooks` — the property does
not exist in v13. Use this instead for debugging:
```js
CONFIG.debug.hooks = true;  // logs every hook event to console
```

### `SceneControls.initialize()` is deprecated in v13

```js
// WRONG (deprecated, warning logged)
canvas.controls.initialize();

// CORRECT
ui.controls.render(true);
// or with options:
ui.controls.render({ controls: "tokens", tool: "progressTracks" });
```

---

## Dynamic imports in browser ES modules

**CRITICAL GOTCHA — confirmed by live testing (v0.1.23 debugging)**

In browser ES modules, `import()` paths resolve relative to the **document root**,
NOT relative to the importing file's location. This is different from Node.js.

```js
// File location: /modules/starforged-companion/src/integration/quench.js

// WRONG — resolves to http://localhost:30000/context/safety.js (404)
await import("./context/safety.js")

// WRONG — resolves to http://localhost:30000/src/context/safety.js (404)  
await import("../src/context/safety.js")

// CORRECT — absolute path from the server root
await import("/modules/starforged-companion/src/context/safety.js")
```

**The pattern to use in any file that needs dynamic imports:**

```js
// Define once at the top of the file
const MODULE_PATH = "/modules/starforged-companion/src";

// Use throughout
const { myExport } = await import(`${MODULE_PATH}/context/safety.js`);
const { otherExport } = await import(`${MODULE_PATH}/moves/resolver.js`);
```

This applies to all files loaded as Foundry ES modules, including
`src/integration/quench.js`. Static imports (`import ... from "..."` at
the top of the file) resolve correctly relative to the file — only
dynamic `import()` calls have this behaviour.

---

## Compendium packs in v13

**Foundry v13 requires compendium packs to be LevelDB directories**, not JSON files.

A flat JSON file at `packs/help.json` declared in `module.json` will cause:
```
IO error: /path/to/packs/help.json: Not a directory
```

**The correct format** is a directory (created by Foundry's compendium tools or
the `@foundryvtt/foundryvtt-cli` package) containing LevelDB files.

**For this module**, the help compendium has been removed from `module.json` to
avoid this error. Help content is delivered via:
- The `docs/` folder (developer reference)
- A programmatically-created JournalEntry on first world load (planned)

If a compendium is needed in future, use the Foundry CLI to create it:
```bash
npx @foundryvtt/foundryvtt-cli package workerExtract --type Module   --id starforged-companion --inputDirectory packs/help/
```

---

## CSS Layers (v13)

Version 13 fully implemented CSS Layers. All system and module defined styles are automatically opted in. This means module CSS may need to use `@layer` to properly override Foundry core styles.

```css
/* In starforged-companion.css — wrap module styles in a layer */
@layer starforged-companion {
  .sf-move-result { /* ... */ }
  .sf-narration-card { /* ... */ }
}
```

If existing styles are being overridden by Foundry core unexpectedly after a v13
update, wrapping them in a named `@layer` gives explicit precedence control.
