/**
 * STARFORGED COMPANION
 * tests/unit/hookGates.test.js
 *
 * Document hooks fire on EVERY connected client (issue #282 item 5).
 *
 * Foundry runs createChatMessage / create* / update* / delete* hooks on every
 * client — GMs and players alike — so a handler that writes shared state
 * there writes once per browser: duplicate cards, double-applied effects,
 * players' writes refused. The 2026-10 audit found a batch of these by hand
 * (HOOK-ISGM-EMITTER, CMD-PER-CLIENT); this scan of src/ (minus Quench) is the
 * check.
 *
 * Each handler must carry a single-runner gate — the canonical GM
 * (`isCanonicalGM()`), or the client whose user made the change
 * (`isAuthoringClient(message)`, or `… === game.user.id` against the hook's
 * userId / the message's author) — in its own body or in a same-file helper
 * it calls (followed three calls deep). A handler that only touches its own
 * client (re-rendering a panel, mirroring state into memory) is listed in
 * LOCAL_ONLY with the reason, and may not contain a shared write; one that
 * writes only its own GM's entry of a per-user registry is listed in
 * OWN_ENTRY with the reason.
 *
 * pre* hooks are not scanned: Foundry runs them only on the client making
 * the change.
 */

import { describe, it, expect } from 'vitest';
import { productionSources, hookRegistrations, resolveFunctionSource, maskLiterals } from '../helpers/sourceScan.js';

const DOCUMENT_HOOK = /^(?:create|update|delete)[A-Z]/;

const GATES = [
  /\bisCanonicalGM\s*\(/,
  /\bisAuthoringClient\s*\(/,
  /[!=]==?\s*game\??\.user\??\.id\b/,
  /\bgame\??\.user\??\.id\s*[!=]==?/,
];

/** Writes that reach other clients or the server. */
const SHARED_WRITES = [
  /\b[A-Z]\w*\.create(?:Documents)?\s*\(/,                     // ChatMessage.create, Actor.create …
  /\.(?:create|update|delete)EmbeddedDocuments\s*\(/,
  /\.update\s*\(/,
  /\.(?:set|unset)Flag\s*\(/,
  /\.delete\s*\(\s*\)/,                                      // doc.delete() — Map/Set.delete take a key
  /\bsettings\.set\s*\(/,
  /\bsocket\.emit\s*\(/,
  /\brequestGmAction\s*\(/,
];

/**
 * Handlers that run on every client by design and touch only that client.
 * Key: "<file> <hook> <handler>" — the handler's name, or inline#N for the
 * Nth inline handler of that hook in the file.
 */
const LOCAL_ONLY = {
  'src/oracles/customOracles.js updateSetting onCampaignStateSettingChanged': 'mirrors campaignState.customOracles into this client\'s oracle registry — every client needs its own copy',
  'src/oracles/customOracles.js createSetting onCampaignStateSettingChanged': 'same mirror, first write of the setting',
  'src/ui/sessionPanel.js updateSetting SessionPanelApp.onSettingChanged': 're-renders this client\'s Session Panel',
  'src/ui/sessionPanel.js createSetting SessionPanelApp.onSettingChanged': 're-renders this client\'s Session Panel',
  'src/ui/entityPanel.js updateJournalEntry inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js updateJournalEntryPage inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js createJournalEntry inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js createJournalEntryPage inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js deleteJournalEntry inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js createActor inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js updateActor inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js deleteActor inline#1': 're-renders this client\'s Entity Panel',
  'src/ui/entityPanel.js updateItem inline#1': 're-renders this client\'s Entity Panel when a recorded ship\'s STARSHIP asset track changes',
  'src/ui/entityPanel.js updateSetting EntityPanelApp.onSettingChanged': 're-renders this client\'s Entity Panel when the current location or dismissed names it shows changed',
  'src/ui/entityPanel.js createSetting EntityPanelApp.onSettingChanged': 'same, first write of the setting',
  'src/ui/progressTracks.js updateJournalEntry inline#1': 're-renders this client\'s Progress Tracks panel',
  'src/ui/progressTracks.js updateSetting ProgressTrackApp.onSettingChanged': 're-renders this client\'s Progress Tracks panel when the clocks it shows changed',
  'src/ui/progressTracks.js createSetting ProgressTrackApp.onSettingChanged': 'same, first write of the setting',
  'src/clocks/clocks.js updateSetting onClocksSettingChanged': 're-renders this client\'s Clocks panel when the clocks it shows changed',
  'src/clocks/clocks.js createSetting onClocksSettingChanged': 'same, first write of the setting',
  'src/character/chroniclePanel.js updateJournalEntryPage inline#1': 're-renders this client\'s Chronicle panel',
  // issue #345 AA66 — the World Journal panel's refresh hooks
  'src/world/worldJournalPanel.js createJournalEntryPage onPanelPageWritten': 're-renders this client\'s World Journal panel when a Lore or Threats entry is added',
  'src/world/worldJournalPanel.js deleteJournalEntryPage onPanelPageWritten': 're-renders this client\'s World Journal panel when a Lore or Threats entry is removed',
  'src/world/worldJournalPanel.js updateJournalEntryPage onPanelPageUpdated': 're-renders this client\'s World Journal panel when a Lore or Threats entry changes (a threat\'s severity)',
  'src/world/worldJournalPanel.js createChatMessage onContradictionCardWritten': 're-renders this client\'s World Journal panel when a contradiction card is posted',
  'src/world/worldJournalPanel.js updateChatMessage onContradictionCardWritten': 're-renders this client\'s World Journal panel when a contradiction card changes',
  'src/world/worldJournalPanel.js deleteChatMessage onContradictionCardWritten': 're-renders this client\'s World Journal panel when a contradiction card is dismissed or deleted',
  'src/index.js createItem invalidateItemOwnerSnapshot': 'drops the owner\'s cached actor snapshot on this client',
  'src/index.js updateItem invalidateItemOwnerSnapshot': 'drops the owner\'s cached actor snapshot on this client',
  'src/index.js deleteItem invalidateItemOwnerSnapshot': 'drops the owner\'s cached actor snapshot on this client',
  'src/private-channel/transcript.js createJournalEntry inline#1': 'ends this client\'s wait for the transcript journal the GM created for it',
  'src/ui/roundWindow.js updateSetting onSettingForWindow': 're-renders this client\'s Batch Mode Round window when the session, X-Card or keyed GMs its banners show changed (issue #340)',
  'src/ui/roundWindow.js createSetting onSettingForWindow': 'same, first write of the setting — the keyed-GM registry\'s (issue #342 Z33)',
};

/**
 * Handlers that run on every GM client by design and write only that GM's own
 * entry of a per-user registry — the one fact only its own browser knows
 * (whether it holds a key; its user's Private Lines), which no other client
 * can write for it. Each writes only when the stored list misstates its own
 * user, so the registry converges and nothing is emitted twice; a player's
 * client, which cannot write the world, relays its own entry to the canonical
 * GM on the same condition. Key and reason as LOCAL_ONLY's.
 */
const OWN_ENTRY = {
  'src/multiplayer/gmGate.js updateSetting onKeyRegistryWritten': 're-advertises this GM\'s own key-registry membership when another GM\'s concurrent write dropped or misstated it (issue #342 Z68)',
  'src/multiplayer/gmGate.js createSetting onKeyRegistryWritten': 'same, first write of the registry',
  // issue #345 AA35
  'src/ui/settingsPanel.js updateSetting onCampaignStateWritten': 'puts this user\'s own Private Lines entry back when another client\'s concurrent write dropped or misstated it — a GM writes it, a player relays it to the canonical GM (issue #345 AA35)',
  'src/ui/settingsPanel.js createSetting onCampaignStateWritten': 'same, first write of the setting',
};

const NOT_CALLS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'await', 'new', 'import', 'super']);

/** The handler's source plus every same-file function it calls, `depth` calls deep. */
function closureSource(source, handlerSource, depth = 3) {
  const seen = new Set();
  const parts = [handlerSource];
  let frontier = [handlerSource];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const code of frontier) {
      for (const m of maskLiterals(code).matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
        const name = m[1];
        if (NOT_CALLS.has(name) || seen.has(name)) continue;
        seen.add(name);
        const fn = resolveFunctionSource(source, name);
        if (fn) { parts.push(fn); next.push(fn); }
      }
    }
    frontier = next;
  }
  return parts.join('\n');
}

function documentHandlers() {
  const out = [];
  for (const source of productionSources()) {
    const inlineCount = new Map();
    for (const reg of hookRegistrations(source)) {
      if (!DOCUMENT_HOOK.test(reg.hook)) continue;
      let label = reg.ref;
      if (!label) {
        const n = (inlineCount.get(reg.hook) ?? 0) + 1;
        inlineCount.set(reg.hook, n);
        label = `inline#${n}`;
      }
      const body = reg.inline ?? resolveFunctionSource(source, reg.ref);
      out.push({
        key: `${reg.file} ${reg.hook} ${label}`,
        where: `${reg.file}:${reg.line}`,
        hook: reg.hook,
        closure: body == null ? null : closureSource(source, body),
      });
    }
  }
  return out;
}

const handlers = documentHandlers();
const gated = (h) => GATES.some(re => re.test(h.closure));

describe('document hook handlers run their shared writes on one client', () => {
  it('finds the handlers (sanity)', () => {
    expect(handlers.length).toBeGreaterThan(20);
    expect(handlers.some(h => h.key === 'src/index.js createChatMessage inline#1')).toBe(true);
    for (const h of handlers) expect(h.closure, `${h.where}: handler ${h.key} could not be resolved`).not.toBeNull();
  });

  it('every handler has an author / canonical-GM gate, or is listed as local-only', () => {
    const ungated = handlers.filter(h => !gated(h) && !LOCAL_ONLY[h.key] && !OWN_ENTRY[h.key]);
    expect(
      ungated.map(h => `${h.where} ${h.hook} (${h.key})`),
      'These handlers run on every client with no isCanonicalGM() / author check. Gate the shared write, ' +
      'or — when the handler only re-renders or mirrors into this client — list it in LOCAL_ONLY with the reason.',
    ).toEqual([]);
  });

  it('a local-only handler writes nothing shared', () => {
    const writers = handlers
      .filter(h => LOCAL_ONLY[h.key])
      .flatMap(h => SHARED_WRITES.filter(re => re.test(maskLiterals(h.closure))).map(re => `${h.where} ${h.key} matches ${re}`));
    expect(writers).toEqual([]);
  });

  it('every LOCAL_ONLY and OWN_ENTRY entry still names an ungated handler', () => {
    const byKey = new Map(handlers.map(h => [h.key, h]));
    for (const key of [...Object.keys(LOCAL_ONLY), ...Object.keys(OWN_ENTRY)]) {
      expect(byKey.has(key), `${key} no longer exists — remove it from LOCAL_ONLY`).toBe(true);
      expect(gated(byKey.get(key)), `${key} is gated now — remove it from LOCAL_ONLY`).toBe(false);
    }
  });
});
