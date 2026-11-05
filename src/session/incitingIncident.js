/**
 * STARFORGED COMPANION
 * src/session/incitingIncident.js — Envision an Inciting Incident.
 *
 * Rulebook "Begin your adventure", step 1: the inciting incident is the
 * dramatic opening event that launches the campaign and sets up the first vow.
 * The play kit envisions it via oracles; this module rolls an Action + Theme
 * spark ("Ask the Oracle — Spark an Idea") and routes it through the narrator,
 * grounded in the established World Truths / starting sector / local connection
 * / character, to compose the opening fiction plus a suggested starting vow.
 *
 * Surfaced as the ✦ Envision Inciting Incident button on the Session panel and
 * the `!incite` chat command (see src/ui/sessionPanel.js, src/index.js). Falls
 * back to an oracle-spark-only card when no Claude key is set or narration is
 * disabled, mirroring the Spotlight Vignette's oracle-only path.
 */

import { rollOracle } from "../oracles/roller.js";
import { stripMarkup } from "../audio/segments.js";
import { newNarrationId } from "../factContinuity/ledgers.js";

const MODULE_ID = "starforged-companion";

/**
 * Roll the Action + Theme spark (the play-kit "Spark an Idea" pair).
 * @returns {{ action: string, theme: string }}
 */
export function rollIncitingSpark() {
  const safe = (id) => {
    try { return rollOracle(id)?.result ?? ""; }
    catch { return ""; }
  };
  return { action: safe("action"), theme: safe("theme") };
}

/**
 * Build the narrator user message. Pure (no Foundry/IO) so it's unit-testable.
 * The World Truths / sector / connection / character are injected by the
 * narrator system prompt (inciting_incident mode); the user message carries the
 * task framing + the oracle spark.
 *
 * @param {{ action: string, theme: string }} spark
 * @returns {string}
 */
export function buildIncitingIncidentUserMessage(spark) {
  return [
    `Envision the campaign's inciting incident — the dramatic opening event that`,
    `launches the campaign and sets up the character's first vow.`,
    ``,
    `Oracle spark (Ask the Oracle — Action + Theme), interpret loosely as inspiration:`,
    `- Action: ${spark?.action || "—"}`,
    `- Theme: ${spark?.theme || "—"}`,
  ].join("\n");
}

/**
 * Find a labelled proposal line (`Suggested vow: …`) in the narrator's reply.
 * Markdown may wrap the label — "**Suggested vow:** …", "**Suggested vow**:",
 * "- *Suggested vow:* …", a whole bold line — and emphasis is stripped from
 * the value. The closing `**` after the colon leaked into it: the vow was
 * sworn as "** I will find Dani", the clock was "** Dani's captivity", and the
 * target "** Dani Okoro" no longer matched the established Dani Okoro, so the
 * swear made a second connection (issue #325 W33).
 *
 * @param {string} full
 * @param {string} label — e.g. "Suggested vow"
 * @returns {{ line: string, value: string }|null} the whole matched line (to
 *   cut from the prose) and the value with its Markdown emphasis removed
 */
function matchLabelLine(full, label) {
  const m = full.match(new RegExp(`^[ \\t>*_-]*${label}[*_]*\\s*:[*_]*\\s*(.+?)\\s*$`, "im"));
  if (!m) return null;
  return { line: m[0], value: stripEmphasis(m[1]) };
}

/** Markdown emphasis out of a proposal value: paired `**` / `__` / `*` / `_` and stray edge markers. */
function stripEmphasis(text) {
  return String(text ?? "")
    .replace(/(?<![\p{L}\p{N}])(\*\*|__)(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}])/gu, "$2")
    .replace(/(?<![\p{L}\p{N}*_])([*_])(?=\S)(.+?)(?<=\S)\1(?![\p{L}\p{N}*_])/gu, "$2")
    .replace(/^[*_\s]+|[*_\s]+$/g, "")
    .trim();
}

/**
 * Split a trailing `Suggested vow: <statement> (<rank>)` line off the narrator
 * prose. Returns `{ prose, vow }` where `vow` is null when no line is present.
 * Pure — used by the card renderer and unit-tested.
 *
 * @param {string} text
 * @returns {{ prose: string, vow: { statement: string, rank: string|null, raw: string } | null }}
 */
export function splitSuggestedVow(text) {
  const full = String(text ?? "");
  const m = matchLabelLine(full, "Suggested vow");
  if (!m) return { prose: full.trim(), vow: null };

  const vowLine = m.value;
  const prose   = full.replace(m.line, "").trim();
  const rankMatch = vowLine.match(/\(([^)]+)\)\s*$/);
  const rank      = rankMatch ? rankMatch[1].trim().toLowerCase() : null;
  const statement = (rankMatch ? vowLine.replace(rankMatch[0], "") : vowLine).trim();
  return { prose, vow: { statement, rank, raw: vowLine } };
}

/** Clock sizes the foundry-ironsworn progress sheet supports. */
const VALID_CLOCK_SEGMENTS = [4, 6, 8, 10, 12];

/**
 * Split a trailing `Suggested clock: <label> (<N> segments)` line off the
 * narrator prose (Cluster B / F4). Returns `{ prose, clock }` where `clock`
 * is `{ label, segments }` or null when no line is present. Segment counts
 * are snapped to the nearest sheet-supported size (4/6/8/10/12); a line
 * without a parseable count yields null (no clock is better than a wrong
 * one). Pure — unit-tested.
 *
 * @param {string} text
 * @returns {{ prose: string, clock: { label: string, segments: number } | null }}
 */
export function splitSuggestedClock(text) {
  const full = String(text ?? "");
  const m = matchLabelLine(full, "Suggested clock");
  if (!m) return { prose: full.trim(), clock: null };

  const prose     = full.replace(m.line, "").trim();
  const line      = m.value;
  const segsMatch = line.match(/\((\d+)\s*segments?\)\s*$/i);
  if (!segsMatch) return { prose, clock: null };

  const requested = Number(segsMatch[1]);
  if (!Number.isFinite(requested) || requested <= 0) return { prose, clock: null };
  const segments = VALID_CLOCK_SEGMENTS.reduce((best, s) =>
    Math.abs(s - requested) < Math.abs(best - requested) ? s : best,
  VALID_CLOCK_SEGMENTS[0]);

  const label = line.replace(segsMatch[0], "").trim();
  if (!label) return { prose, clock: null };
  return { prose, clock: { label, segments } };
}

/** Segment counts the tension-clock store (createClock) supports. */
const VALID_TENSION_SEGMENTS = [4, 6, 8, 10];

/**
 * Split a trailing `Immediate crisis: <label> (<N> segments)` line off the
 * narrator prose (#248 Theme A). This is a proximal danger unfolding in the
 * opening scene, SEPARATE from the long vow — a first scene to tackle now that
 * becomes a standalone tension clock, distinct from the vow's own (rare)
 * deadline clock. Returns `{ prose, crisis }` where `crisis` is
 * `{ label, segments }` or null. Segment counts snap to the tension-clock set
 * (4/6/8/10 — NOT the vow-clock set, which also allows 12); a line without a
 * parseable count yields null. Pure — unit-tested.
 *
 * @param {string} text
 * @returns {{ prose: string, crisis: { label: string, segments: number } | null }}
 */
export function splitImmediateCrisis(text) {
  const full = String(text ?? "");
  const m = matchLabelLine(full, "Immediate crisis");
  if (!m) return { prose: full.trim(), crisis: null };

  const prose     = full.replace(m.line, "").trim();
  const line      = m.value;
  const segsMatch = line.match(/\((\d+)\s*segments?\)\s*$/i);
  if (!segsMatch) return { prose, crisis: null };

  const requested = Number(segsMatch[1]);
  if (!Number.isFinite(requested) || requested <= 0) return { prose, crisis: null };
  const segments = VALID_TENSION_SEGMENTS.reduce((best, s) =>
    Math.abs(s - requested) < Math.abs(best - requested) ? s : best,
  VALID_TENSION_SEGMENTS[0]);

  const label = line.replace(segsMatch[0], "").trim();
  if (!label) return { prose, crisis: null };
  return { prose, crisis: { label, segments } };
}

/**
 * Split a trailing `Vow target: <Name> (<pronouns>) — <description>` line off
 * the narrator prose (Cluster B / F3). Returns `{ prose, target }` where
 * `target` is `{ name, pronouns, description }` or null. The pronoun
 * parenthetical is optional and only consumed when it is pronoun-shaped
 * (`she/her`, `they/them`, …) — a name like "Vance (the Elder)" keeps its
 * parenthetical. The name/description divider accepts an em dash, en dash,
 * or spaced hyphen; a line with no divider is treated as a bare name.
 * Pure — unit-tested.
 *
 * Pronoun capture is CHAR-NPC-PRONOUN-ROLL-BLIND (character-detail audit
 * 2026-07): the prose that opens the campaign genders its vow target; without
 * carrying that to the connection record, seeding rolled pronouns at random
 * and had a 2/3 chance of contradicting the opening fiction.
 *
 * @param {string} text
 * @returns {{ prose: string,
 *             target: { name: string, pronouns: string, description: string } | null }}
 */
export function splitVowTarget(text) {
  const full = String(text ?? "");
  const m = matchLabelLine(full, "Vow target");
  if (!m) return { prose: full.trim(), target: null };

  const prose = full.replace(m.line, "").trim();
  // The target's kind — "[faction]" after the name and pronouns — is taken
  // out first; with none, it is read from the description (vowTargetKind).
  // Only a person becomes a connection (issue #326 W70).
  let kind = null;
  const line  = m.value.replace(/\s*\[\s*(person|creature|faction|vessel)\s*\]/i, (_all, k) => {
    kind = k.toLowerCase();
    return "";
  });
  const div   = line.match(/\s*(?:—|–|:|\s-\s)\s*/);

  const splitPronouns = (rawName) => {
    // Trailing "(she/her)"-shaped parenthetical only — two or three
    // slash-separated word tokens. Anything else stays part of the name.
    const pm = rawName.match(/^(.*?)\s*\(([a-zA-Z]+\/[a-zA-Z]+(?:\/[a-zA-Z]+)?)\)$/);
    if (!pm) return { name: rawName, pronouns: "" };
    return { name: pm[1].trim(), pronouns: pm[2].toLowerCase() };
  };

  if (!div) {
    if (!line) return { prose, target: null };
    const { name, pronouns } = splitPronouns(line.trim());
    return { prose, target: name ? { name, pronouns, description: "", kind: kind ?? vowTargetKind("") } : null };
  }
  const rawName     = line.slice(0, div.index).trim();
  const description = line.slice(div.index + div[0].length).trim();
  const { name, pronouns } = splitPronouns(rawName);
  if (!name) return { prose, target: null };
  return { prose, target: { name, pronouns, description, kind: kind ?? vowTargetKind(description) } };
}

// The head noun of a description's first phrase, by kind — "a zealot faction
// that seized the relay" is a faction; "a smuggler who works for the Iron
// Syndicate" a person (the faction is after the head).
const VOW_TARGET_KIND_WORDS = [
  ["faction",  /\b(faction|syndicate|cartel|guild|order|covenant|clan|corporation|consortium|collective|alliance|cult|movement|church|dynasty|house|regime|empire|union|brotherhood|sisterhood|league|federation|gang|pirates|raiders)\b/i],
  ["vessel",   /\b(ship|starship|vessel|freighter|cruiser|frigate|dreadnought|corvette|hauler|shuttle|derelict|station|flagship|warship)\b/i],
  ["creature", /\b(creature|beast|leviathan|lifeform|organism|monster|swarm|predator|horror|entity)\b/i],
];

/**
 * The kind of a vow target a proposal line gave no kind for, read from its
 * description's first phrase (up to "that" / "who" / "which" / a comma):
 * faction, vessel or creature when its head names one, else person — the
 * kind the line was read as before (issue #326 W70).
 *
 * @param {string} description
 * @returns {"person"|"creature"|"faction"|"vessel"}
 */
export function vowTargetKind(description) {
  const head = String(description ?? "").split(/\s+(?:that|who|whose|which|whom)\b|[,;.]/i)[0] ?? "";
  for (const [kind, re] of VOW_TARGET_KIND_WORDS) if (re.test(head)) return kind;
  return "person";
}

/**
 * Split a trailing `Situation: <one-line summary>` off the narrator prose.
 * This is the narrator's own cohesive synthesis of the opening — the single
 * durable entry the campaign journal records, instead of the per-beat lore
 * fragments the generic detector would otherwise scatter. Pure — unit-tested.
 *
 * @param {string} text
 * @returns {{ prose: string, situation: string | null }}
 */
export function splitSituationSummary(text) {
  const full = String(text ?? "");
  const m = matchLabelLine(full, "Situation");
  if (!m) return { prose: full.trim(), situation: null };
  const situation = m.value;
  const prose     = full.replace(m.line, "").trim();
  return { prose, situation: situation || null };
}

/**
 * Run all trailing-line parsers (situation, target, clock, vow — order-agnostic
 * since each is line-anchored) and return the cleaned prose plus the full
 * structured proposal. This is what the card renderer and the swear-vow
 * click handler consume.
 *
 * @param {string} text
 * @returns {{ prose: string,
 *             vow:             { statement, rank, raw } | null,
 *             clock:           { label, segments }      | null,
 *             immediateCrisis: { label, segments }      | null,
 *             target:          { name, description }    | null,
 *             situation:       string                   | null }}
 */
export function splitIncitingMeta(text) {
  const s  = splitSituationSummary(text);
  const t  = splitVowTarget(s.prose);
  const ic = splitImmediateCrisis(t.prose);
  const c  = splitSuggestedClock(ic.prose);
  const v  = splitSuggestedVow(c.prose);
  return { prose: v.prose, vow: v.vow, clock: c.clock, immediateCrisis: ic.crisis, target: t.target, situation: s.situation };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Render the inciting-incident chat-card HTML. Pure — separated from the
 * ChatMessage.create call so it can be unit-tested.
 *
 * When narrator prose is present the structured proposal (vow / clock /
 * target) renders beneath it with a ⚔ Swear this vow button (Cluster B:
 * F2 + F3 + F4). `sworn: true` renders the post-click state instead of the
 * button — used by the click handler's in-place card rewrite.
 *
 * @param {{ spark: {action,theme}, text: string|null, fallback?: boolean,
 *           sworn?: boolean }} args
 * @returns {string}
 */
export function renderIncitingIncidentCard({ spark, text, fallback = false, sworn = false }) {
  const sparkLine =
    `<p class="sf-incite-spark"><strong>Spark (Action + Theme):</strong> ` +
    `${escapeHtml(spark?.action)} / ${escapeHtml(spark?.theme)}</p>`;

  let body;
  if (fallback || !text) {
    body = `${sparkLine}<p class="sf-incite-prompt"><em>Envision an inciting incident ` +
      `from this spark — the dramatic event that opens your campaign and sets up your ` +
      `first vow — then Swear an Iron Vow.</em></p>`;
  } else {
    const { prose, vow, clock, immediateCrisis, target } = splitIncitingMeta(text);
    const proseHtml = prose
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p>${escapeHtml(stripMarkup(p)).replace(/\n+/g, " ")}</p>`)
      .join("");
    const vowHtml = vow
      ? `<p class="sf-incite-vow"><strong>Suggested vow:</strong> ${escapeHtml(vow.statement)}` +
        `${vow.rank ? ` <em>(${escapeHtml(vow.rank)})</em>` : ""}` +
        `${clock ? `<br><span class="sf-incite-clock">⏱ ${escapeHtml(clock.label)} — ` +
          `${clock.segments}-segment clock</span>` : ""}</p>`
      : "";
    // Proximal crisis (#248 Theme A): a separate, immediate danger rendered
    // distinct from the long vow — it becomes its own tension clock on swear.
    const crisisHtml = immediateCrisis
      ? `<p class="sf-incite-crisis">⏱ <strong>Immediate crisis:</strong> ${escapeHtml(immediateCrisis.label)} ` +
        `<span class="sf-incite-crisis-clock">(${immediateCrisis.segments}-segment tension clock — a first scene to tackle now, separate from the long vow)</span></p>`
      : "";

    let actionHtml = "";
    if (vow) {
      const creates = [
        "the vow on your character sheet",
        ...(clock  ? [`a ${clock.segments}-segment clock on it`] : []),
        ...(immediateCrisis ? [`a ${immediateCrisis.segments}-segment tension clock for the immediate crisis`] : []),
        ...(target ? [`<strong>${escapeHtml(target.name)}</strong> as a connection`] : []),
      ].join(" · ");
      actionHtml = sworn
        ? `<p class="sf-incite-sworn">✓ <em>Vow sworn.</em></p>`
        : `<div class="sf-incite-actions">` +
          `<button type="button" class="sf-swear-vow-btn" data-action="sf-swear-vow">` +
          `⚔ Swear this vow</button>` +
          `<span class="sf-incite-hint">Creates ${creates}.</span>` +
          `</div>`;
    }
    // Audio controls — the card already carries narratorCard + narrationText
    // (set in postIncitingIncidentCard), so the audio render hook plays the
    // prose once these buttons are present.
    const audioFooter =
      `<div class="sf-narration-footer">` +
      `<button class="sf-audio-play-btn" data-action="audioPlayToggle" aria-label="Play narrator audio" hidden><i class="fas fa-play"></i> Play</button>` +
      `<button class="sf-audio-stop-btn" data-action="audioStop" aria-label="Stop narrator audio" hidden><i class="fas fa-stop"></i> Stop</button>` +
      `</div>`;
    body = `${sparkLine}${proseHtml}${audioFooter}${vowHtml}${crisisHtml}${actionHtml}`;
  }

  return `<div class="sf-incite-card"><strong>✦ Inciting Incident</strong>${body}</div>`;
}

/**
 * Post the inciting-incident chat card.
 *
 * When narrator prose is present, the card also carries the narrator-card
 * flag family (`narratorCard` / `narrationText` / `sessionId`) so the
 * opening fiction feeds the recent-narration ring and session recaps —
 * without these the campaign premise is invisible to every subsequent
 * narrator call (v1.7.8 playtest F7). `narrationText` is the prose only;
 * the suggested-vow line is mechanical, not fiction. Audited consumers:
 * correction/audio render hooks no-op (no button markup here);
 * burn-supersede requires a resolutionId.
 *
 * @param {{ spark, text, fallback, sessionId }} args
 */
export async function postIncitingIncidentCard(args) {
  const { text, fallback = false, sessionId = null, narrationId = null } = args ?? {};
  let narratorFlags = {};
  if (!fallback && text) {
    const meta = splitIncitingMeta(text);
    narratorFlags = {
      narratorCard:  true,
      narrationText: meta.prose,
      sessionId,
      // The narration's id (stamped on its sidecar's ledger entries) — what
      // an X-Card on this card retracts (issue #321 U07).
      narrationId,
      // Structured proposal for the ⚔ Swear this vow click handler — the
      // handler reads flags, never re-parses card HTML (Cluster B).
      incitingMeta: { vow: meta.vow, clock: meta.clock, immediateCrisis: meta.immediateCrisis, target: meta.target },
    };
  }
  await globalThis.ChatMessage?.create?.({
    content: renderIncitingIncidentCard(args),
    flags:   { [MODULE_ID]: { incitingIncidentCard: true, ...narratorFlags } },
  });
}

/**
 * Orchestrate the full flow: roll the spark, ask the narrator to compose the
 * inciting incident (grounded in campaign context), and post the card. Falls
 * back to a spark-only card when the narrator returns nothing. Never throws.
 *
 * @param {Object} campaignState
 * @returns {Promise<{ spark: {action,theme}, text: string|null }>}
 */
export async function runIncitingIncident(campaignState) {
  const spark = rollIncitingSpark();

  let text = null;
  let narrationId = null;
  try {
    const { narrateIncitingIncident } = await import("../narration/narrator.js");
    const userMessage = buildIncitingIncidentUserMessage(spark);
    narrationId = newNarrationId();
    text = await narrateIncitingIncident({ userMessage, campaignState: campaignState ?? {}, narrationId });
  } catch (err) {
    console.warn(`${MODULE_ID} | runIncitingIncident: narration failed:`, err?.message ?? err);
  }

  // Capture the premise as campaign-level canon (PLAYTEST-1712 S). Without a
  // durable home the opening fiction lived only in the recent-narration ring
  // (last 3 cards) and scene-scoped sceneTruths (cleared at scene end), so it
  // aged out within a session and the narrator drifted on its load-bearing
  // facts. narratorPrompt injects this record into EVERY call as canon.
  // campaignState flows here by reference from narrateIncitingIncident →
  // applyNarratorSidecar, which applied the sidecar's truths, state and frame
  // to this same object (its own persist may still be in flight). The premise
  // and those scene ledgers are written onto the store as it is now — the
  // ledgers merged like every narration's (persistSceneLedgerFields) — never
  // this object whole, which reverted everything relayed during the Claude
  // call: a player's Private Lines, a safety flag, an X-Card (issue #321
  // U06d). GM-gated.
  if (text && campaignState && globalThis.game?.user?.isGM) {
    try {
      const meta = splitIncitingMeta(text);
      const premise = {
        prose:           meta.prose,
        spark,
        vow:             meta.vow,
        clock:           meta.clock,
        immediateCrisis: meta.immediateCrisis,
        target:          meta.target,
        sessionId:       campaignState?.currentSessionId ?? null,
        establishedAt:   new Date().toISOString(),
      };
      const { persistSceneLedgerFields } = await import("../factContinuity/sceneLifecycle.js");
      await persistSceneLedgerFields(campaignState, ["sceneTruths", "sceneState", "sceneFrame"], "inciting premise", {
        onto: (target) => { target.incitingIncident = premise; },
      });
      // On the caller's object only once the world has it: handed the cached
      // campaignState (as every caller did until issue #335 Y04 — they pass a
      // working copy now), setting the premise there first left a refused
      // write's premise as campaign canon in every prompt on this GM alone
      // (issue #331 X38). The persist reports no refusal of its own, so the
      // store says whether it landed.
      if (globalThis.game?.settings?.get?.(MODULE_ID, "campaignState")?.incitingIncident?.establishedAt === premise.establishedAt) {
        campaignState.incitingIncident = premise;
      } else {
        console.warn(`${MODULE_ID} | runIncitingIncident: the world did not save the premise — it is not campaign canon.`);
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | runIncitingIncident: premise persist failed:`, err?.message ?? err);
    }
  } else if (text && campaignState) {
    // A player's client (RUN_ON.CLAUDE runs !incite on the author when no
    // keyed GM is connected): the card still posts, but the premise canon is
    // a world write only a GM may make.
    console.debug(`${MODULE_ID} | runIncitingIncident: not a GM client — premise not saved as campaign canon.`);
  }

  await postIncitingIncidentCard({
    spark,
    text,
    fallback:  !text,
    sessionId: campaignState?.currentSessionId ?? null,
    narrationId,
  });

  // Capture entities the opening fiction invented (e.g. a new faction) into the
  // World Journal / Entities review. The inciting path does NOT go through the
  // move pipeline's post-narration detection, so run the same detection the
  // paced-narrative path uses. GM-gated; fail-open. (Playtest: the "Velvet
  // Knife" faction was invented in the inciting prose but never recorded until
  // it happened to recur in a later move.)
  //
  // Then run the tier update too — detection only captures NEW entities, while
  // the tier update records developments to EXISTING ones. The opening fiction
  // routinely builds on the established sector connection (it may even kill
  // them), and without this that development never reached the connection's
  // "Narrator-added details" (playtest v1.7.20 — Karthik Freeman was killed in
  // the inciting incident but her card recorded nothing). The move/paced paths
  // always run both passes; the inciting path now matches.
  if (text && globalThis.game?.user?.isGM) {
    try {
      const narrator = await import("../narration/narrator.js");
      const { prose, situation } = splitIncitingMeta(text);
      // Run detection for factions/threats/entities, but skip the per-item lore
      // spray — the opening fiction otherwise scattered into several loose,
      // incoherent WJ-Lore pages (playtest v1.7.22). Instead record ONE cohesive
      // entry from the narrator's own Situation summary.
      // The narration's id rides along, so an X-Card on the inciting card
      // undoes what this capture records (issue #329 X01).
      await narrator.runPacedDetection(prose, campaignState ?? {}, { skipLore: true, narrationId });
      await narrator.runNarrationTierUpdate(prose, campaignState ?? {}, { narrationId });
      if (situation) {
        const { recordLoreDiscovery } = await import("../world/worldJournal.js");
        await recordLoreDiscovery("Inciting Incident", {
          text:             situation,
          category:         "other",
          salience:         "significant",
          narratorAsserted: true,
          confirmed:        true,
          narrationId,
        }, campaignState ?? {}).catch(err =>
          console.warn(`${MODULE_ID} | runIncitingIncident: cohesive lore write failed:`, err?.message ?? err));
      }
    } catch (err) {
      console.warn(`${MODULE_ID} | runIncitingIncident: entity detection failed:`, err?.message ?? err);
    }
  } else if (text) {
    console.debug(`${MODULE_ID} | runIncitingIncident: not a GM client — entity detection, tier update and lore entry skipped.`);
  }

  return { spark, text };
}
