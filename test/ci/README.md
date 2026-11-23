# Local Foundry CI Stack

A Docker stack that boots Foundry VTT v13 with the foundry-ironsworn system,
the Starforged Companion module (built from your working tree), and Quench
pre-installed. You can drive it manually (browser at `http://localhost:30000`)
or have Cypress automate the whole Quench run for you.

CI work is split into three phases:

- **Phase 1:** working local Docker stack, manual browser-driven testing
- **Phase 2 (this is now wired):** Cypress automation against the same
  stack — `npm run test:e2e`
- **Phase 3:** GitHub Actions wrapping the whole thing, gated on PR open /
  synchronize (not per-commit — the suite is ~5 minutes per run)

## Prerequisites

- **macOS** (this stack stores credentials in the macOS Keychain)
- Docker Desktop with file sharing for your repo path enabled
- A foundryvtt.com account that owns a Foundry license
- About 1 GB of free disk for the Foundry zip + Node runtime + worlds

## Credentials

There is no `.env` file. foundryvtt.com username/password and the dev
admin key all live in your **macOS Keychain** under service
`starforged-ci-foundry`. They never touch disk in plaintext and can't be
accidentally committed.

`start.sh` will prompt for any missing values on first run and store
them automatically. You can also manage them explicitly:

```bash
./scripts/credentials.sh set       # prompt + store all three
./scripts/credentials.sh status    # show which are present (masked)
./scripts/credentials.sh clear     # remove all three from Keychain
```

The Keychain stores three accounts under that service: `username`,
`password`, `admin-key`. Look them up in Keychain Access.app if you want
to inspect or edit them by hand.

On first read after a fresh store, macOS may pop a dialog asking
whether `security` (or `bash`) can access the Keychain item — pick
**Always Allow** so subsequent boots are silent.

## Quick start

```bash
cd test/ci
./scripts/install-deps.sh           # downloads ironsworn + Quench, copies the module
./scripts/setup-test-world.sh       # installs the world template
./scripts/start.sh                  # prompts for creds on first run, then boots
```

Then open <http://localhost:30000> in your browser.

## First-time browser walk-through

When you hit `http://localhost:30000` the first time you should see, in
order:

1. **EULA acceptance** — accept it.
2. **Admin password prompt** — enter the admin key you set in Keychain
   (default suggestion: `atropos-dev`). If you forget what you set,
   `./scripts/credentials.sh status` shows a masked preview; `clear` +
   `set` lets you replace it.
3. **Setup screen — Systems / Modules indexing** — Foundry needs ~30 s
   on first boot to scan and load the systems and modules that
   `install-deps.sh` put under `data/Data/`. Pre-v13 Foundry indexed at
   world-launch time; v13 does it at setup time, so you may see a
   "Packages Loading" banner. Wait it out.
4. **Setup screen — World list** — `Starforged CI Test World` should be
   listed. Click **Launch World**.
5. **World migration prompt** — the `data/Data/Config` directory is
   created fresh by the felddy entrypoint, and Foundry treats the world
   as a migration target. Accept the migration; it's a no-op on a brand
   new world but Foundry insists on stamping the current version.
6. **Join screen** — pick the **Gamemaster** user, leave password blank
   the first time. (You can set a GM password under *Settings → Configure
   Players* once inside the world.)
7. **Inside the world — enable modules** — open *Settings → Manage Modules*
   and tick:
   - Starforged Companion
   - Quench
   - (optional) Dice So Nice! — if you've installed it manually for
     visual dice rolls. Not bundled; install from the Foundry module
     browser if you want it.
   Click **Save Module Settings**. The world will reload.
8. **Run Quench** — open the Quench UI from the sidebar. Run a batch
   (e.g. `starforged-companion.actorBridge`) to confirm the module is
   loading and the test harness works.

After this one-time setup, Foundry remembers everything in `./data/`. Stop
and start the stack freely without redoing it.

### After a `reset.sh --yes`

You'll repeat every step above. `reset.sh` wipes `./data/` entirely —
license fingerprint, world DB, enabled-module list. Plan for ~2 minutes
of one-time setup after each reset.

## Automated end-to-end testing (Phase 2)

```bash
npm run test:e2e
```

That runs `test/ci/scripts/e2e.sh`, which:

1. Wipes `./data/` (preserves `./data/container_cache/` so you don't
   re-download the ~100 MB Foundry zip).
2. Re-stages systems / modules / world from the working tree.
3. Boots the `foundry` container and polls until it's accepting
   connections.
4. Runs a containerised Cypress (`cypress/included:14`) that walks the
   first-launch ritual you'd otherwise do by hand (EULA → admin auth →
   world launch → enable modules → reload) and invokes
   `quench.runBatches("starforged-companion.**", { json: true })`.
5. Asserts `stats.failures === 0` on the resulting Mocha-shape report.
6. Runs the second-client suite in a Playwright container
   (`mcr.microsoft.com/playwright:v1.56.1-noble`): `playwright/multiplayer.mjs`
   joins the same world as the GM and as a player it creates, and checks
   the multiplayer paths Quench (a single GM) can't — the X-Card, `!oracle`
   posting one card, a player's Begin a Session, Burn Momentum applying once,
   Private Lines reaching the GM, a Batch Mode round, and a paragraph a
   player takes off an NPC card's Notes tab reaching the GM's client marked
   as a removal. Failure screenshots land in
   `playwright/artifacts/`. See `rules/ci-e2e.md` → "Second client".
7. Runs the scripted playthroughs in the same container
   (`playwright/playthrough.mjs`, issue #290 part 2): a GM and a player play a
   short session from `playwright/playthroughs/`, the GM's client narrating
   through the real pipeline, with Claude answered from
   `playwright/recordings/` — so no key is needed. See `rules/ci-e2e.md` →
   "Scripted playthroughs".
8. Tears down the container (use `--keep` to leave it running).

Runtime: ~3–5 minutes (Foundry boot ~30 s + Quench suite ~130 s +
Cypress overhead). Designed for **per-PR** CI gating, not per-commit.

### Cypress flags

```bash
npm run test:e2e -- --keep       # leave Foundry running on failure for poking
npm run test:e2e -- --no-rebuild # skip data wipe — iterate the spec against
                                 # an already-running world. Useful while
                                 # developing the spec itself.
```

### Recording the playthroughs

The playthroughs replay recorded Claude replies. To record real ones (after
a prompt change, or to replace the hand-written placeholders a new scenario
starts with), run the whole suite with your key:

```bash
ANTHROPIC_API_KEY=sk-ant-… npm run test:e2e -- --record-playthroughs
```

The playthrough calls Claude for real (a scenario is a dozen or so calls)
and rewrites `playwright/recordings/<scenario>.json`. The key stays in the
Playwright process; the Foundry world only ever holds a placeholder. Check
the run passed before committing the recordings — a live model can drift
from what the scenario's checks expect.

A live model also varies from one run to the next. A recording is written
only from a run whose checks all passed, so a scenario that is to be recorded
is written to survive that: its lines sit well away from the pacing
classifier's boundaries (a move is an action with stakes, never a plain
question; conversation is plainly conversation) and its settings pin the
pacing dials and the Chronicle's floor; a check on what the model wrote
looks for what it is about, not for a name the model chose (`journalPage`
with `pageMatches`). Expect to run a recording more than once — and read why
a run failed before running it again: `rules/ci-e2e.md` → "Recording from a
live model".

### Running in a cloud session

`scripts/cloud.sh` runs the same stack inside a sandboxed Linux session — a
Claude Code cloud session — where `e2e.sh` cannot: outbound traffic leaves
through a proxy the Docker bridge cannot reach, Docker Hub rate-limits the
curl / Cypress / Playwright images, and the GitHub API is closed to other
repositories. It starts Foundry on the host network through the session's
proxy and drives it from the session's own Playwright and Chromium.

```bash
./scripts/cloud.sh up --fresh                 # Foundry, the world, the modules
./scripts/cloud.sh playthroughs               # replay — no key
ANTHROPIC_API_KEY=… ./scripts/cloud.sh playthroughs --record
./scripts/cloud.sh explore --rehearse         # an AI player's run, rehearsed — see "AI exploration"
./scripts/cloud.sh multiplayer
./scripts/cloud.sh quench
./scripts/cloud.sh down
```

It needs `FOUNDRY_USERNAME` and `FOUNDRY_PASSWORD` in the session's
environment (your foundryvtt.com account; an admin key is generated), and the
environment's network must allow, besides package registries: `ghcr.io`,
`pkg-containers.githubusercontent.com`, `foundryvtt.com`, `r2.foundryvtt.com`
and `api.foundryvtt.com`. Nothing it prints carries the account name, the
licence key or a key. `PLAYTHROUGH=<name>` runs one scenario.

What to expect there:

- **The machine restarts between commands now and then.** Docker stops and
  the proxy's port changes; run `up` again (about a minute — the Foundry
  download and the signed licence are kept in `./data`).
- **It is slow.** The browser has no hardware acceleration (Foundry says so
  on every page), and a step can take several times what it takes in CI.
- **Quench is not a gate there.** A dozen tests time out that pass in CI,
  on released code as well (known-issues CLOUD-QUENCH-TIMEOUTS). The Cypress
  run in GitHub Actions is still the check.
- **Keep CI's order.** `multiplayer` before `playthroughs`, on a fresh world
  (`up --fresh`): run after the playthroughs, its Begin a Session case times
  out; first, all seven cases pass.

`playwright/first-launch.mjs` is the Cypress spec's first-launch ritual
(licence, admin key, world launch, migration, module enablement) for that
browser; `playwright/quench.mjs` runs the Quench batches with the spec's
guards. See `rules/ci-e2e.md` → "Cloud sessions".

### AI exploration (on demand)

`playwright/explore.mjs` puts an AI player at the table (issue #302 slice D;
#290 part 3). It is given a persona and a goal — a *charter*,
`playwright/charters/*.json` — and plays as a logged-in player does: it reads
its own screen and types, clicks and fills dialogs. The GM's client runs the
real pipeline, and fixed rules — no model — answer what the module asks of
the GM (the move's confirmation; "Who are you interacting with?"; a draft for
someone in the charter's cast). An **observer** reads the
world, the chat and the prompts the module sent and scores the goal without
asking a model. The run is then **reviewed by whoever made it** — the full
transcript annotated, a scorecard, the action items as an issue, what it cost
and returned. No model reviews a run: the API reviewer the runner first had
saw the transcript alone, and was deleted (2026-11-23).
Nothing in CI runs this, and the run itself never files an issue, changes
code or rewrites a recording: it writes evidence.

```bash
./scripts/cloud.sh up --fresh
./scripts/cloud.sh explore --rehearse      # no key, no spend: the live path with the model API stood in for
./scripts/cloud.sh explore                 # LIVE: real models, real money, up to the caps
./scripts/cloud.sh explore --replay playwright/artifacts/explore/<run>   # an earlier run again, no key
EXPLORE_CHARTER=long-haul ./scripts/cloud.sh explore --rehearse           # the long haul, rehearsed (about 15 minutes)
```

| Mode | Key | What it tells you |
| --- | --- | --- |
| live | `ANTHROPIC_API_KEY` | How the narrator did, for this player, this once. |
| rehearsal | none | That the runner works — the budget's gate, the player's tool calls, the recording. Its "narrator" is scripted (`playwright/lib/rehearsal.mjs`), so its score says nothing about the real one. `EXPLORE_REHEARSAL_FORGET=1` rehearses a narrator that keeps nothing. |
| replay | none | That a run's finding reproduces: its actions, dice and replies in a fresh world, scored again. |

**The first charter is memory** (`charters/memory.json`): the player
establishes a possession, travels, ends the session, begins the next and asks
about it without naming it. When the question is asked the observer looks for
the fact at three layers — in a store a narration is built from, in the
prompt for that question, in the answer — so a miss says where it was lost:
`storage`, `retrieval` or `generation`.

**The long haul** (`charters/long-haul.json`, issue #373) is three sessions
and about ninety player actions that load the narrator's memory and the
mechanics together:

- **26 beats**, each with a result the observer checks in the world. The
  player is told the beats and which is current; the observer marks a beat
  done and moves on, and a beat not reached in eight actions is
  `not-exercised`.
- **A ledger of seven facts** — a possession, a name and its pronouns, an
  item handed over, a promise, where the ship is, a correction, a rename —
  each asked about in every later session, scored stored / in the prompt / in
  the answer, with the words that would contradict it; read against the
  narrator's answers **and** against every summary, Chronicle entry and recap
  the helpers wrote.
- **Mechanical checks after every action**, from the game's text: each roll
  recomputed from the dice on its card, meters and tracks in bounds, progress
  and rewards by rank, an effect landing once, the lock free, every line
  answered once.
- **Six decisive rolls scripted, the rest real, all recorded**; the GM is
  fixed rules.
- **Four interruptions** made by the runner: the GM's page reloads mid-fight,
  End a Session is opened and closed unanswered, the X-Card is played, the
  connection's card is renamed.

Its rehearsal rolls: the stand-in's classifier calls a move where the script
makes the line one, so the move path — confirmation, held result, price,
victory card — is walked with no key. A long run also writes `beats.json`,
`mechanics.json` and `ledger.json`. Its caps are its own: 100 actions, 400
model calls, 60 minutes, $15.

Every run that calls a model — either charter — writes `review-data.json`
and the generated layers of its review: `annotated-transcript.md` and
`scorecard.md`, with the reader's notes left to write.

**Caps** (`playwright/explore.config.json`): 30 player actions, 100 model
calls, 20 minutes, $10 — whichever comes first. Every call counts — the
narrator's and the helpers', the player's, retries — and each
one's worst cost (its whole prompt, its whole `max_tokens`) is reserved before
it is sent, so calls in flight together cannot pass the dollar cap. A model
with no price in the config is refused. **Check the prices there against
Anthropic's price list before a live run**: the cost is computed from that
table. A cache write is priced by how long it is kept — 1.25 times input for
five minutes, twice for an hour.

**A live run is given its questions first.** It is refused without
`EXPLORE_QUESTIONS` — what the run is to answer that a rehearsal cannot, one
question to a line:

```bash
EXPLORE_CHARTER=long-haul EXPLORE_QUESTIONS="$(cat questions.txt)" ./scripts/cloud.sh explore
```

They are kept in `run.json` and head a long run's scorecard, each with a
place for its answer.

**Evidence** lands in `playwright/artifacts/explore/<charter>-<mode>-<time>/`
and is written as the run goes, so a run a cap or a crash stops still leaves
it: `run.json` (what ran, what it cost, the result and why, the command that
replays it), `actions.json` (each action: the screen it was chosen on, the
reason given, what happened), `transcript.md`, `observer.json` (the world
after each action, the goal scored layer by layer, health), `requests.json`
(every prompt and reply, no headers), `replay.json`. The key is
in none of them. The folder is not committed; to keep a finding, turn its
`replay.json` into a scripted playthrough or a unit test.

**Results** (`run.json` → `classification`):

| | |
| --- | --- |
| `pass` | The goal was achieved and nothing failed. The run's own verdict — read the review before trusting it. |
| `product-failure` | A check that holds whatever the charter failed: the move lock still held at the end, an error of the module's on a page, a step the table never finished — and, in a long run, a mechanical check violated or a beat brought about wrongly (each named with its step; the check may be the one at fault). |
| `suspected-quality-issue` | The goal was not achieved (the layer is named); in a long run, a fact lost or refused. For a person to read. |
| `not-exercised` | The goal was never put to the test — the player stopped early or named the fact itself, or the GM's screen was left waiting on a question the GM's rules do not answer (the window is named); in a long run, more than a quarter of the beats were never exercised. Not a pass. |
| `budget-exhausted` | A cap ended the run before the goal was put to the test. |
| `infrastructure-error` | The run could not be made: Foundry, the browser, or the model API failed. |

**A live run kept.** `playwright/explorations/memory-live-20261122/` is the
first live run of the memory charter that went the whole way (12 actions, 40
model calls, $0.34): its `replay.json`, with its `run.json`, `transcript.md`,
`annotated-transcript.md` — the whole session with notes on what went right
and wrong — and `scorecard.md` beside it for a reader. Its action items are
issue #374. Every live run ends with such a review (`rules/ci-e2e.md` → "AI
exploration"). Anyone can play it again with no key:

```bash
./scripts/cloud.sh explore --replay playwright/explorations/memory-live-20261122
```

It ends `REPRODUCED` while the module still carries what the first session
established into the second. `playwright/explorations/memory-live-20261123/`
is the same charter run again after issue #374's two fixes, by the Sonnet
player (12 actions, 40 model calls, $0.25), with a miss and its price in it;
its review found a move that was offered and narrated as made. It replays
the same way. When it diverges after a change that was meant
to alter the narrator's calls, make a new live run and put its files there
(about 35 cents). CI does not run it.

In a Claude Code cloud session, store the key on the environment as
`PLAYTEST_ANTHROPIC_API_KEY` — a variable named `ANTHROPIC_API_KEY` did not
reach the session's shell (2026-11-22). `cloud.sh` reads either. See
`rules/ci-e2e.md` → "AI exploration".

### Cypress artifacts

A failing run drops screenshots under `test/ci/cypress/artifacts/screenshots/`.
Videos are off by default — enable them in `cypress.config.js` if you
need to see the timeline of a flake.

### Why both Foundry AND Cypress in Docker?

We considered Cypress-on-host (talking to Foundry-in-container) but
went with both containerised. Reasons:

- Same compose graph is reused verbatim by Phase 3 (GitHub Actions),
  which can't run Cypress on the host.
- Cypress hits Foundry via `http://foundry:30000` via Docker service-
  name DNS — no localhost binding needed, no host firewall trips.
- Macs vary in Cypress install state (`xcrun` prompts, etc.). The
  `cypress/included` image is reproducible across machines.

Cost: first pull of `cypress/included:14` is ~2 GB. Subsequent runs use
the cached image.

### Iterating on the spec

The spec lives at `test/ci/cypress/e2e/quench.cy.js`. When developing:

```bash
# Start a long-lived Foundry stack you can re-target:
./scripts/start.sh        # one-time first-launch ritual in browser
# Then for each spec iteration:
npm run test:e2e -- --no-rebuild
```

`--no-rebuild` skips the wipe + reinstall + boot, so each iteration is
~30 s of Cypress runtime alone.

## Automated CI gate (Phase 3)

GitHub Actions runs the same `npm run test:e2e` command on every pull
request — open, push, reopen. See `.github/workflows/e2e.yml`. The
workflow gates PR mergeability; a Quench failure shows as a red ✗ on
the PR status checks.

### One-time setup — repo secrets

The workflow needs three GitHub repository secrets to authenticate to
foundryvtt.com and to the Foundry admin console. Add them under
*Settings → Secrets and variables → Actions → New repository secret*:

| Secret | What it is |
|---|---|
| `FOUNDRY_USERNAME` | Your foundryvtt.com account username (or email). |
| `FOUNDRY_PASSWORD` | Your foundryvtt.com account password. |
| `FOUNDRY_ADMIN_KEY` | The admin password for the dev server — any value. |

These are surfaced to the orchestrator as environment variables; the
`test/ci/scripts/lib/keychain.sh` shim transparently reads from the
env in CI mode (when `CI=true` or non-Darwin) and from the macOS
Keychain on a developer machine. Same `e2e.sh` either way.

### When the workflow runs

- On `pull_request` events: `opened`, `synchronize` (each push to the
  PR branch), `reopened`.
- Skipped on docs-only PRs — the `paths:` filter limits it to changes
  under `src/`, `tests/`, `test/ci/`, `lang/`, `styles/`, `packs/`,
  `module.json`, `package.json`, `package-lock.json`, or the workflow
  file itself.
- Concurrency-cancelled: when a new commit lands on a PR while an
  earlier run is still going, the earlier run is cancelled.

### Cost considerations

- Each run takes ~5–10 minutes (Docker image pulls + Foundry zip
  download + Quench suite).
- Each run authenticates to foundryvtt.com once for the zip download.
  felddy's hostname-based license fingerprinting (the
  `hostname: starforged-ci-host` directive in `docker-compose.yml`)
  keeps the activation stable across runs.
- The runner is fresh per invocation, so Docker images and the
  Foundry zip re-download each time. Could be cached via
  `actions/cache@v4` if total minutes become a constraint; left
  unoptimised on purpose for the first cut.
- GitHub Actions Linux runners are free for public repos.

### Where the test artifacts go

- **On every run** (pass or fail): the `cypress-artifacts-<run-id>`
  artifact contains `screenshots/` and `videos/` from the Cypress
  container. Useful for diagnosing flaky selector matches.
- **On failure only**: the `foundry-logs-<run-id>` artifact contains
  the Foundry server's `Logs/` directory.

Both retain for 14 days, then expire.

## Lifecycle scripts

| Script | What it does |
|---|---|
| `scripts/install-deps.sh` | Pre-populates `./data/Data/{systems,modules}` with foundry-ironsworn v1.28.4, latest Quench, and Starforged Companion (copied from the working tree). Re-run any time you change module source. |
| `scripts/setup-test-world.sh` | Copies the world template into `./data/Data/worlds/starforged-ci-world/`. Idempotent — pass `--force` to wipe and reinstall. |
| `scripts/credentials.sh` | Manage Keychain entries (`set`, `status`, `clear`, `export`). |
| `scripts/start.sh` | Loads creds from Keychain (prompts on first run), `docker compose up -d`, tails logs. Ctrl+C detaches; the server keeps running. |
| `scripts/stop.sh` | `docker compose down`. Preserves `./data/`. |
| `scripts/reset.sh --yes` | Destroys the container and `./data/`. Does **not** touch Keychain — use `scripts/credentials.sh clear` for that. |
| `scripts/e2e.sh` | Phase 2 orchestrator — fresh-world Cypress run. Same as `npm run test:e2e`. |
| `scripts/wait-for-foundry.sh` | Polls `http://localhost:30000/` until it responds 2xx/3xx. Used by `e2e.sh` after `docker compose up`. |
| `scripts/cloud.sh` | The stack in a sandboxed Linux (Claude Code cloud) session: `up [--fresh]`, `playthroughs [--record]`, `multiplayer`, `quench`, `status`, `down`. See "Running in a cloud session". |

## Refreshing the module under test

After you change anything under `src/`, `lang/`, `styles/`, `packs/`, or
`module.json`:

```bash
./scripts/install-deps.sh        # recopies the module from the working tree
# in browser: F5 the Foundry tab — module reloads from disk
```

You do not need to restart the container.

## Why a build step instead of a bind mount?

We deliberately copy the module into the container's data directory rather
than bind-mounting `src/`. That way:

- The test environment exercises the same loading path as a real install
- Foundry's manifest scanner sees a complete `module.json` next to the
  files it references, with no surprise files (test fixtures, .git, etc.)
- We catch packaging mistakes (missing files, wrong paths) in CI rather
  than only in production

The trade-off is that `install-deps.sh` must be re-run after source changes.
That's a fair price for production parity.

## What's installed and where

```
test/ci/data/
├── Config/                              # Foundry server config (auto-generated)
├── Data/
│   ├── modules/
│   │   ├── quench/                      # latest release from Ethaks/FVTT-Quench
│   │   └── starforged-companion/        # copied from working tree
│   ├── systems/
│   │   └── foundry-ironsworn/           # v1.28.4 release from ben/foundry-ironsworn
│   └── worlds/
│       └── starforged-ci-world/         # from test/ci/world-template/
├── Logs/
└── container_cache/                     # cached Foundry zip (felddy)
```

`./data/` is gitignored. The world template, module source, and pinned
versions are committed.

## Decision: programmatic vs. pre-baked world

Phase 1 plan offered two options for world creation:

- **(a) Programmatic via Foundry setup API** — rejected.
- **(b) Pre-baked world fixture** — chosen.

Option (b) wins because:

1. The setup API requires an authenticated admin session and is fragile
   between Foundry versions.
2. Module enablement and GM password storage live inside the world's
   settings DB, which doesn't exist until the world is launched once. So
   even with option (a), the user would still have to launch the world
   in a browser before either could be set programmatically.
3. A static `world-template/` is reproducible, diff-able in git, and
   trivial to reset.

The cost is a one-time three-click step in the browser (enable modules,
optional GM password). Documented above. Phase 2 (Cypress) will automate
even that.

## Troubleshooting

### License verification fails on every restart

The felddy image fingerprints the license against the container hostname.
If the hostname changes, Foundry treats it as a new machine. The compose
file pins `hostname: starforged-ci-host` to keep it stable; if you copy
the stack to another machine or run multiple stacks, give each one a
unique stable hostname. **Don't** remove the `hostname:` directive.

### Port 30000 already in use

Another local Foundry instance is running. Either stop it, or edit
`docker-compose.yml`:

```yaml
ports:
  - "30001:30000"     # host:container
```

…and use `http://localhost:30001`.

### `data/` permission denied (macOS)

Docker Desktop needs explicit file-sharing permission for the path that
contains your repo. *Docker Desktop → Settings → Resources → File Sharing*,
then add the parent directory of your repo. Restart Docker Desktop after.

If `./data/` was created with bad ownership during a botched run, fix it
with:

```bash
sudo chown -R "$(id -u):$(id -g)" data/
```

…or just nuke it: `./scripts/reset.sh --yes`.

### `.local` hostname quirks

The compose file uses `starforged-ci-host` (no `.local` suffix) on
purpose. macOS Bonjour treats `*.local` as multicast, which can confuse
license verification inside the container. Don't rename the hostname to
anything `.local`.

### "World template missing" or `system.json` missing after install

The release artifact layout for foundry-ironsworn or Quench changed.
`install-deps.sh` flattens a single top-level directory inside the zip
and dies if `system.json` / `module.json` isn't present after extract.
Inspect the zip manually:

```bash
curl -L -o /tmp/foo.zip <release-url>
unzip -l /tmp/foo.zip | head
```

…and adjust the script.

### First boot is slow

The felddy entrypoint downloads the Foundry zip on first boot using your
foundryvtt.com credentials. Subsequent boots reuse the zip from
`./data/container_cache/`. Expect a one-time ~30s wait.

### Quench batch doesn't appear in the UI

Most likely the Starforged Companion module isn't actually enabled —
*Settings → Manage Modules*, confirm the checkbox. If it is enabled but
batches are missing, check the Foundry browser console for module load
errors. Quench batches register on the `quenchReady` hook, which only
fires if both Quench and the module loaded cleanly.

## What's pinned, what floats

| Component | Version policy |
|---|---|
| Foundry VTT | v13 (image tag `:13`) |
| foundry-ironsworn | pinned to `1.28.4` in `install-deps.sh` |
| Quench | latest release at install time |
| Starforged Companion | current working tree |

Pin Quench to a specific tag if you start hitting flakes from upstream.
Update the foundry-ironsworn pin in lockstep with `vendor/foundry-ironsworn`
and `module.json`'s `recommends` block.
