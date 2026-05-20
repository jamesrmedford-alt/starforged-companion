# Starforged Companion

A companion module for **Ironsworn: Starforged** on Foundry VTT. Intercepts
player narration, identifies the appropriate move via Claude AI, rolls dice,
resolves outcomes, narrates consequences, and maintains campaign state across
sessions.

Supports solo and multiplayer campaigns. Works on Foundry desktop and on
The Forge — no local proxy required.

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
with AI-generated portraits via OpenRouter (FLUX.2 Pro by default). One
portrait per entity, one permitted regeneration, then permanently locked.

**Sector Creator** — guided 11-step sector generation following the Starforged
rulebook (pp. 114–127). Generates settlements, planets, a local connection, and
a sector trouble from oracle tables. Creates a Foundry scene with settlement
markers, passage lines, and a generated background image. Open with `!sector new`
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
| Anthropic API key | For move interpretation and narration — get one at console.anthropic.com |
| OpenRouter API key | Optional — for AI portrait generation and sector background art. Get one at openrouter.ai |
| foundry-ironsworn system | Strongly recommended — character sheet integration requires it |

There is **no local proxy** — all API calls go directly from the browser.
Claude requests use Anthropic's documented browser-CORS opt-in
(`anthropic-dangerous-direct-browser-access`), and image generation uses
OpenRouter, which supports browser CORS natively. The same code runs on
Foundry desktop and on The Forge with no setup difference.

---

## Installation

In Foundry VTT: **Add-on Modules → Install Module** → paste this URL:

```
https://github.com/jamesrmedford-alt/starforged-companion/releases/latest/download/module.json
```

---

## First-time setup

1. Click the **🛡 Companion Settings** button in the Token Controls toolbar (GM only)
2. Open the **About** tab
3. Enter your **Claude API Key** (from console.anthropic.com) and click **Save Keys**
4. (Optional, for art generation) Enter your **OpenRouter API Key** (from openrouter.ai) and click **Save Keys**

API keys are stored in your browser only (client-scope setting) and are never
visible in the standard Configure Settings UI. They are never transmitted to
Foundry's server.

The Anthropic key is sent only to `api.anthropic.com`. The OpenRouter key is
sent only to `openrouter.ai/api/v1/chat/completions`. There is no relay,
proxy, or third-party server in the path.

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

---

## In-game help

After installing, the **Starforged Companion — Help & Reference** journal is
created automatically in the GM's world. It contains the full command
reference, settings documentation, troubleshooting guide, and changelog.

---

## Cost and API usage

Estimated per 2-hour session with prompt caching, based on real session
telemetry (~60 chat inputs / hour observed in v1.2.7 play, of which roughly
40 % resolve as a move and 60 % stay as narration under default pacing
dials):

| Configuration | Per session | Per year (50 sessions) |
|---------------|-------------|------------------------|
| Haiku interpretation + Haiku narration | ~$0.20 | ~$10 |
| Haiku interpretation + Sonnet narration | ~$0.30 | ~$15 |
| Portrait generation (FLUX.2 Pro via OpenRouter) | a few cents each | Infrequent |
| Sector background art (FLUX.2 Pro via OpenRouter) | a few cents per sector | ~3–5 sectors/campaign |

Prompt caching brings the cached input rate to ~10 % of the cold rate, and
every long-lived prompt in the module (narrator system prompt, pacing
classifier system prompt, chronicle writer system prompt) is cached.

The image model is configurable via the `openRouterImageModel` setting —
swap to a cheaper FLUX variant (`flux.2-klein`, `flux.2-flex`) or a different
provider's image model on OpenRouter at any time.

### Per-input breakdown

Unlike the move pipeline (which only fires on a roll), several components in
v1.2.7 run on **every chat input** — that's the dominant cost driver, not move
count. Per-call figures with caching:

| Component | When it fires | Per call |
|---|---|---|
| Pacing classifier (Haiku) | every undecorated input | ~$0.0006 |
| Narrator (Haiku) | every input | ~$0.0008 |
| Narrator (Sonnet) | every input | ~$0.003 |
| Chronicle writer (Haiku) | every input (GM client only) | ~$0.0006 |
| Move interpreter (Haiku) | only on MOVE | ~$0.001 |
| Paced detection (Haiku) | only on non-MOVE | ~$0.001 |

A 2-hour session at the observed ~60-input rate burns roughly **170 K tokens**
in aggregate across all calls — pacing classifier ~22 K, narrator ~90 K,
paced detection ~29 K, chronicle writer ~17 K, move interpreter ~14 K.

### Context packet size

Each narration call sends approximately **1,200 tokens** of context to the
Claude API, regardless of move type. This covers safety configuration, narrator
permissions, world truths, entity cards for entities present in the scene,
active progress tracks, and character state.

At current Sonnet pricing this is ~$0.0004 per narration input with caching.
Output (the narration itself) adds ~$0.002–$0.005 depending on length setting.
Total per narration: ~$0.003 on Sonnet, ~$0.0008 on Haiku.

The budget is defined in `src/schemas.js` (`ContextPacketSchema.tokenBudget`).

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
