# CI & End-to-end testing — rules

Topic-specific knowledge for the three-phase CI stack at `test/ci/` and
`.github/workflows/e2e.yml`. Read before touching the e2e suite or the
Docker scaffolding.

**Phases:**
1. Local Docker stack (`test/ci/`) — Foundry + foundry-ironsworn + Quench + module under test, driven manually via browser.
2. Cypress spec (`test/ci/cypress/`) — automates the manual ritual + invokes `quench.runBatches()`; then the second-client suite (`test/ci/playwright/`) runs a GM and a player browser against the same world.
3. GitHub Actions (`.github/workflows/e2e.yml`) — runs the same orchestrator on every PR open/sync.

## Cypress: Foundry v13 first-launch ritual

Gate every step by **URL pathname**, not form IDs / class names — Foundry's
internal markup shifts between v13 patch releases, but the routes are stable.

| Route | What's there | How to advance |
|---|---|---|
| `/license` | EULA dialog | Tick the "I agree to these terms" checkbox (force-check — custom-styled label overlaps the input). Click the **Agree** button (text-match `^agree$`, NOT `name="agree"`). |
| `/auth` | Admin password prompt — *new in v13, was not at `/setup` in v12* | Type into the first visible input (only one on the page). Submit via `{enter}`. |
| `/setup` | World list + system/module tabs | Click the **Worlds** tab if not active; locate the tile via `[data-world="<id>"]` OR `[data-package-id="<id>"]` OR text-match-then-closest. Launch button is `a.control.play` on v13.351 — not a `<button>`. |
| `/game` | The world is live | `cy.window().should(win => expect(win.game.ready).to.equal(true))`. |

**Interstitials that block headless runs:**

- **Onboarding tour** (`Backups Overview`, etc.) — auto-launches on first `/setup` visit. Dismiss before clicking the world tile; falls back to `{esc}` keystroke.
- **World Data Migration dialog** — appears on first launch of a world whose stored `coreVersion` < running Foundry. **Uncheck "Create a backup"** before clicking `Begin Migration`, or Foundry pivots to a second "Creating Backup" dialog asking for an optional note.
- **First-launch's GPU-stall WebGL warnings** — benign noise from Pixi.js running on Chromium's deprecated software WebGL fallback. Don't try to "fix" these in the spec.

**Module enablement:** `await game.settings.set("core", "moduleConfiguration", {...})` + `cy.reload()`. The reload drops you back at `/game` (already-joined) on most builds; handle a possible re-join screen defensively.

## Cypress: programmatic Quench

`quench.runBatches(pattern, { json: true })` is the API. Two non-obvious
landmines:

1. **The results-panel UI must be rendered first.** `QuenchResults._setElementDisabled` throws `Cannot read properties of undefined (reading 'querySelector')` on the Mocha-runner start event if `this.element` is undefined. In normal use the GM clicks a toolbar button; headless Cypress doesn't. Either render the panel programmatically before `runBatches` (try `win.quench.results`, `win.quench.app`, or instantiate `QuenchResults`) **or** monkey-patch `_setElementDisabled` to a no-op (headless reads stats from the runBatches return, not from DOM).
2. **`cy.then()`'s timeout is independent from `cy.window()`'s.** Both default to 30s. The Quench suite takes ~2 min. Pass `{ timeout: 900000 }` to BOTH:
   ```js
   cy.window({ timeout: 900000 }).then({ timeout: 900000 }, async (win) => { ... });
   ```
3. **Await the `runBatches` promise directly.** Don't poll `quench._mochaRunner.stats.end` or listen on `quenchReports` — the property name varies across Quench builds. The promise resolves when Mocha emits `end`.
4. **Result shape varies.** `runBatches` may return: the Mocha runner directly (has `stats`, but `failures` is a *count*), or `{ json: {...} }`, or `void` with the report in `win.quench.reports[-1]`. Use `stats.failures` (number) for the assertion gate; only iterate `report.failures` when it's an Array.

## Local Docker stack (`test/ci/`)

**Image:** `ghcr.io/felddy/foundryvtt:13`, pinned `hostname: starforged-ci-host` for license fingerprint stability.

**Credentials:** macOS Keychain via `scripts/lib/keychain.sh`. The helper falls back to `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` / `FOUNDRY_ADMIN_KEY` env vars when `CI=true` or on non-Darwin hosts — same `e2e.sh` works locally and in GitHub Actions.

**Bind mount:** `./data:/data`. `reset.sh --yes` wipes this; `e2e.sh` preserves `./data/container_cache/` across resets so the Foundry zip doesn't re-download.

**Host curl is unreliable on macOS** — Anaconda's CURL_CA_BUNDLE breaks system curl. `install-deps.sh` routes through `curlimages/curl:8.10.1` in Docker for SSL stability. Host `python3` only parses JSON from stdin (no SSL needed there).

**Apple bash 3.2 quirk:** `"${arr[@]}"` under `set -u` errors as "unbound variable" when the array is empty (pre-bash-4.4 bug). Use `${arr[@]+"${arr[@]}"}` for safe empty-array expansion.

**Release lookups are authenticated in CI:** `install-deps.sh`'s `github_release_zip_url` asks `api.github.com` for the foundry-ironsworn and Quench release assets and sends `GITHUB_TOKEN` as a Bearer header when it is set. The workflow's e2e step passes `GITHUB_TOKEN: ${{ github.token }}`; without it the lookups share the runners' unauthenticated rate limit and can 403 before Foundry starts (issue #364 E2E-INSTALL-UNAUTHENTICATED-API — one of PR #363's runs did). Locally the token is optional.

## GitHub Actions (`.github/workflows/e2e.yml`)

**Triggers:** `pull_request: [opened, synchronize, reopened]`. *Not* `push` — per-PR cadence, not per-commit. `concurrency.cancel-in-progress: true` supersedes older runs.

**Paths filter:** matches changes under `src/`, `tests/`, `test/ci/`, `lang/`, `styles/`, `packs/`, `module.json`, `package.json`, `package-lock.json`, `.github/workflows/e2e.yml`. Docs-only PRs (changes only to `docs/`, `CLAUDE.md`, `rules/`, `*.md`) don't trigger the suite. Use empty commits cautiously — they pass the paths filter (no path changed → nothing matches) and **skip** the workflow.

**Repo settings prerequisites:**
- *Settings → Actions → General → Actions permissions* must allow GitHub-published actions (`actions/checkout`, `actions/upload-artifact`). The most restrictive ("Allow [owner] actions only") blocks the workflow at startup.
- Secrets: `FOUNDRY_USERNAME`, `FOUNDRY_PASSWORD`, `FOUNDRY_ADMIN_KEY`. The workflow validates them in a fail-fast step before paying the Docker-pull cost.
- **Branch protection:** the `Quench full suite` check must be configured as a **required status check** on `main` (Settings → Branches → Branch protection rules). Without this, a maintainer can merge a PR with red CI — the workflow is informational, not gating. Code-level anti-false-pass guards (see "False-pass prevention" below) only fire if the workflow actually runs and its result actually matters at merge time.

**Linux bind-mount permissions:** `felddy/foundryvtt` runs as uid:gid 1000:1000 inside; the GHA runner user is 1001. Bind-mounted `./data` is owned by the runner user and the container can't write. `e2e.sh` does `sudo chown -R 1000:1000 ./data` when `CI=true`. (macOS Docker Desktop magic-mounts with permissive perms, so this isn't needed locally.)

**Workflow token permissions:** default is `contents: read`. Add `pull-requests: write` if the workflow posts PR comments via `gh api`:

```yaml
permissions:
  contents: read
  pull-requests: write
```

## False-pass prevention

A "passing" e2e run is only meaningful if it actually exercised the
suite. Three layered guards in `cypress/e2e/quench.cy.js`:

1. **Stale-report guard.** Snapshot `quench.reports.length` before `runBatches`; after, require it grew by exactly 1. If the array didn't grow, either `runBatches` didn't fire a run or we're looking at the wrong collection — either way refuse to assert against a potentially-stale shape.

2. **Pass floor — 95% of attempted.** `expect(stats.passes).to.be.at.least(Math.ceil(0.95 * (tests - pending)))`. Mocha counts `this.skip()` calls as `pending`, not as failures, so a precondition regression that mass-skips the entire suite would show `stats.failures === 0` and "pass" without actually testing anything. The 95%-of-attempted floor (a) scales with the suite size as new batches land, (b) ignores legitimate API-key skips (`skipNoKey`) so the gate doesn't break when CI lacks Claude/OpenRouter/ElevenLabs secrets, and (c) tolerates at most ~5% real failures of what ran. A secondary `at.least(100)` absolute backstop catches the case where the attempted-count itself collapses (most batches converted their failures to skips).

3. **Max-skip ratio.** `expect(pending / tests).to.be.lessThan(0.2)`. Even if the pass ratio holds, an unusually high skip rate means a partial-precondition failure where some batches lost their auth gate.

If the suite shrinks below ~100 active tests in the future, the absolute backstop needs revisiting — but loosening it should be a deliberate, visible change, not silent drift.

**Out of code's reach:** the workflow must be a required status check on `main` (see Repo settings prerequisites above), otherwise none of this matters at merge time.

## Second client: the multiplayer suite (Playwright)

Quench runs as a single GM, so it cannot see the multiplayer bug families:
a player's world write that Foundry refuses, a command that runs once per
connected client, a card button that applies twice. After the Cypress run,
`e2e.sh` runs `test/ci/playwright/multiplayer.mjs` (issue #282 item 6)
against the same live world. It is the only check against real Foundry
permissions and real socket delivery; the unit-level equivalent is the
multi-client harness (`tests/helpers/multiClient.js`).

- **Shape.** One Node process drives two browsers: the GM (`Gamemaster`)
  and a player user it creates (`E2E Player`, who owns a fresh PC). The
  player types commands (`ui.chat.processMessage`, the same path typing
  takes, so the X-Card's `chatMessage` interception fires) and clicks card
  buttons. The GM's page waits on its own `game` state for the result. One
  process keeps every step in a known order, with no cross-process
  synchronisation. Cypress can't drive a second browser, so this is not a
  Cypress spec.
- **Scenarios:** the X-Card; `!oracle` producing exactly one card (and one
  recorded result); a player's Begin a Session persisting (and its dialog
  opening on the player's screen only); Burn Momentum applying once (player
  and GM both click, then the player clicks the spent button); a player's
  Private Lines reaching `campaignState.safety`; a Batch Mode round (issue
  #340: the window opening in the player's browser, a typed line kept as
  table talk, the GM's Send now, one round card credited to the roller —
  Claude answered by a stub on the GM page's `fetch`, since the canonical GM
  reads and narrates); a Notes-tab removal crossing clients (issue #364
  QUENCH-CROSS-CLIENT-STAMP: the GM makes an NPC card with
  `createConnection` and makes the player its owner; the player adds a
  paragraph, then takes one off — the GM's `updateActor` gets the stamp the
  player's `preUpdateActor` put on the update's options for the removal
  only, and the canonical GM reports `entity_detail_removed`. Quench proves
  that stamp on the editing client alone; this is the hop
  `registry.js` `registerSheetNotesRemovalHook` rests on when anyone but
  the canonical GM edits the sheet). Add a scenario as one
  more `await scenario(...)` block. Assert on GM-side state, and wait with
  `page.waitForFunction`, never a fixed sleep (`SETTLE_MS` is only the
  window for a duplicate to show up).
- **Fixtures.** The suite resets the campaign flags it asserts on
  (`xCardActive`, `sessionActive`, the player's Private Lines entry),
  because Quench leaves state behind. It uses only what the module itself
  provides (`/modules/starforged-companion/src/...` dynamic imports,
  `ChatMessage.create`). CI has no Claude key, so pick scenarios that need
  none (session vignettes are unchecked). A scenario that makes documents
  of its own, pins a setting or installs a hook puts all of it back in a
  `finally` on the GM's page (the Batch Mode round; the Notes-tab removal
  deletes its NPC card and waits for the delete's teardown to take the id
  off `connectionIds`).
- **Container.** `mcr.microsoft.com/playwright:v1.56.1-noble` (the
  `players` service, `docker-compose.e2e.yml`) ships the browsers; `npm ci`
  installs `playwright@1.56.1` from `test/ci/playwright/package-lock.json`.
  **Bump the image tag and the package together**: a mismatched package
  can't find its browser.
- **Result.** The suite runs whatever Cypress's result (a Quench failure
  doesn't make the world unusable), and `e2e.sh` fails if either part
  failed. The orchestrator log carries `[multiplayer] PASS / FAIL` lines,
  the page console errors on failure, and a final `summary` JSON line.
  Failure screenshots land in `test/ci/playwright/artifacts/` and upload
  with the Cypress artifacts.
- **Validating on a branch without a PR.** `e2e.yml` has a
  `workflow_dispatch` trigger (`mcp__github__actions_run_trigger`,
  `method=run_workflow`, `ref=<branch>`). There is no PR, so there is no
  sticky comment: poll the run's status (the public API is enough for a
  public repo) and read the log with `mcp__github__get_job_logs`.

## Scripted playthroughs: the narrator end to end (Playwright, recorded Claude)

After the multiplayer suite, `e2e.sh` runs `test/ci/playwright/playthrough.mjs`
(issue #290 part 2) in the same `players` container: a GM and a player play a
short scripted session, and the GM's client narrates through the real
pipeline — pacing, interpretation, the confirm dialog, dice, narration, the
fact block, detection and draft cards, End and Begin a Session.

- **Claude, answered at the fetch boundary** (`lib/claude.mjs`). An init
  script wraps `window.fetch` in both pages; a call to `api.anthropic.com` is
  handed, with the JS stack at the call, to a function exposed from the Node
  process. The page never reaches the network for Claude (no CORS), and the
  GM holds a placeholder key. A call's **kind** is the two named module
  frames above `apiPost` — `callNarratorAPI>narrateResolution`,
  `callHaiku>defaultCallDetectionAPI`. Each call is filed under the scenario
  step during which it started (the runner waits for 4 s with no call
  before a step's checks, and every background pass starts within 2 s), and
  a recording run stores that step on every exchange. A request gets an
  unused recording of its kind **from its own step** first, whatever its
  words (the step and the kind pin the call, so a prompt edit doesn't lose
  its reply); then an untagged recording, only when the request holds at
  least half of its words, so a call nothing was recorded for (the tier pass
  a vignette schedules, say) can't take the reply meant for a later call of
  its kind; then, in a permissive scenario only, another step's recording on
  the same floor (a late background call). Among several, the one sharing
  the most words wins (ties: the earliest, logged `AMBIGUOUS`).
- **Recordings** live in `test/ci/playwright/recordings/<scenario>.json`
  (not `tests/fixtures/`). Record them outside CI with a key:
  `ANTHROPIC_API_KEY=… test/ci/scripts/e2e.sh --record-playthroughs`, then
  commit the rewritten file. A recording run stores each reply with the
  entity ids the model echoed (`(id: …)` record headers) replaced by the
  entity's name — ids differ in every fresh world, and the readers that take
  an id accept the name. Both scenarios' recordings are from the live model
  (`"source": "recorded"`, since 2026-11-22). A file with `"source":
  "hand-written"` is a
  placeholder written to the parsers' formats; the log says so when it
  replays one.
- **Permissive scenarios report drift; strict ones fail it** (issue #302
  slice A). A call with no recording left gets a neutral stub (narrator
  prose with an empty fact block; `{}` for a JSON helper) and an
  `UNRECORDED <kind>` line. A recording whose system-prompt sections differ
  from the live request — entity ids and numbers normalised away — logs
  `STALE <kind>`: re-record. The check compares section *headings*: a
  sentence reworded inside a section, a line added to a context block, or a
  call's parameters (its token cap) changes none, and nothing is logged —
  the recording is older than the prompt and only the commit history says
  so (issue #374 A9, A12 and A5 each changed a prompt this way). The per-kind call counts, and any recording
  nothing asked for, are logged after each scenario.
  A scenario marked `"strict": true` names every step (`id`) and declares
  its Claude calls: `calls` (each one required once, with an optional
  **contract** — `carries` / `lacks` section headings, `section` /
  `sectionLacks` text within a section, `contains` text anywhere) and
  `optionalCalls` (kinds allowed in that step; the scenario's own
  `optionalCalls` apply to every step). After each step, before its checks,
  the runner waits (up to 20 s) until the step's required calls — and the
  optional ones its recording made in that step — have started, then for
  4 s with no call: a slow runner fires the passes' 2 s timers late (CI run
  245 reported them `MISSING`). It then fails the step on a required call
  that is `MISSING`, `UNRECORDED` (the stub answered it) or breaks its
  `CONTRACT`, and on an `UNEXPECTED` call nothing declared; an optional call
  is logged `OPTIONAL`. A contract fails even when a recorded reply
  answered the call, so the prompt can't lose data a canned reply would
  paper over. STALE stays a warning: a prompt change does not need a key to
  merge unless it breaks a contract. first-session and batch-round are
  strict; `tests/unit/playthroughReplay.test.js` checks their declarations
  against their recordings on every PR, no Foundry needed.
- **Scenarios are data** (`playthroughs/*.json`): the seed (PC, sector,
  ship, settlements, where they are, and optionally a sector map — a flagged
  scene with a pin per settlement and the ship's token on one), the settings
  the run pins (restored after), and steps — `beginSession`, `move` (with
  scripted dice and the expected move and outcome), `say` (a paced line),
  `confirmDraft`, `privateChannel` (builds the player's Private Channel prompt
  in their browser; `expectCard` pins whether a named NPC's card is in it),
  `dragShip` (drops the ship's token on a settlement's pin; checks the token
  stays put while the Set a Course it starts is pending), `endSession` (done
  when the session is closed and its End a Session card is posted — not when
  a closing cutaway is: since issue #381 one is posted only when someone or
  somewhere can be shown; `closingVignette: true` waits for one),
  the Batch Mode steps (issue #340: `batchMode` — the GM's toolbar switch;
  `roundSubmit` — an action written in its author's Round window and read on
  the canonical GM, `reads` / `move` pinning the reading; `roundConfirm` —
  Confirm in the window, `resolves` waiting for the round card, its `acted`
  characters and `outcomes`, and the next round; `sendNow` — the GM's Send
  now; the seed's `gmPc` assigns the GM a PC of their own),
  `expect` — each with `then` checks. The checks (`moveLockReleased`,
  `ledgerTruth`, `npcCard`, `noDraftFor`, `sessionLog`, `journalPage`,
  `momentum`, `shipPosition`, `shipToken`, `currentLocation`, `card`,
  `round`, `roundCards`, `noMarkup`) poll for up to 20 s — what a request carried is a strict
  step's call contract, not a check; the
  runner first waits until no Claude call has started for 4 s, so the passes
  a narration schedules 2 s later have landed (a negative check would pass
  vacuously before them). `PLAYTHROUGH=<name>` runs one scenario. Part 3's AI
  playtester reuses the format.
- **Fresh world per scenario.** The runner deletes the chat, every actor and
  every journal but the help journal, every sector scene, and resets
  `campaignState` to its
  registered default before seeding — earlier suites leave all of these
  behind, and a replay must meet the world its recording met.
- **Scripted dice.** The resolver rolls with `Math.random` inside `rollDie`
  (challenge dice, then the action die). The GM page's init script answers
  only calls made directly from `rollDie` from `window.__sfcDice`; every
  other caller gets real randomness. A `move` step fails if any scripted die
  went unrolled.
- **Record mode needs the scenario to steer the model.** A live model may
  name the NPC differently or pick another move; name what the checks look
  for in the player's lines, and check structure (a card exists, its
  description isn't empty) rather than prose. A recording run that fails —
  a check, or a strict call declaration — leaves `recordings/` untouched:
  its capture goes to `artifacts/recordings/<scenario>.rejected.json`, and a
  recording marked `"passed": false` is refused on replay. A passing run's
  recording carries its provenance (`scenarioRevision`, the hash of the
  seed, settings and steps it was captured against, then `provenance`: when,
  the commit, the models) and each exchange its step and prompt
  `fingerprint`. Review the run's checks and the replies before committing
  it; a later run whose scenario revision differs logs `SCENARIO-REVISED`.
- **Result.** `[playthrough] PASS / FAIL` lines, `FINDING` lines (the
  Private Channel probe), a final `summary` JSON line. Each result keeps
  three things apart: `verdict.replay` (strict: `valid` / `invalid`;
  otherwise `permissive` with its stub count), `verdict.integration` (the
  checks: `pass` / `fail` / `not reached`) and `verdict.narratorQuality`
  (never assessed here). A failure is classed `infrastructure` (before the
  first step), `replay` or `integration`. On failure, the screenshots and
  `playthrough-<scenario>-requests.json` (every call's step, kind, source
  and user message) land in `test/ci/playwright/artifacts/`.

## Cloud sessions (`test/ci/scripts/cloud.sh`)

The stack also runs inside a Claude Code cloud session — `cloud.sh up`, then
`playthroughs [--record]`, `multiplayer`, `quench` — with the session's own
Playwright and Chromium in place of the Cypress and Playwright images. Every
suite stages the module from the working tree before it runs (`stage_module`);
it used to be staged at `up` alone, and the long haul's second live run ran a
copy older than the commit it recorded (known-issues EXPLORE-RAN-A-STALE-MODULE). CI is
unchanged and is still the gate; this is for recording playthroughs and for
looking at a live world from a session. What it took, each of which fails
silently or misleadingly when it is missing:

- **Host network, not the bridge.** The session's outbound HTTPS goes through
  a proxy on its loopback (`HTTPS_PROXY`), re-signed by its own CA. A
  container on Docker's bridge cannot reach it. Foundry runs with
  `--network host`, the CA bundle mounted, and `HTTPS_PROXY` /
  `NODE_EXTRA_CA_CERTS` / `NODE_USE_ENV_PROXY=1` set (Node ≥ 22.21 routes
  `fetch` through the proxy with that flag).
- **The image's launcher drops the proxy address.** felddy's `launcher.sh`
  starts Foundry with `env -i`, carrying only `HOME`, `NODE_*` and `TZ`. The
  entrypoint's own steps (sign-in, download) keep the proxy; Foundry does not,
  and its licence signature fails as "License signature server was unable to
  be reached" — which it also says for any HTTP error. `cloud.sh` mounts a
  copy of the launcher with the proxy variables added to that pass-list, and
  stops if the pass-list line is no longer in the image.
- **Four Foundry hosts, not one.** `foundryvtt.com` (sign-in),
  `r2.foundryvtt.com` (the download), `api.foundryvtt.com` (the licence
  signature — a different host, and an allow-list is exact), plus
  `pkg-containers.githubusercontent.com` for the image's layers (`ghcr.io`
  alone answers the manifest and then fails on the first blob).
- **No Docker Hub, no GitHub API.** Anonymous Docker Hub pulls are
  rate-limited (429) from shared addresses, so nothing there is used; and the
  GitHub API answers 403 for any repository the session was not given, so the
  system and Quench come from their release download addresses (the system's
  version is read from `install-deps.sh` — one pin).
- **Restarts.** The machine restarts between commands now and then: Docker is
  down, the proxy has a new port, and `/var/run` still holds the old pid
  files — once another process has taken one of those numbers `dockerd`
  waits for "its" containerd and exits after 15 s. `cloud.sh` clears them
  when neither daemon is running. `./data` (the Foundry zip, the signed
  licence) survives, so `up` again takes about a minute.
- **The first-launch ritual, in Playwright** (`playwright/first-launch.mjs`):
  the onboarding tour's overlay fades out over the world tile, so a click
  made at the tile's coordinates lands on the overlay — wait for it to be
  gone and click the control itself (`el.click()`); and no Escape after the
  launch click, which closes the World Data Migration dialog the launch
  opens (the world then never starts, with no error).
- **`runBatches` can resolve before the run** (`playwright/quench.mjs`): the
  promise came back at once with a runner whose stats were all zero. A run
  counts only once the runner's `end` has fired — the spec's stale-run guard.
- **Slow, and Quench is not a gate there.** No hardware acceleration (1 FPS
  on the canvas). Tests with Mocha's default 2 s budget and the batch-mode
  window's waits time out — on released code too (known-issues
  CLOUD-QUENCH-TIMEOUTS). The multiplayer suite passes (7 of 7) on a fresh
  world, and the playthroughs replay; run them in CI's order — the
  multiplayer suite's Begin a Session case times out on a world the
  playthroughs have used.
- **Nothing printed carries a secret.** The credentials are passed to
  `docker run` by name (`-e FOUNDRY_PASSWORD`), never by value; the admin key
  is generated into `./data/cloud/`; Foundry's log is shown through a filter
  that takes out the account name and the licence key (the image prints
  both).

**Recording from a live model** (`playthroughs --record`) is where a
scenario written against hand-made replies meets what the model does:

- A line near the pacing classifier's boundary is read differently from one
  run to the next. "I ask the dockmaster who saw the courier leave" is
  conversation by the classifier's own rule (talking is not a move); "I press
  him hard" is Compel, not Gather Information; "I lean on the counter and
  ask" was conversation in three runs and a move in the fourth. Write a move
  as an action with stakes that fits one move only, and conversation as
  plainly conversation.
- Wording alone did not settle it: at the default dials the same line still
  flipped. A scenario pins its `pacing.dial.*` settings — 10 for the category
  of a line that must be a move, 1 for the category of one that must not —
  and even at social 1 a pointed question to a connection was read as Compel
  two runs in three (known-issues PACING-LOW-DIAL-QUESTION-TO-CONNECTION —
  since fixed: at a dial of 0–2 an unsure move is offered, not rolled):
  where a line must stay narrative, the character tells, and does not ask.
- A check on what the model wrote cannot name what the model will call it.
  `journalPage` takes `pageMatches` and a list of journals for that; a
  contract on a section whose words are the model's pins that the section
  holds something (the recap's `THE RECORD` holds a line of session 1, `[s1-`), not
  a name (the live scribe wrote "Oduya" where the placeholder wrote "Vance
  Oduya").
- **The Chronicle's floor.** The scribe's replies were stored only at
  "significant" or above by default, and a live scribe rated a whole session
  below that: no chronicle, so no campaign recap call, and the step that
  requires one reports it MISSING. The default is "notable" now (known-issues
  CHRONICLE-EMPTY-AFTER-LIVE-SESSION); first-session still pins
  `chronicleSalienceThreshold` to "scene". The recap's source is the session
  record now (issue #382), so a session with any beat has a recap call
  whatever the scribe kept; its reply is cited JSON, and a recorded prose
  reply is asked for once more (an UNEXPECTED second call) — re-record a
  scenario's recap step after the recap's prompt changes. The session
  summary is the same since slice 3 (a cited JSON list, from the session's
  numbered beats): first-session's End step re-records both calls, its
  declarations (the summary's `"THE SESSION": "[1]"`, the recap's `"THE
  RECORD": "[s1-"`) changed with its recording in one commit
  (`playthroughReplay.test.js` plays each against the other). Both calls are
  made through a local `ask`, so the runner names them `callNarratorAPI>ask`.
- The step's wait for its required calls is five times longer in record mode:
  a session's end makes its calls one after another, and each live reply
  takes seconds.
- **Start only when the world is ready for it.** `game.ready` is where the
  module's world-load work starts. The runner waits for the world to stop
  changing before it clears it (`waitForQuietWorld`), and for the GM to be in
  `keyedGmUserIds` before the first step (30 s, failing by name): started
  earlier, the session begins with no narrator and the first step times out
  waiting for a vignette nothing was asked to write.
- **The seed is a writer like any other.** The module answers the runner's
  deletions (a plan whose NPC card went retires its clock) with whole-state
  writes read from the page's cache, and a bare `game.settings.set` of the
  campaign state made while one is in flight is written over by it — the
  last scenario's session came back, already begun, and Begin a Session
  opened no dialog (CI run 45050276295; known-issues
  PLAYTHROUGH-SEED-UNDER-MODULE-WRITES). After clearing, the runner waits
  for quiet again, and its reset and its seed go on the module's write chain
  (`serialiseCampaignStateWrite`, imported from the module in the page). A
  page script that writes `campaignState` any other way races the module.
- **`PLAYTHROUGH_TRACE_STATE=1`** logs every campaign-state write the GM's
  page makes — the session fields written and the module frames it came from
  — into the failure report. It answers "who wrote that back?" in one run.
- A run that fails writes nothing to `recordings/`; expect to run it again —
  after reading why. The failure report has each page's session state (with
  the session's ids), open windows and last chat lines (`logPageState`), and
  the module's own warnings and last debug lines; a dialog that never opened
  is named.
- **A failed run's capture replays for free.** `artifacts/recordings/
  <scenario>.rejected.json` put in place of the recording (with `passed`
  set) reproduces a content-dependent failure with no key; the staged copy of
  the module under `./data` can be instrumented for it. That is how the empty
  Chronicle was found. Put the recording back afterwards.

## AI exploration: a model plays, an observer scores (Playwright, on demand)

`test/ci/playwright/explore.mjs` (issue #302 slice D; #290 part 3) is the
scripted playthroughs' sibling: the same two browsers and the same Claude
harness, with the script replaced by a model that is given a goal. Run it
with `test/ci/scripts/cloud.sh explore [--rehearse | --replay <run folder>]`;
`EXPLORE_CHARTER` picks the charter — `memory` (two short sessions, one fact)
or `long-haul` (three sessions and twenty-seven beats, issue #373; below) —
and `--suite scenarios` runs the short scenarios beside it, one flow each
(below, "A suite of short scenarios").
**Nothing in CI runs it, and nothing may** — a live run spends money and its
result is one sample.

Three roles, and what each may do — keep them apart:

- **The player** (`lib/player.mjs`) gets a persona, a goal and its own
  screen: the chat as rendered (its last twelve messages, and above them the
  cards further up that can still be answered — a person scrolls up to a
  vow's card; a view of the last lines alone hid it), the buttons and
  dropdowns on its cards, an open window's fields and buttons, its own
  character's meters. It acts through one strict
  tool — say, click, choose (an option in a dropdown on a card), dialog, close
  (a window, unanswered), wait, stop — and every action is checked against
  the screen it was chosen on (`validateAction`) before it is taken. It never
  reads world state, never calls a module function, and never says whether
  its goal was met. **Its prompt does not grow with the run**: its standing
  instructions are fixed and sent as a cached block (`cache: true`), and what
  changes — the current beat, its notebook (a `note` it may put on any
  action; the last fourteen are kept), its last fifteen actions, its screen —
  is the same size at action ninety as at action fifteen
  (`playerTurnPrompt`). Do not put anything that changes between two actions
  in `playerSystemPrompt`: it would be a cache write on every turn.
- **The observer** (`lib/observer.mjs`) reads — the GM's world, the chat,
  the requests the harness saw — and never writes. Its verdict is arithmetic
  (`scoreMemory`, `healthOf`, `classifyRun`; for a long run `lib/beats.mjs`,
  `lib/mechanics.mjs`, `lib/ledger.mjs` and `classifyLongRun` — all pure and
  unit-tested): no model is asked whether the goal was met.
- **The review is yours** — the agent that made the run reads it afterwards
  (below). No model reviews a run. The runner had an API reviewer (a model
  shown the transcript alone); it was deleted on the maintainer's instruction
  (2026-11-23): it never saw the prompts or what the helpers wrote, which is
  where the first reviewed run's findings were. Do not add one back without
  being asked.

**The GM is fixed rules, no model** (`lib/gm.mjs`; issue #373, decision 2):
a second model at the table would add variance to exactly the half that must
hold still, and could not be replayed. The rules: a proposed move's
confirmation is accepted as proposed; "Who are you interacting with?" is
answered with the charter's named NPC when the player's line names them and
the window offers them, else "No specific entity", which is what closing it
means; a draft for someone in the charter's `cast` is confirmed **as a person
recorded with no bond on anybody's sheet** — "No one" where the row offers it,
else the row's own Confirm, never a character's "whose connection?" button —
so that it is the player's Make a Connection that makes them the character's
connection; every other draft is left. Nothing else is answered. The fourth
live run's GM pressed the character's button on the draft instead: a bond
with no Make a Connection, so beat 2's roll could never come, and every plea
for a tie was read as Develop Your Relationship (known-issues
CONNECTION-MADE-BY-CONFIRMING-A-DRAFT). The rule reads both cards: today's,
whose person's row asks whose connection with a button per character and
"No one" (`data-actor-id=""`), and the one the moves-as-contracts overhaul
makes (decision D4), whose Confirm records the person and whose Make a
Connection button rolls the move (`lib/gm.mjs` `draftConfirmSelectors`). The
rule the kept runs were made under — the character's button — is kept for
their replays (`gm.draftHolder` in a run's `replay.json` and `run.json`; a run
kept from before the rule was written down has none, and replays as it
pressed), and for a rehearsal that asks for it (`EXPLORE_DRAFT_HOLDER=pc`,
`draftHolderFor`) to walk the fourth live run's road for nothing while
today's card still offers it; a live run is refused it.

**A cast member's draft is theirs under a part of the name** (`lib/cast.mjs`,
`draftToConfirm` in `lib/gm.mjs`). The third live long haul's player named
"Tamsin Vey" in full, the narrator wrote "Tamsin", the module proposed a card
for "Tamsin" — and the rule, which wanted the exact name, left it: beats 2, 3,
18, 22 and 23 were lost with the card. A GM at a table would have pressed it.
So a pending draft is confirmed when its name is a cast member's, or a
whole-word part of one that is no other member's ("Tamsin", "Vey"; not "Tam"),
is a person's draft, and that member has no card yet — never a second card
for someone who has one. Everything that then looks for the card asks the
same question: a beat's `connection(name)` and `castConnection` (the card the
cast member was made as, by `castCardId`, followed by its id), the rename the
runner makes (by that id), and the option a player picks in a dropdown
(`optionFor`: "Tamsin Vey" asked for, "Tamsin" offered). A cast entry that is
another's later name says so (`was`): the long haul's `renamed` is its
`connection` after the rename, one person. **A kept run replays under its own
charter's cast**: the third run's lists the two names as two people, "Tamsin"
is then part of two members' names, and its replay leaves the draft as the
run's GM did.

**An expedition asks the GM nothing new.** Each of its three rolls comes to
the GM as a move's confirmation — a course read as an expedition among them —
and is accepted as proposed; the finish's dice are scripted there. The place
it is for is not a cast member, so a draft for it is left. "Which
expedition?" is asked of the roller, on a card, and only with two open.

**The budget is not advisory** (`lib/budget.mjs`, `explore.config.json`).
Every model call of a run goes through it — the module's (the harness's
`gate`), the player's (`lib/anthropic.mjs`), each retry —
and a call's worst cost is reserved *before* it is sent. A call the budget
refuses is not sent: a module call gets the neutral stub so the page does not
hang, and the run ends as `budget-exhausted` (if the goal had not been put to
the test) with its evidence written. A model with no price is refused. When
you add a model anywhere in the module, add its price to the config
(`exploreRunner.test.js` checks the models the first-session recording used).
**Check the price table against Anthropic's price list before a paid run**
(`prices.asOf`): a cache write costs 1.25 times input kept five minutes and
twice input kept an hour, and the budget prices it by the split a reply's
usage reports — every write was priced at 1.25 until that check was made
(2026-11-23), and the module's narrator writes one-hour entries.

**What the runner had to learn about this table** — keep these when you add a
charter or touch the runner:

- **"The table is done" is counted from the action.** `settle` waits for the
  move lock to be free, no confirmation open, and nothing new for 3.5 s — no
  model call in flight or just started, no write in the GM's world — with the
  quiet clock started at the action itself. Counted from the last call, a
  table that had not begun to answer was taken for one that had finished: the
  session's opening vignette was filed under the player's next line. A dialog
  open on the player's own screen ends the wait sooner.
- **The module asks the GM things, and holds the move while it waits.** The
  first live run sat for three minutes behind "Who are you interacting
  with?" and called it a product failure. A window on the GM's screen that
  the GM's rules do not answer ends the wait after 20 s and the run as
  `not-exercised`, naming the window; the lock that question holds is not a
  health failure (`healthOf` → `waitingOnGm`). When the module gains a prompt
  for the GM, add it to `startGmRules` (`lib/gm.mjs`, and its selector to
  `GM_ANSWERS`) with the answer that steers least.
  The module's own windows are `.application.sf-window`, not Foundry
  dialogs: look for both, on both screens. The memory charter's rehearsal
  never rolls, so it cannot find a prompt on the move path; the long haul's
  does (below).
- **A line of play is settled when it has been answered, not when the table
  goes quiet.** The module pauses between reading a line and narrating it —
  several seconds with no call and no write, longer on a session's first
  line. The first rehearsal that rolled took that pause for the end of the
  turn: the next line arrived while the first was still being resolved, and
  the module answered "Not rolled — another move was being resolved". `settle`
  now waits, for a line of play in an open session, until something answers
  it — a narration, a move's card, a card that asks for a choice
  (`answeredSince`) — and only then for quiet; a line nothing answers in
  `REPLY_WAIT_MS` settles as `unanswered`, which the `answered-once` check
  reports.
- **A result momentum could improve is held.** With momentum high enough to
  burn, a weak hit or a miss is posted with "🔥 Burn Momentum" and "Keep the
  result", and nothing is paid or narrated until one is pressed — or until
  the roller's next line keeps it. A beat that wants the miss paid says to
  press Keep; a check that reads a move's effects reads them where the result
  became final, not where the dice fell.
- **A move card's dice are in its text, not its flags** (`.sf-move-dice`:
  "Action: 4 + 3 = 7 | Challenge: 2, 9", "Progress: 6 | Challenge: 1, 2").
  `parseDiceLine` reads them; the move's id and outcome are on the narrator
  card that shares its `resolutionId`.
- **A miss's price is a d100 the dice script does not see.** Pay the Price
  rolls in `oracles/roller.js`; only one price in four names a suffer move. A
  run keeps the module's other randomness by file (`window.__sfcRandomKept`)
  and a replay hands it back (`__sfcRandomQueue`) — without it a replay
  rolled a different price for the same miss.
- **A player's line is what they typed.** Cards the player's client posts
  (Begin a Session's, a move's) are authored by the player too; they carry
  the module's flags, a typed line carries none.
- **A narrator card's prose is `flags.narrationText`.** Its content also
  holds the card's chrome ("◈ Narrator", the audio buttons).
- **The screen is the rendered text** (`innerText`): `textContent` runs
  blocks together and includes a stylesheet's source.
- **A store that kept the player's line is not memory.** The Pacing Telemetry
  journal logs every line; no narration is built from it
  (`explore.config.json` → `notMemory`). Add a diagnostic store there when
  you add one to the module.
- **A refused write says nothing of who asked.** "User … lacks permission to
  create Item […] in parent Actor […]" reaches the page with the server's
  stack. `installRefusalTrace` (`lib/world.mjs`) keeps the stack of the code
  that asked for every create, update and delete the server refuses
  (`run.json` → `health.refused`): read it before calling an error on a page
  somebody else's.
- **The game system's first-start window** is open on a new player's screen;
  the player is not shown it (`ignoreWindows`).
- **A pressed button is settled when the table has taken it up.** A card's
  button reaches the GM's client by a relay, and the move it asks for starts
  when the relay lands. The first rehearsal with an expedition pressed "🗺
  Finish the Expedition", saw 3.5 s of quiet and typed its next line — into
  the finish's roll, which the relay began some five seconds after the press
  ("Not rolled — another move was being resolved"). `settle` now holds a
  press — a card's button, a window's — until something has happened since
  it: a write in the GM's world, a model call, the move lock — or
  `PRESS_WAIT_MS` (20 s) has passed with nothing. **The press that keeps or
  burns a held result is settled when the result has been narrated**
  (`HELD_RESULT_PRESS`): its narration comes only then, and without the move
  lock — a rehearsal took a burn for settled before its narration had begun,
  the GM's page was reloaded next (the interruption), and the narration and
  the fight's new position went with it (`burn` violated, the reload's beat
  failed).
- **Quiet is longer on a busy machine.** Each of those was a rehearsal made
  beside other work — the unit suite, other sessions' tests: a load of
  seventeen on four cores — where the pages answer slowly and a table takes
  seconds between two of its own writes. `settle` stretches its quiet clock
  by how long the pages took to say how they stand (`stretched`, up to ten
  seconds), and a run is still best made with nothing heavy beside it — or
  with priority over it (`nice -n -10 ./scripts/cloud.sh explore …`, and the
  Foundry container's processes reniced): a Begin a Session's +1 momentum
  landed a step late the same way (`session-momentum` violated), and a
  rehearsal that takes fifteen minutes alone took thirty-four.
- **A session set-piece's dice are a stream of their own** (issue #381). The
  opening, the closing cutaway and the spotlight vignette draw their MATERIAL
  through one function (`drawDie`, `session/sceneSeeds.js`), kept and handed
  back as `random.gm["session/sceneSeeds.js"]`; and a table row that is a
  directive ("Action + Theme", a reference, "Roll twice") makes
  `rollOracle(id, { roll })` roll again through `oracles/roller.js`.
  `installDiceScript` files those roller draws under the set-piece too (a
  draw whose caller is the roller and whose stack holds a set-piece's file):
  under the roller they would take, in a replay, values a run recorded for
  its prices and oracles, and every price after them would come out another.
  The Begin card's spotlight d100 is the pressing client's own roller draw,
  as before; a move's scripted dice and a scripted price are untouched.
- **A run a crash stops has no record of its dice.** The dice are read from
  the GM's page when the run ends; until then the record is `null`, and a
  check with no record is not made. The first rehearsal with the expedition
  crashed at a70 — the machine out of memory, another session's tests beside
  it — kept the empty list the runner then started with, and was scored with
  fifteen rolls "not among the dice that fell": every roll it made. The run's
  class was `infrastructure-error` all the same; read a crashed run's
  mechanics with that in mind, and make the run again.
- **What the table took back, the player is not shown again.** The X-Card
  flags a narration (`flags[module].xCarded`) and leaves its prose in the
  chat log. The third live run's player went on reading it for twenty-two
  turns and brought its content back as the vow's proof. `screenOf`
  (`lib/player.mjs`, the page function behind `snapshotScreen`) leaves a
  flagged message off the screen, and the view's last twelve are twelve
  messages the player is shown.
- **The first vow on a sheet is the background vow.** The module counts a
  quest as "in play" only when something stands before it
  (`src/session/openThreads.js` `questVows`): the long haul's character had
  no other vow, so Begin a Session said "No character has a vow in play
  besides a background vow" with her quest sworn. A seed may put vows on the
  sheet (`seed.pc.vows`, `seedVows` in `lib/world.mjs` — made by the module's
  own vow maker, with an id, so no "New vow recorded" card is offered for
  them); the beats' checks read the quest, not a seeded vow (`questVows`).
- **A place the story names becomes a place only in a sector with map
  data.** Undertake an Expedition records its destination as an unexplored
  site — a location, the track's link to it — when the active sector has
  `mapData` (`siteDiscovery.recordUnchartedDestination`), and Finish an
  Expedition then docks the ship there and posts "◈ Site Discovered". The
  runner's hand-made sector had none, so the finish arrived nowhere
  ("… is not a tracked location — currentLocation unchanged") and the sheet
  still said Hollow Spire. The long haul's seed gives its sector an empty
  `mapData` (`seed.sector` is the sector record as it is stored).
- **A card that waits on the player.** The third live run's player left two
  "Resolve consequence" cards unanswered and typed on; the table does not
  hold a move for them, so two weak hits' costs went unpaid and the run
  still passed. Now the player's instructions say such a card is waiting on
  it, the observer reads the cost cards left unanswered at the end
  (`health.costsOwed` in `run.json`; the log's "left owed:" line), and a goal
  achieved on a table that owes is not a `pass` (known-issues
  WEAK-HIT-COST-UNPAID). A cost card is one that asks for a choice
  (`sufferPrompt`): the cards that report a cost applied carry `sufferCard`
  too, and the check's first form counted one of those as owed — the third
  run's replay showed three for two. The instruction is a prompt line — whether a player
  model follows it is read in the next live run; the check does not depend
  on it. A replay of a run made before this still reproduces: what is
  compared is the goal's status, its failing layer and the health checks,
  not the class.

**The run's class** (`classifyRun`): an infrastructure error first, then a
failed health check (`product-failure`), then a goal never put to the test
(`not-exercised` — also when the table was left waiting on the GM — or
`budget-exhausted` when a cap caused it), then a goal not
achieved (`suspected-quality-issue`), then a goal achieved with a cost card
left unanswered (`suspected-quality-issue` — the player's omission, not a
health failure), else `pass`. **`pass` is the run's own verdict, not the review's**: the first
run that went the whole way had a wrong campaign recap behind it. A
memory goal that was not achieved is *suspected* at every layer — which
stored facts a prompt owes is a design rule the observer does not know (a
Chronicle entry reaches every narration only when pinned) — so `retrieval` is
evidence to read, not a verdict.

**A presence test is not comprehension.** A fact is "held" when one of its
accepted variants occurs in the text: "you lost the compass" holds "compass".
Pick a fact whose words are unlikely to appear by accident, tell the player
not to name it when it asks, and read the answer in `observer.json` before
calling a run a pass. Structured facts and negation belong to slice E's
benchmark.

**A long run** (`charters/long-haul.json`; issue #373, the first part of
#302 slice E) is a charter with `beats`: three sessions, about ninety player
actions, the narrator's memory and the mechanics loaded at once. What it adds,
and the rules that go with each:

- **Beats, and a pointer the observer moves** (`lib/beats.mjs`). A beat is
  something the player is asked to bring about, with a result checked in the
  world (`BEAT_CHECKS`, by `check.type`). The player is told every beat in its
  standing instructions and, each turn, which one is current and what the
  observer sees of it. **The player is never asked whether a beat is done —
  and is never left to take a roll for the end of one.** The third live
  run's player rolled a move that was not the beat's, twice, and each time
  waited six turns for the observer to move it on ("Beat appears done; wait
  for observer"). When the last roll on a beat is not one the beat wants
  (`wantsOf`) and the beat has not moved since, or the player has waited
  twice running on a beat that has not moved, `brief()` says so on a line of
  its own (`alert`; "THE OBSERVER: …" in the turn prompt): what was rolled,
  that the beat is NOT done, that waiting will not finish it. A move made with
  no roll is a move for this — Develop Your Relationship before a bond, Reach
  a Milestone: the fourth live run's Develop at a5–a7, on the beat that wanted
  a connection made, raised no alert. And a card on the table that waits on
  the player — a result held for Keep or Burn, the milestone's "Which vow
  advances?", a connection to pick, a cost to choose — is named on a line of
  its own too (`waiting`, `cardsWaiting`; "WAITING ON YOU: …"): the fourth live
  run's player skipped Keep at a38 and typed past the vow picker at a71. Not on
  a beat that is the table's (an interruption): there waiting is right. A
  beat that makes no progress in eight actions (`STALL_ACTIONS`; a beat with
  parts — four facts to plant, a track to fill — counts from the last time it
  moved), that `needs` a beat never done, or that `requires` of the world what
  it does not hold when it comes (`unmetRequirements`: checks of `BEAT_CHECKS`
  that must hold then), is `not-exercised` and the run goes on. Never call an
  unreached beat a pass. **Gate a beat on what it needs, not on the road that
  usually makes it**: the fourth live run lost beats 3, 19, 23 and 24 to
  `needs: ["b2"]` — the connection had been made from the draft card, so beat
  2's roll never came, while the vow's Link and a full track were on the table
  all along. Beats 3, 19 and 23 now require `{ "type": "connectionMade",
  "name": "Tamsin Vey" }` (she is the character's connection, whichever road
  made her one); beat 24 still needs beat 23's bond. The re-score asks it the
  same way (`lib/longrun.mjs` `recheckBeats`).
- **A beat is written for the world the beats before it leave**, and its
  player is told nothing that world does not bear out. The fourth live run's
  recovery beat asked for the medkit or the market with health and supply
  full (spirit and the hull were what the fight had spent): its lines tended
  wounds the sheet did not hold, and the narrator wrote them in. The beat now
  names no wound: the observer's note says what of the sheet is spent
  (`sheetSpent` — the meters, their impacts and the command vehicle's
  integrity, which the table read now keeps), every recover move is among its
  `wants` (Repair was not, and `recovered` adds the beat's recover moves to its
  check's), and a player note says to claim no hurt the sheet does not show.
  Its proof beat had the player claim a proof nothing in the story had found
  (a70, refuted by the narration it produced): it now asks for the finding
  first, and for nothing claimed beyond what the narrator has told. Its fight
  was told off Bleakhold's ring one step after the ship had docked: it is
  fought at the ring now, the ship in her berth. What happened in the step
  that finished a beat belongs to that beat: the next one's window opens after
  it.
- **Seven decisive rolls are scripted, the rest are real, all are recorded**
  (decision 3's six, and the expedition's finish; a beat's `dice`). They are
  armed at the GM's confirmation, by the move it names — never by whichever
  roll comes first — and used once.
  `scriptedDice` gives a miss (10, 9, action 1), a weak hit (1, 10, action 6)
  or a strong hit (1, 2, action 6; progress 1, 2) whatever the stat;
  `burnable` is a weak hit that burning momentum improves, worked out in the
  page from the character's momentum and stat, and not scripted at all when
  momentum is too low for one. The scripted miss scripts its price too
  (`price`: Pay the Price's d100), so that the suffer card is reached every
  time and not one time in four. A replay scripts nothing: its dice are the
  run's, as they fell.
- **An expedition, begun and ended in one beat** (`b7a`, the eighth; added
  on the maintainer's word after the third live run). The character leaves
  the charted lane after a clipped distress call and looks over what she
  finds. At the table (`docs/flows/exploration-flow.md`): a hit on Undertake
  an Expedition begins a track under the destination's working label — at
  the rank the move reader inferred, dangerous unless it says — marks it
  once, and posts an "Expedition" card with "🗺 Finish the Expedition (n/10)";
  a weak hit also posts a cost to choose, a miss pays the price and begins
  nothing. Explore a Waypoint's strong hit posts a choice card ("Mark
  expedition progress" or "+2 momentum"), its weak hit gives +1 momentum, its
  miss pays the price. All of these are the player's to answer. **An
  expedition left open is told to every later narration as under way, its
  hidden plan in play**, so the beat ends it before the course for Bleakhold:
  the card's Finish is a progress roll, scripted (challenge 1 and 2 — a
  strong hit from three boxes, a weak hit from two; either completes it).
  `BEAT_CHECKS.expedition`: a track begun while the beat was current,
  progress marked on it, a waypoint explored with its choice made, and —
  `finished` — the track complete.
- **Four interruptions are the runner's own actions** (a beat's
  `interruption`; `lib/gm.mjs`): the GM's page reloads mid-fight, End a
  Session is opened and closed unanswered, the X-Card is played on one
  narration and the GM resumes, the GM renames the connection's card. Each is
  a step of its own (`x<beat>`), followed by a check that compares the world
  with what it was. A reload carries across what the runner keeps on the page
  (the dice it recorded, the settings to restore); re-install anything else
  you hang on `window`.
- **Mechanical checks after every action** (`lib/mechanics.mjs`, `CHECKS`):
  each roll recomputed from the dice on its own card, meters and tracks in
  bounds, a mark of progress the size its rank gives, legacy and experience by
  rank and by box, the two mirrors (bond Item ↔ card, vow link ↔ card's name),
  an effect landing once on the roller (a move's momentum, a milestone, a
  suffer cost, a recovery, a burn), a session's momentum once each way, the
  lock free once settled, every line answered once — and an expedition's
  (`expedition-progress`: one mark of its rank for a hit that undertakes it,
  none and no track for a miss, one for a waypoint's "Mark expedition
  progress"; its finish scored by its boxes, `progress-score`, and paid on
  the discoveries legacy by its rank, one rank lower on a weak hit,
  `legacy-reward`). **Their expectations come
  from `tests/helpers/sequence/rules.js` — the game's text — and import
  nothing from `src/`**: an expectation computed with the module's own
  function agrees with the module whatever it does. A check that could not be
  made is counted as not made, never as passed. When you add a check, add the
  defect that it catches to `exploreMechanics.test.js`.
- **The fact ledger** (`lib/ledger.mjs`): each fact with the `variants` a
  right answer holds, an `anchor` where the variant alone is in every prompt,
  the `refusals` that contradict it (a `near` word said of it — in its clause,
  within ten words; `after: true` for a pronoun, which must follow the name
  with no other name between — or a phrase `anywhere`), and `probes` —
  questions in the charter's own words, never
  naming the fact, asked again in each session. A probe is scored stored / in
  the prompt / in the answer, and fails outright on a refusal. **A fact that
  was never planted is not scored**: its questions are shown as asked, with
  what was answered, counted for nothing, and no refusal is raised from
  their answers (`notPlanted`). The third live run's rename was never made —
  its beat was not exercised — and "Her name is Tamsin Vey", which was right,
  was scored three times as a refusal of the name she never took. Two rules from
  the first reviewed run are built in: **what the helpers wrote is read
  against the ledger too** (every summary, Chronicle entry, recap and Session
  Log page; a refusal there fails the fact at the stored layer whatever the
  narrator answers — a page rendered from the session record, issue #382, by
  its own words: the player's lines and questions it quotes and a fact it
  shows struck are not the page saying so, `table.mjs` `sessionLogOwnText`,
  while what it keeps of a fact is read from the whole page), and **a scene
  that restates a fact before it is asked about is
  recorded, its own prompt scored, and the question after it is not counted
  as recall**. A hidden plan's truth stated before its reveal is a suspected
  leak (`scoreLeaks`, by content). Every refusal and leak is reported with its
  sentence: it is a presence test, to be read. **A corrected fact's old value
  in a later prompt refuses only when the prompt does not say it was
  corrected** (`markedCorrected`): the module names a corrected value to the
  narrator so that it is not asserted again, and a summary's input lists what
  the table retracted — the old value there is the module doing its work.
  Every prompt that carries it is listed (`carried`; the scorecard's "A
  corrected value in later prompts"); in an answer, or in what a helper
  wrote, it refuses outright. A probe is looked for among the lines of the
  beat that asks it: a short question's words turn up in play.
- **What a real narrator taught the checks** (the first live run; each is a
  test in `exploreLongHaul.test.js`, in the run's own words). Check the
  table as it is *after* the thing the beat is about — the X-Card's check
  read a truth that stood before the card was played. A beat is what the
  player was asked to do: the correction's beat is the truth struck and the
  new one set, not the old name gone from everywhere — that is the ledger's,
  and the finding. A refusal word in the fact's sentence is not said of the
  fact: "he" was another man nine times in nine. "You did not" is a denial,
  not "you did". A label of the module's is not a word of the story
  ("struck the Ashen Wake head-on"). A miss's price may be told in the story
  with nothing to choose: the beat's wording must not send the player
  looking for a card, and the check must not take a later move's card for
  it. When you add a check, write its test from a sentence a narrator
  actually wrote.
- **Its class** (`classifyLongRun`): an infrastructure error, then
  `product-failure` for a failed health check, a violated mechanical check or
  a beat brought about wrongly — each with its step, and the check may be the
  one at fault — then `not-exercised` / `budget-exhausted` when more than a
  quarter of the beats were never exercised (the run is not counted in its
  round), then `suspected-quality-issue` for a fact lost or refused, else
  `pass`.
- **Its caps are the charter's** (`caps`: 100 actions, 400 calls, 60 minutes,
  $15 — issue #373 decision 1), over the config's.

**A suite of short scenarios, beside the long haul** (`suites/scenarios.json`,
`suite.mjs`, `lib/suite.mjs`; the maintainer's "overhaul 7", an addition and
not a replacement). The long haul is the memory-stability test — three
sessions with every flow loaded at once — and stays as it is, caps and all. In
it one early fault costs every later beat that depends on it: the third live
run lost beats 2, 3, 18, 22 and 23 to one card that was never made. A scenario
starts from a seeded state of its own, so each flow is put to the test
whatever happens to the others.

- **A scenario is a charter with beats** (`charters/scenario-<flow>.json`),
  run by `explore.mjs` as any long run is — the pointer, `BEAT_CHECKS`, the
  mechanical checks after every action, the ledger where it has facts, the
  review's layers, `replay.json` — and so replayed and re-scored as one is.
  What a suite asks of it besides (`scenarioProblem`, checked for every
  scenario before the first starts): a `name` and a `flow` (what it is about,
  for the summary); three to eight beats numbered in order, each with a check
  the observer knows; `caps` of its own, each within the suite's `ceiling` (15
  actions, 60 calls, 10 minutes, $1.50); a seed the seed writer can make
  (`seedProblem`); a rehearsal on its own beats; and a player who stays in the
  fiction — nothing it is given to type names a move, and a beat that wants
  one of a plain line shows a title that names none and says how to name it
  at the last. A charter with beats needs no fact (`lib/charter.mjs`
  `charterProblem`, moved out of `explore.mjs`); one without beats still does.
- **Every scenario begins with the table's own Begin a Session** (no
  vignette) and starts where its flow does: the seed may put meters and
  impacts on the sheet (`seed.pc.meters`, `seed.pc.impacts`; `seedSheet` in
  `lib/world.mjs` — through `setDebility` and `applyMeterChanges`, impacts
  first, read back and failed by name if the sheet does not hold them) and
  vows beside the background vow (`seed.pc.vows`).
- **The first set, one per flow**, each aimed at what round 3 found:
  `scenario-fight` (Enter the Fray to Take Decisive Action, a scripted miss
  paid, a burn); `scenario-connection` (Tamsin Vey met and made under a part
  of her name, two favours, a bond forged — the road round 3 lost);
  `scenario-vow` (sworn in Begin a Session's window, a step said in the
  fiction offered as its milestone, fulfilled with its truth told);
  `scenario-recovery` (wounded: Heal; whole again: nothing offered);
  `scenario-expedition` (the long haul's `b7a` on its own); and
  `scenario-scene-answer` (`@scene` answered plainly, and nothing of the
  answer written back). The suite's `toAdd` lists the ones not built yet —
  an oracle's answer kept, a scene question that lapses, a correction's short
  form — each with what it needs; the summary prints them.
- **The checks the scenarios added** (`lib/beats.mjs`, each held to the
  defect it catches in `exploreScenarios.test.js`): `moveOffered` (a move
  offered on a narration's "Roll …" button or rolled — or, `offered: false`,
  a line answered with neither: a Heal at full health is the beat brought
  about wrongly); `milestoneMarked` (a quest vow's progress marked while the
  beat was current); `relationshipDeveloped` (the cast connection's track
  moved, followed by its card's id); `sceneAnswered` (the latest `@scene`
  question answered, with no truth of its narration, no draft card, no plan
  and no change to the scene's frame); and `vowFulfilled` with `told` (the
  plan the table decided for the vow revealed by the fulfilment — the module
  marks a truth revealed only where the prose states it). `readCards` keeps a
  paced narration's `suggestedMove` and an answer's `sceneResponse` for them.
- **What the stand-in does for them** (`lib/rehearsal.mjs`): a script entry's
  `offer` (the classifier offers the move rather than makes it, so the
  narration carries a "Roll …" button), `sidecar` (a fact block sent with the
  reply whether or not one was asked for — an `@scene` answer is asked for
  none, and the module must drop it), and, where the charter's
  `rehearsalPlan.tellsVowTruth` says so, a narrator that tells a vow's truth
  when its prompt says the beat ends the vow (THIS BEAT ENDS A VOW) and
  records it revealed. The long haul's stand-in does not: its plans share one
  truth, and one told would read as another's leaked. In the recovery
  scenario the stand-in reader calls Heal both times — it is the module's own
  rule (`situation.js` `nothingToRecover`) that must say no to the second.
  At every charter's session set-piece (its user message's first line:
  OPENING, CLOSING or SPOTLIGHT VIGNETTE) the stand-in writes each MATERIAL
  result into its prose and accounts for it in its fact block (`builtFrom`),
  as the prompt asks; the forgetful one (`EXPLORE_REHEARSAL_FORGET=1`) does
  neither, so the scorecard's set-piece count is seen to pass and to fail.
- **How it runs** (`./scripts/cloud.sh explore --suite scenarios --rehearse`;
  `--replay <suite folder>`; `EXPLORE_SUITE_ONLY=<a,b>` runs those alone, in
  the suite's order). `suite.mjs` runs each scenario's charter with
  `explore.mjs` in a child process — one browser at a time, each in a world
  `setUpWorld` clears and seeds for it, its evidence in its own folder
  (`EXPLORE_OUT`) — and writes one summary, after every scenario:
  `artifacts/explore/suite-<name>-<mode>-<time>/summary.json` and
  `summary.md` (per scenario its class, each beat's result, its checks made
  and violated, calls, cost, minutes and run folder; the totals; a verdict
  that counts, and never calls a scenario that did not run a pass). Its exit
  code is 1 when a charter cannot run (nothing is started), or a scenario
  crashed, was an infrastructure error or, replayed, diverged.
- **It is paid for like any live run, and none has been made.** A live suite
  needs `EXPLORE_QUESTIONS` (one set, kept in every scenario's `run.json`),
  is rehearsed first and its prompts read, and runs only on the maintainer's
  go-ahead. Each scenario runs under its own caps; the suite's `total` ($9 —
  six scenarios at their ceiling) is never passed: a scenario whose dollar
  cap would take the suite past it is not started (`mayStart`). A scenario's
  live run is reviewed as any live run is (below); one that is kept goes under
  `explorations/` beside the long haul's.
- **Adding a scenario**: a charter as above, its name in the suite's
  `scenarios`; `exploreScenarios.test.js` holds every scenario the suite names
  to the suite's rules with no change to the test. A flow nothing in
  `BEAT_CHECKS` can see needs a check there first, pure and tested.

**Replay.** Every run writes `replay.json`: the player's actions with no
document ids in them (a click is its button's label and which message
offering it, counted from the newest; a typed line that names a truth by its
id — `!truth strike tr-ca277` — is kept by the entry the id stood before, and
finds that entry's id again on the replay's own screen), the dice as they
fell, and the module's replies filed under the action each belonged to.
**Anything a player types or presses that carries an id the world made is a
replay that will not replay**: the first replay of a live long run diverged
on one such line. A hidden plan's id is of that kind and cannot be helped —
the narrator's recorded sidecar decides plans by id — so a replayed world's
plans stay undecided and its clocks unmade; a replay compares beats, checks
and health, which do not read them. A replay takes the
actions again in a fresh world and scores it again; it `REPRODUCED` when the
observer's finding — the goal's status and layer, and whether health failed
— is the same. The run's class is not compared: the first kept run's was
coloured by the flags of the API reviewer the runner then had.

**A run worth keeping is committed under `playwright/explorations/`** — its
`replay.json`, with `run.json`, `transcript.md` and its review
(`annotated-transcript.md`, `scorecard.md`) for a reader — and is then
a regression anyone can run without a key (`cloud.sh explore --replay
playwright/explorations/<run>`). `memory-live-20261122` is the first: real
narrator replies, the memory goal achieved, one move rolled.
`memory-live-20261123` is the re-run after issue #374's fixes: the same goal
with four moves rolled, and no prompt older than its recording.
`memory-live-20261123-0436` is the same re-run made a second time that day,
by a session that did not know of the first (below): one move, a miss with
its price, and the first campaign recap written from the corrected prompt.
A later run is kept beside an earlier one whose review an issue cites; say
which is the current one. `long-haul-live-20261123` is the first live long
haul (87 actions; its `replay.json` is 1.6 MB), kept as re-scored;
`long-haul-live-20261123-1459` the second, after issue #377's fixes (89
actions; the fight's five beats not exercised — its card was never pressed),
kept the same way and the current one; `exploreLongHaul.test.js` checks both
and holds each review to the narrator's recorded words. A button the module
renames after a kept run pressed it goes on `player.mjs` `LABEL_RENAMES`, so
the run still replays. `exploreRunner.test.js` checks on
every PR that each file is one the runner can take again and that it holds
what its result claims (the fact stated in the first session, not named by
the player in the second, and in the narrator's replies there); the replay
itself needs Foundry and is on demand — adding it to the e2e workflow is the
maintainer's call. A replay matches a reply to a call by its step and kind,
so it survives a reworded prompt, and diverges when a step makes different
calls than it did: after a change that was meant to do that, make a new live
run and replace the files; after one that was not, the divergence is the
finding. Never edit a kept `replay.json` by hand.

**Rehearse before you pay.** `--rehearse` runs the whole live path with the
Messages API stood in for in the runner's own process (`lib/rehearsal.mjs`):
the charter's `rehearsal` script comes back through the player's tool, the
module's calls get replies that keep the charter's fact once it is in front
of them. A remembering rehearsal scores `achieved` only because the module's
own memory path carried the fact from one session to the next — it is a real
check of that path, with a cooperative narrator; `EXPLORE_REHEARSAL_FORGET=1`
scores `not-achieved` at `storage`. Run both after a change to the runner.

**The long haul's rehearsal rolls** (`createRollingRehearsal`). The memory
charter's stand-in narrates every line, so it reaches nothing on the move
path — and the first live run stalled on a question the module puts to the GM
before the dice. A charter with beats is rehearsed by a stand-in whose
classifier calls a move where the script makes the line one (`move: { id,
stat, target }` on a `say` or a `click`) and whose interpreter names it; the
resolver then rolls for real, so the confirmation, the held result, the price,
the suffer card, the victory card and every prompt on the way are reached with
no key. Its scripted player finds a button by its label, a dropdown by its
option and a window by its title on the screen its prompt shows; waits a few
turns for one that is not there yet; skips what the table never offered; and
drops an entry whose `beat` the pointer has passed — and waits on one whose
`beat` the pointer has not come to, which played early would land in the
window of the beat before. Its readers make the script's move save one: a
Make a Connection for someone the SITUATION block already lists among the
character's connections is narrated, as the live readers read it (the fourth
live run, a5–a8); before, the stand-in rolled it all the same, so no rehearsal
could show a connection made by its draft card. `EXPLORE_DRAFT_HOLDER=pc`
rehearses that road: beat 2 is not exercised, and beats 3, 19, 23 and 24 are
walked on the connection the draft made. `rehearsalDice` scripts
the rolls the six do not, so that a rehearsal walks the same road every time.
Both stand-ins answer the campaign recap as the module asks for it since its
source is the session record (issue #382; `citedRecapReply`): JSON
sentences, each fact a line of the source holds told with that line's id,
and every beat marked LASTING told — a reply that is not that JSON leaves the
recap empty, and the forgetful stand-in tells no fact. The recap beat
(`probesAsked` with `recap`) wants a recap with something in it: the card
that says "No campaign history available yet" is not one. The session
summary is a view of the record too (slice 3): its source is the session's
numbered beats (`## THE SESSION`, each with what it was TOLD AS; the
questions apart), and both stand-ins answer it with the cited JSON list it
asks for (`citedSummaryReply`) — the day's business citing the first beat,
each fact a beat's fact line holds (never a question put to the narrator),
every LASTING beat — or the summaries come out empty; the forgetful one's
summary is there and holds no fact. The summary is kept on its session's
Session Log page (`sessionRecord.views.summary`), not in campaignState: the
table reader reads it there (`helpers.summaries`), and the playthroughs'
`sessionLog` check asks for it shown under the page's "Session summary"
heading (`lib/table.mjs` `sessionLogSummaryProblem`).
**Walk every beat in a rehearsal, and read the prompts it produced
(`requests.json`), before a live run is paid for** (issue #373, spending rule
2). Four rehearsals found, for nothing: the runner taking a pause for the end
of a turn, a result held where a price was expected, a vow card with no Link
(a defect of the module's, fixed), a view that hid a card thirteen messages
up, a renamed connection looked for under its old name, and a ledger rule
that failed the module for telling the narrator a value was corrected. The
rehearsals of the expedition beat found two more: a pressed button taken for
settled before its relay had landed, and a destination that became no place
for want of map data in the seed's sector. **A charter's rehearsal walks the
road the last live run walked**: the long haul's stand-in detector proposes
the cast's connection as "Tamsin" (a script entry's `detects`), so the draft
confirmed under a part of the name (with "No one", and made the character's
connection by the rehearsal's Make a Connection), the vow's Link, the rename
and the bond are all rehearsed on that card — the exact-name road is the
first two kept runs' replays. Since the detector is given the player's line (its PLAYER'S
LINE block, issue #380), which holds the name in full, `detects` is what the
stand-in reports for the member it names, and the cast's full name is not
reported beside it: before that, the first rehearsal on the new module read
"Tamsin Vey" in the player's line and walked the exact-name road. (The
rehearsal before it had staged its module sixteen seconds before HEAD moved
to issue #380's fixes, and rehearsed the old one: a run stages the module at
its start — `stage_module` — so a branch moved under a running chain is
picked up only by the next run.)

**Every live run ends with a review** (the maintainer's standing instruction,
2026-11-23; issue #373, modelled on issue #374). You made the run: you read
it, when it completes, without being asked. A run whose evidence is not read
has bought a verdict and little else — the first run that went the whole way
reported "achieved" and one flag, and eleven of the twelve things learned
from it came from reading its prompts and records afterwards. A cold read
first ("Read it cold before you score it", below), then four parts:

1. **The annotated transcript** (`annotated-transcript.md`, beside the run's
   evidence, and sent). The run generates its layers (`lib/review.mjs`) —
   each step's beat, the player's reason and note, the calls and how long
   they took, the roll and its dice, the GM's answers, the interruptions, the
   checks violated, time and cost — and leaves a marked place under every
   step for your notes: the judgement is not generated. Every message in order; at the step each concerns,
   what the player was trying to do and the reason it gave, what the table
   did with the line (the pacing read, the move, the dice, the effects, what
   each helper wrote, what the GM's autopilot answered), the observer's
   findings, time and cost. Then your own notes on
   **what went right and what went wrong, and why** — where the fault was the
   runner's, as in the first live run, saying so.
2. **The scorecard** (`scorecard.md`; its arithmetic rows are generated
   from `review-data.json` — the run's questions with a place for each
   answer, the goal or the beats, speed by call kind and from a line of play
   to its reply — a scene question's wait apart: it skips the readers and is
   answered sooner — caching and cost by call kind, prompt length against the
   action number, repetition by content between scenes of one kind, what each
   session's narrations keep returning to ("Refrains"), what each session
   set-piece was built from ("Set-pieces": design #381's count 1 — each
   rolled result of an opening's, a closing's or a spotlight's MATERIAL
   found in its scene, by the words its fact block's `builtFrom` gave and
   its prose holds, read apart from the module's own account on the card;
   and count 7 — each spotlight a Begin card rolled followed by its cutaway,
   built from that roll, or by the note that it is the table's to envision;
   `setPiecesOf`), each campaign recap sentence by sentence ("Recap — what it
   rests on": each sentence beside the lines of its source it cites — the
   cache's `cites` against the recap's recorded request, a cited id that is
   no line failing; design #382 11.4 check 5, `recapCitesOf`), how large each
   session's record grows ("Record sizes": each Session Log page's
   `sessionRecord` as JSON after each End a Session; `recordSizesOf`) — and
   "The reading" is left to write). One row per
   dimension with its result,
   its basis and how far to trust it — goal, mechanics, continuity in what
   the narrator said and in what the helpers wrote, agency, friction,
   narrator quality, speed, length, cost — then the detail. Say what was
   never exercised and what the run did not record.
3. **The action items, as a GitHub issue**: one per round, extended after
   each run of it, and one for a run made alone. Each item with its quote,
   its cause as far as the code or a prompt shows it, the step and file that
   show it, and whether there is **enough data to fix it** — *enough* (the
   cause is readable: give options, a recommendation and what would prove
   the fix), *a fix can be proposed and its effect must be measured* (say
   what to measure), or *not yet* (say what would supply the samples). Every
   finding also goes in `docs/known-issues.md`. The review fixes nothing.
4. **What it cost and what it returned.** What was spent, split between the
   module's own calls and the AI player; each thing learned, of what kind, how it was found, and whether it needed a live model at
   all; what could have been had for nothing; where the next dollar should
   and should not go.

Check your counts against the evidence before you send them: the first
review reported three draft cards where the run had two.

**Read it cold before you score it** (agreed with the maintainer,
2026-11-24, after the long haul's second review). Before a question is
answered or a step annotated, the plain transcript (`transcript.md`) is read
straight through by a reader who has seen neither the charter, the run's
questions nor the fixes it was to verify — in a Claude Code session, a
sub-agent handed that one file and nothing else — and asked what the session
was like to play: what a player would complain of, what repeats, what makes
no sense, what the player was made to do. Its findings head the scorecard
under "The cold read" (a live run's scorecard is generated with that place
marked, above its questions), each then checked against the evidence like
any other finding. The second long haul's review was written step by step
against its own eight questions, by the session that had written the charter
and the fixes. It reported every fix holding, and missed what the maintainer
saw on one reading: a player made to name its moves to have them rolled (the
charter's own instruction — a player is never to need a move's name in what
they type), twenty memory questions typed as lines of play and answered by
an all-knowing voice in the fiction (many belonged to `@scene`), one detail
returning in nine of twelve narrations, an outcome written into the prose
("Strong hit, and a match:"), a Heal rolled at full health, and three wrong
sentences in a recap.

Five rules for the reading that follows, each from that review:

- **Say first what the charter itself made happen.** Head the reading with
  what the charter's beats and player notes made the player do that a person
  at the table would not — name a move, ask a memory question in play, walk
  past a hook. What follows from it is the charter's, and a charter that
  hides the thing to be tested is itself a finding.
- **A count of nothing is a count of what the counter looks for.** The
  generated rows count the patterns earlier runs showed (an instruction
  written as prose, a stat read aloud, a crew role in a solo opening;
  repetition between scenes of one kind). Report a zero as that — "none of
  the three counted" — never as "none", and read the narrations for the
  pattern nobody has counted yet.
- **Read the run whole as well as step by step.** A note under each step
  cannot see what crosses steps: a refrain, every beat closing the same way,
  one device carrying a third of the session. The scorecard's "Refrains" row
  and section (`refrainsOf`, `lib/review.mjs`) count the part of it that is
  said in the same words: per session, the content words and the phrases in
  a third or more of its narrations with the longest run of narrations in a
  row that hold each ("over the hatch": 17 of the third run's session 3's
  23, eleven running), names apart, and the narrations that end on someone
  waiting, watching or still. A device said in new words each time is still
  for the reading.
- **Judge whether it makes sense, not only whether the arithmetic is
  right.** A roll worked correctly for a move there was no reason to make is
  a finding, and so is an offer accepted that the fiction cannot support.
- **Read each recap sentence by sentence against the transcript**, not for
  the tracked facts alone.

**Read every alarm before you report it, and re-score when a check was
wrong.** The first live long haul ended `product-failure` with eight alarms,
and seven were the checks' own: a check that read the table from before the
X-Card was played, a "refused" fact whose refusal word was said of somebody
else. A real narrator writes sentences no rehearsal writes, so the first
live run of a charter tests the checks as much as the module. When a check
is wrong: fix it, pin it with a test made from the run's own words, and run
`node rescore.mjs <run folder>` (`test/ci/playwright/`) — the run's evidence
scored again by the checks as they are now, in a second or two, with no
Foundry and no key. Its output says it is a re-score and what the run first
said; keep those files, not hand-corrected ones. It needs the run's whole
folder (`observer.json`, `requests.json`), which is not committed: re-score
before the folder goes. Do not buy the run again to learn what the corrected
check says of it.

A rehearsal or a replay does not need a review.

**A live run is paid for; these decide whether one is made** (issue #373,
"Spending rules"). Say in writing what the run is to answer before it runs:
`EXPLORE_QUESTIONS`, one question to a line — a live run is refused without
them, and they head its scorecard, each with a place for its answer.
Do the free checks first — a rehearsal, and a read-through of the prompts it
produces: what each helper is and is not sent is visible there for nothing.
Do not run while a finding with a fix ready is open on the path the run
would walk. Do not buy the same session twice except to verify a fix against
it — **and look before you pay: `git fetch origin`, then read
`playwright/explorations/` and known-issues on `main`.** On 2026-11-23 two
sessions each made the memory charter's re-run after issue #374's fixes, an
hour apart, neither knowing of the other; the second found out when its
kept folder collided with the first's in a merge. After each run of a round, say whether the next is worth making. And
every run leaves something that costs nothing to use again: a replay, and a
regression for each defect it found.

**Adding a charter.** A charter is `charters/<name>.json`: `persona`, `goal`
and `playerNotes` (what the player model is told), `facts` (each with the
`variants` that count as holding it; `required: false` for one that is
reported and does not decide), `ask.cues` (words one of which marks a line as
the question), `settings` and
`seed` (the scripted playthroughs' format), and `rehearsal` (the player's
actions for a rehearsal). A charter without `beats` is scored as the memory
goal (`scoreMemory`). A charter with `beats` is a long run: `caps`, `cast`
(the NPCs the GM's rules know), `facts` with `refusals` and `probes`, `baits`,
`beats` (`id`, `n`, `session`, `title`, `tell` — what the player is told —
`check`, and where they apply `needs`, `requires`, `dice`, `interruption`,
`after`, `playerTitle`, `wants`, `setupLines`, `lastResort`,
`lastResortAfter`), and `rehearsalDice`. `requires` names checks the observer
knows (`charterProblem` refuses any other). **A beat's `id` is its name for good and `n` is where it
stands now**: a kept run's beats, a fact's `plantedBy` and a beat's `needs`
are told by the id, so a beat added in the middle takes a new id (`b7a`, the
expedition, eighth) and the rest are renumbered, not renamed. The tests that
hold a kept run's checks to the charter's compare them by id, a beat the run
never had being no part of it. A seed may give its character vows
(`seed.pc.vows`) and its sector `mapData`; a cast entry may say whose later
name it is (`was`). A beat whose result nothing in `BEAT_CHECKS` can see needs a
new check there, pure and tested, before it is run — and
`exploreLongHaul.test.js` holds the charter that ships to itself: every
question told apart from every other, none naming what it asks about, every
beat scripted in the rehearsal. A check that concerns the cast's connection
finds it by the name the charter made it under and follows it by its card's
id (`castConnection`): the charter renames it in beat 18.

**A charter's player stays in the fiction** (decisions.md → "A player is
never made to name a move"; `tests/unit/exploreFictionOnlyPlayer.test.js`
holds the long haul to it). The second long haul's charter named the move in
each beat and told its player to "say the line again, plainly, as that
move": sixteen of its lines named one, three plain lines that wanted a move
were typed in the whole run, and the review could not say how often a plain
line goes unread.

- **No words a beat gives the player to type name a move** — in its `tell`,
  or in the `rehearsal`'s lines. A `tell` says what the character does and
  which button to press; buttons may name moves. The title the player is
  shown is `playerTitle` where the beat's own `title` names one.
- **A beat that needs a roll of a plain line says which** (`wants`: the move
  ids; `setupLines`: how many of its first lines are scene-setting and want
  none) **and how to name it at the last** (`lastResort`). The observer tells
  the player its last resort only after two plain lines (`lastResortAfter`)
  have brought nothing about — or once a roll has come that is not one of the
  beat's, or the player has waited twice running on a beat that has not
  moved — so the beats that depend on this one are still reached; the beat
  keeps that it came to it (`lastResort: true` in `beats.json`). It is told
  once: the line that names the move spends it, and it is not told again
  until the beat has moved (`lastResortSpent`, the steps that spent it; the
  note says so). The fourth live run told it every turn once it was unlocked,
  and its player named three moves in beat 22 alone (a64, a66, a68).
- **A memory question is asked with `@scene`**, the module's own way to ask
  about what is established: it skips the pacing reader and is answered as
  "a camera, not a writer". Typed as a line of play it is continued as
  fiction — twenty of them in the second run were answered by a voice at the
  hatch and then a clerk who knew everything. A charter keeps one question of
  each set (and one bait) as a line of play, to see what a player who forgets
  the syntax gets. The ledger scores both alike.
- **The scorecard's "Plain lines" row and "What each line of play became"**
  (`lib/review.mjs` → `freeformOf`) are the measure: for every line of play,
  the pacing reader's decision and the move chosen — from the readers' own
  replies in the run's recording — the move its beat wanted, and whether the
  line named a move (`lib/moveNames.mjs`: a count to start reading from).
  `rescore.mjs` applies it to a kept run by what its beats want now.

**The readers' plain-line test** (`./scripts/cloud.sh readers`;
`playwright/readers.mjs`, `readers/plain-lines.json`, `lib/readers.mjs`) asks
the same question without a table: about fifty plain lines of play, none
naming a move (a unit test holds the list to that), each with the reading it
should get — a move, one of two, or none — put through the pacing reader
(`decidePacing`) and, where that calls a move, the move reader
(`interpretMove`, as `readMove` calls it), in the live world with each line's
context set (the scene's last narration, the scene frame, the place, and the
sheet both readers are told of in their SITUATION block: health, spirit,
supply and impacts, the ship's integrity, the connection and its track, the
vow and its progress — written through the module's own writers and read
back before a line is read). Nothing is rolled or narrated; no other
call may reach a model (the runner's gate refuses any). Dry by default: the
prompts are built and written, the readings are stubs. `--live` reads them on
each model of `READERS_ARMS` (by default the readers' own model, Sonnet 5.5,
then Haiku 5.5; for any arm that is not the readers' own the proxy rewrites
the request's model and its thinking-off form), `READERS_REPEATS`
times, and stops at `READERS_CAP_USD`. **It spends money: a live run is
refused without `READERS_QUESTIONS`**, the spending rules above apply, and its
report (`report.md`: the questions with a place for their answers, the
headline, by family, where the models differ, the lines none read, cost and
time, what the test does not show) is answered and kept under
`readers/runs/`. The first, 2026-11-24, cost $0.71: Haiku 5.5 read 71 of 90
right and Sonnet 5.5 77, and a step toward a vow said in the fiction was read
by neither (known-issues PLAIN-LINE-GOES-UNREAD). On that run the readers were
moved to Sonnet 5.5 (decisions.md → "The readers run on Sonnet 5.5"). Run it
after a change to either reader's prompt, before a live run is bought to see
the same thing.

## Quench batch coupling — shared defaults and hooks

Settings defaults and module hooks are **shared state across all Quench
batches**. Changing a world-setting default or removing/redirecting a hook
breaks batches that *implicitly* relied on the old behaviour — typically in
batches you didn't write and didn't touch. Each instance cost a full CI
round-trip in practice:

- Flipping `autoSeedStarship` to default-off broke `starshipNarratedNotes`,
  which created a starship and waited for the createActor hook to populate
  Notes without ever pinning the setting.
- The connection-seed hook (`autoSeedConnection`, then default-on) broke the
  `portraitGeneration` gating test by populating `portraitSourceDescription`
  on a card the test expected blank.
- Removing the scene-controls group broke a `privateChannel` assertion that
  still called `getSceneControlButtons`.

Rules:
- Before changing a setting default or hook behaviour, **grep
  `src/integration/quench.js` for every batch that exercises that path**
  (the setting key, the hook name, the mechanism's selectors/flags) and
  update them in the same commit — don't wait for CI to find them.
- A batch that depends on a specific setting value must **pin it with
  `withTempSetting(...)`** rather than assuming the default; defaults are
  allowed to change.
- Hooks that read settings should read them **synchronously at fire time**,
  not inside a deferred async block — a deferred read races
  `withTempSetting`'s restore (see `registerStarshipSeedHook` in
  `src/index.js`).
- The e2e suite can't run locally in every environment; when a change lands
  in this category, expect one CI iteration and budget for it rather than
  assuming the first push is green.

## Accepted blind spots

### `cacheKey is stable and content-addressed` (audio batch) — secure-context skip

The audio cache key uses `crypto.subtle.digest("SHA-256", …)`. The Web Crypto `SubtleCrypto` interface is only exposed in [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — HTTPS, `http://localhost`, `http://127.0.0.1`, `file://`. Our containerised e2e reaches Foundry via `http://foundry:30000` (Docker service-name DNS, non-loopback HTTP), so `crypto.subtle` is undefined and the cacheKey Quench test errors with *"Cannot read properties of undefined (reading 'digest')"*.

The test now self-skips when `crypto.subtle.digest` isn't available. Rationale:

- The cache feature itself works in production (Foundry on localhost = secure context; Forge on HTTPS = secure context). This is purely a CI-environment limitation.
- `tests/unit/audio.test.js` covers `cacheKey()` correctness under Vitest in Node 22+ (which exposes `globalThis.crypto.subtle` natively) — regressions in the algorithm, field ordering, or hex encoding are still caught.
- The remaining blind spot is browser-side Web Crypto vs Node Web Crypto divergence on edge cases. Small, real, accepted on 2026-05-22.

If a regression slips through that the unit tests miss, the alternative is to add a `--unsafely-treat-insecure-origin-as-secure=http://foundry:30000` Chromium launch flag in the Cypress config (via `before:browser:launch`). That promotes the CI origin to secure-context, restoring `crypto.subtle`. Not currently wired — the named flag's "unsafely-" qualifier is true (it's only safe because the CI runner is ephemeral and we fully control the origin), and the unit tests cover the algorithm.

## Autonomous iteration loop

When iterating on the Cypress spec (or any CI-gated work), use the
PR-comment / webhook pattern so the agent doesn't need a human in the
loop between fixes and diagnostics.

**Setup (one-time, in the workflow):**
- Tee the orchestrator stdout to a log file: `npm run test:e2e 2>&1 | tee test/ci/cypress/artifacts/e2e-run.log` (with `set -o pipefail`).
- On `if: always()`, post a status comment to the PR with a hidden marker (`<!-- e2e-log:sticky -->`): on success a short status line (run page + head SHA); on failure the orchestrator-log tail (~50 KB). The same step covers both — `if: always()` so the comment fires regardless of CI outcome.
- **Delete the existing marked comment first, then POST a fresh one** (not PATCH in place). The MCP `subscribe_pr_activity` subscription only routes `issue_comment.created` events to the agent; `issue_comment.edited` (which is what PATCH produces) does not wake the session. Delete+POST guarantees a `created` event per run, keeps the PR thread to one comment, and still preserves the marker pattern.

**Setup (in the session):**
- Call `mcp__github__subscribe_pr_activity(owner, repo, pullNumber)`. Webhook events for the PR arrive as `<github-webhook-activity>` messages that wake the session.
- Don't poll. Don't use Bash `sleep` to wait for CI. The webhook tells you when a run finishes — success or failure.

**On each `github-webhook-activity` event:**
1. Call `mcp__github__pull_request_read` with `method=get_comments`. The response is large — slice via `python3 -c "print(open(file).read()[A:B])"` if it exceeds the token budget.
2. Find the sticky comment (`'<!-- e2e-log:sticky -->' in body`). The heading line is `## E2E run success` / `## E2E run failure` / `## E2E run cancelled` — read it first; on success continue with whatever's next; on failure read the orchestrator-log tail.
3. Diagnose, fix, push. The push triggers a new run; the sticky comment updates in place. Repeat.

**What WebFetch cannot do** (don't try):
- Read raw GitHub Actions step logs. They require auth, even for public repos.
- Reliably read `$GITHUB_STEP_SUMMARY` content. The summary block is in HTML the scraper sometimes misses.

**What it can do:**
- Read the run page's annotations + artifact-list + overall status.
- Read GitHub release-page asset metadata.

**Foundry credential safety in public-repo CI:**
- Secrets are blocked from forked-PR workflows by default (GitHub's protection).
- GitHub Actions auto-masks any value matching a registered secret as `***` in step logs.
- Cypress types the admin key into Foundry's `<input type="password">` field, which browsers auto-mask — screenshots show dots, not the value.
- The orchestrator never echoes `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` to stdout (felddy uses them once to download the zip, then they're not referenced).
- Even with all of the above, prefer a dedicated foundryvtt.com account for CI if licence headroom allows — cheap insurance.
