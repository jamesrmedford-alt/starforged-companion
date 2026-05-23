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
