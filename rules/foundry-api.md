# External API reference — Foundry VTT

The Foundry VTT API documentation is the authoritative source for all Foundry
classes, hooks, methods, and properties. Before writing ANY code that uses
Foundry APIs, fetch the relevant documentation page first.

**Local reference:** `docs/foundry-reference/foundry-api-reference.md`

This file contains compiled API documentation for all Foundry classes used
in this module, sourced from the community wiki (verified v13). Claude Code's
network access does not include foundryvtt.com, so this local file is the
authoritative reference.

**Rule:** Before writing ANY code that calls a Foundry method, registers a hook,
creates a document, or uses any Foundry class — read the relevant section of
`docs/foundry-reference/foundry-api-reference.md` first. Do not rely on training data for Foundry
API details.

```bash
# Read the local API reference
cat docs/foundry-reference/foundry-api-reference.md

# Or search for a specific section
grep -A 30 "^## ChatMessage" docs/foundry-reference/foundry-api-reference.md
grep -A 30 "^## Hooks" docs/foundry-reference/foundry-api-reference.md
grep -A 50 "^## ApplicationV2" docs/foundry-reference/foundry-api-reference.md
```

If the required API is not covered in the local reference, note it in your
findings report so the file can be updated before you implement.

**Two-hook pattern for toolbar buttons — confirmed v13 requirement:**

```js
// Hook 1: getSceneControlButtons — register metadata ONLY
// Controls.tokens.tools is populated AFTER this hook fires.
// onChange is NEVER called for button:true tools in v13.
// This hook makes buttons appear — nothing more.
Hooks.on("getSceneControlButtons", (controls) => {
  controls.tokens.tools ??= {};
  controls.tokens.tools.myTool = {
    name:    "myTool",
    title:   "My Tool",
    icon:    "fas fa-wrench",
    button:  true,
    onChange: () => {},  // required to exist but never called for button tools
  };
});

// Hook 2: renderSceneControls — attach click handlers via DOM
// Fires after controls are fully rendered with real buttons in the DOM.
// Use replaceWith(cloneNode) to prevent duplicate listeners on re-renders.
Hooks.on("renderSceneControls", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  const btn = root.querySelector('[data-tool="myTool"]');
  if (!btn) return;

  // Clone to remove any previously attached listeners
  btn.replaceWith(btn.cloneNode(true));
  const freshBtn = root.querySelector('[data-tool="myTool"]');
  freshBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    myHandler();
  });
});
```

**Never** rely on `onChange` for `button: true` tools.
**Never** use `onClick` — not a valid v13 SceneControlTool property.
**Never** use `Array.isArray(controls)` — controls is always an Object in v13.
**Never** use `.push()` on `tools` — tools is an Object, not an Array.

**`Hooks._hooks` does not exist in v13:**
Cannot introspect registered hooks via `Hooks._hooks` — undefined in v13.
Use `CONFIG.debug.hooks = true` in the console to trace hook firing.

**Specific things confirmed to have changed in v13 — always verify:**

| API | v12 | v13 | Status in this codebase |
|-----|-----|-----|------------------------|
| `message.user` | valid | deprecated → use `message.author` | ✅ Fixed |
| `message.type = "other"` | valid | invalid — use no type or `"base"` | ✅ Fixed |
| `CONST.CHAT_MESSAGE_TYPES` | valid | restructured — use string literals | ✅ Fixed |
| `getSceneControlButtons` | Array | Object keyed by group name | ✅ Fixed |
| `Dialog.confirm()` | valid | deprecated → use `DialogV2.confirm()` | ⚠️ Not yet fixed |
| jQuery `$` / `.find()` | available | removed — use DOM API | ✅ Fixed |
| `Application` (v1) | valid | deprecated → `ApplicationV2` (removed v16) | ✅ Fixed in our code |

**Before implementing any new Foundry hook or API:**
1. Fetch the relevant docs page above
2. Confirm the method/hook/class exists in v13
3. Check the method signature — argument order and types change between versions
4. Check for deprecation notices — if deprecated, use the replacement
5. Note whether the API is available in both renderer and server contexts

**When the docs are insufficient:** the Foundry source is on GitHub at
https://github.com/foundryvtt/foundryvtt but the core codebase is not
public. Use the API docs + the error messages in the Foundry console as
your source of truth.
