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

**Safety system** — Lines, Veils, Private Lines, and X-Card (`/x` in chat).
Safety configuration is always the first thing injected into every narration
context — it is never overridden by any other setting.

**Progress tracks** — vows, expeditions, combats, connections, and legacy
tracks. Stored in a dedicated journal, displayed in a sidebar panel.

**Entity management** — Connections, Ships, Settlements, Factions, and Planets
with AI-generated portraits (DALL-E 3). One portrait per entity, one permitted
regeneration, then permanently locked.

**World Truths** — full oracle tables for all 14 Starforged truth categories
with sub-table resolution.

**Oracles** — all published Starforged oracle tables.

**Character management** — reads and writes directly to the foundry-ironsworn
Actor (health, spirit, supply, momentum, debilities, XP, legacies).

---

## Requirements

| Requirement | Notes |
|-------------|-------|
| Foundry VTT v12+ | Verified on v13 |
| Node.js 18+ | Required to run the API proxy on desktop |
| Anthropic API key | For move interpretation and narration. Get one at console.anthropic.com |
| OpenAI API key | Optional. For AI portrait generation (DALL-E 3) |
| foundry-ironsworn system | Strongly recommended. Character sheet integration requires it |

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

Open **Configure Settings → Starforged Companion** and set:

1. **Claude API Key** — your Anthropic API key (stored in your browser only)
2. **Art Generation API Key** — your OpenAI API key (optional, for portraits)
3. **Claude Proxy URL** — leave as `http://127.0.0.1:3001` unless using a
   custom port

---

## Chat commands

| Command | Effect |
|---------|--------|
| *type narration normally* | Intercepted and routed through the move pipeline |
| `\message` | Bypass the interpreter — posts as plain chat |
| `@scene question` | Ask the narrator for scene detail without a move |
| `/x` | X-Card — immediately suppress the current scene |
| `/recap` | Post a campaign recap (GM only) |
| `/recap session` | Post a recap of the current session (GM only) |
| `/journal faction "Name" attitude — summary` | Record faction intelligence (GM only) |
| `/journal location "Name" type — description` | Record a location (GM only) |
| `/journal lore "Title" confirmed — text` | Record a lore discovery (GM only) |
| `/journal threat "Name" severity — summary` | Record an active threat (GM only) |

---

## In-game help

After installing, import the **Starforged Companion — Help & Reference**
compendium into your world. It contains full command reference, settings
documentation, troubleshooting, and changelog.

---

## Cost

API calls use Anthropic and OpenAI. Estimated cost per 3-hour session (~20 moves):

| Configuration | Per session | Per year (50 sessions) |
|---------------|-------------|----------------------|
| Haiku interpretation + Haiku narration | ~$0.02 | ~$1.15 |
| Haiku interpretation + Sonnet narration | ~$0.06 | ~$3.05 |
| Portrait generation (DALL-E 3) | ~$0.04 each | Infrequent |

Prompt caching significantly reduces interpretation and narration costs within
a session. Both Haiku and Sonnet narration are practical for regular play.

---

## Safety

The safety system is always active. Safety configuration is injected first into
every Claude context packet and is described as a hard ceiling on all other
creative direction.

- **Lines** — hard content limits, set by GM, never crossed
- **Veils** — soft limits, set by GM, handled with care or faded to black
- **Private Lines** — personal limits visible only to you and the GM
- **X-Card** — type `/x` in chat at any time to immediately suppress the scene

---

## License and attribution

This module is licensed under **CC BY-NC-SA 4.0**. See [LICENSE.md](LICENSE.md).

**Ironsworn: Starforged** is created by Shawn Tomkin and licensed under
CC BY-NC-SA 4.0. This module is an unofficial fan creation and is not affiliated
with or endorsed by Shawn Tomkin.

The **foundry-ironsworn** system is created by Ben Straub and contributors,
also licensed under CC BY-NC-SA 4.0.

This module is not affiliated with or endorsed by Anthropic or OpenAI.
