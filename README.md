# Starforged Companion

A companion module for **Ironsworn: Starforged** on Foundry VTT. Intercepts
player narration, identifies the appropriate move via Claude AI, rolls dice,
resolves outcomes, narrates consequences, and maintains campaign state across
sessions.

Supports solo and multiplayer campaigns.

---

## What it does

**Move interpretation** — type narration naturally in chat. The module identifies
the right move, rolls dice, and posts a result card. A confirmation dialog lets
you accept or request a re-interpretation.

**AI narration** — after every accepted move, Claude narrates the mechanical
consequence as atmospheric prose, grounded in your campaign's world truths,
active connections, and safety configuration.

**Scene interrogation** — type `@scene [question]` to ask the narrator for
atmospheric detail without triggering a move.

**Safety system** — Lines, Veils, Private Lines, and X-Card (`!x` in chat).
Safety configuration is always the first thing injected into every narration
context — it is never overridden by any other setting.

**Progress tracks** — vows, expeditions, combats, connections, and legacy
tracks. Stored in a dedicated journal, displayed in a sidebar panel.

**Entity management** — Connections, Ships, Settlements, Factions, and Planets
with AI-generated portraits (DALL-E 3). One portrait per entity, one permitted
regeneration, then permanently locked.

**Sector Creator** — guided 11-step sector generation following the Starforged
rulebook (pp. 114–127). Generates settlements, planets, a local connection, and
a sector trouble from oracle tables. Creates a Foundry scene with settlement
markers, passage lines, and a DALL-E 3 background image. Open with `!sector new`
or the toolbar button.

**World Truths** — full oracle tables for all 14 Starforged truth categories
with sub-table resolution.

**Oracles** — all published Starforged oracle tables.

**Character management** — reads and writes directly to the foundry-ironsworn
Actor (health, spirit, supply, momentum, debilities, XP, legacies).

**Previously On** — `!recap session` posts a session summary from chat history
(no API call). `!recap campaign` posts a Claude-generated campaign arc summary,
cached for the session.

---

## Requirements

| Requirement | Notes |
|-------------|-------|
| Foundry VTT v12+ | Verified on v13 |
| Node.js 18+ | Required to run the API proxy on desktop |
| Anthropic API key | For move interpretation and narration — get one at console.anthropic.com |
| OpenAI API key | Optional — for AI portrait generation (DALL-E 3) and sector background art |
| foundry-ironsworn system | Strongly recommended — character sheet integration requires it |

---

## Installation

In Foundry VTT: **Add-on Modules → Install Module** → paste this URL:

```
https://github.com/jamesrmedford-alt/starforged-companion/releases/latest/download/module.json
```

---

## Before every session (desktop)

The Foundry Electron app enforces browser CORS, blocking direct API calls.
A local proxy is required. Start it before launching Foundry:

**Mac / Linux:**
```bash
cd /path/to/starforged-companion
./proxy/start.sh
```

**Windows:**
```
proxy\start.bat
```

**Or manually:**
```bash
npm run proxy
```

Leave this running for the session. When you see:
```
starforged-companion | Proxy reachable: Local proxy (http://127.0.0.1:3001)
```
in the Foundry console, you're ready.

**On The Forge:** no proxy needed. The Forge's server-side proxy handles
external API calls automatically.

---

## First-time setup

1. Click the **🛡 Companion Settings** button in the Token Controls toolbar (GM only)
2. Open the **About** tab
3. Enter your **Claude API Key** (from console.anthropic.com) and click **Save Keys**
4. Enter your **Art Generation API Key** (OpenAI, optional — for portraits and sector art) and click **Save Keys**
5. To change the **Claude Proxy URL**: open **Configure Settings → Starforged Companion** — leave as `http://127.0.0.1:3001` unless using a custom port

API keys are stored in your browser only and are never visible in Configure Settings.

---

## Chat commands

| Command | Effect |
|---------|--------|
| *type narration normally* | Intercepted and routed through the move pipeline |
| `\message` | Bypass the interpreter — posts as plain chat |
| `@scene question` | Ask the narrator for scene detail without triggering a move |
| `!x` | X-Card — immediately suppress the current scene |
| `!recap` | Post a campaign recap (GM only) |
| `!recap session` | Post a recap of the current session (no API call, GM only) |
| `!sector new` | Open the Sector Creator wizard (GM only) |
| `!sector list` | List all created sectors |
| `!sector [name]` | Switch the active sector |
| `!journal faction "Name" attitude — summary` | Record faction intelligence |
| `!journal location "Name" type — description` | Record a location |
| `!journal lore "Title" confirmed — text` | Record a lore discovery |
| `!journal threat "Name" severity — summary` | Record an active threat |

> **Note:** World Journal commands (`!journal`) are available from v0.2.0 (planned).

---

## In-game help

After installing, import the **Starforged Companion — Help & Reference**
compendium into your world. It contains the full command reference, settings
documentation, troubleshooting guide, and changelog.

---

## Cost and API usage

Estimated per 3-hour session (~20 moves) with prompt caching:

| Configuration | Per session | Per year (50 sessions) |
|---------------|-------------|------------------------|
| Haiku interpretation + Haiku narration | ~$0.02 | ~$1.15 |
| Haiku interpretation + Sonnet narration | ~$0.08 | ~$4.00 |
| Portrait generation (DALL-E 3, 1024×1024) | ~$0.04 each | Infrequent |
| Sector background art (DALL-E 3, 1792×1024) | ~$0.08 per sector | ~3–5 sectors/campaign |

Each narration call sends approximately **1,200 tokens** of context to Claude
(safety configuration, world truths, entity cards, progress tracks, character
state). At current Sonnet pricing this is roughly $0.004 per call in input
tokens alone.

Prompt caching significantly reduces interpretation and narration costs within
a session. Both Haiku and Sonnet narration are practical for regular play.

The context packet budget is defined in `src/schemas.js`
(`ContextPacketSchema.tokenBudget`).

---

## Safety

The safety system is always active. Safety configuration is injected first into
every Claude context packet and is never overridden by any other setting.

- **Lines** — hard content limits, set by GM, never crossed
- **Veils** — soft limits, set by GM, handled with care or faded to black
- **Private Lines** — personal limits visible only to you and the GM
- **X-Card** — type `!x` in chat at any time to immediately suppress the scene

---

## License and attribution

This module is licensed under **CC BY-NC-SA 4.0**. See [LICENSE.md](LICENSE.md).

Ironsworn: Starforged is created by Shawn Tomkin and licensed under
Creative Commons Attribution-NonCommercial-ShareAlike 4.0.

---

## For developers

- [Module architecture](docs/architecture.html) — interactive system diagram
- [Scope index](docs/scope-index.md) — all features, status, and dependencies
- [Design decisions](docs/decisions.md) — why things are the way they are
- [Known issues](docs/known-issues.md) — open bugs and workarounds
- [CLAUDE.md](CLAUDE.md) — Claude Code working instructions
