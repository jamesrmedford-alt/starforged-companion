# Starforged Companion — API Key Privacy Scope
## Restrict API key visibility to GM only

**Priority:** High — security/privacy fix  
**Estimated Claude Code session:** ~30 minutes  
**Scope:** Small — two files, no new infrastructure

---

## 1. Problem

`claudeApiKey` and `artApiKey` are registered with `config: true`, which
causes them to appear in Foundry's standard **Configure Settings** dialog.
This dialog is accessible to all users including players, meaning players
can see (and potentially copy) the GM's API keys.

Both settings are `scope: "client"` so they are stored in each user's own
browser localStorage — the GM's key is never technically exposed to players
at a storage level. The problem is purely the visible input field in the UI.

---

## 2. Fix

### 2.1 `src/index.js` — set `config: false` on both key settings

Remove both keys from the standard Configure Settings dialog by changing
`config: true` to `config: false`:

```js
// claudeApiKey registration — change:
config: true,
// to:
config: false,

// artApiKey registration — change:
config: true,
// to:
config: false,
```

The `claudeProxyUrl` setting should remain `config: true` — it is not
sensitive and is useful for players to see (they may need to know the
proxy is configured).

### 2.2 `src/ui/settingsPanel.js` — add GM-only API key fields to About tab

The About tab is already only accessible to the GM (the toolbar button
has `visible: game.user.isGM`). Add API key input fields at the bottom
of the About tab pane.

**In `_prepareContext()`** — add current key values (masked) to context:

```js
// Only pass key presence, not the actual value — the input will load
// the real value from game.settings when rendered
apiKeys: game.user.isGM ? {
  claudeKeySet: !!game.settings.get(MODULE_ID, 'claudeApiKey'),
  artKeySet:    !!game.settings.get(MODULE_ID, 'artApiKey'),
} : null,
```

**In `#renderAboutPane(context)`** — add at the bottom, only when GM:

```html
<!-- Only rendered for GM -->
${context.isGM ? `
  <div class="about-api-keys">
    <h3 class="about-section-title">API Keys</h3>
    <p class="about-api-note">
      These keys are stored in your browser only and are never sent to
      Foundry's server or visible to other players.
    </p>
    <div class="api-key-field">
      <label class="api-key-label" for="sf-claude-key">
        Claude API Key
        ${context.apiKeys.claudeKeySet
          ? '<span class="api-key-status api-key-set">● Set</span>'
          : '<span class="api-key-status api-key-unset">○ Not set</span>'}
      </label>
      <input class="settings-input api-key-input" type="password"
             id="sf-claude-key" name="claudeApiKey"
             placeholder="sk-ant-..."
             autocomplete="off" spellcheck="false">
    </div>
    <div class="api-key-field">
      <label class="api-key-label" for="sf-art-key">
        Art Generation API Key (OpenAI)
        ${context.apiKeys.artKeySet
          ? '<span class="api-key-status api-key-set">● Set</span>'
          : '<span class="api-key-status api-key-unset">○ Not set</span>'}
      </label>
      <input class="settings-input api-key-input" type="password"
             id="sf-art-key" name="artApiKey"
             placeholder="sk-..."
             autocomplete="off" spellcheck="false">
    </div>
    <div class="api-key-actions">
      <button class="settings-btn btn-save-keys" data-action="saveApiKeys">
        Save Keys
      </button>
      <span class="api-key-save-note">
        Leave a field blank to keep the existing value.
      </span>
    </div>
  </div>
` : ''}
```

**Add `saveApiKeys` action handler:**

```js
static async #onSaveApiKeys(event, target) {
  if (!game.user.isGM) return;

  const panel      = this.element;
  const claudeKey  = panel.querySelector('[name="claudeApiKey"]')?.value?.trim();
  const artKey     = panel.querySelector('[name="artApiKey"]')?.value?.trim();

  // Only write non-empty values — blank means "keep existing"
  if (claudeKey) {
    await game.settings.set(MODULE_ID, 'claudeApiKey', claudeKey);
  }
  if (artKey) {
    await game.settings.set(MODULE_ID, 'artApiKey', artKey);
  }

  if (claudeKey || artKey) {
    ui.notifications.info('Starforged Companion: API keys saved.');
  }

  // Re-render to update the Set/Not set badges
  this.render();
}
```

Register in `DEFAULT_OPTIONS.actions`:
```js
saveApiKeys: SettingsPanelApp.#onSaveApiKeys,
```

### 2.3 `styles/starforged-companion.css` — add API key field styles

```css
.about-api-keys {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border-light);
}

.about-api-note {
  font-size: 0.8em;
  color: var(--color-text-secondary);
  margin-bottom: 0.75rem;
}

.api-key-field {
  margin-bottom: 0.75rem;
}

.api-key-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  font-size: 0.85em;
}

.api-key-input {
  font-family: monospace;
  font-size: 0.85em;
  letter-spacing: 0.05em;
}

.api-key-status {
  font-size: 0.8em;
  font-weight: normal;
}

.api-key-set    { color: var(--color-level-success, #4a7c4e); }
.api-key-unset  { color: var(--color-level-warning, #9e6a1a); }

.api-key-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.api-key-save-note {
  font-size: 0.8em;
  color: var(--color-text-secondary);
}
```

---

## 3. What does NOT change

- Both settings remain `scope: "client"` — keys are still stored locally
  in the GM's browser, never on the server
- The proxy reads `claudeApiKey` via `game.settings.get()` from within
  `interpreter.js` and `narrator.js` — this continues to work unchanged
- The `claudeProxyUrl` setting remains `config: true` and visible to all

---

## 4. Testing

### Manual verification
1. Log in as a player — confirm API key fields no longer appear in
   Configure Settings
2. Log in as GM — confirm API key fields appear in Companion Settings
   panel → About tab
3. Enter a key as GM, save, reload — confirm the Set badge appears and
   the key is retained
4. Enter a blank value, save — confirm the existing key is not overwritten
5. Confirm proxy health check still works (key is still readable by the
   module code)

### Unit tests
No new unit tests required — this is a UI-only change. The settings
registration change (`config: false`) has no logic to test.

---

## 5. Implementation order

1. Set `config: false` on `claudeApiKey` and `artApiKey` in `src/index.js`
2. Add `apiKeys` to `_prepareContext()` in `settingsPanel.js`
3. Add API key fields HTML to `#renderAboutPane()` in `settingsPanel.js`
4. Add `#onSaveApiKeys()` action handler to `settingsPanel.js`
5. Register `saveApiKeys` in `DEFAULT_OPTIONS.actions`
6. Add CSS to `styles/starforged-companion.css`
7. Update `packs/help.json` Settings Reference page — remove API keys
   from the Configure Settings table, add a note that they are in
   Companion Settings → About (GM only)
8. Run `npm test` + `npm run lint` — confirm clean
9. Manual verification in live Foundry as both GM and player accounts
