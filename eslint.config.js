import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // ── Node / browser built-ins ──────────────────────────────────────
        console:         "readonly",
        fetch:           "readonly",
        URL:             "readonly",
        URLSearchParams: "readonly",
        setTimeout:      "readonly",
        clearTimeout:    "readonly",
        setInterval:     "readonly",
        clearInterval:   "readonly",
        Promise:         "readonly",
        Event:           "readonly",
        KeyboardEvent:   "readonly",
        document:        "readonly",
        window:          "readonly",
        global:          "readonly",

        // ── Foundry VTT globals — available at runtime, not imported ─────
        game:         "readonly",
        ui:           "readonly",
        Hooks:        "readonly",
        CONFIG:       "readonly",
        CONST:        "readonly",
        foundry:      "readonly",
        ChatMessage:  "readonly",
        JournalEntry: "readonly",
        Scene:        "readonly",
        FilePicker:   "readonly",
        Dialog:       "readonly",
        $:            "readonly",

        // ── Browser globals used in Foundry renderer context ─────────────
        atob: "readonly",
        Blob: "readonly",
        File: "readonly",

        // ── The Forge globals ────────────────────────────────────────────
        ForgeVTT:  "readonly",
        ForgeAPI:  "readonly",

        // ── Quench integration testing ───────────────────────────────────
        quench:    "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console":     "off",

      // Silent failures from empty catch blocks have repeatedly hidden bugs
      // during unit and integration testing. Every catch must either rethrow,
      // log via console.warn/error, or otherwise produce a discriminable
      // result — never an empty body, never a comment-only body. See the
      // silent-failure audit on branch claude/audit-silent-failures-LABiI.
      "no-empty":              ["error", { allowEmptyCatch: false }],
      "no-restricted-syntax":  ["error", {
        selector: "CatchClause[body.body.length=0]",
        message:  "Empty catch blocks are banned — log the error via console.warn/console.error or rethrow.",
      }],
    },
  },
  {
    // Test files — Vitest globals
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        describe:   "readonly",
        it:         "readonly",
        expect:     "readonly",
        vi:         "readonly",
        beforeEach: "readonly",
        afterEach:  "readonly",
        beforeAll:  "readonly",
        afterAll:   "readonly",
      },
    },
  },
];
