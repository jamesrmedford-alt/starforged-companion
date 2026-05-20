#!/usr/bin/env node
// Generates a static GitHub Pages site from the in-game help PAGES array.
// Single source of truth: src/help/helpJournal.js — same content the Foundry
// journal renders.

import { mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PAGES, CONTENT_VERSION, JOURNAL_NAME } from "../src/help/helpJournal.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, "..");
const OUT_DIR   = join(ROOT, "site");

const COMMIT_SHA = (process.env.GITHUB_SHA || "").slice(0, 7);
const BUILT_AT   = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const REPO_URL   = process.env.GITHUB_REPOSITORY
  ? `https://github.com/${process.env.GITHUB_REPOSITORY}`
  : "https://github.com/jamesrmedford-alt/starforged-companion";

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const STYLES = `
:root {
  color-scheme: light dark;
  --bg: #0f1419;
  --panel: #161c24;
  --text: #d8e2ec;
  --muted: #8b9aab;
  --accent: #f0a868;
  --border: #232a35;
  --code-bg: #0a0d12;
}
@media (prefers-color-scheme: light) {
  :root {
    --bg: #fafaf7;
    --panel: #ffffff;
    --text: #2a2a2a;
    --muted: #6a6a6a;
    --accent: #c0691a;
    --border: #e3e3dd;
    --code-bg: #f1efe9;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 16px;
  line-height: 1.6;
}
.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  min-height: 100vh;
}
aside {
  background: var(--panel);
  border-right: 1px solid var(--border);
  padding: 1.5rem 1rem;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}
aside h1 {
  font-size: 1.1rem;
  margin: 0 0 0.25rem;
  color: var(--accent);
}
aside .version { font-size: 0.8rem; color: var(--muted); margin-bottom: 1.5rem; }
aside nav ul { list-style: none; padding: 0; margin: 0; }
aside nav li { margin: 0; }
aside nav a {
  display: block;
  padding: 0.5rem 0.75rem;
  color: var(--text);
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.95rem;
}
aside nav a:hover { background: var(--border); }
aside nav a.active { background: var(--border); color: var(--accent); font-weight: 600; }
main {
  padding: 2rem 3rem;
  max-width: 900px;
}
main h2 { color: var(--accent); margin-top: 2rem; }
main h2:first-child { margin-top: 0; }
main h3 { margin-top: 1.5rem; }
main code {
  background: var(--code-bg);
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
main pre {
  background: var(--code-bg);
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
}
main pre code { background: none; padding: 0; }
main blockquote {
  border-left: 3px solid var(--accent);
  margin: 1rem 0;
  padding: 0.5rem 1rem;
  color: var(--muted);
  background: var(--panel);
}
main table {
  border-collapse: collapse;
  margin: 1rem 0;
  width: 100%;
}
main th, main td {
  border: 1px solid var(--border);
  padding: 0.5rem 0.75rem;
  text-align: left;
}
main th { background: var(--panel); }
main a { color: var(--accent); }
footer {
  border-top: 1px solid var(--border);
  margin-top: 3rem;
  padding-top: 1rem;
  color: var(--muted);
  font-size: 0.85rem;
}
footer a { color: var(--muted); }
@media (max-width: 768px) {
  .layout { grid-template-columns: 1fr; }
  aside { position: static; height: auto; }
  main { padding: 1.5rem; }
}
`;

function renderShell({ title, activeSlug, contentHtml, sortedPages }) {
  const nav = sortedPages
    .map((p) => {
      const cls = p.slug === activeSlug ? "active" : "";
      return `<li><a class="${cls}" href="./${p.slug}.html">${escapeHtml(p.name)}</a></li>`;
    })
    .join("\n        ");

  const commitLink = COMMIT_SHA
    ? `<a href="${REPO_URL}/commit/${COMMIT_SHA}">${COMMIT_SHA}</a>`
    : "local build";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — Starforged Companion</title>
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<div class="layout">
  <aside>
    <h1>Starforged Companion</h1>
    <div class="version">Help & Reference v${escapeHtml(CONTENT_VERSION)}</div>
    <nav>
      <ul>
        ${nav}
      </ul>
    </nav>
  </aside>
  <main>
    ${contentHtml}
    <footer>
      <p>${escapeHtml(JOURNAL_NAME)} — content version ${escapeHtml(CONTENT_VERSION)}.<br>
      Built ${escapeHtml(BUILT_AT)} from ${commitLink}.
      Source: <a href="${REPO_URL}">${escapeHtml(REPO_URL.replace(/^https:\/\//, ""))}</a></p>
    </footer>
  </main>
</div>
</body>
</html>
`;
}

async function build() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const sortedPages = [...PAGES]
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({ ...p, slug: slugify(p.name) }));

  await writeFile(join(OUT_DIR, "styles.css"), STYLES.trimStart(), "utf8");

  for (const page of sortedPages) {
    const html = renderShell({
      title: page.name,
      activeSlug: page.slug,
      contentHtml: page.text.content,
      sortedPages,
    });
    await writeFile(join(OUT_DIR, `${page.slug}.html`), html, "utf8");
  }

  // index.html mirrors the first page (Quick Start)
  const first = sortedPages[0];
  const indexHtml = renderShell({
    title: first.name,
    activeSlug: first.slug,
    contentHtml: first.text.content,
    sortedPages,
  });
  await writeFile(join(OUT_DIR, "index.html"), indexHtml, "utf8");

  // .nojekyll so GitHub Pages serves files starting with _ verbatim and
  // skips Jekyll processing entirely.
  await writeFile(join(OUT_DIR, ".nojekyll"), "", "utf8");

  console.log(`Built ${sortedPages.length} pages to ${OUT_DIR}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
