/**
 * STARFORGED COMPANION
 * src/session/sceneSeeds.js — what a session set-piece is built from (issue #381)
 *
 * The session's opening scene was told "set in the ship's galley … pick a
 * specific food or drink … the ship itself as the absurd company", and across
 * two separate campaigns it came out as one scene: the galley in seven
 * openings of eight, a kettle and reconstituted noodles at the head of both,
 * a last sentence in which a panel "clears its throat" in five. Each piece of
 * that stock was an instruction with a slot left open, and a model fills the
 * same slot the same way twice. So the slot is filled here, by the game's own
 * dice: a set-piece is handed MATERIAL — a few results rolled on the module's
 * registered oracle tables — and told to build the scene from it and to give
 * it no business or featured thing of its own.
 *
 * A seed is one piece of that material:
 *
 *   { slot:   "moment",                       // what it is for, to the code
 *     label:  "What Mira is doing in this lull",   // …to the narrator and the table
 *     from:   "oracle",
 *     tables: [{ id: "action", name: "Action", roll: 14, result: "Bolster" },
 *              { id: "theme",  name: "Theme",  roll: 20, result: "Debt" }],
 *     result: "Bolster Debt",
 *     second: { tables: […], result: "Inspect Time" },   // drawn at once — see below
 *     used:   null }                          // the narration's own account (markSeedsUsed)
 *
 * The dice are the table's: rolled once, on the canonical GM, and only for a
 * scene that will be narrated (safety/sessionLifecycleDialogs.js); shown on
 * the scene's card under "Rolled for this scene" (renderSceneRolls, from the
 * card's `builtFrom` flag — the one store of them, read again at every
 * render and never rolled again); and given to the narrator in the call's
 * user message (formatMaterial). Not in `campaignState.recentOracles`: that
 * ring is told to every later narration of the session as something to build
 * on, which is how one scene's prop becomes the session's refrain.
 *
 * Numbering is one contract: the MATERIAL block numbers the seeds that have a
 * result, 1 up, and the narration's account ("builtFrom": [{ n, words }])
 * names them by that number — `numbered` is the one list both read.
 *
 * One draw site. Every die of a set-piece comes through `drawDie`, the only
 * caller of Math.random in this file, so the playtest runner keeps and
 * replays them as a stream of their own (`random.gm["session/sceneSeeds.js"]`,
 * test/ci/playwright/lib/world.mjs installDiceScript) whatever else rolls an
 * oracle meanwhile; each recipe takes its draw as an argument, so a unit test
 * scripts it. The table lookup stays the roller's (`rollOracle(id, { roll })`
 * with a roll drawn here): no table is authored or copied in this file.
 *
 * A table with no fitting result:
 *   - a row that is an instruction, not a result (an area table's "New zone",
 *     a step of a derelict crawl): drawn again, up to PLACE_REDRAWS times,
 *     then the seed is left out;
 *   - a result that cannot be true here, or that the table's safety settings
 *     rule out: each oracle seed carries a second result, drawn at the same
 *     moment, which the narration may take once and says so;
 *   - a seed the situation has no use for is not rolled;
 *   - a roll that fails leaves its seed out, and the scene is written from
 *     the seeds that were made — Begin and End a Session are never held up.
 */

import { rollOracle } from "../oracles/roller.js";

const MODULE_ID = "starforged-companion";

/**
 * The one place a set-piece draws: a die of `faces` sides, 1..faces.
 *
 * @param {number} [faces]
 * @returns {number}
 */
export function drawDie(faces = 100) {
  return Math.floor(Math.random() * faces) + 1;
}

/** How many times a place is drawn again when its area row is an instruction. */
const PLACE_REDRAWS = 3;

/** An area table's rows that send a derelict crawl on, and are no place. */
const NEW_ZONE = /^New zone\b/i;

/** How many absent crewmates' business an opening rolls, at most. */
const ABSENT_MAX = 3;

/** One roll on a registered table, the roll drawn here. */
function tableRoll(id, draw) {
  const roll = draw(100);
  const rolled = rollOracle(id, { roll });
  return { id, name: rolled.tableName, roll, result: rolled.result };
}

/** A pair of tables read as one prompt ("Bolster Debt"). */
function pairResult(ids, draw) {
  const tables = ids.map(id => tableRoll(id, draw));
  return { tables, result: tables.map(t => t.result).join(" ") };
}

/** A seed from a pair of tables, with its second result. */
function pairSeed(slot, label, ids, draw) {
  const first  = pairResult(ids, draw);
  const second = pairResult(ids, draw);
  return { slot, label, from: "oracle", ...first, second, used: null };
}

/**
 * A place inside a ship or a settlement: a zone, then that zone's area. The
 * game has no table of a living ship's rooms; its Derelict zone tables are
 * its only tables of a ship's and a settlement's inside, and they are used
 * here for the place alone. Null when every draw was an instruction.
 */
function placeResult(zoneTableId, draw) {
  for (let attempt = 0; attempt <= PLACE_REDRAWS; attempt += 1) {
    const zone = tableRoll(zoneTableId, draw);
    const area = tableRoll(`derelict_area_${zone.result.toLowerCase()}`, draw);
    if (!NEW_ZONE.test(area.result)) return { tables: [zone, area], result: `${area.result} (${zone.result})` };
  }
  return null;
}

/** A seed for a place, with its second result; null when no place came up. */
function placeSeed(slot, label, zoneTableId, source, draw) {
  const first = placeResult(zoneTableId, draw);
  if (!first) return null;
  const second = placeResult(zoneTableId, draw);
  return { slot, label, from: "oracle", source, ...first, ...(second ? { second } : {}), used: null };
}

/** Run one seed's rolls; a roll that fails leaves the seed out. */
function made(build) {
  try {
    return build();
  } catch (err) {
    console.warn(`${MODULE_ID} | scene material: a roll failed — the scene is built without it:`, err?.message ?? err);
    return null;
  }
}

/**
 * The opening scene's material. In the order drawn:
 *
 *   1. what the characters are doing in this lull — Action + Theme;
 *   2. what the scene's eye rests on — Descriptor + Focus;
 *   3. where aboard — a ship zone and its area — only when nothing says where
 *      the last session stopped (`placeKnown` false);
 *   4. what each absent crewmate is up to — Action + Theme, ABSENT_MAX at most.
 *
 * Each pair is four draws (the result's two tables, then the second
 * result's); a place is two draws for each result, and two more for every
 * area row that is an instruction.
 *
 * @param {{ present?: string[], absent?: string[], placeKnown?: boolean }} [scene] —
 *   the names of the characters in it and of the absent crewmates; whether
 *   the records or the table say where the scene is set
 * @param {(faces: number) => number} [draw]
 * @returns {Object[]} the seeds
 */
export function rollOpeningSeeds({ present = [], absent = [], placeKnown = false } = {}, draw = drawDie) {
  const who = present.length === 1 ? `${present[0]} is` : "they are";
  return [
    made(() => pairSeed("moment", `What ${who} doing in this lull`, ["action", "theme"], draw)),
    made(() => pairSeed("eye", "What the scene's eye rests on", ["descriptor", "focus"], draw)),
    placeKnown ? null : made(() => placeSeed("place", "Where aboard the ship this is", "derelict_zone_starship", "Ship zone + area", draw)),
    ...absent.slice(0, ABSENT_MAX).map(name =>
      made(() => pairSeed("absent", `What ${name} is up to, elsewhere`, ["action", "theme"], draw))),
  ].filter(Boolean);
}

/**
 * A seed the campaign's records give with no die — the table's connection
 * focus, a card's LAST KNOWN place. Null with no result.
 *
 * @param {string} slot
 * @param {string} label
 * @param {string} source — where it comes from, to the narrator and the table
 * @param {string} result
 * @param {{ ref?: string|null, kind?: string|null }} [extra]
 * @returns {Object|null}
 */
export function recordSeed(slot, label, source, result, { ref = null, kind = null } = {}) {
  const text = String(result ?? "").trim();
  if (!text) return null;
  return { slot, label, from: "state", source, tables: [], result: text,
    ...(ref ? { ref: String(ref) } : {}), ...(kind ? { kind: String(kind) } : {}), used: null };
}

/**
 * A die among the campaign's own records — Ask the Oracle's way of choosing
 * among options — shown and kept as any roll is: one face for each point of
 * an option's weight, the options in the order given. A pool of one is no
 * choice, and its seed has no die. Null with no option.
 *
 * @param {string} slot
 * @param {string} label
 * @param {string} pool — what the die is cast among, to the narrator and the table
 * @param {Array<{ name: string, weight?: number, ref?: string|null, kind?: string }>} options
 * @param {(faces: number) => number} [draw]
 * @returns {{ seed: Object, pick: Object }|null} — `pick`, the option the die chose
 */
export function chooseSeed(slot, label, pool, options, draw = drawDie) {
  const list = (Array.isArray(options) ? options : []).filter(o => o && String(o.name ?? "").trim());
  if (!list.length) return null;
  const weight = (o) => Math.max(1, Math.floor(Number(o.weight) || 1));
  let pick = list[0];
  let tables = [];
  if (list.length > 1) {
    const faces = list.reduce((n, o) => n + weight(o), 0);
    const roll = draw(faces);
    let at = 0;
    pick = list.find(o => (at += weight(o)) >= roll) ?? list[list.length - 1];
    tables = [{ id: null, name: pool, roll, die: faces, result: String(pick.name).trim() }];
  }
  const seed = recordSeed(slot, label, pool, pick.name, { ref: pick.ref ?? null, kind: pick.kind ?? null });
  return { pick, seed: { ...seed, tables } };
}

/**
 * The closing cutaway's material, once whom or where it shows is chosen
 * (endSessionVignette.js chooseClosingSubject). In the order drawn:
 *
 *   1. who or where it shows — the subject's seed, handed in (its die drawn);
 *   2. where they are — their card's LAST KNOWN location (no die), else a
 *      settlement zone and its area; for a settlement, where in it;
 *   3. what they are busy with — Action + Theme;
 *   4. the thing in hand, or close by — Descriptor + Focus.
 *
 * @param {{ subject: Object, lastKnown?: string }} scene
 * @param {(faces: number) => number} [draw]
 * @returns {Object[]} the seeds
 */
export function rollClosingSeeds({ subject = null, lastKnown = "" } = {}, draw = drawDie) {
  if (!subject?.result) return [];
  const name  = subject.result;
  const place = subject.kind === "settlement";
  const known = place ? "" : String(lastKnown ?? "").trim();
  return [
    subject,
    known
      ? recordSeed("place", `Where ${name} is`, "LAST KNOWN on their card", known)
      : made(() => placeSeed("place", place ? `Where in ${name}` : `Where ${name} is`, "derelict_zone_settlement", "Settlement zone + area", draw)),
    made(() => pairSeed("busy", place ? "What someone there is busy with" : `What ${name} is busy with`, ["action", "theme"], draw)),
    made(() => pairSeed("thing", place ? "One thing there" : "The thing in hand, or close by", ["descriptor", "focus"], draw)),
  ].filter(Boolean);
}

/**
 * The spotlight vignette's material (spotlightVignette.js
 * composeSpotlightScene). In the order drawn:
 *
 *   1. what the vignette shows — the Begin card's own Spotlight Vignette
 *      roll, handed in: never rolled again, and with no second result (the
 *      card has shown it);
 *   2. whom or what it is about — a die among the records its row names
 *      (`about`); two of them, the second among the rest, for a row that
 *      connects two situations; left out with none on record;
 *   3. what happens — Action + Theme;
 *   4. what it looks like — Descriptor + Focus.
 *
 * @param {{ roll: number, tableName?: string, result: string,
 *   about?: { label: string, pool: string, options: Object[], two?: boolean }|null }} spotlight
 * @param {(faces: number) => number} [draw]
 * @returns {Object[]} the seeds
 */
export function rollSpotlightSeeds({ roll, tableName = "Spotlight Vignette", result = "", about = null } = {}, draw = drawDie) {
  const text = String(result ?? "").trim();
  if (!text || !Number.isInteger(roll)) return [];
  return [
    { slot: "spotlight", label: "What the vignette shows", from: "oracle",
      tables: [{ id: "spotlight_vignette", name: tableName, roll, result: text }], result: text, used: null },
    about ? made(() => aboutSeed(about, draw)) : null,
    made(() => pairSeed("happens", "What happens", ["action", "theme"], draw)),
    made(() => pairSeed("looks", "What it looks like", ["descriptor", "focus"], draw)),
  ].filter(Boolean);
}

/** Whom or what a spotlight is about: one record by die, or two for a row that connects two situations. */
function aboutSeed({ label, pool, options, two = false }, draw) {
  const first = chooseSeed("about", label, pool, options, draw);
  if (!first) return null;
  if (!two) return first.seed;
  const second = chooseSeed("about", label, pool, options.filter(o => o !== first.pick), draw);
  if (!second) return first.seed;
  return { slot: "about", label, from: "state", source: pool,
    tables: [...first.seed.tables, ...second.seed.tables],
    result: `${first.seed.result}; ${second.seed.result}`, used: null };
}

/**
 * Whether a set-piece's narration writes a fact block — fact continuity on
 * (on when the setting cannot be read): the MATERIAL block asks for the
 * account (`builtFrom`) only then.
 *
 * @returns {boolean}
 */
export function factBlockWritten() {
  try {
    return (globalThis.game?.settings?.get?.(MODULE_ID, "factContinuity.enabled") ?? true) !== false;
  } catch {
    return true;
  }
}

/** A seed's tables as the narrator is told them: "Action + Theme". */
function sourceOf(seed) {
  return seed.source ?? (seed.tables ?? []).map(t => t.name).join(" + ");
}

/** A table entry's roll as it is told: "14" on a d100, "d7: 4" on a die among records. */
const rollOf = (t) => (Number.isFinite(t?.die) && t.die !== 100 ? `d${t.die}: ${t?.roll}` : `${t?.roll}`);
const rollsOf = (tables) => (tables ?? []).map(rollOf).join(", ");

/**
 * The seeds a scene's MATERIAL numbers, in order: those with a result. The
 * block's "1." is this list's first, and the narration's account names a
 * seed by that number (markSeedsUsed reads the same list).
 *
 * @param {Object[]|null} seeds
 * @returns {Object[]}
 */
function numbered(seeds) {
  return (Array.isArray(seeds) ? seeds : []).filter(s => s && typeof s === "object" && s.result);
}

/**
 * The MATERIAL block of a set-piece's user message: each seed numbered, with
 * its tables, dice and result, the second result under it, and the rules —
 * every result is in the scene, the scene has no business of its own, and
 * (`account`) the fact block says which words of the prose are each result.
 * '' with no seed.
 *
 * @param {Object[]} seeds
 * @param {{ account?: boolean, spotlight?: boolean }} [opts] — `account` false
 *   when the narration writes no fact block (fact continuity off);
 *   `spotlight`: the spotlight vignette's material, whose first result is what
 *   the vignette shows happening — a turn of the plot is what it is for
 * @returns {string}
 */
export function formatMaterial(seeds, { account = true, spotlight = false } = {}) {
  const list = numbered(seeds);
  if (!list.length) return "";
  const lines = ["MATERIAL — rolled for this scene on the game's oracles. Build the scene from it."];
  list.forEach((seed, i) => {
    const rolls = rollsOf(seed.tables);
    lines.push(`${i + 1}. ${seed.label} — ${sourceOf(seed)}${rolls ? ` (${rolls})` : ""}: ${seed.result}`);
    if (seed.second?.result) lines.push(`     (if that cannot be true here: ${seed.second.result})`);
  });
  lines.push(
    "",
    ...(spotlight ? [
      "- Each numbered result is in the scene, recognisably. Read it as a Starforged",
      "  oracle is read: for what the words mean here. (1) is what the vignette shows",
      "  happening; the others are what it is about, what happens in it and what it",
      "  looks like. Never the words themselves.",
    ] : [
      "- Each numbered result is in the scene, recognisably. Read it as a Starforged",
      "  oracle is read: for what the words mean here, at the size of a quiet moment",
      "  (a chore, a habit, an object, a small trouble). Never the words themselves,",
      "  and never a turn of the plot.",
    ]),
    "- A result that cannot be true here, or that the table's safety settings rule",
    "  out, gives way to the one in brackets under it — once, and only then.",
    "- The scene has no business and no featured thing of its own. Nothing is",
    "  eaten, drunk, mended, heard or noticed in it that is not one of the results",
    "  or already on record.",
  );
  if (account) {
    lines.push(
      "- In your JSON block, add \"builtFrom\": one entry for each number, with the",
      "  three to eight words of your prose that are it:",
      "  [{ \"n\": 1, \"words\": \"…\" }, { \"n\": 2, \"words\": \"…\", \"second\": true }].",
    );
  }
  return lines.join("\n");
}

/** A text as its words, lower case, for finding one run of words in another. */
function wordsOf(text) {
  return (String(text ?? "").replace(/<[^>]*>/g, " ").toLowerCase().replace(/[’‘]/g, "'").match(/[a-z0-9']+/g) ?? []).join(" ");
}

/**
 * Mark each seed with the narration's account of it (`builtFrom`, the fact
 * block's key for this mode — sidecarParser.js normaliseBuiltFrom). In place:
 *
 *   used       — the words of the prose that are this result; `false` when
 *                the fact block named none the prose holds; left `null` when
 *                no fact block was read at all (fact continuity off, a block
 *                missing or unreadable) — nothing is known then;
 *   claimed    — words the fact block gave that the prose does not hold;
 *   tookSecond — the narration set the result aside for its second.
 *
 * Nothing is retried on it: a seed the scene did not use is shown as not used.
 *
 * @param {Object[]|null} seeds
 * @param {Array<{ n: number, words: string, second: boolean }>|null} builtFrom —
 *   null when no fact block was read
 * @param {string} prose
 * @returns {Object[]|null} the seeds
 */
export function markSeedsUsed(seeds, builtFrom, prose) {
  if (!Array.isArray(seeds) || !Array.isArray(builtFrom)) return seeds ?? null;
  const told = ` ${wordsOf(prose)} `;
  numbered(seeds).forEach((seed, i) => {
    const entry = builtFrom.find(e => e?.n === i + 1) ?? null;
    const words = typeof entry?.words === "string" ? entry.words.trim() : "";
    const held  = !!words && !!wordsOf(words) && told.includes(` ${wordsOf(words)} `);
    seed.used = held ? words : false;
    if (words && !held) seed.claimed = words; else delete seed.claimed;
    seed.tookSecond = !!(entry?.second && seed.second);
  });
  return seeds;
}

const escapeHtml = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The seeds as a card's flag holds them: plain data, nothing but what a seed
 * is. [] for anything that is no list of seeds.
 *
 * @param {Object[]|null} seeds
 * @returns {Object[]}
 */
export function seedsForFlags(seeds) {
  const tablesOf = (tables) => (Array.isArray(tables) ? tables : []).map(t => ({
    id: t?.id ?? null, name: String(t?.name ?? ""), roll: Number(t?.roll) || 0, result: String(t?.result ?? ""),
    ...(Number.isFinite(t?.die) ? { die: t.die } : {}),
  }));
  return numbered(seeds).map(s => ({
    slot: String(s.slot ?? ""), label: String(s.label ?? ""), from: s.from === "state" ? "state" : "oracle",
    ...(typeof s.source === "string" && s.source ? { source: s.source } : {}),
    ...(typeof s.ref === "string" && s.ref ? { ref: s.ref } : {}),
    ...(typeof s.kind === "string" && s.kind ? { kind: s.kind } : {}),
    tables: tablesOf(s.tables), result: String(s.result),
    ...(s.second?.result ? { second: { tables: tablesOf(s.second.tables), result: String(s.second.result) } } : {}),
    used: typeof s.used === "string" ? s.used : (s.used === false ? false : null),
    ...(typeof s.claimed === "string" && s.claimed ? { claimed: s.claimed } : {}),
    ...(s.tookSecond === true ? { tookSecond: true } : {}),
  }));
}

/**
 * "Rolled for this scene": a card's seeds as the table reads them — a closed
 * line that opens, each seed with its tables, its dice and its result, the
 * second result where the narration took it, and "not used" on a seed the
 * narration did not account for. '' with no seed.
 *
 * @param {Object[]} seeds — a card's `builtFrom`
 * @returns {string} HTML
 */
export function renderSeedsLine(seeds) {
  const list = numbered(seeds);
  if (!list.length) return "";
  const items = list.map(seed => {
    const names = seed.from === "state"
      ? String(seed.source ?? "")
      : (seed.tables ?? []).map(t => t.name).filter(Boolean).join(" + ");
    const rolls = rollsOf(seed.tables);
    const dice  = `${escapeHtml(names)}${rolls ? ` (${escapeHtml(rolls)})` : ""}`;
    const taken = seed.tookSecond && seed.second?.result
      ? ` <span class="sf-scene-roll-second">— set aside for its second result: <strong>${escapeHtml(seed.second.result)}</strong> (${escapeHtml(rollsOf(seed.second.tables))})</span>`
      : "";
    const account = typeof seed.used === "string" && seed.used
      ? ` <span class="sf-scene-roll-used">— “${escapeHtml(seed.used)}”</span>`
      : (seed.used === false ? ` <span class="sf-scene-roll-unused">— not used</span>` : "");
    return `<li>${escapeHtml(seed.label)} — ${dice}: <strong>${escapeHtml(seed.result)}</strong>${taken}${account}</li>`;
  });
  return `<details class="sf-scene-rolls"><summary>Rolled for this scene</summary><ul>${items.join("")}</ul></details>`;
}

/**
 * Put "Rolled for this scene" on a set-piece's card as it renders, from the
 * card's `builtFrom` flag (the chat-message render hook, on every client: the
 * dice are shown to the whole table). The flag is the one store of a scene's
 * rolls; this only reads it, at every render, and never rolls.
 *
 * @param {Object} message — the ChatMessage
 * @param {HTMLElement} root — its rendered element
 */
export function renderSceneRolls(message, root) {
  const seeds = message?.flags?.[MODULE_ID]?.builtFrom;
  if (!Array.isArray(seeds) || !seeds.length) return;
  const card = root?.querySelector?.(".sf-session-vignette-card");
  if (!card?.insertAdjacentHTML || card.querySelector?.(".sf-scene-rolls")) return;
  const html = renderSeedsLine(seeds);
  if (!html) return;
  const prose = card.querySelector?.(".sf-narration-prose");
  if (prose?.insertAdjacentHTML) prose.insertAdjacentHTML("afterend", html);
  else card.insertAdjacentHTML("beforeend", html);
}
