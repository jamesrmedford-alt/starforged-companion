# Foundry VTT API Reference — v13
## Compiled for Starforged Companion development

**Source:** https://foundryvtt.wiki/en/development/api (verified v13)  
**Official docs:** https://foundryvtt.com/api/v13/  
**Last updated:** April 2025  

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

// Scene controls toolbar
// IMPORTANT: in v13, `controls` is an Object keyed by group name, NOT an Array
// Always handle both: Array.isArray(controls) ? controls : Object.values(controls)
Hooks.on("getSceneControlButtons", (controls) => { });

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
