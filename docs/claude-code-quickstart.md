# Claude Code — Quick Start Guide for This Project

How to use Claude Code effectively with this repository.

---

## Setup

```bash
# Install Claude Code globally (requires Node.js)
npm install -g @anthropic-ai/claude-code

# Clone the repo if you haven't already
git clone https://github.com/jamesrmedford-alt/starforged-companion.git
cd starforged-companion

# Install dependencies
npm install

# Start Claude Code from inside the repo folder
claude
```

Claude Code reads and writes files directly in the current directory. It can
run `npm test`, `git diff`, `git commit`, and any other shell commands.

---

## Before each Claude Code session

```bash
# Terminal 1 — Start the API proxy (for testing in Foundry)
npm run proxy
# or: ./proxy/start.sh

# Terminal 2 — Start Claude Code
cd starforged-companion
claude
```

---

## Recommended opening prompts

**For the narrator implementation:**
```
Read docs/narrator-scope.md and docs/decisions.md. Then implement the narrator 
feature starting with step 1 (delete loremaster.js) through step 5 (update index.js). 
Run npm test after each file change to confirm nothing regresses.
```

**For a specific bug fix:**
```
Read docs/known-issues.md. Fix DIALOG-001 (Dialog.confirm deprecated in v13).
Run npm test after the fix.
```

**For general context:**
```
Read docs/decisions.md, docs/file-structure.md, and docs/known-issues.md to 
understand the project state. Then [describe the task].
```

---

## Key files to read first

Claude Code should always read these before making substantive changes:

| File | Purpose |
|------|---------|
| `docs/decisions.md` | Why things are the way they are |
| `docs/file-structure.md` | What each file exports and does |
| `docs/known-issues.md` | Open bugs and their status |
| `docs/narrator-scope.md` | Narrator feature specification |

---

## Testing workflow

```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Run a single test file
npx vitest run tests/unit/mischief.test.js

# Lint
npm run lint
```

Tests must pass before committing. CI will fail if they don't.

---

## Release workflow

```bash
# After changes are committed and tests pass:
git tag v0.1.X
git push origin main --tags

# CI automatically builds the release zip with updated module.json
# Foundry can then update via the manifest URL:
# https://github.com/jamesrmedford-alt/starforged-companion/releases/latest/download/module.json
```

---

## Project context summary

**What this is:** A Foundry VTT module for Ironsworn: Starforged (solo and multiplayer).
Intercepts player chat narration, identifies the appropriate game move via
Claude API, rolls dice, resolves outcomes, and triggers narrative continuation.

**Tech stack:** ES modules, Vitest (unit tests), Quench (integration tests),
Foundry v13 ApplicationV2 UI, local Node.js proxy for CORS.

**Current state:** Pipeline works end-to-end (narration → move card posted).
Narrator not yet implemented (was Loremaster, being replaced). Several UI
panels written but untested in live Foundry.

**Campaign example:** The example session (`docs/session-01.md`) shows the
module working with an established set of World Truths and an opening scene.
This is illustrative — each new campaign rolls or chooses its own World Truths
via the module's truth generator. The example is not hardcoded into the module.

---

## Architecture in one paragraph

Player types narration → `createChatMessage` hook intercepts → `interpretMove()`
calls Claude Haiku via `api-proxy.js` (local proxy on desktop, Forge proxy on
The Forge) → `MoveConfirmDialog` shown → player accepts → `resolveMove()` rolls
dice → `assembleContextPacket()` builds 7-section context (safety first, always) →
`postMoveResult()` posts move card to chat → `narrateResolution()` calls Claude
Sonnet for narrative continuation → narration card posted → `persistResolution()`
(GM only) saves meter changes to character and campaign state.
