import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Foundry VTT globals — available at runtime, not imported
        game:        "readonly",
        ui:          "readonly",
        Hooks:       "readonly",
        CONST:       "readonly",
        foundry:     "readonly",
        ChatMessage: "readonly",
        JournalEntry: "readonly",
        Dialog:      "readonly",
        $:           "readonly",
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
