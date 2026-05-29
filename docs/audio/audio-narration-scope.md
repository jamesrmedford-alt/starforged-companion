# Starforged Companion — Audio Narration Scope
## ElevenLabs text-to-speech for narrator output — opt-in per player

**Status:** 📋 PLANNED
**Priority:** Medium — quality-of-life enhancement; not a play-blocker
**Dependencies:** Narrator (✅), Fact Continuity (✅), Settings infrastructure (✅),
Companion Settings panel (✅), Sector Creator (✅ — provides the persistent-asset
storage pattern this scope mirrors)
**Related:** Private Channel (📋 PLANNED — audio carries through transparently;
see §14)

> **Pre-drafting verification (surfaced per packet instructions).** The source
> packet's structural template referenced `docs/private-channel-scope.md` and
> `docs/pacing-scope.md`. At packet time `private-channel-scope.md` was not
> in the repository; it is now landing in parallel with this scope (see the
> "harmonize this too" handoff). The structure below follows `pacing-scope.md`
> with the private-channel scope as a sibling reference. The packet's six
> pre-drafting assumptions resolve as follows:
>
> 1. ✅ **API key pattern.** Anthropic key (`claudeApiKey`) is registered with
>    `scope: "client"`, `config: false`, default `""` (`src/index.js:188-195`).
>    UI lives in the **About** tab of the Companion Settings panel and is
>    rendered as a GM-only `type="password"` input
>    (`src/ui/settingsPanel.js:1184-1224`). The packet said "world scope"
>    implicitly by analogy — the actual scope is **client**, which matters:
>    each player enters their own key, no key crosses the network. OpenRouter
>    uses the same shape (`openRouterApiKey`). The ElevenLabs key mirrors this
>    exactly — see §4.
>
> 2. ✅ **Narrator output pipeline.** `narrateResolution`, `narratePacedInput`,
>    and `interrogateScene` in `src/narration/narrator.js` all funnel through
>    `runPostNarrationPasses()` and end at `postNarrationCard()`, which calls
>    `ChatMessage.create()` with a `narratorCard: true` flag. The audio
>    pipeline hooks into `postNarrationCard` (text-rendered, audio-triggered)
>    and the `renderChatMessage` hook for playback controls — see §7 and §9.
>
> 3. ✅ **Sidecar already shipped.** The packet asked whether the narrator
>    emits prose or markup. Both, today: prose plus a mandatory fenced JSON
>    sidecar (`appendSidecarInstruction` in `src/narration/narratorPrompt.js`,
>    parsed by `src/factContinuity/sidecarParser.js`). The packet anticipated
>    this in Q2 ("If fact-continuity lands first…"). It has. The implication
>    for Q2 is examined in §17 — sidecar is the *bookkeeping* channel
>    (immutable truths, state values); audio segmentation is a *prose*
>    concern and does not fold into the sidecar without duplicating the
>    prose. Inline markup remains the chosen approach. See §6 and §17 Q2.
>
> 4. ⚠️ **Foundry audio primitives — partial.** The codebase does not currently
>    use any Foundry audio API. `foundry.audio.Sound` and `game.audio.play()`
>    are documented in v13/v14 and supply MP3 playback, per-client volume,
>    and a user-gesture queue for autoplay. `src/input/speechInput.js` is
>    speech-to-text (input transcription) and provides no precedent for
>    output. The scope uses `foundry.audio.Sound` directly — see §7.
>
> 5. ⚠️ **ElevenLabs API state — verified May 2026.** Endpoint:
>    `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` for
>    full generation and `/v1/text-to-speech/{voice_id}/stream` for chunked
>    streaming. Auth header: `xi-api-key`. Current models:
>    `eleven_flash_v2_5` (~75ms latency, 0.5 credits/char),
>    `eleven_turbo_v2_5` (~300ms, 0.5 credits/char),
>    `eleven_multilingual_v2` (1.0 credit/char), `eleven_v3` (highest quality,
>    1.0 credit/char). `voice_settings.speed` is supported (default 1.0).
>    Subscription / usage endpoint: `GET /v1/user/subscription` returns
>    `character_count` and `character_limit`.
>
>    **CORS caveat.** ElevenLabs has no dedicated "browser-access" header
>    analogous to `anthropic-dangerous-direct-browser-access` and its docs
>    explicitly warn against exposing keys in browser code. The module's
>    BYOK model with user-supplied keys is the same risk profile as the
>    Anthropic and OpenRouter call sites (see `docs/decisions.md` "CORS
>    strategy"); ElevenLabs CORS appears to work for direct browser fetch
>    in practice. **Implementation must verify CORS empirically before
>    UI wiring.** If CORS is blocked, the feature falls back to text-only
>    (graceful degradation — §10) and the resolution is a §18 follow-on, not
>    a §18 blocker (no local proxy per the project's CORS strategy decision).
>
> 6. ✅ **Cache storage path.** Sector art uses
>    `worlds/${world.id}/scenes/sector-${id}.png`
>    (`src/sectors/sectorArt.js:199-228`) uploaded via
>    `foundry.applications.apps.FilePicker.implementation.upload(...)`. Audio
>    cache mirrors this exactly at `worlds/${world.id}/audio/` — see §8.
>
> **One additional gap surfaced during verification.** The Companion Settings
> panel has four tabs today: Safety, Mischief, Narrator, About
> (`src/ui/settingsPanel.js` `_prepareContext` / `_renderHTML` around
> lines 825-830). The packet's "audio settings panel" is implemented as a
> new fifth tab **Audio**, colocated with the API key entry in About via a
> cross-link. See §5 and §17 Q5.

---

## 1. Overview

Narrator prose currently lands in main chat as a styled card. The audio
narration feature optionally generates spoken audio for that prose via
the ElevenLabs TTS API, configurable per player, with a distinct
secondary voice when the narrator is voicing an NPC.

Three properties define the feature:

- **Enhancement, not replacement.** Text remains the canonical narrator
  output. Audio overlays it. The chat card renders immediately; audio
  arrives when ready.
- **Opt-in per player.** Audio playback is a client-scoped setting.
  Some players want it; some do not. Auto-play is off by default —
  surprise audio at the table is bad UX.
- **GM owns voice/cost concerns; players own playback concerns.** Voice
  IDs, model, and speed are shared (world-scoped). Enable, volume, and
  auto-play are per-player (client-scoped).

The feature integrates with three already-shipped systems:

| System | Integration |
|---|---|
| Narrator pipeline | Audio triggers on `narratorCard: true` flag — covers move-resolution, paced narrative, and scene-interrogation cards uniformly. |
| Fact-continuity sidecar | The sidecar parser already strips the fenced JSON block before the card renders. Inline `<npc>…</npc>` markup is added to the prose body; the sidecar is untouched. |
| Sector art caching | `worlds/${world.id}/scenes/` upload pattern is reused for `worlds/${world.id}/audio/`. Same `FilePicker.implementation.upload(...)` helper, same persistence guarantees. |

---

## 2. User experience

### 2.1 GM setup

In Companion Settings → **About**, the GM pastes their ElevenLabs API
key into a new password-masked field below the existing Claude and
OpenRouter key fields. The key is client-scoped (each player enters
their own); the GM sets the *world-level* voice configuration in a new
**Audio** tab:

```
[ Audio ]

Narrator voice ID    [21m00Tcm4TlvDq8ikWAM_______________]  (default)
NPC voice ID         [pNInz6obpgDQGcFmaJgB_______________]
Model                [ Flash v2.5 — fastest, lowest cost ▾ ]
Playback speed       [ 1.0×  ──●────────  ]  (0.7×–1.5×)

ElevenLabs character usage this period:   38,412 / 100,000
(refreshes when this panel is opened; no hard cutoff)
```

Voice IDs are obtained at elevenlabs.io and pasted in — no in-module
voice browser in v1 (see §17 Q5). The Audio tab also includes a
read-only link to the API key entry in the About tab and a one-line
"What is this?" explainer.

### 2.2 Player experience

Each player has their own Audio settings under Companion Settings
(client-scoped, visible regardless of GM permission):

```
[ ☐ ] Enable audio narration on my client
Volume   [ ──────●─── ]  80%
[ ☐ ] Auto-play when a narrator card appears
```

When **Enable** is off, narrator cards render normally with no audio
control. When on, every narrator card grows a play button in the footer
next to the existing "Correct a fact" button:

```
[▶ Play]  📋 Correct a fact
```

Clicking ▶ generates (or fetches from cache) the audio and plays it on
the local client. The button changes to ⏸ during playback and ⏹ resets
after.

When **Auto-play** is on, audio begins as soon as the card renders —
subject to Foundry's user-gesture autoplay constraint (§7.3); a brief
"click to start audio" overlay handles the first-card-of-session case.

### 2.3 NPC voice — worked example

The narrator prompt is augmented (§6) to wrap NPC speech in inline
markup. A typical narrator response:

```
Vance leans against the bulkhead, arms folded. <npc>"You can stop
pretending you don't know who I am, Captain."</npc> The lights stutter
once and steady themselves. He hasn't moved.
```

The fact-continuity sidecar parser strips the JSON block as today. The
audio pipeline (§7) splits on `<npc>…</npc>`, dispatching the narrator
voice for the framing prose and the NPC voice for the quoted dialogue.
The chat card displays the markup stripped — players see clean prose
plus the play control.

### 2.4 Failure modes — visible

| Situation | Player sees | GM sees |
|---|---|---|
| No API key set | "▶" hidden; card unchanged | Audio tab shows "no key set" badge |
| API call fails | "▶" disabled with tooltip ("audio unavailable") | Browser console warning + telemetry row |
| Cache hit (~all subsequent plays of same text) | Plays instantly | Cost row in usage display unchanged |
| CORS blocked (post-verification regression) | "▶" hidden across all cards | Audio tab shows "CORS error — see docs" |

---

## 3. New files — code structure

```
src/audio/
  elevenlabs.js     — REST client (request, stream, subscription)
  cache.js          — hash, lookup, write, evict
  segments.js       — split prose on <npc>…</npc> markup
  playback.js       — foundry.audio.Sound wrapper + user-gesture queue
  index.js          — orchestrator called from postNarrationCard hook

styles/
  audio-narration.css   — play/pause control, optional auto-play overlay
```

### 3.1 `src/audio/elevenlabs.js`

```js
/**
 * ElevenLabs REST client. Direct browser fetch — no local proxy. The
 * user supplies their own key in Companion Settings; the same BYOK
 * pattern as Anthropic and OpenRouter (see docs/decisions.md "CORS
 * strategy"). CORS is verified empirically; see §10 for the failure
 * mode if it regresses.
 */

const ENDPOINT = "https://api.elevenlabs.io/v1";

export const ELEVENLABS_MODELS = Object.freeze([
  { id: "eleven_flash_v2_5",      label: "Flash v2.5 — fastest, lowest cost",   creditMultiplier: 0.5 },
  { id: "eleven_turbo_v2_5",      label: "Turbo v2.5 — balanced",                creditMultiplier: 0.5 },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 — long-form quality",  creditMultiplier: 1.0 },
  { id: "eleven_v3",              label: "Eleven v3 — highest expressiveness",  creditMultiplier: 1.0 },
]);

/**
 * Synthesise a single segment to an MP3 ArrayBuffer.
 * @param {Object} args
 * @param {string} args.apiKey
 * @param {string} args.voiceId
 * @param {string} args.modelId
 * @param {string} args.text
 * @param {number} [args.speed=1.0]
 * @param {boolean} [args.stream=false]
 * @returns {Promise<ArrayBuffer|ReadableStream>}
 */
export async function synthesise({ apiKey, voiceId, modelId, text, speed, stream }) { /* ... */ }

/**
 * Read current character usage for the budget display.
 * @returns {Promise<{ used: number, limit: number, resetAt: number }>}
 */
export async function fetchSubscription(apiKey) { /* ... */ }
```

Notes:
- Auth header is `xi-api-key: <key>` (different from Anthropic's `x-api-key`).
- This file is **not** routed through `src/api-proxy.js`. The api-proxy
  helper is Anthropic-specific by design (`docs/decisions.md` "CORS
  strategy"); ElevenLabs gets its own minimal client mirroring the same
  shape but with its own headers and error surfacing.

### 3.2 `src/audio/cache.js`

```js
/**
 * Audio cache mirroring src/sectors/sectorArt.js storage pattern.
 *
 * Hash = sha256(text + "\x00" + voiceId + "\x00" + modelId + "\x00" + speed)
 * Path = worlds/${world.id}/audio/${hashPrefix2}/${hash}.mp3
 *   (two-level fanout keeps directory listings tractable)
 */
export async function cacheKey({ text, voiceId, modelId, speed }) { /* ... */ }
export async function lookup(key) { /* returns blob URL or null */ }
export async function write(key, mp3Bytes) { /* uploads via FilePicker */ }
export async function evictIfOverflow(maxBytes) { /* oldest first */ }
```

### 3.3 `src/audio/segments.js`

```js
/**
 * Split narrator prose into voice-tagged segments based on inline
 * <npc>…</npc> markup. The sidecar JSON block must already be stripped
 * (sidecarParser.extractSidecar runs before this).
 *
 * @returns {Array<{ voice: "narrator" | "npc", text: string }>}
 */
export function splitSegments(prose) { /* ... */ }

/**
 * Strip <npc>…</npc> markers for chat display. Returns clean prose with
 * the *contents* of each NPC block preserved verbatim.
 */
export function stripMarkup(prose) { /* ... */ }
```

### 3.4 `src/audio/playback.js`

```js
/**
 * Thin wrapper around foundry.audio.Sound. Manages the per-card play
 * state, the user-gesture queue for autoplay, and per-client volume.
 *
 * One PlaybackSession per chat card. Segments play sequentially.
 */
export class PlaybackSession {
  constructor({ cardId, segments, voiceMap, volume }) { /* ... */ }
  async play()   { /* ... */ }
  async pause()  { /* ... */ }
  async stop()   { /* ... */ }
  get state()    { /* "idle" | "loading" | "playing" | "paused" | "error" */ }
}
```

### 3.5 `src/audio/index.js`

```js
/**
 * Orchestrator — wired from postNarrationCard and the renderChatMessage
 * hook. Decides whether audio applies to a given card, segments the
 * prose, kicks off generation (if the card is auto-play and the player
 * has opted in), and renders/binds the play control.
 */
export async function onNarratorCardRendered(message, root) { /* ... */ }
export function audioEnabledForThisClient() { /* setting-gated boolean */ }
```

---

## 4. API key storage and authentication

### 4.1 Setting registration

In `src/index.js`, register alongside the existing keys:

```js
game.settings.register(MODULE_ID, "elevenLabsApiKey", {
  name:    "ElevenLabs API Key",
  hint:    "Your ElevenLabs API key. Stored locally in your browser — never sent to Foundry's server.",
  scope:   "client",
  config:  false,
  type:    String,
  default: "",
});
```

Scope is **client** to match `claudeApiKey` and `openRouterApiKey`. Each
player enters their own key. World-scope was considered and rejected —
sharing keys across players would route every TTS request through the
GM's account, which is both a privacy gap and an operational coupling
(GM offline = no audio for any player).

### 4.2 UI entry — About tab

`src/ui/settingsPanel.js` `#renderAboutPane` already renders Claude and
OpenRouter inputs inside a GM-only `<div class="about-api-keys">` block.
Append a third entry of the same shape:

```html
<div class="api-key-field">
  <label class="api-key-label" for="sf-elevenlabs-key">
    ElevenLabs API Key (audio narration)
    ${ctx.apiKeys.elevenLabsKeySet
      ? '<span class="api-key-status api-key-set">● Set</span>'
      : '<span class="api-key-status api-key-unset">○ Not set</span>'}
  </label>
  <input class="settings-input api-key-input" type="password"
         id="sf-elevenlabs-key" name="elevenLabsApiKey"
         placeholder="sk_…"
         autocomplete="off" spellcheck="false">
</div>
```

The `#onSaveApiKeys` handler (already present) needs one extra branch
to read `elevenLabsApiKey` from the form and write to settings; the
trim-and-skip-blank logic carries over without modification.

### 4.3 Header injection

`src/audio/elevenlabs.js` calls `fetch` directly with
`{ "xi-api-key": key.trim(), "Content-Type": "application/json" }`.
401 responses surface a one-line console hint identifying that the key
is likely missing or wrong-provider — same shape as the Anthropic 401
hint in `src/api-proxy.js:67-75`.

---

## 5. Settings schema

Five world-scoped, five client-scoped.

### 5.1 World-scoped (GM controls)

| Key | Type | Default | Purpose |
|---|---|---|---|
| `audio.enabled` | Boolean | `false` | Master toggle. Off by default — feature is opt-in for the whole world. |
| `audio.narratorVoiceId` | String | `"21m00Tcm4TlvDq8ikWAM"` (Rachel — ElevenLabs default sample voice) | Voice for narrator framing prose. |
| `audio.npcVoiceId` | String | `"pNInz6obpgDQGcFmaJgB"` (Adam — sample secondary) | Voice for `<npc>` segments. |
| `audio.modelId` | String | `"eleven_flash_v2_5"` | Model. Dropdown bound to `ELEVENLABS_MODELS`. |
| `audio.speed` | Number | `1.0` | Playback speed (0.7–1.5, step 0.1). Applied via `voice_settings.speed`. |
| `audio.cacheMaxBytes` | Number | `200 * 1024 * 1024` (200 MB) | Soft cap; oldest evicted on overflow. |

All registered with `scope: "world", config: false` — surfaced through
the Audio tab, not Foundry's settings menu, to match the existing
mischief/pacing/narrator-tab convention.

### 5.2 Client-scoped (per player)

| Key | Type | Default | Purpose |
|---|---|---|---|
| `elevenLabsApiKey` | String | `""` | The player's key. See §4. |
| `audio.clientEnabled` | Boolean | `false` | Per-player enable. Off by default. |
| `audio.volume` | Number | `0.8` | 0.0–1.0. |
| `audio.autoplay` | Boolean | `false` | Off by default (Q3). |
| `audio.lastWindowPosition` | Object | `{}` | Reserved for future audio settings dialog. |

`audio.clientEnabled` is the gate the play-button render checks. The
world `audio.enabled` is a higher-level gate (master toggle); both must
be true for any audio to be generated.

### 5.3 Audio tab — Companion Settings panel

A new `_renderAudioPane(ctx)` method in `src/ui/settingsPanel.js`,
called from the existing tab dispatcher (around lines 825-830). Tab
labels become: **Safety**, **Mischief**, **Narrator**, **Audio**,
**About**. World fields render for GMs only (inline `${ctx.isGM ? … : ''}`
guards, same pattern as the API-key block in §4.2). Client fields render
for everyone.

---

## 6. Narrator output markup convention

### 6.1 Decision

NPC speech is wrapped inline with `<npc>…</npc>` tags in the narrator's
prose response. The fact-continuity sidecar JSON block is **not**
touched.

```
Vance leans on the rail. <npc>"You're early."</npc> The lights
flicker.

```json
{
  "newTruths": [...],
  "stateChanges": [...]
}
```
```

### 6.2 Why not the sidecar

The packet's Q2 anticipated folding audio segments into the sidecar if
fact-continuity landed first. It did. But on inspection, sidecar fold-in
duplicates the prose: every word would appear once in the prose body
(for the chat card) and again in `audioSegments[].text` (for the audio
pipeline). The sidecar's job is *bookkeeping over facts and state*, not
prose re-representation. Inline markup keeps a single source of truth
and adds only ~20 bytes per NPC line of dialogue. See §17 Q2.

### 6.3 Narrator prompt change

`appendSidecarInstruction()` in `src/narration/narratorPrompt.js` is the
adjacent instruction. A peer function `appendNpcMarkupInstruction()`
(also in `narratorPrompt.js`) is appended to the system prompt when
`audio.enabled` is true:

```
## NPC DIALOGUE MARKUP — required when audio narration is enabled

Wrap each piece of NPC dialogue in <npc>…</npc> tags. Examples:

  Vance pauses. <npc>"You can't be serious."</npc> The lights flicker.
  <npc>"You won't find them there,"</npc> Kira says, not looking up.

Rules:
- Only NPC speech. Player-character speech does NOT get tagged
  (players hear their own characters in their own heads; flatten to
  the narrator voice).
- One tag pair per dialogue chunk. Do not nest. Do not split a single
  spoken line across multiple tag pairs.
- Quoted text that is NOT spoken dialogue (a sign, a comm transmission
  read aloud, a remembered phrase) is NOT tagged.
- The narrator voice handles everything outside <npc> tags, including
  attribution ("Vance says", "she replies"), action beats, and
  description.
```

### 6.4 Sidecar interaction order

`runPostNarrationPasses()` in `src/narration/narrator.js` already calls
`extractSidecar(rawResponse)` which returns `{ prose, sidecar }`. The
audio pipeline runs `splitSegments(prose)` on the *stripped* prose
*after* sidecar extraction, so the JSON block can never leak into a
TTS request even if generation fails. The chat card displays
`stripMarkup(prose)`; the audio pipeline keeps the segmented version.

---

## 7. Audio generation pipeline

### 7.1 Flow

```
narrator card rendered
        │
        ▼
audioEnabledForThisClient()? ── no ──► render text only, done
        │
       yes
        ▼
segments = splitSegments(stripSidecar(prose))
cacheKey = cacheKey(segment.text, voice, model, speed)  // per segment
        │
        ▼
cache hit? ── yes ──► load blob URL, render ▶ play button
        │
        no
        ▼
autoplay && userGestureReceived? ── no ──► render ▶ play button, idle
        │
       yes
        ▼
synthesise(stream=true) ─► foundry.audio.Sound from chunks as they arrive
        │
        ▼
on completion: write cache, post telemetry row
```

### 7.2 Streaming

ElevenLabs `/v1/text-to-speech/{voice_id}/stream` returns audio as
chunks. `foundry.audio.Sound` accepts a `src` URL, not a stream
directly; the wrapper writes incoming chunks into an
`AudioBuffer` via Web Audio API and signals `Sound` to play as data
accumulates. If streaming fails or the model doesn't support it, fall
back to full generation (single MP3 ArrayBuffer → blob URL → Sound).

### 7.3 User-gesture autoplay

Foundry v13's `game.audio.play` documents that browsers require a user
gesture before audio can play. Foundry maintains an internal queue of
sounds pending the first gesture. For our cards:

- **Click-to-play** (default): the play button click *is* the gesture.
  No queue needed.
- **Auto-play**: the first narrator card after a fresh page load renders
  with a one-time "click anywhere to start audio" overlay across the
  card. Subsequent cards autoplay without the overlay until the next
  reload. The overlay is the gesture-priming mechanism.

### 7.4 Per-segment dispatch

Multi-segment cards (narrator → NPC → narrator) play sequentially in
prose order. Pause and stop apply to the whole `PlaybackSession`,
regardless of which segment is active.

---

## 8. Caching strategy

### 8.1 Key

```
hash = sha256(
  text          + " " +
  voiceId       + " " +
  modelId       + " " +
  speed.toFixed(2)
)
```

`text` is the **segment** text (post-markup strip), not the whole card.
A multi-segment card produces multiple cache entries. This means a
prose chunk that recurs (narrator says "The lights flicker." three
times across the campaign) hits cache from the second occurrence.

### 8.2 Storage

Path: `worlds/${world.id}/audio/${hash.slice(0,2)}/${hash}.mp3`

Two-level fanout (`xx/`) keeps directory listings tractable as cache
grows. Files are uploaded via
`foundry.applications.apps.FilePicker.implementation.upload("data", dir, file, …)`
— the same helper used by `src/sectors/sectorArt.js:225-226`. Persists
across module updates because it lives in the *world* data, not the
module folder (decision: `docs/decisions.md` "Sector background art
storage").

### 8.3 Eviction

Oldest by `stat.modifiedTime` first. Triggered when cumulative size
exceeds `audio.cacheMaxBytes` after a new write. The eviction sweep
runs on the GM client only (world-scoped writes require GM permissions
per CLAUDE.md "Architecture constraints"); player clients write to
cache via the GM-gated flow described in §13.

### 8.4 Re-generation

The cache is content-addressed. Editing the narrator's tone setting,
swapping voices, or changing speed all produce different hashes and
therefore new generations. No invalidation hook needed.

---

## 9. Chat card integration

### 9.1 Card HTML

`postNarrationCard()` in `src/narration/narrator.js:373-401` already
emits the footer:

```html
<div class="sf-narration-footer">
  <button class="sf-correct-fact-btn" data-action="openCorrectionDialog">…</button>
</div>
```

The audio scope adds a sibling button:

```html
<button class="sf-audio-play-btn" data-action="audioPlayToggle"
        aria-label="Play narrator audio" hidden>
  <i class="fas fa-play"></i> Play
</button>
```

`hidden` by default — the renderChatMessage hook unhides it only when
`audioEnabledForThisClient()` returns true. This keeps the card HTML
identical for opted-out players and avoids a layout shift.

### 9.2 renderChatMessage hook

A new hook handler in `src/index.js`, alongside the existing four
(setupCard, narratorCard correction, recap refresh, NWMA roll):

```js
Hooks.on("renderChatMessage", (message, html) => {
  if (!message.flags?.[MODULE_ID]?.narratorCard) return;
  if (!audioEnabledForThisClient()) return;
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;
  onNarratorCardRendered(message, root)
    .catch(err => console.error(`${MODULE_ID} | audio render failed:`, err));
});
```

`onNarratorCardRendered` unhides the button, attaches the click handler
via clone-replace (same pattern as the correction button at
`src/index.js:2381-2390`), and — if autoplay is enabled and the gesture
gate is satisfied — kicks off generation immediately.

### 9.3 Button state machine

```
idle      ▶ Play
loading   ⋯ Loading…   (disabled)
playing   ⏸ Pause
paused    ▶ Resume
error     ⚠ Audio unavailable   (disabled, tooltip explains)
```

State is per-session (per-card), held in a `WeakMap<chatMessage, PlaybackSession>`
inside `src/audio/index.js`. Closing the chat tab and reopening discards
the WeakMap entry; the next render rebinds.

---

## 10. Failure handling and graceful degradation

| Failure | Behaviour |
|---|---|
| API key missing | Play button stays `hidden`. Audio tab shows "no key set" badge. No console noise. |
| 401 from ElevenLabs | First failure: console hint identifying key prefix and likely cause; button enters `error` state on this card. Subsequent cards continue to render the button (in case the key gets fixed in settings). |
| 429 (rate limit) | Surface a one-time `ui.notifications.warn` per session ("ElevenLabs rate limit — pausing audio"); button enters `error` on this card; auto-retry not attempted in v1. |
| Network failure | Same as 429 — no retry, surface once, allow next card to try fresh. |
| Streaming aborted mid-playback | Audio stops; button returns to `idle`; cached partial is discarded (only complete generations write cache). |
| CORS blocked | The first failed request logs a console error referencing `docs/audio-narration-scope.md §1 (CORS caveat)`; `audioEnabledForThisClient()` short-circuits for the rest of the session. Manual reload after CORS is resolved. |
| Budget exceeded | ElevenLabs returns a 401/402 with a budget message; treat as 401-style error per row 1. No hard cutoff in v1 (Q9). |
| Sidecar parse error in upstream prose | Audio still runs on the raw response with markup stripping — sidecar parse failure does not block audio. |
| `<npc>` markup missing in a card that should have had it | Whole card plays in the narrator voice. No degradation visible to the player; audio quality slightly worse for that line. |

**Invariant:** audio failure never blocks chat card rendering. The text
narration appears immediately on `ChatMessage.create()`; audio is layered
afterward via the renderChatMessage hook.

---

## 11. CSS

`styles/audio-narration.css`, imported from `styles/starforged-companion.css`.

```css
.sf-audio-play-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  padding: 0.2em 0.6em;
  background: var(--sf-card-bg, #1a1a1a);
  border: 1px solid var(--sf-card-border, #444);
  color: var(--sf-card-fg, #ddd);
  border-radius: 3px;
  cursor: pointer;
}
.sf-audio-play-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.sf-audio-play-btn[data-state="playing"] { background: var(--sf-accent-bg, #2a2a3a); }
.sf-audio-play-btn[data-state="error"]   { border-color: #884444; color: #cc8888; }

.sf-audio-gesture-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.55);
  cursor: pointer;
  font-size: 0.9em;
  color: #eee;
  border-radius: inherit;
}
```

Approximately 40-60 lines total — minimal. Reuses module CSS vars.

---

## 12. Cost / character budget display

### 12.1 Read

Audio tab calls `fetchSubscription(apiKey)` on panel open (and on a
manual "Refresh" button). The endpoint returns:

```js
{ character_count: 38412, character_limit: 100000, next_character_count_reset_unix: 1717200000 }
```

Display, formatted:

```
Characters this period:    38,412 / 100,000   (refresh)
Resets:                    2026-06-01
```

### 12.2 Per-call estimate

Generation cost is character-count × model credit multiplier:

| Model | Credits per character | Cents per 1000 chars (approx, May 2026) |
|---|---|---|
| `eleven_flash_v2_5` | 0.5 | varies by tier |
| `eleven_turbo_v2_5` | 0.5 | varies by tier |
| `eleven_multilingual_v2` | 1.0 | varies by tier |
| `eleven_v3` | 1.0 | varies by tier |

A typical 2-hour session generates ~60 narrator cards (per the pacing
telemetry update in `docs/pacing-scope.md` §13). At ~400 chars per card,
that's 24,000 chars per session — 12,000 credits on Flash, 24,000 on
v3. Cache hits dominate once content recurs.

**No hard cutoff in v1** (Q9). The usage display acts as a soft warning
surface — players who care can self-throttle by disabling
`audio.clientEnabled` mid-session.

### 12.3 Telemetry

Audio decisions get a row in the existing **Pacing Telemetry** journal
under the Starforged Companion folder (created by `docs/pacing-scope.md`
§13). Fields: timestamp, card-id, segments, total-chars,
cache-hit-segments, generation-ms, audio-ms-elapsed, model, voice, error.
Same journal, additional columns; no new journal needed.

---

## 13. Multiplayer / per-client behaviour

### 13.1 Default — per-client generation

The `renderChatMessage` hook fires on every connected client when a
narrator card is created. Each client that has `audio.clientEnabled` true
and an `elevenLabsApiKey` set runs its own generation request. After
the first client finishes and writes to `worlds/${worldId}/audio/`,
subsequent clients hit the cache.

**API call count.** In a 4-player game with audio enabled on all four
clients, each unique narrator card triggers up to 4 ElevenLabs API
calls before the first reaches the cache. Cache hits are free.

### 13.2 GM-gated cache writes

World-scoped `FilePicker.upload(...)` calls require GM permissions per
CLAUDE.md "Architecture constraints". The pattern:

1. Player client generates audio (their own API key).
2. Player client plays audio locally from the raw MP3 bytes (no upload).
3. Player client requests the GM client to write to cache, via a
   `socketlib` or vanilla `game.socket.emit` message carrying the hash
   and the bytes.
4. GM client receives, validates, uploads, and broadcasts the cache URL.

If no GM is connected, audio still plays on the local client; only cache
write is skipped. Re-asks of the same content will re-generate until a
GM is present to commit.

### 13.3 Alternative considered

The packet's Q10 raised "GM client generates once, broadcasts the audio
file path to other clients via socket" as a cheaper architecture. We
default to per-client per the packet's recommendation; if real session
data shows the per-client cost is prohibitive, the cheaper architecture
is a §18 follow-on. The cache write protocol described in §13.2 is the
prerequisite for the cheaper architecture, so building it now leaves the
path open.

---

## 14. Integration points

### 14.1 Pacing

Pacing produces `narratorCard: true` cards for `NARRATIVE` and
`NARRATIVE_WITH_MOVE_AVAILABLE` outputs via `narratePacedInput`
(`src/narration/narrator.js:772`). The `pacedNarrative: true` flag is
present but the audio pipeline keys on `narratorCard: true` only — both
paced and move-resolution cards play uniformly.

### 14.2 Fact continuity

Already discussed in §6.4. Sidecar extraction runs before audio
segmentation; the JSON block never reaches the TTS request. The fact
continuity correction dialog (§10 of fact-continuity-scope.md) does
**not** invalidate audio cache when a truth is retracted — the prose
itself is unchanged (corrections amend the ledger, not the historical
narration). Cache stays valid.

### 14.3 Scene interrogation

`interrogateScene` (`src/narration/narrator.js:672`) creates a
`narratorCard: true` card. Audio applies. No special-case logic.

### 14.4 Private channel (planned)

`docs/private-channel-scope.md` describes a floating ApplicationV2
window for solo narrator conversations. Per that scope's §16, audio is
expected to apply transparently — narrator responses inside the private
channel render through the same narrator pipeline and gain audio
controls the same way. The private-channel scope ships first without
audio, then audio attaches automatically when this scope ships, provided
the private-channel transcript renders narrator output with the
`narratorCard: true` flag (a one-line addition).

### 14.5 Sector creator narrator stubs

Sector creator generates narrator-style journal entries (sector
overview, settlement vignettes). These are *journal* content, not chat
cards, and have no audio controls in v1. The pattern is symmetric and a
§18 follow-on could add controls in the journal renderer.

---

## 15. Testing

### 15.1 Unit tests — `tests/unit/audio.test.js`

```
splitSegments()
  ✓ returns one narrator segment for prose with no <npc> tags
  ✓ splits on a single <npc>…</npc> into three segments (narrator, npc, narrator)
  ✓ handles multiple <npc> blocks in order
  ✓ ignores <npc> tags inside the sidecar (sidecar already stripped — sanity check)
  ✓ never returns an empty segment

stripMarkup()
  ✓ removes <npc> open/close pairs while preserving inner text verbatim
  ✓ leaves prose untouched when no tags present
  ✓ is idempotent

cacheKey()
  ✓ produces stable hash for identical inputs
  ✓ differs when text changes by one character
  ✓ differs when voice/model/speed change
  ✓ speed encoded to 2 decimals (1.0 and 1.00 produce same hash)

cache.lookup() / cache.write()
  ✓ write then lookup returns the same blob URL
  ✓ lookup returns null for unknown key
  ✓ evictIfOverflow drops oldest first

audioEnabledForThisClient()
  ✓ false when audio.enabled (world) is false
  ✓ false when audio.clientEnabled is false
  ✓ false when elevenLabsApiKey is empty
  ✓ true when all three preconditions met

ELEVENLABS_MODELS
  ✓ Flash v2.5 present with creditMultiplier 0.5
  ✓ all entries have id, label, creditMultiplier
```

### 15.2 Quench integration — `starforged-companion.audio`

```
Settings panel
  ✓ Audio tab renders for GM with voice/model/speed/budget fields
  ✓ Audio tab renders for non-GM with enable/volume/autoplay only
  ✓ saving an ElevenLabs key updates settings and shows "● Set"
  ✓ master toggle off → play button hidden on subsequent cards

Markup
  ✓ narrator card with <npc> tags renders clean prose in chat
  ✓ audio pipeline splits the same card into two voices

Pipeline (mocked synthesise + FilePicker.upload)
  ✓ click play on a fresh card triggers synthesise then plays
  ✓ click play on a cached card skips synthesise and plays
  ✓ autoplay attempts to start without click after gesture-priming
  ✓ first card of session shows gesture overlay; second does not

Failure paths
  ✓ missing key → button hidden, no console error
  ✓ 401 → button enters error state, tooltip shown
  ✓ CORS error → button hidden module-wide for the session
  ✓ sidecar parse failure → audio still works on the prose

Multiplayer (single-Foundry test mode)
  ✓ second client renders own play button independently
  ✓ second click on same content hits cache
```

### 15.3 Manual playback verification

Smoke checklist for the implementer:

1. Set ElevenLabs key in About tab, ElevenLabs voices in Audio tab,
   `audio.enabled` true (world), `audio.clientEnabled` true (client).
2. Trigger a move; click play on the narrator card — confirms text → TTS
   → playback round-trip.
3. Repeat the same move text; confirm cache hit (instant playback,
   telemetry row shows `cache-hit-segments` > 0).
4. Trigger a narrator card whose response contains a quoted NPC line;
   confirm the model emits `<npc>` markup (visible in raw flag) and the
   audio uses the secondary voice for that segment only.
5. Turn `audio.clientEnabled` off; confirm play button disappears on
   subsequent cards.
6. Invalidate the key (rotate it on elevenlabs.io); next click shows the
   error state and the console hint identifies the key as bad.

---

## 16. Implementation order

1. Write `src/audio/segments.js` — `splitSegments`, `stripMarkup` —
   pure functions, fully unit-testable, no Foundry deps.
2. Write `src/audio/cache.js` — `cacheKey`, `lookup`, `write`,
   `evictIfOverflow`, parameterised on the FilePicker helper.
3. Write `src/audio/elevenlabs.js` — `synthesise`, `fetchSubscription`,
   `ELEVENLABS_MODELS`.
4. Write `tests/unit/audio.test.js` covering the above three.
5. Register settings (world: `audio.enabled`, voices, model, speed,
   `audio.cacheMaxBytes`; client: `elevenLabsApiKey`,
   `audio.clientEnabled`, `audio.volume`, `audio.autoplay`).
6. Extend `#renderAboutPane` with the ElevenLabs key entry and the
   `#onSaveApiKeys` handler.
7. Add `#renderAudioPane(ctx)` and wire the new Audio tab into the
   panel's tab dispatcher.
8. Write `src/audio/playback.js` — `PlaybackSession` wrapping
   `foundry.audio.Sound`, gesture-priming overlay.
9. Write `src/audio/index.js` — `onNarratorCardRendered`,
   `audioEnabledForThisClient`.
10. Wire the renderChatMessage hook in `src/index.js`.
11. Append `appendNpcMarkupInstruction` to `narratorPrompt.js` and
    conditionally include it from `buildNarratorSystemPrompt`.
12. Add CSS in `styles/audio-narration.css`; import from
    `styles/starforged-companion.css`.
13. Add the GM-gated cache-write socket handler (§13.2) — `socket.emit`
    on the player side, `socket.on` on the GM side.
14. Add Quench integration batch (`starforged-companion.audio`).
15. Update `packs/help.json` — add Audio Narration entry to the
    Settings Reference page and a brief "Audio" entry on the main page.
16. Update `CHANGELOG.md` and `docs/scope-index.md`.
17. Verify CORS empirically against the live ElevenLabs API. If blocked,
    update §1 with the regression and switch the feature to a §18
    follow-on.

---

## 17. Design decisions

**Q1. Single secondary voice for v1.** Per-NPC voice assignment would
require stable named entities with persistent voice metadata. Narrator
Entity Discovery v3 already provides stable entity IDs, but the routing
("which voice for *this* NPC mention") needs a lookup at audio-pipeline
time that doesn't yet exist. Single secondary voice is the cheap
cleavage: the narrator decides at prose time whether a line is NPC
dialogue (via markup); the audio pipeline doesn't need to know *which*
NPC. Per-NPC voice is §18.

**Q2. Inline markup, not sidecar fold-in.** The packet's Q2 deferred
this to whether fact-continuity landed first. Fact-continuity did land.
On inspection, folding audio segments into the sidecar means duplicating
the prose body inside `audioSegments[].text`. Two sources of truth, same
content, twice the output tokens. Inline markup adds ~20 bytes per NPC
line and keeps prose as the single source. Quote detection was
explicitly rejected: player-character dialogue is also in quotes, and
flattening it to narrator voice (the right behaviour) requires
distinguishing speakers regardless. Inline markup forces the narrator to
make the decision once, in the right place.

**Q3. Click-to-play default.** Surprise audio at the table is bad UX —
headphones not on, family nearby, multiple Foundry tabs open. A
per-player auto-play setting flips this, gated by the user-gesture
priming overlay on the first card of the session.

**Q4. Narrator cards only.** Move-confirmation cards, scene-response
cards, recap cards, NWMA roll cards, and system cards do not play
audio. The audio trigger is the `narratorCard: true` flag — the
existing canonical signal for "this card contains narrator prose."

**Q5. Voice ID text input.** Matches the API-key pattern (user obtains
the value externally and pastes it in). An in-module voice browser
would require ElevenLabs voice-listing API integration, audio preview
playback in a settings panel, and search/filter UI — three new
features. Defer to §18. Pre-population with two sane defaults (Rachel
and Adam) gives a working configuration out of the box.

**Q6. Model dropdown with four curated options.** `ELEVENLABS_MODELS`
in `src/audio/elevenlabs.js` is a static list with model id, label, and
credit multiplier. Default is Flash v2.5 — fastest, lowest cost,
appropriate for narrator-length output. Changing this list is a code
change rather than a settings change so it gets reviewed; ElevenLabs
deprecates models periodically and a stale dropdown should fail
visibly. GM-level because cost and quality are shared concerns.

**Q7. Content-addressed cache, two-level fanout.** sha256 of
`(text, voice, model, speed)` is overkill for collision risk but cheap
to compute and gives a free invalidation contract — changing any input
produces a different hash and a new generation. Two-level directory
fanout (`xx/yyyy…`) keeps any single directory under a few thousand
entries even at large campaign scale. Files persist in
`worlds/${world.id}/audio/` for the same reason sector art lives there
(decision: `docs/decisions.md` "Sector background art storage"):
module reinstalls wipe `modules/` but never touch `worlds/`.

**Q8. Streaming where possible, full generation fallback.** ElevenLabs'
streaming endpoint reduces perceived latency from ~1-3 seconds to
~75-300ms (model-dependent). Foundry's `Sound` class is happy to play
from incrementally-arriving chunks via the Web Audio API. If the
selected model doesn't support streaming, full generation is a
transparent fallback — the cache key is identical, so a streamed
generation and a full generation of the same content collide and only
one is written.

**Q9. Read-only budget display, no hard cutoff.** A hard cutoff requires
real-time character accounting on every TTS call, error handling for
the cutoff state, and player communication about why audio stopped
mid-session. Read-only display on the Audio tab is much simpler and
catches the common case (a player checking their usage between
sessions). ElevenLabs returns a soft 401-style error if the budget is
exceeded mid-call; that surfaces via the existing failure path (§10)
and a one-time `ui.notifications.warn`.

**Q10. Per-client generation with GM-gated cache writes.** API call
fan-out is bounded by cache hits — after the first generation, the
remaining clients hit cache. For a 4-player table the worst case is 4×
the API cost on truly novel prose, but the steady-state recurrence of
common phrases ("The lights flicker," etc.) collapses this. The
alternative — GM client generates once and broadcasts — saves cost but
requires a socket-based audio-bytes broadcast and breaks if the GM is
disconnected. Defer to §18. The cache-write socket handler (§13.2) is
the prerequisite either way.

**Q11. Private channel audio carries through transparently.**
`docs/private-channel-scope.md` describes a floating window for solo
narrator conversation. As long as the private-channel transcript posts
its narrator outputs with `narratorCard: true` on the card flag, the
audio pipeline already applies. No special-case code in this scope.

**Q12. GM-level playback speed, single value.** ElevenLabs supports
`voice_settings.speed` (0.7-1.5). Applying GM-level means a shared
listening experience and a single value baked into the cache key. A
per-player speed override would mean per-player cache entries for
identical content, multiplying generation cost by the number of distinct
speeds in use. If individuals want a different speed, the
client-side `<audio>` element playback rate is a no-cost local
adjustment; expose this in client settings as a §18 follow-on if real
users ask for it.

---

## 18. Follow-on / future work

- **Per-NPC voice assignment.** Requires a voice-id flag on entity
  records and a lookup at audio-pipeline time. Depends on Narrator
  Entity Discovery (✅ shipped) and a voice-management UI in the
  entity panel.
- **In-module voice browser.** Lists voices from ElevenLabs' voices
  endpoint, plays a 5-second preview in-panel, lets the GM pick by click.
  Substantial UI work; Q5 deferred it for v1.
- **GM-broadcast audio architecture.** GM client generates and uploads;
  player clients fetch the URL via socket. Cuts API cost by ≤N× for an
  N-player table. The cache-write socket handler in §13.2 is the
  prerequisite; the broadcast handler is the additional piece.
- **Ambient scene audio.** Sector backgrounds, location ambiences, and
  encounter beats could carry generated or curated ambient soundscapes.
  Out of scope here; would build on `foundry.audio.AmbientSound` rather
  than the narrator card pipeline.
- **Sector overview journal audio.** Journal entries (sector overview,
  settlement vignettes) don't currently have audio controls. A journal
  renderer could add a play button to narrator-stub entries.
- **Per-player playback speed.** A client-side `<audio>` rate adjustment
  bypassing ElevenLabs' speed parameter — no cache impact, no extra
  generation cost. Add when a real user asks.
- **Pop-out audio control.** A persistent floating audio control surface
  (play/pause/volume) usable while the chat scrolls. Useful for
  long-form narrator output. Builds on Foundry v14 pop-out applications.
- **Voice preview in Audio tab.** "Test narrator voice" button generates
  a fixed 5-word sample with the current settings; useful when the GM is
  picking voices. Cheap to add once `synthesise` is wired.
- **Hard budget cutoff.** Configurable per-month character cap with
  forced disable when reached; useful for shared accounts. Out of scope
  for v1 per Q9.

---

## Appendix A — Source packet positions

| Packet question | Position taken | Section |
|---|---|---|
| Q1: single vs per-NPC voice | Single secondary voice for v1 | §17 Q1 |
| Q2: markup vs sidecar vs quote detection | Inline `<npc>` markup; sidecar untouched | §6, §17 Q2 |
| Q3: auto-play vs click-to-play | Click-to-play default, autoplay setting-gated | §17 Q3 |
| Q4: trigger scope | `narratorCard: true` cards only | §17 Q4 |
| Q5: voice picker UI | Text input for voice ID | §17 Q5 |
| Q6: model picker | Curated dropdown, GM-level | §17 Q6 |
| Q7: caching | sha256 content hash, world-scoped path | §8, §17 Q7 |
| Q8: streaming | Stream where supported, full-generation fallback | §7.2, §17 Q8 |
| Q9: budget display | Read-only, no hard cutoff | §12, §17 Q9 |
| Q10: multiplayer | Per-client generation; GM-gated cache writes | §13, §17 Q10 |
| Q11: private channel | Transparent passthrough | §14.4, §17 Q11 |
| Q12: playback speed | GM-level single value | §17 Q12 |

**Positions are confirm-before-implementation.** Any §18 item escalated
during implementation requires a scope revision.
