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

**Progress tracks** — fights, expeditions, and scene challenges (each challenge
with its paired danger clock) in the Progress Tracks panel, stored in a
dedicated journal. Vows and legacy tracks live on each character's sheet, and a
connection's relationship track on its card in the Entities panel.

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

1. Click the **🛡 Companion Settings** button on the Companion launcher (available to every player — each enters their own keys; GM-only world settings stay GM-only)
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
| `!x clear` | Clear the X-Card and resume narration — the same as the card's Resume narration button (GM) |

### Session

| Command | Effect |
|---------|--------|
| `!begin-session` | Begin the session (opens with a galley vignette; enables the pipeline) |
| `!incite` | Envision an Inciting Incident — an Action + Theme spark the narrator turns into your campaign's opening event and a suggested starting vow (the card's ⚔ Swear this vow creates it); also the Session panel's ✦ Envision Inciting Incident |
| `!end-session` | End the session (closes with an NPC vignette; disables the pipeline) |
| `!flag` | Set a Flag |
| `!fate` | Change Your Fate |
| `!break` | Take a Break |

### Moves, oracles & fate

| Command | Effect |
|---------|--------|
| `!roll` | Force the next message through the move pipeline (GM) |
| `!oracle yes [odds] [question]` | Ask the Oracle (yes/no) + narrator follow-up. Odds: `small`, `unlikely`, `50_50`, `likely`, `almost_certain` |
| `!oracle <table-id> [question]` | Roll any oracle table by its id — built-in (e.g. `!oracle action`, `!oracle theme`) or one of your custom tables — + narrator follow-up |
| `!pay-the-price` / `!ptp [question]` | Roll the Pay the Price table + narrator follow-up |
| `!bond [rank] [name]` | Bonded Develop Your Relationship (rank: troublesome…epic); name a bonded connection to use their own rank — with one bonded connection, a bare `!bond` targets them |
| `!sever <name>` | Mark a connection lost — the record is kept as history, and each character's bond with them is marked lost (GM) |
| `!repair` | Open the Repair point-spend dialog |
| `!reset-momentum [name \| all]` | Put a character's momentum base maximum and reset back to 10 / +2 (repairs bases an older version lowered as impacts were marked) — your own character, a named one, or every one; a player resets only a character they own |
| `!sfc encounter <name>` | Spawn a canonical foundry-ironsworn encounter |
| `!oracle-add [id]` | Register a custom oracle table (GM) |

### World, sectors & journal

| Command | Effect |
|---------|--------|
| `!sector new` | Open the Sector Creator wizard (GM) |
| `!sector list` | List all created sectors |
| `!sector <name>` | Switch the active sector (GM) |
| `!reveal-site <name>` | Discover an unexplored precursor vault or derelict, charting it on the sector map; with no name, the sole unexplored site (GM) |
| `!clear-site <name>` | Mark a discovered vault or derelict fully explored; with no name, the sole discovered site (GM) |
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
| `!narrator debug` | Show what the narrator was sent for the last narration, section by section, with the facts it recorded — whispered to you, for playtest reports (GM) |

### Fact continuity

| Command | Effect |
|---------|--------|
| `!scene start` / `!scene end` | Start / end a fact-continuity scene (GM) |
| `!truth list` | List the active scene's truths, to you, each with the ID prefix `!truth strike` takes |
| `!truth strike <id>` / `!truth set <subject> <fact>` | Correct a scene truth |
| `!state strike <subject> <attr>` / `!state set <subject> <attr>=<value>` | Correct scene state |

### Clocks

| Command | Effect |
|---------|--------|
| `!clock new <name> <segments> [campaign\|tension] [odds]` | Create a clock (GM) |
| `!clock advance\|fill\|reset\|remove <name>` | Advance, fill, reset, or remove a clock (GM) |
| `!clock list` | List all clocks |

### Starships

| Command | Effect |
|---------|--------|
| `!stations` | Post the Battle Stations! play aid — the 11 shipboard-combat crew roles for running a starship fight |
| `!shipmap` / `!shipmap rebuild` | Build (or rebuild) your command vehicle's deck-plan map — its stations, the galley and its installed modules, all pinned (GM) |
| `!ship envision [name] [facet]` | Roll supplementary ship oracles (captain, crew, agenda, contact) and post a narrator paragraph weaving them in, appended to the ship's Notes |
| `!ship history [name] [beats]` | Roll Action + Theme backstory beats and a Story Clue; the narrator writes the ship's history, appended to its Notes |

---

## In-game help

After installing, the **Starforged Companion — Help & Reference** journal is
created automatically in the GM's world. It contains the full command
reference, settings documentation, troubleshooting guide, and changelog.

---

## Cost and API usage

Claude is billed to your own Anthropic API key. The narrator runs on
**Claude Sonnet 5.5** by default (the *Narration Model* setting — Claude
Haiku 5.5 is the cheaper choice), and so does the automatic Chronicle writer,
which follows that setting; the move interpreter, the pacing classifier, the
detection passes after each narration, relevance, `!lore` and the Private
Channel run on **Claude Haiku 5.5**. At Anthropic's published rates:

| Model | Input | Output |
|---|---|---|
| Claude Sonnet 5.5 | $2 / million tokens | $10 / million tokens |
| Claude Haiku 5.5 | $0.10 / million tokens (prompts up to 100K tokens; $0.50 beyond) | $0.50 / million tokens ($2.50 beyond 100K) |

| Other services | Cost |
|---|---|
| Portrait generation (FLUX.2 Pro via OpenRouter) | a few cents each — infrequent |
| Sector background art (FLUX.2 Pro via OpenRouter) | a few cents per sector — ~3–5 sectors a campaign |

The narrator call — one per chat input that is narrated, and one per move —
is most of the bill, and most of what it sends is billed at the full input
rate: its system prompt is rebuilt for every call (it carries the scene's
entities, ledger and character state), so cached reads are a small share of
it. The helper calls' fixed instructions are marked for prompt caching
(cached reads bill at a fraction of the input rate); one shorter than the
model's minimum cacheable length is sent uncached.

Earlier versions of this README quoted per-session and per-call dollar
figures measured in v1.2.7 play on the models of that time; they no longer
hold, so they are not repeated here. To see what play costs at your table,
read the *Narrator Usage* page described below.

The image model is configurable via the `openRouterImageModel` setting —
swap to a cheaper FLUX variant (`flux.2-klein`, `flux.2-flex`) or a different
provider's image model on OpenRouter at any time.

### Narrator prompt size

Each narration call sends the narrator a system prompt built for that call —
safety configuration first, then narrator permissions, world truths, the cards
of the entities in the scene, open progress tracks and clocks, character state,
and the active-scene ledger — and a message with the player's text and the
recent narration. There is no fixed budget for the whole prompt — narration
models' context windows are far larger than it — but the parts that grow with
play have their own caps: the scene ledger by *Max ledger tokens* (default 400)
and the recent-narration memory by *Context cards* (default 20), both in
Companion Settings.

To see what narration costs at your table, open the *Pacing Telemetry* journal's
"Narrator Usage" page: every narrator call a GM's client makes is logged there —
its tokens (uncached input, cache reads and writes, output) and its time.
`!narrator debug` (GM) shows what the last narration was sent.

Audio narration is billed separately by ElevenLabs against your own key and is
cached content-addressed, so repeated playback of the same prose is free.

---

## Safety

The safety system is always active. Safety configuration is injected first into
every narrator prompt and is never overridden by any other setting.

- **Lines** — hard content limits, set by GM, never crossed
- **Veils** — soft limits, set by GM, handled with care or faded to black
- **Private Lines** — your own hard limits, set on your client; the narrator
  never crosses or mentions them (narration the GM's game makes carries every
  player's — with no GM with a Claude key online, a player's own browser
  carries only theirs). The GM can see them; they are never shown in another
  player's interface or sent in another player's narration request — but they
  are stored in the world's shared data, which another player could read from
  their browser's developer console
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
