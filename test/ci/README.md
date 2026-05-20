# Local Foundry CI Stack — Phase 1

A Docker stack that boots Foundry VTT v13 with the foundry-ironsworn system,
the Starforged Companion module (built from your working tree), and Quench
pre-installed. You log in via browser at `http://localhost:30000` and run
Quench batches manually.

This is **Phase 1** of the CI work. It is intentionally manual:

- **Phase 1 (this):** working local Docker stack, browser-driven testing
- **Phase 2:** Cypress automation against the same stack
- **Phase 3:** GitHub Actions wrapping the whole thing

Do not introduce Cypress or CI workflows here — those belong in later phases.

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
3. **Setup screen — World list** — `Starforged CI Test World` should be
   listed. Click **Launch World**.
4. **Join screen** — pick the **Gamemaster** user, leave password blank
   the first time. (You can set a GM password under *Settings → Configure
   Players* once inside the world.)
5. **Inside the world — enable modules** — open *Settings → Manage Modules*
   and tick:
   - Starforged Companion
   - Quench
   Click **Save Module Settings**. The world will reload.
6. **Run Quench** — open the Quench UI from the sidebar. Run a batch
   (e.g. `starforged-companion.actorBridge`) to confirm the module is
   loading and the test harness works.

After this one-time setup, Foundry remembers everything in `./data/`. Stop
and start the stack freely without redoing it.

## Lifecycle scripts

| Script | What it does |
|---|---|
| `scripts/install-deps.sh` | Pre-populates `./data/Data/{systems,modules}` with foundry-ironsworn v1.27.0, latest Quench, and Starforged Companion (copied from the working tree). Re-run any time you change module source. |
| `scripts/setup-test-world.sh` | Copies the world template into `./data/Data/worlds/starforged-ci-world/`. Idempotent — pass `--force` to wipe and reinstall. |
| `scripts/credentials.sh` | Manage Keychain entries (`set`, `status`, `clear`, `export`). |
| `scripts/start.sh` | Loads creds from Keychain (prompts on first run), `docker compose up -d`, tails logs. Ctrl+C detaches; the server keeps running. |
| `scripts/stop.sh` | `docker compose down`. Preserves `./data/`. |
| `scripts/reset.sh --yes` | Destroys the container and `./data/`. Does **not** touch Keychain — use `scripts/credentials.sh clear` for that. |

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
│   │   └── foundry-ironsworn/           # v1.27.0 release from ben/foundry-ironsworn
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
| foundry-ironsworn | pinned to `1.27.0` in `install-deps.sh` |
| Quench | latest release at install time |
| Starforged Companion | current working tree |

Pin Quench to a specific tag if you start hitting flakes from upstream.
Update the foundry-ironsworn pin in lockstep with `vendor/foundry-ironsworn`
and `module.json`'s `recommends` block.
