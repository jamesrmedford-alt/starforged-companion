// The GM's half of the table in an exploration run: fixed rules, no model
// (issue #373, decision 2), and the four interruptions of a long run.
//
// A second model at the table would add variance to exactly the half that
// must hold still, and could not be replayed. So the GM is rules, and the
// rules are few:
//
//   - a proposed move is accepted as proposed;
//   - "Who are you interacting with?" is answered with the charter's named
//     NPC when the player's line names them and the window offers them, else
//     "No specific entity" — which is what closing it means;
//   - a draft for someone in the charter's cast is confirmed, as the player
//     character's connection — under their name or a whole-word part of it,
//     and of no other cast member's ("Tamsin" for Tamsin Vey: lib/cast.mjs),
//     once: a cast member who has a card gets no second one; every other
//     draft is left;
//   - nothing else is typed. A window on the GM's screen these rules do not
//     answer ends the run as `not-exercised`, naming it (explore.mjs).
//
// Scripted dice (decision 3) are armed here too, because here is where a roll
// is known before it is made: the confirmation names the move, and the dice
// for a beat's decisive roll are queued as that move is accepted — never for
// another move that happens to come first.
//
// The interruptions are the runner's own actions at the table — a reload of
// the GM's page in the middle of a fight, End a Session opened and closed
// unanswered, the X-Card, a rename — each followed by a check that the world
// is as it should be (lib/beats.mjs). They are what a real evening does to a
// table, and no script of moves ever does.

import { MODULE_ID, chat, sleep } from "./foundry.mjs";
import { uniformFor } from "./table.mjs";
import { waitForQuietWorld } from "./world.mjs";
import { castMembers, castMemberFor } from "./cast.mjs";

/** The windows the rules answer — a prompt in one of them means the table is still moving. */
export const GM_ANSWERS = [".move-confirm-dialog", ".sf-clarification-dialog"];

/**
 * A beat's scripted roll as the dice the resolver will be handed, challenge
 * dice first. Pure.
 *
 *   miss        — an action roll that cannot hit: challenge 10 and 9, action 1
 *   weak_hit    — an action roll that beats one die whatever the stat: 1 and 10, action 6
 *   strong_hit  — an action roll that beats both: 1 and 2, action 6;
 *                 a progress roll: 1 and 2 (it needs three boxes filled)
 *   burnable    — a weak hit that burning momentum makes a strong hit: decided
 *                 in the page, from the character's momentum and stat (below)
 *
 * A scripted miss may script its price too (`price`: the d100 Pay the Price
 * rolls): a miss whose price is "You are harmed" always reaches the suffer
 * card, where one paid by chance reaches it one time in four.
 *
 * @param {{ roll: string, kind?: "action"|"progress" }} spec
 * @returns {{ faces: number[], queue: number[] }|null} null for a roll decided in the page
 */
export function scriptedDice(spec) {
  const progress = spec.kind === "progress";
  const faces = {
    miss: progress ? [10, 9] : [10, 9, 1],
    weak_hit: progress ? [1, 10] : [1, 10, 6],
    strong_hit: progress ? [1, 2] : [1, 2, 6],
  }[spec.roll];
  if (!faces) return null;
  return { faces, queue: faces.map((f, i) => uniformFor(f, i < 2 ? 10 : 6)) };
}

/**
 * The dice for a weak hit that a burn improves. Pure. With momentum M and a
 * stat S the action die is 1 and the challenge dice 1 and M − 1: the score
 * 1 + S beats the 1 and not the M − 1, and M beats both. It needs
 * M ≥ S + 2; with less there is no such roll, and none is scripted.
 */
export function burnableDice(momentum, stat) {
  const score = 1 + stat;
  if (!(momentum >= score + 1) || momentum - 1 <= 1 || score <= 1) return null;
  const faces = [1, momentum - 1, 1];
  return { faces, queue: faces.map((f, i) => uniformFor(f, i < 2 ? 10 : 6)) };
}

/** The kind of draft that is a person: a cast member's card is made from one. */
const PERSON_DRAFTS = ["connection"];

/**
 * The pending draft the GM's rules confirm, if any: the first one that is a
 * cast member's — under their name, or a whole-word part of it that is no
 * other member's — while that member has no card yet. Pure.
 *
 * The third live long haul: the player named "Tamsin Vey" in full, the
 * narrator wrote "Tamsin", the module proposed "Tamsin" — and the rule, which
 * wanted the exact name, left it. A second card for someone who has one is
 * never confirmed: after the rename of beat 19 a draft for "Tamsin" is the
 * same person again.
 *
 * @param {Array<{ messageId: string, index: number, name: string, type?: string|null }>} drafts — pending, oldest first
 * @param {Array<{ name: string, names: string[] }>} members — castMembers'
 * @param {string[]} [cardNames] — the names of the entity cards the world holds now
 * @returns {{ draft: object, member: object, exact: boolean }|null}
 */
export function draftToConfirm(drafts, members, cardNames = []) {
  const carded = new Set((cardNames ?? []).map(n => castMemberFor(n, members)?.name).filter(Boolean));
  for (const draft of drafts ?? []) {
    const member = castMemberFor(draft.name, members);
    if (!member || carded.has(member.name)) continue;
    const exact = member.names.some(n => n.toLowerCase() === String(draft.name ?? "").replace(/\s+/g, " ").trim().toLowerCase());
    // A part of a name is a person's only where the draft is of a person.
    if (!exact && draft.type && !PERSON_DRAFTS.includes(String(draft.type).toLowerCase())) continue;
    return { draft, member, exact };
  }
  return null;
}

/**
 * Start the rules on the GM's page. `state()` is asked on every pass for what
 * may have changed: `{ armed, lastLine }` — `armed` the rolls to script, the
 * current beat's first (`[{ moves, roll, kind, beat? }]`; the first one that
 * names the proposed move is used), `lastLine` the player's last line of
 * play.
 *
 * @returns {() => void} stop
 */
export function startGmRules(gm, { cast = [], pcId, state, onAnswer, log = console.log }) {
  let busy = false;
  let warned = false;
  const names = cast.map(c => c.name).filter(Boolean);
  const members = castMembers(cast);
  const pressed = new Set();     // drafts whose Confirm was pressed: not looked at again
  const confirmed = [];          // the cast members confirmed so far: their card may still be on its way
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const { armed = [], lastLine = "" } = state() ?? {};
      const specs = (armed ?? []).map(spec => ({ ...spec, fixed: scriptedDice(spec) }));
      const found = await gm.page.evaluate(({ MODULE_ID, names, pcId, specs, lastLine }) => {
        const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
        const pressOnce = (button) => { if (!button || button.dataset.sfcAnswered) return false; button.dataset.sfcAnswered = "1"; button.click(); return true; };

        // A proposed move: accepted as proposed — its dice scripted when it is
        // the roll the current beat scripts.
        const confirm = [...document.querySelectorAll(".move-confirm-dialog")].at(-1);
        const accept = confirm?.querySelector('[data-action="accept"]');
        if (accept && !accept.dataset.sfcAnswered) {
          const moveId = confirm.querySelector(".confirm-move-id")?.getAttribute("data-move-id") ?? null;
          let scripted = null;
          const armed = specs.find(spec => (spec.moves ?? []).includes(moveId)) ?? null;
          if (armed) {
            if (armed.fixed) scripted = armed.fixed;
            else if (armed.roll === "burnable") {
              const pc = game.actors.get(pcId);
              const stat = clean(confirm.querySelector(".confirm-stat")?.textContent).toLowerCase();
              const value = Number(pc?.system?.[stat]);
              const momentum = Number(pc?.system?.momentum?.value);
              const score = 1 + value;
              if (Number.isFinite(value) && momentum >= score + 1 && momentum - 1 > 1 && score > 1) {
                const faces = [1, momentum - 1, 1];
                scripted = { faces, queue: [(1 - 0.5) / 10, (momentum - 1 - 0.5) / 10, (1 - 0.5) / 6] };
              } else {
                scripted = { faces: null, why: `momentum ${momentum} is too low for a weak hit on +${stat} (${value}) that a burn improves` };
              }
            }
            if (scripted?.queue) window.__sfcDice = scripted.queue.slice();
            // The price of a scripted miss: the next rolls of the oracle roller.
            if (scripted?.queue && Number.isInteger(armed.price)) {
              const u = (armed.price - 0.5) / 100;
              window.__sfcRandomQueue = { ...(window.__sfcRandomQueue ?? {}), "oracles/roller.js": [u, u, u, u] };
              scripted = { ...scripted, price: armed.price };
            }
          }
          pressOnce(accept);
          return { did: "accepted the proposed move", note: moveId, scripted: scripted?.faces ?? null, notScripted: scripted?.why ?? null, beat: scripted?.faces ? (armed.beat ?? null) : null, price: scripted?.price ?? null };
        }

        // "Who are you interacting with?" — the named NPC when the line names
        // them and they are offered; else no specific entity.
        const asking = [...document.querySelectorAll(".sf-clarification-dialog")].at(-1);
        if (asking && !asking.dataset.sfcAnswered) {
          const named = names.find(n => lastLine.toLowerCase().includes(n.toLowerCase()) || n.split(/\s+/).some(w => w.length > 3 && new RegExp(`\\b${w}\\b`, "i").test(lastLine)));
          const offered = named ? [...asking.querySelectorAll('[data-action="pick"]')].find(b => clean(b.dataset.name).toLowerCase() === named.toLowerCase()) : null;
          const button = offered ?? asking.querySelector('[data-action="none"]');
          if (button) {
            asking.dataset.sfcAnswered = "1";
            button.click();
            return { did: offered ? `answered "Who are you interacting with?" with ${named}` : 'answered "Who are you interacting with?" with "No specific entity"', note: null };
          }
        }

        // The drafts still pending, and the cards the world holds: which of
        // them is a cast member's is decided outside the page (draftToConfirm).
        const drafts = [];
        for (const m of game.messages.contents) {
          const f = m.flags?.[MODULE_ID];
          if (!f?.draftEntityCard) continue;
          for (const d of f.drafts ?? []) if (d.status === "pending") drafts.push({ messageId: m.id, index: d.index, name: clean(d.name), type: d.type ?? null });
        }
        return drafts.length ? { drafts, cards: game.actors.contents.filter(a => !!a.flags?.[MODULE_ID]?.entityType).map(a => a.name) } : null;
      }, { MODULE_ID, names, pcId, specs, lastLine });
      // A draft for someone in the charter's cast: confirmed, as the player
      // character's connection. Every other draft is left.
      let answered = found?.did ? found : null;
      const pick = found?.drafts ? draftToConfirm(found.drafts.filter(d => !pressed.has(`${d.messageId}:${d.index}`)), members, [...found.cards, ...confirmed]) : null;
      if (pick) {
        answered = await gm.page.evaluate(({ messageId, index, pcId }) => {
          const row = `[data-message-id="${messageId}"] [data-action="sf-draft-confirm"][data-index="${index}"]`;
          const button = document.querySelector(`${row}[data-actor-id="${pcId}"]`) ?? document.querySelector(row);
          if (!button || button.dataset.sfcAnswered) return null;
          button.dataset.sfcAnswered = "1";
          button.click();
          return { asConnection: !!button.dataset.actorId };
        }, { messageId: pick.draft.messageId, index: pick.draft.index, pcId });
        if (answered) {
          pressed.add(`${pick.draft.messageId}:${pick.draft.index}`);
          confirmed.push(pick.member.name);
          answered = {
            did: `confirmed the draft for ${pick.draft.name}${pick.exact ? "" : ` — ${pick.member.name}, under a part of the name`}${answered.asConnection ? ", as the player character's connection" : ""}`,
            note: pick.draft.type ?? null, cast: { member: pick.member.name, as: pick.draft.name },
          };
        }
      }
      if (answered) onAnswer(answered);
    } catch (err) {
      // The page is navigating (a reload is one of the interruptions) or closing.
      if (!warned) { warned = true; log(`  (GM) the rules could not read the page: ${String(err?.message ?? err).split("\n")[0]}`); }
    } finally { busy = false; }
  }, 400);
  return () => clearInterval(timer);
}

// ── the interruptions ────────────────────────────────────────────────────────

/**
 * Reload the GM's page, as a GM whose browser hiccuped would. What the runner
 * keeps on that page — the dice it recorded, the settings to restore — is
 * carried across; the module's own state is the world's to keep.
 */
export async function reloadGm(gm, { reinstall = async () => {} } = {}) {
  const kept = await gm.page.evaluate(() => ({
    rolled: window.__sfcRolled ?? [], dice: window.__sfcDice ?? null,
    randomKept: window.__sfcRandomKept ?? null, randomQueue: window.__sfcRandomQueue ?? null,
    restore: window.__sfcRestore ?? null, restoreCharacter: window.__sfcRestoreCharacter,
  }));
  await gm.page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
  await gm.page.waitForFunction(() => window.game?.ready === true, null, { timeout: 120_000 });
  await gm.page.evaluate((kept) => {
    window.__sfcRolled = kept.rolled;
    if (kept.dice) window.__sfcDice = kept.dice;
    if (kept.randomKept) window.__sfcRandomKept = kept.randomKept;
    if (kept.randomQueue) window.__sfcRandomQueue = kept.randomQueue;
    if (kept.restore) window.__sfcRestore = kept.restore;
    if (kept.restoreCharacter !== undefined) window.__sfcRestoreCharacter = kept.restoreCharacter;
  }, kept);
  await reinstall();
  await waitForQuietWorld(gm, { quietMs: 2500, capMs: 45_000 });
  return { did: "the GM's page reloaded", result: "the page came back and the world went quiet" };
}

/** Open End a Session on the player's screen and close it unanswered. */
export async function cancelEndSession(player) {
  await chat(player, "!end-session");
  const title = "End a Session";
  const open = (t) => [...document.querySelectorAll("dialog[open], .application")].some(w => String(w.querySelector(".window-title, header h1, header h4")?.textContent ?? "").trim() === t);
  await player.page.waitForFunction(open, title, { timeout: 30_000 });
  await sleep(500);
  const closed = await player.page.evaluate(async (t) => {
    const el = [...document.querySelectorAll("dialog[open], .application")].find(w => String(w.querySelector(".window-title, header h1, header h4")?.textContent ?? "").trim() === t);
    const control = el?.querySelector('header [data-action="close"], header .close, .header-control.close');
    if (control) { control.click(); return "its close control"; }
    const app = foundry.applications?.instances?.get?.(el?.id);
    if (app?.close) { await app.close(); return "its close()"; }
    return null;
  }, title);
  await player.page.waitForFunction((t) => ![...document.querySelectorAll("dialog[open], .application")].some(w => String(w.querySelector(".window-title, header h1, header h4")?.textContent ?? "").trim() === t), title, { timeout: 15_000 }).catch(() => {});
  return { did: "End a Session was opened on the player's screen and closed unanswered", result: closed ? `closed by ${closed}` : "the window could not be closed" };
}

/** The X-Card from the player's client; then the GM resumes. */
export async function playXCard(player, gm) {
  const active = (want) => gm.page.waitForFunction(({ id, want }) => (game.settings.get(id, "campaignState")?.xCardActive === true) === want, { id: MODULE_ID, want }, { timeout: 30_000 });
  await chat(player, "!x");
  await active(true);
  await sleep(1500);
  await chat(gm, "!x clear");
  await active(false);
  return { did: "the X-Card was played from the player's client (!x); the GM resumed (!x clear)", result: "the X-Card went up and came down" };
}

/**
 * The GM renames a connection's card, as on its sheet. The card is the one
 * the cast member was made as (`id`, where the runner knows it — the card may
 * have been confirmed under a part of the name), else the one named `from`.
 */
export async function renameConnection(gm, from, to, { id = null } = {}) {
  const renamed = await gm.page.evaluate(async ({ MODULE_ID, from, to, id }) => {
    const isConnection = (a) => a?.flags?.[MODULE_ID]?.entityType === "connection";
    const byId = id ? game.actors.get(id) : null;
    const actor = (isConnection(byId) ? byId : null) ?? game.actors.find(a => isConnection(a) && a.name === from);
    if (!actor) return null;
    const was = actor.name;
    await actor.update({ name: to });
    return was;
  }, { MODULE_ID, from, to, id });
  return {
    did: renamed && renamed !== from ? `the GM renamed ${from}'s card — made as "${renamed}" — to ${to}` : `the GM renamed ${from}'s card to ${to}`,
    result: renamed ? "renamed" : `no connection card is named ${from}`,
  };
}
