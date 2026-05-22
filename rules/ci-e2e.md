# CI & End-to-end testing — rules

Topic-specific knowledge for the three-phase CI stack at `test/ci/` and
`.github/workflows/e2e.yml`. Read before touching the e2e suite or the
Docker scaffolding.

**Phases:**
1. Local Docker stack (`test/ci/`) — Foundry + foundry-ironsworn + Quench + module under test, driven manually via browser.
2. Cypress spec (`test/ci/cypress/`) — automates the manual ritual + invokes `quench.runBatches()`.
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

## GitHub Actions (`.github/workflows/e2e.yml`)

**Triggers:** `pull_request: [opened, synchronize, reopened]`. *Not* `push` — per-PR cadence, not per-commit. `concurrency.cancel-in-progress: true` supersedes older runs.

**Paths filter:** matches changes under `src/`, `tests/`, `test/ci/`, `lang/`, `styles/`, `packs/`, `module.json`, `package.json`, `package-lock.json`, `.github/workflows/e2e.yml`. Docs-only PRs (changes only to `docs/`, `CLAUDE.md`, `rules/`, `*.md`) don't trigger the suite. Use empty commits cautiously — they pass the paths filter (no path changed → nothing matches) and **skip** the workflow.

**Repo settings prerequisites:**
- *Settings → Actions → General → Actions permissions* must allow GitHub-published actions (`actions/checkout`, `actions/upload-artifact`). The most restrictive ("Allow [owner] actions only") blocks the workflow at startup.
- Secrets: `FOUNDRY_USERNAME`, `FOUNDRY_PASSWORD`, `FOUNDRY_ADMIN_KEY`. The workflow validates them in a fail-fast step before paying the Docker-pull cost.

**Linux bind-mount permissions:** `felddy/foundryvtt` runs as uid:gid 1000:1000 inside; the GHA runner user is 1001. Bind-mounted `./data` is owned by the runner user and the container can't write. `e2e.sh` does `sudo chown -R 1000:1000 ./data` when `CI=true`. (macOS Docker Desktop magic-mounts with permissive perms, so this isn't needed locally.)

**Workflow token permissions:** default is `contents: read`. Add `pull-requests: write` if the workflow posts PR comments via `gh api`:

```yaml
permissions:
  contents: read
  pull-requests: write
```

## Autonomous iteration loop

When iterating on the Cypress spec (or any CI-gated work), use the
PR-comment / webhook pattern so the agent doesn't need a human in the
loop between fixes and diagnostics.

**Setup (one-time, in the workflow):**
- Tee the orchestrator stdout to a log file: `npm run test:e2e 2>&1 | tee test/ci/cypress/artifacts/e2e-run.log` (with `set -o pipefail`).
- On `if: failure()`, post the last ~50 KB of that log to the PR as a *sticky* comment — search existing comments for a hidden marker (`<!-- e2e-log:sticky -->`) and PATCH it in place via `gh api`; only POST a new one if none exists. Keeps the PR thread tidy across many iterations.

**Setup (in the session):**
- Call `mcp__github__subscribe_pr_activity(owner, repo, pullNumber)`. Webhook events for the PR arrive as `<github-webhook-activity>` messages that wake the session.
- Don't poll. Don't use Bash `sleep` to wait for CI. The webhook tells you when a run finishes.

**On each `github-webhook-activity` event:**
1. Call `mcp__github__pull_request_read` with `method=get_comments`. The response is large — slice via `python3 -c "print(open(file).read()[A:B])"` if it exceeds the token budget.
2. Find the sticky comment (`'<!-- e2e-log:sticky -->' in body`). Read its tail.
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
