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
        CONST:        "readonly",
        foundry:      "readonly",
        ChatMessage:  "readonly",
        JournalEntry: "readonly",
        Dialog:       "readonly",
        $:            "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console":     "off",
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
