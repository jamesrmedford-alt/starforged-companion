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

**Pacing** — a fast pre-classifier decides whether each message is a move, pure
narrative, or a narrative with a move available, so casual chat doesn't trigger a
roll. Per-category dials (combat, investigation, exploration, social, downtime)
and `!pace hot|quiet|clear` let you tune scene intensity on the fly.

**Scene interrogation** — type `@scene [question]` to ask the narrator for
atmospheric detail without triggering a move.

**Session flow** — a ▶ **Session Panel** covers all five session moves (Begin,
End, Set a Flag, Change Your Fate, Take a Break). **Begin Session** is the gate:
before you start, plain typed messages stay as ordinary chat. Begin opens with a
light galley vignette of your crew; End closes with a quiet slice-of-life scene
of a currently-important NPC.

**Fact continuity** — the narrator quietly tracks new facts and state changes per
scene, surfaces them back into context so it stays consistent, and lets you
correct any fact it gets wrong. Scene truths are promoted to entities or archived
to the World Journal when a scene ends.

**Audio narration** *(optional)* — ElevenLabs text-to-speech overlaid on narrator
cards, with separate narrator and NPC voices. Opt-in per player; text always
remains canonical.

**Safety system** — Lines, Veils, Private Lines, and X-Card (`!x` in chat).
Safety configuration is always the first thing injected into every narration
context — it is never overridden by any other setting.

**Progress tracks** — vows, expeditions, combats, connections, and legacy
tracks. Stored in a dedicated journal, displayed in a sidebar panel.

**Clocks** — campaign and tension clocks via `!clock`, with a dedicated panel.
Campaign clocks can auto-advance against oracle odds at the start of a session.

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

**Oracles & fate** — all published Starforged oracle tables, plus `!oracle yes`
(Ask the Oracle), `!pay-the-price`, and `!bond` directly in chat — each with an
automatic narrator follow-up.

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
| ElevenLabs API key | Optional — for audio narration. Get one at elevenlabs.io |
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
5. (Optional, for audio) Enter your **ElevenLabs API Key** (from elevenlabs.io) and click **Save Keys**

API keys are stored in your browser only (client-scope setting) and are never
visible in the standard Configure Settings UI. They are never transmitted to
Foundry's server.

The Anthropic key is sent only to `api.anthropic.com`. The OpenRouter key is
sent only to `openrouter.ai/api/v1/chat/completions`. The ElevenLabs key is sent
only to `api.elevenlabs.io`. There is no relay, proxy, or third-party server in
the path.

---

## Chat commands

Module commands use a `!` prefix (Foundry reserves `/` for its own commands).
Several commands are GM-only as noted. The ▶ Session and 🛡 Companion Settings
toolbar buttons provide button-driven equivalents for the session moves and
configuration.

### Play

| Command | Effect |
|---------|--------|
| *type narration normally* | Intercepted and routed through the move pipeline (once the session is active) |
| `\message` | Bypass the interpreter — posts as plain chat |
| `@scene question` | Ask the narrator for scene detail without triggering a move |
| `!x` | X-Card — immediately suppress the current scene |

### Session

| Command | Effect |
|---------|--------|
| `!begin-session` | Begin the session (opens with a galley vignette; enables the pipeline) |
| `!end-session` | End the session (closes with an NPC vignette; disables the pipeline) |
| `!flag` | Set a Flag |
| `!fate` | Change Your Fate |
| `!break` | Take a Break |

### Moves, oracles & fate

| Command | Effect |
|---------|--------|
| `!roll` | Force the next message through the move pipeline (GM) |
| `!oracle yes [odds] [question]` | Ask the Oracle (yes/no) + narrator follow-up. Odds: `small`, `unlikely`, `50_50`, `likely`, `almost_certain` |
| `!pay-the-price` / `!ptp [question]` | Roll the Pay the Price table + narrator follow-up |
| `!bond <rank>` | Bonded Develop Your Relationship (rank: troublesome…epic) |
| `!repair` | Open the Repair point-spend dialog |
| `!sfc encounter <name>` | Spawn a canonical foundry-ironsworn encounter |
| `!oracle-add [id]` | Register a custom oracle table (GM) |

### World, sectors & journal

| Command | Effect |
|---------|--------|
| `!sector new` | Open the Sector Creator wizard (GM) |
| `!sector list` | List all created sectors |
| `!sector <name>` | Switch the active sector (GM) |
| `!at <name>` / `!at` | Set / clear the current location for narrator context (GM) |
| `!truths` | Open the World Truths dialog (GM) |
| `!lore` | Post a narrator-generated World Truths recap card (GM) |
| `!journal faction "Name" attitude — summary` | Record faction intelligence (GM) |
| `!journal location "Name" type — description` | Record a location (GM) |
| `!journal lore "Title" confirmed — text` | Record a lore discovery (GM) |
| `!journal threat "Name" severity — summary` | Record an active threat (GM) |
| `!migrate-entities` / `--cleanup` | Migrate entities to native Actors (GM) |

### Recaps & pacing

| Command | Effect |
|---------|--------|
| `!recap` / `!recap campaign` | Post a campaign recap (Claude, cached; GM-only by default) |
| `!recap session [N]` | Post a recap of the current (or Nth) session — no API call; GM-only by default |
| `!pace hot\|quiet\|clear\|status` | Override or inspect scene pacing (GM) |

### Fact continuity

| Command | Effect |
|---------|--------|
| `!scene start` / `!scene end` | Start / end a fact-continuity scene (GM) |
| `!truth strike <id>` / `!truth set <subject> <fact>` | Correct a scene truth |
| `!state strike <subject> <attr>` / `!state set <subject> <attr>=<value>` | Correct scene state |

### Clocks

| Command | Effect |
|---------|--------|
| `!clock new <name> <segments> [campaign\|tension] [odds]` | Create a clock |
| `!clock advance\|fill\|reset\|remove <name>` | Advance, fill, reset, or remove a clock |
| `!clock list` | List all clocks |

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

Audio narration is billed separately by ElevenLabs against your own key and is
cached content-addressed, so repeated playback of the same prose is free.

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

- [Module architecture](docs/foundry-reference/architecture.html) — interactive system diagram
- [Scope index](docs/scope-index.md) — all features, status, and dependencies
- [File structure](docs/file-structure.md) — what each source file does
- [Design decisions](docs/decisions.md) — why things are the way they are
- [Known issues](docs/known-issues.md) — open bugs and workarounds
- [CLAUDE.md](CLAUDE.md) — Claude Code working instructions
