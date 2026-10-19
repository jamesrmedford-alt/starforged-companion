/**
 * STARFORGED COMPANION
 * tests/helpers/cardDom.js
 *
 * A minimal DOM for the multi-client harness (tests/helpers/multiClient.js):
 * enough to render a chat card's real HTML on one simulated client, let the
 * module's renderChatMessageHTML hooks wire its buttons, and click them —
 * so "P1 clicks Burn Momentum on the GM's move card" runs the production
 * wiring hop, not a hand-called handler.
 *
 * Covers what card wiring uses: an HTML parser (elements, text, comments,
 * void elements, entities), querySelector / querySelectorAll / matches /
 * closest over a small selector engine (tag, #id, .class, [attr], [attr=v],
 * [attr^=v], [attr$=v], [attr*=v], :checked, :disabled, :not(…), descendant
 * and child combinators, selector lists), attributes / dataset / classList /
 * disabled / value / checked / textContent / innerHTML, tree edits
 * (append, prepend, insertAdjacentHTML, replaceWith, cloneNode, remove) and
 * bubbling events. An unsupported selector throws, so a gap is visible
 * instead of matching nothing.
 *
 * Not a browser: no layout, no styles, no form submission, no focus.
 */

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "title"]);

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

function escapeText(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const kebab = (s) => String(s).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const camel = (s) => String(s).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export class StubEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this._stopped = false;
    Object.assign(this, init.detail !== undefined ? { detail: init.detail } : {});
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this._stopped = true; }
  stopImmediatePropagation() { this._stopped = true; this._immediate = true; }
}

/**
 * Listener results (promises from async listeners) are reported here so the
 * harness can await them in settle(). Set by multiClient.js.
 */
let _onListenerResult = null;
export function setListenerResultSink(fn) { _onListenerResult = fn; }

// ─────────────────────────────────────────────────────────────────────────────
// Nodes
// ─────────────────────────────────────────────────────────────────────────────

export class StubNode {
  constructor() {
    this.parentNode = null;
    this.childNodes = [];
  }
  get parentElement() { return this.parentNode instanceof StubElement ? this.parentNode : null; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(""); }
  remove() {
    const parent = this.parentNode;
    if (!parent) return;
    const i = parent.childNodes.indexOf(this);
    if (i >= 0) parent.childNodes.splice(i, 1);
    this.parentNode = null;
  }
  replaceWith(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const replacements = nodes.map(toNode);
    for (const n of replacements) n.remove();
    const i = parent.childNodes.indexOf(this);
    for (const n of replacements) n.parentNode = parent;
    parent.childNodes.splice(i, 1, ...replacements);
    this.parentNode = null;
  }
}

export class StubText extends StubNode {
  constructor(text = "") {
    super();
    this.data = String(text);
  }
  get nodeType() { return 3; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v ?? ""); }
  cloneNode() { return new StubText(this.data); }
  serialize() { return escapeText(this.data); }
}

export class StubComment extends StubNode {
  constructor(text = "") {
    super();
    this.data = String(text);
  }
  get nodeType() { return 8; }
  get textContent() { return ""; }
  cloneNode() { return new StubComment(this.data); }
  serialize() { return `<!--${this.data}-->`; }
}

function toNode(n) {
  return n instanceof StubNode ? n : new StubText(String(n));
}

export class StubElement extends StubNode {
  constructor(tagName, attrs = []) {
    super();
    this.localName = String(tagName).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this._attrs = new Map(attrs);
    this._listeners = new Map();
    this._value = undefined;     // live value (inputs) once assigned
    this._checked = undefined;   // live checked state once assigned
    this.style = {};
  }

  get nodeType() { return 1; }
  get nodeName() { return this.tagName; }
  get ownerDocument() { return null; }

  // ── attributes ──────────────────────────────────────────────────────────
  getAttribute(name) { return this._attrs.has(name) ? this._attrs.get(name) : null; }
  setAttribute(name, value) { this._attrs.set(String(name), String(value)); }
  removeAttribute(name) { this._attrs.delete(name); }
  hasAttribute(name) { return this._attrs.has(name); }
  toggleAttribute(name, force) {
    const on = force ?? !this.hasAttribute(name);
    if (on) this.setAttribute(name, ""); else this.removeAttribute(name);
    return on;
  }
  get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })); }

  get id() { return this.getAttribute("id") ?? ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.getAttribute("class") ?? ""; }
  set className(v) { this.setAttribute("class", v); }
  get name() { return this.getAttribute("name") ?? ""; }
  set name(v) { this.setAttribute("name", v); }
  get title() { return this.getAttribute("title") ?? ""; }
  set title(v) { this.setAttribute("title", v); }
  get type() { return this.getAttribute("type") ?? (this.localName === "button" ? "submit" : ""); }
  set type(v) { this.setAttribute("type", v); }

  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    const write = (names) => el.setAttribute("class", [...new Set(names)].join(" "));
    return {
      contains: (c) => list().includes(c),
      add: (...cs) => write([...list(), ...cs]),
      remove: (...cs) => write(list().filter(c => !cs.includes(c))),
      toggle: (c, force) => {
        const on = force ?? !list().includes(c);
        write(on ? [...list(), c] : list().filter(x => x !== c));
        return on;
      },
      get length() { return list().length; },
      [Symbol.iterator]: () => list()[Symbol.iterator](),
    };
  }

  get dataset() {
    const el = this;
    return new Proxy({}, {
      get: (_, key) => (typeof key === "string" ? (el.getAttribute(`data-${kebab(key)}`) ?? undefined) : undefined),
      set: (_, key, value) => { el.setAttribute(`data-${kebab(key)}`, value); return true; },
      deleteProperty: (_, key) => { el.removeAttribute(`data-${kebab(key)}`); return true; },
      has: (_, key) => el.hasAttribute(`data-${kebab(key)}`),
      ownKeys: () => [...el._attrs.keys()].filter(k => k.startsWith("data-")).map(k => camel(k.slice(5))),
      getOwnPropertyDescriptor: (_, key) => (el.hasAttribute(`data-${kebab(key)}`)
        ? { enumerable: true, configurable: true, writable: true, value: el.getAttribute(`data-${kebab(key)}`) }
        : undefined),
    });
  }

  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(v) { this.toggleAttribute("disabled", !!v); }
  get hidden() { return this.hasAttribute("hidden"); }
  set hidden(v) { this.toggleAttribute("hidden", !!v); }

  get checked() { return this._checked ?? this.hasAttribute("checked"); }
  set checked(v) { this._checked = !!v; }

  get value() {
    if (this._value !== undefined) return this._value;
    if (this.localName === "textarea") return this.textContent;
    if (this.localName === "select") {
      const options = this.querySelectorAll("option");
      const selected = options.find(o => o.hasAttribute("selected")) ?? options[0];
      return selected ? selected.value : "";
    }
    if (this.localName === "option") return this.getAttribute("value") ?? this.textContent;
    return this.getAttribute("value") ?? "";
  }
  set value(v) { this._value = String(v ?? ""); }

  // ── tree ────────────────────────────────────────────────────────────────
  get children() { return this.childNodes.filter(n => n instanceof StubElement); }
  get firstElementChild() { return this.children[0] ?? null; }
  get lastElementChild() { const c = this.children; return c[c.length - 1] ?? null; }
  get firstChild() { return this.childNodes[0] ?? null; }

  get textContent() { return super.textContent; }
  set textContent(v) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    if (v !== "" && v != null) this.appendChild(new StubText(String(v)));
  }
  get innerText() { return this.textContent; }
  set innerText(v) { this.textContent = v; }

  get innerHTML() { return this.childNodes.map(n => n.serialize()).join(""); }
  set innerHTML(html) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    for (const n of parseFragment(html)) this.appendChild(n);
  }
  get outerHTML() { return this.serialize(); }

  appendChild(node) {
    const n = toNode(node);
    n.remove();
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  prepend(...nodes) {
    const ns = nodes.map(toNode);
    for (const n of ns) { n.remove(); n.parentNode = this; }
    this.childNodes.unshift(...ns);
  }
  insertBefore(node, ref) {
    if (!ref) return this.appendChild(node);
    const n = toNode(node);
    n.remove();
    const i = this.childNodes.indexOf(ref);
    n.parentNode = this;
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n);
    return n;
  }
  removeChild(node) { node.remove(); return node; }
  before(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    for (const n of nodes) parent.insertBefore(toNode(n), this);
  }
  after(...nodes) {
    const parent = this.parentNode;
    if (!parent) return;
    const i = parent.childNodes.indexOf(this);
    const ref = parent.childNodes[i + 1] ?? null;
    for (const n of nodes) parent.insertBefore(toNode(n), ref);
  }
  insertAdjacentHTML(position, html) {
    const nodes = parseFragment(html);
    this.#insertAdjacent(position, nodes);
  }
  insertAdjacentElement(position, el) {
    this.#insertAdjacent(position, [el]);
    return el;
  }
  #insertAdjacent(position, nodes) {
    switch (String(position).toLowerCase()) {
      case "beforebegin": this.before(...nodes); break;
      case "afterbegin":  this.prepend(...nodes); break;
      case "beforeend":   this.append(...nodes); break;
      case "afterend":    this.after(...nodes.slice().reverse()); break;
      default: throw new Error(`cardDom: insertAdjacent position "${position}" is not supported`);
    }
  }

  cloneNode(deep = false) {
    const copy = new StubElement(this.localName, [...this._attrs]);
    copy._value = this._value;
    copy._checked = this._checked;
    copy.style = { ...this.style };
    if (deep) for (const n of this.childNodes) copy.appendChild(n.cloneNode(true));
    return copy;
  }

  // ── selectors ───────────────────────────────────────────────────────────
  /** Descendants in document order. */
  *descendants() {
    for (const n of this.childNodes) {
      if (n instanceof StubElement) {
        yield n;
        yield* n.descendants();
      }
    }
  }
  querySelectorAll(selector) {
    const sel = parseSelector(selector);
    const out = [];
    for (const el of this.descendants()) if (matchesList(el, sel, this)) out.push(el);
    return out;
  }
  querySelector(selector) {
    const sel = parseSelector(selector);
    for (const el of this.descendants()) if (matchesList(el, sel, this)) return el;
    return null;
  }
  getElementsByTagName(tag) { return this.querySelectorAll(tag); }
  matches(selector) { return matchesList(this, parseSelector(selector), null); }
  closest(selector) {
    const sel = parseSelector(selector);
    for (let el = this; el; el = el.parentElement) if (matchesList(el, sel, null)) return el;
    return null;
  }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  // ── events ──────────────────────────────────────────────────────────────
  addEventListener(type, fn, opts) {
    if (typeof fn !== "function" && typeof fn?.handleEvent !== "function") return;
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push({ fn, once: typeof opts === "object" && !!opts?.once });
  }
  removeEventListener(type, fn) {
    const list = this._listeners.get(type);
    if (!list) return;
    const i = list.findIndex(l => l.fn === fn);
    if (i >= 0) list.splice(i, 1);
  }
  dispatchEvent(event) {
    event.target ??= this;
    const path = [];
    for (let el = this; el; el = el.parentElement) path.push(el);
    for (const el of event.bubbles ? path : [this]) {
      const list = [...(el._listeners.get(event.type) ?? [])];
      event.currentTarget = el;
      for (const l of list) {
        if (l.once) el.removeEventListener(event.type, l.fn);
        const out = typeof l.fn === "function" ? l.fn.call(el, event) : l.fn.handleEvent(event);
        if (out && typeof out.then === "function") _onListenerResult?.(out);
        if (event._immediate) break;
      }
      if (event._stopped) break;
    }
    event.currentTarget = null;
    return !event.defaultPrevented;
  }
  click() {
    if (this.disabled) return;   // a disabled control swallows clicks, as in a browser
    this.dispatchEvent(new StubEvent("click"));
  }
  focus() {}
  blur() {}
  scrollIntoView() {}
  getBoundingClientRect() { return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }

  serialize() {
    const attrs = [...this._attrs].map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`)).join("");
    if (VOID_TAGS.has(this.localName)) return `<${this.localName}${attrs}>`;
    return `<${this.localName}${attrs}>${this.innerHTML}</${this.localName}>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing
// ─────────────────────────────────────────────────────────────────────────────

const ATTR_RE = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/**
 * Parse an HTML fragment into nodes. Tolerant of what card templates do:
 * unclosed void elements, a stray closing tag (closes up to its opener, or is
 * ignored), comments.
 *
 * @param {string} html
 * @returns {StubNode[]}
 */
export function parseFragment(html) {
  const root = new StubElement("#fragment");
  const stack = [root];
  const src = String(html ?? "");
  let i = 0;
  const top = () => stack[stack.length - 1];

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      top().appendChild(new StubText(decodeEntities(src.slice(i))));
      break;
    }
    if (lt > i) top().appendChild(new StubText(decodeEntities(src.slice(i, lt))));

    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      const stop = end < 0 ? src.length : end;
      top().appendChild(new StubComment(src.slice(lt + 4, stop)));
      i = end < 0 ? src.length : end + 3;
      continue;
    }
    if (src[lt + 1] === "!" || src[lt + 1] === "?") {
      const end = src.indexOf(">", lt);
      i = end < 0 ? src.length : end + 1;
      continue;
    }

    const close = /^<\/\s*([a-zA-Z][\w:-]*)\s*>/.exec(src.slice(lt));
    if (close) {
      const name = close[1].toLowerCase();
      const idx = stack.map(e => e.localName).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
      i = lt + close[0].length;
      continue;
    }

    const open = /^<([a-zA-Z][\w:-]*)/.exec(src.slice(lt));
    if (!open) {
      top().appendChild(new StubText("<"));
      i = lt + 1;
      continue;
    }
    // Find the end of the start tag, skipping quoted attribute values.
    let j = lt + open[0].length;
    let quote = null;
    while (j < src.length) {
      const c = src[j];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
      j++;
    }
    const inner = src.slice(lt + open[0].length, j);
    const selfClosing = /\/\s*$/.test(inner);
    const attrs = [];
    for (const m of inner.replace(/\/\s*$/, "").matchAll(ATTR_RE)) {
      attrs.push([m[1].toLowerCase(), decodeEntities(m[2] ?? m[3] ?? m[4] ?? "")]);
    }
    const name = open[1].toLowerCase();
    const el = new StubElement(name, attrs);
    top().appendChild(el);
    i = j + 1;

    if (VOID_TAGS.has(name) || selfClosing) continue;
    if (RAW_TEXT_TAGS.has(name)) {
      const end = src.toLowerCase().indexOf(`</${name}`, i);
      const stop = end < 0 ? src.length : end;
      if (stop > i) el.appendChild(new StubText(name === "textarea" || name === "title" ? decodeEntities(src.slice(i, stop)) : src.slice(i, stop)));
      const gt = end < 0 ? src.length : src.indexOf(">", end);
      i = gt < 0 ? src.length : gt + 1;
      continue;
    }
    stack.push(el);
  }

  const nodes = [...root.childNodes];
  for (const n of nodes) n.parentNode = null;
  return nodes;
}

/**
 * Parse HTML into a single container element (`tag`, default div) holding it.
 *
 * @param {string} html
 * @param {{ tag?: string, attrs?: Object }} [opts]
 * @returns {StubElement}
 */
export function parseHTML(html, { tag = "div", attrs = {} } = {}) {
  const el = new StubElement(tag, Object.entries(attrs).map(([k, v]) => [k, String(v)]));
  for (const n of parseFragment(html)) el.appendChild(n);
  return el;
}

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

const _selectorCache = new Map();

function splitTopLevel(s, sep) {
  const parts = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === sep && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
  }
  parts.push(s.slice(start));
  return parts;
}

/** "a b > c" → [{ compound: a }, { combinator: " ", compound: b }, …] */
function parseComplex(s) {
  const steps = [];
  let i = 0, depth = 0, quote = null, buf = "", combinator = null;
  const flush = () => {
    if (!buf.trim()) return;
    steps.push({ combinator, compound: parseCompound(buf.trim()) });
    buf = "";
    combinator = " ";
  };
  for (; i < s.length; i++) {
    const c = s[i];
    if (quote) { buf += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; buf += c; continue; }
    if (c === "[" || c === "(") depth++;
    if (c === "]" || c === ")") depth--;
    if (depth === 0 && (c === ">" || c === "+" || c === "~")) {
      flush();
      if (c !== ">") throw new Error(`cardDom: combinator "${c}" is not supported`);
      combinator = ">";
      continue;
    }
    if (depth === 0 && /\s/.test(c)) { flush(); continue; }
    buf += c;
  }
  flush();
  if (steps.length) steps[0].combinator = null;
  return steps;
}

const COMPOUND_SRC = /(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[\s*([\w-]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]|:([\w-]+)(?:\(([^)]*)\))?/.source;

function parseCompound(s) {
  const out = { tag: null, ids: [], classes: [], attrs: [], pseudos: [] };
  // A fresh sticky regex per call — :not(…) parses its argument recursively.
  const COMPOUND_RE = new RegExp(COMPOUND_SRC, "y");
  let consumed = 0;
  let m;
  while (consumed < s.length && (m = COMPOUND_RE.exec(s))) {
    consumed = COMPOUND_RE.lastIndex;
    if (m[1]) out.tag = m[1] === "*" ? null : m[1].toLowerCase();
    else if (m[2]) out.ids.push(m[2]);
    else if (m[3]) out.classes.push(m[3]);
    else if (m[4]) out.attrs.push({ name: m[4].toLowerCase(), op: m[5] ?? null, value: m[6] ?? m[7] ?? m[8] ?? null });
    else if (m[9]) {
      const name = m[9].toLowerCase();
      if (!["checked", "disabled", "not", "first-child", "last-child"].includes(name)) {
        throw new Error(`cardDom: pseudo-class ":${name}" is not supported`);
      }
      out.pseudos.push({ name, arg: name === "not" ? parseSelector(m[10] ?? "") : null });
    }
  }
  if (consumed !== s.length) throw new Error(`cardDom: cannot parse selector "${s}"`);
  return out;
}

export function parseSelector(selector) {
  const key = String(selector);
  if (_selectorCache.has(key)) return _selectorCache.get(key);
  const list = splitTopLevel(key, ",").map(s => s.trim()).filter(Boolean).map(parseComplex);
  if (!list.length) throw new Error(`cardDom: empty selector "${selector}"`);
  _selectorCache.set(key, list);
  return list;
}

function matchesCompound(el, c) {
  if (c.tag && el.localName !== c.tag) return false;
  for (const id of c.ids) if (el.id !== id) return false;
  for (const cls of c.classes) if (!el.classList.contains(cls)) return false;
  for (const a of c.attrs) {
    if (!el.hasAttribute(a.name)) return false;
    if (a.op == null) continue;
    const v = el.getAttribute(a.name);
    switch (a.op) {
      case "=":  if (v !== a.value) return false; break;
      case "^=": if (!v.startsWith(a.value)) return false; break;
      case "$=": if (!v.endsWith(a.value)) return false; break;
      case "*=": if (!v.includes(a.value)) return false; break;
      case "~=": if (!v.split(/\s+/).includes(a.value)) return false; break;
      case "|=": if (v !== a.value && !v.startsWith(`${a.value}-`)) return false; break;
      default: return false;
    }
  }
  for (const p of c.pseudos) {
    if (p.name === "checked" && !el.checked) return false;
    if (p.name === "disabled" && !el.disabled) return false;
    if (p.name === "not" && matchesList(el, p.arg, null)) return false;
    if (p.name === "first-child" && el.parentElement?.firstElementChild !== el) return false;
    if (p.name === "last-child" && el.parentElement?.lastElementChild !== el) return false;
  }
  return true;
}

function matchesComplex(el, steps, scope, idx = steps.length - 1) {
  if (!matchesCompound(el, steps[idx].compound)) return false;
  if (idx === 0) return true;
  const comb = steps[idx].combinator;
  if (comb === ">") {
    const parent = el.parentElement;
    return !!parent && matchesComplex(parent, steps, scope, idx - 1);
  }
  for (let anc = el.parentElement; anc; anc = anc.parentElement) {
    if (matchesComplex(anc, steps, scope, idx - 1)) return true;
  }
  return false;
}

function matchesList(el, list, scope) {
  return list.some(steps => matchesComplex(el, steps, scope));
}
