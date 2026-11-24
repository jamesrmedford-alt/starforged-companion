// The world a run plays in — shared by the scripted playthroughs
// (playthrough.mjs) and the AI exploration runs (explore.mjs): the dice hook
// on the GM's page, the wait for a world that has stopped changing, and the
// seed (a player with a character and the vows they come with, the command
// vehicle, a sector and its settlements, the settings a run pins) with its
// restore.

import { MODULE_ID, MODULE_SRC } from "./foundry.mjs";
import { PAGE_KEY } from "./claude.mjs";

export const PLAYER_NAME = "Playthrough Player";

// ── page hooks ───────────────────────────────────────────────────────────────

/**
 * A refused write's caller (any page, before any script). The server's
 * refusal comes back with the server's stack — "User … lacks permission to
 * create Item […] in parent Actor […]" at ServerDatabaseBackend — and says
 * nothing of who asked. Every create, update and delete a client asks for is
 * given the stack of its asker, kept in window.__sfcRefused when the write is
 * refused. Nothing else changes: the same call, the same result, the same
 * error thrown on.
 */
export function installRefusalTrace() {
  const wrap = () => {
    const Document = globalThis.foundry?.abstract?.Document;
    if (!Document || Document.__sfcTraced) return !!Document;
    Document.__sfcTraced = true;
    for (const method of ["createDocuments", "updateDocuments", "deleteDocuments"]) {
      const original = Document[method];
      if (typeof original !== "function") continue;
      Document[method] = async function sfcRefusalTrace(...args) {
        const asked = new Error("asked here").stack;
        try { return await original.apply(this, args); }
        catch (err) {
          const parent = args[1]?.parent ?? null;
          (window.__sfcRefused ??= []).push({
            method, document: this.documentName ?? this.name ?? "?", message: String(err?.message ?? err),
            parent: parent ? `${parent.documentName} "${parent.name}" (${parent.type ?? "?"})` : null,
            data: (Array.isArray(args[0]) ? args[0] : [args[0]]).slice(0, 3).map(d => ({ type: d?.type ?? null, name: d?.name ?? null, id: d?._id ?? null, keys: Object.keys(d ?? {}).slice(0, 8) })),
            stack: String(asked).split("\n").slice(2, 16).join("\n"),
          });
          throw err;
        }
      };
    }
    return true;
  };
  if (!wrap()) { const timer = setInterval(() => { if (wrap()) clearInterval(timer); }, 25); }
}

/**
 * Scripted dice (GM page, before any script). The resolver rolls with
 * Math.random inside rollDie (src/moves/resolver.js) — challenge dice first,
 * then the action die. While window.__sfcDice holds values, a call made
 * directly from rollDie takes the next one; every other caller (ids, oracle
 * tables) gets real randomness. While window.__sfcRolled is an array, every
 * value rollDie is given — scripted or real — is appended to it. While
 * window.__sfcRandomKept is an object, every other value a file of the
 * module's draws is appended to it under that file's name, and taken from
 * window.__sfcRandomQueue first when it holds values for that file — a
 * session set-piece's under its own stream, "session/sceneSeeds.js", the
 * roller's draws for it included (issue #381).
 */
export function installDiceScript() {
  const realRandom = Math.random;
  Math.random = function sfcPlaythroughRandom() {
    const queue = window.__sfcDice;
    const queued = Array.isArray(queue) && queue.length > 0;
    // An exploration run keeps the dice it rolled (window.__sfcRolled, set by
    // explore.mjs), so its replay can script them.
    const kept = Array.isArray(window.__sfcRolled) ? window.__sfcRolled : null;
    if (queued || kept) {
      const limit = Error.stackTraceLimit;
      Error.stackTraceLimit = 4;
      const caller = (new Error().stack || "").split("\n")[2] || "";
      Error.stackTraceLimit = limit;
      if (/\brollDie\b/.test(caller) && caller.includes("/moves/resolver.js")) {
        const value = queued ? queue.shift() : realRandom();
        if (kept) kept.push(value);
        return value;
      }
    }
    // A long exploration run (issue #373) keeps the module's other randomness
    // too — an oracle's d100, a price paid — by the file that asked for it
    // (window.__sfcRandomKept), and a replay hands each file its values back
    // in order (window.__sfcRandomQueue). Without it a replay rolled a
    // different price for the same miss and was no replay.
    const others = window.__sfcRandomKept;
    if (others && typeof others === "object") {
      const limit = Error.stackTraceLimit;
      Error.stackTraceLimit = 4;
      const caller = (new Error().stack || "").split("\n")[2] || "";
      Error.stackTraceLimit = limit;
      const fileOf = (line) => /\/modules\/starforged-companion\/src\/([^?:)\s]+)/.exec(line ?? "")?.[1] ?? null;
      let file = fileOf(caller);
      // A session set-piece's dice are one stream (issue #381): its own
      // (`drawDie`, session/sceneSeeds.js) and the roller's for it — a table
      // row that is a directive ("Action + Theme", a reference, "Roll twice")
      // makes `rollOracle(id, { roll })` roll again through oracles/roller.js.
      // Filed under the roller, those draws would take, in a replay, values a
      // run recorded for its prices and oracles, and every price after them
      // would come out another.
      if (file === "oracles/roller.js") {
        Error.stackTraceLimit = 16;
        const deeper = (new Error().stack || "").split("\n").slice(3).map(fileOf);
        Error.stackTraceLimit = limit;
        if (deeper.some(f => /^session\/(?:sceneSeeds|spotlightVignette|galleyVignette|endSessionVignette)\.js$/.test(f ?? ""))) file = "session/sceneSeeds.js";
      }
      if (file) {
        const queue = window.__sfcRandomQueue?.[file];
        const value = Array.isArray(queue) && queue.length ? queue.shift() : realRandom();
        (others[file] ??= []).push(value);
        return value;
      }
    }
    return realRandom();
  };
}

// ── GM-side world setup ──────────────────────────────────────────────────────

/** The ranks a vow may be seeded at, as the module writes them. */
const VOW_RANKS = ["troublesome", "dangerous", "formidable", "extreme", "epic"];

/**
 * The vows a seed puts on its character's sheet before play (`seed.pc.vows`:
 * `[{ name, rank }]`), as the module's own vow maker takes them: a name, a
 * rank it knows (dangerous where the seed names none or another), and an id —
 * so that the module treats each as a vow it made, and offers no "New vow
 * recorded" card for it. Pure.
 *
 * The first vow on a sheet is the character's background vow to the module
 * (src/session/openThreads.js `questVows`): a quest sworn in play is counted
 * as one only when something stands before it. The long haul's character had
 * none, so Begin a Session said "No character has a vow in play besides a
 * background vow" with her quest sworn (the third live run, a19 and a50).
 *
 * @param {{ pc?: { vows?: Array<{ name?: string, rank?: string }> } }} seed
 * @returns {Array<{ name: string, rank: string, vowId: string }>}
 */
export function seedVows(seed) {
  return (seed?.pc?.vows ?? [])
    .map(v => ({ name: String(v?.name ?? "").replace(/\s+/g, " ").trim(), rank: String(v?.rank ?? "").toLowerCase() }))
    .filter(v => v.name)
    .map((v, i) => ({ name: v.name, rank: VOW_RANKS.includes(v.rank) ? v.rank : "dangerous", vowId: `seed-vow-${i + 1}` }));
}

/** The character's meters a seed may set, each with the bounds the sheet holds it to. */
const SEED_METERS = { health: [0, 5], spirit: [0, 5], supply: [0, 5], momentum: [-6, 10] };
/** The impacts a seed may mark, as the game system's sheet names them (actorBridge.js IMPACT_KEYS). */
export const SEED_IMPACTS = ["wounded", "shaken", "unprepared", "permanentlyharmed", "traumatized", "doomed", "tormented", "indebted", "battered", "cursed"];
const STATS = ["edge", "heart", "iron", "shadow", "wits"];

/**
 * The state of the character's sheet a seed asks for before play — where a
 * scenario starts mid-adventure (lib/suite.mjs): its meters (`seed.pc.meters`:
 * health, spirit, supply, momentum) and its impacts (`seed.pc.impacts`: a
 * wound, a shaken spirit). What the seed does not give is the sheet as a new
 * character has it. Pure.
 *
 * @param {{ pc?: { meters?: Record<string, number>, impacts?: string[] } }} seed
 * @returns {{ meters: Record<string, number>, impacts: string[] }}
 */
export function seedSheet(seed) {
  const meters = Object.fromEntries(Object.entries(seed?.pc?.meters ?? {}).filter(([k, v]) => SEED_METERS[k] && Number.isInteger(v)));
  const impacts = [...new Set((seed?.pc?.impacts ?? []).map(i => String(i).toLowerCase()).filter(i => SEED_IMPACTS.includes(i)))];
  return { meters, impacts };
}

/**
 * Why a seed cannot be made, or null — what seedVows and seedSheet would
 * otherwise pass over in silence: a vow with no name or a rank the module
 * does not know, a meter out of the sheet's bounds, an impact the sheet does
 * not have, a stat out of range, a place the seed puts the ship that it does
 * not make. Pure.
 *
 * @param {object} seed
 * @returns {string|null}
 */
export function seedProblem(seed) {
  const pc = seed?.pc ?? {};
  for (const [k, v] of Object.entries(pc.stats ?? {})) {
    if (!STATS.includes(k)) return `the character has no stat "${k}"`;
    if (!Number.isInteger(v) || v < 0 || v > 4) return `the character's ${k} (${v}) is not 0 to 4`;
  }
  for (const v of pc.vows ?? []) {
    if (!String(v?.name ?? "").trim()) return "a vow has no name";
    if (v.rank != null && !VOW_RANKS.includes(String(v.rank).toLowerCase())) return `the vow "${v.name}" has a rank the module does not know (${v.rank})`;
  }
  for (const [k, v] of Object.entries(pc.meters ?? {})) {
    const bounds = SEED_METERS[k];
    if (!bounds) return `the character has no meter "${k}"`;
    if (!Number.isInteger(v) || v < bounds[0] || v > bounds[1]) return `the character's ${k} (${v}) is not ${bounds[0]} to ${bounds[1]}`;
  }
  for (const i of pc.impacts ?? []) if (!SEED_IMPACTS.includes(String(i).toLowerCase())) return `the sheet has no impact "${i}"`;
  const places = (seed?.settlements ?? []).map(s => s?.name);
  if (new Set(places).size !== places.length) return "two settlements share a name";
  if (seed?.at && !places.includes(seed.at)) return `the ship is put at "${seed.at}", which the seed does not make`;
  if (seed?.map?.shipAt && !places.includes(seed.map.shipAt)) return `the ship's token is put at "${seed.map.shipAt}", which the seed does not make`;
  return null;
}

/**
 * Wait until the GM's world has stopped changing. `game.ready` is where the
 * module's world-load work starts, not where it ends: its repairs, a stale
 * move lock's release and the session check write for a while after it — on a
 * slow runner, for seconds. A world cleared under that work has its cards in
 * the chat just cleared and its repairs failing on actors just deleted. And
 * the module answers the runner's own deletions with writes of its own, so
 * the same wait is made again after clearing (setUpWorld).
 */
export async function waitForQuietWorld(gm, { quietMs = 3000, capMs = 60_000 } = {}) {
  await gm.page.evaluate(({ quietMs, capMs }) => new Promise((resolve) => {
    const started = Date.now();
    let last = started;
    const bump = () => { last = Date.now(); };
    const names = ["updateSetting", "createSetting", "createChatMessage", "updateChatMessage", "createActor", "updateActor",
      "deleteActor", "createItem", "updateItem", "createJournalEntry", "updateJournalEntry", "deleteJournalEntry",
      "createFolder", "updateFolder", "updateScene"];
    const ids = names.map(name => [name, Hooks.on(name, bump)]);
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - last < quietMs && now - started < capMs) return;
      clearInterval(timer);
      for (const [name, id] of ids) Hooks.off(name, id);
      resolve();
    }, 250);
  }), { quietMs, capMs });
}

/**
 * PLAYTHROUGH_TRACE_STATE=1: log every campaign-state write this page makes —
 * the session fields it writes and the module frames it came from — as debug
 * lines, which the failure report prints. For the question "who wrote that
 * back?" (known-issues PLAYTHROUGH-SEED-UNDER-MODULE-WRITES).
 */
export async function traceStateWrites(client) {
  if (process.env.PLAYTHROUGH_TRACE_STATE !== "1") return;
  await client.page.evaluate((MODULE_ID) => {
    const settings = game.settings;
    const original = settings.set.bind(settings);
    settings.set = function tracedSet(namespace, key, value, ...rest) {
      if (namespace === MODULE_ID && key === "campaignState") {
        const frames = (new Error().stack || "").split("\n").slice(2)
          .map(l => l.trim().replace(/^at /, "").replace(/\(?https?:\/\/[^/]+\/modules\/[^/]+\/src\//, "(").replace(/\(?https?:\/\/[^)]*\)?/, "(foundry)"))
          .filter(l => !l.includes("(foundry)")).slice(0, 5).join(" < ");
        console.debug(`${MODULE_ID} | TRACE state write: id=${value?.currentSessionId || "-"} started=${value?.sessionStartedId || "-"} active=${value?.sessionActive} n=${value?.sessionNumber} via ${frames || "(page script)"}`);
      }
      return original(namespace, key, value, ...rest);
    };
  }, MODULE_ID);
}

/** Clear what earlier suites left behind, pin the scenario's settings, seed its world. */
export async function setUpWorld(gm, scenario) {
  // A fresh world: no chat, actors or journals from earlier suites (the help
  // journal stays).
  await gm.page.evaluate(async ({ MODULE_ID }) => {
    if (!game.modules.get(MODULE_ID)?.active) throw new Error(`${MODULE_ID} is not active in this world — did the Cypress run enable it?`);
    const drop = async (cls, docs) => { if (docs.length) await cls.deleteDocuments(docs.map(d => d.id)); };
    await drop(CONFIG.ChatMessage.documentClass, game.messages.contents);
    await drop(CONFIG.Actor.documentClass, game.actors.contents);
    await drop(CONFIG.JournalEntry.documentClass, game.journal.contents.filter(j => !/help/i.test(j.name)));
    await drop(CONFIG.Scene.documentClass, game.scenes.contents.filter(sc => sc.flags?.[MODULE_ID]?.sectorScene));
  }, { MODULE_ID });
  // The module answers those deletions — a hidden plan whose NPC card or
  // journal went retires its clock (world/secrets.js → clocks.retireClock) —
  // and each answer writes the whole campaign state from this client's cache.
  // The reset below, written while one was in flight, was written over by it:
  // the state came back with the last scenario's session, already begun, and
  // Begin a Session opened no dialog (CI run 45050276295). So the answers
  // land first, and the reset goes on the module's own write chain.
  await waitForQuietWorld(gm, { quietMs: 2000 });
  return gm.page.evaluate(async ({ MODULE_ID, MODULE_SRC, PLAYER_NAME, PAGE_KEY, scenario, vows, sheetWanted }) => {
    const { serialiseCampaignStateWrite } = await import(`${MODULE_SRC}/multiplayer/campaignStateChain.js`);
    const writeState = (state, label) => serialiseCampaignStateWrite(() => game.settings.set(MODULE_ID, "campaignState", state), label);

    // The campaign state's registered default.
    const fresh = game.settings.settings.get(`${MODULE_ID}.campaignState`)?.default ?? {};
    await writeState(foundry.utils.deepClone(fresh), "playthrough reset");
    // No Batch Mode round from an earlier suite (issue #340).
    if (game.settings.settings.has(`${MODULE_ID}.batchMode.round`)) await game.settings.set(MODULE_ID, "batchMode.round", null);

    // Pinned settings, restored after the run.
    const restore = {};
    for (const [key, value] of Object.entries(scenario.settings ?? {})) {
      restore[key] = game.settings.get(MODULE_ID, key);
      await game.settings.set(MODULE_ID, key, value);
    }
    // The GM holds the Claude key (a placeholder: replies come from the
    // harness) — the keyed canonical GM runs the narrator.
    restore.claudeApiKey = game.settings.get(MODULE_ID, "claudeApiKey");
    await game.settings.set(MODULE_ID, "claudeApiKey", PAGE_KEY);
    // The registry follows the key a moment later — on a slow runner, more
    // than a moment. A scenario started before it has the GM in it narrates
    // nothing, silently (its first step then waits for a card that never
    // comes): wait for it, and say so if it never arrives.
    const keyed = () => (game.settings.get(MODULE_ID, "keyedGmUserIds") ?? []).includes(game.user.id);
    for (let i = 0; i < 300 && !keyed(); i++) await new Promise(r => setTimeout(r, 100));
    if (!keyed()) throw new Error("the GM was not registered as the key-holding GM within 30 s — the narrator would not run");
    window.__sfcRestore = restore;

    // The seed: a player owning a PC, the command vehicle, where they are.
    const seed = scenario.seed ?? {};
    let user = game.users.find(u => u.name === PLAYER_NAME);
    if (!user) user = await User.create({ name: PLAYER_NAME, role: CONST.USER_ROLES.PLAYER });
    const pc = await Actor.create({
      name:      seed.pc.name,
      type:      "character",
      system:    { pronouns: seed.pc.pronouns ?? "", ...(seed.pc.stats ?? {}) },
      ownership: { default: 0, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    });
    await user.update({ character: pc.id });
    // The vows the character comes to the table with — the first of them
    // their background vow — made as the module makes a vow.
    if (vows.length) {
      const { createCharacterVowItem } = await import(`${MODULE_SRC}/character/actorBridge.js`);
      for (const vow of vows) {
        const item = await createCharacterVowItem(pc, vow);
        if (!item) throw new Error(`the seed's vow "${vow.name}" could not be put on ${pc.name}'s sheet`);
      }
    }
    // The sheet as the seed has it — a scenario that starts mid-adventure
    // (lib/suite.mjs): the impacts first (an impact lowers what a meter and
    // momentum can hold), then each meter by its difference from what the
    // sheet holds, through the module's own writers, with the game system's
    // change notes held back (nothing here is a line of play). Read back, and
    // failed by name if the sheet does not hold what was asked.
    if (sheetWanted.impacts.length || Object.keys(sheetWanted.meters).length) {
      const sheet = await import(`${MODULE_SRC}/character/actorBridge.js`);
      const held = () => { sheet.invalidateActorCache(pc.id); return sheet.readCharacterSnapshot(pc); };
      await sheet.withoutSystemNotes(async () => {
        for (const impact of sheetWanted.impacts) await sheet.setDebility(pc, impact, true);
        const now = held().meters;
        const change = Object.fromEntries(Object.entries(sheetWanted.meters).map(([meter, value]) => [meter, value - (now[meter] ?? 0)]));
        if (Object.values(change).some(Boolean)) await sheet.applyMeterChanges(pc, change);
      });
      const after = held();
      for (const [meter, value] of Object.entries(sheetWanted.meters)) {
        if (after.meters[meter] !== value) throw new Error(`the seed's ${meter} (${value}) did not take: the sheet holds ${after.meters[meter]}`);
      }
      for (const impact of sheetWanted.impacts) if (after.debilities?.[impact] !== true) throw new Error(`the seed's impact "${impact}" did not take`);
    }

    // A PC of the GM's own (`seed.gmPc`): a GM takes part in a Batch Mode
    // round only with an assigned PC. Unassigned again after the run.
    let gmPcId = null;
    if (seed.gmPc) {
      const gmPc = await Actor.create({
        name:   seed.gmPc.name,
        type:   "character",
        system: { pronouns: seed.gmPc.pronouns ?? "", ...(seed.gmPc.stats ?? {}) },
      });
      window.__sfcRestoreCharacter = game.user.character?.id ?? null;
      await game.user.update({ character: gmPc.id });
      gmPcId = gmPc.id;
    }

    const cs = foundry.utils.deepClone(game.settings.get(MODULE_ID, "campaignState") ?? {});
    let sectorId = null;
    if (seed.sector) {
      sectorId = "playthrough-sector";
      cs.sectors = [{ id: sectorId, ...seed.sector }];
      cs.activeSectorId = sectorId;
    }
    let shipActorId = null;
    if (seed.ship) {
      const { createShip } = await import(`${MODULE_SRC}/entities/ship.js`);
      await createShip({ name: seed.ship.name, isCommandVehicle: true }, cs);
      shipActorId = cs.shipIds.at(-1);
    }
    const settlementIds = {};
    if (seed.settlements?.length) {
      const { createSettlement } = await import(`${MODULE_SRC}/entities/settlement.js`);
      for (const { pin: _pin, ...data } of seed.settlements) {
        await createSettlement({ ...data, sectorId }, cs, { persist: false });
        settlementIds[data.name] = cs.settlementIds.at(-1);
      }
      if (settlementIds[seed.at]) {
        cs.currentLocationId   = settlementIds[seed.at];
        cs.currentLocationType = "settlement";
      }
    }
    await writeState(cs, "playthrough seed");

    // The sector map: a pin per settlement and the command vehicle's token
    // on `seed.map.shipAt` — placing it records where the ship is (the
    // createToken hook, v1.7.10 F5).
    if (seed.map) {
      const scene = await CONFIG.Scene.documentClass.create({
        name: `${seed.sector?.name ?? "Sector"} (playthrough)`, width: 2000, height: 1200, padding: 0,
        grid: { size: 100 },
        flags: { [MODULE_ID]: { sectorScene: true, sectorId } },
      });
      await scene.createEmbeddedDocuments("Note", seed.settlements.filter(s => s.pin).map(s => ({
        x: s.pin[0], y: s.pin[1], text: s.name,
        flags: { [MODULE_ID]: { settlementId: settlementIds[s.name], actorId: settlementIds[s.name] } },
      })));
      const at = seed.settlements.find(s => s.name === seed.map.shipAt)?.pin;
      if (shipActorId && at) {
        const ship = game.actors.get(shipActorId);
        const token = await ship.getTokenDocument({ x: at[0], y: at[1] });
        await scene.createEmbeddedDocuments("Token", [token.toObject()]);
      }
    }
    return { gmId: game.user.id, playerId: user.id, pcId: pc.id, gmPcId };
  }, { MODULE_ID, MODULE_SRC, PLAYER_NAME, PAGE_KEY, scenario, vows: seedVows(scenario.seed), sheetWanted: seedSheet(scenario.seed) });
}

export async function restoreWorld(gm, log = console.log) {
  await gm.page.evaluate(async (MODULE_ID) => {
    for (const [key, value] of Object.entries(window.__sfcRestore ?? {})) {
      await game.settings.set(MODULE_ID, key, value).catch(() => {});
    }
    if (window.__sfcRestoreCharacter !== undefined) {
      await game.user.update({ character: window.__sfcRestoreCharacter }).catch(() => {});
      delete window.__sfcRestoreCharacter;
    }
  }, MODULE_ID).catch(err => log(`restoring settings failed: ${err?.message ?? err}`));
}
