/**
 * STARFORGED COMPANION
 * src/factContinuity/chatCommands.js — `!truth` / `!state` correction commands
 *
 * fact-continuity scope §10.3 (issue #227). Grammar:
 *   !truth strike <id-prefix>
 *   !truth set <subject> <fact-text>
 *   !state strike <subject> <attribute>
 *   !state set <subject> <attribute>=<value>
 *
 * Subjects accepted as bare words ("Vance", "scene") or as quoted strings
 * for multi-word subjects ("\"Covenant officer\"", "\"cargo bay\""). For
 * !state set, the attribute and value are separated by an unquoted `=`.
 *
 * Multiplayer split (2026-10 audit)
 * ---------------------------------
 * The ledgers live in campaignState (world-scoped — GM-only writes). The
 * command used to run on every connected client; a player's correction only
 * landed because the GM's client re-ran it — with the GM's permissions, so a
 * player could strike a GM-authored truth. Now:
 *   - handleFactContinuityCommand() runs on the AUTHORING client only: it
 *     checks the master toggle and the syntax locally (usage warnings stay on
 *     the typist's screen), then relays the raw text to the canonical GM via
 *     requestGmAction("factContinuity.command", { text }).
 *   - applyFactContinuityCommand() runs on the canonical GM and builds the
 *     permission context from the REQUESTER (ctx.requesterIsGM), never from
 *     game.user — on the relay path that is the GM's own user.
 */

import { collectAllEntities } from "../context/relevanceResolver.js";
import {
  strikeTruth,
  setTruth,
  strikeStateValue,
  setStateValue,
  resolveSubject,
  subjectKey,
  findBareStrike,
  findSessionStrike,
  findSessionBlock,
  dropSessionStrike,
  subjectNames,
  canCorrectTruth,
  findTruthByIdOrPrefix,
} from "./ledgers.js";
import { requestGmAction } from "../multiplayer/gmRelay.js";
import { propagateRetraction, markSummaryForRegen, loreRetractionHolder } from "./retractions.js";
import { restoreStruckLore } from "../world/worldJournal.js";
import { persistSceneLedgerFields, startScene } from "./sceneLifecycle.js";

const MODULE_ID = "starforged-companion";

const USAGE_ALL = 'Usage: !truth list | !truth strike <id> | !truth set <subject> <fact> | !state strike <subject> <attribute> | !state set <subject> <attribute>=<value>';

/**
 * Pure parser — validates the command's shape without touching state.
 *
 * @param {string} text
 * @returns {{ ok: true, domain: "truth"|"state", verb: "strike"|"set",
 *             rest: string, subject?: string, fact?: string,
 *             attribute?: string, value?: string }
 *          | { ok: false, usage: string }}
 */
export function parseFactContinuityCommand(text) {
  // `!truth list` — the scene's truths with the ids `!truth strike` takes
  // (issue #326 W67: an id was shown nowhere).
  if (/^!truth\s+list\s*$/i.test(String(text ?? "").trim())) return { ok: true, domain: "truth", verb: "list", rest: "" };
  const verbMatch = /^!(truth|state)\s+(strike|set)\s+(.*)$/i.exec(String(text ?? "").trim());
  if (!verbMatch) return { ok: false, usage: USAGE_ALL };
  const domain = verbMatch[1].toLowerCase();
  const verb   = verbMatch[2].toLowerCase();
  const rest   = verbMatch[3].trim();

  if (domain === "truth" && verb === "strike") {
    return { ok: true, domain, verb, rest };
  }
  if (domain === "truth" && verb === "set") {
    const parsed = parseSubjectAndRest(rest);
    if (!parsed) return { ok: false, usage: "Usage: !truth set <subject> <fact-text>" };
    return { ok: true, domain, verb, rest, subject: parsed.subject, fact: parsed.rest };
  }
  if (domain === "state" && verb === "strike") {
    const parsed = parseSubjectAndRest(rest);
    if (!parsed?.rest) return { ok: false, usage: "Usage: !state strike <subject> <attribute>" };
    return { ok: true, domain, verb, rest, subject: parsed.subject, attribute: parsed.rest.trim() };
  }
  // state set
  const parsed = parseSubjectAndRest(rest);
  const eqIdx  = parsed?.rest?.indexOf("=") ?? -1;
  if (!parsed || eqIdx < 1) return { ok: false, usage: "Usage: !state set <subject> <attribute>=<value>" };
  return {
    ok: true, domain, verb, rest,
    subject:   parsed.subject,
    attribute: parsed.rest.slice(0, eqIdx).trim(),
    value:     parsed.rest.slice(eqIdx + 1).trim(),
  };
}

/**
 * Authoring-client half: validate locally, then relay to the canonical GM.
 *
 * @param {ChatMessage} message
 */
export async function handleFactContinuityCommand(message) {
  const text = (message?.content ?? "").trim();

  if (!factContinuityEnabled()) {
    ui.notifications?.warn("Fact Continuity is disabled in Companion Settings.");
    return;
  }

  const parsed = parseFactContinuityCommand(text);
  if (!parsed.ok) {
    ui.notifications?.warn(parsed.usage);
    return;
  }
  // A read: listed on the typist's own client, to them.
  if (parsed.verb === "list") {
    await postTruthList(message);
    return;
  }

  await requestGmAction("factContinuity.command", { text });
}

/**
 * `!truth list`: whisper the typist the active scene's live truths, each
 * with the id prefix `!truth strike` takes and whether they may strike it —
 * the id was shown nowhere, so a player could not strike a truth at all and
 * `!truth strike` had no id to take in normal play (issue #326 W67).
 *
 * @param {ChatMessage} message — the typed command
 * @returns {Promise<void>}
 */
async function postTruthList(message) {
  const campaignState = game.settings.get(MODULE_ID, "campaignState") ?? {};
  const isGM  = !!game.user?.isGM;
  const live  = (campaignState.sceneTruths ?? []).filter(t => t?.id && !t.retracted && String(t.fact ?? "").trim());
  let entities = [];
  try { entities = collectAllEntities(campaignState); }
  catch (err) { console.debug?.(`${MODULE_ID} | !truth list: entity roster collect failed:`, err?.message ?? err); }
  const label = (subject) => {
    if (subject?.kind === "scene") return "scene";
    if (subject?.kind === "entity") {
      const e = entities.find(x => (x.journalId ?? x._id) === subject.entityId || x._id === subject.entityId);
      return e?.name ?? subject.entityId ?? "entity";
    }
    return String(subject?.text ?? "unknown");
  };
  const rows = live.map(t => {
    const locked = !canCorrectTruth(t, { isGM });
    return `<li><code>${escapeHtml(String(t.id).slice(0, 8))}</code> ${escapeHtml(label(t.subject))} — ${escapeHtml(t.fact)}` +
      `${locked ? ` <em>(GM's — only a GM can strike it)</em>` : ""}</li>`;
  }).join("");
  const body = live.length
    ? `<p>Truths in this scene — strike one with <code>!truth strike &lt;id&gt;</code>:</p><ul>${rows}</ul>`
    : `<p>No truths are recorded in this scene.</p>`;
  await ChatMessage.create({
    content: `<div class="sf-fc-command-card"><div class="sf-fc-command-label">◈ Fact Continuity</div><div class="sf-fc-command-body">${body}</div></div>`,
    whisper: [message?.author?.id ?? game.user?.id].filter(Boolean),
    flags:   { [MODULE_ID]: { factContinuityCommand: true, domain: "truth", verb: "list" } },
  });
}

/**
 * gmRelay handler for "factContinuity.command" — runs on the canonical GM.
 * Applies the correction, persists campaignState, and posts the result card.
 *
 * @param {{ text?: string }} payload
 * @param {{ requesterIsGM?: boolean }} [ctx]
 * @returns {Promise<string|null>} the result line posted, or null when nothing ran
 */
export async function applyFactContinuityCommand(payload = {}, ctx = {}) {
  const text = typeof payload.text === "string" ? payload.text.trim() : "";

  if (!factContinuityEnabled()) {
    console.warn(`${MODULE_ID} | !truth/!state: Fact Continuity is disabled — relayed command ignored.`);
    return null;
  }
  const parsed = parseFactContinuityCommand(text);
  if (!parsed.ok) {
    // The author validated before relaying, so a malformed relay is a bug or a
    // hand-crafted socket message — log it, post nothing.
    console.warn(`${MODULE_ID} | !truth/!state: malformed relayed command ignored: "${text}"`);
    return null;
  }

  const isGM = !!ctx.requesterIsGM;
  const permCtx = { isGM, actor: isGM ? "gm" : "player" };
  // A copy to work on: a Strike awaits its propagation (entity tiers, World
  // Journal lore), and the write below lands on the store as it is after
  // that — never this read held across the await (issue #321 U06b).
  const campaignState = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});

  // NARR-CMD-SUBJECT (narrator-context audit 2026-07): resolve command
  // subjects against the full entity roster, exactly like the sidecar apply
  // path does. Without it, entity-keyed ledger entries could never be
  // addressed by name from `!truth` / `!state` ("No matching state entry"),
  // and command-set truths landed text-keyed. Tolerant: an empty roster
  // degrades to text subjects, same as before.
  let entities = [];
  try {
    entities = collectAllEntities(campaignState);
  } catch (err) {
    console.debug?.(`${MODULE_ID} | !truth/!state: entity roster collect failed:`, err?.message ?? err);
  }

  let resultLine = "";
  let changed = null;        // the ledger field this command changed
  let struckTruth = false;
  let lift = null;           // a `!truth set` lifting a strike: { strikeId, truthId }
  let liftKept = null;       // …or one an earlier scene kept: { strike, dropped }
  try {
    // A truth or state set with no scene open starts one first, as a
    // narration does (ensureSceneStarted — the issue #321 U34 rule for the
    // other ledger writer): written scene-less, the next narration's
    // startScene ended the phantom scene and the GM's state was discarded,
    // the truth migrated out; and a move already in flight wrote its
    // snapshot's empty ledgers over them (issue #326 W59). Started here, the
    // scene is the store's, which the next narration (and that move's scene
    // start, adoptStoredScene) continues.
    if (parsed.verb !== "strike" && !campaignState.currentSceneId) {
      await startScene(campaignState, { reason: "fact_continuity_command" });
    }

    if (parsed.domain === "truth" && parsed.verb === "strike") {
      const struck = strikeTruth(parsed.rest, campaignState, permCtx);
      if (struck) {
        changed = "sceneTruths";
        struckTruth = true;
        // The strike reaches the tier details, lore and summary that copied
        // the fact (issue #286 B6).
        await propagateRetraction(struck, campaignState);
      }
      // A truth already retracted — struck, replaced or removed by the X-Card
      // — is left as it is (issue #336 Y30), and the card says so; its fact
      // is not named (it may be one the table removed).
      const already = struck ? null : findTruthByIdOrPrefix(campaignState.sceneTruths, parsed.rest);
      resultLine = struck
        ? `Truth <code>${struck.id.slice(0, 8)}</code> struck.`
        : already?.retracted
          ? `Truth <code>${escapeHtml(String(already.id).slice(0, 8))}</code> is already retracted — nothing changed.`
          : `No matching truth (id or unique 4+ char prefix required, and you must have permission).`;
    } else if (parsed.domain === "truth") {
      const subject = resolveSubject(parsed.subject, campaignState, entities);
      const fact    = String(parsed.fact ?? "").trim();
      const names   = subjectNames(subject, parsed.subject, entities);
      // This scene's strike where it stands — at the place the scene is at
      // now, as setTruth lifts it (ACTIVE-SCENE-STRIKE-PLACE-BLIND).
      const struck  = findBareStrike(campaignState.sceneTruths, subject, fact,
        { place: campaignState.sceneFrame?.location ?? null });
      // A strike an earlier scene of this session kept is lifted the same
      // way (issue #342 Z42): CORRECTED went on naming it beside the GM's
      // binding truth, and its lore stayed out of canon.
      const kept    = struck ? null : findSessionStrike(campaignState, subject, fact, names);
      // What the X-Card removed, or a Replace corrected, a player may not set
      // back (issue #345 D4); the card says so without naming either.
      const blocked = isGM ? null : findSessionBlock(campaignState, subject, fact, names);
      const truth   = setTruth(subject, parsed.fact, campaignState, { ...permCtx, names });
      if (truth) changed = "sceneTruths";
      // The set lifts the strike (W60); the lore it retracted comes back
      // once the lift is in the store (below).
      if (truth && struck?.id) lift = { strikeId: struck.id, truthId: truth.id };
      if (truth && kept) liftKept = { strike: kept, dropped: false };
      // The id `!truth strike` takes is shown (issue #326 W67).
      resultLine = truth
        ? `Truth recorded: <em>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.fact)}</em> <code>${escapeHtml(String(truth.id).slice(0, 8))}</code>.${(struck || kept) ? " The strike on it is lifted." : ""}`
        : ((struck || kept) && !isGM)
          ? `Truth not recorded — the GM struck that fact; only a GM can restore it.`
          : blocked
            ? `Truth not recorded — that fact was taken out of the story this session; only a GM can set it again.`
            : `Truth not recorded — empty subject or fact.`;
    } else if (parsed.verb === "strike") {
      const subject = resolveSubject(parsed.subject, campaignState, entities);
      const ok      = strikeStateValue(subjectKey(subject), parsed.attribute, campaignState);
      if (ok) changed = "sceneState";
      resultLine = ok
        ? `State <code>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.attribute)}</code> struck.`
        : `No matching state entry.`;
    } else {
      const subject = resolveSubject(parsed.subject, campaignState, entities);
      const result  = setStateValue(subjectKey(subject), parsed.attribute, parsed.value, campaignState);
      if (result) changed = "sceneState";
      resultLine = result
        ? `State recorded: <em>${escapeHtml(parsed.subject)} — ${escapeHtml(parsed.attribute)}: ${escapeHtml(parsed.value)}</em>.`
        : `State not recorded — empty attribute or value.`;
    }

    // Persist only what the command changed, onto the store as it is now
    // (rules/reachability.md §9): the ledger field, merged with the store's
    // (a narration's truths and a relayed X-Card that landed while a Strike
    // propagated stay; a released move lock is not written back), and a
    // Strike's regen mark on the stored rolling summary. A no-match writes
    // nothing.
    // A kept strike's lift is dropped from the stored session list in the
    // same write — while the store holds this scene: an X-Card that took the
    // strike over meanwhile has dropped it already (nothing to lift), and a
    // scene changed meanwhile takes the truth's set with it.
    if (changed) {
      await persistSceneLedgerFields(campaignState, [changed], "!truth/!state", {
        onto: struckTruth ? markSummaryForRegen
          : liftKept ? (target) => {
            if ((target.currentSceneId ?? null) !== (campaignState.currentSceneId ?? null)) return;
            liftKept.dropped = dropSessionStrike(target, liftKept.strike);
          }
            : null,
      });
    }

    // A lift brings back the lore copies the strike retracted, so the fact
    // the GM ruled canon is archived as canon (issue #331 X31) — save one
    // another standing retraction still states (issue #336 Y32). Only a lift
    // the store kept: an X-Card played on the strike's narration first takes
    // the strike over, and the merge keeps it the X-Card's
    // (XCARD-AFTER-STRIKE-STILL-NAMED) — an X-Card's retraction is never
    // lifted, nor its lore restored. Restored before the persist, the lore
    // came back while the ledger kept the X-Card's retraction.
    if (lift) {
      const latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
      const strikeNow = (latest.sceneTruths ?? []).find(t => t?.id === lift.strikeId);
      if (strikeNow?.correctedTo === lift.truthId) {
        await restoreStruckLore(lift.strikeId, { heldBy: loreRetractionHolder(latest) }).catch(err =>
          console.warn(`${MODULE_ID} | !truth set: restoring the struck lore failed:`, err?.message ?? err));
      }
    }
    // A kept strike's lift the store took (the drop above) restores its lore
    // the same way, by the struck truth's id it kept (issue #342 Z42).
    if (liftKept?.dropped && liftKept.strike.truthId) {
      const latest = game.settings.get(MODULE_ID, "campaignState") ?? {};
      await restoreStruckLore(liftKept.strike.truthId, { heldBy: loreRetractionHolder(latest) }).catch(err =>
        console.warn(`${MODULE_ID} | !truth set: restoring the struck lore failed:`, err?.message ?? err));
    }
  } catch (err) {
    console.error(`${MODULE_ID} | !truth/!state command failed:`, err);
    resultLine = "Command failed — see the browser console.";
  }

  await ChatMessage.create({
    content: `
      <div class="sf-fc-command-card">
        <div class="sf-fc-command-label">◈ Fact Continuity</div>
        <div class="sf-fc-command-body">${resultLine}</div>
      </div>
    `.trim(),
    flags: {
      [MODULE_ID]: {
        factContinuityCommand: true,
        domain: parsed.domain,
        verb:   parsed.verb,
      },
    },
  });
  return resultLine;
}

/**
 * Parse "<subject> <rest>" with subject either a quoted string or a single
 * bare word. Returns { subject, rest } or null on malformed input.
 */
function parseSubjectAndRest(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith('"')) {
    const close = trimmed.indexOf('"', 1);
    if (close < 0) return null;
    const subject = trimmed.slice(1, close).trim();
    const rest    = trimmed.slice(close + 1).trim();
    return subject ? { subject, rest } : null;
  }
  const space = trimmed.search(/\s/);
  if (space < 0) return { subject: trimmed, rest: '' };
  const subject = trimmed.slice(0, space).trim();
  const rest    = trimmed.slice(space + 1).trim();
  return subject ? { subject, rest } : null;
}

/**
 * Read the fact-continuity master toggle. Defaults to enabled when the
 * setting hasn't been registered (early init, unit-test contexts).
 */
function factContinuityEnabled() {
  try {
    return game.settings?.get(MODULE_ID, "factContinuity.enabled") !== false;
  } catch {
    return true;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
