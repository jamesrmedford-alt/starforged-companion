# Starforged Companion

A Foundry VTT companion module for [Ironsworn: Starforged](https://ironswornrpg.com).

Handles move interpretation, oracle integration, progress tracking, Connection/NPC management, and Narration. 

---

## What it does

**Move interpretation — the Trickster Layer**
Player narration is intercepted from chat and sent to the Claude API, which identifies the appropriate Starforged move, selects a stat, and explains its reasoning. Dice are rolled, outcomes calculated, and the full resolved result — move name, stat, dice, outcome, and specific mechanical consequences — is passed to Loremaster as structured context. A tunable mischief dial governs how liberally the module interprets narration.

**Oracle integration**
All Starforged oracle tables are available as rollable, chat-injectable prompts. Results feed automatically into the Loremaster context packet. Players can invoke oracles without knowing table names.

**World Truths generator**
Roll or choose across all 14 Starforged World Truth categories. Nested sub-tables resolve automatically. Results are saved as a formatted Foundry journal entry that serves as the campaign's living reference document.

**Connection and NPC tracking**
Journal-based records for each Connection: name, rank, relationship history, vow progress, bond status, portrait, and Loremaster voice notes. Records start sparse and fill through play. Relevant Connections are injected into the Loremaster context packet automatically.

**Progress track management**
Visual progress tracks for vows, expeditions, connections, fights, and scene challenges. Rank-aware tick calculation. Accessible from chat and the UI sidebar.


**Art asset generation**
On-demand portrait generation for named Connections, settlements, ships, factions, and planets via an external API (Replicate, fal.ai, or DALL-E). Generation triggers after Loremaster's first description of the entity — not at name appearance — so the prompt is rich. Images are generated once and stored permanently.

**Push-to-talk speech input**
Hold the microphone button in the chat bar to speak. Transcription is injected directly into chat on release. Requires a Chromium-based browser. Falls back gracefully on unsupported browsers.

---

## Requirements

- **Foundry VTT** v12 or v13
- **[Foundry Ironsworn](https://github.com/ben/foundryvtt-ironsworn)** — the Starforged system by Ben Straub. Integration is optional but improves compatibility.
- **[Anthropic API key](https://console.anthropic.com)** — for move interpretation and oracle calls. Usage is low; see cost notes below.
- **Art generation API key** — optional. Replicate, fal.ai, or DALL-E. Required only if art generation is enabled.

### Recommended



---

## Installation

This module is not listed in the Foundry package registry. Install manually:

1. Download the latest release zip from the [releases page](../../releases).
2. In Foundry, go to **Add-on Modules → Install Module**.
3. Paste the manifest URL from the release into the **Manifest URL** field, or extract the zip into your Foundry `Data/modules/` folder.
4. Enable the module in your world's module list.

---

## Setup

1. Open **Module Settings** and enter your **Claude API Key** (client-scoped — stored in your browser only, never sent to the Foundry server).
2. If using art generation, enter your **Art Generation API Key** and select a backend.
3. Set the **Mischief Dial** to your preferred interpretation style.
4. Enable **Push-to-Talk** if you want speech input (Chromium browsers only).
5. Run the **World Truths Generator** at the start of a new campaign to establish your setting.

---

## API cost

Move interpretation uses Claude Haiku with prompt caching. A typical weekly campaign costs less than $1–2/month in API calls. Loremaster's Patreon subscription is the dominant ongoing cost, not the Claude API.

See the [cost analysis document](docs/costs.md) for a full breakdown.

---

## Safety

Global Lines and Veils are configured in the module settings and injected at the top of every Loremaster context packet before any creative content. Safety configuration acts as a hard ceiling on the mischief dial regardless of session setting.

Per-player private Lines are stored separately and are not visible to other players at the table.

An X-Card equivalent (`/x` command) pauses the scene immediately, no explanation required.

Safety tooling references: [TTRPG Safety Toolkit](https://drive.google.com/drive/folders/114jRmhzBpdqkAlhmveis0nmW73qkAZCj) by Kienna Shaw and Lauren Bryant-Monk.

---

## Development

```bash
# Install dependencies
npm install

# Run unit tests (pure logic, no Foundry globals required)
npm test

# Run linter
npm run lint
```

Integration tests require a running Foundry instance with the [Quench](https://github.com/Ethaks/FVTT-Quench) module installed.

See [file-structure.md](file-structure.md) for the full source layout and design notes.

---

## Licence

Personal use. Not affiliated with Shawn Tomkin or Ironsworn. Ironsworn: Starforged is published under Creative Commons Attribution 4.0.
